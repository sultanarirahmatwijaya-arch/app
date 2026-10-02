import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from datetime import datetime, timezone
from io import BytesIO, StringIO

from bson import ObjectId
from cryptography.fernet import Fernet
from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseUpload
from pydantic import BaseModel

import models

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations/google")
SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def _configured() -> bool:
    return bool(os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"))


def _fernet() -> Fernet:
    return Fernet(os.environ["TOKEN_ENCRYPTION_KEY"])


def _callback_uri() -> str:
    uri = os.environ.get("GOOGLE_CALLBACK_URI", "").strip()
    if uri:
        return uri
    base = os.environ.get("BACKEND_PUBLIC_URL", "").strip().rstrip("/")
    return f"{base}/api/integrations/google/callback"


def _client_config() -> dict:
    return {
        "web": {
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [_callback_uri()],
        }
    }


def _signed_state(user_id: str, return_to: str) -> str:
    payload = {
        "u": user_id,
        "r": return_to,
        "n": secrets.token_urlsafe(16),
        "e": int(time.time()) + 600,
    }
    raw = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode()
    ).decode()
    secret = os.environ.get("OAUTH_STATE_SECRET", "")
    sig = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def _verify_state(value: str) -> dict:
    raw, sig = value.rsplit(".", 1)
    secret = os.environ.get("OAUTH_STATE_SECRET", "")
    expected = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(400, "Invalid OAuth state")
    payload = json.loads(base64.urlsafe_b64decode(raw))
    if payload.get("e", 0) < time.time():
        raise HTTPException(400, "Expired OAuth state")
    return payload


def _flow() -> Flow:
    f = Flow.from_client_config(_client_config(), scopes=SCOPES)
    f.redirect_uri = _callback_uri()
    return f


@router.get("/start")
async def google_start(token: str, platform: str = "web"):
    if not _configured():
        raise HTTPException(
            503,
            "Integrasi Google Drive belum dikonfigurasi (butuh GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET).",
        )
    try:
        user = await models.resolve_user(token)
    except HTTPException:
        raise
    return_to = platform if platform in {"web", "mobile"} else "web"
    f = _flow()
    url, _ = f.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=_signed_state(str(user["_id"]), return_to),
    )
    return RedirectResponse(url)


@router.get("/callback")
async def google_callback(code: str = "", state: str = ""):
    payload = _verify_state(state)
    f = _flow()
    try:
        f.fetch_token(code=code)
    except Exception:
        raise HTTPException(400, "Google authorization failed")

    creds = f.credentials
    old = await models.google_tokens_col.find_one({"user_id": payload["u"]})
    refresh_token = creds.refresh_token or (old or {}).get("refresh_token_enc", "")
    refresh_token = _fernet().decrypt(refresh_token.encode()).decode() if (
        creds.refresh_token is None and old
    ) else refresh_token
    if not refresh_token:
        raise HTTPException(
            400, "No refresh token; revoke the app in Google and reconnect"
        )

    await models.google_tokens_col.update_one(
        {"user_id": payload["u"]},
        {
            "$set": {
                "user_id": payload["u"],
                "refresh_token_enc": _fernet().encrypt(refresh_token.encode()).decode(),
                "scopes": SCOPES,
                "updated_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )
    if payload["r"] == "mobile":
        target = os.environ.get("MOBILE_REDIRECT_URI", "frontend://oauth/google")
    else:
        base = os.environ.get("FRONTEND_WEB_URL", "").rstrip("/")
        target = f"{base}/?google=connected"
    return RedirectResponse(target)


@router.get("/status")
async def google_status(user: dict = Depends(models.current_user)):
    doc = await models.google_tokens_col.find_one({"user_id": str(user["_id"])})
    return {"connected": bool(doc)}


def _drive_service(refresh_token: str):
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        scopes=SCOPES,
    )
    creds.refresh(GoogleRequest())
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _upload_report(refresh_token: str, folder_id: str, filename: str, content: bytes, mime_type: str) -> dict:
    service = _drive_service(refresh_token)
    metadata = {"name": filename}
    if folder_id:
        metadata["parents"] = [folder_id]
    media = MediaIoBaseUpload(
        BytesIO(content), mimetype=mime_type, resumable=len(content) > 5 * 1024 * 1024
    )
    try:
        result = service.files().create(
            body=metadata, media_body=media, fields="id,name,mimeType,webViewLink,createdTime"
        ).execute()
    except HttpError as exc:
        if exc.resp.status == 401:
            raise HTTPException(401, "Google authorization expired; reconnect Drive")
        if exc.resp.status in (403, 404) and folder_id:
            # Folder not accessible with drive.file scope — fall back to My Drive root.
            metadata.pop("parents", None)
            try:
                result = service.files().create(
                    body=metadata, media_body=media, fields="id,name,mimeType,webViewLink,createdTime"
                ).execute()
            except HttpError:
                raise HTTPException(502, "Google Drive upload failed")
        else:
            raise HTTPException(502, "Google Drive upload failed")
    return result


class ExportIn(BaseModel):
    month: str = ""
    format: str = "csv"


@router.post("/export")
async def google_export(body: ExportIn = Body(default=ExportIn()), user: dict = Depends(models.current_user)):
    if not _configured():
        raise HTTPException(
            503,
            "Integrasi Google Drive belum dikonfigurasi (butuh GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET).",
        )
    token_doc = await models.google_tokens_col.find_one({"user_id": str(user["_id"])})
    if not token_doc:
        raise HTTPException(409, "Hubungkan Google Drive terlebih dahulu")
    book_id = await models.require_book(user)

    import re as _re

    if body.month and not _re.match(r"^\d{4}-\d{2}$", body.month):
        raise HTTPException(422, "Format bulan harus YYYY-MM")

    refresh = _fernet().decrypt(token_doc["refresh_token_enc"].encode()).decode()
    folder_id = (os.environ.get("GOOGLE_FOLDER_ID", "") or "").strip()

    if body.format == "pdf":
        from reports import render_recap_pdf

        content, filename = await render_recap_pdf(user, body.month or None)
        result = await run_in_threadpool(
            _upload_report, refresh, folder_id, filename, content, "application/pdf"
        )
        return {"file": result}

    query = {"book_id": book_id, "deleted_at": None}
    if body.month:
        query["date"] = {"$regex": f"^{_re.escape(body.month)}"}

    txs = []
    async for t in models.transactions_col.find(query).sort([("date", 1), ("created_at", 1)]):
        txs.append(t)

    buf = StringIO()
    buf.write("Tanggal;Jenis;Kategori;Keterangan;Sumber;Dicatat oleh;Jumlah (Rp)\n")
    for t in txs:
        label = "Masuk" if t.get("type") == "in" else "Keluar"
        source = t.get("account_name") if t.get("source_type") == "account" else "Tunai"
        row = [
            t.get("date", ""),
            label,
            t.get("category", ""),
            (t.get("note", "") or "").replace(";", ","),
            source or "",
            t.get("created_by_name", ""),
            str(t.get("amount", 0)),
        ]
        buf.write(";".join(row) + "\n")

    filename = f"MenAbng-Rekap-{body.month or 'semua'}.csv"
    content = buf.getvalue().encode("utf-8-sig")
    result = await run_in_threadpool(
        _upload_report, refresh, folder_id, filename, content, "text/csv"
    )
    return {"file": result}

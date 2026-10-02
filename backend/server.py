import io
import logging
import re
import uuid as uuidlib
from typing import List, Literal, Optional

import bcrypt
from bson import ObjectId, errors as bson_errors
from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError

import models
import storage
from models import (
    tx_out,
    account_out,
    plan_out,
    user_out,
    book_out,
    today_wib,
    now_utc,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="MenAbng API")

api_router = APIRouter(prefix="/api")

DUMMY_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt())

USERNAME_PATTERN = r"^[A-Za-z0-9_.-]+$"


# ---------------------------------------------------------------------------
# Schemas (input)
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=USERNAME_PATTERN)
    password: str = Field(min_length=6, max_length=128)
    display_name: str = Field(default="", max_length=40)


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class DisplayNameIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)


class BookNameIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class TxIn(BaseModel):
    type: Literal["in", "out"]
    amount: int = Field(gt=0, le=999_999_999_999)
    category: str = Field(min_length=1, max_length=40)
    note: str = Field(default="", max_length=200)
    source_type: Literal["cash", "account"] = "cash"
    account_id: Optional[str] = None
    date: Optional[str] = None


class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    kind: Literal["bank", "cash", "ewallet"]
    bank_name: str = Field(default="", max_length=40)
    account_number: str = Field(default="", max_length=30)
    initial_balance: int = Field(default=0, ge=0)


class PlanIn(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    title: str = Field(min_length=1, max_length=60)


class ItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    qty: int = Field(default=1, ge=1, le=999)
    est_price: int = Field(default=0, ge=0)


class ItemUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    qty: Optional[int] = Field(default=None, ge=1, le=999)
    est_price: Optional[int] = Field(default=None, ge=0)
    actual_price: Optional[int] = Field(default=None, ge=0)
    done: Optional[bool] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def valid_date(date: Optional[str]) -> str:
    if date and re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        return date
    return today_wib()


async def get_book_if_owned(user: dict, doc_id: str, collection):
    try:
        oid = ObjectId(doc_id)
    except (bson_errors.InvalidId, TypeError):
        raise HTTPException(404, "Data tidak ditemukan")
    doc = await collection.find_one({"_id": oid, "book_id": user["book_id"]})
    if not doc:
        raise HTTPException(404, "Data tidak ditemukan")
    return doc


async def compute_account_balances(book_id: str) -> dict:
    balances = {}
    async for t in models.transactions_col.find({"book_id": book_id, "deleted_at": None}):
        aid = t.get("account_id")
        if not aid:
            continue
        delta = t["amount"] if t.get("type") == "in" else -t["amount"]
        balances[aid] = balances.get(aid, 0) + delta
    return balances


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"status": "ok", "app": "MenAbng"}


async def _auth_response(user_doc: dict, token: str) -> models.AuthOut:
    book = None
    if user_doc.get("book_id"):
        book_doc = await models.books_col.find_one({"_id": ObjectId(user_doc["book_id"])})
        if book_doc:
            book = await book_out(book_doc)
    return models.AuthOut(
        token=token,
        user=user_out(user_doc),
        book=book or models.BookOut(id="", name="", invite_code="", members=[]),
    )


@api_router.post("/auth/register", response_model=models.AuthOut, status_code=201)
async def register(body: RegisterIn):
    username = body.username.lower()
    display_name = body.display_name.strip() or body.username
    doc = {
        "username": username,
        "password_hash": bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode(),
        "display_name": display_name,
        "avatar_path": None,
        "book_id": None,
        "created_at": now_utc(),
    }
    try:
        result = await models.users_col.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "Username sudah dipakai, coba yang lain")
    doc["_id"] = result.inserted_id
    user_id = str(result.inserted_id)

    book_doc = {
        "name": "Tabungan Bersama",
        "invite_code": models.gen_invite_code(6),
        "member_ids": [user_id],
        "created_by": user_id,
        "created_at": now_utc(),
    }
    for _ in range(5):
        try:
            book_result = await models.books_col.insert_one(book_doc)
            break
        except DuplicateKeyError:
            book_doc["invite_code"] = models.gen_invite_code(6)
    else:
        raise HTTPException(500, "Gagal membuat buku tabungan")
    book_doc["_id"] = book_result.inserted_id
    await models.users_col.update_one(
        {"_id": result.inserted_id}, {"$set": {"book_id": str(book_result.inserted_id)}}
    )
    doc["book_id"] = str(book_result.inserted_id)
    token = models.make_token(user_id)
    return await _auth_response(doc, token)


@api_router.post("/auth/login", response_model=models.AuthOut)
async def login(body: LoginIn):
    username = body.username.strip().lower()
    user = await models.users_col.find_one({"username": username})
    hashed = user["password_hash"] if user else DUMMY_HASH
    try:
        ok = bcrypt.checkpw(body.password.encode(), hashed.encode())
    except ValueError:
        ok = False
    if not user or not ok:
        raise HTTPException(401, "Username atau kata sandi salah")
    token = models.make_token(str(user["_id"]))
    return await _auth_response(user, token)


@api_router.get("/auth/me", response_model=models.MeOut)
async def me(user: dict = Depends(models.current_user)):
    book = None
    if user.get("book_id"):
        book_doc = await models.books_col.find_one({"_id": ObjectId(user["book_id"])})
        if book_doc:
            book = await book_out(book_doc)
    return models.MeOut(
        user=user_out(user),
        book=book or models.BookOut(id="", name="", invite_code="", members=[]),
    )


# ---------------------------------------------------------------------------
# Users / profile
# ---------------------------------------------------------------------------
@api_router.put("/users/me", response_model=models.UserOut)
async def update_me(body: DisplayNameIn, user: dict = Depends(models.current_user)):
    await models.users_col.update_one(
        {"_id": user["_id"]}, {"$set": {"display_name": body.display_name.strip()}}
    )
    user["display_name"] = body.display_name.strip()
    return user_out(user)


IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
}


@api_router.post("/users/me/avatar", response_model=models.UserOut)
async def upload_avatar(file: UploadFile = File(...), user: dict = Depends(models.current_user)):
    content = await file.read()
    if len(content) > 4_000_000:
        raise HTTPException(413, "Ukuran foto maksimal 4 MB")
    ctype = (file.content_type or "").split(";")[0].strip()
    ext = IMAGE_TYPES.get(ctype)
    if not ext:
        raise HTTPException(415, "Format foto harus JPG, PNG, atau WebP")
    path = f"menabng/avatars/{user['_id']}/{uuidlib.uuid4()}.{ext}"
    try:
        await run_in_threadpool(storage.put_object, path, content, ctype)
    except Exception as e:
        logger.warning(f"object storage upload failed: {e}")
        raise HTTPException(502, "Gagal mengunggah foto, coba lagi")
    await models.users_col.update_one(
        {"_id": user["_id"]}, {"$set": {"avatar_path": path}}
    )
    user["avatar_path"] = path
    return user_out(user)


# ---------------------------------------------------------------------------
# Books (shared savings)
# ---------------------------------------------------------------------------
@api_router.get("/books/me", response_model=models.BookOut)
async def get_book(user: dict = Depends(models.current_user)):
    await models.require_book(user)
    book_doc = await models.books_col.find_one({"_id": ObjectId(user["book_id"])})
    if not book_doc:
        raise HTTPException(404, "Buku tabungan tidak ditemukan")
    return await book_out(book_doc)


@api_router.put("/books/me", response_model=models.BookOut)
async def rename_book(body: BookNameIn, user: dict = Depends(models.current_user)):
    await models.require_book(user)
    await models.books_col.update_one(
        {"_id": ObjectId(user["book_id"])}, {"$set": {"name": body.name.strip()}}
    )
    book_doc = await models.books_col.find_one({"_id": ObjectId(user["book_id"])})
    return await book_out(book_doc)


@api_router.post("/books/join", response_model=models.BookOut)
async def join_book(body: JoinIn, user: dict = Depends(models.current_user)):
    code = body.code.strip().upper()
    book_doc = await models.books_col.find_one({"invite_code": code})
    if not book_doc:
        raise HTTPException(404, "Kode undangan tidak ditemukan")
    book_id = str(book_doc["_id"])
    if user.get("book_id") != book_id:
        await models.users_col.update_one(
            {"_id": user["_id"]}, {"$set": {"book_id": book_id}}
        )
        await models.books_col.update_one(
            {"_id": book_doc["_id"]},
            {"$addToSet": {"member_ids": str(user["_id"])}},
        )
    user["book_id"] = book_id
    book_doc = await models.books_col.find_one({"_id": book_doc["_id"]})
    return await book_out(book_doc)


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
@api_router.post("/transactions", response_model=models.TransactionOut)
async def create_transaction(body: TxIn, user: dict = Depends(models.current_user)):
    book_id = await models.require_book(user)
    account_id = None
    account_name = None
    if body.source_type == "account":
        if not body.account_id:
            raise HTTPException(422, "Pilih rekening sumber uang")
        acc = await get_book_if_owned(user, body.account_id, models.accounts_col)
        account_id = str(acc["_id"])
        account_name = acc.get("name", "")
    doc = {
        "book_id": book_id,
        "type": body.type,
        "amount": body.amount,
        "category": body.category,
        "note": body.note.strip(),
        "source_type": body.source_type,
        "account_id": account_id,
        "account_name": account_name,
        "date": valid_date(body.date),
        "created_by": str(user["_id"]),
        "created_by_name": user.get("display_name", ""),
        "created_at": now_utc(),
        "deleted_at": None,
    }
    result = await models.transactions_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return tx_out(doc)


@api_router.get("/transactions", response_model=List[models.TransactionOut])
async def list_transactions(
    type: Optional[Literal["in", "out"]] = None,
    month: Optional[str] = None,
    q: Optional[str] = None,
    account_id: Optional[str] = None,
    limit: int = 120,
    user: dict = Depends(models.current_user),
):
    book_id = await models.require_book(user)
    query = {"book_id": book_id, "deleted_at": None}
    if type:
        query["type"] = type
    if month and re.match(r"^\d{4}-\d{2}$", month):
        query["date"] = {"$regex": f"^{re.escape(month)}"}
    if account_id:
        query["account_id"] = account_id
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"note": rx}, {"category": rx}]
    limit = max(1, min(limit, 500))
    out = []
    async for t in models.transactions_col.find(query).sort(
        [("date", -1), ("created_at", -1)]
    ).limit(limit):
        out.append(tx_out(t))
    return out


@api_router.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str, user: dict = Depends(models.current_user)):
    await models.require_book(user)
    doc = await get_book_if_owned(user, tx_id, models.transactions_col)
    await models.transactions_col.update_one(
        {"_id": doc["_id"]}, {"$set": {"deleted_at": now_utc()}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Accounts (manual bank / cash)
# ---------------------------------------------------------------------------
@api_router.get("/accounts", response_model=List[models.AccountOut])
async def list_accounts(user: dict = Depends(models.current_user)):
    book_id = await models.require_book(user)
    balances = await compute_account_balances(book_id)
    out = []
    async for a in models.accounts_col.find(
        {"book_id": book_id, "deleted_at": None}
    ).sort("created_at", ASCENDING):
        aid = str(a["_id"])
        balance = a.get("initial_balance", 0) + balances.get(aid, 0)
        out.append(account_out(a, balance))
    return out


@api_router.post("/accounts", response_model=models.AccountOut)
async def create_account(body: AccountIn, user: dict = Depends(models.current_user)):
    book_id = await models.require_book(user)
    doc = {
        "book_id": book_id,
        "name": body.name.strip(),
        "kind": body.kind,
        "bank_name": body.bank_name.strip(),
        "account_number": body.account_number.strip(),
        "initial_balance": body.initial_balance,
        "created_at": now_utc(),
        "deleted_at": None,
    }
    result = await models.accounts_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return account_out(doc, body.initial_balance)


@api_router.put("/accounts/{account_id}", response_model=models.AccountOut)
async def update_account(
    account_id: str, body: AccountIn, user: dict = Depends(models.current_user)
):
    await models.require_book(user)
    doc = await get_book_if_owned(user, account_id, models.accounts_col)
    await models.accounts_col.update_one(
        {"_id": doc["_id"]},
        {
            "$set": {
                "name": body.name.strip(),
                "kind": body.kind,
                "bank_name": body.bank_name.strip(),
                "account_number": body.account_number.strip(),
                "initial_balance": body.initial_balance,
            }
        },
    )
    doc.update(
        {
            "name": body.name.strip(),
            "kind": body.kind,
            "bank_name": body.bank_name.strip(),
            "account_number": body.account_number.strip(),
            "initial_balance": body.initial_balance,
        }
    )
    balances = await compute_account_balances(user["book_id"])
    balance = body.initial_balance + balances.get(str(doc["_id"]), 0)
    return account_out(doc, balance)


@api_router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, user: dict = Depends(models.current_user)):
    await models.require_book(user)
    doc = await get_book_if_owned(user, account_id, models.accounts_col)
    await models.accounts_col.update_one(
        {"_id": doc["_id"]}, {"$set": {"deleted_at": now_utc()}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
@api_router.get("/summary", response_model=models.SummaryOut)
async def summary(user: dict = Depends(models.current_user)):
    book_id = await models.require_book(user)
    today = today_wib()
    month_prefix = today[:7]

    balance = 0
    today_in = 0
    today_out = 0
    month_in = 0
    month_out = 0
    async for t in models.transactions_col.find(
        {"book_id": book_id, "deleted_at": None}
    ):
        amount = t.get("amount", 0)
        if t.get("type") == "in":
            balance += amount
            if t.get("date") == today:
                today_in += amount
            if (t.get("date") or "").startswith(month_prefix):
                month_in += amount
        else:
            balance -= amount
            if t.get("date") == today:
                today_out += amount
            if (t.get("date") or "").startswith(month_prefix):
                month_out += amount

    balances = await compute_account_balances(book_id)
    accounts = []
    async for a in models.accounts_col.find(
        {"book_id": book_id, "deleted_at": None}
    ).sort("created_at", ASCENDING):
        aid = str(a["_id"])
        accounts.append(
            account_out(a, a.get("initial_balance", 0) + balances.get(aid, 0))
        )

    return models.SummaryOut(
        balance=balance,
        today_in=today_in,
        today_out=today_out,
        month_in=month_in,
        month_out=month_out,
        accounts=accounts,
    )


# ---------------------------------------------------------------------------
# Monthly shopping planner
# ---------------------------------------------------------------------------
@api_router.get("/shopping", response_model=List[models.ShoppingPlanOut])
async def list_plans(
    month: str, user: dict = Depends(models.current_user)
):
    book_id = await models.require_book(user)
    if not re.match(r"^\d{4}-\d{2}$", month):
        raise HTTPException(422, "Format bulan harus YYYY-MM")
    out = []
    async for p in models.shopping_col.find(
        {"book_id": book_id, "month": month, "deleted_at": None}
    ).sort("created_at", ASCENDING):
        out.append(plan_out(p))
    return out


@api_router.post("/shopping", response_model=models.ShoppingPlanOut)
async def create_plan(body: PlanIn, user: dict = Depends(models.current_user)):
    book_id = await models.require_book(user)
    doc = {
        "book_id": book_id,
        "month": body.month,
        "title": body.title.strip(),
        "items": [],
        "created_by": str(user["_id"]),
        "created_by_name": user.get("display_name", ""),
        "created_at": now_utc(),
        "deleted_at": None,
    }
    result = await models.shopping_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return plan_out(doc)


@api_router.post("/shopping/{plan_id}/items", response_model=models.ShoppingPlanOut)
async def add_item(
    plan_id: str, body: ItemIn, user: dict = Depends(models.current_user)
):
    await models.require_book(user)
    plan = await get_book_if_owned(user, plan_id, models.shopping_col)
    item = {
        "id": uuidlib.uuid4().hex[:10],
        "name": body.name.strip(),
        "qty": body.qty,
        "est_price": body.est_price,
        "actual_price": 0,
        "done": False,
        "deleted": False,
    }
    await models.shopping_col.update_one(
        {"_id": plan["_id"]}, {"$push": {"items": item}}
    )
    plan["items"].append(item)
    return plan_out(plan)


@api_router.put("/shopping/{plan_id}/items/{item_id}", response_model=models.ShoppingPlanOut)
async def update_item(
    plan_id: str, item_id: str, body: ItemUpdateIn, user: dict = Depends(models.current_user)
):
    await models.require_book(user)
    plan = await get_book_if_owned(user, plan_id, models.shopping_col)
    items = plan.get("items") or []
    target = next((i for i in items if i.get("id") == item_id and not i.get("deleted")), None)
    if not target:
        raise HTTPException(404, "Barang tidak ditemukan")
    updates = {}
    if body.name is not None:
        updates["items.$.name"] = body.name.strip()
    if body.qty is not None:
        updates["items.$.qty"] = body.qty
    if body.est_price is not None:
        updates["items.$.est_price"] = body.est_price
    if body.actual_price is not None:
        updates["items.$.actual_price"] = body.actual_price
    if body.done is not None:
        updates["items.$.done"] = body.done
        if body.done and not target.get("actual_price"):
            updates["items.$.actual_price"] = target.get("est_price", 0)
    if updates:
        await models.shopping_col.update_one(
            {"_id": plan["_id"], "items.id": item_id}, {"$set": updates}
        )
    plan = await models.shopping_col.find_one({"_id": plan["_id"]})
    return plan_out(plan)


@api_router.delete("/shopping/{plan_id}/items/{item_id}", response_model=models.ShoppingPlanOut)
async def delete_item(
    plan_id: str, item_id: str, user: dict = Depends(models.current_user)
):
    await models.require_book(user)
    plan = await get_book_if_owned(user, plan_id, models.shopping_col)
    await models.shopping_col.update_one(
        {"_id": plan["_id"], "items.id": item_id},
        {"$set": {"items.$.deleted": True}},
    )
    plan = await models.shopping_col.find_one({"_id": plan["_id"]})
    return plan_out(plan)


@api_router.delete("/shopping/{plan_id}")
async def delete_plan(plan_id: str, user: dict = Depends(models.current_user)):
    await models.require_book(user)
    plan = await get_book_if_owned(user, plan_id, models.shopping_col)
    await models.shopping_col.update_one(
        {"_id": plan["_id"]}, {"$set": {"deleted_at": now_utc()}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Files (avatars) — served through the backend, never exposed publicly
# ---------------------------------------------------------------------------
@api_router.get("/files/{path:path}")
async def read_file(path: str, token: Optional[str] = None, creds=Depends(models.bearer)):
    tok = token or (creds.credentials if creds else None)
    if not tok:
        raise HTTPException(401, "Masuk terlebih dahulu")
    user = await models.resolve_user(tok)
    parts = path.split("/")
    if len(parts) != 4 or parts[0] != "menabng" or parts[1] != "avatars":
        raise HTTPException(403, "Akses ditolak")
    try:
        owner_oid = ObjectId(parts[2])
    except (bson_errors.InvalidId, TypeError, IndexError):
        raise HTTPException(403, "Akses ditolak")
    owner = await models.users_col.find_one({"_id": owner_oid})
    if not owner or not user.get("book_id") or owner.get("book_id") != user.get("book_id"):
        raise HTTPException(403, "Akses ditolak")
    try:
        content, ctype = await run_in_threadpool(storage.get_object, path)
    except Exception as e:
        logger.warning(f"object storage read failed: {e}")
        raise HTTPException(404, "Berkas tidak ditemukan")
    return StreamingResponse(
        io.BytesIO(content),
        media_type=ctype,
        headers={"Cache-Control": "private, max-age=86400"},
    )


# ---------------------------------------------------------------------------
# Google Drive integration (backup rekap)
# ---------------------------------------------------------------------------
from google_drive import router as google_router  # noqa: E402
from reports import router as reports_router  # noqa: E402

api_router.include_router(google_router)
api_router.include_router(reports_router)


@app.on_event("startup")
async def startup():
    await models.users_col.create_index([("username", ASCENDING)], unique=True)
    await models.books_col.create_index([("invite_code", ASCENDING)], unique=True)
    await models.transactions_col.create_index([("book_id", ASCENDING), ("date", -1)])
    await models.accounts_col.create_index([("book_id", ASCENDING)])
    await models.shopping_col.create_index([("book_id", ASCENDING), ("month", ASCENDING)])
    await models.google_tokens_col.create_index([("user_id", ASCENDING)], unique=True)
    try:
        await run_in_threadpool(storage.init_storage)
        logger.info("object storage ready")
    except Exception as e:
        logger.warning(f"object storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    models.client.close()


# Include the main router last so all /api routes are registered
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

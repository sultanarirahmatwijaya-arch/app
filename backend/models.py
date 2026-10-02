import os
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, List, Literal, Optional

import jwt
from bson import ObjectId, errors as bson_errors
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------------------------------------------------------------------------
# Time helpers — the app groups "daily" totals by Asia/Jakarta (WIB).
# ---------------------------------------------------------------------------
WIB = timezone(timedelta(hours=7))


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def today_wib() -> str:
    return datetime.now(WIB).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# MongoDB connection
# ---------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
mdb = client[os.environ["DB_NAME"]]

users_col = mdb["users"]
books_col = mdb["books"]
transactions_col = mdb["transactions"]
accounts_col = mdb["accounts"]
shopping_col = mdb["shopping_plans"]
google_tokens_col = mdb["google_tokens"]


# ---------------------------------------------------------------------------
# Base document pattern: ObjectId <-> str, never leaks `_id` in responses.
# ---------------------------------------------------------------------------
def _coerce_oid(v: Any) -> Any:
    return str(v) if isinstance(v, ObjectId) else v


PyObjectId = Annotated[str, BeforeValidator(_coerce_oid)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: Optional[PyObjectId] = None

    @classmethod
    def from_mongo(cls, doc: Optional[dict]):
        if doc is None:
            return None
        data = dict(doc)
        _id = data.pop("_id", None)
        data["id"] = str(_id) if _id is not None else None
        return cls.model_validate(data)

    def to_mongo(self) -> dict:
        return self.model_dump(exclude={"id"})


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------
JWT_SECRET = os.environ.get("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
TOKEN_DAYS = 30


class TokenError(Exception):
    pass


def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": now_utc(),
        "exp": now_utc() + timedelta(days=TOKEN_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError as e:
        raise TokenError() from e
    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise TokenError()
    return sub


bearer = HTTPBearer(auto_error=False)


async def resolve_user(token: str) -> dict:
    try:
        user_id = decode_token(token)
    except TokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesi berakhir, silakan masuk kembali",
        )
    try:
        oid = ObjectId(user_id)
    except (bson_errors.InvalidId, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesi berakhir, silakan masuk kembali",
        )
    user = await users_col.find_one({"_id": oid})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesi berakhir, silakan masuk kembali",
        )
    return user


async def current_user(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
) -> dict:
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Masuk terlebih dahulu",
        )
    return await resolve_user(creds.credentials)


async def require_book(user: dict) -> str:
    book_id = user.get("book_id")
    if not book_id:
        raise HTTPException(status_code=403, detail="Belum terhubung ke buku tabungan")
    return book_id


def gen_invite_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


# ---------------------------------------------------------------------------
# Internal document models
# ---------------------------------------------------------------------------
class UserDoc(BaseDocument):
    username: str
    password_hash: str
    display_name: str
    avatar_path: Optional[str] = None
    book_id: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class BookDoc(BaseDocument):
    name: str
    invite_code: str
    member_ids: List[str] = Field(default_factory=list)
    created_by: str = ""
    created_at: datetime = Field(default_factory=now_utc)


class TransactionDoc(BaseDocument):
    book_id: str
    type: str
    amount: int
    category: str
    note: str = ""
    source_type: str = "cash"
    account_id: Optional[str] = None
    account_name: Optional[str] = None
    date: str
    created_by: str = ""
    created_by_name: str = ""
    created_at: datetime = Field(default_factory=now_utc)
    deleted_at: Optional[datetime] = None


class AccountDoc(BaseDocument):
    book_id: str
    name: str
    kind: str = "bank"
    bank_name: str = ""
    account_number: str = ""
    initial_balance: int = 0
    created_at: datetime = Field(default_factory=now_utc)
    deleted_at: Optional[datetime] = None


class ShoppingItem(BaseModel):
    id: str
    name: str
    qty: int = 1
    est_price: int = 0
    actual_price: int = 0
    done: bool = False
    deleted: bool = False


class ShoppingPlanDoc(BaseDocument):
    book_id: str
    month: str
    title: str
    items: List[ShoppingItem] = Field(default_factory=list)
    created_by: str = ""
    created_by_name: str = ""
    created_at: datetime = Field(default_factory=now_utc)
    deleted_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# API output models (never contain raw `_id`)
# ---------------------------------------------------------------------------
class UserOut(BaseModel):
    id: str
    username: str
    display_name: str
    avatar_path: Optional[str] = None


class BookOut(BaseModel):
    id: str
    name: str
    invite_code: str
    members: List[UserOut] = []


class AuthOut(BaseModel):
    token: str
    user: UserOut
    book: BookOut


class MeOut(BaseModel):
    user: UserOut
    book: BookOut


class AccountOut(BaseModel):
    id: str
    name: str
    kind: str
    bank_name: str = ""
    account_number: str = ""
    initial_balance: int = 0
    balance: int = 0


class TransactionOut(BaseModel):
    id: str
    type: str
    amount: int
    category: str
    note: str = ""
    source_type: str = "cash"
    account_id: Optional[str] = None
    account_name: Optional[str] = None
    date: str
    created_by: str
    created_by_name: str = ""
    created_at: datetime


class ShoppingItemOut(BaseModel):
    id: str
    name: str
    qty: int = 1
    est_price: int = 0
    actual_price: int = 0
    done: bool = False


class ShoppingPlanOut(BaseModel):
    id: str
    month: str
    title: str
    items: List[ShoppingItemOut] = []
    created_by_name: str = ""
    created_at: datetime


class SummaryOut(BaseModel):
    balance: int = 0
    today_in: int = 0
    today_out: int = 0
    month_in: int = 0
    month_out: int = 0
    accounts: List[AccountOut] = []


def user_out(doc: dict) -> UserOut:
    return UserOut(
        id=str(doc["_id"]),
        username=doc.get("username", ""),
        display_name=doc.get("display_name", ""),
        avatar_path=doc.get("avatar_path"),
    )


async def book_out(book_doc: dict) -> BookOut:
    member_ids = book_doc.get("member_ids", []) or []
    oids = []
    for mid in member_ids:
        try:
            oids.append(ObjectId(mid))
        except (bson_errors.InvalidId, TypeError):
            continue
    members: List[UserOut] = []
    if oids:
        async for m in users_col.find({"_id": {"$in": oids}}):
            members.append(user_out(m))
    return BookOut(
        id=str(book_doc["_id"]),
        name=book_doc.get("name", ""),
        invite_code=book_doc.get("invite_code", ""),
        members=members,
    )


def tx_out(doc: dict) -> TransactionOut:
    return TransactionOut(
        id=str(doc["_id"]),
        type=doc.get("type", "out"),
        amount=doc.get("amount", 0),
        category=doc.get("category", "lainnya-out"),
        note=doc.get("note", ""),
        source_type=doc.get("source_type", "cash"),
        account_id=doc.get("account_id"),
        account_name=doc.get("account_name"),
        date=doc.get("date", today_wib()),
        created_by=doc.get("created_by", ""),
        created_by_name=doc.get("created_by_name", ""),
        created_at=doc.get("created_at", now_utc()),
    )


def account_out(doc: dict, balance: int) -> AccountOut:
    return AccountOut(
        id=str(doc["_id"]),
        name=doc.get("name", ""),
        kind=doc.get("kind", "bank"),
        bank_name=doc.get("bank_name", ""),
        account_number=doc.get("account_number", ""),
        initial_balance=doc.get("initial_balance", 0),
        balance=balance,
    )


def plan_out(doc: dict) -> ShoppingPlanOut:
    items = [
        ShoppingItemOut(
            id=i.get("id", ""),
            name=i.get("name", ""),
            qty=i.get("qty", 1),
            est_price=i.get("est_price", 0),
            actual_price=i.get("actual_price", 0),
            done=bool(i.get("done", False)),
        )
        for i in (doc.get("items") or [])
        if not i.get("deleted", False)
    ]
    return ShoppingPlanOut(
        id=str(doc["_id"]),
        month=doc.get("month", ""),
        title=doc.get("title", ""),
        items=items,
        created_by_name=doc.get("created_by_name", ""),
        created_at=doc.get("created_at", now_utc()),
    )

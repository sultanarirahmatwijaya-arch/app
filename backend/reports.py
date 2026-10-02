"""Statistik bulanan, target tabungan, dan rekap PDF untuk MenAbng."""
import re
from datetime import date
from io import BytesIO
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel, Field
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors as rl_colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

import models
from models import today_wib

router = APIRouter()

MONTH_RE = r"^\d{4}-\d{2}$"
MONTHS_ID = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]
CATEGORY_LABELS = {
    "gaji": "Gaji", "bonus": "Bonus", "usaha": "Usaha", "setoran": "Setoran",
    "lainnya-in": "Lainnya", "makan": "Makan", "belanja": "Belanja",
    "tagihan": "Tagihan", "transport": "Transport", "rumah": "Rumah",
    "kesehatan": "Kesehatan", "hiburan": "Hiburan", "pendidikan": "Pendidikan",
    "lainnya-out": "Lainnya",
}

# Sage Natural palette (static brand colors for the printed report)
SAGE = rl_colors.HexColor("#728153")
SAGE_SOFT = rl_colors.HexColor("#E5EADF")
CREAM = rl_colors.HexColor("#F4F3EE")
INK = rl_colors.HexColor("#2C3028")
MUTED = rl_colors.HexColor("#7A8073")
GREEN = rl_colors.HexColor("#6B8E55")
RED = rl_colors.HexColor("#B85C50")
LINE = rl_colors.HexColor("#E2E0D5")


def month_label(ym: str) -> str:
    try:
        y, m = ym.split("-")
        return f"{MONTHS_ID[int(m) - 1]} {y}"
    except (ValueError, IndexError):
        return ym


def cat_label(cat: str) -> str:
    return CATEGORY_LABELS.get(cat, cat.replace("-", " ").title())


def rupiah(n: int) -> str:
    sign = "-" if n < 0 else ""
    return f"{sign}Rp{abs(int(n)):,}".replace(",", ".")


def shift_month(ym: str, delta: int) -> str:
    y, m = map(int, ym.split("-"))
    idx = y * 12 + (m - 1) + delta
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


async def book_transactions(book_id: str, month: Optional[str] = None) -> List[dict]:
    query = {"book_id": book_id, "deleted_at": None}
    if month:
        query["date"] = {"$regex": f"^{re.escape(month)}"}
    out = []
    async for t in models.transactions_col.find(query).sort([("date", 1), ("created_at", 1)]):
        out.append(t)
    return out


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------
class MonthPoint(BaseModel):
    month: str
    label: str
    income: int = 0
    expense: int = 0


class CategoryPoint(BaseModel):
    category: str
    label: str
    total: int
    pct: float


class StatsOut(BaseModel):
    month: str
    months: List[MonthPoint]
    categories: List[CategoryPoint]
    month_in: int
    month_out: int
    avg_in: int
    avg_out: int


@router.get("/stats", response_model=StatsOut)
async def stats(month: Optional[str] = None, user: dict = Depends(models.current_user)):
    book_id = await models.require_book(user)
    month = month if month and re.match(MONTH_RE, month) else today_wib()[:7]
    window = [shift_month(month, -i) for i in range(5, -1, -1)]
    agg = {m: {"income": 0, "expense": 0} for m in window}
    cats: dict = {}
    first = window[0]
    async for t in models.transactions_col.find(
        {"book_id": book_id, "deleted_at": None, "date": {"$gte": first, "$lte": f"{month}-31"}}
    ):
        ym = (t.get("date") or "")[:7]
        if ym not in agg:
            continue
        amount = t.get("amount", 0)
        if t.get("type") == "in":
            agg[ym]["income"] += amount
        else:
            agg[ym]["expense"] += amount
            if ym == month:
                c = t.get("category", "lainnya-out")
                cats[c] = cats.get(c, 0) + amount
    month_out = sum(cats.values())
    categories = sorted(
        (
            CategoryPoint(
                category=c,
                label=cat_label(c),
                total=v,
                pct=round(v / month_out * 100, 1) if month_out else 0.0,
            )
            for c, v in cats.items()
        ),
        key=lambda x: -x.total,
    )
    points = [
        MonthPoint(month=m, label=MONTHS_ID[int(m[5:]) - 1][:3], **agg[m]) for m in window
    ]
    active = [p for p in points if p.income or p.expense] or points
    return StatsOut(
        month=month,
        months=points,
        categories=categories,
        month_in=agg[month]["income"],
        month_out=agg[month]["expense"],
        avg_in=round(sum(p.income for p in active) / len(active)),
        avg_out=round(sum(p.expense for p in active) / len(active)),
    )


# ---------------------------------------------------------------------------
# Savings goal (stored on the shared book)
# ---------------------------------------------------------------------------
class GoalIn(BaseModel):
    title: str = Field(default="Tabungan Nikah", min_length=1, max_length=60)
    target_amount: int = Field(gt=0, le=999_999_999_999)
    target_date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class GoalOut(BaseModel):
    set: bool = False
    title: str = ""
    target_amount: int = 0
    target_date: Optional[str] = None
    saved: int = 0
    remaining: int = 0
    progress: float = 0.0
    months_left: Optional[int] = None
    days_left: Optional[int] = None
    monthly_needed: Optional[int] = None


async def _book_balance(book_id: str) -> int:
    balance = 0
    async for t in models.transactions_col.find({"book_id": book_id, "deleted_at": None}):
        balance += t.get("amount", 0) if t.get("type") == "in" else -t.get("amount", 0)
    return balance


def _goal_out(goal: Optional[dict], saved: int) -> GoalOut:
    if not goal:
        return GoalOut(saved=saved)
    target = int(goal.get("target_amount", 0)) or 1
    remaining = max(0, target - saved)
    out = GoalOut(
        set=True,
        title=goal.get("title", ""),
        target_amount=target,
        target_date=goal.get("target_date"),
        saved=saved,
        remaining=remaining,
        progress=round(min(1.0, max(0.0, saved / target)), 4),
    )
    if goal.get("target_date"):
        try:
            y, m, d = map(int, goal["target_date"].split("-"))
            ty, tm, td = map(int, today_wib().split("-"))
            days = (date(y, m, d) - date(ty, tm, td)).days
        except ValueError:
            days = None
        if days is not None:
            out.days_left = max(0, days)
            months = max(1, round(max(0, days) / 30.44)) if days > 0 else 0
            out.months_left = months
            out.monthly_needed = round(remaining / months) if months > 0 else remaining
    return out


@router.get("/goal", response_model=GoalOut)
async def get_goal(user: dict = Depends(models.current_user)):
    book_id = await models.require_book(user)
    book = await models.books_col.find_one({"_id": ObjectId(book_id)})
    return _goal_out((book or {}).get("goal"), await _book_balance(book_id))


@router.put("/goal", response_model=GoalOut)
async def set_goal(body: GoalIn, user: dict = Depends(models.current_user)):
    book_id = await models.require_book(user)
    goal = {
        "title": body.title.strip(),
        "target_amount": body.target_amount,
        "target_date": body.target_date,
    }
    await models.books_col.update_one({"_id": ObjectId(book_id)}, {"$set": {"goal": goal}})
    return _goal_out(goal, await _book_balance(book_id))


@router.delete("/goal")
async def delete_goal(user: dict = Depends(models.current_user)):
    book_id = await models.require_book(user)
    await models.books_col.update_one({"_id": ObjectId(book_id)}, {"$unset": {"goal": ""}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# PDF recap
# ---------------------------------------------------------------------------
def _category_chart(cats: List[tuple], width: float) -> Drawing:
    row_h = 18
    label_w = 70 * mm
    bar_w = width - label_w - 30 * mm
    h = row_h * len(cats) + 4
    d = Drawing(width, h)
    top = max((v for _, v in cats), default=1) or 1
    for i, (label, value) in enumerate(cats):
        y = h - (i + 1) * row_h + 3
        d.add(String(0, y + 2, label, fontName="Helvetica", fontSize=9, fillColor=INK))
        d.add(Rect(label_w, y, bar_w, 10, fillColor=SAGE_SOFT, strokeColor=None, rx=5, ry=5))
        w = max(4, bar_w * value / top)
        d.add(Rect(label_w, y, w, 10, fillColor=SAGE, strokeColor=None, rx=5, ry=5))
        d.add(
            String(
                label_w + bar_w + 4, y + 2, rupiah(value),
                fontName="Helvetica", fontSize=8, fillColor=MUTED,
            )
        )
    return d


def _month_chart(points: List[dict], width: float) -> Drawing:
    h = 110
    d = Drawing(width, h)
    base = 22
    top = max(max(p["income"], p["expense"]) for p in points) or 1
    slot = width / len(points)
    bw = min(16, slot / 3)
    for i, p in enumerate(points):
        x0 = i * slot + slot / 2
        hi = (h - base - 8) * p["income"] / top
        ho = (h - base - 8) * p["expense"] / top
        d.add(Rect(x0 - bw - 2, base, bw, max(hi, 1), fillColor=GREEN, strokeColor=None, rx=2, ry=2))
        d.add(Rect(x0 + 2, base, bw, max(ho, 1), fillColor=RED, strokeColor=None, rx=2, ry=2))
        d.add(
            String(x0, 6, p["label"], fontName="Helvetica", fontSize=8, fillColor=MUTED, textAnchor="middle")
        )
    d.add(Rect(0, base - 1, width, 0.6, fillColor=LINE, strokeColor=None))
    return d


def build_pdf(book_name: str, month: Optional[str], txs: List[dict], goal: GoalOut, members: str) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=16 * mm,
        title=f"Rekap MenAbng {month_label(month) if month else 'Semua Waktu'}",
    )
    width = A4[0] - 36 * mm
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=20, textColor=INK, alignment=0, spaceAfter=2)
    sub = ParagraphStyle("sub", parent=ss["Normal"], fontSize=10, textColor=MUTED, spaceAfter=10)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=12, textColor=SAGE, spaceBefore=12, spaceAfter=6)
    body = ParagraphStyle("body", parent=ss["Normal"], fontSize=9, textColor=INK)
    body_r = ParagraphStyle("body_r", parent=body, alignment=TA_RIGHT)
    small = ParagraphStyle("small", parent=body, fontSize=8, textColor=MUTED)

    total_in = sum(t["amount"] for t in txs if t.get("type") == "in")
    total_out = sum(t["amount"] for t in txs if t.get("type") != "in")

    story = [
        Paragraph("MenAbng", ParagraphStyle("brand", parent=sub, textColor=SAGE, fontName="Helvetica-Bold", spaceAfter=0)),
        Paragraph(f"Rekap {month_label(month) if month else 'Semua Waktu'}", h1),
        Paragraph(f"{book_name} · {members} · dicetak {today_wib()}", sub),
    ]

    # Summary boxes
    summary = Table(
        [
            [Paragraph("UANG MASUK", small), Paragraph("UANG KELUAR", small), Paragraph("SELISIH / SALDO", small)],
            [
                Paragraph(f"<font color='#6B8E55'><b>{rupiah(total_in)}</b></font>", ParagraphStyle("v", parent=body, fontSize=13)),
                Paragraph(f"<font color='#B85C50'><b>{rupiah(total_out)}</b></font>", ParagraphStyle("v", parent=body, fontSize=13)),
                Paragraph(f"<b>{rupiah(total_in - total_out)}</b>", ParagraphStyle("v", parent=body, fontSize=13)),
            ],
        ],
        colWidths=[width / 3] * 3,
    )
    summary.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), CREAM),
            ("BOX", (0, 0), (-1, -1), 0.5, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
            ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ])
    )
    story.append(summary)

    if goal.set:
        pct = int(goal.progress * 100)
        story.append(Paragraph("Target Tabungan", h2))
        story.append(
            Paragraph(
                f"<b>{goal.title}</b> — terkumpul {rupiah(goal.saved)} dari {rupiah(goal.target_amount)} ({pct}%)."
                + (f" Sisa {rupiah(goal.remaining)}, perlu sekitar {rupiah(goal.monthly_needed)} per bulan hingga {goal.target_date}." if goal.monthly_needed is not None else ""),
                body,
            )
        )
        bar = Drawing(width, 12)
        bar.add(Rect(0, 2, width, 8, fillColor=SAGE_SOFT, strokeColor=None, rx=4, ry=4))
        bar.add(Rect(0, 2, max(4, width * goal.progress), 8, fillColor=SAGE, strokeColor=None, rx=4, ry=4))
        story.append(Spacer(1, 4))
        story.append(bar)

    # Monthly trend (all-time or 6 months window)
    by_month: dict = {}
    for t in txs:
        ym = (t.get("date") or "")[:7]
        slot = by_month.setdefault(ym, {"income": 0, "expense": 0})
        slot["income" if t.get("type") == "in" else "expense"] += t.get("amount", 0)
    if len(by_month) > 1:
        months_sorted = sorted(by_month)[-12:]
        story.append(Paragraph("Tren Bulanan (hijau = masuk, merah = keluar)", h2))
        story.append(
            _month_chart(
                [{"label": MONTHS_ID[int(m[5:]) - 1][:3] + (" " + m[2:4] if len(months_sorted) > 6 else ""), **by_month[m]} for m in months_sorted],
                width,
            )
        )

    # Category breakdown
    cats: dict = {}
    for t in txs:
        if t.get("type") != "in":
            c = t.get("category", "lainnya-out")
            cats[c] = cats.get(c, 0) + t.get("amount", 0)
    if cats:
        story.append(Paragraph("Pengeluaran per Kategori", h2))
        ordered = sorted(cats.items(), key=lambda kv: -kv[1])
        story.append(_category_chart([(cat_label(c), v) for c, v in ordered], width))

    # Transactions table
    story.append(Paragraph(f"Daftar Transaksi ({len(txs)})", h2))
    if not txs:
        story.append(Paragraph("Belum ada transaksi pada periode ini.", small))
    else:
        rows = [[
            Paragraph("<b>Tanggal</b>", small), Paragraph("<b>Kategori</b>", small),
            Paragraph("<b>Keterangan</b>", small), Paragraph("<b>Sumber</b>", small),
            Paragraph("<b>Oleh</b>", small), Paragraph("<b>Jumlah</b>", ParagraphStyle("sr", parent=small, alignment=TA_RIGHT)),
        ]]
        for t in txs:
            is_in = t.get("type") == "in"
            color = "#6B8E55" if is_in else "#B85C50"
            sign = "+" if is_in else "-"
            source = t.get("account_name") if t.get("source_type") == "account" else "Tunai"
            rows.append([
                Paragraph(t.get("date", ""), body),
                Paragraph(cat_label(t.get("category", "")), body),
                Paragraph((t.get("note") or "—"), body),
                Paragraph(source or "—", body),
                Paragraph(t.get("created_by_name", ""), body),
                Paragraph(f"<font color='{color}'>{sign}{rupiah(t.get('amount', 0))}</font>", body_r),
            ])
        table = Table(rows, colWidths=[20 * mm, 24 * mm, width - 20 * mm - 24 * mm - 24 * mm - 24 * mm - 32 * mm, 24 * mm, 24 * mm, 32 * mm], repeatRows=1)
        table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), SAGE_SOFT),
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rl_colors.white, CREAM]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ])
        )
        story.append(table)

    story.append(Spacer(1, 14))
    story.append(Paragraph("MenAbng · mencatat bareng, hemat bareng", small))
    doc.build(story)
    return buf.getvalue()


async def render_recap_pdf(user: dict, month: Optional[str]) -> tuple[bytes, str]:
    book_id = await models.require_book(user)
    book = await models.books_col.find_one({"_id": ObjectId(book_id)}) or {}
    txs = await book_transactions(book_id, month)
    goal = _goal_out(book.get("goal"), await _book_balance(book_id))
    book_out = await models.book_out(book) if book else None
    members = " & ".join(m.display_name for m in book_out.members) if book_out else ""
    pdf = await run_in_threadpool(build_pdf, book.get("name", "Tabungan Bersama"), month, txs, goal, members)
    filename = f"MenAbng-Rekap-{month or 'Semua'}.pdf"
    return pdf, filename


@router.get("/reports/pdf")
async def report_pdf(month: str = "", token: Optional[str] = None, creds=Depends(models.bearer)):
    tok = token or (creds.credentials if creds else None)
    if not tok:
        raise HTTPException(401, "Masuk terlebih dahulu")
    user = await models.resolve_user(tok)
    if month and month != "all" and not re.match(MONTH_RE, month):
        raise HTTPException(422, "Format bulan harus YYYY-MM")
    pdf, filename = await render_recap_pdf(user, None if month in ("", "all") else month)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )

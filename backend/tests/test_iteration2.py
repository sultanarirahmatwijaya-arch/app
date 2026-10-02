"""Iteration 2 tests: /api/stats, /api/goal, /api/reports/pdf, Google Drive export, regression."""
import os
import uuid
from datetime import datetime

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://joint-savings-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _uniq(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def user():
    """Register fresh user with transactions seeded across 3 months (Aug/Sep/Oct 2026)."""
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    username = _uniq("iter2")
    r = sess.post(f"{API}/auth/register",
                  json={"username": username, "password": "rahasia123", "display_name": "Iter2 User"})
    assert r.status_code == 201, r.text
    data = r.json()
    token = data["token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Seed transactions across months
    seeds = [
        # Aug 2026
        {"type": "in", "amount": 5_000_000, "category": "gaji", "date": "2026-08-05", "note": "TEST gaji aug"},
        {"type": "out", "amount": 200_000, "category": "makan", "date": "2026-08-10", "note": "TEST makan"},
        {"type": "out", "amount": 150_000, "category": "transport", "date": "2026-08-12"},
        # Sep 2026
        {"type": "in", "amount": 6_000_000, "category": "gaji", "date": "2026-09-05"},
        {"type": "out", "amount": 500_000, "category": "makan", "date": "2026-09-10"},
        {"type": "out", "amount": 300_000, "category": "belanja", "date": "2026-09-11"},
        {"type": "out", "amount": 200_000, "category": "tagihan", "date": "2026-09-20"},
        # Oct 2026
        {"type": "in", "amount": 7_000_000, "category": "gaji", "date": "2026-10-01"},
        {"type": "out", "amount": 100_000, "category": "makan", "date": "2026-10-02"},
    ]
    for s in seeds:
        rr = sess.post(f"{API}/transactions", headers=headers, json=s)
        assert rr.status_code == 200, rr.text

    return {"sess": sess, "token": token, "headers": headers, "data": data}


# ---------- Stats ----------
class TestStats:
    def test_stats_default_current_month(self, user):
        r = user["sess"].get(f"{API}/stats", headers=user["headers"])
        assert r.status_code == 200, r.text
        j = r.json()
        assert "months" in j and len(j["months"]) == 6
        assert "categories" in j
        assert "month_in" in j and "month_out" in j
        assert "avg_in" in j and "avg_out" in j

    def test_stats_specific_month_sep(self, user):
        r = user["sess"].get(f"{API}/stats?month=2026-09", headers=user["headers"])
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["month"] == "2026-09"
        months = j["months"]
        assert len(months) == 6
        # Last month should be Sep 2026
        assert months[-1]["month"] == "2026-09"
        # 6-month window ending Sep: Apr, May, Jun, Jul, Aug, Sep
        expected = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
        assert [m["month"] for m in months] == expected

        # Verify Aug and Sep sums
        aug = next(m for m in months if m["month"] == "2026-08")
        sep = next(m for m in months if m["month"] == "2026-09")
        assert aug["income"] == 5_000_000
        assert aug["expense"] == 350_000  # 200+150
        assert sep["income"] == 6_000_000
        assert sep["expense"] == 1_000_000  # 500+300+200

        # month_in / month_out should match Sep
        assert j["month_in"] == 6_000_000
        assert j["month_out"] == 1_000_000

        # categories: expenses in Sep only
        cats = j["categories"]
        assert len(cats) == 3
        cat_map = {c["category"]: c for c in cats}
        assert cat_map["makan"]["total"] == 500_000
        assert cat_map["belanja"]["total"] == 300_000
        assert cat_map["tagihan"]["total"] == 200_000
        # pct sums ~100
        pct_sum = sum(c["pct"] for c in cats)
        assert 99.0 <= pct_sum <= 101.0

    def test_stats_window_ends_at_current_month(self, user):
        r = user["sess"].get(f"{API}/stats?month=2026-10", headers=user["headers"])
        assert r.status_code == 200
        j = r.json()
        assert j["months"][-1]["month"] == "2026-10"
        oct_m = j["months"][-1]
        assert oct_m["income"] == 7_000_000
        assert oct_m["expense"] == 100_000


# ---------- Goal ----------
class TestGoal:
    def test_goal_before_set(self, user):
        r = user["sess"].get(f"{API}/goal", headers=user["headers"])
        assert r.status_code == 200
        j = r.json()
        assert j["set"] is False
        # saved should equal computed balance (18M in - 1.45M out = 16.55M)
        expected_balance = 18_000_000 - 1_450_000
        assert j["saved"] == expected_balance

    def test_goal_set_with_target_date(self, user):
        r = user["sess"].put(f"{API}/goal", headers=user["headers"],
                              json={"title": "Nikah", "target_amount": 50_000_000,
                                    "target_date": "2027-06-01"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["set"] is True
        assert j["title"] == "Nikah"
        assert j["target_amount"] == 50_000_000
        assert j["target_date"] == "2027-06-01"
        assert 0.0 <= j["progress"] <= 1.0
        assert j["remaining"] == 50_000_000 - j["saved"]
        assert j["months_left"] is not None and j["months_left"] > 0
        assert j["monthly_needed"] is not None and j["monthly_needed"] > 0

    def test_goal_set_without_target_date(self, user):
        r = user["sess"].put(f"{API}/goal", headers=user["headers"],
                              json={"title": "Rumah", "target_amount": 100_000_000})
        assert r.status_code == 200
        j = r.json()
        assert j["set"] is True
        assert j["target_date"] is None
        assert j["months_left"] is None
        assert j["monthly_needed"] is None

    def test_goal_invalid_amount(self, user):
        r = user["sess"].put(f"{API}/goal", headers=user["headers"],
                              json={"title": "x", "target_amount": 0})
        assert r.status_code == 422
        r2 = user["sess"].put(f"{API}/goal", headers=user["headers"],
                               json={"title": "x", "target_amount": -1})
        assert r2.status_code == 422

    def test_goal_invalid_date_format(self, user):
        r = user["sess"].put(f"{API}/goal", headers=user["headers"],
                              json={"title": "x", "target_amount": 1_000_000,
                                    "target_date": "99/99/2027"})
        assert r.status_code == 422

    def test_goal_delete(self, user):
        # Ensure some goal is set first
        user["sess"].put(f"{API}/goal", headers=user["headers"],
                         json={"title": "temp", "target_amount": 1_000_000})
        r = user["sess"].delete(f"{API}/goal", headers=user["headers"])
        assert r.status_code == 200
        g = user["sess"].get(f"{API}/goal", headers=user["headers"]).json()
        assert g["set"] is False


# ---------- PDF Reports ----------
class TestReportsPdf:
    def test_pdf_month_bearer(self, user):
        r = user["sess"].get(f"{API}/reports/pdf?month=2026-09", headers=user["headers"])
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_pdf_all_query_token(self, user):
        # Use token query param (no Authorization header)
        r = requests.get(f"{API}/reports/pdf", params={"month": "all", "token": user["token"]})
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_pdf_no_token_401(self, user):
        r = requests.get(f"{API}/reports/pdf", params={"month": "2026-09"})
        assert r.status_code == 401

    def test_pdf_bad_month_422(self, user):
        r = user["sess"].get(f"{API}/reports/pdf?month=bad", headers=user["headers"])
        assert r.status_code == 422

    def test_pdf_empty_month_means_all(self, user):
        r = user["sess"].get(f"{API}/reports/pdf", headers=user["headers"])
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


# ---------- Google Drive export (not configured expected) ----------
class TestGoogleDrive:
    def test_export_pdf_format(self, user):
        r = user["sess"].post(f"{API}/integrations/google/export", headers=user["headers"],
                               json={"month": "2026-10", "format": "pdf"})
        # Should NOT be 500. Expect 503 (unconfigured) or 409 (no token)
        assert r.status_code != 500, r.text
        assert r.status_code in (409, 503)


# ---------- Regression ----------
class TestRegression:
    def test_summary(self, user):
        r = user["sess"].get(f"{API}/summary", headers=user["headers"])
        assert r.status_code == 200
        j = r.json()
        assert "balance" in j and "month_in" in j and "accounts" in j

    def test_transactions_list(self, user):
        r = user["sess"].get(f"{API}/transactions", headers=user["headers"])
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 9

    def test_accounts(self, user):
        r = user["sess"].get(f"{API}/accounts", headers=user["headers"])
        assert r.status_code == 200
        assert isinstance(r.json(), list)

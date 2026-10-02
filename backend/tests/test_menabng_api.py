"""End-to-end API tests for MenAbng backend."""
import io
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if "EXPO_PUBLIC_BACKEND_URL" in os.environ else \
    "https://joint-savings-app.preview.emergentagent.com"
API = f"{BASE_URL}/api"


def _uniq(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def primary(s):
    """Register one primary user and return auth payload."""
    username = _uniq("udi")
    r = s.post(f"{API}/auth/register",
               json={"username": username, "password": "rahasia123", "display_name": "Udi Test"})
    assert r.status_code == 201, r.text
    data = r.json()
    assert "token" in data and data["user"]["username"] == username.lower()
    assert data["book"]["id"] and data["book"]["invite_code"]
    data["password"] = "rahasia123"
    return data


def _h(user):
    return {"Authorization": f"Bearer {user['token']}", "Content-Type": "application/json"}


# ---------------- Auth ----------------
class TestAuth:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200 and r.json()["status"] == "ok"

    def test_register_duplicate_409(self, s, primary):
        r = s.post(f"{API}/auth/register",
                   json={"username": primary["user"]["username"], "password": "rahasia123", "display_name": "x"})
        assert r.status_code == 409

    def test_login_success(self, s, primary):
        r = s.post(f"{API}/auth/login",
                   json={"username": primary["user"]["username"], "password": "rahasia123"})
        assert r.status_code == 200
        assert r.json()["user"]["id"] == primary["user"]["id"]

    def test_login_wrong_password_401(self, s, primary):
        r = s.post(f"{API}/auth/login",
                   json={"username": primary["user"]["username"], "password": "wrong!"})
        assert r.status_code == 401

    def test_me_invalid_token_401(self, s):
        r = s.get(f"{API}/auth/me", headers={"Authorization": "Bearer not.a.token"})
        assert r.status_code == 401

    def test_me_no_token_401(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_ok(self, s, primary):
        r = s.get(f"{API}/auth/me", headers=_h(primary))
        assert r.status_code == 200
        j = r.json()
        assert j["user"]["id"] == primary["user"]["id"]
        assert j["book"]["id"] == primary["book"]["id"]


# ---------------- Accounts ----------------
class TestAccounts:
    def test_crud_and_balance(self, s, primary):
        # Create
        r = s.post(f"{API}/accounts", headers=_h(primary),
                   json={"name": "TEST_BCA", "kind": "bank", "bank_name": "BCA",
                         "account_number": "123", "initial_balance": 500_000})
        assert r.status_code == 200, r.text
        acc = r.json()
        assert acc["balance"] == 500_000 and acc["kind"] == "bank"
        acc_id = acc["id"]

        # Add a transaction tied to this account
        r = s.post(f"{API}/transactions", headers=_h(primary),
                   json={"type": "in", "amount": 100_000, "category": "gaji",
                         "source_type": "account", "account_id": acc_id})
        assert r.status_code == 200, r.text

        # Balance should now be 600_000
        r = s.get(f"{API}/accounts", headers=_h(primary))
        assert r.status_code == 200
        found = [a for a in r.json() if a["id"] == acc_id][0]
        assert found["balance"] == 600_000

        # Update
        r = s.put(f"{API}/accounts/{acc_id}", headers=_h(primary),
                  json={"name": "TEST_BCA2", "kind": "bank", "bank_name": "BCA",
                        "account_number": "123", "initial_balance": 200_000})
        assert r.status_code == 200 and r.json()["balance"] == 300_000

        # Delete
        r = s.delete(f"{API}/accounts/{acc_id}", headers=_h(primary))
        assert r.status_code == 200 and r.json()["ok"] is True

        # Verify soft delete (not returned)
        r = s.get(f"{API}/accounts", headers=_h(primary))
        assert all(a["id"] != acc_id for a in r.json())


# ---------------- Transactions / Summary ----------------
class TestTxSummary:
    def test_create_list_filter_delete_and_summary(self, s, primary):
        # Create in + out
        r1 = s.post(f"{API}/transactions", headers=_h(primary),
                    json={"type": "in", "amount": 1_000_000, "category": "gaji", "note": "TEST gaji"})
        r2 = s.post(f"{API}/transactions", headers=_h(primary),
                    json={"type": "out", "amount": 25_000, "category": "makan", "note": "TEST makan"})
        assert r1.status_code == 200 and r2.status_code == 200
        tx_in_id = r1.json()["id"]
        tx_out_id = r2.json()["id"]

        # List
        r = s.get(f"{API}/transactions", headers=_h(primary))
        ids = [t["id"] for t in r.json()]
        assert tx_in_id in ids and tx_out_id in ids

        # Filter type=in
        r = s.get(f"{API}/transactions?type=in", headers=_h(primary))
        assert all(t["type"] == "in" for t in r.json())

        # Filter q (search)
        r = s.get(f"{API}/transactions?q=makan", headers=_h(primary))
        assert any(t["id"] == tx_out_id for t in r.json())

        # Summary reflects totals
        r = s.get(f"{API}/summary", headers=_h(primary))
        assert r.status_code == 200
        sm = r.json()
        assert sm["today_in"] >= 1_000_000
        assert sm["today_out"] >= 25_000
        assert isinstance(sm["accounts"], list)

        # Soft delete
        r = s.delete(f"{API}/transactions/{tx_in_id}", headers=_h(primary))
        assert r.status_code == 200
        r = s.get(f"{API}/transactions", headers=_h(primary))
        assert tx_in_id not in [t["id"] for t in r.json()]

    def test_month_filter(self, s, primary):
        r = s.get(f"{API}/transactions?month=2025-01", headers=_h(primary))
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_bad_account_id(self, s, primary):
        r = s.post(f"{API}/transactions", headers=_h(primary),
                   json={"type": "out", "amount": 10, "category": "x",
                         "source_type": "account", "account_id": "deadbeefdeadbeefdeadbeef"})
        assert r.status_code == 404


# ---------------- Shopping ----------------
class TestShopping:
    def test_plan_item_lifecycle(self, s, primary):
        month = time.strftime("%Y-%m")
        r = s.post(f"{API}/shopping", headers=_h(primary),
                   json={"month": month, "title": "TEST belanja"})
        assert r.status_code == 200, r.text
        plan = r.json()
        pid = plan["id"]

        # Add item
        r = s.post(f"{API}/shopping/{pid}/items", headers=_h(primary),
                   json={"name": "Beras", "qty": 2, "est_price": 15000})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        iid = items[0]["id"]

        # Toggle done -> actual_price fills from est
        r = s.put(f"{API}/shopping/{pid}/items/{iid}", headers=_h(primary),
                  json={"done": True})
        assert r.status_code == 200
        it = [i for i in r.json()["items"] if i["id"] == iid][0]
        assert it["done"] is True and it["actual_price"] == 15000

        # Delete item
        r = s.delete(f"{API}/shopping/{pid}/items/{iid}", headers=_h(primary))
        assert r.status_code == 200
        assert all(i["id"] != iid for i in r.json()["items"])

        # List by month
        r = s.get(f"{API}/shopping?month={month}", headers=_h(primary))
        assert r.status_code == 200
        assert any(p["id"] == pid for p in r.json())

        # Bad month format
        r = s.get(f"{API}/shopping?month=2025-1", headers=_h(primary))
        assert r.status_code == 422

        # Delete plan
        r = s.delete(f"{API}/shopping/{pid}", headers=_h(primary))
        assert r.status_code == 200
        r = s.get(f"{API}/shopping?month={month}", headers=_h(primary))
        assert all(p["id"] != pid for p in r.json())


# ---------------- Books / Join ----------------
class TestBooks:
    def test_rename_and_join_sharing(self, s, primary):
        # Rename book
        r = s.put(f"{API}/books/me", headers=_h(primary),
                  json={"name": "Tabungan Kami"})
        assert r.status_code == 200 and r.json()["name"] == "Tabungan Kami"

        # Register second user
        username2 = _uniq("ita")
        r2 = s.post(f"{API}/auth/register",
                    json={"username": username2, "password": "rahasia123", "display_name": "Ita"})
        assert r2.status_code == 201
        partner = r2.json()

        # Partner has own book initially — distinct from primary
        assert partner["book"]["id"] != primary["book"]["id"]

        # Partner joins primary's book
        r = s.post(f"{API}/books/join", headers=_h(partner),
                   json={"code": primary["book"]["invite_code"]})
        assert r.status_code == 200, r.text
        joined = r.json()
        assert joined["id"] == primary["book"]["id"]
        member_ids = {m["id"] for m in joined["members"]}
        assert primary["user"]["id"] in member_ids and partner["user"]["id"] in member_ids

        # Partner's /me now points to primary's book
        r = s.get(f"{API}/auth/me", headers=_h(partner))
        assert r.json()["book"]["id"] == primary["book"]["id"]

        # Partner can create a transaction and primary sees it
        r = s.post(f"{API}/transactions", headers=_h(partner),
                   json={"type": "in", "amount": 50_000, "category": "hadiah", "note": "TEST hadiah shared"})
        assert r.status_code == 200
        shared_tx_id = r.json()["id"]
        r = s.get(f"{API}/transactions?q=shared", headers=_h(primary))
        assert any(t["id"] == shared_tx_id for t in r.json())

        # Invalid invite code
        r = s.post(f"{API}/books/join", headers=_h(partner),
                   json={"code": "ZZZZZZ"})
        assert r.status_code == 404


# ---------------- Profile ----------------
class TestProfile:
    def test_rename_me(self, s, primary):
        r = s.put(f"{API}/users/me", headers=_h(primary),
                  json={"display_name": "Udi Baru"})
        assert r.status_code == 200 and r.json()["display_name"] == "Udi Baru"

    def test_avatar_wrong_type_415(self, s, primary):
        files = {"file": ("x.txt", io.BytesIO(b"hello"), "text/plain")}
        headers = {"Authorization": f"Bearer {primary['token']}"}
        r = requests.post(f"{API}/users/me/avatar", files=files, headers=headers)
        assert r.status_code == 415


# ---------------- Files ownership ----------------
class TestFiles:
    def test_outside_user_denied(self, s, primary):
        # Register an outsider in a separate book
        outsider = s.post(f"{API}/auth/register",
                          json={"username": _uniq("out"), "password": "rahasia123", "display_name": "Out"})
        assert outsider.status_code == 201
        out_user = outsider.json()
        # Try to read a plausible avatar path belonging to primary user
        fake_path = f"menabng/avatars/{primary['user']['id']}/doesnotexist.jpg"
        r = s.get(f"{API}/files/{fake_path}", headers=_h(out_user))
        assert r.status_code == 403


# ---------------- Google Drive ----------------
class TestGoogleDrive:
    def test_status_not_connected(self, s, primary):
        r = s.get(f"{API}/integrations/google/status", headers=_h(primary))
        assert r.status_code == 200 and r.json() == {"connected": False}

    def test_export_without_connection(self, s, primary):
        r = s.post(f"{API}/integrations/google/export", headers=_h(primary), json={})
        # Not configured env → 503; configured but no token → 409
        assert r.status_code in (409, 503)

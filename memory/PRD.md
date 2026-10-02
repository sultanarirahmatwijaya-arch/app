# MenAbng — Product Requirements Document

## Original Problem Statement
Aplikasi mobile untuk mencatat dan merekap keuangan tabungan pengguna dan calon istrinya.
Fitur yang diminta: login & daftar (username/password), database terhubung, pencatatan uang
keluar/masuk + total harian, pengaturan belanja bulanan (mis. Oktober 2026: beras, sabun),
dokumentasi sumber uang masuk/keluar, pencatatan rekening bank, alur mirip metode kasir,
foto profil. Nama aplikasi: MenAbng. Warna natural, minimalis, tidak kontras.

## Design
- Palette "Sage Natural" (cream #FDFCF8, sage #728153, ink #2C3028). Fonts: Fraunces + Plus Jakarta Sans.
- Bottom tab navigation: Beranda, Riwayat, Belanja, Profil. Modal kasir "Catat" + screen Rekening.

## Architecture
- Backend: FastAPI + MongoDB (motor). JWT auth (bcrypt). Models with BaseDocument (ObjectId->str).
- Shared "book" model: both partners linked to one book_id via invite code → one shared ledger.
- Object Storage (Emergent managed) for profile photos, served via /api/files with ownership check.
- Google Drive backup via server-side OAuth (drive.file) — exports monthly CSV recap. Needs
  GOOGLE_CLIENT_ID/SECRET to activate (gracefully disabled otherwise).
- Frontend: Expo Router, React Query, react-native-keyboard-controller, expo-image-picker, expo-haptics.

## User Personas
- Pasangan (calon suami-istri) menabung bersama, mencatat pemasukan/pengeluaran harian, dan
  merencanakan belanja kebutuhan rumah bulanan.

## Core Requirements (static)
1. Auth: register/login username+password. ✅
2. Shared savings book between two users (invite code join). ✅
3. Cashier-style entry: big keypad, category, source, date, in/out. ✅
4. Daily/monthly totals + running balance. ✅
5. Monthly shopping planner with checklist + est/actual price. ✅
6. Transaction documentation (detail: source, who recorded, date). ✅
7. Manual bank/cash/e-wallet accounts with computed balances. ✅
8. Profile photo upload. ✅
9. Google Drive recap backup (optional, needs OAuth creds). ✅ (code complete)

## Implemented — 2026-10-02 (MVP)
- Full backend API (auth, books, transactions, accounts, summary, shopping, files, gdrive).
- All screens: login/register, Beranda (balance + today + recent), Riwayat (filter/search/detail/delete),
  Belanja (month nav, plans, items, progress), Profil (photo, book+invite, join, drive, logout), Rekening, Catat (keypad).
- Smoke-tested all endpoints via curl; login screen verified via screenshot.

## Implemented — 2026-10-02 (Iteration 2)
- Rekap & Grafik screen (/rekap): month navigator, 6-month income/expense bar chart, category breakdown, averages.
- Target Tabungan on Home: goal (title, nominal, optional target date) stored on book; progress bar, sisa, saran nabung/bulan.
- Rekap PDF (reportlab): GET /api/reports/pdf?month=YYYY-MM|all → summary, goal, trend, category bars, full transaction table.
  Web opens new tab; native downloads via expo-file-system and shares via expo-sharing.
- Drive export supports format csv|pdf. Fixed mobile OAuth redirect (expo-linking createURL).
- Tested: backend 18/18 pytest (tests/test_iteration2.py), frontend flows verified by testing agent.

## Backlog / Remaining
- P1: Activate Google Drive — user must supply GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (guide given; callback URI = BACKEND_PUBLIC_URL + /api/integrations/google/callback).
- P1: Auto-connect bank accounts (user to supply bank data later).
- P3: Catat category chips scroll affordance (minor UX).

## Next Tasks
- Full e2e testing via testing_agent, fix any issues.

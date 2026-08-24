# UpclaseLam — Full Stack (Backend Railway + Frontend Vercel)

Paket ini berisi aplikasi **UpclaseLam** versi lengkap:

- `backend/` — Server Node.js/Express **real** dengan:
  - Database **PostgreSQL** asli (tabel `users`, `vip_subscriptions`, `login_history`, `export_history`, `app_settings`)
  - Login **Google OAuth resmi** (verifikasi token via `google-auth-library`, pakai Client ID & Client Secret Anda)
  - Login/Daftar Email + Password (hash `bcrypt`)
  - JWT session (30 hari)
  - Panel Admin: grant/cabut VIP, upload foto QRIS, statistik, riwayat login
  - **Real-time** lewat Socket.IO (dashboard admin update otomatis saat ada login/VIP baru, tanpa refresh)
- `frontend/` — UI yang sudah Anda kirim (`UpclaseLam`), sudah disambungkan ke backend di atas
  menggantikan seluruh penyimpanan `localStorage` lama. Proses edit foto/video (canvas, sharpen,
  beautify, dsb) **tetap 100% di browser** — file media pengguna tidak pernah dikirim ke server.

---

## 1. Siapkan Database (PostgreSQL) di Railway

1. Buka [railway.app](https://railway.app) → New Project.
2. Klik **+ New → Database → Add PostgreSQL**.
3. Setelah dibuat, buka plugin Postgres → tab **Variables** → salin nilai `DATABASE_URL`
   (atau nanti tinggal di-*reference* otomatis, lihat langkah 2 di bawah).

## 2. Deploy Backend ke Railway

1. Masih di project yang sama, klik **+ New → GitHub Repo** (upload folder `backend/` ini ke
   repo GitHub Anda terlebih dahulu), **atau** gunakan Railway CLI:
   ```bash
   cd backend
   npm install
   railway init
   railway up
   ```
2. Di service backend tersebut, buka tab **Variables** dan isi:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | klik "Add Reference" → pilih Postgres → `DATABASE_URL` (otomatis) |
   | `JWT_SECRET` | string acak panjang, misal hasil `openssl rand -hex 32` |
   | `GOOGLE_CLIENT_ID` | Client ID dari Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | Client Secret dari Google Cloud Console |
   | `ADMIN_EMAILS` | email Gmail Anda, mis. `lamzy103@gmail.com` (boleh lebih dari satu, pisah koma) |
   | `CORS_ORIGIN` | `https://upclaselam.vercel.app` (domain Vercel Anda; boleh tambah lokal juga, pisah koma) |
3. Pastikan **Root Directory** service ini diarahkan ke folder `backend` (Settings → Root Directory).
4. Setelah deploy selesai, Railway memberi URL publik, contoh:
   `https://upclaselam-backend-production.up.railway.app`
   Simpan URL ini — dipakai di langkah 4.
5. Cek server hidup: buka `https://<url-railway-anda>/health` → harus muncul `{"ok":true,...}`.

> Catatan penyimpanan foto QRIS: file diupload ke folder `backend/uploads` di server.
> Disk Railway bersifat *ephemeral* pada beberapa plan — kalau Anda ingin foto QRIS permanen
> walau redeploy, tambahkan **Railway Volume** dan mount ke path `/app/uploads` (Settings → Volumes).

## 3. Setup Google OAuth (Client ID & Secret Anda)

1. Buka [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Pilih OAuth Client ID (Web application) yang sudah Anda punya, lalu tambahkan ke
   **Authorized JavaScript origins**:
   - `https://upclaselam.vercel.app`
   - `http://localhost:5500` (opsional, untuk tes lokal)
3. Client ID **tidak perlu** Authorized redirect URI karena kita pakai Google Identity Services
   (Sign In With Google) mode `credential`, bukan redirect flow.
4. Client ID → dipakai di `frontend/config.js` (boleh publik).
   Client Secret → **hanya** diisi di Railway env `GOOGLE_CLIENT_SECRET` (dipakai server saat
   verifikasi token; saat ini backend memverifikasi id_token langsung via `GOOGLE_CLIENT_ID`
   sehingga secret disiapkan untuk kebutuhan lanjutan seperti refresh token bila diperlukan).

## 4. Deploy Frontend ke Vercel

1. Edit `frontend/config.js`:
   ```js
   window.APP_CONFIG = {
     API_BASE_URL: "https://<url-railway-anda>",   // dari langkah 2.4
     GOOGLE_CLIENT_ID: "xxxxxxxx.apps.googleusercontent.com",
   };
   ```
2. Upload folder `frontend/` ke GitHub repo (boleh repo sama atau terpisah dari backend).
3. Buka [vercel.com](https://vercel.com) → New Project → Import repo tsb.
   - **Root Directory**: `frontend`
   - **Framework Preset**: Other / Static
   - Tidak perlu Build Command (langsung static HTML), Output Directory: `.`
4. Set domain project ke `upclaselam` sehingga URL menjadi `https://upclaselam.vercel.app`
   (Project Settings → Domains), sesuai yang Anda pakai.
5. Deploy. Buka `https://upclaselam.vercel.app` — aplikasi sudah live & terhubung ke backend.

## 5. Jadikan diri Anda Admin

- Pastikan email Gmail Anda sudah ada di env `ADMIN_EMAILS` (langkah 2.2).
- Login di aplikasi pakai email tersebut (Google atau Email/Password) → tombol **⚡ Admin**
  otomatis muncul di header, dan Anda bisa:
  - Upload foto QRIS pembayaran (tersimpan di database `app_settings`, tampil real-time ke semua user)
  - Grant/cabut paket VIP (Basic/Standar/Pro Max) untuk email manapun
  - Melihat statistik total user, total login, dan riwayat login terbaru — **update otomatis
    secara real-time** (Socket.IO) tanpa perlu refresh halaman.

## 6. Menjalankan di lokal (opsional, untuk development)

```bash
# Backend
cd backend
cp .env.example .env      # lalu isi DATABASE_URL (boleh Postgres lokal / Railway), JWT_SECRET, dst
npm install
npm start                 # server jalan di http://localhost:4000

# Frontend
cd ../frontend
# edit config.js -> API_BASE_URL: "http://localhost:4000"
# buka index.html langsung di browser, atau jalankan static server ringan:
npx serve .
```

---

## Struktur Proyek

```
upclaselam/
├── backend/
│   ├── server.js            # entrypoint Express + Socket.IO
│   ├── db/index.js          # koneksi PostgreSQL + auto-migration tabel
│   ├── helpers.js           # logika status user/VIP/limit
│   ├── middleware/auth.js   # JWT auth guard + admin guard
│   ├── routes/auth.js       # register, login, login Google, /me
│   ├── routes/user.js       # status kuota user, catat export HD
│   ├── routes/admin.js      # grant/cabut VIP, upload QRIS, statistik
│   ├── routes/settings.js   # endpoint publik ambil QRIS aktif
│   ├── package.json
│   ├── railway.json / Procfile
│   └── .env.example
├── frontend/
│   ├── index.html           # UI UpclaseLam (sudah tersambung ke backend)
│   ├── config.js            # API_BASE_URL & GOOGLE_CLIENT_ID (edit sebelum deploy)
│   └── vercel.json
└── README.md                 # file ini
```

## Ringkasan API Backend

| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/api/auth/register` | Daftar akun email/password |
| POST | `/api/auth/login` | Login email/password |
| POST | `/api/auth/google` | Login via Google Identity Services (`credential`) |
| GET | `/api/auth/me` | Info user + status dari token JWT aktif |
| GET | `/api/user/status` | Role, paket, sisa limit, max limit |
| POST | `/api/user/export` | Catat & potong limit setelah simpan hasil HD |
| GET | `/api/settings/qris` | (publik) URL foto QRIS aktif |
| GET | `/api/admin/stats` | (admin) total user & total login |
| GET | `/api/admin/login-history` | (admin) 50 riwayat login terbaru |
| GET | `/api/admin/vip-users` | (admin) daftar user VIP aktif |
| POST | `/api/admin/vip/grant` | (admin) aktifkan/perpanjang VIP user |
| POST | `/api/admin/vip/revoke` | (admin) cabut VIP user |
| POST | `/api/admin/qris` | (admin) upload foto QRIS baru (multipart) |

Semua endpoint `admin` & endpoint yang butuh login mengharuskan header:
`Authorization: Bearer <token>` (token didapat dari respons login/register/google).

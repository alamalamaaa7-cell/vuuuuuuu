// ================================================
// KONFIGURASI FRONTEND UpclaseLam
// Edit dua nilai di bawah ini SEBELUM deploy ke Vercel.
// File ini aman untuk berisi nilai publik (Client ID Google memang publik,
// BUKAN client secret - client secret hanya boleh ada di backend/.env).
// ================================================
window.APP_CONFIG = {
  // Ganti dengan URL backend Railway Anda setelah deploy, contoh:
  // "https://upclaselam-backend-production.up.railway.app"
  API_BASE_URL: "https://ISI_URL_BACKEND_RAILWAY_ANDA.up.railway.app",

  // Google OAuth Client ID (dari Google Cloud Console -> Credentials -> OAuth Client ID)
  // Tambahkan domain frontend Anda (https://upclaselam.vercel.app) ke
  // "Authorized JavaScript origins" pada konfigurasi OAuth Client tersebut.
  GOOGLE_CLIENT_ID: "ISI_GOOGLE_CLIENT_ID_ANDA.apps.googleusercontent.com",
};

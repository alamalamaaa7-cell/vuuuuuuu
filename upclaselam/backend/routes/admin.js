const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { PACKAGE_LIMITS } = require('../helpers');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, 'qris-' + Date.now() + path.extname(file.originalname || '.png')),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('File harus berupa gambar.'));
    cb(null, true);
  },
});

router.use(requireAuth, requireAdmin);

// ---- Statistik ringkas ----
router.get('/stats', async (req, res) => {
  const totalUsers = await query('SELECT COUNT(*)::int AS c FROM users');
  const totalLogins = await query('SELECT COUNT(*)::int AS c FROM login_history');
  const totalVip = await query('SELECT COUNT(*)::int AS c FROM vip_subscriptions WHERE expires_at > NOW()');
  res.json({
    totalUsers: totalUsers.rows[0].c,
    totalLogins: totalLogins.rows[0].c,
    totalVipActive: totalVip.rows[0].c,
  });
});

// ---- Riwayat login terbaru (khusus admin) ----
router.get('/login-history', async (req, res) => {
  const { rows } = await query(
    'SELECT email, method, created_at FROM login_history ORDER BY created_at DESC LIMIT 50'
  );
  res.json({ history: rows });
});

// ---- Daftar user VIP aktif ----
router.get('/vip-users', async (req, res) => {
  const { rows } = await query(
    `SELECT user_email AS email, package, expires_at, days
     FROM vip_subscriptions ORDER BY expires_at DESC`
  );
  const withDaysLeft = rows.map((r) => ({
    ...r,
    daysLeft: Math.max(0, Math.ceil((new Date(r.expires_at) - Date.now()) / (24 * 60 * 60 * 1000))),
  }));
  res.json({ users: withDaysLeft });
});

// ---- Grant / update VIP untuk user tertentu ----
router.post('/vip/grant', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const pkg = req.body.package;
    const days = parseInt(req.body.days, 10) || 30;
    if (!email || !PACKAGE_LIMITS[pkg]) {
      return res.status(400).json({ error: 'Email dan paket (basic/standar/promax) wajib diisi dengan benar.' });
    }

    // Pastikan user sudah pernah terdaftar (dibuat otomatis jika belum ada, supaya admin bisa
    // menyiapkan VIP untuk email yang belum pernah login sekalipun)
    await query(
      `INSERT INTO users (email, auth_provider) VALUES ($1, 'pending')
       ON CONFLICT (email) DO NOTHING`,
      [email]
    );

    await query(
      `INSERT INTO vip_subscriptions (user_email, package, days, expires_at, granted_by)
       VALUES ($1, $2, $3, NOW() + ($3 || ' days')::interval, $4)
       ON CONFLICT (user_email)
       DO UPDATE SET package = $2, days = $3, expires_at = NOW() + ($3 || ' days')::interval, granted_by = $4`,
      [email, pkg, days, req.user.email]
    );

    const io = req.app.get('io');
    if (io) io.to('admin-room').emit('vip:updated', { email, package: pkg, days });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengaktifkan VIP.' });
  }
});

// ---- Cabut VIP ----
router.post('/vip/revoke', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  await query('DELETE FROM vip_subscriptions WHERE user_email = $1', [email]);
  const io = req.app.get('io');
  if (io) io.to('admin-room').emit('vip:revoked', { email });
  res.json({ ok: true });
});

// ---- Upload foto QRIS pembayaran ----
router.post('/qris', upload.single('qris'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File QRIS tidak ditemukan.' });
  const publicUrl = `/uploads/${req.file.filename}`;
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('qris_image_url', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [publicUrl]
  );
  const io = req.app.get('io');
  if (io) io.emit('qris:updated', { url: publicUrl });
  res.json({ ok: true, url: publicUrl });
});

module.exports = router;

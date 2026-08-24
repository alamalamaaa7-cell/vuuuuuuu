const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { query } = require('../db');
const { isAdminEmail, getUserStatus } = require('../helpers');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signToken(user) {
  return jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

async function recordLogin(io, email, method, ip) {
  await query('INSERT INTO login_history (email, method, ip_address) VALUES ($1, $2, $3)', [email, method, ip]);
  if (io) {
    const { rows } = await query('SELECT COUNT(*)::int AS total FROM login_history');
    io.to('admin-room').emit('login:new', {
      email,
      method,
      time: new Date().toISOString(),
      totalLogins: rows[0].total,
    });
  }
}

// ---------- REGISTER (Email / Password) ----------
router.post('/register', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Email wajib valid dan password minimal 6 karakter.' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Email sudah terdaftar. Silakan login.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const role = isAdminEmail(email) ? 'admin' : 'user';
    await query(
      'INSERT INTO users (email, password_hash, auth_provider, role, free_reset_at) VALUES ($1,$2,$3,$4, NOW() + INTERVAL \'5 days\')',
      [email, hash, 'email', role]
    );

    const token = signToken({ email, role });
    await recordLogin(req.app.get('io'), email, 'Email/Password (Daftar)', req.ip);
    const status = await getUserStatus(email);
    res.json({ token, user: { email, role }, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mendaftar akun, coba lagi.' });
  }
});

// ---------- LOGIN (Email / Password) ----------
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email dan password wajib diisi.' });

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Akun belum terdaftar atau login menggunakan metode Google.' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Password salah.' });

    const role = isAdminEmail(email) ? 'admin' : user.role;
    if (role !== user.role) await query('UPDATE users SET role = $1 WHERE email = $2', [role, email]);

    const token = signToken({ email, role });
    await recordLogin(req.app.get('io'), email, 'Email/Password', req.ip);
    const status = await getUserStatus(email);
    res.json({ token, user: { email, role }, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal login, coba lagi.' });
  }
});

// ---------- LOGIN dengan Google (Google Identity Services credential / id_token) ----------
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Token Google tidak ditemukan.' });
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: 'Server belum dikonfigurasi GOOGLE_CLIENT_ID.' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email || !payload.email_verified) {
      return res.status(401).json({ error: 'Akun Google tidak valid atau email belum terverifikasi.' });
    }

    const role = isAdminEmail(email) ? 'admin' : 'user';
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (!existing.rows.length) {
      await query(
        `INSERT INTO users (email, auth_provider, google_sub, role, free_reset_at)
         VALUES ($1, 'google', $2, $3, NOW() + INTERVAL '5 days')`,
        [email, payload.sub, role]
      );
    } else {
      await query('UPDATE users SET google_sub = $1, role = $2 WHERE email = $3', [payload.sub, role, email]);
    }

    const token = signToken({ email, role });
    await recordLogin(req.app.get('io'), email, 'Google', req.ip);
    const status = await getUserStatus(email);
    res.json({ token, user: { email, role, name: payload.name, picture: payload.picture }, status });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Verifikasi login Google gagal. Pastikan Client ID sudah benar.' });
  }
});

// ---------- Info user yang sedang login ----------
router.get('/me', requireAuth, async (req, res) => {
  const status = await getUserStatus(req.user.email);
  res.json({ user: req.user, status });
});

module.exports = router;

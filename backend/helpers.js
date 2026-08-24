const { query } = require('./db');

const FREE_LIMIT_QUOTA = 50;
const FREE_RESET_DAYS = 5;
const FREE_RESET_MS = FREE_RESET_DAYS * 24 * 60 * 60 * 1000;

const PACKAGE_LIMITS = { basic: 50, standar: 150, promax: 999 };

function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAILS || 'lamzy103@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(String(email || '').toLowerCase());
}

function signToken(jwt, user) {
  return jwt.sign(
    { email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// Ambil / reset kuota gratis user (mengganti fungsi applyFreeLimitReset di versi lama)
async function ensureFreeLimit(email) {
  const now = new Date();
  const { rows } = await query('SELECT free_limit, free_reset_at FROM users WHERE email = $1', [email]);
  if (!rows.length) return { limit: FREE_LIMIT_QUOTA, resetAt: new Date(now.getTime() + FREE_RESET_MS) };

  let { free_limit: limit, free_reset_at: resetAt } = rows[0];
  if (!resetAt || now >= new Date(resetAt)) {
    limit = FREE_LIMIT_QUOTA;
    resetAt = new Date(now.getTime() + FREE_RESET_MS);
    await query('UPDATE users SET free_limit = $1, free_reset_at = $2 WHERE email = $3', [limit, resetAt, email]);
  }
  return { limit, resetAt };
}

// Menghitung status lengkap user: role, paket vip aktif (jika ada), sisa limit, max limit
async function getUserStatus(email) {
  const admin = isAdminEmail(email);
  if (admin) {
    return { email, role: 'admin', package: 'admin', limit: 999, maxLimit: 999, expiresAt: null, daysLeft: null };
  }

  const vipRes = await query('SELECT * FROM vip_subscriptions WHERE user_email = $1', [email]);
  const vip = vipRes.rows[0];

  if (vip && new Date(vip.expires_at) > new Date()) {
    const max = PACKAGE_LIMITS[vip.package] ?? 50;
    return {
      email,
      role: 'user',
      package: vip.package,
      limit: max,
      maxLimit: max,
      expiresAt: vip.expires_at,
      daysLeft: Math.max(0, Math.ceil((new Date(vip.expires_at) - Date.now()) / (24 * 60 * 60 * 1000))),
    };
  }

  // VIP kedaluwarsa -> bersihkan otomatis
  if (vip) {
    await query('DELETE FROM vip_subscriptions WHERE user_email = $1', [email]);
  }

  const { limit, resetAt } = await ensureFreeLimit(email);
  return {
    email,
    role: 'user',
    package: 'free',
    limit,
    maxLimit: FREE_LIMIT_QUOTA,
    expiresAt: null,
    daysLeft: Math.max(1, Math.ceil((new Date(resetAt) - Date.now()) / (24 * 60 * 60 * 1000))),
  };
}

async function deductLimit(email, amount) {
  const admin = isAdminEmail(email);
  if (admin) return; // admin unlimited

  const vipRes = await query('SELECT * FROM vip_subscriptions WHERE user_email = $1', [email]);
  const vip = vipRes.rows[0];
  if (vip && new Date(vip.expires_at) > new Date()) {
    // Paket VIP saat ini tidak membatasi limit riil (ditampilkan max saja),
    // tapi tetap dicatat di export_history untuk laporan admin.
    return;
  }

  await ensureFreeLimit(email);
  await query(
    'UPDATE users SET free_limit = GREATEST(0, free_limit - $1) WHERE email = $2',
    [amount, email]
  );
}

module.exports = {
  FREE_LIMIT_QUOTA,
  FREE_RESET_DAYS,
  PACKAGE_LIMITS,
  isAdminEmail,
  signToken,
  ensureFreeLimit,
  getUserStatus,
  deductLimit,
};


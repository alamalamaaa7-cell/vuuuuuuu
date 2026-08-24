
// ================================================
// Koneksi PostgreSQL (real database, bukan localStorage lagi)
// Bekerja dengan Railway PostgreSQL plugin lewat env DATABASE_URL.
// ================================================
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[DB] ERROR: environment variable DATABASE_URL belum diisi. ' +
    'Tambahkan PostgreSQL plugin di Railway (atau isi .env lokal) lalu set DATABASE_URL.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
});

async function query(text, params) {
  return pool.query(text, params);
}

// Membuat semua tabel jika belum ada (auto migration sederhana saat server start)
async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      auth_provider TEXT NOT NULL DEFAULT 'email',
      google_sub    TEXT,
      role          TEXT NOT NULL DEFAULT 'user',
      free_limit    INTEGER NOT NULL DEFAULT 50,
      free_reset_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS vip_subscriptions (
      id          SERIAL PRIMARY KEY,
      user_email  TEXT UNIQUE NOT NULL REFERENCES users(email) ON DELETE CASCADE,
      package     TEXT NOT NULL,
      days        INTEGER NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      granted_by  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS login_history (
      id          SERIAL PRIMARY KEY,
      email       TEXT NOT NULL,
      method      TEXT NOT NULL,
      ip_address  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS export_history (
      id          SERIAL PRIMARY KEY,
      email       TEXT NOT NULL,
      media_type  TEXT NOT NULL,
      resolution  TEXT NOT NULL,
      cost        INTEGER NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  console.log('[DB] Schema siap (tabel users, vip_subscriptions, login_history, export_history, app_settings).');
}

module.exports = { query, pool, initSchema };

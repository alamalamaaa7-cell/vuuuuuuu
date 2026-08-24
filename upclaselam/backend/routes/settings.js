const express = require('express');
const { query } = require('../db');

const router = express.Router();

const DEFAULT_QRIS_URL = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=UpclaseLam-VIP-Payment-QRIS';

// Endpoint publik supaya halaman checkout siapa saja bisa menampilkan QRIS terbaru
router.get('/qris', async (req, res) => {
  const { rows } = await query("SELECT value FROM app_settings WHERE key = 'qris_image_url'");
  res.json({ url: rows[0]?.value || DEFAULT_QRIS_URL });
});

module.exports = router;

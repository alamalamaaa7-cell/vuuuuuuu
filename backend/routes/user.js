const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getUserStatus, deductLimit } = require('../helpers');

const router = express.Router();

const RESOLUTION_COST = { '720p': 5, '1080p': 20, '2k': 35, '4k': 50 };

// Status lengkap: role, paket, sisa limit, max limit, sisa hari
router.get('/status', requireAuth, async (req, res) => {
  const status = await getUserStatus(req.user.email);
  res.json({ status });
});

// Dipanggil setelah user berhasil "Simpan Hasil HD" di UI, supaya limit
// terpotong dan tercatat real-time di server (bukan hanya localStorage).
router.post('/export', requireAuth, async (req, res) => {
  try {
    const mediaType = req.body.mediaType === 'video' ? 'video' : 'photo';
    const resolution = ['720p', '1080p', '2k', '4k'].includes(req.body.resolution) ? req.body.resolution : '720p';
    const cost = RESOLUTION_COST[resolution];

    const before = await getUserStatus(req.user.email);
    if (before.role !== 'admin' && before.limit < cost) {
      return res.status(400).json({ error: 'Limit tidak cukup untuk resolusi ini.', status: before });
    }

    await deductLimit(req.user.email, cost);
    await query(
      'INSERT INTO export_history (email, media_type, resolution, cost) VALUES ($1,$2,$3,$4)',
      [req.user.email, mediaType, resolution, cost]
    );

    const io = req.app.get('io');
    if (io) io.to('admin-room').emit('export:new', { email: req.user.email, mediaType, resolution, cost, time: new Date().toISOString() });

    const status = await getUserStatus(req.user.email);
    res.json({ ok: true, cost, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mencatat hasil export.' });
  }
});

module.exports = router;

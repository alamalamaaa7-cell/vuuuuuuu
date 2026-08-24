require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const { initSchema } = require('./db');
const { isAdminEmail } = require('./helpers');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const settingsRoutes = require('./routes/settings');

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'public')));

const io = new Server(server, { cors: corsOptions });
app.set('io', io);

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (token) {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload;
    }
  } catch (err) {}
  next();
});

io.on('connection', (socket) => {
  if (socket.user && (socket.user.role === 'admin' || isAdminEmail(socket.user.email))) {
    socket.join('admin-room');
  }
  socket.on('disconnect', () => {});
});

app.get('/api/status', (req, res) => {
  res.json({ ok: true, name: 'UpclaseLam API', status: 'running' });
});
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Terjadi kesalahan pada server.' });
});

const PORT = process.env.PORT || 4000;

initSchema()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`[UpclaseLam API] Berjalan di port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[DB] Gagal inisialisasi schema:', err);
    process.exit(1);
  });

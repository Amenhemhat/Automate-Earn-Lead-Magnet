require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { Pool } = require('pg');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── PostgreSQL ──────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ── Storage paths ───────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PDF_DIR  = path.join(DATA_DIR, 'pdfs');
const IMG_DIR  = path.join(DATA_DIR, 'images');
[PDF_DIR, IMG_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── Middleware ──────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ae-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ── Share with routes ───────────────────────────────────────────
app.locals.pool    = pool;
app.locals.PDF_DIR = PDF_DIR;
app.locals.IMG_DIR = IMG_DIR;

// ── Routes ──────────────────────────────────────────────────────
app.use('/',        require('./routes/store'));
app.use('/download',require('./routes/download'));
app.use('/admin',   require('./routes/admin'));

// ── Serve uploaded images ───────────────────────────────────────
app.get('/uploads/images/:file', (req, res) => {
  const file = path.join(IMG_DIR, req.params.file);
  if (!fs.existsSync(file)) return res.status(404).send('Not found');
  res.sendFile(file);
});

// ── Init DB ─────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id           SERIAL PRIMARY KEY,
      title        VARCHAR(255) NOT NULL,
      description  TEXT,
      filename     VARCHAR(255) NOT NULL,
      cover_image  VARCHAR(255),
      active       BOOLEAN DEFAULT true,
      order_index  INT DEFAULT 0,
      created_at   TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leads (
      id             SERIAL PRIMARY KEY,
      name           VARCHAR(255) NOT NULL,
      email          VARCHAR(255) NOT NULL,
      product_id     INT REFERENCES products(id),
      product_title  VARCHAR(255),
      downloaded_at  TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ Database ready');
}

initDB()
  .then(() => app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });

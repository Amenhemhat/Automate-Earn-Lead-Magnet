const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ── Multer storage ──────────────────────────────────────────────
function getStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = file.fieldname === 'pdf'
        ? req.app.locals.PDF_DIR
        : req.app.locals.IMG_DIR;
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      cb(null, safe);
    }
  });
}

const upload = multer({ storage: multer.diskStorage({}) }); // placeholder, real storage set per-request

// ── Auth middleware ─────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.adminLoggedIn) return next();
  res.redirect('/admin/login');
}

// ── Login ───────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.adminLoggedIn = true;
    return res.redirect('/admin');
  }
  res.render('login', { error: 'Incorrect password' });
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ── Dashboard ───────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows: leads } = await pool.query(
      'SELECT l.*, p.title as product_title FROM leads l LEFT JOIN products p ON l.product_id = p.id ORDER BY l.downloaded_at DESC'
    );
    const { rows: products } = await pool.query(
      'SELECT * FROM products ORDER BY order_index ASC, created_at DESC'
    );
    const { rows: stats } = await pool.query(
      'SELECT COUNT(*) as total_leads, COUNT(DISTINCT email) as unique_emails FROM leads'
    );
    res.render('admin', { leads, products, stats: stats[0], message: req.query.message || null });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ── Export CSV ──────────────────────────────────────────────────
router.get('/export', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(
      'SELECT l.name, l.email, l.product_title, l.downloaded_at FROM leads l ORDER BY l.downloaded_at DESC'
    );

    const headers = ['Name', 'Email', 'Product', 'Downloaded At'];
    const csvRows = rows.map(r => [
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${(r.email || '').replace(/"/g, '""')}"`,
      `"${(r.product_title || '').replace(/"/g, '""')}"`,
      `"${new Date(r.downloaded_at).toISOString()}"`
    ].join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error exporting CSV');
  }
});

// ── Add product ─────────────────────────────────────────────────
router.post('/products/add', requireAuth, (req, res) => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = file.fieldname === 'pdf'
        ? req.app.locals.PDF_DIR
        : req.app.locals.IMG_DIR;
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      cb(null, safe);
    }
  });
  const up = multer({ storage }).fields([
    { name: 'pdf', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
  ]);

  up(req, res, async (err) => {
    if (err) return res.redirect('/admin?message=Upload+error:+' + err.message);
    const pool = req.app.locals.pool;
    const { title, description, order_index } = req.body;
    const pdfFile   = req.files?.pdf?.[0];
    const coverFile = req.files?.cover?.[0];

    if (!title || !pdfFile) {
      return res.redirect('/admin?message=Title+and+PDF+are+required');
    }

    try {
      await pool.query(
        'INSERT INTO products (title, description, filename, cover_image, order_index) VALUES ($1, $2, $3, $4, $5)',
        [title.trim(), description?.trim() || '', pdfFile.filename, coverFile?.filename || null, parseInt(order_index) || 0]
      );
      res.redirect('/admin?message=Product+added+successfully');
    } catch (err) {
      console.error(err);
      res.redirect('/admin?message=Database+error');
    }
  });
});

// ── Toggle active ───────────────────────────────────────────────
router.post('/products/:id/toggle', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    await pool.query('UPDATE products SET active = NOT active WHERE id = $1', [req.params.id]);
    res.redirect('/admin?message=Product+updated');
  } catch (err) {
    res.redirect('/admin?message=Error+updating+product');
  }
});

// ── Delete product ──────────────────────────────────────────────
router.post('/products/:id/delete', requireAuth, async (req, res) => {
  const pool    = req.app.locals.pool;
  const PDF_DIR = req.app.locals.PDF_DIR;
  const IMG_DIR = req.app.locals.IMG_DIR;
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (rows.length) {
      const p = rows[0];
      const pdfPath = path.join(PDF_DIR, p.filename);
      const imgPath = p.cover_image ? path.join(IMG_DIR, p.cover_image) : null;
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      if (imgPath && fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      await pool.query('DELETE FROM leads WHERE product_id = $1', [req.params.id]);
      await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    }
    res.redirect('/admin?message=Product+deleted');
  } catch (err) {
    console.error(err);
    res.redirect('/admin?message=Error+deleting+product');
  }
});

module.exports = router;

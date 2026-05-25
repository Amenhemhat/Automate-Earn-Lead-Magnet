const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// POST /download — save lead + stream PDF
// product_id comes from the form body (hidden input)
router.post('/', async (req, res) => {
  const pool    = req.app.locals.pool;
  const PDF_DIR = req.app.locals.PDF_DIR;
  const { name, email, product_id } = req.body;
  const productId = parseInt(product_id);

  // Basic validation
  if (!name || !name.trim()) {
    return renderError(res, pool, 'Name is required.');
  }
  if (!email || !email.trim() || !email.includes('@')) {
    return renderError(res, pool, 'A valid email address is required.');
  }
  if (!productId || isNaN(productId)) {
    return renderError(res, pool, 'Invalid product selection.');
  }

  try {
    // Get product
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND active = true',
      [productId]
    );
    if (!rows.length) return renderError(res, pool, 'Resource not found.');
    const product = rows[0];

    // Save lead
    await pool.query(
      'INSERT INTO leads (name, email, product_id, product_title) VALUES ($1, $2, $3, $4)',
      [name.trim(), email.trim().toLowerCase(), product.id, product.title]
    );

    // Stream the PDF directly to the browser
    const filePath = path.join(PDF_DIR, product.filename);
    if (!fs.existsSync(filePath)) {
      return renderError(res, pool, 'PDF file not found on server. Please contact support.');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${product.filename}"`);
    fs.createReadStream(filePath).pipe(res);

  } catch (err) {
    console.error('Download error:', err);
    return renderError(res, pool, 'A server error occurred. Please try again.');
  }
});

// Also keep /:id route for backward compatibility
router.post('/:id', async (req, res) => {
  req.body.product_id = req.params.id;
  const pool    = req.app.locals.pool;
  const PDF_DIR = req.app.locals.PDF_DIR;
  const { name, email, product_id } = req.body;
  const productId = parseInt(product_id);

  if (!name || !name.trim()) return renderError(res, pool, 'Name is required.');
  if (!email || !email.trim() || !email.includes('@')) return renderError(res, pool, 'A valid email address is required.');

  try {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND active = true', [productId]
    );
    if (!rows.length) return renderError(res, pool, 'Resource not found.');
    const product = rows[0];

    await pool.query(
      'INSERT INTO leads (name, email, product_id, product_title) VALUES ($1, $2, $3, $4)',
      [name.trim(), email.trim().toLowerCase(), product.id, product.title]
    );

    const filePath = path.join(PDF_DIR, product.filename);
    if (!fs.existsSync(filePath)) return renderError(res, pool, 'File not found on server.');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${product.filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    return renderError(res, pool, 'A server error occurred.');
  }
});

// Helper: fetch products and render the index with an error message
async function renderError(res, pool, errorMsg) {
  try {
    const { rows: products } = await pool.query(
      'SELECT * FROM products WHERE active = true ORDER BY order_index ASC, created_at DESC'
    );
    return res.status(400).render('index', { products, success: false, error: errorMsg });
  } catch (err) {
    return res.status(500).send('Server error');
  }
}

module.exports = router;

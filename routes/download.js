const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// POST /download/:id — save lead + stream PDF
router.post('/:id', async (req, res) => {
  const pool    = req.app.locals.pool;
  const PDF_DIR = req.app.locals.PDF_DIR;
  const { name, email } = req.body;
  const productId = parseInt(req.params.id);

  // Basic validation
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!email || !email.trim() || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    // Get product
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1 AND active = true', [productId]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    const product = rows[0];

    // Save lead
    await pool.query(
      'INSERT INTO leads (name, email, product_id, product_title) VALUES ($1, $2, $3, $4)',
      [name.trim(), email.trim().toLowerCase(), product.id, product.title]
    );

    // Check file exists
    const filePath = path.join(PDF_DIR, product.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Stream the PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${product.filename}"`);
    fs.createReadStream(filePath).pipe(res);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

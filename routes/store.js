const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows: products } = await pool.query(
      'SELECT * FROM products WHERE active = true ORDER BY order_index ASC, created_at DESC'
    );
    res.render('index', { products });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;

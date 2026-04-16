const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/categories
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all();
  res.json(rows);
});

// POST /api/categories
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'カテゴリ名は必須です' });
  try {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM categories').get().m || 0;
    const result = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)').run(name, maxOrder + 1);
    res.status(201).json({ id: result.lastInsertRowid, name, sort_order: maxOrder + 1 });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: '同名のカテゴリが既に存在します' });
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', (req, res) => {
  db.prepare('UPDATE todos SET category_id = NULL WHERE category_id = ?').run(req.params.id);
  const result = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// PUT /api/categories/reorder
router.put('/reorder', (req, res) => {
  const { order } = req.body; // array of ids in new order
  const update = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
  const tx = db.transaction(() => {
    order.forEach((id, index) => update.run(index, id));
  });
  tx();
  res.json({ ok: true });
});

module.exports = router;

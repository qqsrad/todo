const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/todos/meta/parties
router.get('/meta/parties', (req, res) => {
  const requesters = db.prepare(`
    SELECT DISTINCT requester
    FROM todos
    WHERE requester IS NOT NULL AND TRIM(requester) != ''
    ORDER BY requester COLLATE NOCASE ASC
  `).all().map((row) => row.requester);

  const assignees = db.prepare(`
    SELECT DISTINCT assignee
    FROM todos
    WHERE assignee IS NOT NULL AND TRIM(assignee) != ''
    ORDER BY assignee COLLATE NOCASE ASC
  `).all().map((row) => row.assignee);

  res.json({ requesters, assignees });
});

// GET /api/todos
router.get('/', (req, res) => {
  const {
    completion, // 'incomplete' | 'done' | 'all'
    keyword,
    include_memo,
    categories,   // comma-separated ids
    sources,      // comma-separated
    priorities,   // comma-separated
    statuses,     // comma-separated
    deadline_preset,
    deadline_from,
    deadline_to,
    sort_col,
    sort_dir,
  } = req.query;

  let where = ['t.priority != -1'];
  const params = [];

  // 完了フィルタ
  if (!completion || completion === 'incomplete') {
    where.push(`t.status != 'done'`);
  } else if (completion === 'done') {
    where.push(`t.status = 'done'`);
  }

  // キーワード検索
  if (keyword) {
    if (include_memo === '1') {
      where.push(`(t.title LIKE ? OR c.name LIKE ? OR t.requester LIKE ? OR t.assignee LIKE ? OR t.memo LIKE ?)`);
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    } else {
      where.push(`(t.title LIKE ? OR c.name LIKE ? OR t.requester LIKE ? OR t.assignee LIKE ?)`);
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
  }

  // カテゴリフィルタ
  if (categories) {
    const ids = categories.split(',').map(Number).filter(Boolean);
    if (ids.length > 0) {
      where.push(`t.category_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
  }

  // ソースフィルタ
  if (sources) {
    const list = sources.split(',').filter(Boolean);
    if (list.length > 0) {
      where.push(`t.source IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
  }

  // 優先度フィルタ
  if (priorities) {
    const list = priorities.split(',').map(Number);
    if (list.length > 0) {
      where.push(`t.priority IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
  }

  // ステータスフィルタ
  if (statuses) {
    const list = statuses.split(',').filter(Boolean);
    if (list.length > 0) {
      where.push(`t.status IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
  }

  // 期限プリセットフィルタ
  if (deadline_preset) {
    const today = new Date();
    const toYMD = d => d.toISOString().split('T')[0];
    let from = null, to = null;
    const d = new Date(today);
    switch (deadline_preset) {
      case 'today':
        to = toYMD(today); break;
      case '3days':
        d.setDate(d.getDate() + 3); to = toYMD(d); break;
      case '7days':
        d.setDate(d.getDate() + 7); to = toYMD(d); break;
      case '2weeks':
        d.setDate(d.getDate() + 14); to = toYMD(d); break;
      case '1month':
        d.setMonth(d.getMonth() + 1); to = toYMD(d); break;
    }
    if (to) {
      where.push(`t.deadline_date IS NOT NULL AND t.deadline_date <= ?`);
      params.push(to);
    }
  }

  // 期限日付範囲
  if (deadline_from) {
    where.push(`t.deadline_date >= ?`);
    params.push(deadline_from);
  }
  if (deadline_to) {
    where.push(`t.deadline_date <= ?`);
    params.push(deadline_to);
  }

  // ソート
  const SORT_COLS = {
    title: 't.title',
    deadline: 't.deadline_date',
    source: 't.source',
    requester: 't.requester',
    assignee: 't.assignee',
    category: 'c.name',
    priority: 't.priority',
    status: 't.status',
    created_at: 't.created_at',
  };
  const col = SORT_COLS[sort_col] || 't.deadline_date';
  const dir = sort_dir === 'desc' ? 'DESC' : 'ASC';

  const sql = `
    SELECT t.*, c.name as category_name
    FROM todos t
    LEFT JOIN categories c ON t.category_id = c.id
    ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY
      CASE WHEN t.deadline_date IS NULL THEN 1 ELSE 0 END,
      ${col} ${dir},
      t.priority DESC
  `;

  try {
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/todos/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT t.*, c.name as category_name
    FROM todos t LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST /api/todos
router.post('/', (req, res) => {
  const {
    title, deadline_date, deadline_time, deadline_time_type,
    source, requester, assignee, memo, category_id, priority, status
  } = req.body;

  if (!title) return res.status(400).json({ error: 'タイトルは必須です' });

  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO todos (title, deadline_date, deadline_time, deadline_time_type,
      source, requester, assignee, memo, category_id, priority, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title,
    deadline_date || null,
    deadline_time || null,
    deadline_time_type || 'none',
    source || null,
    requester || null,
    assignee || null,
    memo || null,
    category_id || null,
    priority ?? 1,
    status || 'todo',
    now, now
  );

  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

// PUT /api/todos/:id
router.put('/:id', (req, res) => {
  const {
    title, deadline_date, deadline_time, deadline_time_type,
    source, requester, assignee, memo, category_id, priority, status
  } = req.body;

  if (!title) return res.status(400).json({ error: 'タイトルは必須です' });

  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE todos SET
      title = ?, deadline_date = ?, deadline_time = ?, deadline_time_type = ?,
      source = ?, requester = ?, assignee = ?, memo = ?, category_id = ?, priority = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(
    title,
    deadline_date || null,
    deadline_time || null,
    deadline_time_type || 'none',
    source || null,
    requester || null,
    assignee || null,
    memo || null,
    category_id || null,
    priority ?? 1,
    status || 'todo',
    now,
    req.params.id
  );

  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  res.json(row);
});

// PATCH /api/todos/:id/status
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const now = new Date().toISOString();
  const result = db.prepare(`UPDATE todos SET status = ?, updated_at = ? WHERE id = ?`)
    .run(status, now, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ id: req.params.id, status });
});

// PATCH /api/todos/:id/field  - inline edit
router.patch('/:id/field', (req, res) => {
  const { field, value } = req.body;
  const ALLOWED = ['title', 'deadline_date', 'deadline_time', 'deadline_time_type', 'source', 'requester', 'assignee', 'category_id', 'priority', 'status'];
  if (!ALLOWED.includes(field)) return res.status(400).json({ error: 'Invalid field' });
  if (field === 'title' && !String(value || '').trim()) {
    return res.status(400).json({ error: 'タイトルは必須です' });
  }
  const now = new Date().toISOString();
  db.prepare(`UPDATE todos SET ${field} = ?, updated_at = ? WHERE id = ?`).run(value ?? null, now, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/todos/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;

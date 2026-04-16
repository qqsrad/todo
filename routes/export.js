const express = require('express');
const router = express.Router();
const db = require('../db');

const PRIORITY_LABELS = { '-1': '非表示', '0': '低優先', '1': '普通', '2': '重要', '3': '超重要' };
const STATUS_LABELS = {
  undecided: '未決定', todo: '未着手', in_progress: '着手済み',
  requested: '依頼中', almost: 'あと少し', done: '完了', hold: '保留'
};

function escape(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

router.get('/csv', (req, res) => {
  const { scope, completion, keyword, include_memo, categories, sources, priorities, statuses, deadline_from, deadline_to, deadline_preset } = req.query;

  let rows;
  if (scope === 'filtered') {
    // 現在の表示条件でフィルタ
    let where = ['t.priority != -1'];
    const params = [];

    if (!completion || completion === 'incomplete') where.push(`t.status != 'done'`);
    else if (completion === 'done') where.push(`t.status = 'done'`);

    if (keyword) {
      if (include_memo === '1') {
        where.push(`(t.title LIKE ? OR c.name LIKE ? OR t.requester LIKE ? OR t.assignee LIKE ? OR t.memo LIKE ?)`);
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      } else {
        where.push(`(t.title LIKE ? OR c.name LIKE ? OR t.requester LIKE ? OR t.assignee LIKE ?)`);
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
    }
    if (categories) { const ids = categories.split(',').map(Number).filter(Boolean); if (ids.length) { where.push(`t.category_id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); } }
    if (sources) { const list = sources.split(',').filter(Boolean); if (list.length) { where.push(`t.source IN (${list.map(() => '?').join(',')})`); params.push(...list); } }
    if (priorities) { const list = priorities.split(',').map(Number); if (list.length) { where.push(`t.priority IN (${list.map(() => '?').join(',')})`); params.push(...list); } }
    if (statuses) { const list = statuses.split(',').filter(Boolean); if (list.length) { where.push(`t.status IN (${list.map(() => '?').join(',')})`); params.push(...list); } }
    if (deadline_from) { where.push(`t.deadline_date >= ?`); params.push(deadline_from); }
    if (deadline_to) { where.push(`t.deadline_date <= ?`); params.push(deadline_to); }

    rows = db.prepare(`
      SELECT t.*, c.name as category_name FROM todos t
      LEFT JOIN categories c ON t.category_id = c.id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY t.deadline_date ASC
    `).all(...params);
  } else {
    rows = db.prepare(`
      SELECT t.*, c.name as category_name FROM todos t
      LEFT JOIN categories c ON t.category_id = c.id
      ORDER BY t.deadline_date ASC
    `).all();
  }

  const BOM = '\uFEFF';
  const header = ['ID','タイトル','締め切り日','締め切り時刻','ソース','振出人','依頼先','カテゴリ','優先度(数値)','優先度','ステータス(値)','ステータス','メモ','登録日時','最終更新日時'];
  const lines = [header.map(escape).join(',')];

  for (const r of rows) {
    lines.push([
      r.id, r.title, r.deadline_date || '', r.deadline_time || '',
      r.source || '', r.requester || '', r.assignee || '', r.category_name || '',
      r.priority, PRIORITY_LABELS[String(r.priority)] || '',
      r.status, STATUS_LABELS[r.status] || '',
      r.memo || '', r.created_at, r.updated_at
    ].map(escape).join(','));
  }

  const csv = BOM + lines.join('\r\n');
  const filename = `todos_${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

module.exports = router;

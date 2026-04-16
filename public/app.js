// ===== STATE =====
let state = {
  todos: [],
  categories: [],
  requesters: [],
  assignees: [],
  completion: 'incomplete',
  sortCol: 'deadline',
  sortDir: 'asc',
  groupMode: 'none',
  collapsedGroups: new Set(),
  editId: null,
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  await loadCategories();
  buildFilterPanels();
  await loadLastTimeType();
  await loadPartyOptions();
  updateEditDateDisplay();
  reload();
});

async function loadLastTimeType() {
  try {
    const r = await apiFetch('/api/settings/last_time_type');
    if (r.value) document.getElementById('fTimeType').value = r.value;
    onTimeTypeChange();
  } catch {}
}

async function loadCategories() {
  state.categories = await apiFetch('/api/categories');
  populateCategorySelects();
}

async function loadPartyOptions() {
  try {
    const data = await apiFetch('/api/todos/meta/parties');
    state.requesters = data.requesters || [];
    state.assignees = data.assignees || [];
    populatePartyDatalists();
  } catch {
    state.requesters = [];
    state.assignees = [];
    populatePartyDatalists();
  }
}

function populateCategorySelects() {
  // フィルタ
  const fc = document.getElementById('filterCategories');
  const prev = [...fc.selectedOptions].map(o => o.value);
  fc.innerHTML = state.categories.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
  prev.forEach(v => { const o = fc.querySelector(`option[value="${v}"]`); if (o) o.selected = true; });

  // フォーム
  const fcat = document.getElementById('fCategory');
  const prevVal = fcat.value;
  fcat.innerHTML = '<option value="">（未分類）</option>' +
    state.categories.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
  fcat.value = prevVal;
}

function populatePartyDatalists() {
  const requesterList = document.getElementById('requesterOptions');
  const assigneeList = document.getElementById('assigneeOptions');
  requesterList.innerHTML = state.requesters.map((name) => `<option value="${escHtml(name)}"></option>`).join('');
  assigneeList.innerHTML = state.assignees.map((name) => `<option value="${escHtml(name)}"></option>`).join('');
}

function buildFilterPanels() {
  // ソース
  const srcDiv = document.getElementById('filterSources');
  SOURCES.forEach(s => {
    srcDiv.innerHTML += `<label class="filter-check"><input type="checkbox" name="fsrc" value="${s}" onchange="reload()"> ${escHtml(s)}</label>`;
  });

  // 優先度
  const prioDiv = document.getElementById('filterPriorities');
  [[0,'低優先'],[1,'普通'],[2,'重要'],[3,'超重要']].forEach(([v,l]) => {
    prioDiv.innerHTML += `<label class="filter-check"><input type="checkbox" name="fprio" value="${v}" onchange="reload()"> ${l}</label>`;
  });

  // ステータス
  const statDiv = document.getElementById('filterStatuses');
  Object.entries(STATUS_LABELS).forEach(([v,l]) => {
    statDiv.innerHTML += `<label class="filter-check"><input type="checkbox" name="fstat" value="${v}" onchange="reload()"> ${l}</label>`;
  });
}

// ===== LOAD / RENDER =====
async function reload() {
  const params = buildQueryParams();
  try {
    state.todos = await apiFetch('/api/todos?' + params.toString());
  } catch (e) {
    alert('読み込みエラー: ' + e.message);
    return;
  }
  document.getElementById('countInfo').textContent = `${state.todos.length}件`;
  renderTable();
}

function buildQueryParams() {
  const p = new URLSearchParams();
  p.set('completion', state.completion);
  p.set('sort_col', state.sortCol);
  p.set('sort_dir', state.sortDir);

  const kw = document.getElementById('keyword').value.trim();
  if (kw) p.set('keyword', kw);
  if (document.getElementById('includeMemo').checked) p.set('include_memo', '1');

  const cats = [...document.getElementById('filterCategories').selectedOptions].map(o => o.value);
  if (cats.length) p.set('categories', cats.join(','));

  const srcs = [...document.querySelectorAll('[name=fsrc]:checked')].map(e => e.value);
  if (srcs.length) p.set('sources', srcs.join(','));

  const prios = [...document.querySelectorAll('[name=fprio]:checked')].map(e => e.value);
  if (prios.length) p.set('priorities', prios.join(','));

  const stats = [...document.querySelectorAll('[name=fstat]:checked')].map(e => e.value);
  if (stats.length) p.set('statuses', stats.join(','));

  const dpreset = document.getElementById('filterDeadlinePreset').value;
  if (dpreset) p.set('deadline_preset', dpreset);
  const dfrom = document.getElementById('filterFrom').value;
  if (dfrom) p.set('deadline_from', dfrom);
  const dto = document.getElementById('filterTo').value;
  if (dto) p.set('deadline_to', dto);

  return p;
}

function renderTable() {
  const tbody = document.getElementById('todoBody');
  tbody.innerHTML = '';
  const mode = document.getElementById('groupMode').value;
  state.groupMode = mode;

  if (state.todos.length === 0) {
    document.getElementById('emptyMsg').style.display = 'block';
    return;
  }
  document.getElementById('emptyMsg').style.display = 'none';

  if (mode === 'none') {
    state.todos.forEach(t => tbody.appendChild(makeTodoRow(t)));
  } else if (mode === 'priority') {
    renderGrouped(groupByPriority(state.todos));
  } else if (mode === 'deadline') {
    renderGrouped(groupByDeadline(state.todos));
  }
}

function renderGrouped(groups) {
  const tbody = document.getElementById('todoBody');
  groups.forEach(({ label, key, items }) => {
    const collapsed = state.collapsedGroups.has(key);
    // group header
    const htr = document.createElement('tr');
    htr.className = 'group-header' + (collapsed ? ' collapsed' : '');
    htr.innerHTML = `<td colspan="11"><span class="toggle-icon"></span>${escHtml(label)}（${items.length}件）</td>`;
    htr.addEventListener('click', () => {
      if (state.collapsedGroups.has(key)) state.collapsedGroups.delete(key);
      else state.collapsedGroups.add(key);
      htr.classList.toggle('collapsed');
      rows.forEach(r => r.style.display = state.collapsedGroups.has(key) ? 'none' : '');
    });
    tbody.appendChild(htr);

    const rows = items.map(t => {
      const tr = makeTodoRow(t);
      if (collapsed) tr.style.display = 'none';
      tbody.appendChild(tr);
      return tr;
    });
  });
}

function groupByPriority(todos) {
  const order = [3, 2, 1, 0];
  const map = {};
  todos.forEach(t => {
    const p = t.priority;
    if (!map[p]) map[p] = [];
    map[p].push(t);
  });
  // 各グループ内は期限順
  Object.values(map).forEach(arr => arr.sort((a, b) => {
    if (!a.deadline_date && !b.deadline_date) return 0;
    if (!a.deadline_date) return 1;
    if (!b.deadline_date) return -1;
    return a.deadline_date.localeCompare(b.deadline_date);
  }));
  return order.filter(p => map[p]).map(p => ({
    label: PRIORITY_LABELS[p] || p,
    key: 'prio_' + p,
    items: map[p]
  }));
}

function groupByDeadline(todos) {
  const now = new Date(); now.setHours(0,0,0,0);
  const addDays = n => { const d = new Date(now); d.setDate(d.getDate()+n); return d; };
  const groups = [
    { label: '⚠ 期限超過', key: 'dl_overdue', items: [] },
    { label: '📌 今日中',   key: 'dl_today',   items: [] },
    { label: '🔥 3日以内',  key: 'dl_3d',      items: [] },
    { label: '📅 7日以内',  key: 'dl_7d',      items: [] },
    { label: '📆 2週間以内',key: 'dl_2w',      items: [] },
    { label: '🗓 1ヶ月以内',key: 'dl_1m',      items: [] },
    { label: '📋 それ以上', key: 'dl_more',    items: [] },
    { label: '⬜ 期限なし', key: 'dl_none',    items: [] },
  ];
  todos.forEach(t => {
    if (!t.deadline_date) { groups[7].items.push(t); return; }
    const d = new Date(t.deadline_date + 'T00:00:00');
    if (d < now) groups[0].items.push(t);
    else if (+d === +now) groups[1].items.push(t);
    else if (d <= addDays(3)) groups[2].items.push(t);
    else if (d <= addDays(7)) groups[3].items.push(t);
    else if (d <= addDays(14)) groups[4].items.push(t);
    else if (d <= addDays(30)) groups[5].items.push(t);
    else groups[6].items.push(t);
  });
  // 各グループ内は優先度降順
  groups.forEach(g => g.items.sort((a,b) => b.priority - a.priority));
  return groups.filter(g => g.items.length > 0);
}

function makeTodoRow(todo) {
  const tr = document.createElement('tr');
  const isDone = todo.status === 'done';
  const ds = deadlineStatus(todo.deadline_date);

  // 行クラス
  const classes = [];
  if (isDone) classes.push('done-row');
  else if (ds) classes.push(ds);
  if (!isDone && todo.priority >= 0) classes.push('prio-' + todo.priority);
  tr.className = classes.join(' ');
  tr.dataset.id = todo.id;

  // 完了ボタン
  const tdComplete = document.createElement('td');
  tdComplete.style.textAlign = 'center';
  const cbtn = document.createElement('button');
  cbtn.className = 'complete-btn' + (isDone ? ' done' : '');
  cbtn.title = isDone ? 'クリックで未着手に戻す' : 'クリックで完了';
  cbtn.addEventListener('click', e => { e.stopPropagation(); toggleDone(todo); });
  tdComplete.appendChild(cbtn);

  // タイトル（インライン編集）
  const tdTitle = document.createElement('td');
  tdTitle.className = 'title-cell editable';
  tdTitle.textContent = todo.title;
  tdTitle.addEventListener('click', () => startInlineEdit(tdTitle, todo, 'title', { required: true }));

  // 締め切り（インライン編集）
  const tdDeadline = document.createElement('td');
  tdDeadline.className = 'deadline-cell editable';
  tdDeadline.textContent = fmtDeadline(todo);
  tdDeadline.addEventListener('click', () => startInlineDateEdit(tdDeadline, todo));

  // ソース
  const tdSource = makeSelectCell(todo, 'source', todo.source || '—',
    ['', ...SOURCES], [('（なし）'), ...SOURCES]);

  // 振出人
  const tdRequester = document.createElement('td');
  tdRequester.className = 'editable';
  tdRequester.textContent = todo.requester || '—';
  tdRequester.addEventListener('click', () => startInlineEdit(tdRequester, todo, 'requester'));

  // 依頼先
  const tdAssignee = document.createElement('td');
  tdAssignee.className = 'editable';
  tdAssignee.textContent = todo.assignee || '—';
  tdAssignee.addEventListener('click', () => startInlineEdit(tdAssignee, todo, 'assignee'));

  // カテゴリ
  const catName = todo.category_name || '—';
  const tdCat = document.createElement('td');
  tdCat.className = 'editable';
  tdCat.textContent = catName;
  tdCat.addEventListener('click', () => startInlineCatEdit(tdCat, todo));

  // 優先度
  const tdPrio = makeSelectCell(todo, 'priority', PRIORITY_LABELS[todo.priority] || todo.priority,
    ['-1','0','1','2','3'], ['-1','0','1','2','3'].map(v => PRIORITY_LABELS[v]));

  // ステータス
  const tdStatus = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `badge badge-${todo.status}`;
  badge.textContent = STATUS_LABELS[todo.status] || todo.status;
  tdStatus.appendChild(badge);
  tdStatus.className = 'editable';
  tdStatus.addEventListener('click', () => startInlineStatusEdit(tdStatus, todo));

  // 登録日時
  const tdCreated = document.createElement('td');
  tdCreated.textContent = fmtDateTime(todo.created_at);
  tdCreated.style.fontSize = '11px';
  tdCreated.style.color = 'var(--text-muted)';

  // 操作
  const tdAction = document.createElement('td');
  tdAction.className = 'action-cell';
  tdAction.innerHTML = `
    <button class="icon-btn" title="編集" onclick="openEdit(${todo.id})">✏️</button>
    <button class="icon-btn del" title="削除" onclick="confirmDelete(${todo.id})">🗑</button>
  `;

  tr.append(tdComplete, tdTitle, tdDeadline, tdSource, tdRequester, tdAssignee, tdCat, tdPrio, tdStatus, tdCreated, tdAction);
  return tr;
}

function makeSelectCell(todo, field, displayText, values, labels) {
  const td = document.createElement('td');
  td.className = 'editable';
  td.textContent = displayText;
  td.addEventListener('click', () => {
    const sel = document.createElement('select');
    sel.className = 'inline-select';
    values.forEach((v, i) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = labels[i];
      if (String(todo[field]) === String(v)) o.selected = true;
      sel.appendChild(o);
    });
    td.textContent = '';
    td.appendChild(sel);
    sel.focus();
    const save = async () => {
      const val = field === 'priority' ? parseInt(sel.value) : sel.value;
      await apiFetch(`/api/todos/${todo.id}/field`, { method: 'PATCH', body: JSON.stringify({ field, value: val || null }) });
      reload();
    };
    sel.addEventListener('change', save);
    sel.addEventListener('blur', () => { setTimeout(reload, 100); });
  });
  return td;
}

async function startInlineEdit(td, todo, field, options = {}) {
  const { required = false } = options;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-input';
  input.value = todo[field] || '';
  td.textContent = '';
  td.appendChild(input);
  input.focus();
  input.select();

  const save = async () => {
    const value = input.value.trim();
    if (required && value === '') { reload(); return; }
    await apiFetch(`/api/todos/${todo.id}/field`, { method: 'PATCH', body: JSON.stringify({ field, value: value || null }) });
    reload();
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') reload(); });
  input.addEventListener('blur', () => setTimeout(save, 100));
}

async function startInlineDateEdit(td, todo) {
  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'inline-input';
  input.value = todo.deadline_date || '';
  td.textContent = '';
  td.appendChild(input);
  input.focus();

  const save = async () => {
    await apiFetch(`/api/todos/${todo.id}/field`, { method: 'PATCH', body: JSON.stringify({ field: 'deadline_date', value: input.value || null }) });
    reload();
  };
  input.addEventListener('change', save);
  input.addEventListener('blur', () => setTimeout(reload, 100));
}

async function startInlineCatEdit(td, todo) {
  const sel = document.createElement('select');
  sel.className = 'inline-select';
  sel.innerHTML = '<option value="">（未分類）</option>' +
    state.categories.map(c => `<option value="${c.id}" ${todo.category_id === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('');
  td.textContent = '';
  td.appendChild(sel);
  sel.focus();
  const save = async () => {
    await apiFetch(`/api/todos/${todo.id}/field`, { method: 'PATCH', body: JSON.stringify({ field: 'category_id', value: sel.value || null }) });
    reload();
  };
  sel.addEventListener('change', save);
  sel.addEventListener('blur', () => setTimeout(reload, 100));
}

async function startInlineStatusEdit(td, todo) {
  const sel = document.createElement('select');
  sel.className = 'inline-select';
  sel.innerHTML = Object.entries(STATUS_LABELS).map(([v,l]) =>
    `<option value="${v}" ${todo.status === v ? 'selected' : ''}>${l}</option>`).join('');
  td.textContent = '';
  td.appendChild(sel);
  sel.focus();
  const save = async () => {
    await apiFetch(`/api/todos/${todo.id}/field`, { method: 'PATCH', body: JSON.stringify({ field: 'status', value: sel.value }) });
    reload();
  };
  sel.addEventListener('change', save);
  sel.addEventListener('blur', () => setTimeout(reload, 100));
}

// ===== COMPLETE TOGGLE =====
async function toggleDone(todo) {
  const newStatus = todo.status === 'done' ? 'todo' : 'done';
  await apiFetch(`/api/todos/${todo.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
  reload();
}

// ===== SORT =====
function setSort(col) {
  if (state.sortCol === col) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortCol = col;
    state.sortDir = 'asc';
  }
  // ヘッダー更新
  document.querySelectorAll('thead th').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.col === col) th.classList.add('sorted-' + state.sortDir);
  });
  reload();
}

// ===== COMPLETION FILTER =====
function setCompletion(btn) {
  document.querySelectorAll('.completion-filter .btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.completion = btn.dataset.completion;
  reload();
}

// ===== FILTER PANEL =====
function toggleFilter() {
  document.getElementById('filterPanel').classList.toggle('open');
}
function clearFilters() {
  document.getElementById('filterCategories').querySelectorAll('option').forEach(o => o.selected = false);
  document.querySelectorAll('[name=fsrc],[name=fprio],[name=fstat]').forEach(e => e.checked = false);
  document.getElementById('filterDeadlinePreset').value = '';
  document.getElementById('filterFrom').value = '';
  document.getElementById('filterTo').value = '';
  reload();
}

// ===== EDIT MODAL =====
async function openEdit(id) {
  state.editId = id || null;
  document.getElementById('editTitle').textContent = id ? 'Todo編集' : '新規Todo';
  document.getElementById('deleteBtn').style.display = id ? 'inline-block' : 'none';

  // カテゴリ更新
  await loadCategories();
  await loadPartyOptions();

  if (id) {
    const todo = await apiFetch(`/api/todos/${id}`);
    document.getElementById('fTitle').value = todo.title;
    document.getElementById('fDate').value = todo.deadline_date || '';
    document.getElementById('fTimeType').value = todo.deadline_time_type || 'none';
    document.getElementById('fTime').value = todo.deadline_time || '';
    document.getElementById('fSource').value = todo.source || '';
    document.getElementById('fRequester').value = todo.requester || '';
    document.getElementById('fAssignee').value = todo.assignee || '';
    document.getElementById('fCategory').value = todo.category_id || '';
    document.getElementById('fPriority').value = todo.priority;
    document.getElementById('fStatus').value = todo.status;
    document.getElementById('fMemo').value = todo.memo || '';
  } else {
    document.getElementById('fTitle').value = '';
    document.getElementById('fDate').value = '';
    document.getElementById('fSource').value = '';
    document.getElementById('fRequester').value = '';
    document.getElementById('fAssignee').value = '';
    document.getElementById('fCategory').value = '';
    document.getElementById('fPriority').value = '1';
    document.getElementById('fStatus').value = 'todo';
    document.getElementById('fMemo').value = '';
  }

  closeDateEditor();
  onTimeTypeChange();
  updateEditDateDisplay();
  updatePreview();
  setMdTab('preview');

  document.getElementById('editModal').classList.add('open');
  document.getElementById('fTitle').focus();
}

function closeEdit() {
  document.getElementById('editModal').classList.remove('open');
}

async function saveTodo() {
  const title = document.getElementById('fTitle').value.trim();
  if (!title) { alert('タイトルは必須です'); return; }

  const timeType = document.getElementById('fTimeType').value;
  let time = null;
  if (timeType === 'start') time = '08:50';
  else if (timeType === 'end') time = '17:20';
  else if (timeType === 'eod') time = '23:59';
  else if (timeType === 'custom') time = document.getElementById('fTime').value || null;

  // 設定を保存
  await apiFetch('/api/settings/last_time_type', { method: 'PUT', body: JSON.stringify({ value: timeType }) });

  const body = {
    title,
    deadline_date: document.getElementById('fDate').value || null,
    deadline_time: time,
    deadline_time_type: timeType,
    source: document.getElementById('fSource').value || null,
    requester: document.getElementById('fRequester').value.trim() || null,
    assignee: document.getElementById('fAssignee').value.trim() || null,
    category_id: document.getElementById('fCategory').value || null,
    priority: parseInt(document.getElementById('fPriority').value),
    status: document.getElementById('fStatus').value,
    memo: document.getElementById('fMemo').value || null,
  };

  try {
    if (state.editId) {
      await apiFetch(`/api/todos/${state.editId}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await apiFetch('/api/todos', { method: 'POST', body: JSON.stringify(body) });
    }
    await loadPartyOptions();
    closeEdit();
    reload();
  } catch (e) {
    alert('保存エラー: ' + e.message);
  }
}

async function deleteTodo() {
  if (!confirm('このTodoを削除しますか？')) return;
  await apiFetch(`/api/todos/${state.editId}`, { method: 'DELETE' });
  closeEdit();
  reload();
}

async function confirmDelete(id) {
  if (!confirm('このTodoを削除しますか？')) return;
  await apiFetch(`/api/todos/${id}`, { method: 'DELETE' });
  reload();
}

// ===== PRESET =====
function applyPreset(preset) {
  if (!preset) {
    document.getElementById('fDate').value = '';
    updateEditDateDisplay();
    closeDateEditor();
    return;
  }
  const date = presetToDate(preset);
  if (date) document.getElementById('fDate').value = date;
  if (preset === 'today') {
    document.getElementById('fTimeType').value = 'end';
    onTimeTypeChange();
  }
  updateEditDateDisplay();
  closeDateEditor();
}

// ===== TIME TYPE =====
function onTimeTypeChange() {
  const t = document.getElementById('fTimeType').value;
  document.getElementById('fTime').style.display = t === 'custom' ? 'inline-block' : 'none';
}

function updateEditDateDisplay() {
  const value = document.getElementById('fDate').value;
  const display = document.getElementById('fDateDisplay');
  display.textContent = value ? formatDateWithWeekday(value) : '未設定';
}

function openDateEditor(openPicker = false) {
  const editor = document.getElementById('fDateEditor');
  const display = document.getElementById('fDateDisplay');
  const inputWrap = document.getElementById('fDateInputWrap');
  display.hidden = true;
  inputWrap.hidden = false;
  editor.hidden = false;
  const input = document.getElementById('fDate');
  input.focus();
  if (openPicker) {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    }
  }
}

function closeDateEditor() {
  document.getElementById('fDateDisplay').hidden = false;
  document.getElementById('fDateInputWrap').hidden = true;
  document.getElementById('fDateEditor').hidden = true;
}

function commitDateInput() {
  updateEditDateDisplay();
  closeDateEditor();
}

// ===== MARKDOWN =====
function setMdTab(tab) {
  document.querySelectorAll('.md-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.md-tab[data-md-tab="${tab}"]`).classList.add('active');
  const textarea = document.getElementById('fMemo');
  const preview = document.getElementById('mdPreview');

  if (tab === 'preview') {
    updatePreview();
    textarea.style.display = 'none';
    preview.classList.add('visible');
  } else {
    textarea.style.display = '';
    preview.classList.remove('visible');
  }
}

function switchMdTab(tab) {
  setMdTab(tab);
}

function updatePreview() {
  const md = document.getElementById('fMemo').value;
  document.getElementById('mdPreview').innerHTML = marked.parse(md || '');
}

// ===== CATEGORY MODAL =====
let dragSrcCat = null;

async function openCategories() {
  await loadCategories();
  renderCatList();
  document.getElementById('catModal').classList.add('open');
}

function closeCategories() {
  document.getElementById('catModal').classList.remove('open');
  loadCategories();
  reload();
}

function renderCatList() {
  const ul = document.getElementById('catList');
  ul.innerHTML = '';
  state.categories.forEach(cat => {
    const li = document.createElement('li');
    li.className = 'cat-item';
    li.draggable = true;
    li.dataset.id = cat.id;
    li.innerHTML = `
      <span class="cat-drag-handle">⠿</span>
      <span class="cat-name">${escHtml(cat.name)}</span>
      <button class="cat-del" onclick="deleteCategory(${cat.id})" title="削除">✕</button>
    `;
    li.addEventListener('dragstart', e => { dragSrcCat = li; li.style.opacity = '0.4'; });
    li.addEventListener('dragend', () => { li.style.opacity = ''; document.querySelectorAll('.cat-item').forEach(i => i.classList.remove('drag-over')); });
    li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('drag-over'); });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', async e => {
      e.preventDefault();
      li.classList.remove('drag-over');
      if (dragSrcCat === li) return;
      const items = [...ul.querySelectorAll('.cat-item')];
      const srcIdx = items.indexOf(dragSrcCat);
      const dstIdx = items.indexOf(li);
      if (srcIdx < dstIdx) ul.insertBefore(dragSrcCat, li.nextSibling);
      else ul.insertBefore(dragSrcCat, li);
      const order = [...ul.querySelectorAll('.cat-item')].map(i => parseInt(i.dataset.id));
      await apiFetch('/api/categories/reorder', { method: 'PUT', body: JSON.stringify({ order }) });
      state.categories = await apiFetch('/api/categories');
    });
    ul.appendChild(li);
  });
}

async function addCategory() {
  const name = document.getElementById('newCatName').value.trim();
  if (!name) return;
  try {
    await apiFetch('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
    document.getElementById('newCatName').value = '';
    state.categories = await apiFetch('/api/categories');
    renderCatList();
    populateCategorySelects();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteCategory(id) {
  if (!confirm('カテゴリを削除しますか？\nこのカテゴリを持つTodoは未分類になります。')) return;
  await apiFetch(`/api/categories/${id}`, { method: 'DELETE' });
  state.categories = await apiFetch('/api/categories');
  renderCatList();
  populateCategorySelects();
}

// ===== CSV EXPORT =====
function exportCsv() {
  document.getElementById('exportModal').classList.add('open');
}

function doExport(scope) {
  const params = buildQueryParams();
  params.set('scope', scope);
  window.location.href = '/api/export/csv?' + params.toString();
  document.getElementById('exportModal').classList.remove('open');
}

// ===== UTILS =====
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let reloadTimer;
function debouncedReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(reload, 250);
}

// モーダル外クリックで閉じる
document.addEventListener('click', e => {
  ['editModal','catModal','exportModal'].forEach(id => {
    const m = document.getElementById(id);
    if (e.target === m) m.classList.remove('open');
  });
});

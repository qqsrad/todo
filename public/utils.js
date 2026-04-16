// 定数
const PRIORITY_LABELS = { '-1': '非表示', '0': '低優先', '1': '普通', '2': '重要', '3': '超重要' };
const STATUS_LABELS = {
  undecided: '未決定', todo: '未着手', in_progress: '着手済み',
  requested: '依頼中', almost: 'あと少し', done: '完了', hold: '保留'
};
const SOURCES = ['メール', 'チャット', 'Teams', '口頭', 'その他'];
const TIME_TYPES = [
  { value: 'none',   label: '指定なし',  time: null },
  { value: 'start',  label: '始業',      time: '08:50' },
  { value: 'custom', label: '時刻指定',  time: null },
  { value: 'end',    label: '定時内',    time: '17:20' },
  { value: 'eod',    label: 'EoD',       time: '23:59' },
];
const JST_TIMEZONE = 'Asia/Tokyo';
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

function toYMD(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function today() { return new Date(); }

function parseYmdToDate(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatWeekdayJst(dateStr) {
  const date = parseYmdToDate(dateStr);
  if (!date) return '';
  return WEEKDAYS_JA[date.getDay()];
}

function formatDateWithWeekday(dateStr) {
  if (!dateStr) return '';
  const weekday = formatWeekdayJst(dateStr);
  return `${dateStr.replace(/-/g, '/')} (${weekday})`;
}

// プリセット → 日付
function presetToDate(preset) {
  const d = new Date();
  switch (preset) {
    case 'today':   return toYMD(d);
    case 'thisweek': {
      const day = d.getDay(); // 0=Sun
      const diff = day <= 5 ? 5 - day : 0;
      d.setDate(d.getDate() + diff);
      return toYMD(d);
    }
    case 'nextweek': {
      const day = d.getDay();
      const toSun = day === 0 ? 7 : 7 - day;
      d.setDate(d.getDate() + toSun + 7);
      return toYMD(d);
    }
    case 'thismonth': {
      return toYMD(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    }
    case 'thisq': {
      // 4月始まり Q1:4-6, Q2:7-9, Q3:10-12, Q4:1-3
      const month = d.getMonth() + 1; // 1-12
      let qEndMonth;
      if (month >= 4 && month <= 6) qEndMonth = 6;
      else if (month >= 7 && month <= 9) qEndMonth = 9;
      else if (month >= 10 && month <= 12) qEndMonth = 12;
      else qEndMonth = 3; // 1-3
      const year = qEndMonth === 3 ? d.getFullYear() : d.getFullYear();
      return toYMD(new Date(year + (qEndMonth < month ? 1 : 0), qEndMonth, 0));
    }
    case 'thisterm': {
      const month = d.getMonth() + 1;
      // 上期: 4-9 → 9/30, 下期: 10-3 → 3/31
      if (month >= 4 && month <= 9) {
        return toYMD(new Date(d.getFullYear(), 9, 0)); // Sep 30
      } else {
        const year = month >= 10 ? d.getFullYear() + 1 : d.getFullYear();
        return toYMD(new Date(year, 3, 0)); // Mar 31
      }
    }
    case 'thisyear': {
      const month = d.getMonth() + 1;
      const year = month >= 4 ? d.getFullYear() + 1 : d.getFullYear();
      return toYMD(new Date(year, 3, 0)); // Mar 31
    }
    default: return null;
  }
}

// 日付 → プリセットラベル（逆変換）
function dateToPresetLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(); t.setHours(0,0,0,0);

  const diffDays = Math.floor((d - t) / 86400000);

  if (diffDays < 0) return dateStr.replace(/-/g, '/'); // 期限超過
  if (toYMD(d) === toYMD(t)) return '今日中';

  // 今週中（金曜）
  const thisFri = new Date(t);
  const day = t.getDay();
  thisFri.setDate(t.getDate() + (day <= 5 ? 5 - day : 0));
  if (d <= thisFri) return '今週中';

  // 来週中
  const thisSun = new Date(t); thisSun.setDate(t.getDate() + (t.getDay() === 0 ? 0 : 7 - t.getDay()));
  const nextSun = new Date(thisSun); nextSun.setDate(thisSun.getDate() + 7);
  if (d <= nextSun) return '来週中';

  // 今月中
  const monthEnd = new Date(t.getFullYear(), t.getMonth() + 1, 0);
  if (d <= monthEnd) return '今月中';

  // 今Q中
  const qEnd = new Date(presetToDate('thisq') + 'T00:00:00');
  if (d <= qEnd) return '今Q中';

  // 今期中
  const termEnd = new Date(presetToDate('thisterm') + 'T00:00:00');
  if (d <= termEnd) return '今期中';

  // 今年度中
  const yearEnd = new Date(presetToDate('thisyear') + 'T00:00:00');
  if (d <= yearEnd) return '今年度中';

  return dateStr.replace(/-/g, '/');
}

// 期限の状態判定
function deadlineStatus(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(); t.setHours(0,0,0,0);
  const diff = Math.floor((d - t) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 3) return 'soon';
  return null;
}

// 日時フォーマット
function fmtDateTime(iso) {
  if (!iso) return '';
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(iso));
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
}

function fmtDeadline(row) {
  if (!row.deadline_date) return '';
  const timeType = row.deadline_time_type || 'none';
  const dateWithWeekday = formatDateWithWeekday(row.deadline_date);
  const presetLabel = dateToPresetLabel(row.deadline_date);
  const dateLabel = timeType === 'none' && presetLabel !== row.deadline_date.replace(/-/g, '/')
    ? `${presetLabel} ${dateWithWeekday}`
    : dateWithWeekday;
  if (!row.deadline_time || timeType === 'none') return dateLabel;
  const timeLabel = TIME_TYPES.find(t => t.value === timeType)?.label || '';
  return `${dateLabel} ${timeLabel !== '時刻指定' ? timeLabel : ''} ${row.deadline_time}`.trim();
}

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

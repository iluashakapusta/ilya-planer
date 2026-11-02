// Общие помощники: даты, деньги, строки

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const addMonths = (s, n) => { const d = parse(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return iso(d); };
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const weekday = (s) => parse(s).getDay() || 7; // 1 = пн … 7 = вс
export const toMin = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

export const fmtDate = (s, opts = { day: 'numeric', month: 'long' }) => (s ? parse(s).toLocaleDateString('ru-RU', opts) : '');
export const fmtShort = (s) => fmtDate(s, { day: 'numeric', month: 'short' }).replace('.', '');
export const fmtDayLong = (s) => fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtRange = (a, b) => {
  if (!b || a === b) return fmtDate(a);
  const A = parse(a), B = parse(b);
  if (A.getMonth() === B.getMonth() && A.getFullYear() === B.getFullYear()) return `${A.getDate()}–${fmtDate(b)}`;
  return `${fmtDate(a)} – ${fmtDate(b)}`;
};
export const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return cap(new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', ''));
};
export const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

export const rub = (n) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n || 0);
export const sum = (arr, key = 'amount') => arr.reduce((s, x) => s + (Number(x[key]) || 0), 0);

export function plural(n, [one, few, many]) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function untilText(mins) {
  if (mins <= 0) return 'прямо сейчас';
  if (mins < 60) return `через ${mins} мин`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return `через ${h} ч${m ? ` ${m} мин` : ''}`;
  const d = Math.round(h / 24);
  return `через ${d} ${plural(d, ['день', 'дня', 'дней'])}`;
}

export function daysLeftText(date) {
  const d = diffDays(today(), date);
  if (d < 0) return `${-d} ${plural(-d, ['день', 'дня', 'дней'])} назад`;
  if (d === 0) return 'сегодня';
  if (d === 1) return 'завтра';
  if (d === 2) return 'послезавтра';
  return `через ${d} ${plural(d, ['день', 'дня', 'дней'])}`;
}

export const groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] ||= []).push(x); return m; }, {});
export const uniq = (arr) => [...new Set(arr.filter(Boolean))];

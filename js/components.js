// Повторяющиеся кусочки интерфейса
import { esc, rub, fmtShort, monthLabel, daysLeftText } from './utils.js';
import { CAT, AREAS, REPEATS, MEET_TYPES, PAY_METHODS } from './const.js';
import { projectName } from './agenda.js';

export const pageHead = (title, { back, action = '', sub = '' } = {}) => `
  <header class="page-head">
    <div class="page-head-row">${back ? `<a class="back" href="${back}">‹ Назад</a>` : '<span></span>'}${action}</div>
    <h1 class="display">${esc(title)}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ''}
  </header>`;

export const sectionHead = (title, act, data = {}, label = '+ Добавить') => `
  <div class="section-head"><h3>${esc(title)}</h3>${act ? `<button class="link-btn" data-act="${act}" ${Object.entries(data)
    .map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${label}</button>` : ''}</div>`;

export const empty = (icon, text, btn = '') => `<div class="empty"><div class="empty-icon">${icon}</div><p>${text}</p>${btn}</div>`;

export const tile = (label, value, sub = '', cls = '') =>
  `<div class="tile ${cls}"><div class="tile-label">${esc(label)}</div><div class="tile-value">${value}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ''}</div>`;

export function bars(rows, { fmt = rub } = {}) {
  if (!rows.length) return '<p class="muted small">Пока нет данных</p>';
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return `<div class="bars">${rows.map((r) => `
    <div class="bar-row">
      <div class="bar-label"><span>${esc(r.label)}</span><b>${fmt(r.value)}</b></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, (r.value / max) * 100)}%"></div></div>
      ${r.sub ? `<div class="bar-sub">${esc(r.sub)}</div>` : ''}
    </div>`).join('')}</div>`;
}

export function progress(value, max, { over = false } = {}) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return `<div class="progress${over ? ' over' : ''}"><div style="width:${pct}%"></div></div>`;
}

export const monthSwitch = (ym) => `
  <div class="month-switch"><button class="icon-btn" data-act="prevMonth" aria-label="Предыдущий месяц">‹</button>
  <span>${monthLabel(ym)}</span><button class="icon-btn" data-act="nextMonth" aria-label="Следующий месяц">›</button></div>`;

export const chips = (items, active, act) => `<div class="chips">${items
  .map(([v, l]) => `<button class="chip${v === active ? ' on' : ''}" data-act="${act}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;

export function expenseRow(e, { showDate = false } = {}) {
  const c = CAT[e.category] || CAT.other;
  const sub = [showDate ? fmtShort(e.date) : '', c.name, e.method === 'cash' ? PAY_METHODS.cash : ''].filter(Boolean).join(' · ');
  return `<div class="row tap" data-act="editExpense" data-id="${e.id}">
    <div class="row-icon">${c.icon}</div>
    <div class="row-main"><div class="row-title">${esc(e.title || c.name)}</div><div class="row-sub">${esc(sub)}</div>${e.note ? `<div class="row-note">${esc(e.note)}</div>` : ''}</div>
    <div class="row-end"><b>${rub(e.amount)}</b><button class="mini" data-act="repeatExpense" data-id="${e.id}" aria-label="Повторить расход">↻</button></div>
  </div>`;
}

export function agendaRow(it) {
  const check = it.kind === 'task'
    ? `<button class="check" data-act="toggleTask" data-id="${it.id}" aria-label="Готово"></button>`
    : it.kind === 'meet'
      ? `<button class="check${it.done ? ' on' : ''}" data-act="toggleMeet" data-id="${it.id}" aria-label="Прошла"></button>`
      : '';
  return `<a class="row agenda k-${it.kind}${it.done ? ' done' : ''}" href="${it.href}">
    <div class="row-time">${it.time ? esc(it.time) : ''}${it.end ? `<small>${esc(it.end)}</small>` : ''}</div>
    <div class="row-icon">${it.icon}</div>
    <div class="row-main"><div class="row-title">${esc(it.title)}</div>${it.sub ? `<div class="row-sub">${esc(it.sub)}</div>` : ''}</div>
    ${check}
  </a>`;
}

export function taskRow(x, t, { showArea = true } = {}) {
  const subs = x.subtasks || [];
  const subDone = subs.filter((s) => s.done).length;
  const overdue = !x.done && x.due && x.due < t;
  const proj = projectName(x.projectId);
  const meta = [
    x.due ? `<span class="${overdue ? 'danger-text' : ''}">📅 ${x.due === t ? 'сегодня' : overdue ? `${fmtShort(x.due)} · ${daysLeftText(x.due)}` : `${fmtShort(x.due)}`}${x.time ? ` ${esc(x.time)}` : ''}</span>` : '',
    showArea ? `<span>${AREAS[x.area]?.icon || ''} ${AREAS[x.area]?.name || ''}</span>` : '',
    proj ? `<span>📁 ${esc(proj)}</span>` : '',
    subs.length ? `<span>☑︎ ${subDone}/${subs.length}</span>` : '',
    x.repeat && x.repeat !== 'none' ? `<span>↻ ${REPEATS[x.repeat].toLowerCase()}</span>` : '',
  ].filter(Boolean).join('');
  return `<div class="task${x.done ? ' done' : ''} prio-${x.priority || 'mid'}">
    <button class="check${x.done ? ' on' : ''}" data-act="toggleTask" data-id="${x.id}" aria-label="Готово"></button>
    <div class="task-main tap" data-act="editTask" data-id="${x.id}">
      <div class="row-title">${x.priority === 'high' ? '<span class="prio-dot"></span>' : ''}${esc(x.title)}</div>
      <div class="task-meta">${meta}</div>
      ${x.note ? `<div class="row-note">${esc(x.note)}</div>` : ''}
    </div>
    ${subs.length && !x.done ? `<div class="subtasks">${subs.map((s) => `<button class="subtask${s.done ? ' on' : ''}" data-act="sub" data-id="${x.id}" data-sid="${s.id}"><span class="check sm${s.done ? ' on' : ''}"></span>${esc(s.text)}</button>`).join('')}</div>` : ''}
  </div>`;
}

const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

export function meetingRow(m, { showDate = false } = {}) {
  const type = MEET_TYPES[m.type] || MEET_TYPES.meeting;
  const sub = [showDate ? fmtShort(m.date) : '', type.name, m.place, m.people].filter(Boolean).join(' · ');
  return `<div class="row${m.done ? ' done' : ''}">
    <div class="row-time">${m.time ? esc(m.time) : ''}${m.end ? `<small>${esc(m.end)}</small>` : ''}</div>
    <div class="row-icon">${type.icon}</div>
    <div class="row-main tap" data-act="editMeet" data-id="${m.id}"><div class="row-title">${esc(m.title)}</div>${sub ? `<div class="row-sub">${esc(sub)}</div>` : ''}${m.note ? `<div class="row-note">${esc(m.note)}</div>` : ''}</div>
    ${m.link ? `<a class="mini" href="${esc(safeUrl(m.link))}" target="_blank" rel="noopener" aria-label="Ссылка">↗</a>` : ''}
    <button class="check${m.done ? ' on' : ''}" data-act="toggleMeet" data-id="${m.id}" aria-label="Прошла"></button>
  </div>`;
}

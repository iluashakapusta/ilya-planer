// Расписание дня, ближайшие события, регулярные платежи
import { db } from './store.js';
import { today, addDays, toMin, nowMin, pad, rub } from './utils.js';
import { AREAS, MEET_TYPES } from './const.js';

export const projectName = (id) => db.projects.find((p) => p.id === id)?.title || '';

/** Дата платежа в указанном месяце (YYYY-MM) с учётом коротких месяцев */
export function paymentDate(p, ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${pad(Math.min(Number(p.day) || 1, last))}`;
}

export const isPaid = (p, ym) => !!p.paid?.[ym];

/** Неоплаченные платежи в ближайшие n дней (включая просроченные в этом месяце) */
export function paymentsSoon(n = 7) {
  const t = today(), lim = addDays(t, n), ym = t.slice(0, 7);
  const out = [];
  for (const p of db.payments) {
    if (p.active === false) continue;
    for (const m of [ym, addDays(t, n).slice(0, 7)]) {
      const date = paymentDate(p, m);
      if (date <= lim && !isPaid(p, m) && (m === ym || date >= t) && !out.some((o) => o.p === p && o.ym === m)) out.push({ p, ym: m, date });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function agendaFor(date) {
  const items = [];
  for (const m of db.meetings) {
    if (m.date !== date) continue;
    const type = MEET_TYPES[m.type] || MEET_TYPES.meeting;
    items.push({ kind: 'meet', id: m.id, time: m.time || null, end: m.end, title: m.title,
      sub: [type.name, m.place, m.people].filter(Boolean).join(' · '), icon: type.icon, href: '#/work/meetings', done: m.done });
  }
  for (const t of db.tasks) {
    if (t.due === date && !t.done) {
      items.push({ kind: 'task', id: t.id, time: t.time || null, title: t.title,
        sub: [AREAS[t.area]?.name, projectName(t.projectId)].filter(Boolean).join(' · '), icon: AREAS[t.area]?.icon || '☑️', href: t.area === 'work' ? '#/work' : '#/tasks', prio: t.priority });
    }
  }
  for (const p of db.projects) {
    if (p.deadline === date && p.status !== 'done') {
      items.push({ kind: 'deadline', id: p.id, time: null, title: `Дедлайн: ${p.title}`, sub: p.client || 'Проект', icon: '⏳', href: `#/project/${p.id}` });
    }
  }
  const ym = date.slice(0, 7);
  for (const p of db.payments) {
    if (p.active !== false && paymentDate(p, ym) === date) {
      items.push({ kind: 'pay', id: p.id, time: null, title: p.title, sub: `Платёж · ${rub(p.amount)}${isPaid(p, ym) ? ' · оплачено' : ''}`, icon: '🗓', href: '#/money/payments', done: isPaid(p, ym) });
    }
  }
  return items.sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    return a.time ? -1 : b.time ? 1 : 0;
  });
}

/** Ближайшее событие со временем в течение недели */
export function nextEvent() {
  const t = today();
  for (let k = 0; k < 8; k++) {
    const date = addDays(t, k);
    const items = agendaFor(date).filter((i) => i.time && !i.done);
    for (const it of items) {
      const mins = k * 1440 + toMin(it.time) - nowMin();
      if (mins > -15) return { ...it, date, mins };
    }
  }
  return null;
}

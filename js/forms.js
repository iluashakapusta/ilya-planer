// Формы, которые открываются из разных разделов
import { db, commit } from './store.js';
import { formSheet, toast } from './ui.js';
import { uid, today, nowHHMM, addDays, addMonths, fmtDate, weekday, rub, monthLabel } from './utils.js';
import { CATS, AREAS, PRIOS, REPEATS, MEET_TYPES, PROJECT_STATUS, PAY_METHODS } from './const.js';
import { paymentDate } from './agenda.js';

function upsert(list, existing, data) {
  if (existing) Object.assign(existing, data);
  else list.push({ id: uid(), createdAt: new Date().toISOString(), ...data });
}

const remove = (list, item) => () => { list.splice(list.indexOf(item), 1); commit(); };

const projectOptions = (current) => [['', '— без проекта —'], ...db.projects
  .filter((p) => p.status !== 'done' || p.id === current)
  .map((p) => [p.id, p.title])];

/* ---------- Расходы ---------- */
export function openExpense(existing, preset = {}) {
  const v = existing ? { ...existing } : { date: today(), time: nowHHMM(), category: 'groceries', method: 'card', ...preset };
  formSheet({
    title: existing ? 'Расход' : 'Новый расход',
    values: v,
    fields: [
      { name: 'amount', label: 'Сумма, ₽', type: 'money', required: true, half: true },
      { name: 'date', label: 'Дата', type: 'date', required: true, half: true },
      { name: 'category', label: 'Категория', type: 'select', options: CATS.map((c) => [c.id, `${c.icon} ${c.name}`]) },
      { name: 'title', label: 'На что', placeholder: 'Ужин, бензин, подарок маме…' },
      { name: 'method', label: 'Оплата', type: 'seg', options: Object.entries(PAY_METHODS) },
      { name: 'note', label: 'Заметка' },
    ],
    onSubmit: (x) => { upsert(db.expenses, existing, x); commit(); toast(existing ? 'Сохранено' : `Записано: ${rub(x.amount)}`); },
    onDelete: existing ? remove(db.expenses, existing) : null,
  });
}

/* ---------- Регулярные платежи ---------- */
export function openPayment(existing) {
  formSheet({
    title: existing ? 'Платёж' : 'Регулярный платёж',
    values: existing ? { ...existing } : { day: Number(today().slice(8, 10)), category: 'subs', active: true },
    fields: [
      { name: 'title', label: 'Что оплачиваем', required: true, placeholder: 'Аренда, интернет, спортзал…' },
      { name: 'amount', label: 'Сумма, ₽', type: 'money', required: true, half: true },
      { name: 'day', label: 'Число месяца', type: 'number', required: true, half: true, placeholder: '1–31' },
      { name: 'category', label: 'Категория', type: 'select', options: CATS.map((c) => [c.id, `${c.icon} ${c.name}`]) },
      { name: 'active', label: 'Платёж действует', type: 'toggle' },
      { name: 'note', label: 'Заметка', placeholder: 'Счёт, договор, как платить…' },
    ],
    onSubmit: (x) => {
      x.day = Math.min(31, Math.max(1, Math.round(x.day || 1)));
      upsert(db.payments, existing, existing ? x : { ...x, paid: {} });
      commit(); toast(existing ? 'Сохранено' : 'Платёж добавлен');
    },
    onDelete: existing ? remove(db.payments, existing) : null,
  });
}

/** Отметить платёж оплаченным: заодно записывается расход */
export function payPayment(id, ym) {
  const p = db.payments.find((x) => x.id === id);
  if (!p) return;
  p.paid ||= {};
  if (p.paid[ym]) {
    const e = db.expenses.find((x) => x.id === p.paid[ym]);
    if (e && confirm('Снять отметку об оплате? Связанный расход тоже удалится.')) db.expenses.splice(db.expenses.indexOf(e), 1);
    else if (e) return;
    delete p.paid[ym];
    commit();
    return;
  }
  const date = paymentDate(p, ym) > today() ? today() : paymentDate(p, ym);
  const e = { id: uid(), createdAt: new Date().toISOString(), amount: p.amount, date, time: '', category: p.category || 'other', title: p.title, method: 'card', note: `Регулярный платёж · ${monthLabel(ym)}`, paymentId: p.id };
  db.expenses.push(e);
  p.paid[ym] = e.id;
  commit(); toast(`Оплачено: ${rub(p.amount)} ✓`);
}

/* ---------- Задачи ---------- */
export function openTask(existing, preset = {}) {
  const v = existing
    ? { ...existing, subtasksText: (existing.subtasks || []).map((s) => s.text).join('\n') }
    : { area: 'personal', priority: 'mid', repeat: 'none', due: today(), projectId: '', ...preset };
  formSheet({
    title: existing ? 'Задача' : v.area === 'work' ? 'Рабочая задача' : 'Новое дело',
    values: v,
    fields: [
      { name: 'title', label: 'Что сделать', required: true, placeholder: v.area === 'work' ? 'Например: подготовить отчёт' : 'Например: записаться к врачу' },
      { name: 'area', label: 'Сфера', type: 'seg', options: Object.entries(AREAS).map(([k, a]) => [k, `${a.icon} ${a.name}`]) },
      { name: 'projectId', label: 'Проект', type: 'select', options: projectOptions(v.projectId), show: (x) => x.area === 'work' && db.projects.length > 0 },
      { name: 'priority', label: 'Приоритет', type: 'seg', options: Object.entries(PRIOS) },
      { name: 'due', label: 'Срок', type: 'date', half: true },
      { name: 'time', label: 'Время', type: 'time', half: true },
      { name: 'repeat', label: 'Повтор', type: 'select', options: Object.entries(REPEATS) },
      { name: 'subtasksText', label: 'Подзадачи', type: 'textarea', rows: 3, placeholder: 'Каждая с новой строки' },
      { name: 'note', label: 'Заметка', type: 'textarea', rows: 2 },
    ],
    onSubmit: (x) => {
      const old = existing?.subtasks || [];
      x.subtasks = x.subtasksText.split('\n').map((s) => s.trim()).filter(Boolean)
        .map((text) => old.find((o) => o.text === text) || { id: uid(), text, done: false });
      delete x.subtasksText;
      if (x.area !== 'work') x.projectId = '';
      upsert(db.tasks, existing, existing ? x : { ...x, done: false });
      commit(); toast(existing ? 'Сохранено' : 'Добавлено');
    },
    onDelete: existing ? remove(db.tasks, existing) : null,
  });
}

function nextDue(date, repeat) {
  if (repeat === 'daily') return addDays(date, 1);
  if (repeat === 'weekdays') { let d = addDays(date, 1); while (weekday(d) > 5) d = addDays(d, 1); return d; }
  if (repeat === 'weekly') return addDays(date, 7);
  if (repeat === 'monthly') return addMonths(date, 1);
  return date;
}

export function toggleTask(id) {
  const t = db.tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? new Date().toISOString() : null;
  if (t.done && t.repeat && t.repeat !== 'none' && t.due && !t.spawned) {
    t.spawned = true;
    const next = { ...t, id: uid(), done: false, doneAt: null, spawned: false, due: nextDue(t.due, t.repeat), subtasks: (t.subtasks || []).map((s) => ({ ...s, id: uid(), done: false })) };
    db.tasks.push(next);
    toast(`Следующий повтор: ${fmtDate(next.due)}`);
  } else if (t.done) toast('Готово ✓');
  commit();
}

export function toggleSubtask(taskId, subId) {
  const s = db.tasks.find((x) => x.id === taskId)?.subtasks?.find((x) => x.id === subId);
  if (s) { s.done = !s.done; commit(); }
}

/* ---------- Встречи ---------- */
export function openMeeting(existing, preset = {}) {
  formSheet({
    title: existing ? 'Встреча' : 'Новая встреча',
    values: existing ? { ...existing } : { type: 'meeting', date: today(), time: '', projectId: '', ...preset },
    fields: [
      { name: 'title', label: 'Тема', required: true, placeholder: 'Планёрка, встреча с клиентом…' },
      { name: 'type', label: 'Формат', type: 'select', options: Object.entries(MEET_TYPES).map(([k, m]) => [k, `${m.icon} ${m.name}`]) },
      { name: 'date', label: 'Дата', type: 'date', required: true },
      { name: 'time', label: 'Начало', type: 'time', half: true },
      { name: 'end', label: 'Конец', type: 'time', half: true },
      { name: 'place', label: 'Где', placeholder: 'Офис, адрес, Zoom…' },
      { name: 'people', label: 'С кем', placeholder: 'Имена, компания' },
      { name: 'link', label: 'Ссылка', type: 'url', placeholder: 'https://…' },
      { name: 'projectId', label: 'Проект', type: 'select', options: projectOptions(existing?.projectId), show: () => db.projects.length > 0 },
      { name: 'note', label: 'Повестка / итоги', type: 'textarea', rows: 3 },
    ],
    onSubmit: (x) => { upsert(db.meetings, existing, existing ? x : { ...x, done: false }); commit(); toast(existing ? 'Сохранено' : 'Встреча добавлена'); },
    onDelete: existing ? remove(db.meetings, existing) : null,
  });
}

export function toggleMeeting(id) {
  const m = db.meetings.find((x) => x.id === id);
  if (m) { m.done = !m.done; commit(); }
}

/* ---------- Проекты ---------- */
export function openProject(existing, onCreate) {
  formSheet({
    title: existing ? 'Проект' : 'Новый проект',
    values: existing ? { ...existing } : { status: 'active' },
    fields: [
      { name: 'title', label: 'Название', required: true },
      { name: 'client', label: 'Клиент / направление', placeholder: 'Для кого или в рамках чего' },
      { name: 'status', label: 'Статус', type: 'seg', options: Object.entries(PROJECT_STATUS).map(([k, s]) => [k, s.name]) },
      { name: 'deadline', label: 'Дедлайн', type: 'date' },
      { name: 'note', label: 'Описание, цели, ссылки', type: 'textarea', rows: 4 },
    ],
    onSubmit: (x) => {
      if (existing) Object.assign(existing, x);
      else { const p = { id: uid(), createdAt: new Date().toISOString(), ...x }; db.projects.push(p); onCreate?.(p); }
      commit(); toast(existing ? 'Сохранено' : 'Проект создан');
    },
    onDelete: existing ? () => {
      for (const t of db.tasks) if (t.projectId === existing.id) t.projectId = '';
      for (const m of db.meetings) if (m.projectId === existing.id) m.projectId = '';
      db.projects.splice(db.projects.indexOf(existing), 1); commit(); location.hash = '#/work/projects';
    } : null,
  });
}

/* ---------- Заметки ---------- */
export function openNote(existing) {
  formSheet({
    title: existing ? 'Заметка' : 'Новая заметка',
    values: existing || { pinned: false },
    fields: [
      { name: 'title', label: 'Заголовок', placeholder: 'Идея, контакт, мысль…' },
      { name: 'text', label: 'Текст', type: 'textarea', rows: 8 },
      { name: 'pinned', label: '📌 Закрепить сверху', type: 'toggle' },
    ],
    onSubmit: (x) => {
      if (!x.title && !x.text) { toast('Заметка пустая'); return false; }
      upsert(db.notes, existing, { ...x, updatedAt: new Date().toISOString() }); commit();
    },
    onDelete: existing ? remove(db.notes, existing) : null,
  });
}

/** Общие обработчики, которые нужны во многих разделах */
export const commonActions = {
  editExpense: (d) => { const e = db.expenses.find((x) => x.id === d.id); if (e) openExpense(e); },
  repeatExpense: (d) => {
    const e = db.expenses.find((x) => x.id === d.id);
    if (e) openExpense(null, { category: e.category, title: e.title, amount: e.amount, method: e.method });
  },
  editTask: (d) => { const t = db.tasks.find((x) => x.id === d.id); if (t) openTask(t); },
  toggleTask: (d) => toggleTask(d.id),
  sub: (d) => toggleSubtask(d.id, d.sid),
  editMeet: (d) => { const m = db.meetings.find((x) => x.id === d.id); if (m) openMeeting(m); },
  toggleMeet: (d) => toggleMeeting(d.id),
};

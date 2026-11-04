import { db, commit, isEmpty } from '../store.js';
import { esc, today, fmtDayLong, fmtShort, cap, rub, sum, addDays, diffDays, untilText, daysLeftText, plural } from '../utils.js';
import { agendaFor, nextEvent, paymentsSoon } from '../agenda.js';
import { openExpense, openTask, openMeeting, openNote, commonActions, payPayment } from '../forms.js';
import { tile, agendaRow, sectionHead, empty, progress } from '../components.js';
import { calcTargets, dayLog, totals, latestWeight, r0 } from '../nutrition.js';

const isStandalone = () => navigator.standalone || matchMedia('(display-mode: standalone)').matches;

export function render() {
  const t = today();
  const s = db.settings;
  const hr = new Date().getHours();
  const greet = hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 17 ? 'Добрый день' : hr < 23 ? 'Добрый вечер' : 'Доброй ночи';
  const nx = nextEvent();
  const items = agendaFor(t);
  const tomorrow = agendaFor(addDays(t, 1));
  const mk = t.slice(0, 7);
  const spentToday = sum(db.expenses.filter((e) => e.date === t));
  const spentMonth = sum(db.expenses.filter((e) => e.date.startsWith(mk)));
  const limit = Object.values(s.budgets || {}).reduce((a, b) => a + Number(b || 0), 0);
  const tasksLeft = db.tasks.filter((x) => !x.done && x.due && x.due <= t).length;
  const meetToday = db.meetings.filter((m) => m.date === t);
  const overdue = db.tasks.filter((x) => !x.done && x.due && x.due < t);
  const pays = paymentsSoon(7);
  const projects = db.projects.filter((p) => p.status === 'active').sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).slice(0, 3);

  const notices = [];
  if (!isStandalone() && !s.hideInstall) {
    notices.push(`<div class="notice"><div><b>Установите на iPhone</b><br>Safari → «Поделиться» → «На экран Домой». Так планер откроется как приложение, а данные будут под защитой.</div><button class="icon-btn" data-act="hideInstall" aria-label="Скрыть">✕</button></div>`);
  }
  if (!isEmpty() && (!s.lastBackup || diffDays(s.lastBackup, t) > 14)) {
    notices.push(`<a class="notice green" href="#/settings"><div><b>Пора сделать резервную копию</b><br>${s.lastBackup ? `Последняя: ${fmtShort(s.lastBackup)}` : 'Ещё ни одной копии'} — займёт 10 секунд</div><span>›</span></a>`);
  }

  const html = `
  <section class="hero">
    <div class="hero-top"><span class="pill-light">${esc(s.homeCity)}</span><a class="pill-light" href="#/settings" aria-label="Настройки">⚙︎</a></div>
    <div class="crest">${esc((s.name || 'И').charAt(0).toUpperCase())}</div>
    <h1 class="display">${greet},<br>${esc(s.name)}</h1>
    <p class="hero-date">${cap(fmtDayLong(t))}</p>
    ${nx ? `<a class="next-card" href="${nx.href}"><div class="next-label">Ближайшее · ${untilText(nx.mins)}</div><div class="next-title">${nx.icon} ${esc(nx.title)}</div><div class="next-sub">${nx.date !== t ? `${fmtShort(nx.date)}, ` : ''}${esc(nx.time)}${nx.sub ? ` · ${esc(nx.sub)}` : ''}</div></a>`
      : `<div class="next-card calm"><div class="next-title">Ничего срочного</div><div class="next-sub">На ближайшие дни встреч по времени нет</div></div>`}
  </section>

  <div class="quick">
    <button data-act="addExpense"><span>₽</span>Расход</button>
    <button data-act="addTask"><span>✓</span>Дело</button>
    <button data-act="addWork"><span>💼</span>Работа</button>
    <button data-act="addMeet"><span>🤝</span>Встреча</button>
  </div>

  ${notices.join('')}

  <div class="tiles">
    ${tile('Сегодня потрачено', rub(spentToday), '<a href="#/money">все расходы ›</a>')}
    ${tile('За месяц', rub(spentMonth), limit ? `${spentMonth > limit ? '<span class="danger-text">' : '<span>'}лимит ${rub(limit)}</span>` : 'без лимита')}
    ${tile('Дел на сегодня', String(tasksLeft), overdue.length ? `<span class="danger-text">${overdue.length} просрочено</span>` : 'всё по плану')}
    ${tile('Встреч сегодня', String(meetToday.length), meetToday.length ? `${meetToday.filter((m) => m.done).length} прошло` : 'свободный график')}
  </div>

  ${healthStrip(t)}

  <div class="card">
    ${sectionHead('Мой день', 'addTask', {}, '+ Дело')}
    ${items.length ? `<div class="list">${items.map(agendaRow).join('')}</div>` : empty('☕', 'На сегодня ничего не запланировано. Добавьте дело или встречу.')}
  </div>

  ${overdue.length ? `<div class="card">${sectionHead('Просрочено')}<div class="list">${overdue.sort((a, b) => a.due.localeCompare(b.due)).map((x) => agendaRow({ kind: 'task', id: x.id, title: x.title, sub: `было на ${fmtShort(x.due)}`, icon: '⚠️', href: x.area === 'work' ? '#/work' : '#/tasks' })).join('')}</div></div>` : ''}

  ${tomorrow.length ? `<div class="card">${sectionHead('Завтра')}<div class="list">${tomorrow.map(agendaRow).join('')}</div></div>` : ''}

  ${pays.length ? `<div class="card">${sectionHead('Платежи на неделе', 'goPayments', {}, 'все ›')}<div class="list">${pays.map(({ p, ym, date }) => `
    <div class="row"><div class="row-icon">🗓</div><div class="row-main"><div class="row-title">${esc(p.title)}</div><div class="row-sub">${date < t ? `<span class="danger-text">${fmtShort(date)} · ${daysLeftText(date)}</span>` : `${fmtShort(date)} · ${daysLeftText(date)}`}</div></div>
    <div class="row-end"><b>${rub(p.amount)}</b><button class="mini" data-act="pay" data-id="${p.id}" data-ym="${ym}">Оплатил</button></div></div>`).join('')}</div></div>` : ''}

  ${projects.length ? `<div class="card">${sectionHead('Проекты в работе', 'goProjects', {}, 'все ›')}<div class="list">${projects.map(projectLine).join('')}</div></div>` : ''}

  <div class="card">
    ${sectionHead('Заметки', 'addNote', {}, '+ Заметка')}
    ${db.notes.length ? `<div class="list">${db.notes.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 3).map((n) => `<a class="row" href="#/notes"><div class="row-icon">${n.pinned ? '📌' : '✎'}</div><div class="row-main"><div class="row-title">${esc(n.title || (n.text || '').slice(0, 40))}</div>${n.title && n.text ? `<div class="row-sub">${esc(n.text.slice(0, 80))}</div>` : ''}</div><span class="chev">›</span></a>`).join('')}</div>`
      : '<p class="muted small">Идеи, контакты, мысли — всё в одном месте.</p>'}
  </div>`;

  return {
    html,
    actions: {
      ...commonActions,
      addExpense: () => openExpense(),
      addTask: () => openTask(),
      addWork: () => openTask(null, { area: 'work' }),
      addMeet: () => openMeeting(),
      addNote: () => openNote(),
      pay: (d) => payPayment(d.id, d.ym),
      goPayments: () => (location.hash = '#/money/payments'),
      goProjects: () => (location.hash = '#/work/projects'),
      goHealth: () => (location.hash = '#/health'),
      hideInstall: () => { db.settings.hideInstall = true; commit(); },
    },
  };
}

export function projectLine(p) {
  const tasks = db.tasks.filter((x) => x.projectId === p.id);
  const done = tasks.filter((x) => x.done).length;
  const t = today();
  return `<a class="row project-line" href="#/project/${p.id}">
    <div class="row-icon">📁</div>
    <div class="row-main"><div class="row-title">${esc(p.title)}</div>
      <div class="row-sub">${[p.client, p.deadline ? `дедлайн ${fmtShort(p.deadline)} · ${daysLeftText(p.deadline)}` : '', tasks.length ? `${done}/${tasks.length} ${plural(tasks.length, ['задача', 'задачи', 'задач'])}` : ''].filter(Boolean).map(esc).join(' · ')}</div>
      ${tasks.length ? progress(done, tasks.length) : ''}
    </div>
    ${p.deadline && p.deadline < t && p.status !== 'done' ? '<span class="badge danger">срок прошёл</span>' : '<span class="chev">›</span>'}
  </a>`;
}

function healthStrip(t) {
  const h = db.health;
  const target = calcTargets();
  const eaten = totals(dayLog(t)).kcal;
  const steps = h.steps[t];
  const goal = Number(h.stepGoal) || 10000;
  const w = latestWeight();
  if (!target && !eaten && steps == null && !w) return '';
  return `<a class="card" href="#/health">${sectionHead('Здоровье', 'goHealth', {}, 'подробнее ›')}
    <div class="health-strip">
      <div><b>${r0(eaten).toLocaleString('ru-RU')}</b><span>${target ? `из ${target.kcal.toLocaleString('ru-RU')} ккал` : 'ккал'}</span>${target ? progress(eaten, target.kcal, { over: eaten > target.kcal }) : ''}</div>
      <div><b>${steps != null ? steps.toLocaleString('ru-RU') : '—'}</b><span>шагов</span>${steps != null ? progress(steps, goal) : ''}</div>
      <div><b>${w ? String(w).replace('.', ',') : '—'}</b><span>кг</span></div>
    </div></a>`;
}

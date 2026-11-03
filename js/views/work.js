import { db } from '../store.js';
import { today, addDays, cap, fmtDayLong, groupBy } from '../utils.js';
import { pageHead, empty, taskRow, meetingRow, sectionHead, chips } from '../components.js';
import { openTask, openMeeting, openProject, commonActions } from '../forms.js';
import { projectLine } from './today.js';

const SEGS = [['tasks', 'Задачи'], ['meetings', 'Встречи'], ['projects', 'Проекты']];
const PRIO_ORDER = { high: 0, mid: 1, low: 2 };
export const sortTasks = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority] || (a.time || '').localeCompare(b.time || '');

let showDone = false;
let projFilter = 'active';

export function render(seg = 'tasks') {
  if (!SEGS.some(([k]) => k === seg)) seg = 'tasks';
  const t = today();
  const openWork = db.tasks.filter((x) => x.area === 'work' && !x.done);
  const upcomingMeet = db.meetings.filter((m) => m.date >= t && !m.done);
  const counts = { tasks: openWork.filter((x) => x.due && x.due <= t).length, meetings: upcomingMeet.filter((m) => m.date === t).length, projects: db.projects.filter((p) => p.status === 'active').length };
  const add = { tasks: ['addTask', '+ Задача'], meetings: ['addMeet', '+ Встреча'], projects: ['addProject', '+ Проект'] }[seg];
  const body = { tasks, meetings, projects }[seg](t);

  const html = `
  ${pageHead('Работа', { action: `<button class="btn primary sm" data-act="${add[0]}">${add[1]}</button>` })}
  <div class="segbar">${SEGS.map(([k, l]) => `<a class="${k === seg ? 'on' : ''}" href="#/work/${k}">${l}${counts[k] ? ` <i>${counts[k]}</i>` : ''}</a>`).join('')}</div>
  ${body}`;

  return {
    html,
    actions: {
      ...commonActions,
      addTask: (d) => openTask(null, { area: 'work', due: d.due ?? t }),
      addMeet: () => openMeeting(),
      addProject: () => openProject(null, (p) => (location.hash = `#/project/${p.id}`)),
      toggleDone: () => { showDone = !showDone; rerender(); },
      proj: (d) => { projFilter = d.v; rerender(); },
    },
  };
}

const rerender = () => window.dispatchEvent(new Event('dbchange'));

function tasks(t) {
  const all = db.tasks.filter((x) => x.area === 'work');
  const open = all.filter((x) => !x.done).sort(sortTasks);
  const week = addDays(t, 7);
  const groups = [
    ['Сегодня и просрочено', open.filter((x) => x.due && x.due <= t), t],
    ['Эта неделя', open.filter((x) => x.due && x.due > t && x.due <= week), addDays(t, 1)],
    ['Позже и без срока', open.filter((x) => !x.due || x.due > week), ''],
  ];
  const done = all.filter((x) => x.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 30);
  if (!all.length) return empty('💼', 'Рабочих задач пока нет. Записывайте всё, что нужно сделать по работе, — с проектами, сроками и подзадачами.', '<button class="btn primary" data-act="addTask">Добавить задачу</button>');
  return `
  ${groups.map(([title, list, due]) => `<div class="card">${sectionHead(`${title}${list.length ? ` · ${list.length}` : ''}`, 'addTask', { due }, '+')}
    ${list.length ? `<div class="list">${list.map((x) => taskRow(x, t, { showArea: false })).join('')}</div>` : '<p class="muted small">Пусто</p>'}</div>`).join('')}
  ${done.length ? `<button class="btn ghost full" data-act="toggleDone">${showDone ? 'Скрыть выполненные' : `Показать выполненные (${done.length})`}</button>
    ${showDone ? `<div class="card" style="margin-top:12px"><div class="list">${done.map((x) => taskRow(x, t, { showArea: false })).join('')}</div></div>` : ''}` : ''}`;
}

function meetings(t) {
  const upcoming = db.meetings.filter((m) => m.date >= t).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const past = db.meetings.filter((m) => m.date < t).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))).slice(0, 15);
  if (!db.meetings.length) return empty('🤝', 'Встречи, созвоны, деловые обеды — с местом, ссылкой и повесткой.', '<button class="btn primary" data-act="addMeet">Добавить встречу</button>');
  const g = groupBy(upcoming, (m) => m.date);
  return `
  ${upcoming.length ? Object.keys(g).sort().map((d) => `<div class="card${d === t ? ' today-card' : ''}">${sectionHead(d === t ? `Сегодня, ${fmtDayLong(d).split(', ')[1] || ''}` : cap(fmtDayLong(d)))}
    <div class="list">${g[d].map((m) => meetingRow(m)).join('')}</div></div>`).join('') : empty('🌤', 'Предстоящих встреч нет')}
  ${past.length ? `<div class="group-title">Прошедшие</div><div class="card"><div class="list">${past.map((m) => meetingRow(m, { showDate: true })).join('')}</div></div>` : ''}`;
}

function projects() {
  const list = db.projects.filter((p) => projFilter === 'all' || p.status === projFilter)
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  if (!db.projects.length) return empty('📁', 'Проекты собирают задачи и встречи в одном месте и показывают прогресс до дедлайна.', '<button class="btn primary" data-act="addProject">Создать проект</button>');
  return `
  ${chips([['active', 'В работе'], ['paused', 'На паузе'], ['done', 'Завершены'], ['all', 'Все']], projFilter, 'proj')}
  ${list.length ? `<div class="card"><div class="list">${list.map(projectLine).join('')}</div></div>` : empty('📁', 'Здесь пусто')}`;
}

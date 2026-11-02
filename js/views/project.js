import { db } from '../store.js';
import { esc, today, fmtDate, daysLeftText } from '../utils.js';
import { pageHead, empty, taskRow, meetingRow, sectionHead, progress, tile } from '../components.js';
import { openTask, openMeeting, openProject, commonActions } from '../forms.js';
import { PROJECT_STATUS } from '../const.js';
import { sortTasks } from './work.js';

export function render(id) {
  const p = db.projects.find((x) => x.id === id);
  if (!p) return { html: `${pageHead('Проект', { back: '#/work/projects' })}${empty('📁', 'Проект не найден')}`, actions: {} };
  const t = today();
  const tasks = db.tasks.filter((x) => x.projectId === p.id);
  const open = tasks.filter((x) => !x.done).sort(sortTasks);
  const done = tasks.filter((x) => x.done);
  const meets = db.meetings.filter((m) => m.projectId === p.id).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  const st = PROJECT_STATUS[p.status] || PROJECT_STATUS.active;

  const html = `
  ${pageHead(p.title, { back: '#/work/projects', action: '<button class="btn ghost sm" data-act="edit">Изменить</button>', sub: esc(p.client || '') })}
  <div class="card">
    <div class="card-top"><span class="badge ${st.cls}">${st.name}</span>${p.deadline ? `<span class="muted small">дедлайн ${fmtDate(p.deadline)} · <b class="${p.deadline < t && p.status !== 'done' ? 'danger-text' : ''}">${daysLeftText(p.deadline)}</b></span>` : ''}</div>
    ${tasks.length ? `<div class="budget-line" style="margin-top:12px"><b>${done.length}</b><span>из ${tasks.length} задач выполнено</span></div>${progress(done.length, tasks.length)}` : ''}
    ${p.note ? `<div class="block-text">${esc(p.note)}</div>` : ''}
  </div>
  <div class="tiles">
    ${tile('Открытых задач', String(open.length), open.filter((x) => x.due && x.due < t).length ? `<span class="danger-text">${open.filter((x) => x.due && x.due < t).length} просрочено</span>` : '')}
    ${tile('Встреч', String(meets.length), meets.filter((m) => m.date >= t).length ? `${meets.filter((m) => m.date >= t).length} впереди` : '')}
  </div>
  <div class="card">${sectionHead('Задачи', 'addTask', {}, '+ Задача')}
    ${open.length ? `<div class="list">${open.map((x) => taskRow(x, t, { showArea: false })).join('')}</div>` : '<p class="muted small">Открытых задач нет</p>'}
    ${done.length ? `<div class="group-title">Выполнено</div><div class="list">${done.map((x) => taskRow(x, t, { showArea: false })).join('')}</div>` : ''}
  </div>
  <div class="card">${sectionHead('Встречи', 'addMeet', {}, '+ Встреча')}
    ${meets.length ? `<div class="list">${meets.map((m) => meetingRow(m, { showDate: true })).join('')}</div>` : '<p class="muted small">Встреч по проекту пока нет</p>'}
  </div>`;

  return {
    html,
    actions: {
      ...commonActions,
      edit: () => openProject(p),
      addTask: () => openTask(null, { area: 'work', projectId: p.id, due: '' }),
      addMeet: () => openMeeting(null, { projectId: p.id }),
    },
  };
}

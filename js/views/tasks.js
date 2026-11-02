import { db } from '../store.js';
import { today, addDays } from '../utils.js';
import { pageHead, empty, chips, taskRow } from '../components.js';
import { openTask, commonActions } from '../forms.js';
import { sortTasks } from './work.js';

let view = 'today';
let area = 'life';

export function render() {
  const t = today(), week = addDays(t, 7);
  let all = db.tasks;
  if (area === 'life') all = all.filter((x) => x.area !== 'work');
  else if (area !== 'all') all = all.filter((x) => x.area === area);
  const open = all.filter((x) => !x.done);
  const groups = {
    today: open.filter((x) => x.due && x.due <= t),
    week: open.filter((x) => x.due && x.due > t && x.due <= week),
    later: open.filter((x) => !x.due || x.due > week),
    done: all.filter((x) => x.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 50),
  };
  const list = view === 'done' ? groups.done : groups[view].sort(sortTasks);
  const TABS = [['today', 'Сегодня'], ['week', 'Неделя'], ['later', 'Позже'], ['done', 'Готово']];

  const html = `
  ${pageHead('Дела', { action: '<button class="btn primary sm" data-act="add">+ Дело</button>' })}
  <div class="segbar">${TABS.map(([k, l]) => `<button class="${k === view ? 'on' : ''}" data-act="view" data-v="${k}">${l}${k !== 'done' && groups[k].length ? ` <i>${groups[k].length}</i>` : ''}</button>`).join('')}</div>
  ${chips([['life', 'Личное и дом'], ['personal', '🌿 Личное'], ['home', '🏠 Дом'], ['all', 'Всё, включая работу']], area, 'area')}
  ${list.length ? `<div class="card"><div class="list">${list.map((x) => taskRow(x, t)).join('')}</div></div>`
    : empty(view === 'done' ? '🌱' : '☕', view === 'today' ? 'На сегодня дел нет. Можно выдохнуть.' : view === 'done' ? 'Здесь появятся выполненные дела' : 'Пусто', view !== 'done' ? '<button class="btn primary" data-act="add">Добавить дело</button>' : '')}`;

  return {
    html,
    actions: {
      ...commonActions,
      add: () => openTask(null, {
        ...(view === 'later' ? { due: '' } : view === 'week' ? { due: addDays(t, 1) } : {}),
        area: area === 'home' ? 'home' : 'personal',
      }),
      view: (d) => { view = d.v; window.dispatchEvent(new Event('dbchange')); },
      area: (d) => { area = d.v; window.dispatchEvent(new Event('dbchange')); },
    },
  };
}

import { applyTheme } from './theme.js';
import { sheetOpen } from './ui.js';
import * as today from './views/today.js';
import * as work from './views/work.js';
import * as project from './views/project.js';
import * as tasks from './views/tasks.js';
import * as money from './views/money.js';
import * as more from './views/more.js';
import * as calendar from './views/calendar.js';
import * as notes from './views/notes.js';
import * as year from './views/year.js';
import * as settings from './views/settings.js';
import * as health from './views/health.js';

const routes = { today, work, project, tasks, money, health, more, calendar, notes, year, settings };
const TAB_OF = { today: 'today', work: 'work', project: 'work', tasks: 'tasks', money: 'money', health: 'health' };

const main = document.getElementById('main');
let view = null;

function current() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: routes[name] ? name : 'today', params: params.map(decodeURIComponent) };
}

function render(keepScroll = true) {
  const y = window.scrollY;
  const { name, params } = current();
  try {
    view = routes[name].render(...params);
  } catch (e) {
    console.error(e);
    view = { html: `<div class="empty"><div class="empty-icon">⚠️</div><p>Что-то пошло не так: ${e.message}</p></div>`, actions: {} };
  }
  main.innerHTML = view.html;
  view.mount?.(main);
  const tab = TAB_OF[name] || 'more';
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  if (keepScroll) window.scrollTo(0, y);
}

function dispatch(e) {
  const el = e.target.closest('[data-act]');
  if (!el || !main.contains(el)) return;
  const fn = view?.actions?.[el.dataset.act];
  if (!fn) return;
  if (el.tagName !== 'INPUT') e.preventDefault();
  e.stopPropagation();
  fn(el.dataset, el, e);
}

main.addEventListener('click', dispatch);
window.addEventListener('dbchange', () => render(true));
window.addEventListener('hashchange', () => { render(false); window.scrollTo(0, 0); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// Обновлять «ближайшее» на главном экране
setInterval(() => { if (current().name === 'today' && !sheetOpen() && document.visibilityState === 'visible') render(true); }, 60_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !sheetOpen()) render(true); });

applyTheme();
render(false);

navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // Новая версия приложения: один раз перезагрузить страницу, чтобы сразу увидеть изменения
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded && !sheetOpen()) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    })
    .catch(() => {});
}

import { db } from '../store.js';
import { today, rub, sum, groupBy, monthLabel, pad, plural } from '../utils.js';
import { pageHead, sectionHead, tile, bars } from '../components.js';
import { CAT, AREAS } from '../const.js';

let year = Number(today().slice(0, 4));

export function render() {
  const y = String(year);
  const exp = db.expenses.filter((e) => e.date.startsWith(y));
  const done = db.tasks.filter((t) => t.done && (t.doneAt || '').startsWith(y));
  const meets = db.meetings.filter((m) => m.date.startsWith(y));
  const projDone = db.projects.filter((p) => p.status === 'done' && (p.deadline || p.createdAt || '').startsWith(y));
  const months = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`);
  const byMonth = months.map((m) => ({ label: monthLabel(m), value: sum(exp.filter((e) => e.date.startsWith(m))) })).filter((r) => r.value > 0);
  const byCat = Object.entries(groupBy(exp, (e) => e.category)).map(([k, v]) => ({ label: `${CAT[k]?.icon || ''} ${CAT[k]?.name || k}`, value: sum(v) })).sort((a, b) => b.value - a.value).slice(0, 8);
  const byArea = Object.entries(groupBy(done, (t) => t.area || 'personal')).map(([k, v]) => ({ label: `${AREAS[k]?.icon || ''} ${AREAS[k]?.name || k}`, value: v.length })).sort((a, b) => b.value - a.value);
  const activeMonths = byMonth.length || 1;

  const html = `
  ${pageHead(`Итоги ${y}`, { back: '#/more', action: `<div class="month-switch sm"><button class="icon-btn" data-act="prev">‹</button><button class="icon-btn" data-act="next">›</button></div>` })}
  <div class="hero mini-hero">
    <div class="big-num">${done.length}</div><div>${plural(done.length, ['дело сделано', 'дела сделано', 'дел сделано'])} · ${meets.length} ${plural(meets.length, ['встреча', 'встречи', 'встреч'])}</div>
  </div>
  <div class="tiles">
    ${tile('Всего потрачено', rub(sum(exp)), `${exp.length} ${plural(exp.length, ['запись', 'записи', 'записей'])}`)}
    ${tile('В среднем в месяц', rub(sum(exp) / activeMonths))}
    ${tile('Проектов завершено', String(projDone.length))}
    ${tile('Рабочих задач', String(done.filter((t) => t.area === 'work').length), 'выполнено')}
  </div>
  ${byArea.length ? `<div class="card">${sectionHead('Сделано по сферам')}${bars(byArea, { fmt: String })}</div>` : ''}
  ${byMonth.length ? `<div class="card">${sectionHead('Расходы по месяцам')}${bars(byMonth)}</div><div class="card">${sectionHead('Главные статьи расходов')}${bars(byCat)}</div>` : ''}`;

  return {
    html,
    actions: {
      prev: () => { year--; window.dispatchEvent(new Event('dbchange')); },
      next: () => { year++; window.dispatchEvent(new Event('dbchange')); },
    },
  };
}

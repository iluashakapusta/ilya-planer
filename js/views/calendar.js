import { db } from '../store.js';
import { iso, today, cap, fmtDayLong, shiftMonth } from '../utils.js';
import { agendaFor, paymentDate } from '../agenda.js';
import { pageHead, monthSwitch, agendaRow, empty } from '../components.js';
import { openTask, openMeeting, commonActions } from '../forms.js';
import { WD_SHORT } from '../const.js';

let ym = today().slice(0, 7);
let sel = today();

export function render() {
  const t = today();
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() || 7) - 1;
  const daysIn = new Date(y, m, 0).getDate();
  const payDays = new Set(db.payments.filter((p) => p.active !== false).map((p) => paymentDate(p, ym)));
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<div class="cal-cell blank"></div>');
  for (let d = 1; d <= daysIn; d++) {
    const date = iso(new Date(y, m - 1, d));
    const meet = db.meetings.some((x) => x.date === date);
    const task = db.tasks.some((x) => x.due === date && !x.done);
    const dl = db.projects.some((p) => p.deadline === date && p.status !== 'done');
    const pay = payDays.has(date);
    cells.push(`<button class="cal-cell${date === t ? ' today' : ''}${date === sel ? ' sel' : ''}${dl ? ' deadline' : ''}" data-act="pick" data-d="${date}">
      <span class="cal-num">${d}</span>
      <span class="dots">${meet ? '<i class="d-meet"></i>' : ''}${task ? '<i class="d-task"></i>' : ''}${pay ? '<i class="d-pay"></i>' : ''}</span>
    </button>`);
  }
  const items = agendaFor(sel);

  const html = `
  ${pageHead('Календарь', { back: '#/more', action: `<button class="btn ghost sm" data-act="goToday">Сегодня</button>` })}
  <div class="card cal">
    ${monthSwitch(ym)}
    <div class="cal-grid head">${WD_SHORT.map((w) => `<div>${w}</div>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
    <div class="legend"><span><i class="d-meet"></i>встречи</span><span><i class="d-task"></i>дела</span><span><i class="d-pay"></i>платежи</span><span><i class="lg-deadline"></i>дедлайн</span></div>
  </div>
  <div class="card">
    <div class="section-head"><h3>${cap(fmtDayLong(sel))}</h3><span><button class="link-btn" data-act="addMeet">+ Встреча</button> &nbsp; <button class="link-btn" data-act="addTask">+ Дело</button></span></div>
    ${items.length ? `<div class="list">${items.map(agendaRow).join('')}</div>` : empty('🌤', 'В этот день ничего нет')}
  </div>`;

  return {
    html,
    actions: {
      ...commonActions,
      prevMonth: () => { ym = shiftMonth(ym, -1); rerender(); },
      nextMonth: () => { ym = shiftMonth(ym, 1); rerender(); },
      pick: (d) => { sel = d.d; rerender(); },
      goToday: () => { ym = t.slice(0, 7); sel = t; rerender(); },
      addTask: () => openTask(null, { due: sel }),
      addMeet: () => openMeeting(null, { date: sel }),
    },
  };
}

const rerender = () => window.dispatchEvent(new Event('dbchange'));

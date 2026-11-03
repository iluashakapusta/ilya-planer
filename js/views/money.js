import { db, commit } from '../store.js';
import { esc, today, rub, sum, groupBy, shiftMonth, monthLabel, cap, fmtDayLong, fmtShort, plural, daysLeftText } from '../utils.js';
import { pageHead, sectionHead, empty, tile, bars, progress, monthSwitch, chips, expenseRow } from '../components.js';
import { openExpense, openPayment, payPayment, commonActions } from '../forms.js';
import { formSheet, saveFile, toCSV, toast } from '../ui.js';
import { paymentDate, isPaid } from '../agenda.js';
import { CATS, CAT, PAY_METHODS } from '../const.js';

let ym = today().slice(0, 7);
let cat = 'all';

const SEGS = [['month', 'Расходы'], ['budget', 'Бюджет'], ['payments', 'Платежи']];

const byDateDesc = (a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''));

function dayGroups(list) {
  const g = groupBy(list.slice().sort(byDateDesc), (e) => e.date);
  return Object.keys(g).sort().reverse().map((d) => `
    <div class="day-group"><div class="day-head"><span>${cap(fmtDayLong(d))}</span><b>${rub(sum(g[d]))}</b></div>
    <div class="list">${g[d].map((e) => expenseRow(e)).join('')}</div></div>`).join('');
}

export function render(seg = 'month') {
  if (!SEGS.some(([k]) => k === seg)) seg = 'month';
  const body = { month, budget, payments }[seg]();
  const html = `
    ${pageHead('Расходы', { action: `<button class="btn primary sm" data-act="${seg === 'payments' ? 'addPayment' : 'addExpense'}">+ ${seg === 'payments' ? 'Платёж' : 'Расход'}</button>` })}
    <div class="segbar">${SEGS.map(([k, l]) => `<a class="${k === seg ? 'on' : ''}" href="#/money/${k}">${l}</a>`).join('')}</div>
    ${body}`;
  return {
    html,
    actions: {
      ...commonActions,
      addExpense: () => openExpense(),
      addPayment: () => openPayment(),
      editPayment: (d) => { const p = db.payments.find((x) => x.id === d.id); if (p) openPayment(p); },
      pay: (d) => payPayment(d.id, d.ym || ym),
      prevMonth: () => { ym = shiftMonth(ym, -1); rerender(); },
      nextMonth: () => { ym = shiftMonth(ym, 1); rerender(); },
      cat: (d) => { cat = d.v; rerender(); },
      editBudgets,
      exportMonth: () => exportList(db.expenses.filter((e) => e.date.startsWith(ym)), `Расходы ${monthLabel(ym)}.csv`),
    },
  };
}

const rerender = () => window.dispatchEvent(new Event('dbchange'));

/* ---------- Расходы за месяц ---------- */
function month() {
  const all = db.expenses.filter((e) => e.date.startsWith(ym));
  const list = cat === 'all' ? all : all.filter((e) => e.category === cat);
  const total = sum(list), allTotal = sum(all);
  const prev = sum(db.expenses.filter((e) => e.date.startsWith(shiftMonth(ym, -1)) && (cat === 'all' || e.category === cat)));
  const diff = total - prev;
  const byCat = Object.entries(groupBy(all, (e) => e.category)).map(([k, v]) => ({ id: k, label: `${CAT[k]?.icon || ''} ${CAT[k]?.name || k}`, value: sum(v), sub: `${Math.round((sum(v) / (allTotal || 1)) * 100)}% · ${v.length} ${plural(v.length, ['запись', 'записи', 'записей'])}` })).sort((a, b) => b.value - a.value);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(ym, i - 5)).map((m) => ({ label: monthLabel(m), value: sum(db.expenses.filter((e) => e.date.startsWith(m) && (cat === 'all' || e.category === cat))) }));
  const days = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const elapsed = ym === today().slice(0, 7) ? Number(today().slice(8, 10)) : days;
  const cash = sum(list.filter((e) => e.method === 'cash'));
  const usedCats = byCat.map((c) => [c.id, `${CAT[c.id]?.icon || ''} ${CAT[c.id]?.name || c.id}`]);
  return `
  ${monthSwitch(ym)}
  ${usedCats.length > 1 ? chips([['all', 'Все'], ...usedCats], cat, 'cat') : ''}
  <div class="tiles">
    ${tile(cat === 'all' ? 'Всего за месяц' : CAT[cat]?.name || 'Категория', rub(total), prev ? `${diff >= 0 ? '▲' : '▼'} ${rub(Math.abs(diff))} к прошлому месяцу` : `${list.length} ${plural(list.length, ['запись', 'записи', 'записей'])}`)}
    ${tile('В среднем в день', rub(total / (elapsed || 1)), cash ? `наличными: ${rub(cash)}` : '')}
  </div>
  ${cat === 'all' && byCat.length ? `<div class="card">${sectionHead('По категориям')}${bars(byCat)}</div>` : ''}
  <div class="card">${sectionHead('Последние 6 месяцев')}${bars(months)}</div>
  ${list.length ? `<div class="card">${sectionHead('Все записи', 'addExpense', {}, '+ Расход')}${dayGroups(list)}<button class="btn ghost full" data-act="exportMonth">Выгрузить месяц в Excel</button></div>` : empty('₽', 'Записей за этот месяц нет', '<button class="btn primary" data-act="addExpense">Добавить расход</button>')}`;
}

/* ---------- Бюджет ---------- */
function budget() {
  const b = db.settings.budgets || {};
  const list = db.expenses.filter((e) => e.date.startsWith(ym));
  const withLimit = CATS.filter((c) => b[c.id] > 0);
  const totalLimit = withLimit.reduce((s, c) => s + Number(b[c.id]), 0);
  const totalSpent = sum(list.filter((e) => b[e.category] > 0));
  const isCur = ym === today().slice(0, 7);
  const daysIn = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const daysLeft = isCur ? daysIn - Number(today().slice(8, 10)) + 1 : 0;
  return `
  ${monthSwitch(ym)}
  ${withLimit.length ? `<div class="card budget-total">${sectionHead('Общий лимит')}<div class="budget-line"><b>${rub(totalSpent)}</b><span>из ${rub(totalLimit)}</span></div>${progress(totalSpent, totalLimit, { over: totalSpent > totalLimit })}
    <p class="muted small">${totalSpent > totalLimit ? `<span class="danger-text">Превышение на ${rub(totalSpent - totalLimit)}</span>` : `Осталось ${rub(totalLimit - totalSpent)}${isCur && daysLeft ? ` · можно тратить ~${rub((totalLimit - totalSpent) / daysLeft)} в день` : ''}`}</p></div>` : ''}
  <div class="card">${sectionHead('По категориям', 'editBudgets', {}, 'Настроить лимиты')}
    ${withLimit.length ? withLimit.map((c) => {
      const spent = sum(list.filter((e) => e.category === c.id)), lim = Number(b[c.id]);
      return `<div class="budget-row"><div class="bar-label"><span>${c.icon} ${c.name}</span><b>${rub(spent)} <span class="muted">/ ${rub(lim)}</span></b></div>${progress(spent, lim, { over: spent > lim })}
        <div class="bar-sub">${spent > lim ? `<span class="danger-text">перерасход ${rub(spent - lim)}</span>` : `осталось ${rub(lim - spent)}`}</div></div>`;
    }).join('') : empty('🎯', 'Задайте месячные лимиты по категориям: продукты, кафе, такси, досуг…', '<button class="btn primary" data-act="editBudgets">Задать лимиты</button>')}
  </div>`;
}

function editBudgets() {
  const b = db.settings.budgets || {};
  formSheet({
    title: 'Лимиты на месяц',
    values: Object.fromEntries(CATS.map((c) => [c.id, b[c.id] || ''])),
    fields: CATS.map((c) => ({ name: c.id, label: `${c.icon} ${c.name}`, type: 'money', half: true, placeholder: 'без лимита' })),
    onSubmit: (v) => { db.settings.budgets = Object.fromEntries(Object.entries(v).filter(([, x]) => x > 0)); commit(); toast('Лимиты сохранены'); },
  });
}

/* ---------- Регулярные платежи ---------- */
function payments() {
  const t = today();
  const list = db.payments.slice().sort((a, b) => (a.active === false) - (b.active === false) || Number(a.day) - Number(b.day));
  const active = list.filter((p) => p.active !== false);
  const total = sum(active);
  const paid = sum(active.filter((p) => isPaid(p, ym)));
  if (!list.length) return `${empty('🗓', 'Аренда, коммуналка, связь, подписки, спортзал — добавьте регулярные платежи, и планер напомнит о них заранее. Отметка «Оплатил» сама запишет расход.', '<button class="btn primary" data-act="addPayment">Добавить платёж</button>')}`;
  return `
  ${monthSwitch(ym)}
  <div class="tiles">
    ${tile('В месяц', rub(total), `${active.length} ${plural(active.length, ['платёж', 'платежа', 'платежей'])}`)}
    ${tile('Оплачено', rub(paid), total - paid > 0 ? `осталось ${rub(total - paid)}` : 'всё оплачено ✓', total && paid >= total ? 'ok' : '')}
  </div>
  ${total ? `<div class="card">${progress(paid, total)}<p class="muted small">${monthLabel(ym)}: оплачено ${active.filter((p) => isPaid(p, ym)).length} из ${active.length}</p></div>` : ''}
  <div class="card">${sectionHead('Список', 'addPayment', {}, '+ Платёж')}<div class="list">${list.map((p) => {
    const date = paymentDate(p, ym), done = isPaid(p, ym), off = p.active === false;
    const late = !done && !off && date < t;
    return `<div class="row${off ? ' off' : ''}">
      <div class="row-icon">${CAT[p.category]?.icon || '🗓'}</div>
      <div class="row-main tap" data-act="editPayment" data-id="${p.id}"><div class="row-title">${esc(p.title)}</div>
        <div class="row-sub">${off ? 'на паузе' : `${p.day}-е число · ${late ? `<span class="danger-text">${fmtShort(date)}, ${daysLeftText(date)}</span>` : done ? 'оплачено' : `${fmtShort(date)}, ${daysLeftText(date)}`}`}</div></div>
      <div class="row-end"><b>${rub(p.amount)}</b>${off ? '' : `<button class="mini${done ? ' ok' : ''}" data-act="pay" data-id="${p.id}" data-ym="${ym}">${done ? '✓' : 'Оплатил'}</button>`}</div>
    </div>`;
  }).join('')}</div></div>`;
}

function exportList(list, name) {
  if (!list.length) { toast('Нечего выгружать'); return; }
  const rows = [['Дата', 'Категория', 'На что', 'Оплата', 'Сумма, ₽', 'Заметка']];
  for (const e of list.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([e.date, CAT[e.category]?.name || '', e.title || '', (PAY_METHODS[e.method] || '').replace(/^\S+\s/, ''), e.amount, e.note || '']);
  }
  rows.push(['', '', 'ИТОГО', '', sum(list), '']);
  saveFile(name, toCSV(rows), 'text/csv');
}

import { db, commit } from '../store.js';
import { esc, uid, today, addDays, cap, fmtDayLong, fmtShort, fmtDate, plural } from '../utils.js';
import { pageHead, sectionHead, empty, tile, progress, bars } from '../components.js';
import { openSheet, closeSheet, formSheet, toast } from '../ui.js';
import { openScanner } from '../scanner.js';
import {
  MEALS, ACTIVITY, GOALS, RULES, FAT_LOOKS, r0, r1, calcTargets, latestWeight, latestFat, macrosFor, dayLog, totals,
  defaultMeal, foodsByUse, lookupBarcode, parseHealthText, applyHealth, weightChange, navyFat,
} from '../nutrition.js';
import { getApiKey, setApiKey, prepareImage, estimateBodyFat, AI_ERRORS } from '../bodyfat-ai.js';

const SEGS = [['food', 'Питание'], ['weight', 'Вес'], ['steps', 'Шаги'], ['norm', 'Норма']];
let day = today();

const H = () => db.health;
const rerender = () => window.dispatchEvent(new Event('dbchange'));
const kcalFmt = (n) => `${r0(n).toLocaleString('ru-RU')} ккал`;
const num = (n) => r0(n).toLocaleString('ru-RU');
const dec = (n) => (n == null || n === '' ? '' : String(r1(n)).replace('.', ',').replace(/^-/, '−'));

export function render(seg = 'food') {
  if (!SEGS.some(([k]) => k === seg)) seg = 'food';
  const body = { food, weight, steps, norm }[seg]();
  const html = `
  ${pageHead('Здоровье', { action: '<button class="btn primary sm" data-act="sync">⟳ Из «Здоровья»</button>' })}
  <div class="segbar">${SEGS.map(([k, l]) => `<a class="${k === seg ? 'on' : ''}" href="#/health/${k}">${l}</a>`).join('')}</div>
  ${body}`;
  return { html, actions: healthActions };
}

/* ================= Питание ================= */
function food() {
  const t = calcTargets();
  const items = dayLog(day);
  const sum = totals(items);
  const pct = t ? Math.min(100, (sum.kcal / t.kcal) * 100) : 0;
  const over = t && sum.kcal > t.kcal;
  const macro = (label, key) => `<div class="macro"><div class="bar-label"><span>${label}</span><b>${num(sum[key])}${t ? ` <span class="muted">/ ${t[key]} г</span>` : ' г'}</b></div>${t ? progress(sum[key], t[key], { over: sum[key] > t[key] * 1.1 }) : ''}</div>`;
  return `
  <div class="month-switch"><button class="icon-btn" data-act="dayPrev" aria-label="Предыдущий день">‹</button>
    <span>${day === today() ? 'Сегодня' : cap(fmtDayLong(day))}</span><button class="icon-btn" data-act="dayNext" aria-label="Следующий день">›</button></div>
  <div class="card kbju">
    <div class="ring${over ? ' over' : ''}" style="--p:${pct}"><div><b>${num(sum.kcal)}</b><small>${t ? `из ${num(t.kcal)}` : 'ккал'}</small></div></div>
    <div class="kbju-side">
      <div class="kbju-left">${t ? (over ? `<span class="danger-text">Перебор ${kcalFmt(sum.kcal - t.kcal)}</span>` : `Осталось <b>${kcalFmt(t.kcal - sum.kcal)}</b>`) : '<a href="#/health/norm">Рассчитать норму ›</a>'}</div>
      ${macro('Белки', 'p')}${macro('Жиры', 'f')}${macro('Углеводы', 'c')}
    </div>
  </div>
  <div class="quick three">
    <button data-act="scan"><span>▥</span>Сканировать</button>
    <button data-act="pick"><span>⌕</span>Мои продукты</button>
    <button data-act="newFood"><span>+</span>Новый продукт</button>
  </div>
  ${Object.entries(MEALS).map(([k, m]) => {
    const list = items.filter((x) => x.meal === k);
    const s = totals(list);
    return `<div class="card">${sectionHead(`${m.icon} ${m.name}${list.length ? ` · ${num(s.kcal)} ккал` : ''}`, 'pick', { meal: k }, '+')}
      ${list.length ? `<div class="list">${list.map((x) => `
        <div class="row tap" data-act="editEntry" data-id="${x.id}">
          <div class="row-main"><div class="row-title">${esc(x.name)}</div><div class="row-sub">${num(x.grams)} г · Б ${dec(x.p)} · Ж ${dec(x.f)} · У ${dec(x.c)}</div></div>
          <div class="row-end"><b>${num(x.kcal)}</b></div>
        </div>`).join('')}</div>` : '<p class="muted small">Пусто</p>'}
    </div>`;
  }).join('')}
  ${!items.length && dayLog(addDays(day, -1)).length ? '<button class="btn ghost full" data-act="copyYesterday">Повторить вчерашний день</button>' : ''}`;
}

/* ================= Вес ================= */
function weight() {
  const list = H().weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  const last = list[list.length - 1];
  const fat = latestFat();
  const w7 = weightChange(7), w30 = weightChange(30);
  const sign = (n) => (n > 0 ? `+${dec(n)}` : dec(n));
  return `
  <div class="tiles">
    ${tile('Вес сейчас', last ? `${dec(last.weight)} кг` : '—', last ? fmtShort(last.date) : 'нет записей')}
    ${tile('% жира', fat ? `${dec(fat.fat)}%` : '—', fat ? `${{ scale: 'весы', photo: 'по фото', navy: 'по обхватам', look: 'на глаз', manual: 'вручную' }[fat.source] || ''}${fat.date ? ` · ${fmtShort(fat.date)}` : ''}` : '<a href="#/health/norm">определить ›</a>')}
    ${tile('За неделю', w7 != null ? `${sign(w7)} кг` : '—', '', w7 < 0 ? 'ok' : '')}
    ${tile('За месяц', w30 != null ? `${sign(w30)} кг` : '—', '', w30 < 0 ? 'ok' : '')}
  </div>
  ${list.length >= 2 ? `<div class="card">${sectionHead('Динамика')}${weightChart(list.slice(-60))}</div>` : ''}
  <div class="card">${sectionHead('Записи', 'addWeight', {}, '+ Вес')}
    ${list.length ? `<div class="list">${list.slice().reverse().slice(0, 30).map((w) => `
      <div class="row tap" data-act="editWeight" data-date="${w.date}"><div class="row-icon">⚖</div>
        <div class="row-main"><div class="row-title">${dec(w.weight)} кг${w.fat ? ` · жир ${dec(w.fat)}%` : ''}</div><div class="row-sub">${fmtDate(w.date)}${w.source === 'health' ? ' · из «Здоровья»' : ''}</div></div></div>`).join('')}</div>`
      : empty('⚖', 'Взвесьтесь на Picooc и нажмите «⟳ Из «Здоровья»» или добавьте вес вручную.')}
  </div>
  ${syncCard()}`;
}

function weightChart(list) {
  const W = 320, Hh = 140, pad = 24;
  const ws = list.map((x) => x.weight);
  const min = Math.floor(Math.min(...ws) - 0.5), max = Math.ceil(Math.max(...ws) + 0.5);
  const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, list.length - 1);
  const y = (v) => 10 + ((max - v) * (Hh - 30)) / (max - min || 1);
  const pts = list.map((p, i) => `${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  return `<svg class="wchart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="График веса">
    <line x1="${pad}" x2="${W - pad}" y1="${y(max)}" y2="${y(max)}" class="grid"/><line x1="${pad}" x2="${W - pad}" y1="${y(min)}" y2="${y(min)}" class="grid"/>
    <text x="${pad - 4}" y="${y(max) + 4}" text-anchor="end">${max}</text><text x="${pad - 4}" y="${y(min) + 4}" text-anchor="end">${min}</text>
    <polyline points="${pts}" class="line"/>
    ${list.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.weight).toFixed(1)}" r="${i === list.length - 1 ? 4 : 2.5}"/>`).join('')}
    <text x="${pad}" y="${Hh - 4}">${fmtShort(list[0].date)}</text><text x="${W - pad}" y="${Hh - 4}" text-anchor="end">${fmtShort(list[list.length - 1].date)}</text>
  </svg>`;
}

/* ================= Шаги ================= */
function steps() {
  const t = today(), goal = Number(H().stepGoal) || 10000;
  const s = H().steps;
  const cur = s[t] || 0;
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(t, -i));
  const week = last14.slice(0, 7).map((d) => s[d]).filter((v) => v != null);
  const avg = week.length ? week.reduce((a, b) => a + b, 0) / week.length : null;
  const best = Math.max(0, ...Object.values(s));
  const streak = (() => { let n = 0; for (let i = s[t] >= goal ? 0 : 1; s[addDays(t, -i)] >= goal; i++) n++; return n; })();
  return `
  <div class="card steps-card">
    <div class="steps-big">${num(cur)}<small>из ${num(goal)} шагов</small></div>
    ${progress(cur, goal)}
    <p class="muted small">${cur >= goal ? 'Цель на сегодня выполнена ✓' : `Осталось ${num(goal - cur)} — примерно ${Math.round((goal - cur) / 1300 * 10)} мин ходьбы`}${H().lastSync ? ` · обновлено ${new Date(H().lastSync).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
  </div>
  <div class="tiles">
    ${tile('В среднем за 7 дней', avg != null ? num(avg) : '—', 'шагов в день')}
    ${tile('Рекорд', best ? num(best) : '—', streak ? `серия: ${streak} ${plural(streak, ['день', 'дня', 'дней'])} с целью` : '')}
  </div>
  <div class="card">${sectionHead('Последние 2 недели', 'editSteps', {}, 'Изменить цель')}
    ${bars(last14.filter((d) => s[d] != null).map((d) => ({ label: d === t ? 'Сегодня' : fmtShort(d), value: s[d] })), { fmt: num })}
    <button class="btn ghost full" data-act="addSteps">Ввести шаги вручную</button>
  </div>
  ${syncCard()}`;
}

function syncCard() {
  return `<div class="card">${sectionHead('Синхронизация со «Здоровьем»', 'syncHelp', {}, 'Как настроить')}
    <p class="small">Шаги с iPhone и вес с весов Picooc попадают в приложение «Здоровье». Команда «Планер: Здоровье» копирует их, а кнопка ниже — вставляет сюда.</p>
    <button class="btn primary full" data-act="sync">⟳ Обновить из «Здоровья»</button>
    ${H().lastSync ? `<p class="muted small center">Последнее обновление: ${new Date(H().lastSync).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>` : ''}
  </div>`;
}

/* ================= Норма ================= */
function norm() {
  const pr = H().profile;
  const t = calcTargets();
  const fat = latestFat();
  const w = latestWeight();
  const filled = pr.age && pr.height && w;
  return `
  ${t ? `<div class="card budget-total">${sectionHead('Норма на день')}
    <div class="budget-line"><b>${num(t.kcal)}</b><span>ккал</span></div>
    <div class="norm-macros"><div><b>${t.p}</b><span>белки, г</span></div><div><b>${t.f}</b><span>жиры, г</span></div><div><b>${t.c}</b><span>углеводы, г</span></div></div>
    ${t.manual ? '<p class="muted small">Задана вручную</p>' : ''}
  </div>` : ''}
  ${t && !t.manual ? `<div class="card">${sectionHead('Как посчитано')}
    <div class="kv"><span>Вес</span><b>${dec(t.weight)} кг</b></div>
    ${t.lbm ? `<div class="kv"><span>% жира</span><b>${dec(t.fat.fat)}%</b></div><div class="kv"><span>Сухая масса</span><b>${dec(t.lbm)} кг</b></div>` : ''}
    <div class="kv"><span>Основной обмен</span><b>${num(t.bmr)} ккал</b></div>
    <div class="kv"><span>Расход с активностью</span><b>${num(t.tdee)} ккал</b></div>
    <div class="kv"><span>${GOALS[t.goal].name}${t.goal !== 'keep' ? ` ${GOALS[t.goal].sign < 0 ? '−' : '+'}${t.pct}%` : ''}</span><b>${num(t.kcalByTdee)} ккал</b></div>
    <div class="kv"><span>Белки</span><b>${String(t.pk).replace(".", ",")} г × ${t.lbm ? 'сухая масса' : 'вес'}</b></div>
    <div class="kv"><span>Жиры</span><b>${String(t.fk).replace(".", ",")} г × ${t.lbm ? 'сухая масса' : 'вес'}</b></div>
    <div class="kv"><span>Углеводы</span><b>${dec(t.ck)} г на кг</b></div>
    <p class="muted small">${t.lbm
      ? `Методика тренера: БЖУ на кг сухой массы (${GOALS[t.goal].name.toLowerCase()}: белок ${RULES[t.goal].p.join('–')} г, жиры ${RULES[t.goal].f.join('–')} г, углеводы ${RULES[t.goal].c.join('–')} г). Расход — по формуле Кетча — МакАрдла.${t.clamped === 'max' ? ` Углеводы ограничены верхней границей диапазона, поэтому итог ниже, чем «расход ${GOALS[t.goal].sign < 0 ? '−' : '+'}${t.pct}%».` : t.clamped === 'min' ? ' Углеводы подняты до нижней границы диапазона.' : ''}`
      : 'Без % жира норма считается по общему весу и формуле Миффлина — Сан Жеора. Определите % жира — расчёт станет точнее, по сухой массе.'}</p>
  </div>` : ''}
  <div class="card">${sectionHead('% жира', 'fatHelp', {}, 'Как определить')}
    ${fat ? `<div class="kv"><span>Сейчас</span><b>${dec(fat.fat)}% · ${{ scale: 'весы Picooc', photo: 'оценка по фото', navy: 'по обхватам', look: 'на глаз', manual: 'вручную' }[fat.source] || ''}</b></div>` : '<p class="small">Нужен для расчёта сухой массы. Весы Picooc показывают его сами — либо определите здесь.</p>'}
    <div class="fat-btns">
      <button class="btn ghost" data-act="fatPhoto">📷 По фото</button>
      <button class="btn ghost" data-act="fatNavy">📏 По обхватам</button>
      <button class="btn ghost" data-act="fatLook">👁 На глаз</button>
      <button class="btn ghost" data-act="fatManual">✎ Вручную</button>
    </div>
  </div>
  <div class="card">${sectionHead('Параметры', 'editProfile', {}, filled ? 'Изменить' : 'Заполнить')}
    ${filled ? `
      <div class="kv"><span>Пол, возраст, рост</span><b>${pr.sex === 'f' ? 'жен.' : 'муж.'}, ${pr.age}, ${pr.height} см</b></div>
      <div class="kv"><span>Активность</span><b>${esc(ACTIVITY[pr.activity] || '').split(' — ')[0]}</b></div>
      <div class="kv"><span>Цель</span><b>${GOALS[pr.goal]?.name || ''}${pr.goal !== 'keep' ? ` · ${pr.pct || 15}%` : ''}</b></div>`
      : empty('🎯', 'Укажите пол, возраст, рост, вес, активность и цель — посчитаю норму КБЖУ по методике тренера.', '<button class="btn primary" data-act="editProfile">Заполнить параметры</button>')}
  </div>`;
}

/* ================= Действия ================= */
const healthActions = {
  dayPrev: () => { day = addDays(day, -1); rerender(); },
  dayNext: () => { if (day < today()) { day = addDays(day, 1); rerender(); } },
  scan: (d) => scanFlow(d.meal),
  pick: (d) => pickFood(d.meal),
  newFood: () => foodForm(null, {}, (f) => entrySheet(f)),
  editEntry: (d) => {
    const e = dayLog(day).find((x) => x.id === d.id);
    if (!e) return;
    // Если продукт уже удалён из базы — восстановим КБЖУ на 100 г из самой записи
    const k = 100 / (e.grams || 100);
    const f = H().foods.find((x) => x.id === e.foodId) || { id: e.foodId, name: e.name, kcal: r1(e.kcal * k), p: r1(e.p * k), f: r1(e.f * k), c: r1(e.c * k) };
    entrySheet(f, null, e);
  },
  copyYesterday: () => {
    const prev = dayLog(addDays(day, -1));
    H().log[day] = prev.map((x) => ({ ...x, id: uid() }));
    commit(); toast('Скопировано');
  },
  addWeight: () => weightForm(),
  editWeight: (d) => weightForm(H().weights.find((w) => w.date === d.date)),
  addSteps: () => formSheet({
    title: 'Шаги', values: { date: today(), steps: H().steps[today()] || '' },
    fields: [{ name: 'date', label: 'Дата', type: 'date', required: true, half: true }, { name: 'steps', label: 'Шагов', type: 'number', required: true, half: true }],
    onSubmit: (v) => { H().steps[v.date] = Math.max(0, Math.round(v.steps)); commit(); },
  }),
  editSteps: () => formSheet({
    title: 'Цель по шагам', values: { stepGoal: H().stepGoal },
    fields: [{ name: 'stepGoal', label: 'Шагов в день', type: 'number', required: true }],
    onSubmit: (v) => { H().stepGoal = Math.max(1000, Math.round(v.stepGoal)); commit(); },
  }),
  sync: () => syncFromHealth(),
  syncHelp: () => syncHelp(),
  editProfile: () => profileForm(),
  fatHelp: () => openSheet(`<div class="sheet-head"><h2>% жира</h2><button class="icon-btn" data-close>✕</button></div>
    <div class="help"><p><b>Весы Picooc</b> — самый простой путь: включите в приложении Picooc передачу в Apple Health, и % жира будет приходить вместе с весом.</p>
    <p><b>По фото</b> — Claude оценивает % жира по снимку торса, как это делает тренер по фото-эталонам. Нужен ваш ключ Claude API.</p>
    <p><b>По обхватам</b> — формула ВМС США по талии и шее. Сантиметр и 2 минуты, погрешность ±3–4%.</p>
    <p><b>На глаз</b> — выберите описание, которое больше похоже на вас.</p>
    <p class="muted small">Сухая масса = вес × (1 − % жира). Например: 86 кг и 20% жира → 68,8 кг сухой массы.</p></div>`),
  fatPhoto: () => fatPhotoSheet(),
  fatNavy: () => fatNavySheet(),
  fatLook: () => fatLookSheet(),
  fatManual: () => formSheet({
    title: '% жира', values: { fat: latestFat()?.fat || '' },
    fields: [{ name: 'fat', label: 'Процент жира', type: 'number', required: true, placeholder: 'например, 18' }],
    onSubmit: (v) => { if (!(v.fat > 2 && v.fat < 70)) { toast('Проверьте число'); return false; } setFat(v.fat, 'manual'); },
  }),
};

function setFat(fat, source) {
  Object.assign(H().profile, { fat: r1(fat), fatDate: today(), fatSource: source });
  commit(); toast(`% жира: ${dec(fat)}% — норма пересчитана`);
}

/* ---------- Продукты и записи ---------- */
async function scanFlow(meal) {
  openScanner(async (code) => {
    toast('Ищу продукт…');
    const { food, source } = await lookupBarcode(code);
    if (source === 'local') return entrySheet(food, meal);
    const complete = food && food.name && [food.kcal, food.p, food.f, food.c].every((v) => v != null);
    if (complete) {
      const saved = saveFood({ ...food });
      toast('Найдено в базе Open Food Facts');
      return entrySheet(saved, meal);
    }
    toast(source === 'error' ? 'Нет связи с базой — заполните вручную' : food ? 'Нашёл не всё — дополните с упаковки' : 'Продукта нет в базе — перепишите КБЖУ с упаковки, один раз');
    foodForm(null, { ...(food || {}), barcode: code }, (f) => entrySheet(f, meal));
  });
}

function saveFood(data, existing) {
  if (existing) { Object.assign(existing, data); commit(); return existing; }
  const f = { id: uid(), uses: 0, lastUsed: '', createdAt: new Date().toISOString(), ...data };
  H().foods.push(f);
  commit();
  return f;
}

function foodForm(existing, preset = {}, after) {
  formSheet({
    title: existing ? 'Продукт' : 'Новый продукт',
    values: existing ? { ...existing } : preset,
    fields: [
      { name: 'name', label: 'Название', required: true, placeholder: 'Творог 5%, куриная грудка…' },
      { name: 'brand', label: 'Бренд', half: true },
      { name: 'barcode', label: 'Штрихкод', half: true, placeholder: 'необязательно' },
      { name: 'h', label: 'На 100 г продукта', type: 'heading' },
      { name: 'kcal', label: 'Ккал', type: 'number', required: true, half: true },
      { name: 'p', label: 'Белки, г', type: 'number', required: true, half: true },
      { name: 'f', label: 'Жиры, г', type: 'number', required: true, half: true },
      { name: 'c', label: 'Углеводы, г', type: 'number', required: true, half: true },
      { name: 'portion', label: 'Вес 1 шт./порции, г', type: 'number', placeholder: 'например, яйцо — 55', hint: 'Необязательно: появится кнопка «1 шт.»' },
    ],
    onSubmit: (v) => {
      const f = saveFood(v, existing);
      toast(existing ? 'Сохранено' : 'Продукт сохранён');
      if (after) setTimeout(() => after(f), 300);
    },
    onDelete: existing ? () => { H().foods.splice(H().foods.indexOf(existing), 1); commit(); } : null,
  });
}

function pickFood(meal) {
  const list = foodsByUse();
  openSheet(`
    <div class="sheet-head"><h2>Продукты</h2><button class="icon-btn" data-close aria-label="Закрыть">✕</button></div>
    <div class="quick two"><button data-k="scan"><span>▥</span>Сканировать</button><button data-k="new"><span>+</span>Новый продукт</button></div>
    ${list.length ? `<input class="search" type="search" placeholder="Поиск" data-q>
      <div class="list">${list.map((f) => `<div class="row tap" data-food="${f.id}" data-text="${esc(`${f.name} ${f.brand || ''}`.toLowerCase())}">
        <div class="row-main"><div class="row-title">${esc(f.name)}</div><div class="row-sub">${esc([f.brand, `${r0(f.kcal)} ккал · Б ${dec(f.p)} Ж ${dec(f.f)} У ${dec(f.c)} на 100 г`].filter(Boolean).join(' · '))}</div></div>
        <button class="mini" data-editfood="${f.id}" aria-label="Изменить">✎</button></div>`).join('')}</div>`
      : empty('🥗', 'Здесь появятся продукты, которые вы сканировали или добавляли. Вводить КБЖУ нужно только один раз.')}`,
  (panel) => {
    panel.querySelector('[data-k="scan"]').onclick = () => { closeSheet(true); scanFlow(meal); };
    panel.querySelector('[data-k="new"]').onclick = () => foodForm(null, {}, (f) => entrySheet(f, meal));
    panel.querySelector('[data-q]')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      panel.querySelectorAll('[data-food]').forEach((el) => (el.hidden = q && !el.dataset.text.includes(q)));
    });
    panel.querySelectorAll('[data-food]').forEach((el) => el.addEventListener('click', (e) => {
      const f = H().foods.find((x) => x.id === el.dataset.food);
      if (e.target.closest('[data-editfood]')) return foodForm(f);
      entrySheet(f, meal);
    }));
  });
}

/** Шторка ввода граммовки: КБЖУ считается на лету */
function entrySheet(food, meal, entry) {
  const grams0 = entry?.grams || food.lastGrams || 100;
  const m0 = entry?.meal || meal || defaultMeal();
  const quick = [50, 100, 150, 200, 250];
  openSheet(`
    <form class="form entry" novalidate>
      <div class="sheet-head"><h2>${esc(food.name)}</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">✕</button></div>
      <p class="muted small">${esc([food.brand, `на 100 г: ${r0(food.kcal)} ккал · Б ${dec(food.p)} · Ж ${dec(food.f)} · У ${dec(food.c)}`].filter(Boolean).join(' · '))}</p>
      <label class="grams"><input name="grams" type="text" inputmode="decimal" value="${grams0}" autocomplete="off"><span>г</span></label>
      <div class="chips static">${quick.map((g) => `<button type="button" class="chip" data-g="${g}">${g} г</button>`).join('')}${food.portion ? `<button type="button" class="chip" data-g="${food.portion}">1 шт. · ${food.portion} г</button>` : ''}</div>
      <div class="entry-sum" data-sum></div>
      <div class="seg">${Object.entries(MEALS).map(([k, m]) => `<label><input type="radio" name="meal" value="${k}" ${k === m0 ? 'checked' : ''}><span>${m.icon} ${m.name}</span></label>`).join('')}</div>
      <div class="form-actions">${entry ? '<button type="button" class="btn ghost danger" data-del>Удалить</button>' : ''}<button class="btn primary" type="submit">${entry ? 'Сохранить' : 'Добавить'}</button></div>
    </form>`,
  (panel) => {
    const form = panel.querySelector('form');
    const input = form.elements.grams;
    const grams = () => Number(String(input.value).replace(',', '.')) || 0;
    const upd = () => {
      const m = macrosFor(food, grams());
      panel.querySelector('[data-sum]').innerHTML = `<b>${num(m.kcal)} ккал</b><span>Б ${dec(m.p)}</span><span>Ж ${dec(m.f)}</span><span>У ${dec(m.c)}</span>`;
    };
    input.addEventListener('input', upd);
    panel.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => { input.value = b.dataset.g; upd(); }));
    upd();
    setTimeout(() => { input.focus(); input.select(); }, 350);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const g = grams();
      if (g <= 0) { toast('Введите граммовку'); return; }
      const m = macrosFor(food, g);
      const data = { foodId: food.id, name: food.name, grams: g, meal: form.querySelector('input[name="meal"]:checked').value, ...m };
      const list = (H().log[day] ||= []);
      if (entry) Object.assign(entry, data);
      else list.push({ id: uid(), time: new Date().toTimeString().slice(0, 5), ...data });
      const f = H().foods.find((x) => x.id === data.foodId);
      if (f && !entry) { f.uses = (f.uses || 0) + 1; f.lastUsed = new Date().toISOString(); f.lastGrams = g; }
      commit(); closeSheet();
      toast(entry ? 'Сохранено' : `+${num(m.kcal)} ккал`);
    });
    panel.querySelector('[data-del]')?.addEventListener('click', () => {
      const list = H().log[day] || [];
      list.splice(list.indexOf(entry), 1);
      commit(); closeSheet();
    });
  });
}

/* ---------- Вес ---------- */
function weightForm(existing) {
  formSheet({
    title: existing ? 'Вес' : 'Записать вес',
    values: existing ? { ...existing } : { date: today(), weight: latestWeight() || '' },
    fields: [
      { name: 'date', label: 'Дата', type: 'date', required: true },
      { name: 'weight', label: 'Вес, кг', type: 'number', required: true, half: true },
      { name: 'fat', label: '% жира', type: 'number', half: true, placeholder: 'если известно' },
    ],
    onSubmit: (v) => {
      if (!(v.weight > 20 && v.weight < 400)) { toast('Проверьте вес'); return false; }
      const list = H().weights;
      const same = list.find((w) => w.date === v.date && w !== existing);
      if (same) list.splice(list.indexOf(same), 1);
      if (existing) Object.assign(existing, { ...v, fat: v.fat || null });
      else list.push({ date: v.date, weight: r1(v.weight), fat: v.fat ? r1(v.fat) : null, source: 'manual' });
      commit();
    },
    onDelete: existing ? () => { H().weights.splice(H().weights.indexOf(existing), 1); commit(); } : null,
  });
}

/* ---------- Параметры ---------- */
function profileForm() {
  const pr = H().profile;
  formSheet({
    title: 'Параметры',
    values: { ...pr, weight: latestWeight() || pr.weight, pct: String(pr.pct || 15) },
    fields: [
      { name: 'sex', label: 'Пол', type: 'seg', options: [['m', 'Мужской'], ['f', 'Женский']] },
      { name: 'age', label: 'Возраст', type: 'number', required: true, half: true },
      { name: 'height', label: 'Рост, см', type: 'number', required: true, half: true },
      { name: 'weight', label: 'Вес, кг', type: 'number', required: true, hint: 'Потом будет браться с весов автоматически' },
      { name: 'activity', label: 'Активность', type: 'select', options: Object.entries(ACTIVITY) },
      { name: 'goal', label: 'Цель', type: 'seg', options: Object.entries(GOALS).map(([k, g]) => [k, g.name]) },
      { name: 'pct', label: 'Насколько менять калории', type: 'seg', options: [['10', '10%'], ['15', '15%'], ['20', '20%']], show: (x) => x.goal !== 'keep' },
      { name: 'manual', label: 'Задать норму вручную', type: 'toggle' },
      { name: 'kcal', label: 'Ккал', type: 'number', half: true, show: (x) => x.manual },
      { name: 'p', label: 'Белки, г', type: 'number', half: true, show: (x) => x.manual },
      { name: 'f', label: 'Жиры, г', type: 'number', half: true, show: (x) => x.manual },
      { name: 'c', label: 'Углеводы, г', type: 'number', half: true, show: (x) => x.manual },
    ],
    onSubmit: (v) => {
      if (v.manual && !v.kcal) { toast('Укажите калории'); return false; }
      v.pct = Number(v.pct) || 15;
      const hadWeights = H().weights.length;
      Object.assign(pr, v);
      if (!hadWeights && v.weight) H().weights.push({ date: today(), weight: r1(v.weight), fat: null, source: 'manual' });
      commit(); toast('Норма пересчитана');
    },
  });
}

/* ---------- % жира: по обхватам ---------- */
function fatNavySheet() {
  const pr = H().profile;
  formSheet({
    title: 'По обхватам',
    values: { height: pr.height, waist: pr.waist, neck: pr.neck, hip: pr.hip },
    fields: [
      { name: 'height', label: 'Рост, см', type: 'number', required: true, half: true },
      { name: 'neck', label: 'Шея, см', type: 'number', required: true, half: true, hint: 'Под кадыком' },
      { name: 'waist', label: 'Талия, см', type: 'number', required: true, half: true, hint: 'На уровне пупка, на выдохе' },
      { name: 'hip', label: 'Бёдра, см', type: 'number', half: true, show: () => pr.sex === 'f', hint: 'По самой широкой части' },
    ],
    submitLabel: 'Рассчитать',
    onSubmit: (v) => {
      const fat = navyFat({ sex: pr.sex, ...v });
      if (!fat || fat < 3 || fat > 60) { toast('Проверьте замеры'); return false; }
      Object.assign(pr, { waist: v.waist, neck: v.neck, hip: v.hip, height: pr.height || v.height });
      setFat(fat, 'navy');
    },
  });
}

/* ---------- % жира: на глаз ---------- */
function fatLookSheet() {
  openSheet(`<div class="sheet-head"><h2>На глаз</h2><button class="icon-btn" data-close>✕</button></div>
    <p class="muted small">Встаньте перед зеркалом при хорошем свете и выберите, что больше похоже на вас.</p>
    <div class="list">${FAT_LOOKS.map(([v, l, d]) => `<button class="row tap look" data-v="${v}"><div class="row-icon">${l}</div><div class="row-main"><div class="row-sub">${esc(d)}</div></div></button>`).join('')}</div>`,
  (panel) => panel.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { closeSheet(); setFat(Number(b.dataset.v), 'look'); })));
}

/* ---------- % жира: по фото (Claude) ---------- */
function fatPhotoSheet() {
  const pr = H().profile;
  const hasKey = !!getApiKey();
  openSheet(`<div class="sheet-head"><h2>По фото</h2><button class="icon-btn" data-close>✕</button></div>
    <div class="help small">
      <p>Сфотографируйтесь по пояс, без футболки, анфас, при ровном свете, руки слегка в стороны. Claude оценит % жира, как тренер по фото-эталонам.</p>
      <p class="muted">Фото уменьшается и отправляется напрямую в Anthropic с вашим ключом. В планере оно не сохраняется. Это ориентир — точнее всего весы или обхваты.</p>
    </div>
    <div class="field"><label for="ak">Ключ Claude API</label><input id="ak" type="password" autocomplete="off" placeholder="sk-ant-…" value="${hasKey ? '••••••••' : ''}" data-key>
      <small>Хранится только на этом телефоне и не попадает в резервные копии. Получить: console.anthropic.com → API Keys.</small></div>
    <img class="fat-preview" hidden alt="">
    <p class="fat-result" hidden></p>
    <label class="btn primary full file-btn">📷 Сделать или выбрать фото<input type="file" accept="image/*" capture="user" hidden data-photo></label>`,
  (panel) => {
    const keyInput = panel.querySelector('[data-key]');
    keyInput.addEventListener('change', () => { if (keyInput.value && !keyInput.value.startsWith('•')) { setApiKey(keyInput.value); toast('Ключ сохранён'); } });
    panel.querySelector('[data-photo]').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (keyInput.value && !keyInput.value.startsWith('•')) setApiKey(keyInput.value);
      const out = panel.querySelector('.fat-result');
      const img = panel.querySelector('.fat-preview');
      out.hidden = false; out.className = 'fat-result'; out.textContent = 'Готовлю фото…';
      try {
        const { base64, preview } = await prepareImage(file);
        img.src = preview; img.hidden = false;
        out.textContent = 'Claude оценивает… обычно 10–30 секунд';
        const r = await estimateBodyFat({ base64, sex: pr.sex, age: pr.age, height: pr.height, weight: latestWeight() });
        const conf = { low: 'низкая', medium: 'средняя', high: 'высокая' }[r.confidence] || '';
        out.innerHTML = `<b class="fat-num">${dec(r.fat)}%</b><span>диапазон ${dec(r.low)}–${dec(r.high)}% · уверенность: ${conf}</span><span class="muted">${esc(r.notes)}</span><button class="btn primary full" data-save>Сохранить ${dec(r.fat)}%</button>`;
        out.querySelector('[data-save]').addEventListener('click', () => { closeSheet(); setFat(r.fat, 'photo'); });
      } catch (err) {
        out.className = 'fat-result danger-text';
        out.textContent = AI_ERRORS[err.message] || 'Не получилось. Попробуйте ещё раз.';
      }
    });
  });
}

/* ---------- Синхронизация ---------- */
async function syncFromHealth() {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { /* нет доступа — покажем поле */ }
  const data = parseHealthText(text);
  if (Object.keys(data).length) return applySync(data);
  openSheet(`<div class="sheet-head"><h2>Из «Здоровья»</h2><button class="icon-btn" data-close>✕</button></div>
    <p class="small">${text ? 'В буфере нет данных о шагах или весе.' : 'Не удалось прочитать буфер обмена.'} Запустите команду «Планер: Здоровье» и нажмите кнопку ещё раз — или вставьте текст сюда:</p>
    <textarea class="search" rows="4" placeholder="шаги: 8432&#10;вес: 82,4&#10;жир: 18,2" data-t></textarea>
    <button class="btn primary full" data-ok>Загрузить</button>
    <button class="btn ghost full" data-help>Как настроить команду</button>`,
  (panel) => {
    panel.querySelector('[data-ok]').addEventListener('click', () => {
      const d = parseHealthText(panel.querySelector('[data-t]').value);
      if (!Object.keys(d).length) { toast('Не нашёл ни шагов, ни веса'); return; }
      closeSheet(); applySync(d);
    });
    panel.querySelector('[data-help]').addEventListener('click', syncHelp);
  });
}

function applySync(data) {
  applyHealth(data);
  commit();
  toast([data.steps != null ? `Шаги: ${num(data.steps)}` : '', data.weight != null ? `Вес: ${dec(data.weight)} кг` : '', data.fat != null ? `Жир: ${dec(data.fat)}%` : ''].filter(Boolean).join(' · ') + ' ✓');
}

function syncHelp() {
  openSheet(`<div class="sheet-head"><h2>Настройка</h2><button class="icon-btn" data-close>✕</button></div>
  <div class="help">
    <h3>1. Весы Picooc → «Здоровье»</h3>
    <p>В приложении Picooc: «Я» → «Настройки» → <b>Apple Health</b> → включить. После взвешивания вес и % жира появятся в «Здоровье».</p>
    <h3>2. Команда «Планер: Здоровье»</h3>
    <p>Откройте приложение <b>«Команды»</b> → «+» → назовите «Планер: Здоровье» и добавьте действия:</p>
    <ol>
      <li><b>Найти образцы здоровья</b>: тип «Шаги», дата начала — «Сегодня». Затем <b>Вычислить статистику</b>: «Сумма». Нажмите на результат → «Переименовать» → <i>Шаги</i>.</li>
      <li><b>Найти образцы здоровья</b>: тип «Вес», сортировка по дате начала — «Сначала новые», ограничение — 1.</li>
      <li><b>Найти образцы здоровья</b>: тип «Процент жира», сортировка — «Сначала новые», ограничение — 1.</li>
      <li><b>Текст</b>, через «Выбрать переменную» вставьте результаты:<pre>шаги: [Шаги]
вес: [Образцы здоровья (вес)]
жир: [Образцы здоровья (жир)]</pre></li>
      <li><b>Скопировать в буфер обмена</b>.</li>
    </ol>
    <p>При первом запуске разрешите команде доступ к «Здоровью».</p>
    <h3>3. Каждый день</h3>
    <p>Запустите команду (удобно добавить её на экран «Домой» или повесить на двойное касание задней крышки: «Настройки» → «Универсальный доступ» → «Касание» → «Касание задней панели»), откройте планер → «Здоровье» → <b>«⟳ Из «Здоровья»»</b> → «Вставить».</p>
    <p class="muted small">Планер понимает текст в любом порядке, с единицами («кг», «шаг.», «%») и запятыми. Если весы не мерят жир — строку «жир» можно не добавлять.</p>
  </div>`);
}

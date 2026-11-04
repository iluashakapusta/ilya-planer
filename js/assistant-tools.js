// Инструменты ассистента: чтение и запись данных планера.
// Всё выполняется здесь, на телефоне; Claude только решает, что вызвать.
import { db, commit } from './store.js';
import { uid, today, addDays, sum } from './utils.js';
import { CATS, CAT, AREAS, MEET_TYPES } from './const.js';
import { MEALS, calcTargets, latestWeight, latestFat, dayLog, totals, r0, r1, macrosFor } from './nutrition.js';
import { paymentDate, isPaid } from './agenda.js';

const DATE = { type: 'string', description: 'Дата в формате ГГГГ-ММ-ДД' };
const ok = (data) => ({ ok: true, ...data });

export const TOOLS = [
  {
    name: 'get_planner_data',
    description: 'Прочитать данные планера. Вызывай перед ответом на вопросы о делах, встречах, расходах, питании, весе и шагах, а также чтобы найти id записи для изменения.',
    input_schema: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: ['overview', 'tasks', 'meetings', 'projects', 'expenses', 'payments', 'nutrition', 'body', 'foods', 'notes'], description: 'overview — сводка на сегодня; nutrition — съеденное и норма КБЖУ; body — вес, % жира, шаги; foods — сохранённые продукты' },
        date_from: DATE,
        date_to: DATE,
      },
      required: ['section'],
    },
  },
  {
    name: 'add_expense',
    description: 'Записать расход.',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Сумма в рублях' },
        category: { type: 'string', enum: CATS.map((c) => c.id), description: CATS.map((c) => `${c.id} — ${c.name}`).join('; ') },
        title: { type: 'string', description: 'На что потрачено' },
        date: DATE,
        method: { type: 'string', enum: ['card', 'cash'] },
        note: { type: 'string' },
      },
      required: ['amount', 'category', 'title'],
    },
  },
  {
    name: 'add_task',
    description: 'Добавить задачу (рабочую) или дело (личное/домашнее).',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        area: { type: 'string', enum: Object.keys(AREAS), description: 'work — работа, personal — личное, home — дом' },
        due: { ...DATE, description: 'Срок, ГГГГ-ММ-ДД. Пусто — без срока' },
        time: { type: 'string', description: 'ЧЧ:ММ' },
        priority: { type: 'string', enum: ['high', 'mid', 'low'] },
        repeat: { type: 'string', enum: ['none', 'daily', 'weekdays', 'weekly', 'monthly'] },
        subtasks: { type: 'array', items: { type: 'string' } },
        project_id: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['title', 'area'],
    },
  },
  {
    name: 'update_task',
    description: 'Изменить задачу или отметить выполненной. id бери из get_planner_data.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' }, done: { type: 'boolean' }, title: { type: 'string' }, due: DATE, time: { type: 'string' },
        priority: { type: 'string', enum: ['high', 'mid', 'low'] }, note: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_meeting',
    description: 'Добавить встречу, созвон или событие.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' }, date: DATE, time: { type: 'string', description: 'Начало, ЧЧ:ММ' }, end: { type: 'string', description: 'Конец, ЧЧ:ММ' },
        type: { type: 'string', enum: Object.keys(MEET_TYPES) }, place: { type: 'string' }, people: { type: 'string' }, note: { type: 'string' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'log_food',
    description: 'Записать съеденное в дневник питания. Укажи food_id сохранённого продукта ИЛИ КБЖУ на 100 г.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        grams: { type: 'number' },
        meal: { type: 'string', enum: Object.keys(MEALS), description: 'breakfast — завтрак, lunch — обед, dinner — ужин, snack — перекус' },
        date: DATE,
        food_id: { type: 'string' },
        kcal_100: { type: 'number' }, p_100: { type: 'number' }, f_100: { type: 'number' }, c_100: { type: 'number' },
      },
      required: ['name', 'grams', 'meal'],
    },
  },
  {
    name: 'save_food',
    description: 'Сохранить продукт или своё блюдо (рецепт) в базу продуктов с КБЖУ на 100 г, чтобы потом вводить только граммовку. Для блюда из нескольких ингредиентов сначала посчитай КБЖУ на 100 г готового блюда.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' }, brand: { type: 'string' },
        kcal_100: { type: 'number' }, p_100: { type: 'number' }, f_100: { type: 'number' }, c_100: { type: 'number' },
        portion_g: { type: 'number', description: 'Вес 1 шт./порции, г (необязательно)' },
        recipe: { type: 'string', description: 'Состав блюда для справки (необязательно)' },
      },
      required: ['name', 'kcal_100', 'p_100', 'f_100', 'c_100'],
    },
  },
  {
    name: 'add_weight',
    description: 'Записать вес и, если известно, % жира.',
    input_schema: { type: 'object', properties: { weight: { type: 'number' }, fat: { type: 'number' }, date: DATE }, required: ['weight'] },
  },
  {
    name: 'add_note',
    description: 'Создать заметку.',
    input_schema: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' }, pinned: { type: 'boolean' } }, required: ['text'] },
  },
  {
    name: 'delete_item',
    description: 'Удалить запись, если пользователь просит или нужно исправить свою ошибку.',
    input_schema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['expense', 'task', 'meeting', 'food_entry', 'food', 'note', 'weight'] }, id: { type: 'string', description: 'id записи; для weight — дата' } },
      required: ['kind', 'id'],
    },
  },
];

/** Короткие подписи для чата */
export const TOOL_LABELS = {
  get_planner_data: null,
  add_expense: (i) => `Расход: ${r0(i.amount)} ₽ — ${i.title}`,
  add_task: (i) => `${i.area === 'work' ? 'Задача' : 'Дело'}: ${i.title}`,
  update_task: (i) => (i.done ? 'Задача выполнена' : 'Задача изменена'),
  add_meeting: (i) => `Встреча: ${i.title}, ${i.date}${i.time ? ` ${i.time}` : ''}`,
  log_food: (i) => `${MEALS[i.meal]?.name || 'Еда'}: ${i.name}, ${r0(i.grams)} г`,
  save_food: (i) => `Продукт сохранён: ${i.name}`,
  add_weight: (i) => `Вес: ${i.weight} кг`,
  add_note: (i) => `Заметка: ${i.title || String(i.text).slice(0, 30)}`,
  delete_item: () => 'Запись удалена',
};

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null && o[k] !== '').map((k) => [k, o[k]]));
const inRange = (d, from, to) => d && (!from || d >= from) && (!to || d <= to);

function readSection({ section, date_from, date_to }) {
  const t = today();
  switch (section) {
    case 'overview': {
      const tg = calcTargets();
      const eaten = totals(dayLog(t));
      return {
        today: t,
        tasks_due: db.tasks.filter((x) => !x.done && x.due && x.due <= t).map((x) => pick(x, ['id', 'title', 'area', 'due', 'time', 'priority'])),
        meetings_today: db.meetings.filter((m) => m.date === t).map((m) => pick(m, ['id', 'title', 'time', 'end', 'place', 'done'])),
        spent_today: sum(db.expenses.filter((e) => e.date === t)),
        spent_month: sum(db.expenses.filter((e) => e.date.startsWith(t.slice(0, 7)))),
        kcal_eaten: r0(eaten.kcal), kcal_target: tg?.kcal ?? null,
        steps_today: db.health.steps[t] ?? null, weight: latestWeight(),
      };
    }
    case 'tasks': {
      const list = db.tasks.filter((x) => !x.done || inRange((x.doneAt || '').slice(0, 10), date_from || addDays(t, -7), date_to));
      return { tasks: list.slice(-150).map((x) => ({ ...pick(x, ['id', 'title', 'area', 'due', 'time', 'priority', 'repeat', 'done', 'note', 'projectId']), subtasks: (x.subtasks || []).map((s) => `${s.done ? '✓' : '○'} ${s.text}`) })) };
    }
    case 'meetings':
      return { meetings: db.meetings.filter((m) => inRange(m.date, date_from || addDays(t, -14), date_to || addDays(t, 60))).map((m) => pick(m, ['id', 'title', 'date', 'time', 'end', 'type', 'place', 'people', 'note', 'done'])) };
    case 'projects':
      return { projects: db.projects.map((p) => ({ ...pick(p, ['id', 'title', 'client', 'status', 'deadline', 'note']), tasks_open: db.tasks.filter((x) => x.projectId === p.id && !x.done).length, tasks_done: db.tasks.filter((x) => x.projectId === p.id && x.done).length })) };
    case 'expenses': {
      const from = date_from || `${t.slice(0, 7)}-01`, to = date_to || t;
      const list = db.expenses.filter((e) => inRange(e.date, from, to));
      const byCat = {};
      for (const e of list) byCat[CAT[e.category]?.name || e.category] = (byCat[CAT[e.category]?.name || e.category] || 0) + Number(e.amount || 0);
      return { from, to, total: sum(list), by_category: byCat, budgets: db.settings.budgets, items: list.slice(-120).map((e) => pick(e, ['id', 'date', 'amount', 'category', 'title', 'method', 'note'])) };
    }
    case 'payments': {
      const ym = t.slice(0, 7);
      return { payments: db.payments.map((p) => ({ ...pick(p, ['id', 'title', 'amount', 'day', 'category', 'active']), due_this_month: paymentDate(p, ym), paid_this_month: isPaid(p, ym) })) };
    }
    case 'nutrition': {
      const from = date_from || t, to = date_to || t;
      const days = {};
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const items = dayLog(d);
        if (!items.length) continue;
        const s = totals(items);
        days[d] = { total: { kcal: r0(s.kcal), p: r1(s.p), f: r1(s.f), c: r1(s.c) }, items: items.map((x) => ({ id: x.id, meal: x.meal, name: x.name, grams: x.grams, kcal: r0(x.kcal), p: r1(x.p), f: r1(x.f), c: r1(x.c) })) };
        if (Object.keys(days).length > 31) break;
      }
      const tg = calcTargets();
      return { targets: tg && pick(tg, ['kcal', 'p', 'f', 'c', 'goal', 'pct', 'lbm', 'tdee', 'formula', 'manual']), days };
    }
    case 'body': {
      const from = date_from || addDays(t, -30);
      return {
        profile: pick(db.health.profile, ['sex', 'age', 'height', 'activity', 'goal', 'pct']),
        latest_weight: latestWeight(), latest_fat: latestFat(),
        weights: db.health.weights.filter((w) => w.date >= from).map((w) => pick(w, ['date', 'weight', 'fat'])),
        steps: Object.fromEntries(Object.entries(db.health.steps).filter(([d]) => d >= from)), step_goal: db.health.stepGoal,
      };
    }
    case 'foods':
      return { foods: db.health.foods.map((f) => pick(f, ['id', 'name', 'brand', 'kcal', 'p', 'f', 'c', 'portion', 'uses'])) };
    case 'notes':
      return { notes: db.notes.map((n) => ({ id: n.id, title: n.title, text: String(n.text || '').slice(0, 500), pinned: !!n.pinned })) };
    default:
      return { error: 'Неизвестный раздел' };
  }
}

const now = () => new Date().toISOString();

/** Выполнить инструмент. Возвращает объект — он уйдёт обратно в Claude */
export function runTool(name, input = {}) {
  const t = today();
  switch (name) {
    case 'get_planner_data':
      return readSection(input);
    case 'add_expense': {
      if (!(input.amount > 0)) return { error: 'Сумма должна быть больше нуля' };
      const e = { id: uid(), createdAt: now(), amount: Number(input.amount), category: CAT[input.category] ? input.category : 'other', title: input.title || '', date: input.date || t, time: '', method: input.method || 'card', note: input.note || '' };
      db.expenses.push(e); commit();
      return ok({ id: e.id });
    }
    case 'add_task': {
      const x = { id: uid(), createdAt: now(), title: input.title, area: AREAS[input.area] ? input.area : 'personal', due: input.due ?? t, time: input.time || '', priority: input.priority || 'mid', repeat: input.repeat || 'none', note: input.note || '', projectId: input.project_id || '', done: false, subtasks: (input.subtasks || []).map((text) => ({ id: uid(), text, done: false })) };
      db.tasks.push(x); commit();
      return ok({ id: x.id });
    }
    case 'update_task': {
      const x = db.tasks.find((y) => y.id === input.id);
      if (!x) return { error: 'Задача не найдена' };
      for (const k of ['title', 'due', 'time', 'priority', 'note']) if (input[k] != null) x[k] = input[k];
      if (input.done != null) { x.done = !!input.done; x.doneAt = x.done ? now() : null; }
      commit();
      return ok({ id: x.id });
    }
    case 'add_meeting': {
      const m = { id: uid(), createdAt: now(), title: input.title, date: input.date || t, time: input.time || '', end: input.end || '', type: MEET_TYPES[input.type] ? input.type : 'meeting', place: input.place || '', people: input.people || '', link: '', note: input.note || '', projectId: '', done: false };
      db.meetings.push(m); commit();
      return ok({ id: m.id });
    }
    case 'log_food': {
      let food = input.food_id ? db.health.foods.find((f) => f.id === input.food_id) : null;
      if (!food) {
        if (input.kcal_100 == null) return { error: 'Нужен food_id или КБЖУ на 100 г' };
        food = { id: '', name: input.name, kcal: input.kcal_100, p: input.p_100 || 0, f: input.f_100 || 0, c: input.c_100 || 0 };
      }
      const grams = Number(input.grams) || 0;
      if (grams <= 0) return { error: 'Граммовка должна быть больше нуля' };
      const m = macrosFor(food, grams);
      const date = input.date || t;
      const entry = { id: uid(), foodId: food.id, name: input.name || food.name, grams, meal: MEALS[input.meal] ? input.meal : 'snack', time: new Date().toTimeString().slice(0, 5), ...m };
      (db.health.log[date] ||= []).push(entry);
      if (food.id) { food.uses = (food.uses || 0) + 1; food.lastUsed = now(); food.lastGrams = grams; }
      commit();
      const s = totals(dayLog(date)), tg = calcTargets();
      return ok({ id: entry.id, entry_kcal: r0(m.kcal), day_total_kcal: r0(s.kcal), day_target_kcal: tg?.kcal ?? null });
    }
    case 'save_food': {
      const existing = db.health.foods.find((f) => f.name.toLowerCase() === String(input.name).toLowerCase());
      const data = { name: input.name, brand: input.brand || '', kcal: r1(input.kcal_100), p: r1(input.p_100), f: r1(input.f_100), c: r1(input.c_100), portion: input.portion_g || null, recipe: input.recipe || '' };
      if (existing) Object.assign(existing, data);
      else db.health.foods.push({ id: uid(), uses: 0, lastUsed: '', createdAt: now(), ...data });
      commit();
      return ok({ id: (existing || db.health.foods[db.health.foods.length - 1]).id, updated: !!existing });
    }
    case 'add_weight': {
      const w = Number(input.weight);
      if (!(w > 20 && w < 400)) return { error: 'Странный вес' };
      const date = input.date || t;
      const ex = db.health.weights.find((x) => x.date === date);
      if (ex) Object.assign(ex, { weight: r1(w), fat: input.fat ? r1(input.fat) : ex.fat });
      else db.health.weights.push({ date, weight: r1(w), fat: input.fat ? r1(input.fat) : null, source: 'manual' });
      commit();
      return ok({ date });
    }
    case 'add_note': {
      const n = { id: uid(), createdAt: now(), updatedAt: now(), title: input.title || '', text: input.text || '', pinned: !!input.pinned };
      db.notes.push(n); commit();
      return ok({ id: n.id });
    }
    case 'delete_item': {
      const { kind, id } = input;
      const lists = { expense: db.expenses, task: db.tasks, meeting: db.meetings, food: db.health.foods, note: db.notes };
      if (kind === 'food_entry') {
        for (const [d, items] of Object.entries(db.health.log)) {
          const i = items.findIndex((x) => x.id === id);
          if (i >= 0) { items.splice(i, 1); if (!items.length) delete db.health.log[d]; commit(); return ok({}); }
        }
        return { error: 'Запись не найдена' };
      }
      if (kind === 'weight') {
        const i = db.health.weights.findIndex((w) => w.date === id);
        if (i < 0) return { error: 'Запись не найдена' };
        db.health.weights.splice(i, 1); commit(); return ok({});
      }
      const list = lists[kind];
      const i = list ? list.findIndex((x) => x.id === id) : -1;
      if (i < 0) return { error: 'Запись не найдена' };
      list.splice(i, 1); commit();
      return ok({});
    }
    default:
      return { error: `Неизвестный инструмент ${name}` };
  }
}

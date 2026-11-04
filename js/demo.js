// Пример данных, чтобы посмотреть приложение в деле
import { uid, today, addDays, shiftMonth } from './utils.js';

export function demoData() {
  const t = today();
  const d = (n) => addDays(t, n);
  const ym = t.slice(0, 7);
  const now = new Date().toISOString();

  const p1 = { id: uid(), title: 'Запуск нового сайта', client: 'Отдел маркетинга', status: 'active', deadline: d(12), note: 'Цель: новый сайт к концу месяца.\nМакеты — в Figma, тексты — у Анны.', createdAt: now };
  const p2 = { id: uid(), title: 'Квартальный отчёт', client: 'Руководство', status: 'active', deadline: d(4), note: 'Выручка, расходы, ключевые показатели за квартал.', createdAt: now };
  const p3 = { id: uid(), title: 'Переговоры с поставщиком', client: 'Закупки', status: 'paused', deadline: '', note: '', createdAt: now };

  const task = (title, area, due, extra = {}) => ({ id: uid(), title, area, due, time: '', priority: 'mid', repeat: 'none', subtasks: [], note: '', projectId: '', done: false, createdAt: now, ...extra });
  const subs = (list, doneN = 0) => list.map((text, i) => ({ id: uid(), text, done: i < doneN }));

  const tasks = [
    task('Собрать цифры по продажам', 'work', t, { projectId: p2.id, priority: 'high', time: '11:00' }),
    task('Согласовать структуру отчёта', 'work', d(-1), { projectId: p2.id }),
    task('Презентация для руководства', 'work', d(3), { projectId: p2.id, subtasks: subs(['Слайды с цифрами', 'Выводы', 'Прогон с командой'], 1) }),
    task('Утвердить макет главной', 'work', d(2), { projectId: p1.id, priority: 'high' }),
    task('Тексты для раздела «О компании»', 'work', d(6), { projectId: p1.id }),
    task('Тестирование формы заявки', 'work', d(9), { projectId: p1.id, done: true, doneAt: now }),
    task('Разобрать почту', 'work', t, { repeat: 'weekdays', priority: 'low' }),
    task('Еженедельный отчёт команде', 'work', d(4), { repeat: 'weekly' }),
    task('Записаться к стоматологу', 'personal', t, { priority: 'high' }),
    task('Забрать костюм из химчистки', 'personal', d(1), { time: '19:00' }),
    task('Тренировка', 'personal', t, { time: '20:00', repeat: 'weekly' }),
    task('Подарок отцу на день рождения', 'personal', d(8), { subtasks: subs(['Выбрать часы', 'Заказать гравировку']) }),
    task('Поменять лампочку в прихожей', 'home', d(2), { priority: 'low' }),
    task('Передать показания счётчиков', 'home', d(5), { repeat: 'monthly' }),
    task('Прочитать «Богатый папа»', 'personal', '', { priority: 'low' }),
  ];

  const meet = (title, date, time, end, type, extra = {}) => ({ id: uid(), title, date, time, end, type, place: '', people: '', link: '', note: '', projectId: '', done: false, createdAt: now, ...extra });
  const meetings = [
    meet('Планёрка', t, '10:00', '10:30', 'meeting', { place: 'Офис, переговорная 2', people: 'Команда', done: new Date().getHours() >= 11 }),
    meet('Созвон по сайту с подрядчиком', t, '15:00', '15:45', 'call', { link: 'https://zoom.us', projectId: p1.id, note: 'Обсудить сроки и бюджет на доработки' }),
    meet('Обед с Сергеем', d(1), '13:30', '14:30', 'lunch', { place: 'Ресторан «Белуга»', people: 'Сергей Петров' }),
    meet('Защита отчёта', d(4), '12:00', '13:00', 'meeting', { place: 'Кабинет директора', projectId: p2.id }),
    meet('Встреча с поставщиком', d(-2), '11:00', '12:00', 'meeting', { place: 'Их офис', projectId: p3.id, done: true, note: 'Ждём новое коммерческое предложение' }),
    meet('Ужин с родителями', d(5), '19:00', '', 'personal', { place: 'Дома' }),
  ];

  const e = (amount, category, title, n, extra = {}) => ({ id: uid(), amount, category, title, date: d(n), time: '', method: 'card', note: '', createdAt: now, ...extra });
  const expenses = [
    e(1450, 'groceries', 'Продукты на неделю', 0),
    e(320, 'coffee', 'Капучино', 0),
    e(690, 'transport', 'Такси до офиса', 0),
    e(2800, 'food', 'Ужин с друзьями', -1),
    e(4200, 'clothes', 'Рубашка', -2),
    e(3500, 'car', 'Бензин', -3),
    e(290, 'coffee', 'Кофе', -3, { method: 'cash' }),
    e(2100, 'groceries', 'Продукты', -4),
    e(1200, 'fun', 'Кино', -5),
    e(890, 'education', 'Книга', -6),
    e(560, 'transport', 'Такси', -7),
    e(1850, 'health', 'Аптека', -9),
    e(3100, 'groceries', 'Продукты', -11),
    e(5400, 'gifts', 'Цветы и подарок', -13),
    e(2600, 'food', 'Бизнес-ланч', -15),
    e(4800, 'groceries', 'Продукты', -18),
    e(7200, 'clothes', 'Ботинки', -22),
    e(3400, 'car', 'Мойка и бензин', -26),
    e(6100, 'food', 'Ресторан', -30),
    e(2900, 'groceries', 'Продукты', -35),
    e(12500, 'travel', 'Билеты в Питер', -40),
    e(3900, 'fun', 'Концерт', -48),
    e(4100, 'groceries', 'Продукты', -55),
  ];

  const pay = (title, amount, day, category, extra = {}) => ({ id: uid(), title, amount, day, category, active: true, paid: {}, note: '', createdAt: now, ...extra });
  const payments = [
    pay('Аренда квартиры', 55000, 5, 'home'),
    pay('Коммунальные услуги', 6500, 15, 'home'),
    pay('Мобильная связь', 600, Number(d(2).slice(8, 10)), 'subs'),
    pay('Интернет', 900, 20, 'subs'),
    pay('Спортзал', 4500, Number(d(5).slice(8, 10)), 'sport'),
    pay('Музыка и кино', 499, 28, 'subs'),
  ];
  // Отметить оплаченными платежи, срок которых в этом месяце уже прошёл
  for (const p of payments) {
    const day = String(p.day).padStart(2, '0');
    if (`${ym}-${day}` < t) {
      const ex = { id: uid(), amount: p.amount, category: p.category, title: p.title, date: `${ym}-${day}`, time: '', method: 'card', note: 'Регулярный платёж', paymentId: p.id, createdAt: now };
      expenses.push(ex);
      p.paid[ym] = ex.id;
    }
    const prev = shiftMonth(ym, -1);
    const ex2 = { id: uid(), amount: p.amount, category: p.category, title: p.title, date: `${prev}-${day > '28' ? '28' : day}`, time: '', method: 'card', note: 'Регулярный платёж', paymentId: p.id, createdAt: now };
    expenses.push(ex2);
    p.paid[prev] = ex2.id;
  }

  return {
    version: 1,
    settings: { name: 'Илья', homeCity: 'Москва', theme: 'auto', budgets: { groceries: 25000, food: 15000, coffee: 3000, transport: 6000, clothes: 15000, fun: 8000 }, lastBackup: t, hideInstall: false },
    tasks, meetings, projects: [p1, p2, p3], expenses, payments,
    health: demoHealth(t, d),
    notes: [
      { id: uid(), title: 'Идеи для сайта', text: 'Блок с отзывами клиентов\nКалькулятор стоимости\nЧат поддержки', pinned: true, updatedAt: now, createdAt: now },
      { id: uid(), title: 'Книги', text: 'Деньги, банки и кризисы\nПринципы — Рэй Далио\nАтлант расправил плечи', pinned: false, updatedAt: now, createdAt: now },
    ],
  };
}

function demoHealth(t, d) {
  const food = (name, brand, kcal, p, f, c, extra = {}) => ({ id: uid(), name, brand, kcal, p, f, c, uses: 3, lastUsed: new Date().toISOString(), ...extra });
  const foods = [
    food('Творог 5%', 'Простоквашино', 121, 17, 5, 1.8, { barcode: '4607001771647' }),
    food('Овсяные хлопья', 'Геркулес', 352, 12.3, 6.2, 61.8),
    food('Куриная грудка', '', 113, 23.6, 1.9, 0.4),
    food('Рис басмати', '', 349, 7.5, 0.6, 77.7),
    food('Яйцо куриное', '', 157, 12.7, 11.5, 0.7, { portion: 55 }),
    food('Банан', '', 96, 1.5, 0.5, 21),
    food('Протеин', 'Optimum Nutrition', 375, 75, 4.5, 9),
  ];
  const by = (n) => foods.find((f) => f.name === n);
  const e = (n, grams, meal) => { const f = by(n); const k = grams / 100; return { id: uid(), foodId: f.id, name: f.name, grams, meal, kcal: f.kcal * k, p: f.p * k, f: f.f * k, c: f.c * k }; };
  const weights = [], steps = {};
  for (let i = 30; i >= 0; i -= 2) weights.push({ date: d(-i), weight: Math.round((84.6 - (30 - i) * 0.06 + (i % 4 ? 0.2 : -0.1)) * 10) / 10, fat: i % 6 ? null : Math.round((19.5 - (30 - i) * 0.03) * 10) / 10, source: 'health' });
  for (let i = 13; i >= 0; i--) steps[d(-i)] = [7200, 11400, 9800, 6300, 12800, 10200, 8400, 13100, 9100, 5600, 10900, 11800, 7600, 6420][i];
  return {
    profile: { sex: 'm', age: 32, height: 182, weight: null, activity: '1.55', goal: 'lose', pct: 15, manual: false, kcal: null, p: null, f: null, c: null, fat: null },
    foods,
    log: {
      [t]: [e('Овсяные хлопья', 70, 'breakfast'), e('Яйцо куриное', 110, 'breakfast'), e('Банан', 120, 'breakfast'), e('Куриная грудка', 200, 'lunch'), e('Рис басмати', 80, 'lunch')],
      [d(-1)]: [e('Творог 5%', 200, 'breakfast'), e('Куриная грудка', 250, 'lunch'), e('Рис басмати', 90, 'lunch'), e('Протеин', 30, 'snack')],
    },
    weights, steps, stepGoal: 10000, lastSync: new Date().toISOString(),
  };
}

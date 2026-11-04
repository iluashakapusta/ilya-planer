// Питание, норма КБЖУ, вес, шаги и разбор данных из «Здоровья»
import { db } from './store.js';
import { today, addDays } from './utils.js';

export const MEALS = {
  breakfast: { icon: '🍳', name: 'Завтрак' },
  lunch: { icon: '🍲', name: 'Обед' },
  dinner: { icon: '🍽️', name: 'Ужин' },
  snack: { icon: '🍏', name: 'Перекус' },
};

export const ACTIVITY = {
  '1.2': 'Минимальная — сидячая работа, без тренировок',
  '1.375': 'Лёгкая — 1–3 тренировки в неделю',
  '1.55': 'Средняя — 3–5 тренировок в неделю',
  '1.725': 'Высокая — 6–7 тренировок в неделю',
  '1.9': 'Очень высокая — спорт + физическая работа',
};

export const GOALS = {
  lose: { name: 'Сушка', sign: -1 },
  keep: { name: 'Держать вес', sign: 0 },
  gain: { name: 'Набор', sign: 1 },
};

/* ===== Методика расчёта (по рекомендациям тренера) =====
   • Сухая масса = вес × (1 − % жира).
   • Расход: основной обмен по Кетчу — МакАрдлу (370 + 21,6 × сухая масса) × активность.
     Если % жира неизвестен — по Миффлину — Сан Жеору.
   • Сушка: калории −10…20% от расхода; белок 2–2,5 г, жиры 0,8–1 г, углеводы 1–3 г на кг сухой массы.
   • Набор: калории +10…20%; белок 1,5–2 г, жиры 1–1,2 г, углеводы 4–8 г на кг сухой массы.
   • Белок и жиры — середина диапазона, углеводы — остаток калорий, но не выходя за диапазон.
     Итоговая норма калорий = сумма БЖУ. */
export const RULES = {
  lose: { p: [2, 2.5], f: [0.8, 1], c: [1, 3] },
  keep: { p: [1.8, 2.2], f: [0.9, 1.1], c: [2, 5] },
  gain: { p: [1.5, 2], f: [1, 1.2], c: [4, 8] },
};
const mid = ([a, b]) => (a + b) / 2;

export const r0 = (n) => Math.round(Number(n) || 0);
export const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

const byDateDesc = (a, b) => b.date.localeCompare(a.date);

export function latestWeight() {
  const w = db.health.weights.slice().sort(byDateDesc)[0];
  return w?.weight || Number(db.health.profile.weight) || null;
}

/** Последний известный % жира: с весов (через «Здоровье») или из оценки в приложении */
export function latestFat() {
  const w = db.health.weights.filter((x) => x.fat).sort(byDateDesc)[0];
  const pr = db.health.profile;
  const est = pr.fat ? { fat: Number(pr.fat), date: pr.fatDate || '', source: pr.fatSource || 'manual' } : null;
  if (w && (!est || w.date >= est.date)) return { fat: w.fat, date: w.date, source: 'scale' };
  return est;
}

export function calcTargets() {
  const pr = db.health.profile;
  if (pr.manual && pr.kcal) {
    return { kcal: r0(pr.kcal), p: r0(pr.p), f: r0(pr.f), c: r0(pr.c), manual: true };
  }
  const w = latestWeight(), h = Number(pr.height), a = Number(pr.age);
  if (!w || !h || !a) return null;
  const fatInfo = latestFat();
  const lbm = fatInfo ? w * (1 - fatInfo.fat / 100) : null;
  const bmr = lbm ? 370 + 21.6 * lbm : 10 * w + 6.25 * h - 5 * a + (pr.sex === 'f' ? -161 : 5);
  const tdee = bmr * Number(pr.activity || 1.375);
  const goal = GOALS[pr.goal] ? pr.goal : 'keep';
  const pct = Number(pr.pct) || 15;
  const kcal = tdee * (1 + GOALS[goal].sign * pct / 100);
  const base = lbm || w;
  const rule = RULES[goal];
  const pk = Number(pr.pPerKg) || mid(rule.p), fk = Number(pr.fPerKg) || mid(rule.f);
  const p = base * pk, f = base * fk;
  // Углеводы — остаток калорий, но в пределах диапазона тренера (г на кг сухой массы)
  const cFree = Math.max(0, (kcal - p * 4 - f * 9) / 4);
  const c = lbm ? Math.min(Math.max(cFree, base * rule.c[0]), base * rule.c[1]) : cFree;
  const clamped = Math.abs(c - cFree) > 1 ? (c < cFree ? 'max' : 'min') : '';
  return {
    kcal: r0(p * 4 + f * 9 + c * 4), kcalByTdee: r0(kcal), clamped, p: r0(p), f: r0(f), c: r0(c),
    bmr: r0(bmr), tdee: r0(tdee), weight: w, lbm: lbm ? r1(lbm) : null, fat: fatInfo,
    goal, pct, pk, fk, ck: r1(c / base), rule, formula: lbm ? 'katch' : 'mifflin', manual: false,
  };
}

/* ===== Оценка % жира по обхватам (метод ВМС США), см ===== */
export function navyFat({ sex, height, waist, neck, hip }) {
  const lg = Math.log10;
  if (!height || !waist || !neck) return null;
  if (sex === 'f') {
    if (!hip || waist + hip - neck <= 0) return null;
    return r1(495 / (1.29579 - 0.35004 * lg(waist + hip - neck) + 0.221 * lg(height)) - 450);
  }
  if (waist - neck <= 0) return null;
  return r1(495 / (1.0324 - 0.19077 * lg(waist - neck) + 0.15456 * lg(height)) - 450);
}

/* ===== Ориентиры по внешнему виду (мужчины) ===== */
export const FAT_LOOKS = [
  [7, '6–8%', 'Резкий рельеф, видны вены на животе, кубики очень чёткие'],
  [11, '10–12%', 'Кубики пресса видны, плечи и руки рельефные'],
  [15, '15%', 'Контуры пресса угадываются, рельеф мягкий'],
  [20, '20%', 'Пресс не виден, лёгкий жир на животе и боках'],
  [25, '25%', 'Заметный живот и бока, талия шире груди'],
  [30, '30%', 'Выраженный живот, жир на груди и спине'],
  [35, '35%+', 'Округлый живот, жир по всему телу'],
];

/** КБЖУ продукта на указанное количество грамм */
export function macrosFor(food, grams) {
  const k = (Number(grams) || 0) / 100;
  return { kcal: (food.kcal || 0) * k, p: (food.p || 0) * k, f: (food.f || 0) * k, c: (food.c || 0) * k };
}

export const dayLog = (date) => db.health.log[date] || [];

export function totals(items) {
  return items.reduce((s, x) => ({ kcal: s.kcal + (x.kcal || 0), p: s.p + (x.p || 0), f: s.f + (x.f || 0), c: s.c + (x.c || 0) }), { kcal: 0, p: 0, f: 0, c: 0 });
}

export function defaultMeal() {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}

export const foodsByUse = () => db.health.foods.slice().sort((a, b) => (b.lastUsed || '').localeCompare(a.lastUsed || '') || (b.uses || 0) - (a.uses || 0));

/* ===== Поиск по штрихкоду ===== */
export async function lookupBarcode(code) {
  const local = db.health.foods.find((f) => f.barcode === code);
  if (local) return { food: local, source: 'local' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const fields = 'product_name,product_name_ru,brands,nutriments,serving_size';
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`, { signal: ctrl.signal });
    if (!res.ok && res.status !== 404) throw new Error('net');
    const data = await res.json();
    if (data.status !== 1 || !data.product) return { food: null, source: 'none' };
    const pr = data.product, n = pr.nutriments || {};
    const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null);
    return {
      source: 'off',
      food: {
        barcode: code,
        name: (pr.product_name_ru || pr.product_name || '').trim(),
        brand: (pr.brands || '').split(',')[0].trim(),
        kcal: kcal != null ? r1(kcal) : null,
        p: n.proteins_100g != null ? r1(n.proteins_100g) : null,
        f: n.fat_100g != null ? r1(n.fat_100g) : null,
        c: n.carbohydrates_100g != null ? r1(n.carbohydrates_100g) : null,
      },
    };
  } catch (e) {
    return { food: null, source: 'error' };
  } finally { clearTimeout(timer); }
}

/* ===== Данные из «Здоровья» (через «Команды» и буфер обмена) =====
   Понимает текст вида:
   шаги: 8432
   вес: 82,4
   жир: 0,182   (или 18,2)
   Порядок строк и регистр не важны, можно по-английски (steps / weight / fat). */
export function parseHealthText(text) {
  const t = String(text || '').toLowerCase().replace(/ /g, ' ');
  const num = (re) => {
    const m = t.match(re);
    if (!m) return null;
    const v = Number(m[1].replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  };
  const steps = num(/(?:шаг\S*|steps?)\s*[:=]?\s*([\d\s]+(?:[.,]\d+)?)/);
  const weight = num(/(?:вес|weight)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/);
  let fat = num(/(?:жир\S*|fat)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/);
  if (fat != null && fat > 0 && fat < 1) fat *= 100;
  const out = {};
  if (steps != null && steps >= 0 && steps < 200000) out.steps = Math.round(steps);
  if (weight != null && weight > 20 && weight < 400) out.weight = r1(weight);
  if (fat != null && fat > 1 && fat < 70) out.fat = r1(fat);
  return out;
}

/** Записать данные синхронизации: шаги за сегодня, последний вес */
export function applyHealth(data, date = today()) {
  const h = db.health;
  if (data.steps != null) h.steps[date] = data.steps;
  if (data.weight != null) {
    const ex = h.weights.find((w) => w.date === date);
    if (ex) { ex.weight = data.weight; if (data.fat != null) ex.fat = data.fat; ex.source = 'health'; }
    else h.weights.push({ date, weight: data.weight, fat: data.fat ?? null, source: 'health' });
  }
  h.lastSync = new Date().toISOString();
}

export function weightChange(days) {
  const list = db.health.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (list.length < 2) return null;
  const last = list[list.length - 1];
  const from = addDays(last.date, -days);
  const base = list.filter((w) => w.date <= from).pop() || list[0];
  if (base === last) return null;
  return r1(last.weight - base.weight);
}

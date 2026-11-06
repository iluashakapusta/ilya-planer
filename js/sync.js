// Автоматическая синхронизация шагов и веса с сервера планера
import { db, commit } from './store.js';
import { hasServer, serverFetch } from './ai.js';
import { applyHealth } from './nutrition.js';

let busy = false, lastPull = 0;

/** Забрать данные «Здоровья» за последние дни. Возвращает число обновлённых дней */
export async function pullHealth({ force = false } = {}) {
  if (!hasServer() || busy) return 0;
  if (!force && Date.now() - lastPull < 60_000) return 0;
  busy = true;
  try {
    const { days = {} } = await serverFetch('/health?days=14');
    lastPull = Date.now();
    let changed = 0;
    for (const [date, d] of Object.entries(days)) {
      const h = db.health;
      const w = h.weights.find((x) => x.date === date);
      const same = (d.steps == null || h.steps[date] === d.steps) && (d.weight == null || (w && w.weight === d.weight && (d.fat == null || w.fat === d.fat)));
      if (same) continue;
      applyHealth({ steps: d.steps, weight: d.weight, fat: d.fat }, date);
      changed++;
    }
    db.health.lastSync = new Date().toISOString();
    db.health.syncError = '';
    if (changed) commit();
    return changed;
  } catch (e) {
    db.health.syncError = e.status === 401 ? 'Неверный токен сервера' : 'Сервер недоступен';
    throw e;
  } finally { busy = false; }
}

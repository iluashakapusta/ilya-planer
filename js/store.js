// Хранилище: все данные живут только на этом устройстве (localStorage)

const KEY = 'ilya-planner-v1';

function defaults() {
  return {
    version: 1,
    settings: { name: 'Илья', homeCity: 'Москва', theme: 'auto', budgets: {}, lastBackup: '', hideInstall: false },
    tasks: [], meetings: [], projects: [], expenses: [], payments: [], notes: [],
  };
}

function merge(data) {
  const d = defaults();
  return { ...d, ...data, settings: { ...d.settings, ...(data?.settings || {}) } };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(JSON.parse(raw));
  } catch (e) { console.warn('Не удалось прочитать данные', e); }
  return defaults();
}

export const db = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch (e) {
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Не удалось сохранить: память браузера переполнена' }));
    return false;
  }
}

export function commit() {
  save();
  window.dispatchEvent(new Event('dbchange'));
}

export function replaceAll(data) {
  const next = merge(data);
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, next);
  commit();
}

export const resetAll = () => replaceAll({});

export const isEmpty = () =>
  !db.tasks.length && !db.meetings.length && !db.projects.length && !db.expenses.length && !db.payments.length && !db.notes.length;

export function validBackup(data) {
  return data && typeof data === 'object' && Array.isArray(data.tasks) && Array.isArray(data.expenses) && Array.isArray(data.meetings);
}

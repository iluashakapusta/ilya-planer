// Подключение к серверу планера и к Claude API.
// Адрес сервера, токен и ключ хранятся только на этом устройстве (localStorage),
// отдельно от данных планера, и не попадают в резервные копии.

const LS = { server: 'ilya-planner-server', token: 'ilya-planner-token', key: 'ilya-planner-anthropic-key' };
const SDK_URL = './vendor/anthropic-sdk.js'; // @anthropic-ai/sdk 1.1.0, собран в один файл
export const MODEL = 'claude-opus-5-5';

const get = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const set = (k, v) => { try { v ? localStorage.setItem(k, String(v).trim()) : localStorage.removeItem(k); } catch { /* приватный режим */ } };

export const getServer = () => get(LS.server).replace(/\/+$/, '');
export const setServer = (v) => set(LS.server, v && !/^https?:\/\//i.test(v.trim()) ? `https://${v.trim()}` : v);
export const getToken = () => get(LS.token);
export const setToken = (v) => set(LS.token, v);
export const getApiKey = () => get(LS.key);
export const setApiKey = (v) => set(LS.key, v);

export const hasServer = () => !!(getServer() && getToken());
/** Можно ли пользоваться Claude: через сервер или своим ключом */
export const aiReady = () => hasServer() || !!getApiKey();

export function randomToken() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 55]).join('');
}

/** Запрос к серверу планера */
export async function serverFetch(path, init = {}) {
  const res = await fetch(`${getServer()}${path}`, {
    ...init,
    headers: { 'x-planner-token': getToken(), ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || data.error?.message || `HTTP ${res.status}`), { status: res.status });
  return data;
}

let sdk = null;
export async function getClient() {
  sdk ||= (await import(SDK_URL)).default;
  const Anthropic = sdk;
  if (hasServer()) {
    // Ключ Claude лежит на сервере; сервер подставит его сам
    return { Anthropic, client: new Anthropic({ apiKey: 'server', baseURL: `${getServer()}/claude`, defaultHeaders: { 'x-planner-token': getToken() }, dangerouslyAllowBrowser: true, maxRetries: 1 }) };
  }
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('nokey');
  // Ключ принадлежит самому пользователю и хранится только на его телефоне
  return { Anthropic, client: new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 }) };
}

/** Перевести ошибку SDK в понятный код */
export function errorCode(e, Anthropic) {
  if (!Anthropic) return e?.message || 'api';
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'badkey';
  if (e instanceof Anthropic.RateLimitError) return 'rate';
  if (e instanceof Anthropic.APIConnectionError) return 'net';
  if (e instanceof Anthropic.APIError) return e.status === 402 || /credit|billing/i.test(e.message || '') ? 'billing' : 'api';
  return e?.message || 'api';
}

export const AI_ERRORS = {
  nokey: 'Подключите сервер или добавьте ключ Claude API: «Ещё» → «Настройки» → «Сервер и ассистент».',
  badkey: 'Ключ Claude или токен сервера не подошёл. Проверьте их в настройках.',
  billing: 'На счёте Claude API закончились средства.',
  rate: 'Слишком много запросов. Попробуйте через минуту.',
  net: 'Нет связи с сервером. Проверьте интернет.',
  refusal: 'Claude отказался отвечать на этот запрос. Попробуйте переформулировать.',
  parse: 'Не удалось разобрать ответ. Попробуйте ещё раз.',
  api: 'Ошибка Claude API. Попробуйте ещё раз.',
};

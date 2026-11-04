// Сервер планера Ильи — Cloudflare Worker (бесплатный тариф).
//
// Что делает:
//  1. POST /health — сюда команда в «Командах» iPhone сама присылает шаги, вес и % жира.
//  2. GET  /health — планер забирает эти данные при открытии.
//  3. POST /claude/v1/messages — пересылает запросы ассистента в Claude API.
//     Ключ Claude хранится здесь, в секретах сервера, а не в телефоне.
//
// Настройки сервера (Settings → Variables and Secrets / Bindings):
//  • PLANNER            — KV-хранилище (Bindings → KV namespace)
//  • TOKEN              — секрет: ваш личный пароль сервера (его же вводите в планере и в команде)
//  • ANTHROPIC_API_KEY  — секрет: ключ Claude API (нужен только для ассистента и оценки по фото)
//  • TZ                 — переменная (необязательно): часовой пояс, по умолчанию Europe/Moscow

const ALLOWED_ORIGINS = ['https://iluashakapusta.github.io', 'http://localhost:8765'];
const ALLOWED_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5', 'claude-opus-4-8'];
const DAY_TTL = 60 * 60 * 24 * 400; // храним дни ~13 месяцев

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, request);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/' || url.pathname === '/ping') {
        return json({ ok: true, service: 'ilya-planner', kv: !!env.PLANNER, claude: !!env.ANTHROPIC_API_KEY, auth: !!env.TOKEN }, 200, cors);
      }
      if (!env.TOKEN) return json({ error: 'На сервере не задан секрет TOKEN' }, 500, cors);
      if (!authorized(request, url, env)) return json({ error: 'Неверный токен' }, 401, cors);

      if (url.pathname === '/health' && request.method === 'POST') return await saveHealth(request, env, cors);
      if (url.pathname === '/health' && request.method === 'GET') return await readHealth(url, env, cors);
      if (url.pathname === '/claude/v1/messages' && request.method === 'POST') return await proxyClaude(request, env, cors);

      return json({ error: 'Не найдено' }, 404, cors);
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500, cors);
    }
  },
};

function corsHeaders(origin, request) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || 'content-type, x-planner-token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });

function authorized(request, url, env) {
  const given = request.headers.get('x-planner-token') || url.searchParams.get('token') || '';
  if (given.length !== env.TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ env.TOKEN.charCodeAt(i);
  return diff === 0;
}

function todayIn(env) {
  // en-CA даёт формат ГГГГ-ММ-ДД
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.TZ || 'Europe/Moscow' }).format(new Date());
}

/* ---------- Шаги и вес из «Команд» ---------- */
function parseNumber(v) {
  if (v == null) return null;
  const m = String(v).replace(/ /g, ' ').match(/-?\d[\d\s]*(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseText(t) {
  const s = String(t || '').toLowerCase();
  const pick = (re) => { const m = s.match(re); return m ? parseNumber(m[1]) : null; };
  return {
    steps: pick(/(?:шаг\S*|steps?)\s*[:=]?\s*([\d\s]+(?:[.,]\d+)?)/),
    weight: pick(/(?:вес|weight)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/),
    fat: pick(/(?:жир\S*|fat)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/),
  };
}

async function saveHealth(request, env, cors) {
  if (!env.PLANNER) return json({ error: 'Не подключено KV-хранилище PLANNER' }, 500, cors);
  const raw = await request.text();
  let body = {};
  try { body = JSON.parse(raw); } catch { body = parseText(raw); }
  if (typeof body !== 'object' || !body) body = {};

  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : todayIn(env);
  const steps = parseNumber(body.steps ?? body['шаги']);
  const weight = parseNumber(body.weight ?? body['вес']);
  let fat = parseNumber(body.fat ?? body['жир']);
  if (fat != null && fat > 0 && fat < 1) fat *= 100;

  const key = `day:${date}`;
  const prev = JSON.parse((await env.PLANNER.get(key)) || '{}');
  const next = { ...prev, updated: new Date().toISOString() };
  if (steps != null && steps >= 0 && steps < 200000) next.steps = Math.round(steps);
  if (weight != null && weight > 20 && weight < 400) next.weight = Math.round(weight * 10) / 10;
  if (fat != null && fat > 1 && fat < 70) next.fat = Math.round(fat * 10) / 10;
  if (next.steps == null && next.weight == null) return json({ error: 'Нет ни шагов, ни веса', got: raw.slice(0, 200) }, 400, cors);

  await env.PLANNER.put(key, JSON.stringify(next), { expirationTtl: DAY_TTL });
  return json({ ok: true, date, saved: next }, 200, cors);
}

async function readHealth(url, env, cors) {
  if (!env.PLANNER) return json({ error: 'Не подключено KV-хранилище PLANNER' }, 500, cors);
  const n = Math.min(60, Math.max(1, Number(url.searchParams.get('days')) || 14));
  const end = new Date(`${todayIn(env)}T12:00:00Z`);
  const keys = Array.from({ length: n }, (_, i) => new Date(end.getTime() - i * 864e5).toISOString().slice(0, 10));
  const values = await Promise.all(keys.map((d) => env.PLANNER.get(`day:${d}`)));
  const days = {};
  keys.forEach((d, i) => { if (values[i]) days[d] = JSON.parse(values[i]); });
  return json({ ok: true, today: keys[0], days }, 200, cors);
}

/* ---------- Ассистент: пересылка в Claude API ---------- */
async function proxyClaude(request, env, cors) {
  if (!env.ANTHROPIC_API_KEY) return json({ type: 'error', error: { type: 'authentication_error', message: 'На сервере не задан секрет ANTHROPIC_API_KEY' } }, 401, cors);
  const body = await request.text();
  if (body.length > 8_000_000) return json({ type: 'error', error: { type: 'invalid_request_error', message: 'Слишком большой запрос' } }, 413, cors);
  let model = '';
  try { model = JSON.parse(body).model; } catch { /* пусть ответит сам API */ }
  if (model && !ALLOWED_MODELS.includes(model)) return json({ type: 'error', error: { type: 'invalid_request_error', message: `Модель ${model} не разрешена на сервере` } }, 400, cors);

  const headers = new Headers({ 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY });
  for (const h of ['anthropic-version', 'anthropic-beta']) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body });
  const out = new Headers(cors);
  out.set('Content-Type', res.headers.get('Content-Type') || 'application/json');
  for (const h of ['request-id', 'retry-after']) { const v = res.headers.get(h); if (v) out.set(h, v); }
  return new Response(res.body, { status: res.status, headers: out });
}

// Личный ассистент: чат с Claude, который видит данные планера и может их менять
import { db, replaceAll } from '../store.js';
import { esc, today, fmtDayLong } from '../utils.js';
import { pageHead } from '../components.js';
import { toast } from '../ui.js';
import { getClient, errorCode, aiReady, MODEL, AI_ERRORS } from '../ai.js';
import { TOOLS, TOOL_LABELS, runTool } from '../assistant-tools.js';
import { prepareImage } from '../bodyfat-ai.js';
import { calcTargets } from '../nutrition.js';

const STORE = 'ilya-planner-chat';
const MAX_STEPS = 12;

let chat = load();          // { messages: [...для API], view: [...для экрана] }
let busy = false;
let draft = '';
let photo = null;           // { base64, preview }
const undo = new Map();     // индекс сообщения → снимок данных до действий

function load() {
  try { const c = JSON.parse(localStorage.getItem(STORE)); if (c?.messages && c?.view) return c; } catch { /* пусто */ }
  return { messages: [], view: [] };
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(chat)); }
  catch { toast('Память чата переполнена — начните новый чат'); }
}

function systemPrompt() {
  const s = db.settings, t = calcTargets();
  return `Ты — личный ассистент ${s.name || 'пользователя'} внутри его планера (работа, дела, расходы, здоровье). Отвечай по-русски, коротко и по делу, как толковый помощник. Можно использовать **жирный** и списки через «- ».

Сегодня ${fmtDayLong(today())}, ${today()}. Город: ${s.homeCity || '—'}.
${t ? `Норма на день: ${t.kcal} ккал, Б ${t.p} г, Ж ${t.f} г, У ${t.c} г.` : 'Норма КБЖУ ещё не рассчитана.'}

Как работать:
- Данные планера читай инструментом get_planner_data, не выдумывай их.
- Вноси или меняй данные, когда пользователь об этом просит или это явно следует из сообщения («съел 200 г творога», «потратил 500 на такси», «напомни завтра позвонить маме»). Если не хватает важной детали (сумма, дата), уточни одним вопросом. После записи кратко подтверди, что именно записал.
- Даты без года — ближайшие будущие (для прошедших событий — прошедшие). «Завтра», «в пятницу» переводи в ГГГГ-ММ-ДД.
- Питание: прежде чем записывать продукт, проверь сохранённые (section=foods) и используй food_id. Если продукта нет — возьми КБЖУ на 100 г по своим знаниям (типичные значения), скажи, что это примерные цифры, и при желании сохрани через save_food.
- Блюдо из нескольких ингредиентов: посчитай КБЖУ каждого ингредиента по сырому весу, сложи, раздели на вес готового блюда и умножь на 100 — получится КБЖУ на 100 г. Если вес готового блюда не назван, спроси его (при варке и жарке он меняется); если пользователь не знает — считай по сумме сырых весов и предупреди. Покажи короткую таблицу расчёта и предложи сохранить блюдо (save_food) — потом его можно будет вносить по граммовке.
- Методика КБЖУ пользователя (тренер): БЖУ на кг сухой массы (вес × (1 − % жира)); сушка — белок 2–2,5 г, жиры 0,8–1 г, углеводы 1–3 г; набор — 1,5–2 / 1–1,2 / 4–8 г; калории ±10–20% от расхода.
- По медицинским вопросам давай общую информацию и советуй обратиться к врачу при тревожных симптомах.`;
}

/* ---------- Отрисовка ---------- */
function md(text) {
  const lines = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n');
  let html = '', list = false;
  for (const l of lines) {
    const m = l.match(/^\s*[-•]\s+(.*)/);
    if (m) { if (!list) { html += '<ul>'; list = true; } html += `<li>${m[1]}</li>`; continue; }
    if (list) { html += '</ul>'; list = false; }
    html += l.trim() ? `<p>${l}</p>` : '';
  }
  return html + (list ? '</ul>' : '');
}

const SUGGEST = [
  'Что у меня сегодня?',
  'Посчитай КБЖУ блюда: 300 г куриного филе, 150 г риса, 1 ст. л. масла',
  'Сколько я потратил в этом месяце и на что больше всего?',
  'Запиши: съел 200 г творога 5% на завтрак',
  'Сколько ещё белка мне добрать сегодня?',
];

export function render() {
  const ready = aiReady();
  const html = `
  ${pageHead('Ассистент', { back: '#/more', action: chat.view.length ? '<button class="btn ghost sm" data-act="newChat">Новый чат</button>' : '' })}
  ${!ready ? `<div class="notice"><div><b>Подключите Claude</b><br>Нужен сервер планера или ключ Claude API: «Настройки» → «Сервер и ассистент».</div><a class="icon-btn" href="#/settings">›</a></div>` : ''}
  <div class="chat" data-chat>
    ${chat.view.length ? chat.view.map((m, i) => bubble(m, i)).join('') : `
      <div class="chat-hello"><div class="crest dark">✦</div><p>Спросите что угодно или попросите что-то записать. Я вижу ваши дела, встречи, расходы, питание, вес и шаги — и могу их менять.</p>
      <div class="chips static">${SUGGEST.map((s) => `<button class="chip" data-act="suggest" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`}
    ${busy ? '<div class="bubble bot typing"><span></span><span></span><span></span></div>' : ''}
  </div>
  <form class="chat-input" data-form>
    ${photo ? `<div class="chat-photo"><img src="${photo.preview}" alt=""><button type="button" data-act="dropPhoto" aria-label="Убрать фото">✕</button></div>` : ''}
    <label class="icon-btn file-btn" aria-label="Фото">📷<input type="file" accept="image/*" hidden data-photo></label>
    <textarea rows="1" placeholder="Сообщение…" data-text ${busy ? 'disabled' : ''}>${esc(draft)}</textarea>
    <button class="send" type="submit" ${busy ? 'disabled' : ''} aria-label="Отправить">↑</button>
  </form>`;

  return {
    html,
    actions: {
      suggest: (d) => send(d.v),
      newChat: () => {
        if (!confirm('Начать новый чат? Текущая переписка удалится (данные планера останутся).')) return;
        chat = { messages: [], view: [] }; undo.clear(); save(); rerender();
      },
      undo: (d) => {
        const snap = undo.get(Number(d.i));
        if (!snap) return;
        replaceAll(JSON.parse(snap));
        chat.view[Number(d.i)].undone = true; undo.delete(Number(d.i)); save();
        toast('Изменения отменены');
      },
      dropPhoto: () => { photo = null; rerender(); },
    },
    mount: (root) => {
      const ta = root.querySelector('[data-text]');
      const box = root.querySelector('[data-chat]');
      const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(140, ta.scrollHeight)}px`; };
      ta.addEventListener('input', () => { draft = ta.value; grow(); });
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); root.querySelector('[data-form]').requestSubmit(); } });
      grow();
      root.querySelector('[data-form]').addEventListener('submit', (e) => { e.preventDefault(); send(ta.value); });
      root.querySelector('[data-photo]').addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (f) { photo = await prepareImage(f); rerender(); }
      });
      requestAnimationFrame(() => { box.lastElementChild?.scrollIntoView({ block: 'end' }); window.scrollTo(0, document.body.scrollHeight); });
    },
  };
}

function bubble(m, i) {
  if (m.role === 'user') return `<div class="bubble me">${m.photo ? '<div class="small muted">📷 фото</div>' : ''}${md(m.text)}</div>`;
  const acts = (m.actions || []).length ? `<div class="chat-acts${m.undone ? ' undone' : ''}">${m.actions.map((a) => `<span>✓ ${esc(a)}</span>`).join('')}${undo.has(i) && !m.undone ? `<button data-act="undo" data-i="${i}">Отменить</button>` : ''}${m.undone ? '<span>отменено</span>' : ''}</div>` : '';
  return `<div class="bubble bot${m.error ? ' err' : ''}">${md(m.text || '')}${acts}</div>`;
}

const rerender = () => window.dispatchEvent(new Event('dbchange'));

/* ---------- Диалог с Claude ---------- */
async function send(text) {
  text = String(text || '').trim();
  if (busy || (!text && !photo)) return;
  if (!aiReady()) { toast(AI_ERRORS.nokey); return; }
  const content = [];
  if (photo) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photo.base64 } });
  content.push({ type: 'text', text: text || 'Что на фото? Если это еда или этикетка — посчитай КБЖУ.' });
  chat.view.push({ role: 'user', text: text || 'Что на фото?', photo: !!photo });
  chat.messages.push({ role: 'user', content });
  photo = null; draft = ''; busy = true;
  save(); rerender();

  const snapshot = JSON.stringify(db);
  const actions = [];
  const reply = { role: 'assistant', text: '', actions };
  let Anthropic;
  try {
    const c = await getClient();
    Anthropic = c.Anthropic;
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await c.client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: systemPrompt(),
        tools: TOOLS,
        messages: chat.messages,
      });
      // Ответ сохраняем целиком и без изменений — так требует API для следующих шагов
      chat.messages.push({ role: 'assistant', content: res.content });
      const said = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (said) reply.text = reply.text ? `${reply.text}\n${said}` : said;
      if (res.stop_reason === 'refusal') { reply.text ||= AI_ERRORS.refusal; break; }
      const calls = res.content.filter((b) => b.type === 'tool_use');
      if (res.stop_reason !== 'tool_use' || !calls.length) break;
      const results = calls.map((tu) => {
        let out;
        try { out = runTool(tu.name, tu.input); } catch (e) { out = { error: String(e.message || e) }; }
        const label = TOOL_LABELS[tu.name];
        if (label && !out.error) actions.push(label(tu.input));
        return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out), ...(out.error ? { is_error: true } : {}) };
      });
      // Все результаты — одним сообщением
      chat.messages.push({ role: 'user', content: results });
    }
    if (!reply.text && actions.length) reply.text = 'Готово.';
  } catch (e) {
    reply.error = true;
    reply.text = AI_ERRORS[errorCode(e, Anthropic)] || AI_ERRORS.api;
    repairHistory();
  }
  chat.view.push(reply);
  if (actions.length) undo.set(chat.view.length - 1, snapshot);
  busy = false;
  save(); rerender();
  if (chat.messages.length > 120) toast('Чат стал длинным — для экономии лучше начать новый');
}

/** После ошибки привести историю к виду, который API примет в следующий раз (только дописываем в конец) */
function repairHistory() {
  const ms = chat.messages;
  const last = ms[ms.length - 1];
  if (!last) return;
  const isToolResults = last.role === 'user' && Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_result');
  if (last.role === 'user' && !isToolResults) { ms.pop(); return; } // вопрос так и не был отправлен — убираем его
  if (last.role === 'assistant' && last.content.some((b) => b.type === 'tool_use')) {
    ms.push({ role: 'user', content: last.content.filter((b) => b.type === 'tool_use').map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: '{"error":"прервано"}', is_error: true })) });
  }
  if (ms[ms.length - 1].role === 'user') ms.push({ role: 'assistant', content: [{ type: 'text', text: '(запрос прервался)' }] });
}

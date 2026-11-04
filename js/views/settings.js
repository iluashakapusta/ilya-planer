import { db, commit, replaceAll, resetAll, isEmpty, validBackup } from '../store.js';
import { esc, today, fmtDate } from '../utils.js';
import { pageHead, sectionHead } from '../components.js';
import { formSheet, openSheet, saveFile, toast } from '../ui.js';
import { demoData } from '../demo.js';
import { applyTheme } from '../theme.js';
import { getServer, setServer, getToken, setToken, getApiKey, setApiKey, hasServer, randomToken, serverFetch } from '../ai.js';
import { pullHealth } from '../sync.js';

let check = null; // результат проверки сервера

// Кнопка «Скопировать токен» живёт в шторке, которая открывается позже
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-copytoken]')) return;
  const v = document.querySelector('.sheet input[name="token"]')?.value || '';
  navigator.clipboard?.writeText(v).then(() => toast('Токен скопирован')).catch(() => toast('Выделите и скопируйте вручную'));
});

let persisted = null;
navigator.storage?.persisted?.().then((p) => (persisted = p)).catch(() => {});

export function render() {
  const s = db.settings;
  const size = new Blob([JSON.stringify(db)]).size;
  const html = `
  ${pageHead('Настройки', { back: '#/more' })}
  <div class="card">
    ${sectionHead('Профиль', 'profile', {}, 'Изменить')}
    <div class="kv"><span>Имя</span><b>${esc(s.name)}</b></div>
    <div class="kv"><span>Город</span><b>${esc(s.homeCity)}</b></div>
  </div>
  <div class="card">
    ${sectionHead('Оформление')}
    <div class="seg">${[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([k, l]) => `<label><input type="radio" name="theme" value="${k}" ${s.theme === k ? 'checked' : ''} data-act="theme" data-v="${k}"><span>${l}</span></label>`).join('')}</div>
  </div>
  <div class="card">
    ${sectionHead('Сервер и ассистент', 'serverHelp', {}, 'Как настроить')}
    <p class="small">Свой бесплатный сервер на Cloudflare: шаги и вес приходят сами, а ассистент работает без ключа в телефоне.</p>
    <div class="kv"><span>Сервер</span><b>${getServer() ? esc(getServer().replace(/^https:\/\//, '')) : 'не подключён'}</b></div>
    ${check ? `<div class="kv"><span>Проверка</span><b class="${check.ok ? '' : 'danger-text'}">${esc(check.text)}</b></div>` : ''}
    ${!hasServer() ? `<div class="kv"><span>Ключ Claude на телефоне</span><b>${getApiKey() ? 'есть' : 'нет'}</b></div>` : ''}
    <button class="btn primary full" data-act="serverSetup">${getServer() ? 'Изменить подключение' : 'Подключить сервер'}</button>
    ${getServer() ? '<button class="btn ghost full" data-act="serverCheck">Проверить связь</button>' : ''}
    <button class="btn ghost full" data-act="apiKey">${getApiKey() ? 'Изменить ключ Claude на телефоне' : 'Без сервера: ключ Claude на телефоне'}</button>
  </div>
  <div class="card">
    ${sectionHead('Резервная копия')}
    <p class="small">Все данные хранятся <b>только на этом телефоне</b>. Делайте копию раз в пару недель и сохраняйте файл в «Файлы» или отправляйте себе в мессенджер — так ничего не потеряется при смене телефона.</p>
    <div class="kv"><span>Последняя копия</span><b>${s.lastBackup ? fmtDate(s.lastBackup) : 'ещё не было'}</b></div>
    <div class="kv"><span>Объём данных</span><b>${(size / 1024).toFixed(1)} КБ</b></div>
    ${persisted != null ? `<div class="kv"><span>Защита от очистки</span><b>${persisted ? 'включена ✓' : 'установите на экран «Домой»'}</b></div>` : ''}
    <button class="btn primary full" data-act="export">Сохранить резервную копию</button>
    <label class="btn ghost full file-btn">Восстановить из файла<input type="file" accept=".json,application/json" data-import hidden></label>
  </div>
  <div class="card">
    ${sectionHead('Пример')}
    <p class="small muted">Заполнить приложение примером, чтобы посмотреть, как всё работает. Текущие данные будут заменены.</p>
    <button class="btn ghost full" data-act="demo">Заполнить примером</button>
    <button class="btn ghost danger full" data-act="reset">Удалить все данные</button>
  </div>
  <p class="muted small center">Планер Ильи · версия 5</p>`;

  return {
    html,
    actions: {
      profile: () => formSheet({
        title: 'Профиль', values: s,
        fields: [
          { name: 'name', label: 'Имя', required: true },
          { name: 'homeCity', label: 'Город', required: true },
        ],
        onSubmit: (v) => { Object.assign(db.settings, v); commit(); },
      }),
      serverHelp: () => serverHelp(),
      serverSetup: () => formSheet({
        title: 'Сервер',
        values: { server: getServer(), token: getToken() || randomToken() },
        fields: [
          { name: 'server', label: 'Адрес сервера', type: 'url', required: true, placeholder: 'https://ilya-planner.….workers.dev' },
          { name: 'token', label: 'Токен (пароль сервера)', required: true, hint: 'Такой же, как секрет TOKEN на сервере и в команде «Команды». Можно оставить сгенерированный.' },
        ],
        extra: '<button type="button" class="btn ghost full" data-copytoken>Скопировать токен</button>',
        onSubmit: (v) => {
          setServer(v.server); setToken(v.token); check = null;
          setTimeout(runCheck, 300);
        },
      }),
      serverCheck: () => runCheck(),
      apiKey: () => formSheet({
        title: 'Ключ Claude',
        values: { key: '' },
        fields: [{ name: 'key', label: 'Ключ Claude API', type: 'password', placeholder: getApiKey() ? 'сохранён — введите новый, чтобы заменить' : 'sk-ant-…', hint: 'Хранится только на этом телефоне и не попадает в резервные копии. Пусто + «Сохранить» — удалить ключ.' }],
        onSubmit: (v) => { setApiKey(v.key); toast(v.key ? 'Ключ сохранён' : 'Ключ удалён'); window.dispatchEvent(new Event('dbchange')); },
      }),
      theme: (d) => { db.settings.theme = d.v; applyTheme(); commit(); },
      export: async () => {
        const ok = await saveFile(`Планер-копия-${today()}.json`, JSON.stringify(db, null, 1), 'application/json');
        if (ok) { db.settings.lastBackup = today(); commit(); toast('Копия сохранена'); }
      },
      demo: () => {
        if (!isEmpty() && !confirm('Текущие данные будут заменены примером. Продолжить?')) return;
        replaceAll(demoData()); toast('Пример загружен'); location.hash = '#/today';
      },
      reset: () => {
        if (!confirm('Удалить ВСЕ данные с этого телефона?')) return;
        if (!confirm('Точно? Восстановить можно будет только из резервной копии.')) return;
        resetAll(); applyTheme(); toast('Данные удалены'); location.hash = '#/today';
      },
    },
    mount: (root) => {

      root.querySelector('[data-import]')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          if (!validBackup(data)) throw new Error('bad');
          if (!confirm('Заменить текущие данные данными из копии?')) return;
          replaceAll(data); applyTheme(); toast('Данные восстановлены ✓');
        } catch { toast('Это не похоже на файл резервной копии'); }
        e.target.value = '';
      });
    },
  };
}

async function runCheck() {
  check = { ok: false, text: 'проверяю…' };
  window.dispatchEvent(new Event('dbchange'));
  try {
    const ping = await fetch(`${getServer()}/ping`).then((r) => r.json());
    if (!ping.kv) check = { ok: false, text: 'не подключено хранилище PLANNER' };
    else if (!ping.auth) check = { ok: false, text: 'не задан секрет TOKEN' };
    else {
      await serverFetch('/health?days=1');
      await pullHealth({ force: true }).catch(() => {});
      check = { ok: true, text: `работает ✓${ping.claude ? ' · Claude подключён' : ' · нет ключа Claude'}` };
    }
  } catch (e) {
    check = { ok: false, text: e.status === 401 ? 'неверный токен' : 'сервер недоступен' };
  }
  window.dispatchEvent(new Event('dbchange'));
}

function serverHelp() {
  openSheet(`<div class="sheet-head"><h2>Свой сервер</h2><button class="icon-btn" data-close>✕</button></div>
  <div class="help server-steps">
    <p>Сервер — это бесплатный Cloudflare Worker. Нужен только аккаунт Cloudflare (почта и пароль), карта не нужна.</p>
    <h3>1. Создать сервер</h3>
    <ol>
      <li>Зарегистрируйтесь на <b>dash.cloudflare.com</b>.</li>
      <li>Слева <b>Workers & Pages</b> (Compute) → <b>Create</b> → <b>Start with Hello World</b> → имя <code>ilya-planner</code> → <b>Deploy</b>.</li>
      <li>Нажмите <b>Edit code</b>, удалите весь текст и вставьте код сервера (кнопка ниже копирует его) → <b>Deploy</b>.</li>
    </ol>
    <button type="button" class="btn ghost full" data-copyworker>Скопировать код сервера</button>
    <h3>2. Хранилище</h3>
    <ol>
      <li>Слева <b>Storage & Databases</b> → <b>KV</b> → <b>Create</b> → имя <code>planner</code>.</li>
      <li>Вернитесь в сервер <code>ilya-planner</code> → <b>Bindings</b> → <b>Add binding</b> → <b>KV namespace</b> → имя переменной <code>PLANNER</code>, хранилище <code>planner</code> → <b>Add</b>.</li>
    </ol>
    <h3>3. Секреты</h3>
    <ol>
      <li>В сервере → <b>Settings</b> → <b>Variables and Secrets</b> → <b>Add</b> → тип <b>Secret</b>, имя <code>TOKEN</code>, значение — токен из «Подключить сервер» в планере (кнопка «Скопировать токен»).</li>
      <li>Ещё один секрет: <code>ANTHROPIC_API_KEY</code> — ваш ключ Claude API (для ассистента и оценки по фото). → <b>Deploy</b>.</li>
    </ol>
    <h3>4. Подключить планер</h3>
    <ol>
      <li>Скопируйте адрес сервера вверху страницы Worker: <code>https://ilya-planner.…workers.dev</code>.</li>
      <li>В планере: «Подключить сервер» → вставьте адрес и тот же токен → «Сохранить». Должно появиться «работает ✓».</li>
    </ol>
    <h3>5. Шаги сами</h3>
    <p>В команде «планер: здоровье» замените «Скопировать в буфер обмена» на <b>«Получить содержимое URL»</b> — подробно в «Здоровье» → «Шаги» → «Как настроить».</p>
  </div>`, (panel) => {
    panel.querySelector('[data-copyworker]').addEventListener('click', async () => {
      try {
        const code = await fetch('worker/worker.js', { cache: 'no-store' }).then((r) => r.text());
        await navigator.clipboard.writeText(code);
        toast('Код сервера скопирован');
      } catch { toast('Не получилось скопировать'); }
    });
  });
}

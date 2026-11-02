import { db, commit, replaceAll, resetAll, isEmpty, validBackup } from '../store.js';
import { esc, today, fmtDate } from '../utils.js';
import { pageHead, sectionHead } from '../components.js';
import { formSheet, saveFile, toast } from '../ui.js';
import { demoData } from '../demo.js';
import { applyTheme } from '../theme.js';

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
  <p class="muted small center">Планер Ильи · данные не покидают устройство</p>`;

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

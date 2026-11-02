import { db } from '../store.js';
import { esc } from '../utils.js';
import { pageHead, empty } from '../components.js';
import { openNote } from '../forms.js';

export function render() {
  const list = db.notes.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const html = `
  ${pageHead('Заметки', { back: '#/more', action: '<button class="btn primary sm" data-act="add">+ Заметка</button>' })}
  ${list.length ? `<input class="search" type="search" placeholder="Поиск по заметкам" data-search>
  <div class="notes-grid">${list.map((n) => `
    <div class="note tap${n.pinned ? ' pinned' : ''}" data-act="edit" data-id="${n.id}" data-text="${esc(`${n.title || ''} ${n.text || ''}`.toLowerCase())}">
      ${n.pinned ? '<span class="pin">📌</span>' : ''}${n.title ? `<b>${esc(n.title)}</b>` : ''}<p>${esc((n.text || '').slice(0, 220))}</p>
      <small>${n.updatedAt ? new Date(n.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}</small>
    </div>`).join('')}</div>` : empty('✎', 'Идеи, контакты, мысли, итоги встреч — всё сюда.', '<button class="btn primary" data-act="add">Новая заметка</button>')}`;
  return {
    html,
    actions: { add: () => openNote(), edit: (d) => openNote(db.notes.find((x) => x.id === d.id)) },
    mount: (root) => {
      root.querySelector('[data-search]')?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        root.querySelectorAll('.note').forEach((el) => (el.hidden = q && !el.dataset.text.includes(q)));
      });
    },
  };
}

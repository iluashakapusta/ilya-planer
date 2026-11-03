// Нижние шторки, формы, уведомления, файлы
import { esc } from './utils.js';

let sheetEl = null;

export function openSheet(html, mount) {
  closeSheet(true);
  sheetEl = document.createElement('div');
  sheetEl.className = 'sheet-wrap';
  sheetEl.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div>${html}</div>`;
  document.body.appendChild(sheetEl);
  document.body.classList.add('noscroll');
  requestAnimationFrame(() => requestAnimationFrame(() => sheetEl?.classList.add('open')));
  sheetEl.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  mount?.(sheetEl.querySelector('.sheet'));
}

export function closeSheet(immediate) {
  if (!sheetEl) return;
  const el = sheetEl;
  sheetEl = null;
  document.body.classList.remove('noscroll');
  if (immediate === true) { el.remove(); return; }
  el.classList.remove('open');
  setTimeout(() => el.remove(), 260);
}

export const sheetOpen = () => !!sheetEl;

function fieldHtml(f, val) {
  const id = 'f_' + f.name;
  const cls = `field${f.half ? ' half' : ''}`;
  if (f.type === 'seg') {
    return `<div class="${cls}" data-field="${f.name}"><span class="lbl">${esc(f.label)}</span><div class="seg">${f.options
      .map(([v, l]) => `<label><input type="radio" name="${f.name}" value="${esc(v)}" ${String(val ?? '') === String(v) ? 'checked' : ''}><span>${esc(l)}</span></label>`)
      .join('')}</div></div>`;
  }
  if (f.type === 'toggle') {
    return `<div class="${cls}" data-field="${f.name}"><label class="switch-row"><span>${esc(f.label)}</span><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}><i class="switch"></i></label></div>`;
  }
  if (f.type === 'heading') return `<div class="field form-heading" data-field="${f.name}">${esc(f.label)}</div>`;
  let input;
  if (f.type === 'textarea') {
    input = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}">${esc(val ?? '')}</textarea>`;
  } else if (f.type === 'select') {
    input = `<select id="${id}" name="${f.name}">${f.options
      .map(([v, l]) => `<option value="${esc(v)}" ${String(val ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`)
      .join('')}</select>`;
  } else if (f.type === 'money' || f.type === 'number') {
    input = `<input id="${id}" name="${f.name}" type="text" inputmode="decimal" value="${esc(val ?? '')}" placeholder="${esc(f.placeholder || '0')}" autocomplete="off">`;
  } else {
    input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(val ?? '')}" placeholder="${esc(f.placeholder || '')}" ${f.list ? `list="${id}_l"` : ''} autocomplete="off">${
      f.list ? `<datalist id="${id}_l">${f.list.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
  }
  return `<div class="${cls}" data-field="${f.name}"><label for="${id}">${esc(f.label)}</label>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`;
}

function collect(form, fields) {
  const v = {};
  for (const f of fields) {
    if (f.type === 'heading') continue;
    if (f.type === 'seg') { v[f.name] = form.querySelector(`input[name="${f.name}"]:checked`)?.value ?? ''; continue; }
    const el = form.elements[f.name];
    if (!el) continue;
    if (f.type === 'toggle') v[f.name] = el.checked;
    else if (f.type === 'money' || f.type === 'number') {
      const s = el.value.replace(/\s/g, '').replace(',', '.');
      v[f.name] = s === '' || isNaN(Number(s)) ? null : Number(s);
    } else v[f.name] = el.value.trim();
  }
  return v;
}

/** Универсальная форма в шторке */
export function formSheet({ title, fields, values = {}, submitLabel = 'Сохранить', onSubmit, onDelete, extra = '' }) {
  const body = fields.map((f) => fieldHtml(f, values[f.name])).join('');
  openSheet(
    `<form class="form" novalidate>
      <div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">✕</button></div>
      <div class="form-grid">${body}</div>${extra}
      <div class="form-actions">
        ${onDelete ? '<button type="button" class="btn ghost danger" data-del>Удалить</button>' : ''}
        <button class="btn primary" type="submit">${esc(submitLabel)}</button>
      </div>
    </form>`,
    (panel) => {
      const form = panel.querySelector('form');
      const update = () => {
        const v = collect(form, fields);
        for (const f of fields) if (f.show) form.querySelector(`[data-field="${f.name}"]`).hidden = !f.show(v);
      };
      form.addEventListener('input', update);
      form.addEventListener('change', update);
      update();
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = collect(form, fields);
        for (const f of fields) {
          if (!f.required || (f.show && !f.show(v))) continue;
          if (v[f.name] === '' || v[f.name] == null) { toast(`Заполните поле «${f.label}»`); return; }
        }
        if (onSubmit(v) !== false) closeSheet();
      });
      form.querySelector('[data-del]')?.addEventListener('click', () => {
        if (confirm('Удалить? Это действие нельзя отменить.')) { onDelete(); closeSheet(); }
      });
    }
  );
}

let toastTimer;
export function toast(text) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
window.addEventListener('toast', (e) => toast(e.detail));

/** Поделиться файлом (iPhone) или скачать */
export async function saveFile(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  try {
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (e) {
    if (e.name === 'AbortError') return false;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return true;
}

/** CSV, который корректно открывается в русском Excel */
export function toCSV(rows) {
  const q = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n');
}

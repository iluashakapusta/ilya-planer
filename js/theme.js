import { db } from './store.js';

export function applyTheme() {
  const th = db.settings.theme;
  const root = document.documentElement;
  if (th === 'light' || th === 'dark') root.dataset.theme = th;
  else delete root.dataset.theme;
  const dark = th === 'dark' || (th !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B1622' : '#1C3553');
}

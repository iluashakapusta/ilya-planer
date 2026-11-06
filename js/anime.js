// Сводка из раздела «Аниме» (anime/): что смотрю и где остановился
export function animeSummary() {
  try {
    const s = JSON.parse(localStorage.getItem('anime:summary') || 'null');
    return s && Array.isArray(s.items) ? s : null;
  } catch { return null; }
}
export const animeLoggedIn = () => { try { return !!JSON.parse(localStorage.getItem('anime:token') || 'null'); } catch { return false; } };

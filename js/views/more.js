import { db } from '../store.js';
import { today } from '../utils.js';
import { pageHead } from '../components.js';
import { paymentsSoon } from '../agenda.js';

export function render() {
  const t = today();
  const notes = db.notes.length;
  const pays = paymentsSoon(7).length;
  const proj = db.projects.filter((p) => p.status === 'active').length;
  const meets = db.meetings.filter((m) => m.date >= t && !m.done).length;
  const items = [
    ['#/calendar', '🗓', 'Календарь', 'Встречи, дела, платежи'],
    ['#/work/projects', '📁', 'Проекты', proj ? `${proj} в работе` : 'Задачи и дедлайны'],
    ['#/work/meetings', '🤝', 'Встречи', meets ? `${meets} впереди` : 'Созвоны и встречи'],
    ['#/money/payments', '₽', 'Платежи', pays ? `${pays} на этой неделе` : 'Аренда, подписки, связь'],
    ['#/assistant', '✦', 'Ассистент', 'Спросить или записать'],
    ['#/notes', '✎', 'Заметки', notes ? `${notes} шт.` : 'Идеи и мысли'],
    ['#/year', '∑', 'Итоги года', 'Цифры и статистика'],
    ['#/settings', '⚙︎', 'Настройки', 'Профиль и резервная копия'],
  ];
  return {
    html: `${pageHead('Ещё')}
    <div class="more-grid">${items.map(([href, icon, title, sub]) => `<a class="more-tile" href="${href}"><span class="more-icon">${icon}</span><b>${title}</b><small>${sub}</small></a>`).join('')}</div>`,
    actions: {},
  };
}

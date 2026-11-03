// Справочники

export const CATS = [
  { id: 'groceries', name: 'Продукты', icon: '🛒' },
  { id: 'food', name: 'Кафе и рестораны', icon: '🍽️' },
  { id: 'coffee', name: 'Кофе', icon: '☕' },
  { id: 'transport', name: 'Такси и транспорт', icon: '🚕' },
  { id: 'car', name: 'Авто', icon: '🚗' },
  { id: 'home', name: 'Жильё и ЖКХ', icon: '🏠' },
  { id: 'subs', name: 'Связь и подписки', icon: '📱' },
  { id: 'clothes', name: 'Одежда', icon: '👔' },
  { id: 'health', name: 'Здоровье', icon: '💊' },
  { id: 'sport', name: 'Спорт', icon: '🏋️' },
  { id: 'fun', name: 'Досуг', icon: '🎭' },
  { id: 'gifts', name: 'Подарки', icon: '🎁' },
  { id: 'travel', name: 'Путешествия', icon: '✈️' },
  { id: 'education', name: 'Обучение и книги', icon: '📚' },
  { id: 'work', name: 'Для работы', icon: '💼' },
  { id: 'other', name: 'Другое', icon: '✦' },
];
export const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));

export const PAY_METHODS = { card: '💳 Карта', cash: '💵 Наличные' };

export const AREAS = {
  work: { icon: '💼', name: 'Работа' },
  personal: { icon: '🌿', name: 'Личное' },
  home: { icon: '🏠', name: 'Дом' },
};

export const PRIOS = { high: 'Высокий', mid: 'Средний', low: 'Низкий' };

export const REPEATS = { none: 'Не повторять', daily: 'Каждый день', weekdays: 'По будням', weekly: 'Каждую неделю', monthly: 'Каждый месяц' };

export const MEET_TYPES = {
  meeting: { icon: '🤝', name: 'Встреча' },
  call: { icon: '📞', name: 'Созвон' },
  lunch: { icon: '🍽️', name: 'Деловой обед' },
  event: { icon: '🎟️', name: 'Мероприятие' },
  personal: { icon: '🌿', name: 'Личное' },
  other: { icon: '📌', name: 'Другое' },
};

export const PROJECT_STATUS = {
  active: { name: 'В работе', cls: 'blue' },
  paused: { name: 'На паузе', cls: '' },
  done: { name: 'Завершён', cls: 'live' },
};

export const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
export const WD_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

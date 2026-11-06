// Оценка % жира по фото через Claude API.
// Запрос идёт через сервер планера (ключ на сервере) или напрямую с ключом из настроек.
// Фото в планере не сохраняется.

import { getClient, errorCode, MODEL, AI_ERRORS, getApiKey, setApiKey, aiReady } from './ai.js';

export { AI_ERRORS, getApiKey, setApiKey, aiReady };

/** Уменьшить фото до 1024 px по длинной стороне и вернуть base64 JPEG */
export async function prepareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { base64: dataUrl.split(',')[1], preview: dataUrl };
  } finally { URL.revokeObjectURL(url); }
}

const SCHEMA = {
  type: 'object',
  properties: {
    body_fat_percent: { type: 'number' },
    range_low: { type: 'number' },
    range_high: { type: 'number' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    notes: { type: 'string' },
  },
  required: ['body_fat_percent', 'range_low', 'range_high', 'confidence', 'notes'],
  additionalProperties: false,
};

const PROMPT = (ctx) => `Оцени процент подкожного и общего жира в теле человека на фото — визуально, как это делает опытный тренер, сравнивая с типичными эталонами (видимость пресса, рельеф плеч и рук, жир на животе, боках, груди).
${ctx}
Дай одну наиболее вероятную цифру и разумный диапазон. Если фото не подходит (не видно торса, плохой свет, одежда), всё равно дай осторожную оценку, поставь confidence = "low" и объясни в notes, какое фото сделать лучше.
notes — 1–3 коротких предложения по-русски: на что опиралась оценка и что улучшить в фото. Это ориентир, а не медицинское измерение.`;

export async function estimateBodyFat({ base64, sex, age, height, weight }) {
  const { Anthropic, client } = await getClient();
  const ctx = [sex === 'f' ? 'Пол: женский.' : 'Пол: мужской.', age ? `Возраст: ${age}.` : '', height ? `Рост: ${height} см.` : '', weight ? `Вес: ${weight} кг.` : ''].filter(Boolean).join(' ');

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: PROMPT(ctx) },
        ],
      }],
    });
  } catch (e) {
    throw new Error(errorCode(e, Anthropic));
  }

  if (response.stop_reason === 'refusal') throw new Error('refusal');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('parse'); }
  const clamp = (n) => Math.min(60, Math.max(3, Math.round(Number(n) * 10) / 10));
  return {
    fat: clamp(data.body_fat_percent),
    low: clamp(data.range_low),
    high: clamp(data.range_high),
    confidence: data.confidence,
    notes: String(data.notes || ''),
  };
}

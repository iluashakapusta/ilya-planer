// Сканер штрихкодов через камеру. В Safari на iPhone встроенного распознавания нет,
// поэтому используется ZXing (WebAssembly), он лежит в js/vendor/barcode.
import { openSheet, closeSheet, toast } from './ui.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
let detectorPromise = null;

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        if ('BarcodeDetector' in window) {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          if (supported.includes('ean_13')) return new window.BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) });
        }
      } catch { /* переходим на ZXing */ }
      const mod = await import('./vendor/barcode/ponyfill.js');
      const wasmUrl = new URL('./vendor/barcode/zxing_reader.wasm', import.meta.url).href;
      mod.setZXingModuleOverrides({ locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) });
      return new mod.BarcodeDetector({ formats: FORMATS });
    })();
    detectorPromise.catch(() => { detectorPromise = null; });
  }
  return detectorPromise;
}

/** Открыть камеру; onCode(code) вызывается один раз с найденным штрихкодом */
export function openScanner(onCode) {
  let stream = null, stopped = false, timer = null;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
  };
  const done = (code) => {
    if (stopped) return;
    stop();
    navigator.vibrate?.(40);
    closeSheet(true);
    onCode(code);
  };

  openSheet(`
    <div class="sheet-head"><h2>Сканер</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">✕</button></div>
    <div class="scan-box"><video playsinline muted autoplay></video><div class="scan-frame"></div><p class="scan-status">Включаю камеру…</p></div>
    <p class="muted small center">Наведите камеру на штрихкод на упаковке</p>
    <form class="scan-manual"><input name="code" inputmode="numeric" placeholder="или введите цифры штрихкода" autocomplete="off"><button class="btn ghost sm">Найти</button></form>`,
  async (panel) => {
    const video = panel.querySelector('video');
    const status = panel.querySelector('.scan-status');
    panel.querySelector('.scan-manual').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = e.target.elements.code.value.replace(/\D/g, '');
      if (code.length >= 6) done(code); else toast('Введите штрихкод целиком');
    });
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocam');
      const [s, detector] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
        getDetector(),
      ]);
      if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      video.srcObject = s;
      await video.play().catch(() => {});
      status.textContent = '';
      const tick = async () => {
        if (stopped) return;
        try {
          if (video.readyState >= 2) {
            const found = await detector.detect(video);
            const code = found.find((b) => /^\d{6,14}$/.test(b.rawValue))?.rawValue;
            if (code) return done(code);
          }
        } catch { /* кадр не распознан — пробуем следующий */ }
        timer = setTimeout(tick, 180);
      };
      tick();
    } catch (e) {
      status.textContent = e?.name === 'NotAllowedError'
        ? 'Нет доступа к камере. Разрешите его в настройках Safari или введите штрихкод вручную.'
        : 'Камера недоступна. Введите штрихкод вручную.';
    }
  }, stop);
}

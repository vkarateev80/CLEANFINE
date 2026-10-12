/**
 * Привлечь внимание к событию, когда страница открыта (12.10.2026): вибрация
 * (Android Chrome; iOS Safari вибрацию из веба не даёт) и короткий сигнал
 * через WebAudio. Оба требуют, чтобы пользователь уже взаимодействовал со
 * страницей — в рабочем приложении это всегда так. Ошибки глушим: сигнал —
 * не функция, без которой нельзя работать.
 */
let audioContext: AudioContext | null = null;

function beep(frequency: number, durationMs: number, delayMs = 0): void {
  if (typeof window === 'undefined') return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  audioContext = audioContext ?? new Ctor();
  const context = audioContext;
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  const start = context.currentTime + delayMs / 1000;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.3, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + durationMs / 1000 + 0.02);
}

export interface AlertOptions {
  /** Шаблон вибрации, мс; по умолчанию два коротких импульса. */
  vibrate?: number[];
  /** Без звука (например, тихое событие чата). */
  silent?: boolean;
}

export function alertUser(options: AlertOptions = {}): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(options.vibrate ?? [200, 100, 200]);
    }
  } catch {
    /* вибрация недоступна */
  }
  if (options.silent) return;
  try {
    beep(880, 120);
    beep(1175, 160, 150);
  } catch {
    /* звук недоступен */
  }
}

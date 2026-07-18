/**
 * notify.ts — drop-in replacement for `import { toast } from "sonner"`
 * Plays a short Web Audio tone on every notification, then delegates to sonner.
 */
import { toast as _toast } from "sonner";

type ToastFn = typeof _toast;

// ── Audio ──────────────────────────────────────────────────────────────────
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!_ctx || _ctx.state === "closed") {
      _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return _ctx;
  } catch {
    return null;
  }
}

function playTone(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.18) {
  const ctx = getCtx();
  if (!ctx) return;

  // Resume context after a user gesture (browsers require this)
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gainNode.gain.setValueAtTime(gain, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playSuccess() {
  // Two-note ascending chime: 880 Hz → 1108 Hz
  playTone(880, 0.12, "sine", 0.15);
  setTimeout(() => playTone(1108, 0.18, "sine", 0.13), 100);
}

function playError() {
  // Low double buzz
  playTone(220, 0.12, "square", 0.12);
  setTimeout(() => playTone(180, 0.16, "square", 0.10), 130);
}

function playInfo() {
  // Single soft click
  playTone(660, 0.1, "sine", 0.12);
}

function playWarning() {
  // Mid-pitch wobble
  playTone(520, 0.15, "triangle", 0.13);
}

// ── Wrapped toast ──────────────────────────────────────────────────────────
function success(message: Parameters<ToastFn["success"]>[0], options?: Parameters<ToastFn["success"]>[1]) {
  playSuccess();
  return _toast.success(message, options);
}

function error(message: Parameters<ToastFn["error"]>[0], options?: Parameters<ToastFn["error"]>[1]) {
  playError();
  return _toast.error(message, options);
}

function info(message: Parameters<ToastFn["info"]>[0], options?: Parameters<ToastFn["info"]>[1]) {
  playInfo();
  return _toast.info(message, options);
}

function warning(message: Parameters<ToastFn["warning"]>[0], options?: Parameters<ToastFn["warning"]>[1]) {
  playWarning();
  return _toast.warning(message, options);
}

// Plain toast (default)
function base(message: Parameters<ToastFn>[0], options?: Parameters<ToastFn>[1]) {
  playInfo();
  return _toast(message, options);
}

// ── Speech ─────────────────────────────────────────────────────────────────
export function speak(text: string, lang = "en-US") {
  try {
    if (!window.speechSynthesis) return;
    // Cancel any ongoing speech before queuing a new one
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang;
    utt.rate = 0.95;
    utt.pitch = 1;
    utt.volume = 1;
    window.speechSynthesis.speak(utt);
  } catch {
    // Speech not supported — fail silently
  }
}

// Re-export everything from sonner we don't override
export const toast = Object.assign(base, {
  success,
  error,
  info,
  warning,
  // Pass-throughs for anything else (loading, dismiss, promise, etc.)
  loading: _toast.loading.bind(_toast),
  dismiss: _toast.dismiss.bind(_toast),
  promise: _toast.promise.bind(_toast),
  custom: _toast.custom.bind(_toast),
  message: _toast.message.bind(_toast),
});

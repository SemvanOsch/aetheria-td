/**
 * Tiny synthesized sound effects for the first-launch journal intro.
 *
 * PLACEHOLDER AUDIO — the project ships no audio assets, so rather than block the
 * feature these cues are generated on the fly with the Web Audio API (filtered
 * noise for paper/ink, short sines for chimes). They are intentionally soft and
 * fail silently if audio is unavailable or blocked. Swap `playIntroSound` for
 * real recorded assets later without touching the callers.
 *
 * The AudioContext is created lazily on the first sound (which always follows a
 * user gesture in the intro, so autoplay policies allow it).
 */

type IntroSound = 'open' | 'pageTurn' | 'quill' | 'stamp' | 'confirm' | 'hover';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A short burst of band-passed noise — used for paper/ink textures. */
function noiseSwish(ac: AudioContext, dur: number, freq: number, q: number, gain: number): void {
  const frames = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + dur);
}

/** A soft sine "ping" — used for confirmation chimes. */
function tone(ac: AudioContext, freq: number, dur: number, gain: number, delay = 0): void {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  const g = ac.createGain();
  const t = ac.currentTime + delay;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur);
}

/** Play one of the intro cues. Silent no-op if audio is unavailable. */
export function playIntroSound(sound: IntroSound): void {
  const ac = audio();
  if (!ac) return;
  try {
    switch (sound) {
      case 'open': // leather journal opening — a low, slow paper swish
        noiseSwish(ac, 0.5, 320, 0.7, 0.06);
        noiseSwish(ac, 0.35, 140, 0.9, 0.05);
        break;
      case 'pageTurn': // crisp paper flip
        noiseSwish(ac, 0.28, 1600, 1.4, 0.05);
        break;
      case 'quill': // brief ink scratch
        noiseSwish(ac, 0.09, 2600, 3, 0.035);
        break;
      case 'stamp': // wax-seal thud
        tone(ac, 90, 0.18, 0.09);
        noiseSwish(ac, 0.12, 200, 0.8, 0.05);
        break;
      case 'confirm': // soft two-note flourish
        tone(ac, 587, 0.25, 0.05);
        tone(ac, 880, 0.4, 0.05, 0.09);
        break;
      case 'hover': // faint UI tick
        tone(ac, 660, 0.05, 0.02);
        break;
    }
  } catch {
    /* ignore — audio is best-effort polish */
  }
}

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

import { audioBus } from './audioBus';

type IntroSound = 'open' | 'pageTurn' | 'quill' | 'sketch' | 'stamp' | 'confirm' | 'hover';

// Destination for the sound being scheduled — the shared bus's interface output,
// so intro cues obey the player's volume settings. Set synchronously in
// `playIntroSound` before the sound runs.
let dest: AudioNode | null = null;

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
  src.connect(bp).connect(g).connect(dest ?? ac.destination);
  src.start(t);
  src.stop(t + dur);
}

/**
 * A short, scratchy ink stroke — filtered noise whose band drags *downward*
 * across the stroke (the nib pulling over the page) with a soft attack. Every
 * parameter is jittered per call so a rapid run of strokes reads like a hand
 * writing, not a mechanical typewriter tick.
 */
function inkScratch(ac: AudioContext, delay = 0, gainScale = 1): void {
  const dur = 0.05 + Math.random() * 0.05;
  const base = 900 + Math.random() * 650;
  const frames = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buf.getChannelData(0);
  // Slightly "grainy" noise (a touch of neighbour averaging) — softer than the
  // pure white hiss of a tick, closer to fibres catching under a nib.
  let prev = 0;
  for (let i = 0; i < frames; i++) {
    const white = Math.random() * 2 - 1;
    prev = white * 0.7 + prev * 0.3;
    data[i] = prev;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  const t = ac.currentTime + delay;
  bp.frequency.setValueAtTime(base * 1.3, t);
  bp.frequency.exponentialRampToValueAtTime(base * 0.55, t + dur);
  const g = ac.createGain();
  const gain = (0.02 + Math.random() * 0.012) * gainScale;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(dest ?? ac.destination);
  src.start(t);
  src.stop(t + dur);
}

/**
 * A run of quick ink strokes over ~1.1s — the sketching heard while a portrait
 * inks itself in. Strokes are scheduled at jittered intervals with a soft
 * swell-in and fade-out so it reads as hurried drawing, then trailing off.
 */
function sketchRun(ac: AudioContext): void {
  let t = 0.02;
  const total = 1.1;
  while (t < total) {
    // Ease the volume up then down across the run, so it starts and ends gently.
    const phase = t / total;
    const envelope = Math.sin(phase * Math.PI); // 0 → 1 → 0
    inkScratch(ac, t, 0.6 + envelope * 0.7);
    t += 0.06 + Math.random() * 0.07;
  }
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
  osc.connect(g).connect(dest ?? ac.destination);
  osc.start(t);
  osc.stop(t + dur);
}

/** Play one of the intro cues. Silent no-op if audio is unavailable. */
export function playIntroSound(sound: IntroSound): void {
  const bus = audioBus('ui');
  if (!bus) return;
  const { ac } = bus;
  dest = bus.out;
  try {
    switch (sound) {
      case 'open': // leather journal opening — a low, slow paper swish
        noiseSwish(ac, 0.5, 320, 0.7, 0.06);
        noiseSwish(ac, 0.35, 140, 0.9, 0.05);
        break;
      case 'pageTurn': // crisp paper flip
        noiseSwish(ac, 0.28, 1600, 1.4, 0.05);
        break;
      case 'quill': // a quill stroke scratching across the page
        inkScratch(ac);
        break;
      case 'sketch': // a flurry of strokes while the portrait inks itself in
        sketchRun(ac);
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

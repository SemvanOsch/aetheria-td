/**
 * Tiny synthesized sound effects for the Summoning Altar.
 *
 * PLACEHOLDER AUDIO — like `introAudio.ts`, the project ships no audio assets,
 * so these cues are generated on the fly with the Web Audio API: a rising
 * magical swell while the orb charges, and a bright chime flourish when the
 * champion is revealed (grander the rarer the pull). Soft by design, and they
 * fail silently if audio is unavailable or blocked. Swap `playSummonSound` for
 * real recorded assets later without touching the callers.
 *
 * The AudioContext is created lazily on the first sound (which always follows a
 * user gesture — the Summon button — so autoplay policies allow it).
 */

import { audioBus } from './audioBus';

// Destination for the sound being scheduled — the shared bus's interface output,
// so summon cues obey the player's volume settings. Set synchronously in
// `playSummonSound` before the voice runs.
let dest: AudioNode | null = null;

/** A sine tone with a soft attack and exponential fade — the chime building block. */
function tone(ac: AudioContext, freq: number, dur: number, gain: number, delay = 0, type: OscillatorType = 'sine'): void {
  const osc = ac.createOscillator();
  osc.type = type;
  const g = ac.createGain();
  const t = ac.currentTime + delay;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest ?? ac.destination);
  osc.start(t);
  osc.stop(t + dur);
}

/** A pitch sweep — a single oscillator gliding from `from` to `to` Hz. */
function sweep(ac: AudioContext, from: number, to: number, dur: number, gain: number, delay = 0, type: OscillatorType = 'sine'): void {
  const osc = ac.createOscillator();
  osc.type = type;
  const g = ac.createGain();
  const t = ac.currentTime + delay;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest ?? ac.destination);
  osc.start(t);
  osc.stop(t + dur);
}

/** A soft airy shimmer — band-passed noise, for magical "energy" texture. */
function shimmer(ac: AudioContext, dur: number, freq: number, gain: number, delay = 0): void {
  const frames = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 0.8;
  const g = ac.createGain();
  const t = ac.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(dest ?? ac.destination);
  src.start(t);
  src.stop(t + dur);
}

/**
 * The orb channeling gems — a rising, swelling hum with a shimmer of energy.
 * Tuned to run for roughly the ~0.85s charge window before the reveal.
 */
function playCharge(ac: AudioContext): void {
  // Two slightly detuned sweeps rising an octave for a warm, gathering hum.
  sweep(ac, 160, 330, 0.85, 0.06, 0, 'triangle');
  sweep(ac, 161, 332, 0.85, 0.05, 0, 'sine');
  // Airy energy swelling with it, brightening as it rises.
  shimmer(ac, 0.8, 1400, 0.03, 0.05);
  shimmer(ac, 0.7, 2600, 0.02, 0.2);
}

/**
 * The champion revealed — a bright chime flourish. A major arpeggio blooms out,
 * with extra octave sparkle and shimmer scaled by rarity (`order`: 0 common …
 * 3 legendary) so rarer pulls land grander.
 */
function playReveal(ac: AudioContext, rarityOrder: number): void {
  const tier = Math.max(0, Math.min(3, rarityOrder));
  const grand = tier / 3; // 0 → 1
  const gain = 0.05 + grand * 0.02;

  // Rising major arpeggio (E5–G#5–B5–E6) — the core flourish.
  const notes = [659.25, 830.61, 987.77, 1318.51];
  notes.forEach((f, i) => tone(ac, f, 0.5 + i * 0.08, gain, i * 0.06));

  // A soft low bloom underneath gives the reveal body.
  tone(ac, 329.63, 0.6, 0.045, 0, 'triangle');

  // Rarer pulls add a high sparkle tail and brighter shimmer.
  if (tier >= 1) {
    shimmer(ac, 0.5, 3200, 0.02 + grand * 0.02, 0.1);
  }
  if (tier >= 2) {
    // An extra octave "ting" for epic+.
    tone(ac, 1975.53, 0.5, 0.03, 0.28);
    tone(ac, 2637.02, 0.55, 0.025, 0.38);
  }
}

export type SummonSound = 'charge' | 'reveal';

/**
 * Play a summon cue. Silent no-op if audio is unavailable. `rarityOrder` scales
 * the reveal's grandeur (ignored by `charge`).
 */
export function playSummonSound(sound: SummonSound, rarityOrder = 0): void {
  const bus = audioBus('ui');
  if (!bus) return;
  const { ac } = bus;
  dest = bus.out;
  try {
    switch (sound) {
      case 'charge':
        playCharge(ac);
        break;
      case 'reveal':
        playReveal(ac, rarityOrder);
        break;
    }
  } catch {
    /* ignore — audio is best-effort polish */
  }
}

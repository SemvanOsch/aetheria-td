/**
 * Champion placement sounds — a soft thump + chime when a champion deploys, and
 * a dull knock when it can't. Synthesized like every other cue (no audio assets
 * ship), fired directly by `GameScreen`. Kept well below the combat cues so
 * they confirm the action without competing with the battle.
 */

import { AUDIO_LEAD, audioBus, type AudioCategory } from './audioBus';

export type UiSound = 'place' | 'deny';

const MIN_GAP = 0.04;
const lastPlayed: Partial<Record<UiSound, number>> = {};

function tone(
  ac: AudioContext,
  out: AudioNode,
  from: number,
  to: number,
  dur: number,
  gain: number,
  type: OscillatorType = 'sine',
  delay = 0,
): void {
  const t = ac.currentTime + AUDIO_LEAD + delay;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + Math.min(0.006, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function swish(
  ac: AudioContext,
  out: AudioNode,
  from: number,
  to: number,
  dur: number,
  gain: number,
  q = 0.9,
  delay = 0,
): void {
  const t = ac.currentTime + AUDIO_LEAD + delay;
  const frames = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(from, t);
  bp.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur);
}

const jit = (base: number, spread: number) => base + (Math.random() * 2 - 1) * spread;

// Steady pitches (no downward sweeps — those read as "laser"), low and warm:
// sines for body, a short filtered-noise tap for the wooden attack.
const VOICES: Record<UiSound, { category: AudioCategory; play: (ac: AudioContext, out: AudioNode) => void }> = {
  // A champion taking the field: a muted boot-on-stone thump with a small,
  // warm confirmation chime (D–A) above it.
  place: {
    category: 'combat',
    play: (ac, out) => {
      tone(ac, out, jit(120, 6), 80, 0.16, 0.085, 'sine');
      swish(ac, out, 600, 260, 0.08, 0.026, 0.8);
      tone(ac, out, 294, 294, 0.22, 0.026, 'sine', 0.04);
      tone(ac, out, 440, 440, 0.26, 0.02, 'sine', 0.1);
    },
  },
  // Can't build there / not enough gold: a dull low double knock.
  deny: {
    category: 'combat',
    play: (ac, out) => {
      tone(ac, out, 150, 146, 0.08, 0.05, 'sine');
      tone(ac, out, 130, 126, 0.1, 0.045, 'sine', 0.09);
    },
  },
};

export function playUiSound(sound: UiSound): void {
  const voice = VOICES[sound];
  const bus = audioBus(voice.category);
  if (!bus) return;
  const now = bus.ac.currentTime;
  if (now - (lastPlayed[sound] ?? -Infinity) < MIN_GAP) return;
  lastPlayed[sound] = now;
  try {
    voice.play(bus.ac, bus.out);
  } catch {
    /* best-effort polish */
  }
}

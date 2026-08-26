/**
 * Tiny synthesized in-battle sound effects (per-champion fire & impact cues).
 *
 * PLACEHOLDER AUDIO — like `introAudio.ts`/`summonAudio.ts`, no audio assets
 * ship, so these are generated on the fly with the Web Audio API. They are
 * deliberately *very* soft and short: a board full of champions lands a great
 * many attacks per second, so every cue is throttled (a minimum gap per cue
 * type) and pitch-jittered, and AoE impacts (spear thrust, wind slice) are
 * mixed quieter still since one attack can strike a whole pack. The board stays
 * lively without turning into a wall of noise. Swap `playCombatSound` for real
 * assets later without touching the callers.
 *
 * Each champion has a distinct fire/cast cue and a matching impact cue, with
 * distinct sounds for the Spearman's heavier Javelin THROW and the Wizard's
 * sweeping Wind Slice. The AudioContext is created lazily on the first sound.
 */

import type { SfxName } from '../engine/GameEngine';
import { audioBus } from './audioBus';

// Destination node for the voice currently being scheduled — the combat
// category output of the shared bus. Set immediately before a voice runs (all
// voices are synchronous), so the helpers below connect through the player's
// volume settings instead of straight to the speakers.
let dest: AudioNode | null = null;

/**
 * Minimum spacing (seconds) between two plays of the same cue. Anything fired
 * within this window of the last one is dropped, so many champions attacking at
 * once collapse into a light patter rather than a roar. AoE impacts get a wider
 * gap so a multi-hit strike doesn't stack on itself.
 */
const MIN_GAP: Partial<Record<SfxName, number>> = {
  spearHit: 0.07,
  windSliceHit: 0.07,
};
const DEFAULT_GAP = 0.05;
const lastPlayed: Partial<Record<SfxName, number>> = {};

// --- synthesis building blocks -------------------------------------------

/** A short band-passed noise burst whose pitch glides `from`→`to` — swishes/thwips. */
function noiseSweep(
  ac: AudioContext,
  from: number,
  to: number,
  dur: number,
  gain: number,
  q = 1.3,
  type: BiquadFilterType = 'bandpass',
): void {
  const frames = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = type;
  bp.Q.value = q;
  const t = ac.currentTime;
  bp.frequency.setValueAtTime(from, t);
  bp.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + Math.min(0.01, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(dest ?? ac.destination);
  src.start(t);
  src.stop(t + dur);
}

/** A short oscillator tone gliding `from`→`to` Hz — clicks, thunks, chimes. */
function toneGlide(
  ac: AudioContext,
  from: number,
  to: number,
  dur: number,
  gain: number,
  type: OscillatorType = 'sine',
  delay = 0,
): void {
  const osc = ac.createOscillator();
  osc.type = type;
  const g = ac.createGain();
  const t = ac.currentTime + delay;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + Math.min(0.008, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest ?? ac.destination);
  osc.start(t);
  osc.stop(t + dur);
}

const jit = (base: number, spread: number) => base + (Math.random() * 2 - 1) * spread;

// --- per-cue voices -------------------------------------------------------
// All kept soft; gains are the loudest each cue reaches.

const VOICES: Record<SfxName, (ac: AudioContext) => void> = {
  // Archer — a light bowstring thwip and a soft arrow thud.
  archerShot: (ac) => noiseSweep(ac, jit(1700, 250), jit(650, 100), 0.07, 0.026),
  archerHit: (ac) => {
    toneGlide(ac, jit(240, 40), 150, 0.06, 0.03, 'triangle');
    noiseSweep(ac, 2600, 2000, 0.03, 0.014, 1, 'highpass');
  },

  // Swordsman — the same airy descending whoosh as the Spearman's thrust, just
  // a little longer so the cut reads as a slice rather than a quick poke.
  swordSwing: (ac) => noiseSweep(ac, jit(900, 120), jit(320, 60), 0.16, 0.024, 0.9),
  // Matches the Spearman's soft thud (single-target, so a touch louder than the
  // AoE spearHit) so the whole swordsman cue reads like the spearman's.
  swordHit: (ac) => toneGlide(ac, jit(300, 50), 170, 0.06, 0.024, 'triangle'),

  // Spearman — an airy thrust whoosh; the Javelin THROW is heavier and longer.
  spearThrust: (ac) => noiseSweep(ac, jit(900, 120), jit(320, 60), 0.12, 0.024, 0.9),
  spearThrow: (ac) => {
    noiseSweep(ac, jit(1050, 120), jit(260, 50), 0.2, 0.03, 0.8);
    toneGlide(ac, jit(150, 20), 90, 0.18, 0.03, 'triangle');
  },
  spearHit: (ac) => toneGlide(ac, jit(300, 50), 170, 0.05, 0.018, 'triangle'), // quieter AoE

  // Crossbow — a snappy mechanical release and a heavier bolt thunk.
  crossbowShot: (ac) => {
    toneGlide(ac, jit(520, 60), 260, 0.03, 0.02, 'square');
    noiseSweep(ac, jit(1400, 200), 700, 0.06, 0.024, 1.6);
  },
  crossbowHit: (ac) => {
    toneGlide(ac, jit(200, 30), 120, 0.08, 0.032, 'triangle');
    noiseSweep(ac, 2400, 1800, 0.03, 0.014, 1, 'highpass');
  },

  // Wizard — an airy gust and its soft puff impact.
  windCast: (ac) => noiseSweep(ac, jit(600, 100), jit(1500, 200), 0.14, 0.022, 0.6),
  windHit: (ac) => noiseSweep(ac, jit(1600, 200), 500, 0.09, 0.024, 0.7),
  // Wind Slice — a longer, breathy gust: two overlapping broadband noise layers
  // sweeping at slightly different rates for turbulence, no tonal component so
  // it reads as wind rather than a synth sweep.
  windSlice: (ac) => {
    noiseSweep(ac, jit(420, 70), jit(1300, 180), 0.34, 0.026, 0.5);
    noiseSweep(ac, jit(800, 120), jit(2000, 250), 0.26, 0.016, 0.4);
  },
  windSliceHit: (ac) => noiseSweep(ac, jit(1900, 250), 900, 0.05, 0.016, 0.8), // quieter AoE

  // Elf — an enchanted twang with a shimmer, and a soft chime tick on impact.
  elfShot: (ac) => {
    noiseSweep(ac, jit(1600, 200), 700, 0.07, 0.02, 1.4);
    toneGlide(ac, jit(1200, 120), 1800, 0.12, 0.016, 'sine');
  },
  // A soft, settling chime — a single gentle tone easing slightly *down* (not a
  // rising "boing") with a faint noise pluck, so bounces read as an enchanted
  // tick rather than a cartoon sparkle.
  elfHit: (ac) => {
    toneGlide(ac, jit(1350, 120), 1150, 0.13, 0.016, 'sine');
    noiseSweep(ac, jit(2400, 250), 1600, 0.03, 0.008, 1.2, 'highpass');
  },
};

/** Play one combat cue, throttled per type. Silent no-op if audio is unavailable. */
export function playCombatSound(sound: SfxName): void {
  const bus = audioBus('combat');
  if (!bus) return;
  const { ac } = bus;
  const now = ac.currentTime;
  const gap = MIN_GAP[sound] ?? DEFAULT_GAP;
  if (now - (lastPlayed[sound] ?? 0) < gap) return; // throttle bursts
  lastPlayed[sound] = now;
  dest = bus.out;
  try {
    VOICES[sound]?.(ac);
  } catch {
    /* ignore — audio is best-effort polish */
  }
}

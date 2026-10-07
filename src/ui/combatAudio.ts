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
import { AUDIO_LEAD, audioBus } from './audioBus';

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
  longbowHit: 0.07,
  staffHit: 0.08,
  stormBolt: 0.08,
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
  delay = 0,
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
  const t = ac.currentTime + AUDIO_LEAD + delay;
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
  const t = ac.currentTime + AUDIO_LEAD + delay;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + Math.min(0.008, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest ?? ac.destination);
  osc.start(t);
  osc.stop(t + dur);
}

/**
 * A plucked-string note (lute / harp): two slightly detuned bright oscillators
 * through a lowpass whose cutoff snaps shut, so the attack twangs and the tail
 * mellows — the way a real string loses its overtones first.
 */
function pluck(ac: AudioContext, freq: number, dur: number, gain: number, delay = 0): void {
  const t = ac.currentTime + AUDIO_LEAD + delay;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(Math.min(9000, freq * 7), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.3), t + dur * 0.5);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(g).connect(dest ?? ac.destination);
  for (const [type, detune] of [['sawtooth', -6], ['triangle', 5]] as const) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(lp);
    osc.start(t);
    osc.stop(t + dur);
  }
}

/**
 * An FM "zap": a sine carrier gliding `from`→`to`, frequency-modulated at an
 * inharmonic `ratio` with a modulation depth (`index`, × the carrier) that dies
 * away — a bright, metallic, unmistakably *synthetic* attack melting into a pure
 * tail. With a fast vibrato on top (`warble` Hz) it shimmers. The magic voice:
 * no breathy noise and no plain glide, so it never reads as a wind instrument.
 */
function fmZap(
  ac: AudioContext,
  from: number,
  to: number,
  dur: number,
  gain: number,
  ratio = 2.73,
  index = 2.5,
  warble = 0,
  delay = 0,
): void {
  const t = ac.currentTime + AUDIO_LEAD + delay;
  const car = ac.createOscillator();
  car.type = 'sine';
  car.frequency.setValueAtTime(from, t);
  car.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
  const mod = ac.createOscillator();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(from * ratio, t);
  mod.frequency.exponentialRampToValueAtTime(Math.max(30, to * ratio), t + dur);
  const depth = ac.createGain();
  depth.gain.setValueAtTime(from * index, t);
  depth.gain.exponentialRampToValueAtTime(Math.max(1, to * index * 0.08), t + dur);
  mod.connect(depth).connect(car.frequency);
  const oscs = [car, mod];
  if (warble > 0) {
    const lfo = ac.createOscillator();
    lfo.frequency.value = warble;
    const lfoDepth = ac.createGain();
    lfoDepth.gain.value = from * 0.04;
    lfo.connect(lfoDepth).connect(car.frequency);
    oscs.push(lfo);
  }
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + Math.min(0.006, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  car.connect(g).connect(dest ?? ac.destination);
  for (const o of oscs) {
    o.start(t);
    o.stop(t + dur);
  }
}

/** A glitter of `count` tiny high sine pips scattered over `dur` — sparkling dust. */
function sparkle(ac: AudioContext, count: number, lo: number, hi: number, dur: number, gain: number, delay = 0): void {
  for (let i = 0; i < count; i++) {
    const f = lo + Math.random() * (hi - lo);
    toneGlide(ac, f, f * 1.08, 0.035, gain, 'sine', delay + Math.random() * dur);
  }
}

const jit = (base: number, spread: number) => base + (Math.random() * 2 - 1) * spread;

// Bard tune phrases: semitone offsets from the root, each [step, beat]. A few
// jaunty minstrel motifs so a long stage doesn't hear the same lick every time.
const BARD_PHRASES: [number, number][][] = [
  [[0, 0], [4, 1], [7, 2]], // rising call
  [[7, 0], [9, 1], [7, 2]], // lilting turn
  [[12, 0], [9, 1], [7, 2]], // gentle fall
  [[4, 0], [7, 1], [9, 2]], // hopeful lift
];
// Major keys the minstrel might strike up in (root Hz).
const BARD_ROOTS = [392, 440, 523.25]; // G4, A4, C5

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

  // Magic adventurer — a soft rising arcane hum as the orb gathers, and a deep
  // muffled boom when it bursts over the pack.
  orbCast: (ac) => {
    toneGlide(ac, jit(240, 30), 620, 0.55, 0.02, 'sine');
    noiseSweep(ac, jit(400, 60), jit(1100, 150), 0.5, 0.01, 0.5);
  },
  orbBurst: (ac) => {
    toneGlide(ac, jit(320, 40), 90, 0.28, 0.03, 'triangle');
    noiseSweep(ac, jit(900, 120), 200, 0.24, 0.03, 0.6, 'lowpass');
  },

  // Greater Orb — a deeper, longer swell under the leap as the huge orb gathers
  // overhead (a soft whump as the feet leave the floor, then a rising hum with a
  // shimmer); a heavy whoosh as it's hurled down; and a big rolling boom, a
  // sub thump and crackle when it crashes into the pack.
  greaterOrbCast: (ac) => {
    noiseSweep(ac, jit(420, 40), 160, 0.16, 0.016, 0.8, 'lowpass', 0.15);
    toneGlide(ac, jit(150, 15), 520, 0.95, 0.024, 'sine', 0.2);
    noiseSweep(ac, jit(300, 40), jit(1300, 150), 0.85, 0.012, 0.5, 'bandpass', 0.25);
    toneGlide(ac, jit(900, 60), 1400, 0.6, 0.006, 'sine', 0.5);
  },
  greaterOrbThrow: (ac) => {
    noiseSweep(ac, jit(1400, 150), jit(260, 40), 0.24, 0.03, 0.7);
    toneGlide(ac, jit(420, 30), 140, 0.22, 0.014, 'triangle');
  },
  greaterOrbBurst: (ac) => {
    toneGlide(ac, jit(240, 25), 48, 0.55, 0.045, 'sine');
    toneGlide(ac, jit(360, 40), 90, 0.32, 0.026, 'triangle');
    noiseSweep(ac, jit(1100, 120), 140, 0.6, 0.038, 0.5, 'lowpass');
    noiseSweep(ac, jit(2600, 200), 1100, 0.3, 0.01, 0.9, 'bandpass', 0.05);
  },

  // Arcane Staff — FM voices, not breath and glides (those read as a flute): a
  // warbling shimmer swelling up as the crystal kindles in the raise; three
  // metallic "pew" zaps with a glitter of sparks as the bolts streak out one
  // after another; and a small fiery whoomp when each strikes.
  staffCast: (ac) => {
    fmZap(ac, jit(520, 30), 1100, 0.32, 0.01, 1.5, 1.2, 14);
    sparkle(ac, 4, 2800, 5200, 0.28, 0.003);
  },
  staffShot: (ac) => {
    for (let i = 0; i < 3; i++) {
      // Spaced like the bolts leaving the crystal (`STAFF_BOLT_STAGGER`).
      fmZap(ac, jit(1300, 80) - i * 110, 420, 0.16, 0.0072, 2.73, 3, 0, i * 0.07);
      sparkle(ac, 2, 3000, 6000, 0.1, 0.0018, i * 0.07);
    }
  },
  staffHit: (ac) => {
    // A small fiery "whoomp", modelled on a fire-magic burst but squeezed from
    // about a second down to a quarter of one (several bolts land per second):
    // a soft click as the point bites, then a low, dark roar of lowpassed noise
    // that flares open (up to ~1.6kHz) and darkens back down into a rumble, over
    // a low sine body dropping away beneath it.
    noiseSweep(ac, jit(4200, 300), 2800, 0.018, 0.008, 0.9, 'highpass');
    noiseSweep(ac, jit(380, 40), jit(1600, 150), 0.06, 0.03, 0.8, 'lowpass');
    noiseSweep(ac, jit(1500, 120), 180, 0.24, 0.036, 0.8, 'lowpass', 0.05);
    toneGlide(ac, jit(165, 12), 62, 0.26, 0.022, 'sine', 0.01);
  },

  // Cyclone Slash (the Blade's ability) — a big whirling steel roar: two broad
  // noise sweeps whipping up in pitch for the whirlwind, plus a low metallic
  // ring underneath for the heft of the spinning blades. Louder than a normal
  // swing since it's a deliberate, one-off activated cast.
  cycloneSlash: (ac) => {
    noiseSweep(ac, jit(360, 60), jit(1700, 200), 0.4, 0.05, 0.5);
    noiseSweep(ac, jit(900, 120), jit(2400, 250), 0.3, 0.03, 0.4);
    toneGlide(ac, jit(180, 20), 90, 0.34, 0.04, 'triangle');
  },

  // Cross Slash (the Blade's every-third-attack X cut) — two crossing swishes a
  // hair apart (one rising, one falling), a solid thud, and a short bright
  // steel "shing" ringing off the crossed blades.
  crossSlash: (ac) => {
    noiseSweep(ac, jit(700, 90), jit(2300, 250), 0.13, 0.03, 0.9);
    noiseSweep(ac, jit(2100, 220), jit(650, 80), 0.13, 0.026, 0.9, 'bandpass', 0.035);
    toneGlide(ac, jit(260, 30), 150, 0.1, 0.03, 'triangle', 0.03);
    toneGlide(ac, jit(1480, 40), 1420, 0.34, 0.011, 'sine', 0.04);
    toneGlide(ac, jit(2220, 60), 2150, 0.22, 0.006, 'sine', 0.04);
  },

  // Claymore — a long, low, heavy whoosh as the great blade comes round, and a
  // deep crunching thud when it bites (one per swing, however many it cleaves).
  claymoreSwing: (ac) => noiseSweep(ac, jit(560, 70), jit(190, 30), 0.3, 0.034, 0.7),
  claymoreHit: (ac) => {
    toneGlide(ac, jit(170, 20), 88, 0.15, 0.036, 'triangle');
    noiseSweep(ac, jit(900, 100), 280, 0.09, 0.018, 0.6, 'lowpass');
  },

  // Earthsplitter wind-up — as the claymore is hauled overhead: a low rumble
  // swelling up from the ground and a rising, straining grind of steel.
  earthsplitterRise: (ac) => {
    noiseSweep(ac, jit(160, 20), jit(420, 40), 0.55, 0.022, 0.6, 'lowpass');
    toneGlide(ac, jit(70, 6), 120, 0.55, 0.028, 'sine');
    noiseSweep(ac, jit(1400, 150), jit(2600, 200), 0.4, 0.007, 1.4, 'bandpass', 0.12);
  },

  // Earthsplitter (the Claymore's ability) — the blade meets the ground: a deep
  // sub boom, a rolling lowpassed rumble, and gravel crumbling as the crack runs.
  earthsplitter: (ac) => {
    toneGlide(ac, jit(110, 10), 44, 0.6, 0.05, 'sine');
    noiseSweep(ac, jit(620, 60), 110, 0.75, 0.042, 0.5, 'lowpass');
    noiseSweep(ac, jit(2200, 200), 900, 0.4, 0.012, 0.8, 'bandpass', 0.06);
  },

  // Quickdraw (the Bow's ability) — a taut bowstring pull snapping up in pitch
  // with a bright rising shimmer, reading as a sudden surge of speed. A one-off
  // activated cast, so a touch louder than a normal shot.
  quickdraw: (ac) => {
    noiseSweep(ac, jit(700, 100), jit(2200, 250), 0.22, 0.038, 1.2);
    toneGlide(ac, jit(500, 40), 1500, 0.24, 0.03, 'sawtooth');
  },

  // Longbow — a slow creak of the yew stave as the string comes back, a deep
  // heavy thwump on the loose, and a solid thunk when the big arrow lands.
  longbowDraw: (ac) => {
    noiseSweep(ac, jit(260, 30), jit(620, 60), 0.6, 0.009, 3, 'bandpass');
    toneGlide(ac, jit(95, 8), 130, 0.55, 0.008, 'triangle');
  },
  longbowShot: (ac) => {
    noiseSweep(ac, jit(1200, 150), jit(380, 60), 0.14, 0.036);
    toneGlide(ac, jit(150, 15), 85, 0.14, 0.024, 'triangle');
  },
  longbowHit: (ac) => {
    toneGlide(ac, jit(210, 30), 110, 0.09, 0.034, 'triangle');
    noiseSweep(ac, 2400, 1700, 0.04, 0.016, 1, 'highpass');
  },

  // Piercing Shot (the Longbow's ability) — the arrow kindles: a bright rising
  // shimmer over a taut string pull, ringing on as it is held to the sky.
  pierceCast: (ac) => {
    noiseSweep(ac, jit(600, 80), jit(2400, 250), 0.34, 0.026, 1);
    toneGlide(ac, jit(420, 30), 1600, 0.4, 0.026, 'sine');
    toneGlide(ac, jit(1600, 40), 1560, 0.5, 0.009, 'sine', 0.22);
  },
  // A piercing arrow loosed — a hard crack and a long tearing whoosh.
  pierceShot: (ac) => {
    noiseSweep(ac, jit(2800, 250), jit(480, 60), 0.3, 0.04, 0.8);
    toneGlide(ac, jit(900, 60), 280, 0.26, 0.018, 'sawtooth');
  },

  // Mana Ray (the Mage's beam) — a bright arcane surge as the beam ignites: a
  // rising tone with an airy sweep. A one-off activated cast, so a touch fuller.
  manaRay: (ac) => {
    toneGlide(ac, jit(300, 30), 1200, 0.35, 0.035, 'sawtooth');
    noiseSweep(ac, jit(500, 80), jit(2000, 220), 0.3, 0.02, 0.5);
  },
  // Mana Ray tick — a soft, steady zap each 0.5s the beam sears, so the channel
  // reads as a continuous hum rather than silence. Kept very quiet.
  manaRayTick: (ac) => toneGlide(ac, jit(900, 80), 640, 0.09, 0.016, 'sine'),

  // Mana Storm (the Staff's ability) — the staff goes up: a deep swell climbing
  // under an airy rising sweep, then a high shimmer that rings on as it channels.
  manaStorm: (ac) => {
    toneGlide(ac, jit(220, 20), 880, 0.5, 0.03, 'sawtooth');
    noiseSweep(ac, jit(400, 60), jit(2600, 250), 0.45, 0.018, 0.8);
    toneGlide(ac, jit(1320, 40), 1400, 0.6, 0.008, 'sine', 0.3);
  },
  // A Mana Storm bolt flung skyward — one soft FM zap rising as it climbs, with
  // a couple of sparks.
  stormBolt: (ac) => {
    fmZap(ac, jit(600, 50), 1500, 0.14, 0.0048, 2.73, 2.5, 0);
    sparkle(ac, 2, 3000, 6000, 0.1, 0.0015);
  },

  // Bard — a short, unhurried lute phrase as the minstrel strikes up: three
  // spaced, soft notes from a random motif in a random major key.
  bardPlay: (ac) => {
    const root = BARD_ROOTS[Math.floor(Math.random() * BARD_ROOTS.length)];
    const phrase = BARD_PHRASES[Math.floor(Math.random() * BARD_PHRASES.length)];
    const hz = (semi: number) => root * 2 ** (semi / 12);
    const beat = 0.2;
    for (const [semi, at] of phrase) pluck(ac, hz(semi), 0.5, 0.017, at * beat);
  },
};

/** Play one combat cue, throttled per type. Silent no-op if audio is unavailable. */
export function playCombatSound(sound: SfxName): void {
  const bus = audioBus('combat');
  if (!bus) return;
  const { ac } = bus;
  const now = ac.currentTime;
  const gap = MIN_GAP[sound] ?? DEFAULT_GAP;
  if (now - (lastPlayed[sound] ?? -Infinity) < gap) return; // throttle bursts
  lastPlayed[sound] = now;
  dest = bus.out;
  try {
    VOICES[sound]?.(ac);
  } catch {
    /* ignore — audio is best-effort polish */
  }
}

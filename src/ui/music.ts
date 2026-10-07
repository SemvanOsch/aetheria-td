/**
 * Background music — synthesized, like every other game sound (no audio assets
 * ship in the repo). Each track is a small score in code: a bar function that
 * schedules one bar of notes for a handful of Web Audio instruments, looped by a
 * look-ahead sequencer. Music routes through the shared bus's `music` category,
 * so the Settings sliders and mute apply to it.
 *
 * Tracks: `menu` (home / menus / journal — a calm D-minor harp-and-flute piece)
 * and one battle theme per story chapter (`SECTION_MUSIC`: `castle`, and
 * `capital` — a C-minor chase after the king's fall). A chapter without a
 * theme of its own yet borrows the castle's.
 *
 * Usage: `setMusicTrack(id)` declares what should be playing (switching
 * crossfades; the same id is a no-op), `setMusicIntensity(0..1)` lets a battle
 * theme thin out during the build phase and swell during a wave. Browsers won't
 * start audio before a user gesture, so a requested track waits for the first
 * click/key and starts then.
 */

import type { SectionId } from '../domain/levels';
import { audioBus } from './audioBus';

export type MusicTrackId = 'menu' | 'castle' | 'capital';

/** Battle theme per story chapter. Unlisted chapters fall back to the castle's. */
const SECTION_MUSIC: Partial<Record<SectionId, MusicTrackId>> = {
  castle: 'castle',
  capital: 'capital',
};

export function battleTrackFor(section: SectionId): MusicTrackId {
  return SECTION_MUSIC[section] ?? 'castle';
}

// ---------------------------------------------------------------------------
// Shared resources
// ---------------------------------------------------------------------------

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

let noiseBuf: AudioBuffer | null = null;
function noise(ac: AudioContext): AudioBuffer {
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

let irBuf: AudioBuffer | null = null;
/** A synthesized hall impulse response (stereo noise with an exponential tail). */
function hall(ac: AudioContext): AudioBuffer {
  if (!irBuf || irBuf.sampleRate !== ac.sampleRate) {
    const len = Math.floor(ac.sampleRate * 2.8);
    irBuf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = irBuf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
  }
  return irBuf;
}

// ---------------------------------------------------------------------------
// Instruments — each schedules one note into `out` at time `t`.
// ---------------------------------------------------------------------------

interface Ctx {
  ac: AudioContext;
  out: AudioNode;
}

function osc(ac: AudioContext, type: OscillatorType, freq: number, detune = 0): OscillatorNode {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  return o;
}

function lowpass(ac: AudioContext, freq: number, q = 0.5): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** Warm sustained chord: detuned saws through a soft lowpass, slow swell. */
function pad({ ac, out }: Ctx, t: number, notes: number[], dur: number, vel: number, cutoff = 1000): void {
  const f = lowpass(ac, cutoff);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + Math.min(0.7, dur * 0.4));
  g.gain.setValueAtTime(vel, t + dur);
  g.gain.setTargetAtTime(0, t + dur, 0.35);
  f.connect(g).connect(out);
  const per = 1 / notes.length;
  for (const m of notes) {
    for (const det of [-7, 7]) {
      const o = osc(ac, 'sawtooth', mtof(m), det);
      const og = ac.createGain();
      og.gain.value = per * 0.5;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + dur + 1.8);
    }
  }
}

/** Plucked harp: a triangle with a bright octave partial, long exponential decay. */
function harp({ ac, out }: Ctx, t: number, m: number, vel: number): void {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  const f = lowpass(ac, 3200);
  f.connect(g).connect(out);
  const a = osc(ac, 'triangle', mtof(m));
  const b = osc(ac, 'sine', mtof(m) * 2);
  const bg = ac.createGain();
  bg.gain.value = 0.3;
  a.connect(f);
  b.connect(bg).connect(f);
  for (const o of [a, b]) {
    o.start(t);
    o.stop(t + 1.9);
  }
}

/** Breathy flute: sine + a little triangle, delayed vibrato. */
function flute({ ac, out }: Ctx, t: number, m: number, dur: number, vel: number): void {
  const freq = mtof(m);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.09);
  g.gain.setValueAtTime(vel * 0.85, t + dur);
  g.gain.setTargetAtTime(0, t + dur, 0.08);
  g.connect(out);
  const a = osc(ac, 'sine', freq);
  const b = osc(ac, 'triangle', freq);
  const bg = ac.createGain();
  bg.gain.value = 0.22;
  const lfo = osc(ac, 'sine', 5.2);
  const depth = ac.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(freq * 0.007, t + Math.min(0.45, dur));
  lfo.connect(depth);
  depth.connect(a.frequency);
  depth.connect(b.frequency);
  a.connect(g);
  b.connect(bg).connect(g);
  for (const o of [a, b, lfo]) {
    o.start(t);
    o.stop(t + dur + 0.6);
  }
}

/** Soft bell / chime: inharmonic sine partials, long ring. */
function bell({ ac, out }: Ctx, t: number, m: number, vel: number): void {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
  g.connect(out);
  for (const [ratio, amp] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const) {
    const o = osc(ac, 'sine', mtof(m) * ratio);
    const og = ac.createGain();
    og.gain.value = amp;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 3.3);
  }
}

/** Low sine drone with its octave. */
function drone({ ac, out }: Ctx, t: number, m: number, dur: number, vel: number): void {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.5);
  g.gain.setValueAtTime(vel, t + dur);
  g.gain.setTargetAtTime(0, t + dur, 0.3);
  g.connect(out);
  for (const [k, amp] of [[1, 1], [2, 0.3]] as const) {
    const o = osc(ac, 'triangle', mtof(m) * k);
    const og = ac.createGain();
    og.gain.value = amp;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + dur + 1.5);
  }
}

/** Bowed string stab for the battle ostinato: short, bright attack that closes. */
function stringHit({ ac, out }: Ctx, t: number, m: number, dur: number, vel: number): void {
  const f = lowpass(ac, 2400, 0.8);
  f.frequency.setValueAtTime(2400, t);
  f.frequency.exponentialRampToValueAtTime(800, t + 0.12);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.008);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vel * 0.35), t + dur);
  g.gain.setTargetAtTime(0, t + dur, 0.03);
  f.connect(g).connect(out);
  for (const det of [-6, 6]) {
    const o = osc(ac, 'sawtooth', mtof(m), det);
    o.connect(f);
    o.start(t);
    o.stop(t + dur + 0.25);
  }
}

/** Brass section chord: saws with an opening filter "blat". */
function brass({ ac, out }: Ctx, t: number, notes: number[], dur: number, vel: number): void {
  const f = lowpass(ac, 300, 1.2);
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(2600, t + 0.07);
  f.frequency.exponentialRampToValueAtTime(1300, t + 0.4);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.03);
  g.gain.setValueAtTime(vel * 0.8, t + dur);
  g.gain.setTargetAtTime(0, t + dur, 0.08);
  f.connect(g).connect(out);
  const per = 1 / notes.length;
  for (const m of notes) {
    for (const det of [-5, 5]) {
      const o = osc(ac, 'sawtooth', mtof(m), det);
      const og = ac.createGain();
      og.gain.value = per * 0.5;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + dur + 0.6);
    }
  }
}

/** Heroic horn lead: saw + square, filtered, with a late vibrato. */
function horn({ ac, out }: Ctx, t: number, m: number, dur: number, vel: number): void {
  const freq = mtof(m);
  const f = lowpass(ac, 1700, 1);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.05);
  g.gain.setValueAtTime(vel * 0.85, t + dur);
  g.gain.setTargetAtTime(0, t + dur, 0.06);
  f.connect(g).connect(out);
  const a = osc(ac, 'sawtooth', freq);
  const b = osc(ac, 'square', freq, 4);
  const bg = ac.createGain();
  bg.gain.value = 0.3;
  const lfo = osc(ac, 'sine', 5.5);
  const depth = ac.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.setValueAtTime(0, t + Math.min(0.25, dur * 0.5));
  depth.gain.linearRampToValueAtTime(freq * 0.008, t + Math.min(0.6, dur));
  lfo.connect(depth);
  depth.connect(a.frequency);
  depth.connect(b.frequency);
  a.connect(f);
  b.connect(bg).connect(f);
  for (const o of [a, b, lfo]) {
    o.start(t);
    o.stop(t + dur + 0.5);
  }
}

/** Timpani: a pitched sine that settles from slightly sharp, plus a mallet thud. */
function timpani({ ac, out }: Ctx, t: number, m: number, vel: number): void {
  const freq = mtof(m);
  const o = osc(ac, 'sine', freq * 1.35);
  o.frequency.setValueAtTime(freq * 1.35, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 1.2);
  const n = ac.createBufferSource();
  n.buffer = noise(ac);
  const nf = lowpass(ac, 500);
  const ng = ac.createGain();
  ng.gain.setValueAtTime(vel * 0.6, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  n.connect(nf).connect(ng).connect(out);
  n.start(t, Math.random());
  n.stop(t + 0.1);
}

/** Taiko-style war drum: a deep pitch-drop thump. */
function warDrum({ ac, out }: Ctx, t: number, vel: number): void {
  const o = osc(ac, 'sine', 95);
  o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.14);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.55);
}

/** Snare: high-passed noise crack over a short body tone. */
function snare({ ac, out }: Ctx, t: number, vel: number): void {
  const n = ac.createBufferSource();
  n.buffer = noise(ac);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1400;
  const g = ac.createGain();
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  n.connect(hp).connect(g).connect(out);
  n.start(t, Math.random());
  n.stop(t + 0.18);
  const o = osc(ac, 'triangle', 190);
  const og = ac.createGain();
  og.gain.setValueAtTime(vel * 0.6, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.1);
}

/** Cymbal swell/crash: bright noise with a long tail. */
function crash({ ac, out }: Ctx, t: number, vel: number): void {
  const n = ac.createBufferSource();
  n.buffer = noise(ac);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000;
  const g = ac.createGain();
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
  n.connect(hp).connect(g).connect(out);
  n.start(t, Math.random() * 0.1);
  n.stop(t + 2);
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

/** One melody note: [midi | null for a rest, length in beats]. */
type Note = [number | null, number];

interface Chord {
  /** Bass note. */
  bass: number;
  /** Mid-register voicing for pads / harp / brass. */
  tones: number[];
}

interface TrackDef {
  bpm: number;
  beatsPerBar: number;
  /** Fraction of the dry signal sent to the hall reverb. */
  reverb: number;
  /** Overall track level. */
  level: number;
  /** Schedule bar `bar` (counting from 0 since the track started) at time `t`. */
  bar: (c: Ctx, bar: number, t: number, beat: number, intensity: number) => void;
}

function playLine(line: Note[], t: number, beat: number, play: (t: number, m: number, dur: number) => void): void {
  let at = 0;
  for (const [m, len] of line) {
    if (m != null) play(t + at * beat, m, len * beat * 0.95);
    at += len;
  }
}

// --- Menu: "Hearthlight" — slow D minor, harp arpeggios and a flute air. -----

const MENU_CHORDS: Chord[] = [
  { bass: 38, tones: [57, 62, 65, 69] }, // Dm
  { bass: 34, tones: [58, 62, 65, 70] }, // Bb
  { bass: 41, tones: [57, 60, 65, 69] }, // F
  { bass: 36, tones: [55, 60, 64, 67] }, // C
  { bass: 38, tones: [57, 62, 65, 69] }, // Dm
  { bass: 43, tones: [58, 62, 67, 70] }, // Gm
  { bass: 34, tones: [58, 62, 65, 70] }, // Bb
  { bass: 33, tones: [57, 61, 64, 69] }, // A
];

const MENU_AIR: Note[][] = [
  [[69, 2], [65, 1], [67, 1]],
  [[70, 1.5], [69, 0.5], [65, 2]],
  [[69, 2], [72, 1], [69, 1]],
  [[67, 3], [64, 1]],
  [[65, 1], [67, 1], [69, 2]],
  [[70, 1.5], [69, 0.5], [67, 1], [65, 1]],
  [[62, 2], [65, 1], [67, 1]],
  [[64, 3], [null, 1]],
];

const HARP_PATTERN = [0, 1, 2, 3, 4, 3, 2, 1];

const MENU: TrackDef = {
  bpm: 72,
  beatsPerBar: 4,
  reverb: 0.5,
  level: 0.9,
  bar(c, bar, t, beat) {
    const i = bar % 8;
    const pass = Math.floor(bar / 8) % 4;
    const ch = MENU_CHORDS[i];
    const len = beat * 4;
    drone(c, t, ch.bass, len, 0.07);
    pad(c, t, ch.tones, len, 0.045, 900);
    if (i === 0) bell(c, t, pass % 2 ? 86 : 81, 0.035);
    const arp = [...ch.tones, ch.tones[0] + 12].map((m) => m + 12);
    if (pass === 3) {
      // A sparser pass before the loop comes round again.
      harp(c, t, arp[0], 0.06);
      harp(c, t + beat * 2, arp[2], 0.05);
    } else {
      HARP_PATTERN.forEach((k, s) => harp(c, t + s * beat * 0.5, arp[k], s % 2 ? 0.04 : 0.055));
    }
    if (pass === 1 || pass === 2) {
      const up = pass === 2 ? 12 : 0;
      playLine(MENU_AIR[i], t, beat, (at, m, dur) => flute(c, at, m + up, dur, pass === 2 ? 0.05 : 0.065));
    }
  },
};

// --- Castle battle: "Siege of the Keep" — driving D minor, gallop strings, ---
// --- timpani and war drums, brass stabs and a horn call. ---------------------

const CASTLE_CHORDS: Chord[] = [
  { bass: 38, tones: [57, 62, 65] }, // Dm
  { bass: 38, tones: [57, 62, 65] }, // Dm
  { bass: 34, tones: [58, 62, 65] }, // Bb
  { bass: 36, tones: [55, 60, 64] }, // C
  { bass: 38, tones: [57, 62, 65] }, // Dm
  { bass: 34, tones: [58, 62, 65] }, // Bb
  { bass: 43, tones: [58, 62, 67] }, // Gm
  { bass: 33, tones: [57, 61, 64] }, // A
];

const CASTLE_CALL: Note[][] = [
  [[62, 1.5], [69, 0.5], [69, 2]],
  [[67, 0.5], [65, 0.5], [67, 1], [69, 2]],
  [[70, 1.5], [69, 0.5], [67, 1], [65, 1]],
  [[67, 3], [64, 1]],
  [[62, 1.5], [69, 0.5], [74, 2]],
  [[72, 0.5], [70, 0.5], [72, 1], [74, 2]],
  [[70, 1.5], [69, 0.5], [67, 1], [70, 1]],
  [[69, 3], [64, 0.5], [61, 0.5]],
];

const CASTLE: TrackDef = {
  bpm: 132,
  beatsPerBar: 4,
  reverb: 0.22,
  level: 0.8,
  bar(c, bar, t, beat, intensity) {
    const i = bar % 8;
    const pass = Math.floor(bar / 8) % 4;
    const ch = CASTLE_CHORDS[i];
    const hot = intensity >= 0.5;
    const drive = 0.55 + 0.45 * intensity;
    const fifth = ch.bass + 7;

    // Gallop ostinato in the low strings: an eighth and two sixteenths a beat.
    for (let b = 0; b < 4; b++) {
      const m = (b === 3 && i % 2 === 1 ? fifth : ch.bass) + 12;
      stringHit(c, t + b * beat, m, beat * 0.45, 0.075 * drive);
      stringHit(c, t + (b + 0.5) * beat, m, beat * 0.22, 0.055 * drive);
      stringHit(c, t + (b + 0.75) * beat, m, beat * 0.22, 0.055 * drive);
    }
    // Low sustained strings underneath.
    pad(c, t, ch.tones.map((m) => m - 12), beat * 4, 0.03 + 0.02 * intensity, 700);

    // Timpani on the downbeat (root) and beat 3 (fifth).
    timpani(c, t, ch.bass + 12, 0.16 * drive);
    if (hot || i % 2 === 0) timpani(c, t + 2 * beat, fifth, 0.12 * drive);

    if (hot) {
      for (let b = 0; b < 4; b++) warDrum(c, t + b * beat, b === 0 ? 0.22 : 0.13);
      snare(c, t + beat, 0.05);
      snare(c, t + 3 * beat, 0.05);
      if (i === 0) crash(c, t, 0.05);
      if (i === 7) {
        // A snare roll into the next phrase.
        for (let s = 8; s < 16; s++) snare(c, t + s * beat * 0.25, 0.02 + (s - 8) * 0.006);
      }
      if (pass === 1 || pass === 3) {
        playLine(CASTLE_CALL[i], t, beat, (at, m, dur) => horn(c, at, m, dur, 0.07));
        brass(c, t, ch.tones, beat * 1.4, 0.04);
      } else {
        // Brass stabs carry the phrase between horn calls.
        brass(c, t, ch.tones, beat * 1.2, 0.07);
        brass(c, t + 2.5 * beat, ch.tones, beat * 0.4, 0.055);
        if (i % 2 === 1) brass(c, t + 3.5 * beat, ch.tones, beat * 0.4, 0.05);
      }
    } else if (i === 0 || i === 4) {
      // Build phase: a distant horn sounds the opening of the call.
      horn(c, t, 62, beat * 1.4, 0.035);
      horn(c, t + 1.5 * beat, 69, beat * 2.3, 0.035);
    }
  },
};

// --- Capital battle: "Hunted by the Crown" — the king has fallen and the ----
// --- royal army gives chase. Restless C minor: a sixteenth-note string -------
// --- ostinato, the city's alarm bells, the pursuers' snare cadence and low ---
// --- fanfare closing in, and the rebels' horn (the castle call, reborn). -----

const CAPITAL_CHORDS: Chord[] = [
  { bass: 36, tones: [55, 60, 63] }, // Cm
  { bass: 36, tones: [55, 60, 63] }, // Cm
  { bass: 32, tones: [56, 60, 63] }, // Ab
  { bass: 34, tones: [58, 62, 65] }, // Bb
  { bass: 36, tones: [55, 60, 63] }, // Cm
  { bass: 37, tones: [56, 61, 65] }, // Db — the Neapolitan lurch
  { bass: 41, tones: [56, 60, 65] }, // Fm
  { bass: 43, tones: [55, 59, 62] }, // G
];

/** The royal army's fanfare: low, clipped and ominous, always just behind. */
const ROYAL_FANFARE: Note[][] = [
  [[48, 0.5], [48, 0.25], [48, 0.25], [55, 1], [null, 0.5], [55, 0.5], [51, 1]],
  [[60, 1.5], [58, 0.5], [55, 1], [51, 1]],
  [[48, 0.5], [48, 0.25], [48, 0.25], [56, 1], [null, 0.5], [56, 0.5], [60, 1]],
  [[58, 1.5], [56, 0.5], [55, 1], [50, 1]],
  [[48, 0.5], [48, 0.25], [48, 0.25], [55, 1], [null, 0.5], [55, 0.5], [51, 1]],
  [[49, 0.5], [49, 0.25], [49, 0.25], [56, 1], [null, 0.5], [56, 0.5], [61, 1]],
  [[60, 1.5], [56, 0.5], [53, 1], [56, 1]],
  [[55, 1], [59, 1], [62, 1], [59, 0.5], [55, 0.5]],
];

/** The rebels' horn: opens on the castle's call (now in C minor), then runs. */
const REBEL_CALL: Note[][] = [
  [[60, 1.5], [67, 0.5], [67, 1], [70, 0.5], [72, 0.5]],
  [[75, 1.5], [74, 0.5], [72, 1], [67, 1]],
  [[68, 1], [72, 1], [75, 1.5], [74, 0.5]],
  [[74, 2], [70, 1], [65, 1]],
  [[60, 1.5], [67, 0.5], [67, 1], [72, 0.5], [75, 0.5]],
  [[77, 1.5], [75, 0.5], [73, 1], [72, 1]],
  [[72, 1], [68, 1], [65, 1], [68, 1]],
  [[67, 2], [71, 1], [74, 0.5], [71, 0.5]],
];

/** The pursuers' marching snare, one velocity per sixteenth (0 = rest). */
const PURSUIT_CADENCE = [1, 0, 0.5, 0.6, 0, 0.5, 1, 0, 0.7, 0, 0.5, 0.6, 1, 0.5, 0.6, 0.5];
/** War-drum footfalls per sixteenth: a 3-3-2 stumble, then flat-out running. */
const PURSUIT_DRUMS = [0.2, 0, 0, 0.12, 0, 0, 0.14, 0, 0.18, 0, 0.11, 0, 0.14, 0, 0.11, 0.08];
/** A harmonic-minor string run up to the tonic, over the final bar's last half. */
const ESCAPE_RUN = [59, 60, 62, 63, 65, 67, 68, 71];

const CAPITAL: TrackDef = {
  bpm: 150,
  beatsPerBar: 4,
  reverb: 0.26,
  level: 0.78,
  bar(c, bar, t, beat, intensity) {
    const i = bar % 8;
    const pass = Math.floor(bar / 8) % 4;
    const ch = CAPITAL_CHORDS[i];
    const hot = intensity >= 0.5;
    const drive = 0.5 + 0.5 * intensity;
    const fifth = ch.bass + 7;
    const step = beat / 4;

    // Restless sixteenths in the low strings: root, root, fifth, root a beat.
    const root = ch.bass + 12;
    for (let s = 0; s < 16; s++) {
      const m = s % 4 === 2 ? root + 7 : root;
      stringHit(c, t + s * step, m, step * 0.8, (s % 4 === 0 ? 0.055 : 0.032) * drive);
    }
    pad(c, t, ch.tones.map((m) => m - 12), beat * 4, 0.028 + 0.02 * intensity, 650);

    // The city's alarm bells toll for the fallen king.
    if (i % 2 === 0) bell(c, t, i % 4 === 0 ? 72 : 79, hot ? 0.03 : 0.04);

    if (hot) {
      // Flat-out chase: running war drums, the pursuers' cadence at full cry.
      PURSUIT_DRUMS.forEach((v, s) => {
        if (v) warDrum(c, t + s * step, v);
      });
      PURSUIT_CADENCE.forEach((v, s) => {
        if (v) snare(c, t + s * step, v * 0.045);
      });
      timpani(c, t, ch.bass + 12, 0.15);
      timpani(c, t + 2.5 * beat, fifth, 0.1);
      timpani(c, t + 3 * beat, ch.bass + 12, 0.12);
      if (i === 0) crash(c, t, 0.055);

      const fanfare = pass === 0 || pass === 2 || pass === 3;
      const rebels = pass === 1 || pass === 3;
      if (fanfare) {
        // On the last pass the army's fanfare runs under the rebels' horn.
        const vel = pass === 3 ? 0.045 : 0.065;
        playLine(ROYAL_FANFARE[i], t, beat, (at, m, dur) => horn(c, at, m, dur, vel));
      }
      if (rebels) playLine(REBEL_CALL[i], t, beat, (at, m, dur) => horn(c, at, m, dur, 0.065));
      // Offbeat brass stabs push everything forward.
      brass(c, t + 0.5 * beat, ch.tones, beat * 0.35, 0.05);
      brass(c, t + 2.5 * beat, ch.tones, beat * 0.35, 0.045);
      if (!rebels) brass(c, t + 3.5 * beat, ch.tones.map((m) => m + 12), beat * 0.3, 0.04);

      if (i === 7) ESCAPE_RUN.forEach((m, k) => stringHit(c, t + (8 + k) * step, m, step * 0.9, 0.04 + k * 0.004));
    } else {
      // Build phase: a heartbeat on the timpani, and somewhere behind, the
      // army's drums drawing nearer over the phrase.
      timpani(c, t, ch.bass + 12, 0.12);
      timpani(c, t + 0.5 * beat, ch.bass + 12, 0.07);
      timpani(c, t + 2 * beat, fifth, 0.09);
      const near = 0.006 + 0.0025 * i;
      PURSUIT_CADENCE.forEach((v, s) => {
        if (v) snare(c, t + s * step, v * near);
      });
      if (i === 0 || i === 4) {
        // Their fanfare, still distant.
        playLine(ROYAL_FANFARE[i].slice(0, 4), t, beat, (at, m, dur) => horn(c, at, m, dur, 0.03));
      }
    }
  },
};

const TRACKS: Record<MusicTrackId, TrackDef> = { menu: MENU, castle: CASTLE, capital: CAPITAL };

// ---------------------------------------------------------------------------
// Sequencer
// ---------------------------------------------------------------------------

/** How far ahead (s) bars are scheduled; covers background-tab timer throttling. */
const LOOKAHEAD = 1.2;
const FADE_IN = 2.0;
const FADE_OUT = 1.6;

class Player {
  private readonly gain: GainNode;
  private readonly input: GainNode;
  private readonly timer: number;
  private nextBar: number;
  private bar = 0;

  constructor(
    private readonly ac: AudioContext,
    out: AudioNode,
    private readonly track: TrackDef,
  ) {
    const now = ac.currentTime;
    this.gain = ac.createGain();
    this.gain.gain.setValueAtTime(0, now);
    this.gain.gain.linearRampToValueAtTime(track.level, now + FADE_IN);
    // A gentle compressor glues the voices and keeps peaks under the SFX.
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.25;
    this.input = ac.createGain();
    const verb = ac.createConvolver();
    verb.buffer = hall(ac);
    const send = ac.createGain();
    send.gain.value = track.reverb;
    this.input.connect(comp);
    this.input.connect(send).connect(verb).connect(comp);
    comp.connect(this.gain).connect(out);
    this.nextBar = now + 0.1;
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 200);
  }

  private tick(): void {
    const now = this.ac.currentTime;
    // After a long stall (suspended context, sleeping tab) skip ahead rather
    // than firing a burst of overdue bars at once.
    if (this.nextBar < now) this.nextBar = now + 0.05;
    const beat = 60 / this.track.bpm;
    while (this.nextBar < now + LOOKAHEAD) {
      this.track.bar({ ac: this.ac, out: this.input }, this.bar, this.nextBar, beat, intensity);
      this.nextBar += beat * this.track.beatsPerBar;
      this.bar++;
    }
  }

  stop(): void {
    window.clearInterval(this.timer);
    const now = this.ac.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + FADE_OUT);
    // Let already-scheduled bars and the reverb tail die out before cutting.
    window.setTimeout(() => this.gain.disconnect(), (FADE_OUT + LOOKAHEAD + 3) * 1000);
  }
}

let wanted: MusicTrackId | null = null;
let current: { id: MusicTrackId; player: Player } | null = null;
let intensity = 0.3;

const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
let unlocked = activation?.hasBeenActive ?? false;

function onGesture(): void {
  unlocked = true;
  window.removeEventListener('pointerdown', onGesture, true);
  window.removeEventListener('keydown', onGesture, true);
  sync();
}
if (!unlocked) {
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
}

function sync(): void {
  if (!unlocked || current?.id === wanted) return;
  current?.player.stop();
  current = null;
  if (!wanted) return;
  const bus = audioBus('music');
  if (!bus) return;
  current = { id: wanted, player: new Player(bus.ac, bus.out, TRACKS[wanted]) };
}

/** Declare the track that should be playing (`null` for silence). Crossfades. */
export function setMusicTrack(id: MusicTrackId | null): void {
  wanted = id;
  sync();
}

/**
 * Battle energy, 0..1: low thins a battle theme to strings and timpani (build
 * phase), high brings in war drums, brass and the horn call (a wave in
 * progress). Takes effect from the next bar.
 */
export function setMusicIntensity(value: number): void {
  intensity = Math.max(0, Math.min(1, value));
}

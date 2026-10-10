/**
 * Synthesized sound for the getaway ending (`GetawayCutscene`): one-shot cues
 * (`playCutsceneSound`) and the ride's running loop of hoofbeats and wheel
 * rumble (`RideAudio`, its pace following the wagon). Like every other sound in
 * the game, all Web Audio primitives through the shared bus — the combat
 * category, so the effects slider and mute apply.
 */

import { AUDIO_LEAD, audioBus } from './audioBus';

export type CutsceneSound =
  | 'horn'
  | 'hornNear'
  | 'hop'
  | 'board'
  | 'whinny'
  | 'whip'
  | 'creak'
  | 'birds'
  | 'whoa'
  | 'door'
  | 'doorClose'
  | 'crickets'
  | 'owl'
  // The Sewers' ending (`SludgeFatherCutscene`).
  | 'bubbles'
  | 'rumble'
  | 'eruption'
  | 'crush'
  | 'heave'
  | 'thud'
  | 'roar'
  | 'growl';

let noiseBuf: AudioBuffer | null = null;
function noise(ac: AudioContext): AudioBuffer {
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** A filtered noise burst whose filter glides `from` → `to` Hz. */
function burst(
  ac: AudioContext,
  out: AudioNode,
  t: number,
  from: number,
  to: number,
  dur: number,
  gain: number,
  type: BiquadFilterType = 'bandpass',
  q = 1.4,
): void {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const f = ac.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
  const g = ac.createGain();
  g.gain.value = 0; // silent until its envelope starts
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

/** An oscillator note gliding `from` → `to` Hz with a quick attack. */
function tone(
  ac: AudioContext,
  out: AudioNode,
  t: number,
  from: number,
  to: number,
  dur: number,
  gain: number,
  type: OscillatorType = 'sine',
  attack = 0.008,
): void {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
  const g = ac.createGain();
  g.gain.value = 0; // silent until its envelope starts
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A soft brass voice: detuned saws through a lowpass that opens and closes. */
function brass(ac: AudioContext, out: AudioNode, t: number, freq: number, dur: number, gain: number): void {
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(500, t);
  f.frequency.linearRampToValueAtTime(2200, t + 0.06);
  f.frequency.exponentialRampToValueAtTime(900, t + dur);
  const g = ac.createGain();
  g.gain.value = 0; // silent until its envelope starts
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.04);
  g.gain.setValueAtTime(gain * 0.8, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.connect(g).connect(out);
  for (const det of [-6, 6]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = det;
    o.connect(f);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * A huge throat: two detuned saws gliding `from` → `to` Hz through a lowpass at
 * `cutoff`, with a slow swell, a wavering pitch and a long release — the
 * Sludge Father's groans and roar.
 */
function groan(
  ac: AudioContext,
  out: AudioNode,
  t: number,
  from: number,
  to: number,
  dur: number,
  gain: number,
  cutoff: number,
  attack = 0.25,
): void {
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(cutoff * 0.6, t);
  f.frequency.linearRampToValueAtTime(cutoff, t + attack);
  f.frequency.exponentialRampToValueAtTime(cutoff * 0.5, t + dur);
  const g = ac.createGain();
  g.gain.value = 0; // silent until its envelope starts
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.setValueAtTime(gain, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.connect(g).connect(out);
  const lfo = ac.createOscillator();
  lfo.frequency.value = 6.5;
  const depth = ac.createGain();
  depth.gain.value = from * 0.03;
  lfo.connect(depth);
  for (const det of [-14, 9]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.detune.value = det;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    depth.connect(o.frequency);
    o.connect(f);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
}

let lastHop = 0;

/** Play one cutscene cue. */
export function playCutsceneSound(sound: CutsceneSound): void {
  const bus = audioBus('combat');
  if (!bus) return;
  const { ac, out } = bus;
  const t = ac.currentTime + AUDIO_LEAD;
  switch (sound) {
    case 'horn':
    case 'hornNear': {
      // The royal army's war horn behind them (the Capital fanfare's
      // short-short-long, low and in fifths), over war drums: distant first,
      // then nearer and a half step higher as they close in.
      const near = sound === 'hornNear';
      const root = near ? 51 : 50;
      const vel = near ? 0.05 : 0.032;
      const call: [number, number, number][] = [
        [0, 0.16, root],
        [0.2, 0.16, root],
        [0.4, 1.1, root + 7],
      ];
      for (const [at, dur, m] of call) {
        brass(ac, out, t + at, mtof(m), dur, vel);
        brass(ac, out, t + at, mtof(m - 12), dur, vel * 0.8);
      }
      for (const at of near ? [0, 0.2, 0.4, 0.55, 0.7] : [0, 0.4]) {
        tone(ac, out, t + at, 95, 45, 0.4, near ? 0.09 : 0.05, 'sine', 0.004);
      }
      break;
    }
    case 'hop': {
      if (t - lastHop < 0.06) return;
      lastHop = t;
      tone(ac, out, t, 190 + Math.random() * 30, 90, 0.08, 0.025);
      burst(ac, out, t, 500, 250, 0.05, 0.012, 'lowpass', 0.7);
      break;
    }
    case 'board': {
      // A body landing in a wooden bed: a thunk, a rattle, a creak of springs.
      tone(ac, out, t, 150, 70, 0.16, 0.08, 'triangle');
      burst(ac, out, t, 700, 400, 0.12, 0.06, 'bandpass', 2);
      burst(ac, out, t + 0.06, 1100, 600, 0.26, 0.018, 'bandpass', 6);
      break;
    }
    case 'whinny': {
      // A horse's whinny: a nasal, fast-wavering voice rising then falling away.
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(620, t);
      o.frequency.linearRampToValueAtTime(980, t + 0.18);
      o.frequency.exponentialRampToValueAtTime(520, t + 0.85);
      const lfo = ac.createOscillator();
      lfo.frequency.value = 17;
      const depth = ac.createGain();
      depth.gain.value = 0; // silent until its envelope starts
      depth.gain.setValueAtTime(30, t);
      depth.gain.linearRampToValueAtTime(70, t + 0.8);
      lfo.connect(depth).connect(o.frequency);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1500;
      f.Q.value = 2.5;
      const g = ac.createGain();
      g.gain.value = 0; // silent until its envelope starts
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.06);
      g.gain.setValueAtTime(0.045, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(f).connect(g).connect(out);
      for (const n of [o, lfo]) {
        n.start(t);
        n.stop(t + 0.95);
      }
      burst(ac, out, t + 0.75, 900, 300, 0.35, 0.02, 'bandpass', 1);
      break;
    }
    case 'whip': {
      // The lash whistling through the air, then a crack kept rounded and
      // mid-range (a bright, loud highpass snap here was ear-piercing).
      burst(ac, out, t, 400, 1800, 0.16, 0.03, 'bandpass', 3);
      burst(ac, out, t + 0.15, 1900, 900, 0.07, 0.07, 'bandpass', 1.2);
      burst(ac, out, t + 0.15, 700, 300, 0.09, 0.04, 'lowpass', 0.7);
      break;
    }
    case 'creak': {
      burst(ac, out, t, 380, 620, 0.5, 0.025, 'bandpass', 8);
      tone(ac, out, t + 0.05, 160, 120, 0.4, 0.015, 'triangle', 0.1);
      break;
    }
    case 'bubbles': {
      // The cistern starting to churn: fat bubbles glooping up through sludge
      // over a low, wet wash.
      burst(ac, out, t, 500, 250, 2.6, 0.02, 'lowpass', 0.8);
      for (let i = 0; i < 22; i++) {
        const at = t + Math.pow(Math.random(), 0.7) * 2.6;
        const f0 = 140 + Math.random() * 120;
        tone(ac, out, at, f0, f0 * (1.8 + Math.random()), 0.05 + Math.random() * 0.05, 0.02 + Math.random() * 0.02);
      }
      break;
    }
    case 'rumble': {
      // Something vast stirring below: a sub rumble swelling under shaken grit.
      tone(ac, out, t, 46, 36, 2.2, 0.14, 'sine', 0.9);
      tone(ac, out, t + 0.3, 69, 52, 1.9, 0.05, 'triangle', 0.8);
      burst(ac, out, t, 180, 90, 2.3, 0.07, 'lowpass', 0.7);
      burst(ac, out, t + 0.6, 2400, 1600, 1.4, 0.008, 'bandpass', 2);
      break;
    }
    case 'eruption': {
      // The hand bursting out of the water: a deep whump and a great wet
      // splash, then the sludge raining back.
      tone(ac, out, t, 120, 45, 0.6, 0.16, 'sine', 0.004);
      burst(ac, out, t, 1400, 220, 0.9, 0.14, 'lowpass', 0.8);
      burst(ac, out, t + 0.02, 2600, 900, 0.5, 0.05, 'bandpass', 1.2);
      for (let i = 0; i < 8; i++) {
        const at = t + 0.35 + Math.random() * 0.8;
        burst(ac, out, at, 900 + Math.random() * 600, 300, 0.08, 0.025, 'bandpass', 2);
      }
      break;
    }
    case 'crush': {
      // The hand coming down on him: a heavy wet slam, plate crumpling under
      // it, and pieces of armour and the banner pole clattering away.
      tone(ac, out, t, 95, 32, 0.6, 0.22, 'triangle', 0.003);
      burst(ac, out, t, 1000, 120, 0.8, 0.17, 'lowpass', 0.8);
      burst(ac, out, t + 0.01, 3200, 1400, 0.14, 0.07, 'bandpass', 3);
      burst(ac, out, t + 0.05, 1900, 800, 0.22, 0.05, 'bandpass', 4);
      for (const [at, f0] of [[0.18, 2600], [0.31, 2100], [0.47, 2900], [0.62, 1800]] as const) {
        burst(ac, out, t + at, f0, f0 * 0.7, 0.07, 0.03, 'bandpass', 8);
        tone(ac, out, t + at, f0 * 0.5, f0 * 0.45, 0.12, 0.01, 'triangle');
      }
      break;
    }
    case 'heave': {
      // Hauling itself up out of the cistern: a long groan under sloshing.
      groan(ac, out, t, 62, 48, 2.4, 0.05, 260, 0.6);
      burst(ac, out, t, 700, 180, 2.2, 0.06, 'lowpass', 0.8);
      for (let i = 0; i < 6; i++) burst(ac, out, t + 0.3 + i * 0.35, 600, 200, 0.3, 0.03, 'lowpass', 1);
      break;
    }
    case 'thud': {
      // A second hand slapping down on the stone.
      tone(ac, out, t, 85, 38, 0.4, 0.17, 'sine', 0.003);
      burst(ac, out, t, 800, 150, 0.45, 0.11, 'lowpass', 0.8);
      break;
    }
    case 'roar': {
      // The roar: a vast throat sliding down, an octave beneath it, a sub
      // underneath, and breath tearing through it.
      groan(ac, out, t, 118, 66, 2.3, 0.08, 1100, 0.18);
      groan(ac, out, t, 59, 36, 2.3, 0.07, 500, 0.2);
      tone(ac, out, t, 48, 34, 2.2, 0.12, 'sine', 0.15);
      burst(ac, out, t, 520, 240, 2.1, 0.07, 'bandpass', 0.9);
      burst(ac, out, t + 0.1, 1800, 700, 1.6, 0.02, 'bandpass', 1.5);
      break;
    }
    case 'growl': {
      // Left alone in the sewer: a low, settling growl.
      groan(ac, out, t, 54, 44, 1.6, 0.045, 300, 0.4);
      burst(ac, out, t, 400, 160, 1.4, 0.02, 'lowpass', 0.8);
      break;
    }
    case 'birds': {
      // A dawn chorus over the first stretch of road.
      for (let i = 0; i < 16; i++) {
        const at = t + Math.random() * 7;
        const base = 2600 + Math.random() * 1600;
        const notes = 1 + Math.floor(Math.random() * 4);
        for (let k = 0; k < notes; k++) {
          const s = at + k * (0.07 + Math.random() * 0.05);
          tone(ac, out, s, base, base * (1.1 + Math.random() * 0.4), 0.06 + Math.random() * 0.06, 0.012 + Math.random() * 0.01);
        }
      }
      break;
    }
    case 'whoa': {
      // Reined in: the brake shoe dragging and the wagon groaning to a halt.
      burst(ac, out, t, 320, 180, 0.9, 0.04, 'bandpass', 4);
      burst(ac, out, t + 0.3, 520, 380, 0.6, 0.02, 'bandpass', 9);
      tone(ac, out, t + 0.2, 140, 90, 0.7, 0.02, 'triangle', 0.15);
      break;
    }
    case 'door': {
      // An old door creaking open, a latch, and the murmur of the room within.
      tone(ac, out, t, 2400, 2000, 0.03, 0.03, 'square');
      burst(ac, out, t + 0.05, 420, 880, 0.9, 0.035, 'bandpass', 10);
      for (let i = 0; i < 6; i++) {
        burst(ac, out, t + 0.4 + i * 0.22, 300 + Math.random() * 200, 250, 0.3, 0.008, 'bandpass', 1.5);
      }
      break;
    }
    case 'doorClose': {
      tone(ac, out, t, 110, 55, 0.3, 0.12);
      burst(ac, out, t, 400, 150, 0.16, 0.08, 'lowpass', 0.7);
      tone(ac, out, t + 0.12, 2600, 2200, 0.03, 0.025, 'square');
      break;
    }
    case 'crickets': {
      // Crickets taking up their song in the dusk.
      for (let i = 0; i < 26; i++) {
        const at = t + Math.random() * 10;
        const f = 4300 + Math.random() * 600;
        for (let k = 0; k < 3; k++) tone(ac, out, at + k * 0.055, f, f, 0.035, 0.006);
      }
      break;
    }
    case 'owl': {
      tone(ac, out, t, 430, 390, 0.32, 0.05, 'sine', 0.06);
      tone(ac, out, t + 0.55, 440, 380, 0.65, 0.05, 'sine', 0.08);
      tone(ac, out, t + 0.55, 880, 760, 0.6, 0.006, 'sine', 0.08);
      break;
    }
  }
}

/**
 * The ride's running sound: hoofbeats (a two-tone clip-clop, quickening with
 * the pace) over a low rumble of iron tyres on a dirt road, with the odd creak
 * from the wagon. `setSpeed(0..1)` follows the wagon; 0 falls silent.
 */
export class RideAudio {
  private timer = 0;
  private nextBeat = 0;
  private beat = 0;
  private speed = 0;
  private rumble: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private nextCreak = 0;

  start(speed = 1): void {
    const bus = audioBus('combat');
    if (!bus || this.timer) return;
    const { ac, out } = bus;
    this.speed = speed;
    this.nextBeat = ac.currentTime + 0.05;
    this.nextCreak = ac.currentTime + 1;
    const src = ac.createBufferSource();
    src.buffer = noise(ac);
    src.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 150;
    const gain = ac.createGain();
    gain.gain.value = 0;
    src.connect(lp).connect(gain).connect(out);
    src.start();
    this.rumble = { src, gain };
    this.timer = window.setInterval(() => this.tick(), 50);
    this.tick();
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0, Math.min(1, speed));
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    const r = this.rumble;
    this.rumble = null;
    if (!r) return;
    const ac = r.gain.context;
    r.gain.gain.cancelScheduledValues(ac.currentTime);
    r.gain.gain.setTargetAtTime(0, ac.currentTime, 0.15);
    r.src.stop(ac.currentTime + 0.8);
  }

  private tick(): void {
    const bus = audioBus('combat');
    if (!bus) return;
    const { ac, out } = bus;
    const now = ac.currentTime;
    if (this.rumble) this.rumble.gain.gain.setTargetAtTime(0.07 * this.speed, now, 0.2);
    if (this.speed < 0.05) {
      this.nextBeat = now + 0.1;
      return;
    }
    // Two hooves per beat pair, each beat quicker the faster the team goes.
    const gap = 0.32 - 0.17 * this.speed;
    while (this.nextBeat < now + 0.25) {
      const t = this.nextBeat;
      const hi = this.beat % 2 === 0;
      const v = 0.6 + 0.4 * this.speed;
      // A dull "clop": a woody knock with body, no bright click on top.
      burst(ac, out, t, hi ? 900 : 700, hi ? 550 : 420, 0.06, 0.035 * v, 'bandpass', 2);
      tone(ac, out, t, hi ? 240 : 190, hi ? 150 : 120, 0.07, 0.04 * v, 'triangle');
      // A trot is uneven: a short gap, then a long one.
      this.nextBeat += hi ? gap * 0.55 : gap * 1.45;
      this.beat++;
    }
    if (now > this.nextCreak) {
      this.nextCreak = now + 1.2 + Math.random() * 1.8;
      burst(ac, out, now + AUDIO_LEAD, 420 + Math.random() * 200, 640, 0.35, 0.012 * this.speed, 'bandpass', 9);
    }
  }
}

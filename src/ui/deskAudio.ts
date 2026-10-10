/**
 * Synthesized cues for the home desk's objects (the journal reuses the intro's
 * own `open` cue).
 *
 * PLACEHOLDER AUDIO, like the other SFX modules: generated with the Web Audio
 * API and routed through the shared interface bus so the volume settings apply.
 * Both cues are timed to their desk lead-ins: the map's slide opens the ~1.8s lean
 * over the parchment, the orb's whirl swells with its ~1.4s spin.
 * Silent no-op if audio is unavailable.
 */

import { audioBus } from './audioBus';

export type DeskSound = 'map' | 'orb' | 'mapClose' | 'orbClose';

/** Band-passed noise with a moving centre frequency and a shaped swell. */
function sweep(
  ac: AudioContext,
  out: AudioNode,
  delay: number,
  dur: number,
  from: number,
  to: number,
  q: number,
  gain: number,
): void {
  const frames = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buf.getChannelData(0);
  // Slightly grainy noise reads as fibre rather than hiss.
  let prev = 0;
  for (let i = 0; i < frames; i++) {
    prev = (Math.random() * 2 - 1) * 0.65 + prev * 0.35;
    data[i] = prev;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  const t = ac.currentTime + delay;
  bp.frequency.setValueAtTime(from, t);
  bp.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ac.createGain();
  g.gain.value = 0; // silent until its envelope starts
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur);
}

/** A soft pitched voice gliding between two frequencies. */
function glide(
  ac: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  delay: number,
  dur: number,
  from: number,
  to: number,
  gain: number,
  attack = 0.3,
): void {
  const osc = ac.createOscillator();
  osc.type = type;
  const g = ac.createGain();
  g.gain.value = 0; // silent until its envelope starts
  const t = ac.currentTime + delay;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur);
}

/** Parchment drawn across the desk: one long, soft paper slide. */
function mapCue(ac: AudioContext, out: AudioNode): void {
  sweep(ac, out, 0, 0.9, 380, 900, 0.8, 0.05);
  sweep(ac, out, 0.25, 1.1, 1400, 2600, 1.6, 0.03);
}

/**
 * The orb waking: an airy whirl spun up through the glass with a glassy
 * shimmer climbing over it, ending on a high ring.
 */
function orbCue(ac: AudioContext, out: AudioNode): void {
  // The vortex: rushing air that rises in pitch as it spins faster.
  sweep(ac, out, 0, 1.45, 300, 2400, 1.4, 0.05);
  // Two detuned glassy voices climbing together (a slow beat between them).
  glide(ac, out, 'sine', 0, 1.45, 330, 990, 0.035, 0.75);
  glide(ac, out, 'sine', 0, 1.45, 334, 1004, 0.025, 0.75);
  // A fluttering shimmer of high partials over the climb.
  for (let i = 0; i < 9; i++) {
    const at = 0.15 + i * 0.13;
    glide(ac, out, 'triangle', at, 0.22, 1200 + i * 140, 1500 + i * 160, 0.008 + i * 0.0012, 0.2);
  }
  // The ring as the altar opens.
  glide(ac, out, 'sine', 1.3, 1.1, 1318, 1310, 0.03, 0.04);
  glide(ac, out, 'sine', 1.32, 0.9, 1976, 1970, 0.015, 0.04);
}

/** Leaving the map: the same paper slide drawn back, falling instead of rising. */
function mapCloseCue(ac: AudioContext, out: AudioNode): void {
  sweep(ac, out, 0, 1.0, 900, 360, 0.8, 0.045);
  sweep(ac, out, 0.1, 0.9, 2400, 1300, 1.6, 0.022);
}

/**
 * Leaving the altar: the whirl winding down with the orb (~1.5s), the glass
 * voices sinking back to a low hum as it slows.
 */
function orbCloseCue(ac: AudioContext, out: AudioNode): void {
  sweep(ac, out, 0, 1.5, 2000, 280, 1.4, 0.04);
  glide(ac, out, 'sine', 0, 1.6, 990, 330, 0.03, 0.12);
  glide(ac, out, 'sine', 0, 1.6, 1004, 334, 0.02, 0.12);
  for (let i = 0; i < 6; i++) {
    const at = 0.05 + i * 0.16;
    glide(ac, out, 'triangle', at, 0.22, 1700 - i * 140, 1400 - i * 150, 0.012 - i * 0.0015, 0.2);
  }
}

/** Play one of the desk cues. */
export function playDeskSound(sound: DeskSound): void {
  const bus = audioBus('ui');
  if (!bus) return;
  try {
    if (sound === 'map') mapCue(bus.ac, bus.out);
    else if (sound === 'orb') orbCue(bus.ac, bus.out);
    else if (sound === 'mapClose') mapCloseCue(bus.ac, bus.out);
    else orbCloseCue(bus.ac, bus.out);
  } catch {
    /* ignore — audio is best-effort polish */
  }
}

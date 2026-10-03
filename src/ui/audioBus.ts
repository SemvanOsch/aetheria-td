/**
 * Shared audio bus for every synthesized game sound.
 *
 * All the placeholder SFX modules (`introAudio`, `summonAudio`, `combatAudio`)
 * route through here instead of talking to their own `AudioContext`/destination,
 * so the player's volume settings apply everywhere from one place. The signal
 * graph is:
 *
 *     source → categoryGain (ui | combat | music) → masterGain → destination
 *
 * `master` scales everything (and drops to 0 when muted); each category gain
 * lets interface cues and battle cues be balanced independently. Levels are the
 * 0–100 percentages persisted in `GameState.audio`; `applyAudioSettings` maps
 * them onto the gain nodes live, so dragging a slider updates sound immediately.
 *
 * The context is created lazily on the first sound (which always follows a user
 * gesture, so autoplay policies allow it). If audio is unavailable, every entry
 * point degrades to a silent no-op.
 */

import type { AudioSettings } from '../application/gameState';

export type AudioCategory = 'ui' | 'combat' | 'music';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let uiGain: GainNode | null = null;
let combatGain: GainNode | null = null;
let musicGain: GainNode | null = null;

// Latest settings, applied to the nodes as soon as they exist. Defaults to full
// volume so sounds work even before the store pushes the persisted settings in.
let settings: AudioSettings = { master: 100, ui: 100, combat: 100, music: 60, muted: false };

function applyGains(): void {
  if (!masterGain || !uiGain || !combatGain || !musicGain) return;
  const frac = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n / 100)) : 1);
  masterGain.gain.value = settings.muted ? 0 : frac(settings.master);
  uiGain.gain.value = frac(settings.ui);
  combatGain.gain.value = frac(settings.combat);
  musicGain.gain.value = frac(settings.music);
}

function ensure(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      masterGain = ctx.createGain();
      uiGain = ctx.createGain();
      combatGain = ctx.createGain();
      musicGain = ctx.createGain();
      uiGain.connect(masterGain);
      combatGain.connect(masterGain);
      musicGain.connect(masterGain);
      masterGain.connect(ctx.destination);
      applyGains();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  } catch {
    return false;
  }
}

/**
 * Update the live volume settings. Safe to call before any sound has played —
 * the values are stored and applied when the bus is first created.
 */
export function applyAudioSettings(next: AudioSettings): void {
  settings = next;
  applyGains();
}

/**
 * Resolve the bus for a sound category. Returns the shared `AudioContext` and
 * the category's input node (connect the tail of your graph to `out`, not
 * `ac.destination`). `null` when audio is unavailable — callers no-op.
 */
export function audioBus(category: AudioCategory): { ac: AudioContext; out: GainNode } | null {
  if (!ensure() || !ctx) return null;
  const out = category === 'combat' ? combatGain : category === 'music' ? musicGain : uiGain;
  if (!out) return null;
  return { ac: ctx, out };
}

/**
 * Scheduling lead (seconds) for short cues. `ac.currentTime` is the start of the
 * quantum the audio thread is *already* rendering, so a 60 ms envelope scheduled
 * exactly "now" can arrive with its attack in the past and play clipped or not
 * at all. Start every voice this far ahead instead.
 */
export const AUDIO_LEAD = 0.025;

let holds = 0;
let keepAlive: { osc: OscillatorNode; gain: GainNode } | null = null;

/**
 * Keep the output device awake for as long as the hold is held (a battle).
 *
 * Chromium parks a Web Audio sink after a stretch of pure digital silence (and
 * many Windows/Bluetooth outputs power down on silence too); the first sound
 * after that wakes the device and its opening milliseconds are lost — which is
 * exactly the first hit of a level or wave, after the quiet build phase. A
 * sub-audible tone (−80 dBFS at 40 Hz) through the master gain keeps the stream
 * live without being heard. Also primes the context: call it from a mount that
 * follows a click so the context is already running before the first cue.
 * Returns the release function; holds are reference-counted.
 */
export function holdAudioAwake(): () => void {
  if (!ensure() || !ctx || !masterGain) return () => {};
  holds++;
  if (!keepAlive) {
    try {
      const osc = ctx.createOscillator();
      osc.frequency.value = 40;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain).connect(masterGain);
      osc.start();
      keepAlive = { osc, gain };
    } catch {
      /* best-effort */
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    if (holds <= 0 && keepAlive) {
      holds = 0;
      try {
        keepAlive.osc.stop();
        keepAlive.gain.disconnect();
      } catch {
        /* already stopped */
      }
      keepAlive = null;
    }
  };
}

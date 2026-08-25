/**
 * Shared audio bus for every synthesized game sound.
 *
 * All the placeholder SFX modules (`introAudio`, `summonAudio`, `combatAudio`)
 * route through here instead of talking to their own `AudioContext`/destination,
 * so the player's volume settings apply everywhere from one place. The signal
 * graph is:
 *
 *     source → categoryGain (ui | combat) → masterGain → destination
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

export type AudioCategory = 'ui' | 'combat';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let uiGain: GainNode | null = null;
let combatGain: GainNode | null = null;

// Latest settings, applied to the nodes as soon as they exist. Defaults to full
// volume so sounds work even before the store pushes the persisted settings in.
let settings: AudioSettings = { master: 100, ui: 100, combat: 100, muted: false };

function applyGains(): void {
  if (!masterGain || !uiGain || !combatGain) return;
  const frac = (n: number) => Math.max(0, Math.min(1, n / 100));
  masterGain.gain.value = settings.muted ? 0 : frac(settings.master);
  uiGain.gain.value = frac(settings.ui);
  combatGain.gain.value = frac(settings.combat);
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
      uiGain.connect(masterGain);
      combatGain.connect(masterGain);
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
  const out = category === 'combat' ? combatGain : uiGain;
  if (!out) return null;
  return { ac: ctx, out };
}

/**
 * Semantic render palette + colour helpers.
 *
 * The single place the canvas art pulls its *shared* colours from — ink,
 * shadow, light families, materials, magic families — so the board, the props,
 * the VFX and the menu portraits all read as one painted world instead of a
 * scatter of hard-coded hexes. Per-champion accent colours still come from
 * content data (`visual.color`); everything they're shaded, outlined or lit by
 * comes from here.
 *
 * Pure data + pure functions; no canvas state.
 */

/** Ink used for figure outlines and deep crevices — a warm near-black, never pure #000. */
export const INK = {
  /** Default outline ink: a deep plum-black that sits under any accent colour. */
  base: '#140d17',
  /** Softer ink for small menu portraits (thinner line, less contrast). */
  soft: '#1f1622',
  /** Selection outline (the player's chosen champion). */
  select: '#ffd977',
  /** Hover outline for a foe under the cursor. */
  threat: '#ff7a66',
} as const;

/** Cast/contact shadow tones. */
export const SHADOW = {
  /** Contact shadow under a figure's feet. */
  contact: 'rgba(8, 5, 14, 0.55)',
  /** Wider, softer cast shadow. */
  cast: 'rgba(8, 5, 14, 0.28)',
  /** Ambient-occlusion tint pooled where props meet the floor. */
  ao: 'rgba(6, 4, 12, 0.42)',
} as const;

/**
 * Light families. `core` is the hot centre, `glow` the coloured falloff. Every
 * light source (props, spells, projectiles) picks one so a torch on one stage
 * and a brazier on another glow the same way.
 */
export const LIGHT = {
  fire: { core: '#fff1c4', glow: '#ff9a3c' },
  candle: { core: '#fff6d8', glow: '#ffbf5e' },
  lantern: { core: '#fff3cf', glow: '#ffc874' },
  window: { core: '#ffe6a8', glow: '#f4a64a' },
  moon: { core: '#e6eeff', glow: '#7f9cff' },
  arcane: { core: '#f2e6ff', glow: '#9b6bff' },
  frost: { core: '#f2fbff', glow: '#7fd4ff' },
  wind: { core: '#f2ffff', glow: '#6fe3e0' },
  holy: { core: '#fffbe6', glow: '#ffd45e' },
  dark: { core: '#d9b8ff', glow: '#5a2a8a' },
  poison: { core: '#eaffd0', glow: '#7fd34a' },
  blood: { core: '#ffd0c8', glow: '#e0455a' },
} as const;

export type LightFamily = keyof typeof LIGHT;

/** Material base tones shared by sprites and props (lit/dark derived via `shade`). */
export const MATERIAL = {
  steel: '#c9d2dc',
  steelDark: '#8b95a3',
  iron: '#4a4f5a',
  gold: '#e7b64a',
  goldDark: '#a97e26',
  wood: '#7a5634',
  woodDark: '#4a2f18',
  leather: '#6e4a26',
  stone: '#7d8792',
  stoneDark: '#4f5761',
  marble: '#c9c6d4',
  cloth: '#d9cdb0',
  skin: '#e8c39c',
  boot: '#3a2f26',
  foliage: '#3f7a3a',
  foliageDark: '#24502a',
  water: '#3f88ad',
  ember: '#ff8a2c',
  flame: '#ffd15a',
} as const;

/**
 * Magic families for VFX. Each owns a particle colour ramp and the light it
 * casts, so fire reads as embers + heat glow and frost as crystalline motes no
 * matter which unit throws it.
 */
export const MAGIC = {
  fire: { light: 'fire' as LightFamily, ramp: ['#fff1c4', '#ffb347', '#ff6a2a', '#7a2410'] },
  frost: { light: 'frost' as LightFamily, ramp: ['#ffffff', '#cfefff', '#7fd4ff', '#3a6fa8'] },
  arcane: { light: 'arcane' as LightFamily, ramp: ['#ffffff', '#e2ccff', '#a77bff', '#4a2a8a'] },
  wind: { light: 'wind' as LightFamily, ramp: ['#ffffff', '#e2fbfb', '#9fecea', '#4a9a98'] },
  holy: { light: 'holy' as LightFamily, ramp: ['#ffffff', '#fff3c4', '#ffd45e', '#a9822a'] },
  heal: { light: 'poison' as LightFamily, ramp: ['#ffffff', '#e6ffd8', '#8fe07a', '#3f8a3a'] },
  dark: { light: 'dark' as LightFamily, ramp: ['#e6d0ff', '#8a5ac8', '#3a1a5a', '#120818'] },
  steel: { light: 'candle' as LightFamily, ramp: ['#ffffff', '#fff6dc', '#ffd98a', '#a07a3a'] },
} as const;

export type MagicFamily = keyof typeof MAGIC;

/**
 * A MAGIC-shaped ramp (white-hot → pale → body → deep) built from one colour,
 * for magic that takes its caster's colour instead of a fixed element (the
 * Magic adventurer's orb and Mana Ray follow the player's outfit colour).
 */
export function tintRamp(color: string): readonly [string, string, string, string] {
  return ['#ffffff', shade(color, 0.6), shade(color, 0.15), shade(color, -0.5)];
}

/** Status/feedback colours used on the board (health, damage, gold). */
export const FEEDBACK = {
  hpHigh: '#6fdc8c',
  hpMid: '#f2b23c',
  hpLow: '#ff5a5a',
  hpTrack: '#16121c',
  damage: '#fff4e0',
  crit: '#ffcf4a',
  critEdge: '#ff5a3c',
  gold: '#ffd76a',
  mana: '#6fb6ff',
  danger: '#ff5a5a',
  heal: '#7fe08a',
  /** A shielded foe's remaining shield points (pips) and the spent ones. */
  shield: '#8fb4ff',
  shieldSpent: 'rgba(70,80,100,0.55)',
} as const;

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/** Parse `#rgb`/`#rrggbb` (or `rgb(r,g,b)`) into channels. Cached — hot path. */
const rgbCache = new Map<string, [number, number, number]>();
export function toRgb(color: string): [number, number, number] {
  const hit = rgbCache.get(color);
  if (hit) return hit;
  let out: [number, number, number] = [0, 0, 0];
  if (color.startsWith('#')) {
    const c = color.slice(1);
    const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c.slice(0, 6);
    const n = parseInt(full, 16);
    out = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else {
    const m = color.match(/\d+(\.\d+)?/g);
    if (m && m.length >= 3) out = [+m[0], +m[1], +m[2]];
  }
  if (rgbCache.size > 2048) rgbCache.clear();
  rgbCache.set(color, out);
  return out;
}

/**
 * Lighten (`amt` > 0) or darken (`amt` < 0) a colour by mixing it toward white
 * or black. `amt` is a 0..1 fraction; returns an `rgb(...)` string.
 */
export function shade(color: string, amt: number): string {
  const [r, g, b] = toRgb(color);
  const t = amt < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(amt));
  const mix = (ch: number) => Math.round((t - ch) * p) + ch;
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

/** A colour as an `rgba(...)` string with the given alpha. */
export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = toRgb(color);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Linear mix of two colours (`t` = 0 → a, 1 → b), as `rgb(...)`. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
}

/**
 * The contextual outline ink for a figure whose dominant colour is `accent`:
 * the base ink nudged a little toward the accent's own hue, so a green ranger
 * gets a deep green-black line and a crimson guard a wine-black one. Reads as
 * hand-inked rather than a uniform black sticker edge.
 */
export function inkFor(accent: string): string {
  return mix(INK.base, shade(accent, -0.55), 0.32);
}

/** Relative luminance (0..1) — used to keep text/lines legible over a colour. */
export function luminance(color: string): number {
  const [r, g, b] = toRgb(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// ---------------------------------------------------------------------------
// Easing — shared motion curves (figures, VFX, UI canvas)
// ---------------------------------------------------------------------------

export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutSine: (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  /** 0→1→0 hump, peaking at `t = 0.5`. */
  hump: (t: number) => Math.sin(Math.PI * Math.max(0, Math.min(1, t))),
} as const;

/** Deterministic integer hash of (x, y, seed) → 0..1. Used for seeded detail. */
export function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Small seeded PRNG (mulberry32) for baked layers. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable numeric seed for a string (e.g. a stage id). */
export function seedOf(s: string | number): number {
  const str = String(s);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

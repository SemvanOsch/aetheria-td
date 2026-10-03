/**
 * Stage atmosphere — the per-stage *mood* the renderer paints over a level:
 * ambient darkness, the colour of its light, the weather drifting through it,
 * fog, a colour grade and a vignette. Floor/path materials live on the level's
 * `BoardTheme`; this is everything else that makes the Throne Room feel like a
 * torchlit crimson hall and the Castle Door like a gold-lit dusk courtyard.
 *
 * Pure cosmetic data — the engine never reads it. Keyed by level **id** like
 * the theme/decor/boss tables, with per-section defaults for stages that don't
 * author their own.
 */

import type { SectionId } from './levels';

/** Light colour families (mirrors the renderer's palette keys). */
export type LightTone =
  | 'fire'
  | 'candle'
  | 'lantern'
  | 'window'
  | 'moon'
  | 'arcane'
  | 'frost'
  | 'holy'
  | 'dark'
  | 'blood';

/** Ambient particles drifting over a stage. */
export type Weather = 'none' | 'dust' | 'embers' | 'motes' | 'leaves' | 'fireflies' | 'ash' | 'petals';

export interface Atmosphere {
  /** Colour of the ambient darkness laid over the board. */
  ambient: string;
  /** Darkness strength 0..1 (0 = broad daylight, ~0.6 = a dark hall). */
  darkness: number;
  /** Dominant light family — prop lights and the figures' rim light. */
  light: LightTone;
  /** Radius (px) of the soft light pooled around each deployed champion. */
  championLight: number;
  /** Ambient drift. */
  weather: Weather;
  /** Weather density multiplier (1 = default). */
  weatherDensity?: number;
  /** Optional low fog tint + strength (drifting bands near the floor). */
  fog?: string;
  fogAlpha?: number;
  /** Colour grade laid over the whole board (soft-light), + strength. */
  grade?: string;
  gradeAlpha?: number;
  /** Corner vignette strength 0..1. */
  vignette: number;
  /**
   * Directional key light: a broad wash from one side (e.g. low sun through a
   * gate, moonlight through high windows). Angle in radians the light travels
   * *toward*; colour + strength.
   */
  sun?: { angle: number; color: string; alpha: number };
}

/** Section fallbacks: a stage with no authored mood inherits its chapter's. */
const SECTION_MOODS: Record<SectionId, Atmosphere> = {
  castle: {
    ambient: '#140c1e',
    darkness: 0.42,
    light: 'fire',
    championLight: 70,
    weather: 'dust',
    grade: '#ffb070',
    gradeAlpha: 0.08,
    vignette: 0.5,
  },
  capital: {
    ambient: '#2a1a2e',
    darkness: 0.14,
    light: 'window',
    championLight: 46,
    weather: 'petals',
    grade: '#ffcf8a',
    gradeAlpha: 0.1,
    vignette: 0.32,
    sun: { angle: 0.6, color: '#ffd59a', alpha: 0.16 },
  },
  forest: {
    ambient: '#0a1a14',
    darkness: 0.38,
    light: 'moon',
    championLight: 60,
    weather: 'fireflies',
    fog: '#9fd0b8',
    fogAlpha: 0.12,
    grade: '#6fbf9a',
    gradeAlpha: 0.1,
    vignette: 0.55,
  },
  inn: {
    ambient: '#1a0e08',
    darkness: 0.46,
    light: 'candle',
    championLight: 64,
    weather: 'dust',
    grade: '#ffa860',
    gradeAlpha: 0.1,
    vignette: 0.55,
  },
};

/** Authored moods, keyed by level id. */
const STAGE_MOODS: Record<number, Atmosphere> = {
  // Castle Door — the courtyard at golden dusk: low warm sun raking across the
  // grass, the keep's windows already lit, leaves skittering on the wind.
  1: {
    ambient: '#1c1430',
    darkness: 0.2,
    light: 'window',
    championLight: 48,
    weather: 'leaves',
    weatherDensity: 0.8,
    grade: '#ffb46a',
    gradeAlpha: 0.12,
    vignette: 0.42,
    sun: { angle: 0.45, color: '#ffc27a', alpha: 0.2 },
  },
  // Dining Room — a feast hall lit by candelabra: warm amber, dust in the air.
  2: {
    ambient: '#1a0c08',
    darkness: 0.44,
    light: 'candle',
    championLight: 66,
    weather: 'dust',
    grade: '#ff9a50',
    gradeAlpha: 0.1,
    vignette: 0.55,
  },
  // The Grand Hall — cool moonlit marble through high windows, warm chandeliers.
  3: {
    ambient: '#0c1026',
    darkness: 0.4,
    light: 'candle',
    championLight: 64,
    weather: 'motes',
    grade: '#7f9cff',
    gradeAlpha: 0.08,
    vignette: 0.5,
    sun: { angle: 1.2, color: '#a9c0ff', alpha: 0.12 },
  },
  // The King's Chamber — a close, violet-dark bedchamber of guttering torches.
  4: {
    ambient: '#120820',
    darkness: 0.52,
    light: 'fire',
    championLight: 70,
    weather: 'motes',
    weatherDensity: 0.7,
    grade: '#b070ff',
    gradeAlpha: 0.08,
    vignette: 0.6,
  },
  // Throne Room — deep crimson and gold, braziers and embers rising.
  5: {
    ambient: '#1a0608',
    darkness: 0.5,
    light: 'fire',
    championLight: 70,
    weather: 'embers',
    weatherDensity: 0.6,
    grade: '#ff5a3c',
    gradeAlpha: 0.1,
    vignette: 0.62,
  },
  // The Capital gate — the same courtyard at bright midday, warm royal fantasy.
  6: {
    ambient: '#2a1a2e',
    darkness: 0.1,
    light: 'window',
    championLight: 40,
    weather: 'petals',
    weatherDensity: 0.7,
    grade: '#ffd08a',
    gradeAlpha: 0.1,
    vignette: 0.3,
    sun: { angle: 0.7, color: '#fff0c8', alpha: 0.16 },
  },
};

/** The mood to paint a stage with (authored, else its chapter's default). */
export function atmosphereFor(levelId: number, section: SectionId): Atmosphere {
  return STAGE_MOODS[levelId] ?? SECTION_MOODS[section] ?? SECTION_MOODS.castle;
}

/**
 * Stage atmosphere — the per-stage *mood* the renderer paints over a level:
 * ambient darkness, the colour of its light, the weather drifting through it,
 * fog, a colour grade and a vignette. Floor/path materials live on the level's
 * `BoardTheme`; this is everything else that makes the Throne Room feel like a
 * torchlit crimson hall and the Castle Door like a gold-lit dusk courtyard.
 *
 * Pure cosmetic data — the engine never reads it. Moods are named presets in
 * `MOODS`; a stage picks one with `mood: '<name>'` in its level spec (beside
 * its path/theme/decor), and a stage without one inherits its chapter's
 * `SECTION_MOODS` default. Several stages may share a preset.
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
  /**
   * Drifting banks of mist laid over the lit board (`engine/mistLayer.ts`): their
   * colour, and `alpha` the thickest a bank gets. Lit lanterns clear holes in
   * it (on a misty stage, where the mist is also a rule — see `domain/mist.ts`).
   */
  mist?: { color: string; alpha: number };
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
export const SECTION_MOODS: Record<SectionId, Atmosphere> = {
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

/** Named mood presets a stage can pick with `mood:` in its level spec. */
export const MOODS = {
  // Castle Door — the courtyard at golden dusk: low warm sun raking across the
  // grass, the keep's windows already lit, leaves skittering on the wind.
  goldenDusk: {
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
  feastHall: {
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
  moonlitHall: {
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
  violetChamber: {
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
  crimsonThrone: {
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
  brightMidday: {
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

  // The Capital's market square at blue hour — the sky gone violet, the lamps
  // and windows lit, ash from the burning castle drifting over the roofs.
  townDusk: {
    ambient: '#1a1834',
    darkness: 0.32,
    light: 'lantern',
    championLight: 56,
    weather: 'ash',
    weatherDensity: 0.45,
    grade: '#ff9a5a',
    gradeAlpha: 0.08,
    vignette: 0.46,
    sun: { angle: 0.4, color: '#ff9a6a', alpha: 0.12 },
  },

  // The Capital's outskirts by night — cold moonlight and a low ground mist
  // around the sewers, torches and a few candle-lit windows, the last of the
  // castle's ash still drifting down.
  outskirtsNight: {
    ambient: '#0c1222',
    darkness: 0.44,
    light: 'moon',
    championLight: 62,
    weather: 'ash',
    weatherDensity: 0.25,
    fog: '#7f8f86',
    fogAlpha: 0.14,
    grade: '#7a90c8',
    gradeAlpha: 0.1,
    vignette: 0.55,
    sun: { angle: 2.3, color: '#a8bce8', alpha: 0.08 },
  },

  // The outskirts drowned in mist — thick grey-green banks rolling over the
  // hovels and the road, only a hint of moon through it. The lantern posts the
  // player lights burn warm holes in it.
  outskirtsMist: {
    ambient: '#0b1214',
    darkness: 0.42,
    light: 'lantern',
    championLight: 50,
    weather: 'motes',
    weatherDensity: 0.12,
    fog: '#9aa8a2',
    fogAlpha: 0.2,
    mist: { color: '#aebcb6', alpha: 0.5 },
    grade: '#8aa0a4',
    gradeAlpha: 0.14,
    vignette: 0.62,
    sun: { angle: 2.3, color: '#c4d2dc', alpha: 0.05 },
  },

  // The sewers under the Capital — near-black brick tunnels, a sickly green
  // murk hanging over the channels, lit by lanterns, a shaft of moonlight and
  // glowing fungus.
  sewerDepths: {
    ambient: '#050a08',
    darkness: 0.56,
    light: 'lantern',
    championLight: 70,
    weather: 'motes',
    weatherDensity: 0.35,
    fog: '#6a8a5a',
    fogAlpha: 0.15,
    grade: '#6a9a64',
    gradeAlpha: 0.1,
    vignette: 0.62,
  },

  // Out of the sewers at first light — a rose-gold dawn low over the river,
  // mist lifting off the water, the night's chill still in the shadows.
  escapeDawn: {
    ambient: '#1e1a30',
    darkness: 0.24,
    light: 'lantern',
    championLight: 50,
    weather: 'motes',
    weatherDensity: 0.4,
    fog: '#e8d0d8',
    fogAlpha: 0.12,
    grade: '#ffb898',
    gradeAlpha: 0.12,
    vignette: 0.4,
    sun: { angle: 0.25, color: '#ffc0a0', alpha: 0.2 },
  },

  // --- Spare presets for new stages (unused until a stage picks one) ---

  // Crisp spring dawn — pale rose-gold sun low on the horizon, petals adrift.
  springDawn: {
    ambient: '#2a2238',
    darkness: 0.16,
    light: 'window',
    championLight: 44,
    weather: 'petals',
    weatherDensity: 0.5,
    fog: '#ffe2ec',
    fogAlpha: 0.08,
    grade: '#ffc9b8',
    gradeAlpha: 0.1,
    vignette: 0.32,
    sun: { angle: 0.3, color: '#ffd8c0', alpha: 0.18 },
  },
  // Overcast noon — flat, grey daylight; still air, almost no shadows.
  greyNoon: {
    ambient: '#262a30',
    darkness: 0.12,
    light: 'window',
    championLight: 36,
    weather: 'none',
    grade: '#b8c4d0',
    gradeAlpha: 0.1,
    vignette: 0.28,
  },
  // Autumn afternoon — russet light through the trees, leaves tumbling.
  autumnGlade: {
    ambient: '#24160c',
    darkness: 0.22,
    light: 'lantern',
    championLight: 50,
    weather: 'leaves',
    weatherDensity: 1.2,
    grade: '#e08a3c',
    gradeAlpha: 0.12,
    vignette: 0.42,
    sun: { angle: 0.9, color: '#ffb060', alpha: 0.16 },
  },
  // Misty marsh — cold green fog hanging low, fireflies over still water.
  mistyMarsh: {
    ambient: '#0c1a16',
    darkness: 0.34,
    light: 'lantern',
    championLight: 56,
    weather: 'fireflies',
    weatherDensity: 0.7,
    fog: '#b8d8c4',
    fogAlpha: 0.2,
    grade: '#7fae94',
    gradeAlpha: 0.1,
    vignette: 0.5,
  },
  // Deep night — a cold blue moon over a quiet field, faint drifting motes.
  moonlitNight: {
    ambient: '#060a1c',
    darkness: 0.54,
    light: 'moon',
    championLight: 62,
    weather: 'motes',
    weatherDensity: 0.5,
    grade: '#6a86d8',
    gradeAlpha: 0.1,
    vignette: 0.6,
    sun: { angle: 2.2, color: '#9fb8ff', alpha: 0.1 },
  },
  // Frozen pass — icy blue-white light, a pale haze, snow-like motes.
  frozenPass: {
    ambient: '#10182a',
    darkness: 0.26,
    light: 'frost',
    championLight: 54,
    weather: 'motes',
    weatherDensity: 1.4,
    fog: '#dbe8ff',
    fogAlpha: 0.14,
    grade: '#a8ccff',
    gradeAlpha: 0.12,
    vignette: 0.45,
    sun: { angle: 0.5, color: '#e4f0ff', alpha: 0.12 },
  },
  // Wizard's sanctum — violet arcane glow, floating motes of magic.
  arcaneSanctum: {
    ambient: '#140a26',
    darkness: 0.46,
    light: 'arcane',
    championLight: 66,
    weather: 'motes',
    weatherDensity: 1.1,
    grade: '#9a6cff',
    gradeAlpha: 0.12,
    vignette: 0.55,
  },
  // Holy chapel — hushed golden light falling from high windows.
  sacredChapel: {
    ambient: '#1e1810',
    darkness: 0.3,
    light: 'holy',
    championLight: 58,
    weather: 'dust',
    weatherDensity: 0.6,
    grade: '#ffe6a0',
    gradeAlpha: 0.12,
    vignette: 0.48,
    sun: { angle: 1.4, color: '#fff0c0', alpha: 0.2 },
  },
  // Forge district — hot orange firelight, embers and soot in the air.
  emberForge: {
    ambient: '#1c0a04',
    darkness: 0.48,
    light: 'fire',
    championLight: 72,
    weather: 'embers',
    weatherDensity: 1.2,
    grade: '#ff7a30',
    gradeAlpha: 0.12,
    vignette: 0.58,
  },
  // Burnt ruins — a smoky, ash-choked dusk after the fire has passed.
  ashenRuins: {
    ambient: '#18120e',
    darkness: 0.4,
    light: 'fire',
    championLight: 60,
    weather: 'ash',
    weatherDensity: 1.1,
    fog: '#8a7a6c',
    fogAlpha: 0.16,
    grade: '#a08a74',
    gradeAlpha: 0.12,
    vignette: 0.56,
  },
  // Haunted crypt — near-black with a sickly green-grey cast and cold fog.
  hauntedCrypt: {
    ambient: '#06080a',
    darkness: 0.62,
    light: 'dark',
    championLight: 64,
    weather: 'motes',
    weatherDensity: 0.4,
    fog: '#7a9a88',
    fogAlpha: 0.16,
    grade: '#5e8a74',
    gradeAlpha: 0.1,
    vignette: 0.7,
  },
  // Blood moon — a lurid red night for ominous boss stages.
  bloodMoon: {
    ambient: '#16030a',
    darkness: 0.56,
    light: 'blood',
    championLight: 66,
    weather: 'ash',
    weatherDensity: 0.6,
    grade: '#d02a3a',
    gradeAlpha: 0.12,
    vignette: 0.66,
    sun: { angle: 2.4, color: '#ff5a5a', alpha: 0.12 },
  },
} satisfies Record<string, Atmosphere>;

/** The name of a mood preset in `MOODS`. */
export type MoodId = keyof typeof MOODS;

/** The mood to paint a stage with (its chosen preset, else its chapter's default). */
export function atmosphereFor(mood: MoodId | undefined, section: SectionId): Atmosphere {
  return (mood && MOODS[mood]) || SECTION_MOODS[section] || SECTION_MOODS.castle;
}

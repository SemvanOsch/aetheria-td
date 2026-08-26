/**
 * Data-driven unit catalog.
 *
 * Units are pure data. Adding a new unit (or a whole new rarity's worth of
 * units) means adding an entry here — no component or engine code changes.
 * All balance numbers live in this file for easy tuning.
 */

import { RARITIES, type Rarity } from './rarity';
import type { TargetingType } from './targeting';
import type { PlayerSpriteConfig } from './playerSprite';
import { getPlayerChampion } from './playerChampion';

/**
 * Area-of-effect behaviour of a unit's attack.
 *  - single : hits only the chosen target.
 *  - line   : hits every enemy along a straight line from the unit toward its
 *             target, out to the end of its range (a piercing thrust/beam).
 *  - cone   : hits every enemy inside a cone (the unit's `coneAngle` wide) spread
 *             around the aim direction, out to the end of range (the Wizard's
 *             Wind Slice). Introduced by an in-stage upgrade, not a base attack.
 *  - circle : a homing projectile that detonates on impact, hitting every enemy
 *             within a circle (`burstRadius`) of the point it lands (the Magic
 *             adventurer's charged orb). Single-target aim, radial damage.
 * Extend with new shapes as future units need them.
 */
export type AoeType = 'single' | 'line' | 'cone' | 'circle';

/** Fallback opening angle (degrees) for a `cone` attack that sets no `coneAngle`. */
export const DEFAULT_CONE_ANGLE_DEG = 45;

/** Fallback detonation radius (px) for a `circle` attack that sets no `burstRadius`. */
export const DEFAULT_BURST_RADIUS = 46;

/** Full opening angle (degrees) of a unit's `cone` attack (falls back to default). */
export function coneAngleDeg(unit: UnitDef): number {
  return unit.coneAngle ?? DEFAULT_CONE_ANGLE_DEG;
}

/**
 * Whether a unit fights up close, at a distance, or plays a non-combat support
 * role. Purely descriptive — a data tag surfaced on cards/panels; the engine
 * derives actual reach from `range`.
 */
export type AttackType = 'melee' | 'ranged' | 'support';

/**
 * Whether a unit's attacks deal physical or magical damage. Purely a
 * descriptive data tag surfaced on cards/panels for now (no combat effect yet).
 * Omitted for non-combat units like the Farmer.
 */
export type DamageType = 'physical' | 'magic';

/**
 * A purchasable, in-stage upgrade tier. Effects are additive deltas applied on
 * top of the previous tier. Upgrades are bought per deployed tower with gold
 * and never carry between levels (they live on the tower, not the collection).
 */
export interface UpgradeDef {
  name: string;
  description: string;
  /** Gold cost to buy this tier. */
  cost: number;
  /** Additive stat deltas. */
  damage?: number;
  attackSpeed?: number;
  range?: number;
  /** Additive gold-per-harvest delta (for generator units). */
  generate?: number;
  /**
   * Additive delta to how many extra foes a projectile leaps to on impact (the
   * Elf's bouncing magic arrow). Adds on top of the unit's base `bounces`.
   */
  bounces?: number;
  /**
   * If set, this upgrade *transforms* the attack shape from the tier it is
   * bought onward (e.g. the Wizard's Wind Slice turns his single-target gust
   * into a `cone`). Overrides `UnitDef.aoe` for that tower.
   */
  setAoe?: AoeType;
}

/**
 * Economy behaviour: instead of attacking, the unit harvests gold. It produces
 * `amount` gold `timesPerWave` times during each wave.
 */
export interface GeneratorDef {
  amount: number;
  timesPerWave: number;
}

export interface UnitDef {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  /** Damage dealt per attack (per enemy hit). */
  damage: number;
  /** Attacks per second. */
  attackSpeed: number;
  /** Attack range in pixels. */
  range: number;
  /** Default targeting strategy (player can change per-tower in a stage). */
  targeting: TargetingType;
  /** Attack area shape. */
  aoe: AoeType;
  /** Melee vs. ranged descriptor tag. Omitted for non-combat units. */
  attackType?: AttackType;
  /** Physical vs. magic damage tag. Omitted for non-combat units. */
  damageType?: DamageType;
  /** For line AoE: half-thickness of the beam used for hit detection (px). */
  aoeWidth?: number;
  /**
   * Base number of extra foes this unit's projectile leaps to on impact (the
   * Elf's magic arrow). Omitted (0) for units whose shots don't bounce; in-stage
   * upgrades can add more via `UpgradeDef.bounces`.
   */
  bounces?: number;
  /**
   * For cone AoE: the full opening angle in degrees (e.g. 45). Only meaningful
   * once the unit's attack becomes a `cone` (via a `setAoe` upgrade); defaults
   * to DEFAULT_CONE_ANGLE_DEG if unset. Tune it per unit to widen/narrow the arc.
   */
  coneAngle?: number;
  /**
   * For `circle` AoE: the radius in pixels of the circle the projectile detonates
   * in on impact (the Magic adventurer's orb). Every enemy within this distance of
   * the impact point is struck. Only meaningful for a `circle` unit; falls back to
   * DEFAULT_BURST_RADIUS if unset.
   */
  burstRadius?: number;
  /**
   * Arrows/shots loosed per attack as a quick burst volley (the Bow adventurer's
   * shortbow fires 3). Omitted / 1 means a single shot per attack. The unit's
   * `attackSpeed` then governs how often the whole burst repeats.
   */
  burst?: number;
  /** Gold cost to deploy the unit during a level. */
  cost: number;
  /** Max number of this unit that may be deployed per stage. */
  deployLimit: number;
  /** Sequential in-stage upgrade tiers (bought in order; most units have 2). */
  upgrades: UpgradeDef[];
  /** If set, the unit is a non-combat economy unit (see GeneratorDef). */
  generator?: GeneratorDef;
  /** Simple vector visual descriptor used by the renderer & cards. */
  visual: UnitVisual;
  /** Optional special properties for future expansion (slow, etc.). */
  special?: Partial<UnitSpecial>;
}

export interface UnitVisual {
  /** Body accent color. */
  color: string;
  /** Single-glyph placeholder icon (emoji) used in cards & board. */
  icon: string;
  /**
   * Rough archetype used to pick a board silhouette. The `player-*` shapes are
   * the player's composed adventurer (one per journal proficiency), drawn from
   * `playerConfig` via `drawPlayerSprite` instead of a monolithic champion `drawX`.
   */
  shape:
    | 'archer'
    | 'crossbow'
    | 'sword'
    | 'spear'
    | 'farmer'
    | 'wizard'
    | 'elf'
    | 'player-blade'
    | 'player-bow'
    | 'player-magic';
  /**
   * For the `player-*` shapes: the composed avatar config to render, so the board
   * token and every card match the portrait made in the Adventurer's Journal.
   * Omitted for ordinary champions (they use the flat `color` silhouette).
   */
  playerConfig?: PlayerSpriteConfig;
}

export interface UnitSpecial {
  /** Fraction (0-1) to slow hit enemies by. */
  slow: number;
  /** Duration of the slow in seconds. */
  slowDuration: number;
}

/**
 * MVP catalog — Common units only.
 *
 * Roles are intentionally distinct:
 *  - Archer   : long range, fast, low damage, single target (chip / coverage)
 *  - Crossbow : longest range, slow, high damage, single target (heavy sniper)
 *  - Swordsman: cheapest, short range, medium damage, single target (front line)
 *  - Spearman : mid cost, medium range, high damage, slow, LINE AoE (piercing)
 */
export const UNITS: Record<string, UnitDef> = {
  archer: {
    id: 'archer',
    name: 'Archer',
    description:
      'Looses arrows from afar. Long reach and a fast draw, but each shot stings only lightly.',
    rarity: 'common',
    damage: 10,
    attackSpeed: 1.4,
    range: 135,
    targeting: 'first',
    aoe: 'single',
    attackType: 'ranged',
    damageType: 'physical',
    cost: 50,
    deployLimit: 4,
    upgrades: [
      {
        name: 'Keen Arrowheads',
        description: 'Sharper heads bite deeper.',
        cost: 50,
        damage: 8,
      },
      {
        name: 'Master Fletcher',
        description: 'Faster draw, farther reach, heavier shots.',
        cost: 85,
        damage: 7,
        attackSpeed: 0.3,
        range: 20,
      },
    ],
    visual: { color: '#5fd38a', icon: '🏹', shape: 'archer' },
  },
  crossbow: {
    id: 'crossbow',
    name: 'Crossbow',
    description:
      'Cranks back a heavy steel bolt and lets fly from extreme range. Slow to reload, but each shot lands with brutal force.',
    rarity: 'common',
    damage: 42,
    attackSpeed: 0.4,
    range: 160,
    targeting: 'first',
    aoe: 'single',
    attackType: 'ranged',
    damageType: 'physical',
    cost: 70,
    deployLimit: 3,
    upgrades: [
      {
        name: 'Steel Quarrels',
        description: 'Denser bolts punch far deeper.',
        cost: 55,
        damage: 22,
      },
      {
        name: 'Windlass Crank',
        description: 'A geared crank speeds the reload and lengthens the shot.',
        cost: 100,
        attackSpeed: 0.2,
        range: 45,
      },
    ],
    visual: { color: '#7d8fd6', icon: '🎯', shape: 'crossbow' },
  },
  swordsman: {
    id: 'swordsman',
    name: 'Swordsman',
    description:
      'A steadfast blade for the front line. Short reach, but cheap to field and reliably sharp.',
    rarity: 'common',
    damage: 18,
    attackSpeed: 1.0,
    range: 62,
    targeting: 'first',
    aoe: 'single',
    attackType: 'melee',
    damageType: 'physical',
    cost: 35,
    deployLimit: 4,
    upgrades: [
      {
        name: 'Tempered Steel',
        description: 'A keener edge cleaves harder.',
        cost: 30,
        damage: 13,
      },
      {
        name: 'Flurry of Blows',
        description: 'Strikes faster and hits far harder.',
        cost: 45,
        attackSpeed: 0.6,
      },
    ],
    visual: { color: '#e0574a', icon: '⚔️', shape: 'sword' },
  },
  spearman: {
    id: 'spearman',
    name: 'Spearman',
    description:
      'Drives a long spear clean through a rank of foes — every enemy in a straight line takes the hit.',
    rarity: 'common',
    damage: 28,
    attackSpeed: 0.6,
    range: 90,
    targeting: 'first',
    aoe: 'line',
    aoeWidth: 15,
    attackType: 'melee',
    damageType: 'physical',
    cost: 70,
    deployLimit: 2,
    upgrades: [
      {
        name: 'Barbed Tips',
        description: 'Cruel barbs tear through the line.',
        cost: 35,
        damage: 13,
      },
      {
        name: 'Phalanx Drill',
        description: 'Longer reach and a swifter, deadlier thrust.',
        cost: 185,
        damage: 22,
        attackSpeed: 0.2,
        range: 34,
      },
    ],
    visual: { color: '#f2b23c', icon: '🔱', shape: 'spear' },
  },
  wizard: {
    id: 'wizard',
    name: 'Wizard',
    description:
      'A storm-caller who hurls tight bullets of screaming wind. Each gust flies far and strikes hard — a rare talent among the ranks.',
    rarity: 'rare',
    damage: 24,
    attackSpeed: 1.1,
    range: 120,
    targeting: 'first',
    aoe: 'single',
    attackType: 'ranged',
    damageType: 'magic',
    coneAngle: 35,
    cost: 95,
    deployLimit: 3,
    upgrades: [
      {
        name: 'Howling Gale',
        description: 'The wind screams louder and bites harder.',
        cost: 70,
        damage: 11,
      },
      {
        name: 'Tome of Secrets',
        description: 'A magical tome contains the secrets to stronger and faster magic.',
        cost: 145,
        damage: 9,
        attackSpeed: 0.2,
        range: 20,
      },
      {
        name: 'Wind Slice',
        description:
          'Stops hurling single gusts and instead carves a sweeping slice of wind — every foe in the arc to the end of his range is cut at once.',
        cost: 220,
        damage: 24,
        attackSpeed: -0.5,
        setAoe: 'cone',
      },
    ],
    visual: { color: '#6fe3e0', icon: '🌪️', shape: 'wizard' },
  },
  elf: {
    id: 'elf',
    name: 'Elf',
    description:
      'A woodland archer who enchants every shaft she looses. Each arrow strikes true, then leaps onward to bite another nearby foe — a rare gift of the greenwood.',
    rarity: 'rare',
    damage: 12,
    attackSpeed: 1.1,
    range: 130,
    targeting: 'first',
    aoe: 'single',
    attackType: 'ranged',
    damageType: 'magic',
    // Base magic-arrow leaps: her shaft bites one extra nearby foe on impact.
    bounces: 1,
    cost: 65,
    deployLimit: 2,
    upgrades: [
      {
        name: 'Enchanted Fletching',
        description: 'Stronger enchantments let each arrow bite far harder.',
        cost: 60,
        damage: 10,
      },
      {
        name: 'Arcane Draw',
        description: 'A swifter draw and a longer, truer reach.',
        cost: 65,
        attackSpeed: 0.25,
        range: 20,
      },
      {
        name: 'Chain Enchantment',
        description: 'The enchantment ripples further — each arrow leaps to one more nearby foe.',
        cost: 80,
        bounces: 1,
      },
    ],
    visual: { color: '#b48cf0', icon: '🧝', shape: 'elf' },
  },
  farmer: {
    id: 'farmer',
    name: 'Farmer',
    description:
      'Tends the land instead of fighting — reaps gold every wave. Place it somewhere safe and let the coin roll in.',
    rarity: 'common',
    // Non-combat: harvests gold rather than attacking.
    damage: 0,
    attackSpeed: 0,
    range: 0,
    targeting: 'first',
    aoe: 'single',
    attackType: 'support',
    cost: 80,
    deployLimit: 1,
    generator: { amount: 10, timesPerWave: 3 },
    upgrades: [
      {
        name: 'Fertile Fields',
        description: 'A richer yield each harvest.',
        cost: 115,
        generate: 10,
      },
      {
        name: 'Golden Harvest',
        description: 'The land overflows with coin.',
        cost: 185,
        generate: 15,
      },
    ],
    visual: { color: '#c9a24a', icon: '🌾', shape: 'farmer' },
  },
};

/** Champions every player owns from the start (no selection screen). */
export const DEFAULT_OWNED_UNIT_IDS = ['swordsman', 'archer'] as const;

export const ALL_UNITS: UnitDef[] = Object.values(UNITS);

export function getUnit(id: string): UnitDef | undefined {
  // Catalog units first; fall back to the player's own champion(s), which are
  // built from the live PlayerProfile and registered at runtime (see
  // domain/playerChampion). This keeps getUnit the single resolution point.
  return UNITS[id] ?? getPlayerChampion(id);
}

/** Units eligible to be summoned — any whose rarity is currently available. */
export function summonableUnits(): UnitDef[] {
  return ALL_UNITS.filter((u) => RARITIES[u.rarity].available);
}

/** Human label for an AoE type. */
export function aoeLabel(aoe: AoeType): string {
  switch (aoe) {
    case 'line':
      return 'Line AoE';
    case 'cone':
      return 'Cone AoE';
    case 'circle':
      return 'Circle AoE';
    case 'single':
    default:
      return 'Single Target';
  }
}

/** Human label for a melee/ranged/support attack-type tag. */
export function attackTypeLabel(type: AttackType): string {
  switch (type) {
    case 'melee':
      return 'Melee';
    case 'ranged':
      return 'Ranged';
    case 'support':
      return 'Support';
  }
}

/** Human label for a physical/magic damage-type tag. */
export function damageTypeLabel(type: DamageType): string {
  switch (type) {
    case 'physical':
      return 'Physical';
    case 'magic':
      return 'Magic';
  }
}

/**
 * Per-attack single-target damage per second (damage × attack speed). For a burst
 * shooter this is the DPS of one arrow at the volley-repeat rate; the `burst`
 * volley size is surfaced separately (shown as an "×N" multiplier), not folded in.
 */
export function unitDps(unit: UnitDef): number {
  return unit.damage * unit.attackSpeed;
}

/**
 * Attack speed as a display string: up to 2 decimals, trailing zeros trimmed —
 * so a clean 0.4 shows as "0.4" while a buffed 0.44 keeps its second decimal.
 */
export function formatAttackSpeed(speed: number): string {
  return Number(speed.toFixed(2)).toString();
}

/** Highest in-stage upgrade tier a unit can reach (its number of upgrades). */
export function maxUpgradeTier(unit: UnitDef): number {
  return unit.upgrades.length;
}

/**
 * A tower's effective attack shape after buying the first `tier` upgrades: the
 * unit's base `aoe`, overridden by the most recent purchased upgrade that
 * `setAoe` (e.g. the Wizard's Wind Slice turns 'single' into 'cone').
 */
export function effectiveAoe(unit: UnitDef, tier: number): AoeType {
  let aoe = unit.aoe;
  for (let i = 0; i < tier && i < unit.upgrades.length; i++) {
    const next = unit.upgrades[i].setAoe;
    if (next) aoe = next;
  }
  return aoe;
}

export interface EffectiveStats {
  damage: number;
  attackSpeed: number;
  range: number;
}

/** Stats after applying the first `tier` upgrades (tier 0 = base). */
export function effectiveStats(unit: UnitDef, tier: number): EffectiveStats {
  let damage = unit.damage;
  let attackSpeed = unit.attackSpeed;
  let range = unit.range;
  for (let i = 0; i < tier && i < unit.upgrades.length; i++) {
    const u = unit.upgrades[i];
    damage += u.damage ?? 0;
    attackSpeed += u.attackSpeed ?? 0;
    range += u.range ?? 0;
  }
  return { damage, attackSpeed, range };
}

/** The next upgrade a tower at `tier` could buy, or null if maxed. */
export function nextUpgrade(unit: UnitDef, tier: number): UpgradeDef | null {
  return tier < unit.upgrades.length ? unit.upgrades[tier] : null;
}

/** Gold produced per harvest after applying the first `tier` upgrades. */
export function effectiveGenerate(unit: UnitDef, tier: number): number {
  if (!unit.generator) return 0;
  let amount = unit.generator.amount;
  for (let i = 0; i < tier && i < unit.upgrades.length; i++) {
    amount += unit.upgrades[i].generate ?? 0;
  }
  return amount;
}

/**
 * How many extra foes a unit's projectile leaps to on impact after applying the
 * first `tier` upgrades: the unit's base `bounces` plus every purchased upgrade's
 * `bounces` delta. 0 for units whose shots don't bounce.
 */
export function effectiveBounces(unit: UnitDef, tier: number): number {
  let bounces = unit.bounces ?? 0;
  for (let i = 0; i < tier && i < unit.upgrades.length; i++) {
    bounces += unit.upgrades[i].bounces ?? 0;
  }
  return bounces;
}

/** The stat deltas an upgrade adds — an `UpgradeDef` satisfies this shape. */
export interface UpgradeEffect {
  damage?: number;
  attackSpeed?: number;
  range?: number;
  generate?: number;
  /** Extra projectile leaps this upgrade grants (the Elf's Chain Enchantment). */
  bounces?: number;
  /** An attack-shape transform this upgrade unlocks (e.g. 'cone'). */
  setAoe?: AoeType;
  /** Opening angle (degrees) to show for a `cone` transform. */
  coneAngle?: number;
}

/**
 * Compact "+9 DMG · +20 Range" summary of an upgrade's effect. Accepts either a
 * raw `UpgradeDef` or a computed delta object — pass the mastery-adjusted deltas
 * (see domain/mastery `masteryUpgradeDeltas`) so displayed gains reflect a
 * champion's permanent bonuses. Any zero/absent field is omitted.
 */
export function upgradeEffectLabel(e: UpgradeEffect): string {
  // Deltas can be negative (a trade-off upgrade), so sign each explicitly rather
  // than hard-coding a "+" — otherwise a −0.5 would read as "+-0.5".
  const sign = (n: number) => (n < 0 ? '-' : '+');
  const parts: string[] = [];
  if (e.damage) parts.push(`${sign(e.damage)}${Math.abs(e.damage)} DMG`);
  if (e.attackSpeed) parts.push(`${sign(e.attackSpeed)}${formatAttackSpeed(Math.abs(e.attackSpeed))}/s SPD`);
  if (e.range) parts.push(`${sign(e.range)}${Math.abs(e.range)} Range`);
  if (e.generate) parts.push(`${sign(e.generate)}${Math.abs(e.generate)} gold/harvest`);
  if (e.bounces) parts.push(`${sign(e.bounces)}${Math.abs(e.bounces)} Bounce`);
  if (e.setAoe === 'cone') {
    parts.push(`⟶ Wind Slice${e.coneAngle ? ` (${e.coneAngle}° cone)` : ' (cone)'}`);
  }
  return parts.join(' · ');
}

/** Coarse range label used on compact cards. */
export function rangeLabel(range: number): string {
  return range >= 110 ? 'Long' : range >= 75 ? 'Medium' : 'Short';
}

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
  /** Additive extra allies a Bard buffs per performance (see `BardDef`). */
  bardTargets?: number;
  /**
   * Additive bonus to the Bard's attack-speed buff multiplier — e.g. 0.15 turns
   * a 1.4× buff into 1.55× (see `BardDef.attackSpeedMult`).
   */
  bardSpeedBonus?: number;
  /**
   * Additive share of a foe's magic resistance this champion's hits ignore —
   * e.g. 0.4 turns a 20% magic resist into 12% (see `effectiveMagicPen`).
   */
  magicPen?: number;
  /** Additive extra ice shards a shattering missile throws (see `ShatterDef.count`). */
  shatterCount?: number;
  /** Additive px a shattering missile's shards fly (see `ShatterDef.reach`). */
  shatterReach?: number;
  /**
   * Ice Storm: every foe inside the champion's range is slowed by this fraction
   * (0.15 = 15% slower) for as long as it stays there. Additive across tiers.
   */
  iceStorm?: number;
  /**
   * A fork: this tier is a choice between these upgrades, and buying one locks
   * the others out for that tower (see `withUpgradeChoice`). The fork's own
   * name/description/cost only label it on overview tables; it has no deltas.
   */
  choices?: UpgradeDef[];
  /**
   * If set, this tier unlocks a player-activated ability (the Blade's Cyclone
   * Slash) instead of a passive stat change. The ability stays available from
   * this tier onward. A tier carrying an ability typically has no stat deltas.
   */
  ability?: AbilityDef;
}

/**
 * An activated ability an upgrade tier can unlock (the Blade adventurer's Cyclone
 * Slash). Unlike passive stat upgrades, an ability is *player-triggered* from an
 * icon in the battle HUD and then recharges. It is pure data — the engine reads
 * these fields to resolve the cast, and the HUD reads them for the icon/tooltip.
 */
export interface AbilityDef {
  /** Stable id the engine switches on to resolve the cast (e.g. 'cyclone-slash'). */
  id: string;
  /** Display name shown on the ability icon's tooltip. */
  name: string;
  /** One-line tooltip description. */
  description: string;
  /**
   * Damaging abilities (the Blade's Cyclone Slash): damage dealt to every foe in
   * range, as a multiple of the tower's *current* (upgraded, mastery-adjusted)
   * damage — so the ability scales with the hero. Omitted for non-damaging ones.
   */
  damageMult?: number;
  /**
   * Timed self-buff abilities (the Bow's Quickdraw): the attack-speed multiplier
   * granted to the caster while active. For a barrage (the Staff's Mana Storm):
   * how many times faster than its normal attacks it looses bolts. Omitted for
   * other abilities.
   */
  speedMult?: number;
  /**
   * How long a timed ability lasts, in seconds — the buff window for a self-buff
   * (Quickdraw), or the channel time for a beam (the Mage's Mana Ray) or a
   * barrage (the Staff's Mana Storm).
   */
  duration?: number;
  /**
   * For a channelled beam ability (the Mage's Mana Ray) or a ground fissure (the
   * Claymore's Earthsplitter): half-width of the struck corridor in pixels. Falls
   * back to a default if unset.
   */
  aoeWidth?: number;
  /**
   * For a fissure ability (the Claymore's Earthsplitter): how far the crack runs,
   * as a multiple of the champion's range at cast. Falls back to 1 if unset.
   */
  reachMult?: number;
  /**
   * Distance in pixels the ability shoves every survivor it strikes back along
   * its path (bosses take half). Omitted / 0 = no shove.
   */
  knockback?: number;
  /**
   * For a channelled beam ability: seconds between damage ticks (the Mana Ray
   * strikes everything in the beam once every `tickInterval`). Falls back to a
   * default if unset.
   */
  tickInterval?: number;
  /**
   * For an empowering ability (the Longbow's Piercing Shot): how many of the
   * champion's next attacks it empowers. Omitted for every other ability.
   */
  charges?: number;
  /** Recharge time in seconds after each use. */
  cooldown: number;
  /**
   * Mana the champion spends to cast this ability (see `UnitDef.maxMana` and
   * `Tower.mana`). The ability can't fire without at least this much mana, and
   * casting drains it. Omitted / 0 means the ability is free.
   */
  manaCost?: number;
  /** Emoji shown on the icon when no image asset is available (fallback). */
  icon: string;
  /**
   * Optional path (under `public/`) to a raster icon for the ability. When the
   * file is present the HUD shows it; otherwise it falls back to `icon`.
   */
  image?: string;
}

/**
 * Support behaviour: instead of attacking, the unit periodically plays a tune
 * that buffs nearby allied champions. The Bard picks `targets` random allies
 * within its range (never itself), speeding their attacks by `attackSpeedMult`
 * for `duration` seconds, and repeats every `every` seconds.
 */
export interface BardDef {
  /** Seconds between performances. */
  every: number;
  /** How many random allies in range each performance buffs. */
  targets: number;
  /** Attack-speed multiplier granted to a buffed ally (1.4 = +40% faster). */
  attackSpeedMult: number;
  /** How long a buff lasts on an ally, in seconds. */
  duration: number;
}

/**
 * Shatter behaviour (the Frost Witch's ice missile): on impact the missile
 * bursts into `count` shards, spread evenly around the impact point, that fly
 * straight out up to `reach` px. Each shard strikes the first foe it touches
 * (never the missile's own target) for `damageMult` of the missile's damage.
 */
export interface ShatterDef {
  count: number;
  damageMult: number;
  reach: number;
}

/** Seconds a bleed wound lasts (and every open wound's clock resets to on a new hit). */
export const BLEED_DURATION = 3;

/** Most bleed wounds a foe can carry at once (see `addDotStack`). */
export const BLEED_MAX_STACKS = 5;

/**
 * Bleed (the Bandit's knives): every hit that lands opens a wound that deals
 * `damageMult` of that hit's damage again, spread over `BLEED_DURATION`
 * seconds. Wounds stack (up to `BLEED_MAX_STACKS`), so a fast attacker keeps
 * several open at once.
 */
export interface BleedDef {
  damageMult: number;
}

/** Seconds a poison stack lasts (and every stack's clock resets to on a new hit). */
export const POISON_DURATION = 5;

/** Most poison stacks a foe can carry at once (see `addDotStack`). */
export const POISON_MAX_STACKS = 5;

/** Share of its usual strength a poison stack has on a boss. */
export const POISON_BOSS_MULT = 0.125;

/**
 * Poison: every hit that lands adds a stack that deals `maxHealthFraction` of
 * the foe's max health (`POISON_BOSS_MULT` of that on a boss), spread over
 * `POISON_DURATION` seconds. Unlike Bleed it ignores the champion's damage.
 * Stacks like Bleed (up to `POISON_MAX_STACKS`): each new stack restarts the
 * clock on every stack ticking.
 */
export interface PoisonDef {
  maxHealthFraction: number;
}

/**
 * What one vial does when it shatters on a foe (a vial's base, or a level of it
 * resolved through `effectiveVial`).
 */
export interface VialEffect {
  /** Impact damage as a multiple of the champion's damage stat (1 = a plain hit, 0 = none). */
  damageMult: number;
  /** A poison stack worth this share of the foe's max health (see `PoisonDef`); 0 / omitted = none. */
  poison?: number;
  /** A bleed wound worth this share of the champion's damage stat (see `BleedDef`); 0 / omitted = none. */
  bleed?: number;
  /** Its impact damage ignores the foe's physical and magic resistance. */
  ignoreResist?: boolean;
}

/**
 * One in-stage level of a vial, bought with gold once the champion's regular
 * tiers are all bought. Each set field *replaces* the vial's value from that
 * level on (3% → 5% → 7% poison), so the numbers read as written.
 */
export interface VialLevelDef {
  cost: number;
  damageMult?: number;
  poison?: number;
  bleed?: number;
}

/**
 * A vial in a thrower's cycle (the Plague Doctor): every attack throws the next
 * vial in `UnitDef.vials` order, wrapping around. Each vial carries its own
 * repeatable upgrade (`levels`), bought in parallel with the other vials'.
 */
export interface VialDef extends VialEffect {
  name: string;
  description: string;
  /** Colour of the liquid (the flask in flight and its splash). */
  color: string;
  levels: VialLevelDef[];
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
   * `attackSpeed` then governs how often the whole burst repeats. The Magic
   * adventurer's Staff looses its whole volley at once (3 mana bolts, each
   * seeking a different foe) rather than one after another.
   */
  burst?: number;
  /**
   * An ice missile that shatters on impact (the Frost Witch): after striking its
   * target it bursts into shards flying out from the impact point, each striking
   * the first other foe it meets (see `ShatterDef`). Omitted for every other unit.
   */
  shatter?: ShatterDef;
  /** Its hits open bleeding wounds (the Bandit, see `BleedDef`). Omitted for every other unit. */
  bleed?: BleedDef;
  /** Its hits poison foes for a share of their max health (see `PoisonDef`). */
  poison?: PoisonDef;
  /**
   * A cycle of vials thrown one per attack, in order (the Plague Doctor, see
   * `VialDef`). Each vial decides that throw's damage, poison and bleed (the
   * unit's own `bleed`/`poison` don't apply to it), and has its own upgrade
   * levels that open once every regular tier is bought.
   */
  vials?: VialDef[];
  /** Gold cost to deploy the unit during a level. */
  cost: number;
  /** Max number of this unit that may be deployed per stage. */
  deployLimit: number;
  /**
   * Mana capacity for a champion with activated abilities (the three heroes). A
   * deployed hero starts each stage with a full pool, spends it to cast abilities
   * and refills it only by killing enemies (see `EnemyDef.mana`). Omitted / 0 for
   * champions without a mana pool.
   */
  maxMana?: number;
  /**
   * Mana a hero regains per second on its own, on top of kills (from worn armor;
   * omitted / 0 = none).
   */
  manaRegen?: number;
  /** Sequential in-stage upgrade tiers (bought in order; most units have 2). */
  upgrades: UpgradeDef[];
  /** If set, the unit is a non-combat economy unit (see GeneratorDef). */
  generator?: GeneratorDef;
  /** If set, the unit is a non-combat support unit that buffs allies (see BardDef). */
  bard?: BardDef;
  /** Simple vector visual descriptor used by the renderer & cards. */
  visual: UnitVisual;
  /** Optional special properties for future expansion (slow, etc.). */
  special?: Partial<UnitSpecial>;
  /**
   * Bonuses from worn equipment (the player's armor, see `domain/armor.ts`
   * `applyArmor`). Read by `masteryStats`, `critChanceFor` and
   * `critMultiplierFor`, so they reach the engine and every display.
   */
  gearBonus?: GearBonus;
}

/** Stat bonuses from equipment, applied on top of in-stage levels and mastery. */
export interface GearBonus {
  damageMult: number;
  attackSpeedMult: number;
  rangeMult: number;
  /** Added crit chance (0.03 = +3 points). */
  critChance: number;
  /** Added to the crit damage multiplier. */
  critMultiplier: number;
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
  | 'bard'
  | 'frostWitch'
  | 'bandit'
  | 'plagueDoctor'
  | 'player-blade'
  | 'player-claymore'
  | 'player-bow'
  | 'player-longbow'
  | 'player-magic'
  | 'player-staff';
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
        description: 'Strikes much faster.',
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
      'Drives a long spear clean through a rank of foes, every enemy in a straight line takes the hit.',
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
      'A storm-caller who hurls tight bullets of screaming wind. Each gust flies far and strikes hard - a rare talent among the ranks.',
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
          'Stops hurling single gusts and instead carves a sweeping slice of wind.',
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
      'A woodland archer who enchants every shaft she looses. Each arrow strikes true, then leaps onward to bite another nearby foe - a rare gift of the greenwood.',
    rarity: 'rare',
    damage: 12,
    attackSpeed: 1.1,
    range: 130,
    targeting: 'first',
    aoe: 'single',
    attackType: 'ranged',
    damageType: 'magic',
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
        description: 'A swifter draw and a longer reach.',
        cost: 65,
        attackSpeed: 0.25,
        range: 20,
      },
      {
        name: 'Chain Enchantment',
        description: 'The enchantment ripples further - each arrow leaps to one more nearby foe.',
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
      'Tends the land instead of fighting - reaps gold every wave.',
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
  bard: {
    id: 'bard',
    name: 'Bard',
    description:
      'A wandering minstrel who never draws a blade. Every few beats he strikes up a rousing tune, spurring nearby champions to strike faster for a while.',
    rarity: 'common',
    // Non-combat: plays buffs rather than attacking.
    damage: 0,
    attackSpeed: 0,
    range: 115,
    targeting: 'first',
    aoe: 'single',
    attackType: 'support',
    bard: { every: 10, targets: 2, attackSpeedMult: 1.2, duration: 6 },
    cost: 60,
    deployLimit: 2,
    upgrades: [
      {
        name: 'Lively Melody',
        description: 'A brighter tune carries farther and lifts the spirits higher.',
        cost: 80,
        range: 25,
        bardSpeedBonus: 0.15,
      },
      {
        name: 'Rousing Anthem',
        description: 'A stirring anthem rallies one more champion, and rouses them all the more.',
        cost: 140,
        bardTargets: 1,
        bardSpeedBonus: 0.15,
      },
    ],
    visual: { color: '#e08fd0', icon: '🎵', shape: 'bard' },
  },
  frostWitch: {
    id: 'frostWitch',
    name: 'Frost Witch',
    description:
      'A witch of the long winter. She hurls needles of ice that shatter on impact and everything they cut is slowed by the cold.',
    rarity: 'epic',
    damage: 22,
    attackSpeed: 0.8,
    range: 125,
    targeting: 'first',
    aoe: 'single',
    attackType: 'ranged',
    damageType: 'magic',
    shatter: { count: 5, damageMult: 0.4, reach: 44 },
    special: { slow: 0.30, slowDuration: 2 },
    cost: 120,
    deployLimit: 2,
    upgrades: [
      {
        name: 'Winter\'s Reach',
        description: 'A freezing cold makes her needles fly farther and hit harder.',
        cost: 80,
        damage: 11,
        range: 15,
      },
      {
        name: 'Rimepiercer',
        description: 'Her needles freeze so hard they pierce warding magic, ignoring 40% of a foe\'s magic resistance.',
        cost: 100,
        damage: 8,
        magicPen: 0.4,
      },
      {
        name: 'Winter\'s Choice',
        description: 'Shattering Cold or Ice Storm: she can learn only one.',
        cost: 160,
        choices: [
          {
            name: 'Shattering Cold',
            description: 'Her missiles burst into more shards, and they fly farther.',
            cost: 160,
            shatterCount: 3,
            shatterReach: 12,
            damage: 9
          },
          {
            name: 'Ice Storm',
            description: 'A storm of snow swirls around her, slowing every foe in her range.',
            cost: 120,
            iceStorm: 0.15,
          },
        ],
      },
    ],
    visual: { color: '#24306a', icon: '❄️', shape: 'frostWitch' },
  },
  bandit: {
    id: 'bandit',
    name: 'Bandit',
    description: 'A cutthroat who trades heavy blows for lingering wounds. Each quick strike applies bleed, letting the damage build while foes struggle onward.',
    rarity: 'common',
    damage: 8,
    attackSpeed: 1.4,
    range: 60,
    targeting: 'first',
    aoe: 'single',
    attackType: 'melee',
    damageType: 'physical',
    bleed: { damageMult: 0.5 },
    cost: 55,
    deployLimit: 3,
    upgrades: [
      {
        name: 'Deep Cuts',
        description: 'His knives cut deeper dealing more damage.',
        cost: 25,
        damage: 4,
      },
      {
        name: 'Rapid Cuts',
        description: 'A flurry of quick slashes lands more often, stacking wounds in a hurry.',
        cost: 30,
        attackSpeed: 0.3,
      },
    ],
    visual: { color: '#3b3440', icon: '🩸', shape: 'bandit' },
  },
  plague_doctor: {
    id: 'plague_doctor',
    name: 'Plague Doctor',
    description: 'A masked physician who turns forbidden remedies against the enemy. His vials cycle between lingering venom, resistance-piercing tonics, and bloodletting solvents. Making every throw a different kind of threat.',
    rarity: 'epic',
    damage: 9,
    attackSpeed: 0.65,
    range: 95,
    targeting: 'first',
    aoe: 'single',
    attackType: 'ranged',
    damageType: 'physical',
    vials: [
      {
        name: 'Verdant Venom',
        description: 'A green venom that poisons whatever it splashes.',
        color: '#b4d43a',
        damageMult: 1,
        poison: 0.1,
        levels: [
          { cost: 20, poison: 0.13 },
          { cost: 20, poison: 0.16 },
          { cost: 20, poison: 0.2 },
        ],
      },
      {
        name: 'Ruin Tonic',
        description: 'A corrosive tonic that eats straight through armour and wards alike.',
        color: '#b06ae0',
        damageMult: 2,
        ignoreResist: true,
        levels: [
          { cost: 20, damageMult: 2.5 },
          { cost: 20, damageMult: 3 },
          { cost: 20, damageMult: 3.5 },
        ],
      },
      {
        name: 'Sanguine Solvent',
        description: 'A thin red solvent that keeps every wound it touches from closing.',
        color: '#d8344a',
        damageMult: 1,
        bleed: 2,
        levels: [
          { cost: 20, bleed: 2.5 },
          { cost: 20, bleed: 3 },
          { cost: 20, bleed: 3.5 },
        ],
      },
    ],
    cost: 70,
    deployLimit: 3,
    upgrades: [
      {
        name: 'Measured Doses',
        description: 'Careful measurements shorten the time between each prepared vial.',
        cost: 25,
        attackSpeed: 0.15,
      },
      {
        name: 'Potent Formula',
        description: 'A more potent mixture makes every vial strike with greater force.',
        cost: 35,
        damage: 8,
      },
    ],
    visual: { color: '#2f2a2e', icon: '🧪', shape: 'plagueDoctor' },
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

/**
 * A unit's attack shape for cards and stat sheets: its AoE label, or "Shatter"
 * for an ice missile that bursts into shards (the Frost Witch).
 */
export function attackShapeLabel(unit: UnitDef, aoe: AoeType = unit.aoe): string {
  return unit.shatter && aoe === 'single' ? 'Shatter' : aoeLabel(aoe);
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
 * Damage dealt per hit counting the wound it opens (the Bandit's bleed: each
 * hit bleeds `damageMult` of itself again), as a multiplier on the hit. 1 for
 * a champion whose hits don't bleed. A vial thrower's is its cycle's average
 * at base levels (`vialDamageFactor`, with any vial mastery `vials`). Sustained-DPS
 * displays read this.
 */
export function bleedDamageFactor(unit: UnitDef, vials: VialMastery = NO_VIAL_MASTERY): number {
  if (unit.vials?.length) return vialDamageFactor(unit, [], vials);
  return 1 + (unit.bleed?.damageMult ?? 0);
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

/**
 * The activated ability a tower has after buying the first `tier` upgrades: the
 * ability granted by the most recent purchased tier that carries one (the Blade's
 * Cyclone Slash unlocks at its tier 3), or null if none is unlocked yet.
 */
export function effectiveAbility(unit: UnitDef, tier: number): AbilityDef | null {
  let ability: AbilityDef | null = null;
  for (let i = 0; i < tier && i < unit.upgrades.length; i++) {
    if (unit.upgrades[i].ability) ability = unit.upgrades[i].ability!;
  }
  return ability;
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

/**
 * A Bard's effective performance config after applying the first `tier`
 * upgrades: its base `bard`, plus each purchased upgrade's additive `bardTargets`
 * / `bardSpeedBonus` deltas. Returns null for a non-Bard unit. The engine and
 * every display read this so the numbers always agree.
 */
export function effectiveBard(unit: UnitDef, tier: number): BardDef | null {
  if (!unit.bard) return null;
  const b = { ...unit.bard };
  for (let i = 0; i < tier && i < unit.upgrades.length; i++) {
    b.targets += unit.upgrades[i].bardTargets ?? 0;
    b.attackSpeedMult += unit.upgrades[i].bardSpeedBonus ?? 0;
  }
  return b;
}

/**
 * Share (in [0,1]) of a foe's magic resistance a unit's hits ignore after the
 * first `tier` upgrades: the sum of every purchased upgrade's `magicPen`.
 */
export function effectiveMagicPen(unit: UnitDef, tier: number): number {
  let pen = 0;
  for (let i = 0; i < tier && i < unit.upgrades.length; i++) {
    pen += unit.upgrades[i].magicPen ?? 0;
  }
  return Math.min(1, pen);
}

/**
 * A unit's shatter after the first `tier` upgrades: its base `shatter` plus
 * every purchased upgrade's `shatterCount`/`shatterReach`. Null if it doesn't
 * shatter.
 */
export function effectiveShatter(unit: UnitDef, tier: number): ShatterDef | null {
  if (!unit.shatter) return null;
  const s = { ...unit.shatter };
  for (let i = 0; i < tier && i < unit.upgrades.length; i++) {
    s.count += unit.upgrades[i].shatterCount ?? 0;
    s.reach += unit.upgrades[i].shatterReach ?? 0;
  }
  return s;
}

/** The Ice Storm slow (fraction) a unit casts over its range after `tier` upgrades; 0 for none. */
export function effectiveIceStorm(unit: UnitDef, tier: number): number {
  let slow = 0;
  for (let i = 0; i < tier && i < unit.upgrades.length; i++) {
    slow += unit.upgrades[i].iceStorm ?? 0;
  }
  return Math.min(1, slow);
}

/** A vial's effect at `level` (0 = its base): each bought level's set fields replace the last. */
export function effectiveVial(vial: VialDef, level: number): VialEffect {
  const e: VialEffect = { damageMult: vial.damageMult, poison: vial.poison, bleed: vial.bleed, ignoreResist: vial.ignoreResist };
  for (let i = 0; i < level && i < vial.levels.length; i++) {
    const l = vial.levels[i];
    if (l.damageMult != null) e.damageMult = l.damageMult;
    if (l.poison != null) e.poison = l.poison;
    if (l.bleed != null) e.bleed = l.bleed;
  }
  return e;
}

/** The next level a vial at `level` could buy, or null if maxed. */
export function nextVialLevel(vial: VialDef, level: number): VialLevelDef | null {
  return level < vial.levels.length ? vial.levels[level] : null;
}

/** Whether a tower at `tier` may buy vial levels: it has vials and every regular tier is bought. */
export function vialUpgradesOpen(unit: UnitDef, tier: number): boolean {
  return !!unit.vials?.length && tier >= unit.upgrades.length;
}

/**
 * A vial thrower's permanent mastery tuning (resolved by `masteryVials`):
 * `potency` multiplies each vial's signature effect (index-matched to `vials`,
 * missing = 1, see `potentVial`), `formula` adds The Grand Formula to the
 * cycle, and `discount` is gold off every vial level (see `vialLevelCost`).
 */
export interface VialMastery {
  potency: number[];
  formula: boolean;
  discount: number;
}

/** No vial mastery: base potency, no Grand Formula, full prices. */
export const NO_VIAL_MASTERY: VialMastery = { potency: [], formula: false, discount: 0 };

/** The fourth vial The Grand Formula adds after a full round (see `vialCycle`). */
export const GRAND_FORMULA = { name: 'The Grand Formula', color: '#f4f2ec' } as const;

/**
 * A vial's effect with its signature made `mult`× as potent: its poison if it
 * poisons, else its bleed if it bleeds, else its impact damage (the Ruin Tonic).
 */
export function potentVial(e: VialEffect, mult: number): VialEffect {
  if (mult === 1) return e;
  if (e.poison) return { ...e, poison: e.poison * mult };
  if (e.bleed) return { ...e, bleed: e.bleed * mult };
  return { ...e, damageMult: e.damageMult * mult };
}

/**
 * The Grand Formula's effect: every vial's at once. The hardest impact (and
 * resistance-piercing if any vial pierces), the strongest poison and bleed.
 */
export function grandFormulaEffect(effects: readonly VialEffect[]): VialEffect {
  const max = (pick: (e: VialEffect) => number | undefined) => Math.max(0, ...effects.map((e) => pick(e) ?? 0));
  return {
    damageMult: max((e) => e.damageMult),
    poison: max((e) => e.poison) || undefined,
    bleed: max((e) => e.bleed) || undefined,
    ignoreResist: effects.some((e) => e.ignoreResist) || undefined,
  };
}

/** One throw in a vial thrower's cycle, resolved: what it is called, looks like and does. */
export interface ThrownVial {
  name: string;
  color: string;
  effect: VialEffect;
  /** The Grand Formula (not one of the unit's own `vials`). */
  formula?: boolean;
}

/**
 * A vial thrower's full cycle in throw order: each vial at its bought level
 * (`levels`, index-matched to `vials`) with its mastery potency, then The
 * Grand Formula when learned. The engine's throws and every vial display read
 * this. Empty for a champion without vials.
 */
export function vialCycle(unit: UnitDef, levels: readonly number[] = [], m: VialMastery = NO_VIAL_MASTERY): ThrownVial[] {
  const cycle: ThrownVial[] = (unit.vials ?? []).map((v, i) => ({
    name: v.name,
    color: v.color,
    effect: potentVial(effectiveVial(v, levels[i] ?? 0), m.potency[i] ?? 1),
  }));
  if (m.formula && cycle.length > 1) {
    cycle.push({ ...GRAND_FORMULA, effect: grandFormulaEffect(cycle.map((c) => c.effect)), formula: true });
  }
  return cycle;
}

/** Colour of the vial at `index` of a thrower's cycle (The Grand Formula past its own vials). */
export function vialColorAt(unit: UnitDef, index: number): string | undefined {
  const vials = unit.vials;
  if (!vials?.length) return undefined;
  return index < vials.length ? vials[index].color : GRAND_FORMULA.color;
}

/** Gold a vial level costs after a mastery `discount` (Careful Measure); never below 0. */
export function vialLevelCost(level: VialLevelDef, discount = 0): number {
  return Math.max(0, level.cost - discount);
}

/**
 * Damage per hit of a vial thrower averaged over its cycle, as a multiplier on
 * its damage stat: each vial's impact plus its bleed (poison scales off the
 * foe, so it's left out, as for every poison). `levels` index-matches `vials`
 * (omitted = all at base); `m` folds in mastery (potency, The Grand Formula).
 * 1 for a champion without vials.
 */
export function vialDamageFactor(unit: UnitDef, levels: readonly number[] = [], m: VialMastery = NO_VIAL_MASTERY): number {
  const cycle = vialCycle(unit, levels, m);
  if (!cycle.length) return 1;
  const sum = cycle.reduce((s, c) => s + c.effect.damageMult + (c.effect.bleed ?? 0), 0);
  return sum / cycle.length;
}

/** "3% max HP poison", "200% damage, ignores resistance", "100% bleed": a vial's effect in one line. */
export function vialEffectLabel(e: VialEffect): string {
  const pc = (f: number) => `${+(f * 100).toFixed(2)}%`;
  const parts: string[] = [];
  if (e.poison) parts.push(`${pc(e.poison)} max HP poison`);
  if (e.bleed) parts.push(`${pc(e.bleed)} bleed`);
  if (e.damageMult !== 1 || e.ignoreResist || parts.length === 0) {
    parts.push(e.damageMult > 0 ? `${pc(e.damageMult)} damage${e.ignoreResist ? ', ignores resistance' : ''}` : 'no impact damage');
  }
  return parts.join(' · ');
}

/**
 * What buying a vial's `level` (1-based) changes, as "5% → 7% poison": the
 * values before and after it, with any mastery `potency` (see `potentVial`).
 */
export function vialLevelLabel(vial: VialDef, level: number, potency = 1): string {
  const before = potentVial(effectiveVial(vial, level - 1), potency);
  const after = potentVial(effectiveVial(vial, level), potency);
  const pc = (f = 0) => `${+(f * 100).toFixed(2)}%`;
  const parts: string[] = [];
  if ((after.poison ?? 0) !== (before.poison ?? 0)) parts.push(`${pc(before.poison)} → ${pc(after.poison)} poison`);
  if ((after.bleed ?? 0) !== (before.bleed ?? 0)) parts.push(`${pc(before.bleed)} → ${pc(after.bleed)} bleed`);
  if (after.damageMult !== before.damageMult) parts.push(`${pc(before.damageMult)} → ${pc(after.damageMult)} damage`);
  return parts.join(' · ') || 'No change';
}

/**
 * The unit with the fork at 1-based `tier` resolved to `choice`: that tier's
 * entry is replaced by the chosen upgrade, so every per-tier helper reads it
 * like any other tier. A deployed tower swaps its `def` for this when the
 * choice is bought. Returns the unit unchanged if that tier isn't a fork.
 */
export function withUpgradeChoice(unit: UnitDef, tier: number, choice: number): UnitDef {
  const pick = unit.upgrades[tier - 1]?.choices?.[choice];
  if (!pick) return unit;
  const upgrades = unit.upgrades.slice();
  upgrades[tier - 1] = pick;
  return { ...unit, upgrades };
}

/** One way through a unit's forks: the def with every fork resolved, and the names picked. */
export interface UpgradePath {
  def: UnitDef;
  /** The chosen option's name at each fork, in tier order (empty without forks). */
  picks: string[];
}

/**
 * Every way a unit's fork tiers can be resolved, one `UpgradePath` per
 * combination (a unit with no forks has the one path, itself, with no picks).
 */
export function upgradePaths(unit: UnitDef): UpgradePath[] {
  let paths: UpgradePath[] = [{ def: unit, picks: [] }];
  unit.upgrades.forEach((up, i) => {
    if (!up.choices) return;
    paths = paths.flatMap((p) =>
      up.choices!.map((c, ci) => ({ def: withUpgradeChoice(p.def, i + 1, ci), picks: [...p.picks, c.name] })),
    );
  });
  return paths;
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
  /** Extra allies a Bard's performance buffs (see `UpgradeDef.bardTargets`). */
  bardTargets?: number;
  /** Bonus to a Bard's attack-speed buff (see `UpgradeDef.bardSpeedBonus`). */
  bardSpeedBonus?: number;
  /** Share of magic resistance this tier's hits ignore (see `UpgradeDef.magicPen`). */
  magicPen?: number;
  /** Extra shards / shard reach this tier gives a shattering missile. */
  shatterCount?: number;
  shatterReach?: number;
  /** Ice Storm slow over the champion's range (see `UpgradeDef.iceStorm`). */
  iceStorm?: number;
  /** Name of an activated ability this tier unlocks (the Blade's Cyclone Slash). */
  ability?: string;
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
  if (e.bardTargets) parts.push(`${sign(e.bardTargets)}${Math.abs(e.bardTargets)} Target`);
  if (e.bardSpeedBonus) parts.push(`${sign(e.bardSpeedBonus)}${Math.abs(Math.round(e.bardSpeedBonus * 100))}% Tempo`);
  if (e.magicPen) parts.push(`Ignores ${Math.round(e.magicPen * 100)}% Magic Resist`);
  if (e.shatterCount) parts.push(`${sign(e.shatterCount)}${Math.abs(e.shatterCount)} Shards`);
  if (e.shatterReach) parts.push(`${sign(e.shatterReach)}${Math.abs(e.shatterReach)} Shard Reach`);
  if (e.iceStorm) parts.push(`Slows foes in range ${Math.round(e.iceStorm * 100)}%`);
  if (e.setAoe === 'cone') {
    parts.push(`⟶ Wind Slice${e.coneAngle ? ` (${e.coneAngle}° cone)` : ' (cone)'}`);
  }
  if (e.ability) parts.push(`⟶ ${e.ability} ability`);
  return parts.join(' · ');
}

/** Coarse range label used on compact cards. */
export function rangeLabel(range: number): string {
  return range >= 110 ? 'Long' : range >= 75 ? 'Medium' : 'Short';
}

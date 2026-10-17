/**
 * Static reference data for the editor: the choices the game supports and a
 * descriptor (label, range, help) for every editable field. Forms render from
 * these descriptors and the validator checks against the very same ones, so a
 * field's limits are stated once.
 */

import { SECTIONS, type SectionId } from '@game/domain/levels';
import { MOODS, SECTION_MOODS, type MoodId } from '@game/domain/atmosphere';
import { FLOOR_KINDS, PATH_KINDS, PROP_PALETTE, BASE_PROP_KINDS, propFootprint, type PropKind } from '@game/domain/decor';
import { LIGHTABLE_PROPS } from '@game/domain/mist';
import type { UnitVisual } from '@game/domain/units';

export { SECTIONS, FLOOR_KINDS, PATH_KINDS, PROP_PALETTE, BASE_PROP_KINDS, LIGHTABLE_PROPS, MOODS, SECTION_MOODS };
export type { SectionId, MoodId, PropKind };

export const SECTION_IDS: SectionId[] = SECTIONS.map((s) => s.id);
export const sectionName = (id: SectionId) => SECTIONS.find((s) => s.id === id)?.name ?? id;
export const sectionColor = (id: SectionId) => SECTIONS.find((s) => s.id === id)?.color ?? '#8fa6c8';

export const MOOD_IDS = Object.keys(MOODS) as MoodId[];
export const PROP_KINDS: PropKind[] = PROP_PALETTE.map((p) => p.kind);
export const propLabel = (k: PropKind) => PROP_PALETTE.find((p) => p.kind === k)?.label ?? k;
/** Floor dressing a champion may stand on (no footprint cells). */
export const isFlatProp = (k: PropKind) => propFootprint(k).length === 0;

export const STAGE_ENDINGS = [
  { id: 'getaway', label: 'The Getaway (wagon ride)', help: 'The party piles into the Escape Wagon and rides off. Needs an Escape Wagon prop.' },
  { id: 'sludgeFather', label: 'The Sludge Father (sewers)', help: 'The Sludge Father rises from the cistern and crushes the halted boss. Pair with "Boss halts at" and a Cistern prop.' },
] as const;

// ------------------------------------------------------------- champion shapes

/** Every catalog silhouette the game can draw, with what it fires. */
const SHAPE_INFO: { shape: UnitVisual['shape']; label: string; attack: string }[] = [
  { shape: 'archer', label: 'Archer', attack: 'Homing arrow (projectile, damage on impact)' },
  { shape: 'crossbow', label: 'Crossbow', attack: 'Heavy homing bolt (projectile)' },
  { shape: 'sword', label: 'Swordsman', attack: 'Instant melee slash' },
  { shape: 'spear', label: 'Spearman', attack: 'Instant melee thrust (pairs with Line AoE)' },
  { shape: 'wizard', label: 'Wizard', attack: 'Homing wind bullet (projectile)' },
  { shape: 'elf', label: 'Elf', attack: 'Enchanted arrow; the only shape whose shots bounce' },
  { shape: 'farmer', label: 'Farmer', attack: 'Instant melee slash (usually a generator)' },
  { shape: 'bard', label: 'Bard', attack: 'Instant melee slash (usually a support)' },
  { shape: 'frostWitch', label: 'Frost Witch', attack: 'Instant hit, or an ice missile with Shatter; frozen aura' },
];

/**
 * Shapes a catalog champion may use: every non-hero silhouette in the sprite
 * set (`hasSprite` in engine/sprites.ts; `npm run editor:check` asserts each
 * one draws). The `player-*` shapes need a player portrait: heroes only.
 */
export const CHAMPION_SHAPES = SHAPE_INFO;
export const shapeInfo = (shape: string) => SHAPE_INFO.find((s) => s.shape === shape);

// ---------------------------------------------------------------- descriptors

export type FieldKind = 'number' | 'int' | 'fraction' | 'multiplier';

/** A numeric field: its label, limits and contextual help. */
export interface NumField {
  key: string;
  label: string;
  kind: FieldKind;
  min?: number;
  max?: number;
  /** Strict lower bound (value must be greater than this). */
  above?: number;
  unit?: string;
  step?: number;
  help: string;
}

/** Plain-language range of a field, for error messages and hints. */
export function rangeText(f: NumField): string {
  const lo = f.above != null ? `greater than ${f.above}` : f.min != null ? `at least ${f.min}` : '';
  const hi = f.max != null ? `at most ${f.max}` : '';
  const whole = f.kind === 'int' ? 'a whole number ' : '';
  if (lo && hi) return `${whole}from ${f.above ?? f.min}${f.above != null ? ' (exclusive)' : ''} to ${f.max}`;
  return `${whole}${lo || hi || 'any number'}`.trim();
}

/** Whether `v` satisfies the field's limits. */
export function inRange(f: NumField, v: number): boolean {
  if (!Number.isFinite(v)) return false;
  if (f.kind === 'int' && !Number.isInteger(v)) return false;
  if (f.min != null && v < f.min) return false;
  if (f.above != null && v <= f.above) return false;
  if (f.max != null && v > f.max) return false;
  return true;
}

const pct = { kind: 'fraction' as const, min: 0, max: 1, step: 0.05 };
const secs = { kind: 'number' as const, unit: 's', step: 0.1 };
const px = { kind: 'number' as const, unit: 'px', step: 1 };

// --- levels
export const LEVEL_FIELDS: Record<'baseHealth' | 'startingGold' | 'gem', NumField> = {
  baseHealth: { key: 'baseHealth', label: 'Base health', kind: 'int', min: 1, max: 999, help: 'Lives: each foe that reaches the castle removes its "base damage" from this.' },
  startingGold: { key: 'startingGold', label: 'Starting gold', kind: 'int', min: 0, max: 100000, step: 10, help: 'Gold the stage opens with (the game default is 600). Mastery bonuses like Fresh Food add to it.' },
  gem: { key: 'gem', label: 'Gem reward', kind: 'int', min: 0, max: 100000, step: 10, help: 'Gems paid the first time the stage is cleared.' },
};

export const GROUP_FIELDS: Record<'count' | 'spacing' | 'delay' | 'healthMult', NumField> = {
  count: { key: 'count', label: 'Count', kind: 'int', min: 1, max: 500, help: 'How many of this foe the group spawns.' },
  spacing: { key: 'spacing', label: 'Spacing', ...secs, min: 0, max: 60, help: 'Seconds between spawns within this group (default 0.85).' },
  delay: { key: 'delay', label: 'Delay', ...secs, min: 0, max: 600, help: "Seconds after the previous group's start before this group starts. Groups overlap unless the delay outlasts the previous group." },
  healthMult: { key: 'healthMult', label: 'Health ×', kind: 'multiplier', above: 0, max: 100, step: 0.1, help: 'Multiplies the foe\'s health for this group only (endless-style scaling). Leave empty for ×1.' },
};

// --- enemies
export const ENEMY_STAT_FIELDS: NumField[] = [
  { key: 'health', label: 'Health', kind: 'number', above: 0, max: 1e7, step: 10, help: 'Max (and starting) hit points.' },
  { key: 'speed', label: 'Speed', kind: 'number', min: 0, max: 600, unit: 'px/s', step: 1, help: 'Walking speed along the path. A tile is 48px; a Footman walks 46.' },
  { key: 'reward', label: 'Gold reward', kind: 'int', min: 0, max: 100000, help: 'Gold the player gets when it dies.' },
  { key: 'mana', label: 'Mana on kill', kind: 'int', min: 0, max: 1000, help: 'Mana a hero regains for the killing blow.' },
  { key: 'damageToBase', label: 'Base damage', kind: 'int', min: 0, max: 999, help: 'Lives removed if it reaches the castle.' },
  { key: 'radius', label: 'Radius', ...px, min: 4, max: 64, help: 'Body radius on the board (hit and hover size). Regular foes are 12–18, bosses 20–32.' },
];

export const ENEMY_DEFENCE_FIELDS: NumField[] = [
  { key: 'dodgeChance', label: 'Dodge chance', ...pct, help: 'Chance to evade a hit entirely. 0.2 = one hit in five misses.' },
  { key: 'physicalResist', label: 'Physical resist', ...pct, help: 'Share of physical damage shrugged off. 0.2 = takes 80%.' },
  { key: 'magicResist', label: 'Magic resist', ...pct, help: 'Share of magic damage shrugged off (Rimepiercer ignores part of it).' },
  { key: 'shieldHits', label: 'Shield hits', kind: 'int', min: 0, max: 999, help: 'The first N hits, of any size, are absorbed outright. Many small hits break it fastest.' },
  { key: 'regen', label: 'Regeneration', kind: 'fraction', min: 0, max: 1, step: 0.01, unit: '/s', help: 'Fraction of max health healed per second. 0.04 = 4%/s.' },
  { key: 'lightSlow', label: 'Light slow', kind: 'multiplier', min: 0, max: 2, step: 0.05, help: 'Speed multiplier inside a lit lantern\'s light (the Bloodhound uses 0.4). Leave empty for unaffected.' },
];

/** Structured mechanics an enemy (or boss) can carry. */
export interface MechanicSpec {
  key: 'damageAura' | 'rally' | 'summon' | 'spit' | 'heal';
  label: string;
  help: string;
  fields: NumField[];
  /** Defaults for a freshly added mechanic. */
  defaults: Record<string, number | string>;
  /** A linked enemy id field, if any. */
  enemyRef?: string;
  /** Whether it holds the foe in place while it plays. */
  holds: boolean;
}

const every: NumField = { key: 'every', label: 'Every', ...secs, above: 0, max: 600, help: 'Seconds between uses.' };
const duration: NumField = { key: 'duration', label: 'Hold', ...secs, min: 0, max: 60, help: 'Seconds it stands still while performing.' };
const at: NumField = { key: 'at', label: 'Fires at', ...pct, help: 'How far through the hold (0–1) the effect lands.' };

export const MECHANICS: MechanicSpec[] = [
  {
    key: 'damageAura',
    label: 'Damage aura',
    help: 'Every other foe within the radius takes less damage (The Iron Warden). Does not protect its owner.',
    fields: [
      { key: 'reduction', label: 'Reduction', ...pct, help: 'Share of damage removed from nearby foes.' },
      { key: 'radius', label: 'Radius', ...px, above: 0, max: 800, help: 'Reach of the aura.' },
    ],
    defaults: { reduction: 0.3, radius: 96 },
    holds: false,
  },
  {
    key: 'rally',
    label: 'Rally',
    help: 'Periodically halts and raises a standard: every other living foe gains shield points (Sergeant-at-Arms).',
    fields: [every, duration, { key: 'shield', label: 'Shield given', kind: 'int', min: 1, max: 999, help: 'Shield points each other foe gains.' }, at],
    defaults: { every: 6, duration: 1.8, shield: 3, at: 0.55 },
    holds: true,
  },
  {
    key: 'summon',
    label: 'Summon',
    help: 'Periodically halts and calls more foes, which spawn just behind it on its lane (Hound Master).',
    fields: [{ key: 'count', label: 'Count', kind: 'int', min: 1, max: 50, help: 'Foes per call.' }, every, duration, at],
    defaults: { enemyId: 'cap_runner', count: 3, every: 5, duration: 1, at: 0.55 },
    enemyRef: 'enemyId',
    holds: true,
  },
  {
    key: 'spit',
    label: 'Spit (stun)',
    help: 'Waits for a champion in range, halts, and hurls sludge that stuns the nearest champions (Sludge Father).',
    fields: [
      every,
      { key: 'targets', label: 'Targets', kind: 'int', min: 1, max: 20, help: 'Champions hit per spit.' },
      { key: 'stun', label: 'Stun', ...secs, above: 0, max: 60, help: 'Seconds a hit champion can\'t attack, harvest or cast.' },
      { key: 'range', label: 'Range', ...px, above: 0, max: 1000, help: 'Reach of the spit.' },
      duration,
      at,
    ],
    defaults: { every: 7, targets: 2, stun: 5, range: 300, duration: 1.1, at: 0.55 },
    holds: true,
  },
  {
    key: 'heal',
    label: 'Heal',
    help: 'Once another foe is near, halts and heals every other foe within the radius (Paladin).',
    fields: [
      every,
      duration,
      at,
      { key: 'radius', label: 'Radius', ...px, above: 0, max: 1000, help: 'Reach of the heal.' },
      { key: 'amount', label: 'Amount', ...pct, help: 'Share of each healed foe\'s max health restored.' },
    ],
    defaults: { every: 6, duration: 1.6, at: 0.55, radius: 140, amount: 0.35 },
    holds: true,
  },
];

/** Every field an `EnemyDef` may carry (anything else is unsupported). */
export const ENEMY_KEYS = new Set([
  'id', 'name', 'health', 'speed', 'reward', 'mana', 'damageToBase', 'visual', 'boss', 'radius', 'dodgeChance',
  'physicalResist', 'magicResist', 'damageAura', 'shieldHits', 'regen', 'unkillable', 'entrance', 'rally', 'summon',
  'spit', 'heal', 'lightSlow', 'mechanic', 'lore', 'spawnLines', 'deathAnimation', 'deathLine',
]);

/** Every field a `BossMeta` may carry. */
export const BOSS_KEYS = new Set([
  'level', 'name', 'icon', 'color', 'health', 'speed', 'reward', 'mana', 'damageToBase', 'radius', 'dodgeChance',
  'physicalResist', 'magicResist', 'damageAura', 'shieldHits', 'rally', 'summon', 'spit', 'heal', 'regen', 'lightSlow',
  'unkillable', 'entrance', 'mechanic', 'lore', 'spawnLines', 'deathAnimation', 'deathLine',
]);

// --- champions
export const UNIT_COMBAT_FIELDS: NumField[] = [
  { key: 'damage', label: 'Damage', kind: 'number', min: 0, max: 1e6, step: 1, help: 'Damage per attack (per foe hit).' },
  { key: 'attackSpeed', label: 'Attack speed', kind: 'number', min: 0, max: 50, unit: '/s', step: 0.05, help: 'Attacks per second.' },
  { key: 'range', label: 'Range', ...px, min: 0, max: 1000, help: 'Attack reach. A tile is 48px; the Swordsman reaches 62, the Crossbow 160.' },
];

export const UNIT_COST_FIELDS: NumField[] = [
  { key: 'cost', label: 'Deploy cost', kind: 'int', min: 0, max: 100000, step: 5, help: 'Gold to deploy one.' },
  { key: 'deployLimit', label: 'Deploy limit', kind: 'int', min: 1, max: 50, help: 'How many may be deployed per stage.' },
  { key: 'maxMana', label: 'Max mana', kind: 'int', min: 0, max: 10000, help: 'Mana pool for activated abilities (heroes use 50). Leave empty for none.' },
  { key: 'manaRegen', label: 'Mana regen', kind: 'number', min: 0, max: 1000, unit: '/s', step: 0.1, help: 'Mana regained per second on its own.' },
];

export const UNIT_SHAPE_FIELDS: NumField[] = [
  { key: 'aoeWidth', label: 'Line width', ...px, above: 0, max: 200, help: 'Line AoE: half-thickness of the struck corridor.' },
  { key: 'coneAngle', label: 'Cone angle', kind: 'number', above: 0, max: 360, unit: '°', step: 1, help: 'Cone AoE (also a Wind Slice-style "→ Cone" upgrade): full opening angle. Default 45°.' },
  { key: 'burstRadius', label: 'Blast radius', ...px, above: 0, max: 400, help: 'Circle AoE: radius of the detonation on impact. Default 46.' },
  { key: 'bounces', label: 'Bounces', kind: 'int', min: 0, max: 20, help: 'Extra foes a shot leaps to on impact. Only the Elf shape bounces.' },
  { key: 'burst', label: 'Burst', kind: 'int', min: 1, max: 20, help: 'Shots per attack as a volley. Leave empty for 1.' },
];

export const GENERATOR_FIELDS: NumField[] = [
  { key: 'amount', label: 'Gold per harvest', kind: 'int', min: 1, max: 100000, help: 'Gold produced each harvest.' },
  { key: 'timesPerWave', label: 'Harvests per wave', kind: 'int', min: 1, max: 100, help: 'How many harvests happen during each wave.' },
];

export const BARD_FIELDS: NumField[] = [
  { key: 'every', label: 'Every', ...secs, above: 0, max: 600, help: 'Seconds between performances.' },
  { key: 'targets', label: 'Allies buffed', kind: 'int', min: 1, max: 50, help: 'Random allies in range buffed per performance.' },
  { key: 'attackSpeedMult', label: 'Speed buff ×', kind: 'multiplier', above: 0, max: 10, step: 0.05, help: 'Attack-speed multiplier on a buffed ally (1.2 = +20%).' },
  { key: 'duration', label: 'Buff duration', ...secs, above: 0, max: 600, help: 'Seconds the buff lasts.' },
];

export const SHATTER_FIELDS: NumField[] = [
  { key: 'count', label: 'Shards', kind: 'int', min: 1, max: 40, help: 'Shards the missile bursts into on impact.' },
  { key: 'damageMult', label: 'Shard damage ×', kind: 'multiplier', above: 0, max: 10, step: 0.05, help: 'Each shard\'s damage as a share of the missile\'s.' },
  { key: 'reach', label: 'Shard reach', ...px, above: 0, max: 500, help: 'How far shards fly.' },
];

export const SLOW_FIELDS: NumField[] = [
  { key: 'slow', label: 'Slow', ...pct, help: 'Fraction a hit foe is slowed by.' },
  { key: 'slowDuration', label: 'Slow duration', ...secs, above: 0, max: 60, help: 'Seconds the slow lasts.' },
];

/** In-stage upgrade deltas (additive on top of the previous tier). */
export const UPGRADE_FIELDS: NumField[] = [
  { key: 'damage', label: '+Damage', kind: 'number', min: -1e6, max: 1e6, step: 1, help: 'Added to damage.' },
  { key: 'attackSpeed', label: '+Attack speed', kind: 'number', min: -50, max: 50, step: 0.05, unit: '/s', help: 'Added to attacks per second (may be negative as a trade-off).' },
  { key: 'range', label: '+Range', kind: 'number', min: -1000, max: 1000, step: 1, unit: 'px', help: 'Added to range.' },
  { key: 'generate', label: '+Gold/harvest', kind: 'int', min: -100000, max: 100000, help: 'Generators: added to gold per harvest.' },
  { key: 'bounces', label: '+Bounces', kind: 'int', min: -20, max: 20, help: 'Elf shape: extra leaps per shot.' },
  { key: 'bardTargets', label: '+Allies buffed', kind: 'int', min: -50, max: 50, help: 'Bards: extra allies per performance.' },
  { key: 'bardSpeedBonus', label: '+Speed buff', kind: 'number', min: -10, max: 10, step: 0.05, help: 'Bards: added to the buff multiplier (0.15 turns 1.2× into 1.35×).' },
  { key: 'magicPen', label: 'Magic pen', ...pct, help: 'Share of a foe\'s magic resist ignored.' },
  { key: 'shatterCount', label: '+Shards', kind: 'int', min: -40, max: 40, help: 'Shatter: extra shards.' },
  { key: 'shatterReach', label: '+Shard reach', kind: 'number', min: -500, max: 500, step: 1, unit: 'px', help: 'Shatter: extra shard reach.' },
  { key: 'iceStorm', label: 'Ice Storm slow', ...pct, help: 'Every foe in range is slowed by this fraction.' },
];

export const UNIT_KEYS = new Set([
  'id', 'name', 'description', 'rarity', 'damage', 'attackSpeed', 'range', 'targeting', 'aoe', 'attackType', 'damageType',
  'aoeWidth', 'bounces', 'coneAngle', 'burstRadius', 'burst', 'shatter', 'cost', 'deployLimit', 'maxMana', 'manaRegen',
  'upgrades', 'generator', 'bard', 'visual', 'special',
]);
export const UPGRADE_KEYS = new Set([
  'name', 'description', 'cost', 'damage', 'attackSpeed', 'range', 'generate', 'bounces', 'setAoe', 'bardTargets',
  'bardSpeedBonus', 'magicPen', 'shatterCount', 'shatterReach', 'iceStorm', 'choices', 'ability',
]);

export const RARITY_CHOICES = ['common', 'rare', 'epic', 'legendary'] as const;
export const TARGETING_CHOICES = ['first', 'last', 'closest', 'strongest'] as const;
export const AOE_CHOICES = [
  { id: 'single', label: 'Single target' },
  { id: 'line', label: 'Line (pierces a rank)' },
  { id: 'cone', label: 'Cone (sweeping arc)' },
  { id: 'circle', label: 'Circle (blast on impact)' },
] as const;

/** Ability ids the engine knows how to cast (`GameEngine.activateAbility`). */
export const KNOWN_ABILITY_IDS = new Set([
  'cyclone-slash', 'quickdraw', 'piercing-shot', 'mana-ray', 'mana-storm', 'earthsplitter',
]);

// --- mastery
export interface EffectField extends Omit<NumField, 'kind'> {
  kind: FieldKind | 'bool' | 'form' | 'discount';
  group: EffectGroup;
  /** Which champions it does anything for (else a compatibility warning). */
  appliesTo?: 'generator' | 'bard' | 'bounce' | 'burst' | 'circle' | 'hero' | 'blade' | 'combat' | 'chill' | 'shatter';
}

export type EffectGroup = 'stats' | 'crit' | 'economy' | 'aura' | 'pattern' | 'bard' | 'hero';

export const EFFECT_GROUPS: { id: EffectGroup; label: string; help: string }[] = [
  { id: 'stats', label: 'Core stats', help: 'Multipliers on damage, attack speed and range (1.1 = +10%). Several nodes multiply together.' },
  { id: 'crit', label: 'Critical hits', help: 'Base crit is 5% for 1.5× damage.' },
  { id: 'economy', label: 'Economy', help: 'Gold yields, starting gold and in-stage upgrade discounts.' },
  { id: 'aura', label: 'Board auras', help: 'Position-based effects recomputed as champions are placed and sold.' },
  { id: 'pattern', label: 'Attack patterns', help: 'Special attacks: throws, preloaded shots, knockback and bounce tuning.' },
  { id: 'bard', label: 'Bard tune', help: 'Bonuses to a Bard\'s performance.' },
  { id: 'hero', label: 'Hero', help: 'Effects only the player\'s hero champions use.' },
];

export const EFFECT_FIELDS: EffectField[] = [
  { key: 'damageMult', label: 'Damage ×', kind: 'multiplier', above: 0, max: 20, step: 0.05, group: 'stats', appliesTo: 'combat', help: 'Multiplies damage.' },
  { key: 'attackSpeedMult', label: 'Attack speed ×', kind: 'multiplier', above: 0, max: 20, step: 0.05, group: 'stats', appliesTo: 'combat', help: 'Multiplies attack speed.' },
  { key: 'rangeMult', label: 'Range ×', kind: 'multiplier', above: 0, max: 20, step: 0.05, group: 'stats', help: 'Multiplies range.' },
  { key: 'critChanceBonus', label: '+Crit chance', kind: 'fraction', min: 0, max: 1, step: 0.025, group: 'crit', appliesTo: 'combat', help: 'Added to crit chance (0.075 = +7.5 points).' },
  { key: 'critMultiplier', label: 'Crit damage ×', kind: 'multiplier', min: 1, max: 20, step: 0.1, group: 'crit', appliesTo: 'combat', help: 'Replaces the 1.5× crit multiplier (highest wins).' },
  { key: 'generateMult', label: 'Harvest ×', kind: 'multiplier', above: 0, max: 20, step: 0.05, group: 'economy', appliesTo: 'generator', help: 'Multiplies gold per harvest.' },
  { key: 'startingGoldBonus', label: '+Starting gold', kind: 'int', min: 0, max: 100000, step: 10, group: 'economy', help: 'Passive team bonus: applies while the champion is on the team, deployed or not.' },
  { key: 'upgradeDiscount', label: 'Upgrade discount', kind: 'discount', group: 'economy', help: 'Gold off one in-stage upgrade tier (1-based tier).' },
  { key: 'adjacentDamageMult', label: '+Damage per neighbour', kind: 'fraction', min: 0, max: 5, step: 0.05, group: 'aura', appliesTo: 'combat', help: 'Per allied champion of the same type in the 8 surrounding tiles (0.15 = +15% each).' },
  { key: 'rangeAuraMult', label: 'Range aura ×', kind: 'multiplier', min: 1, max: 5, step: 0.05, group: 'aura', help: 'Ranged allies within its range gain this range multiplier (does not stack).' },
  { key: 'throwEvery', label: 'Throw every', kind: 'int', min: 2, max: 50, group: 'pattern', appliesTo: 'combat', help: 'Every Nth attack is a throw reaching "Throw range ×" as far.' },
  { key: 'throwRangeMult', label: 'Throw range ×', kind: 'multiplier', above: 0, max: 10, step: 0.1, group: 'pattern', appliesTo: 'combat', help: 'Reach of the throw attack.' },
  { key: 'preloadShots', label: 'Preload shots', kind: 'int', min: 1, max: 20, group: 'pattern', appliesTo: 'combat', help: 'Spare shots cranked up while idle and loosed in quick succession.' },
  { key: 'knockback', label: 'Knockback', kind: 'number', min: 0, max: 500, unit: 'px', step: 1, group: 'pattern', appliesTo: 'combat', help: 'Each hit shoves the foe back along its path.' },
  { key: 'bounceDamageMult', label: 'Bounce damage ×', kind: 'fraction', above: 0, max: 5, step: 0.05, group: 'pattern', appliesTo: 'bounce', help: 'Damage share of each normal leap (highest wins).' },
  { key: 'finalBounceDamageMult', label: 'Final leap damage ×', kind: 'fraction', above: 0, max: 5, step: 0.05, group: 'pattern', appliesTo: 'bounce', help: 'Appends one last leap at this damage share.' },
  { key: 'chillSlow', label: 'Slow override', kind: 'fraction', above: 0, max: 1, step: 0.05, group: 'pattern', appliesTo: 'chill', help: 'Replaces the slow fraction its hits lay (highest wins).' },
  { key: 'chillDurationBonus', label: '+Slow duration', kind: 'number', min: 0, max: 60, unit: 's', step: 0.5, group: 'pattern', appliesTo: 'chill', help: 'Extra seconds its slow lasts.' },
  { key: 'noChill', label: 'No slow', kind: 'bool', group: 'pattern', appliesTo: 'chill', help: 'Its hits no longer slow (Ice Storm still does).' },
  { key: 'brittleMult', label: 'Brittle damage ×', kind: 'multiplier', min: 1, max: 10, step: 0.05, group: 'pattern', appliesTo: 'combat', help: 'Its hits on a slowed foe make it Brittle: it takes this much damage from everyone.' },
  { key: 'brittleDuration', label: 'Brittle duration', kind: 'number', above: 0, max: 60, unit: 's', step: 0.5, group: 'pattern', appliesTo: 'combat', help: 'Seconds Brittle lasts; refreshed by its hits.' },
  { key: 'shardDamageMult', label: 'Shard damage ×', kind: 'fraction', above: 0, max: 5, step: 0.05, group: 'pattern', appliesTo: 'shatter', help: 'Replaces each shard\'s damage share of the missile (highest wins).' },
  { key: 'shardSplitMult', label: 'Splinter damage ×', kind: 'fraction', above: 0, max: 5, step: 0.05, group: 'pattern', appliesTo: 'shatter', help: 'A shard that kills bursts into splinters dealing this share of its damage.' },
  { key: 'bardSpeedBonus', label: '+Tune speed', kind: 'number', min: 0, max: 10, step: 0.05, group: 'bard', appliesTo: 'bard', help: 'Added to the buff multiplier.' },
  { key: 'bardDurationBonus', label: '+Tune duration', kind: 'number', min: 0, max: 600, unit: 's', step: 0.5, group: 'bard', appliesTo: 'bard', help: 'Extra seconds the tune lasts.' },
  { key: 'heroExpMult', label: 'In-stage EXP ×', kind: 'multiplier', above: 0, max: 20, step: 0.05, group: 'hero', appliesTo: 'hero', help: 'Multiplies the wave-clear EXP a hero levels up with.' },
  { key: 'unlocksArmor', label: 'Unlocks armor', kind: 'bool', group: 'hero', appliesTo: 'hero', help: 'Until a node with this is learned, armor neither drops nor applies.' },
  { key: 'crossSlashEvery', label: 'Cross Slash every', kind: 'int', min: 2, max: 50, group: 'hero', appliesTo: 'blade', help: 'Blade hero: every Nth attack is one X cut.' },
  { key: 'crossSlashMult', label: 'Cross Slash ×', kind: 'multiplier', above: 0, max: 20, step: 0.1, group: 'hero', appliesTo: 'blade', help: 'Damage multiplier of the X cut.' },
  { key: 'burstShots', label: 'Volley size', kind: 'int', min: 2, max: 20, group: 'hero', appliesTo: 'burst', help: 'Overrides arrows per volley for a burst shooter.' },
  { key: 'burstRadiusMult', label: 'Blast radius ×', kind: 'multiplier', above: 0, max: 10, step: 0.05, group: 'hero', appliesTo: 'circle', help: 'Widens a circle attack\'s blast.' },
  { key: 'greaterOrb', label: 'Greater Orb', kind: 'bool', group: 'hero', appliesTo: 'circle', help: 'Magic hero: the orb becomes a leaping, thrown Greater Orb.' },
  { key: 'weaponForm', label: 'Weapon form', kind: 'form', group: 'hero', appliesTo: 'hero', help: 'Re-arms the hero (Claymore for the Blade, Longbow for the Bow, Staff for Magic).' },
];

export const MASTERY_KEYS = new Set([
  'id', 'name', 'description', 'cost', 'requires', 'major', 'exclusiveGroup', ...EFFECT_FIELDS.map((f) => f.key),
]);

/** The hero path each weapon form belongs to. */
export const FORM_OWNER: Record<string, string> = {
  claymore: 'player-blade',
  longbow: 'player-bow',
  staff: 'player-magic',
};

export const LEVEL_KEYS = new Set([
  'id', 'section', 'name', 'subtitle', 'baseHealth', 'gem', 'startingGold', 'color', 'bossId', 'lanes', 'theme', 'decor',
  'mood', 'ending', 'bossHaltAt', 'victoryLine', 'mist', 'archived',
]);
export const LANE_KEYS = new Set(['path', 'waves', 'revealAtWave', 'emerge']);
export const GROUP_KEYS = new Set(['enemyId', 'count', 'spacing', 'delay', 'healthMult']);

/** A slug-style id: lowercase letters, digits, `_` and `-`, starting with a letter. */
export const ID_PATTERN = /^[a-z][a-z0-9_-]*$/i;
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Data-driven enemy catalog.
 *
 * All enemy stats live here for easy balancing. Enemies are grouped by story
 * section (Castle / Forest / Inn) so each section fields thematically distinct,
 * progressively tougher foes. Each of the 15 levels also has its own boss,
 * generated from `BOSS_META` with an escalating stat curve — though any boss may
 * override individual stats (health, speed, reward, damageToBase, radius) to be
 * hand-tuned like a regular unit.
 *
 * New enemy types are added by appending entries — the engine reads these
 * generically and never hardcodes an enemy.
 */

export interface EnemyDef {
  id: string;
  name: string;
  /** Max hit points (also the starting health). */
  health: number;
  /** Movement speed along the path, in pixels/second. */
  speed: number;
  /** Currency granted to the player when this enemy dies. */
  reward: number;
  /**
   * Mana a hero champion recovers when it lands the killing blow on this enemy.
   * Hero abilities are paid for in mana, and killing enemies is the only way to
   * refill it (see `Tower.mana`). Omitted / 0 means killing it grants no mana.
   */
  mana?: number;
  /** Base health removed when this enemy reaches the base. */
  damageToBase: number;
  /** Simple vector visual descriptor. */
  visual: EnemyVisual;
  /** Marks bosses for special handling (health bar, banner, win condition). */
  boss: boolean;
  /** Board radius in pixels (bosses are larger). */
  radius: number;
  /**
   * Chance in [0,1] to evade an incoming hit entirely, avoiding all of its
   * damage (e.g. Garrick Vane, the nimble veteran, slips 15% of blows). Omitted
   * or 0 means the enemy never dodges. Rolled per hit at the damage choke point.
   */
  dodgeChance?: number;
  /**
   * Fraction in [0,1] of *physical* damage this enemy shrugs off — e.g. 0.4
   * means physical hits deal only 60% of their damage. Applied at the damage
   * choke point by the attacker's `damageType` (see `damageType` on `UnitDef`).
   * Omitted or 0 means no physical resistance. Add to any enemy to armour it.
   */
  physicalResist?: number;
  /**
   * Fraction in [0,1] of *magic* damage this enemy shrugs off, mirroring
   * `physicalResist`. Omitted or 0 means no magic resistance.
   */
  magicResist?: number;
  /**
   * A protective aura: every *other* enemy within `radius` px of this one takes
   * `reduction` (0-1) less damage — e.g. The Iron Warden shields nearby foes for
   * 30%. Does not protect the aura's owner. Omitted when the enemy emits none.
   * Applied by the engine at the damage choke point; recomputed as enemies move.
   */
  damageAura?: { reduction: number; radius: number };
  /**
   * Short description of a special mechanic (mainly for bosses) shown in the
   * Enemy Index detail. Omitted when the enemy has no notable mechanic.
   */
  mechanic?: string;
  /**
   * Flavour text shown in the Enemy Index detail. Optional — entries without
   * lore yet show a placeholder. (Authored later; none is written for now.)
   */
  lore?: string;
  /**
   * Intro lines this enemy delivers on spawn, one after another, before it starts
   * moving. While speaking it stays put at the lane start and can't be hit (the
   * engine freezes it and the damage choke point ignores it, mirroring the boss
   * throne-rise). Omitted for enemies that spawn silently.
   */
  spawnLines?: string[];
  /**
   * A special death sequence played instead of the instant pop. When set, a
   * lethal hit starts the animation (the enemy lingers, frozen and untargetable)
   * and victory is withheld until it finishes. `'shadowSwallow'` — the enemy
   * slumps to the ground and is drawn down into its own shadow (Gowzer). Omitted
   * for enemies that die instantly.
   */
  deathAnimation?: DeathAnimation;
  /**
   * A final line spoken during the death animation (floats above the enemy as it
   * falls, fading as it's swallowed). Only meaningful alongside `deathAnimation`.
   */
  deathLine?: string;
}

/** Named special death sequences (see `EnemyDef.deathAnimation`). */
export type DeathAnimation = 'shadowSwallow';

/** Kills of a normal enemy required before its Enemy Index entry unlocks. */
export const ENEMY_KILLS_TO_UNLOCK = 100;

/**
 * Damage multiplier (in [0,1]) an enemy's resistances apply to one hit of the
 * given damage type. `undefined` damage type (e.g. sourceless/support hits) is
 * never resisted. This is the single place resistances turn into a multiplier —
 * the engine calls it at the damage choke point.
 */
export function resistMultiplier(def: EnemyDef, damageType?: 'physical' | 'magic'): number {
  const resist =
    damageType === 'physical'
      ? def.physicalResist
      : damageType === 'magic'
        ? def.magicResist
        : 0;
  // Clamp defensively so authored data can't heal the enemy or invert damage.
  return 1 - Math.min(1, Math.max(0, resist ?? 0));
}

export interface EnemyVisual {
  color: string;
  icon: string;
}

// --- Regular enemies, three archetypes per section --------------------------
// Archetypes: grunt (balanced), runner (fast), brute (slow/tanky).
// Stats scale up section by section so later realms hit harder.
const REGULAR: Record<string, EnemyDef> = {
  // Castle — disciplined rebels and siege beasts.
  cas_grunt: { id: 'cas_grunt', name: 'Footman', health: 60, speed: 46, reward: 2, mana: 1, damageToBase: 1, visual: { color: '#b3bccb', icon: '🛡️' }, boss: false, radius: 13 },
  cas_grunt2: { id: 'cas_grunt2', name: 'Sergeant', health: 140, speed: 42, reward: 5, mana: 2, damageToBase: 2, visual: { color: '#9aa6be', icon: '🛡️' }, boss: false, radius: 14, physicalResist: 0.2 },
  cas_grunt3: { id: 'cas_grunt3', name: 'Man-at-Arms', health: 185, speed: 46, reward: 6, mana: 2, damageToBase: 2, visual: { color: '#7d8697', icon: '🛡️' }, boss: false, radius: 14, physicalResist: 0.2 },
  cas_runner: { id: 'cas_runner', name: 'Outrider', health: 65, speed: 94, reward: 3, mana: 2, damageToBase: 1, visual: { color: '#d7a94a', icon: '🐎' }, boss: false, radius: 14 },
  cas_mage: { id: 'cas_mage', name: 'Royal Wizard', health: 110, speed: 50, reward: 4, mana: 2, damageToBase: 1, visual: { color: '#530a69', icon: '🧙' }, boss: false, radius: 12, magicResist: 0.2 },
  cas_brute: { id: 'cas_brute', name: 'Siege Ram', health: 245, speed: 30, reward: 8, mana: 3, damageToBase: 3, visual: { color: '#8a93a8', icon: '🐏' }, boss: false, radius: 17, physicalResist: 0.2 },

  // Forest — wild beasts and ancient growth.
  for_grunt: { id: 'for_grunt', name: 'Goblin Forager', health: 96, speed: 48, reward: 6, mana: 6, damageToBase: 1, visual: { color: '#7bb86f', icon: '👺' }, boss: false, radius: 13 },
  for_runner: { id: 'for_runner', name: 'Dire Wolf', health: 66, speed: 100, reward: 8, mana: 6, damageToBase: 1, visual: { color: '#a7b3c2', icon: '🐺' }, boss: false, radius: 12 },
  for_brute: { id: 'for_brute', name: 'Elder Treant', health: 380, speed: 27, reward: 18, mana: 14, damageToBase: 2, visual: { color: '#6a9a5a', icon: '🌲' }, boss: false, radius: 18 },

  // Inn — rowdy patrons and cellar horrors.
  inn_grunt: { id: 'inn_grunt', name: 'Cellar Rat', health: 112, speed: 50, reward: 6, mana: 7, damageToBase: 1, visual: { color: '#9a86c4', icon: '🐀' }, boss: false, radius: 13 },
  inn_runner: { id: 'inn_runner', name: 'Drunken Brawler', health: 80, speed: 104, reward: 8, mana: 7, damageToBase: 1, visual: { color: '#e0a040', icon: '🍺' }, boss: false, radius: 13 },
  inn_brute: { id: 'inn_brute', name: 'Cask Golem', health: 410, speed: 28, reward: 18, mana: 14, damageToBase: 2, visual: { color: '#8a6a4a', icon: '🛢️' }, boss: false, radius: 18 },
};

// --- Bosses, one per level (15 total) ---------------------------------------
/**
 * A boss's authored data. `name`/`icon`/`color` are required; every stat is
 * optional and, when omitted, falls back to the escalating default curve in
 * `buildBosses` (keyed by the boss's position in this list). Give any stat an
 * explicit value to hand-tune that boss like a regular unit — e.g. a slow,
 * tanky wall or a fast, fragile rush boss — instead of the calculated value.
 */
interface BossMeta {
  name: string;
  icon: string;
  color: string;
  /** Max hit points (default: escalating curve). */
  health?: number;
  /** Movement speed in px/sec (default: 28 + a small per-tier wobble). */
  speed?: number;
  /** Currency dropped on death (default: escalating curve). */
  reward?: number;
  /** Mana a hero recovers for the kill (default: 30). See `EnemyDef.mana`. */
  mana?: number;
  /** Base health removed if it reaches the base (default: 4 + tier/3). */
  damageToBase?: number;
  /** Board radius in px (default: grows with tier, capped at 32). */
  radius?: number;
  /** Chance in [0,1] to evade an incoming hit (default: none). See `EnemyDef`. */
  dodgeChance?: number;
  /** Fraction in [0,1] of physical damage shrugged off (default: none). */
  physicalResist?: number;
  /** Fraction in [0,1] of magic damage shrugged off (default: none). */
  magicResist?: number;
  /** Protective aura shielding nearby enemies (see `EnemyDef.damageAura`). */
  damageAura?: { reduction: number; radius: number };
  /** Short description of a special mechanic, shown in the Enemy Index. */
  mechanic?: string;
  /** Flavour text for the Enemy Index (authored later). */
  lore?: string;
  /** Intro lines delivered on spawn before moving (see `EnemyDef.spawnLines`). */
  spawnLines?: string[];
  /** Special death sequence played on defeat (see `EnemyDef.deathAnimation`). */
  deathAnimation?: DeathAnimation;
  /** Final line spoken during the death animation (see `EnemyDef.deathLine`). */
  deathLine?: string;
}

// Ordered by global level (1..15): Castle 1-5, Forest 6-10, Inn 11-15. Any stat
// field may be added to an entry to override its calculated default.
const BOSS_META: BossMeta[] = [
  { name: 'Captain Aldric', icon: '🗡️', color: '#c3ccdc', health: 400, speed: 40, radius: 25 },
  { name: 'Garrick Vane', icon: '🔪', color: '#8a94a8', health: 600, speed: 60, radius: 20, dodgeChance: 0.20, mechanic: 'Evasive — sidesteps a quarter of all incoming hits, taking no damage from them.' },
  { name: 'The Iron Warden', icon: '🛡️', color: '#c05a6a', health: 350, speed: 30, radius: 30, physicalResist: 0.4, damageAura: { reduction: 0.3, radius: 96 }, mechanic: 'Aegis aura — every other enemy near the Warden takes 30% less damage.' },
  {
    name: 'Gowzer, the Night Falcon', icon: '🦅', color: '#1b031a', health: 700, speed: 44, radius: 20, magicResist: 0.2,
    spawnLines: ['The king still has his use.', 'You shall not get past this point.'],
    deathAnimation: 'shadowSwallow',
    deathLine: 'It does not end here...',
  },
  { name: 'King Kael', icon: '👑', color: '#e0574a', health: 900, speed: 20, radius: 30, mechanic: 'Rises from his throne as the final wave begins.' },
  // Forest
  { name: 'Thornmaw the Ancient', icon: '🌳', color: '#6a9a5a' },
  { name: 'Vexia, the Spider Queen', icon: '🕷️', color: '#8a6ac4' },
  { name: 'Grimfang Alpha', icon: '🐺', color: '#9aa0b0' },
  { name: 'The Verdant Horror', icon: '🍄', color: '#7ac06a' },
  { name: 'Oakheart the Wrathful', icon: '🌲', color: '#4f8a44' },
  // Inn
  { name: 'Barkeep Bramwell', icon: '🍺', color: '#e0a040' },
  { name: 'The Cellar Dweller', icon: '🕸️', color: '#7a6a9a' },
  { name: 'Madame Hex', icon: '🔮', color: '#b455ff' },
  { name: 'The Tavern Wraith', icon: '👻', color: '#a7c4d4' },
  { name: "Gorehollow, the Innkeeper's Bane", icon: '💀', color: '#ff6a3d' },
];

function buildBosses(): Record<string, EnemyDef> {
  const out: Record<string, EnemyDef> = {};
  BOSS_META.forEach((m, i) => {
    const tier = i + 1; // 1..15
    // Calculated defaults; any field the boss meta specifies overrides these.
    out[`boss${tier}`] = {
      id: `boss${tier}`,
      name: m.name,
      health: m.health ?? Math.round(650 * Math.pow(1.135, i)),
      speed: m.speed ?? 28 + (i % 4) * 2,
      reward: m.reward ?? Math.round(30 * Math.pow(1.12, i)),
      mana: m.mana ?? 20,
      damageToBase: m.damageToBase ?? 4 + Math.floor(i / 3),
      visual: { color: m.color, icon: m.icon },
      boss: true,
      radius: m.radius ?? Math.min(32, 23 + Math.floor(i / 3)),
      dodgeChance: m.dodgeChance,
      physicalResist: m.physicalResist,
      magicResist: m.magicResist,
      damageAura: m.damageAura,
      mechanic: m.mechanic,
      lore: m.lore,
      spawnLines: m.spawnLines,
      deathAnimation: m.deathAnimation,
      deathLine: m.deathLine,
    };
  });
  return out;
}

export const ENEMIES: Record<string, EnemyDef> = {
  ...REGULAR,
  ...buildBosses(),
};

export function getEnemy(id: string): EnemyDef {
  const def = ENEMIES[id];
  if (!def) throw new Error(`Unknown enemy id: ${id}`);
  return def;
}

/** Boss enemy id for a given global level (1..15). */
export function bossIdForLevel(levelId: number): string {
  return `boss${levelId}`;
}

/** Every normal (non-boss) enemy, in catalog order — for the Enemy Index. */
export const REGULAR_ENEMIES: EnemyDef[] = Object.values(REGULAR);

/** Every boss, ordered by level (boss1..boss15) — for the Enemy Index. */
export const BOSS_ENEMIES: EnemyDef[] = BOSS_META.map((_, i) => ENEMIES[`boss${i + 1}`]);

/** Whether an enemy has any physical or magic resistance worth showing. */
export function hasResistance(def: EnemyDef): boolean {
  return (def.physicalResist ?? 0) > 0 || (def.magicResist ?? 0) > 0;
}

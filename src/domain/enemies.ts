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
   * Shield hits: the first `shieldHits` hits this enemy takes are absorbed
   * outright (no damage, whatever their size), one shield point per hit; only
   * once the shield is broken does damage reach its health. Every hit counts the
   * same, so many small hits break it fastest. Tracked per enemy in
   * `Enemy.shield`; omitted or 0 means unshielded.
   */
  shieldHits?: number;
  /**
   * Regeneration (the Sludge Brute): heals this fraction of its max health per
   * second, e.g. 0.02 = 2%/s. Ticked continuously every frame (not once a
   * second), so the health bar refills smoothly. Never above max health.
   * Omitted or 0 means no regeneration.
   */
  regen?: number;
  /**
   * Can't die (Captain Draven, who is never meant to fall to the player): hits
   * land as usual, but at the damage choke point its health never drops below
   * 1. Such a boss is ended by its stage instead (see `LevelDef.bossHaltAt`).
   * Omitted for mortals.
   */
  unkillable?: boolean;
  /**
   * Rally (the Sergeant-at-Arms): every `every` seconds this enemy halts for
   * `duration` seconds and raises its standard; `at` (0-1) of the way in, every
   * *other* living enemy on the board gains `shield` shield points (see
   * `shieldHits`), stacking on whatever shield it has. Omitted for enemies that
   * never rally.
   */
  rally?: RallyDef;
  /**
   * Summon (the Hound Master): every `every` seconds this enemy halts for
   * `duration` seconds to sound a call (his whistle); `at` (0-1) of the way in, `count`
   * foes of `enemyId` burst out beside it on its lane and run on ahead.
   * Omitted for enemies that never summon.
   */
  summon?: SummonDef;
  /**
   * Light-shy (the Bloodhound): while it is inside a lit lantern's light (see
   * `domain/mist.ts`) its speed is multiplied by this, blended in and out over
   * a moment as it loses and finds the scent (`Enemy.cower`). Omitted for foes
   * the light doesn't touch.
   */
  lightSlow?: number;
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

/** A periodic rally that shields the rest of the field (see `EnemyDef.rally`). */
/** A periodic summon (see `EnemyDef.summon`). */
export interface SummonDef {
  enemyId: string;
  count: number;
  every: number;
  duration: number;
  at: number;
}

export interface RallyDef {
  every: number;
  duration: number;
  shield: number;
  at: number;
}

/** Named special death sequences (see `EnemyDef.deathAnimation`). */
export type DeathAnimation = 'shadowSwallow';

/** Kills of a normal enemy required before its Enemy Index entry unlocks. */
export const ENEMY_KILLS_TO_UNLOCK = 1;

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
const REGULAR: Record<string, EnemyDef> = {
  // Castle
  cas_grunt: { id: 'cas_grunt', name: 'Footman', health: 60, speed: 46, reward: 2, mana: 1, damageToBase: 1, visual: { color: '#b3bccb', icon: '🛡️' }, boss: false, radius: 13 },
  cas_grunt2: { id: 'cas_grunt2', name: 'Sergeant', health: 140, speed: 42, reward: 5, mana: 2, damageToBase: 1, visual: { color: '#9aa6be', icon: '🛡️' }, boss: false, radius: 14, physicalResist: 0.2 },
  cas_runner: { id: 'cas_runner', name: 'Outrider', health: 65, speed: 94, reward: 3, mana: 2, damageToBase: 1, visual: { color: '#d7a94a', icon: '🐎' }, boss: false, radius: 14 },
  cas_mage: { id: 'cas_mage', name: 'Royal Wizard', health: 110, speed: 50, reward: 4, mana: 2, damageToBase: 1, visual: { color: '#530a69', icon: '🧙' }, boss: false, radius: 12, magicResist: 0.2 },
  cas_brute: { id: 'cas_brute', name: 'Siege Ram', health: 245, speed: 30, reward: 8, mana: 3, damageToBase: 3, visual: { color: '#8a93a8', icon: '🐏' }, boss: false, radius: 17, physicalResist: 0.2 },

  // Capital
  cap_grunt: { id: 'cap_grunt', name: 'Man-at-Arms', health: 185, speed: 40, reward: 6, mana: 3, damageToBase: 2, visual: { color: '#a3adbb', icon: '🛡️' }, boss: false, radius: 14, physicalResist: 0.2, shieldHits: 5, mechanic: 'His shield turns aside the first 5 hits completely, only once it breaks does he take damage.' },
  cap_grunt2: { id: 'cap_grunt2', name: 'Sludgeborn', health: 280, speed: 38, reward: 8, mana: 3, damageToBase: 2, visual: { color: '#6f9a2e', icon: '🫠' }, boss: false, radius: 15, regen: 0.04, mechanic: 'Its sludge knits back together regenerating health every moment its alive.' },
  cap_brute: { id: 'cap_brute', name: 'Sludge Behemoth', health: 860, speed: 26, reward: 12, mana: 5, damageToBase: 3, visual: { color: '#56742a', icon: '👹' }, boss: false, radius: 18, regen: 0.03, mechanic: 'Its sludge knits back together regenerating health every moment its alive.' },
  cap_runner: { id: 'cap_runner', name: 'Bloodhound', health: 115, speed: 120, reward: 3, mana: 2, damageToBase: 1, visual: { color: '#2e2624', icon: '🐕' }, boss: false, radius: 13, lightSlow: 0.4, mechanic: 'Runs you down fast in the mist, a lit lantern\'s burning smell makes it lose your scent and slows down.' },

  // Forest
  for_grunt: { id: 'for_grunt', name: 'Goblin Forager', health: 96, speed: 48, reward: 6, mana: 6, damageToBase: 1, visual: { color: '#7bb86f', icon: '👺' }, boss: false, radius: 13 },
  for_runner: { id: 'for_runner', name: 'Dire Wolf', health: 66, speed: 100, reward: 8, mana: 6, damageToBase: 1, visual: { color: '#a7b3c2', icon: '🐺' }, boss: false, radius: 12 },
  for_brute: { id: 'for_brute', name: 'Elder Treant', health: 380, speed: 27, reward: 18, mana: 14, damageToBase: 2, visual: { color: '#6a9a5a', icon: '🌲' }, boss: false, radius: 18 },

  // Inn
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
  /** Global level this boss belongs to (1..15). Its enemy id is `boss<level>`. */
  level: number;
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
  /** Hits absorbed outright before damage lands (see `EnemyDef.shieldHits`). */
  shieldHits?: number;
  /** Periodic rally shielding the other foes (see `EnemyDef.rally`). */
  rally?: RallyDef;
  /** Periodic summon of more foes beside it (see `EnemyDef.summon`). */
  summon?: SummonDef;
  /** Never drops below 1 HP (see `EnemyDef.unkillable`). */
  unkillable?: boolean;
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

// Ordered by global level. Any stat
// field may be added to an entry to override its calculated default.
const BOSS_META: BossMeta[] = [
  { level: 1, name: 'Captain Aldric', icon: '🗡️', color: '#c3ccdc', health: 400, speed: 40, radius: 25 },
  { level: 2, name: 'Garrick Vane', icon: '🔪', color: '#8a94a8', health: 600, speed: 60, radius: 20, dodgeChance: 0.20, mechanic: 'Sidesteps a fifth of all incoming hits, taking no damage from them.' },
  { level: 3, name: 'The Iron Warden', icon: '🛡️', color: '#c05a6a', health: 350, speed: 30, radius: 30, physicalResist: 0.4, damageAura: { reduction: 0.3, radius: 96 }, mechanic: 'Every other enemy near the Warden takes 30% less damage.' },
  {
    level: 4,
    name: 'Gowzer, the Night Falcon', icon: '🦅', color: '#1b031a', health: 700, speed: 44, radius: 20, magicResist: 0.2,
    spawnLines: ['The king still has his use.', 'You shall not get past this point.'],
    deathAnimation: 'shadowSwallow',
    deathLine: 'It does not end here...',
  },
  { level: 5, name: 'King Kael', icon: '👑', color: '#e0574a', health: 900, speed: 20, radius: 30, mechanic: 'Rises from his throne as the final wave begins.' },
  // Capital
  { level: 6, name: 'Captain Roland', icon: '🗡️', color: '#c2d3f0', health: 650, speed: 90, radius: 28 },
  {
    level: 7, name: 'Sergeant-at-Arms', icon: '🚩', color: '#b9c3d1', health: 800, speed: 36, radius: 26, physicalResist: 0.2,
    shieldHits: 15,
    rally: { every: 6, duration: 1.8, shield: 3, at: 0.55 },
    mechanic: 'His shield turns aside the first 15 hits. Every few seconds he raises the royal standard, giving every other foe on the board 2 shield points.',
  },
  {
    level: 8, name: 'Hound Master', icon: '🐾', color: '#5e5852', health: 1200, speed: 32, radius: 26,
    summon: { enemyId: 'cap_runner', count: 3, every: 5, duration: 1, at: 0.55 },
    mechanic: 'Every 5 seconds he blows his whistle, and Bloodhounds burst out at his side.',
  },
  {
    // The Sewers: he is never meant to fall to the player.
    level: 9, name: 'Captain Draven', icon: '🏳️', color: '#c9d4e4', health: 10000, speed: 45, radius: 26, unkillable: true,
  },

];

function buildBosses(): Record<string, EnemyDef> {
  const out: Record<string, EnemyDef> = {};
  BOSS_META.forEach((m, i) => {
    const tier = m.level; // global level (1..15); its enemy id is `boss<level>`
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
      shieldHits: m.shieldHits,
      rally: m.rally,
      summon: m.summon,
      unkillable: m.unkillable,
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
export const BOSS_ENEMIES: EnemyDef[] = BOSS_META.map((m) => ENEMIES[`boss${m.level}`]);

/** Whether an enemy has any physical or magic resistance worth showing. */
export function hasResistance(def: EnemyDef): boolean {
  return (def.physicalResist ?? 0) > 0 || (def.magicResist ?? 0) > 0;
}

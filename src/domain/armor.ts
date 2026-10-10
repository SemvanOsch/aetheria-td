/**
 * Armor — stat-boosting equipment exclusive to the player's own adventurer.
 *
 * The adventurer equips up to four pieces, one per `ArmorSlot` (helmet,
 * chestplate, leg piece, boots). Armor is pure stats: it is not drawn on the
 * figure, only shown as item icons. Every piece belongs to a **set** (one per
 * chapter with an endless run — for now only the Castle's) and comes in one of
 * four **rarities**. Equipping all four pieces of one set adds that set's bonus.
 *
 * **Every piece's stats are rolled when it drops.** Its rarity decides how many
 * stats it gets (`ARMOR_RARITIES[].statCount`, all different) and the range each
 * one rolls in (`ARMOR_STATS[].ranges[rarity]`): a Legendary damage roll lands
 * far higher than a Common one, and two pieces of the same kind differ. So each
 * owned piece is stored individually (`ArmorPiece`, with its own id and stats).
 *
 * Pieces drop only from **endless** bosses: each boss killed in a chapter's
 * endless run rolls once for a piece of that chapter's set (`ARMOR_DROPS`),
 * picking the slot uniformly and the rarity by `ARMOR_RARITIES[].dropWeight`.
 *
 * Everything tunable is plain data in this file:
 *  - drop chances → `ARMOR_DROPS`
 *  - rarity odds / stats per piece / salvage value → `ARMOR_RARITIES`
 *  - which stats exist, how often they roll and their ranges → `ARMOR_STATS`
 *  - set names, piece names and set bonuses → `ARMOR_SETS`
 *
 * The equipped bonuses are folded into the player champion's `UnitDef` by
 * `applyArmor` (called when the player-champion registry is rebuilt), so the
 * engine and every stat display read the armored numbers from one place.
 */

import type { GearBonus, UnitDef } from './units';
import type { SectionId } from './levels';

// ---------------------------------------------------------------- slots

export type ArmorSlot = 'helmet' | 'chest' | 'legs' | 'boots';

export interface ArmorSlotDef {
  id: ArmorSlot;
  /** Display name of the slot ("Chestplate"). */
  label: string;
}

/** Slots in paper-doll order (head → feet). */
export const ARMOR_SLOTS: readonly ArmorSlotDef[] = [
  { id: 'helmet', label: 'Helmet' },
  { id: 'chest', label: 'Chestplate' },
  { id: 'legs', label: 'Leg piece' },
  { id: 'boots', label: 'Boots' },
];

const SLOT_IDS = new Set<string>(ARMOR_SLOTS.map((s) => s.id));

export function armorSlotDef(slot: ArmorSlot): ArmorSlotDef {
  return ARMOR_SLOTS.find((s) => s.id === slot)!;
}

// ---------------------------------------------------------------- rarities

export type ArmorRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ArmorRarityDef {
  id: ArmorRarity;
  name: string;
  /** Frame / text colour in the UI (matches the champion rarity colours). */
  color: string;
  /** How many different stats a piece of this rarity rolls. */
  statCount: number;
  /** Relative odds when a drop rolls its rarity (probability = weight / sum). */
  dropWeight: number;
  /** Gems returned when a piece is salvaged. */
  salvageGems: number;
  /** Sort order, higher = rarer. */
  order: number;
}

export const ARMOR_RARITIES: Record<ArmorRarity, ArmorRarityDef> = {
  common: { id: 'common', name: 'Common', color: '#9fb2c8', statCount: 2, dropWeight: 60, salvageGems: 5, order: 0 },
  rare: { id: 'rare', name: 'Rare', color: '#4aa3ff', statCount: 2, dropWeight: 28, salvageGems: 15, order: 1 },
  epic: { id: 'epic', name: 'Epic', color: '#b455ff', statCount: 3, dropWeight: 10, salvageGems: 40, order: 2 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#ffb020', statCount: 3, dropWeight: 2, salvageGems: 100, order: 3 },
};

/** Rarities from common to legendary. */
export const ARMOR_RARITY_ORDER: readonly ArmorRarity[] = ['common', 'rare', 'epic', 'legendary'];

// ---------------------------------------------------------------- drops

export const ARMOR_DROPS = {
  /** Chance a boss killed in an endless run drops a piece (campaign bosses never do). */
  endlessBossChance: 0.5,
};

// ---------------------------------------------------------------- stats

/**
 * What a piece (or a set bonus) grants. Fractions are added up across every
 * equipped piece, then applied once (two +5% damage pieces = +10%).
 */
export interface ArmorStats {
  /** Damage bonus as a fraction (0.05 = +5%). */
  damage?: number;
  /** Attack-speed bonus as a fraction. */
  attackSpeed?: number;
  /** Range bonus as a fraction. */
  range?: number;
  /** Critical-hit chance, added (0.03 = +3 percentage points). */
  critChance?: number;
  /** Critical-hit damage, added to the multiplier (0.1 = ×1.5 → ×1.6). */
  critDamage?: number;
  /** Extra maximum mana (flat). */
  mana?: number;
  /** Mana regained per second, on top of mana from kills. */
  manaRegen?: number;
  /** Ability cooldown reduction as a fraction (0.1 = 10% shorter). */
  cooldown?: number;
}

export type ArmorStatKey = keyof ArmorStats;

/** A [min, max] roll range. */
type Range = readonly [number, number];

export interface ArmorStatDef {
  key: ArmorStatKey;
  label: string;
  /** Shown as a percentage (else a flat number). */
  percent: boolean;
  /** Shown as a reduction (cooldown 0.15 → "-15%"). */
  reduces?: boolean;
  /** Decimal places a flat (non-percent) roll keeps (default 0: whole numbers). */
  decimals?: number;
  /** Suffix after a flat value ("/s"). */
  unit?: string;
  /** Relative odds of this stat being picked for a piece. */
  weight: number;
  /** The range a roll of this stat lands in, per rarity (uniform). */
  ranges: Record<ArmorRarity, Range>;
}

/** Every stat a piece can roll, in display order. */
export const ARMOR_STATS: readonly ArmorStatDef[] = [
  {
    key: 'damage', label: 'Damage', percent: true, weight: 10,
    ranges: { common: [0.01, 0.02], rare: [0.02, 0.04], epic: [0.04, 0.6], legendary: [0.06, 0.08] },
  },
  {
    key: 'attackSpeed', label: 'Attack speed', percent: true, weight: 10,
    ranges: { common: [0.01, 0.02], rare: [0.02, 0.03], epic: [0.03, 0.04], legendary: [0.04, 0.05] },
  },
  {
    key: 'range', label: 'Range', percent: true, weight: 10,
    ranges: { common: [0.01, 0.03], rare: [0.03, 0.05], epic: [0.05, 0.07], legendary: [0.07, 0.09] },
  },
  {
    key: 'critChance', label: 'Crit chance', percent: true, weight: 10,
    ranges: { common: [0.01, 0.02], rare: [0.02, 0.03], epic: [0.03, 0.04], legendary: [0.04, 0.05] },
  },
  {
    key: 'critDamage', label: 'Crit damage', percent: true, weight: 10,
    ranges: { common: [0.03, 0.05], rare: [0.05, 0.07], epic: [0.07, 0.1], legendary: [0.1, 0.13] },
  },
  {
    key: 'mana', label: 'Max mana', percent: false, weight: 10,
    ranges: { common: [2, 3], rare: [3, 4], epic: [4, 6], legendary: [6, 8] },
  },
  {
    key: 'manaRegen', label: 'Mana regen', percent: false, decimals: 2, unit: '/s', weight: 10,
    ranges: { common: [0.1, 0.15], rare: [0.15, 0.2], epic: [0.2, 0.3], legendary: [0.3, 0.4] },
  },
  {
    key: 'cooldown', label: 'Ability cooldown', percent: true, reduces: true, weight: 10,
    ranges: { common: [0.02, 0.03], rare: [0.03, 0.05], epic: [0.05, 0.07], legendary: [0.07, 0.09] },
  },
];

const STAT_KEYS = new Set<string>(ARMOR_STATS.map((s) => s.key));

export function armorStatDef(key: ArmorStatKey): ArmorStatDef {
  return ARMOR_STATS.find((s) => s.key === key)!;
}

// ---------------------------------------------------------------- sets

export interface ArmorSetDef {
  id: string;
  name: string;
  /** The chapter whose endless bosses drop this set. */
  section: SectionId;
  /** One line of flavour for the armory. */
  lore: string;
  /**
   * Icon drawing style for `engine/armorArt.ts` (the shapes of the pieces).
   * Sets may share a style and differ only in `cloth`.
   */
  style: 'kingsguard';
  /** Plume, tabard and padding colour on the icons. */
  cloth: string;
  /** Each slot's piece name. */
  pieces: Record<ArmorSlot, string>;
  /** Granted while all four pieces of this set are worn (any rarities). */
  setBonus: { name: string; description: string; stats: ArmorStats };
}

export const ARMOR_SETS: readonly ArmorSetDef[] = [
  {
    id: 'kingsguard',
    name: 'Kingsguard',
    section: 'castle',
    lore: 'Plate of the royal guard, taken from the halls of the fallen keep.',
    style: 'kingsguard',
    cloth: '#9a2a33',
    pieces: {
      helmet: 'Kingsguard Helm',
      chest: 'Kingsguard Cuirass',
      legs: 'Kingsguard Greaves',
      boots: 'Kingsguard Sabatons',
    },
    setBonus: {
      name: 'Oath of the Crown',
      description: '+15% range.',
      stats: { range: 0.15 },
    },
  },
];

export function getArmorSet(id: string): ArmorSetDef | undefined {
  return ARMOR_SETS.find((s) => s.id === id);
}

/** The set a chapter's bosses drop, if it has one. */
export function armorSetForSection(section: SectionId): ArmorSetDef | undefined {
  return ARMOR_SETS.find((s) => s.section === section);
}

// ---------------------------------------------------------------- pieces

/** A freshly rolled piece (a drop or a forge), before the armory gives it an id. */
export interface ArmorRoll {
  set: string;
  slot: ArmorSlot;
  rarity: ArmorRarity;
  /** Its rolled stats: `statCount` different stats. */
  stats: ArmorStats;
}

/** An owned piece. */
export interface ArmorPiece extends ArmorRoll {
  id: string;
}

/** The piece's name ("Kingsguard Helm"). */
export function armorPieceName(p: Pick<ArmorRoll, 'set' | 'slot'>): string {
  return getArmorSet(p.set)?.pieces[p.slot] ?? 'Unknown armor';
}

/**
 * Validate a stored piece: a known set, slot and rarity, and only known stats
 * with finite values (rolled values are kept as they are, even if the ranges
 * have since been retuned). Null when it can't be used.
 */
export function normalizeArmorPiece(raw: unknown): ArmorPiece | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ArmorPiece>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.set !== 'string' || !getArmorSet(r.set)) return null;
  if (typeof r.slot !== 'string' || !SLOT_IDS.has(r.slot)) return null;
  if (typeof r.rarity !== 'string' || !(r.rarity in ARMOR_RARITIES)) return null;
  const stats: ArmorStats = {};
  for (const [k, v] of Object.entries(r.stats ?? {})) {
    if (STAT_KEYS.has(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) stats[k as ArmorStatKey] = v;
  }
  return { id: r.id, set: r.set, slot: r.slot, rarity: r.rarity, stats };
}

function addStats(into: ArmorStats, add: ArmorStats): void {
  for (const k of Object.keys(add) as ArmorStatKey[]) {
    into[k] = Math.round(((into[k] ?? 0) + (add[k] ?? 0)) * 1000) / 1000;
  }
}

/** A bonus as it reads: "+5%", "+5", or "-15%" for a reduction. */
export function formatArmorStat(key: ArmorStatKey, value: number): string {
  const def = armorStatDef(key);
  const sign = def.reduces ? '-' : '+';
  return def.percent ? `${sign}${+(value * 100).toFixed(1)}%` : `${sign}${+value.toFixed(def.decimals ?? 0)}${def.unit ?? ''}`;
}

/** A roll range as it reads: "4–7%", "6–10". */
export function formatArmorRange(key: ArmorStatKey, rarity: ArmorRarity): string {
  const def = armorStatDef(key);
  const [min, max] = def.ranges[rarity];
  return def.percent ? `${+(min * 100).toFixed(1)}–${+(max * 100).toFixed(1)}%` : `${min}–${max}${def.unit ?? ''}`;
}

/** Where a rolled value sits in its rarity's range: 0 = the minimum, 1 = the maximum. */
export function armorRollQuality(key: ArmorStatKey, rarity: ArmorRarity, value: number): number {
  const [min, max] = armorStatDef(key).ranges[rarity];
  return max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 1;
}

/** One line per stat in display order: { "Damage", "+5%" }. */
export function armorStatLines(stats: ArmorStats): { key: ArmorStatKey; label: string; value: string }[] {
  return ARMOR_STATS.filter((s) => stats[s.key]).map((s) => ({
    key: s.key,
    label: s.label,
    value: formatArmorStat(s.key, stats[s.key]!),
  }));
}

// ---------------------------------------------------------------- equipped

/** What the adventurer wears: slot → owned piece id. */
export type ArmorLoadout = Partial<Record<ArmorSlot, string>>;

/** The worn pieces, in slot order (ids that don't resolve are skipped). */
export function equippedPieces(items: readonly ArmorPiece[], loadout: ArmorLoadout): ArmorPiece[] {
  const out: ArmorPiece[] = [];
  for (const { id } of ARMOR_SLOTS) {
    const piece = items.find((p) => p.id === loadout[id]);
    if (piece && piece.slot === id) out.push(piece);
  }
  return out;
}

export interface ArmorSummary {
  /** Pieces worn per set id. */
  setCounts: Record<string, number>;
  /** Sets whose 4-piece bonus is active. */
  activeSets: ArmorSetDef[];
  /** Every bonus summed: pieces plus active set bonuses. */
  total: ArmorStats;
}

export function armorSummary(worn: readonly ArmorPiece[]): ArmorSummary {
  const setCounts: Record<string, number> = {};
  const total: ArmorStats = {};
  for (const p of worn) {
    setCounts[p.set] = (setCounts[p.set] ?? 0) + 1;
    addStats(total, p.stats);
  }
  const activeSets = ARMOR_SETS.filter((s) => setCounts[s.id] === ARMOR_SLOTS.length);
  for (const s of activeSets) addStats(total, s.setBonus.stats);
  return { setCounts, activeSets, total };
}

/**
 * The player champion's `UnitDef` wearing `worn`: damage / attack speed /
 * range / crit go on `gearBonus` (read by `masteryStats`, `critChanceFor` and
 * `critMultiplierFor`, so they stack with mastery and in-stage levels), extra
 * mana raises `maxMana`, mana regen sets `manaRegen`, and cooldown reduction
 * shortens the ability. Returns
 * the def unchanged when nothing is worn.
 */
export function applyArmor(def: UnitDef, worn: readonly ArmorPiece[]): UnitDef {
  if (worn.length === 0) return def;
  const { total } = armorSummary(worn);
  const gearBonus: GearBonus = {
    damageMult: 1 + (total.damage ?? 0),
    attackSpeedMult: 1 + (total.attackSpeed ?? 0),
    rangeMult: 1 + (total.range ?? 0),
    critChance: total.critChance ?? 0,
    critMultiplier: total.critDamage ?? 0,
  };
  const cdMult = Math.max(0.2, 1 - (total.cooldown ?? 0));
  return {
    ...def,
    gearBonus,
    maxMana: def.maxMana != null ? def.maxMana + (total.mana ?? 0) : def.maxMana,
    manaRegen: (def.manaRegen ?? 0) + (total.manaRegen ?? 0) || undefined,
    upgrades: def.upgrades.map((u) =>
      u.ability ? { ...u, ability: { ...u.ability, cooldown: Math.round(u.ability.cooldown * cdMult * 10) / 10 } } : u,
    ),
  };
}

/** How a piece's icon looks: its set's style and cloth, and its rarity. */
export interface ArmorLookPiece {
  style: ArmorSetDef['style'];
  cloth: string;
  rarity: ArmorRarity;
}

export function armorLookPiece(p: Pick<ArmorRoll, 'set' | 'rarity'>): ArmorLookPiece {
  const set = getArmorSet(p.set) ?? ARMOR_SETS[0];
  return { style: set.style, cloth: set.cloth, rarity: p.rarity };
}

// ---------------------------------------------------------------- rolling

/** Pick a rarity by `dropWeight`. */
export function rollArmorRarity(rng: () => number): ArmorRarity {
  const total = ARMOR_RARITY_ORDER.reduce((sum, r) => sum + ARMOR_RARITIES[r].dropWeight, 0);
  let roll = rng() * total;
  for (const r of ARMOR_RARITY_ORDER) {
    roll -= ARMOR_RARITIES[r].dropWeight;
    if (roll < 0) return r;
  }
  return 'common';
}

/**
 * Roll a rarity's stats: `statCount` different stats picked by `weight`, each
 * valued uniformly within its range for the rarity (percentages to 0.1%, flat
 * stats to whole numbers).
 */
export function rollArmorStats(rarity: ArmorRarity, rng: () => number): ArmorStats {
  const pool = [...ARMOR_STATS];
  const stats: ArmorStats = {};
  const count = Math.min(ARMOR_RARITIES[rarity].statCount, pool.length);
  for (let n = 0; n < count; n++) {
    const totalWeight = pool.reduce((sum, s) => sum + s.weight, 0);
    let pick = rng() * totalWeight;
    let i = 0;
    while (i < pool.length - 1 && (pick -= pool[i].weight) >= 0) i++;
    const def = pool.splice(i, 1)[0];
    const [min, max] = def.ranges[rarity];
    const v = min + (max - min) * rng();
    const scale = 10 ** (def.percent ? 3 : (def.decimals ?? 0));
    stats[def.key] = Math.round(v * scale) / scale;
  }
  return stats;
}

/** Roll a whole piece of `setId` for a given slot and rarity. */
export function rollArmorPiece(setId: string, slot: ArmorSlot, rarity: ArmorRarity, rng: () => number): ArmorRoll {
  return { set: setId, slot, rarity, stats: rollArmorStats(rarity, rng) };
}

/**
 * Roll a boss's drop in `section`: null in a campaign stage (only endless
 * bosses drop armor), when the chapter has no set, or when the chance misses;
 * else the dropped piece.
 */
export function rollArmorDrop(section: SectionId, endless: boolean, rng: () => number): ArmorRoll | null {
  const set = armorSetForSection(section);
  if (!endless || !set) return null;
  if (rng() >= ARMOR_DROPS.endlessBossChance) return null;
  const slot = ARMOR_SLOTS[Math.floor(rng() * ARMOR_SLOTS.length) % ARMOR_SLOTS.length].id;
  return rollArmorPiece(set.id, slot, rollArmorRarity(rng), rng);
}

/** Percent odds of each rarity, for the armory's drop table. */
export function armorRarityOdds(): { rarity: ArmorRarityDef; chance: number }[] {
  const total = ARMOR_RARITY_ORDER.reduce((sum, r) => sum + ARMOR_RARITIES[r].dropWeight, 0);
  return ARMOR_RARITY_ORDER.map((r) => ({ rarity: ARMOR_RARITIES[r], chance: ARMOR_RARITIES[r].dropWeight / total }));
}

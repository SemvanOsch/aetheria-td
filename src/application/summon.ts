/**
 * Summoning logic (kept out of UI components).
 *
 * The rarity roll is data-driven: it reads the weights of *available*
 * rarities from the rarity table. Today only Common is available, so every
 * summon yields a Common unit — but enabling Rare/Epic/Legendary later needs
 * no change here.
 */

import { ALL_RARITIES, RARITIES, type Rarity } from '../domain/rarity';
import { ALL_UNITS, type UnitDef } from '../domain/units';

/** Cost of one summon, paid in gems. */
export const SUMMON_COST = 100;

/** Fraction of the summon cost refunded when the result is a duplicate. */
export const DUPLICATE_REFUND = 0.2;

export interface SummonOutcome {
  rarity: Rarity;
  unit: UnitDef;
  /** True if this unit type was already in the collection. */
  duplicate: boolean;
  /** Mastery EXP granted to the champion when this summon is a duplicate. */
  duplicateExp: number;
}

function rollRarity(rng: () => number): Rarity {
  const pool = ALL_RARITIES.filter((r) => r.available);
  const total = pool.reduce((sum, r) => sum + r.weight, 0);
  let roll = rng() * total;
  for (const r of pool) {
    roll -= r.weight;
    if (roll <= 0) return r.id;
  }
  return pool[pool.length - 1].id;
}

function pickUnitOfRarity(rarity: Rarity, rng: () => number): UnitDef {
  const pool = ALL_UNITS.filter((u) => u.rarity === rarity);
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Perform a single summon roll. Gem checks are the caller's job; this is the
 * pure random draw so it can be tested and reused. `owned` lets the roll flag
 * duplicates for the UI.
 */
export function rollSummon(
  owned: readonly string[] = [],
  rng: () => number = Math.random,
): SummonOutcome {
  const rarity = rollRarity(rng);
  const unit = pickUnitOfRarity(rarity, rng);
  const duplicate = owned.includes(unit.id);
  return {
    rarity,
    unit,
    duplicate,
    duplicateExp: duplicate ? RARITIES[rarity].duplicateExp : 0,
  };
}

/** Whether the player has enough gems to summon. */
export function canAffordSummon(gems: number): boolean {
  return gems >= SUMMON_COST;
}

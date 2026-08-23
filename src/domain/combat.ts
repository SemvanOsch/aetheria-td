/**
 * Combat rules shared by the engine — critical hits for now.
 *
 * Crit chance is resolved through `critChanceFor` so the whole game reads it
 * from one place: today it is a flat base for every unit, but future passives
 * or mastery upgrades add their bonuses here (and to the parameters) without
 * touching the engine's combat code.
 */

import type { UnitDef } from './units';
import { masteryCritChanceBonus, masteryCritMultiplier } from './mastery';

/** Base chance (0–1) that any unit's attack lands a critical hit. */
export const BASE_CRIT_CHANCE = 0.05;

/** Default damage multiplier applied on a critical hit. */
export const CRIT_MULTIPLIER = 1.5;

/**
 * A unit's crit chance (0–1): the flat base plus any purchased mastery bonuses.
 * This is the one place crit chance is resolved — future passives add here too.
 */
export function critChanceFor(
  unit: UnitDef,
  purchased: readonly string[] = [],
): number {
  return BASE_CRIT_CHANCE + masteryCritChanceBonus(unit.id, purchased);
}

/**
 * A unit's crit damage multiplier: the global default unless a purchased
 * mastery node overrides it (e.g. the Archer's Deadly Precision → 2×).
 */
export function critMultiplierFor(
  unit: UnitDef,
  purchased: readonly string[] = [],
): number {
  return masteryCritMultiplier(unit.id, purchased) ?? CRIT_MULTIPLIER;
}

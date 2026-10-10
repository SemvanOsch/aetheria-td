/**
 * Mist — a stage rule (the Outskirts, `LevelDef.mist`): a champion standing in
 * the mist loses part of its range, unless it stands close to a lit lantern.
 *
 * Lanterns are ordinary decor props of a *lightable* kind (`LIGHTABLE_PROPS`):
 * they start dark, and the player buys their light with gold in-stage
 * (`GameEngine.lightLantern`). A lit lantern clears the mist within its
 * `radius` of its cell's centre, so every champion whose cell centre falls
 * inside keeps its full range. Pure data + rules; the engine applies it and
 * every range display reads it through the engine.
 */

import type { DecorProp, PropKind } from './decor';
import { TILE, cellCenter } from './grid';

/** Range multiplier for a champion standing in the mist (−30%). */
export const MIST_RANGE_MULT = 0.7;

/** A prop kind the player can light in-stage. */
export interface LightableProp {
  /** Gold it costs to light. */
  cost: number;
  /** How far from its cell's centre it clears the mist, px. */
  radius: number;
}

/** Every lightable prop kind, with its price and reach. */
export const LIGHTABLE_PROPS: Partial<Record<PropKind, LightableProp>> = {
  lanternPost: { cost: 50, radius: TILE * 2.5 },
};

/** The lighting rules for a prop kind, or undefined for one that can't be lit. */
export function lightableProp(kind: PropKind): LightableProp | undefined {
  return LIGHTABLE_PROPS[kind];
}

/** Whether the board point `x`,`y` lies in the light of lantern `prop`. */
export function inLanternLightAt(prop: DecorProp, x: number, y: number): boolean {
  const light = lightableProp(prop.kind);
  if (!light) return false;
  const a = cellCenter(prop.col, prop.row);
  return Math.hypot(a.x - x, a.y - y) <= light.radius;
}

/** Whether the champion cell `col`,`row` lies in the light of lantern `prop`. */
export function inLanternLight(prop: DecorProp, col: number, row: number): boolean {
  const b = cellCenter(col, row);
  return inLanternLightAt(prop, b.x, b.y);
}

/**
 * Range multiplier for a champion on `col`,`row`: `MIST_RANGE_MULT` on a misty
 * stage unless one of the `lit` lanterns covers the cell, else 1.
 */
export function mistRangeMult(
  mist: boolean | undefined,
  lit: readonly DecorProp[],
  col: number,
  row: number,
): number {
  if (!mist) return 1;
  return lit.some((p) => inLanternLight(p, col, row)) ? 1 : MIST_RANGE_MULT;
}

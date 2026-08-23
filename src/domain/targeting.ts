/**
 * Targeting strategies.
 *
 * A strategy picks one enemy from those already known to be in range. Towers
 * carry a mutable targeting choice the player can change mid-stage; the
 * `SELECTABLE_TARGETING` list is what the in-game UI exposes.
 */

export type TargetingType = 'first' | 'last' | 'closest' | 'strongest';

/** Minimal view of an enemy that a strategy needs to make its choice. */
export interface TargetableEnemy {
  health: number;
  /**
   * Distance (px) the enemy still has to travel to reach the base — lower means
   * closer to the exit. Compared across lanes, so on multi-lane stages "first"
   * picks whoever is nearest the base regardless of how far along its own (maybe
   * shorter or longer) lane it is.
   */
  remainingToExit: number;
  /** Distance (px) from the attacking unit. */
  distance: number;
}

export type TargetingStrategy = <T extends TargetableEnemy>(
  inRange: T[],
) => T | undefined;

/** Enemy closest to the exit (least distance left to the base). Classic TD default. */
const first: TargetingStrategy = (inRange) => {
  let best: (typeof inRange)[number] | undefined;
  for (const e of inRange) {
    if (!best || e.remainingToExit < best.remainingToExit) best = e;
  }
  return best;
};

/** Enemy furthest from the exit (the newest arrival, with the most path left). */
const last: TargetingStrategy = (inRange) => {
  let best: (typeof inRange)[number] | undefined;
  for (const e of inRange) {
    if (!best || e.remainingToExit > best.remainingToExit) best = e;
  }
  return best;
};

/** Enemy physically nearest the unit. */
const closest: TargetingStrategy = (inRange) => {
  let best: (typeof inRange)[number] | undefined;
  for (const e of inRange) {
    if (!best || e.distance < best.distance) best = e;
  }
  return best;
};

/** Enemy with the most current health (focus tanks/bosses). */
const strongest: TargetingStrategy = (inRange) => {
  let best: (typeof inRange)[number] | undefined;
  for (const e of inRange) {
    if (!best || e.health > best.health) best = e;
  }
  return best;
};

export const TARGETING_STRATEGIES: Record<TargetingType, TargetingStrategy> = {
  first,
  last,
  closest,
  strongest,
};

/** Targeting modes the player can cycle a tower through in a stage. */
export const SELECTABLE_TARGETING: { type: TargetingType; label: string }[] = [
  { type: 'first', label: 'First' },
  { type: 'last', label: 'Last' },
  { type: 'strongest', label: 'Strongest' },
];

export function targetingLabel(type: TargetingType): string {
  return SELECTABLE_TARGETING.find((t) => t.type === type)?.label ?? type;
}

export function selectTarget<T extends TargetableEnemy>(
  type: TargetingType,
  inRange: T[],
): T | undefined {
  return TARGETING_STRATEGIES[type](inRange);
}

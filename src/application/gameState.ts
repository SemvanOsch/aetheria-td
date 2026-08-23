/**
 * Central game-state model + repository.
 *
 * `GameState` is the single source of truth for persistent player progression.
 * All mutations go through the pure helper functions here (they return a new
 * state) and are saved via the repository. UI never writes localStorage
 * directly.
 *
 * Currencies:
 *  - gems: the only *persistent* currency; spent on summons, earned from
 *    clearing levels.
 *  - gold: a per-stage battle resource (see the engine) — it is NOT stored here
 *    and does not appear on the home/menu screens.
 *
 * Owned units are a *set* of unit types. Once a type is owned the player may
 * deploy it as often as they like (subject to the per-stage deploy limit), so
 * duplicates are collapsed rather than stacked.
 */

import { readJSON, writeJSON } from '../infrastructure/storage';
import { DEFAULT_OWNED_UNIT_IDS } from '../domain/units';
import { ENEMY_KILLS_TO_UNLOCK, type EnemyDef } from '../domain/enemies';
import {
  activeMasteryUpgrades,
  getMasteryUpgrade,
  masterySpent,
} from '../domain/mastery';

export interface GameState {
  /** Schema version, for future migrations. */
  version: number;
  /** Summon currency (the only persistent currency). */
  gems: number;
  /** Unique unit type ids the player owns. */
  ownedUnits: string[];
  /** Level ids the player has completed. */
  completedLevels: number[];
  /** Whether the one-time free starter has been claimed. */
  hasSelectedStarter: boolean;
  /**
   * Permanent champion mastery: unit id → total EXP earned across all stages.
   * Earned by killing enemies; persists win or lose. See domain/mastery.
   */
  mastery: Record<string, number>;
  /**
   * Purchased permanent skill-tree upgrades, unit id → learned upgrade ids.
   * Each node's EXP cost is drawn from the champion's earned mastery.
   */
  masteryUpgrades: Record<string, string[]>;
  /**
   * Chosen *active* member of each mutually-exclusive skill-tree group, unit id
   * → active upgrade ids. A champion may learn several nodes that share an
   * `exclusiveGroup`, but only the one recorded here applies its effects; the
   * player swaps freely from the skill-tree menu. See domain/mastery's
   * `exclusiveGroup` / `activeMasteryUpgrades`.
   */
  activeMastery: Record<string, string[]>;
  /**
   * Per-champion master switch: unit id → true when the player has toggled that
   * champion's whole mastery *off* from the skill-tree menu. Learned nodes and
   * exclusive-path selections are kept, but none of the effects apply while off.
   * Absent / false means mastery is on (the default).
   */
  masteryDisabled: Record<string, boolean>;
  /**
   * The player's active team: the (owned) unit ids that may be deployed in a
   * stage. Ordered, distinct, and capped at MAX_TEAM_SIZE. Configured in the
   * Champions menu. Newly acquired units auto-join while there is room.
   */
  team: string[];
  /**
   * Lifetime kills per enemy-def id (bosses included). Drives the Enemy Index:
   * a normal enemy unlocks at ENEMY_KILLS_TO_UNLOCK kills, a boss at its first.
   */
  enemyKills: Record<string, number>;
}

const STORAGE_KEY = 'state';
const STARTING_GEMS = 300;
const CURRENT_VERSION = 10;

/** Maximum distinct champions the player may bring into a stage. */
export const MAX_TEAM_SIZE = 6;

export function createInitialState(): GameState {
  const starters = [...DEFAULT_OWNED_UNIT_IDS];
  return {
    version: CURRENT_VERSION,
    gems: STARTING_GEMS,
    ownedUnits: starters,
    completedLevels: [],
    hasSelectedStarter: true,
    mastery: {},
    masteryUpgrades: {},
    activeMastery: {},
    masteryDisabled: {},
    team: [...starters],
    enemyKills: {},
  };
}

/** Legacy shapes: v1 had `currency`; v2 had a persistent `gold`. */
interface LegacyState {
  currency?: number;
  gold?: number;
}

export function loadState(): GameState {
  const raw = readJSON<(Partial<GameState> & LegacyState) | null>(STORAGE_KEY, null);
  if (!raw) return createInitialState();

  const base = createInitialState();
  const migrated: GameState = { ...base, ...raw, version: CURRENT_VERSION };

  // Seed gems for pre-v2 saves that only had a single `currency`.
  if (raw.gems == null && raw.currency != null) {
    migrated.gems = STARTING_GEMS;
  }
  // Collapse any stacked duplicates into a set of owned types.
  migrated.ownedUnits = Array.from(new Set(migrated.ownedUnits));
  // The starter-selection screen is gone: every player now owns the default
  // starters. Grant them to any pre-v10 save that never claimed one so it isn't
  // left with an empty roster and no way to fill it.
  if (!migrated.hasSelectedStarter) {
    migrated.ownedUnits = Array.from(
      new Set([...DEFAULT_OWNED_UNIT_IDS, ...migrated.ownedUnits]),
    );
    migrated.hasSelectedStarter = true;
  }
  // Pre-v4 saves have no mastery map; normalize to a plain object either way.
  migrated.mastery = { ...(raw.mastery ?? {}) };
  // Pre-v5 saves have no purchased skill-tree upgrades.
  migrated.masteryUpgrades = { ...(raw.masteryUpgrades ?? {}) };
  // Pre-v7 saves have no active-path selections for exclusive skill-tree groups.
  migrated.activeMastery = { ...(raw.activeMastery ?? {}) };
  // Pre-v8 saves have no per-champion mastery on/off switch (all default on).
  migrated.masteryDisabled = { ...(raw.masteryDisabled ?? {}) };
  // Pre-v9 saves have no per-enemy kill tallies (Enemy Index starts empty).
  migrated.enemyKills = { ...(raw.enemyKills ?? {}) };
  // Pre-v6 saves have no team; seed it from owned units (all were deployable
  // before teams existed). Always normalize to a distinct, owned, capped list.
  migrated.team = Array.from(new Set(raw.team ?? migrated.ownedUnits))
    .filter((id) => migrated.ownedUnits.includes(id))
    .slice(0, MAX_TEAM_SIZE);
  return migrated;
}

export function saveState(state: GameState): void {
  writeJSON(STORAGE_KEY, state);
}

// --- Pure state transitions -------------------------------------------------

export function addGems(state: GameState, amount: number): GameState {
  return { ...state, gems: Math.max(0, state.gems + amount) };
}

/** Append a unit to the team if it's absent and there is still room. */
function withAutoTeam(team: string[], unitId: string): string[] {
  if (team.includes(unitId) || team.length >= MAX_TEAM_SIZE) return team;
  return [...team, unitId];
}

/** Add a unit type to the collection (no-op if already owned). */
export function addUnit(state: GameState, unitId: string): GameState {
  if (state.ownedUnits.includes(unitId)) return state;
  return {
    ...state,
    ownedUnits: [...state.ownedUnits, unitId],
    team: withAutoTeam(state.team, unitId),
  };
}

export function ownsUnit(state: GameState, unitId: string): boolean {
  return state.ownedUnits.includes(unitId);
}

/** Whether a champion is currently on the active team. */
export function isInTeam(state: GameState, unitId: string): boolean {
  return state.team.includes(unitId);
}

/**
 * Add or remove an owned champion from the team. Adding is a no-op when the
 * team is already full (MAX_TEAM_SIZE) or the unit isn't owned; removing always
 * succeeds. Order is preserved.
 */
export function toggleTeamMember(state: GameState, unitId: string): GameState {
  if (state.team.includes(unitId)) {
    return { ...state, team: state.team.filter((id) => id !== unitId) };
  }
  if (!state.ownedUnits.includes(unitId) || state.team.length >= MAX_TEAM_SIZE) {
    return state;
  }
  return { ...state, team: [...state.team, unitId] };
}

export function markLevelComplete(
  state: GameState,
  levelId: number,
  gemReward: number,
): GameState {
  const alreadyDone = state.completedLevels.includes(levelId);
  if (alreadyDone) return state;
  return {
    ...state,
    completedLevels: [...state.completedLevels, levelId],
    gems: state.gems + gemReward,
  };
}

/**
 * Bank mastery EXP earned in a stage. `gains` maps unit id → EXP that unit's
 * kills earned this stage; the amounts are added on top of existing totals.
 * Returns the same state (no re-render) when there is nothing to add.
 */
export function addMastery(
  state: GameState,
  gains: Record<string, number>,
): GameState {
  const entries = Object.entries(gains).filter(([, exp]) => exp > 0);
  if (entries.length === 0) return state;
  const mastery = { ...state.mastery };
  for (const [id, exp] of entries) {
    mastery[id] = (mastery[id] ?? 0) + exp;
  }
  return { ...state, mastery };
}

/** Total permanent mastery EXP a champion has earned. */
export function masteryExp(state: GameState, unitId: string): number {
  return state.mastery[unitId] ?? 0;
}

/**
 * Bank enemy kills earned in a stage. `gains` maps enemy-def id → kills this
 * stage; amounts are added on top of the lifetime tallies. Returns the same
 * state (no re-render) when there is nothing to add.
 */
export function addEnemyKills(
  state: GameState,
  gains: Record<string, number>,
): GameState {
  const entries = Object.entries(gains).filter(([, n]) => n > 0);
  if (entries.length === 0) return state;
  const enemyKills = { ...state.enemyKills };
  for (const [id, n] of entries) {
    enemyKills[id] = (enemyKills[id] ?? 0) + n;
  }
  return { ...state, enemyKills };
}

/** Lifetime kills the player has scored against a given enemy id. */
export function enemyKillCount(state: GameState, enemyId: string): number {
  return state.enemyKills[enemyId] ?? 0;
}

/**
 * Whether an enemy's Enemy Index entry is unlocked. Bosses unlock on their
 * first defeat; normal enemies unlock after ENEMY_KILLS_TO_UNLOCK kills.
 */
export function isEnemyUnlocked(state: GameState, def: EnemyDef): boolean {
  const kills = enemyKillCount(state, def.id);
  return def.boss ? kills >= 1 : kills >= ENEMY_KILLS_TO_UNLOCK;
}

/** Skill-tree upgrade ids a champion has purchased. */
export function masteryUpgradesFor(
  state: GameState,
  unitId: string,
): string[] {
  return state.masteryUpgrades[unitId] ?? [];
}

/** Whether a champion has learned a specific skill-tree upgrade. */
export function hasMasteryUpgrade(
  state: GameState,
  unitId: string,
  upgradeId: string,
): boolean {
  return masteryUpgradesFor(state, unitId).includes(upgradeId);
}

/** Explicitly-chosen active members of a champion's exclusive skill-tree groups. */
export function activeMasteryFor(state: GameState, unitId: string): string[] {
  return state.activeMastery[unitId] ?? [];
}

/**
 * The learned upgrades whose effects are actually live for a champion — every
 * always-on node plus the chosen active member of each exclusive group. This is
 * what the engine and every stat display consume, so a swapped-out path stops
 * contributing.
 */
export function activeMasteryUpgradesFor(
  state: GameState,
  unitId: string,
): string[] {
  return activeMasteryUpgrades(
    unitId,
    masteryUpgradesFor(state, unitId),
    activeMasteryFor(state, unitId),
  );
}

/** Whether the player has switched a champion's whole mastery off. */
export function isMasteryDisabled(state: GameState, unitId: string): boolean {
  return state.masteryDisabled[unitId] === true;
}

/**
 * The champion's upgrades that should actually take effect right now: the
 * active-resolved list, or an empty list when its master switch is off. Every
 * *effect* surface (the engine, in-stage panel, champion stat sheet, card
 * yields) reads this; the raw `activeMasteryUpgradesFor` is only for the tree's
 * own "which path is selected" markers, which stay visible even while off.
 */
export function effectiveMasteryUpgradesFor(
  state: GameState,
  unitId: string,
): string[] {
  if (isMasteryDisabled(state, unitId)) return [];
  return activeMasteryUpgradesFor(state, unitId);
}

/**
 * Every champion's effective skill-tree upgrades, keyed by unit id. The engine
 * and passive team bonuses read this map instead of the raw `masteryUpgrades`,
 * so exclusive paths that aren't active — and every node of a champion whose
 * master switch is off — drop out.
 */
export function resolvedMasteryUpgrades(
  state: GameState,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const unitId of Object.keys(state.masteryUpgrades)) {
    out[unitId] = effectiveMasteryUpgradesFor(state, unitId);
  }
  return out;
}

/**
 * Mastery EXP a champion has left to spend: total earned minus what has
 * already been committed to purchased skill-tree nodes.
 */
export function availableMasteryExp(
  state: GameState,
  unitId: string,
): number {
  return (
    masteryExp(state, unitId) -
    masterySpent(unitId, masteryUpgradesFor(state, unitId))
  );
}

/**
 * Learn a skill-tree upgrade, spending the champion's earned EXP. No-op (same
 * state) if the node is unknown, already owned, or unaffordable — callers
 * should gate the UI, but this stays safe regardless.
 */
export function buyMasteryUpgrade(
  state: GameState,
  unitId: string,
  upgradeId: string,
): GameState {
  const def = getMasteryUpgrade(unitId, upgradeId);
  if (!def) return state;
  if (hasMasteryUpgrade(state, unitId, upgradeId)) return state;
  // Enforce the node's prerequisite (sequential trees).
  if (def.requires && !hasMasteryUpgrade(state, unitId, def.requires)) return state;
  if (availableMasteryExp(state, unitId) < def.cost) return state;
  const owned = masteryUpgradesFor(state, unitId);
  const next: GameState = {
    ...state,
    masteryUpgrades: {
      ...state.masteryUpgrades,
      [unitId]: [...owned, upgradeId],
    },
  };
  // The first learned member of an exclusive group becomes active by default;
  // later members are learned but inactive until the player swaps to them.
  if (def.exclusiveGroup) {
    const active = activeMasteryFor(state, unitId);
    const groupHasActive = active.some(
      (id) => getMasteryUpgrade(unitId, id)?.exclusiveGroup === def.exclusiveGroup,
    );
    if (!groupHasActive) {
      next.activeMastery = {
        ...state.activeMastery,
        [unitId]: [...active, upgradeId],
      };
    }
  }
  return next;
}

/**
 * Choose which learned member of an exclusive skill-tree group is active for a
 * champion. No-op unless the node is learned and belongs to a group. Deselects
 * any other member of the same group so exactly one stays active.
 */
export function setActiveMasteryUpgrade(
  state: GameState,
  unitId: string,
  upgradeId: string,
): GameState {
  const def = getMasteryUpgrade(unitId, upgradeId);
  if (!def?.exclusiveGroup) return state;
  if (!hasMasteryUpgrade(state, unitId, upgradeId)) return state;
  const active = activeMasteryFor(state, unitId).filter(
    (id) => getMasteryUpgrade(unitId, id)?.exclusiveGroup !== def.exclusiveGroup,
  );
  return {
    ...state,
    activeMastery: {
      ...state.activeMastery,
      [unitId]: [...active, upgradeId],
    },
  };
}

/**
 * Flip a champion's whole mastery on or off. Purchases and active-path
 * selections are untouched — only whether their effects apply. `disabled` true
 * switches it off; false (the default) switches it back on.
 */
export function setMasteryDisabled(
  state: GameState,
  unitId: string,
  disabled: boolean,
): GameState {
  return {
    ...state,
    masteryDisabled: {
      ...state.masteryDisabled,
      [unitId]: disabled,
    },
  };
}

/** A level is unlocked if it's level 1 or the previous level is complete. */
export function isLevelUnlocked(state: GameState, levelId: number): boolean {
  if (levelId <= 1) return true;
  return state.completedLevels.includes(levelId - 1);
}

/** How many of the given level ids the player has completed. */
export function completedCount(state: GameState, levelIds: number[]): number {
  return levelIds.filter((id) => state.completedLevels.includes(id)).length;
}

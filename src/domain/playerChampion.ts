/**
 * The player's own adventurer, as a deployable champion.
 *
 * The champions in `units.ts` are a static catalog. The player's champion is
 * different: its *identity* (name + portrait) is authored by the player in the
 * Adventurer's Journal, so its `UnitDef` has to be built from the live
 * `PlayerProfile` rather than hand-written. This module owns that construction
 * and a tiny runtime registry so `getUnit` can resolve the player champion by id
 * exactly like any catalog unit — keeping the single-resolution rule intact.
 *
 * Structure for all three journal proficiencies is laid out up front (one stable
 * id per path), but only the **Blade** path (`sword`) is implemented today; the
 * Bow and Magic builders return `null`, so no unfinished champion ever enters the
 * roster. The id encodes the path, so a champion's progression (mastery keyed by
 * id) survives a later proficiency change — an owned Blade champion is never
 * silently converted into an unfinished path.
 */

import type { UnitDef, UnitVisual } from './units';
import type { PlayerSpriteConfig } from './playerSprite';
import type { Proficiency } from './proficiency';

/**
 * One champion id per proficiency path. Stable and path-encoding: mastery,
 * ownership and team membership all key off these ids, so they must never change
 * for an existing path.
 */
export const PLAYER_CHAMPION_IDS: Record<Proficiency, string> = {
  sword: 'player-blade',
  bow: 'player-bow',
  magic: 'player-magic',
};

/** The proficiency paths whose champion is fully implemented and grantable. */
const IMPLEMENTED_PATHS: ReadonlySet<Proficiency> = new Set<Proficiency>(['sword', 'bow']);

const ID_TO_PATH: Record<string, Proficiency> = {
  'player-blade': 'sword',
  'player-bow': 'bow',
  'player-magic': 'magic',
};

/** Whether an id refers to any of the player champion paths (implemented or not). */
export function isPlayerChampionId(id: string): boolean {
  return id in ID_TO_PATH;
}

/** The proficiency a player-champion id embodies, or undefined for other ids. */
export function playerChampionPath(id: string): Proficiency | undefined {
  return ID_TO_PATH[id];
}

/**
 * The champion id to grant for a chosen proficiency, or `null` when that path
 * has no champion implemented yet (Bow / Magic). Callers use `null` to mean
 * "grant nothing for this path for now".
 */
export function implementedPlayerChampionId(proficiency: Proficiency): string | null {
  return IMPLEMENTED_PATHS.has(proficiency) ? PLAYER_CHAMPION_IDS[proficiency] : null;
}

/**
 * Build the player champion `UnitDef` for a given player-champion `id` from the
 * live name + portrait, or `null` when that path isn't implemented. The portrait
 * `sprite` is stored *by reference* on `visual.playerConfig` so the board and
 * every card redraw the exact avatar from the Journal (and pick up edits to it).
 */
export function buildPlayerChampionDef(
  id: string,
  name: string,
  sprite: PlayerSpriteConfig,
): UnitDef | null {
  switch (playerChampionPath(id)) {
    case 'sword':
      return buildBladeChampion(id, name, sprite);
    case 'bow':
      return buildBowChampion(id, name, sprite);
    // The Magic champion is intentionally not implemented yet — it gets a real
    // builder here when its sprite/stats are authored. Returning null keeps it
    // out of the playable roster in the meantime.
    case 'magic':
    default:
      return null;
  }
}

/**
 * The Blade adventurer: a dual-wielding melee duelist carrying two short swords.
 * Balanced as a premium single-hero front-liner — a touch stronger and pricier
 * than the common Swordsman, with a low deploy limit to reflect that there is
 * only one of you. Physical, single-target melee; it falls through the engine's
 * ranged branches to the instant melee slash exactly like the Swordsman.
 */
function buildBladeChampion(
  id: string,
  name: string,
  sprite: PlayerSpriteConfig,
): UnitDef {
  const visual: UnitVisual = {
    // Accent colour drives melee hit-sparks/selection tints; match the outfit so
    // effects read as the player's own colours. The board figure itself is drawn
    // from `playerConfig`, not this flat colour.
    color: sprite.outfitColor,
    icon: '🗡️',
    shape: 'player-blade',
    playerConfig: sprite,
  };
  return {
    id,
    name,
    description:
      'A dual-wielding duelist with a short sword in each ' +
      'hand, swift and sure on the front line.',
    // The exclusive Champion rarity — the player's own adventurer, never summoned.
    rarity: 'champion',
    damage: 20,
    attackSpeed: 1.1,
    range: 64,
    targeting: 'first',
    aoe: 'single',
    attackType: 'melee',
    damageType: 'physical',
    cost: 55,
    deployLimit: 1,
    upgrades: [
      {
        name: 'Honed Twin Blades',
        description: 'Both short swords take a keener edge.',
        cost: 40,
        damage: 12,
      },
      {
        name: 'Dual Flourish',
        description: 'A faster two-blade rhythm — quicker, harder strikes.',
        cost: 65,
        damage: 6,
        attackSpeed: 0.4,
      },
      {
        name: 'Bladestorm',
        description: 'A whirling flurry of steel with a touch more reach.',
        cost: 110,
        damage: 14,
        range: 10,
      },
    ],
    visual,
  };
}

/**
 * The Bow adventurer: a nimble shortbow archer who looses arrows in quick bursts
 * of three (see `burst` + the engine's burst-fire cadence). Balanced as a premium
 * single-hero ranged skirmisher — shorter reach than the Archer's longbow, lighter
 * per-arrow damage that adds up across the volley. Physical, single-target arrows;
 * it uses the engine's arrow branch exactly like the Archer.
 */
function buildBowChampion(
  id: string,
  name: string,
  sprite: PlayerSpriteConfig,
): UnitDef {
  const visual: UnitVisual = {
    // Accent colour tints the arrows / hit sparks / selection; the board figure
    // itself is drawn from `playerConfig`, not this flat colour.
    color: sprite.outfitColor,
    icon: '🏹',
    shape: 'player-bow',
    playerConfig: sprite,
  };
  return {
    id,
    name,
    description:
      'A nimble archer with a shortbow, loosing arrows in quick bursts of three.',
    // The exclusive Champion rarity — the player's own adventurer, never summoned.
    rarity: 'champion',
    // Per-arrow damage; a volley lands three of these in quick succession.
    damage: 8,
    // Governs how often the whole 3-arrow burst repeats (not the per-arrow rate).
    attackSpeed: 0.8,
    range: 112,
    targeting: 'first',
    aoe: 'single',
    attackType: 'ranged',
    damageType: 'physical',
    burst: 3,
    cost: 55,
    deployLimit: 1,
    upgrades: [
      {
        name: 'Keen Broadheads',
        description: 'Sharper arrowheads bite deeper — every arrow of the volley.',
        cost: 40,
        damage: 4,
      },
      {
        name: 'Rapid Nock',
        description: 'A quicker draw looses volleys faster, and a little harder.',
        cost: 65,
        damage: 2,
        attackSpeed: 0.3,
      },
      {
        name: "Hunter's Focus",
        description: 'A steadier eye reaches farther and strikes harder.',
        cost: 110,
        damage: 5,
        range: 20,
      },
    ],
    visual,
  };
}

// --- Runtime registry -------------------------------------------------------
// A small mutable map so `getUnit` resolves player champions like catalog units.
// It is (re)populated from committed state by `syncPlayerChampions` (called from
// the store), never authored by hand — the source of truth is the PlayerProfile.

const registry = new Map<string, UnitDef>();

/** Resolve a registered player champion by id (used by `getUnit`). */
export function getPlayerChampion(id: string): UnitDef | undefined {
  return registry.get(id);
}

/** The minimal profile shape the registry needs (structurally a PlayerProfile). */
export interface PlayerChampionSource {
  name: string;
  sprite: PlayerSpriteConfig;
  proficiency: Proficiency;
}

/**
 * Rebuild the registry to match the current profile + owned set. Registers a def
 * for every *owned* player-champion id (so an owned Blade champion still resolves
 * after the player switches proficiency), plus the current proficiency's champion
 * (so a freshly-chosen path resolves even in the same tick it is granted). Clears
 * everything when there is no profile. Idempotent — safe to call on every commit.
 */
export function syncPlayerChampions(
  source: PlayerChampionSource | null,
  ownedUnits: readonly string[],
): void {
  registry.clear();
  if (!source) return;
  const ids = new Set(ownedUnits.filter(isPlayerChampionId));
  const currentId = implementedPlayerChampionId(source.proficiency);
  if (currentId) ids.add(currentId);
  for (const id of ids) {
    const def = buildPlayerChampionDef(id, source.name, source.sprite);
    if (def) registry.set(id, def);
  }
}

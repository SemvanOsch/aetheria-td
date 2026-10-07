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
 * All three journal proficiencies are implemented — Blade (`sword`), Bow (`bow`)
 * and Magic (`magic`) — each with one stable id per path. The id encodes the path,
 * so a champion's progression (mastery keyed by id) survives a later proficiency
 * change — an owned Blade champion is never silently converted into another path.
 */

import type { UnitDef, UnitVisual } from './units';
import type { PlayerSpriteConfig } from './playerSprite';
import type { Proficiency } from './proficiency';
import { applyArmor, type ArmorPiece } from './armor';

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

/**
 * Baseline mana capacity every hero champion starts a stage with. Abilities are
 * paid for in mana and it refills only by killing enemies (see `EnemyDef.mana`).
 */
export const HERO_BASE_MANA = 50;

/**
 * An alternate weapon a mastery node can re-arm a player champion with (the
 * Blade adventurer's `claymore`, the Bow adventurer's `longbow`, each from its
 * `weaponForm` node). The form keeps the champion's id — mastery, ownership and
 * team slot are untouched — but rebuilds its whole def: attack, stats, in-stage
 * levels, ability and sprite.
 */
export type HeroWeaponForm = 'claymore' | 'longbow';

/** The proficiency paths whose champion is fully implemented and grantable. */
const IMPLEMENTED_PATHS: ReadonlySet<Proficiency> = new Set<Proficiency>([
  'sword',
  'bow',
  'magic',
]);

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
 * `form` swaps in an alternate weapon a mastery node grants (see `HeroWeaponForm`);
 * `volley` is the burst size the active mastery sets (the Bow's Fourfold
 * Volley), used only to word the description — the stat itself stays the base
 * `burst` and is resolved through `masteryBurst` like every other mastery stat.
 */
export function buildPlayerChampionDef(
  id: string,
  name: string,
  sprite: PlayerSpriteConfig,
  form?: HeroWeaponForm,
  volley?: number,
): UnitDef | null {
  switch (playerChampionPath(id)) {
    case 'sword':
      return form === 'claymore'
        ? buildClaymoreChampion(id, name, sprite)
        : buildBladeChampion(id, name, sprite);
    case 'bow':
      return form === 'longbow'
        ? buildLongbowChampion(id, name, sprite)
        : buildBowChampion(id, name, sprite, volley);
    case 'magic':
      return buildMagicChampion(id, name, sprite);
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
    rarity: 'hero',
    damage: 18,
    attackSpeed: 1.1,
    range: 64,
    targeting: 'first',
    aoe: 'single',
    attackType: 'melee',
    damageType: 'physical',
    cost: 0,
    deployLimit: 1,
    maxMana: HERO_BASE_MANA,
    upgrades: [
      {
        name: 'Sharper Blades',
        description: 'Sharpen the swords edge, allowing it to cut deeper.',
        cost: 40,
        damage: 9,
      },
      {
        name: 'Flourishing Blades',
        description: 'A faster two-blade rhythm for quicker and harder strikes.',
        cost: 55,
        damage: 5,
        attackSpeed: 0.2,
      },
      {
        // Tier 3 grants no stat boost — it unlocks the Cyclone Slash *ability*,
        // a player-triggered whirlwind cut. `cost` is read as the EXP threshold
        // the hero pools to auto-level into this tier.
        name: 'Cyclone Slash',
        description:
          'Unlocks Cyclone Slash.',
        cost: 100,
        ability: {
          id: 'cyclone-slash',
          name: 'Cyclone Slash',
          description:
            'A whirling cyclone that strikes every enemy in range for ' +
            '1.5× the champion’s damage.',
          damageMult: 1.5,
          cooldown: 12,
          manaCost: 30,
          icon: '🌀',
          image: '/cyclone_slash.png',
        },
      },
    ],
    visual,
  };
}

/**
 * The Blade adventurer re-armed with a giant two-handed claymore (the `claymore`
 * mastery node). Same id, mastery and team slot as the dual-blade form, but a
 * different fighter: each slow, wound-up swing cleaves every foe in a wide arc
 * in front of it (`cone` AoE, resolved by the engine as an instant melee cleave
 * after a heft wind-up).
 */
function buildClaymoreChampion(
  id: string,
  name: string,
  sprite: PlayerSpriteConfig,
): UnitDef {
  const visual: UnitVisual = {
    color: sprite.outfitColor,
    icon: '⚔️',
    shape: 'player-claymore',
    playerConfig: sprite,
  };
  return {
    id,
    name,
    description:
      'A towering two-handed claymore, swung in slow, crushing arcs that ' +
      'cleave every foe in front of you.',
    rarity: 'hero',
    damage: 26,
    attackSpeed: 0.5,
    range: 76,
    targeting: 'first',
    aoe: 'cone',
    coneAngle: 100,
    attackType: 'melee',
    damageType: 'physical',
    cost: 0,
    deployLimit: 1,
    maxMana: HERO_BASE_MANA,
    upgrades: [
      {
        name: 'Sharper Blade',
        description: 'Sharpen the claymore’s edge, allowing it to strike with greater force.',
        cost: 40,
        damage: 14,
      },
      {
        name: 'Longer Edge',
        description: 'Lengthen the blade to reach distant foes and deliver stronger blows.',
        cost: 55,
        damage: 6,
        range: 12,
      },
      {
        // Tier 3 grants no stat boost — it unlocks the Earthsplitter *ability*.
        // `cost` is read as the EXP threshold the hero pools to auto-level.
        name: 'Earthsplitter',
        description:
          'Unlocks Earthsplitter',
        cost: 100,
        ability: {
          id: 'earthsplitter',
          name: 'Earthsplitter',
          description:
            'Slams the claymore down causing a fissure that runs out to 2× your range, striking ' +
            'every enemy along it for 2.25× damage and knocking them back.',
          damageMult: 2.25,
          reachMult: 2,
          aoeWidth: 16,
          knockback: 28,
          cooldown: 16,
          manaCost: 35,
          icon: '💥',
          image: '/earth_splitter.png',
        },
      },
    ],
    visual,
  };
}

/** Number words for the Bow adventurer's volley size in its description. */
const VOLLEY_WORDS: Record<number, string> = { 3: 'three', 4: 'four', 5: 'five', 6: 'six' };

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
  volley = 3,
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
      `A nimble archer with a shortbow, loosing arrows in quick bursts of ${VOLLEY_WORDS[volley] ?? volley}.`,
    // The exclusive Champion rarity — the player's own adventurer, never summoned.
    rarity: 'hero',
    // Per-arrow damage; a volley lands three of these in quick succession.
    damage: 7,
    // Governs how often the whole 3-arrow burst repeats (not the per-arrow rate).
    attackSpeed: 0.8,
    range: 112,
    targeting: 'first',
    aoe: 'single',
    attackType: 'ranged',
    damageType: 'physical',
    burst: 3,
    cost: 0,
    deployLimit: 1,
    maxMana: HERO_BASE_MANA,
    upgrades: [
      {
        name: 'Keen Broadheads',
        description: 'Sharper arrowheads bite deeper.',
        cost: 30,
        damage: 4,
      },
      {
        name: 'Stronger String',
        description: 'Stronger String sends arrows flying farther.',
        cost: 35,
        range: 22,
      },
      {
        // Tier 3 grants no stat boost — it unlocks the Quickdraw *ability*, a
        // player-triggered burst of blistering fire speed. `cost` is read as the
        // EXP threshold the hero pools to auto-level into this tier.
        name: 'Quickdraw',
        description:
          'Unlocks Quickdraw.',
        cost: 85,
        ability: {
          id: 'quickdraw',
          name: 'Quickdraw',
          description:
            'Enter a rapid-fire stance, increasing attack speed by 2.5x for 6 seconds.',
          speedMult: 2.5,
          duration: 6,
          cooldown: 15,
          manaCost: 25,
          icon: '🏹',
          image: '/quickdraw.png',
        },
      },
    ],
    visual,
  };
}

/**
 * The Bow adventurer re-armed with a towering longbow (the `longbow` mastery
 * node). Same id, mastery and team slot as the shortbow form, but a different
 * archer: no bursts — each shot is a slow, full draw (a visible charge, see the
 * engine's `LONGBOW_DRAW_TIME`) loosing one big, heavy arrow from an enormous
 * range. Its ability nocks piercing arrows that fly on to the end of its range.
 */
function buildLongbowChampion(
  id: string,
  name: string,
  sprite: PlayerSpriteConfig,
): UnitDef {
  const visual: UnitVisual = {
    color: sprite.outfitColor,
    icon: '🏹',
    shape: 'player-longbow',
    playerConfig: sprite,
  };
  return {
    id,
    name,
    description:
      'A towering longbow, drawn slow and loosed hard, heavy arrows that ' +
      'strike from farther than anyone can reach.',
    rarity: 'hero',
    damage: 36,
    attackSpeed: 0.35,
    range: 230,
    targeting: 'first',
    aoe: 'single',
    attackType: 'ranged',
    damageType: 'physical',
    cost: 0,
    deployLimit: 1,
    maxMana: HERO_BASE_MANA,
    upgrades: [
      {
        name: 'Heavy Draw',
        description: 'Draw the bowstring with greater force, increasing the damage of every arrow.',
        cost: 30,
        damage: 14,
      },
      {
        name: 'Longer Reach',
        description: 'Extend the longbow’s effective range, allowing arrows to travel farther while dealing slightly more damage.',
        cost: 35,
        damage: 4,
        range: 30,
      },
      {
        // Tier 3 grants no stat boost — it unlocks the Piercing Shot *ability*.
        // `cost` is read as the EXP threshold the hero pools to auto-level.
        name: 'Piercing Shot',
        description: 'Unlocks Piercing Shot.',
        cost: 85,
        ability: {
          id: 'piercing-shot',
          name: 'Piercing Shot',
          description:
            'Your next 3 arrows pierce every enemy in their path, flying on to the end of your reach.',
          charges: 3,
          cooldown: 16,
          manaCost: 30,
          icon: '🎯',
        },
      },
    ],
    visual,
  };
}

/**
 * The Magic adventurer: a staff-less spellcaster who conjures a magic orb in bare
 * hands. Each attack is a slow-charging orb (a visible wind-up) that drifts toward
 * the target and *detonates* on impact, dealing its damage to every foe within a
 * circle (`circle` AoE / `burstRadius`). Balanced as a premium single-hero AoE
 * caster — pricey and slow, but the only champion that clears a clustered pack in
 * one cast. Magic damage; the orb reads in the caster's own colour.
 */
function buildMagicChampion(
  id: string,
  name: string,
  sprite: PlayerSpriteConfig,
): UnitDef {
  const visual: UnitVisual = {
    // Accent colour tints the orb, its detonation and the selection glow — the
    // orb is drawn in the player's own colour. The board figure is drawn from
    // `playerConfig`, not this flat colour.
    color: sprite.outfitColor,
    icon: '🔮',
    shape: 'player-magic',
    playerConfig: sprite,
  };
  return {
    id,
    name,
    description:
      'A staff-less mage who gathers magic and hurls it to ' +
      'burst over a cluster of foes.',
    // The exclusive Champion rarity — the player's own adventurer, never summoned.
    rarity: 'hero',
    // Damage dealt to every enemy caught in the orb's detonation.
    damage: 16,
    attackSpeed: 0.55,
    range: 104,
    targeting: 'first',
    aoe: 'circle',
    burstRadius: 46,
    attackType: 'ranged',
    damageType: 'magic',
    cost: 0,
    deployLimit: 1,
    maxMana: HERO_BASE_MANA,
    upgrades: [
      {
        name: 'Dense Core',
        description: 'A tighter-wound orb detonates harder.',
        cost: 40,
        damage: 8,
      },
      {
        name: 'Swift Casting',
        description: 'A practised hand gathers the orb faster for quicker bursts.',
        cost: 65,
        attackSpeed: 0.2,
      },
      {
        // Tier 3 grants no stat boost — it unlocks the Mana Ray *ability*, a
        // channelled beam. `cost` is read as the EXP threshold the hero pools to
        // auto-level into this tier.
        name: 'Mana Ray',
        description:
          'Unlocks Mana Ray - channels a continuous beam of raw mana, searing every foe that walks through it.',
        cost: 125,
        ability: {
          id: 'mana-ray',
          name: 'Mana Ray',
          description:
            'Channels a fixed beam for 3s, striking every enemy in its line for ' +
            '1.25× damage every 0.4s.',
          damageMult: 1.25,
          duration: 3,
          aoeWidth: 18,
          tickInterval: 0.4,
          cooldown: 14,
          manaCost: 40,
          icon: '🔆',
          image: '/mana_ray.png',
        },
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
 * Rebuild the registry to match the current profile + owned set + worn armor
 * (the armor's stat bonuses apply to every player champion). Registers a def
 * for every *owned* player-champion id (so an owned Blade champion still resolves
 * after the player switches proficiency), plus the current proficiency's champion
 * (so a freshly-chosen path resolves even in the same tick it is granted). `forms`
 * maps a champion id to the weapon form its active mastery grants (the Blade's
 * Claymore), `volleys` to the burst size it sets (the Bow's Fourfold Volley, for
 * the description). Clears everything when there is no profile. Idempotent — safe to
 * call on every commit.
 */
export function syncPlayerChampions(
  source: PlayerChampionSource | null,
  ownedUnits: readonly string[],
  armor: readonly ArmorPiece[] = [],
  forms: Readonly<Record<string, HeroWeaponForm | undefined>> = {},
  volleys: Readonly<Record<string, number | undefined>> = {},
): void {
  registry.clear();
  if (!source) return;
  const ids = new Set(ownedUnits.filter(isPlayerChampionId));
  const currentId = implementedPlayerChampionId(source.proficiency);
  if (currentId) ids.add(currentId);
  for (const id of ids) {
    const def = buildPlayerChampionDef(id, source.name, source.sprite, forms[id], volleys[id]);
    if (def) registry.set(id, applyArmor(def, armor));
  }
}

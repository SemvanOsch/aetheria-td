/**
 * The shipped content: the game's catalogs exactly as `src/domain` builds them,
 * converted to a project. Read once at startup — the editor's baseline, the
 * target of "reset to shipped", and the base text of the source export.
 */

import { REGULAR_ENEMIES, BOSS_META } from '@game/domain/enemies';
import { UNITS, type UnitDef } from '@game/domain/units';
import { MASTERY_TREES } from '@game/domain/mastery';
import {
  PLAYER_CHAMPION_IDS,
  buildPlayerChampionDef,
  type HeroWeaponForm,
} from '@game/domain/playerChampion';
import { defaultPlayerSprite } from '@game/domain/playerSprite';
import type { ContentProject } from './types';
import { levelFromDef, shippedLevelDefs } from './convert';
import { clone } from './util';
import { specOrder } from '../export/sourceExport';
import { SHIPPED_SOURCES } from '../export/sources';

let cached: ContentProject | null = null;

/** Stages in the order `levels.ts` authors them, archived ones in their place. */
function shippedLevels() {
  const levels = shippedLevelDefs().map(({ def, archived }) => levelFromDef(def, archived));
  let order: number[] = [];
  try {
    order = specOrder(SHIPPED_SOURCES.levels);
  } catch {
    // An unexpected file layout only affects ordering here; the source export reports it.
  }
  const rank = (id: number) => {
    const i = order.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return levels.map((l, i) => ({ l, i })).sort((a, b) => rank(a.l.id) - rank(b.l.id) || a.i - b.i).map(({ l }) => l);
}

/** The shipped content as a fresh, independent project. */
export function loadShippedProject(): ContentProject {
  if (!cached) {
    cached = {
      levels: shippedLevels(),
      enemies: REGULAR_ENEMIES.map((e) => clone(e)),
      bosses: BOSS_META.map((m) => clone(m)),
      units: Object.values(UNITS).map((u) => clone(u)),
      mastery: clone(MASTERY_TREES),
    };
    Object.freeze(cached);
  }
  return clone(cached);
}

/** A hero champion as the game builds it, for reference (read-only). */
export interface HeroInfo {
  id: string;
  /** The weapon form this def is for (`undefined` = the base weapon). */
  form?: HeroWeaponForm;
  def: UnitDef;
}

const HERO_FORMS: Record<string, (HeroWeaponForm | undefined)[]> = {
  'player-blade': [undefined, 'claymore'],
  'player-bow': [undefined, 'longbow'],
  'player-magic': [undefined, 'staff'],
};

let heroCache: HeroInfo[] | null = null;

/**
 * The code-built hero champions (`domain/playerChampion.ts`) in every weapon
 * form, built with the default portrait. They are reference data: their kits
 * live in code, only their mastery trees are content.
 */
export function heroChampions(): HeroInfo[] {
  if (!heroCache) {
    const sprite = defaultPlayerSprite();
    heroCache = [];
    for (const id of Object.values(PLAYER_CHAMPION_IDS)) {
      for (const form of HERO_FORMS[id] ?? [undefined]) {
        const def = buildPlayerChampionDef(id, 'Adventurer', sprite, form);
        if (def) heroCache.push({ id, form, def });
      }
    }
  }
  return heroCache;
}

/** The base-form def of each hero id. */
export function heroBaseDefs(): UnitDef[] {
  return heroChampions().filter((h) => !h.form).map((h) => h.def);
}

export const isHeroId = (id: string) => Object.values(PLAYER_CHAMPION_IDS).includes(id);

/**
 * Points the game's catalogs at a project, so the real `GameEngine` and
 * renderer preview and test-play draft content.
 *
 * The engine resolves foes through `getEnemy` (the `ENEMIES` record), champions
 * through `getUnit` (`UNITS`, then the hero registry) and skill trees through
 * `masteryTree` (`MASTERY_TREES`). The editor is its own bundle with its own
 * copies of those modules, so rewriting the records in place here affects the
 * editor only — never the game, its saves, or another tab. Call it before
 * building an engine; it is cheap.
 */

import { ENEMIES, REGULAR_ENEMIES, BOSS_ENEMIES } from '@game/domain/enemies';
import { UNITS, ALL_UNITS } from '@game/domain/units';
import { MASTERY_TREES, activeMasteryUpgrades, masteryWeaponForm, type MasteryUpgradeDef } from '@game/domain/mastery';
import { LEVELS } from '@game/domain/levels';
import { syncPlayerChampions, PLAYER_CHAMPION_IDS, type HeroWeaponForm } from '@game/domain/playerChampion';
import { defaultPlayerSprite } from '@game/domain/playerSprite';
import type { ContentProject } from '../model/types';
import { enemyCatalog, levelOrder, levelToDef } from '../model/convert';
import { clone } from '../model/util';
import { loadShippedProject } from '../model/shipped';

function replaceRecord<T>(target: Record<string, T>, next: Record<string, T>) {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, next);
}

function replaceArray<T>(target: T[], next: T[]) {
  target.splice(0, target.length, ...next);
}

let installed: ContentProject | null = null;

/** Install a project into the editor's copy of the game catalogs. */
export function installProject(project: ContentProject): void {
  if (installed === project) return;
  // Snapshot the shipped content before the first rewrite (it reads the records).
  loadShippedProject();
  const enemies = enemyCatalog(project);
  replaceRecord(ENEMIES, clone(enemies));
  replaceArray(REGULAR_ENEMIES, project.enemies.map((e) => ENEMIES[e.id]));
  replaceArray(BOSS_ENEMIES, project.bosses.map((b) => ENEMIES[`boss${b.level}`]));
  replaceRecord(UNITS, Object.fromEntries(project.units.map((u) => [u.id, clone(u)])));
  replaceArray(ALL_UNITS, Object.values(UNITS));
  replaceRecord(MASTERY_TREES, clone(project.mastery));
  replaceArray(
    LEVELS,
    project.levels.filter((l) => !l.archived).map((l) => levelToDef(clone(l), levelOrder(project, l))),
  );
  installed = project;
}

/** How much mastery a test play applies. */
export type MasteryMode = 'none' | 'all';

/**
 * Every champion's learned nodes for a test play: none, or the whole tree
 * learned (with the first member of each exclusive group active, as in-game).
 * `picks` overrides which member of a group is active, by node id.
 */
export function testMastery(
  project: ContentProject,
  mode: MasteryMode,
  picks: readonly string[] = [],
): Record<string, string[]> {
  if (mode === 'none') return {};
  const out: Record<string, string[]> = {};
  for (const [unitId, nodes] of Object.entries(project.mastery)) {
    const all = (nodes as MasteryUpgradeDef[]).map((n) => n.id);
    out[unitId] = activeMasteryUpgrades(unitId, all, picks);
  }
  return out;
}

/**
 * Register the three hero champions (default portrait) for a test play, in the
 * weapon form their applied mastery grants. Call after `installProject`.
 */
export function installHeroes(mastery: Record<string, string[]>): void {
  const ids = Object.values(PLAYER_CHAMPION_IDS);
  const forms: Record<string, HeroWeaponForm | undefined> = {};
  for (const id of ids) forms[id] = masteryWeaponForm(id, mastery[id] ?? []);
  syncPlayerChampions({ name: 'Adventurer', sprite: defaultPlayerSprite(), proficiency: 'sword' }, ids, [], forms);
}

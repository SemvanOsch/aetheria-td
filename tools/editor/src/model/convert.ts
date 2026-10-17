/**
 * Conversions between the editor's project model and the game's runtime defs.
 * They mirror `buildLevels`/`specLanes` (domain/levels.ts) and `bossDefFromMeta`
 * (domain/enemies.ts) exactly — reusing the latter directly — so whatever the
 * editor previews and test-plays is what the game will build from the export.
 */

import { ARCHIVED_LEVELS, LEVELS, STARTING_GOLD, type LevelDef } from '@game/domain/levels';
import { bossIdForLevel, bossDefFromMeta, type BossMeta, type EnemyDef } from '@game/domain/enemies';
import type { ContentProject, EditorLevel } from './types';
import { clone, stripUndefined } from './util';
import { sectionColor } from './catalog';

export { STARTING_GOLD };

/** A runtime `LevelDef` as an editor level. */
export function levelFromDef(def: LevelDef, archived = false): EditorLevel {
  return stripUndefined({
    id: def.id,
    section: def.section,
    name: def.name,
    subtitle: def.subtitle,
    baseHealth: def.baseHealth,
    gem: def.gemReward,
    startingGold: def.startingGold,
    color: def.color,
    bossId: def.bossId,
    lanes: def.lanes.map((l) =>
      stripUndefined({ path: clone(l.pathTurns), waves: clone(l.waves), revealAtWave: l.revealAtWave, emerge: l.emerge }),
    ),
    theme: clone(def.theme),
    decor: clone(def.decor),
    mood: def.mood,
    ending: def.ending,
    bossHaltAt: clone(def.bossHaltAt),
    victoryLine: def.victoryLine,
    mist: def.mist,
    archived: archived || undefined,
  });
}

/**
 * An editor level as the runtime `LevelDef` the engine plays. `order` is its
 * 1-based position among the project's active stages of its section.
 */
export function levelToDef(level: EditorLevel, order = 1): LevelDef {
  return {
    id: level.id,
    section: level.section,
    order,
    name: level.name,
    subtitle: level.subtitle,
    lanes: level.lanes.map((l) => ({ pathTurns: l.path, waves: l.waves, revealAtWave: l.revealAtWave, emerge: l.emerge })),
    baseHealth: level.baseHealth,
    startingGold: level.startingGold,
    gemReward: level.gem,
    bossId: level.bossId,
    color: level.color,
    theme: level.theme,
    decor: level.decor,
    mood: level.mood,
    ending: level.ending,
    bossHaltAt: level.bossHaltAt,
    victoryLine: level.victoryLine,
    mist: level.mist,
  };
}

/** A level's 1-based position among the active stages of its section. */
export function levelOrder(project: ContentProject, level: EditorLevel): number {
  const same = project.levels.filter((l) => l.section === level.section && !l.archived);
  const i = same.indexOf(level);
  return i < 0 ? 0 : i + 1;
}

/** Defaults `buildLevels` fills in for a level that leaves them out. */
export function levelDefaults(level: Pick<EditorLevel, 'id' | 'section'>) {
  return { startingGold: STARTING_GOLD, color: sectionColor(level.section), bossId: bossIdForLevel(level.id) };
}

/** The boss at position `index` in the project's boss list, as an enemy def. */
export function bossDef(meta: BossMeta, index: number): EnemyDef {
  return stripUndefined(bossDefFromMeta(meta, index));
}

/** The curve's default for each boss stat at list position `index`. */
export function bossCurve(index: number): Required<Pick<BossMeta, 'health' | 'speed' | 'reward' | 'mana' | 'damageToBase' | 'radius'>> {
  const d = bossDefFromMeta({ level: 0, name: '', icon: '', color: '' }, index);
  return {
    health: d.health,
    speed: d.speed,
    reward: d.reward,
    mana: d.mana ?? 0,
    damageToBase: d.damageToBase,
    radius: d.radius,
  };
}

/** Every enemy the project defines (regulars, then bosses), keyed by id. */
export function enemyCatalog(project: ContentProject): Record<string, EnemyDef> {
  const out: Record<string, EnemyDef> = {};
  for (const e of project.enemies) out[e.id] = e;
  project.bosses.forEach((m, i) => {
    out[bossIdForLevel(m.level)] = bossDef(m, i);
  });
  return out;
}

/** Shipped stages, active then archived. */
export function shippedLevelDefs(): { def: LevelDef; archived: boolean }[] {
  return [...LEVELS.map((def) => ({ def, archived: false })), ...ARCHIVED_LEVELS.map((def) => ({ def, archived: true }))];
}

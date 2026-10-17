/**
 * Edit recipes: immutable updates of one entity at a time. Each helper clones
 * only the entity it touches and lets the caller mutate that copy, so forms
 * stay simple (`draft.lanes[0].waves[2].groups[1].count = 5`) while the
 * project as a whole stays immutable for undo/redo.
 */

import type { BossMeta, EnemyDef } from '@game/domain/enemies';
import type { UnitDef } from '@game/domain/units';
import type { MasteryUpgradeDef } from '@game/domain/mastery';
import type { ContentProject, EditorLevel } from '../model/types';
import { clone } from '../model/util';
import { editor } from './projectStore';

type Recipe = (p: ContentProject) => ContentProject;

export function withLevel(id: number, fn: (draft: EditorLevel) => void): Recipe {
  return (p) => {
    const i = p.levels.findIndex((l) => l.id === id);
    if (i < 0) return p;
    const draft = clone(p.levels[i]);
    fn(draft);
    const levels = p.levels.slice();
    levels[i] = draft;
    return { ...p, levels };
  };
}

export function withEnemy(id: string, fn: (draft: EnemyDef) => void): Recipe {
  return (p) => {
    const i = p.enemies.findIndex((e) => e.id === id);
    if (i < 0) return p;
    const draft = clone(p.enemies[i]);
    fn(draft);
    const enemies = p.enemies.slice();
    enemies[i] = draft;
    return { ...p, enemies };
  };
}

export function withBoss(level: number, fn: (draft: BossMeta) => void): Recipe {
  return (p) => {
    const i = p.bosses.findIndex((b) => b.level === level);
    if (i < 0) return p;
    const draft = clone(p.bosses[i]);
    fn(draft);
    const bosses = p.bosses.slice();
    bosses[i] = draft;
    return { ...p, bosses };
  };
}

export function withUnit(id: string, fn: (draft: UnitDef) => void): Recipe {
  return (p) => {
    const i = p.units.findIndex((u) => u.id === id);
    if (i < 0) return p;
    const draft = clone(p.units[i]);
    fn(draft);
    const units = p.units.slice();
    units[i] = draft;
    return { ...p, units };
  };
}

export function withTree(unitId: string, fn: (draft: MasteryUpgradeDef[]) => void): Recipe {
  return (p) => {
    const draft = clone(p.mastery[unitId] ?? []);
    fn(draft);
    return { ...p, mastery: { ...p.mastery, [unitId]: draft } };
  };
}

/** Shorthands that apply straight to the store. `key` coalesces typing. */
export const edit = {
  level: (id: number, label: string, fn: (d: EditorLevel) => void, key?: string) =>
    editor.edit(label, withLevel(id, fn), key && `level:${id}:${key}`),
  enemy: (id: string, label: string, fn: (d: EnemyDef) => void, key?: string) =>
    editor.edit(label, withEnemy(id, fn), key && `enemy:${id}:${key}`),
  boss: (level: number, label: string, fn: (d: BossMeta) => void, key?: string) =>
    editor.edit(label, withBoss(level, fn), key && `boss:${level}:${key}`),
  unit: (id: string, label: string, fn: (d: UnitDef) => void, key?: string) =>
    editor.edit(label, withUnit(id, fn), key && `unit:${id}:${key}`),
  tree: (unitId: string, label: string, fn: (d: MasteryUpgradeDef[]) => void, key?: string) =>
    editor.edit(label, withTree(unitId, fn), key && `tree:${unitId}:${key}`),
  project: (label: string, recipe: Recipe) => editor.edit(label, recipe),
};

/** Set or clear an optional property (empty/undefined removes it). */
export function setOpt<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined) {
  if (value === undefined || (value as unknown) === '' || (typeof value === 'number' && Number.isNaN(value))) delete obj[key];
  else obj[key] = value;
}

/**
 * Rename an enemy id everywhere it is referenced (waves, summons, stage
 * bosses), as one recipe.
 */
export function renameEnemy(oldId: string, newId: string): Recipe {
  return (p) => {
    const levels = p.levels.map((l) => {
      const touches = l.bossId === oldId || l.lanes.some((ln) => ln.waves.some((w) => w.groups.some((g) => g.enemyId === oldId)));
      if (!touches) return l;
      const d = clone(l);
      if (d.bossId === oldId) d.bossId = newId;
      for (const ln of d.lanes) for (const w of ln.waves) for (const g of w.groups) if (g.enemyId === oldId) g.enemyId = newId;
      return d;
    });
    const enemies = p.enemies.map((e) => {
      const d = e.id === oldId || e.summon?.enemyId === oldId ? clone(e) : e;
      if (d.id === oldId) d.id = newId;
      if (d.summon?.enemyId === oldId) d.summon.enemyId = newId;
      return d;
    });
    const bosses = p.bosses.map((b) => {
      if (b.summon?.enemyId !== oldId) return b;
      const d = clone(b);
      d.summon!.enemyId = newId;
      return d;
    });
    return { ...p, levels, enemies, bosses };
  };
}

/** Re-key a boss to another stage number (its id becomes boss<level>), updating stage references. */
export function renumberBoss(oldLevel: number, newLevel: number): Recipe {
  return (p) => {
    const moved = renameEnemy(`boss${oldLevel}`, `boss${newLevel}`)(p);
    return { ...moved, bosses: moved.bosses.map((b) => (b.level === oldLevel ? { ...clone(b), level: newLevel } : b)) };
  };
}

/** Rename a champion id, carrying its skill tree along. */
export function renameUnit(oldId: string, newId: string): Recipe {
  return (p) => {
    const units = p.units.map((u) => (u.id === oldId ? { ...clone(u), id: newId } : u));
    const mastery: ContentProject['mastery'] = {};
    for (const [k, v] of Object.entries(p.mastery)) mastery[k === oldId ? newId : k] = v;
    return { ...p, units, mastery };
  };
}

/** Change a stage id (selection and keyed references follow the new id). */
export function renumberLevel(oldId: number, newId: number): Recipe {
  return (p) => ({ ...p, levels: p.levels.map((l) => (l.id === oldId ? { ...clone(l), id: newId } : l)) });
}

/**
 * A project as a set of addressable entities — one per stage, foe, boss,
 * champion and skill tree — plus the order of each collection. Drafts store a
 * hash of every shipped entity they started from (their *baseline*), which is
 * what lets `rebaseProject` carry a draft onto newer shipped content entity by
 * entity, and what the source export uses to touch only what changed.
 */

import type { ContentProject, EditorLevel, EntityKind } from './types';
import type { BossMeta, EnemyDef } from '@game/domain/enemies';
import type { UnitDef } from '@game/domain/units';
import type { MasteryUpgradeDef } from '@game/domain/mastery';
import { hashValue } from './util';

export type EntityKey = `${EntityKind}:${string}`;

export const levelKey = (id: number): EntityKey => `level:${id}`;
export const enemyKey = (id: string): EntityKey => `enemy:${id}`;
export const bossKey = (level: number): EntityKey => `boss:${level}`;
export const unitKey = (id: string): EntityKey => `unit:${id}`;
export const masteryKey = (unitId: string): EntityKey => `mastery:${unitId}`;

type Collection = 'levels' | 'enemies' | 'bosses' | 'units' | 'mastery';
const COLLECTIONS: Collection[] = ['levels', 'enemies', 'bosses', 'units', 'mastery'];

/** Each collection's entities, in order, as [key, value] pairs. */
function entries(p: ContentProject): Record<Collection, [EntityKey, unknown][]> {
  return {
    levels: p.levels.map((l) => [levelKey(l.id), l]),
    enemies: p.enemies.map((e) => [enemyKey(e.id), e]),
    bosses: p.bosses.map((b) => [bossKey(b.level), b]),
    units: p.units.map((u) => [unitKey(u.id), u]),
    mastery: Object.entries(p.mastery).map(([id, nodes]) => [masteryKey(id), nodes]),
  };
}

function assemble(e: Record<Collection, [EntityKey, unknown][]>): ContentProject {
  const tail = (k: EntityKey) => k.slice(k.indexOf(':') + 1);
  return {
    levels: e.levels.map(([, v]) => v as EditorLevel),
    enemies: e.enemies.map(([, v]) => v as EnemyDef),
    bosses: e.bosses.map(([, v]) => v as BossMeta),
    units: e.units.map(([, v]) => v as UnitDef),
    mastery: Object.fromEntries(e.mastery.map(([k, v]) => [tail(k), v as MasteryUpgradeDef[]])),
  };
}

/** Hashes of a project's entities, plus `order:<collection>` for each order. */
export type Baseline = Record<string, string>;

export function baselineOf(p: ContentProject): Baseline {
  const out: Baseline = {};
  const all = entries(p);
  for (const c of COLLECTIONS) {
    for (const [k, v] of all[c]) out[k] = hashValue(v);
    out[`order:${c}`] = hashValue(all[c].map(([k]) => k));
  }
  return out;
}

export interface RebaseNote {
  key: string;
  kind: 'updated' | 'added' | 'removed' | 'conflict';
  text: string;
}

const describe = (key: string) => {
  const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  const label: Record<string, string> = { level: 'Stage', enemy: 'Foe', boss: 'Boss of stage', unit: 'Champion', mastery: 'Skill tree of' };
  return `${label[kind] ?? kind} ${id}`;
};

/**
 * Carry a draft (made against `baseline`) onto the current shipped content.
 * Per entity: untouched in the draft → take the shipped version (picks up
 * source edits); untouched in source → keep the draft's; changed in both →
 * keep the draft's and report a conflict. The same rule decides each
 * collection's order. Returns the merged project and what happened.
 */
export function rebaseProject(
  draft: ContentProject,
  baseline: Baseline,
  shipped: ContentProject,
): { project: ContentProject; notes: RebaseNote[] } {
  const notes: RebaseNote[] = [];
  const d = entries(draft);
  const s = entries(shipped);
  const out = {} as Record<Collection, [EntityKey, unknown][]>;

  for (const c of COLLECTIONS) {
    const dMap = new Map(d[c]);
    const sMap = new Map(s[c]);
    const result = new Map<EntityKey, unknown>();
    const keys = new Set<EntityKey>([...dMap.keys(), ...sMap.keys()]);
    for (const k of keys) {
      const base = baseline[k];
      const dv = dMap.get(k);
      const sv = sMap.get(k);
      const dh = dv === undefined ? undefined : hashValue(dv);
      const sh = sv === undefined ? undefined : hashValue(sv);
      if (dh === sh) {
        // Same on both sides (including both deleted, or a written-back export).
        if (dv !== undefined) result.set(k, dv);
      } else if (base === undefined) {
        // New since the baseline: in the draft, in source, or (rarely) both.
        if (dv !== undefined && sv !== undefined && dh !== sh) {
          notes.push({ key: k, kind: 'conflict', text: `${describe(k)} was added in source and in your draft; kept your draft's.` });
        } else if (dv === undefined && sv !== undefined) {
          notes.push({ key: k, kind: 'added', text: `${describe(k)} is new in source and was added.` });
        }
        result.set(k, dv ?? sv);
      } else if (sh === base) {
        if (dv !== undefined) result.set(k, dv); // source unchanged: keep the draft (or its deletion)
      } else if (dh === base) {
        // Draft unchanged, source changed: follow source.
        if (sv !== undefined) result.set(k, sv);
        notes.push({ key: k, kind: sv === undefined ? 'removed' : 'updated', text: `${describe(k)} was ${sv === undefined ? 'removed' : 'updated'} in source.` });
      } else {
        if (dv !== undefined) result.set(k, dv);
        else if (sv !== undefined) result.set(k, sv);
        notes.push({ key: k, kind: 'conflict', text: `${describe(k)} changed in source and in your draft; kept your draft's.` });
      }
    }
    // Order: follow source if the draft never reordered, else keep the draft's.
    const draftOrder = d[c].map(([k]) => k);
    const shippedOrder = s[c].map(([k]) => k);
    const lead = baseline[`order:${c}`] === hashValue(draftOrder) ? shippedOrder : draftOrder;
    const ordered: EntityKey[] = [];
    for (const k of [...lead, ...draftOrder, ...shippedOrder]) {
      if (result.has(k) && !ordered.includes(k)) ordered.push(k);
    }
    out[c] = ordered.map((k) => [k, result.get(k)]);
  }
  return { project: assemble(out), notes };
}

/** Whether items present in both projects sit in a different relative order (adding or removing one is not a reorder). */
export function reordered(a: ContentProject, b: ContentProject, c: string): boolean {
  const ka = entries(a)[c as Collection].map(([k]) => k);
  const kb = entries(b)[c as Collection].map(([k]) => k);
  const inB = new Set(kb);
  const inA = new Set(ka);
  const sa = ka.filter((k) => inB.has(k));
  const sb = kb.filter((k) => inA.has(k));
  return sa.some((k, i) => k !== sb[i]);
}

/** Keys of entities that differ between two projects (added, removed or changed). */
export function changedKeys(a: ContentProject, b: ContentProject): Set<string> {
  const ha = baselineOf(a);
  const hb = baselineOf(b);
  const out = new Set<string>();
  for (const k of new Set([...Object.keys(ha), ...Object.keys(hb)])) if (ha[k] !== hb[k]) out.add(k);
  return out;
}

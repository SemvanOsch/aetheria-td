/**
 * Content packs: the editor's versioned JSON format for import/export, sharing
 * and backups.
 *
 *   {
 *     "format": "aetheria-content-pack",
 *     "version": 1,
 *     "kind": "content" | "backup",      // backup = saved as-is, may hold errors
 *     "scope": "full" | "changes",       // changes = only what differs from shipped
 *     "createdAt": "2026-10-17T12:00:00.000Z",
 *     "validation": { "errors": 0, "warnings": 2 },
 *     "content": { levels, enemies, bosses, units, mastery },   // partial for "changes"
 *     "removed": ["enemy:cas_brute"],    // "changes" only: shipped entities deleted
 *     "order": { "levels": ["level:1", …] }  // "changes" only: a collection's full order, when it changed
 *   }
 *
 * A "content" pack is only written from a project with no validation errors,
 * so a pack that says it's content can be trusted as game-ready; a "backup"
 * pack is a snapshot of a draft, errors and all. Older pack versions are
 * upgraded on import by `MIGRATIONS`.
 */

import type { ContentProject } from '../model/types';
import { bossKey, changedKeys, enemyKey, levelKey, masteryKey, unitKey } from '../model/entities';
import { clone, isPlainObject } from '../model/util';
import { countIssues, validateProject } from '../validation/validate';

export const PACK_FORMAT = 'aetheria-content-pack';
export const PACK_VERSION = 1;

const COLLECTION_KEYS = ['levels', 'enemies', 'bosses', 'units', 'mastery'] as const;

export type PackKind = 'content' | 'backup';
export type PackScope = 'full' | 'changes';

export interface ContentPack {
  format: typeof PACK_FORMAT;
  version: number;
  kind: PackKind;
  scope: PackScope;
  createdAt: string;
  validation: { errors: number; warnings: number };
  content: Partial<ContentProject>;
  removed?: string[];
  order?: Partial<Record<Collection, string[]>>;
}

type Collection = (typeof COLLECTION_KEYS)[number];

/** Each collection's entity keys, in project order. */
function keyLists(p: ContentProject): Record<Collection, string[]> {
  return {
    levels: p.levels.map((l) => levelKey(l.id)),
    enemies: p.enemies.map((e) => enemyKey(e.id)),
    bosses: p.bosses.map((b) => bossKey(b.level)),
    units: p.units.map((u) => unitKey(u.id)),
    mastery: Object.keys(p.mastery).map(masteryKey),
  };
}

/** Upgraders from version N to N+1 (none yet: version 1 is the first). */
const MIGRATIONS: Record<number, (pack: Record<string, unknown>) => Record<string, unknown>> = {};

export class PackError extends Error {}

/** Build a pack from a project. Throws if a content pack is asked for with errors. */
export function buildPack(project: ContentProject, shipped: ContentProject, kind: PackKind, scope: PackScope): ContentPack {
  const counts = countIssues(validateProject(project));
  if (kind === 'content' && counts.error > 0) {
    throw new PackError(`The project has ${counts.error} error${counts.error === 1 ? '' : 's'}; fix them first, or download a backup instead.`);
  }
  const pack: ContentPack = {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    kind,
    scope,
    createdAt: new Date().toISOString(),
    validation: { errors: counts.error, warnings: counts.warning },
    content: {},
  };
  if (scope === 'full') {
    pack.content = clone(project);
    return pack;
  }
  const changed = changedKeys(project, shipped);
  const has = (k: string) => changed.has(k);
  pack.content = {
    levels: project.levels.filter((l) => has(levelKey(l.id))).map(clone),
    enemies: project.enemies.filter((e) => has(enemyKey(e.id))).map(clone),
    bosses: project.bosses.filter((b) => has(bossKey(b.level))).map(clone),
    units: project.units.filter((u) => has(unitKey(u.id))).map(clone),
    mastery: Object.fromEntries(Object.entries(project.mastery).filter(([id]) => has(masteryKey(id))).map(([id, n]) => [id, clone(n)])),
  };
  const present = new Set([
    ...project.levels.map((l) => levelKey(l.id)),
    ...project.enemies.map((e) => enemyKey(e.id)),
    ...project.bosses.map((b) => bossKey(b.level)),
    ...project.units.map((u) => unitKey(u.id)),
    ...Object.keys(project.mastery).map(masteryKey),
  ]);
  pack.removed = [...changed].filter((k) => !k.startsWith('order:') && !present.has(k as never));
  const lists = keyLists(project);
  const order: ContentPack['order'] = {};
  for (const c of COLLECTION_KEYS) if (changed.has(`order:${c}`)) order[c] = lists[c];
  if (Object.keys(order).length) pack.order = order;
  return pack;
}

export function packFileName(pack: ContentPack): string {
  const stamp = pack.createdAt.replace(/[:]/g, '-').replace(/\..+$/, '');
  return `aetheria-${pack.kind === 'backup' ? 'backup' : 'content'}${pack.scope === 'changes' ? '-changes' : ''}-${stamp}.json`;
}

export interface ParsedPack {
  pack: ContentPack;
  /** Notes about what parsing changed or noticed (shown to the user). */
  notes: string[];
}

/** Parse and upgrade pack JSON. Throws `PackError` with a readable reason. */
export function parsePack(text: string): ParsedPack {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new PackError(`This isn't valid JSON (${(e as Error).message}).`);
  }
  if (!isPlainObject(raw) || raw.format !== PACK_FORMAT) {
    throw new PackError('This file isn\'t an Aetheria content pack (its "format" field is missing or different).');
  }
  const notes: string[] = [];
  let version = Number(raw.version);
  if (!Number.isInteger(version) || version < 1) throw new PackError(`Unknown pack version "${String(raw.version)}".`);
  if (version > PACK_VERSION) {
    throw new PackError(`The pack is version ${version}, newer than this editor understands (${PACK_VERSION}). Update the editor.`);
  }
  let obj = raw as Record<string, unknown>;
  while (version < PACK_VERSION) {
    const up = MIGRATIONS[version];
    if (!up) throw new PackError(`No upgrade path from pack version ${version}.`);
    obj = up(obj);
    version++;
    notes.push(`Upgraded from pack version ${version - 1} to ${version}.`);
  }
  const content = obj.content;
  if (!isPlainObject(content)) throw new PackError('The pack has no "content" object.');
  for (const k of Object.keys(content)) {
    if (!(COLLECTION_KEYS as readonly string[]).includes(k)) {
      notes.push(`Ignored unknown section "${k}".`);
      delete content[k];
    }
  }
  for (const k of ['levels', 'enemies', 'bosses', 'units'] as const) {
    if (content[k] !== undefined && !Array.isArray(content[k])) throw new PackError(`"content.${k}" must be a list.`);
    if (Array.isArray(content[k]) && (content[k] as unknown[]).some((v) => !isPlainObject(v))) {
      throw new PackError(`"content.${k}" holds an entry that isn't an object.`);
    }
  }
  if (content.mastery !== undefined) {
    if (!isPlainObject(content.mastery)) throw new PackError('"content.mastery" must be an object of skill trees.');
    for (const [id, nodes] of Object.entries(content.mastery)) {
      if (!Array.isArray(nodes)) throw new PackError(`Skill tree "${id}" must be a list of nodes.`);
    }
  }
  const scope: PackScope = obj.scope === 'changes' ? 'changes' : 'full';
  if (scope === 'full') {
    for (const k of COLLECTION_KEYS) {
      if (content[k] === undefined) throw new PackError(`A full pack must contain "content.${k}".`);
    }
  }
  const kind: PackKind = obj.kind === 'backup' ? 'backup' : 'content';
  const removed = Array.isArray(obj.removed) ? obj.removed.filter((r): r is string => typeof r === 'string') : [];
  const order: ContentPack['order'] = {};
  if (isPlainObject(obj.order)) {
    for (const c of COLLECTION_KEYS) {
      const list = obj.order[c];
      if (Array.isArray(list) && list.every((k) => typeof k === 'string')) order[c] = list as string[];
    }
  }
  return {
    pack: {
      format: PACK_FORMAT,
      version: PACK_VERSION,
      kind,
      scope,
      createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
      validation: isPlainObject(obj.validation) ? (obj.validation as ContentPack['validation']) : { errors: 0, warnings: 0 },
      content: content as Partial<ContentProject>,
      removed,
      ...(Object.keys(order).length ? { order } : {}),
    },
    notes,
  };
}

/**
 * Apply a parsed pack: a full pack replaces the project; a changes pack is
 * merged onto `base` (same-id entities replaced, new ones appended, `removed`
 * ones deleted), then arranged by the pack's `order` where it has one;
 * entities the pack doesn't know about keep their order after those.
 */
export function applyPack(pack: ContentPack, base: ContentProject): ContentProject {
  const c = clone(pack.content);
  if (pack.scope === 'full') {
    return { levels: c.levels ?? [], enemies: c.enemies ?? [], bosses: c.bosses ?? [], units: c.units ?? [], mastery: c.mastery ?? {} };
  }
  const removed = new Set(pack.removed ?? []);
  const merge = <T>(list: T[], incoming: T[] | undefined, key: (v: T) => string): T[] => {
    const out = list.filter((v) => !removed.has(key(v)));
    for (const v of incoming ?? []) {
      const i = out.findIndex((o) => key(o) === key(v));
      if (i >= 0) out[i] = v;
      else out.push(v);
    }
    return out;
  };
  const arrange = <T>(list: T[], order: string[] | undefined, key: (v: T) => string): T[] => {
    if (!order) return list;
    const rank = new Map(order.map((k, i) => [k, i]));
    const known = list.filter((v) => rank.has(key(v))).sort((a, b) => rank.get(key(a))! - rank.get(key(b))!);
    return [...known, ...list.filter((v) => !rank.has(key(v)))];
  };
  const o = pack.order ?? {};
  const mastery = Object.fromEntries(Object.entries(base.mastery).filter(([id]) => !removed.has(masteryKey(id))));
  Object.assign(mastery, c.mastery ?? {});
  return {
    levels: arrange(merge(base.levels, c.levels, (l) => levelKey(l.id)), o.levels, (l) => levelKey(l.id)),
    enemies: arrange(merge(base.enemies, c.enemies, (e) => enemyKey(e.id)), o.enemies, (e) => enemyKey(e.id)),
    bosses: arrange(merge(base.bosses, c.bosses, (b) => bossKey(b.level)), o.bosses, (b) => bossKey(b.level)),
    units: arrange(merge(base.units, c.units, (u) => unitKey(u.id)), o.units, (u) => unitKey(u.id)),
    mastery: Object.fromEntries(arrange(Object.entries(mastery), o.mastery, ([id]) => masteryKey(id))),
  };
}

/** Remove every field the game doesn't read (as the validator lists them). */
export function stripUnsupported(project: ContentProject): { project: ContentProject; removed: number } {
  const issues = validateProject(project).filter((i) => i.message.startsWith('Unsupported field'));
  if (issues.length === 0) return { project, removed: 0 };
  const p = clone(project);
  let removed = 0;
  for (const issue of issues) {
    const target = resolveEntity(p, issue.entity);
    if (!target || !issue.field) continue;
    const parts = issue.field.split('.');
    const key = parts.pop()!;
    let obj: unknown = target;
    for (const part of parts) obj = (obj as Record<string, unknown> | undefined)?.[part];
    if (isPlainObject(obj) && key in obj) {
      delete obj[key];
      removed++;
    }
  }
  return { project: p, removed };
}

function resolveEntity(p: ContentProject, entity: string): unknown {
  const [kind, id] = [entity.slice(0, entity.indexOf(':')), entity.slice(entity.indexOf(':') + 1)];
  switch (kind) {
    case 'level':
      return p.levels.find((l) => String(l.id) === id);
    case 'enemy':
      return p.enemies.find((e) => e.id === id);
    case 'boss':
      return p.bosses.find((b) => String(b.level) === id);
    case 'unit':
      return p.units.find((u) => u.id === id);
    case 'mastery':
      // Tree issues use "nodes.<i>.field" paths.
      return { nodes: p.mastery[id] };
    default:
      return undefined;
  }
}

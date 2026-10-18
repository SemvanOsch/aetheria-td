/**
 * Source export: turns a project back into the game's own TypeScript catalogs.
 *
 * Each catalog file is patched in place (see `patch.ts`) against the shipped
 * content it was loaded from: entities you didn't touch stay byte-for-byte as
 * they are (comments included), changed entities are patched property by
 * property, and new ones are printed in the file's house style. The result is a
 * complete file per catalog, ready to review as a diff and drop into
 * `src/domain`. Pure functions — no browser APIs — so `npm run editor:check`
 * can run the same code in Node.
 */

import { bossIdForLevel } from '@game/domain/enemies';
import { STARTING_GOLD, type SectionId } from '@game/domain/levels';
import type { ContentProject, EditorLevel } from '../model/types';
import { EFFECT_FIELDS, SECTIONS, sectionColor } from '../model/catalog';
import { changedKeys, reordered } from '../model/entities';
import { isPlainObject, stripUndefined } from '../model/util';
import { findInitializer, parseLiteral, readSimpleValue, ScanError, type Literal } from './tsScan';
import { Raw, type Path } from './tsEmit';
import { patchValue, type PatchStyle } from './patch';

export const SOURCE_FILES = {
  levels: 'src/domain/levels.ts',
  enemies: 'src/domain/enemies.ts',
  units: 'src/domain/units.ts',
  mastery: 'src/domain/mastery.ts',
} as const;

export type SourceName = keyof typeof SOURCE_FILES;
export type SourceTexts = Record<SourceName, string>;

export interface SourceFile {
  name: SourceName;
  path: string;
  original: string;
  updated: string;
  changed: boolean;
  /** Readable list of what changed in it. */
  changes: string[];
}

export class ExportError extends Error {}

const SECTION_ARRAYS: Record<SectionId, string> = {
  castle: 'CASTLE_SPECS',
  capital: 'CAPITAL_SPECS',
  forest: 'FOREST_SPECS',
  inn: 'INN_SPECS',
};

// ------------------------------------------------------------ shared plumbing

interface Region {
  start: number;
  end: number;
  oldV: unknown;
  newV: unknown;
  path: Path;
}

function withEol<T>(text: string, fn: (lf: string) => T & { text: string }): T & { text: string } {
  const crlf = text.includes('\r\n');
  const out = fn(crlf ? text.replace(/\r\n/g, '\n') : text);
  return crlf ? { ...out, text: out.text.replace(/\n/g, '\r\n') } : out;
}

function patchRegions(src: string, regions: Region[], style: PatchStyle): string {
  let out = '';
  let cursor = 0;
  for (const r of [...regions].sort((a, b) => a.start - b.start)) {
    out += src.slice(cursor, r.start) + patchValue(src, r.start, r.end, r.oldV, r.newV, r.path, style);
    cursor = r.end;
  }
  return out + src.slice(cursor);
}

function literalAt(src: string, name: string, file: string, bracket: '{' | '['): Literal {
  let at: number;
  try {
    at = findInitializer(src, name);
  } catch (e) {
    throw new ExportError(`${file}: ${(e as Error).message}. The exporter expects the catalog layout of the shipped file.`);
  }
  if (src[at] !== bracket) {
    // e.g. `new Set<number>([...])`: take the first bracket of the call.
    const i = src.indexOf(bracket, at);
    if (i < 0 || i - at > 40) throw new ExportError(`${file}: "${name}" isn't a ${bracket === '{' ? 'object' : 'list'} literal.`);
    at = i;
  }
  return parseLiteral(src, at);
}

/** Copy an object with its keys in `order` first (unknown keys after, in their order). */
function ordered<T extends object>(obj: T, order: readonly string[]): T {
  const out: Record<string, unknown> = {};
  const src = obj as Record<string, unknown>;
  for (const k of order) if (src[k] !== undefined) out[k] = src[k];
  for (const [k, v] of Object.entries(src)) if (!(k in out) && v !== undefined) out[k] = v;
  return out as T;
}

// -------------------------------------------------------------------- levels

const SPEC_ORDER = ['id', 'name', 'subtitle', 'baseHealth', 'gem', 'startingGold', 'color', 'bossId', 'mood', 'mist', 'bossHaltAt', 'ending', 'victoryLine', 'theme', 'decor', 'lanes'];
const GROUP_ORDER = ['enemyId', 'count', 'spacing', 'delay', 'healthMult'];
const PROP_ORDER = ['kind', 'col', 'row', 'color', 'lit'];
const THEME_ORDER = ['groundEven', 'groundOdd', 'path', 'floor', 'pathKind'];

/** A level in `LevelSpec` form (what `levels.ts` authors), optionally single-lane shorthand. */
export function levelToSpec(l: EditorLevel, shorthand = false): Record<string, unknown> {
  const waves = (ws: EditorLevel['lanes'][number]['waves']) => ws.map((w) => ({ groups: w.groups.map((g) => ordered(g, GROUP_ORDER)) }));
  const spec: Record<string, unknown> = {
    id: l.id,
    name: l.name,
    subtitle: l.subtitle,
    baseHealth: l.baseHealth,
    gem: l.gem,
    startingGold: l.startingGold !== STARTING_GOLD ? l.startingGold : undefined,
    color: l.color !== sectionColor(l.section) ? l.color : undefined,
    bossId: l.bossId !== bossIdForLevel(l.id) ? l.bossId : undefined,
    mood: l.mood,
    mist: l.mist,
    bossHaltAt: l.bossHaltAt,
    ending: l.ending,
    victoryLine: l.victoryLine,
    theme: l.theme ? ordered(l.theme, THEME_ORDER) : undefined,
    decor: l.decor?.map((p) => ordered(p, PROP_ORDER)),
  };
  const single = l.lanes.length === 1 && l.lanes[0].revealAtWave === undefined && !l.lanes[0].emerge;
  if (shorthand && single) {
    spec.path = l.lanes[0].path;
    spec.waves = waves(l.lanes[0].waves);
  } else {
    spec.lanes = l.lanes.map((ln) => stripUndefined({ revealAtWave: ln.revealAtWave, emerge: ln.emerge, path: ln.path, waves: waves(ln.waves) }));
  }
  return stripUndefined(ordered(spec, SPEC_ORDER));
}

/** Stage ids in the order `levels.ts` authors them (archived ones in place). */
export function specOrder(levelsText: string): number[] {
  const src = levelsText.replace(/\r\n/g, '\n');
  const ids: number[] = [];
  for (const s of SECTIONS) {
    const lit = literalAt(src, SECTION_ARRAYS[s.id], 'levels.ts', '[');
    for (const it of lit.items) ids.push(specIdAt(src, it.valueStart));
  }
  return ids;
}

function specIdAt(src: string, at: number): number {
  if (src[at] !== '{') throw new ExportError(`levels.ts: a stage spec at offset ${at} isn't an object literal.`);
  const lit = parseLiteral(src, at);
  const idItem = lit.items.find((i) => i.key === 'id');
  const id = idItem ? readSimpleValue(src.slice(idItem.valueStart, idItem.valueEnd)) : undefined;
  if (typeof id !== 'number') throw new ExportError(`levels.ts: couldn't read the id of the stage spec at offset ${at}.`);
  return id;
}

/** `{ cas_grunt: 'CAS.g', … }` from the file's enemy-id shorthand tables. */
function enemyShorthands(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /(^|\n)const ([A-Z][A-Z0-9_]{1,8}) = \{/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const lit = parseLiteral(src, m.index + m[0].length - 1);
    for (const it of lit.items) {
      const v = readSimpleValue(src.slice(it.valueStart, it.valueEnd));
      if (typeof v === 'string' && it.key && !out.has(v)) out.set(v, `${m[2]}.${it.key}`);
    }
  }
  return out;
}

function exportLevels(text: string, shipped: ContentProject, project: ContentProject) {
  return withEol(text, (src) => {
    const short = enemyShorthands(src);
    const style: PatchStyle = {
      unit: '  ',
      width: 200,
      keyOf: (path) => (path.length === 1 && path[0] !== 'DISABLED_LEVEL_IDS' ? (v) => String((v as { id: number }).id) : undefined),
      multiline: (path) => {
        const last = path[path.length - 1];
        if (path.length === 2) return true; // a stage spec
        return last === 'lanes' || last === 'decor' || last === 'theme' || (path[path.length - 2] === 'lanes' && typeof last === 'number') || last === 'waves';
      },
      map: (path, v) => {
        if (path[path.length - 1] !== 'enemyId' || typeof v !== 'string') return undefined;
        const s = short.get(v);
        if (s) return new Raw(s);
        const boss = /^boss(\d+)$/.exec(v);
        return boss ? new Raw(`bossIdForLevel(${boss[1]})`) : undefined;
      },
    };
    const regions: Region[] = [];
    const shippedById = new Map(shipped.levels.map((l) => [l.id, l]));
    for (const s of SECTIONS) {
      const lit = literalAt(src, SECTION_ARRAYS[s.id], 'levels.ts', '[');
      const oldV = lit.items.map((it) => {
        const id = specIdAt(src, it.valueStart);
        const level = shippedById.get(id);
        if (!level) throw new ExportError(`levels.ts: stage ${id} isn't in the loaded content. Reload the editor.`);
        const el = parseLiteral(src, it.valueStart);
        return levelToSpec(level, el.items.some((i) => i.key === 'path'));
      });
      const textForm = new Map(lit.items.map((it) => [specIdAt(src, it.valueStart), parseLiteral(src, it.valueStart).items.some((i) => i.key === 'path')]));
      const newV = project.levels.filter((l) => l.section === s.id).map((l) => levelToSpec(l, textForm.get(l.id) ?? false));
      regions.push({ start: lit.open, end: lit.close + 1, oldV, newV, path: [s.id] });
    }
    const disabled = literalAt(src, 'DISABLED_LEVEL_IDS', 'levels.ts', '[');
    const oldDisabled = shipped.levels.filter((l) => l.archived).map((l) => l.id);
    const newDisabled = project.levels.filter((l) => l.archived).map((l) => l.id);
    if (disabled.items.length === oldDisabled.length) {
      regions.push({ start: disabled.open, end: disabled.close + 1, oldV: oldDisabled, newV: newDisabled, path: ['DISABLED_LEVEL_IDS'] });
    } else throw new ExportError('levels.ts: DISABLED_LEVEL_IDS doesn\'t match the archived stages loaded. Reload the editor.');
    return { text: patchRegions(src, regions, style) };
  }).text;
}

// ------------------------------------------------------------------- enemies

const ENEMY_ORDER = [
  'id', 'name', 'health', 'speed', 'reward', 'mana', 'damageToBase', 'visual', 'boss', 'radius', 'dodgeChance', 'physicalResist',
  'magicResist', 'damageAura', 'shieldHits', 'regen', 'lightSlow', 'unkillable', 'entrance', 'rally', 'summon', 'spit', 'heal',
  'mechanic', 'lore', 'spawnLines', 'deathAnimation', 'deathLine',
];
const BOSS_ORDER = [
  'level', 'name', 'icon', 'color', 'health', 'speed', 'reward', 'mana', 'damageToBase', 'radius', 'dodgeChance', 'physicalResist',
  'magicResist', 'damageAura', 'shieldHits', 'regen', 'lightSlow', 'unkillable', 'entrance', 'rally', 'summon', 'spit', 'heal',
  'mechanic', 'lore', 'spawnLines', 'deathAnimation', 'deathLine',
];

function exportEnemies(text: string, shipped: ContentProject, project: ContentProject) {
  return withEol(text, (src) => {
    const style: PatchStyle = {
      unit: '  ',
      width: 240,
      ordered: (path) => path.length === 1 && path[0] === 'REGULAR',
      keyOf: (path) => (path.length === 1 && path[0] === 'BOSS_META' ? (v) => String((v as { level: number }).level) : undefined),
    };
    const reg = literalAt(src, 'REGULAR', 'enemies.ts', '{');
    const boss = literalAt(src, 'BOSS_META', 'enemies.ts', '[');
    const rec = (list: ContentProject['enemies']) => Object.fromEntries(list.map((e) => [e.id, ordered(e, ENEMY_ORDER)]));
    return {
      text: patchRegions(
        src,
        [
          { start: reg.open, end: reg.close + 1, oldV: rec(shipped.enemies), newV: rec(project.enemies), path: ['REGULAR'] },
          {
            start: boss.open,
            end: boss.close + 1,
            oldV: shipped.bosses.map((b) => ordered(b, BOSS_ORDER)),
            newV: project.bosses.map((b) => ordered(b, BOSS_ORDER)),
            path: ['BOSS_META'],
          },
        ],
        style,
      ),
    };
  }).text;
}

// -------------------------------------------------------------------- units

const UNIT_ORDER = [
  'id', 'name', 'description', 'rarity', 'damage', 'attackSpeed', 'range', 'targeting', 'aoe', 'aoeWidth', 'attackType', 'damageType',
  'bounces', 'coneAngle', 'burstRadius', 'burst', 'shatter', 'special', 'bleed', 'poison', 'vials', 'cost', 'deployLimit', 'maxMana', 'manaRegen', 'generator',
  'bard', 'upgrades', 'visual',
];
const VIAL_ORDER = ['name', 'description', 'color', 'damageMult', 'poison', 'bleed', 'ignoreResist', 'levels'];
const VIAL_LEVEL_ORDER = ['cost', 'damageMult', 'poison', 'bleed'];
const UPGRADE_ORDER = [
  'name', 'description', 'cost', 'damage', 'attackSpeed', 'range', 'generate', 'bounces', 'setAoe', 'bardTargets', 'bardSpeedBonus',
  'magicPen', 'shatterCount', 'shatterReach', 'iceStorm', 'choices', 'ability',
];

function normUnit(u: ContentProject['units'][number]) {
  const up = (x: (typeof u.upgrades)[number]): typeof x => {
    const o = ordered(x, UPGRADE_ORDER);
    if (o.choices) o.choices = o.choices.map(up);
    return o;
  };
  const vials = u.vials?.map((v) => ordered({ ...v, levels: v.levels.map((l) => ordered(l, VIAL_LEVEL_ORDER)) }, VIAL_ORDER));
  return ordered({ ...u, upgrades: u.upgrades.map(up), vials }, UNIT_ORDER);
}

function exportUnits(text: string, shipped: ContentProject, project: ContentProject) {
  return withEol(text, (src) => {
    const style: PatchStyle = {
      unit: '  ',
      width: 100,
      ordered: (path) => path.length === 1,
      multiline: (path) => {
        const last = path[path.length - 1];
        const parent = path[path.length - 2];
        return (
          path.length === 2 ||
          last === 'upgrades' ||
          last === 'choices' ||
          last === 'vials' ||
          last === 'levels' ||
          (typeof last === 'number' && (parent === 'upgrades' || parent === 'choices' || parent === 'vials'))
        );
      },
    };
    const lit = literalAt(src, 'UNITS', 'units.ts', '{');
    const rec = (list: ContentProject['units']) => Object.fromEntries(list.map((u) => [u.id, normUnit(u)]));
    return { text: patchRegions(src, [{ start: lit.open, end: lit.close + 1, oldV: rec(shipped.units), newV: rec(project.units), path: ['UNITS'] }], style) };
  }).text;
}

// ------------------------------------------------------------------- mastery

const NODE_ORDER = ['id', 'name', 'description', 'cost', 'requires', 'major', 'exclusiveGroup', ...EFFECT_FIELDS.map((f) => f.key)];

function exportMastery(text: string, shipped: ContentProject, project: ContentProject) {
  return withEol(text, (src) => {
    const style: PatchStyle = {
      unit: '  ',
      width: 100,
      ordered: (path) => path.length === 1,
      keyOf: (path) => (path.length === 2 ? (v) => String((v as { id: string }).id) : undefined),
      multiline: (path) => path.length <= 3,
    };
    const lit = literalAt(src, 'MASTERY_TREES', 'mastery.ts', '{');
    const rec = (m: ContentProject['mastery']) =>
      Object.fromEntries(Object.entries(m).map(([id, nodes]) => [id, nodes.map((n) => ordered(n, NODE_ORDER))]));
    return {
      text: patchRegions(src, [{ start: lit.open, end: lit.close + 1, oldV: rec(shipped.mastery), newV: rec(project.mastery), path: ['MASTERY_TREES'] }], style),
    };
  }).text;
}

// -------------------------------------------------------------------- driver

function describeChanges(shipped: ContentProject, project: ContentProject): Record<SourceName, string[]> {
  const out: Record<SourceName, string[]> = { levels: [], enemies: [], units: [], mastery: [] };
  const names = {
    level: (id: string) => project.levels.find((l) => String(l.id) === id)?.name ?? shipped.levels.find((l) => String(l.id) === id)?.name,
    enemy: (id: string) => project.enemies.find((e) => e.id === id)?.name ?? shipped.enemies.find((e) => e.id === id)?.name,
    boss: (id: string) => project.bosses.find((b) => String(b.level) === id)?.name ?? shipped.bosses.find((b) => String(b.level) === id)?.name,
    unit: (id: string) => project.units.find((u) => u.id === id)?.name ?? shipped.units.find((u) => u.id === id)?.name,
  };
  const has = (p: ContentProject, k: string) => {
    const [kind, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    if (kind === 'level') return p.levels.some((l) => String(l.id) === id);
    if (kind === 'enemy') return p.enemies.some((e) => e.id === id);
    if (kind === 'boss') return p.bosses.some((b) => String(b.level) === id);
    if (kind === 'unit') return p.units.some((u) => u.id === id);
    return id in p.mastery;
  };
  for (const k of changedKeys(shipped, project)) {
    if (k.startsWith('order:')) {
      const c = k.slice(6);
      if (!reordered(shipped, project, c)) continue;
      const file: SourceName = c === 'levels' ? 'levels' : c === 'units' ? 'units' : c === 'mastery' ? 'mastery' : 'enemies';
      out[file].push(`Reordered ${c}`);
      continue;
    }
    const [kind, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    const verb = !has(shipped, k) ? 'Added' : !has(project, k) ? 'Removed' : 'Changed';
    const file: SourceName = kind === 'level' ? 'levels' : kind === 'unit' ? 'units' : kind === 'mastery' ? 'mastery' : 'enemies';
    const label =
      kind === 'level' ? `stage ${id} · ${names.level(id)}` :
      kind === 'enemy' ? `foe ${id} · ${names.enemy(id)}` :
      kind === 'boss' ? `boss${id} · ${names.boss(id)}` :
      kind === 'unit' ? `champion ${id} · ${names.unit(id)}` : `skill tree of ${id}`;
    out[file].push(`${verb} ${label}`);
  }
  return out;
}

/** Build every catalog file from the project. Throws `ExportError` if a file can't be patched. */
export function buildSourceExport(shipped: ContentProject, project: ContentProject, texts: SourceTexts, force = false): SourceFile[] {
  const changes = describeChanges(shipped, project);
  const run = (name: SourceName, fn: (t: string, s: ContentProject, p: ContentProject) => string): SourceFile => {
    let updated: string;
    try {
      updated = changes[name].length || force ? fn(texts[name], shipped, project) : texts[name];
    } catch (e) {
      if (e instanceof ExportError) throw e;
      if (e instanceof ScanError) throw new ExportError(`${SOURCE_FILES[name]}: ${e.message}`);
      throw new ExportError(`${SOURCE_FILES[name]}: ${(e as Error).message}`);
    }
    return { name, path: SOURCE_FILES[name], original: texts[name], updated, changed: updated !== texts[name], changes: changes[name] };
  };
  return [run('levels', exportLevels), run('enemies', exportEnemies), run('units', exportUnits), run('mastery', exportMastery)];
}

/** Whether a value is exportable plain data (guards against stray functions). */
export function isPlainData(v: unknown): boolean {
  if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) return true;
  if (Array.isArray(v)) return v.every(isPlainData);
  return isPlainObject(v) && Object.values(v).every((x) => x === undefined || isPlainData(x));
}

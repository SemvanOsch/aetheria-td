/**
 * Patches a TypeScript literal in place so that it holds new data, touching
 * only what changed: unchanged properties and elements keep their exact text
 * (comments, helper calls like `bossWave(…)`, shorthand like `CAS.g`), changed
 * ones are patched recursively, and only new or reshaped values are printed
 * fresh by `emitValue`. Everything is driven by comparing the *old* data (what
 * the text is known to hold) with the *new* data.
 */

import { deepEqual, isPlainObject } from '../model/util';
import { lineIndent, parseLiteral, spansLines, type Item, type Literal } from './tsScan';
import { emitKey, emitValue, type EmitStyle, type Path } from './tsEmit';

export interface PatchStyle extends EmitStyle {
  /** Arrays at these paths hold entities matched by key rather than position. */
  keyOf?: (path: Path) => ((item: unknown) => string) | undefined;
  /** Objects at these paths are records whose key order matters (catalogs). */
  ordered?: (path: Path) => boolean;
}

interface Edit {
  from: number;
  to: number;
  text: string;
}

/** `s[from, to)` with the (non-overlapping, absolute) edits applied. */
function applyEdits(s: string, from: number, to: number, edits: Edit[]): string {
  const sorted = edits.slice().sort((a, b) => a.from - b.from || a.to - b.to);
  let out = '';
  let cursor = from;
  for (const e of sorted) {
    if (e.from < cursor) throw new Error('Overlapping source edits');
    out += s.slice(cursor, e.from) + e.text;
    cursor = e.to;
  }
  return out + s.slice(cursor, to);
}

const colOf = (s: string, i: number) => i - (s.lastIndexOf('\n', i - 1) + 1);

/** New text for `s[start, end)` — known to hold `oldV` — so that it holds `newV`. */
export function patchValue(s: string, start: number, end: number, oldV: unknown, newV: unknown, path: Path, style: PatchStyle): string {
  const text = s.slice(start, end);
  if (deepEqual(oldV, newV)) return text;
  const indent = lineIndent(s, start);
  if (!style.map?.(path, newV)) {
    if (isPlainObject(oldV) && isPlainObject(newV) && s[start] === '{') {
      const lit = parseLiteral(s, start);
      if (lit.close === end - 1 && !lit.items.some((i) => i.spread)) return patchObject(s, lit, oldV, newV, path, style, indent);
    }
    if (Array.isArray(oldV) && Array.isArray(newV) && s[start] === '[') {
      const lit = parseLiteral(s, start);
      if (lit.close === end - 1 && !lit.items.some((i) => i.spread) && lit.items.length === oldV.length) {
        return patchArray(s, lit, oldV, newV, path, style, indent);
      }
    }
  }
  return emitValue(newV, path, style, indent, colOf(s, start));
}

function patchObject(
  s: string,
  lit: Literal,
  oldV: Record<string, unknown>,
  newV: Record<string, unknown>,
  path: Path,
  style: PatchStyle,
  indent: string,
): string {
  const items = lit.items;
  const multi = spansLines(s, lit.open, lit.close);
  const byKey = new Map(items.map((it) => [it.key as string, it]));
  const newKeys = Object.keys(newV).filter((k) => newV[k] !== undefined);
  const survivors = items.filter((it) => newV[it.key as string] !== undefined);
  const added = newKeys.filter((k) => !byKey.has(k));
  const propIndent = items.length ? lineIndent(s, items[0].start) : indent + style.unit;

  const fresh = (k: string, ind: string, col: number) => {
    const head = `${emitKey(k)}: `;
    return head + emitValue(newV[k], [...path, k], style, ind, col + head.length);
  };
  const kept = (it: Item) => {
    const k = it.key as string;
    if (it.shorthand) return deepEqual(oldV[k], newV[k]) ? (it.keyText as string) : fresh(k, lineIndent(s, it.start), colOf(s, it.start));
    const value = patchValue(s, it.valueStart, it.valueEnd, oldV[k], newV[k], [...path, k], style);
    return `${s.slice(it.start, it.valueStart)}${value}`;
  };

  // In a record whose order matters, a moved entry — or a new one that isn't
  // simply appended after the last existing entry — means a rebuild.
  const lastKept = newKeys.reduce((at, k, i) => (byKey.has(k) ? i : at), -1);
  const reordered =
    !!style.ordered?.(path) &&
    (survivors.map((it) => it.key).join('\0') !== newKeys.filter((k) => byKey.has(k)).join('\0') ||
      added.some((k) => newKeys.indexOf(k) < lastKept));

  // A new key goes right after the nearest key before it (in the new value's
  // order) that the text already has — so `startingGold` lands after `gem`,
  // not at the end — or first if there is none.
  const anchorOf = (k: string): Item | null => {
    for (let i = newKeys.indexOf(k) - 1; i >= 0; i--) {
      const it = byKey.get(newKeys[i]);
      if (it) return it;
    }
    return null;
  };

  if (!multi) {
    // One-line object: rebuild it from its (patched) parts if anything moved.
    if (!reordered && survivors.length === items.length && added.length === 0) {
      const edits = items
        .filter((it) => !deepEqual(oldV[it.key as string], newV[it.key as string]))
        .map((it) => ({ from: it.start, to: it.valueEnd, text: kept(it) }));
      return applyEdits(s, lit.open, lit.close + 1, edits);
    }
    let order: string[];
    if (reordered) order = newKeys;
    else {
      order = survivors.map((it) => it.key as string);
      for (const k of added) {
        const a = anchorOf(k);
        let at = a ? order.indexOf(a.key as string) + 1 : 0;
        while (at < order.length && added.includes(order[at])) at++;
        order.splice(at, 0, k);
      }
    }
    const part = (k: string, ind: string, col: number) => (byKey.has(k) ? kept(byKey.get(k)!) : fresh(k, ind, col));
    const one = order.length ? `{ ${order.map((k) => part(k, indent, 0)).join(', ')} }` : '{}';
    if (colOf(s, lit.open) + one.length <= style.width * 1.25 || !order.length) return one;
    // Grown too long for one line: break it.
    const inner = indent + style.unit;
    return `{\n${order.map((k) => `${inner}${part(k, inner, inner.length)},`).join('\n')}\n${indent}}`;
  }

  if (!reordered) {
    const edits: Edit[] = [];
    for (const it of items) {
      const k = it.key as string;
      if (newV[k] === undefined) edits.push({ from: it.segStart, to: it.segEnd, text: '' });
      else if (!deepEqual(oldV[k], newV[k])) edits.push({ from: it.start, to: it.valueEnd, text: kept(it) });
    }
    // Insert each run of new keys after its anchor (moved to the end of the
    // anchor's line when other properties share it).
    const runs = new Map<number, string[]>();
    for (const k of added) {
      let a = anchorOf(k);
      if (a) {
        let i = items.indexOf(a);
        while (i + 1 < items.length && !s.slice(items[i + 1].segStart, items[i + 1].start).includes('\n')) i++;
        a = items[i];
      }
      const at = a ? items.indexOf(a) : -1;
      runs.set(at, [...(runs.get(at) ?? []), k]);
    }
    for (const [at, keys] of runs) {
      const text = keys.map((k) => `\n${propIndent}${fresh(k, propIndent, propIndent.length)},`).join('');
      const a = at >= 0 ? items[at] : null;
      if (a) {
        const pos = a.hasComma ? a.segEnd : a.valueEnd;
        edits.push({ from: pos, to: pos, text: (a.hasComma ? '' : ',') + text });
      } else edits.push({ from: lit.open + 1, to: lit.open + 1, text });
    }
    return applyEdits(s, lit.open, lit.close + 1, edits);
  }

  // A record whose order changed: rebuild it, each entry keeping its own
  // leading comments and text.
  const parts = newKeys.map((k) => {
    const it = byKey.get(k);
    return it ? `${s.slice(it.segStart, it.start)}${kept(it)},` : `\n${propIndent}${fresh(k, propIndent, propIndent.length)},`;
  });
  const lastItem = items[items.length - 1];
  let tail = lastItem ? s.slice(lastItem.segEnd, lit.close) : `\n${indent}`;
  if (!tail.includes('\n')) tail = `\n${indent}`;
  return `{${parts.join('')}${tail}}`;
}

/** For each new element, the old element it continues (or -1 if it is new). */
function align(oldA: unknown[], newA: unknown[], keyFn: ((v: unknown) => string) | undefined): number[] {
  if (keyFn) {
    const oldIdx = new Map<string, number>();
    oldA.forEach((v, i) => {
      const k = keyFn(v);
      if (!oldIdx.has(k)) oldIdx.set(k, i);
    });
    const used = new Set<number>();
    return newA.map((v) => {
      const i = oldIdx.get(keyFn(v));
      if (i === undefined || used.has(i)) return -1;
      used.add(i);
      return i;
    });
  }
  // Longest common subsequence of equal elements, then pair the leftovers in
  // each gap by position (so an edited element is patched, not reprinted).
  const n = oldA.length;
  const m = newA.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = deepEqual(oldA[i], newA[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const match = new Array<number>(m).fill(-1);
  const anchors: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (deepEqual(oldA[i], newA[j])) {
      match[j] = i;
      anchors.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  anchors.push([n, m]);
  let pi = 0;
  let pj = 0;
  for (const [ai, aj] of anchors) {
    for (let k = 0; pi + k < ai && pj + k < aj; k++) match[pj + k] = pi + k;
    pi = ai + 1;
    pj = aj + 1;
  }
  return match;
}

function patchArray(s: string, lit: Literal, oldA: unknown[], newA: unknown[], path: Path, style: PatchStyle, indent: string): string {
  const items = lit.items;
  const multi = spansLines(s, lit.open, lit.close);
  const match = align(oldA, newA, style.keyOf?.(path));
  const elemIndent = items.length ? lineIndent(s, items[0].start) : indent + style.unit;
  const text = (ni: number, ind: string, col: number) => {
    const oi = match[ni];
    return oi >= 0
      ? patchValue(s, items[oi].valueStart, items[oi].valueEnd, oldA[oi], newA[ni], [...path, ni], style)
      : emitValue(newA[ni], [...path, ni], style, ind, col);
  };

  if (newA.length === oldA.length && match.every((m, i) => m === i)) {
    const edits = newA
      .map((_, i) => i)
      .filter((i) => !deepEqual(oldA[i], newA[i]))
      .map((i) => ({ from: items[i].valueStart, to: items[i].valueEnd, text: text(i, lineIndent(s, items[i].valueStart), colOf(s, items[i].valueStart)) }));
    return applyEdits(s, lit.open, lit.close + 1, edits);
  }

  if (!multi) {
    const parts = newA.map((_, i) => text(i, indent, 0));
    const one = `[${parts.join(', ')}]`;
    const forced = style.multiline?.(path, newA) ?? false;
    if (!forced && (colOf(s, lit.open) + one.length <= style.width * 1.25 || newA.length === 0)) return one;
    const inner = indent + style.unit;
    return `[\n${newA.map((_, i) => `${inner}${text(i, inner, inner.length)},`).join('\n')}\n${indent}]`;
  }

  const parts = newA.map((_, ni) => {
    const oi = match[ni];
    const lead = oi >= 0 ? s.slice(items[oi].segStart, items[oi].start) : `\n${elemIndent}`;
    return `${lead.includes('\n') ? lead : `\n${elemIndent}`}${text(ni, elemIndent, elemIndent.length)},`;
  });
  const lastItem = items[items.length - 1];
  let tail = lastItem ? s.slice(lastItem.segEnd, lit.close) : `\n${indent}`;
  if (!tail.includes('\n')) tail = `\n${indent}`;
  if (newA.length === 0) return '[]';
  return `[${parts.join('')}${tail}]`;
}

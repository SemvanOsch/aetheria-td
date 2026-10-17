/**
 * Prints plain data as a TypeScript literal in the catalogs' house style:
 * single quotes, bare keys where possible, trailing commas on multi-line
 * literals, and short objects/arrays kept on one line.
 */

import { isPlainObject } from '../model/util';

/** Verbatim code in place of a value (`CAS.g`, `bossIdForLevel(3)`). */
export class Raw {
  constructor(readonly code: string) {}
}

export type Path = (string | number)[];

export interface EmitStyle {
  /** One indent step. */
  unit: string;
  /** Preferred maximum line width. */
  width: number;
  /** Literals at these paths always break across lines (when non-empty). */
  multiline?: (path: Path, value: unknown) => boolean;
  /** Swap a value for code (shorthand constants, helper calls). */
  map?: (path: Path, value: unknown) => Raw | undefined;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

export function emitKey(key: string): string {
  return IDENT.test(key) ? key : quote(key);
}

export function quote(str: string): string {
  const useDouble = str.includes("'") && !str.includes('"');
  const q = useDouble ? '"' : "'";
  const body = str
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(new RegExp(q, 'g'), `\\${q}`);
  return `${q}${body}${q}`;
}

function emitNumber(n: number): string {
  if (Object.is(n, -0)) return '0';
  if (!Number.isFinite(n)) throw new Error(`Can't export the number ${n}`);
  return String(n);
}

/** The value on one line, regardless of width (`undefined` entries are skipped). */
function inline(v: unknown, path: Path, style: EmitStyle): string {
  const mapped = style.map?.(path, v);
  if (mapped) return mapped.code;
  if (v instanceof Raw) return v.code;
  if (typeof v === 'string') return quote(v);
  if (typeof v === 'number') return emitNumber(v);
  if (typeof v === 'boolean') return String(v);
  if (v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map((x, i) => inline(x, [...path, i], style)).join(', ')}]`;
  if (isPlainObject(v)) {
    const parts = Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => `${emitKey(k)}: ${inline(x, [...path, k], style)}`);
    return parts.length ? `{ ${parts.join(', ')} }` : '{}';
  }
  throw new Error(`Can't export a ${typeof v}`);
}

/**
 * The value as source, starting at column `col` on a line indented `indent`.
 * Breaks across lines when forced by the style or when it won't fit.
 */
export function emitValue(v: unknown, path: Path, style: EmitStyle, indent: string, col = indent.length): string {
  const one = inline(v, path, style);
  const container = Array.isArray(v) || isPlainObject(v);
  if (!container || style.map?.(path, v)) return one;
  const empty = Array.isArray(v) ? v.length === 0 : Object.values(v as object).every((x) => x === undefined);
  if (empty) return one;
  const forced = style.multiline?.(path, v) ?? false;
  if (!forced && col + one.length <= style.width) return one;
  const inner = indent + style.unit;
  if (Array.isArray(v)) {
    const lines = v.map((x, i) => `${inner}${emitValue(x, [...path, i], style, inner)},`);
    return `[\n${lines.join('\n')}\n${indent}]`;
  }
  const lines = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .map(([k, x]) => {
      const head = `${inner}${emitKey(k)}: `;
      return `${head}${emitValue(x, [...path, k], style, inner, head.length)},`;
    });
  return `{\n${lines.join('\n')}\n${indent}}`;
}

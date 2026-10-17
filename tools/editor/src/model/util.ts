/** Small pure helpers shared by the editor's model, store and exporters. */

/** A deep copy of plain data (no functions, no cycles). */
export function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** Whether a value is a plain object (not an array or null). */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Structural equality for plain data, treating an `undefined` property the same
 * as a missing one (`{ a: 1, b: undefined }` equals `{ a: 1 }`).
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/** Drop `undefined` properties (recursively), so data serialises canonically. */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripUndefined(v)) as T;
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = stripUndefined(v);
    return out as T;
  }
  return value;
}

/** JSON with sorted keys and no `undefined` — equal data gives equal text. */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value)) ?? 'undefined';
}

/** A fast 53-bit string hash (cyrb53), as hex. Not cryptographic. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** The canonical hash of a piece of data. */
export function hashValue(value: unknown): string {
  return hashString(canonicalJson(value));
}

/** SHA-256 of a string as hex (Web Crypto; matches the dev server's check). */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Move the item at `from` to `to` (both indices into the original array). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/** `base`, or `base_2`, `base_3`… — the first not in `taken`. */
export function uniqueId(base: string, taken: (id: string) => boolean): string {
  if (!taken(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base}_${n}`;
    if (!taken(id)) return id;
  }
}

/** A readable count: "1 wave", "3 waves". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Round to at most `dp` decimals, for display. */
export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Format a number compactly: 1234 → "1,234", 0.25 → "0.25". */
export function fmt(n: number, dp = 2): string {
  return round(n, dp).toLocaleString('en-US', { maximumFractionDigits: dp });
}

/** Seeded PRNG (mulberry32) for deterministic test plays. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

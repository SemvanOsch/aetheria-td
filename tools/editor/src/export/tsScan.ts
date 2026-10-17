/**
 * A tiny scanner for the data parts of the game's TypeScript catalogs: it finds
 * declarations and splits object/array literals into properties/elements with
 * exact source ranges, skipping strings, template literals and comments. It is
 * not a TypeScript parser — just enough structure to patch literals in place
 * while leaving every comment and line the editor didn't change untouched.
 */

export class ScanError extends Error {}

const isWs = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c === '﻿';

/** Index of the next character that isn't whitespace or a comment. */
export function skipTrivia(s: string, i: number): number {
  for (;;) {
    while (i < s.length && isWs(s[i])) i++;
    if (s[i] === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') i++;
    } else if (s[i] === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      if (end < 0) throw new ScanError('Unterminated block comment');
      i = end + 2;
    } else return i;
  }
}

/** Index just past the string/template literal starting at `i`. */
function skipString(s: string, i: number): number {
  const q = s[i];
  i++;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (q === '`' && c === '$' && s[i + 1] === '{') {
      i = matchBracket(s, i + 1) + 1;
      continue;
    }
    if (c === q) return i + 1;
    if (q !== '`' && c === '\n') throw new ScanError('Unterminated string');
    i++;
  }
  throw new ScanError('Unterminated string');
}

const CLOSE: Record<string, string> = { '{': '}', '[': ']', '(': ')' };

/** Index of the bracket closing the one at `i`. */
export function matchBracket(s: string, i: number): number {
  const stack: string[] = [CLOSE[s[i]]];
  if (!stack[0]) throw new ScanError(`Expected a bracket at ${i}`);
  i++;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(s, i);
      continue;
    }
    if (c === '/' && (s[i + 1] === '/' || s[i + 1] === '*')) {
      i = skipTrivia(s, i);
      continue;
    }
    if (CLOSE[c]) stack.push(CLOSE[c]);
    else if (c === '}' || c === ']' || c === ')') {
      if (stack.pop() !== c) throw new ScanError(`Mismatched "${c}" at ${i}`);
      if (stack.length === 0) return i;
    }
    i++;
  }
  throw new ScanError('Unbalanced brackets');
}

/**
 * Scan one expression from `i` up to a top-level `,` or closing bracket.
 * Returns where it stops and where its last significant character ends.
 */
function scanExpression(s: string, i: number): { stop: number; end: number } {
  let end = i;
  while (i < s.length) {
    const c = s[i];
    if (c === ',' || c === '}' || c === ']' || c === ')') return { stop: i, end };
    if (isWs(c) || (c === '/' && (s[i + 1] === '/' || s[i + 1] === '*'))) {
      i = skipTrivia(s, i);
      continue;
    }
    if (c === '"' || c === "'" || c === '`') i = skipString(s, i);
    else if (CLOSE[c]) i = matchBracket(s, i) + 1;
    else i++;
    end = i;
  }
  throw new ScanError('Unexpected end of file in an expression');
}

export interface Item {
  /** Just after the previous comma (or the opening bracket): leading trivia starts here. */
  segStart: number;
  /** Start of the property key / element. */
  start: number;
  /** Property value range (equals the element range for arrays). */
  valueStart: number;
  valueEnd: number;
  /** Index just past this item's trailing comma, or `valueEnd` if it has none. */
  segEnd: number;
  hasComma: boolean;
  /** Property key text as written (`id`, `'player-blade'`), or null for array elements. */
  keyText: string | null;
  /** Decoded key name. */
  key: string | null;
  shorthand: boolean;
  spread: boolean;
}

export interface Literal {
  open: number;
  close: number;
  items: Item[];
}

function readKey(s: string, i: number): { text: string; key: string; end: number } {
  const c = s[i];
  if (c === '"' || c === "'") {
    const end = skipString(s, i);
    const text = s.slice(i, end);
    return { text, key: JSON.parse(c === "'" ? `"${text.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"` : text), end };
  }
  if (c === '[') {
    const end = matchBracket(s, i) + 1;
    return { text: s.slice(i, end), key: s.slice(i, end), end };
  }
  const m = /^[A-Za-z_$0-9][\w$]*/.exec(s.slice(i, i + 200));
  if (!m) throw new ScanError(`Expected a property name at ${i}`);
  return { text: m[0], key: m[0], end: i + m[0].length };
}

/** Split the object or array literal whose opening bracket is at `open`. */
export function parseLiteral(s: string, open: number): Literal {
  const kind = s[open];
  if (kind !== '{' && kind !== '[') throw new ScanError(`Expected { or [ at ${open}`);
  const close = matchBracket(s, open);
  const items: Item[] = [];
  let i = open + 1;
  for (;;) {
    const segStart = i;
    const start = skipTrivia(s, i);
    if (start >= close) break;
    let keyText: string | null = null;
    let key: string | null = null;
    let valueStart = start;
    let shorthand = false;
    let spread = false;
    if (s.startsWith('...', start)) {
      spread = true;
    } else if (kind === '{') {
      const k = readKey(s, start);
      keyText = k.text;
      key = k.key;
      const after = skipTrivia(s, k.end);
      if (s[after] === ':') valueStart = skipTrivia(s, after + 1);
      else {
        shorthand = true;
        valueStart = start;
      }
    }
    const { stop, end } = shorthand ? { stop: skipTrivia(s, start + (keyText?.length ?? 0)), end: start + (keyText?.length ?? 0) } : scanExpression(s, valueStart);
    const hasComma = s[stop] === ',';
    items.push({ segStart, start, valueStart, valueEnd: end, segEnd: hasComma ? stop + 1 : end, hasComma, keyText, key, shorthand, spread });
    if (!hasComma) break;
    i = stop + 1;
  }
  return { open, close, items };
}

/**
 * Index of the initializer of a top-level `const|let|var NAME … =`, i.e. the
 * first significant character after `=`.
 */
export function findInitializer(s: string, name: string): number {
  const re = new RegExp(`(^|\\n)\\s*(export\\s+)?(const|let|var)\\s+${name}\\b`, 'g');
  const m = re.exec(s);
  if (!m) throw new ScanError(`Couldn't find "${name}"`);
  let i = m.index + m[0].length;
  // Skip a type annotation up to the `=` (not `=>`/`==`).
  while (i < s.length) {
    const c = s[i];
    if (c === '=' && s[i + 1] !== '>' && s[i + 1] !== '=') return skipTrivia(s, i + 1);
    if (c === '"' || c === "'" || c === '`') i = skipString(s, i);
    else if (c === '{' || c === '[' || c === '(') i = matchBracket(s, i) + 1;
    else if (c === ';' || c === '\n') {
      // A newline inside a long annotation is fine; a semicolon ends the statement.
      if (c === ';') break;
      i++;
    } else i++;
  }
  throw new ScanError(`"${name}" has no initializer`);
}

/** The leading whitespace of the line containing `i`. */
export function lineIndent(s: string, i: number): string {
  const lineStart = s.lastIndexOf('\n', i - 1) + 1;
  const m = /^[ \t]*/.exec(s.slice(lineStart, i));
  return m ? m[0] : '';
}

/** Whether the text between two indices spans a line break. */
export const spansLines = (s: string, a: number, b: number) => s.slice(a, b).includes('\n');

/** Read a simple literal value (number, string, boolean) from source text, else undefined. */
export function readSimpleValue(text: string): string | number | boolean | undefined {
  const t = text.trim();
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(t)) return Number(t);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    try {
      return readKey(t, 0).key;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

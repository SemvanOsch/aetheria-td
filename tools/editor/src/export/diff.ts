/** A small line diff for previewing source exports (unified-style hunks). */

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string; oldNo?: number; newNo?: number };

export interface Hunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

/** Line-level diff of two texts: common prefix/suffix trimmed, LCS on the rest. */
export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.replace(/\r\n/g, '\n').split('\n');
  const B = b.replace(/\r\n/g, '\n').split('\n');
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a2 = A.slice(pre, A.length - suf);
  const b2 = B.slice(pre, B.length - suf);
  const out: DiffLine[] = [];
  for (let i = 0; i < pre; i++) out.push({ kind: 'same', text: A[i], oldNo: i + 1, newNo: i + 1 });
  const n = a2.length;
  const m = b2.length;
  if (n * m > 4_000_000) {
    // Too big to align line by line: show it as a block replacement.
    a2.forEach((t, i) => out.push({ kind: 'del', text: t, oldNo: pre + i + 1 }));
    b2.forEach((t, i) => out.push({ kind: 'add', text: t, newNo: pre + i + 1 }));
  } else {
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a2[i] === b2[j]) {
        out.push({ kind: 'same', text: a2[i], oldNo: pre + i + 1, newNo: pre + j + 1 });
        i++;
        j++;
      } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
        out.push({ kind: 'add', text: b2[j], newNo: pre + j + 1 });
        j++;
      } else {
        out.push({ kind: 'del', text: a2[i], oldNo: pre + i + 1 });
        i++;
      }
    }
  }
  for (let k = 0; k < suf; k++) {
    out.push({ kind: 'same', text: A[A.length - suf + k], oldNo: A.length - suf + k + 1, newNo: B.length - suf + k + 1 });
  }
  return out;
}

/** Group a diff into hunks with `context` unchanged lines around each change. */
export function toHunks(lines: DiffLine[], context = 3): Hunk[] {
  const hunks: Hunk[] = [];
  let cur: Hunk | null = null;
  let lastChange = -Infinity;
  lines.forEach((l, i) => {
    if (l.kind === 'same') return;
    if (!cur || i - lastChange > context * 2) {
      if (cur) hunks.push(cur);
      const from = Math.max(0, i - context);
      const first = lines[from];
      cur = { oldStart: first.oldNo ?? 0, newStart: first.newNo ?? 0, lines: lines.slice(from, i) };
    } else {
      cur.lines.push(...lines.slice(lastChange + 1, i));
    }
    cur.lines.push(l);
    lastChange = i;
  });
  if (cur) {
    const c = cur as Hunk;
    c.lines.push(...lines.slice(lastChange + 1, lastChange + 1 + context));
    hunks.push(c);
  }
  return hunks;
}

export function diffStats(lines: DiffLine[]) {
  return { added: lines.filter((l) => l.kind === 'add').length, removed: lines.filter((l) => l.kind === 'del').length };
}

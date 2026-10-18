import type { CSSProperties, ReactNode } from 'react';
import type { StatHint } from '../championStats';
import { Hint } from './Hint';

/** A word to pick out of a description, and the tip it shows on hover. */
export interface KeywordRule {
  /** Matches the keyword (no capture groups; matched case-insensitively, whole words). */
  pattern: string;
  hint: StatHint;
}

/**
 * A description with its keywords picked out: each match of a rule is set in
 * bold, underlined, in the rule's accent colour, and shows its tip on hover
 * (the Bandit's "bleed", the Frost Witch's "slowed", Icebreak's "Brittle").
 */
export function withKeywords(text: string, rules: KeywordRule[]): ReactNode {
  if (!rules.length) return text;
  const re = new RegExp(`\\b(${rules.map((r) => `(${r.pattern})`).join('|')})\\b`, 'i');
  const parts: ReactNode[] = [];
  let rest = text;
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    parts.push(rest.slice(0, m.index));
    const rule = rules[m.slice(2).findIndex((g) => g !== undefined)];
    const { hint } = rule;
    parts.push(
      <Hint
        key={parts.length}
        className="kw"
        tip={hint.text}
        title={hint.title}
        icon={hint.icon}
        accent={hint.accent}
      >
        <span style={{ '--kw': hint.accent } as CSSProperties}>{m[0]}</span>
      </Hint>,
    );
    rest = rest.slice(m.index + m[0].length);
  }
  parts.push(rest);
  return parts;
}

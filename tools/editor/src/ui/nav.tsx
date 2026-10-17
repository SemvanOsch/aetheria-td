/** Workspace navigation: which workspace is open and what is selected in each. */

import { createContext, useContext } from 'react';
import type { Workspace } from '../model/types';
import type { Issue } from '../validation/validate';
import type { ContentProject } from '../model/types';

export type LevelTab = 'general' | 'board' | 'waves' | 'summary';

export interface NavState {
  workspace: Workspace;
  level: number | null;
  levelTab: LevelTab;
  /** `enemy:<id>` or `boss:<level>`. */
  enemy: string | null;
  unit: string | null;
  tree: string | null;
  node: string | null;
  /** A field to scroll to and focus once rendered (from the Problems list). */
  focusField?: string;
}

export const DEFAULT_NAV: NavState = {
  workspace: 'levels',
  level: null,
  levelTab: 'general',
  enemy: null,
  unit: null,
  tree: null,
  node: null,
};

export const NavCtx = createContext<{ nav: NavState; go: (patch: Partial<NavState>) => void }>({
  nav: DEFAULT_NAV,
  go: () => {},
});

export const useNav = () => useContext(NavCtx);

/** Where an issue lives in the editor. */
export function navForIssue(issue: Issue, project: ContentProject): Partial<NavState> | null {
  if (issue.entity === 'project') return { workspace: 'packs' };
  const kind = issue.entity.slice(0, issue.entity.indexOf(':'));
  const id = issue.entity.slice(issue.entity.indexOf(':') + 1);
  const f = issue.field ?? '';
  switch (kind) {
    case 'level': {
      const tab: LevelTab = /^(lanes|waves)/.test(f) ? (f.includes('.path') ? 'board' : 'waves') : /^(decor|theme|mood)/.test(f) ? 'board' : 'general';
      return { workspace: 'levels', level: Number(id), levelTab: tab, focusField: f };
    }
    case 'enemy':
    case 'boss':
      return { workspace: 'enemies', enemy: issue.entity, focusField: f };
    case 'unit':
      return { workspace: 'champions', unit: id, focusField: f };
    case 'mastery': {
      const m = /^nodes\.(\d+)/.exec(f);
      const node = m ? project.mastery[id]?.[Number(m[1])]?.id ?? null : null;
      return { workspace: 'mastery', tree: id, node, focusField: m ? f.replace(/^nodes\.\d+\.?/, '') : undefined };
    }
    default:
      return null;
  }
}

/** Hooks, contexts and helpers shared by the editor's UI kit (kept out of component files). */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Issue } from '../validation/validate';

export interface IssueScope {
  issues: Issue[];
}
export const IssueCtx = createContext<IssueScope>({ issues: [] });

/** Issues for exactly this field path (or anything below it, with `deep`). */
export function useFieldIssues(path?: string, deep = false): Issue[] {
  const { issues } = useContext(IssueCtx);
  return useMemo(
    () => (path === undefined ? [] : issues.filter((i) => i.field === path || (deep && i.field?.startsWith(`${path}.`)))),
    [issues, path, deep],
  );
}

export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  /** Extra button (e.g. "Download backup first"). */
  extra?: { label: string; run: () => void };
}

export const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export const useConfirm = () => useContext(ConfirmCtx);

/** Save a text file to the user's downloads. */
export function downloadText(name: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The editor's only `localStorage` access point. Everything is namespaced
 * `aetheria-editor:` — the game's own saves (`aetheria-td:`) are never read or
 * written, and the editor runs on its own origin anyway.
 *
 *  - `draft`     the saved working project (written by Save), with the hashes
 *                of the shipped content it was based on (for rebasing)
 *  - `recovery`  unsaved edits, written in the background, offered on next load
 *  - `prefs`     UI preferences (last workspace, selections)
 */

import type { ContentProject } from '../model/types';
import type { Baseline } from '../model/entities';

const NS = 'aetheria-editor:';
export const DRAFT_SCHEMA = 1;

export interface StoredDraft {
  schema: number;
  savedAt: string;
  project: ContentProject;
  baseline: Baseline;
}

export interface StoredRecovery {
  schema: number;
  at: string;
  project: ContentProject;
  baseline: Baseline;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Write a key; returns an error message instead of throwing (quota, privacy mode). */
function write(key: string, value: unknown): string | null {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    return null;
  } catch (e) {
    return (e as Error).name === 'QuotaExceededError'
      ? 'Browser storage is full. Download a backup pack, then clear old data.'
      : `Browser storage is unavailable (${(e as Error).message}).`;
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(NS + key);
  } catch {
    // Storage unavailable: nothing to remove.
  }
}

function isDraftLike(v: unknown): v is StoredDraft {
  const d = v as StoredDraft | null;
  return !!d && d.schema === DRAFT_SCHEMA && !!d.project && Array.isArray(d.project.levels) && typeof d.baseline === 'object';
}

export const storage = {
  loadDraft(): StoredDraft | null {
    const d = read<StoredDraft>('draft');
    return isDraftLike(d) ? d : null;
  },
  saveDraft(project: ContentProject, baseline: Baseline): { savedAt: string; error: string | null } {
    const savedAt = new Date().toISOString();
    return { savedAt, error: write('draft', { schema: DRAFT_SCHEMA, savedAt, project, baseline } satisfies StoredDraft) };
  },
  clearDraft() {
    remove('draft');
  },
  loadRecovery(): StoredRecovery | null {
    const r = read<StoredRecovery>('recovery');
    return r && r.schema === DRAFT_SCHEMA && r.project && Array.isArray(r.project.levels) ? r : null;
  },
  saveRecovery(project: ContentProject, baseline: Baseline): string | null {
    return write('recovery', { schema: DRAFT_SCHEMA, at: new Date().toISOString(), project, baseline } satisfies StoredRecovery);
  },
  clearRecovery() {
    remove('recovery');
  },
  loadPrefs<T extends object>(fallback: T): T {
    return { ...fallback, ...(read<Partial<T>>('prefs') ?? {}) };
  },
  savePrefs(prefs: object) {
    write('prefs', prefs);
  },
};

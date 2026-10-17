/**
 * The editor's single source of state: the shipped content, the saved draft
 * and the working copy being edited, with undo/redo.
 *
 * - Edits change only the working copy (dirty until saved).
 * - Save writes the working copy to browser storage as the draft; Discard
 *   returns to the saved draft; Reset returns to the shipped content.
 * - Unsaved edits are mirrored to a recovery slot in the background, so a
 *   crash or closed tab can offer them back.
 * - On load, a saved draft is rebased onto the shipped content (which may have
 *   changed on disk since), entity by entity — see `rebaseProject`.
 */

import { useSyncExternalStore } from 'react';
import type { ContentProject } from '../model/types';
import { loadShippedProject } from '../model/shipped';
import { baselineOf, rebaseProject, type RebaseNote } from '../model/entities';
import { deepEqual } from '../model/util';
import { storage, type StoredRecovery } from './persistence';

export type Tone = 'info' | 'success' | 'warning' | 'error';

export interface Notice {
  id: number;
  tone: Tone;
  title: string;
  detail?: string[];
}

export interface EditorState {
  shipped: ContentProject;
  saved: ContentProject;
  working: ContentProject;
  /** Working copy differs from the saved draft. */
  dirty: boolean;
  /** Saved draft differs from the shipped content. */
  draftDiffers: boolean;
  /** When the draft was last saved (null: no draft, the shipped content). */
  savedAt: string | null;
  undoLabel: string | null;
  redoLabel: string | null;
  /** Unsaved edits from an earlier session, awaiting restore/dismiss. */
  recovery: StoredRecovery | null;
  notices: Notice[];
}

interface HistoryEntry {
  project: ContentProject;
  label: string;
}

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1200;

class ProjectStore {
  private state: EditorState;
  private listeners = new Set<() => void>();
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private lastEdit: { key: string; at: number } | null = null;
  private recoveryTimer = 0;
  private noticeId = 1;

  constructor() {
    const shipped = loadShippedProject();
    let saved = shipped;
    let savedAt: string | null = null;
    const notices: Notice[] = [];
    const draft = storage.loadDraft();
    if (draft) {
      const { project, notes } = rebaseProject(draft.project, draft.baseline, shipped);
      saved = project;
      savedAt = draft.savedAt;
      if (notes.length > 0) {
        notices.push(this.makeNotice(noteTone(notes), 'Your saved draft was updated to match the source files', notes.map((n) => n.text)));
        // Persist the rebased draft against the current baseline.
        const res = storage.saveDraft(saved, baselineOf(shipped));
        if (res.error) notices.push(this.makeNotice('error', 'Could not save the rebased draft', [res.error]));
        else savedAt = res.savedAt;
      }
    }
    const recovery = storage.loadRecovery();
    this.state = this.derive({
      shipped,
      saved,
      working: saved,
      savedAt,
      recovery: recovery && !deepEqual(recovery.project, saved) ? recovery : null,
      notices,
    });
    if (recovery && !this.state.recovery) storage.clearRecovery();
    window.addEventListener('pagehide', () => this.flushRecovery());
  }

  // ---------------------------------------------------------------- plumbing

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  private derive(s: Omit<EditorState, 'dirty' | 'draftDiffers' | 'undoLabel' | 'redoLabel'>): EditorState {
    return {
      ...s,
      dirty: s.working !== s.saved && !deepEqual(s.working, s.saved),
      draftDiffers: s.saved !== s.shipped && !deepEqual(s.saved, s.shipped),
      undoLabel: this.past.length ? this.past[this.past.length - 1].label : null,
      redoLabel: this.future.length ? this.future[this.future.length - 1].label : null,
    };
  }

  private set(patch: Partial<EditorState>) {
    this.state = this.derive({ ...this.state, ...patch });
    for (const fn of this.listeners) fn();
    this.scheduleRecovery();
  }

  private makeNotice(tone: Tone, title: string, detail?: string[]): Notice {
    return { id: this.noticeId++, tone, title, detail };
  }

  notify(tone: Tone, title: string, detail?: string[]) {
    this.set({ notices: [...this.state.notices, this.makeNotice(tone, title, detail)].slice(-6) });
  }

  dismissNotice(id: number) {
    this.set({ notices: this.state.notices.filter((n) => n.id !== id) });
  }

  // ------------------------------------------------------------------- edits

  /**
   * Apply an edit to the working copy. Edits sharing a `coalesce` key in quick
   * succession (typing in one field) collapse into a single undo step.
   */
  edit(label: string, recipe: (p: ContentProject) => ContentProject, coalesce?: string) {
    const before = this.state.working;
    const after = recipe(before);
    if (after === before) return;
    const now = performance.now();
    const merge = coalesce && this.lastEdit?.key === coalesce && now - this.lastEdit.at < COALESCE_MS;
    if (!merge) {
      this.past.push({ project: before, label });
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.lastEdit = coalesce ? { key: coalesce, at: now } : null;
    this.future = [];
    this.set({ working: after });
  }

  /** Replace the whole working copy (import, reset) as one undoable step. */
  replace(label: string, project: ContentProject) {
    this.edit(label, () => project);
    this.lastEdit = null;
  }

  undo() {
    const entry = this.past.pop();
    if (!entry) return;
    this.future.push({ project: this.state.working, label: entry.label });
    this.lastEdit = null;
    this.set({ working: entry.project });
  }

  redo() {
    const entry = this.future.pop();
    if (!entry) return;
    this.past.push({ project: this.state.working, label: entry.label });
    this.lastEdit = null;
    this.set({ working: entry.project });
  }

  // ------------------------------------------------------------- persistence

  /** Save the working copy as the draft. Returns false (and notifies) on failure. */
  save(): boolean {
    const { working, shipped } = this.state;
    const res = storage.saveDraft(working, baselineOf(shipped));
    if (res.error) {
      this.notify('error', 'Draft not saved', [res.error]);
      return false;
    }
    storage.clearRecovery();
    this.lastEdit = null;
    this.set({ saved: working, savedAt: res.savedAt, recovery: null });
    return true;
  }

  /** Throw away unsaved edits (undoable). */
  discard() {
    if (!this.state.dirty) return;
    this.replace('Discard changes', this.state.saved);
    storage.clearRecovery();
  }

  /** Back to the shipped content: clears the stored draft (the edit itself is undoable). */
  resetToShipped() {
    storage.clearDraft();
    storage.clearRecovery();
    this.replace('Reset to shipped content', this.state.shipped);
    this.set({ saved: this.state.shipped, savedAt: null, recovery: null });
  }

  restoreRecovery() {
    const rec = this.state.recovery;
    if (!rec) return;
    const { project, notes } = rebaseProject(rec.project, rec.baseline, this.state.shipped);
    this.set({ recovery: null });
    this.replace('Restore unsaved changes', project);
    if (notes.length) this.notify(noteTone(notes), 'Recovered changes were updated to match the source files', notes.map((n) => n.text));
  }

  dismissRecovery() {
    storage.clearRecovery();
    this.set({ recovery: null });
  }

  private scheduleRecovery() {
    window.clearTimeout(this.recoveryTimer);
    this.recoveryTimer = window.setTimeout(() => this.flushRecovery(), 800);
  }

  private flushRecovery() {
    window.clearTimeout(this.recoveryTimer);
    if (!this.state.dirty) return;
    storage.saveRecovery(this.state.working, baselineOf(this.state.shipped));
  }
}

function noteTone(notes: RebaseNote[]): Tone {
  return notes.some((n) => n.kind === 'conflict') ? 'warning' : 'info';
}

export const editor = new ProjectStore();

/** Subscribe a component to the editor state. */
export function useEditor(): EditorState {
  return useSyncExternalStore(editor.subscribe, editor.getState);
}

/**
 * The editor shell: sidebar navigation, the project bar (save state, undo,
 * save/discard, problems), notices, and the active workspace.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { editor, useEditor } from '../store/projectStore';
import { storage } from '../store/persistence';
import { countIssues, validateProject, type Issue } from '../validation/validate';
import type { Workspace } from '../model/types';
import { Icon } from './Icon';
import { Button, ConfirmProvider, IssueList, SeverityIcon } from './kit';
import { useConfirm } from './kitHooks';
import { DEFAULT_NAV, NavCtx, navForIssue, type NavState } from './nav';
import { LevelsWorkspace } from './levels/LevelsWorkspace';
import { EnemiesWorkspace } from './enemies/EnemiesWorkspace';
import { ChampionsWorkspace } from './champions/ChampionsWorkspace';
import { MasteryWorkspace } from './mastery/MasteryWorkspace';
import { PacksWorkspace } from './packs/PacksWorkspace';

const NAV_ITEMS: { id: Workspace; label: string; icon: string; kinds: string[] }[] = [
  { id: 'levels', label: 'Levels', icon: 'levels', kinds: ['level'] },
  { id: 'enemies', label: 'Enemies', icon: 'enemies', kinds: ['enemy', 'boss'] },
  { id: 'champions', label: 'Champions', icon: 'champions', kinds: ['unit'] },
  { id: 'mastery', label: 'Mastery', icon: 'mastery', kinds: ['mastery'] },
  { id: 'packs', label: 'Content Packs', icon: 'packs', kinds: ['project'] },
];

export function App() {
  return (
    <ConfirmProvider>
      <Shell />
    </ConfirmProvider>
  );
}

function Shell() {
  const state = useEditor();
  const { working } = state;
  const confirm = useConfirm();
  const [nav, setNav] = useState<NavState>(() => storage.loadPrefs({ nav: DEFAULT_NAV }).nav);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const issues = validateProject(working);
  const counts = countIssues(issues);

  const go = useCallback((patch: Partial<NavState>) => setNav((n) => ({ ...n, focusField: undefined, ...patch })), []);
  const navValue = useMemo(() => ({ nav, go }), [nav, go]);

  useEffect(() => {
    storage.savePrefs({ nav: { ...nav, focusField: undefined } });
  }, [nav]);

  // Scroll to (and focus) a field the Problems list pointed at.
  useEffect(() => {
    if (!nav.focusField) return;
    const t = setTimeout(() => {
      // The field itself, else its nearest tagged parent (a wave group row for `…groups.1.enemyId`).
      const parts = nav.focusField!.split('.');
      let el: HTMLElement | null = null;
      let leaf = '';
      for (let n = parts.length; n > 0 && !el; n--) {
        el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(parts.slice(0, n).join('.'))}"]`);
        if (!el) leaf = parts[n - 1];
      }
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const named = (leaf && el.querySelector<HTMLElement>(`[data-leaf="${CSS.escape(leaf)}"]`)) || el;
      named.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1200);
    }, 80);
    return () => clearTimeout(t);
  }, [nav]);

  // Keyboard: Ctrl+S save, Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        editor.save();
      } else if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        editor.undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        editor.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Warn before leaving with unsaved edits (they are also kept for recovery).
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!editor.getState().dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  const badge = (kinds: string[]) => {
    let e = 0;
    let w = 0;
    for (const i of issues) {
      const k = i.entity === 'project' ? 'project' : i.entity.slice(0, i.entity.indexOf(':'));
      if (!kinds.includes(k)) continue;
      if (i.severity === 'error') e++;
      else if (i.severity === 'warning') w++;
    }
    return { e, w };
  };

  const discard = async () => {
    if (await confirm({ title: 'Discard unsaved changes?', body: 'Every edit since your last save is thrown away. You can still undo this.', confirmLabel: 'Discard changes' })) {
      editor.discard();
    }
  };

  const status = state.dirty ? 'Unsaved changes' : state.savedAt ? `Draft saved ${timeAgo(state.savedAt)}` : 'Shipped content';
  const counts2 = { levels: working.levels.length, enemies: working.enemies.length + working.bosses.length, champions: working.units.length, mastery: Object.keys(working.mastery).length, packs: null };

  return (
    <NavCtx.Provider value={navValue}>
      <div className="ed-app">
        <nav className="ed-nav" aria-label="Workspaces">
          <div className="ed-brand">
            <span className="mark" aria-hidden="true">✦</span>
            <span>
              <strong>Aetheria</strong>
              <small>Content Editor</small>
            </span>
          </div>
          <ul>
            {NAV_ITEMS.map((n) => {
              const b = badge(n.kinds);
              const count = counts2[n.id];
              return (
                <li key={n.id}>
                  <button type="button" className={nav.workspace === n.id ? 'on' : undefined} aria-current={nav.workspace === n.id ? 'page' : undefined} onClick={() => go({ workspace: n.id })}>
                    <Icon name={n.icon} size={18} />
                    <span className="label">{n.label}</span>
                    {count !== null && <span className="n">{count}</span>}
                    {b.e > 0 ? <span className="ed-count error" title={`${b.e} error(s)`}>{b.e}</span> : b.w > 0 ? <span className="ed-count warning" title={`${b.w} warning(s)`}>{b.w}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="ed-nav-foot">
            <p>
              Edits live in this browser until you export them. Nothing here touches the game's saves.
            </p>
          </div>
        </nav>

        <div className="ed-main">
          <header className="ed-bar">
            <div className={`ed-status${state.dirty ? ' dirty' : ''}`} role="status" aria-live="polite">
              <span className="dot" aria-hidden="true" />
              <span>{status}</span>
              {!state.dirty && state.draftDiffers && <span className="ed-tag">Differs from shipped</span>}
            </div>
            <div className="ed-bar-actions" role="toolbar" aria-label="Project">
              <Button icon="undo" tone="plain" onClick={() => editor.undo()} disabled={!state.undoLabel} title={state.undoLabel ? `Undo ${state.undoLabel} (Ctrl+Z)` : 'Nothing to undo'} />
              <Button icon="redo" tone="plain" onClick={() => editor.redo()} disabled={!state.redoLabel} title={state.redoLabel ? `Redo ${state.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'} />
              <span className="sep" />
              <Button icon="discard" onClick={discard} disabled={!state.dirty} title="Discard unsaved changes">
                Discard
              </Button>
              <Button icon="save" tone="primary" onClick={() => editor.save()} disabled={!state.dirty} title="Save draft (Ctrl+S)">
                Save
              </Button>
              <span className="sep" />
              <Button
                icon={counts.error ? 'error' : counts.warning ? 'warning' : 'check'}
                tone={counts.error ? 'danger' : 'ghost'}
                onClick={() => setProblemsOpen((o) => !o)}
                aria-expanded={problemsOpen}
                title="Show validation problems"
              >
                {counts.error ? `${counts.error} error${counts.error === 1 ? '' : 's'}` : counts.warning ? `${counts.warning} warning${counts.warning === 1 ? '' : 's'}` : 'Valid'}
              </Button>
            </div>
          </header>

          <Notices />

          <main className="ed-workspace" id="workspace">
            {nav.workspace === 'levels' && <LevelsWorkspace />}
            {nav.workspace === 'enemies' && <EnemiesWorkspace />}
            {nav.workspace === 'champions' && <ChampionsWorkspace />}
            {nav.workspace === 'mastery' && <MasteryWorkspace />}
            {nav.workspace === 'packs' && <PacksWorkspace />}
          </main>
        </div>

        {problemsOpen && (
          <ProblemsDrawer
            issues={issues}
            onClose={() => setProblemsOpen(false)}
            onPick={(i) => {
              const target = navForIssue(i, working);
              if (target) go(target);
            }}
          />
        )}
      </div>
    </NavCtx.Provider>
  );
}

function Notices() {
  const { notices, recovery } = useEditor();
  if (!recovery && notices.length === 0) return null;
  return (
    <div className="ed-notices" aria-live="polite">
      {recovery && (
        <div className="ed-notice warning">
          <Icon name="restore" />
          <div className="body">
            <strong>Unsaved changes from {new Date(recovery.at).toLocaleString()} were recovered.</strong>
            <span>They were never saved as your draft (the tab closed or reloaded first).</span>
          </div>
          <Button tone="primary" size="sm" onClick={() => editor.restoreRecovery()}>
            Restore them
          </Button>
          <Button size="sm" onClick={() => editor.dismissRecovery()}>
            Dismiss
          </Button>
        </div>
      )}
      {notices.map((n) => (
        <div key={n.id} className={`ed-notice ${n.tone}`}>
          <Icon name={n.tone === 'error' ? 'error' : n.tone === 'warning' ? 'warning' : n.tone === 'success' ? 'check' : 'info'} />
          <div className="body">
            <strong>{n.title}</strong>
            {n.detail && n.detail.length > 0 && (
              <ul>
                {n.detail.slice(0, 8).map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
                {n.detail.length > 8 && <li>…and {n.detail.length - 8} more.</li>}
              </ul>
            )}
          </div>
          <Button icon="close" tone="plain" size="sm" title="Dismiss" onClick={() => editor.dismissNotice(n.id)} />
        </div>
      ))}
    </div>
  );
}

function ProblemsDrawer({ issues, onClose, onPick }: { issues: Issue[]; onClose: () => void; onPick: (i: Issue) => void }) {
  const [show, setShow] = useState<{ error: boolean; warning: boolean; info: boolean }>({ error: true, warning: true, info: false });
  const shown = issues.filter((i) => show[i.severity]);
  const groups = new Map<string, Issue[]>();
  for (const i of shown) groups.set(i.entity, [...(groups.get(i.entity) ?? []), i]);
  const c = countIssues(issues);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <aside className="ed-problems" aria-label="Problems">
      <header>
        <h2>Problems</h2>
        <Button icon="close" tone="plain" title="Close problems" onClick={onClose} />
      </header>
      <div className="ed-problems-filters">
        {(['error', 'warning', 'info'] as const).map((s) => (
          <label key={s} className={`ed-chip${show[s] ? ' on' : ''}`}>
            <input type="checkbox" checked={show[s]} onChange={(e) => setShow({ ...show, [s]: e.target.checked })} />
            <SeverityIcon severity={s} /> {s === 'error' ? `${c.error} errors` : s === 'warning' ? `${c.warning} warnings` : `${c.info} notes`}
          </label>
        ))}
      </div>
      <p className="ed-muted small">Errors block content export and source export. Warnings flag likely mistakes. Click a problem to jump to it.</p>
      <div className="ed-problems-list">
        {groups.size === 0 && <p className="ed-muted">No problems to show.</p>}
        {[...groups].map(([entity, list]) => (
          <div key={entity} className="ed-problem-group">
            <h4>{entityLabel(entity)}</h4>
            <IssueList issues={list} onPick={onPick} />
          </div>
        ))}
      </div>
    </aside>
  );
}

function entityLabel(entity: string): string {
  if (entity === 'project') return 'Project';
  const s = editor.getState().working;
  const id = entity.slice(entity.indexOf(':') + 1);
  if (entity.startsWith('level:')) return `Stage ${id} · ${s.levels.find((l) => String(l.id) === id)?.name ?? ''}`;
  if (entity.startsWith('enemy:')) return `Foe · ${s.enemies.find((e) => e.id === id)?.name ?? id}`;
  if (entity.startsWith('boss:')) return `Boss of stage ${id} · ${s.bosses.find((b) => String(b.level) === id)?.name ?? ''}`;
  if (entity.startsWith('unit:')) return `Champion · ${s.units.find((u) => u.id === id)?.name ?? id}`;
  if (entity.startsWith('mastery:')) return `Skill tree · ${id}`;
  return entity;
}

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleString();
}

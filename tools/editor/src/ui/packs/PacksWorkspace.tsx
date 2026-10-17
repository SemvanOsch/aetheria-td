/**
 * Content Packs & Settings: what changed, JSON content packs (export/import,
 * backups), the TypeScript source export (preview, download, or an explicit
 * write into src/domain on the dev server), and reset-to-shipped.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { editor, useEditor } from '../../store/projectStore';
import { buildPack, packFileName, parsePack, applyPack, stripUnsupported, PACK_VERSION, PackError, type ContentPack, type PackScope } from '../../content/pack';
import { buildSourceExport, ExportError, type SourceFile } from '../../export/sourceExport';
import { SHIPPED_SOURCES } from '../../export/sources';
import { diffLines, diffStats, toHunks } from '../../export/diff';
import { changedKeys, reordered as isReordered } from '../../model/entities';
import { sha256Hex, plural } from '../../model/util';
import { countIssues, validateProject } from '../../validation/validate';
import type { ContentProject } from '../../model/types';
import { Button, IssueList, Section, Segmented, Stat } from '../kit';
import { downloadText, useConfirm } from '../kitHooks';
import { Icon } from '../Icon';

const API = '/__aetheria-editor';
const WROTE_KEY = 'aetheria-editor:wrote';

export function PacksWorkspace() {
  const state = useEditor();
  const { working, shipped } = state;
  const confirm = useConfirm();
  const issues = validateProject(working);
  const counts = countIssues(issues);
  const changed = useMemo(() => [...changedKeys(shipped, working)].filter((k) => !k.startsWith('order:')), [shipped, working]);
  const reordered = useMemo(
    () => [...changedKeys(shipped, working)].filter((k) => k.startsWith('order:') && isReordered(shipped, working, k.slice(6))),
    [shipped, working],
  );

  const backup = () => {
    const pack = buildPack(working, shipped, 'backup', 'full');
    downloadText(packFileName(pack), JSON.stringify(pack, null, 2));
  };

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset to the shipped content?',
      body: (
        <>
          <p>Your saved draft and any unsaved edits are replaced by the content in src/domain as it is right now. The stored draft is deleted from this browser.</p>
          <p className="ed-muted">You can still undo the reset in this session, but download a backup if you might want the draft later.</p>
        </>
      ),
      confirmLabel: 'Reset to shipped',
      extra: { label: 'Download backup first', run: backup },
    });
    if (ok) {
      editor.resetToShipped();
      editor.notify('success', 'Reset to the shipped content', ['Your draft was cleared. Undo (Ctrl+Z) brings the edits back into the working copy.']);
    }
  };

  return (
    <div className="ed-packs">
      <WroteNotice />
      <Section title="Project">
        <div className="ed-stats">
          <Stat label="Changed or new" value={changed.length} tone={changed.length ? 'gold' : 'muted'} />
          <Stat label="Errors" value={counts.error} tone={counts.error ? 'error' : 'ok'} />
          <Stat label="Warnings" value={counts.warning} />
          <Stat
            label="Draft saved"
            value={state.savedAt ? <span title={new Date(state.savedAt).toLocaleString()}>{savedWhen(state.savedAt)}</span> : 'never'}
            tone={state.savedAt ? undefined : 'muted'}
          />
        </div>
        <p className="ed-muted">
          {state.dirty ? 'You have unsaved changes. ' : ''}The draft lives in this browser's storage only; export it to share it or bring it back into the game.
        </p>
        {changed.length + reordered.length > 0 ? (
          <details className="ed-changes">
            <summary>What differs from the shipped content ({changed.length + reordered.length})</summary>
            <ul>
              {[...changed, ...reordered].map((k) => (
                <li key={k}>
                  <code>{k}</code>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="ed-muted small">The working copy matches the shipped content.</p>
        )}
      </Section>

      <ExportPack project={working} shipped={shipped} errors={counts.error} onBackup={backup} />
      <ImportPack project={working} />
      <SourceExport project={working} shipped={shipped} errors={counts.error} issues={issues.filter((i) => i.severity === 'error')} />

      <Section title="Reset">
        <div className="ed-danger">
          <div>
            <strong>Reset to the shipped content</strong>
            <p className="ed-muted small">Throws away the draft and starts over from src/domain. Asks first, and offers a backup.</p>
          </div>
          <Button tone="danger" icon="reset" onClick={reset}>Reset to shipped…</Button>
        </div>
      </Section>

      <Section title="About">
        <p className="ed-muted small">
          Content pack format <code>aetheria-content-pack</code> v{PACK_VERSION}. Drafts and preferences are stored under <code>aetheria-editor:</code> in this browser. The editor never reads or writes the game's saves (<code>aetheria-td:</code>).
        </p>
      </Section>
    </div>
  );
}

function ExportPack({ project, shipped, errors, onBackup }: { project: ContentProject; shipped: ContentProject; errors: number; onBackup: () => void }) {
  const [scope, setScope] = useState<PackScope>('full');
  const [msg, setMsg] = useState<string | null>(null);
  const exportContent = () => {
    try {
      const pack = buildPack(project, shipped, 'content', scope);
      downloadText(packFileName(pack), JSON.stringify(pack, null, 2));
      setMsg(`Downloaded ${packFileName(pack)}.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <Section title="Export a content pack" help="A versioned JSON file with the project's content. Content packs are only written from a project with no errors; backups save the draft as-is.">
      <Segmented ariaLabel="Pack scope" value={scope} onChange={setScope} options={[{ value: 'full', label: 'Whole project' }, { value: 'changes', label: 'Only changes vs shipped' }]} />
      <div className="ed-row-actions">
        <Button tone="primary" icon="download" onClick={exportContent} disabled={errors > 0} title={errors ? 'Fix the errors first (see Problems)' : undefined}>
          Download content pack
        </Button>
        <Button icon="download" onClick={onBackup} title="Always available: a full snapshot of the draft, marked as a backup">
          Download backup
        </Button>
      </div>
      {errors > 0 && <p className="ed-warn small"><Icon name="error" /> {plural(errors, 'error')} must be fixed before a content pack can be exported. A backup can still be downloaded.</p>}
      {msg && <p className="ed-muted small">{msg}</p>}
    </Section>
  );
}

/** A short "when": the time for today's saves, else the date. */
function savedWhen(at: string): string {
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function ImportPack({ project }: { project: ContentProject }) {
  const [parsed, setParsed] = useState<{ pack: ContentPack; notes: string[]; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [strip, setStrip] = useState(true);
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [paste, setPaste] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const load = (text: string, name: string) => {
    setError(null);
    try {
      const r = parsePack(text);
      setParsed({ ...r, name });
      setMode(r.pack.scope === 'changes' ? 'merge' : 'replace');
    } catch (e) {
      setParsed(null);
      setError(e instanceof PackError ? e.message : `Couldn't read the pack: ${(e as Error).message}`);
    }
  };
  const readFile = (f: File) => f.text().then((t) => load(t, f.name));

  const preview = useMemo(() => {
    if (!parsed) return null;
    const base = mode === 'merge' ? { ...parsed.pack, scope: 'changes' as const } : parsed.pack;
    let next = applyPack(base, project);
    let stripped = 0;
    if (strip) ({ project: next, removed: stripped } = stripUnsupported(next));
    const c = countIssues(validateProject(next));
    return { next, stripped, counts: c };
  }, [parsed, mode, strip, project]);

  const apply = () => {
    if (!parsed || !preview) return;
    editor.replace(`Import ${parsed.name}`, preview.next);
    editor.notify('success', `Imported ${parsed.name}`, [
      mode === 'merge' ? 'Merged into the working copy.' : 'Replaced the working copy.',
      preview.stripped ? `Removed ${plural(preview.stripped, 'unsupported field')}.` : '',
      'It is not saved yet: press Save to keep it as your draft (Undo reverts the import).',
    ].filter(Boolean));
    setParsed(null);
    setPaste('');
  };

  const c = parsed?.pack.content;
  return (
    <Section title="Import a content pack" help="Load a pack into the working copy. A whole-project pack can replace it or be merged in; a changes-only pack is merged. Nothing is saved until you press Save.">
      <div
        className={`ed-drop${drag ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) readFile(f);
        }}
      >
        <Icon name="upload" size={22} />
        <span>Drop a .json pack here, or</span>
        <Button size="sm" onClick={() => fileRef.current?.click()}>Choose file…</Button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
      </div>
      <details>
        <summary>…or paste JSON</summary>
        <textarea className="ed-input mono" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Pack JSON" />
        <Button size="sm" onClick={() => load(paste, 'pasted pack')} disabled={!paste.trim()}>Read pasted pack</Button>
      </details>
      {error && <p className="ed-warn"><Icon name="error" /> {error}</p>}
      {parsed && preview && c && (
        <div className="ed-import-preview">
          <h4>
            {parsed.name} <span className="ed-tag">{parsed.pack.kind === 'backup' ? 'Backup' : 'Content pack'}</span> <span className="ed-tag">{parsed.pack.scope === 'changes' ? 'Changes only' : 'Whole project'}</span>
          </h4>
          <p className="ed-muted small">
            Created {new Date(parsed.pack.createdAt).toLocaleString()} · {plural(c.levels?.length ?? 0, 'stage')}, {plural((c.enemies?.length ?? 0) + (c.bosses?.length ?? 0), 'foe')}, {plural(c.units?.length ?? 0, 'champion')}, {plural(Object.keys(c.mastery ?? {}).length, 'tree')}
            {parsed.pack.removed?.length ? ` · removes ${parsed.pack.removed.length}` : ''}
          </p>
          {parsed.pack.kind === 'backup' && parsed.pack.validation.errors > 0 && <p className="ed-warn small">This backup was saved with {plural(parsed.pack.validation.errors, 'error')}; it imports as a draft to keep working on.</p>}
          {parsed.notes.length > 0 && <ul className="small">{parsed.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
          {parsed.pack.scope === 'full' && (
            <Segmented ariaLabel="Import mode" size="sm" value={mode} onChange={setMode} options={[{ value: 'replace', label: 'Replace the working copy' }, { value: 'merge', label: 'Merge into it' }]} />
          )}
          <label className="ed-check">
            <input type="checkbox" checked={strip} onChange={(e) => setStrip(e.target.checked)} /> Remove fields the game doesn't support {preview.stripped ? `(${preview.stripped} found)` : ''}
          </label>
          <p className={preview.counts.error ? 'ed-warn small' : 'ed-muted small'}>
            After import: {plural(preview.counts.error, 'error')}, {plural(preview.counts.warning, 'warning')}.
          </p>
          <div className="ed-row-actions">
            <Button tone="primary" icon="upload" onClick={apply}>Import</Button>
            <Button onClick={() => setParsed(null)}>Cancel</Button>
          </div>
          <p className="ed-muted small">Nothing is saved until you press Save, and Undo reverts the import.</p>
        </div>
      )}
    </Section>
  );
}

function SourceExport({ project, shipped, errors, issues }: { project: ContentProject; shipped: ContentProject; errors: number; issues: ReturnType<typeof validateProject> }) {
  const confirm = useConfirm();
  const [files, setFiles] = useState<SourceFile[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [writable, setWritable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/status`, { cache: 'no-store' })
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .then((j) => setWritable(!!j?.writable))
      .catch(() => setWritable(false));
  }, []);

  // A generated export goes stale the moment the project changes.
  useEffect(() => setFiles(null), [project]);

  const generate = () => {
    setFailure(null);
    try {
      const out = buildSourceExport(shipped, project, SHIPPED_SOURCES);
      setFiles(out);
      setOpen(out.find((f) => f.changed)?.path ?? null);
    } catch (e) {
      setFiles(null);
      setFailure(e instanceof ExportError ? e.message : `Export failed: ${(e as Error).message}`);
    }
  };

  const changedFiles = files?.filter((f) => f.changed) ?? [];

  const write = async () => {
    if (!changedFiles.length) return;
    const ok = await confirm({
      title: `Write ${plural(changedFiles.length, 'file')} to src/domain?`,
      body: (
        <>
          <p>The dev server will overwrite:</p>
          <ul>
            {changedFiles.map((f) => (
              <li key={f.path}>
                <code>{f.path}</code>
              </li>
            ))}
          </ul>
          <p className="ed-muted">
            Only if each file still matches what the editor loaded; otherwise nothing is written. Your draft is saved first. Review the result with <code>git diff</code> before committing.
          </p>
        </>
      ),
      confirmLabel: 'Write files',
      tone: 'primary',
    });
    if (!ok) return;
    setBusy(true);
    try {
      editor.save();
      const payload = { files: await Promise.all(changedFiles.map(async (f) => ({ path: f.path, content: f.updated, baseHash: await sha256Hex(f.original) }))) };
      try {
        sessionStorage.setItem(WROTE_KEY, JSON.stringify(changedFiles.map((f) => f.path)));
      } catch {
        // Only a courtesy note after reload.
      }
      const res = await fetch(`${API}/write`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Aetheria-Editor': '1' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        sessionStorage.removeItem(WROTE_KEY);
        editor.notify('error', 'Nothing was written', [body.error ?? `The dev server answered ${res.status}.`, ...(body.stale ?? []).map((s: string) => `Changed on disk: ${s}`)]);
      } else {
        editor.notify('success', `Wrote ${plural(body.written.length, 'file')} to src/domain`, [...body.written, 'The editor reloads with them as the shipped content. Review with git diff.']);
      }
    } catch (e) {
      sessionStorage.removeItem(WROTE_KEY);
      editor.notify('error', 'Nothing was written', [(e as Error).message]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Source export (TypeScript)" help="Generates updated src/domain catalog files. Untouched entities stay byte-for-byte (comments included); changed ones are patched property by property; new ones are printed in the file's style.">
      {errors > 0 ? (
        <>
          <p className="ed-warn"><Icon name="error" /> Source export is blocked by {plural(errors, 'error')}: invalid content can't be written as game source.</p>
          <IssueList issues={issues.slice(0, 8)} compact />
        </>
      ) : (
        <>
          <div className="ed-row-actions">
            <Button tone="primary" icon="code" onClick={generate}>Generate source files</Button>
            <span className="ed-muted small">
              {writable === null ? 'Checking the dev server…' : writable ? 'Direct write is available (dev server).' : 'Direct write needs `npm run editor` (dev server); downloads always work.'}
            </span>
          </div>
          {failure && <p className="ed-warn"><Icon name="error" /> {failure}</p>}
          {files && (
            <>
              {changedFiles.length === 0 ? (
                <p className="ed-muted">No source file changes: the project matches src/domain.</p>
              ) : (
                <div className="ed-row-actions">
                  <Button tone="primary" icon="save" onClick={write} disabled={!writable || busy} title={writable ? 'Overwrite these files in src/domain (asks first)' : 'Only available on the dev server'}>
                    Write {plural(changedFiles.length, 'file')} to src/domain…
                  </Button>
                  <Button icon="download" onClick={() => changedFiles.forEach((f) => downloadText(f.path.split('/').pop()!, f.updated, 'text/plain'))}>Download changed files</Button>
                </div>
              )}
              <div className="ed-files">
                {files.map((f) => (
                  <FileDiff key={f.path} file={f} open={open === f.path} onToggle={() => setOpen(open === f.path ? null : f.path)} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Section>
  );
}

function FileDiff({ file, open, onToggle }: { file: SourceFile; open: boolean; onToggle: () => void }) {
  const lines = useMemo(() => (file.changed && open ? diffLines(file.original, file.updated) : []), [file, open]);
  const stats = useMemo(() => (file.changed ? diffStats(diffLines(file.original, file.updated)) : { added: 0, removed: 0 }), [file]);
  const hunks = useMemo(() => toHunks(lines), [lines]);
  return (
    <div className={`ed-file${file.changed ? '' : ' same'}`}>
      <header>
        <button type="button" className="ed-link" onClick={onToggle} disabled={!file.changed} aria-expanded={open}>
          <Icon name="chevron" /> <code>{file.path}</code>
        </button>
        {file.changed ? (
          <span className="small">
            <span className="add">+{stats.added}</span> <span className="del">−{stats.removed}</span>
          </span>
        ) : (
          <span className="ed-muted small">unchanged</span>
        )}
        <span className="grow" />
        {file.changed && (
          <>
            <Button size="sm" icon="copy" onClick={() => navigator.clipboard?.writeText(file.updated)} title="Copy the whole file" />
            <Button size="sm" icon="download" onClick={() => downloadText(file.path.split('/').pop()!, file.updated, 'text/plain')} title="Download this file" />
          </>
        )}
      </header>
      {file.changes.length > 0 && (
        <ul className="ed-file-changes small">
          {file.changes.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
      {open && (
        <div className="ed-diff" role="region" aria-label={`Changes in ${file.path}`}>
          {hunks.map((h, i) => (
            <div key={i} className="hunk">
              <div className="hh">@@ line {h.oldStart} → {h.newStart} @@</div>
              {h.lines.map((l, j) => (
                <div key={j} className={`dl ${l.kind}`}>
                  <span className="no">{l.oldNo ?? ''}</span>
                  <span className="no">{l.newNo ?? ''}</span>
                  <span className="sg">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span>
                  <code>{l.text || ' '}</code>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** After a source write the page reloads; say what happened. */
function WroteNotice() {
  const [wrote] = useState<string[] | null>(() => {
    try {
      const v = sessionStorage.getItem(WROTE_KEY);
      sessionStorage.removeItem(WROTE_KEY);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  });
  if (!wrote) return null;
  return (
    <div className="ed-notice success">
      <Icon name="check" />
      <div className="body">
        <strong>Source files were written and reloaded.</strong>
        <span>{wrote.join(', ')} now hold your content; the editor's shipped baseline is the new files. Review with git diff, then commit.</span>
      </div>
    </div>
  );
}

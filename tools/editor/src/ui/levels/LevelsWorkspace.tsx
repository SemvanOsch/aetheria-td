/** Levels: the stage list (by chapter) and the selected stage's editor. */

import { useMemo, useState } from 'react';
import { useEditor } from '../../store/projectStore';
import { edit } from '../../store/edits';
import { validateProject, issuesAt, countIssues } from '../../validation/validate';
import { levelKey } from '../../model/entities';
import { SECTIONS, sectionColor, sectionName, type SectionId } from '../../model/catalog';
import { STARTING_GOLD, levelOrder } from '../../model/convert';
import { levelTotalWaves } from '../../model/queries';
import { clone, moveItem, plural } from '../../model/util';
import type { EditorLevel } from '../../model/types';
import { Button, EmptyState, IssueScopeProvider, Tabs } from '../kit';
import { useConfirm } from '../kitHooks';
import { Chip, ListPane, type ListRow } from '../ListPane';
import { useNav, type LevelTab } from '../nav';
import { LevelGeneral } from './LevelGeneral';
import { BoardEditor } from './BoardEditor';
import { WaveEditor } from './WaveEditor';
import { LevelSummary } from './LevelSummary';
import { TestPlay } from '../testplay/TestPlay';

type Status = 'all' | 'active' | 'archived';
type Sort = 'campaign' | 'id' | 'name';

export function LevelsWorkspace() {
  const { working } = useEditor();
  const { nav, go } = useNav();
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<SectionId | 'all'>('all');
  const [status, setStatus] = useState<Status>('all');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [sort, setSort] = useState<Sort>('campaign');
  const [testing, setTesting] = useState(false);
  const issues = validateProject(working);

  const level = working.levels.find((l) => l.id === nav.level) ?? null;
  const select = (id: number) => go({ level: id });

  const rows = useMemo<ListRow[]>(() => {
    const q = query.trim().toLowerCase();
    let list = working.levels.filter(
      (l) =>
        (section === 'all' || l.section === section) &&
        (status === 'all' || (status === 'archived' ? !!l.archived : !l.archived)) &&
        (!q || l.name.toLowerCase().includes(q) || String(l.id) === q || l.subtitle.toLowerCase().includes(q)),
    );
    if (onlyProblems) list = list.filter((l) => issuesAt(issues, levelKey(l.id)).some((i) => i.severity !== 'info'));
    const sorted =
      sort === 'campaign'
        ? SECTIONS.flatMap((s) => list.filter((l) => l.section === s.id))
        : [...list].sort((a, b) => (sort === 'id' ? a.id - b.id : a.name.localeCompare(b.name)));
    return sorted.map((l) => {
      const c = countIssues(issuesAt(issues, levelKey(l.id)));
      const order = levelOrder(working, l);
      return {
        key: String(l.id),
        title: `${l.id} · ${l.name || 'Untitled'}`,
        subtitle: `${l.archived ? 'Archived' : `Stage ${order} of ${sectionName(l.section)}`} · ${plural(levelTotalWaves(l), 'wave')}${l.lanes.length > 1 ? ` · ${l.lanes.length} lanes` : ''}`,
        lead: <span className="ed-swatch" style={{ background: l.color }} />,
        errors: c.error,
        warnings: c.warning,
        muted: l.archived,
        tag: l.archived ? 'Archived' : undefined,
        group: sort === 'campaign' ? sectionName(l.section) : undefined,
      };
    });
  }, [working, issues, query, section, status, onlyProblems, sort]);

  const nextId = () => Math.max(0, ...working.levels.filter((l) => !l.archived).map((l) => l.id)) + 1;
  const freeId = (want: number) => {
    let id = want;
    while (working.levels.some((l) => l.id === id)) id++;
    return id;
  };

  const create = () => {
    const sec = section === 'all' ? (level?.section ?? 'castle') : section;
    const id = freeId(nextId());
    const sameSection = working.levels.filter((l) => l.section === sec);
    const foe = working.enemies[0]?.id ?? 'cas_grunt';
    const boss = working.bosses.find((b) => b.level === id) ? `boss${id}` : (sameSection[sameSection.length - 1]?.bossId ?? working.levels[0]?.bossId ?? 'boss1');
    const fresh: EditorLevel = {
      id,
      section: sec,
      name: 'New Stage',
      subtitle: 'A new stage — describe it here.',
      baseHealth: 10,
      gem: 150,
      startingGold: STARTING_GOLD,
      color: sectionColor(sec),
      bossId: boss,
      lanes: [
        {
          path: [{ col: -1, row: 4 }, { col: 7, row: 4 }, { col: 7, row: 7 }, { col: 16, row: 7 }],
          waves: [{ groups: [{ enemyId: foe, count: 6 }] }, { groups: [{ enemyId: foe, count: 8 }] }, { groups: [{ enemyId: foe, count: 6 }, { enemyId: boss, count: 1, delay: 3 }] }],
        },
      ],
      theme: { groundEven: '#568042', groundOdd: '#506c42', floor: 'grass', pathKind: 'dirt' },
      decor: [],
    };
    edit.project(`Create stage ${id}`, (p) => {
      // Insert after the section's last stage so it lands at the end of its chapter.
      const last = p.levels.map((l) => l.section).lastIndexOf(sec);
      const levels = p.levels.slice();
      levels.splice(last + 1, 0, fresh);
      return { ...p, levels };
    });
    go({ level: id, levelTab: 'general' });
  };

  const duplicate = () => {
    if (!level) return;
    const id = freeId(nextId());
    const copy: EditorLevel = { ...clone(level), id, name: `${level.name} (copy)` };
    edit.project(`Duplicate stage ${level.id}`, (p) => {
      const i = p.levels.findIndex((l) => l.id === level.id);
      const levels = p.levels.slice();
      levels.splice(i + 1, 0, copy);
      return { ...p, levels };
    });
    go({ level: id });
  };

  const move = (dir: -1 | 1) => {
    if (!level) return;
    edit.project(`Reorder stage ${level.id}`, (p) => {
      const i = p.levels.findIndex((l) => l.id === level.id);
      let j = i + dir;
      while (j >= 0 && j < p.levels.length && p.levels[j].section !== level.section) j += dir;
      if (j < 0 || j >= p.levels.length) return p;
      return { ...p, levels: moveItem(p.levels, i, j) };
    });
  };

  const toggleArchive = () => {
    if (!level) return;
    edit.level(level.id, level.archived ? `Restore stage ${level.id}` : `Archive stage ${level.id}`, (d) => {
      if (d.archived) delete d.archived;
      else d.archived = true;
    });
  };

  const remove = async () => {
    if (!level) return;
    const ok = await confirm({
      title: `Delete stage ${level.id}?`,
      body: (
        <>
          <p>
            <strong>{level.name}</strong> and all its lanes, waves and board dressing will be removed from the project.
          </p>
          <p className="ed-muted">To take a stage out of the campaign but keep it authored, archive it instead. You can undo a delete.</p>
        </>
      ),
      confirmLabel: 'Delete stage',
    });
    if (!ok) return;
    const i = working.levels.findIndex((l) => l.id === level.id);
    edit.project(`Delete stage ${level.id}`, (p) => ({ ...p, levels: p.levels.filter((l) => l.id !== level.id) }));
    const next = working.levels[i + 1] ?? working.levels[i - 1];
    go({ level: next ? next.id : null });
  };

  const sameSection = level ? working.levels.filter((l) => l.section === level.section) : [];
  const levelIssues = level ? issuesAt(issues, levelKey(level.id)) : [];
  const tabIssues = (tab: LevelTab) => {
    const sub = levelIssues.filter((i) => {
      const f = i.field ?? '';
      if (tab === 'board') return /^(decor|theme|mood)/.test(f) || /\.path$/.test(f);
      if (tab === 'waves') return /^(lanes|waves)/.test(f) && !/\.path$/.test(f);
      if (tab === 'general') return !/^(decor|theme|mood|lanes|waves)/.test(f);
      return false;
    });
    const c = countIssues(sub);
    return c.error ? <span className="ed-count error">{c.error}</span> : c.warning ? <span className="ed-count warning">{c.warning}</span> : null;
  };

  return (
    <div className="ed-split">
      <ListPane
        label="Stages"
        rows={rows}
        selected={level ? String(level.id) : null}
        onSelect={(k) => select(Number(k))}
        query={query}
        onQuery={setQuery}
        filters={
          <>
            <div className="ed-chips" role="group" aria-label="Chapter">
              <Chip on={section === 'all'} onClick={() => setSection('all')}>All</Chip>
              {SECTIONS.map((s) => (
                <Chip key={s.id} on={section === s.id} onClick={() => setSection(s.id)} title={s.name}>
                  {s.icon} {s.name.replace(/^The /, '')}
                </Chip>
              ))}
            </div>
            <div className="ed-chips" role="group" aria-label="Status">
              {(['all', 'active', 'archived'] as Status[]).map((s) => (
                <Chip key={s} on={status === s} onClick={() => setStatus(s)}>
                  {s === 'all' ? 'Any status' : s === 'active' ? 'Active' : 'Archived'}
                </Chip>
              ))}
              <Chip on={onlyProblems} onClick={() => setOnlyProblems(!onlyProblems)}>Has problems</Chip>
            </div>
            <label className="ed-sort">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="campaign">Campaign order</option>
                <option value="id">Stage id</option>
                <option value="name">Name</option>
              </select>
            </label>
          </>
        }
        toolbar={
          <>
            <Button icon="plus" tone="primary" size="sm" onClick={create}>New stage</Button>
            <Button icon="copy" size="sm" onClick={duplicate} disabled={!level} title="Duplicate the selected stage" />
            <Button icon="up" size="sm" onClick={() => move(-1)} disabled={!level || sameSection[0] === level} title="Move earlier in its chapter" />
            <Button icon="down" size="sm" onClick={() => move(1)} disabled={!level || sameSection[sameSection.length - 1] === level} title="Move later in its chapter" />
          </>
        }
        empty={<EmptyState icon="levels" title="No stages match">Clear the search or filters, or create a new stage.</EmptyState>}
      />

      {!level ? (
        <div className="ed-detail">
          <EmptyState icon="levels" title="Pick a stage to edit" action={<Button icon="plus" tone="primary" onClick={create}>New stage</Button>}>
            Stages are grouped by chapter. Each stage has one or more lanes, and every lane owns its path and waves.
          </EmptyState>
        </div>
      ) : (
        <IssueScopeProvider issues={levelIssues}>
          <div className="ed-detail">
            <header className="ed-detail-head">
              <div className="title">
                <span className="ed-swatch lg" style={{ background: level.color }} />
                <div>
                  <h1>
                    {level.name || 'Untitled stage'}
                    {level.archived && <span className="ed-tag">Archived</span>}
                  </h1>
                  <p>
                    Stage {level.id} · {sectionName(level.section)}
                    {!level.archived && ` · ${levelOrder(working, level)} of ${sameSection.filter((l) => !l.archived).length}`} · {plural(levelTotalWaves(level), 'wave')} · {plural(level.lanes.length, 'lane')}
                  </p>
                </div>
              </div>
              <div className="actions">
                <Button icon="play" tone="primary" onClick={() => setTesting(true)} title="Run this stage in the real game simulation">
                  Test play
                </Button>
                <Button icon={level.archived ? 'restore' : 'archive'} onClick={toggleArchive} title={level.archived ? 'Put it back in the campaign' : 'Pull it from the campaign but keep it authored'}>
                  {level.archived ? 'Restore' : 'Archive'}
                </Button>
                <Button icon="copy" onClick={duplicate}>Duplicate</Button>
                <Button icon="trash" tone="danger" onClick={remove} title="Delete this stage" />
              </div>
            </header>
            <Tabs
              ariaLabel="Stage sections"
              value={nav.levelTab}
              onChange={(t) => go({ levelTab: t })}
              tabs={[
                { id: 'general', label: 'General', icon: 'flag', badge: tabIssues('general') },
                { id: 'board', label: 'Board', icon: 'grid', badge: tabIssues('board') },
                { id: 'waves', label: 'Lanes & Waves', icon: 'wave', badge: tabIssues('waves') },
                { id: 'summary', label: 'Summary', icon: 'layers' },
              ]}
            />
            <div className="ed-detail-body" role="tabpanel">
              {nav.levelTab === 'general' && <LevelGeneral level={level} />}
              {nav.levelTab === 'board' && <BoardEditor level={level} />}
              {nav.levelTab === 'waves' && <WaveEditor level={level} />}
              {nav.levelTab === 'summary' && <LevelSummary level={level} onTestPlay={() => setTesting(true)} />}
            </div>
          </div>
        </IssueScopeProvider>
      )}
      {testing && level && <TestPlay level={level} onClose={() => setTesting(false)} />}
    </div>
  );
}

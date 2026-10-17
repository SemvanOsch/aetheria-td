/**
 * Lanes & Waves: each lane's settings, and every wave as a card listing each
 * lane's enemy groups. Wave N spawns every lane's own wave N at the same
 * moment, so wave-level actions (add, duplicate, reorder, delete) keep lanes
 * aligned; each lane's groups — and a lane's own wave order — are edited
 * independently. Summaries come from the engine's own spawn maths.
 */

import { useMemo, type CSSProperties } from 'react';
import { groupSpacing, type EnemyGroup } from '@game/domain/levels';
import { useEditor } from '../../store/projectStore';
import { edit, setOpt } from '../../store/edits';
import { GROUP_FIELDS } from '../../model/catalog';
import { enemyCatalog } from '../../model/convert';
import { laneLength, levelTotalWaves, waveStats } from '../../model/queries';
import { clone, fmt, plural } from '../../model/util';
import type { EditorLevel } from '../../model/types';
import { Button, InlineIssues, IssueList, NumberInput, Section, Select, Toggle } from '../kit';
import { useConfirm, useFieldIssues } from '../kitHooks';
import { Icon } from '../Icon';
import { laneColor } from './laneColors';
import { useNav } from '../nav';

export function WaveEditor({ level }: { level: EditorLevel }) {
  const { working } = useEditor();
  const confirm = useConfirm();
  const { go } = useNav();
  const catalog = useMemo(() => enemyCatalog(working), [working]);
  const total = levelTotalWaves(level);
  const set = (label: string, fn: (d: EditorLevel) => void, key?: string) => edit.level(level.id, label, fn, key);
  const foeOptions = useMemo(
    () => [
      ...working.enemies.map((e) => ({ value: e.id, label: `${e.name} (${e.id})` })),
      ...working.bosses.map((b) => ({ value: `boss${b.level}`, label: `★ ${b.name} (boss${b.level})` })),
    ],
    [working.enemies, working.bosses],
  );
  const firstFoe = working.enemies[0]?.id ?? 'cas_grunt';

  // ----------------------------------------------------------- lane actions
  const addLane = () => set('Add lane', (d) => d.lanes.push({ path: [], waves: Array.from({ length: total }, () => ({ groups: [] })) }));
  const dupLane = (i: number) => set(`Duplicate lane ${i + 1}`, (d) => d.lanes.splice(i + 1, 0, clone(d.lanes[i])));
  const moveLane = (i: number, dir: -1 | 1) =>
    set(`Reorder lane ${i + 1}`, (d) => {
      const j = i + dir;
      if (j < 0 || j >= d.lanes.length) return;
      [d.lanes[i], d.lanes[j]] = [d.lanes[j], d.lanes[i]];
    });
  const removeLane = async (i: number) => {
    const groups = level.lanes[i].waves.reduce((n, w) => n + w.groups.length, 0);
    if (await confirm({ title: `Delete lane ${i + 1}?`, body: `Its path and ${plural(groups, 'enemy group')} across all waves are removed. You can undo this.`, confirmLabel: 'Delete lane' })) {
      set(`Delete lane ${i + 1}`, (d) => d.lanes.splice(i, 1));
    }
  };

  // ----------------------------------------------------------- wave actions
  const addWave = () =>
    set('Add wave', (d) => {
      const n = levelTotalWaves(d);
      for (const l of d.lanes) while (l.waves.length < n + 1) l.waves.push({ groups: [] });
      d.lanes[0]?.waves[n].groups.push({ enemyId: firstFoe, count: 6 });
    });
  const dupWave = (w: number) =>
    set(`Duplicate wave ${w + 1}`, (d) => {
      for (const l of d.lanes) if (l.waves.length > w) l.waves.splice(w + 1, 0, clone(l.waves[w]));
    });
  const moveWave = (w: number, dir: -1 | 1) =>
    set(`Move wave ${w + 1}`, (d) => {
      const j = w + dir;
      const n = levelTotalWaves(d);
      if (j < 0 || j >= n) return;
      for (const l of d.lanes) {
        const len = l.waves.length;
        while (l.waves.length < n) l.waves.push({ groups: [] });
        [l.waves[w], l.waves[j]] = [l.waves[j], l.waves[w]];
        // Don't leave a shorter lane padded with empty waves.
        while (l.waves.length > len && l.waves[l.waves.length - 1].groups.length === 0) l.waves.pop();
      }
    });
  const removeWave = async (w: number) => {
    const groups = level.lanes.reduce((n, l) => n + (l.waves[w]?.groups.length ?? 0), 0);
    if (groups && !(await confirm({ title: `Delete wave ${w + 1}?`, body: `It holds ${plural(groups, 'enemy group')}. Later waves move up. You can undo this.`, confirmLabel: 'Delete wave' }))) return;
    set(`Delete wave ${w + 1}`, (d) => {
      for (const l of d.lanes) if (l.waves.length > w) l.waves.splice(w, 1);
      for (const l of d.lanes) if (l.revealAtWave !== undefined && l.revealAtWave > w) l.revealAtWave--;
    });
  };
  const moveLaneWave = (li: number, w: number, dir: -1 | 1) =>
    set(`Move lane ${li + 1}'s wave ${w + 1}`, (d) => {
      const waves = d.lanes[li].waves;
      const j = w + dir;
      if (j < 0) return;
      const len = waves.length;
      while (waves.length <= Math.max(j, w)) waves.push({ groups: [] });
      [waves[w], waves[j]] = [waves[j], waves[w]];
      while (waves.length > len && waves[waves.length - 1].groups.length === 0) waves.pop();
    });

  // ---------------------------------------------------------- group actions
  const addGroup = (li: number, w: number) =>
    set('Add group', (d) => {
      const waves = d.lanes[li].waves;
      while (waves.length <= w) waves.push({ groups: [] });
      const prev = waves[w].groups[waves[w].groups.length - 1];
      waves[w].groups.push(prev ? { enemyId: prev.enemyId, count: prev.count, delay: 2 } : { enemyId: firstFoe, count: 6 });
    });
  const groupAt = (d: EditorLevel, li: number, w: number) => d.lanes[li].waves[w].groups;

  return (
    <div className="ed-form">
      <Section
        title="Lanes"
        help="Each lane is an independent path with its own waves. Lanes may share a tail (converge) so their foes merge near the castle."
        actions={<Button icon="plus" size="sm" onClick={addLane}>Add lane</Button>}
      >
        <div className="ed-lanes">
          {level.lanes.map((l, i) => (
            <div key={i} className="ed-lane-card" style={{ '--lane': laneColor(i) } as CSSProperties} data-field={`lanes.${i}`}>
              <header>
                <span className="dot" aria-hidden="true" />
                <strong>Lane {i + 1}</strong>
                <span className="ed-muted small">
                  {l.path.length >= 2
                    ? `(${l.path[0].col}, ${l.path[0].row}) → (${l.path[l.path.length - 1].col}, ${l.path[l.path.length - 1].row}) · ${plural(l.path.length - 2, 'turn')} · ${fmt(laneLength(l) / 48, 1)} tiles`
                    : 'No path yet'}
                </span>
                <span className="grow" />
                <Button size="sm" tone="subtle" icon="path" onClick={() => go({ levelTab: 'board' })}>Edit path</Button>
                <Button size="sm" tone="plain" icon="up" title="Move lane up" disabled={i === 0} onClick={() => moveLane(i, -1)} />
                <Button size="sm" tone="plain" icon="down" title="Move lane down" disabled={i === level.lanes.length - 1} onClick={() => moveLane(i, 1)} />
                <Button size="sm" tone="plain" icon="copy" title="Duplicate lane" onClick={() => dupLane(i)} />
                <Button size="sm" tone="plain" icon="trash" title="Delete lane" disabled={level.lanes.length === 1} onClick={() => removeLane(i)} />
              </header>
              <div className="ed-inline-fields">
                <label data-field={`lanes.${i}.revealAtWave`}>
                  Appears
                  <select
                    className="ed-input ed-select"
                    value={l.revealAtWave ?? ''}
                    onChange={(e) => set('Change lane reveal', (d) => setOpt(d.lanes[i], 'revealAtWave', e.target.value === '' ? undefined : Number(e.target.value)))}
                  >
                    <option value="">From the start</option>
                    {Array.from({ length: Math.max(total, 1) }, (_, w) => (
                      <option key={w} value={w}>
                        Rolls out at wave {w + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <Toggle
                  label="Foes emerge from water"
                  help="Foes spawning at this lane's start surface out of water (the Sewers' cistern) before wading on."
                  checked={!!l.emerge}
                  onChange={(v) => set(v ? 'Lane emerges from water' : 'Lane spawns normally', (d) => setOpt(d.lanes[i], 'emerge', v || undefined))}
                />
              </div>
              <InlineIssues path={`lanes.${i}.revealAtWave`} />
              <InlineIssues path={`lanes.${i}.waves`} />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title={`Waves (${total})`}
        help="Wave N starts every lane's wave N at once. Within a lane, a group's delay counts from the previous group's start; groups overlap unless delayed past it."
        actions={<Button icon="plus" size="sm" tone="primary" onClick={addWave}>Add wave</Button>}
      >
        {total === 0 && <p className="ed-muted">No waves yet. Add one to start spawning foes.</p>}
        <InlineIssues path="lanes" />
        {Array.from({ length: total }, (_, w) => {
          const s = waveStats(level, w, catalog);
          return (
            <article key={w} className="ed-wave" aria-label={`Wave ${w + 1}`} data-field={`waves.${w}`}>
              <header>
                <h4>Wave {w + 1}</h4>
                <div className="ed-wave-stats">
                  <span title="Foes spawned"><Icon name="enemies" size={13} /> {s.enemies}</span>
                  <span title="Total health"><Icon name="heart" size={13} /> {fmt(s.health, 0)}</span>
                  <span title="Gold from kills, plus the wave-clear bonus"><Icon name="gold" size={13} /> {fmt(s.gold, 0)} <small>+{s.clearGold}</small></span>
                  <span title="Seconds from wave start to the last spawn">⏱ {fmt(s.spawnTime, 1)}s</span>
                  <span title="Rough seconds until the last foe would reach the castle unhindered">→ ~{fmt(s.arriveTime, 0)}s</span>
                  {s.bosses.length > 0 && <span className="boss">★ {s.bosses.join(', ')}</span>}
                </div>
                <span className="grow" />
                <Button size="sm" tone="plain" icon="up" title="Move wave earlier (all lanes)" disabled={w === 0} onClick={() => moveWave(w, -1)} />
                <Button size="sm" tone="plain" icon="down" title="Move wave later (all lanes)" disabled={w === total - 1} onClick={() => moveWave(w, 1)} />
                <Button size="sm" tone="plain" icon="copy" title="Duplicate wave (all lanes)" onClick={() => dupWave(w)} />
                <Button size="sm" tone="plain" icon="trash" title="Delete wave (all lanes)" onClick={() => removeWave(w)} />
              </header>
              <InlineIssues path={`waves.${w}`} />
              {level.lanes.map((l, li) => {
                const hidden = l.revealAtWave !== undefined && w < l.revealAtWave;
                const groups = l.waves[w]?.groups ?? [];
                return (
                  <div key={li} className={`ed-wave-lane${hidden ? ' hidden' : ''}`} style={{ '--lane': laneColor(li) } as CSSProperties}>
                    {level.lanes.length > 1 && (
                      <div className="ed-wave-lane-head">
                        <span className="dot" aria-hidden="true" /> Lane {li + 1}
                        {hidden && <span className="ed-tag">Hidden until wave {(l.revealAtWave ?? 0) + 1}</span>}
                        <span className="grow" />
                        <Button size="sm" tone="plain" icon="up" title={`Swap lane ${li + 1}'s wave ${w + 1} with its wave ${w}`} disabled={w === 0} onClick={() => moveLaneWave(li, w, -1)} />
                        <Button size="sm" tone="plain" icon="down" title={`Swap lane ${li + 1}'s wave ${w + 1} with its wave ${w + 2}`} onClick={() => moveLaneWave(li, w, 1)} />
                      </div>
                    )}
                    <Timeline groups={groups} />
                    {groups.length > 0 && (
                      <table className="ed-groups">
                        <thead>
                          <tr>
                            <th scope="col">Foe</th>
                            <th scope="col" title={GROUP_FIELDS.count.help}>Count</th>
                            <th scope="col" title={GROUP_FIELDS.spacing.help}>Spacing</th>
                            <th scope="col" title={GROUP_FIELDS.delay.help}>Delay</th>
                            <th scope="col" title={GROUP_FIELDS.healthMult.help}>Health ×</th>
                            <th scope="col"><span className="sr-only">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups.map((g, gi) => (
                            <GroupRow
                              key={gi}
                              path={`lanes.${li}.waves.${w}.groups.${gi}`}
                              group={g}
                              index={gi}
                              count={groups.length}
                              foeOptions={foeOptions}
                              onSet={(label, fn, key) => set(label, (d) => fn(groupAt(d, li, w)[gi]), key && `g${li}.${w}.${gi}.${key}`)}
                              onDuplicate={() => set('Duplicate group', (d) => groupAt(d, li, w).splice(gi + 1, 0, clone(g)))}
                              onMove={(dir) => set('Reorder group', (d) => {
                                const list = groupAt(d, li, w);
                                const j = gi + dir;
                                if (j >= 0 && j < list.length) [list[gi], list[j]] = [list[j], list[gi]];
                              })}
                              onDelete={() => set('Delete group', (d) => groupAt(d, li, w).splice(gi, 1))}
                            />
                          ))}
                        </tbody>
                      </table>
                    )}
                    <Button size="sm" icon="plus" tone="subtle" onClick={() => addGroup(li, w)}>Add group{level.lanes.length > 1 ? ` to lane ${li + 1}` : ''}</Button>
                  </div>
                );
              })}
            </article>
          );
        })}
      </Section>
    </div>
  );
}

function GroupRow({
  path,
  group,
  index,
  count,
  foeOptions,
  onSet,
  onDuplicate,
  onMove,
  onDelete,
}: {
  path: string;
  group: EnemyGroup;
  index: number;
  count: number;
  foeOptions: { value: string; label: string }[];
  onSet: (label: string, fn: (g: EnemyGroup) => void, key?: string) => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const issues = useFieldIssues(path, true);
  const bad = (f: string) => issues.some((i) => i.field === `${path}.${f}` && i.severity === 'error');
  return (
    <>
      <tr data-field={path}>
        <td data-leaf="enemyId">
          <Select ariaLabel={`Group ${index + 1} foe`} invalid={bad('enemyId')} value={group.enemyId} options={foeOptions} onChange={(v) => onSet('Change foe', (g) => (g.enemyId = v))} />
        </td>
        <td data-leaf="count">
          <NumberInput ariaLabel={`Group ${index + 1} count`} width={64} invalid={bad('count')} value={group.count} spec={GROUP_FIELDS.count} onChange={(v) => onSet('Edit count', (g) => (g.count = v ?? 0), 'count')} />
        </td>
        <td data-leaf="spacing">
          <NumberInput ariaLabel={`Group ${index + 1} spacing`} width={76} optional invalid={bad('spacing')} value={group.spacing} spec={GROUP_FIELDS.spacing} placeholder="0.85" onChange={(v) => onSet('Edit spacing', (g) => setOpt(g, 'spacing', v), 'spacing')} />
        </td>
        <td data-leaf="delay">
          <NumberInput ariaLabel={`Group ${index + 1} delay`} width={76} optional invalid={bad('delay')} value={group.delay} spec={GROUP_FIELDS.delay} placeholder="0" onChange={(v) => onSet('Edit delay', (g) => setOpt(g, 'delay', v), 'delay')} />
        </td>
        <td data-leaf="healthMult">
          <NumberInput ariaLabel={`Group ${index + 1} health multiplier`} width={70} optional invalid={bad('healthMult')} value={group.healthMult} spec={GROUP_FIELDS.healthMult} placeholder="1" onChange={(v) => onSet('Edit health ×', (g) => setOpt(g, 'healthMult', v), 'hm')} />
        </td>
        <td className="acts">
          <Button size="sm" tone="plain" icon="up" title="Move group up" disabled={index === 0} onClick={() => onMove(-1)} />
          <Button size="sm" tone="plain" icon="down" title="Move group down" disabled={index === count - 1} onClick={() => onMove(1)} />
          <Button size="sm" tone="plain" icon="copy" title="Duplicate group" onClick={onDuplicate} />
          <Button size="sm" tone="plain" icon="trash" title="Delete group" onClick={onDelete} />
        </td>
      </tr>
      {issues.length > 0 && (
        <tr className="ed-group-issues">
          <td colSpan={6}>
            <IssueList issues={issues} compact />
          </td>
        </tr>
      )}
    </>
  );
}

/** A lane's groups as bars on a time axis (when each starts and spawns its last). */
function Timeline({ groups }: { groups: EnemyGroup[] }) {
  if (groups.length === 0) return <p className="ed-muted small ed-timeline-empty">No foes on this lane this wave.</p>;
  let start = 0;
  const spans = groups.map((g) => {
    const s = start + (g.delay ?? 0);
    start = s;
    return { s, e: s + Math.max(0, (g.count || 0) - 1) * groupSpacing(g), g };
  });
  const end = Math.max(1, ...spans.map((x) => x.e));
  return (
    <div className="ed-timeline" aria-hidden="true">
      {spans.map((x, i) => (
        <div key={i} className="bar" style={{ left: `${(x.s / end) * 100}%`, width: `max(4px, ${((x.e - x.s) / end) * 100}%)`, top: i * 7 }} title={`${x.g.enemyId}: ${fmt(x.s, 1)}s → ${fmt(x.e, 1)}s`} />
      ))}
      <span className="end">{fmt(end, 1)}s</span>
      <div style={{ height: groups.length * 7 }} />
    </div>
  );
}

/** A stage at a glance: totals, the per-wave table, and all of its problems. */

import { useMemo } from 'react';
import { useEditor } from '../../store/projectStore';
import { enemyCatalog } from '../../model/convert';
import { enemyIdsUsedBy, levelStats } from '../../model/queries';
import { fmt } from '../../model/util';
import type { EditorLevel } from '../../model/types';
import { issuesAt, validateProject } from '../../validation/validate';
import { levelKey } from '../../model/entities';
import { Button, IssueList, Section, Stat } from '../kit';
import { navForIssue, useNav } from '../nav';

export function LevelSummary({ level, onTestPlay }: { level: EditorLevel; onTestPlay: () => void }) {
  const { working } = useEditor();
  const { go } = useNav();
  const catalog = useMemo(() => enemyCatalog(working), [working]);
  const stats = levelStats(level, catalog);
  const issues = issuesAt(validateProject(working), levelKey(level.id));
  const foes = [...enemyIdsUsedBy(level)];

  return (
    <div className="ed-form">
      <Section title="Totals" help="Gold available counts starting gold, every kill and every wave-clear bonus.">
        <div className="ed-stats">
          <Stat label="Waves" value={stats.waves.length} />
          <Stat label="Foes" value={stats.enemies} />
          <Stat label="Total health" value={fmt(stats.health, 0)} />
          <Stat label="Gold available" value={fmt(stats.gold, 0)} tone="gold" />
          <Stat label="Base health" value={level.baseHealth} />
          <Stat label="Problems" value={issues.filter((i) => i.severity !== 'info').length} tone={issues.some((i) => i.severity === 'error') ? 'error' : 'ok'} />
        </div>
        <div className="ed-row-actions">
          <Button icon="play" tone="primary" onClick={onTestPlay}>Test play this stage</Button>
        </div>
      </Section>

      <Section title="Per wave">
        <table className="ed-table">
          <thead>
            <tr>
              <th scope="col">Wave</th>
              <th scope="col">Foes</th>
              <th scope="col">Health</th>
              <th scope="col">Kill gold</th>
              <th scope="col">Clear bonus</th>
              <th scope="col">Spawns over</th>
              <th scope="col">Last arrives</th>
              <th scope="col">Bosses</th>
            </tr>
          </thead>
          <tbody>
            {stats.waves.map((w, i) => (
              <tr key={i}>
                <th scope="row">{i + 1}</th>
                <td>{w.enemies}</td>
                <td>{fmt(w.health, 0)}</td>
                <td>{w.gold}</td>
                <td>{w.clearGold}</td>
                <td>{fmt(w.spawnTime, 1)}s</td>
                <td>~{fmt(w.arriveTime, 0)}s</td>
                <td>{w.bosses.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ed-muted small">"Last arrives" is how long the last foe would take to reach the castle unhindered (its spawn time plus its lane length over its speed).</p>
      </Section>

      <Section title="Foes in this stage">
        <div className="ed-chips wrap">
          {foes.map((id) => {
            const def = catalog[id];
            return (
              <button key={id} type="button" className={`ed-chip${def ? '' : ' bad'}`} onClick={() => go({ workspace: 'enemies', enemy: def?.boss ? `boss:${id.slice(4)}` : `enemy:${id}` })}>
                {def ? `${def.visual.icon} ${def.name}` : `${id} (missing)`}
              </button>
            );
          })}
          {foes.length === 0 && <span className="ed-muted">None yet.</span>}
        </div>
      </Section>

      <Section title="Problems">
        {issues.length ? <IssueList issues={issues} onPick={(i) => { const t = navForIssue(i, working); if (t) go(t); }} /> : <p className="ed-muted">This stage has no problems.</p>}
      </Section>
    </div>
  );
}

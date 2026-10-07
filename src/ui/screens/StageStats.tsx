import { useState } from 'react';
import { getEnemy } from '../../domain/enemies';
import {
  SECTIONS,
  groupSpacing,
  levelTotalWaves,
  levelsForSection,
  type EnemyGroup,
  type LevelDef,
  type SectionId,
} from '../../domain/levels';
import { EnemySprite } from '../components/EnemySprite';

/**
 * Developer-only stage sheet: every stage's waves, lane by lane and group by
 * group, read straight from `domain/levels.ts`. Not reachable from the game
 * UI — open it with `npm run stages`, the `#stages` URL hash, or
 * `stageStats()` in the browser console (see `main.tsx`).
 */

/** A group with its spawn start time, mirroring the engine's `queueGroups`. */
interface TimedGroup {
  group: EnemyGroup;
  start: number;
}

/** One lane's share of a wave. */
interface LaneWave {
  lane: number;
  groups: TimedGroup[];
  /** The lane is still hidden this wave (`revealAtWave`), so nothing spawns. */
  hidden: boolean;
  /** This wave reveals the lane. */
  reveals: boolean;
}

/** Group start times: each `delay` offsets from the previous group's start. */
function timeGroups(groups: EnemyGroup[]): TimedGroup[] {
  let groupStart = 0;
  return groups.map((group) => {
    const start = groupStart + (group.delay ?? 0);
    groupStart = start;
    return { group, start };
  });
}

function stageWaves(level: LevelDef): LaneWave[][] {
  return Array.from({ length: levelTotalWaves(level) }, (_, i) =>
    level.lanes.flatMap((lane, li) => {
      const wave = lane.waves[i];
      if (!wave?.groups.length) return [];
      return [
        {
          lane: li,
          groups: timeGroups(wave.groups),
          hidden: lane.revealAtWave != null && i < lane.revealAtWave,
          reveals: lane.revealAtWave === i,
        },
      ];
    }),
  );
}

const fmtTime = (s: number) => `${Math.round(s * 100) / 100}s`;

/** Totals over the groups of the lanes that actually spawn. */
function totals(lanes: LaneWave[]) {
  let foes = 0;
  let hp = 0;
  let gold = 0;
  let last = 0;
  for (const l of lanes) {
    if (l.hidden) continue;
    for (const { group, start } of l.groups) {
      const def = getEnemy(group.enemyId);
      foes += group.count;
      hp += def.health * (group.healthMult ?? 1) * group.count;
      gold += def.reward * group.count;
      last = Math.max(last, start + (group.count - 1) * groupSpacing(group));
    }
  }
  return { foes, hp, gold, last };
}

function StageTable({ level }: { level: LevelDef }) {
  const waves = stageWaves(level);
  const multiLane = level.lanes.length > 1;
  const sum = totals(waves.flat());
  return (
    <section className="es-section">
      <h2>
        {level.order}. {level.name} <span className="es-count">id {level.id}</span>
      </h2>
      <div className="ss-meta">
        {waves.length} waves · {level.lanes.length} {level.lanes.length === 1 ? 'path' : 'paths'} · base HP{' '}
        {level.baseHealth} · start gold {level.startingGold} · {level.gemReward} gems · {sum.foes} foes ·{' '}
        {sum.hp.toLocaleString()} HP · {sum.gold.toLocaleString()} gold from kills
      </div>
      <div className="es-scroll">
        <table className="es-table">
          <thead>
            <tr>
              <th className="num">Wave</th>
              {multiLane && <th>Path</th>}
              <th>Groups</th>
              <th className="num">Foes</th>
              <th className="num">Total HP</th>
              <th className="num">Gold</th>
              <th className="num">Last spawn</th>
            </tr>
          </thead>
          <tbody>
            {waves.map((lanes, wi) => {
              const t = totals(lanes);
              return lanes.map((l, li) => (
                <tr key={`${wi}-${l.lane}`} className={l.hidden ? 'ss-hidden' : undefined}>
                  {li === 0 && (
                    <td className="num ss-wave" rowSpan={lanes.length}>
                      {wi + 1}
                    </td>
                  )}
                  {multiLane && (
                    <td>
                      {String.fromCharCode(65 + l.lane)}
                      {l.hidden && <div className="es-faint">hidden, no spawn</div>}
                      {l.reveals && <div className="es-faint">revealed</div>}
                    </td>
                  )}
                  <td>
                    <div className="ss-groups">
                      {l.groups.map(({ group, start }, gi) => {
                        const def = getEnemy(group.enemyId);
                        return (
                          <div key={gi} className={`ss-group${def.boss ? ' boss' : ''}`}>
                            <EnemySprite enemy={def} size={32} animate={false} />
                            <div>
                              <div className="es-name">
                                {def.name} ×{group.count}
                                {group.healthMult && group.healthMult !== 1 ? ` · ${group.healthMult}× HP` : ''}
                              </div>
                              <div className="es-id">
                                @{fmtTime(start)}
                                {group.count > 1 ? ` · every ${fmtTime(groupSpacing(group))}` : ''}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  {li === 0 && (
                    <>
                      <td className="num" rowSpan={lanes.length}>{t.foes}</td>
                      <td className="num" rowSpan={lanes.length}>{t.hp.toLocaleString()}</td>
                      <td className="num" rowSpan={lanes.length}>{t.gold}</td>
                      <td className="num" rowSpan={lanes.length}>{fmtTime(t.last)}</td>
                    </>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function StageStats() {
  const [tab, setTab] = useState<SectionId>('castle');
  const levels = levelsForSection(tab);
  return (
    <div className="es-page">
      <header className="es-header">
        <h1>Stage Waves</h1>
        <a href="#" onClick={() => { location.hash = ''; }}>← Back to game</a>
      </header>
      <nav className="es-tabs">
        {SECTIONS.map((s) => (
          <button key={s.id} className={tab === s.id ? 'active' : ''} onClick={() => setTab(s.id)}>
            {s.name.replace(/^The /, '')}
          </button>
        ))}
      </nav>
      {levels.map((level) => (
        <StageTable key={level.id} level={level} />
      ))}
      {levels.length === 0 && <p className="es-faint">No stages in this chapter yet.</p>}
    </div>
  );
}

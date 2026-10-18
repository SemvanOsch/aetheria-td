import { useState } from 'react';
import { BOSS_ENEMIES, REGULAR_ENEMIES, type EnemyDef } from '../../domain/enemies';
import { EnemySprite } from './EnemySprite';
import { Icon } from './Icon';

interface Props {
  /** How many lanes the map has (a lane picker shows when there are several). */
  laneCount: number;
  onSpawn: (enemyId: string, lane: number | 'all', count: number) => void;
  onClear: () => void;
  onRefillGold: () => void;
  onLevelHeroes: () => void;
}

/** How many of a foe one click sends. */
const COUNTS = [1, 5, 10];

/**
 * The sandbox battle's side panel (Settings → Developer → Sandbox): every foe
 * and boss in the catalog, sent onto the board by clicking it, down the picked
 * lane, a picked number at a time. Plus the sandbox's own tools.
 */
export function SandboxPanel({ laneCount, onSpawn, onClear, onRefillGold, onLevelHeroes }: Props) {
  const [lane, setLane] = useState<number | 'all'>(0);
  const [count, setCount] = useState(1);

  const foeButton = (def: EnemyDef) => (
    <button
      key={def.id}
      type="button"
      className={`sandbox-foe${def.boss ? ' boss' : ''}`}
      onClick={() => onSpawn(def.id, lane, count)}
      title={`Send ${count > 1 ? `${count}× ` : ''}${def.name} (${def.health} HP)`}
    >
      <EnemySprite enemy={def} size={36} animate={false} />
      <span className="sandbox-foe-name">{def.name}</span>
    </button>
  );

  return (
    <div className="panel panel-pad sandbox-panel">
      <div className="sandbox-head">
        <b>
          <Icon name="swords" /> Send foes
        </b>
        <span>Click a foe to send it.</span>
      </div>

      {laneCount > 1 && (
        <div className="sandbox-row">
          <span className="sandbox-label">Lane</span>
          <div className="dev-chips">
            {Array.from({ length: laneCount }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`dev-chip${lane === i ? ' on' : ''}`}
                onClick={() => setLane(i)}
                aria-pressed={lane === i}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              className={`dev-chip${lane === 'all' ? ' on' : ''}`}
              onClick={() => setLane('all')}
              aria-pressed={lane === 'all'}
            >
              All
            </button>
          </div>
        </div>
      )}
      <div className="sandbox-row">
        <span className="sandbox-label">Count</span>
        <div className="dev-chips">
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className={`dev-chip${count === n ? ' on' : ''}`}
              onClick={() => setCount(n)}
              aria-pressed={count === n}
            >
              ×{n}
            </button>
          ))}
        </div>
      </div>

      <div className="sandbox-list">
        <div className="sandbox-group">Foes</div>
        <div className="sandbox-grid">{REGULAR_ENEMIES.map(foeButton)}</div>
        <div className="sandbox-group">Bosses</div>
        <div className="sandbox-grid">{BOSS_ENEMIES.map(foeButton)}</div>
      </div>

      <div className="sandbox-tools">
        <button type="button" className="btn ghost" onClick={onClear} title="Remove every foe on the board">
          <Icon name="close" /> Clear foes
        </button>
        <button type="button" className="btn ghost" onClick={onRefillGold} title="Top the gold back up">
          <Icon name="coin" /> Refill gold
        </button>
        <button type="button" className="btn ghost" onClick={onLevelHeroes} title="Raise every deployed hero one level">
          <Icon name="star" /> Level heroes
        </button>
      </div>
    </div>
  );
}

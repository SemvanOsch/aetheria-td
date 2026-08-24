import { useGame } from '../../application/gameContext';
import { LEVELS } from '../../domain/levels';
import { summonableUnits } from '../../domain/units';

interface Props {
  onPlay: () => void;
  onSummon: () => void;
  onCollection: () => void;
  onEnemyIndex: () => void;
}

export function Home({ onPlay, onSummon, onCollection, onEnemyIndex }: Props) {
  const { state } = useGame();
  const ownedCount = state.ownedUnits.length;
  const totalKinds = summonableUnits().length;
  const cleared = state.completedLevels.length;

  return (
    <main className="screen">
      <div className="home-hero">
        <h1 className="home-title">AETHERIA</h1>
        <p className="home-sub">Summon your champions. Hold the line.</p>

        <div className="home-actions">
          <button className="btn primary big" onClick={onPlay}>
            ⚔️ Play
          </button>
          <button className="btn big" onClick={onSummon}>
            ✨ Summon
          </button>
          <button className="btn big" onClick={onCollection}>
            🎴 Champions
          </button>
          <button className="btn big" onClick={onEnemyIndex}>
            📖 Enemy Index
          </button>
        </div>
      </div>

      <div className="home-stats">
        <div className="panel stat-card">
          <div className="value" style={{ color: '#6fd6ff' }}>💎 {state.gems.toLocaleString()}</div>
          <div className="label">Gems</div>
        </div>
        <button className="panel stat-card clickable" onClick={onCollection}>
          <div className="value">
            {ownedCount} <span style={{ fontSize: 16, color: 'var(--text-dim)' }}>/ {totalKinds} kinds</span>
          </div>
          <div className="label">Champions</div>
        </button>
        <button className="panel stat-card clickable" onClick={onPlay}>
          <div className="value">
            {cleared} <span style={{ fontSize: 16, color: 'var(--text-dim)' }}>/ {LEVELS.length}</span>
          </div>
          <div className="label">Realms Cleared</div>
        </button>
      </div>
    </main>
  );
}

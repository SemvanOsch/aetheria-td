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
        <div className="panel stat-card">
          <div className="value">
            {ownedCount} <span style={{ fontSize: 16, color: 'var(--text-dim)' }}>/ {totalKinds} kinds</span>
          </div>
          <div className="label">Champions</div>
        </div>
        <div className="panel stat-card">
          <div className="value">
            {cleared} <span style={{ fontSize: 16, color: 'var(--text-dim)' }}>/ {LEVELS.length}</span>
          </div>
          <div className="label">Realms Cleared</div>
        </div>
      </div>

      <div style={{ marginTop: 30 }} className="panel panel-pad">
        <div className="section-title">
          📜 How to Play <small>a quick briefing</small>
        </div>
        <ol style={{ paddingLeft: 20, lineHeight: 1.8, color: 'var(--text-dim)' }}>
          <li>Summon champions with 💎 gems, or claim your free starter.</li>
          <li>Enter a realm and deploy units beside the enemy path with 🪙 gold.</li>
          <li>Start each wave — your units attack automatically.</li>
          <li>Slay enemies for more gold; defeat the boss to win the realm.</li>
          <li>Don't let foes reach your castle, or the realm is lost.</li>
        </ol>
      </div>
    </main>
  );
}

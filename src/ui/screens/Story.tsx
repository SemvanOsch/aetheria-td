import type { CSSProperties } from 'react';
import { useGame } from '../../application/gameContext';
import {
  completedCount,
  isLevelUnlocked,
  REPLAY_GEM_REWARD,
} from '../../application/gameState';
import {
  SECTIONS,
  getSection,
  levelsForSection,
  levelTotalWaves,
  type SectionId,
} from '../../domain/levels';
import { getEnemy } from '../../domain/enemies';

interface Props {
  section: SectionId | null;
  onSelectSection: (id: SectionId) => void;
  onBack: () => void;
  onPlay: (levelId: number) => void;
}

export function Story({ section, onSelectSection, onBack, onPlay }: Props) {
  if (section) {
    return <SectionLevels section={section} onBack={onBack} onPlay={onPlay} />;
  }
  return <SectionList onSelectSection={onSelectSection} />;
}

// --- Section picker ---------------------------------------------------------
function SectionList({ onSelectSection }: { onSelectSection: (id: SectionId) => void }) {
  const { state } = useGame();

  return (
    <main className="screen">
      <div className="section-title">
        📖 Story <small>choose a chapter</small>
      </div>

      <div className="level-list">
        {SECTIONS.map((sec) => {
          const levels = levelsForSection(sec.id);
          // A WIP chapter is shown locked ("coming soon") no matter the player's
          // progress; otherwise it unlocks by clearing the previous chapter.
          const enterable = !sec.wip && isLevelUnlocked(state, levels[0].id);
          const done = completedCount(state, levels.map((l) => l.id));
          const style = { '--accent': sec.color } as CSSProperties;
          return (
            <button
              key={sec.id}
              className={`panel level-card section-card ${enterable ? '' : 'locked'}`}
              style={style}
              disabled={!enterable}
              onClick={() => enterable && onSelectSection(sec.id)}
            >
              <div className="num">{enterable ? sec.icon : '🔒'}</div>
              <div className="meta">
                <h3>{sec.name}</h3>
                <p>{sec.subtitle}</p>
                <div className="badges">
                  <span className="chip">{levels.length} levels</span>
                  {!sec.wip && (
                    <span className={`chip ${done === levels.length ? 'done' : ''}`}>
                      {done} / {levels.length} cleared
                    </span>
                  )}
                  {sec.wip && <span className="chip">🚧 Coming soon</span>}
                  {!sec.wip && !enterable && (
                    <span className="chip">Clear the previous chapter to unlock</span>
                  )}
                </div>
              </div>
              {enterable && <div className="section-go">▶</div>}
            </button>
          );
        })}
      </div>
    </main>
  );
}

// --- Level picker within a section -----------------------------------------
function SectionLevels({
  section,
  onBack,
  onPlay,
}: {
  section: SectionId;
  onBack: () => void;
  onPlay: (levelId: number) => void;
}) {
  const { state } = useGame();
  const sec = getSection(section);
  const levels = levelsForSection(section);
  const hasUnits = state.ownedUnits.length > 0;

  return (
    <main className="screen">
      <div className="section-title" style={{ gap: 12 }}>
        <button className="btn ghost" onClick={onBack}>← Chapters</button>
        <span>{sec.icon} {sec.name}</span>
      </div>

      {!hasUnits && (
        <div className="panel empty-note" style={{ marginBottom: 16 }}>
          You have no champions to deploy. Visit the Summon altar first!
        </div>
      )}

      <div className="level-list">
        {levels.map((lvl) => {
          const unlocked = isLevelUnlocked(state, lvl.id);
          const done = state.completedLevels.includes(lvl.id);
          const boss = getEnemy(lvl.bossId);
          const style = { '--accent': lvl.color } as CSSProperties;
          return (
            <div
              key={lvl.id}
              className={`panel level-card ${unlocked ? '' : 'locked'}`}
              style={style}
            >
              <div className="num">{unlocked ? lvl.order : '🔒'}</div>
              <div className="meta">
                <h3>{lvl.name}</h3>
                <p>{lvl.subtitle}</p>
                <div className="badges">
                  <span className="chip">{levelTotalWaves(lvl)} waves</span>
                  <span className="chip">Start 🪙{lvl.startingGold}</span>
                  <span className="chip">
                    Reward 💎{done ? REPLAY_GEM_REWARD : lvl.gemReward}
                  </span>
                  <span className="chip boss-chip">{boss.visual.icon} {boss.name}</span>
                  {done && <span className="chip done">✓ Cleared</span>}
                </div>
              </div>
              <button
                className={`btn ${done ? '' : 'primary'}`}
                disabled={!unlocked || !hasUnits}
                onClick={() => onPlay(lvl.id)}
              >
                {done ? 'Replay' : 'Enter'}
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGame } from '../../application/gameContext';
import {
  completedCount,
  enemyKillCount,
  isEnemyUnlocked,
  isLevelUnlocked,
  REPLAY_GEM_REWARD,
} from '../../application/gameState';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../domain/grid';
import {
  SECTIONS,
  getSection,
  levelsForSection,
  levelTotalWaves,
  type LevelDef,
  type SectionId,
} from '../../domain/levels';
import { getEnemy } from '../../domain/enemies';
import { getUnit } from '../../domain/units';
import { GameEngine } from '../../engine/GameEngine';
import { drawBoard } from '../../engine/renderer';
import { Icon } from '../components/Icon';
import { EnemySprite } from '../components/EnemySprite';
import { UnitSprite } from '../components/UnitSprite';
import { SECTION_ICONS } from '../sectionIcons';

/**
 * Where each stage sits on a chapter map, in map units (viewBox 160 × 100):
 * spread evenly left to right along a winding road that climbs as the chapter
 * goes on.
 */
const MAP_HEIGHTS = [74, 40, 66, 30, 54, 24];
const mapPoint = (i: number, n: number) => ({
  x: n > 1 ? 14 + (i * 132) / (n - 1) : 80,
  y: MAP_HEIGHTS[i % MAP_HEIGHTS.length],
});

interface Props {
  section: SectionId | null;
  onSelectSection: (id: SectionId) => void;
  onPlay: (levelId: number) => void;
  onEditTeam: () => void;
  /** Back to the mode picker. */
  onBack: () => void;
}

const sectionEnterable = (state: Parameters<typeof isLevelUnlocked>[0], id: SectionId) =>
  !getSection(id).wip && isLevelUnlocked(state, levelsForSection(id)[0].id);

/**
 * The campaign: chapter tabs over a map of the chosen chapter's stages, with
 * the selected stage's briefing (board preview, rewards, boss, foes, team) in
 * a side panel.
 */
export function Story({ section, onSelectSection, onPlay, onEditTeam, onBack }: Props) {
  const { state } = useGame();
  // No chapter chosen yet: open on the latest one the player can enter.
  const current =
    section ?? [...SECTIONS].reverse().find((s) => sectionEnterable(state, s.id))?.id ?? SECTIONS[0].id;
  const sec = getSection(current);

  return (
    <main className="screen campaign">
      <div className="campaign-head">
        <div className="section-title" style={{ gap: 12 }}>
          <button className="btn ghost sort-toggle" onClick={onBack}>
            <Icon name="back" /> Modes
          </button>
          <Icon name="book" /> Campaign
        </div>
        <p className="campaign-sub">{sec.subtitle}</p>
      </div>

      <div className="campaign-tabs" role="tablist">
        {SECTIONS.map((s) => {
          const enterable = sectionEnterable(state, s.id);
          const levels = levelsForSection(s.id);
          const done = completedCount(state, levels.map((l) => l.id));
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === current}
              className={`campaign-tab${s.id === current ? ' active' : ''}${enterable ? '' : ' locked'}`}
              style={{ '--accent': s.color } as CSSProperties}
              disabled={!enterable}
              title={s.wip ? 'Coming soon' : enterable ? s.subtitle : 'Clear the previous chapter to unlock'}
              onClick={() => onSelectSection(s.id)}
            >
              <Icon name={enterable ? SECTION_ICONS[s.id] : 'lock'} />
              {s.name}
              {s.wip ? (
                <span className="campaign-tab-chip">Coming soon</span>
              ) : (
                enterable && (
                  <span className="campaign-tab-chip progress">
                    {done}/{levels.length}
                  </span>
                )
              )}
            </button>
          );
        })}
      </div>

      <ChapterView key={current} section={current} onPlay={onPlay} onEditTeam={onEditTeam} />
    </main>
  );
}

// --- A chapter: the stage map + the selected stage's briefing --------------
function ChapterView({
  section,
  onPlay,
  onEditTeam,
}: {
  section: SectionId;
  onPlay: (levelId: number) => void;
  onEditTeam: () => void;
}) {
  const { state } = useGame();
  const sec = getSection(section);
  const levels = levelsForSection(section);
  const [selectedId, setSelectedId] = useState(() => {
    // The next stage to clear, else the last one reached.
    const next = levels.find((l) => isLevelUnlocked(state, l.id) && !state.completedLevels.includes(l.id));
    return (next ?? [...levels].reverse().find((l) => isLevelUnlocked(state, l.id)) ?? levels[0]).id;
  });
  const selected = levels.find((l) => l.id === selectedId) ?? levels[0];

  const pts = levels.map((_, i) => mapPoint(i, levels.length));
  // The road: a smooth curve through every stage, split into legs so legs
  // leading to a cleared stage can light up.
  const legs = pts.slice(1).map((p, i) => {
    const a = pts[i];
    const mx = (a.x + p.x) / 2;
    return { d: `M${a.x} ${a.y}C${mx} ${a.y} ${mx} ${p.y} ${p.x} ${p.y}`, lit: state.completedLevels.includes(levels[i].id) };
  });

  return (
    <div className="campaign-body" style={{ '--accent': sec.color } as CSSProperties}>
      <div className="panel campaign-map">
        <div className="campaign-map-title">
          <Icon name={SECTION_ICONS[sec.id]} /> {sec.name}
        </div>
        <div className="campaign-map-area">
          <svg className="campaign-road" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
            {legs.map((l, i) => (
              <path key={i} d={l.d} className={l.lit ? 'lit' : undefined} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {levels.map((lvl, i) => {
            const unlocked = isLevelUnlocked(state, lvl.id);
            const done = state.completedLevels.includes(lvl.id);
            const st = done ? 'done' : unlocked ? 'open' : 'locked';
            return (
              <button
                key={lvl.id}
                className={`campaign-node ${st}${lvl.id === selected.id ? ' selected' : ''}`}
                style={{ left: `${(pts[i].x / 160) * 100}%`, top: `${pts[i].y}%` }}
                disabled={!unlocked}
                title={unlocked ? undefined : 'Clear the previous stage to unlock'}
                onClick={() => setSelectedId(lvl.id)}
                aria-pressed={lvl.id === selected.id}
              >
                <span className="campaign-node-gem">
                  {unlocked ? <span className="campaign-node-num">{toRoman(lvl.order)}</span> : <Icon name="lock" />}
                  {done && (
                    <span className="campaign-node-check">
                      <Icon name="check" />
                    </span>
                  )}
                </span>
                <span className="campaign-node-name">{lvl.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <StageBriefing level={selected} onPlay={onPlay} onEditTeam={onEditTeam} />
    </div>
  );
}

function StageBriefing({
  level,
  onPlay,
  onEditTeam,
}: {
  level: LevelDef;
  onPlay: (levelId: number) => void;
  onEditTeam: () => void;
}) {
  const { state } = useGame();
  const unlocked = isLevelUnlocked(state, level.id);
  const done = state.completedLevels.includes(level.id);
  const boss = getEnemy(level.bossId);
  const bossKnown = isEnemyUnlocked(state, boss);
  const hasUnits = state.ownedUnits.length > 0;
  const foes = [
    ...new Set(level.lanes.flatMap((l) => l.waves.flatMap((w) => w.groups.map((g) => g.enemyId)))),
  ]
    .filter((id) => id !== level.bossId)
    .map((id) => getEnemy(id));
  const team = state.team.map((id) => getUnit(id)).filter((u) => u != null);

  return (
    <aside className="panel ornate campaign-brief" key={level.id}>
      <div className="campaign-brief-eyebrow">Stage {level.order}</div>
      <h2 className="campaign-brief-name">{level.name}</h2>
      <p className="campaign-brief-sub">{level.subtitle}</p>

      <BoardPreview level={level} />

      <div className="campaign-stats">
        <span title="Waves">
          <Icon name="flag" /> {levelTotalWaves(level)} waves
        </span>
        <span title="Castle health">
          <Icon name="heart" /> {level.baseHealth}
        </span>
        <span title="Starting gold">
          <Icon name="coin" /> {level.startingGold}
        </span>
        <span title={done ? 'Replay reward' : 'First-clear reward'}>
          <Icon name="gem" /> {done ? REPLAY_GEM_REWARD : level.gemReward}
          {!done && <small>first clear</small>}
        </span>
      </div>

      <div className={`campaign-boss${bossKnown ? '' : ' unknown'}`}>
        <div className="campaign-boss-portrait">
          <EnemySprite enemy={boss} size={56} silhouette={!bossKnown} />
        </div>
        <div>
          <div className="campaign-boss-tag">
            <Icon name="skull" /> Boss
          </div>
          <div className="campaign-boss-name">{bossKnown ? boss.name : '???'}</div>
          <div className="campaign-boss-hint">
            {bossKnown ? `Defeated ${enemyKillCount(state, boss.id)}×` : 'Defeat it to learn its secrets.'}
          </div>
        </div>
      </div>

      {foes.length > 0 && (
        <>
          <div className="campaign-label">Enemies</div>
          <div className="campaign-foes">
            {foes.map((f) => (
              <span key={f.id} className="campaign-foe" title={f.name}>
                <EnemySprite enemy={f} size={34} />
                {enemyKillCount(state, f.id) === 0 && <span className="campaign-new">New</span>}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="campaign-label campaign-team-head">
        Your team
        <button className="btn ghost campaign-edit" onClick={onEditTeam}>
          Edit team
        </button>
      </div>
      <div className="campaign-team">
        {team.length === 0 ? (
          <span className="campaign-empty">No champions yet — visit the Summon altar.</span>
        ) : (
          team.map((u) => (
            <span key={u.id} className="campaign-member" title={u.name}>
              <UnitSprite unit={u} size={34} />
            </span>
          ))
        )}
      </div>

      <button
        className={`btn ${done ? '' : 'primary'} big campaign-go`}
        title={!unlocked ? 'Clear the previous stage to unlock' : undefined}
        disabled={!unlocked || !hasUnits}
        onClick={() => onPlay(level.id)}
      >
        {!unlocked ? (
          <>
            <Icon name="lock" /> Locked
          </>
        ) : (
          <>
            <Icon name="swords" /> {done ? 'Replay' : 'Enter'}
          </>
        )}
      </button>
    </aside>
  );
}

/** A still of the stage's board — terrain, path and dressing, as the battle draws it. */
function BoardPreview({ level }: { level: LevelDef }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    drawBoard(ctx, new GameEngine(level, 0), { hoverCol: -1, hoverRow: -1, selectedUnitId: null, selectedTowerUid: null });
  }, [level]);
  return (
    <canvas
      ref={ref}
      className="campaign-preview"
      width={BOARD_WIDTH}
      height={BOARD_HEIGHT}
      role="img"
      aria-label={`${level.name} battlefield`}
    />
  );
}

function toRoman(n: number): string {
  return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] ?? String(n);
}

import { useState, type CSSProperties } from 'react';
import { useGame } from '../../application/gameContext';
import { isEndlessUnlocked, isEnemyUnlocked } from '../../application/gameState';
import { SECTIONS, getSection, type LevelDef, type SectionId } from '../../domain/levels';
import { ENDLESS_BOSS_EVERY, ENDLESS_BOSS_GEMS, endlessLevelFor } from '../../domain/endless';
import { getEnemy } from '../../domain/enemies';
import { getUnit } from '../../domain/units';
import { Icon } from '../components/Icon';
import { EnemySprite } from '../components/EnemySprite';
import { UnitSprite } from '../components/UnitSprite';
import { SECTION_ICONS } from '../sectionIcons';
import { BoardPreview } from './Story';

interface Props {
  onPlay: (levelId: number) => void;
  onEditTeam: () => void;
  /** Back to the mode picker. */
  onBack: () => void;
}

/**
 * The endless picker: every chapter's endless run (open once the chapter's
 * stages are all cleared), with the chosen run's briefing — board, record, the
 * foes it fields and when, the boss rotation, and the team.
 */
export function Endless({ onPlay, onEditTeam, onBack }: Props) {
  const { state } = useGame();
  const [selected, setSelected] = useState<SectionId>(
    () => [...SECTIONS].reverse().find((s) => isEndlessUnlocked(state, s.id))?.id ?? SECTIONS[0].id,
  );
  const level = endlessLevelFor(selected);

  return (
    <main className="screen campaign">
      <div className="campaign-head">
        <div className="section-title" style={{ gap: 12 }}>
          <button className="btn ghost sort-toggle" onClick={onBack}>
            <Icon name="back" /> Modes
          </button>
          <Icon name="endless" /> Endless
        </div>
        <p className="campaign-sub">
          Clear a chapter to unlock its endless run.
        </p>
      </div>

      <div className="campaign-body" style={{ '--accent': getSection(selected).color } as CSSProperties}>
        <div className="endless-list">
          {SECTIONS.map((s) => {
            const unlocked = isEndlessUnlocked(state, s.id);
            const best = state.endlessBest[s.id] ?? 0;
            const hint = s.wip || !endlessLevelFor(s.id) ? 'Coming soon' : `Clear ${s.name} to unlock`;
            return (
              <button
                key={s.id}
                className={`panel endless-card${s.id === selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`}
                style={{ '--accent': s.color } as CSSProperties}
                disabled={!unlocked}
                aria-pressed={s.id === selected}
                onClick={() => setSelected(s.id)}
              >
                <span className="endless-card-icon">
                  <Icon name={unlocked ? SECTION_ICONS[s.id] : 'lock'} />
                </span>
                <span className="endless-card-text">
                  <span className="endless-card-name">{s.name}</span>
                  <span className="endless-card-sub">
                    {unlocked ? (best > 0 ? `Best: wave ${best}` : 'No run yet') : hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {level && isEndlessUnlocked(state, selected) && (
          <EndlessBriefing level={level} onPlay={onPlay} onEditTeam={onEditTeam} />
        )}
      </div>
    </main>
  );
}

function EndlessBriefing({
  level,
  onPlay,
  onEditTeam,
}: {
  level: LevelDef;
  onPlay: (levelId: number) => void;
  onEditTeam: () => void;
}) {
  const { state } = useGame();
  const rules = level.endless!;
  const best = state.endlessBest[rules.section] ?? 0;
  const team = state.team.map((id) => getUnit(id)).filter((u) => u != null);

  return (
    <aside className="panel ornate campaign-brief" key={level.id}>
      <div className="campaign-brief-eyebrow">Endless · {getSection(rules.section).name}</div>
      <h2 className="campaign-brief-name">{level.name}</h2>
      <p className="campaign-brief-sub">{level.subtitle}</p>

      <BoardPreview level={level} />

      <div className="campaign-stats">
        <span title="Best run">
          <Icon name="trophy" /> {best > 0 ? `Wave ${best}` : '—'}
          <small>best</small>
        </span>
        <span title="Castle health">
          <Icon name="heart" /> {level.baseHealth}
        </span>
        <span title="Starting gold">
          <Icon name="coin" /> {level.startingGold}
        </span>
        <span title="Gems per boss wave cleared">
          <Icon name="gem" /> {ENDLESS_BOSS_GEMS}
          <small>per boss</small>
        </span>
      </div>

      <div className="campaign-label">Bosses · every {ENDLESS_BOSS_EVERY} waves, in turn</div>
      <div className="campaign-foes">
        {rules.bosses.map((id, i) => {
          const boss = getEnemy(id);
          const known = isEnemyUnlocked(state, boss);
          return (
            <span key={id} className="campaign-foe endless-boss" title={known ? boss.name : '???'}>
              <EnemySprite enemy={boss} size={34} silhouette={!known} />
              <span className="endless-wave-tag">{(i + 1) * ENDLESS_BOSS_EVERY}</span>
            </span>
          );
        })}
      </div>

      <div className="campaign-label">Enemies · from wave</div>
      <div className="campaign-foes">
        {rules.foes.map((f) => {
          const foe = getEnemy(f.enemyId);
          return (
            <span key={f.enemyId} className="campaign-foe" title={`${foe.name} — from wave ${f.fromWave}`}>
              <EnemySprite enemy={foe} size={34} />
              <span className="endless-wave-tag">{f.fromWave}</span>
            </span>
          );
        })}
      </div>

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
        className="btn primary big campaign-go"
        disabled={state.ownedUnits.length === 0}
        onClick={() => onPlay(level.id)}
      >
        <Icon name="swords" /> Begin run
      </button>
    </aside>
  );
}

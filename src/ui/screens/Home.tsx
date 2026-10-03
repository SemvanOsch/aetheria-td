import type { CSSProperties, ReactNode } from 'react';
import { useGame } from '../../application/gameContext';
import {
  MAX_TEAM_SIZE,
  hasAffordableMasteryUpgrade,
  isLevelUnlocked,
  masteryExp,
} from '../../application/gameState';
import { canAffordSummon } from '../../application/summon';
import { JOURNAL_CHAPTERS, unlockedChapterCount } from '../../domain/journal';
import { LEVELS, SECTIONS, getSection, levelsForSection } from '../../domain/levels';
import { summonableUnits } from '../../domain/units';
import { PLAYER_CHAMPION_IDS } from '../../domain/playerChampion';
import { proficiencyDef, type Proficiency } from '../../domain/proficiency';
import type { PlayerWeapon } from '../../engine/sprites';
import { Icon, type IconName } from '../components/Icon';
import { PlayerSprite } from '../components/PlayerSprite';
import { SECTION_ICONS } from '../sectionIcons';

interface Props {
  onPlay: () => void;
  onContinue: (levelId: number) => void;
  onSummon: () => void;
  onJournal: () => void;
}

/** The weapon the portrait holds for each discipline. */
const WEAPON: Record<Proficiency, PlayerWeapon> = { sword: 'dual-swords', bow: 'bow', magic: 'magic' };

/**
 * The home dashboard: the player's adventurer and their next stage up top,
 * shortcut tiles to every hub (each with a live status line), and the
 * campaign's progress chapter by chapter.
 */
export function Home({ onPlay, onContinue, onSummon, onJournal }: Props) {
  const { state } = useGame();
  const player = state.player;
  const prof = player ? proficiencyDef(player.proficiency) : null;
  const cleared = state.completedLevels.length;
  // Stages in released chapters (a work-in-progress chapter isn't counted yet).
  const released = LEVELS.filter((l) => !getSection(l.section).wip).length;

  // Next stage: the first unlocked, uncleared stage of a released chapter.
  const next = LEVELS.find(
    (l) => !getSection(l.section).wip && isLevelUnlocked(state, l.id) && !state.completedLevels.includes(l.id),
  );
  const nextSection = next ? getSection(next.section) : null;

  const slain = Object.values(state.enemyKills).reduce((s, n) => s + n, 0);
  const totalKinds = summonableUnits().length + 1; // + the player's own champion
  const chapters = unlockedChapterCount(cleared);
  const unread = chapters - state.readChapters.filter((c) => c < chapters).length;
  const masteryReady = state.ownedUnits.some((id) => hasAffordableMasteryUpgrade(state, id));
  const accent = player?.sprite.outfitColor ?? '#e8bf5e';

  return (
    <main className="screen home">
      <section className="panel ornate home-hero" style={{ '--hero': accent } as CSSProperties}>
        <div className="home-portrait">
          {player && <PlayerSprite config={player.sprite} size={168} weapon={WEAPON[player.proficiency]} idle />}
        </div>

        <div className="home-id">
          <div className="home-eyebrow">The Adventurer</div>
          <h1 className="home-name">{player?.name ?? 'Adventurer'}</h1>
          <div className="home-chips">
            {prof && (
              <span className="home-chip accent">
                <Icon name={prof.id === 'sword' ? 'sword' : prof.id === 'bow' ? 'bow' : 'staff'} /> Hero of the{' '}
                {prof.label}
              </span>
            )}
            {player && (
              <span className="home-chip">
                <Icon name="star" /> {masteryExp(state, PLAYER_CHAMPION_IDS[player.proficiency]).toLocaleString()} mastery
                EXP
              </span>
            )}
          </div>
          <div className="home-stats">
            <Stat value={cleared} total={released} label="Stages cleared" />
            <Stat value={state.ownedUnits.length} total={totalKinds} label="Champions" />
            <Stat value={slain} label="Enemies slain" />
          </div>
        </div>

        <div className="home-next">
          {next && nextSection ? (
            <>
              <div className="home-eyebrow">
                <Icon name={SECTION_ICONS[nextSection.id]} /> {nextSection.name} · Stage {next.order}
              </div>
              <div className="home-next-name">{next.name}</div>
              <p className="home-next-sub">{next.subtitle}</p>
              <button
                className="btn primary big home-continue"
                disabled={state.ownedUnits.length === 0}
                onClick={() => onContinue(next.id)}
              >
                <Icon name="swords" /> {cleared === 0 ? 'Begin' : 'Continue'}
              </button>
            </>
          ) : (
            <>
              <div className="home-eyebrow">
                <Icon name="trophy" /> Campaign
              </div>
              <div className="home-next-name">Every stage cleared</div>
              <p className="home-next-sub">More chapters are on the way. Replay any stage for gems and EXP.</p>
              <button className="btn primary big home-continue" onClick={onPlay}>
                <Icon name="swords" /> Play
              </button>
            </>
          )}
        </div>
      </section>

      <div className="home-tiles">
        <Tile
          icon="orb"
          hue="#b48cf0"
          title="Summoning Altar"
          line={`${state.ownedUnits.length} / ${totalKinds} champions found`}
          sub="Channel gems to call new champions"
          ready={canAffordSummon(state.gems) ? 'Ready to summon' : undefined}
          onClick={onSummon}
        />
        <Tile
          icon="journal"
          hue="#d9a066"
          title="Adventurer's Journal"
          line={`${chapters} / ${JOURNAL_CHAPTERS.length} chapters · team of ${state.team.length} / ${MAX_TEAM_SIZE}`}
          sub="Your story, your champions and the bestiary"
          ready={
            unread > 0 ? `${unread} unread` : masteryReady ? 'Skill upgrade available' : undefined
          }
          onClick={onJournal}
        />
      </div>

      <section className="panel home-progress">
        <div className="home-progress-title">Campaign progress</div>
        <div className="home-progress-rows">
          {SECTIONS.map((sec) => {
            const levels = levelsForSection(sec.id);
            const done = levels.filter((l) => state.completedLevels.includes(l.id)).length;
            return (
              <button
                key={sec.id}
                className={`home-chapter${sec.wip ? ' wip' : ''}`}
                style={{ '--accent': sec.color } as CSSProperties}
                disabled={sec.wip}
                onClick={onPlay}
              >
                <span className="home-chapter-icon">
                  <Icon name={SECTION_ICONS[sec.id]} />
                </span>
                <span className="home-chapter-body">
                  <span className="home-chapter-name">{sec.name}</span>
                  {sec.wip ? (
                    <span className="home-chapter-soon">Coming soon</span>
                  ) : (
                    <span className="home-bar">
                      <span style={{ width: `${(done / levels.length) * 100}%` }} />
                    </span>
                  )}
                </span>
                {!sec.wip && (
                  <span className="home-chapter-count">
                    {done}/{levels.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function Stat({ value, total, label }: { value: number; total?: number; label: string }) {
  return (
    <div className="home-stat">
      <div className="home-stat-value">
        {value.toLocaleString()}
        {total != null && <small> / {total}</small>}
      </div>
      <div className="home-stat-label">{label}</div>
    </div>
  );
}

function Tile({
  icon,
  hue,
  title,
  line,
  sub,
  ready,
  onClick,
}: {
  icon: IconName;
  hue: string;
  title: string;
  line: ReactNode;
  sub: string;
  ready?: string;
  onClick: () => void;
}) {
  return (
    <button className="panel home-tile" style={{ '--hue': hue } as CSSProperties} onClick={onClick}>
      <span className="home-tile-icon">
        <Icon name={icon} />
      </span>
      <span className="home-tile-title">{title}</span>
      <span className="home-tile-line">{line}</span>
      <span className="home-tile-sub">{sub}</span>
      {ready && (
        <span className="home-tile-ready">
          <i /> {ready}
        </span>
      )}
      <span className="home-tile-go" aria-hidden="true">
        <Icon name="forward" />
      </span>
    </button>
  );
}

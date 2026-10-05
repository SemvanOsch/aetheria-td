import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useGame } from '../../application/gameContext';
import { hasAffordableMasteryUpgrade, isLevelUnlocked } from '../../application/gameState';
import { canAffordSummon } from '../../application/summon';
import { unlockedChapterCount } from '../../domain/journal';
import { LEVELS, getSection } from '../../domain/levels';
import { Icon } from '../components/Icon';
import { playDeskSound } from '../deskAudio';
import {
  CandleArt,
  CandleClusterArt,
  CoinsArt,
  CrystalBallArt,
  InkwellArt,
  JournalArt,
  LanternBooksArt,
  MapArt,
  WindowView,
} from '../components/DeskArt';

interface Props {
  onPlay: () => void;
  onContinue: (levelId: number) => void;
  onSummon: () => void;
  onJournal: () => void;
  /** Whether the journal is open over the desk (it opens without unmounting Home). */
  journalOpen: boolean;
  /** The object the player is returning from; the desk zooms back out of it. */
  returnFrom?: 'summon' | 'play' | null;
  /** Backdrop use: hold the desk still, zoomed into this object, with no veil. */
  frozenOn?: 'summon' | 'play';
}

type Target = 'summon' | 'play' | 'journal' | 'continue';

/** How long each object's lead-in plays before its destination opens: the
 *  orb charges up (zooming in as it does), the map is leaned
 *  over, the journal is a straight zoom. */
const LEAVE_MS: Record<Target, number> = { summon: 1450, play: 1850, journal: 650, continue: 1700 };

/**
 * The home screen: an adventurer's desk at night. Three objects on it are the
 * way into the game: the crystal ball (Summon), the scroll map (Play) and the
 * strapped journal (the Adventurer's Journal). A pinned note on the map
 * continues straight into the next stage. Choosing one zooms the desk toward
 * it under a tinted veil, then opens the destination; Escape (or reduced
 * motion) skips the zoom.
 */
export function Home({ onPlay, onContinue, onSummon, onJournal, journalOpen, returnFrom, frozenOn }: Props) {
  const { state } = useGame();
  const stageRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const [leaving, setLeaving] = useState<{ target: Target; x: number; y: number } | null>(null);
  // The last zoom's focus, kept after it ends so the desk zooms back out from
  // the same object (e.g. the journal) instead of from the screen's centre.
  const [origin, setOrigin] = useState<{ x: number; y: number; target: Target } | null>(null);
  // Arriving back from Summon or Play: for one frame the desk is drawn already
  // zoomed into that object (`instant`, no transitions), then released so it
  // zooms out from it. `settling` slows the object's own return to rest.
  const [instant, setInstant] = useState(false);
  const [settling, setSettling] = useState<Target | null>(null);
  useLayoutEffect(() => {
    // As a backdrop: zoom into the object and stay there.
    if (frozenOn) {
      const stage = stageRef.current;
      const el = stage?.querySelector(frozenOn === 'summon' ? '.desk-obj.ball' : '.desk-obj.map');
      if (!stage || !el) return;
      const s = stage.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const at = {
        x: ((b.left + b.width / 2 - s.left) / s.width) * 100,
        y: ((b.top + b.height / 2 - s.top) / s.height) * 100,
      };
      setOrigin({ ...at, target: frozenOn });
      setLeaving({ ...at, target: frozenOn });
      return;
    }
    if (!returnFrom || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const stage = stageRef.current;
    const el = stage?.querySelector(returnFrom === 'summon' ? '.desk-obj.ball' : '.desk-obj.map');
    if (!stage || !el) return;
    const s = stage.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const at = {
      x: ((b.left + b.width / 2 - s.left) / s.width) * 100,
      y: ((b.top + b.height / 2 - s.top) / s.height) * 100,
    };
    setOrigin({ ...at, target: returnFrom });
    setLeaving({ ...at, target: returnFrom });
    setInstant(true);
    setSettling(returnFrom);
    // Release once the zoomed-in frame has painted (a timer, not rAF, so it
    // can never stick in a tab that isn't drawing frames).
    const release = window.setTimeout(() => {
      setInstant(false);
      setLeaving(null);
      playDeskSound(returnFrom === 'summon' ? 'orbClose' : 'mapClose');
    }, 50);
    const done = window.setTimeout(() => setSettling(null), 1600);
    return () => {
      clearTimeout(release);
      clearTimeout(done);
    };
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Next stage: the first unlocked, uncleared stage of a released chapter.
  const next = LEVELS.find(
    (l) => !getSection(l.section).wip && isLevelUnlocked(state, l.id) && !state.completedLevels.includes(l.id),
  );
  const chapters = unlockedChapterCount(state.completedLevels.length);
  const unread = chapters - state.readChapters.filter((c) => c < chapters).length;
  const masteryReady =
    state.prefs.showMasteryMarks && state.ownedUnits.some((id) => hasAffordableMasteryUpgrade(state, id));
  const summonReady = canAffordSummon(state.gems);
  // Once the journal is open its veil lifts, so the (still zoomed) desk shows
  // through the journal's blurred backdrop rather than a flat dark wash.
  const veiled = leaving != null && !frozenOn && !(leaving.target === 'journal' && journalOpen);

  const go = (target: Target) => {
    if (target === 'summon') onSummon();
    else if (target === 'play') onPlay();
    else if (target === 'journal') onJournal();
    else if (next) onContinue(next.id);
  };

  const clearTimer = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  // Escape cancels a zoom in flight; the timer never outlives the screen.
  useEffect(() => {
    if (!leaving) return;
    const onKey = (e: KeyboardEvent) => {
      // Only a zoom still in flight; once the destination is open it's theirs.
      if (e.key === 'Escape' && timer.current != null) {
        clearTimer();
        setLeaving(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [leaving]);
  useEffect(() => clearTimer, []);
  // The journal opens over the desk: hold the zoom until it closes again, so
  // the desk never pops back into view behind the journal's own fade-in.
  useEffect(() => {
    if (!journalOpen) setLeaving((l) => (l?.target === 'journal' ? null : l));
  }, [journalOpen]);

  const choose = (target: Target) => (e: MouseEvent<HTMLButtonElement>) => {
    // A second choice while zooming commits straight away.
    if (leaving) {
      clearTimer();
      go(target);
      return;
    }
    // The map and orb have their own cues (the journal plays its own on opening).
    if (target === 'play') playDeskSound('map');
    else if (target === 'summon') playDeskSound('orb');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      go(target);
      return;
    }
    // Zoom toward the chosen object's centre.
    const stage = stageRef.current?.getBoundingClientRect();
    const box = e.currentTarget.getBoundingClientRect();
    const x = stage ? ((box.left + box.width / 2 - stage.left) / stage.width) * 100 : 50;
    const y = stage ? ((box.top + box.height / 2 - stage.top) / stage.height) * 100 : 50;
    setLeaving({ target, x, y });
    setOrigin({ x, y, target });
    timer.current = window.setTimeout(() => {
      timer.current = null;
      go(target);
    }, LEAVE_MS[target]);
  };

  return (
    <main
      className="screen desk-home"
      style={origin ? ({ '--zx': `${origin.x}%`, '--zy': `${origin.y}%` } as CSSProperties) : undefined}
    >
      <div
        ref={stageRef}
        className={`desk-stage${leaving ? ` leaving to-${leaving.target}` : ''}${instant ? ' instant' : ''}${
          settling ? ` settling-${settling}` : ''
        }`}
      >
        {/* The wall: panelling, a moonlit window between star-sewn drapes. */}
        <div className="desk-wall" aria-hidden="true">
          <div className="desk-panel left" />
          <div className="desk-panel right" />
          <div className="desk-casement">
            <div className="desk-rod" />
            <div className="desk-drape left" />
            <div className="desk-window">
              <WindowView />
              <div className="desk-window-bars" />
            </div>
            <div className="desk-drape right" />
            <div className="desk-sill" />
          </div>
        </div>

        {/* The desk top, with the clutter that isn't a way anywhere. */}
        <div className="desk-top" aria-hidden="true">
          <div className="desk-wood-clip">
            <div className="desk-wood" />
          </div>
          <div className="desk-gloss" />
          <div className="desk-prop lantern">
            <LanternBooksArt />
          </div>
          <div className="desk-prop candles">
            <CandleClusterArt />
          </div>
          <div className="desk-prop candle-front">
            <CandleArt />
          </div>
          <div className="desk-prop coins">
            <CoinsArt />
          </div>
          <div className="desk-prop inkwell">
            <InkwellArt />
          </div>
        </div>

        {/* The three ways into the game. */}
        <div className="desk-objects">
          <DeskObject
            kind="ball"
            label="Summon"
            hint="Gaze into the crystal ball to summon champions"
            ready={summonReady ? 'Ready' : undefined}
            onClick={choose('summon')}
          >
            <CrystalBallArt />
          </DeskObject>

          <div className="desk-map-slot">
            <DeskObject kind="map" label="Play" hint="Unroll the map to choose where to fight" onClick={choose('play')}>
              <MapArt />
            </DeskObject>
            {next && (
              <button
                type="button"
                className="desk-note"
                disabled={state.ownedUnits.length === 0}
                onClick={choose('continue')}
                aria-label={`Continue: ${next.name}`}
                title={`Continue: ${next.name}`}
              >
                <span className="desk-note-pin" aria-hidden="true" />
                <span className="desk-note-kicker">
                  {state.completedLevels.length === 0 ? 'Begin' : 'Continue'}
                </span>
                <span className="desk-note-name">{next.name}</span>
                <Icon name="forward" />
              </button>
            )}
          </div>

          <DeskObject
            kind="journal"
            label="Journal"
            hint="Open the Adventurer's Journal: your story, champions and bestiary"
            ready={unread > 0 ? `${unread} unread` : masteryReady ? 'Skill ready' : undefined}
            onClick={choose('journal')}
          >
            <JournalArt />
          </DeskObject>
        </div>

        {/* Warm candlelight, the orb's glow and the room's falloff. */}
        <div className="desk-light" aria-hidden="true" />
      </div>
      {/* The veil keeps its tint after the zoom ends, so it fades out in colour
          rather than losing its light the moment the zoom lets go. */}
      <div
        className={`desk-veil${origin ? ` tint-${origin.target}` : ''}${veiled ? ' on' : ''}${instant ? ' instant' : ''}`}
        aria-hidden="true"
      />
    </main>
  );
}

/** One clickable object on the desk, with its brass name plaque. */
function DeskObject({
  kind,
  label,
  hint,
  ready,
  onClick,
  children,
}: {
  kind: 'ball' | 'map' | 'journal';
  label: string;
  hint: string;
  ready?: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`desk-obj ${kind}`}
      onClick={onClick}
      aria-label={ready ? `${label} (${ready})` : label}
      title={hint}
    >
      <span className="desk-obj-lift">{children}</span>
      <span className="desk-plaque">
        {label}
        {ready && (
          <span className="desk-plaque-ready">
            <i /> {ready}
          </span>
        )}
      </span>
    </button>
  );
}

const noop = () => {};

/**
 * The desk as a backdrop for the screens it leads to (Summon, the mode picker,
 * the campaign): the same scene, held still and zoomed into the object that
 * leads there (the orb, the map), blurred and dimmed, and inert so nothing on
 * it can be clicked or focused.
 */
export function DeskBackdrop({ focus }: { focus: 'summon' | 'play' }) {
  return (
    <div
      className="backdrop desk-backdrop"
      aria-hidden="true"
      ref={(el) => {
        if (el) el.inert = true;
      }}
    >
      <div className="desk-backdrop-scene">
        <Home onPlay={noop} onContinue={noop} onSummon={noop} onJournal={noop} journalOpen={false} frozenOn={focus} />
      </div>
    </div>
  );
}

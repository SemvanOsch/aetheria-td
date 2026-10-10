import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../domain/grid';
import { getSection, type SectionId } from '../../domain/levels';
import type { GameEngine } from '../../engine/GameEngine';
import { drawBoard } from '../../engine/renderer';
import { GetawayBoardScene, type GetawayCue } from '../../engine/cutscene/getawayBoard';
import { JourneyScene, type JourneyCue } from '../../engine/cutscene/journey';
import { playCutsceneSound, RideAudio, type CutsceneSound } from '../cutsceneAudio';
import { setMusicIntensity, setMusicTrack } from '../music';
import { Icon } from './Icon';
import { useBoardZoom } from './useBoardZoom';

/**
 * The Capital's ending (The Getaway, `LevelDef.ending === 'getaway'`), played
 * over the battle screen the moment the stage is won:
 *
 *  1. On the board — no time to celebrate: the army's horn sounds behind
 *     them, the champions sprint down the road and fling themselves into the
 *     wagon one by one while the driver yells at them to hurry; the team
 *     lunges off as the last one leaps and gallops off the edge of the board
 *     (`GetawayBoardScene`), the battle theme back at full chase.
 *  2. A fade through black to the ride — a whole day on the road, dawn to
 *     night, ending before an inn at the forest's edge; the party hops down
 *     and goes in (`JourneyScene`), under storybook captions.
 *  3. A chapter title card, then a fade out — and `onDone` hands back to the
 *     battle screen's result card.
 *
 * Skippable at any point (the button, Escape, Enter or Space). Portalled to
 * the body like every overlay; it draws the board itself on its own canvas.
 */

type Phase = 'board' | 'cross' | 'journey' | 'title' | 'out';

/** Black dip between the board and the ride (s). */
const CROSS_TIME = 1.1;
/** The board's glide from its place on the battle screen to filling the stage. */
const ZOOM_TIME = 1.1;
/** Seconds the board holds still while it zooms (then the horn sounds). */
const INTRO_HOLD = ZOOM_TIME + 0.2;
const JOURNEY_FADE_IN = 1.4;
const TITLE_TIME = 5.2;
const OUT_TIME = 1;
/** The whole overlay fading off the result screen once the ending is over (ms). */
const LEAVE_MS = 800;

/** Storybook captions over the ride: [from, to, text] in journey seconds. */
const CAPTIONS: [number, number, string][] = [
  [1.0, 5.8, 'Behind them, the Capital burned.'],
  [6.8, 11.8, 'They drove east through the long day, and no one looked back.'],
  [12.8, 17.6, 'As the light failed, the old forest rose to meet the road…'],
  [18.6, 23.4, '…and at its edge, an inn’s windows glowed warm against the dark.'],
];

const BOARD_CUES: Partial<Record<GetawayCue, CutsceneSound>> = {
  horn: 'horn',
  hornNear: 'hornNear',
  hop: 'hop',
  board: 'board',
  shout: 'whinny',
  whip: 'whip',
  depart: 'creak',
};

const JOURNEY_CUES: Partial<Record<JourneyCue, CutsceneSound>> = {
  birds: 'birds',
  whoa: 'whoa',
  door: 'door',
  hop: 'hop',
  doorClose: 'doorClose',
  crickets: 'crickets',
  owl: 'owl',
};

export function GetawayCutscene({
  engine,
  section,
  onDone,
  onClosed,
  from,
}: {
  engine: GameEngine;
  section: SectionId;
  /** The ending is over: the screen beneath can show its result card. */
  onDone: () => void;
  /** The overlay has faded away and can be unmounted. */
  onClosed: () => void;
  /** Where the battle board sits on screen: the ending zooms out from it. */
  from?: DOMRect | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  const [leaving, setLeaving] = useState(false);
  const [phase, setPhase] = useState<Phase>('board');
  const [caption, setCaption] = useState<number>(-1);
  const finishedRef = useRef(false);

  // Over (or skipped): hand back at once, so the result card comes up beneath,
  // and fade the whole overlay, letterbox and all, off it.
  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setLeaving(true);
    doneRef.current();
    window.setTimeout(() => closedRef.current(), LEAVE_MS);
  };

  // Open by zooming the board out from where it sits on the battle screen.
  useBoardZoom(frameRef, from, ZOOM_TIME);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = BOARD_WIDTH * dpr;
    canvas.height = BOARD_HEIGHT * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // The party, captured before the board scene takes them off the board.
    const party = engine.towers.map((t) => t.def);
    const board = new GetawayBoardScene(engine);
    let journey: JourneyScene | null = null;
    const ride = new RideAudio();
    // The fight is won but the army is coming: the battle theme back at full chase.
    setMusicIntensity(1);
    const ui = { hoverCol: -1, hoverRow: -1, selectedUnitId: null, selectedTowerUid: null, scene: board.boardScene };

    let stage: Phase = 'board';
    let stageTime = 0;
    let elapsed = 0;
    let shownCaption = -1;
    let last = performance.now();
    let raf = 0;
    const go = (next: Phase) => {
      stage = next;
      stageTime = 0;
      setPhase(next);
    };

    const black = (a: number) => {
      if (a <= 0) return;
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`;
      ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    };

    const frame = (now: number) => {
      if (finishedRef.current) {
        ride.stop();
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      stageTime += dt;
      elapsed += dt;

      if (stage === 'board' || stage === 'cross') {
        // Nothing stirs until the zoom out from the battle board has settled.
        board.update(elapsed < INTRO_HOLD ? 0 : dt);
        ui.scene = board.boardScene;
        drawBoard(ctx, engine, ui);
        board.drawOverlay(ctx);
        for (const c of board.cues) {
          const s = BOARD_CUES[c];
          if (s) playCutsceneSound(s);
          if (c === 'depart') ride.start(0);
        }
        board.cues.length = 0;
        if (stage === 'board') ride.setSpeed(board.wagonSpeed);
        if (stage === 'board' && board.done) go('cross');
        if (stage === 'cross') {
          black(stageTime / (CROSS_TIME * 0.5));
          ride.setSpeed(Math.max(0, 1 - stageTime / CROSS_TIME));
          if (stageTime >= CROSS_TIME * 0.5 && !journey) {
            journey = new JourneyScene(party);
            setMusicTrack('journey');
            setMusicIntensity(1);
          }
          if (stageTime >= CROSS_TIME) {
            go('journey');
            ride.setSpeed(1);
          }
        }
      } else if (journey) {
        journey.update(dt);
        journey.draw(ctx);
        for (const c of journey.cues) {
          const s = JOURNEY_CUES[c];
          if (s) playCutsceneSound(s);
          if (c === 'whoa') setMusicIntensity(0.25);
        }
        journey.cues.length = 0;
        ride.setSpeed(stage === 'journey' ? journey.speed : 0);
        if (stage === 'journey') black(1 - journey.time / JOURNEY_FADE_IN);

        const jt = journey.time;
        const idx = CAPTIONS.findIndex(([a, b]) => jt >= a && jt < b);
        if (idx !== shownCaption) {
          shownCaption = idx;
          setCaption(idx);
        }

        if (stage === 'journey' && journey.finished) {
          go('title');
          setMusicIntensity(0.15);
        } else if (stage === 'title') {
          black(Math.min(0.55, stageTime / 1.2));
          if (stageTime >= TITLE_TIME) go('out');
        } else if (stage === 'out') {
          black(0.55 + stageTime / OUT_TIME);
          if (stageTime >= OUT_TIME) {
            finish();
            return;
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      ride.stop();
    };
    // One run per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chapter = getSection(section);

  return createPortal(
    <div className={`cutscene phase-${phase}${leaving ? ' leaving' : ''}`} role="dialog" aria-label="Chapter ending">
      <div ref={frameRef} className="cutscene-frame">
        <canvas ref={canvasRef} className="cutscene-canvas" />
        <div className="cutscene-bar top in" />
        <div className="cutscene-bar bottom in" />
        {caption >= 0 && (
          <p key={caption} className="cutscene-caption">
            {CAPTIONS[caption][2]}
          </p>
        )}
        {(phase === 'title' || phase === 'out') && (
          <div className="cutscene-title">
            <div className="cutscene-title-eyebrow">Chapter complete</div>
            <h2 className="cutscene-title-name">{chapter.name}</h2>
            <div className="cutscene-title-rule" />
            <p className="cutscene-title-line">Beyond the inn’s warm windows, the old forest waits.</p>
          </div>
        )}
      </div>
      <button className="cutscene-skip" onClick={finish}>
        Skip <Icon name="forward" />
      </button>
    </div>,
    document.body,
  );
}

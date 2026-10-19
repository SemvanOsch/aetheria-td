import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../domain/grid';
import { getSection, type SectionId } from '../../domain/levels';
import type { GameEngine } from '../../engine/GameEngine';
import { drawBoard } from '../../engine/renderer';
import { ThroneRoomScene, type ThroneRoomCue } from '../../engine/cutscene/throneRoom';
import { playCutsceneSound, type CutsceneSound } from '../cutsceneAudio';
import { setMusicIntensity } from '../music';
import { Icon } from './Icon';
import { useBoardZoom } from './useBoardZoom';

/**
 * The Castle's ending (the Throne Room, `LevelDef.ending === 'throneRoom'`),
 * played over the battle screen the moment the stage is won:
 *
 *  1. On the board (`ThroneRoomScene`): the hero (or a champion at random,
 *     if the hero isn't deployed) carries the rebel flag up to the empty
 *     throne and drives it through the seat as the camera pushes in. The
 *     flag unfurls, the party cheers, then the royal horn sounds, guards
 *     storm in through the doors and the champions bolt out the far side.
 *  2. A chapter title card over the emptied hall, then a fade out, and
 *     `onDone` hands back to the battle screen's result card.
 *
 * Skippable at any point (the button, Escape, Enter or Space). Portalled to
 * the body like every overlay; it draws the board itself, through a camera.
 */

type Phase = 'board' | 'title' | 'out';

/** The board's glide from its place on the battle screen to filling the stage. */
const ZOOM_TIME = 1.1;
/** Seconds the board holds still while it zooms (then the bearer sets off). */
const INTRO_HOLD = ZOOM_TIME + 0.2;
const TITLE_TIME = 5.2;
const OUT_TIME = 1;
/** The whole overlay fading off the result screen once the ending is over (ms). */
const LEAVE_MS = 800;
/** Resolution of the board buffer relative to the board, so the camera's push-in stays crisp. */
const BUFFER_SCALE = 1.35;
/**
 * Share of the frame each letterbox bar covers (`.cutscene-bar.in`). The
 * camera may frame that far past the board's top or bottom edge, since the
 * bar hides it, so the flag right at the top of the board stays in view.
 */
const LETTERBOX = 0.095;

const CUES: Partial<Record<ThroneRoomCue, CutsceneSound>> = {
  step: 'step',
  plant: 'plant',
  unfurl: 'unfurl',
  cheer: 'cheer',
  horn: 'horn',
  hop: 'hop',
  warCry: 'warCry',
  march: 'march',
};

export function ThroneRoomCutscene({
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
  const finishedRef = useRef(false);
  const sceneRef = useRef<ThroneRoomScene | null>(null);

  // Over (or skipped): hand back at once, so the result card comes up beneath,
  // and fade the whole overlay, letterbox and all, off it.
  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    // The guards that stormed in go with the scene, not onto the board beneath.
    sceneRef.current?.dispose();
    setLeaving(true);
    doneRef.current();
    window.setTimeout(() => closedRef.current(), LEAVE_MS);
  };

  useBoardZoom(frameRef, from, ZOOM_TIME);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = BOARD_WIDTH * dpr;
    canvas.height = BOARD_HEIGHT * dpr;
    const ctx = canvas.getContext('2d')!;

    // The board renders into a buffer at a fixed scale (so its baked ground
    // never re-bakes as the camera moves); the camera then frames that.
    const bufScale = Math.min(2, Math.max(1, dpr * BUFFER_SCALE));
    const buffer = document.createElement('canvas');
    buffer.width = Math.round(BOARD_WIDTH * bufScale);
    buffer.height = Math.round(BOARD_HEIGHT * bufScale);
    const bctx = buffer.getContext('2d')!;
    bctx.scale(bufScale, bufScale);

    const scene = new ThroneRoomScene(engine);
    sceneRef.current = scene;
    // The fight is over: the battle theme drawn down for the planting.
    setMusicIntensity(0.3);
    const ui = { hoverCol: -1, hoverRow: -1, selectedUnitId: null, selectedTowerUid: null, scene: scene.boardScene };

    let stage: Phase = 'board';
    let stageTime = 0;
    let elapsed = 0;
    let last = performance.now();
    let raf = 0;
    const go = (next: Phase) => {
      stage = next;
      stageTime = 0;
      setPhase(next);
    };

    const frame = (now: number) => {
      if (finishedRef.current) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      stageTime += dt;
      elapsed += dt;

      // Nothing stirs until the zoom out from the battle board has settled.
      scene.update(elapsed < INTRO_HOLD ? 0 : dt);
      ui.scene = scene.boardScene;
      drawBoard(bctx, engine, ui);
      scene.drawOverlay(bctx);

      // Frame the board through the scene's camera, kept inside the board
      // (or past its top or bottom edge only as far as a letterbox bar covers).
      const cam = scene.camera;
      // Overscan a touch while shaking, so the shake never shows the board's edge.
      const z = Math.max(1, cam.zoom) * (1 + (cam.shake * 2.4) / BOARD_HEIGHT);
      const hw = BOARD_WIDTH / (2 * z);
      const hh = BOARD_HEIGHT / (2 * z);
      const bar = (LETTERBOX * BOARD_HEIGHT) / z;
      const cx = Math.max(hw, Math.min(BOARD_WIDTH - hw, cam.cx));
      const cy = Math.max(hh - bar, Math.min(BOARD_HEIGHT - hh + bar, cam.cy));
      const sx = cam.shake ? (Math.random() - 0.5) * 2 * cam.shake : 0;
      const sy = cam.shake ? (Math.random() - 0.5) * 2 * cam.shake : 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (BOARD_WIDTH / 2 - cx * z + sx), dpr * (BOARD_HEIGHT / 2 - cy * z + sy));
      ctx.drawImage(buffer, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);

      for (const c of scene.cues) {
        const s = CUES[c];
        if (s) playCutsceneSound(s);
        // The horn: the battle theme back at full chase as the party runs.
        if (c === 'horn') setMusicIntensity(1);
      }
      scene.cues.length = 0;

      const black = (a: number) => {
        if (a <= 0) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      };
      if (stage === 'board' && scene.done) {
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
      scene.dispose();
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
        {(phase === 'title' || phase === 'out') && (
          <div className="cutscene-title">
            <div className="cutscene-title-eyebrow">Chapter complete</div>
            <h2 className="cutscene-title-name">{chapter.name}</h2>
            <div className="cutscene-title-rule" />
            <p className="cutscene-title-line">The rebel flag flies over the empty throne. Now, to get out alive.</p>
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

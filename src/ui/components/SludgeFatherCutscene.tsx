import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../domain/grid';
import type { GameEngine } from '../../engine/GameEngine';
import { drawBoard } from '../../engine/renderer';
import { NAMECARD_AT, NAMECARD_TIME, SludgeFatherScene, type SludgeFatherCue } from '../../engine/cutscene/sludgeFather';
import { playCutsceneSound, type CutsceneSound } from '../cutsceneAudio';
import { setMusicIntensity } from '../music';
import { Icon } from './Icon';
import { useBoardZoom } from './useBoardZoom';

/**
 * The Sewers' ending (`LevelDef.ending === 'sludgeFather'`), played over the
 * battle screen the moment Captain Draven reaches the cistern: the board zooms
 * out to fill the stage, and `SludgeFatherScene` plays out the rest — the
 * cistern boiling, the hand bursting out and crushing him, the Sludge Father
 * hauling itself up and roaring (its name card coming up over the roar), and
 * the champions bolting for the far tunnel. When the last is gone and the thing
 * has had its moment, a dip to black, and `onDone` hands back to the battle
 * screen's result card, the overlay fading off it.
 *
 * Skippable at any point (the button, Escape, Enter or Space). Portalled to the
 * body like every overlay; it draws the board itself, through a camera.
 */

/** The board's glide from its place on the battle screen to filling the stage. */
const ZOOM_TIME = 1.1;
/** The dip to black once the scene is over (s). */
const OUT_TIME = 0.8;
/** The whole overlay fading off the result screen once the ending is over (ms). */
const LEAVE_MS = 800;
/** Resolution of the board buffer relative to the board, so the camera's push-in stays crisp. */
const BUFFER_SCALE = 1.35;

const CUES: Partial<Record<SludgeFatherCue, CutsceneSound>> = {
  bubbles: 'bubbles',
  rumble: 'rumble',
  eruption: 'eruption',
  crush: 'crush',
  heave: 'heave',
  thud: 'thud',
  roar: 'roar',
  hop: 'hop',
  growl: 'growl',
};

export function SludgeFatherCutscene({
  engine,
  onDone,
  onClosed,
  from,
}: {
  engine: GameEngine;
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
  const [namecard, setNamecard] = useState(false);
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

    const scene = new SludgeFatherScene(engine);
    // Dread before the storm: the battle theme drawn right down until it roars.
    setMusicIntensity(0.12);
    const ui = { hoverCol: -1, hoverRow: -1, selectedUnitId: null, selectedTowerUid: null, scene: scene.boardScene };

    let outTime = -1;
    let shownCard = false;
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      if (finishedRef.current) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      scene.update(dt);
      ui.scene = scene.boardScene;
      drawBoard(bctx, engine, ui);

      // Frame the board through the scene's camera, kept inside the board.
      const cam = scene.camera;
      // Overscan a touch while shaking, so the shake never shows the board's edge.
      const z = Math.max(1, cam.zoom) * (1 + (cam.shake * 2.4) / BOARD_HEIGHT);
      const hw = BOARD_WIDTH / (2 * z);
      const hh = BOARD_HEIGHT / (2 * z);
      const cx = Math.max(hw, Math.min(BOARD_WIDTH - hw, cam.cx));
      const cy = Math.max(hh, Math.min(BOARD_HEIGHT - hh, cam.cy));
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
        // The roar: the battle theme back at full chase as the party runs.
        if (c === 'roar') setMusicIntensity(1);
      }
      scene.cues.length = 0;

      const card = scene.time >= NAMECARD_AT && scene.time < NAMECARD_AT + NAMECARD_TIME;
      if (card !== shownCard) {
        shownCard = card;
        setNamecard(card);
      }

      if (scene.done) {
        if (outTime < 0) {
          outTime = 0;
          setMusicIntensity(0.15);
        }
        outTime += dt;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, outTime / OUT_TIME)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (outTime >= OUT_TIME) {
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
    };
    // One run per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className={`cutscene${leaving ? ' leaving' : ''}`} role="dialog" aria-label="Stage ending">
      <div ref={frameRef} className="cutscene-frame">
        <canvas ref={canvasRef} className="cutscene-canvas" />
        <div className="cutscene-bar top in" />
        <div className="cutscene-bar bottom in" />
        {namecard && (
          <div className="cutscene-namecard">
            <div className="cutscene-namecard-eyebrow">Beneath the Capital, something stirs</div>
            <h2 className="cutscene-namecard-name">The Sludge Father</h2>
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

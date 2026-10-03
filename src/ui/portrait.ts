/**
 * Menu portraits — the bridge between the procedural figures and every card,
 * collection tile, Bestiary entry and avatar preview.
 *
 * Portraits go through the *same* figure compositor as the battle board
 * (`engine/figure.ts`), so a champion is the same inked, rim-lit figure
 * everywhere; only the outline is a touch thinner for small UI sizes. Idle life
 * (a slow breath about the feet) is driven by **one** shared ticker at ~24 fps,
 * so a grid of thirty cards costs a single animation loop, and each frame is a
 * cached bitmap plus a transform.
 */

import { paintFigure, BOSS_BOX, DEFAULT_BOX, type FigureStyle } from '../engine/figure';

type Tick = (t: number) => void;

const subscribers = new Set<Tick>();
let raf = 0;
let last = 0;
const FRAME_MS = 1000 / 24;

const reducedMotion = (() => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
})();

function loop(now: number): void {
  raf = 0;
  if (subscribers.size === 0) return;
  if (now - last >= FRAME_MS) {
    last = now;
    for (const fn of subscribers) fn(now / 1000);
  }
  raf = requestAnimationFrame(loop);
}

/** Register a portrait's redraw on the shared ticker. Returns the unsubscribe. */
export function onPortraitTick(fn: Tick): () => void {
  if (reducedMotion) return () => {};
  subscribers.add(fn);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => {
    subscribers.delete(fn);
  };
}

/** Compositor settings for a menu portrait (thinner ink, warm studio rim). */
export function portraitStyle(accent: string, boss = false): FigureStyle {
  return {
    accent,
    outline: 0.7,
    rim: '#fff1d6',
    rimAlpha: 0.5,
    shading: 0.85,
    headY: boss ? -40 : -20,
    feetY: 12,
    box: boss ? BOSS_BOX : DEFAULT_BOX,
  };
}

/**
 * Paint one portrait frame: `draw` paints the bare sprite in figure space; the
 * breath (`t` seconds, 0 for a still) scales it gently about the feet.
 */
export function paintPortrait(
  ctx: CanvasRenderingContext2D,
  draw: (g: CanvasRenderingContext2D) => void,
  style: FigureStyle,
  cacheKey: string | undefined,
  t: number,
  phase = 0,
): void {
  const breath = t ? Math.sin(t * 2.1 + phase) : 0;
  ctx.save();
  ctx.translate(0, 11);
  ctx.scale(1 - 0.008 * breath, 1 + 0.02 * breath);
  ctx.translate(0, -11);
  paintFigure(ctx, draw, style, cacheKey);
  ctx.restore();
}

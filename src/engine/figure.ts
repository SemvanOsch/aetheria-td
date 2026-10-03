/**
 * Figure compositor — the shared "paint pass" every procedural figure goes
 * through, on the board *and* in every menu portrait.
 *
 * The sprite functions in `sprites.ts` draw flat, unoutlined fills. Rather than
 * hand-editing an ink line, a light direction and a hit flash into each of them
 * (and keeping a dozen copies in sync), the figure is drawn once into a small
 * offscreen scratch canvas and then finished here as a whole:
 *
 *   1. **Form shading** — a vertical gradient laid *onto* the figure
 *      (`source-atop`): a warm lift on the head and shoulders, a cool darkening
 *      toward the feet. Reads as top-down light plus ambient occlusion, and
 *      seats the figure on the ground instead of floating as a flat decal.
 *   2. **Rim light** — the figure's silhouette, shifted away from the light and
 *      subtracted from itself, leaves a thin crescent on the lit (upper) edges.
 *      Tinted by the stage's light colour so a torch-lit hall rims warm.
 *   3. **Flash / tint** — a hit flash or status tint washes the whole figure in
 *      one fill, so every figure gets hit feedback for free.
 *   4. **Contextual ink outline** — the silhouette, filled with an ink derived
 *      from the figure's own accent colour, stamped around the figure at a
 *      sub-pixel radius. Darker than its surroundings but never a uniform black
 *      sticker edge. Selection/threat states swap the ink for a glowing colour.
 *
 * The result is composited into the destination in **one** `drawImage`, so
 * fades (corpses, rising bosses) apply to figure + outline together without the
 * overlapping outline stamps darkening.
 *
 * Cost: three small scratch canvases shared by every call (no per-frame
 * allocation), a handful of `drawImage`s per figure.
 */

import { INK, inkFor, withAlpha } from './palette';

export interface FigureBox {
  /** Local-space bounding box the figure is guaranteed to fit inside. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FigureStyle {
  /** The figure's dominant accent colour — tints its outline ink. */
  accent: string;
  /** Outline width in the figure's local units (0 = none). */
  outline?: number;
  /** Override the outline ink (selection / threat states). */
  ink?: string;
  /** Soft outer glow around the outline in the ink colour (selected/threat). */
  glow?: number;
  /** 0..1 white hit flash washed over the figure. */
  flash?: number;
  /** Optional status tint colour + strength (frost, burn…). */
  tint?: string;
  tintAmount?: number;
  /** Rim-light colour (stage light). Defaults to a warm white. */
  rim?: string;
  /** Rim strength 0..1 (0 disables). */
  rimAlpha?: number;
  /** Form-shading strength 0..1 (0 disables). */
  shading?: number;
  /** Local y of the figure's feet (where AO is strongest). */
  feetY?: number;
  /** Local y of the top of the head (where the lift is strongest). */
  headY?: number;
  /** Overall opacity of the finished figure. */
  alpha?: number;
  /** Override the local-space box (bosses that scale themselves up). */
  box?: FigureBox;
  /**
   * Directional cast shadow: the silhouette laid flat on the floor from the
   * feet, sheared along (`dx`, `dy`) per unit of height (a low sun throws a
   * long shadow). Drawn under the figure in the destination.
   */
  cast?: { dx: number; dy: number; alpha: number };
}

/** Box that fits a normal champion/foe (feet ~+12, head ~-20, weapons ±24). */
export const DEFAULT_BOX: FigureBox = { x: -34, y: -40, w: 68, h: 60 };
/** Box for oversized bosses (scaled 1.3–1.7× inside their own sprite). */
export const BOSS_BOX: FigureBox = { x: -58, y: -78, w: 116, h: 104 };

interface Scratch {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

function makeScratch(): Scratch | null {
  if (typeof document === 'undefined') {
    if (typeof OffscreenCanvas === 'undefined') return null;
    const canvas = new OffscreenCanvas(64, 64);
    const ctx = canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  return ctx ? { canvas, ctx } : null;
}

let A: Scratch | null = null; // the figure itself
let B: Scratch | null = null; // silhouette / rim mask
let C: Scratch | null = null; // finished composite (outline + figure)

function ensure(s: Scratch, w: number, h: number): void {
  // Grow-only, in 32px steps, so a busy board doesn't thrash reallocations.
  if (s.canvas.width < w || s.canvas.height < h) {
    s.canvas.width = Math.max(s.canvas.width, Math.ceil(w / 32) * 32);
    s.canvas.height = Math.max(s.canvas.height, Math.ceil(h / 32) * 32);
  }
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Precomputed outline stamp directions (unit circle), 8 and 16 taps. */
const DIRS8: [number, number][] = [];
const DIRS16: [number, number][] = [];
for (let i = 0; i < 8; i++) DIRS8.push([Math.cos((i / 8) * Math.PI * 2), Math.sin((i / 8) * Math.PI * 2)]);
for (let i = 0; i < 16; i++) DIRS16.push([Math.cos((i / 16) * Math.PI * 2), Math.sin((i / 16) * Math.PI * 2)]);

// ---------------------------------------------------------------------------
// Frame cache
// ---------------------------------------------------------------------------

/**
 * Finished composites keyed by everything that shapes the bitmap (sprite +
 * pose + style + device scale). Most board frames repeat — an idle champion is
 * one bitmap (breathing is a transform applied *outside* the composite), and a
 * walking foe cycles through a dozen quantized stride frames — so a cache hit
 * turns the whole pass into one `drawImage`. LRU via Map insertion order.
 */
interface CachedFrame {
  canvas: HTMLCanvasElement;
  /** Ink silhouette, kept only when a cast shadow needs it. */
  sil: HTMLCanvasElement | null;
  W: number;
  H: number;
  pad: number;
  k: number;
  box: FigureBox;
}

const CACHE = new Map<string, CachedFrame>();
const CACHE_MAX = 320;

function copyOf(src: CanvasImageSource, W: number, H: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

function styleKey(s: FigureStyle, box: FigureBox): string {
  const q = (v: number | undefined, n: number) => Math.round((v ?? 0) * n);
  return [
    s.accent,
    s.ink ?? '',
    q(s.glow, 4),
    q(s.flash, 4),
    s.tint ?? '',
    q(s.tintAmount, 8),
    s.rim ?? '',
    q(s.rimAlpha ?? 0.55, 20),
    q(s.shading ?? 1, 10),
    q(s.outline ?? 0.9, 20),
    box.x,
    box.y,
    box.w,
    box.h,
    s.headY ?? '',
    s.feetY ?? '',
    s.cast ? 1 : 0,
  ].join(',');
}

/** Drop every cached frame (e.g. after a sprite edit in dev). */
export function clearFigureCache(): void {
  CACHE.clear();
}

function blit(ctx: CanvasRenderingContext2D, f: CachedFrame, style: FigureStyle): void {
  const { box, pad, k, W, H } = f;
  if (style.cast && f.sil) {
    const { dx, dy, alpha } = style.cast;
    const fy = style.feetY ?? 12;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * alpha * (style.alpha ?? 1);
    ctx.transform(1, 0, -dx, -dy, dx * fy, fy * (1 + dy));
    ctx.drawImage(f.sil, 0, 0, W, H, box.x - pad / k, box.y - pad / k, W / k, H / k);
    ctx.restore();
  }
  const prevAlpha = ctx.globalAlpha;
  if (style.alpha !== undefined) ctx.globalAlpha = prevAlpha * Math.max(0, Math.min(1, style.alpha));
  ctx.drawImage(f.canvas, 0, 0, W, H, box.x - pad / k, box.y - pad / k, W / k, H / k);
  ctx.globalAlpha = prevAlpha;
}

/**
 * Paint a figure through the compositor. `draw` receives a context already
 * transformed into the figure's local space (origin = figure centre, the same
 * frame the sprite functions author in) and should draw the bare sprite.
 *
 * `ctx`'s current transform positions/scales/rotates the result exactly as if
 * `draw(ctx)` had been called directly, so callers just swap the direct sprite
 * call for `paintFigure(ctx, draw, style)`.
 *
 * Pass `cacheKey` — a string that fully identifies what `draw` will paint
 * (sprite, colour, facing, quantized pose) — to reuse the finished bitmap
 * across frames. Omit it for anything animated from inside the sprite.
 */
export function paintFigure(
  ctx: CanvasRenderingContext2D,
  draw: (g: CanvasRenderingContext2D) => void,
  style: FigureStyle,
  cacheKey?: string,
): void {
  if (!A) A = makeScratch();
  if (!B) B = makeScratch();
  if (!C) C = makeScratch();
  if (!A || !B || !C) {
    draw(ctx); // no offscreen support — plain sprite
    return;
  }

  const box = style.box ?? DEFAULT_BOX;
  const m = ctx.getTransform();
  // Device pixels per local unit (rotation-safe). Cached frames render at a
  // quantized scale so a bitmap is reusable across tiny transform changes.
  const kRaw = Math.max(0.5, Math.hypot(m.a, m.b));
  const k = cacheKey ? Math.round(kRaw * 20) / 20 : kRaw;
  let key = '';
  if (cacheKey && typeof document !== 'undefined') {
    key = `${cacheKey}|${k}|${styleKey(style, box)}`;
    const hit = CACHE.get(key);
    if (hit) {
      CACHE.delete(key);
      CACHE.set(key, hit);
      blit(ctx, hit, style);
      return;
    }
  }

  const outline = style.outline ?? 0.9;
  const pad = Math.ceil((outline + (style.glow ?? 0)) * k) + 2;
  const W = Math.ceil(box.w * k) + pad * 2;
  const H = Math.ceil(box.h * k) + pad * 2;
  if (W > 2048 || H > 2048) {
    draw(ctx);
    return;
  }
  ensure(A, W, H);
  ensure(B, W, H);
  ensure(C, W, H);
  const a = A.ctx as Ctx2D;
  const b = B.ctx as Ctx2D;
  const c = C.ctx as Ctx2D;

  // ---- 1. The bare figure, in device pixels, padded on every side.
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.globalAlpha = 1;
  a.globalCompositeOperation = 'source-over';
  a.clearRect(0, 0, W, H);
  a.setTransform(k, 0, 0, k, pad - box.x * k, pad - box.y * k);
  draw(a as CanvasRenderingContext2D);
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.globalAlpha = 1;
  a.shadowBlur = 0;
  a.globalCompositeOperation = 'source-atop';

  // ---- 2. Form shading: warm lift at the head, cool AO at the feet.
  const shading = style.shading ?? 1;
  if (shading > 0) {
    const toY = (ly: number) => pad + (ly - box.y) * k;
    const headY = toY(style.headY ?? -20);
    const feetY = toY(style.feetY ?? 12);
    const g = a.createLinearGradient(0, headY, 0, feetY);
    g.addColorStop(0, `rgba(255,236,206,${0.16 * shading})`);
    g.addColorStop(0.38, 'rgba(255,236,206,0)');
    g.addColorStop(0.72, 'rgba(16,10,30,0)');
    g.addColorStop(1, `rgba(16,10,30,${0.34 * shading})`);
    a.fillStyle = g;
    a.fillRect(0, 0, W, H);
  }

  // ---- 3. Rim light on the upper edges (light falls from above, a touch left).
  const rimAlpha = style.rimAlpha ?? 0.55;
  if (rimAlpha > 0) {
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, W, H);
    b.drawImage(A.canvas, 0, 0);
    b.globalCompositeOperation = 'source-in';
    b.fillStyle = style.rim ?? '#fff1d6';
    b.fillRect(0, 0, W, H);
    // Subtract the silhouette shifted down-right: what's left is the lit
    // up-left crescent, about one local unit thick.
    b.globalCompositeOperation = 'destination-out';
    b.drawImage(A.canvas, 0.55 * k, 1.1 * k);
    a.globalAlpha = rimAlpha;
    a.drawImage(B.canvas, 0, 0);
    a.globalAlpha = 1;
  }

  // ---- 4. Hit flash / status tint washes.
  if (style.tint && (style.tintAmount ?? 0) > 0) {
    a.fillStyle = withAlpha(style.tint, Math.min(0.7, style.tintAmount ?? 0));
    a.fillRect(0, 0, W, H);
  }
  if ((style.flash ?? 0) > 0) {
    a.fillStyle = `rgba(255,250,240,${Math.min(0.85, style.flash ?? 0)})`;
    a.fillRect(0, 0, W, H);
  }
  a.globalCompositeOperation = 'source-over';

  // ---- 5. Silhouette in ink, then the composite: outline ring + figure.
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, W, H);
  const needSil = outline > 0 || !!style.cast;
  if (needSil) {
    const ink = style.ink ?? inkFor(style.accent);
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, W, H);
    b.drawImage(A.canvas, 0, 0);
    b.globalCompositeOperation = 'source-in';
    b.fillStyle = ink;
    b.fillRect(0, 0, W, H);
    b.globalCompositeOperation = 'source-over';

    const r = outline * k;
    if ((style.glow ?? 0) > 0) {
      // A soft halo in the ink colour (selection / threat). Shadow blur on a
      // single stamp is cheap at these sizes.
      c.shadowColor = ink;
      c.shadowBlur = (style.glow ?? 0) * k;
      c.globalAlpha = 0.9;
      c.drawImage(B.canvas, 0, 0);
      c.shadowBlur = 0;
      c.globalAlpha = 1;
    }
    if (outline > 0) {
      const dirs = r > 2.6 ? DIRS16 : DIRS8;
      for (const [dx, dy] of dirs) c.drawImage(B.canvas, dx * r, dy * r);
    }
  }
  c.drawImage(A.canvas, 0, 0);

  // ---- 6. One composite into the destination, in the caller's local frame.
  const frame: CachedFrame = {
    canvas: C.canvas as HTMLCanvasElement,
    sil: needSil ? (B.canvas as HTMLCanvasElement) : null,
    W,
    H,
    pad,
    k,
    box,
  };
  if (key) {
    // Keep a private copy (the scratch canvases are reused by the next call).
    frame.canvas = copyOf(C.canvas, W, H);
    frame.sil = style.cast && needSil ? copyOf(B.canvas, W, H) : null;
    CACHE.set(key, frame);
    if (CACHE.size > CACHE_MAX) {
      const oldest = CACHE.keys().next().value;
      if (oldest !== undefined) CACHE.delete(oldest);
    }
  }
  blit(ctx, frame, style);
}

/** Ink presets callers pick from (kept here so menus and board agree). */
export const FIGURE_INK = INK;

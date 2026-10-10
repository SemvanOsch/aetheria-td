/**
 * Mist — drifting banks of fog laid over the lit board (a mood's
 * `Atmosphere.mist`). Drawn after the lighting pass and before the glow pass,
 * so figures sink into it while attacks and spells still shine through.
 *
 * One half-resolution layer (fog is soft by nature): a thin even haze plus two
 * tiles of soft blobs drifting at different speeds and scales, recoloured to
 * the mist's tint. Each `clear` (a lit lantern) punches a feathered hole, so
 * the light visibly burns the mist away where the rule says it is gone.
 */

import { BOARD_HEIGHT, BOARD_WIDTH } from '../domain/grid';
import { rng } from './palette';

/** A round hole in the mist: centre, radius and how fully cleared (0..1). */
export interface MistClear {
  x: number;
  y: number;
  radius: number;
  amount: number;
}

const HALF = 0.5;
/** Side of the tileable blob texture, px. */
const TEX = 256;

let texture: HTMLCanvasElement | null = null;

/** A seamless tile of soft white blobs (alpha only), made once and shared. */
function mistTexture(): HTMLCanvasElement {
  if (texture) return texture;
  const c = document.createElement('canvas');
  c.width = TEX;
  c.height = TEX;
  const g = c.getContext('2d')!;
  const r = rng(8113);
  for (let i = 0; i < 46; i++) {
    const x = r() * TEX;
    const y = r() * TEX;
    const rad = 18 + r() * 56;
    const a = 0.08 + r() * 0.16;
    // Wrap each blob across the edges so the tile repeats without a seam.
    for (const dx of [-TEX, 0, TEX]) {
      for (const dy of [-TEX, 0, TEX]) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx + rad < 0 || cx - rad > TEX || cy + rad < 0 || cy - rad > TEX) continue;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
        gr.addColorStop(0, `rgba(255,255,255,${a})`);
        gr.addColorStop(0.6, `rgba(255,255,255,${a * 0.5})`);
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      }
    }
  }
  texture = c;
  return c;
}

export class MistLayer {
  private c: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private pattern: CanvasPattern | null = null;

  constructor() {
    this.c = document.createElement('canvas');
    this.c.width = Math.ceil(BOARD_WIDTH * HALF);
    this.c.height = Math.ceil(BOARD_HEIGHT * HALF);
    this.g = this.c.getContext('2d')!;
  }

  /** Composite the mist over `ctx` at time `t` (seconds), with lantern holes. */
  render(
    ctx: CanvasRenderingContext2D,
    mist: { color: string; alpha: number },
    clears: readonly MistClear[],
    t: number,
  ): void {
    const g = this.g;
    g.setTransform(HALF, 0, 0, HALF, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // An even haze, then two banks rolling across at different depths: a big
    // slow one and a smaller, quicker one drifting the other way.
    g.fillStyle = `rgba(255,255,255,${(mist.alpha * 0.36).toFixed(3)})`;
    g.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    this.pattern ??= g.createPattern(mistTexture(), 'repeat');
    if (this.pattern) {
      this.bank(t * 9, Math.sin(t * 0.07) * 18, 2.2, mist.alpha * 1.9);
      this.bank(-t * 14 + 90, t * 2.5, 1.3, mist.alpha * 1.3);
    }

    // Recolour everything to the mist's tint (keeping each pixel's density).
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = mist.color;
    g.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // Lit lanterns burn feathered holes in it.
    g.globalCompositeOperation = 'destination-out';
    for (const h of clears) {
      const k = Math.max(0, Math.min(1, h.amount));
      if (k <= 0) continue;
      const r = h.radius * 1.15;
      const gr = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, r);
      gr.addColorStop(0, `rgba(0,0,0,${0.94 * k})`);
      gr.addColorStop(0.62, `rgba(0,0,0,${0.82 * k})`);
      gr.addColorStop(0.87, `rgba(0,0,0,${0.35 * k})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(h.x - r, h.y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';

    ctx.drawImage(this.c, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  }

  /** One tiled bank of blobs, offset by (`ox`,`oy`) and scaled by `scale`. */
  private bank(ox: number, oy: number, scale: number, alpha: number): void {
    const g = this.g;
    const span = TEX * scale;
    const x0 = (((ox % span) + span) % span) - span;
    const y0 = (((oy % span) + span) % span) - span;
    g.save();
    g.globalAlpha = Math.min(1, alpha);
    g.translate(x0, y0);
    g.scale(scale, scale);
    g.fillStyle = this.pattern!;
    g.fillRect(0, 0, (BOARD_WIDTH + span * 2) / scale, (BOARD_HEIGHT + span * 2) / scale);
    g.restore();
  }
}

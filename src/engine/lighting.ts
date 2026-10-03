/**
 * Board lighting — the pass that makes figures sit *inside* a lit world.
 *
 * Two half-resolution layers (light is soft by nature, so half-res is free
 * quality-wise and quarters the fill cost):
 *
 *  - **Darkness**: the stage's ambient colour at its darkness strength, with
 *    every light punched out of it (`destination-out` radial falloffs). Drawn
 *    over the world, so unlit corners sink into the stage's mood colour while
 *    torch pools, champions and spells stay clear.
 *  - **Glow**: each light's coloured falloff accumulated additively, then
 *    added over the world (`lighter`) — the warm bloom that tints nearby floor
 *    and figures toward the flame.
 *
 * On top: an optional directional key light (low sun / moonlight), a soft-light
 * colour grade and a cached vignette. A transient **exposure** value (bumped by
 * big spells/crits via the VFX layer) lifts the whole darkness briefly and eases
 * back, so a Cyclone Slash momentarily lights the room.
 */

import { BOARD_HEIGHT, BOARD_WIDTH } from '../domain/grid';
import type { Atmosphere } from '../domain/atmosphere';
import { LIGHT, type LightFamily, toRgb, withAlpha } from './palette';

export interface Light {
  x: number;
  y: number;
  /** Reach of the light, px. */
  radius: number;
  /** Light family (colour of the glow). */
  family: LightFamily;
  /** 0..1 strength: how much darkness it clears + how bright its glow. */
  intensity: number;
  /** Glow strength multiplier (0 = clears darkness only, no colour bloom). */
  glow?: number;
}

const HALF = 0.5;

function layer(): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = Math.ceil(BOARD_WIDTH * HALF);
  c.height = Math.ceil(BOARD_HEIGHT * HALF);
  const g = c.getContext('2d')!;
  g.setTransform(HALF, 0, 0, HALF, 0, 0);
  return { c, g };
}

export class Lighting {
  private dark = layer();
  private glow = layer();
  private vignette: HTMLCanvasElement | null = null;
  private vignetteKey = -1;

  /**
   * Composite the lighting over the world already drawn into `ctx`.
   * `exposure` (0..1) temporarily lifts the darkness (spell flashes).
   */
  render(ctx: CanvasRenderingContext2D, lights: readonly Light[], atmo: Atmosphere, exposure: number): void {
    const darkness = Math.max(0, atmo.darkness * (1 - Math.min(0.85, exposure)));
    const { g: d, c: dc } = this.dark;
    const { g: gl, c: gc } = this.glow;

    // ---- Darkness layer.
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    if (darkness > 0.001) {
      const [r, g, b] = toRgb(atmo.ambient);
      d.fillStyle = `rgba(${r},${g},${b},${darkness})`;
      d.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      // Directional key light: thins the darkness across the lit side.
      if (atmo.sun) {
        const { angle } = atmo.sun;
        const cx = BOARD_WIDTH / 2;
        const cy = BOARD_HEIGHT / 2;
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const span = Math.hypot(BOARD_WIDTH, BOARD_HEIGHT) / 2;
        const sg = d.createLinearGradient(cx - ux * span, cy - uy * span, cx + ux * span, cy + uy * span);
        sg.addColorStop(0, 'rgba(0,0,0,0.55)');
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        d.globalCompositeOperation = 'destination-out';
        d.fillStyle = sg;
        d.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      }
      d.globalCompositeOperation = 'destination-out';
      for (const L of lights) {
        const k = Math.max(0, Math.min(1, L.intensity));
        if (k <= 0 || L.radius <= 0) continue;
        const grad = d.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.radius);
        grad.addColorStop(0, `rgba(0,0,0,${k})`);
        grad.addColorStop(0.35, `rgba(0,0,0,${k * 0.7})`);
        grad.addColorStop(0.7, `rgba(0,0,0,${k * 0.22})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = grad;
        d.fillRect(L.x - L.radius, L.y - L.radius, L.radius * 2, L.radius * 2);
      }
      d.globalCompositeOperation = 'source-over';
      ctx.drawImage(dc, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    }

    // ---- Glow layer (additive colour bloom).
    gl.globalCompositeOperation = 'source-over';
    gl.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    gl.globalCompositeOperation = 'lighter';
    let anyGlow = false;
    for (const L of lights) {
      const strength = Math.max(0, Math.min(1, L.intensity)) * (L.glow ?? 1);
      if (strength <= 0.01) continue;
      anyGlow = true;
      const fam = LIGHT[L.family];
      const r = L.radius * 0.75;
      const grad = gl.createRadialGradient(L.x, L.y, 0, L.x, L.y, r);
      grad.addColorStop(0, withAlpha(fam.core, 0.42 * strength));
      grad.addColorStop(0.18, withAlpha(fam.glow, 0.3 * strength));
      grad.addColorStop(0.55, withAlpha(fam.glow, 0.09 * strength));
      grad.addColorStop(1, withAlpha(fam.glow, 0));
      gl.fillStyle = grad;
      gl.fillRect(L.x - r, L.y - r, r * 2, r * 2);
    }
    if (atmo.sun) {
      const { angle, color, alpha } = atmo.sun;
      const cx = BOARD_WIDTH / 2;
      const cy = BOARD_HEIGHT / 2;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const span = Math.hypot(BOARD_WIDTH, BOARD_HEIGHT) / 2;
      const sg = gl.createLinearGradient(cx - ux * span, cy - uy * span, cx + ux * span, cy + uy * span);
      sg.addColorStop(0, withAlpha(color, alpha));
      sg.addColorStop(0.6, withAlpha(color, alpha * 0.25));
      sg.addColorStop(1, withAlpha(color, 0));
      gl.fillStyle = sg;
      gl.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      anyGlow = true;
    }
    gl.globalCompositeOperation = 'source-over';
    if (anyGlow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(gc, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      ctx.restore();
    }

    // ---- Colour grade (soft-light keeps contrast while pulling the hue).
    if (atmo.grade && (atmo.gradeAlpha ?? 0) > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = withAlpha(atmo.grade, atmo.gradeAlpha ?? 0);
      ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      ctx.restore();
    }
  }

  /** The cached corner vignette (drawn after lighting, before the HUD). */
  drawVignette(ctx: CanvasRenderingContext2D, strength: number): void {
    if (strength <= 0) return;
    const key = Math.round(strength * 100);
    if (!this.vignette || this.vignetteKey !== key) {
      const { c, g } = layer();
      const cx = BOARD_WIDTH / 2;
      const cy = BOARD_HEIGHT / 2;
      const grad = g.createRadialGradient(cx, cy, BOARD_HEIGHT * 0.42, cx, cy, Math.hypot(cx, cy) * 1.02);
      grad.addColorStop(0, 'rgba(4,2,10,0)');
      grad.addColorStop(0.6, `rgba(4,2,10,${0.35 * strength})`);
      grad.addColorStop(1, `rgba(4,2,10,${0.85 * strength})`);
      g.fillStyle = grad;
      // Stretch the circular falloff to the board's aspect.
      g.save();
      g.translate(cx, cy);
      g.scale(BOARD_WIDTH / BOARD_HEIGHT, 1);
      g.translate(-cx, -cy);
      g.fillRect(-BOARD_WIDTH, -BOARD_HEIGHT, BOARD_WIDTH * 3, BOARD_HEIGHT * 3);
      g.restore();
      this.vignette = c;
      this.vignetteKey = key;
    }
    ctx.drawImage(this.vignette, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  }
}

/** Two out-of-phase sines + a hash wobble — a cheap, organic flame flicker. */
export function flicker(t: number, phase: number): number {
  return (
    0.86 +
    0.08 * Math.sin(t * 7.3 + phase) +
    0.05 * Math.sin(t * 13.1 + phase * 1.7) +
    0.03 * Math.sin(t * 23.7 + phase * 2.3)
  );
}

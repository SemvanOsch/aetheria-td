/**
 * Board props — every decorative fixture a stage can be dressed with (castles,
 * houses, trees, torches, thrones, fountains…), each a procedural painting
 * dispatched by `PropKind` through `drawProp`.
 *
 * Shared by the board renderer and the Level Designer palette/preview, so a
 * prop looks identical in-game and while it's being placed. Purely cosmetic:
 * the engine only knows a prop's footprint (`domain/decor.ts`), for blocking.
 *
 * Every prop is split into three parts:
 *  - `shadow` — the soft contact/cast shadow on the floor, drawn live under it;
 *  - `body`   — the static painting (masonry, timber, roof tiles, cloth…),
 *               finished through the same ink compositor as the figures (a
 *               thinner, quieter line so props sit *behind* units in the visual
 *               hierarchy) and cached as one bitmap per kind/colour;
 *  - `live`   — the animated part (flames, water), painted fresh each frame.
 *
 * Material conventions: light falls from the upper left; lit faces are warm,
 * shaded faces cool; every surface carries a little seeded texture (stone
 * courses, wood grain, shingle rows) so nothing reads as a flat vector fill.
 */

import { BOARD_WIDTH, TILE } from '../domain/grid';
import { DEFAULT_BANNER_COLOR, type PropKind } from '../domain/decor';
import { clearFigureCache, paintFigure, type FigureBox } from './figure';
import { MATERIAL, rng, shade, withAlpha } from './palette';
import { LANTERN_GLASS } from './types';

// Dev only: when this file's drawing code is hot-swapped, drop the cached
// finished frames, or figures keep showing the old drawing until a reload.
if (import.meta.hot) import.meta.hot.dispose(() => clearFigureCache());

type Ctx = CanvasRenderingContext2D;

const T = TILE;
const H = TILE / 2;

const cellX = (col: number) => col * TILE + TILE / 2;
const cellY = (row: number) => row * TILE + TILE / 2;

function nowSec(): number {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

// ===========================================================================
// Painting helpers
// ===========================================================================

function rr(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

/** Back-compat export: rounded-rect path (used by the renderer's HUD). */
export function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  rr(g, x, y, w, h, r);
}

function vgrad(g: Ctx, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

function hgrad(g: Ctx, x0: number, x1: number, stops: [number, string][]): CanvasGradient {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

/** A soft elliptical floor shadow (radial falloff, never a hard disc). */
function floorShadow(g: Ctx, cx: number, cy: number, rx: number, ry: number, a = 0.45): void {
  g.save();
  g.translate(cx, cy);
  g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(8,5,14,${a})`);
  gr.addColorStop(0.6, `rgba(8,5,14,${a * 0.55})`);
  gr.addColorStop(1, 'rgba(8,5,14,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, rx, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/**
 * Coursed masonry filling a rect: staggered stones with per-stone tone, a lit
 * top lip and a shadowed underside, set in darker mortar.
 */
function masonry(g: Ctx, x: number, y: number, w: number, h: number, base: string, course: number, seed: number): void {
  const r = rng(seed);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = shade(base, -0.38);
  g.fillRect(x, y, w, h);
  let row = 0;
  for (let yy = y; yy < y + h; yy += course) {
    const off = row % 2 === 0 ? 0 : -course * 0.9;
    let xx = x + off;
    while (xx < x + w) {
      const sw = course * (1.4 + r() * 0.9);
      const tone = shade(base, (r() - 0.5) * 0.2);
      g.fillStyle = tone;
      rr(g, xx + 0.5, yy + 0.5, sw - 1, course - 1, 0.8);
      g.fill();
      g.fillStyle = withAlpha(shade(tone, 0.35), 0.5);
      g.fillRect(xx + 1, yy + 0.6, sw - 2.2, 0.7);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(xx + 1, yy + course - 1.4, sw - 2, 0.7);
      if (r() < 0.12) {
        g.fillStyle = withAlpha('#5f7a3a', 0.5);
        g.beginPath();
        g.arc(xx + r() * sw, yy + course - 1, 0.8 + r(), 0, Math.PI * 2);
        g.fill();
      }
      xx += sw;
    }
    row++;
  }
  g.restore();
}

/** Plank fill (horizontal or vertical boards) with grain and seams. */
function planks(g: Ctx, x: number, y: number, w: number, h: number, base: string, vertical: boolean, size: number, seed: number): void {
  const r = rng(seed);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const n = Math.ceil((vertical ? w : h) / size);
  for (let i = 0; i < n; i++) {
    const tone = shade(base, (r() - 0.5) * 0.18);
    g.fillStyle = tone;
    if (vertical) g.fillRect(x + i * size, y, size, h);
    else g.fillRect(x, y + i * size, w, size);
    g.strokeStyle = withAlpha(shade(tone, -0.35), 0.45);
    g.lineWidth = 0.5;
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      if (vertical) {
        const gx = x + i * size + size * (0.3 + r() * 0.4);
        g.moveTo(gx, y);
        g.quadraticCurveTo(gx + (r() - 0.5) * 2, y + h / 2, gx, y + h);
      } else {
        const gy = y + i * size + size * (0.3 + r() * 0.4);
        g.moveTo(x, gy);
        g.quadraticCurveTo(x + w / 2, gy + (r() - 0.5) * 2, x + w, gy);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    if (vertical) g.fillRect(x + (i + 1) * size - 0.6, y, 0.6, h);
    else g.fillRect(x, y + (i + 1) * size - 0.6, w, 0.6);
  }
  g.restore();
}

/**
 * A roof plane (polygon) laid with rows of scalloped shingles, darkening toward
 * the eaves, with a lit ridge.
 */
function shingleRoof(g: Ctx, pts: [number, number][], base: string, row: number, seed: number): void {
  const r = rng(seed);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  g.save();
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fillStyle = vgrad(g, minY, maxY, [[0, shade(base, 0.1)], [1, shade(base, -0.25)]]);
  g.fill();
  g.clip();
  const sw = row * 1.3;
  let k = 0;
  for (let y = minY + row; y < maxY + row; y += row) {
    const off = (k % 2) * (sw / 2);
    for (let x = minX - sw + off; x < maxX + sw; x += sw) {
      const tone = shade(base, (r() - 0.5) * 0.18 - ((y - minY) / (maxY - minY)) * 0.12);
      g.fillStyle = tone;
      g.beginPath();
      g.moveTo(x, y - row);
      g.lineTo(x + sw, y - row);
      g.lineTo(x + sw, y - 1);
      g.quadraticCurveTo(x + sw / 2, y + 1.2, x, y - 1);
      g.closePath();
      g.fill();
      g.strokeStyle = withAlpha(shade(base, -0.5), 0.55);
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(x + sw, y - 1);
      g.quadraticCurveTo(x + sw / 2, y + 1.2, x, y - 1);
      g.stroke();
    }
    k++;
  }
  g.restore();
}

/** A warmly lit window: frame, glowing glass, mullions, sill and shutters. */
function litWindow(g: Ctx, x: number, y: number, w: number, h: number, frame: string, opts: { arch?: boolean; shutters?: string; box?: boolean } = {}): void {
  // Recess shadow.
  g.fillStyle = shade(frame, -0.3);
  if (opts.arch) {
    g.beginPath();
    g.moveTo(x - 1, y + h + 1);
    g.lineTo(x - 1, y + w / 2);
    g.arc(x + w / 2, y + w / 2, w / 2 + 1, Math.PI, 0);
    g.lineTo(x + w + 1, y + h + 1);
    g.closePath();
    g.fill();
  } else {
    g.fillRect(x - 1.2, y - 1.2, w + 2.4, h + 2.4);
  }
  // Glass: hot centre falling off to amber corners.
  const gr = g.createRadialGradient(x + w / 2, y + h * 0.55, 0.5, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
  gr.addColorStop(0, '#fff4c8');
  gr.addColorStop(0.5, '#ffd27a');
  gr.addColorStop(1, '#d9822e');
  g.fillStyle = gr;
  if (opts.arch) {
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x, y + w / 2);
    g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
    g.lineTo(x + w, y + h);
    g.closePath();
    g.fill();
  } else {
    g.fillRect(x, y, w, h);
  }
  // Mullions.
  g.strokeStyle = frame;
  g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(x + w / 2, y + (opts.arch ? 0 : 0));
  g.lineTo(x + w / 2, y + h);
  g.moveTo(x, y + h * 0.5);
  g.lineTo(x + w, y + h * 0.5);
  g.stroke();
  // Sill.
  g.fillStyle = shade(frame, 0.25);
  g.fillRect(x - 2, y + h, w + 4, 1.6);
  if (opts.shutters) {
    g.fillStyle = opts.shutters;
    for (const sx of [x - w * 0.42 - 1.5, x + w + 1.5]) {
      g.fillRect(sx, y - 0.5, w * 0.42, h + 1);
      g.strokeStyle = withAlpha(shade(opts.shutters, -0.4), 0.8);
      g.lineWidth = 0.5;
      g.strokeRect(sx + 0.8, y + 1, w * 0.42 - 1.6, h * 0.42);
      g.strokeRect(sx + 0.8, y + h * 0.52, w * 0.42 - 1.6, h * 0.42);
    }
  }
  if (opts.box) {
    // Flower box under the sill.
    g.fillStyle = '#6e4a26';
    g.fillRect(x - 1.5, y + h + 1.6, w + 3, 2.6);
    const cols = ['#e05a6a', '#f2d35a', '#f4e9c4', '#c95ad6'];
    for (let i = 0; i < 5; i++) {
      g.fillStyle = '#3f7a3a';
      g.beginPath();
      g.arc(x + (i + 0.5) * (w / 5), y + h + 1.2, 1.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      g.arc(x + (i + 0.5) * (w / 5) + 0.3, y + h + 0.6, 0.8, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/**
 * A living flame at (x, y) (its base), `s` = size. Flickers and sways on the
 * shared clock; additive glow + hot core so it reads as a light source.
 */
function flame(g: Ctx, x: number, y: number, s: number, t: number, phase: number): void {
  const f1 = Math.sin(t * 9.1 + phase);
  const f2 = Math.sin(t * 14.7 + phase * 1.9);
  const hgt = s * (1.9 + 0.22 * f1 + 0.12 * f2);
  const sway = s * 0.25 * Math.sin(t * 5.3 + phase);
  g.save();
  // Bloom.
  g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y - hgt * 0.45, 0, x, y - hgt * 0.45, s * 3.2);
  gr.addColorStop(0, 'rgba(255,190,90,0.45)');
  gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr;
  g.fillRect(x - s * 3.2, y - hgt * 0.45 - s * 3.2, s * 6.4, s * 6.4);
  g.globalCompositeOperation = 'source-over';
  const tongue = (w: number, hh: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x - w, y);
    g.quadraticCurveTo(x - w * 1.05, y - hh * 0.55, x + sway, y - hh);
    g.quadraticCurveTo(x + w * 1.05, y - hh * 0.55, x + w, y);
    g.quadraticCurveTo(x, y + w * 0.6, x - w, y);
    g.closePath();
    g.fill();
  };
  tongue(s * 0.95, hgt, '#ff7a24');
  tongue(s * 0.66, hgt * 0.78, '#ffb347');
  tongue(s * 0.38, hgt * 0.52, '#fff1c4');
  g.restore();
}

/** Iron sconce cup a torch flame sits in. */
function ironCup(g: Ctx, x: number, y: number, w: number): void {
  g.fillStyle = vgrad(g, y - 3, y + 3, [[0, '#5a5560'], [1, '#22202a']]);
  g.beginPath();
  g.moveTo(x - w, y - 2.5);
  g.lineTo(x + w, y - 2.5);
  g.lineTo(x + w * 0.55, y + 2.5);
  g.lineTo(x - w * 0.55, y + 2.5);
  g.closePath();
  g.fill();
  g.fillStyle = '#2a1a10';
  g.beginPath();
  g.ellipse(x, y - 2.5, w, 1.2, 0, 0, Math.PI * 2);
  g.fill();
}

// ===========================================================================
// Prop art
// ===========================================================================

interface PropArt {
  /** Local origin relative to the anchor cell centre. */
  origin: [number, number];
  shadow?: (g: Ctx) => void;
  /** `lit` is only ever true for a lightable prop the player has lit. */
  body: (g: Ctx, color: string, lit: boolean) => void;
  live?: (g: Ctx, t: number, color: string, lit: boolean) => void;
  /** Outline ink accent (contextual ink is derived from it). */
  ink: string;
  /**
   * Overrides for the compositor finish. Floor inlays (the plaza mosaic) lie
   * flat, so they take almost no form shading or rim light.
   */
  finish?: { shading?: number; rimAlpha?: number; outline?: number };
}

const STONE = '#8a8f9a';
const STONE_WARM = '#9a8f84';
const WOOD = MATERIAL.wood;
const GOLD = MATERIAL.gold;
const IRON = '#3a3640';

// --- Pillar: a fluted stone column crowned with a burning brazier bowl. -----
const pillar: PropArt = {
  origin: [0, 0],
  ink: '#4a4a56',
  shadow: (g) => floorShadow(g, 2, 17, 17, 6),
  body: (g) => {
    // Plinth.
    g.fillStyle = vgrad(g, 10, 20, [[0, shade(STONE, 0.15)], [1, shade(STONE, -0.3)]]);
    rr(g, -14, 10, 28, 9, 1.5);
    g.fill();
    g.fillStyle = shade(STONE, 0.3);
    g.fillRect(-14, 10, 28, 1.4);
    // Shaft with flutes, lit on the left.
    g.fillStyle = hgrad(g, -10, 10, [[0, shade(STONE, 0.28)], [0.35, shade(STONE, 0.1)], [1, shade(STONE, -0.4)]]);
    g.fillRect(-10, -20, 20, 31);
    g.strokeStyle = 'rgba(30,28,40,0.35)';
    g.lineWidth = 0.8;
    for (const fx of [-6, -2, 2, 6]) {
      g.beginPath();
      g.moveTo(fx, -19);
      g.lineTo(fx, 10);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(-8.5, -19, 2, 29);
    // Capital.
    g.fillStyle = vgrad(g, -27, -19, [[0, shade(STONE, 0.3)], [1, shade(STONE, -0.2)]]);
    rr(g, -14, -26, 28, 7, 1.5);
    g.fill();
    g.fillStyle = shade(STONE, -0.35);
    g.fillRect(-12, -20, 24, 1.2);
    // Brazier bowl.
    ironCup(g, 0, -29, 9);
    g.fillStyle = '#ff8a2c';
    g.beginPath();
    g.ellipse(0, -31.4, 7, 1.4, 0, 0, Math.PI * 2);
    g.fill();
  },
  live: (g, t) => flame(g, 0, -31, 4.2, t, 1.3),
};

// --- Torch: an iron standing brazier on a stone foot. -----------------------
const torch: PropArt = {
  origin: [0, 0],
  ink: '#3a3040',
  shadow: (g) => floorShadow(g, 1, 11, 9, 3.5),
  body: (g) => {
    g.fillStyle = vgrad(g, 6, 12, [[0, shade(STONE, 0.1)], [1, shade(STONE, -0.3)]]);
    rr(g, -6, 6, 12, 6, 1.5);
    g.fill();
    // Twisted iron post.
    g.strokeStyle = IRON;
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(0, 7);
    g.lineTo(0, -10);
    g.stroke();
    g.strokeStyle = 'rgba(200,190,210,0.35)';
    g.lineWidth = 0.7;
    for (let y = 4; y > -9; y -= 3) {
      g.beginPath();
      g.moveTo(-1.2, y);
      g.lineTo(1.2, y - 1.5);
      g.stroke();
    }
    ironCup(g, 0, -11, 5);
  },
  live: (g, t) => flame(g, 0, -13, 3.4, t, 0.4),
};

// --- Throne on its two-step dais, flanked by braziers. ----------------------
// Footprint 3×2; origin = footprint centroid (anchor + (TILE, TILE/2)).
const THRONE_Y = -11; // throne seat block centre (keeps the seated king aligned)
const throne: PropArt = {
  origin: [T, H],
  ink: '#3a1a20',
  shadow: (g) => floorShadow(g, 0, 27, 66, 10, 0.5),
  body: (g) => {
    // Dais: two stone steps with a crimson runner down the front.
    const step = (y: number, w: number, h: number) => {
      g.fillStyle = vgrad(g, y, y + h, [[0, '#6a5060'], [1, '#3a2632']]);
      rr(g, -w / 2, y, w, h, 3);
      g.fill();
      g.fillStyle = 'rgba(255,220,200,0.18)';
      g.fillRect(-w / 2 + 2, y + 0.6, w - 4, 1.2);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(-w / 2 + 2, y + h - 1.6, w - 4, 1.6);
      // Gold edge inlay.
      g.strokeStyle = withAlpha(GOLD, 0.7);
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(-w / 2 + 3, y + 2.6);
      g.lineTo(w / 2 - 3, y + 2.6);
      g.stroke();
    };
    step(5, 120, 21);
    step(-5, 90, 17);
    g.fillStyle = vgrad(g, -5, 26, [[0, '#9e2a3c'], [1, '#6a1424']]);
    g.fillRect(-11, -5, 22, 31);
    g.strokeStyle = GOLD;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-11, -5);
    g.lineTo(-11, 26);
    g.moveTo(11, -5);
    g.lineTo(11, 26);
    g.stroke();
    // Brazier stands on the upper step's ends.
    for (const bx of [-38, 38]) {
      g.strokeStyle = IRON;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(bx - 4, 4);
      g.lineTo(bx, -6);
      g.lineTo(bx + 4, 4);
      g.moveTo(bx, 4);
      g.lineTo(bx, -6);
      g.stroke();
      ironCup(g, bx, -8, 6);
    }
    // --- The throne itself (high carved back, gold frame, crimson velvet).
    g.save();
    g.translate(0, THRONE_Y);
    // Back panel with pointed arch crest.
    g.fillStyle = vgrad(g, -44, 6, [[0, '#f2cf6a'], [0.5, GOLD], [1, '#8a6420']]);
    g.beginPath();
    g.moveTo(-17, 6);
    g.lineTo(-17, -30);
    g.quadraticCurveTo(-17, -38, -10, -40);
    g.lineTo(0, -48);
    g.lineTo(10, -40);
    g.quadraticCurveTo(17, -38, 17, -30);
    g.lineTo(17, 6);
    g.closePath();
    g.fill();
    // Velvet inset.
    g.fillStyle = vgrad(g, -38, 2, [[0, '#b5303f'], [1, '#6a1424']]);
    g.beginPath();
    g.moveTo(-12, 2);
    g.lineTo(-12, -29);
    g.quadraticCurveTo(-12, -34, -6, -35);
    g.lineTo(0, -41);
    g.lineTo(6, -35);
    g.quadraticCurveTo(12, -34, 12, -29);
    g.lineTo(12, 2);
    g.closePath();
    g.fill();
    // Tufted buttons.
    g.fillStyle = 'rgba(255,200,120,0.55)';
    for (const [bx, by] of [[-6, -26], [6, -26], [0, -20], [-6, -14], [6, -14], [0, -8]] as const) {
      g.beginPath();
      g.arc(bx, by, 0.9, 0, Math.PI * 2);
      g.fill();
    }
    // Crown finial + jewel.
    g.fillStyle = GOLD;
    g.beginPath();
    g.moveTo(-6, -46);
    g.lineTo(-6, -52);
    g.lineTo(-3, -49);
    g.lineTo(0, -54);
    g.lineTo(3, -49);
    g.lineTo(6, -52);
    g.lineTo(6, -46);
    g.closePath();
    g.fill();
    g.fillStyle = '#e7443f';
    g.beginPath();
    g.arc(0, -43.5, 1.8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffd0c8';
    g.beginPath();
    g.arc(-0.5, -44, 0.6, 0, Math.PI * 2);
    g.fill();
    // Seat cushion.
    g.fillStyle = vgrad(g, -5, 7, [[0, '#c8404f'], [1, '#7a1a28']]);
    rr(g, -14, -5, 28, 11, 3);
    g.fill();
    // Armrests ending in gold scrolls.
    for (const ax of [-21, 13]) {
      g.fillStyle = vgrad(g, -8, 10, [[0, '#f2cf6a'], [1, '#8a6420']]);
      rr(g, ax, -8, 8, 17, 2.5);
      g.fill();
      g.fillStyle = '#fff1c4';
      g.beginPath();
      g.arc(ax + 4, -7, 2.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = GOLD;
      g.beginPath();
      g.arc(ax + 4, -7, 1.4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  },
  live: (g, t) => {
    flame(g, -38, -10, 3.8, t, 0.2);
    flame(g, 38, -10, 3.8, t, 2.1);
  },
};

// --- Chandelier: wrought ring of candles on a chain. ------------------------
const chandelier: PropArt = {
  origin: [0, 0],
  ink: '#2a2230',
  shadow: (g) => floorShadow(g, 0, 26, 22, 6, 0.25),
  body: (g) => {
    g.strokeStyle = '#4b4030';
    g.lineWidth = 1.4;
    g.setLineDash([2, 1.5]);
    g.beginPath();
    g.moveTo(0, -56);
    g.lineTo(0, -6);
    g.stroke();
    g.setLineDash([]);
    for (const a of [-0.5, 0.5]) {
      g.beginPath();
      g.moveTo(0, -8);
      g.lineTo(Math.sin(a) * 13, 0);
      g.stroke();
    }
    // Ring (seen at an angle).
    g.strokeStyle = '#2a2420';
    g.lineWidth = 3.4;
    g.beginPath();
    g.ellipse(0, 0, 14, 6, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#8a6a34';
    g.lineWidth = 1.6;
    g.beginPath();
    g.ellipse(0, 0, 14, 6, 0, 0, Math.PI * 2);
    g.stroke();
    // Candles.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const cx = Math.cos(a) * 14;
      const cy = Math.sin(a) * 6;
      g.fillStyle = '#f2ead8';
      g.fillRect(cx - 1, cy - 5, 2, 5);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(cx - 1, cy - 5, 0.7, 5);
    }
  },
  live: (g, t) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      flame(g, Math.cos(a) * 14, Math.sin(a) * 6 - 5, 1.3, t, i * 1.1);
    }
  },
};

// --- Banner: heraldic swallowtail on a gilded rod. --------------------------
const banner: PropArt = {
  origin: [0, 0],
  ink: '#2a1418',
  shadow: (g) => {
    g.fillStyle = 'rgba(8,5,14,0.28)';
    g.beginPath();
    g.moveTo(-9, 6);
    g.lineTo(15, 6);
    g.lineTo(15, 38);
    g.lineTo(3, 31);
    g.lineTo(-9, 38);
    g.closePath();
    g.fill();
  },
  body: (g, color) => {
    // Cloth with vertical fold shading.
    const c = color;
    g.fillStyle = hgrad(g, -11, 11, [
      [0, shade(c, -0.25)],
      [0.25, shade(c, 0.12)],
      [0.5, shade(c, -0.08)],
      [0.75, shade(c, 0.1)],
      [1, shade(c, -0.3)],
    ]);
    g.beginPath();
    g.moveTo(-11, 3);
    g.lineTo(11, 3);
    g.lineTo(11, 35);
    g.lineTo(0, 27);
    g.lineTo(-11, 35);
    g.closePath();
    g.fill();
    // Gold border + fringe points.
    g.strokeStyle = GOLD;
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(-9, 4);
    g.lineTo(-9, 31.5);
    g.lineTo(0, 24.8);
    g.lineTo(9, 31.5);
    g.lineTo(9, 4);
    g.stroke();
    // Heraldic charge: a small crowned shield.
    g.fillStyle = '#f2e6c8';
    g.beginPath();
    g.moveTo(-4.5, 10);
    g.lineTo(4.5, 10);
    g.lineTo(4.5, 15);
    g.quadraticCurveTo(4.5, 19.5, 0, 21.5);
    g.quadraticCurveTo(-4.5, 19.5, -4.5, 15);
    g.closePath();
    g.fill();
    g.fillStyle = shade(c, -0.2);
    g.fillRect(-0.8, 11, 1.6, 9);
    g.fillRect(-3.5, 13.5, 7, 1.6);
    g.fillStyle = GOLD;
    g.beginPath();
    g.moveTo(-3.5, 9.4);
    g.lineTo(-3.5, 6.6);
    g.lineTo(-1.6, 8.2);
    g.lineTo(0, 6);
    g.lineTo(1.6, 8.2);
    g.lineTo(3.5, 6.6);
    g.lineTo(3.5, 9.4);
    g.closePath();
    g.fill();
    // Rod with finials.
    g.fillStyle = vgrad(g, 0, 3.4, [[0, '#f2cf6a'], [1, '#8a6420']]);
    g.fillRect(-14, 0, 28, 3.2);
    g.fillStyle = GOLD;
    for (const fx of [-14.5, 14.5]) {
      g.beginPath();
      g.arc(fx, 1.6, 2.1, 0, Math.PI * 2);
      g.fill();
    }
  },
};

// --- Dining table: a laid banquet table with chairs and a candelabra. -------
const diningTable: PropArt = {
  origin: [0, 0],
  ink: '#3a2a1c',
  shadow: (g) => floorShadow(g, 2, 16, 54, 11),
  body: (g) => {
    const hw = 46;
    // Chairs (high-backed) down each long side.
    for (const cx of [-30, -10, 10, 30]) {
      for (const side of [-1, 1]) {
        const cy = side < 0 ? -21 : 18;
        g.fillStyle = vgrad(g, cy - 4, cy + 5, [[0, shade(WOOD, 0.05)], [1, shade(WOOD, -0.35)]]);
        rr(g, cx - 6, cy - 3, 12, 7, 1.5);
        g.fill();
        if (side < 0) {
          g.fillStyle = shade(WOOD, -0.15);
          rr(g, cx - 6, cy - 8, 12, 4, 1.2);
          g.fill();
          g.fillStyle = '#8e1f2d';
          g.fillRect(cx - 4, cy - 2, 8, 4);
        }
      }
    }
    // Tablecloth: top + hanging skirt with folds.
    g.fillStyle = vgrad(g, -14, 8, [[0, '#f4ede0'], [1, '#d6ccb8']]);
    rr(g, -hw, -14, hw * 2, 22, 4);
    g.fill();
    g.fillStyle = hgrad(g, -hw, hw, [
      [0, '#b8ae9a'], [0.1, '#d6ccb8'], [0.2, '#b8ae9a'], [0.3, '#d6ccb8'], [0.4, '#b8ae9a'], [0.5, '#d6ccb8'],
      [0.6, '#b8ae9a'], [0.7, '#d6ccb8'], [0.8, '#b8ae9a'], [0.9, '#d6ccb8'], [1, '#b8ae9a'],
    ]);
    g.beginPath();
    g.moveTo(-hw, 6);
    g.lineTo(hw, 6);
    g.lineTo(hw, 13);
    for (let i = 10; i >= 0; i--) g.quadraticCurveTo(-hw + (i + 0.5) * (hw / 5), 15.5, -hw + i * (hw / 5), 13);
    g.closePath();
    g.fill();
    // Crimson runner.
    g.fillStyle = '#8e1f2d';
    g.fillRect(-hw + 4, -5, hw * 2 - 8, 5);
    g.fillStyle = GOLD;
    g.fillRect(-hw + 4, -5, hw * 2 - 8, 0.7);
    g.fillRect(-hw + 4, -0.7, hw * 2 - 8, 0.7);
    // Place settings: pewter plates with food, goblets.
    const foods = ['#b5603a', '#8fae4a', '#d9a04a', '#b5603a'];
    [-32, -12, 12, 32].forEach((px, i) => {
      for (const py of [-9.5, 4]) {
        g.fillStyle = '#9aa2ac';
        g.beginPath();
        g.ellipse(px, py, 5, 3, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#c9d2dc';
        g.beginPath();
        g.ellipse(px - 0.6, py - 0.4, 3.6, 2, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = foods[(i + (py > 0 ? 1 : 0)) % foods.length];
        g.beginPath();
        g.ellipse(px, py - 0.3, 2.2, 1.3, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = GOLD;
      g.fillRect(px + 6, -4.5, 1.6, 3);
      g.beginPath();
      g.ellipse(px + 6.8, -4.6, 1.6, 0.8, 0, 0, Math.PI * 2);
      g.fill();
    });
    // Roast on a platter in the middle.
    g.fillStyle = '#c9d2dc';
    g.beginPath();
    g.ellipse(0, 3.5, 7, 3.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9a4a24';
    g.beginPath();
    g.ellipse(0, 2.8, 4.6, 2.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,220,180,0.4)';
    g.beginPath();
    g.ellipse(-1.2, 2, 2, 0.8, 0, 0, Math.PI * 2);
    g.fill();
    // Candelabra.
    g.strokeStyle = GOLD;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(0, -2);
    g.lineTo(0, -13);
    g.moveTo(-6, -11);
    g.quadraticCurveTo(-6, -14, 0, -13);
    g.quadraticCurveTo(6, -14, 6, -11);
    g.stroke();
    for (const fx of [-6, 0, 6]) {
      g.fillStyle = '#f2ead8';
      g.fillRect(fx - 0.8, fx === 0 ? -18 : -15, 1.6, 4);
    }
  },
  live: (g, t) => {
    flame(g, -6, -15, 1.1, t, 0.3);
    flame(g, 0, -18, 1.2, t, 1.7);
    flame(g, 6, -15, 1.1, t, 2.9);
  },
};

// --- Bed: a four-poster with a purple canopy. 2×2; origin = centroid. -------
const bed: PropArt = {
  origin: [H, H],
  ink: '#2a1830',
  shadow: (g) => floorShadow(g, 2, 38, 52, 12),
  body: (g) => {
    // Frame + mattress.
    g.fillStyle = vgrad(g, -12, 40, [[0, shade(WOOD, 0.05)], [1, shade(WOOD, -0.4)]]);
    rr(g, -44, -12, 88, 50, 5);
    g.fill();
    g.fillStyle = '#efe9dc';
    rr(g, -40, -10, 80, 42, 5);
    g.fill();
    // Quilt with diamond quilting and gold hem.
    g.fillStyle = vgrad(g, 6, 34, [[0, '#6a3480'], [1, '#43205a']]);
    rr(g, -40, 6, 80, 28, 5);
    g.fill();
    g.save();
    rr(g, -40, 6, 80, 28, 5);
    g.clip();
    g.strokeStyle = 'rgba(255,220,255,0.18)';
    g.lineWidth = 0.7;
    for (let x = -60; x < 60; x += 8) {
      g.beginPath();
      g.moveTo(x, 6);
      g.lineTo(x + 28, 34);
      g.moveTo(x + 28, 6);
      g.lineTo(x, 34);
      g.stroke();
    }
    g.restore();
    g.fillStyle = GOLD;
    g.fillRect(-40, 6, 80, 2.4);
    // Pillows.
    for (const px of [-22, 22]) {
      g.fillStyle = vgrad(g, -6, 6, [[0, '#ffffff'], [1, '#d8d2c6']]);
      rr(g, px - 15, -6, 30, 12, 5);
      g.fill();
      g.strokeStyle = 'rgba(160,150,140,0.5)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(px - 10, 0);
      g.quadraticCurveTo(px, 2, px + 10, 0);
      g.stroke();
    }
    // Posts.
    for (const px of [-44, 44]) {
      g.fillStyle = hgrad(g, px - 4, px + 4, [[0, shade(WOOD, 0.25)], [1, shade(WOOD, -0.35)]]);
      g.fillRect(px - 3.5, -44, 7, 82);
      g.fillStyle = GOLD;
      g.beginPath();
      g.arc(px, -45, 3.4, 0, Math.PI * 2);
      g.fill();
    }
    // Canopy + scalloped valance + tied-back curtains.
    g.fillStyle = vgrad(g, -46, -34, [[0, '#5a3478'], [1, '#3a1f52']]);
    g.fillRect(-48, -46, 96, 12);
    g.fillStyle = '#6a3a8a';
    g.beginPath();
    g.moveTo(-48, -34);
    for (let i = 0; i < 6; i++) g.quadraticCurveTo(-48 + (i + 0.5) * 16, -26, -48 + (i + 1) * 16, -34);
    g.closePath();
    g.fill();
    g.strokeStyle = GOLD;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-48, -46);
    g.lineTo(48, -46);
    g.stroke();
    for (const side of [-1, 1]) {
      g.fillStyle = hgrad(g, side * 46 - 4, side * 46 + 4, [[0, '#4a2a68'], [0.5, '#7a4a9a'], [1, '#3a1f52']]);
      g.beginPath();
      g.moveTo(side * 47, -34);
      g.quadraticCurveTo(side * 38, -10, side * 46, 14);
      g.lineTo(side * 49, 14);
      g.lineTo(side * 49, -34);
      g.closePath();
      g.fill();
      g.fillStyle = GOLD;
      g.fillRect(side * 44 - 2, -6, 5, 2);
    }
  },
};

// --- Chest: an iron-bound treasure chest spilling gold. ---------------------
const chest: PropArt = {
  origin: [0, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 1, 14, 19, 5),
  body: (g) => {
    // Lid thrown back.
    g.fillStyle = vgrad(g, -16, -4, [[0, shade(WOOD, 0.1)], [1, shade(WOOD, -0.25)]]);
    rr(g, -15, -16, 30, 10, 4);
    g.fill();
    g.fillStyle = '#4a4550';
    g.fillRect(-15, -12, 30, 1.6);
    // Body.
    planks(g, -16, -3, 32, 16, shade(WOOD, -0.05), false, 5.5, 41);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(-16, 9, 32, 4);
    // Iron bands + corner plates.
    g.fillStyle = '#4a4550';
    for (const bx of [-11, 9]) g.fillRect(bx, -3, 2.4, 16);
    g.fillStyle = '#6a6570';
    g.fillRect(-16, -3, 32, 1.4);
    // Lock plate.
    g.fillStyle = GOLD;
    rr(g, -3, 1, 6, 6, 1);
    g.fill();
    g.fillStyle = '#2a1a10';
    g.fillRect(-0.5, 3, 1, 2.4);
    // Heaped coins + gems.
    const coins: [number, number][] = [[-9, -5], [-4, -7], [1, -8], [6, -6], [10, -4], [-6, -3], [3, -4], [-1, -5]];
    for (const [cx, cy] of coins) {
      g.fillStyle = '#a97e26';
      g.beginPath();
      g.ellipse(cx, cy + 0.6, 2.8, 1.8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f2cf5b';
      g.beginPath();
      g.ellipse(cx, cy, 2.8, 1.8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff6c8';
      g.fillRect(cx - 1.2, cy - 0.8, 1, 0.6);
    }
    g.fillStyle = '#e0455a';
    g.beginPath();
    g.arc(-2, -7, 1.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4ad0e0';
    g.beginPath();
    g.arc(7, -5.6, 1.2, 0, Math.PI * 2);
    g.fill();
  },
  live: (g, t) => {
    // A slow treasure glint.
    const k = Math.max(0, Math.sin(t * 1.7) * 2 - 1.2);
    if (k <= 0) return;
    g.save();
    g.globalAlpha = k;
    g.strokeStyle = '#fffbe6';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(1, -11);
    g.lineTo(1, -5);
    g.moveTo(-2, -8);
    g.lineTo(4, -8);
    g.stroke();
    g.restore();
  },
};

// --- Gate: a barred arch in a stone wall. -----------------------------------
const gate: PropArt = {
  origin: [0, 0],
  ink: '#2a2a32',
  shadow: (g) => floorShadow(g, 0, 21, 22, 4),
  body: (g) => {
    masonry(g, -21, -22, 42, 43, STONE, 6, 77);
    // Arch voussoirs.
    g.fillStyle = shade(STONE, 0.12);
    g.beginPath();
    g.arc(0, -3, 16, Math.PI, 0);
    g.arc(0, -3, 13, 0, Math.PI, true);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 0.7;
    for (let i = 1; i < 7; i++) {
      const a = Math.PI + (i / 7) * Math.PI;
      g.beginPath();
      g.moveTo(Math.cos(a) * 13, -3 + Math.sin(a) * 13);
      g.lineTo(Math.cos(a) * 16, -3 + Math.sin(a) * 16);
      g.stroke();
    }
    // Dark interior with a faint far glow.
    const gr = g.createRadialGradient(0, 12, 1, 0, 6, 18);
    gr.addColorStop(0, '#3a2a20');
    gr.addColorStop(1, '#0c0a10');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-13, 21);
    g.lineTo(-13, -3);
    g.arc(0, -3, 13, Math.PI, 0);
    g.lineTo(13, 21);
    g.closePath();
    g.fill();
    // Portcullis.
    g.strokeStyle = '#6a6570';
    g.lineWidth = 1.8;
    for (const gx of [-8, -3, 2, 7]) {
      g.beginPath();
      g.moveTo(gx, -12);
      g.lineTo(gx, 19);
      g.stroke();
    }
    for (const gy of [-5, 3, 11]) {
      g.beginPath();
      g.moveTo(-12, gy);
      g.lineTo(12, gy);
      g.stroke();
    }
    g.fillStyle = '#9a959f';
    for (const gx of [-8, -3, 2, 7]) {
      g.beginPath();
      g.moveTo(gx - 1.2, 19);
      g.lineTo(gx, 22);
      g.lineTo(gx + 1.2, 19);
      g.fill();
    }
  },
};

// --- Barrel: bulging staves, iron hoops, a lit lid. ------------------------
const barrel: PropArt = {
  origin: [0, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 2, 16, 16, 5),
  body: (g) => {
    g.save();
    g.beginPath();
    g.moveTo(-11, -15);
    g.quadraticCurveTo(-16, 0, -11, 15);
    g.lineTo(11, 15);
    g.quadraticCurveTo(16, 0, 11, -15);
    g.closePath();
    g.fillStyle = hgrad(g, -14, 14, [[0, shade(WOOD, -0.1)], [0.3, shade(WOOD, 0.22)], [0.7, shade(WOOD, -0.05)], [1, shade(WOOD, -0.45)]]);
    g.fill();
    g.clip();
    g.strokeStyle = 'rgba(40,24,12,0.55)';
    g.lineWidth = 0.7;
    for (const sx of [-8, -4, 0, 4, 8]) {
      g.beginPath();
      g.moveTo(sx * 0.75, -15);
      g.quadraticCurveTo(sx * 1.15, 0, sx * 0.75, 15);
      g.stroke();
    }
    g.restore();
    for (const hy of [-10, 10]) {
      g.strokeStyle = '#2a2830';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(-14, hy);
      g.quadraticCurveTo(0, hy + 2.2, 14, hy);
      g.stroke();
      g.strokeStyle = 'rgba(220,210,230,0.4)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(-13, hy - 0.9);
      g.quadraticCurveTo(0, hy + 1.2, 13, hy - 0.9);
      g.stroke();
    }
    g.fillStyle = vgrad(g, -18, -12, [[0, shade(WOOD, 0.3)], [1, shade(WOOD, -0.1)]]);
    g.beginPath();
    g.ellipse(0, -15, 11, 3.6, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40,24,12,0.5)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(-6, -15.5);
    g.lineTo(6, -14.5);
    g.stroke();
  },
};

// --- Crate: braced boards. --------------------------------------------------
const crate: PropArt = {
  origin: [0, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 2, 15, 18, 5),
  body: (g) => {
    // Top face (seen slightly from above).
    g.fillStyle = shade(WOOD, 0.22);
    g.beginPath();
    g.moveTo(-15, -12);
    g.lineTo(-11, -17);
    g.lineTo(17, -17);
    g.lineTo(15, -12);
    g.closePath();
    g.fill();
    planks(g, -15, -12, 30, 27, WOOD, true, 6, 55);
    g.strokeStyle = shade(WOOD, -0.45);
    g.lineWidth = 2.6;
    g.strokeRect(-14, -11, 28, 25);
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(-13, -10);
    g.lineTo(13, 13);
    g.stroke();
    g.strokeStyle = shade(WOOD, 0.15);
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(-13, -11);
    g.lineTo(13, 12);
    g.stroke();
    g.fillStyle = '#2a2420';
    for (const [nx, ny] of [[-12, -9], [12, -9], [-12, 12], [12, 12]] as const) {
      g.beginPath();
      g.arc(nx, ny, 0.8, 0, Math.PI * 2);
      g.fill();
    }
  },
};

// --- Weapon rack: spears, a sword and a round shield. -----------------------
const weaponRack: PropArt = {
  origin: [0, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 2, 18, 17, 4),
  body: (g) => {
    const w = shade(WOOD, -0.15);
    g.fillStyle = hgrad(g, -15, -11, [[0, shade(w, 0.2)], [1, shade(w, -0.3)]]);
    g.fillRect(-15, -18, 4, 37);
    g.fillStyle = hgrad(g, 11, 15, [[0, shade(w, 0.2)], [1, shade(w, -0.3)]]);
    g.fillRect(11, -18, 4, 37);
    g.fillStyle = w;
    g.fillRect(-15, -18, 30, 4);
    g.fillRect(-15, 13, 30, 4);
    for (const sx of [-6, 0, 6]) {
      g.strokeStyle = '#7a5a2e';
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(sx, 14);
      g.lineTo(sx, -22);
      g.stroke();
      g.fillStyle = MATERIAL.steel;
      g.beginPath();
      g.moveTo(sx, -29);
      g.lineTo(sx - 2.8, -21);
      g.lineTo(sx + 2.8, -21);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillRect(sx - 0.4, -27, 0.8, 5);
    }
    // Round shield hung on the front.
    g.fillStyle = '#8e1f2d';
    g.beginPath();
    g.arc(0, 3, 7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = MATERIAL.steelDark;
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = GOLD;
    g.beginPath();
    g.arc(0, 3, 2, 0, Math.PI * 2);
    g.fill();
  },
};

// --- Bookshelf: a two-bay case of mismatched volumes. 2×1. ------------------
const bookshelf: PropArt = {
  origin: [H, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 2, 21, 44, 6),
  body: (g) => {
    const w = shade(WOOD, -0.2);
    g.fillStyle = vgrad(g, -26, 22, [[0, shade(w, 0.15)], [1, shade(w, -0.3)]]);
    rr(g, -40, -24, 80, 45, 2);
    g.fill();
    // Crown moulding.
    g.fillStyle = shade(w, 0.25);
    g.fillRect(-42, -27, 84, 4);
    g.fillStyle = '#20140c';
    g.fillRect(-36, -19, 72, 36);
    const r = rng(311);
    const bookCols = ['#7a2a2a', '#2a4a7a', '#2a6a3a', '#8a6a2a', '#5a2a6a', '#6a4a2a', '#3a5a6a'];
    for (let s = 0; s < 3; s++) {
      const shelfY = -19 + s * 12;
      let bx = -35;
      while (bx < 34) {
        if (Math.abs(bx) < 2.5) {
          bx = 2.5;
          continue;
        }
        const bw = 2.6 + r() * 2.4;
        const bh = 7.5 + r() * 3;
        const col = bookCols[Math.floor(r() * bookCols.length)];
        const lean = r() < 0.08;
        g.save();
        g.translate(bx, shelfY + 11);
        if (lean) g.rotate(0.25);
        g.fillStyle = hgrad(g, 0, bw, [[0, shade(col, 0.25)], [1, shade(col, -0.25)]]);
        g.fillRect(0, -bh, bw, bh);
        g.fillStyle = withAlpha(GOLD, 0.7);
        g.fillRect(0, -bh + 1.4, bw, 0.6);
        g.fillRect(0, -2.2, bw, 0.6);
        g.restore();
        bx += bw + 0.4 + (lean ? 1.5 : 0);
      }
      g.fillStyle = shade(w, 0.1);
      g.fillRect(-36, shelfY + 11, 72, 1.8);
    }
    g.fillStyle = shade(w, 0.05);
    g.fillRect(-1.5, -19, 3, 36);
  },
};

// --- Statue: a weathered stone knight on a plinth. 1×2. ---------------------
const statue: PropArt = {
  origin: [0, H],
  ink: '#3a3a44',
  shadow: (g) => floorShadow(g, 3, 40, 22, 6),
  body: (g) => {
    const st = '#9aa0a8';
    // Plinth with plaque.
    g.fillStyle = hgrad(g, -16, 16, [[0, shade(st, 0.1)], [1, shade(st, -0.35)]]);
    g.fillRect(-16, 20, 32, 19);
    g.fillStyle = shade(st, 0.25);
    g.fillRect(-19, 16, 38, 5);
    g.fillStyle = shade(st, -0.25);
    g.fillRect(-18, 37, 36, 4);
    g.fillStyle = withAlpha(GOLD, 0.8);
    g.fillRect(-7, 25, 14, 6);
    g.fillStyle = 'rgba(60,40,10,0.6)';
    g.fillRect(-5, 27.4, 10, 0.6);
    // Knight: cloak, body, helm, grounded greatsword.
    g.fillStyle = hgrad(g, -12, 12, [[0, shade(st, 0.2)], [0.4, st], [1, shade(st, -0.35)]]);
    g.beginPath();
    g.moveTo(-11, 16);
    g.quadraticCurveTo(-12, -2, -7, -14);
    g.lineTo(7, -14);
    g.quadraticCurveTo(12, -2, 11, 16);
    g.closePath();
    g.fill();
    g.fillStyle = shade(st, -0.1);
    g.beginPath();
    g.ellipse(-7, -13, 4, 2.6, -0.3, 0, Math.PI * 2);
    g.ellipse(7, -13, 4, 2.6, 0.3, 0, Math.PI * 2);
    g.fill();
    // Helm.
    g.fillStyle = vgrad(g, -28, -14, [[0, shade(st, 0.25)], [1, shade(st, -0.2)]]);
    rr(g, -5.5, -27, 11, 13, 4);
    g.fill();
    g.fillStyle = shade(st, -0.5);
    g.fillRect(-4, -22, 8, 1.2);
    g.fillRect(-0.5, -22, 1, 5);
    // Sword: crossguard at the hands, blade to the plinth.
    g.fillStyle = shade(st, 0.15);
    g.fillRect(-1.4, -6, 2.8, 22);
    g.fillRect(-6, -7, 12, 2.4);
    g.fillStyle = shade(st, -0.3);
    g.beginPath();
    g.arc(0, -9, 2, 0, Math.PI * 2);
    g.fill();
    // Weathering: moss at the base, streaks.
    const r = rng(907);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = withAlpha(r() < 0.5 ? '#5f7a3a' : '#7a9a4a', 0.5);
      g.beginPath();
      g.arc(-16 + r() * 32, 36 + r() * 4, 0.8 + r() * 1.4, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(30,30,40,0.22)';
    g.lineWidth = 0.8;
    for (const sx of [-6, 3, 8]) {
      g.beginPath();
      g.moveTo(sx, -10);
      g.lineTo(sx + 0.5, 10);
      g.stroke();
    }
  },
};

// --- Fountain: a tiered stone fountain with running water. 2×2. -------------
const fountain: PropArt = {
  origin: [H, H],
  ink: '#2a3a48',
  shadow: (g) => floorShadow(g, 2, 26, 46, 14),
  body: (g) => {
    const st = '#a4a8b0';
    // Basin rim (outer wall, lit top).
    g.fillStyle = vgrad(g, -12, 32, [[0, shade(st, 0.2)], [1, shade(st, -0.45)]]);
    g.beginPath();
    g.ellipse(0, 12, 42, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(st, 0.3);
    g.beginPath();
    g.ellipse(0, 8, 42, 20, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40,40,50,0.35)';
    g.lineWidth = 0.7;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 36, 8 + Math.sin(a) * 16.5);
      g.lineTo(Math.cos(a) * 42, 8 + Math.sin(a) * 20);
      g.stroke();
    }
    // Water.
    const wg = g.createRadialGradient(-8, 4, 2, 0, 8, 38);
    wg.addColorStop(0, '#7ac4e0');
    wg.addColorStop(0.6, '#3f88ad');
    wg.addColorStop(1, '#22506a');
    g.fillStyle = wg;
    g.beginPath();
    g.ellipse(0, 8, 35, 16, 0, 0, Math.PI * 2);
    g.fill();
    // Pedestal + upper bowl.
    g.fillStyle = hgrad(g, -6, 6, [[0, shade(st, 0.25)], [1, shade(st, -0.35)]]);
    g.fillRect(-5, -16, 10, 24);
    g.fillStyle = vgrad(g, -22, -12, [[0, shade(st, 0.3)], [1, shade(st, -0.3)]]);
    g.beginPath();
    g.ellipse(0, -17, 16, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5aa8cc';
    g.beginPath();
    g.ellipse(0, -18, 12.5, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(st, 0.2);
    g.fillRect(-2, -28, 4, 10);
    g.beginPath();
    g.arc(0, -29, 2.8, 0, Math.PI * 2);
    g.fill();
  },
  live: (g, t) => {
    g.save();
    // Spout arcs with travelling droplets.
    g.strokeStyle = 'rgba(200,236,250,0.75)';
    g.lineWidth = 1.4;
    for (const dir of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, -30);
      g.quadraticCurveTo(dir * 13, -38, dir * 15, -18);
      g.stroke();
      for (let i = 0; i < 3; i++) {
        const k = (t * 1.6 + i / 3) % 1;
        const x = dir * (2 * k * (1 - k) * 13 * 2 * 0.5 + k * k * 15);
        const y = (1 - k) * (1 - k) * -30 + 2 * (1 - k) * k * -38 + k * k * -18;
        g.fillStyle = 'rgba(230,248,255,0.9)';
        g.beginPath();
        g.arc(x, y, 0.9, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Spill from the upper bowl into the basin.
    g.strokeStyle = 'rgba(190,230,245,0.55)';
    g.lineWidth = 1;
    for (const dx of [-11, -5, 5, 11]) {
      g.beginPath();
      g.moveTo(dx * 1.1, -15);
      g.lineTo(dx * 1.6, 2 + Math.sin(t * 6 + dx) * 0.5);
      g.stroke();
    }
    // Expanding ripples.
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.45 + i / 3) % 1;
      g.strokeStyle = `rgba(220,245,255,${0.45 * (1 - k)})`;
      g.lineWidth = 0.8;
      g.beginPath();
      g.ellipse(0, 8, 14 + k * 20, 6 + k * 9, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  },
};

// --- House: timber-framed cottage on a stone footing. 3×2. ------------------
const house: PropArt = {
  origin: [T, H],
  ink: '#3a2418',
  shadow: (g) => {
    floorShadow(g, 6, 46, 72, 14, 0.5);
  },
  body: (g) => {
    const plaster = '#e4d2a8';
    const beam = '#5a3a24';
    // Chimney stack (behind roof).
    masonry(g, 26, -64, 15, 36, '#8a5a40', 4, 13);
    g.fillStyle = '#4a3020';
    g.fillRect(24, -66, 19, 4);
    // Stone footing.
    masonry(g, -55, 32, 110, 13, STONE_WARM, 4.3, 21);
    // Plaster walls with a soft vertical light gradient + texture speckle.
    g.fillStyle = hgrad(g, -54, 54, [[0, shade(plaster, 0.08)], [0.6, plaster], [1, shade(plaster, -0.2)]]);
    g.fillRect(-54, -10, 108, 43);
    const r = rng(5);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(120,90,50,0.08)' : 'rgba(255,255,255,0.1)';
      g.fillRect(-54 + r() * 108, -10 + r() * 43, 1 + r() * 2, 1 + r() * 2);
    }
    // Timber framing.
    g.strokeStyle = beam;
    g.lineWidth = 3.4;
    g.strokeRect(-54, -10, 108, 43);
    g.beginPath();
    g.moveTo(-54, 14);
    g.lineTo(54, 14);
    g.moveTo(-20, -10);
    g.lineTo(-20, 33);
    g.moveTo(20, -10);
    g.lineTo(20, 33);
    g.moveTo(-54, -10);
    g.lineTo(-30, 14);
    g.moveTo(54, -10);
    g.lineTo(30, 14);
    g.stroke();
    g.strokeStyle = 'rgba(255,220,180,0.25)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-53, 12.6);
    g.lineTo(53, 12.6);
    g.stroke();
    // Windows with shutters + flower boxes.
    litWindow(g, -42, -3, 15, 13, beam, { shutters: '#3f6a4a', box: true });
    litWindow(g, 27, -3, 15, 13, beam, { shutters: '#3f6a4a', box: true });
    // Door: arched planks, iron straps, step and a lantern.
    g.fillStyle = shade(beam, -0.2);
    g.beginPath();
    g.moveTo(-11, 33);
    g.lineTo(-11, 19);
    g.arc(0, 19, 11, Math.PI, 0);
    g.lineTo(11, 33);
    g.closePath();
    g.fill();
    g.save();
    g.beginPath();
    g.moveTo(-9, 33);
    g.lineTo(-9, 19);
    g.arc(0, 19, 9, Math.PI, 0);
    g.lineTo(9, 33);
    g.closePath();
    g.clip();
    planks(g, -9, 9, 18, 24, '#7a4a2a', true, 4.5, 8);
    g.restore();
    g.fillStyle = '#2a2420';
    g.fillRect(-9, 21, 18, 1.4);
    g.fillRect(-9, 28, 18, 1.4);
    g.fillStyle = GOLD;
    g.beginPath();
    g.arc(5, 26, 1.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(STONE_WARM, 0.15);
    g.fillRect(-13, 33, 26, 3);
    // Roof: two shingled planes meeting at the ridge, deep eaves.
    shingleRoof(g, [[-64, -8], [0, -60], [64, -8]], '#8a3a30', 5, 3);
    g.strokeStyle = '#3f1714';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(-64, -8);
    g.lineTo(0, -60);
    g.lineTo(64, -8);
    g.stroke();
    g.strokeStyle = 'rgba(255,200,170,0.4)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-62, -9.5);
    g.lineTo(0, -58.5);
    g.stroke();
    // Eave shadow on the wall.
    g.fillStyle = 'rgba(30,15,10,0.35)';
    g.beginPath();
    g.moveTo(-54, -10);
    g.lineTo(54, -10);
    g.lineTo(54, -6);
    g.lineTo(-54, -6);
    g.closePath();
    g.fill();
  },
};

// --- Castle: keep, curtain wall, slate-capped towers, gate + torches. 3×3. ---
const castle: PropArt = {
  origin: [T, T],
  ink: '#2a2a36',
  shadow: (g) => floorShadow(g, 8, 62, 84, 16, 0.55),
  body: (g) => {
    const st = '#9096a2';
    const cren = (left: number, top: number, width: number, n: number, mh: number, col: string) => {
      const step = width / (n * 2 - 1);
      for (let i = 0; i < n; i++) {
        const x = left + i * step * 2;
        g.fillStyle = vgrad(g, top, top + mh, [[0, shade(col, 0.2)], [1, shade(col, -0.15)]]);
        g.fillRect(x, top, step, mh);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x, top, step, 1);
      }
    };
    // Curtain wall.
    masonry(g, -58, -6, 116, 66, st, 6, 201);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(-58, -6, 116, 66);
    cren(-58, -15, 116, 9, 9, st);
    // Keep.
    masonry(g, -26, -50, 52, 110, shade(st, 0.06), 6, 203);
    g.fillStyle = hgrad(g, -26, 26, [[0, 'rgba(255,240,220,0.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(10,10,30,0.3)']]);
    g.fillRect(-26, -50, 52, 110);
    cren(-28, -60, 56, 4, 10, st);
    // Towers with conical slate roofs + pennants.
    for (const tx of [-60, 34]) {
      masonry(g, tx, -40, 26, 100, shade(st, -0.02), 6, 207 + tx);
      g.fillStyle = hgrad(g, tx, tx + 26, [[0, 'rgba(255,240,220,0.14)'], [1, 'rgba(10,10,30,0.35)']]);
      g.fillRect(tx, -40, 26, 100);
      g.fillStyle = shade(st, -0.25);
      g.fillRect(tx - 2, -44, 30, 5);
      shingleRoof(g, [[tx - 4, -43], [tx + 13, -76], [tx + 30, -43]], '#3a4a6a', 4, 9 + tx);
      g.strokeStyle = GOLD;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(tx + 13, -76);
      g.lineTo(tx + 13, -88);
      g.stroke();
      g.fillStyle = '#8e1f2d';
      g.beginPath();
      g.moveTo(tx + 13, -88);
      g.quadraticCurveTo(tx + 20, -87, tx + 25, -84);
      g.lineTo(tx + 13, -81);
      g.closePath();
      g.fill();
      // Arrow slit with a faint warm light.
      g.fillStyle = '#1a1418';
      g.fillRect(tx + 11, -28, 4, 12);
      g.fillStyle = 'rgba(255,190,100,0.7)';
      g.fillRect(tx + 12, -24, 2, 5);
    }
    // Keep windows (lit) + banner.
    litWindow(g, -5, -36, 10, 13, '#2a2420', { arch: true });
    litWindow(g, -5, -13, 10, 12, '#2a2420', { arch: true });
    g.strokeStyle = GOLD;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(0, -60);
    g.lineTo(0, -80);
    g.stroke();
    g.fillStyle = '#8e1f2d';
    g.beginPath();
    g.moveTo(0, -80);
    g.quadraticCurveTo(10, -79, 20, -74);
    g.lineTo(0, -69);
    g.closePath();
    g.fill();
    // Gatehouse arch + portcullis.
    g.fillStyle = shade(st, 0.15);
    g.beginPath();
    g.moveTo(-20, 60);
    g.lineTo(-20, 18);
    g.arc(0, 18, 20, Math.PI, 0);
    g.lineTo(20, 60);
    g.closePath();
    g.fill();
    const gr = g.createRadialGradient(0, 50, 2, 0, 40, 26);
    gr.addColorStop(0, '#4a3020');
    gr.addColorStop(1, '#0c0a10');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-16, 60);
    g.lineTo(-16, 18);
    g.arc(0, 18, 16, Math.PI, 0);
    g.lineTo(16, 60);
    g.closePath();
    g.fill();
    g.strokeStyle = '#6a6570';
    g.lineWidth = 2;
    for (const gx of [-10, -3.3, 3.3, 10]) {
      g.beginPath();
      g.moveTo(gx, 4);
      g.lineTo(gx, 46);
      g.stroke();
    }
    for (const gy of [14, 26, 38]) {
      g.beginPath();
      g.moveTo(-15, gy);
      g.lineTo(15, gy);
      g.stroke();
    }
    // Wall torches flanking the gate (flames are live).
    for (const tx of [-24, 24]) {
      g.strokeStyle = IRON;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(tx, 42);
      g.lineTo(tx, 36);
      g.stroke();
      ironCup(g, tx, 36, 3.2);
    }
  },
  live: (g, t) => {
    flame(g, -24, 34, 2.6, t, 0.6);
    flame(g, 24, 34, 2.6, t, 2.2);
  },
};

// --- Burning castle: the same keep, sacked. 3×3. ----------------------------
// The right tower's top has collapsed into a fire-filled shell, the left
// tower's roof is burnt through, the keep's upper window is blown out, the
// banners are charred rags and the gate glows from the blaze behind it.
// Stone is dulled by smoke and every opening carries a soot streak.
const BURN_HOT = '#ffb347';
const BURN_CORE = '#ff5a1e';
const burningCastle: PropArt = {
  origin: [T, T],
  ink: '#1e181c',
  shadow: (g) => {
    floorShadow(g, 8, 62, 84, 16, 0.6);
    floorShadow(g, 54, 64, 26, 7, 0.5);
  },
  body: (g) => {
    const st = '#80838d';
    const poly = (pts: [number, number][]) => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
    };
    /** Masonry clipped to an arbitrary (jagged) outline. */
    const wall = (pts: [number, number][], base: string, seed: number) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      g.save();
      poly(pts);
      g.clip();
      masonry(g, x0, y0, x1 - x0, y1 - y0, base, 6, seed);
      g.restore();
    };
    /** A soot plume licking up the wall from an opening. */
    const soot = (cx: number, y: number, w: number, h: number, a = 0.6) => {
      g.fillStyle = vgrad(g, y - h, y, [[0, 'rgba(14,10,10,0)'], [0.55, `rgba(14,10,10,${a * 0.6})`], [1, `rgba(14,10,10,${a})`]]);
      g.beginPath();
      g.moveTo(cx - w / 2, y);
      g.quadraticCurveTo(cx - w * 0.7, y - h * 0.5, cx - w * 0.15, y - h);
      g.quadraticCurveTo(cx + w * 0.1, y - h * 0.7, cx + w * 0.25, y - h * 0.95);
      g.quadraticCurveTo(cx + w * 0.75, y - h * 0.45, cx + w / 2, y);
      g.closePath();
      g.fill();
    };
    /** Hairline crack: a zigzag of dark mortar with a lit lower lip. */
    const crack = (pts: [number, number][]) => {
      for (const [col, w, dy] of [['rgba(10,8,12,0.75)', 1.1, 0], ['rgba(255,235,210,0.18)', 0.6, 0.9]] as const) {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1] + dy);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1] + dy);
        g.stroke();
      }
    };
    /** An opening glowing with the fire inside (hot bottom, ember-red rim). */
    const fireHole = (pts: [number, number][], cx: number, cy: number, r: number) => {
      g.fillStyle = '#120a0a';
      poly(pts);
      g.fill();
      const gr = g.createRadialGradient(cx, cy + r * 0.4, 0.5, cx, cy, r);
      gr.addColorStop(0, '#fff0b8');
      gr.addColorStop(0.3, BURN_HOT);
      gr.addColorStop(0.7, BURN_CORE);
      gr.addColorStop(1, 'rgba(90,20,10,0.9)');
      g.save();
      poly(pts);
      g.clip();
      g.fillStyle = gr;
      g.fillRect(cx - r * 1.5, cy - r * 1.5, r * 3, r * 3);
      g.restore();
      g.strokeStyle = '#2a1410';
      g.lineWidth = 1.2;
      poly(pts);
      g.stroke();
    };
    /** A charred beam end poking out of the ruin. */
    const beam = (x0: number, y0: number, x1: number, y1: number, w: number) => {
      g.strokeStyle = '#1a1210';
      g.lineWidth = w;
      g.lineCap = 'butt';
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      // Smouldering tip.
      g.fillStyle = BURN_CORE;
      g.beginPath();
      g.arc(x1, y1, w * 0.45, 0, Math.PI * 2);
      g.fill();
    };
    const cren = (left: number, top: number, width: number, n: number, mh: number, col: string, skip: number[] = [], chip: number[] = []) => {
      const step = width / (n * 2 - 1);
      for (let i = 0; i < n; i++) {
        if (skip.includes(i)) continue;
        const x = left + i * step * 2;
        const h = chip.includes(i) ? mh * 0.45 : mh;
        const y = top + (mh - h);
        g.fillStyle = vgrad(g, y, top + mh, [[0, shade(col, 0.15)], [1, shade(col, -0.2)]]);
        if (chip.includes(i)) {
          poly([[x, top + mh], [x, y], [x + step * 0.4, y - 2], [x + step, y + 1.5], [x + step, top + mh]]);
          g.fill();
        } else {
          g.fillRect(x, y, step, h);
          g.fillStyle = 'rgba(255,255,255,0.12)';
          g.fillRect(x, y, step, 1);
        }
      }
    };

    // Curtain wall, its walk broken where the right tower fell.
    masonry(g, -58, -6, 116, 66, st, 6, 201);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(-58, -6, 116, 66);
    cren(-58, -15, 116, 9, 9, st, [6, 7], [5]);

    // Left tower: standing, but its slate roof is burnt through.
    const lx = -60;
    masonry(g, lx, -40, 26, 100, shade(st, -0.02), 6, 207 + lx);
    g.fillStyle = hgrad(g, lx, lx + 26, [[0, 'rgba(255,240,220,0.1)'], [1, 'rgba(10,10,30,0.38)']]);
    g.fillRect(lx, -40, 26, 100);
    g.fillStyle = shade(st, -0.3);
    g.fillRect(lx - 2, -44, 30, 5);
    shingleRoof(g, [[lx - 4, -43], [lx + 13, -76], [lx + 30, -43]], '#2e3442', 4, 9 + lx);
    // Scorch creeping over the slates from the hole.
    g.fillStyle = vgrad(g, -76, -43, [[0, 'rgba(12,8,8,0.15)'], [1, 'rgba(12,8,8,0.55)']]);
    poly([[lx - 4, -43], [lx + 13, -76], [lx + 30, -43]]);
    g.fill();
    fireHole([[lx + 14, -45], [lx + 12, -52], [lx + 16, -58], [lx + 19, -55], [lx + 22, -61], [lx + 26, -50], [lx + 27, -45]], lx + 20, -49, 9);
    // Exposed rafters across the hole.
    g.strokeStyle = '#1a1210';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(lx + 13, -66);
    g.lineTo(lx + 25, -46);
    g.moveTo(lx + 14, -50);
    g.lineTo(lx + 28, -52);
    g.stroke();
    // Charred pennant: a bent pole and a rag.
    g.strokeStyle = '#6a5a3a';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(lx + 13, -76);
    g.lineTo(lx + 13, -82);
    g.lineTo(lx + 9, -87);
    g.stroke();
    g.fillStyle = '#3a1418';
    poly([[lx + 9, -87], [lx + 14, -86], [lx + 12, -84], [lx + 16, -82.5], [lx + 10.5, -82]]);
    g.fill();
    // Dark arrow slit, soot above it.
    soot(lx + 13, -24, 10, 16, 0.45);
    g.fillStyle = '#120c0e';
    g.fillRect(lx + 11, -28, 4, 12);
    g.fillStyle = BURN_CORE;
    g.fillRect(lx + 12, -21, 2, 3);
    crack([[lx + 4, -34], [lx + 8, -26], [lx + 6, -18], [lx + 10, -8], [lx + 8, 2]]);

    // Right tower: its top has collapsed — a broken shell with the back wall
    // standing higher than the front, a fire burning in the hollow between.
    const rx = 34;
    wall([[rx, 60], [rx, -24], [rx + 4, -30], [rx + 8, -27], [rx + 12, -38], [rx + 17, -34], [rx + 21, -42], [rx + 26, -36], [rx + 26, 60]], shade(st, -0.32), 215);
    g.fillStyle = vgrad(g, -42, -8, [[0, 'rgba(255,120,40,0.15)'], [1, 'rgba(255,150,60,0.55)']]);
    poly([[rx, -24], [rx + 4, -30], [rx + 8, -27], [rx + 12, -38], [rx + 17, -34], [rx + 21, -42], [rx + 26, -36], [rx + 26, -8], [rx, -8]]);
    g.fill();
    beam(rx + 5, -12, rx - 3, -32, 2.4);
    beam(rx + 18, -12, rx + 28, -29, 2);
    const front: [number, number][] = [[rx, 60], [rx, -12], [rx + 3, -16], [rx + 6, -13], [rx + 10, -21], [rx + 14, -17], [rx + 17, -24], [rx + 20, -19], [rx + 23, -22], [rx + 26, -15], [rx + 26, 60]];
    wall(front, shade(st, -0.02), 207 + rx);
    g.save();
    poly(front);
    g.clip();
    g.fillStyle = hgrad(g, rx, rx + 26, [[0, 'rgba(255,240,220,0.1)'], [1, 'rgba(10,10,30,0.38)']]);
    g.fillRect(rx, -30, 26, 90);
    // Fire-glow on the broken lip, soot down from it.
    g.fillStyle = vgrad(g, -24, -2, [[0, 'rgba(255,130,50,0.55)'], [0.35, 'rgba(20,12,10,0.6)'], [1, 'rgba(20,12,10,0)']]);
    g.fillRect(rx, -26, 26, 26);
    g.restore();
    // Arrow slit blown wide.
    fireHole([[rx + 10, -2], [rx + 9.5, 6], [rx + 11, 12], [rx + 16, 11], [rx + 16.5, 3], [rx + 15, -3]], rx + 13, 6, 7);
    crack([[rx + 20, -18], [rx + 18, -8], [rx + 22, 2], [rx + 19, 14], [rx + 23, 26]]);
    crack([[rx + 3, 18], [rx + 7, 26], [rx + 5, 34]]);

    // Keep: chipped crenels, upper window blown out into a burning breach.
    masonry(g, -26, -50, 52, 110, shade(st, 0.04), 6, 203);
    g.fillStyle = hgrad(g, -26, 26, [[0, 'rgba(255,240,220,0.08)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(10,10,30,0.34)']]);
    g.fillRect(-26, -50, 52, 110);
    cren(-28, -60, 56, 4, 10, st, [2], [1]);
    soot(0, -38, 30, 26, 0.75);
    soot(0, -12, 18, 14, 0.6);
    fireHole([[-8, -22], [-9, -31], [-6, -36], [-3, -41], [2, -39], [4, -42], [8, -35], [9, -27], [7, -22]], 0, -29, 12);
    beam(-6, -24, -12, -30, 1.6);
    // Lower window: glass gone, mullion snapped, fire behind.
    fireHole([[-5, -1], [-5, -8], [-3.5, -11.5], [0, -13], [3.5, -11.5], [5, -8], [5, -1]], 0, -5, 8);
    g.strokeStyle = '#2a2420';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(0, -1);
    g.lineTo(0, -6);
    g.moveTo(-5, -6);
    g.lineTo(-1.5, -6.5);
    g.stroke();
    g.fillStyle = shade('#2a2420', 0.25);
    g.fillRect(-7, -1, 14, 1.6);
    crack([[-22, -46], [-18, -38], [-20, -30], [-15, -20]]);
    crack([[14, -48], [12, -40], [17, -33], [15, -25], [19, -16]]);
    // Keep banner burnt to tatters on a snapped pole.
    g.strokeStyle = '#6a5a3a';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(0, -60);
    g.lineTo(0, -72);
    g.lineTo(5, -77);
    g.stroke();
    g.fillStyle = '#4a1820';
    poly([[0, -71], [6, -70.5], [4, -68], [9, -66], [3, -65], [5, -62.5], [0, -63]]);
    g.fill();
    g.fillStyle = BURN_CORE;
    g.fillRect(8, -66.5, 1.2, 1);

    // Gatehouse: the arch scorched, the blaze roaring beyond it, the
    // portcullis half-raised and buckled.
    g.fillStyle = shade(st, 0.08);
    g.beginPath();
    g.moveTo(-20, 60);
    g.lineTo(-20, 18);
    g.arc(0, 18, 20, Math.PI, 0);
    g.lineTo(20, 60);
    g.closePath();
    g.fill();
    soot(0, 6, 34, 22, 0.7);
    const gr = g.createRadialGradient(0, 58, 2, 0, 44, 30);
    gr.addColorStop(0, '#ffe7a0');
    gr.addColorStop(0.3, BURN_HOT);
    gr.addColorStop(0.65, '#c2381a');
    gr.addColorStop(1, '#1a0a0a');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-16, 60);
    g.lineTo(-16, 18);
    g.arc(0, 18, 16, Math.PI, 0);
    g.lineTo(16, 60);
    g.closePath();
    g.fill();
    g.save();
    g.beginPath();
    g.moveTo(-16, 60);
    g.lineTo(-16, 18);
    g.arc(0, 18, 16, Math.PI, 0);
    g.lineTo(16, 60);
    g.closePath();
    g.clip();
    g.strokeStyle = '#2a2428';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-10, 2);
    g.lineTo(-10, 26);
    g.moveTo(-3.3, 2);
    g.lineTo(-3.3, 29);
    g.moveTo(3.3, 2);
    g.quadraticCurveTo(4, 18, 9, 30);
    g.moveTo(10, 2);
    g.lineTo(10, 14);
    g.moveTo(-15, 14);
    g.lineTo(15, 14);
    g.moveTo(-15, 24);
    g.lineTo(5, 25);
    g.stroke();
    g.restore();
    // Torch sconces knocked askew, cold.
    for (const [tx, tilt] of [[-24, -0.5], [24, 0.35]] as const) {
      g.save();
      g.translate(tx, 42);
      g.rotate(tilt);
      g.strokeStyle = IRON;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -6);
      g.stroke();
      ironCup(g, 0, -6, 3.2);
      g.restore();
    }

    // Rubble from the fallen tower top, spilling past the wall foot.
    const r = rng(431);
    for (let i = 0; i < 16; i++) {
      const bx = rx - 6 + r() * 42;
      const by = 52 + r() * 10 - Math.max(0, 1 - Math.abs(bx - (rx + 13)) / 24) * 8;
      const bw = 4 + r() * 6;
      const bh = 3 + r() * 4;
      const tone = shade(st, (r() - 0.5) * 0.25 - 0.05);
      g.save();
      g.translate(bx, by);
      g.rotate((r() - 0.5) * 0.9);
      g.fillStyle = tone;
      rr(g, -bw / 2, -bh / 2, bw, bh, 1);
      g.fill();
      g.fillStyle = withAlpha(shade(tone, 0.35), 0.6);
      g.fillRect(-bw / 2 + 0.6, -bh / 2 + 0.4, bw - 1.2, 0.8);
      g.restore();
    }
    beam(rx - 2, 60, rx + 14, 50, 2.2);

    // Smoke has dulled the whole pile: darken toward the burning upper storeys.
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = vgrad(g, -90, 64, [[0, 'rgba(18,12,12,0.4)'], [0.55, 'rgba(18,12,12,0.12)'], [1, 'rgba(60,24,12,0.18)']]);
    g.fillRect(-72, -92, 150, 160);
    g.restore();
  },
  live: (g, t) => {
    // Pulsing fire-glow through every opening.
    const pulse = 0.75 + 0.25 * Math.sin(t * 6.3) * Math.sin(t * 3.7 + 1);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, rad] of [[0, -30, 16], [0, 42, 22], [47, -18, 20], [-40, -50, 12], [47, 5, 9]] as const) {
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(255,150,60,${0.32 * pulse})`);
      gr.addColorStop(1, 'rgba(255,90,30,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.restore();
    // The blaze in the fallen tower's shell.
    flame(g, 39, -16, 6.5, t, 0.3);
    flame(g, 47, -20, 8.5, t, 1.7);
    flame(g, 55, -15, 6, t, 4.1);
    // Through the left tower's roof.
    flame(g, -40, -50, 4.5, t, 2.9);
    flame(g, -36, -48, 3.2, t, 5.2);
    // Out of the keep's breach, licking up the wall.
    flame(g, -2, -24, 5.5, t, 0.9);
    flame(g, 3, -25, 4, t, 3.4);
    // Behind the gate.
    flame(g, -8, 60, 5.5, t, 2.2);
    flame(g, 2, 60, 7, t, 4.6);
    flame(g, 10, 60, 4.5, t, 1.1);
    // Smouldering rubble.
    flame(g, 30, 58, 2.6, t, 3.8);
    flame(g, 58, 60, 2.2, t, 0.5);
  },
};

// --- Well: stone ring, shingled hood, winch and bucket. ---------------------
const well: PropArt = {
  origin: [0, 0],
  ink: '#2a2a32',
  shadow: (g) => floorShadow(g, 3, 20, 24, 7),
  body: (g) => {
    // Ring wall.
    g.save();
    g.beginPath();
    g.ellipse(0, 12, 20, 10, 0, 0, Math.PI);
    g.lineTo(-20, 4);
    g.ellipse(0, 4, 20, 8, 0, Math.PI, 0, false);
    g.closePath();
    g.clip();
    masonry(g, -21, -6, 42, 30, STONE, 4, 61);
    g.restore();
    g.fillStyle = shade(STONE, 0.3);
    g.beginPath();
    g.ellipse(0, 4, 20, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0c1018';
    g.beginPath();
    g.ellipse(0, 4.5, 15, 5.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(80,140,180,0.35)';
    g.beginPath();
    g.ellipse(-2, 5.5, 8, 2.4, 0, 0, Math.PI * 2);
    g.fill();
    // Posts + winch + bucket.
    for (const px of [-17, 13]) {
      g.fillStyle = hgrad(g, px, px + 4, [[0, shade(WOOD, 0.2)], [1, shade(WOOD, -0.35)]]);
      g.fillRect(px, -30, 4, 36);
    }
    g.fillStyle = shade(WOOD, -0.2);
    g.fillRect(-15, -22, 30, 3);
    g.strokeStyle = '#c9b48c';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(0, -19);
    g.lineTo(0, -8);
    g.stroke();
    g.fillStyle = vgrad(g, -9, -1, [[0, shade(WOOD, 0.15)], [1, shade(WOOD, -0.3)]]);
    rr(g, -5, -8, 10, 8, 1.5);
    g.fill();
    g.fillStyle = '#3a3640';
    g.fillRect(-5, -6, 10, 1);
    // Hood.
    shingleRoof(g, [[-26, -27], [0, -47], [26, -27]], '#8a3a30', 4, 17);
    g.strokeStyle = '#3f1714';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-26, -27);
    g.lineTo(0, -47);
    g.lineTo(26, -27);
    g.stroke();
  },
};

// --- Market stall: striped awning over a produce-laden counter. 2×1. --------
const marketStall: PropArt = {
  origin: [H, 0],
  ink: '#3a2418',
  shadow: (g) => floorShadow(g, 3, 20, 44, 7),
  body: (g) => {
    for (const px of [-38, 33]) {
      g.fillStyle = hgrad(g, px, px + 5, [[0, shade(WOOD, 0.2)], [1, shade(WOOD, -0.35)]]);
      g.fillRect(px, -32, 5, 50);
    }
    // Back cloth.
    g.fillStyle = 'rgba(80,50,40,0.6)';
    g.fillRect(-33, -20, 66, 22);
    // Counter.
    g.fillStyle = vgrad(g, 2, 18, [[0, shade(WOOD, 0.2)], [1, shade(WOOD, -0.35)]]);
    rr(g, -40, 2, 80, 16, 2);
    g.fill();
    planks(g, -40, 6, 80, 12, shade(WOOD, -0.1), true, 8, 71);
    // Produce baskets.
    const heap = (hx: number, col: string) => {
      g.fillStyle = '#8a6a3a';
      g.beginPath();
      g.ellipse(hx, 2, 9, 3.5, 0, 0, Math.PI * 2);
      g.fill();
      for (const [dx, dy] of [[-4, -1], [4, -1], [0, -4], [-2, -2], [2, -2], [-6, 0], [6, 0]] as const) {
        g.fillStyle = shade(col, -0.2);
        g.beginPath();
        g.arc(hx + dx, dy + 0.4, 2.7, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = col;
        g.beginPath();
        g.arc(hx + dx - 0.3, dy, 2.4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.beginPath();
        g.arc(hx + dx - 1, dy - 0.8, 0.7, 0, Math.PI * 2);
        g.fill();
      }
    };
    heap(-24, '#d24b3a');
    heap(-2, '#e2963a');
    heap(20, '#7ab04a');
    // Awning: striped, sagging, scalloped hem.
    const sw = 78 / 6;
    for (let i = 0; i < 6; i++) {
      const c = i % 2 === 0 ? '#c94b3a' : '#efe6d2';
      g.fillStyle = vgrad(g, -36, -20, [[0, shade(c, 0.1)], [1, shade(c, -0.15)]]);
      g.beginPath();
      g.moveTo(-39 + i * sw, -36);
      g.lineTo(-39 + (i + 1) * sw, -36);
      g.lineTo(-39 + (i + 1) * sw, -21);
      g.lineTo(-39 + i * sw, -21);
      g.closePath();
      g.fill();
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 === 0 ? '#a53a2c' : '#d8ccb4';
      g.beginPath();
      g.arc(-39 + (i + 0.5) * sw, -21, sw / 2, 0, Math.PI);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(-33, -16, 66, 2);
  },
};

// --- Lamppost: wrought-iron street lamp. ------------------------------------
const lamppost: PropArt = {
  origin: [0, 0],
  ink: '#1a1a22',
  shadow: (g) => floorShadow(g, 3, 22, 13, 4),
  body: (g) => {
    g.fillStyle = vgrad(g, 15, 24, [[0, '#4a4f5a'], [1, '#1a1c22']]);
    rr(g, -7, 15, 14, 9, 2);
    g.fill();
    g.fillStyle = hgrad(g, -3, 3, [[0, '#5a606c'], [1, '#22252c']]);
    g.fillRect(-2.6, -28, 5.2, 44);
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(-2, -28, 1, 44);
    // Scroll bracket.
    g.strokeStyle = '#22252c';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(0, -24);
    g.quadraticCurveTo(6, -24, 5, -19);
    g.moveTo(0, -24);
    g.quadraticCurveTo(-6, -24, -5, -19);
    g.stroke();
    // Lantern cage with glowing glass.
    g.fillStyle = '#22252c';
    g.beginPath();
    g.moveTo(-8, -30);
    g.lineTo(8, -30);
    g.lineTo(6, -46);
    g.lineTo(-6, -46);
    g.closePath();
    g.fill();
    const gl = g.createRadialGradient(0, -38, 0.5, 0, -38, 8);
    gl.addColorStop(0, '#fff6d0');
    gl.addColorStop(0.6, '#ffd27a');
    gl.addColorStop(1, '#d9822e');
    g.fillStyle = gl;
    g.beginPath();
    g.moveTo(-6, -31.5);
    g.lineTo(6, -31.5);
    g.lineTo(4.6, -44.5);
    g.lineTo(-4.6, -44.5);
    g.closePath();
    g.fill();
    g.strokeStyle = '#22252c';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(0, -31.5);
    g.lineTo(0, -44.5);
    g.stroke();
    g.fillStyle = '#22252c';
    g.beginPath();
    g.moveTo(-8, -46);
    g.lineTo(8, -46);
    g.lineTo(0, -54);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(0, -55, 1.4, 0, Math.PI * 2);
    g.fill();
  },
};

// --- Tree: a layered, sun-dappled deciduous canopy over a rooted trunk. -----
const tree: PropArt = {
  origin: [0, 0],
  ink: '#1a2e18',
  shadow: (g) => {
    // Canopy shadow cast down-right, plus a dark root pool.
    floorShadow(g, 8, 20, 30, 9, 0.42);
    floorShadow(g, 0, 21, 10, 3, 0.5);
  },
  body: (g) => {
    const bark = '#5a3f28';
    // Roots + trunk.
    g.fillStyle = bark;
    g.beginPath();
    g.moveTo(-9, 22);
    g.quadraticCurveTo(-4, 18, -4, 4);
    g.lineTo(4, 4);
    g.quadraticCurveTo(4, 18, 10, 22);
    g.quadraticCurveTo(3, 20, 0, 22);
    g.quadraticCurveTo(-3, 20, -9, 22);
    g.closePath();
    g.fill();
    g.fillStyle = hgrad(g, -5, 5, [[0, shade(bark, 0.25)], [1, shade(bark, -0.35)]]);
    g.fillRect(-4.5, -6, 9, 22);
    g.strokeStyle = 'rgba(30,18,10,0.6)';
    g.lineWidth = 0.6;
    for (const bx of [-2.5, 0.5, 2.8]) {
      g.beginPath();
      g.moveTo(bx, 18);
      g.quadraticCurveTo(bx + 0.8, 8, bx - 0.4, -4);
      g.stroke();
    }
    // Branches reaching into the canopy.
    g.strokeStyle = shade(bark, -0.1);
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(-8, -6, -14, -12);
    g.moveTo(1, -2);
    g.quadraticCurveTo(8, -8, 13, -14);
    g.stroke();
    // Canopy in three value layers: shadowed back mass, mid clusters, lit
    // top-left clusters — each a ring of overlapping leaf blobs.
    const r = rng(12);
    const cluster = (cx: number, cy: number, rad: number, col: string, n: number) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(cx, cy, rad * 0.75, 0, Math.PI * 2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.5;
        const d = rad * (0.55 + r() * 0.2);
        g.moveTo(cx + Math.cos(a) * d + rad * 0.42, cy + Math.sin(a) * d);
        g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rad * 0.42, 0, Math.PI * 2);
      }
      g.fill();
    };
    const dark = '#24502a';
    const mid = '#3a7a38';
    const lit = '#5a9c48';
    cluster(0, -14, 24, dark, 11);
    cluster(-12, -8, 13, dark, 7);
    cluster(13, -8, 13, dark, 7);
    cluster(-8, -18, 14, mid, 8);
    cluster(9, -17, 13, mid, 8);
    cluster(0, -8, 12, mid, 7);
    cluster(-9, -22, 9, lit, 6);
    cluster(2, -26, 8, lit, 6);
    cluster(-14, -12, 6, lit, 5);
    // Leaf dabs + sun spots for texture.
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 22;
      const x = Math.cos(a) * d;
      const y = -14 + Math.sin(a) * d * 0.8;
      const litSide = x + y < -10;
      g.fillStyle = litSide ? withAlpha('#9ad070', 0.6) : withAlpha('#1a3a1e', 0.45);
      g.beginPath();
      g.ellipse(x, y, 1.6, 1, a, 0, Math.PI * 2);
      g.fill();
    }
    // A few dark gaps where branches show through.
    g.fillStyle = 'rgba(20,30,15,0.55)';
    for (const [gx, gy] of [[6, -10], [-4, -12], [10, -20]] as const) {
      g.beginPath();
      g.ellipse(gx, gy, 2, 1.2, 0.4, 0, Math.PI * 2);
      g.fill();
    }
  },
};

// --- Hedge: a clipped box hedge with leafy texture. -------------------------
const hedge: PropArt = {
  origin: [0, 0],
  ink: '#1a2e18',
  shadow: (g) => floorShadow(g, 3, 15, 24, 6),
  body: (g) => {
    g.fillStyle = vgrad(g, -13, 17, [[0, '#4a8a44'], [0.45, '#2f6a34'], [1, '#1f4a24']]);
    rr(g, -20, -13, 40, 30, 9);
    g.fill();
    g.fillStyle = withAlpha('#7ab45a', 0.5);
    rr(g, -18, -13, 36, 9, 6);
    g.fill();
    const r = rng(33);
    for (let i = 0; i < 70; i++) {
      const x = -18 + r() * 36;
      const y = -11 + r() * 26;
      g.fillStyle = y < -2 ? withAlpha('#a8d880', 0.5) : withAlpha('#163a1a', 0.45);
      g.beginPath();
      g.ellipse(x, y, 1.6, 1, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  },
};

// --- Cart: canvas-covered merchant wagon. 2×1. ------------------------------
const cart: PropArt = {
  origin: [H, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 3, 21, 40, 7),
  body: (g) => {
    const wheel = (wx: number) => {
      g.fillStyle = '#2a1a10';
      g.beginPath();
      g.arc(wx, 14, 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = shade(WOOD, 0.1);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(wx, 14, 7.6, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 1.2;
      for (let a = 0; a < 6; a++) {
        g.beginPath();
        g.moveTo(wx, 14);
        g.lineTo(wx + Math.cos((a * Math.PI) / 3) * 7, 14 + Math.sin((a * Math.PI) / 3) * 7);
        g.stroke();
      }
      g.fillStyle = '#4a4550';
      g.beginPath();
      g.arc(wx, 14, 2, 0, Math.PI * 2);
      g.fill();
    };
    wheel(-22);
    planks(g, -34, -2, 68, 14, WOOD, false, 4.7, 91);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(-34, 9, 68, 3);
    // Shaft to the front.
    g.strokeStyle = shade(WOOD, -0.2);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(34, 6);
    g.lineTo(44, 10);
    g.stroke();
    // Canvas tilt over hoops.
    g.fillStyle = vgrad(g, -30, -2, [[0, '#f0e6cc'], [1, '#b8aa88']]);
    g.beginPath();
    g.moveTo(-31, -2);
    g.quadraticCurveTo(-30, -30, -8, -30);
    g.quadraticCurveTo(14, -30, 16, -2);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(120,105,75,0.6)';
    g.lineWidth = 0.9;
    for (const rx of [-20, -8, 4]) {
      g.beginPath();
      g.moveTo(rx, -2);
      g.quadraticCurveTo(rx + 1, -20, rx + 2, -29);
      g.stroke();
    }
    // Sacks/crates peeking from the open back.
    g.fillStyle = '#c9b48c';
    g.beginPath();
    g.ellipse(24, -6, 7, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8a6a3a';
    g.fillRect(19, -12, 2, 4);
    wheel(22);
  },
};

// --- Signpost. ----------------------------------------------------------------
const signpost: PropArt = {
  origin: [0, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 3, 22, 11, 4),
  body: (g) => {
    g.fillStyle = hgrad(g, -3, 3, [[0, shade(WOOD, 0.2)], [1, shade(WOOD, -0.35)]]);
    g.fillRect(-2.6, -28, 5.2, 50);
    g.fillStyle = shade(WOOD, 0.3);
    g.beginPath();
    g.moveTo(-3, -28);
    g.lineTo(0, -31);
    g.lineTo(3, -28);
    g.closePath();
    g.fill();
    const board = (top: number, dir: number, col: string) => {
      g.fillStyle = vgrad(g, top, top + 10, [[0, shade(col, 0.15)], [1, shade(col, -0.2)]]);
      g.beginPath();
      const x0 = -2 * dir;
      g.moveTo(x0, top);
      g.lineTo(16 * dir, top);
      g.lineTo(22 * dir, top + 5);
      g.lineTo(16 * dir, top + 10);
      g.lineTo(x0, top + 10);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(40,26,14,0.55)';
      g.lineWidth = 0.6;
      for (const ly of [top + 3.5, top + 6.5]) {
        g.beginPath();
        g.moveTo(3 * dir, ly);
        g.lineTo(14 * dir, ly);
        g.stroke();
      }
      g.fillStyle = '#2a2420';
      g.beginPath();
      g.arc(0, top + 5, 0.8, 0, Math.PI * 2);
      g.fill();
    };
    board(-25, 1, '#b08848');
    board(-10, -1, '#9a7440');
  },
};

// --- Townhouse: a tall gabled row house. 2×2. -------------------------------
const townhouse: PropArt = {
  origin: [H, H],
  ink: '#3a2418',
  shadow: (g) => floorShadow(g, 6, 46, 46, 12, 0.5),
  body: (g) => {
    const plaster = '#d9c49a';
    const beam = '#5a3a24';
    masonry(g, -33, 34, 66, 10, STONE_WARM, 5, 44);
    g.fillStyle = hgrad(g, -32, 32, [[0, shade(plaster, 0.08)], [0.6, plaster], [1, shade(plaster, -0.22)]]);
    g.fillRect(-32, -22, 64, 56);
    const r = rng(9);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(120,90,50,0.08)' : 'rgba(255,255,255,0.1)';
      g.fillRect(-32 + r() * 64, -22 + r() * 56, 1 + r() * 2, 1 + r() * 2);
    }
    // Jettied upper storey beam + corner posts.
    g.fillStyle = beam;
    g.fillRect(-34, 5, 68, 4);
    g.fillRect(-32, -22, 4, 56);
    g.fillRect(28, -22, 4, 56);
    g.strokeStyle = beam;
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(-28, -22);
    g.lineTo(-10, 5);
    g.moveTo(28, -22);
    g.lineTo(10, 5);
    g.stroke();
    litWindow(g, -24, -14, 12, 13, beam, { shutters: '#7a3a3a' });
    litWindow(g, 12, -14, 12, 13, beam, { shutters: '#7a3a3a' });
    // Door + hanging sign.
    g.fillStyle = shade(beam, -0.15);
    rr(g, -9, 15, 18, 19, 2);
    g.fill();
    planks(g, -7.5, 17, 15, 17, '#6e4226', true, 3.75, 4);
    g.fillStyle = GOLD;
    g.beginPath();
    g.arc(4.5, 26, 1.2, 0, Math.PI * 2);
    g.fill();
    litWindow(g, 16, 17, 9, 9, beam);
    // Steep gable with shingles + attic window.
    shingleRoof(g, [[-38, -20], [0, -60], [38, -20]], '#6a4438', 4.5, 27);
    g.strokeStyle = '#331f1a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-38, -20);
    g.lineTo(0, -60);
    g.lineTo(38, -20);
    g.stroke();
    litWindow(g, -5, -38, 10, 10, beam, { arch: true });
    g.fillStyle = 'rgba(30,15,10,0.35)';
    g.fillRect(-32, -22, 64, 3);
  },
};

// ===========================================================================
// Town square — the Capital's market square
// ===========================================================================

const SLATE = '#4e5a70';

/** A small iron wall lantern with lit glass, its bracket reaching from `dir`. */
function wallLantern(g: Ctx, x: number, y: number, dir: number): void {
  g.strokeStyle = '#22252c';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(x - dir * 5, y - 7);
  g.lineTo(x, y - 7);
  g.lineTo(x, y - 4.5);
  g.stroke();
  g.fillStyle = '#22252c';
  g.beginPath();
  g.moveTo(x - 3.4, y - 3);
  g.lineTo(x + 3.4, y - 3);
  g.lineTo(x, y - 5.6);
  g.closePath();
  g.fill();
  const gl = g.createRadialGradient(x, y + 0.5, 0.3, x, y + 0.5, 4);
  gl.addColorStop(0, '#fff6d0');
  gl.addColorStop(0.6, '#ffd27a');
  gl.addColorStop(1, '#d9822e');
  g.fillStyle = gl;
  g.fillRect(x - 2.5, y - 3, 5, 6.5);
  g.fillStyle = '#22252c';
  g.fillRect(x - 3, y + 3.5, 6, 1.4);
  g.fillRect(x - 0.4, y - 3, 0.8, 6.5);
}

/** A city banner hung from a gilt rod: crimson cloth, gold edging, a crown. */
function cityBanner(g: Ctx, x: number, top: number, w: number, h: number): void {
  const cloth = '#8e1f2d';
  g.fillStyle = GOLD;
  g.fillRect(x - w / 2 - 1.5, top - 1.2, w + 3, 1.6);
  g.fillStyle = vgrad(g, top, top + h, [[0, shade(cloth, 0.18)], [1, shade(cloth, -0.25)]]);
  g.beginPath();
  g.moveTo(x - w / 2, top);
  g.lineTo(x + w / 2, top);
  g.lineTo(x + w / 2, top + h);
  g.lineTo(x, top + h - 4);
  g.lineTo(x - w / 2, top + h);
  g.closePath();
  g.fill();
  g.fillStyle = withAlpha(GOLD, 0.85);
  g.fillRect(x - w / 2 + 0.8, top + 0.4, 0.9, h - 2.6);
  g.fillRect(x + w / 2 - 1.7, top + 0.4, 0.9, h - 2.6);
  const cy = top + h * 0.42;
  g.beginPath();
  g.moveTo(x - 3, cy + 2);
  g.lineTo(x - 3, cy - 1.4);
  g.lineTo(x - 1.5, cy);
  g.lineTo(x, cy - 2.6);
  g.lineTo(x + 1.5, cy);
  g.lineTo(x + 3, cy - 1.4);
  g.lineTo(x + 3, cy + 2);
  g.closePath();
  g.fill();
  // A fold of shadow down the cloth.
  g.fillStyle = 'rgba(30,5,10,0.25)';
  g.fillRect(x + 0.6, top + 1, w * 0.18, h - 5);
}

/** Plaster speckle so a rendered wall never reads as a flat fill. */
function plasterSpeckle(g: Ctx, x: number, y: number, w: number, h: number, n: number, seed: number): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(120,90,50,0.08)' : 'rgba(255,255,255,0.1)';
    g.fillRect(x + r() * w, y + r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

/** A dark iron sign bracket off a wall at (x, y), reaching `len` toward `dir`. */
function signBracket(g: Ctx, x: number, y: number, len: number, dir: number): void {
  g.strokeStyle = '#22252c';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + dir * len, y);
  g.moveTo(x, y + 5);
  g.quadraticCurveTo(x + dir * 2, y + 0.5, x + dir * 6, y);
  g.stroke();
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(x + dir * 4, y);
  g.lineTo(x + dir * 4, y + 3.5);
  g.moveTo(x + dir * (len - 2), y);
  g.lineTo(x + dir * (len - 2), y + 3.5);
  g.stroke();
}

// --- Guildhall: the town hall facing the square, with a clock tower. 4×3. ---
const guildhall: PropArt = {
  origin: [T + H, T],
  ink: '#2e2a36',
  shadow: (g) => floorShadow(g, 8, 64, 104, 15, 0.55),
  body: (g) => {
    const stone = '#b4a68e';
    const trim = '#4a3424';
    // Hipped slate roof over both wings (the tower rises in front of it).
    shingleRoof(g, [[-94, -14], [-72, -40], [72, -40], [94, -14]], SLATE, 5, 41);
    g.strokeStyle = shade(SLATE, -0.55);
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(-94, -14);
    g.lineTo(-72, -40);
    g.lineTo(72, -40);
    g.lineTo(94, -14);
    g.stroke();
    g.strokeStyle = 'rgba(220,230,255,0.32)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-92.4, -15.6);
    g.lineTo(-71.4, -38.5);
    g.lineTo(71, -38.5);
    g.stroke();
    // Dormers.
    for (const dx of [-66, -42, 42, 66]) {
      g.fillStyle = shade(stone, -0.08);
      g.fillRect(dx - 6, -31, 12, 15);
      litWindow(g, dx - 3.5, -28, 7, 9, trim, { arch: true });
      shingleRoof(g, [[dx - 9, -30], [dx, -39], [dx + 9, -30]], SLATE, 3, 150 + dx);
      g.strokeStyle = shade(SLATE, -0.55);
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(dx - 9, -30);
      g.lineTo(dx, -39);
      g.lineTo(dx + 9, -30);
      g.stroke();
    }
    const bays = [-75, -51, -27, 27, 51, 75];
    // Upper storey: dressed ashlar, tall arched windows, city banners.
    masonry(g, -88, -12, 176, 26, stone, 6.5, 81);
    for (const cx of bays) litWindow(g, cx - 4.5, -7, 9, 14, trim, { arch: true });
    for (const cx of [-63, -39, 39, 63]) cityBanner(g, cx, -10, 9, 22);
    // Cornice with dentils.
    g.fillStyle = shade(stone, 0.28);
    g.fillRect(-92, -16, 184, 3.5);
    g.fillStyle = shade(stone, -0.32);
    g.fillRect(-91, -12.5, 182, 1.5);
    g.fillStyle = shade(stone, 0.06);
    for (let x = -90; x < 90; x += 4) g.fillRect(x, -11, 2, 1.5);
    // Ground storey: heavier, warmer stone with an arcade of lit windows.
    masonry(g, -88, 16, 176, 41, shade(stone, -0.1), 5.2, 83);
    for (const cx of bays) {
      g.fillStyle = shade(stone, 0.18);
      g.beginPath();
      g.moveTo(cx - 7.5, 47);
      g.lineTo(cx - 7.5, 32);
      g.arc(cx, 32, 7.5, Math.PI, 0);
      g.lineTo(cx + 7.5, 47);
      g.closePath();
      g.fill();
      litWindow(g, cx - 5, 27, 10, 19, trim, { arch: true });
    }
    // String course between the storeys.
    g.fillStyle = shade(stone, 0.3);
    g.fillRect(-90, 12, 180, 3);
    g.fillStyle = shade(stone, -0.35);
    g.fillRect(-89, 15, 178, 1.4);
    // Quoins at the corners: long and short blocks, lit on the left.
    for (const qx of [-88, 84]) {
      for (let y = -12, k = 0; y < 56; y += 5.5, k++) {
        g.fillStyle = shade(stone, qx < 0 ? 0.24 : -0.05);
        g.fillRect(k % 2 === 0 ? qx : qx + (qx < 0 ? 0 : -2), y + 0.4, k % 2 === 0 ? 4 : 6, 4.8);
      }
    }
    // Plinth.
    masonry(g, -90, 56, 180, 10, shade(stone, -0.22), 5, 85);
    g.fillStyle = shade(stone, 0.2);
    g.fillRect(-90, 55, 180, 1.6);

    // Clock tower, built out from the facade and up past the ridge.
    masonry(g, -15, -54, 30, 68, shade(stone, 0.03), 6, 87);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(-15, -54, 2, 68);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(13, -54, 2, 68);
    g.fillStyle = shade(stone, 0.3);
    g.fillRect(-18, -57, 36, 3.5);
    g.fillStyle = shade(stone, -0.32);
    g.fillRect(-17, -53.5, 34, 1.4);
    shingleRoof(g, [[-18, -57], [0, -71], [18, -57]], SLATE, 3.5, 89);
    g.strokeStyle = shade(SLATE, -0.55);
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-18, -57);
    g.lineTo(0, -71);
    g.lineTo(18, -57);
    g.stroke();
    g.fillStyle = GOLD;
    g.fillRect(-0.7, -76, 1.4, 6);
    g.beginPath();
    g.arc(0, -76.5, 1.5, 0, Math.PI * 2);
    g.fill();
    // Clock face: gilt bezel, cream dial, hour ticks, hands at ten to seven.
    const cy = -33;
    g.fillStyle = shade(stone, -0.4);
    g.beginPath();
    g.arc(0, cy, 11.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = GOLD;
    g.beginPath();
    g.arc(0, cy, 10.6, 0, Math.PI * 2);
    g.fill();
    const face = g.createRadialGradient(-2, cy - 2, 1, 0, cy, 9.5);
    face.addColorStop(0, '#fbf3dc');
    face.addColorStop(1, '#d6c49a');
    g.fillStyle = face;
    g.beginPath();
    g.arc(0, cy, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3a2a1a';
    g.lineWidth = 0.8;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r0 = i % 3 === 0 ? 5.8 : 7;
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(Math.cos(a) * 8.2, cy + Math.sin(a) * 8.2);
      g.stroke();
    }
    g.lineCap = 'round';
    const hand = (frac: number, len: number, w: number) => {
      const a = frac * Math.PI * 2 - Math.PI / 2;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(0, cy);
      g.lineTo(Math.cos(a) * len, cy + Math.sin(a) * len);
      g.stroke();
    };
    g.strokeStyle = '#2a1c12';
    hand((6 + 50 / 60) / 12, 4.6, 1.5);
    hand(50 / 60, 7, 1);
    g.lineCap = 'butt';
    g.fillStyle = GOLD;
    g.beginPath();
    g.arc(0, cy, 1.1, 0, Math.PI * 2);
    g.fill();
    // Louvred belfry slits above the clock.
    g.fillStyle = '#1e1a22';
    for (const sx of [-7, 3]) {
      rr(g, sx, -51, 4, 6, 1.6);
      g.fill();
    }
    // Tower window over a little balcony.
    litWindow(g, -5, -6, 10, 14, trim, { arch: true });
    g.fillStyle = shade(stone, 0.25);
    g.fillRect(-11, 9, 22, 2.5);
    g.fillStyle = shade(stone, -0.05);
    for (let x = -10; x <= 8; x += 3) g.fillRect(x, 5, 1.6, 4);
    g.fillStyle = shade(stone, 0.18);
    g.fillRect(-11, 4, 22, 1.6);

    // Grand door: a deep arched portal with studded double doors.
    const arch = (r: number) => {
      g.beginPath();
      g.moveTo(-r, 57);
      g.lineTo(-r, 35);
      g.arc(0, 35, r, Math.PI, 0);
      g.lineTo(r, 57);
      g.closePath();
    };
    g.fillStyle = shade(stone, 0.22);
    arch(15);
    g.fill();
    g.strokeStyle = withAlpha(shade(stone, -0.45), 0.6);
    g.lineWidth = 0.7;
    for (let i = 1; i < 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      g.beginPath();
      g.moveTo(Math.cos(a) * 11.5, 35 + Math.sin(a) * 11.5);
      g.lineTo(Math.cos(a) * 15, 35 + Math.sin(a) * 15);
      g.stroke();
    }
    g.fillStyle = '#21160f';
    arch(11.5);
    g.fill();
    g.save();
    arch(10.5);
    g.clip();
    planks(g, -10.5, 24, 21, 33, '#6e4226', true, 3.5, 91);
    g.restore();
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(-0.5, 25, 1, 32);
    g.fillStyle = '#2a2420';
    for (const y of [38, 49]) g.fillRect(-10.5, y, 21, 1.4);
    g.fillStyle = '#5a5560';
    for (const y of [38.7, 49.7]) for (const x of [-8, -4, 4, 8]) g.fillRect(x - 0.5, y - 0.5, 1, 1);
    g.strokeStyle = GOLD;
    g.lineWidth = 0.9;
    for (const x of [-2.6, 2.6]) {
      g.beginPath();
      g.arc(x, 45, 1.5, 0, Math.PI * 2);
      g.stroke();
    }
    // Keystone.
    g.fillStyle = shade(stone, 0.32);
    g.beginPath();
    g.moveTo(-2.5, 19.5);
    g.lineTo(2.5, 19.5);
    g.lineTo(1.8, 24.5);
    g.lineTo(-1.8, 24.5);
    g.closePath();
    g.fill();
    wallLantern(g, -20, 36, -1);
    wallLantern(g, 20, 36, 1);

    // Steps up to the portal, back to front.
    for (const [w, y0, h] of [[34, 56.5, 4], [42, 60, 4.5], [50, 64, 6]] as const) {
      g.fillStyle = vgrad(g, y0, y0 + h, [[0, shade(stone, 0.32)], [1, shade(stone, -0.18)]]);
      g.fillRect(-w / 2, y0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(-w / 2, y0 + h - 0.8, w, 0.8);
    }
    // Clipped bay trees in stone urns either side of the steps.
    for (const ux of [-32, 32]) {
      g.fillStyle = vgrad(g, 58, 68, [[0, shade(stone, 0.2)], [1, shade(stone, -0.3)]]);
      g.beginPath();
      g.moveTo(ux - 5, 60);
      g.lineTo(ux + 5, 60);
      g.lineTo(ux + 3.5, 68);
      g.lineTo(ux - 3.5, 68);
      g.closePath();
      g.fill();
      g.fillStyle = '#5a3f28';
      g.fillRect(ux - 0.7, 52, 1.4, 8);
      const leaf = g.createRadialGradient(ux - 2, 46, 0.5, ux, 48, 7);
      leaf.addColorStop(0, '#6aa852');
      leaf.addColorStop(1, '#24502a');
      g.fillStyle = leaf;
      g.beginPath();
      g.arc(ux, 48, 6.2, 0, Math.PI * 2);
      g.fill();
    }
  },
};

// --- Bakery: a brick shopfront under a striped awning, bread in the window. 2×2.
const bakery: PropArt = {
  origin: [H, H],
  ink: '#3a2418',
  shadow: (g) => floorShadow(g, 6, 46, 46, 12, 0.5),
  body: (g) => {
    const plaster = '#ecdcb6';
    const beam = '#5a3a24';
    const brick = '#a65a3e';
    // Oven chimney behind the roof.
    masonry(g, 14, -54, 12, 26, brick, 3.2, 111);
    g.fillStyle = '#4a2a1e';
    g.fillRect(12.5, -56, 15, 3);
    masonry(g, -33, 34, 66, 10, STONE_WARM, 5, 113);
    // Brick shop storey.
    masonry(g, -32, 6, 64, 29, brick, 3.4, 115);
    // Plaster upper storey, timber framed, blue-shuttered window.
    g.fillStyle = hgrad(g, -32, 32, [[0, shade(plaster, 0.08)], [0.6, plaster], [1, shade(plaster, -0.2)]]);
    g.fillRect(-32, -22, 64, 28);
    plasterSpeckle(g, -32, -22, 64, 28, 36, 117);
    g.fillStyle = beam;
    g.fillRect(-32, -22, 4, 28);
    g.fillRect(28, -22, 4, 28);
    g.strokeStyle = beam;
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(-28, -22);
    g.lineTo(-15, 5);
    g.moveTo(28, -22);
    g.lineTo(15, 5);
    g.stroke();
    litWindow(g, -6, -16, 12, 12, beam, { shutters: '#2f5470', box: true });
    g.fillStyle = beam;
    g.fillRect(-34, 4, 68, 4);
    g.fillStyle = 'rgba(255,220,180,0.25)';
    g.fillRect(-34, 4, 68, 0.8);

    // Display window with loaves on its shelves.
    g.fillStyle = shade(beam, -0.2);
    g.fillRect(-28, 15, 26, 16.5);
    const glow = g.createRadialGradient(-15, 23, 1, -15, 23, 15);
    glow.addColorStop(0, '#fff0c0');
    glow.addColorStop(0.6, '#ffc870');
    glow.addColorStop(1, '#d9822e');
    g.fillStyle = glow;
    g.fillRect(-26.5, 16.5, 23, 13.5);
    g.fillStyle = '#6e4a26';
    g.fillRect(-26.5, 21.6, 23, 1.2);
    g.fillRect(-26.5, 28, 23, 2);
    const crust = '#b8742e';
    const loaf = (x: number, y: number, rx: number, ry: number) => {
      g.fillStyle = shade(crust, -0.15);
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = shade(crust, 0.2);
      g.beginPath();
      g.ellipse(x - rx * 0.2, y - ry * 0.3, rx * 0.65, ry * 0.5, 0, 0, Math.PI * 2);
      g.fill();
    };
    loaf(-21, 26, 3.2, 2.2);
    loaf(-12.5, 26.6, 5, 1.6);
    loaf(-6, 26.8, 1.6, 1.3);
    loaf(-20, 20, 3.6, 1.6);
    loaf(-9, 19.8, 2.4, 1.9);
    g.strokeStyle = 'rgba(80,40,10,0.6)';
    g.lineWidth = 0.5;
    for (const sx of [-14.5, -12.5, -10.5]) {
      g.beginPath();
      g.moveTo(sx, 25.6);
      g.lineTo(sx + 1, 27.4);
      g.stroke();
    }
    g.fillStyle = beam;
    g.fillRect(-15.6, 16.5, 1.2, 13.5);
    g.fillStyle = shade(STONE_WARM, 0.2);
    g.fillRect(-30, 31, 30, 2.2);
    // Door with a little lit pane.
    g.fillStyle = shade(beam, -0.2);
    rr(g, 4, 13, 18, 22, 2);
    g.fill();
    planks(g, 5.5, 14.5, 15, 20.5, '#7a4a2a', true, 3.75, 119);
    litWindow(g, 9.5, 17, 7, 6, beam);
    g.fillStyle = GOLD;
    g.beginPath();
    g.arc(18, 26, 1.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(STONE_WARM, 0.15);
    g.fillRect(2, 34, 22, 2.5);
    // Striped awning with a scalloped hem, shading the wall beneath.
    g.fillStyle = 'rgba(20,10,5,0.3)';
    g.fillRect(-31, 14, 62, 3);
    const n = 8;
    const top = 64 / n;
    const bot = 70 / n;
    for (let i = 0; i < n; i++) {
      const c = i % 2 === 0 ? '#b04a36' : '#f2e6c8';
      g.fillStyle = vgrad(g, 7, 14, [[0, shade(c, 0.12)], [1, shade(c, -0.12)]]);
      g.beginPath();
      g.moveTo(-32 + i * top, 7);
      g.lineTo(-32 + (i + 1) * top, 7);
      g.lineTo(-35 + (i + 1) * bot, 13.5);
      g.lineTo(-35 + i * bot, 13.5);
      g.closePath();
      g.fill();
      g.fillStyle = i % 2 === 0 ? '#93392a' : '#d8ccb0';
      g.beginPath();
      g.arc(-35 + (i + 0.5) * bot, 13.4, bot / 2, 0, Math.PI);
      g.fill();
    }
    // Flour sack by the door.
    g.fillStyle = vgrad(g, 27, 36, [[0, '#efe6d0'], [1, '#b8aa8c']]);
    g.beginPath();
    g.ellipse(27, 32, 4.4, 4.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8a7450';
    g.fillRect(26, 26.6, 2, 1.6);
    // Hanging sign: a gilt pretzel on a dark board.
    signBracket(g, 32, -2, 12, 1);
    g.fillStyle = '#4a2e1c';
    rr(g, 33, 1.5, 12, 11, 2);
    g.fill();
    g.strokeStyle = shade('#4a2e1c', 0.35);
    g.lineWidth = 0.7;
    rr(g, 33.8, 2.3, 10.4, 9.4, 1.6);
    g.stroke();
    g.strokeStyle = GOLD;
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(36, 10);
    g.bezierCurveTo(33.5, 6, 35.5, 3.6, 38.2, 5.8);
    g.lineTo(39.8, 8);
    g.bezierCurveTo(42.5, 3.6, 44.5, 6, 42, 10);
    g.moveTo(37.6, 9.6);
    g.lineTo(40.4, 5.8);
    g.stroke();
    // Steep terracotta gable with an attic window.
    shingleRoof(g, [[-38, -20], [0, -60], [38, -20]], '#9a4a32', 4.5, 121);
    g.strokeStyle = '#3f1714';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-38, -20);
    g.lineTo(0, -60);
    g.lineTo(38, -20);
    g.stroke();
    litWindow(g, -4, -40, 8, 9, beam, { arch: true });
    g.fillStyle = 'rgba(30,15,10,0.35)';
    g.fillRect(-32, -22, 64, 3);
  },
};

// --- Tavern: stone and timber under a side-gabled slate roof. 2×2. ---------
const tavern: PropArt = {
  origin: [H, H],
  ink: '#3a2418',
  shadow: (g) => floorShadow(g, 6, 46, 50, 12, 0.5),
  body: (g) => {
    const plaster = '#d8bc8e';
    const beam = '#4a2e1c';
    const roof = '#3f4a56';
    // Chimneys at both gable ends.
    for (const cx of [-27, 25]) {
      masonry(g, cx - 5, -52, 10, 26, '#8a5a40', 3.5, 101 + cx);
      g.fillStyle = '#4a3020';
      g.fillRect(cx - 6.5, -54, 13, 3);
    }
    masonry(g, -34, 34, 68, 10, shade(STONE_WARM, -0.1), 5, 105);
    masonry(g, -32, 4, 64, 31, STONE_WARM, 4.6, 107);
    // Timbered upper storey.
    g.fillStyle = hgrad(g, -32, 32, [[0, shade(plaster, 0.08)], [0.6, plaster], [1, shade(plaster, -0.22)]]);
    g.fillRect(-32, -20, 64, 24);
    plasterSpeckle(g, -32, -20, 64, 24, 34, 108);
    g.fillStyle = beam;
    for (const x of [-32, -1.75, 28.5]) g.fillRect(x, -20, 3.5, 24);
    g.strokeStyle = beam;
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(-28.5, 4);
    g.lineTo(-15, -20);
    g.lineTo(-1.75, 4);
    g.moveTo(1.75, 4);
    g.lineTo(15, -20);
    g.lineTo(28.5, 4);
    g.stroke();
    litWindow(g, -21.5, -15, 11, 11, beam, { shutters: '#3f6a4a', box: true });
    litWindow(g, 10.5, -15, 11, 11, beam, { shutters: '#3f6a4a', box: true });
    g.fillStyle = beam;
    g.fillRect(-35, 2, 70, 4.5);
    g.fillStyle = 'rgba(255,220,180,0.25)';
    g.fillRect(-35, 2, 70, 0.8);
    // Side-gabled roof with a dormer.
    shingleRoof(g, [[-40, -18], [-30, -46], [30, -46], [40, -18]], roof, 4.5, 109);
    g.strokeStyle = shade(roof, -0.55);
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(-40, -18);
    g.lineTo(-30, -46);
    g.lineTo(30, -46);
    g.lineTo(40, -18);
    g.stroke();
    g.strokeStyle = 'rgba(220,230,255,0.3)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-29.5, -44.6);
    g.lineTo(29.5, -44.6);
    g.stroke();
    g.fillStyle = shade(plaster, -0.1);
    g.fillRect(-7, -36, 14, 13);
    litWindow(g, -4, -33, 8, 8, beam);
    shingleRoof(g, [[-10, -34], [0, -43], [10, -34]], roof, 3, 110);
    g.strokeStyle = shade(roof, -0.55);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-10, -34);
    g.lineTo(0, -43);
    g.lineTo(10, -34);
    g.stroke();
    g.fillStyle = 'rgba(30,15,10,0.35)';
    g.fillRect(-32, -20, 64, 3);
    // Open arched doorway spilling warm light.
    const door = (r: number) => {
      g.beginPath();
      g.moveTo(-7 - r, 34);
      g.lineTo(-7 - r, 19);
      g.arc(-7, 19, r, Math.PI, 0);
      g.lineTo(-7 + r, 34);
      g.closePath();
    };
    g.fillStyle = shade(STONE_WARM, 0.2);
    door(10.5);
    g.fill();
    const spill = g.createRadialGradient(-7, 26, 1, -7, 24, 14);
    spill.addColorStop(0, '#fff0c0');
    spill.addColorStop(0.5, '#ffbe62');
    spill.addColorStop(1, '#b8602a');
    g.fillStyle = spill;
    door(8.5);
    g.fill();
    // The door leaf swung inward, seen edge-on, and a figure's shadow inside.
    g.save();
    door(8.5);
    g.clip();
    planks(g, -15.5, 10, 5, 24, '#6e4226', true, 2.5, 112);
    g.fillStyle = 'rgba(60,30,15,0.35)';
    g.beginPath();
    g.ellipse(-1.5, 27, 2.6, 7, 0, 0, Math.PI * 2);
    g.arc(-1.5, 18.5, 2.4, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = shade(STONE_WARM, 0.15);
    g.fillRect(-19, 34, 24, 2.5);
    // Leaded window.
    litWindow(g, 10, 14, 16, 13, beam);
    g.save();
    g.beginPath();
    g.rect(10, 14, 16, 13);
    g.clip();
    g.strokeStyle = withAlpha('#3a2418', 0.55);
    g.lineWidth = 0.5;
    g.beginPath();
    for (let k = -14; k <= 16; k += 4) {
      g.moveTo(10 + k, 14);
      g.lineTo(10 + k + 13, 27);
      g.moveTo(26 - k, 14);
      g.lineTo(26 - k - 13, 27);
    }
    g.stroke();
    g.restore();
    // A barrel by the door.
    g.fillStyle = vgrad(g, 23, 35, [[0, shade(WOOD, 0.15)], [1, shade(WOOD, -0.3)]]);
    rr(g, -31, 23, 10, 12, 3);
    g.fill();
    g.fillStyle = '#3a3640';
    g.fillRect(-31, 25.5, 10, 1);
    g.fillRect(-31, 31.5, 10, 1);
    g.fillStyle = shade(WOOD, 0.2);
    g.beginPath();
    g.ellipse(-26, 23.4, 5, 1.4, 0, 0, Math.PI * 2);
    g.fill();
    // Hanging sign: a gilt tankard on a green board.
    signBracket(g, -32, -2, 12, -1);
    g.fillStyle = '#2f4a36';
    rr(g, -45, 1.5, 12, 11, 2);
    g.fill();
    g.strokeStyle = GOLD;
    g.lineWidth = 0.7;
    rr(g, -44.2, 2.3, 10.4, 9.4, 1.6);
    g.stroke();
    g.fillStyle = GOLD;
    g.fillRect(-42.5, 4.6, 5.4, 6.2);
    g.fillStyle = '#f4ead0';
    g.beginPath();
    g.ellipse(-39.8, 4.6, 3.2, 1.3, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = GOLD;
    g.lineWidth = 1.1;
    g.beginPath();
    g.arc(-36.6, 7.6, 1.8, -Math.PI / 2, Math.PI / 2);
    g.stroke();
  },
};

// --- Bench: slatted wood on wrought-iron scroll legs. -----------------------
const bench: PropArt = {
  origin: [0, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 2, 13, 19, 4.5),
  body: (g) => {
    const iron = '#2a2a32';
    g.strokeStyle = iron;
    g.lineWidth = 1.8;
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      const x = s * 13;
      // Leg: a scroll foot under the seat, rising into the armrest.
      g.beginPath();
      g.moveTo(x, 4);
      g.quadraticCurveTo(x + s * 1.5, 9, x - s * 1.5, 13);
      g.moveTo(x, 4);
      g.quadraticCurveTo(x - s * 3, 9, x + s * 2.5, 13);
      g.moveTo(x - s * 0.5, -12);
      g.lineTo(x, 4);
      g.moveTo(x, -2);
      g.quadraticCurveTo(x + s * 5, -3, x + s * 4, 2);
      g.stroke();
    }
    g.lineCap = 'butt';
    // Back slats then the seat (front slat lit).
    for (const y of [-11, -6.5]) {
      g.fillStyle = vgrad(g, y, y + 3.2, [[0, shade(WOOD, 0.25)], [1, shade(WOOD, -0.25)]]);
      rr(g, -16, y, 32, 3.2, 1);
      g.fill();
    }
    g.fillStyle = shade(WOOD, -0.35);
    g.fillRect(-15.5, 1, 31, 3);
    g.fillStyle = vgrad(g, 0, 4, [[0, shade(WOOD, 0.35)], [1, shade(WOOD, -0.1)]]);
    rr(g, -17, -0.5, 34, 3.4, 1.2);
    g.fill();
    g.strokeStyle = withAlpha(shade(WOOD, -0.5), 0.5);
    g.lineWidth = 0.5;
    for (const y of [-9.4, -4.9, 1.2]) {
      g.beginPath();
      g.moveTo(-14, y);
      g.lineTo(14, y + 0.3);
      g.stroke();
    }
  },
};

// --- Planter: a carved stone trough brimming with flowers. ------------------
const planter: PropArt = {
  origin: [0, 0],
  ink: '#2a2a32',
  shadow: (g) => floorShadow(g, 2, 14, 18, 5),
  body: (g) => {
    const st = '#a49a8a';
    g.fillStyle = hgrad(g, -15, 15, [[0, shade(st, 0.18)], [0.5, st], [1, shade(st, -0.3)]]);
    g.beginPath();
    g.moveTo(-15, 1);
    g.lineTo(15, 1);
    g.lineTo(13, 14);
    g.lineTo(-13, 14);
    g.closePath();
    g.fill();
    g.strokeStyle = withAlpha(shade(st, -0.45), 0.55);
    g.lineWidth = 0.7;
    rr(g, -10, 4, 20, 7, 1.5);
    g.stroke();
    g.fillStyle = shade(st, 0.32);
    g.fillRect(-16.5, -1, 33, 3);
    g.fillStyle = '#3a2a1c';
    g.fillRect(-15, -1.6, 30, 1.2);
    // Leaves, then blooms, then ivy trailing over the lip.
    const r = rng(141);
    for (let i = 0; i < 16; i++) {
      const x = -13 + r() * 26;
      const y = -3 - r() * 9 + Math.abs(x) * 0.25;
      g.fillStyle = r() < 0.5 ? '#2f6a34' : '#3f7a3a';
      g.beginPath();
      g.arc(x, y, 3 + r() * 2.2, 0, Math.PI * 2);
      g.fill();
    }
    const blooms = ['#e05a6a', '#f2d35a', '#f4e9c4', '#c95ad6', '#ef8a4a'];
    for (let i = 0; i < 18; i++) {
      const x = -12 + r() * 24;
      const y = -4 - r() * 10 + Math.abs(x) * 0.3;
      const c = blooms[i % blooms.length];
      g.fillStyle = shade(c, -0.2);
      g.beginPath();
      g.arc(x + 0.3, y + 0.4, 1.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, y, 1.3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#2f6a34';
    g.lineWidth = 1;
    for (const [x, len] of [[-11, 7], [6, 9], [12, 5]] as const) {
      g.beginPath();
      g.moveTo(x, 0);
      g.quadraticCurveTo(x + 2, len * 0.5, x + 0.5, len);
      g.stroke();
      g.fillStyle = '#3f7a3a';
      g.beginPath();
      g.arc(x + 1.4, len * 0.55, 1.2, 0, Math.PI * 2);
      g.arc(x + 0.5, len, 1.1, 0, Math.PI * 2);
      g.fill();
    }
  },
};

// --- Notice board: a little roofed board papered with notices. --------------
const noticeBoard: PropArt = {
  origin: [0, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 3, 20, 17, 4.5),
  body: (g) => {
    for (const px of [-15, 11]) {
      g.fillStyle = hgrad(g, px, px + 4, [[0, shade(WOOD, 0.2)], [1, shade(WOOD, -0.35)]]);
      g.fillRect(px, -28, 4, 48);
    }
    g.fillStyle = shade(WOOD, -0.3);
    g.fillRect(-15, -25, 30, 27);
    planks(g, -13.5, -23.5, 27, 24, shade(WOOD, -0.05), false, 4.8, 151);
    // Notices: parchment sheets pinned at odd angles.
    const sheet = (x: number, y: number, w: number, h: number, a: number, tint: string, draw?: () => void) => {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = tint;
      g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = 'rgba(90,60,30,0.18)';
      g.fillRect(-w / 2, h / 2 - 1.5, w, 1.5);
      g.strokeStyle = 'rgba(50,35,20,0.55)';
      g.lineWidth = 0.5;
      if (draw) draw();
      else {
        for (let ly = -h / 2 + 2.5; ly < h / 2 - 1.5; ly += 2) {
          g.beginPath();
          g.moveTo(-w / 2 + 1.5, ly);
          g.lineTo(w / 2 - 1.5 - ((ly * 7) % 3), ly);
          g.stroke();
        }
      }
      g.fillStyle = '#b02a2a';
      g.beginPath();
      g.arc(0, -h / 2 + 1, 0.8, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };
    sheet(8, -16, 8, 9, 0.12, '#e8dcbc');
    sheet(7.5, -4.5, 9, 8, -0.08, '#d9cba4');
    sheet(-10, -3, 6, 7, 0.15, '#efe4c8');
    // The wanted poster — a rough sketch of a face over a reward line.
    sheet(-3, -12, 12, 15, -0.05, '#f0e2c0', () => {
      g.fillStyle = '#7a1a1a';
      g.fillRect(-4.5, -6, 9, 1.4);
      g.strokeStyle = '#3a2a1a';
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(0, -0.5, 2.6, 0, Math.PI * 2);
      g.moveTo(-3.2, -1.2);
      g.quadraticCurveTo(0, -5, 3.2, -1.2);
      g.moveTo(-3.5, 4);
      g.quadraticCurveTo(0, 1.6, 3.5, 4);
      g.stroke();
      g.fillStyle = '#3a2a1a';
      g.fillRect(-1.4, -1, 0.7, 0.7);
      g.fillRect(0.8, -1, 0.7, 0.7);
      g.fillRect(-3, 5.4, 6, 0.6);
    });
    // Little shingled roof.
    shingleRoof(g, [[-19, -26], [0, -36], [19, -26]], '#6a4438', 3.2, 153);
    g.strokeStyle = '#331f1a';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-19, -26);
    g.lineTo(0, -36);
    g.lineTo(19, -26);
    g.stroke();
    // A notice blown down into the street.
    g.fillStyle = '#e8dcbc';
    g.save();
    g.translate(13, 18);
    g.rotate(0.5);
    g.fillRect(-3.5, -2.5, 7, 5);
    g.restore();
  },
};

// --- Pillory: the town square's wooden stocks on a plank stand. -------------
const pillory: PropArt = {
  origin: [0, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 2, 16, 17, 5),
  body: (g) => {
    // Plank stand with a step.
    planks(g, -16, 10, 32, 7, shade(WOOD, -0.1), true, 4, 161);
    g.fillStyle = shade(WOOD, 0.3);
    g.fillRect(-16, 9, 32, 1.4);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(-16, 15.5, 32, 1.5);
    // Post.
    g.fillStyle = hgrad(g, -2.6, 2.6, [[0, shade(WOOD, 0.25)], [1, shade(WOOD, -0.35)]]);
    g.fillRect(-2.6, -30, 5.2, 40);
    g.fillStyle = shade(WOOD, 0.3);
    g.beginPath();
    g.moveTo(-3.4, -30);
    g.lineTo(3.4, -30);
    g.lineTo(0, -33);
    g.closePath();
    g.fill();
    // The yoke: two boards meeting over three holes.
    const board = (y: number, h: number) => {
      g.fillStyle = vgrad(g, y, y + h, [[0, shade(WOOD, 0.22)], [1, shade(WOOD, -0.22)]]);
      rr(g, -15, y, 30, h, 1);
      g.fill();
    };
    board(-24, 5);
    board(-19, 5);
    g.fillStyle = '#1a120c';
    for (const [hx, hr] of [[-9.5, 2], [0, 3], [9.5, 2]] as const) {
      g.beginPath();
      g.arc(hx, -19, hr, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(-15, -19.3, 30, 0.6);
    // Iron hinge and padlock.
    g.fillStyle = '#3a3640';
    g.fillRect(-15.5, -22, 3, 6);
    g.strokeStyle = '#5a5560';
    g.lineWidth = 0.9;
    g.beginPath();
    g.arc(14.5, -18, 1.6, Math.PI, 0);
    g.stroke();
    g.fillStyle = '#6a6470';
    g.fillRect(12.8, -18, 3.4, 3);
  },
};

// --- Plaza mosaic: a paved rosette inlaid in the square's floor. ------------
// Floor dressing (no footprint), sized to sit under the 2×2 fountain.
const MOSAIC_Y = 6; // centre, aligned with the fountain basin
const plazaMosaic: PropArt = {
  origin: [H, H],
  ink: '#3a3434',
  finish: { shading: 0.1, rimAlpha: 0.05, outline: 0.45 },
  body: (g) => {
    const pale = '#c9bb9e';
    const dark = '#6e6258';
    const ochre = '#b8813e';
    const terracotta = '#9a4a36';
    const slate = '#5a6478';
    const cy = MOSAIC_Y;
    const ring = (r0: number, r1: number) => {
      g.beginPath();
      g.arc(0, cy, r1, 0, Math.PI * 2);
      g.arc(0, cy, r0, 0, Math.PI * 2, true);
    };
    const r = rng(171);
    // Field of pale setts laid in rings.
    g.fillStyle = shade(pale, -0.4);
    g.beginPath();
    g.arc(0, cy, 70, 0, Math.PI * 2);
    g.fill();
    for (let rad = 6; rad < 56; rad += 5) {
      const n = Math.max(6, Math.round((rad * Math.PI * 2) / 6.5));
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2 + rad * 0.37;
        const a1 = a0 + (Math.PI * 2) / n - 0.06;
        g.fillStyle = shade(pale, (r() - 0.5) * 0.18);
        g.beginPath();
        g.arc(0, cy, rad + 2.1, a0, a1);
        g.arc(0, cy, rad - 2.1, a1, a0, true);
        g.closePath();
        g.fill();
      }
    }
    // Voussoir band of alternating dark and light blocks, framed by curbs.
    g.fillStyle = shade(dark, -0.2);
    ring(54, 70);
    g.fill();
    const blocks = 32;
    for (let i = 0; i < blocks; i++) {
      const a0 = (i / blocks) * Math.PI * 2 + 0.02;
      const a1 = ((i + 1) / blocks) * Math.PI * 2 - 0.02;
      g.fillStyle = shade(i % 2 === 0 ? dark : pale, (r() - 0.5) * 0.14);
      g.beginPath();
      g.arc(0, cy, 65, a0, a1);
      g.arc(0, cy, 57.5, a1, a0, true);
      g.closePath();
      g.fill();
    }
    g.fillStyle = shade(pale, 0.12);
    ring(55, 57);
    g.fill();
    g.fillStyle = shade(dark, 0.05);
    ring(66, 69.5);
    g.fill();
    // Compass star: long ochre/terracotta points, short slate diagonals.
    const point = (a: number, len: number, half: number, lit: string, dim: string) => {
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      for (const [side, col] of [[1, lit], [-1, dim]] as const) {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, cy);
        g.lineTo(ux * len, cy + uy * len);
        g.lineTo(-uy * half * side + ux * len * 0.28, cy + ux * half * side + uy * len * 0.28);
        g.closePath();
        g.fill();
      }
    };
    for (let i = 0; i < 4; i++) point(Math.PI / 4 + (i * Math.PI) / 2, 40, 7, shade(slate, 0.15), shade(slate, -0.2));
    for (let i = 0; i < 4; i++) {
      const lit = i % 2 === 0 ? ochre : terracotta;
      point((i * Math.PI) / 2 - Math.PI / 2, 53, 9, shade(lit, 0.12), shade(lit, -0.22));
    }
    g.fillStyle = shade(dark, -0.1);
    g.beginPath();
    g.arc(0, cy, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = ochre;
    g.beginPath();
    g.arc(0, cy, 5, 0, Math.PI * 2);
    g.fill();
    // Wear: grime in the joints, a few cracked and sunken setts, moss.
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 66;
      g.fillStyle = withAlpha(r() < 0.6 ? '#2a2420' : '#5f7a3a', 0.12 + r() * 0.16);
      g.beginPath();
      g.ellipse(Math.cos(a) * d, cy + Math.sin(a) * d, 2 + r() * 6, 1 + r() * 3, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(30,24,20,0.45)';
    g.lineWidth = 0.6;
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2;
      const d = 20 + r() * 40;
      let x = Math.cos(a) * d;
      let y = cy + Math.sin(a) * d;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        x += (r() - 0.5) * 7;
        y += (r() - 0.5) * 7;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  },
};

// --- Pigeons: a little flock pecking at crumbs on the cobbles. --------------
// Floor dressing (no footprint); the birds are all in the live pass.
const PIGEONS: { x: number; y: number; phase: number; tint: string }[] = [
  { x: -11, y: 2, phase: 0.3, tint: '#8a8ea0' },
  { x: 7, y: -5, phase: 2.1, tint: '#9a9cac' },
  { x: 13, y: 8, phase: 4.4, tint: '#6e7284' },
  { x: -3, y: 11, phase: 5.7, tint: '#a8a6b0' },
];

function drawPigeon(g: Ctx, x: number, y: number, dir: number, peck: number, tint: string): void {
  g.save();
  g.translate(x, y);
  g.scale(dir, 1);
  g.fillStyle = 'rgba(8,5,14,0.3)';
  g.beginPath();
  g.ellipse(0, 3.2, 4.4, 1.2, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#c8645a';
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(-0.6, 1.4);
  g.lineTo(-0.9, 3.2);
  g.moveTo(0.8, 1.4);
  g.lineTo(0.9, 3.2);
  g.stroke();
  const ink = '#24222c';
  // Tail, body, wing.
  g.fillStyle = shade(tint, -0.3);
  g.beginPath();
  g.moveTo(-2.5, -0.6);
  g.lineTo(-6.4, -1.8 + peck * 1.4);
  g.lineTo(-6, 0.6 + peck * 1.2);
  g.closePath();
  g.fill();
  g.fillStyle = tint;
  g.beginPath();
  g.ellipse(0, 0, 3.8, 2.4, -0.1 + peck * 0.25, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = 0.5;
  g.stroke();
  g.fillStyle = shade(tint, -0.15);
  g.beginPath();
  g.ellipse(-0.8, -0.3, 2.4, 1.3, -0.15, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = shade(tint, -0.45);
  g.fillRect(-1.6, 0.1, 1.8, 0.45);
  // Neck and head bob down to peck.
  const hx = 3 + peck * 1.6;
  const hy = -2.4 + peck * 4;
  g.fillStyle = '#5a8a7a';
  g.beginPath();
  g.ellipse((hx + 2) / 2, (hy - 0.8) / 2, 1.4, 1.6, 0.4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = withAlpha('#9a6ab0', 0.7);
  g.beginPath();
  g.arc((hx + 2) / 2 + 0.3, (hy - 0.8) / 2 + 0.5, 0.8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = shade(tint, 0.05);
  g.beginPath();
  g.arc(hx, hy, 1.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = ink;
  g.stroke();
  g.fillStyle = '#d8c8b8';
  g.beginPath();
  g.moveTo(hx + 1.3, hy - 0.2);
  g.lineTo(hx + 2.6, hy + 0.4);
  g.lineTo(hx + 1.2, hy + 0.6);
  g.closePath();
  g.fill();
  g.fillStyle = '#e07a3a';
  g.fillRect(hx + 0.2, hy - 0.6, 0.7, 0.7);
  g.restore();
}

const pigeons: PropArt = {
  origin: [0, 0],
  ink: '#3a3434',
  finish: { shading: 0, rimAlpha: 0, outline: 0 },
  body: (g) => {
    const r = rng(181);
    for (let i = 0; i < 22; i++) {
      g.fillStyle = r() < 0.5 ? '#e6d2a4' : '#c9a86a';
      g.fillRect(-14 + r() * 28, -6 + r() * 18, 0.9 + r() * 0.8, 0.9 + r() * 0.6);
    }
  },
  live: (g, t) => {
    for (const p of PIGEONS) {
      // Each bird potters to and fro, turning now and then, and pecks in
      // short bursts between looking about.
      const turn = Math.floor(t / 3.1 + p.phase) % 2 === 0 ? 1 : -1;
      const x = p.x + Math.sin(t * 0.45 + p.phase) * 3.5;
      const y = p.y + Math.sin(t * 0.31 + p.phase * 1.7) * 1.5;
      const cyc = (t * 0.9 + p.phase) % 2.4;
      const peck = cyc < 0.9 ? Math.max(0, Math.sin(cyc * Math.PI * 4.4)) : 0;
      drawPigeon(g, x, y, turn, peck, p.tint);
    }
  },
};

// ===========================================================================
// Outskirts — the Capital's ragged edge, down to the sewers
// ===========================================================================

/** A tuft of rough grass at (x, y), `s` tall. */
function grassTuft(g: Ctx, x: number, y: number, s: number, r: () => number): void {
  g.strokeStyle = r() < 0.5 ? '#4a5a2e' : '#5e6e36';
  g.lineWidth = 0.9;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const dx = (i - 1.5) * 1.3;
    g.moveTo(x + dx, y);
    g.quadraticCurveTo(x + dx * 1.4, y - s * 0.6, x + dx * 2.2 + (r() - 0.5) * 2, y - s * (0.7 + r() * 0.4));
  }
  g.stroke();
}

// --- Sewer entrance: an arched outfall tunnel in a retaining wall. 3×2. -----
// A path's end (a base prop): foes run up into the mouth on its bottom-centre
// cell. Its depth line sits at the mouth so they stay drawn in front of the
// tunnel's darkness as they go in.
const SEWER_ARCH_Y = 12; // springline of the tunnel arch
const SEWER_ARCH_R = 22;
const sewerEntrance: PropArt = {
  origin: [T, H],
  ink: '#1e2420',
  shadow: (g) => floorShadow(g, 0, 44, 80, 7, 0.45),
  body: (g) => {
    const st = '#7a7c74';
    const slime = '#4a5a2a';
    const r = rng(205);
    // Earth bank above the wall.
    g.fillStyle = vgrad(g, -52, -38, [[0, '#3a4628'], [1, '#262c1c']]);
    g.fillRect(-74, -52, 148, 14);
    // Retaining wall, coping and buttresses.
    masonry(g, -72, -40, 144, 84, st, 6, 201);
    g.fillStyle = shade(st, 0.25);
    g.fillRect(-74, -42, 148, 4);
    g.fillStyle = shade(st, -0.35);
    g.fillRect(-73, -38, 146, 1.4);
    masonry(g, -73, -36, 10, 80, shade(st, 0.08), 5, 203);
    masonry(g, 63, -36, 10, 80, shade(st, -0.14), 5, 204);
    for (const bx of [-73, 63]) {
      g.fillStyle = shade(st, 0.22);
      g.fillRect(bx - 1, -38, 12, 3);
    }
    // Damp weeping down from the coping.
    for (let i = 0; i < 16; i++) {
      const x = -66 + r() * 132;
      if (Math.abs(x) < 32) continue;
      const len = 10 + r() * 34;
      g.fillStyle = vgrad(g, -38, -38 + len, [[0, withAlpha(slime, 0.55)], [1, withAlpha(slime, 0)]]);
      g.fillRect(x, -38, 2 + r() * 3, len);
    }
    // The tunnel mouth.
    const cy = SEWER_ARCH_Y;
    const R = SEWER_ARCH_R;
    const arch = (rad: number, spring: number, floor: number) => {
      g.beginPath();
      g.moveTo(-rad, floor);
      g.lineTo(-rad, spring);
      g.arc(0, spring, rad, Math.PI, 0);
      g.lineTo(rad, floor);
      g.closePath();
    };
    g.fillStyle = shade(st, 0.12);
    arch(R + 8, cy, 44);
    g.fill();
    g.strokeStyle = withAlpha(shade(st, -0.5), 0.7);
    g.lineWidth = 0.8;
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      g.beginPath();
      g.moveTo(Math.cos(a) * R, cy + Math.sin(a) * R);
      g.lineTo(Math.cos(a) * (R + 8), cy + Math.sin(a) * (R + 8));
      g.stroke();
    }
    for (const y of [20, 30, 40]) {
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * R, y);
        g.lineTo(s * (R + 8), y);
        g.stroke();
      }
    }
    g.fillStyle = shade(st, 0.3);
    g.beginPath();
    g.moveTo(-4, cy - R - 9.5);
    g.lineTo(4, cy - R - 9.5);
    g.lineTo(2.6, cy - R + 0.5);
    g.lineTo(-2.6, cy - R + 0.5);
    g.closePath();
    g.fill();
    // Darkness falling away into the tunnel, with receding ribs.
    const dark = g.createRadialGradient(0, 24, 2, 0, 22, 30);
    dark.addColorStop(0, '#020403');
    dark.addColorStop(0.55, '#0a100c');
    dark.addColorStop(1, '#222a24');
    g.fillStyle = dark;
    arch(R, cy, 44);
    g.fill();
    for (const [k, a] of [[0.8, 0.45], [0.6, 0.28]] as const) {
      g.strokeStyle = withAlpha('#4a5446', a);
      g.lineWidth = 1.3;
      arch(R * k, cy + (1 - k) * 8, 44 - (1 - k) * 22);
      g.stroke();
    }
    // Walkway ledges and the channel of murky water running out.
    g.fillStyle = withAlpha(shade(st, -0.3), 0.85);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * R, 44);
      g.lineTo(s * 13, 44);
      g.lineTo(s * 5, 33);
      g.lineTo(s * R * 0.6, 33);
      g.closePath();
      g.fill();
    }
    g.fillStyle = vgrad(g, 32, 44, [[0, '#121a10'], [1, '#3a4a28']]);
    g.beginPath();
    g.moveTo(-13, 44);
    g.lineTo(-5, 33);
    g.lineTo(5, 33);
    g.lineTo(13, 44);
    g.closePath();
    g.fill();
    // Roots and slime hanging from the crown.
    g.strokeStyle = withAlpha('#3a4a24', 0.8);
    g.lineWidth = 0.9;
    for (const [x, len] of [[-12, 9], [-4, 5], [7, 11], [14, 6]] as const) {
      g.beginPath();
      g.moveTo(x, cy - Math.sqrt(R * R - x * x) + 1);
      g.quadraticCurveTo(x + 1.5, cy - Math.sqrt(R * R - x * x) + len * 0.6, x - 0.5, cy - Math.sqrt(R * R - x * x) + len);
      g.stroke();
    }
    // Stone sill the water spills over.
    g.fillStyle = shade(st, 0.18);
    g.fillRect(-R, 41, R * 2, 3);
    g.fillStyle = withAlpha(slime, 0.7);
    g.fillRect(-8, 41, 16, 3);
    // The iron grate, wrenched off its hinges and leaned against the wall.
    g.save();
    g.translate(-45, 18);
    g.rotate(-0.08);
    g.strokeStyle = '#2e2622';
    g.lineWidth = 2;
    g.strokeRect(-9, -24, 18, 48);
    g.lineWidth = 1.4;
    g.beginPath();
    for (let x = -5; x <= 5; x += 3.4) {
      g.moveTo(x, -24);
      g.lineTo(x, 24);
    }
    g.moveTo(-9, -6);
    g.lineTo(9, -6);
    g.moveTo(-9, 10);
    g.lineTo(9, 10);
    g.stroke();
    g.strokeStyle = withAlpha('#8a4a2a', 0.55);
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-8, -23);
    g.lineTo(-8, 8);
    g.moveTo(3, -2);
    g.lineTo(3, 20);
    g.stroke();
    g.restore();
    // Rusted outfall pipe on the right, slime trailing below it.
    g.fillStyle = vgrad(g, 14, 44, [[0, withAlpha(slime, 0.75)], [1, withAlpha(slime, 0.1)]]);
    g.fillRect(48, 14, 4, 30);
    g.fillStyle = '#5a4030';
    g.beginPath();
    g.arc(50, 12, 5.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0a0c0a';
    g.beginPath();
    g.arc(50, 12, 3.4, 0, Math.PI * 2);
    g.fill();
    // Torch bracket by the mouth.
    g.strokeStyle = '#22252c';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(40, -4);
    g.lineTo(40, -9);
    g.stroke();
    ironCup(g, 40, -12, 3.4);
    // Weeds along the wall's foot and the bank's lip.
    for (let i = 0; i < 22; i++) {
      const x = -70 + r() * 140;
      if (Math.abs(x) < R + 9) continue;
      grassTuft(g, x, 44, 4 + r() * 4, r);
    }
    for (let i = 0; i < 18; i++) grassTuft(g, -72 + r() * 144, -41, 3 + r() * 4, r);
  },
  live: (g, t) => {
    flame(g, 40, -14, 3.4, t, 0.7);
    g.save();
    // Murky water sliding out of the tunnel.
    for (let i = 0; i < 6; i++) {
      const k = (t * 0.55 + i / 6) % 1;
      const y = 33 + k * 10;
      const half = 5 + k * 8;
      const x = ((i * 0.37) % 1 - 0.5) * half * 1.3;
      g.strokeStyle = `rgba(150,180,120,${0.35 * Math.sin(k * Math.PI)})`;
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x * 1.05, y + 2);
      g.stroke();
    }
    // Spilling over the sill.
    for (const x of [-5, -1, 3, 6]) {
      g.strokeStyle = `rgba(140,170,110,${0.35 + 0.15 * Math.sin(t * 7 + x)})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, 41);
      g.lineTo(x + Math.sin(t * 5 + x) * 0.4, 46);
      g.stroke();
    }
    // A drip from the pipe and its splash.
    const k = (t / 1.3) % 1;
    if (k < 0.75) {
      const y = 17 + (k / 0.75) ** 2 * 26;
      g.fillStyle = 'rgba(160,190,130,0.8)';
      g.beginPath();
      g.ellipse(50, y, 0.9, 1.4, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      const s = (k - 0.75) / 0.25;
      g.strokeStyle = `rgba(160,190,130,${0.6 * (1 - s)})`;
      g.lineWidth = 0.7;
      g.beginPath();
      g.ellipse(50, 44, 1 + s * 4, 0.5 + s * 1.4, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  },
};

// --- Wall tower: a round tower of the city wall under a slate cone. 2×2. ---
const wallTower: PropArt = {
  origin: [H, H],
  ink: '#22242c',
  shadow: (g) => floorShadow(g, 6, 40, 36, 10, 0.5),
  body: (g) => {
    const st = '#8a8478';
    // The drum: coursed stone shaded round the curve.
    g.save();
    g.beginPath();
    g.moveTo(-26, -42);
    g.lineTo(26, -42);
    g.lineTo(26, 36);
    g.ellipse(0, 36, 26, 7, 0, 0, Math.PI);
    g.closePath();
    g.clip();
    masonry(g, -27, -44, 54, 90, st, 5.5, 211);
    g.fillStyle = hgrad(g, -26, 26, [[0, 'rgba(255,240,210,0.14)'], [0.35, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.5)']]);
    g.fillRect(-27, -44, 54, 90);
    g.restore();
    // Battered footing.
    g.fillStyle = hgrad(g, -29, 29, [[0, shade(st, -0.05)], [1, shade(st, -0.45)]]);
    g.beginPath();
    g.moveTo(-26, 28);
    g.lineTo(26, 28);
    g.lineTo(29, 38);
    g.ellipse(0, 38, 29, 7, 0, 0, Math.PI);
    g.closePath();
    g.fill();
    // Arrow slits and a lit window.
    g.fillStyle = '#14121a';
    rr(g, -15, -14, 3, 13, 1.4);
    g.fill();
    rr(g, 11, -14, 3, 13, 1.4);
    g.fill();
    litWindow(g, -4, -30, 8, 10, '#3a3036', { arch: true });
    // Low arched door.
    g.fillStyle = shade(st, 0.18);
    g.beginPath();
    g.moveTo(-9, 40);
    g.lineTo(-9, 22);
    g.arc(0, 22, 9, Math.PI, 0);
    g.lineTo(9, 40);
    g.closePath();
    g.fill();
    g.save();
    g.beginPath();
    g.moveTo(-7, 40);
    g.lineTo(-7, 22);
    g.arc(0, 22, 7, Math.PI, 0);
    g.lineTo(7, 40);
    g.closePath();
    g.clip();
    planks(g, -7, 14, 14, 26, '#5a3a24', true, 3.5, 212);
    g.restore();
    g.fillStyle = '#2a2420';
    g.fillRect(-7, 27, 14, 1.2);
    g.fillRect(-7, 34, 14, 1.2);
    // Corbelled parapet.
    g.fillStyle = shade(st, -0.25);
    for (let x = -27; x <= 23; x += 7) {
      g.beginPath();
      g.moveTo(x, -42);
      g.lineTo(x + 4, -42);
      g.lineTo(x + 3, -37);
      g.lineTo(x + 1, -37);
      g.closePath();
      g.fill();
    }
    masonry(g, -30, -52, 60, 10, shade(st, 0.06), 5, 213);
    g.fillStyle = 'rgba(10,8,20,0.35)';
    g.fillRect(14, -52, 16, 10);
    // Conical slate roof with a gilt finial.
    shingleRoof(g, [[-34, -50], [0, -94], [34, -50]], SLATE, 4, 214);
    g.fillStyle = shade(SLATE, -0.35);
    g.beginPath();
    g.ellipse(0, -50, 34, 4.5, 0, 0, Math.PI);
    g.fill();
    g.strokeStyle = shade(SLATE, -0.55);
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-34, -50);
    g.lineTo(0, -94);
    g.lineTo(34, -50);
    g.stroke();
    g.fillStyle = 'rgba(10,8,20,0.3)';
    g.beginPath();
    g.moveTo(0, -94);
    g.lineTo(34, -50);
    g.lineTo(14, -50);
    g.closePath();
    g.fill();
    g.fillStyle = GOLD;
    g.fillRect(-0.7, -104, 1.4, 11);
    g.beginPath();
    g.arc(0, -104, 1.6, 0, Math.PI * 2);
    g.fill();
    // Torch beside the door.
    g.strokeStyle = '#22252c';
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(16, 26);
    g.lineTo(16, 22);
    g.stroke();
    ironCup(g, 16, 19, 3);
  },
  live: (g, t) => {
    flame(g, 16, 17, 3, t, 1.1);
    // The city's pennant snapping from the finial.
    const w1 = Math.sin(t * 6.2) * 1.4;
    const w2 = Math.sin(t * 6.2 - 1.6) * 2;
    g.fillStyle = '#8e1f2d';
    g.beginPath();
    g.moveTo(0.7, -102);
    g.quadraticCurveTo(8, -102 + w1, 16, -99 + w2);
    g.quadraticCurveTo(8, -96 + w1, 0.7, -96);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(30,8,12,0.7)';
    g.lineWidth = 0.6;
    g.stroke();
  },
};

// --- Shack: a ramshackle plank hovel under a lean-to roof. 2×2. -------------
const shack: PropArt = {
  origin: [H, H],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 4, 38, 42, 10, 0.5),
  body: (g) => {
    const wood = '#6e5a44';
    const r = rng(221);
    // Crooked stovepipe behind the roof.
    g.save();
    g.translate(18, -24);
    g.rotate(0.08);
    g.fillStyle = hgrad(g, -2.5, 2.5, [[0, '#5a5a60'], [1, '#26262c']]);
    g.fillRect(-2.5, -26, 5, 26);
    g.fillStyle = '#3a3a40';
    g.fillRect(-4, -28, 8, 2.5);
    g.restore();
    // Footing stones.
    for (let x = -30; x < 30; x += 6 + r() * 3) {
      g.fillStyle = shade('#7a766e', (r() - 0.5) * 0.3);
      rr(g, x, 34, 6 + r() * 2, 5, 1.6);
      g.fill();
    }
    // Plank walls, the top edge following the roof's slope.
    g.save();
    g.beginPath();
    g.moveTo(-30, -14);
    g.lineTo(28, -6);
    g.lineTo(28, 36);
    g.lineTo(-30, 36);
    g.closePath();
    g.clip();
    planks(g, -30, -16, 58, 52, wood, true, 5, 222);
    g.fillStyle = hgrad(g, -30, 28, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.3)']]);
    g.fillRect(-30, -16, 58, 52);
    g.restore();
    // A patch board nailed across a gap.
    g.save();
    g.translate(18, 4);
    g.rotate(-0.15);
    g.fillStyle = '#8a7050';
    g.fillRect(-6, -3, 12, 6);
    g.fillStyle = '#2a2420';
    for (const x of [-4.6, 4.6]) g.fillRect(x - 0.5, -0.5, 1, 1);
    g.restore();
    // Window with a guttering candle and a shutter hanging by one hinge.
    litWindow(g, -22, 4, 10, 9, '#3a2a1a');
    g.fillStyle = 'rgba(20,10,5,0.35)';
    g.fillRect(-22, 4, 10, 9);
    g.save();
    g.translate(-12, 4);
    g.rotate(0.5);
    g.fillStyle = shade(wood, 0.1);
    g.fillRect(0, 0, 4.5, 9);
    g.restore();
    // A door left ajar.
    g.fillStyle = '#120c08';
    g.fillRect(2, 12, 14, 24);
    planks(g, 2, 12, 9, 24, shade(wood, -0.08), true, 3, 223);
    g.fillStyle = '#3a3640';
    g.fillRect(9, 23, 1.5, 1.5);
    // Lean-to roof of warped boards, a faded tarp lashed over a hole.
    const roof: [number, number][] = [[-36, -12], [-30, -40], [30, -30], [36, -4]];
    g.save();
    g.beginPath();
    g.moveTo(roof[0][0], roof[0][1]);
    for (const [x, y] of roof.slice(1)) g.lineTo(x, y);
    g.closePath();
    g.clip();
    g.translate(0, -22);
    g.rotate(0.17);
    planks(g, -44, -24, 88, 48, shade(wood, -0.12), false, 4.5, 224);
    g.restore();
    g.strokeStyle = shade(wood, -0.5);
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-36, -12);
    g.lineTo(36, -4);
    g.stroke();
    g.fillStyle = vgrad(g, -30, -16, [[0, '#5a6a7a'], [1, '#3e4a58']]);
    g.beginPath();
    g.moveTo(-6, -31);
    g.lineTo(12, -27);
    g.lineTo(14, -14);
    g.lineTo(-8, -17);
    g.closePath();
    g.fill();
    g.strokeStyle = '#c9b48c';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(-8, -17);
    g.lineTo(-12, -10);
    g.moveTo(14, -14);
    g.lineTo(18, -7);
    g.stroke();
    // Firewood stacked against the side.
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 3 - (row === 2 ? 1 : 0); i++) {
        const x = 30 + i * 3.4 + row * 1.7;
        const y = 34 - row * 3.2;
        g.fillStyle = '#5a3f28';
        g.beginPath();
        g.arc(x, y, 1.8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#b08a5a';
        g.beginPath();
        g.arc(x - 0.2, y - 0.2, 1, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Rain barrel by the corner.
    g.fillStyle = vgrad(g, 24, 37, [[0, shade(WOOD, 0.12)], [1, shade(WOOD, -0.32)]]);
    rr(g, -38, 24, 9, 13, 2.5);
    g.fill();
    g.fillStyle = '#3a3640';
    g.fillRect(-38, 27, 9, 0.9);
    g.fillRect(-38, 33, 9, 0.9);
    g.fillStyle = '#1e2a30';
    g.beginPath();
    g.ellipse(-33.5, 24.4, 4.5, 1.3, 0, 0, Math.PI * 2);
    g.fill();
  },
};

// --- Fence: a weathered rail fence, one rail broken. ------------------------
const fence: PropArt = {
  origin: [0, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 2, 12, 20, 3.5),
  body: (g) => {
    const w = '#7a6448';
    const rail = (x0: number, y0: number, x1: number, y1: number) => {
      g.strokeStyle = shade(w, -0.3);
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.strokeStyle = shade(w, 0.18);
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x0, y0 - 0.9);
      g.lineTo(x1, y1 - 0.9);
      g.stroke();
    };
    rail(-21, -9, 21, -8);
    rail(-21, 1, 3, 1.5);
    rail(6, 2.5, 18, 9.5);
    const post = (x: number, lean: number) => {
      g.save();
      g.translate(x, 12);
      g.rotate(lean);
      g.fillStyle = hgrad(g, -2, 2, [[0, shade(w, 0.2)], [1, shade(w, -0.35)]]);
      g.fillRect(-2, -26, 4, 26);
      g.fillStyle = shade(w, 0.28);
      g.beginPath();
      g.moveTo(-2, -26);
      g.lineTo(0, -29);
      g.lineTo(2, -26);
      g.closePath();
      g.fill();
      g.restore();
    };
    post(-17, -0.05);
    post(0, 0);
    post(17, 0.16);
    const r = rng(231);
    for (let i = 0; i < 6; i++) grassTuft(g, -20 + r() * 40, 12, 3 + r() * 3, r);
  },
};

// --- Laundry line: washing pegged out between two posts. 2×1. ---------------
const LAUNDRY: { x: number; w: number; h: number; col: string; kind: 'sheet' | 'shirt' | 'trousers' }[] = [
  { x: -25, w: 16, h: 18, col: '#e6e0d0', kind: 'sheet' },
  { x: -4, w: 13, h: 13, col: '#7a8aa8', kind: 'shirt' },
  { x: 12, w: 9, h: 16, col: '#6a5440', kind: 'trousers' },
  { x: 27, w: 9, h: 10, col: '#b04a3a', kind: 'sheet' },
];
const laundryY = (x: number) => -30 + 8 * (1 - (x / 40) ** 2);

const laundryLine: PropArt = {
  origin: [H, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 2, 16, 44, 5, 0.35),
  body: (g) => {
    for (const px of [-40, 40]) {
      g.fillStyle = hgrad(g, px - 2, px + 2, [[0, shade(WOOD, 0.2)], [1, shade(WOOD, -0.35)]]);
      g.fillRect(px - 2, -33, 4, 50);
      g.fillStyle = shade(WOOD, -0.1);
      g.fillRect(px - 5, -33, 10, 2.5);
    }
    // A wicker basket of washing still to hang.
    g.fillStyle = vgrad(g, 8, 17, [[0, '#b08a5a'], [1, '#6e5434']]);
    g.beginPath();
    g.moveTo(-6, 9);
    g.lineTo(10, 9);
    g.lineTo(8, 17);
    g.lineTo(-4, 17);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(60,40,20,0.5)';
    g.lineWidth = 0.5;
    for (let x = -4; x < 9; x += 2.5) {
      g.beginPath();
      g.moveTo(x, 9.5);
      g.lineTo(x - 0.4, 16.5);
      g.stroke();
    }
    g.fillStyle = '#e6e0d0';
    g.beginPath();
    g.ellipse(2, 8.6, 7, 2.4, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = '#7a8aa8';
    g.beginPath();
    g.ellipse(5, 8.4, 3, 1.4, 0, Math.PI, 0);
    g.fill();
  },
  live: (g, t) => {
    g.save();
    g.strokeStyle = '#c9b48c';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-40, -30);
    g.quadraticCurveTo(0, -14, 40, -30);
    g.stroke();
    const ink = '#2a2430';
    for (const c of LAUNDRY) {
      const top = laundryY(c.x);
      const swing = Math.sin(t * 1.7 + c.x * 0.13) * 0.12;
      g.save();
      g.translate(c.x, top);
      g.rotate(swing);
      g.fillStyle = vgrad(g, 0, c.h, [[0, shade(c.col, 0.12)], [1, shade(c.col, -0.2)]]);
      g.beginPath();
      if (c.kind === 'shirt') {
        g.moveTo(-c.w / 2, 0);
        g.lineTo(c.w / 2, 0);
        g.lineTo(c.w / 2 + 3, 5);
        g.lineTo(c.w / 2 - 1, 6);
        g.lineTo(c.w / 2 - 1.5, c.h);
        g.lineTo(-c.w / 2 + 1.5, c.h);
        g.lineTo(-c.w / 2 + 1, 6);
        g.lineTo(-c.w / 2 - 3, 5);
      } else if (c.kind === 'trousers') {
        g.moveTo(-c.w / 2, 0);
        g.lineTo(c.w / 2, 0);
        g.lineTo(c.w / 2 + 0.5, c.h);
        g.lineTo(1, c.h);
        g.lineTo(0, 5);
        g.lineTo(-1, c.h);
        g.lineTo(-c.w / 2 - 0.5, c.h);
      } else {
        const wave = Math.sin(t * 2.3 + c.x) * 1.2;
        g.moveTo(-c.w / 2, 0);
        g.lineTo(c.w / 2, 0);
        g.lineTo(c.w / 2 + wave * 0.5, c.h);
        g.quadraticCurveTo(0, c.h + wave, -c.w / 2 + wave * 0.5, c.h);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = ink;
      g.lineWidth = 0.6;
      g.stroke();
      g.fillStyle = '#d8c8a0';
      for (const px of [-c.w / 2 + 1.5, c.w / 2 - 1.5]) g.fillRect(px - 0.6, -1.2, 1.2, 2.4);
      g.restore();
    }
    g.restore();
  },
};

// --- Junk pile: broken crates, sacks and a cartwheel heaped by a wall. -----
const junkPile: PropArt = {
  origin: [0, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 2, 13, 20, 5),
  body: (g) => {
    // A cartwheel leaning at the back.
    g.save();
    g.translate(8, -6);
    g.scale(0.8, 1);
    g.strokeStyle = '#3a2a1c';
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(0, 0, 11, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = shade(WOOD, 0.05);
    g.lineWidth = 1.3;
    for (let a = 0; a < 6; a++) {
      if (a === 4) continue; // a missing spoke
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos((a * Math.PI) / 3 + 0.3) * 10, Math.sin((a * Math.PI) / 3 + 0.3) * 10);
      g.stroke();
    }
    g.fillStyle = '#4a4550';
    g.beginPath();
    g.arc(0, 0, 2.2, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // A stove-in crate.
    g.save();
    g.translate(-8, 4);
    g.rotate(-0.12);
    planks(g, -8, -9, 16, 14, shade(WOOD, 0.05), false, 3.5, 241);
    g.fillStyle = '#120c08';
    g.beginPath();
    g.moveTo(-2, -9);
    g.lineTo(6, -9);
    g.lineTo(4, -3);
    g.lineTo(0, -5);
    g.closePath();
    g.fill();
    g.strokeStyle = shade(WOOD, -0.4);
    g.lineWidth = 1.4;
    g.strokeRect(-8, -9, 16, 14);
    g.restore();
    // Sacks slumped in front.
    for (const [x, y, rx] of [[4, 8, 6], [-3, 10, 5]] as const) {
      g.fillStyle = vgrad(g, y - 5, y + 5, [[0, '#c9b48c'], [1, '#8a7650']]);
      g.beginPath();
      g.ellipse(x, y, rx, 4.6, 0.1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(60,40,20,0.35)';
      g.fillRect(x - 1, y - 4.5, 2, 2);
    }
    // A cracked clay pot and a stray plank.
    g.fillStyle = vgrad(g, 2, 13, [[0, '#b0603a'], [1, '#6e3420']]);
    g.beginPath();
    g.ellipse(14, 9, 4, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3a1a10';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(13, 5);
    g.lineTo(15, 8);
    g.lineTo(13.5, 11);
    g.stroke();
    g.save();
    g.translate(-12, -4);
    g.rotate(-0.9);
    g.fillStyle = shade(WOOD, 0.15);
    g.fillRect(-1.6, -14, 3.2, 20);
    g.restore();
  },
};

// --- Dead tree: a gnarled, leafless tree with a crow on a bough. ------------
const deadTree: PropArt = {
  origin: [0, 0],
  ink: '#1a1410',
  shadow: (g) => floorShadow(g, 4, 20, 16, 5, 0.45),
  body: (g) => {
    const bark = '#3e3228';
    const r = rng(251);
    g.lineCap = 'round';
    const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
      const x1 = x + Math.cos(ang) * len;
      const y1 = y + Math.sin(ang) * len;
      g.strokeStyle = bark;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(ang + 0.4) * len * 0.5, y + Math.sin(ang + 0.4) * len * 0.5, x1, y1);
      g.stroke();
      if (w > 2.2) {
        g.strokeStyle = withAlpha('#7a6a58', 0.5);
        g.lineWidth = w * 0.25;
        g.beginPath();
        g.moveTo(x - w * 0.25, y);
        g.lineTo(x1 - w * 0.25, y1);
        g.stroke();
      }
      if (depth === 0) return;
      const spread = 0.35 + r() * 0.35;
      branch(x1, y1, ang - spread, len * (0.62 + r() * 0.15), w * 0.62, depth - 1);
      branch(x1, y1, ang + spread * 0.9, len * (0.55 + r() * 0.15), w * 0.6, depth - 1);
    };
    // Root flare and trunk.
    g.fillStyle = bark;
    g.beginPath();
    g.moveTo(-10, 22);
    g.quadraticCurveTo(-4, 18, -4, 6);
    g.lineTo(4, 6);
    g.quadraticCurveTo(5, 18, 11, 22);
    g.quadraticCurveTo(3, 20, 0, 22);
    g.quadraticCurveTo(-3, 20, -10, 22);
    g.closePath();
    g.fill();
    branch(0, 8, -Math.PI / 2 - 0.08, 18, 7.5, 0);
    const top = { x: Math.cos(-Math.PI / 2 - 0.08) * 18, y: 8 + Math.sin(-Math.PI / 2 - 0.08) * 18 };
    branch(top.x, top.y, -Math.PI / 2 - 0.55, 13, 4.8, 3);
    branch(top.x, top.y, -Math.PI / 2 + 0.5, 12, 4.4, 3);
    branch(-0.6, 0, -0.35, 9, 2.6, 1);
    // A dark knot hole.
    g.fillStyle = '#120c08';
    g.beginPath();
    g.ellipse(1, 2, 1.6, 2.4, 0, 0, Math.PI * 2);
    g.fill();
    g.lineCap = 'butt';
    // The crow.
    const cx = 9;
    const cy = -17;
    g.fillStyle = '#16141c';
    g.beginPath();
    g.ellipse(cx, cy, 3.4, 2.2, -0.2, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(cx + 2.6, cy - 2.2, 1.6, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(cx - 2.6, cy);
    g.lineTo(cx - 6.4, cy + 2.6);
    g.lineTo(cx - 3, cy + 1.6);
    g.closePath();
    g.fill();
    g.fillStyle = '#3a3640';
    g.beginPath();
    g.moveTo(cx + 3.8, cy - 2.4);
    g.lineTo(cx + 6, cy - 1.8);
    g.lineTo(cx + 3.8, cy - 1.4);
    g.closePath();
    g.fill();
    g.fillStyle = '#c9a24a';
    g.fillRect(cx + 2.8, cy - 2.8, 0.7, 0.7);
  },
};

// --- Crop patch: a tilled vegetable bed edged with wattle. 2×1. -------------
const cropPatch: PropArt = {
  origin: [H, 0],
  ink: '#2a1a10',
  body: (g) => {
    const soil = '#4a3626';
    const r = rng(261);
    g.fillStyle = vgrad(g, -12, 16, [[0, shade(soil, 0.08)], [1, shade(soil, -0.15)]]);
    rr(g, -44, -12, 88, 27, 4);
    g.fill();
    // Furrows.
    for (const y of [-6, 2, 10]) {
      g.fillStyle = shade(soil, 0.18);
      g.fillRect(-41, y - 2.6, 82, 2);
      g.fillStyle = shade(soil, -0.3);
      g.fillRect(-41, y + 1.4, 82, 1.2);
    }
    // Cabbages.
    for (let x = -36; x <= 36; x += 9) {
      const cx = x + (r() - 0.5) * 2;
      g.fillStyle = '#3a6a4a';
      g.beginPath();
      g.arc(cx, -7, 3.8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7ab08a';
      g.beginPath();
      g.arc(cx - 0.6, -7.6, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    // Leeks.
    g.strokeStyle = '#5e8a3a';
    g.lineWidth = 1;
    for (let x = -38; x <= 38; x += 4.5) {
      const cx = x + (r() - 0.5) * 1.5;
      g.beginPath();
      g.moveTo(cx, 2);
      g.lineTo(cx - 1.4, -4);
      g.moveTo(cx, 2);
      g.lineTo(cx + 1.2, -3.6);
      g.stroke();
      g.fillStyle = '#e8e2c8';
      g.fillRect(cx - 0.6, 0, 1.2, 2);
    }
    // A few pumpkins in the front furrow.
    for (const x of [-30, -10, 14, 32]) {
      g.fillStyle = '#c8702a';
      g.beginPath();
      g.ellipse(x, 9.5, 3.4, 2.6, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(80,30,10,0.5)';
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(x, 7);
      g.lineTo(x, 12);
      g.stroke();
      g.fillStyle = '#4a6a2a';
      g.fillRect(x - 0.5, 6.4, 1, 1.4);
    }
    // Wattle edging along the front.
    g.fillStyle = '#6e5434';
    g.fillRect(-44, 13, 88, 3);
    g.strokeStyle = 'rgba(40,26,14,0.6)';
    g.lineWidth = 0.6;
    for (let x = -42; x < 44; x += 3) {
      g.beginPath();
      g.moveTo(x, 13);
      g.lineTo(x + 1.5, 16);
      g.stroke();
    }
  },
};

// --- Drain grate: an iron grille over a gutter drain. Floor dressing. ------
const drainGrate: PropArt = {
  origin: [0, 0],
  ink: '#1e2024',
  finish: { shading: 0.1, rimAlpha: 0.05, outline: 0.4 },
  body: (g) => {
    g.fillStyle = withAlpha('#3a4a24', 0.45);
    g.beginPath();
    g.ellipse(1, 3, 13, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4a4a50';
    rr(g, -10, -8, 20, 16, 2);
    g.fill();
    g.fillStyle = '#06080a';
    g.fillRect(-8, -6, 16, 12);
    g.fillStyle = '#3a3a42';
    for (let x = -6.5; x <= 6; x += 3.2) g.fillRect(x, -6, 1.6, 12);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(-10, -8, 20, 1);
  },
};

// --- Puddle: a muddy puddle holding the night sky. Floor dressing. ----------
const PUDDLE_PTS: [number, number][] = (() => {
  const r = rng(271);
  const pts: [number, number][] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const d = 0.72 + r() * 0.3;
    pts.push([Math.cos(a) * 21 * d, Math.sin(a) * 11 * d]);
  }
  return pts;
})();

function puddlePath(g: Ctx, s: number): void {
  g.beginPath();
  PUDDLE_PTS.forEach(([x, y], i) => {
    const [nx, ny] = PUDDLE_PTS[(i + 1) % PUDDLE_PTS.length];
    const mx = ((x + nx) / 2) * s;
    const my = ((y + ny) / 2) * s;
    if (i === 0) g.moveTo(mx, my);
    else g.quadraticCurveTo(x * s, y * s, mx, my);
  });
  const [x0, y0] = PUDDLE_PTS[0];
  const [x1, y1] = PUDDLE_PTS[1];
  g.quadraticCurveTo(x0 * s, y0 * s, ((x0 + x1) / 2) * s, ((y0 + y1) / 2) * s);
  g.closePath();
}

// --- Lantern post: a weathered timber post with an iron crook, an oil lantern
// hanging from it. Lightable (`domain/mist.ts`): dark glass and a cold candle
// stub until the player pays to light it, then a warm glowing pane and a live
// flame. Its glass sits at `LANTERN_GLASS`.
const lanternPost: PropArt = {
  origin: [0, 0],
  ink: '#1c1610',
  shadow: (g) => floorShadow(g, 4, 21, 13, 4),
  body: (g, _c, lit) => {
    const lx = LANTERN_GLASS.x;
    const ly = LANTERN_GLASS.y;
    // Rough stone footing the post is sunk into.
    g.fillStyle = vgrad(g, 14, 23, [[0, '#76726a'], [1, '#36332e']]);
    rr(g, -7.5, 14.5, 14, 8.5, 2.5);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(-6, 15.2, 11, 1);
    // The post: weathered timber, lit side left, with a few grain checks.
    g.fillStyle = hgrad(g, -3.5, 3.5, [[0, '#86663f'], [0.45, '#5e4329'], [1, '#33241a']]);
    g.fillRect(-3.2, -50, 6.4, 66);
    g.strokeStyle = 'rgba(30,18,10,0.5)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(-1.4, -44);
    g.lineTo(-1.1, -30);
    g.moveTo(1, -24);
    g.lineTo(1.3, -6);
    g.moveTo(-1.2, 0);
    g.lineTo(-1, 12);
    g.stroke();
    // An iron band where the crook is bolted on.
    g.fillStyle = '#2c2c32';
    g.fillRect(-3.6, -47.5, 7.2, 2.4);
    g.fillRect(-3.6, -36.5, 7.2, 2);
    // Weathered cap.
    g.fillStyle = '#3e2c1c';
    rr(g, -4.6, -53, 9.2, 3.8, 1.4);
    g.fill();
    // The iron crook: an arm out to the lantern side, braced from below.
    g.strokeStyle = '#2a2a30';
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(2.5, -46.3);
    g.lineTo(lx + 2, -46.3);
    g.moveTo(2.5, -36);
    g.quadraticCurveTo(lx - 4, -38, lx, -46.3);
    g.stroke();
    // Hook + short chain down to the lantern's ring.
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(lx, -46.3);
    g.lineTo(lx, ly - 9.5);
    g.stroke();
    // Lantern roof: a little iron pyramid with a ring on top.
    g.fillStyle = '#2a2a30';
    g.beginPath();
    g.moveTo(lx - 5.5, ly - 6);
    g.lineTo(lx + 5.5, ly - 6);
    g.lineTo(lx, ly - 10.5);
    g.closePath();
    g.fill();
    // The glass: a warm glowing pane once lit, else dark and cold.
    if (lit) {
      const gl = g.createRadialGradient(lx, ly + 1, 0.5, lx, ly + 1, 7);
      gl.addColorStop(0, '#fff6d4');
      gl.addColorStop(0.55, '#ffcf72');
      gl.addColorStop(1, '#d9822e');
      g.fillStyle = gl;
    } else {
      g.fillStyle = vgrad(g, ly - 6, ly + 6, [[0, '#3c444c'], [1, '#1b1f25']]);
    }
    g.fillRect(lx - 4.5, ly - 5.5, 9, 11);
    if (!lit) {
      // A cold candle stub inside and a moonlit sheen on the pane.
      g.fillStyle = '#cfc4ac';
      g.fillRect(lx - 1.2, ly + 0.5, 2.4, 4);
      g.fillStyle = '#2a2420';
      g.fillRect(lx - 0.3, ly - 0.6, 0.6, 1.2);
      g.fillStyle = 'rgba(190,210,230,0.28)';
      g.fillRect(lx - 3.6, ly - 4.6, 1.1, 8);
    }
    // Frame: corner posts, a centre bar and the base plate.
    g.fillStyle = '#2a2a30';
    g.fillRect(lx - 5, ly - 6, 1.2, 12);
    g.fillRect(lx + 3.8, ly - 6, 1.2, 12);
    g.fillRect(lx - 0.35, ly - 6, 0.7, 12);
    rr(g, lx - 5.8, ly + 5.5, 11.6, 2.4, 0.8);
    g.fill();
  },
  live: (g, t, _c, lit) => {
    if (!lit) return;
    // The flame dancing inside the glass, with a soft bloom round it.
    const lx = LANTERN_GLASS.x;
    const ly = LANTERN_GLASS.y + 2;
    const f = 0.85 + 0.1 * Math.sin(t * 9.1) + 0.05 * Math.sin(t * 23.3);
    const halo = g.createRadialGradient(lx, ly - 1, 0, lx, ly - 1, 12);
    halo.addColorStop(0, `rgba(255,214,130,${(0.35 * f).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(255,214,130,0)');
    g.fillStyle = halo;
    g.fillRect(lx - 12, ly - 13, 24, 24);
    g.fillStyle = '#fffbe8';
    g.beginPath();
    g.moveTo(lx, ly - 4.5 * f);
    g.quadraticCurveTo(lx + 2.2, ly - 0.5, lx, ly + 1.6);
    g.quadraticCurveTo(lx - 2.2, ly - 0.5, lx, ly - 4.5 * f);
    g.fill();
  },
};

const puddle: PropArt = {
  origin: [0, 0],
  ink: '#1e2024',
  finish: { shading: 0.05, rimAlpha: 0, outline: 0.3 },
  body: (g) => {
    g.fillStyle = withAlpha('#2a2016', 0.7);
    puddlePath(g, 1.12);
    g.fill();
    const sky = g.createLinearGradient(0, -12, 0, 12);
    sky.addColorStop(0, '#4a5a78');
    sky.addColorStop(1, '#1e2638');
    g.fillStyle = sky;
    puddlePath(g, 1);
    g.fill();
    g.fillStyle = 'rgba(230,236,255,0.55)';
    g.beginPath();
    g.ellipse(-6, -3, 3, 1.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(200,214,240,0.2)';
    g.beginPath();
    g.ellipse(4, 2, 8, 1.2, 0.1, 0, Math.PI * 2);
    g.fill();
  },
  live: (g, t) => {
    g.save();
    puddlePath(g, 1);
    g.clip();
    for (const [x, y, ph] of [[-8, 2, 0], [7, -3, 0.45]] as const) {
      const k = (t * 0.35 + ph) % 1;
      g.strokeStyle = `rgba(210,222,250,${0.4 * (1 - k)})`;
      g.lineWidth = 0.6;
      g.beginPath();
      g.ellipse(x, y, 1 + k * 8, 0.5 + k * 3.5, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  },
};

// ===========================================================================
// Sewers — the brick tunnels under the Capital
// ===========================================================================

const SEWER_BRICK = '#5e4a40';
const SEWER_STONE = '#7a7a72';
const SEWER_SLIME = '#4a5a2a';

/**
 * A stretch of sewer wall filling the top board row from `x0` to `x1` (local
 * to a row-0 anchor): grimy brick, a slime tide line, a wet kerb along the
 * foot, and half a stone pier at each end, so sections set side by side meet
 * in a whole pier.
 */
function sewerWallFace(g: Ctx, x0: number, x1: number, seed: number): void {
  const w = x1 - x0;
  masonry(g, x0, -30, w, 48, SEWER_BRICK, 3.6, seed);
  g.fillStyle = vgrad(g, -30, 18, [[0, 'rgba(8,10,8,0.4)'], [0.45, 'rgba(0,0,0,0)'], [1, 'rgba(20,30,10,0.45)']]);
  g.fillRect(x0, -30, w, 48);
  const r = rng(seed + 7);
  // Tide line and the damp that weeps down from it.
  g.fillStyle = withAlpha(SEWER_SLIME, 0.55);
  g.fillRect(x0, 6, w, 2.2);
  for (let i = 0; i < w / 6; i++) {
    const x = x0 + r() * w;
    const len = 3 + r() * 9;
    g.fillStyle = vgrad(g, 7, 7 + len, [[0, withAlpha(SEWER_SLIME, 0.5)], [1, withAlpha(SEWER_SLIME, 0)]]);
    g.fillRect(x, 7, 1.5 + r() * 2, len);
  }
  for (let i = 0; i < w / 10; i++) {
    const x = x0 + r() * w;
    const len = 8 + r() * 18;
    g.fillStyle = vgrad(g, -30, -30 + len, [[0, 'rgba(10,14,8,0.4)'], [1, 'rgba(10,14,8,0)']]);
    g.fillRect(x, -30, 2 + r() * 2, len);
  }
  // Stone piers at the ends.
  masonry(g, x0, -30, 6, 48, shade(SEWER_STONE, 0.06), 5, seed + 1);
  masonry(g, x1 - 6, -30, 6, 48, shade(SEWER_STONE, -0.12), 5, seed + 2);
  // Kerb along the foot.
  g.fillStyle = vgrad(g, 16, 22, [[0, shade(SEWER_STONE, 0.22)], [1, shade(SEWER_STONE, -0.4)]]);
  g.fillRect(x0, 16, w, 6);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let x = x0 + 9; x < x1; x += 12 + r() * 5) g.fillRect(x, 16, 0.8, 6);
}

/** Murky water falling from (x, y0) to y1, with foam where it lands. */
function fallingWater(g: Ctx, x: number, y0: number, y1: number, w: number, t: number): void {
  g.save();
  g.fillStyle = vgrad(g, y0, y1, [[0, 'rgba(120,140,90,0.85)'], [1, 'rgba(90,110,60,0.6)']]);
  g.beginPath();
  g.moveTo(x - w / 2, y0);
  g.lineTo(x + w / 2, y0);
  g.lineTo(x + w / 2 + 1.5, y1);
  g.lineTo(x - w / 2 - 1.5, y1);
  g.closePath();
  g.fill();
  // Streaks sliding down the fall.
  g.strokeStyle = 'rgba(200,220,170,0.45)';
  g.lineWidth = 0.7;
  for (let i = 0; i < 5; i++) {
    const k = (t * 1.6 + i / 5) % 1;
    const sx = x + ((i * 0.41) % 1 - 0.5) * w * 0.8;
    const sy = y0 + k * (y1 - y0);
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx, Math.min(y1, sy + 5));
    g.stroke();
  }
  // Foam.
  for (let i = 0; i < 6; i++) {
    const a = t * 3 + i * 1.1;
    g.fillStyle = `rgba(210,225,180,${0.35 + 0.25 * Math.sin(a * 1.7)})`;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * w * 0.7, y1 + Math.sin(a * 1.3) * 1.2, 1.6 + Math.sin(a) * 0.6, 0.9, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

// --- Sewer wall: a 2-cell stretch of the tunnel's brick wall. 2×1. ---------
// Tile sections along the top row (with outfalls and arches between them).
const sewerWall: PropArt = {
  origin: [H, 0],
  ink: '#1a1a16',
  shadow: (g) => floorShadow(g, 0, 22, 50, 4, 0.4),
  body: (g) => {
    sewerWallFace(g, -48, 48, 301);
    // A barred vent and an iron mooring ring.
    g.fillStyle = shade(SEWER_STONE, 0.1);
    rr(g, -11, -17, 22, 13, 1.5);
    g.fill();
    g.fillStyle = '#070908';
    rr(g, -9, -15, 18, 9, 1);
    g.fill();
    g.fillStyle = '#3a3640';
    for (let x = -7; x <= 7; x += 3.5) g.fillRect(x - 0.6, -15, 1.2, 9);
    g.fillStyle = vgrad(g, -6, 8, [[0, withAlpha(SEWER_SLIME, 0.7)], [1, withAlpha(SEWER_SLIME, 0)]]);
    g.fillRect(-5, -6, 10, 14);
    g.strokeStyle = '#4a3a30';
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(26, -2, 3.2, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#3a3640';
    g.fillRect(25, -7, 2, 3);
  },
};

// --- Sewer outfall: wall with a great pipe pouring into the sump below. 2×1.
const sewerOutfall: PropArt = {
  origin: [H, 0],
  ink: '#1a1a16',
  shadow: (g) => floorShadow(g, 0, 22, 50, 4, 0.4),
  body: (g) => {
    sewerWallFace(g, -48, 48, 311);
    // Slime beard under the mouth.
    g.fillStyle = vgrad(g, 0, 20, [[0, withAlpha(SEWER_SLIME, 0.85)], [1, withAlpha(SEWER_SLIME, 0.1)]]);
    g.beginPath();
    g.moveTo(-12, 2);
    g.quadraticCurveTo(0, 26, 12, 2);
    g.closePath();
    g.fill();
    // The pipe: a riveted iron collar round a dark bore.
    g.fillStyle = vgrad(g, -20, 8, [[0, '#6a5040'], [1, '#3a2a20']]);
    g.beginPath();
    g.arc(0, -6, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7a5a44';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.beginPath();
      g.arc(Math.cos(a) * 12, -6 + Math.sin(a) * 12, 0.9, 0, Math.PI * 2);
      g.fill();
    }
    const bore = g.createRadialGradient(0, -6, 1, 0, -6, 10);
    bore.addColorStop(0, '#020302');
    bore.addColorStop(1, '#1a2016');
    g.fillStyle = bore;
    g.beginPath();
    g.arc(0, -6, 10, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = withAlpha('#8a4a2a', 0.6);
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(0, -6, 13, 0.3, 1.4);
    g.stroke();
  },
  live: (g, t) => {
    // Water sheeting out over the lip of the bore and down into the sump.
    fallingWater(g, 0, 2, 52, 11, t);
  },
};

// --- Sewer arch: the wall opening over a tunnel the channel runs into. 3×1.
// Its footprint is the two side cells; the middle cell is the channel's way
// through. Foes coming out of it stay behind the wall until they're clear.
const sewerArch: PropArt = {
  origin: [T, 0],
  ink: '#1a1a16',
  shadow: (g) => floorShadow(g, 0, 22, 74, 4, 0.4),
  body: (g) => {
    sewerWallFace(g, -72, 72, 321);
    const R = 20;
    const cy = -4;
    const arch = (rad: number, spring: number, floor: number) => {
      g.beginPath();
      g.moveTo(-rad, floor);
      g.lineTo(-rad, spring);
      g.arc(0, spring, rad, Math.PI, 0);
      g.lineTo(rad, floor);
      g.closePath();
    };
    // Flanking piers and the voussoir ring.
    masonry(g, -34, -30, 8, 54, shade(SEWER_STONE, 0.06), 5, 322);
    masonry(g, 26, -30, 8, 54, shade(SEWER_STONE, -0.12), 5, 323);
    g.fillStyle = shade(SEWER_STONE, 0.08);
    arch(R + 7, cy, 24);
    g.fill();
    g.strokeStyle = withAlpha(shade(SEWER_STONE, -0.55), 0.7);
    g.lineWidth = 0.8;
    for (let i = 0; i <= 9; i++) {
      const a = Math.PI + (i / 9) * Math.PI;
      g.beginPath();
      g.moveTo(Math.cos(a) * R, cy + Math.sin(a) * R);
      g.lineTo(Math.cos(a) * (R + 7), cy + Math.sin(a) * (R + 7));
      g.stroke();
    }
    // The tunnel beyond, falling away into the dark.
    const dark = g.createRadialGradient(0, 2, 1, 0, 0, 26);
    dark.addColorStop(0, '#010201');
    dark.addColorStop(0.6, '#080c08');
    dark.addColorStop(1, '#1e241c');
    g.fillStyle = dark;
    arch(R, cy, 24);
    g.fill();
    for (const [k, a] of [[0.78, 0.4], [0.58, 0.24]] as const) {
      g.strokeStyle = withAlpha('#4a5446', a);
      g.lineWidth = 1.2;
      arch(R * k, cy + (1 - k) * 6, 24 - (1 - k) * 22);
      g.stroke();
    }
    // The channel running on into it.
    g.fillStyle = vgrad(g, 10, 24, [[0, '#0e140a'], [1, '#2e3a22']]);
    g.beginPath();
    g.moveTo(-17, 24);
    g.lineTo(-6, 10);
    g.lineTo(6, 10);
    g.lineTo(17, 24);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(170,190,140,0.25)';
    g.lineWidth = 0.6;
    for (const x of [-4, 3]) {
      g.beginPath();
      g.moveTo(x, 13);
      g.lineTo(x * 1.6, 22);
      g.stroke();
    }
    // The portcullis, hauled up into the crown: just its teeth show.
    g.fillStyle = '#2e2a2c';
    g.fillRect(-15, -22, 30, 3);
    for (let x = -13; x <= 13; x += 4.3) {
      g.beginPath();
      g.moveTo(x - 1.2, -19);
      g.lineTo(x + 1.2, -19);
      g.lineTo(x, -14.5);
      g.closePath();
      g.fill();
    }
    g.fillStyle = shade(SEWER_STONE, 0.3);
    g.beginPath();
    g.moveTo(-3.5, cy - R - 8);
    g.lineTo(3.5, cy - R - 8);
    g.lineTo(2.4, cy - R + 0.5);
    g.lineTo(-2.4, cy - R + 0.5);
    g.closePath();
    g.fill();
  },
};

// --- Cistern: a stone-kerbed sump of black water, half grated over. 2×2. ---
const cistern: PropArt = {
  origin: [H, H],
  ink: '#1a1a16',
  body: (g) => {
    // Kerb.
    g.fillStyle = vgrad(g, -37, 39, [[0, shade(SEWER_STONE, 0.25)], [1, shade(SEWER_STONE, -0.3)]]);
    rr(g, -47, -37, 94, 76, 5);
    g.fill();
    g.strokeStyle = withAlpha(shade(SEWER_STONE, -0.55), 0.6);
    g.lineWidth = 0.8;
    for (const x of [-22, 4, 26]) {
      g.beginPath();
      g.moveTo(x, -37);
      g.lineTo(x, -29);
      g.moveTo(x - 6, 31);
      g.lineTo(x - 6, 39);
      g.stroke();
    }
    for (const y of [-10, 14]) {
      g.beginPath();
      g.moveTo(-47, y);
      g.lineTo(-39, y);
      g.moveTo(39, y + 6);
      g.lineTo(47, y + 6);
      g.stroke();
    }
    // The pit: its far wall, then the water.
    g.fillStyle = '#0a0c0a';
    rr(g, -39, -29, 78, 60, 3);
    g.fill();
    masonry(g, -39, -29, 78, 10, shade(SEWER_BRICK, -0.25), 3.4, 331);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(-39, -29, 78, 10);
    const water = g.createLinearGradient(0, -19, 0, 31);
    water.addColorStop(0, '#141c10');
    water.addColorStop(1, '#2e3a22');
    g.fillStyle = water;
    g.fillRect(-39, -19, 78, 50);
    const r = rng(333);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = withAlpha(r() < 0.5 ? '#8a9a4a' : '#6e7a3a', 0.2 + r() * 0.2);
      g.beginPath();
      g.ellipse(-34 + r() * 68, -14 + r() * 42, 2 + r() * 6, 1 + r() * 2, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(-39, 27, 78, 4);
    // Iron grate over the left of the pit.
    g.fillStyle = '#2e2a2c';
    g.fillRect(-39, -19, 2, 50);
    g.fillRect(-12, -19, 2, 50);
    for (let y = -17; y < 31; y += 5) g.fillRect(-39, y, 29, 1.4);
    for (let x = -33; x < -12; x += 5.5) g.fillRect(x, -19, 1.2, 50);
    // Rungs down into it at the front right.
    g.strokeStyle = '#4a3a30';
    g.lineWidth = 1.3;
    for (const y of [20, 25]) {
      g.beginPath();
      g.moveTo(22, y);
      g.lineTo(30, y);
      g.stroke();
    }
  },
  live: (g, t) => {
    g.save();
    // Rings spreading from where the outfall lands.
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.7 + i / 3) % 1;
      g.strokeStyle = `rgba(180,200,150,${0.35 * (1 - k)})`;
      g.lineWidth = 0.7;
      g.beginPath();
      g.ellipse(8, -18, 6 + k * 20, 2 + k * 7, 0, 0, Math.PI);
      g.stroke();
    }
    // Bubbles rising and popping.
    for (const [x, y, ph] of [[-2, 10, 0], [14, 20, 0.4], [24, 2, 0.7]] as const) {
      const k = (t * 0.5 + ph) % 1;
      if (k < 0.8) {
        g.fillStyle = 'rgba(140,160,100,0.6)';
        g.beginPath();
        g.arc(x, y, 0.6 + k * 1.8, 0, Math.PI * 2);
        g.fill();
      } else {
        const s = (k - 0.8) / 0.2;
        g.strokeStyle = `rgba(170,190,130,${0.6 * (1 - s)})`;
        g.lineWidth = 0.6;
        g.beginPath();
        g.ellipse(x, y, 2 + s * 4, 1 + s * 1.5, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.restore();
  },
};

// --- Brick pillar: a squat pier holding up the vault, a lantern on a hook. --
const brickPillar: PropArt = {
  origin: [0, 0],
  ink: '#1a1a16',
  shadow: (g) => floorShadow(g, 3, 20, 18, 5),
  body: (g) => {
    // Springing ribs of the vault, curving off out of sight.
    for (const s of [-1, 1]) {
      g.save();
      g.beginPath();
      g.moveTo(s * 9, -54);
      g.quadraticCurveTo(s * 20, -70, s * 32, -74);
      g.lineTo(s * 32, -84);
      g.quadraticCurveTo(s * 16, -80, s * 4, -62);
      g.closePath();
      g.clip();
      masonry(g, -34, -86, 68, 34, shade(SEWER_BRICK, s < 0 ? 0.05 : -0.15), 3.4, 341 + s);
      g.restore();
    }
    // Shaft.
    masonry(g, -11, -56, 22, 70, SEWER_BRICK, 3.6, 343);
    g.fillStyle = hgrad(g, -11, 11, [[0, 'rgba(255,240,210,0.1)'], [0.4, 'rgba(0,0,0,0)'], [1, 'rgba(8,8,16,0.45)']]);
    g.fillRect(-11, -56, 22, 70);
    g.fillStyle = vgrad(g, -4, 14, [[0, withAlpha(SEWER_SLIME, 0)], [1, withAlpha(SEWER_SLIME, 0.65)]]);
    g.fillRect(-11, -4, 22, 18);
    // Cap and plinth.
    g.fillStyle = vgrad(g, -61, -54, [[0, shade(SEWER_STONE, 0.3)], [1, shade(SEWER_STONE, -0.2)]]);
    g.fillRect(-14, -61, 28, 6);
    g.fillStyle = vgrad(g, 12, 21, [[0, shade(SEWER_STONE, 0.2)], [1, shade(SEWER_STONE, -0.35)]]);
    g.fillRect(-14, 12, 28, 9);
    g.fillStyle = withAlpha(SEWER_SLIME, 0.55);
    g.fillRect(-14, 17, 28, 2);
    wallLantern(g, 15, -26, 1);
  },
};

// --- Manhole ladder: iron rungs up to a shaft, moonlight falling down it. ---
const manholeLadder: PropArt = {
  origin: [0, 0],
  ink: '#1a1a16',
  shadow: (g) => floorShadow(g, 1, 18, 12, 3.5, 0.35),
  body: (g) => {
    const iron = '#4a3e36';
    for (const x of [-7, 6]) {
      g.fillStyle = hgrad(g, x, x + 2, [[0, shade(iron, 0.3)], [1, shade(iron, -0.3)]]);
      g.fillRect(x, -66, 2, 84);
    }
    for (let y = -62; y <= 14; y += 6.5) {
      g.fillStyle = shade(iron, 0.15);
      g.fillRect(-6, y, 12, 1.5);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(-6, y + 1.5, 12, 0.6);
    }
    g.strokeStyle = withAlpha('#8a4a2a', 0.5);
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-6, -40);
    g.lineTo(-6, -20);
    g.moveTo(7, -10);
    g.lineTo(7, 8);
    g.stroke();
    // Brackets pinning it to the wall.
    g.fillStyle = '#2e2a2c';
    for (const y of [-50, -14]) {
      g.fillRect(-9, y, 3, 2);
      g.fillRect(8, y, 3, 2);
    }
  },
  live: (g, t) => {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const pulse = 0.85 + 0.15 * Math.sin(t * 0.7);
    const beam = g.createLinearGradient(0, -80, 0, 18);
    beam.addColorStop(0, `rgba(170,190,240,${0.22 * pulse})`);
    beam.addColorStop(1, `rgba(140,160,220,${0.06 * pulse})`);
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(-8, -80);
    g.lineTo(10, -80);
    g.lineTo(20, 16);
    g.lineTo(-16, 16);
    g.closePath();
    g.fill();
    const pool = g.createRadialGradient(2, 15, 1, 2, 15, 20);
    pool.addColorStop(0, `rgba(170,190,240,${0.22 * pulse})`);
    pool.addColorStop(1, 'rgba(140,160,220,0)');
    g.fillStyle = pool;
    g.beginPath();
    g.ellipse(2, 15, 20, 7, 0, 0, Math.PI * 2);
    g.fill();
    // Motes drifting down through the beam.
    for (let i = 0; i < 7; i++) {
      const k = (t * 0.08 + i / 7) % 1;
      const y = -76 + k * 90;
      const half = 9 + k * 9;
      const x = 1 + Math.sin(t * 0.6 + i * 2.3) * half * 0.8;
      g.fillStyle = `rgba(220,230,255,${0.5 * Math.sin(k * Math.PI)})`;
      g.beginPath();
      g.arc(x, y, 0.7, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  },
};

// --- Pipes: rusted iron pipes, a valve wheel and a dripping elbow. ---------
const pipes: PropArt = {
  origin: [0, 0],
  ink: '#1a1a16',
  shadow: (g) => floorShadow(g, 2, 16, 18, 5),
  body: (g) => {
    const iron = '#5a4a40';
    const pipe = (x: number, y0: number, y1: number, w: number) => {
      g.fillStyle = hgrad(g, x, x + w, [[0, shade(iron, 0.3)], [0.4, iron], [1, shade(iron, -0.4)]]);
      g.fillRect(x, y0, w, y1 - y0);
    };
    const flange = (x: number, y: number, w: number) => {
      g.fillStyle = vgrad(g, y, y + 3, [[0, shade(iron, 0.35)], [1, shade(iron, -0.3)]]);
      g.fillRect(x - 1.5, y, w + 3, 3);
      g.fillStyle = '#2a2420';
      g.fillRect(x - 0.6, y + 1, 1, 1);
      g.fillRect(x + w - 0.4, y + 1, 1, 1);
    };
    pipe(-13, -32, 16, 7);
    flange(-13, -34, 7);
    flange(-13, -6, 7);
    pipe(1, -18, 16, 7);
    flange(1, 10, 7);
    // Elbow over to the right.
    g.fillStyle = vgrad(g, -22, -11, [[0, shade(iron, 0.3)], [1, shade(iron, -0.35)]]);
    g.beginPath();
    g.moveTo(1, -18);
    g.quadraticCurveTo(1, -25, 9, -25);
    g.lineTo(18, -25);
    g.lineTo(18, -18);
    g.lineTo(11, -18);
    g.quadraticCurveTo(8, -18, 8, -15);
    g.closePath();
    g.fill();
    g.fillStyle = '#0a0c0a';
    g.beginPath();
    g.ellipse(18, -21.5, 1.4, 3.4, 0, 0, Math.PI * 2);
    g.fill();
    // Rust streaks.
    g.fillStyle = withAlpha('#8a4a2a', 0.5);
    g.fillRect(-10, -26, 1.2, 14);
    g.fillRect(4, -10, 1, 12);
    // Valve wheel.
    g.strokeStyle = '#8a2a20';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(-9.5, -16, 6, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1;
    for (let a = 0; a < 3; a++) {
      g.beginPath();
      g.moveTo(-9.5 + Math.cos((a * Math.PI) / 3) * 6, -16 + Math.sin((a * Math.PI) / 3) * 6);
      g.lineTo(-9.5 - Math.cos((a * Math.PI) / 3) * 6, -16 - Math.sin((a * Math.PI) / 3) * 6);
      g.stroke();
    }
    g.fillStyle = '#c9a24a';
    g.beginPath();
    g.arc(-9.5, -16, 1.4, 0, Math.PI * 2);
    g.fill();
    // Slime round the feet.
    g.fillStyle = withAlpha(SEWER_SLIME, 0.55);
    g.beginPath();
    g.ellipse(-2, 16, 15, 3, 0, 0, Math.PI * 2);
    g.fill();
  },
  live: (g, t) => {
    const k = (t / 1.6) % 1;
    if (k < 0.8) {
      const y = -19 + (k / 0.8) ** 2 * 34;
      g.fillStyle = 'rgba(150,170,120,0.85)';
      g.beginPath();
      g.ellipse(19.5, y, 0.9, 1.4, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      const s = (k - 0.8) / 0.2;
      g.strokeStyle = `rgba(150,170,120,${0.6 * (1 - s)})`;
      g.lineWidth = 0.7;
      g.beginPath();
      g.ellipse(19.5, 16, 1 + s * 4, 0.5 + s * 1.3, 0, 0, Math.PI * 2);
      g.stroke();
    }
  },
};

// --- Bone pile: what's left of someone who came down here before. ---------
const bonePile: PropArt = {
  origin: [0, 0],
  ink: '#1e1a16',
  shadow: (g) => floorShadow(g, 1, 12, 18, 4.5),
  body: (g) => {
    const bone = '#d8ceb4';
    // A rotted rag beneath it all.
    g.fillStyle = '#3a3428';
    g.beginPath();
    g.moveTo(-16, 10);
    g.quadraticCurveTo(-10, 0, 0, 4);
    g.quadraticCurveTo(10, -1, 16, 9);
    g.quadraticCurveTo(4, 15, -16, 10);
    g.closePath();
    g.fill();
    const longBone = (x: number, y: number, a: number, len: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = shade(bone, -0.1);
      g.fillRect(-len / 2, -1, len, 2);
      g.fillStyle = bone;
      for (const ex of [-len / 2, len / 2]) {
        g.beginPath();
        g.arc(ex, -1.2, 1.5, 0, Math.PI * 2);
        g.arc(ex, 1.2, 1.5, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    };
    longBone(-6, 9, 0.25, 14);
    longBone(6, 7, -0.6, 12);
    longBone(-1, 11, -0.1, 10);
    // Ribs.
    g.strokeStyle = shade(bone, -0.15);
    g.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(4 + i * 2.6, 2, 5, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
    // Skull.
    g.fillStyle = vgrad(g, -9, 2, [[0, shade(bone, 0.1)], [1, shade(bone, -0.2)]]);
    g.beginPath();
    g.arc(-8, -3, 5, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-11, -1, 6, 4);
    g.fillStyle = '#1a140e';
    g.beginPath();
    g.arc(-10, -3, 1.4, 0, Math.PI * 2);
    g.arc(-6.4, -3, 1.4, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-8.6, 0, 1.2, 1.4);
    // A rusted kettle helm.
    g.fillStyle = vgrad(g, -12, -2, [[0, '#6a5a50'], [1, '#3a3036']]);
    g.beginPath();
    g.ellipse(11, -4, 7, 2, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(11, -4, 4.6, Math.PI, 0);
    g.fill();
    g.fillStyle = withAlpha('#8a4a2a', 0.55);
    g.fillRect(8, -7, 2, 2);
  },
};

// --- Glow shrooms: a clump of luminous mushrooms. Floor dressing. ----------
const SHROOMS: [number, number, number][] = [
  [-6, 4, 4.2],
  [0, 0, 5.4],
  [7, 5, 3.4],
  [-11, -2, 2.6],
  [4, 9, 2.4],
  [11, -3, 2.2],
];

const glowShrooms: PropArt = {
  origin: [0, 0],
  ink: '#0e2422',
  finish: { shading: 0.2, rimAlpha: 0.1, outline: 0.4 },
  body: (g) => {
    for (const [x, y, s] of SHROOMS) {
      g.fillStyle = '#c8d0c0';
      g.fillRect(x - s * 0.18, y - s * 1.1, s * 0.36, s * 1.1);
      g.fillStyle = vgrad(g, y - s * 1.9, y - s * 0.9, [[0, '#8af0e0'], [1, '#2a9a8c']]);
      g.beginPath();
      g.ellipse(x, y - s * 1.1, s, s * 0.6, 0, Math.PI, 0);
      g.fill();
      g.fillStyle = '#1a5a52';
      g.beginPath();
      g.ellipse(x, y - s * 1.1, s, s * 0.18, 0, 0, Math.PI);
      g.fill();
      g.fillStyle = 'rgba(230,255,250,0.7)';
      g.beginPath();
      g.arc(x - s * 0.35, y - s * 1.45, s * 0.14, 0, Math.PI * 2);
      g.arc(x + s * 0.25, y - s * 1.55, s * 0.1, 0, Math.PI * 2);
      g.fill();
    }
  },
  live: (g, t) => {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, s] of SHROOMS) {
      const p = 0.6 + 0.4 * Math.sin(t * 1.3 + x * 0.7);
      const gl = g.createRadialGradient(x, y - s * 1.3, 0, x, y - s * 1.3, s * 2.6);
      gl.addColorStop(0, `rgba(120,255,230,${0.3 * p})`);
      gl.addColorStop(1, 'rgba(60,200,180,0)');
      g.fillStyle = gl;
      g.beginPath();
      g.arc(x, y - s * 1.3, s * 2.6, 0, Math.PI * 2);
      g.fill();
    }
    // Spores drifting up.
    for (let i = 0; i < 5; i++) {
      const k = (t * 0.18 + i / 5) % 1;
      g.fillStyle = `rgba(170,255,240,${0.6 * Math.sin(k * Math.PI)})`;
      g.beginPath();
      g.arc(-6 + i * 3.5 + Math.sin(t + i) * 2, -2 - k * 22, 0.7, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  },
};

// --- Rats: a few rats scurrying about in fits and starts. Floor dressing. --
const RATS: { cx: number; cy: number; rad: number; speed: number; phase: number }[] = [
  { cx: -5, cy: 1, rad: 10, speed: 0.55, phase: 0 },
  { cx: 7, cy: -3, rad: 7, speed: -0.45, phase: 2.2 },
  { cx: 1, cy: 7, rad: 12, speed: 0.35, phase: 4.1 },
];

function drawRat(g: Ctx, x: number, y: number, ang: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = 'rgba(8,5,14,0.3)';
  g.beginPath();
  g.ellipse(0, 1.4, 4.4, 1.6, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#b8867c';
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(-3.6, 0);
  g.quadraticCurveTo(-6.5, 2.6, -9, 0.6);
  g.stroke();
  g.fillStyle = '#5a4a42';
  g.beginPath();
  g.ellipse(-0.4, 0, 3.8, 2.1, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(3.2, 0, 2, 1.3, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1e1816';
  g.lineWidth = 0.4;
  g.beginPath();
  g.ellipse(-0.4, 0, 3.8, 2.1, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#c89a90';
  g.beginPath();
  g.arc(2.4, -1.4, 0.7, 0, Math.PI * 2);
  g.arc(2.4, 1.4, 0.7, 0, Math.PI * 2);
  g.arc(5.1, 0, 0.45, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#100808';
  g.fillRect(3.5, -0.7, 0.6, 0.6);
  g.restore();
}

const rats: PropArt = {
  origin: [0, 0],
  ink: '#1e1816',
  finish: { shading: 0, rimAlpha: 0, outline: 0 },
  body: (g) => {
    g.fillStyle = 'rgba(40,30,20,0.4)';
    const r = rng(351);
    for (let i = 0; i < 10; i++) g.fillRect(-10 + r() * 20, -6 + r() * 14, 1, 0.8);
  },
  live: (g, t) => {
    for (const rat of RATS) {
      // Dash a stretch round the loop, then freeze and sniff, then dash on.
      const u = t * Math.abs(rat.speed) + rat.phase;
      const step = Math.floor(u);
      const f = u - step;
      const eased = f < 0.45 ? (f / 0.45) * (f / 0.45) * (3 - (2 * f) / 0.45) : 1;
      const a = Math.sign(rat.speed) * (step + eased) * 1.3;
      const x = rat.cx + Math.cos(a) * rat.rad;
      const y = rat.cy + Math.sin(a) * rat.rad * 0.5;
      const heading = Math.atan2(Math.cos(a) * rat.rad * 0.5, -Math.sin(a) * rat.rad) + (rat.speed < 0 ? Math.PI : 0);
      drawRat(g, x, y, heading);
    }
  },
};

// ===========================================================================
// Riverside — out of the sewers at dawn, to the waiting wagon
// ===========================================================================

/**
 * A spoked wagon wheel with an iron tyre; `far` paints the shadowed far side,
 * `spin` (radians) turns the spokes as it rolls.
 */
function wagonWheel(g: Ctx, cx: number, cy: number, r: number, far: boolean, spin = 0): void {
  g.strokeStyle = far ? '#1e140c' : '#3a2616';
  g.lineWidth = 2.6;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = far ? shade(WOOD, -0.45) : shade(WOOD, 0.05);
  g.lineWidth = 1.3;
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4 + 0.2 + spin;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(ang) * (r - 1.4), cy + Math.sin(ang) * (r - 1.4));
    g.stroke();
  }
  g.fillStyle = far ? '#2a2830' : '#4a4550';
  g.beginPath();
  g.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
  g.fill();
  if (!far) {
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(cx, cy, r + 0.8, Math.PI * 1.05, Math.PI * 1.55);
    g.stroke();
  }
}

/**
 * A draught horse in profile facing right, in harness. `(x, y)` is the
 * barrel's centre at rest; the hooves stand on y + 34. Standing still when
 * `gait` is null; otherwise trotting, `gait` (radians) the stride phase and
 * `speed` (0..1) how hard: the diagonal leg pairs swing and fold, the body
 * rises on each beat, the head nods and the tail streams out behind.
 */
function drawHorse(g: Ctx, x: number, y0: number, coat: string, mane: string, gait: number | null = null, speed = 0): void {
  const ground = y0 + 34;
  const moving = gait != null;
  const ph = gait ?? 0;
  const y = moving ? y0 - Math.abs(Math.sin(ph)) * (1 + speed * 1.6) : y0;
  const nod = moving ? Math.sin(ph * 2 + 0.6) * (0.8 + speed) : 0;
  const dark = shade(coat, -0.3);
  const hoof = (hx: number, hy: number, near: boolean) => {
    g.fillStyle = near ? shade(coat, 0.35) : shade(coat, 0.05);
    g.beginPath();
    g.ellipse(hx, hy - 1.2, 2.4, 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2420';
    g.fillRect(hx - 1.9, hy, 3.8, 2);
  };
  const leg = (lx: number, near: boolean, off: number, hind: boolean) => {
    if (!moving) {
      g.fillStyle = near ? coat : dark;
      g.beginPath();
      g.moveTo(lx - 2.8, y + 3);
      g.lineTo(lx + 2.8, y + 3);
      g.lineTo(lx + 1.7, ground - 7);
      g.lineTo(lx + 1.5, ground - 2);
      g.lineTo(lx - 1.5, ground - 2);
      g.lineTo(lx - 1.7, ground - 7);
      g.closePath();
      g.fill();
      hoof(lx, ground - 2, near);
      return;
    }
    // Hip → knee (swinging) → hoof (folding up as the leg comes forward).
    const a = ph + off;
    const swing = Math.sin(a) * (0.28 + 0.32 * speed);
    const fold = Math.max(0, Math.cos(a)) * (0.45 + 0.7 * speed);
    const hipY = y + 3;
    const kx = lx + Math.sin(swing) * 15;
    const ky = hipY + Math.cos(swing) * 15;
    const low = hind ? swing + fold * 0.9 : swing - fold * 1.1;
    const hx = kx + Math.sin(low) * 14;
    const hy = Math.min(ground - 2, ky + Math.cos(low) * 14);
    g.strokeStyle = near ? coat : dark;
    g.lineCap = 'round';
    g.lineWidth = 5.4;
    g.beginPath();
    g.moveTo(lx, hipY);
    g.lineTo(kx, ky);
    g.stroke();
    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(kx, ky);
    g.lineTo(hx, hy);
    g.stroke();
    g.lineCap = 'butt';
    hoof(hx, hy, near);
  };
  leg(x - 10, false, 0, true);
  leg(x + 11, false, Math.PI, false);
  // Tail, streaming out behind with speed.
  const ts = moving ? speed : 0;
  g.fillStyle = mane;
  g.beginPath();
  g.moveTo(x - 15, y - 4);
  g.quadraticCurveTo(x - 23 - ts * 6, y + 4 - ts * 6, x - 20 - ts * 10, y + 21 - ts * 14);
  g.quadraticCurveTo(x - 16 - ts * 4, y + 9 - ts * 6, x - 12, y + 1);
  g.closePath();
  g.fill();
  // Barrel and belly shadow.
  g.fillStyle = hgrad(g, x - 16, x + 16, [[0, shade(coat, 0.08)], [1, shade(coat, -0.12)]]);
  g.beginPath();
  g.ellipse(x, y, 16, 8.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.ellipse(x, y + 5, 13, 3.4, 0, 0, Math.PI * 2);
  g.fill();
  // Neck and head, bowed a little (nodding with the stride).
  const hy = y + nod;
  g.fillStyle = coat;
  g.beginPath();
  g.moveTo(x + 8, y - 6);
  g.quadraticCurveTo(x + 14, hy - 18, x + 21, hy - 22);
  g.lineTo(x + 26, hy - 17);
  g.quadraticCurveTo(x + 20, y - 8, x + 16, y + 3);
  g.closePath();
  g.fill();
  g.save();
  g.translate(x + 24, hy - 18);
  g.rotate(0.75);
  g.fillStyle = coat;
  g.beginPath();
  g.ellipse(4, 0, 7, 3.7, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = shade(coat, -0.22);
  g.beginPath();
  g.ellipse(9.5, 0.4, 2.7, 2.7, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(x + 20, hy - 22);
  g.lineTo(x + 20.5 - ts * 1.5, hy - 27.5);
  g.lineTo(x + 23, hy - 22.5);
  g.closePath();
  g.fill();
  g.strokeStyle = mane;
  g.lineWidth = 2.4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x + 8, y - 7);
  g.quadraticCurveTo(x + 13 - ts * 2, hy - 18, x + 19.5, hy - 22);
  g.stroke();
  g.lineCap = 'butt';
  g.fillStyle = '#100808';
  g.beginPath();
  g.arc(x + 25, hy - 18.5, 0.8, 0, Math.PI * 2);
  g.fill();
  leg(x - 7, true, Math.PI, true);
  leg(x + 14, true, 0, false);
  // Harness: collar, a trace back to the wagon, the bridle, a brass boss.
  g.strokeStyle = '#4a2e1c';
  g.lineWidth = 2.6;
  g.beginPath();
  g.ellipse(x + 13, y - 6, 3, 7, -0.5, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(x + 11, y - 1);
  g.lineTo(x - 18, y0 + 1);
  g.moveTo(x + 21.5, hy - 19.5);
  g.lineTo(x + 30, hy - 12.5);
  g.stroke();
  g.fillStyle = GOLD;
  g.beginPath();
  g.arc(x + 13, y - 11, 1.1, 0, Math.PI * 2);
  g.fill();
}

// --- Escape wagon: the covered wagon waiting to carry you off. 3×2. ---------
// A path's end (a base prop): the road comes in from the left to its tail on
// the anchor's bottom-left cell. It faces right, the team in harness. Its
// depth line sits above that tail, so foes reaching it stay drawn in front.

/**
 * The whole rig in the prop's local frame: wagon, driver and team. `spin`
 * turns the wheels (radians of the rear wheel; the smaller front wheel turns
 * faster to keep pace), `gait`/`speed` drive the horses (`drawHorse`; null
 * stands them still). The parked prop paints it at rest; the getaway cutscene
 * drives it (`drawWagonRig`).
 */
function paintWagon(g: Ctx, spin: number, gait: number | null, speed: number): void {
  const wood = '#7a5434';
  const canvas = '#e6dcc0';
  // The far horse, set back and in shadow, and the far wheels.
  drawHorse(g, 33, 5, '#5e5e66', '#2a2a30', gait == null ? null : gait + 0.9, speed);
  wagonWheel(g, -40, 24, 15, true, spin);
  wagonWheel(g, 9, 27, 12, true, spin * 1.25);
  // The tongue running forward to the team.
  g.strokeStyle = shade(wood, -0.25);
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(12, 20);
  g.lineTo(44, 13);
  g.stroke();
  // Bed.
  planks(g, -66, 6, 80, 15, wood, false, 3.8, 401);
  g.fillStyle = shade(wood, -0.45);
  g.fillRect(-66, 19.5, 80, 3);
  g.fillStyle = shade(wood, 0.3);
  g.fillRect(-67, 5, 82, 1.6);
  g.fillStyle = '#2a2420';
  for (const x of [-52, -28, -4]) g.fillRect(x, 6, 1.4, 14);
  // Canvas tilt over its hoops.
  const cover = () => {
    g.beginPath();
    g.moveTo(-63, 6);
    g.lineTo(-66, -12);
    g.quadraticCurveTo(-62, -36, -42, -36);
    g.lineTo(-6, -36);
    g.quadraticCurveTo(13, -35, 12, -12);
    g.lineTo(10, 6);
    g.closePath();
  };
  g.fillStyle = vgrad(g, -36, 6, [[0, shade(canvas, 0.06)], [1, shade(canvas, -0.24)]]);
  cover();
  g.fill();
  g.save();
  cover();
  g.clip();
  g.strokeStyle = withAlpha(shade(canvas, -0.45), 0.6);
  g.lineWidth = 1;
  for (const x of [-48, -30, -12]) {
    g.beginPath();
    g.moveTo(x, 6);
    g.quadraticCurveTo(x - 1, -18, x + 1, -37);
    g.stroke();
  }
  // A patch, and the side flap rolled up over the cargo.
  g.fillStyle = shade(canvas, -0.12);
  g.fillRect(-26, -30, 8, 7);
  g.strokeStyle = withAlpha(shade(canvas, -0.5), 0.6);
  g.lineWidth = 0.5;
  g.strokeRect(-26, -30, 8, 7);
  g.fillStyle = '#1a120c';
  g.beginPath();
  g.moveTo(-60, 6);
  g.lineTo(-60, -10);
  g.quadraticCurveTo(-48, -15, -36, -10);
  g.lineTo(-36, 6);
  g.closePath();
  g.fill();
  const glow = g.createRadialGradient(-48, -2, 1, -48, -2, 14);
  glow.addColorStop(0, 'rgba(255,200,120,0.55)');
  glow.addColorStop(1, 'rgba(255,160,80,0)');
  g.fillStyle = glow;
  g.fillRect(-60, -14, 24, 20);
  g.fillStyle = '#6e4a2a';
  g.fillRect(-58, -4, 9, 10);
  g.fillStyle = '#c9b48c';
  g.beginPath();
  g.ellipse(-43, 1, 5, 5, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.fillStyle = vgrad(g, -14, -8, [[0, shade(canvas, 0.1)], [1, shade(canvas, -0.3)]]);
  rr(g, -61, -15, 26, 5, 2.5);
  g.fill();
  g.strokeStyle = '#8a7650';
  g.lineWidth = 0.7;
  for (const x of [-56, -42]) {
    g.beginPath();
    g.moveTo(x, -15);
    g.lineTo(x, -9);
    g.stroke();
  }
  // Rope lashings along the hem.
  g.strokeStyle = '#8a7650';
  g.lineWidth = 0.6;
  for (let x = -30; x < 8; x += 7) {
    g.beginPath();
    g.moveTo(x, 2);
    g.lineTo(x + 2, 7);
    g.moveTo(x + 2, 2);
    g.lineTo(x, 7);
    g.stroke();
  }
  // Driver's bench and the hooded driver, reins in hand.
  g.fillStyle = shade(wood, 0.1);
  g.fillRect(4, -3, 16, 3);
  g.fillRect(16, -3, 2, 10);
  const cloak = '#2e3e2a';
  g.fillStyle = vgrad(g, -22, 0, [[0, shade(cloak, 0.12)], [1, shade(cloak, -0.2)]]);
  g.beginPath();
  g.moveTo(5, -1);
  g.quadraticCurveTo(6, -14, 11, -18);
  g.lineTo(15, -18);
  g.quadraticCurveTo(19, -10, 19, -1);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(13, -21, 5.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#120e0a';
  g.beginPath();
  g.ellipse(15.4, -20.4, 2.4, 3.2, 0.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = shade(cloak, -0.1);
  g.beginPath();
  g.moveTo(15, -12);
  g.lineTo(22, -7);
  g.lineTo(21, -5);
  g.lineTo(14, -9);
  g.closePath();
  g.fill();
  g.fillStyle = '#c8987a';
  g.beginPath();
  g.arc(22, -6, 1.4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3a2416';
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(22, -6);
  g.quadraticCurveTo(40, -2, 63, -11);
  g.stroke();
  // Lantern pole at the front corner.
  g.fillStyle = shade(wood, -0.1);
  g.fillRect(-1, -42, 2, 46);
  g.strokeStyle = '#22252c';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, -40);
  g.lineTo(-6, -40);
  g.lineTo(-6, -37);
  g.stroke();
  wallLantern(g, -6, -31, 0);
  // Near wheels, then the near horse.
  wagonWheel(g, -44, 27, 15, false, spin);
  wagonWheel(g, 4, 30, 12, false, spin * 1.25);
  drawHorse(g, 38, 8, '#6a4630', '#2a1a10', gait, speed);
}

/** The rear wheel's radius: how far the rig rolls per radian of `spin`. */
export const WAGON_WHEEL_R = 15;

const escapeWagon: PropArt = {
  origin: [T, H],
  ink: '#2a1a10',
  shadow: (g) => {
    floorShadow(g, -24, 42, 50, 7, 0.5);
    floorShadow(g, 40, 42, 30, 6, 0.45);
  },
  body: (g) => paintWagon(g, 0, null, 0),
};

// --- River: stretches of slow river along a row (floor dressing that blocks
// building). `riverSegment` is a 4-cell stretch, `riverCell` a single cell.
// Every piece's bank meets its edges at the same height and slope, and the
// bank, reeds and drifting sheen repeat across each piece's width, so pieces
// of either size laid end to end in any order run on seamlessly — a river can
// be any length and stop against a wall.
const RIVER_W = T * 4;
const riverBank = (x: number) =>
  12 + 2.5 * Math.sin((2 * Math.PI * 2 * x) / RIVER_W) + 1.5 * Math.sin((2 * Math.PI * 5 * x) / RIVER_W);
// One cell's bank: two swings, tuned so it meets its edges at 12 with the
// same slope as a stretch does at its ends (≈ -0.082).
const riverCellBank = (x: number) =>
  12 + 4.625 * Math.sin((2 * Math.PI * x) / T) + 2 * Math.sin((4 * Math.PI * x) / T);

interface RiverShape {
  w: number;
  bank: (x: number) => number;
  reeds: number[];
  pads: [number, number][];
  seed: number;
}

const RIVER_STRETCH: RiverShape = {
  w: RIVER_W,
  bank: riverBank,
  reeds: [-70, -52, -14, 22, 40, 74],
  pads: [[-34, -6], [-28, -2], [56, -10], [8, 2]],
  seed: 411,
};

const RIVER_CELL: RiverShape = {
  w: T,
  bank: riverCellBank,
  reeds: [4],
  pads: [[-10, -8]],
  seed: 413,
};

function riverWater(g: Ctx, s: RiverShape): void {
  g.beginPath();
  g.moveTo(-s.w / 2, -30);
  g.lineTo(s.w / 2, -30);
  for (let x = s.w / 2; x >= -s.w / 2; x -= 4) g.lineTo(x, s.bank(x));
  g.closePath();
}

function paintRiver(g: Ctx, s: RiverShape): void {
  const r = rng(s.seed);
  const half = s.w / 2;
  // Muddy bank below the waterline, fading into the meadow.
  g.beginPath();
  for (let x = -half; x <= half; x += 4) g.lineTo(x, s.bank(x) + 7);
  for (let x = half; x >= -half; x -= 4) g.lineTo(x, s.bank(x) - 2);
  g.closePath();
  g.fillStyle = '#5a4a34';
  g.fill();
  // The water: deep at the far bank, lighter in the shallows.
  g.fillStyle = vgrad(g, -24, 16, [[0, '#24404e'], [0.7, '#3a6270'], [1, '#56808a']]);
  riverWater(g, s);
  g.fill();
  g.save();
  riverWater(g, s);
  g.clip();
  // Dawn sky caught on the surface, in long horizontal streaks.
  for (let i = 0; i < Math.round(s.w / 14); i++) {
    const x = -half + ((i * 37) % s.w);
    const y = -20 + ((i * 13) % 30);
    g.fillStyle = withAlpha(i % 3 === 0 ? '#f4c8b8' : '#c8dce4', 0.12 + (i % 4) * 0.04);
    g.fillRect(x, y, Math.min(10 + (i % 5) * 4, half - x), 0.9);
  }
  // Wet dark margin along the bank.
  g.strokeStyle = 'rgba(20,30,30,0.45)';
  g.lineWidth = 3;
  g.beginPath();
  for (let x = -half; x <= half; x += 4) g.lineTo(x, s.bank(x) - 1);
  g.stroke();
  for (const [x, y] of s.pads) {
    g.fillStyle = '#3e6a3a';
    g.beginPath();
    g.arc(x, y, 3, 0.4, Math.PI * 2);
    g.lineTo(x, y);
    g.fill();
  }
  g.restore();
  // Reeds and cattails along the bank (kept clear of the piece's ends).
  for (const rx of s.reeds) {
    const by = s.bank(rx) + 2;
    for (let k = 0; k < 6; k++) {
      const x = rx + (k - 2.5) * 1.8;
      const h = 10 + r() * 9;
      const lean = (r() - 0.5) * 5;
      g.strokeStyle = r() < 0.5 ? '#4a6a34' : '#5e7e3c';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, by);
      g.quadraticCurveTo(x + lean * 0.3, by - h * 0.6, x + lean, by - h);
      g.stroke();
      if (k % 3 === 1) {
        g.fillStyle = '#5a3a22';
        g.beginPath();
        g.ellipse(x + lean * 0.85, by - h + 2, 1.2, 2.6, lean * 0.04, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // Pebbles on the mud.
  for (let i = 0; i < Math.round(s.w / 10); i++) {
    const x = -half + 6 + r() * (s.w - 12);
    g.fillStyle = r() < 0.5 ? '#8a8476' : '#6e6a60';
    g.beginPath();
    g.ellipse(x, s.bank(x) + 2 + r() * 4, 1 + r() * 1.2, 0.8, 0, 0, Math.PI * 2);
    g.fill();
  }
}

/** Sheen drifting downstream, wrapping at the piece's width. */
function riverSheen(g: Ctx, s: RiverShape, t: number): void {
  g.save();
  riverWater(g, s);
  g.clip();
  const n = Math.max(2, Math.round(s.w / 21));
  for (let i = 0; i < n; i++) {
    const x = (((i * 53 + t * 9) % s.w) + s.w) % s.w - s.w / 2;
    const y = -18 + ((i * 11) % 26);
    g.fillStyle = `rgba(230,240,245,${0.14 + 0.08 * Math.sin(t * 1.3 + i)})`;
    g.fillRect(x, y, 14, 0.8);
    g.fillRect(x - s.w, y, 14, 0.8);
  }
  g.restore();
}

const riverSegment: PropArt = {
  origin: [T + H, 0],
  ink: '#1a2a30',
  finish: { shading: 0.05, rimAlpha: 0, outline: 0 },
  body: (g) => paintRiver(g, RIVER_STRETCH),
  live: (g, t) => riverSheen(g, RIVER_STRETCH, t),
};

const riverCell: PropArt = {
  origin: [0, 0],
  ink: '#1a2a30',
  finish: { shading: 0.05, rimAlpha: 0, outline: 0 },
  body: (g) => paintRiver(g, RIVER_CELL),
  live: (g, t) => riverSheen(g, RIVER_CELL, t),
};

// --- Rowboat: a little boat moored on the river. Floor dressing. ----------
const rowboat: PropArt = {
  origin: [0, 0],
  ink: '#2a1a10',
  finish: { shading: 0.3, rimAlpha: 0.2, outline: 0.5 },
  body: (g) => {
    const wood = '#7a5434';
    // Mooring stake on the bank and its rope.
    g.fillStyle = shade(wood, -0.15);
    g.fillRect(26, 6, 3, 12);
    g.strokeStyle = '#a8946a';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(21, -4);
    g.quadraticCurveTo(25, 4, 27, 8);
    g.stroke();
    // Shadow under the hull.
    g.fillStyle = 'rgba(10,20,30,0.35)';
    g.beginPath();
    g.ellipse(1, 4, 22, 4, 0, 0, Math.PI * 2);
    g.fill();
    // Inside of the boat.
    g.fillStyle = shade(wood, -0.35);
    g.beginPath();
    g.moveTo(-19, -5);
    g.quadraticCurveTo(0, -9, 21, -5);
    g.quadraticCurveTo(0, -2, -19, -5);
    g.closePath();
    g.fill();
    // Hull.
    g.save();
    g.beginPath();
    g.moveTo(-21, -5);
    g.quadraticCurveTo(-18, 5, 0, 5);
    g.quadraticCurveTo(18, 5, 23, -5);
    g.quadraticCurveTo(0, -1, -21, -5);
    g.closePath();
    g.clip();
    planks(g, -22, -6, 46, 12, wood, false, 2.6, 421);
    g.restore();
    g.fillStyle = shade(wood, 0.3);
    g.beginPath();
    g.moveTo(-21, -5);
    g.quadraticCurveTo(0, -1, 23, -5);
    g.lineTo(23, -4);
    g.quadraticCurveTo(0, 0, -21, -4);
    g.closePath();
    g.fill();
    // Thwart and a shipped oar.
    g.fillStyle = shade(wood, 0.1);
    g.fillRect(-2, -7, 4, 3);
    g.strokeStyle = shade(wood, 0.2);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-14, -8);
    g.lineTo(14, -5);
    g.stroke();
    g.fillStyle = shade(wood, 0.2);
    g.beginPath();
    g.ellipse(17, -4.6, 4, 1.6, 0.1, 0, Math.PI * 2);
    g.fill();
  },
  live: (g, t) => {
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.4 + i / 2) % 1;
      g.strokeStyle = `rgba(220,235,240,${0.35 * (1 - k)})`;
      g.lineWidth = 0.6;
      g.beginPath();
      g.ellipse(1, 2, 22 + k * 8, 4 + k * 2.4, 0, 0, Math.PI);
      g.stroke();
    }
  },
};

// --- Campfire: a ring of stones, crossed logs and a pot on a tripod. ------
const campfire: PropArt = {
  origin: [0, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 1, 12, 16, 4.5, 0.35),
  body: (g) => {
    // Ash bed and the ring of stones.
    g.fillStyle = '#2a2420';
    g.beginPath();
    g.ellipse(0, 9, 11, 4, 0, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const x = Math.cos(a) * 13;
      const y = 9 + Math.sin(a) * 5;
      g.fillStyle = shade('#8a8476', (i % 3 - 1) * 0.12 + (Math.sin(a) > 0 ? 0 : -0.2));
      g.beginPath();
      g.ellipse(x, y, 3.4, 2.4, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Crossed logs, charred at the ends.
    for (const a of [-0.4, 0.4]) {
      g.save();
      g.translate(0, 8);
      g.rotate(a);
      g.fillStyle = '#5a3f28';
      g.fillRect(-10, -1.8, 20, 3.6);
      g.fillStyle = '#1e1612';
      g.fillRect(-3, -1.8, 6, 3.6);
      g.restore();
    }
    // Tripod and the pot hung over the fire.
    g.strokeStyle = '#4a3220';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-12, 12);
    g.lineTo(0, -22);
    g.lineTo(12, 12);
    g.moveTo(1, 6);
    g.lineTo(0, -22);
    g.stroke();
    g.strokeStyle = '#2a2420';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(0, -22);
    g.lineTo(0, -14);
    g.stroke();
    g.fillStyle = vgrad(g, -14, -6, [[0, '#4a4550'], [1, '#1a181e']]);
    g.beginPath();
    g.ellipse(0, -10, 5.5, 4.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2830';
    g.fillRect(-6, -14.5, 12, 1.6);
  },
  live: (g, t) => {
    flame(g, 0, 8, 3, t, 0.4);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = `rgba(255,120,40,${0.25 + 0.1 * Math.sin(t * 5)})`;
    g.beginPath();
    g.ellipse(0, 9, 9, 3, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  },
};

// --- Tent: a patched canvas tent, its flaps tied back. 2×2. -----------------
const tent: PropArt = {
  origin: [H, H],
  ink: '#2a2418',
  shadow: (g) => floorShadow(g, 8, 30, 42, 9, 0.45),
  body: (g) => {
    const canvas = '#8e8a5e';
    // Side panel running back to the right, in shadow.
    g.fillStyle = shade(canvas, -0.3);
    g.beginPath();
    g.moveTo(0, -32);
    g.lineTo(16, -38);
    g.lineTo(46, 22);
    g.lineTo(32, 30);
    g.closePath();
    g.fill();
    g.strokeStyle = withAlpha(shade(canvas, -0.55), 0.5);
    g.lineWidth = 0.7;
    for (const k of [0.33, 0.66]) {
      g.beginPath();
      g.moveTo(16 * k, -32 - 6 * k);
      g.lineTo(32 + 14 * k, 30 - 8 * k);
      g.stroke();
    }
    // The front: an A of canvas.
    g.fillStyle = vgrad(g, -32, 30, [[0, shade(canvas, 0.12)], [1, shade(canvas, -0.12)]]);
    g.beginPath();
    g.moveTo(0, -32);
    g.lineTo(32, 30);
    g.lineTo(-32, 30);
    g.closePath();
    g.fill();
    // Dark doorway with a bedroll inside.
    g.fillStyle = '#16120c';
    g.beginPath();
    g.moveTo(0, -20);
    g.lineTo(14, 30);
    g.lineTo(-14, 30);
    g.closePath();
    g.fill();
    g.fillStyle = '#7a2a24';
    rr(g, -9, 22, 16, 6, 3);
    g.fill();
    g.fillStyle = '#5a1e1a';
    g.beginPath();
    g.ellipse(-9, 25, 2, 3, 0, 0, Math.PI * 2);
    g.fill();
    // Flaps tied back.
    for (const s of [-1, 1]) {
      g.fillStyle = shade(canvas, s < 0 ? 0.05 : -0.08);
      g.beginPath();
      g.moveTo(0, -20);
      g.quadraticCurveTo(s * 6, 2, s * 14, 30);
      g.lineTo(s * 20, 30);
      g.quadraticCurveTo(s * 14, 8, s * 11, 4);
      g.closePath();
      g.fill();
      g.strokeStyle = '#a8946a';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(s * 9, 6);
      g.lineTo(s * 14, 4);
      g.stroke();
    }
    // A patch.
    g.fillStyle = shade('#a07a4a', 0.05);
    g.fillRect(-22, 14, 7, 6);
    g.strokeStyle = 'rgba(40,30,20,0.5)';
    g.lineWidth = 0.5;
    g.strokeRect(-22, 14, 7, 6);
    // Ridge pole, guy ropes and pegs.
    g.fillStyle = shade(WOOD, -0.1);
    g.fillRect(-1, -38, 2, 7);
    g.strokeStyle = '#a8946a';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(0, -32);
    g.lineTo(-42, 32);
    g.moveTo(16, -38);
    g.lineTo(44, -6);
    g.stroke();
    g.fillStyle = shade(WOOD, -0.2);
    g.fillRect(-43, 30, 2, 4);
    g.fillRect(43, -7, 2, 4);
  },
};

// --- Pine: a tall conifer at the wood's edge. ------------------------------
const pineTree: PropArt = {
  origin: [0, 0],
  ink: '#10241a',
  shadow: (g) => floorShadow(g, 6, 20, 22, 6, 0.42),
  body: (g) => {
    const dark = '#1e3a2a';
    const mid = '#2a4e36';
    const lit = '#4a7a50';
    g.fillStyle = hgrad(g, -3, 3, [[0, '#6a4a30'], [1, '#3a2618']]);
    g.fillRect(-2.8, 4, 5.6, 18);
    const r = rng(431);
    const tiers: [number, number, number][] = [
      [12, 20, -10],
      [0, 17, -24],
      [-13, 13, -38],
      [-26, 9, -54],
    ];
    for (const [base, half, top] of tiers) {
      // Drooping, ragged lower edge.
      const tier = () => {
        g.beginPath();
        g.moveTo(0, top);
        g.lineTo(half, base);
        for (let k = 1; k <= 6; k++) {
          const x = half - (k / 6) * half * 2;
          g.quadraticCurveTo(x + half / 6, base + 4, x, base + (k % 2 === 0 ? 0 : 1.5));
        }
        g.closePath();
      };
      g.fillStyle = mid;
      tier();
      g.fill();
      g.save();
      tier();
      g.clip();
      g.fillStyle = withAlpha(lit, 0.75);
      g.beginPath();
      g.moveTo(0, top);
      g.lineTo(-half - 2, base + 4);
      g.lineTo(-half * 0.2, base + 4);
      g.closePath();
      g.fill();
      g.fillStyle = withAlpha(dark, 0.7);
      g.beginPath();
      g.moveTo(0, top);
      g.lineTo(half + 2, base + 4);
      g.lineTo(half * 0.35, base + 4);
      g.closePath();
      g.fill();
      for (let i = 0; i < 16; i++) {
        const y = top + r() * (base - top);
        const span = ((y - top) / (base - top)) * half;
        const x = (r() - 0.5) * span * 2;
        g.strokeStyle = x < 0 ? withAlpha('#7aa870', 0.5) : withAlpha('#0e2416', 0.45);
        g.lineWidth = 0.7;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (x < 0 ? -2 : 2), y + 2);
        g.stroke();
      }
      g.restore();
    }
  },
};

// --- Boulder: mossy rocks half-sunk in the grass. --------------------------
const boulder: PropArt = {
  origin: [0, 0],
  ink: '#22221e',
  shadow: (g) => floorShadow(g, 2, 13, 19, 5),
  body: (g) => {
    const st = '#8a8678';
    const rock = (x: number, y: number, w: number, h: number) => {
      g.fillStyle = vgrad(g, y - h, y, [[0, shade(st, 0.2)], [1, shade(st, -0.35)]]);
      g.beginPath();
      g.moveTo(x - w, y);
      g.quadraticCurveTo(x - w * 1.05, y - h * 0.8, x - w * 0.4, y - h);
      g.quadraticCurveTo(x + w * 0.4, y - h * 1.1, x + w, y - h * 0.4);
      g.quadraticCurveTo(x + w * 1.1, y - h * 0.1, x + w * 0.9, y);
      g.closePath();
      g.fill();
      g.fillStyle = withAlpha('#ffffff', 0.12);
      g.beginPath();
      g.ellipse(x - w * 0.35, y - h * 0.75, w * 0.35, h * 0.15, -0.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = withAlpha('#5a7a3a', 0.75);
      g.beginPath();
      g.ellipse(x - w * 0.1, y - h * 0.92, w * 0.45, h * 0.14, 0, 0, Math.PI * 2);
      g.fill();
    };
    rock(-3, 13, 13, 22);
    rock(11, 14, 7, 10);
    g.strokeStyle = 'rgba(30,28,24,0.5)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-6, -4);
    g.lineTo(-3, 3);
    g.lineTo(-5, 9);
    g.stroke();
    g.fillStyle = withAlpha('#c8c060', 0.6);
    for (const [x, y] of [[2, -2], [-10, 6], [12, 8]] as const) {
      g.beginPath();
      g.arc(x, y, 1.1, 0, Math.PI * 2);
      g.fill();
    }
    const r = rng(441);
    for (let i = 0; i < 5; i++) grassTuft(g, -16 + r() * 32, 14, 3 + r() * 3, r);
  },
};

// --- Stump: a felled tree's stump with an axe left in it. ------------------
const stump: PropArt = {
  origin: [0, 0],
  ink: '#2a1a10',
  shadow: (g) => floorShadow(g, 3, 13, 17, 4.5),
  body: (g) => {
    const bark = '#5a3f28';
    // A sawn log lying beside it.
    g.fillStyle = vgrad(g, 6, 14, [[0, shade(bark, 0.15)], [1, shade(bark, -0.3)]]);
    g.fillRect(4, 6, 14, 8);
    g.fillStyle = '#c8a070';
    g.beginPath();
    g.ellipse(18, 10, 2.6, 4, 0, 0, Math.PI * 2);
    g.fill();
    // Stump: bark sides, ringed top.
    g.fillStyle = hgrad(g, -10, 10, [[0, shade(bark, 0.2)], [1, shade(bark, -0.35)]]);
    g.beginPath();
    g.moveTo(-10, -4);
    g.lineTo(10, -4);
    g.lineTo(11, 12);
    g.quadraticCurveTo(13, 14, 14, 14);
    g.lineTo(-14, 14);
    g.quadraticCurveTo(-12, 13, -11, 12);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(30,18,10,0.55)';
    g.lineWidth = 0.6;
    for (const x of [-6, -1, 4, 8]) {
      g.beginPath();
      g.moveTo(x, -3);
      g.lineTo(x + 0.6, 12);
      g.stroke();
    }
    g.fillStyle = '#c8a070';
    g.beginPath();
    g.ellipse(0, -4, 10, 3.6, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(120,80,40,0.55)';
    g.lineWidth = 0.5;
    for (const k of [0.3, 0.55, 0.8]) {
      g.beginPath();
      g.ellipse(0.5, -4, 10 * k, 3.6 * k, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // The axe.
    g.strokeStyle = '#8a6a44';
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(-1, -6);
    g.lineTo(-11, -22);
    g.stroke();
    g.fillStyle = '#7a7e88';
    g.beginPath();
    g.moveTo(-3, -9);
    g.lineTo(3, -7);
    g.lineTo(2, -3);
    g.lineTo(-2, -4);
    g.closePath();
    g.fill();
    // Chips in the grass.
    g.fillStyle = '#c8a070';
    for (const [x, y] of [[-15, 10], [-12, 15], [13, 15], [-17, 14]] as const) g.fillRect(x, y, 2, 1);
  },
};

// --- Wildflowers: a patch of dawn-damp meadow flowers. Floor dressing. ----
const wildflowers: PropArt = {
  origin: [0, 0],
  ink: '#1e2a18',
  finish: { shading: 0.1, rimAlpha: 0.05, outline: 0.3 },
  body: (g) => {
    const r = rng(451);
    for (let i = 0; i < 10; i++) grassTuft(g, -18 + r() * 36, -8 + r() * 20, 3 + r() * 3, r);
    const cols = ['#f4f0e0', '#f2d35a', '#b88ad8', '#f0a0b8', '#f4f0e0'];
    for (let i = 0; i < 26; i++) {
      const x = -18 + r() * 36;
      const y = -10 + r() * 20;
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      g.arc(x, y, 0.9 + r() * 0.7, 0, Math.PI * 2);
      g.fill();
      if (i % 4 === 0) {
        g.fillStyle = '#e8b030';
        g.fillRect(x - 0.3, y - 0.3, 0.6, 0.6);
      }
    }
  },
};

const PROP_ART: Record<Exclude<PropKind, 'battlements'>, PropArt> = {
  pillar,
  torch,
  throne,
  chandelier,
  banner,
  diningTable,
  bed,
  chest,
  gate,
  barrel,
  crate,
  weaponRack,
  bookshelf,
  statue,
  fountain,
  house,
  castle,
  burningCastle,
  well,
  marketStall,
  lamppost,
  tree,
  hedge,
  cart,
  signpost,
  townhouse,
  guildhall,
  bakery,
  tavern,
  bench,
  planter,
  noticeBoard,
  pillory,
  plazaMosaic,
  pigeons,
  sewerEntrance,
  wallTower,
  shack,
  fence,
  laundryLine,
  junkPile,
  deadTree,
  cropPatch,
  drainGrate,
  puddle,
  lanternPost,
  sewerWall,
  sewerOutfall,
  sewerArch,
  cistern,
  brickPillar,
  manholeLadder,
  pipes,
  bonePile,
  glowShrooms,
  rats,
  escapeWagon,
  riverSegment,
  riverCell,
  rowboat,
  campfire,
  tent,
  pineTree,
  boulder,
  stump,
  wildflowers,
};

/**
 * Battlements: a crenellated stone band across the very top of the board —
 * the castle's outer wall. Spans the whole width regardless of placed cell.
 */
function drawBattlements(g: Ctx): void {
  g.save();
  masonry(g, 0, 0, BOARD_WIDTH, 14, '#6a707a', 4.6, 5);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, 12, BOARD_WIDTH, 3);
  const grad = g.createLinearGradient(0, 15, 0, 26);
  grad.addColorStop(0, 'rgba(6,4,12,0.4)');
  grad.addColorStop(1, 'rgba(6,4,12,0)');
  g.fillStyle = grad;
  g.fillRect(0, 15, BOARD_WIDTH, 11);
  const step = 24;
  for (let x = 0; x < BOARD_WIDTH; x += step) {
    g.fillStyle = vgrad(g, 0, 8, [[0, '#8a909a'], [1, '#5a606a']]);
    g.fillRect(x + 3, 0, step - 6, 8);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.fillRect(x + 3, 0, step - 6, 1);
  }
  g.restore();
}

// ===========================================================================
// Dispatch
// ===========================================================================

/**
 * Draw one decorative prop of `kind` anchored at cell centre (`x`,`y`). Shared
 * with the UI. `lit` paints a lightable prop (the lantern post) burning.
 */
export function drawProp(
  ctx: CanvasRenderingContext2D,
  kind: PropKind,
  x: number,
  y: number,
  color?: string,
  lit = false,
): void {
  if (kind === 'battlements') {
    drawBattlements(ctx);
    return;
  }
  const art = PROP_ART[kind];
  if (!art) return;
  const meta = PROP_META[kind];
  const col = color ?? DEFAULT_BANNER_COLOR;
  const [ox, oy] = art.origin;
  const [x0, y0, x1, y1] = meta.bounds;
  const box: FigureBox = { x: x0 - ox - 6, y: y0 - oy - 6, w: x1 - x0 + 12, h: y1 - y0 + 12 };
  ctx.save();
  ctx.translate(x + ox, y + oy);
  art.shadow?.(ctx);
  paintFigure(
    ctx,
    (g) => art.body(g, col, lit),
    {
      accent: art.ink,
      outline: art.finish?.outline ?? 0.6,
      rim: '#fff1d6',
      rimAlpha: art.finish?.rimAlpha ?? 0.32,
      shading: art.finish?.shading ?? 0.55,
      headY: box.y,
      feetY: box.y + box.h,
      box,
    },
    `prop|${kind}|${kind === 'banner' ? col : ''}${lit ? '|lit' : ''}`,
  );
  art.live?.(ctx, nowSec(), col, lit);
  ctx.restore();
}


/**
 * The escape wagon in motion, for the getaway cutscene: drawn like the parked
 * prop at its anchor cell centre (`x`, `y`), but with turning wheels and a
 * trotting team (`paintWagon`), lifted `bob` px on its springs. `alpha` fades
 * it. Painted fresh while moving; at rest it reuses the prop's cached frame.
 */
export function drawWagonRig(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  o: { spin: number; gait: number | null; speed: number; bob?: number; alpha?: number },
): void {
  const art = escapeWagon;
  const [ox, oy] = art.origin;
  const [x0, y0, x1, y1] = PROP_META.escapeWagon.bounds;
  const box: FigureBox = { x: x0 - ox - 6, y: y0 - oy - 6, w: x1 - x0 + 12, h: y1 - y0 + 12 };
  const still = o.gait == null && o.spin === 0;
  ctx.save();
  ctx.translate(x + ox, y + oy);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  art.shadow?.(ctx);
  ctx.translate(0, -(o.bob ?? 0));
  paintFigure(
    ctx,
    (g) => paintWagon(g, o.spin, o.gait, o.speed),
    {
      accent: art.ink,
      outline: 0.6,
      rim: '#fff1d6',
      rimAlpha: 0.32,
      shading: 0.55,
      headY: box.y,
      feetY: box.y + box.h,
      box,
    },
    still ? 'prop|escapeWagon|' : undefined,
  );
  ctx.restore();
}
/**
 * Hand-authored dressing for the original castle stages that carry no `decor`
 * data (keyed by level id). Mirrors `CASTLE_DECOR_CELLS` for placement blocking.
 */
export function drawLegacyDecor(ctx: CanvasRenderingContext2D, levelId: number): void {
  const at = (kind: PropKind, col: number, row: number, color?: string) => drawProp(ctx, kind, cellX(col), cellY(row), color);
  switch (levelId) {
    case 1:
      drawBattlements(ctx);
      at('gate', 13, 2);
      at('torch', 12, 2);
      at('torch', 14, 2);
      at('pillar', 11, 5);
      at('pillar', 14, 5);
      at('pillar', 2, 5);
      break;
    case 2:
      at('diningTable', 9, 8);
      at('diningTable', 14, 2);
      at('torch', 2, 5);
      at('torch', 15, 4);
      break;
    case 3:
      for (const col of [5, 9, 13]) {
        at('pillar', col, 1);
        at('pillar', col, 9);
      }
      at('chandelier', 7, 0);
      at('chandelier', 11, 0);
      at('banner', 3, 0, '#2b3d78');
      at('banner', 15, 0, '#8e1f2d');
      break;
    case 4:
      at('bed', 5, 0);
      at('chest', 2, 4);
      at('chest', 4, 4);
      at('torch', 4, 0);
      at('torch', 8, 0);
      at('banner', 11, 0, '#472a6b');
      at('banner', 14, 0, '#c9a24a');
      break;
    case 5:
      for (const [col, row] of [[1, 1], [14, 1], [1, 8], [14, 8]] as const) at('pillar', col, row);
      at('throne', 7, 1);
      at('torch', 6, 1);
      at('torch', 10, 1);
      break;
  }
}

// ===========================================================================
// Prop metadata — layering, bounds, lights and emitters
// ===========================================================================

/**
 * How a prop sorts against the figures on the board:
 *  - `ground`   — floor-level (a dais, the top-wall band): always under figures.
 *  - `standing` — has height: depth-sorted with figures by its `base` line, so
 *                 a champion can stand in front of or behind it.
 *  - `overhead` — hangs above the floor (chandeliers): drawn over figures.
 */
export type PropLayer = 'ground' | 'standing' | 'overhead';

/** A light a prop casts, relative to its anchor cell's centre. */
export interface PropLight {
  dx: number;
  dy: number;
  radius: number;
  family: 'fire' | 'candle' | 'lantern' | 'window' | 'moon' | 'holy' | 'frost';
  intensity: number;
  /** Whether it flickers like a flame (vs. a steady window/lantern). */
  flicker?: boolean;
  /** Colour-bloom multiplier (windows clear less darkness than they glow). */
  glow?: number;
}

export interface PropMeta {
  layer: PropLayer;
  /** Visual bounds relative to the anchor cell centre: [x0, y0, x1, y1]. */
  bounds: [number, number, number, number];
  /** Depth line (y, relative to the anchor centre) where it meets the floor. */
  base: number;
  /** Fade when a figure stands behind it (tall props that could hide units). */
  occludes?: boolean;
  lights?: PropLight[];
  /** Flame emitters (embers + smoke), relative to the anchor centre. */
  flames?: { dx: number; dy: number; strength?: number }[];
  /** Chimney smoke emitters. */
  chimneys?: { dx: number; dy: number }[];
}

/** Per-kind layering, bounds, lights and emitters (anchor-centre relative). */
export const PROP_META: Record<PropKind, PropMeta> = {
  pillar: {
    layer: 'standing',
    bounds: [-16, -42, 16, 22],
    base: 18,
    occludes: true,
    lights: [{ dx: 0, dy: -36, radius: 120, family: 'fire', intensity: 0.75, flicker: true }],
    flames: [{ dx: 0, dy: -36, strength: 0.6 }],
  },
  torch: {
    layer: 'standing',
    bounds: [-9, -24, 9, 13],
    base: 10,
    lights: [{ dx: 0, dy: -16, radius: 140, family: 'fire', intensity: 0.9, flicker: true }],
    flames: [{ dx: 0, dy: -18 }],
  },
  throne: {
    layer: 'ground',
    bounds: [-14, -45, T * 2 + 14, 52],
    base: 49,
    lights: [
      { dx: T - 38, dy: H - 16, radius: 120, family: 'fire', intensity: 0.8, flicker: true },
      { dx: T + 38, dy: H - 16, radius: 120, family: 'fire', intensity: 0.8, flicker: true },
      { dx: T, dy: H - 30, radius: 80, family: 'holy', intensity: 0.3, glow: 0.6 },
    ],
    flames: [
      { dx: T - 38, dy: H - 18 },
      { dx: T + 38, dy: H - 18 },
    ],
  },
  chandelier: {
    layer: 'overhead',
    bounds: [-18, -58, 18, 10],
    base: 18,
    lights: [{ dx: 0, dy: 0, radius: 170, family: 'candle', intensity: 0.85, flicker: true }],
  },
  banner: { layer: 'standing', bounds: [-17, -2, 17, 37], base: 34 },
  diningTable: {
    layer: 'standing',
    bounds: [-50, -30, 50, 26],
    base: 22,
    lights: [{ dx: 0, dy: -14, radius: 120, family: 'candle', intensity: 0.75, flicker: true }],
    flames: [{ dx: 0, dy: -20, strength: 0.4 }],
  },
  bed: { layer: 'standing', bounds: [-26, -26, 74, 66], base: 64, occludes: true },
  chest: {
    layer: 'standing',
    bounds: [-18, -18, 18, 15],
    base: 14,
    lights: [{ dx: 0, dy: -6, radius: 40, family: 'holy', intensity: 0.25, glow: 0.8 }],
  },
  gate: { layer: 'standing', bounds: [-22, -24, 22, 23], base: 21 },
  battlements: { layer: 'ground', bounds: [0, 0, 0, 0], base: -999 },
  barrel: { layer: 'standing', bounds: [-16, -20, 16, 16], base: 16 },
  crate: { layer: 'standing', bounds: [-16, -18, 18, 16], base: 16 },
  weaponRack: { layer: 'standing', bounds: [-16, -30, 16, 19], base: 18 },
  bookshelf: { layer: 'standing', bounds: [-18, -28, 66, 22], base: 21, occludes: true },
  statue: { layer: 'standing', bounds: [-20, -4, 20, 66], base: 64, occludes: true },
  fountain: {
    layer: 'standing',
    bounds: [-20, -16, 68, 58],
    base: 56,
    lights: [{ dx: H, dy: H, radius: 90, family: 'frost', intensity: 0.2, glow: 0.5 }],
  },
  house: {
    layer: 'standing',
    bounds: [-18, -44, 114, 70],
    base: 68,
    occludes: true,
    lights: [
      { dx: T - 34, dy: H + 4, radius: 70, family: 'window', intensity: 0.45, glow: 1.2 },
      { dx: T + 34, dy: H + 4, radius: 70, family: 'window', intensity: 0.45, glow: 1.2 },
    ],
    chimneys: [{ dx: T + 33, dy: H - 66 }],
  },
  castle: {
    layer: 'standing',
    bounds: [-16, -42, T * 2 + 16, 112],
    base: 108,
    occludes: true,
    lights: [
      { dx: T, dy: T - 30, radius: 60, family: 'window', intensity: 0.4, glow: 1.2 },
      { dx: T, dy: T - 7, radius: 60, family: 'window', intensity: 0.4, glow: 1.2 },
      { dx: T - 24, dy: T + 30, radius: 110, family: 'fire', intensity: 0.7, flicker: true, glow: 0.45 },
      { dx: T + 24, dy: T + 30, radius: 110, family: 'fire', intensity: 0.7, flicker: true, glow: 0.45 },
    ],
    flames: [
      { dx: T - 24, dy: T + 30 },
      { dx: T + 24, dy: T + 30 },
    ],
  },
  // Bounds hold the static body; the live flames rise past them on purpose.
  burningCastle: {
    layer: 'standing',
    bounds: [-16, -42, T * 2 + 24, 112],
    base: 108,
    occludes: true,
    lights: [
      { dx: T + 47, dy: T - 22, radius: 170, family: 'fire', intensity: 0.95, flicker: true, glow: 0.8 },
      { dx: T - 40, dy: T - 52, radius: 110, family: 'fire', intensity: 0.65, flicker: true, glow: 0.6 },
      { dx: T, dy: T - 28, radius: 110, family: 'fire', intensity: 0.7, flicker: true, glow: 0.6 },
      { dx: T, dy: T + 50, radius: 140, family: 'fire', intensity: 0.85, flicker: true, glow: 0.6 },
    ],
    flames: [
      { dx: T + 47, dy: T - 30, strength: 3 },
      { dx: T - 39, dy: T - 56, strength: 1.4 },
      { dx: T, dy: T - 32, strength: 1.4 },
      { dx: T + 2, dy: T + 50, strength: 1.8 },
      { dx: T + 30, dy: T + 54, strength: 0.4 },
    ],
    chimneys: [
      { dx: T + 46, dy: T - 40 },
      { dx: T - 39, dy: T - 62 },
    ],
  },
  well: { layer: 'standing', bounds: [-27, -48, 27, 24], base: 20, occludes: true },
  marketStall: {
    layer: 'standing',
    bounds: [-16, -38, 66, 20],
    base: 20,
    occludes: true,
    lights: [{ dx: H, dy: -10, radius: 70, family: 'lantern', intensity: 0.35, glow: 0.8 }],
  },
  lamppost: {
    layer: 'standing',
    bounds: [-9, -57, 9, 24],
    base: 22,
    occludes: true,
    lights: [{ dx: 0, dy: -38, radius: 130, family: 'lantern', intensity: 0.85, flicker: true }],
  },
  tree: { layer: 'standing', bounds: [-28, -44, 28, 23], base: 22, occludes: true },
  hedge: { layer: 'standing', bounds: [-21, -14, 21, 18], base: 16 },
  cart: { layer: 'standing', bounds: [-12, -32, 70, 24], base: 22 },
  signpost: { layer: 'standing', bounds: [-23, -32, 23, 23], base: 22 },
  townhouse: {
    layer: 'standing',
    bounds: [-16, -38, 64, 70],
    base: 68,
    occludes: true,
    lights: [
      { dx: H - 18, dy: H - 8, radius: 60, family: 'window', intensity: 0.4, glow: 1.2 },
      { dx: H + 18, dy: H - 8, radius: 60, family: 'window', intensity: 0.4, glow: 1.2 },
      { dx: H, dy: H - 33, radius: 50, family: 'window', intensity: 0.3, glow: 1 },
    ],
  },
  guildhall: {
    layer: 'standing',
    bounds: [-24, -30, T * 3 + 24, 119],
    base: 114,
    occludes: true,
    lights: [
      { dx: T + H - 20, dy: T + 36, radius: 95, family: 'lantern', intensity: 0.7, flicker: true },
      { dx: T + H + 20, dy: T + 36, radius: 95, family: 'lantern', intensity: 0.7, flicker: true },
      { dx: T + H - 63, dy: T + 37, radius: 70, family: 'window', intensity: 0.4, glow: 1.2 },
      { dx: T + H + 63, dy: T + 37, radius: 70, family: 'window', intensity: 0.4, glow: 1.2 },
      { dx: T + H, dy: T + 1, radius: 50, family: 'window', intensity: 0.35, glow: 1.1 },
      { dx: T + H, dy: T - 33, radius: 38, family: 'window', intensity: 0.25, glow: 0.8 },
    ],
  },
  bakery: {
    layer: 'standing',
    bounds: [-15, -38, 69, 68],
    base: 68,
    occludes: true,
    lights: [
      { dx: H - 15, dy: H + 23, radius: 70, family: 'window', intensity: 0.5, glow: 1.2 },
      { dx: H, dy: H - 10, radius: 50, family: 'window', intensity: 0.3, glow: 1 },
    ],
    chimneys: [{ dx: H + 20, dy: H - 56 }],
  },
  tavern: {
    layer: 'standing',
    bounds: [-22, -31, 64, 68],
    base: 68,
    occludes: true,
    lights: [
      { dx: H - 7, dy: H + 25, radius: 85, family: 'window', intensity: 0.55, glow: 1.2 },
      { dx: H + 18, dy: H + 20, radius: 55, family: 'window', intensity: 0.4, glow: 1.2 },
      { dx: H, dy: H - 10, radius: 55, family: 'window', intensity: 0.3, glow: 1 },
    ],
    chimneys: [{ dx: H - 27, dy: H - 54 }],
  },
  bench: { layer: 'standing', bounds: [-19, -13, 19, 15], base: 13 },
  planter: { layer: 'standing', bounds: [-17, -18, 17, 15], base: 14 },
  noticeBoard: { layer: 'standing', bounds: [-20, -37, 20, 22], base: 20 },
  pillory: { layer: 'standing', bounds: [-17, -34, 17, 17], base: 16 },
  plazaMosaic: { layer: 'ground', bounds: [-47, -41, 95, 101], base: 0 },
  pigeons: { layer: 'ground', bounds: [-22, -12, 22, 17], base: 0 },
  // The sewer's depth line is the tunnel mouth, so foes running in stay drawn
  // in front of its darkness; it never fades, as only its doorway is reachable.
  sewerEntrance: {
    layer: 'standing',
    bounds: [-27, -29, 122, 70],
    base: 44,
    lights: [{ dx: T + 40, dy: H - 16, radius: 120, family: 'fire', intensity: 0.85, flicker: true }],
    flames: [{ dx: T + 40, dy: H - 18, strength: 0.6 }],
  },
  wallTower: {
    layer: 'standing',
    bounds: [-11, -82, 58, 69],
    base: 68,
    occludes: true,
    lights: [
      { dx: H + 16, dy: H + 15, radius: 110, family: 'fire', intensity: 0.8, flicker: true },
      { dx: H, dy: H - 25, radius: 40, family: 'window', intensity: 0.3, glow: 1 },
    ],
    flames: [{ dx: H + 16, dy: H + 13, strength: 0.5 }],
  },
  shack: {
    layer: 'standing',
    bounds: [-15, -30, 64, 64],
    base: 64,
    occludes: true,
    lights: [{ dx: H - 17, dy: H + 8, radius: 50, family: 'candle', intensity: 0.35, flicker: true }],
    chimneys: [{ dx: H + 20, dy: H - 52 }],
  },
  fence: { layer: 'standing', bounds: [-22, -18, 24, 14], base: 12 },
  laundryLine: { layer: 'standing', bounds: [-22, -34, 69, 18], base: 16 },
  junkPile: { layer: 'standing', bounds: [-25, -21, 20, 16], base: 14 },
  deadTree: { layer: 'standing', bounds: [-30, -42, 18, 23], base: 22, occludes: true },
  cropPatch: { layer: 'ground', bounds: [-21, -13, 69, 17], base: 0 },
  drainGrate: { layer: 'ground', bounds: [-14, -11, 14, 12], base: 0 },
  puddle: { layer: 'ground', bounds: [-24, -14, 24, 14], base: 0 },
  // Its light only shines once the player lights it (see `drawBoard`'s lights).
  lanternPost: {
    layer: 'standing',
    bounds: [-8, -54, 20, 23],
    base: 21,
    occludes: true,
    lights: [{ dx: LANTERN_GLASS.x, dy: LANTERN_GLASS.y, radius: 150, family: 'lantern', intensity: 0.9, flicker: true }],
  },
  // Sewers. Wall sections never fade (only the floor in front is reachable);
  // the arch's depth line is the wall's foot, so foes coming out of its tunnel
  // stay behind the wall until they're clear of it.
  sewerWall: { layer: 'standing', bounds: [-25, -31, 74, 23], base: 22 },
  sewerOutfall: { layer: 'standing', bounds: [-25, -31, 74, 23], base: 22 },
  sewerArch: { layer: 'standing', bounds: [-25, -33, 120, 24], base: 22 },
  cistern: { layer: 'ground', bounds: [-24, -14, 72, 64], base: 0 },
  brickPillar: {
    layer: 'standing',
    bounds: [-33, -85, 33, 21],
    base: 20,
    occludes: true,
    lights: [{ dx: 15, dy: -24, radius: 115, family: 'lantern', intensity: 0.8, flicker: true }],
  },
  manholeLadder: {
    layer: 'standing',
    bounds: [-10, -67, 12, 19],
    base: 16,
    lights: [{ dx: 2, dy: 4, radius: 80, family: 'moon', intensity: 0.6, glow: 0.7 }],
  },
  pipes: { layer: 'standing', bounds: [-18, -35, 20, 19], base: 16 },
  bonePile: { layer: 'standing', bounds: [-17, -9, 19, 14], base: 12 },
  glowShrooms: {
    layer: 'ground',
    bounds: [-14, -10, 14, 8],
    base: 0,
    lights: [{ dx: 0, dy: -3, radius: 55, family: 'frost', intensity: 0.45, glow: 1.2 }],
  },
  rats: { layer: 'ground', bounds: [-12, -8, 12, 10], base: 0 },
  // Riverside. The wagon's depth line sits above its tail cell, so foes that
  // reach it stay drawn in front; it never fades (only its tail is reachable).
  escapeWagon: {
    layer: 'standing',
    bounds: [-24, -22, 120, 68],
    base: 52,
    lights: [
      { dx: T - 6, dy: H - 31, radius: 110, family: 'lantern', intensity: 0.8, flicker: true },
      { dx: T - 48, dy: H - 4, radius: 40, family: 'candle', intensity: 0.35, glow: 1 },
    ],
  },
  riverSegment: { layer: 'ground', bounds: [-24, -30, 168, 24], base: 0 },
  riverCell: { layer: 'ground', bounds: [-24, -30, 24, 24], base: 0 },
  rowboat: { layer: 'ground', bounds: [-22, -10, 30, 18], base: 0 },
  campfire: {
    layer: 'standing',
    bounds: [-17, -23, 17, 16],
    base: 12,
    lights: [{ dx: 0, dy: 2, radius: 120, family: 'fire', intensity: 0.85, flicker: true }],
    flames: [{ dx: 0, dy: 4, strength: 0.5 }],
  },
  tent: { layer: 'standing', bounds: [-20, -16, 70, 58], base: 54, occludes: true },
  pineTree: { layer: 'standing', bounds: [-22, -56, 22, 23], base: 22, occludes: true },
  boulder: { layer: 'standing', bounds: [-21, -11, 19, 15], base: 14 },
  stump: { layer: 'standing', bounds: [-18, -23, 21, 16], base: 14 },
  wildflowers: { layer: 'ground', bounds: [-20, -14, 23, 13], base: 0 },
};

/** Board-pixel position of a decor prop's anchor-cell centre. */
export function propAnchor(col: number, row: number): { x: number; y: number } {
  return { x: cellX(col), y: cellY(row) };
}


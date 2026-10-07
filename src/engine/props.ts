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
import { paintFigure, type FigureBox } from './figure';
import { MATERIAL, rng, shade, withAlpha } from './palette';

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
  body: (g: Ctx, color: string) => void;
  live?: (g: Ctx, t: number, color: string) => void;
  /** Outline ink accent (contextual ink is derived from it). */
  ink: string;
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

/** Draw one decorative prop of `kind` anchored at cell centre (`x`,`y`). Shared with the UI. */
export function drawProp(
  ctx: CanvasRenderingContext2D,
  kind: PropKind,
  x: number,
  y: number,
  color?: string,
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
    (g) => art.body(g, col),
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
    `prop|${kind}|${kind === 'banner' ? col : ''}`,
  );
  art.live?.(ctx, nowSec(), col);
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
};

/** Board-pixel position of a decor prop's anchor-cell centre. */
export function propAnchor(col: number, row: number): { x: number; y: number } {
  return { x: cellX(col), y: cellY(row) };
}


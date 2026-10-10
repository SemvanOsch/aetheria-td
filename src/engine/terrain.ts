/**
 * Baked terrain — the floor, the enemy path and the board's ground shading,
 * painted **once per stage** into an offscreen canvas and blitted each frame
 * with a single `drawImage`.
 *
 * Every detail (grass tufts, slab cracks, plank knots, marble veins, carpet
 * weave, ruts and pebbles) is scattered from a seeded RNG keyed on the stage
 * id, so a stage looks identical every time with no stored images. The
 * authored `BoardTheme` colours stay the source of truth: its two ground
 * colours become the material's base/variation tones and its path stroke
 * layers keep their colours, with material detail laid over them.
 *
 * The path layer re-bakes only when the set of fully revealed lanes changes
 * (a hidden lane finishing its roll-out); a lane mid-reveal is drawn live by
 * the renderer on top of the cached layer.
 */

import { BOARD_HEIGHT, BOARD_WIDTH, COLS, ROWS, TILE } from '../domain/grid';
import { DEFAULT_PATH_LAYERS, DEFAULT_THEME, type BoardTheme, type FloorKind, type PathKind } from '../domain/decor';
import { mix, rng, seedOf, shade, withAlpha } from './palette';

type Pt = { x: number; y: number };
type Ctx = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Everything the baker needs about a stage. */
export interface TerrainSpec {
  stageKey: string | number;
  theme: BoardTheme | undefined;
  /** Waypoint polylines of the lanes to bake (visible + fully revealed). */
  lanes: Pt[][];
  /** Device-pixel scale to bake at. */
  scale: number;
}

/** Bake the floor + path into one canvas of BOARD size × `scale`. */
export function bakeTerrain(spec: TerrainSpec): HTMLCanvasElement {
  const { scale } = spec;
  const canvas = makeCanvas(Math.round(BOARD_WIDTH * scale), Math.round(BOARD_HEIGHT * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const seed = seedOf(spec.stageKey);
  const theme = spec.theme ?? DEFAULT_THEME;
  paintFloor(ctx, theme, seed);
  paintPaths(ctx, spec.lanes, theme, seed);
  paintGroundShading(ctx, theme);
  return canvas;
}

// ===========================================================================
// Floors
// ===========================================================================

function paintFloor(ctx: Ctx, theme: BoardTheme, seed: number): void {
  const kind: FloorKind = theme.floor ?? 'stone';
  const a = theme.groundEven;
  const b = theme.groundOdd;
  const r = rng(seed ^ 0x51a7);
  ctx.save();
  // Base: the mean of the two theme tones, with large soft value blotches so
  // the floor never reads as a flat fill.
  ctx.fillStyle = mix(a, b, 0.5);
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  blotches(ctx, r, a, b, kind === 'grass' ? 34 : 18);

  switch (kind) {
    case 'grass':
      paintGrass(ctx, r, a, b);
      break;
    case 'wood':
      paintWood(ctx, r, a, b);
      break;
    case 'marble':
      paintMarble(ctx, r, a, b);
      break;
    case 'dirt':
      paintDirt(ctx, r, a, b);
      break;
    case 'cobble':
      paintCobble(ctx, r, a, b);
      break;
    case 'flagstone':
      paintSlabs(ctx, r, a, b, 2);
      break;
    case 'stone':
    default:
      paintSlabs(ctx, r, a, b, 1);
      break;
  }
  ctx.restore();
}

/** Large, soft light/dark patches — low-frequency value variation. */
function blotches(ctx: Ctx, r: () => number, a: string, b: string, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = r() * BOARD_WIDTH;
    const y = r() * BOARD_HEIGHT;
    const rad = 40 + r() * 120;
    const light = r() < 0.5;
    const col = light ? shade(b, 0.12) : shade(a, -0.18);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, withAlpha(col, 0.28 + r() * 0.18));
    g.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

/** Faint cell grid so placement cells stay legible on organic floors. */
function cellHint(ctx: Ctx, color: string, alpha: number): void {
  ctx.fillStyle = withAlpha(color, alpha);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if ((col + row) % 2 === 0) ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
    }
  }
}

function paintGrass(ctx: Ctx, r: () => number, a: string, b: string): void {
  cellHint(ctx, '#000000', 0.035);
  // Dirt patches worn through the turf.
  for (let i = 0; i < 9; i++) {
    const x = r() * BOARD_WIDTH;
    const y = r() * BOARD_HEIGHT;
    const rx = 10 + r() * 22;
    const ry = rx * (0.45 + r() * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, 'rgba(92,70,44,0.55)');
    g.addColorStop(0.7, 'rgba(92,70,44,0.25)');
    g.addColorStop(1, 'rgba(92,70,44,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Grass clusters: tufts of 4–7 blades leaning with a common wind direction,
  // dark under-blades then lit tips, so the lawn has a grain.
  const dark = shade(a, -0.28);
  const lit = shade(b, 0.22);
  const tip = shade(b, 0.4);
  const lean = 0.35;
  ctx.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const x = r() * BOARD_WIDTH;
    const y = r() * BOARD_HEIGHT;
    const blades = 4 + Math.floor(r() * 4);
    const h = 3 + r() * 4.5;
    for (let k = 0; k < blades; k++) {
      const bx = x + (r() - 0.5) * 6;
      const bend = lean + (r() - 0.5) * 0.7;
      const hh = h * (0.7 + r() * 0.5);
      ctx.strokeStyle = k < blades / 2 ? dark : r() < 0.3 ? tip : lit;
      ctx.globalAlpha = 0.55 + r() * 0.35;
      ctx.lineWidth = 0.9 + r() * 0.5;
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.quadraticCurveTo(bx + bend * hh * 0.4, y - hh * 0.6, bx + bend * hh, y - hh);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // Small flowers — sparse, in little drifts.
  const petals = ['#f4e9c4', '#f2d35a', '#c9a7f0', '#f5b0c0'];
  for (let i = 0; i < 26; i++) {
    const cx = r() * BOARD_WIDTH;
    const cy = r() * BOARD_HEIGHT;
    const col = petals[Math.floor(r() * petals.length)];
    const n = 2 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * 14;
      const y = cy + (r() - 0.5) * 10;
      ctx.fillStyle = 'rgba(20,30,10,0.35)';
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 0.8, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe9a0';
      ctx.fillRect(x - 0.35, y - 0.35, 0.7, 0.7);
    }
  }
  // Occasional stones half-sunk in the turf.
  for (let i = 0; i < 14; i++) stone(ctx, r() * BOARD_WIDTH, r() * BOARD_HEIGHT, 1.6 + r() * 2.6, r(), '#8a8c84');
}

/** A small embedded stone with a contact shadow and a lit top. */
function stone(ctx: Ctx, x: number, y: number, s: number, rot: number, base: string): void {
  ctx.fillStyle = 'rgba(10,8,6,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + 0.6, y + s * 0.5, s * 1.15, s * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(base, -0.15);
  ctx.beginPath();
  ctx.ellipse(x, y, s, s * 0.72, rot, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(base, 0.22);
  ctx.beginPath();
  ctx.ellipse(x - s * 0.25, y - s * 0.25, s * 0.5, s * 0.3, rot, 0, Math.PI * 2);
  ctx.fill();
}

/** A wobbly quad inset into a rect: an irregular hand-cut slab outline. */
function slabPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: () => number, j: number, inset: number): void {
  const pts: Pt[] = [
    { x: x + inset + r() * j, y: y + inset + r() * j },
    { x: x + w / 2 + (r() - 0.5) * j, y: y + inset + r() * j * 0.6 },
    { x: x + w - inset - r() * j, y: y + inset + r() * j },
    { x: x + w - inset - r() * j * 0.6, y: y + h / 2 + (r() - 0.5) * j },
    { x: x + w - inset - r() * j, y: y + h - inset - r() * j },
    { x: x + w / 2 + (r() - 0.5) * j, y: y + h - inset - r() * j * 0.6 },
    { x: x + inset + r() * j, y: y + h - inset - r() * j },
    { x: x + inset + r() * j * 0.6, y: y + h / 2 + (r() - 0.5) * j },
  ];
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/**
 * Stone / flagstone floors: irregular slabs per cell (one, or two split along
 * the cell), mortar gaps, per-slab value variation, worn lit edges, cracks and
 * the odd tuft of moss in the joints.
 */
function paintSlabs(ctx: Ctx, r: () => number, a: string, b: string, split: 1 | 2): void {
  // Mortar bed under everything.
  ctx.fillStyle = shade(a, -0.42);
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x0 = col * TILE;
      const y0 = row * TILE;
      const parts: [number, number, number, number][] = [];
      if (split === 2) {
        // Alternate the split direction so the floor reads as laid stone.
        if ((col + row) % 2 === 0) {
          const s = TILE * (0.4 + r() * 0.2);
          parts.push([x0, y0, s, TILE], [x0 + s, y0, TILE - s, TILE]);
        } else {
          const s = TILE * (0.4 + r() * 0.2);
          parts.push([x0, y0, TILE, s], [x0, y0 + s, TILE, TILE - s]);
        }
      } else {
        parts.push([x0, y0, TILE, TILE]);
      }
      const checker = (col + row) % 2 === 0 ? a : b;
      for (const [x, y, w, h] of parts) {
        const tone = shade(checker, (r() - 0.5) * 0.16);
        slabPath(ctx, x, y, w, h, r, 2.2, 1.4);
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, shade(tone, 0.07));
        g.addColorStop(1, shade(tone, -0.07));
        ctx.fillStyle = g;
        ctx.fill();
        // Worn edges: lit top-left lip, shadowed bottom-right.
        ctx.save();
        ctx.clip();
        ctx.lineWidth = 2;
        ctx.strokeStyle = withAlpha(shade(tone, 0.35), 0.35);
        ctx.beginPath();
        ctx.moveTo(x + 1, y + h - 2);
        ctx.lineTo(x + 1, y + 1);
        ctx.lineTo(x + w - 2, y + 1);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.moveTo(x + w - 1, y + 2);
        ctx.lineTo(x + w - 1, y + h - 1);
        ctx.lineTo(x + 2, y + h - 1);
        ctx.stroke();
        // Speckle grain.
        for (let i = 0; i < 10; i++) {
          ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.09)';
          ctx.fillRect(x + r() * w, y + r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
        }
        // Cracks: a jagged polyline wandering across ~1 in 4 slabs.
        if (r() < 0.26) {
          ctx.strokeStyle = 'rgba(0,0,0,0.42)';
          ctx.lineWidth = 0.8;
          let cx = x + r() * w;
          let cy = y + r() * h * 0.3;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          const steps = 3 + Math.floor(r() * 4);
          for (let i = 0; i < steps; i++) {
            cx += (r() - 0.5) * 10;
            cy += 3 + r() * 6;
            ctx.lineTo(cx, cy);
          }
          ctx.stroke();
        }
        ctx.restore();
        // Moss creeping out of the joints.
        if (r() < 0.12) {
          const mx = x + (r() < 0.5 ? 2 : w - 2);
          const my = y + r() * h;
          for (let i = 0; i < 6; i++) {
            ctx.fillStyle = withAlpha(r() < 0.5 ? '#4f7a3a' : '#6f9a4a', 0.45);
            ctx.beginPath();
            ctx.arc(mx + (r() - 0.5) * 5, my + (r() - 0.5) * 7, 0.8 + r() * 1.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }
}

/**
 * Wood: planks running along the rows (two per cell height) with staggered
 * butt joints, dark gaps, grain lines, knots, worn lit edges and scratches.
 */
function paintWood(ctx: Ctx, r: () => number, a: string, b: string): void {
  const plankH = TILE / 2;
  ctx.fillStyle = shade(a, -0.5);
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  for (let y = 0; y < BOARD_HEIGHT; y += plankH) {
    let x = -r() * TILE * 2;
    while (x < BOARD_WIDTH) {
      const len = TILE * (1.5 + Math.floor(r() * 3) * 0.5);
      const tone = shade(r() < 0.5 ? a : b, (r() - 0.5) * 0.22);
      const px = x + 0.5;
      const py = y + 0.6;
      const pw = len - 1;
      const ph = plankH - 1.2;
      const g = ctx.createLinearGradient(0, py, 0, py + ph);
      g.addColorStop(0, shade(tone, 0.1));
      g.addColorStop(0.5, tone);
      g.addColorStop(1, shade(tone, -0.12));
      ctx.fillStyle = g;
      ctx.fillRect(px, py, pw, ph);
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.clip();
      // Grain: long wavy lines running the plank's length.
      const lines = 3 + Math.floor(r() * 3);
      for (let i = 0; i < lines; i++) {
        const gy = py + 2 + r() * (ph - 4);
        const amp = 0.6 + r() * 1.4;
        const freq = 0.02 + r() * 0.04;
        const ph0 = r() * 10;
        ctx.strokeStyle = withAlpha(shade(tone, -0.35), 0.35 + r() * 0.2);
        ctx.lineWidth = 0.6 + r() * 0.5;
        ctx.beginPath();
        for (let gx = px; gx <= px + pw; gx += 4) {
          const yy = gy + Math.sin(gx * freq + ph0) * amp;
          if (gx === px) ctx.moveTo(gx, yy);
          else ctx.lineTo(gx, yy);
        }
        ctx.stroke();
      }
      // Knot: concentric dark rings with grain flowing around.
      if (r() < 0.35) {
        const kx = px + 8 + r() * (pw - 16);
        const ky = py + ph * (0.3 + r() * 0.4);
        for (let k = 3; k >= 1; k--) {
          ctx.strokeStyle = withAlpha(shade(tone, -0.45), 0.25 + k * 0.08);
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.ellipse(kx, ky, 1.3 * k + 0.5, 0.8 * k + 0.3, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = withAlpha(shade(tone, -0.55), 0.7);
        ctx.beginPath();
        ctx.ellipse(kx, ky, 1.2, 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Scratches: fine pale scuffs across the grain.
      if (r() < 0.4) {
        ctx.strokeStyle = 'rgba(255,235,200,0.12)';
        ctx.lineWidth = 0.6;
        for (let i = 0; i < 2; i++) {
          const sx = px + r() * pw;
          const sy = py + r() * ph;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + 4 + r() * 8, sy + (r() - 0.5) * 4);
          ctx.stroke();
        }
      }
      ctx.restore();
      // Worn top edge catches the light; nail heads at the butt ends.
      ctx.fillStyle = withAlpha(shade(tone, 0.4), 0.3);
      ctx.fillRect(px, py, pw, 0.8);
      ctx.fillStyle = 'rgba(30,20,12,0.55)';
      for (const nx of [px + 3, px + pw - 3]) {
        ctx.beginPath();
        ctx.arc(nx, py + ph * 0.3, 0.7, 0, Math.PI * 2);
        ctx.arc(nx, py + ph * 0.72, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      x += len;
    }
  }
}

/**
 * Marble: polished cell slabs in a two-tone checker, meandering veins running
 * across slab boundaries, a soft reflected sheen and worn bevelled edges.
 */
function paintMarble(ctx: Ctx, r: () => number, a: string, b: string): void {
  ctx.fillStyle = shade(a, -0.35);
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * TILE + 0.8;
      const y = row * TILE + 0.8;
      const w = TILE - 1.6;
      const tone = shade((col + row) % 2 === 0 ? a : b, (r() - 0.5) * 0.08);
      const g = ctx.createLinearGradient(x, y, x + w, y + w);
      g.addColorStop(0, shade(tone, 0.1));
      g.addColorStop(0.55, tone);
      g.addColorStop(1, shade(tone, -0.08));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, w);
      // Bevel.
      ctx.strokeStyle = withAlpha(shade(tone, 0.4), 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y + w);
      ctx.lineTo(x + 0.5, y + 0.5);
      ctx.lineTo(x + w, y + 0.5);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.moveTo(x + w - 0.5, y);
      ctx.lineTo(x + w - 0.5, y + w - 0.5);
      ctx.lineTo(x, y + w - 0.5);
      ctx.stroke();
    }
  }
  // Veins: long soft curves crossing the whole floor, a pale line over a
  // faint dark shadow, branching occasionally.
  const vein = (x0: number, y0: number, len: number, width: number, depth: number) => {
    let x = x0;
    let y = y0;
    let ang = r() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const pts: Pt[] = [{ x, y }];
    for (let i = 0; i < len; i++) {
      ang += (r() - 0.5) * 0.7;
      x += Math.cos(ang) * 7;
      y += Math.sin(ang) * 7;
      pts.push({ x, y });
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(10,8,20,0.18)';
    ctx.lineWidth = width + 1.2;
    ctx.stroke();
    ctx.strokeStyle = withAlpha(shade(b, 0.55), 0.28);
    ctx.lineWidth = width;
    ctx.stroke();
    if (depth > 0 && r() < 0.7) {
      const p = pts[Math.floor(pts.length * (0.3 + r() * 0.5))];
      vein(p.x, p.y, Math.floor(len * 0.5), width * 0.6, depth - 1);
    }
  };
  for (let i = 0; i < 9; i++) vein(r() * BOARD_WIDTH, r() * BOARD_HEIGHT, 18 + Math.floor(r() * 20), 0.9, 2);
  // Reflected sheen: broad diagonal soft highlight, as if from high windows.
  const sheen = ctx.createLinearGradient(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.42, 'rgba(255,255,255,0.05)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.09)');
  sheen.addColorStop(0.58, 'rgba(255,255,255,0.04)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
}

function paintDirt(ctx: Ctx, r: () => number, a: string, b: string): void {
  cellHint(ctx, '#000000', 0.04);
  for (let i = 0; i < 260; i++) {
    stone(ctx, r() * BOARD_WIDTH, r() * BOARD_HEIGHT, 0.6 + r() * 1.6, r(), shade(b, 0.1));
  }
  // Worn darker tracks and footprints.
  for (let i = 0; i < 18; i++) {
    const x = r() * BOARD_WIDTH;
    const y = r() * BOARD_HEIGHT;
    footprints(ctx, x, y, r() * Math.PI * 2, shade(a, -0.35), r);
  }
}

/** A short trail of paired footprints heading along `ang`. */
function footprints(ctx: Ctx, x: number, y: number, ang: number, col: string, r: () => number): void {
  ctx.fillStyle = withAlpha(col, 0.35);
  const n = 3 + Math.floor(r() * 3);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const fx = x + ux * i * 6 - uy * side * 2;
    const fy = y + uy * i * 6 + ux * side * 2;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 1.8, 1.1, ang, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintCobble(ctx: Ctx, r: () => number, a: string, b: string): void {
  ctx.fillStyle = shade(a, -0.45);
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  const step = TILE / 4;
  for (let y = 0; y < BOARD_HEIGHT; y += step) {
    const off = (Math.floor(y / step) % 2) * (step / 2);
    for (let x = -step; x < BOARD_WIDTH + step; x += step) {
      cobbleStone(ctx, x + off + step / 2, y + step / 2, step, shade(r() < 0.5 ? a : b, (r() - 0.5) * 0.25), r);
    }
  }
}

function cobbleStone(ctx: Ctx, cx: number, cy: number, step: number, tone: string, r: () => number): void {
  const rx = step * 0.44 + (r() - 0.5) * 1.4;
  const ry = step * 0.4 + (r() - 0.5) * 1.4;
  const g = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, 0.5, cx, cy, rx * 1.2);
  g.addColorStop(0, shade(tone, 0.22));
  g.addColorStop(1, shade(tone, -0.18));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, (r() - 0.5) * 0.6, 0, Math.PI * 2);
  ctx.fill();
}

// ===========================================================================
// Paths
// ===========================================================================

/**
 * Stroke every polyline as ONE path, so where strokes overlap (junctions, round
 * caps) a translucent layer is painted once rather than stacking darker.
 */
function strokeAll(ctx: Ctx, strokes: Pt[][]): void {
  ctx.beginPath();
  for (const pts of strokes) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.stroke();
}

/**
 * Merge lanes into one path network: split every lane into tile-to-tile steps,
 * drop the steps lanes share (converging lanes run the same corridor), and
 * re-chain the unique steps into polylines that end at junctions and path
 * ends. Painting this instead of each lane keeps a shared stretch from being
 * drawn several times over (stacked shading, doubled trim) and lets crossing
 * corridors meet cleanly. Chains start at lane spawns where possible, so they
 * mostly run in the direction of travel.
 */
function pathNetwork(lanes: Pt[][]): Pt[][] {
  const key = (p: Pt) => `${Math.round(p.x)},${Math.round(p.y)}`;
  const nodes = new Map<string, Pt>();
  const adj = new Map<string, string[]>();
  const edges = new Set<string>();
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const node = (p: Pt) => {
    const k = key(p);
    if (!nodes.has(k)) {
      nodes.set(k, { x: Math.round(p.x), y: Math.round(p.y) });
      adj.set(k, []);
    }
    return k;
  };
  const link = (a: Pt, b: Pt) => {
    const ka = node(a);
    const kb = node(b);
    if (ka === kb || edges.has(edgeKey(ka, kb))) return;
    edges.add(edgeKey(ka, kb));
    adj.get(ka)!.push(kb);
    adj.get(kb)!.push(ka);
  };
  for (const pts of lanes) {
    if (pts.length === 1) node(pts[0]);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / TILE));
      for (let s = 0; s < steps; s++) {
        link(
          { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps },
          { x: a.x + ((b.x - a.x) * (s + 1)) / steps, y: a.y + ((b.y - a.y) * (s + 1)) / steps },
        );
      }
    }
  }

  const used = new Set<string>();
  const chains: Pt[][] = [];
  const walk = (start: string, next: string) => {
    const chain = [nodes.get(start)!];
    let prev = start;
    let cur = next;
    used.add(edgeKey(prev, cur));
    for (;;) {
      chain.push(nodes.get(cur)!);
      const out = adj.get(cur)!;
      if (out.length !== 2) break; // a path end or a junction
      const n = out[0] === prev ? out[1] : out[0];
      if (used.has(edgeKey(cur, n))) break; // closed a loop
      used.add(edgeKey(cur, n));
      prev = cur;
      cur = n;
    }
    chains.push(chain);
  };
  const starts = [
    ...lanes.filter((l) => l.length > 0).map((l) => key(l[0])),
    ...[...adj.keys()].filter((k) => adj.get(k)!.length !== 2),
    ...adj.keys(), // anything left is a pure loop
  ];
  for (const s of starts) {
    for (const n of adj.get(s) ?? []) {
      if (!used.has(edgeKey(s, n))) walk(s, n);
    }
  }

  // Drop the in-between points of straight runs (keeps the turns).
  return chains.map((c) =>
    c.filter((p, i) => {
      if (i === 0 || i === c.length - 1) return true;
      const a = c[i - 1];
      const b = c[i + 1];
      return (p.x - a.x) * (b.y - p.y) !== (p.y - a.y) * (b.x - p.x);
    }),
  );
}

/** Points sampled every `step` px along a polyline, with unit tangents. */
function samples(pts: Pt[], step: number): { x: number; y: number; tx: number; ty: number }[] {
  const out: { x: number; y: number; tx: number; ty: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    for (let d = 0; d < len; d += step) out.push({ x: a.x + tx * d, y: a.y + ty * d, tx, ty });
  }
  return out;
}

/**
 * Paint every lane's path: the authored stroke layers (outer edge → fill →
 * centre), layer by layer across lanes so converging lanes never overdraw each
 * other's fill, then material detail masked to the path's fill width.
 */
function paintPaths(ctx: Ctx, laneWaypoints: Pt[][], theme: BoardTheme, seed: number): void {
  // Paint the merged network, not each lane: shared stretches once, junctions clean.
  const lanes = pathNetwork(laneWaypoints);
  if (lanes.length === 0) return;
  const layers = theme.path ?? DEFAULT_PATH_LAYERS;
  const kind: PathKind = theme.pathKind ?? 'dirt';
  const outerW = layers[0]?.[1] ?? TILE - 4;
  const fillW = layers[1]?.[1] ?? TILE - 12;
  const fillCol = layers[1]?.[0] ?? layers[0][0];
  const edgeCol = layers[0][0];
  const centreCol = layers[2]?.[0] ?? fillCol;
  const centreW = layers[2]?.[1] ?? fillW * 0.5;
  const r = rng(seed ^ 0x9a7e);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Soft shadow the path's raised edge casts onto the floor (dirt is sunken
  // instead, so it gets a darker rim and no lift).
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = outerW + 6;
  strokeAll(ctx, lanes);

  layers.forEach(([col, w], li) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    strokeAll(ctx, lanes);
    // Carpet trim rides the border band: laid right after the edge layer so
    // the fill of a crossing segment covers it cleanly.
    if (li === 0 && kind === 'carpet') paintCarpetTrim(ctx, lanes, edgeCol, outerW, fillW);
    if (li === 0 && kind === 'sewer') paintSewerCurb(ctx, lanes, edgeCol, outerW, fillW);
  });
  ctx.restore();

  // Material detail drawn on a scratch layer, then masked to the fill width.
  const detail = makeCanvas(ctx.canvas.width, ctx.canvas.height);
  const d = detail.getContext('2d')!;
  d.setTransform(ctx.getTransform());
  const all = lanes.flatMap((pts) => samples(pts, 3));
  switch (kind) {
    case 'carpet':
      paintCarpetDetail(d, lanes, all, fillCol, centreCol, edgeCol, fillW, centreW, r);
      break;
    case 'cobble':
      paintCobbleDetail(d, lanes, fillCol, r);
      break;
    case 'sewer':
      paintSewerDetail(d, lanes, all, fillCol, centreCol, fillW, r);
      break;
    case 'stone':
      paintStonePathDetail(d, all, fillCol, fillW, r);
      break;
    case 'dirt':
    default:
      paintDirtDetail(d, lanes, all, fillCol, fillW, r);
      break;
  }
  // Mask to the fill corridor.
  d.globalCompositeOperation = 'destination-in';
  d.lineJoin = 'round';
  d.lineCap = 'round';
  d.strokeStyle = '#000';
  d.lineWidth = kind === 'dirt' ? outerW : fillW;
  strokeAll(d, lanes);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(detail, 0, 0);
  ctx.restore();

  // Grass fringe overlapping a dirt path's edge, so the track sits *in* the turf.
  if (kind === 'dirt' && theme.floor === 'grass') paintGrassFringe(ctx, lanes, theme, outerW, r);
}

function paintDirtDetail(
  d: Ctx,
  lanes: Pt[][],
  all: { x: number; y: number; tx: number; ty: number }[],
  fill: string,
  width: number,
  r: () => number,
): void {
  // Ruts: two darker wheel/foot-worn grooves either side of the centreline.
  d.lineCap = 'round';
  // One run of grooves per stroke, so ruts never jump between separate paths.
  for (const off of [-width * 0.22, width * 0.22]) {
    d.strokeStyle = withAlpha(shade(fill, -0.32), 0.45);
    d.lineWidth = 3.2;
    d.beginPath();
    for (const pts of lanes) {
      samples(pts, 3).forEach((s, i) => {
        const x = s.x - s.ty * off + (r() - 0.5) * 0.8;
        const y = s.y + s.tx * off + (r() - 0.5) * 0.8;
        if (i === 0) d.moveTo(x, y);
        else d.lineTo(x, y);
      });
    }
    d.stroke();
  }
  // Pebbles, footprints and patchy colour.
  for (let i = 0; i < all.length; i += 2) {
    const s = all[i];
    const o = (r() - 0.5) * width;
    const x = s.x - s.ty * o;
    const y = s.y + s.tx * o;
    if (r() < 0.22) stone(d, x, y, 0.7 + r() * 1.5, r(), shade(fill, 0.25));
    if (r() < 0.08) {
      d.fillStyle = withAlpha(r() < 0.5 ? shade(fill, 0.18) : shade(fill, -0.22), 0.35);
      d.beginPath();
      d.ellipse(x, y, 3 + r() * 6, 2 + r() * 3, r() * Math.PI, 0, Math.PI * 2);
      d.fill();
    }
  }
  for (let i = 0; i < all.length; i += 26) {
    const s = all[i];
    footprints(d, s.x - s.ty * (r() - 0.5) * 8, s.y + s.tx * (r() - 0.5) * 8, Math.atan2(s.ty, s.tx), shade(fill, -0.4), r);
  }
}

function paintStonePathDetail(
  d: Ctx,
  all: { x: number; y: number; tx: number; ty: number }[],
  fill: string,
  width: number,
  r: () => number,
): void {
  // Flagstones laid across the path: joints perpendicular to travel.
  d.strokeStyle = withAlpha(shade(fill, -0.45), 0.7);
  d.lineWidth = 1.2;
  for (let i = 0; i < all.length; i += 6 + Math.floor(r() * 3)) {
    const s = all[i];
    d.beginPath();
    d.moveTo(s.x - s.ty * width, s.y + s.tx * width);
    d.lineTo(s.x + s.ty * width, s.y - s.tx * width);
    d.stroke();
    if (r() < 0.5) {
      d.beginPath();
      const o = (r() - 0.5) * width * 0.8;
      d.moveTo(s.x - s.ty * o, s.y + s.tx * o);
      d.lineTo(s.x - s.ty * o + s.tx * 14, s.y + s.tx * o + s.ty * 14);
      d.stroke();
    }
  }
}

function paintCobbleDetail(d: Ctx, lanes: Pt[][], fill: string, r: () => number): void {
  for (const pts of lanes) {
    for (const s of samples(pts, 7)) {
      for (let k = -2; k <= 2; k++) {
        const o = k * 7 + (r() - 0.5) * 2;
        cobbleStone(d, s.x - s.ty * o, s.y + s.tx * o, 8, shade(fill, (r() - 0.5) * 0.3), r);
      }
    }
  }
}

/**
 * Carpet: a fine woven texture (crossed hatching at low alpha), a soft darker
 * wear band down the centre where boots have trodden, and lit pile.
 */
function paintCarpetDetail(
  d: Ctx,
  lanes: Pt[][],
  all: { x: number; y: number; tx: number; ty: number }[],
  fill: string,
  centre: string,
  edge: string,
  fillW: number,
  centreW: number,
  r: () => number,
): void {
  // Weave: thin crossing lines across the whole board (masked later).
  d.save();
  d.strokeStyle = withAlpha(shade(fill, -0.3), 0.22);
  d.lineWidth = 0.6;
  for (let x = -BOARD_HEIGHT; x < BOARD_WIDTH; x += 3) {
    d.beginPath();
    d.moveTo(x, 0);
    d.lineTo(x + BOARD_HEIGHT, BOARD_HEIGHT);
    d.stroke();
  }
  d.strokeStyle = withAlpha(shade(fill, 0.2), 0.12);
  for (let x = 0; x < BOARD_WIDTH + BOARD_HEIGHT; x += 3) {
    d.beginPath();
    d.moveTo(x, 0);
    d.lineTo(x - BOARD_HEIGHT, BOARD_HEIGHT);
    d.stroke();
  }
  d.restore();
  // Inner border line: a thin gold thread just inside the fill.
  d.lineJoin = 'round';
  d.lineCap = 'round';
  // Laid layer by layer across every stroke, so where corridors meet one's
  // fill covers the other's thread instead of a thread cutting across a fill.
  d.strokeStyle = withAlpha(edge, 0.85);
  d.lineWidth = fillW - 5;
  strokeAll(d, lanes);
  d.strokeStyle = fill;
  d.lineWidth = fillW - 7.5;
  strokeAll(d, lanes);
  // Centre runner (re-laid over the weave so it keeps its colour).
  d.strokeStyle = withAlpha(centre, 0.9);
  d.lineWidth = centreW;
  strokeAll(d, lanes);
  // Pile highlights + scuffed wear.
  for (let i = 0; i < all.length; i += 2) {
    const s = all[i];
    const o = (r() - 0.5) * fillW * 0.8;
    d.fillStyle = r() < 0.5 ? 'rgba(255,230,210,0.05)' : 'rgba(0,0,0,0.08)';
    d.fillRect(s.x - s.ty * o, s.y + s.tx * o, 1.4, 1.4);
  }
  d.strokeStyle = 'rgba(0,0,0,0.12)';
  d.lineWidth = centreW * 0.55;
  strokeAll(d, lanes);
}

/** Decorative gold trim along a carpet's border band: diamonds + dots. */
function paintCarpetTrim(ctx: Ctx, lanes: Pt[][], edge: string, outerW: number, fillW: number): void {
  const band = (outerW + fillW) / 4; // centre of the border band from the axis
  ctx.save();
  for (const pts of lanes) {
    const ss = samples(pts, 9);
    ss.forEach((s, i) => {
      for (const side of [-1, 1]) {
        const x = s.x - s.ty * band * side;
        const y = s.y + s.tx * band * side;
        if (i % 2 === 0) {
          ctx.fillStyle = withAlpha(shade(edge, -0.45), 0.8);
          ctx.beginPath();
          ctx.moveTo(x + s.tx * 2.4, y + s.ty * 2.4);
          ctx.lineTo(x - s.ty * 1.4, y + s.tx * 1.4);
          ctx.lineTo(x - s.tx * 2.4, y - s.ty * 2.4);
          ctx.lineTo(x + s.ty * 1.4, y - s.tx * 1.4);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = withAlpha(shade(edge, 0.35), 0.75);
          ctx.beginPath();
          ctx.arc(x, y, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }
  ctx.restore();
}

/**
 * Sewer channel curbs: dressed stones along the border band (joints across
 * it), and a pale worn lip where the curb drops into the water, left showing
 * by the fill laid over it.
 */
function paintSewerCurb(ctx: Ctx, lanes: Pt[][], edge: string, outerW: number, fillW: number): void {
  ctx.save();
  ctx.strokeStyle = shade(edge, 0.32);
  ctx.lineWidth = fillW + 3;
  strokeAll(ctx, lanes);
  ctx.strokeStyle = withAlpha(shade(edge, -0.5), 0.75);
  ctx.lineWidth = 1;
  ctx.lineCap = 'butt';
  const inner = fillW / 2;
  const outer = outerW / 2;
  for (const pts of lanes) {
    samples(pts, 11).forEach((s, i) => {
      for (const side of [-1, 1]) {
        // Stagger the joints on the two sides so they don't read as rungs.
        if ((i + (side > 0 ? 1 : 0)) % 2 === 0) continue;
        ctx.beginPath();
        ctx.moveTo(s.x - s.ty * inner * side, s.y + s.tx * inner * side);
        ctx.lineTo(s.x - s.ty * outer * side, s.y + s.tx * outer * side);
        ctx.stroke();
      }
    });
  }
  ctx.restore();
}

/**
 * Murky sewer water: dark wet edges under the curbs, sheen streaks drawn out
 * along the flow, yellow-green scum gathered at the sides, floating debris
 * and small ripples.
 */
function paintSewerDetail(
  d: Ctx,
  lanes: Pt[][],
  all: { x: number; y: number; tx: number; ty: number }[],
  fill: string,
  centre: string,
  width: number,
  r: () => number,
): void {
  d.lineCap = 'round';
  // Shadowed water along both curbs.
  for (const side of [-1, 1]) {
    const off = (width / 2 - 2) * side;
    d.strokeStyle = withAlpha(shade(fill, -0.45), 0.55);
    d.lineWidth = 5;
    d.beginPath();
    for (const pts of lanes) {
      samples(pts, 4).forEach((s, i) => {
        const x = s.x - s.ty * off;
        const y = s.y + s.tx * off;
        if (i === 0) d.moveTo(x, y);
        else d.lineTo(x, y);
      });
    }
    d.stroke();
  }
  // Scum and floating muck near the sides.
  for (let i = 0; i < all.length; i += 2) {
    const s = all[i];
    if (r() < 0.16) {
      const o = (r() < 0.5 ? -1 : 1) * width * (0.28 + r() * 0.16);
      d.fillStyle = withAlpha(r() < 0.6 ? '#8a9a4a' : '#6e7a3a', 0.22 + r() * 0.2);
      d.beginPath();
      d.ellipse(s.x - s.ty * o, s.y + s.tx * o, 2 + r() * 5, 1 + r() * 2.4, Math.atan2(s.ty, s.tx), 0, Math.PI * 2);
      d.fill();
    }
    if (r() < 0.05) {
      const o = (r() - 0.5) * width * 0.7;
      const x = s.x - s.ty * o;
      const y = s.y + s.tx * o;
      d.fillStyle = withAlpha(r() < 0.5 ? '#2a2016' : '#5a4a30', 0.75);
      if (r() < 0.5) {
        d.beginPath();
        d.arc(x, y, 0.8 + r() * 1.2, 0, Math.PI * 2);
        d.fill();
      } else {
        d.save();
        d.translate(x, y);
        d.rotate(r() * Math.PI);
        d.fillRect(-3, -0.5, 6, 1);
        d.restore();
      }
    }
  }
  // Sheen: pale streaks drawn out along the flow, brightest mid-channel.
  for (let i = 0; i < all.length; i += 3) {
    if (r() > 0.4) continue;
    const s = all[i];
    const o = (r() - 0.5) * width * 0.6;
    const len = 6 + r() * 14;
    const x = s.x - s.ty * o;
    const y = s.y + s.tx * o;
    d.strokeStyle = withAlpha(shade(centre, 0.7), 0.1 + r() * 0.14);
    d.lineWidth = 0.6 + r() * 0.8;
    d.beginPath();
    d.moveTo(x, y);
    d.lineTo(x + s.tx * len, y + s.ty * len);
    d.stroke();
  }
  // Small ripple arcs.
  for (let i = 0; i < all.length; i += 9) {
    if (r() > 0.5) continue;
    const s = all[i];
    const o = (r() - 0.5) * width * 0.5;
    d.strokeStyle = withAlpha(shade(fill, 0.55), 0.2);
    d.lineWidth = 0.6;
    d.beginPath();
    d.ellipse(s.x - s.ty * o, s.y + s.tx * o, 2.5 + r() * 2, 1.2 + r(), Math.atan2(s.ty, s.tx) + Math.PI / 2, 0, Math.PI);
    d.stroke();
  }
}

/** Blades of grass leaning over a dirt track's edge from the turf side. */
function paintGrassFringe(ctx: Ctx, lanes: Pt[][], theme: BoardTheme, outerW: number, r: () => number): void {
  const dark = shade(theme.groundEven, -0.2);
  const lit = shade(theme.groundOdd, 0.2);
  ctx.save();
  ctx.lineCap = 'round';
  for (const pts of lanes) {
    for (const s of samples(pts, 2.2)) {
      for (const side of [-1, 1]) {
        if (r() < 0.35) continue;
        const edgeOff = outerW / 2 + (r() - 0.3) * 3;
        const x = s.x - s.ty * edgeOff * side;
        const y = s.y + s.tx * edgeOff * side;
        // Lean inward over the track.
        const nx = s.ty * side;
        const ny = -s.tx * side;
        const h = 2.5 + r() * 4;
        ctx.strokeStyle = r() < 0.5 ? dark : lit;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + nx * h * 0.7 + (r() - 0.5) * 1.5, y + ny * h * 0.7 - h * 0.5);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// ===========================================================================
// Ground shading
// ===========================================================================

/**
 * Baked ambient occlusion: a soft darkening hugging the board's edges (walls)
 * and the path corridor's banks, so the play floor reads as a lit stage rather
 * than a flat sheet.
 */
function paintGroundShading(ctx: Ctx, theme: BoardTheme): void {
  // Edge AO along all four walls.
  const edge = 26;
  const sides: [number, number, number, number, number, number, number, number][] = [
    [0, 0, 0, edge, 0, 0, BOARD_WIDTH, edge],
    [0, BOARD_HEIGHT, 0, BOARD_HEIGHT - edge, 0, BOARD_HEIGHT - edge, BOARD_WIDTH, edge],
    [0, 0, edge, 0, 0, 0, edge, BOARD_HEIGHT],
    [BOARD_WIDTH, 0, BOARD_WIDTH - edge, 0, BOARD_WIDTH - edge, 0, edge, BOARD_HEIGHT],
  ];
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of sides) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(6,4,12,0.32)');
    g.addColorStop(1, 'rgba(6,4,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  }
  // Interior floors get a top wall band (the back wall's shadow).
  if (theme.floor && theme.floor !== 'grass' && theme.floor !== 'dirt') {
    const g = ctx.createLinearGradient(0, 0, 0, 40);
    g.addColorStop(0, 'rgba(6,4,12,0.35)');
    g.addColorStop(1, 'rgba(6,4,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BOARD_WIDTH, 40);
  }
}

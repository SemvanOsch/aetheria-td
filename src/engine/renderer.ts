/**
 * Canvas renderer.
 *
 * Pure drawing: reads an immutable snapshot of engine state plus a little UI
 * state (hover cell, selected unit) and paints the board. Contains no game
 * rules — it can be swapped or restyled without touching the simulation.
 */

import { BOARD_HEIGHT, BOARD_WIDTH, COLS, ROWS, TILE } from '../domain/grid';
import {
  DEFAULT_BANNER_COLOR,
  DEFAULT_PATH_LAYERS,
  DEFAULT_THEME,
  type BoardTheme,
  type PropKind,
} from '../domain/decor';
import { coneAngleDeg, DEFAULT_BURST_RADIUS, getUnit } from '../domain/units';
import { getEnemy } from '../domain/enemies';
import { drawEnemySprite, drawUnitSprite, hasEnemySprite, hasSprite, shade } from './sprites';
import {
  THROW_ANIM_TIME,
  RISE_LIFT,
  DODGE_ANIM_TIME,
  DODGE_DIST,
  DEATH_ANIM_TIME,
  DEATH_FALL_TIME,
  DEATH_HOLD_TIME,
} from './GameEngine';
import { currentSpeechLine } from './types';
import type { Enemy } from './types';
import type { GameEngine } from './GameEngine';

export interface RenderUiState {
  hoverCol: number;
  hoverRow: number;
  selectedUnitId: string | null;
  selectedTowerUid: number | null;
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  ui: RenderUiState,
): void {
  ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  drawGround(ctx, engine);
  drawPath(ctx, engine);
  // Per-level cosmetic decorations (e.g. the Throne Room's throne + pillars),
  // drawn under towers/enemies so gameplay tokens always sit on top.
  drawDecor(ctx, engine);
  // The Throne Room's boss sits on his throne until he rises on the final wave.
  drawSeatedKing(ctx, engine);
  // Before the first wave, an animated arrow trail flows along each lane so the
  // player can read where enemies will walk. It vanishes once wave 1 starts.
  drawPathPreview(ctx, engine);
  drawPlacementHints(ctx, engine, ui);
  drawTowers(ctx, engine, ui);
  drawEnemies(ctx, engine);
  drawShots(ctx, engine);
  // Wind Slices (the Wizard's cone attack) sweep over enemies.
  drawSlices(ctx, engine);
  // Homing arrows/bolts fly in world space, on top of enemies.
  drawProjectiles(ctx, engine);
  // Thrown javelins fly in world space, on top of the (faint) throw beam, so
  // they read along the exact attack direction.
  drawThrownSpears(ctx, engine);
  // Preview of a charging "throw" (extended reach) for the selected tower, so
  // the added range is visible from when the prior attack ends until it fires.
  drawThrowCharge(ctx, engine, ui);
  // AoE indicator for the selected tower is drawn on top of enemies so its
  // marker (beam / 'x') stays visible over the target.
  drawSelectedAoe(ctx, engine, ui);
  drawPuffs(ctx, engine);
  drawBursts(ctx, engine);
  drawFloaters(ctx, engine);
  // Big boss health bar(s) pinned to the top of the board, over everything.
  drawBossBars(ctx, engine);
}

/**
 * Boss health bars pinned to the top-centre of the board, drawn over everything
 * else. One stacked bar per living boss on the field: the boss's name sits above
 * the bar and its current/max HP reads inside it. Only shown once a boss has
 * actually spawned (a seated/hidden throne boss doesn't get a bar yet).
 */
function drawBossBars(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const bosses = engine.enemies.filter((e) => e.def.boss && (e.rise ?? 0) === 0);
  if (bosses.length === 0) return;

  const barW = Math.min(BOARD_WIDTH - 40, 520);
  const barH = 20;
  const gap = 10;
  const nameH = 18;
  const rowH = nameH + barH + gap;
  let top = 16;

  for (const e of bosses) {
    const pct = Math.max(0, Math.min(1, e.health / e.def.health));
    const bx = (BOARD_WIDTH - barW) / 2;
    const by = top + nameH;

    // Name (with icon) centred above the bar.
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(`${e.def.visual.icon} ${e.def.name}`, BOARD_WIDTH / 2 + 1, top + 14 + 1);
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText(`${e.def.visual.icon} ${e.def.name}`, BOARD_WIDTH / 2, top + 14);

    // Bar frame.
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(bx - 3, by - 3, barW + 6, barH + 6);
    ctx.fillStyle = '#1a1d22';
    ctx.fillRect(bx, by, barW, barH);

    // Fill.
    ctx.fillStyle = pct > 0.5 ? '#5fd38a' : pct > 0.25 ? '#f2b23c' : '#ff5a5a';
    ctx.fillRect(bx, by, barW * pct, barH);

    // Gold outline.
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffd76a';
    ctx.strokeRect(bx, by, barW, barH);

    // HP text inside the bar.
    const hp = `${Math.max(0, Math.ceil(e.health))} / ${Math.round(e.def.health)}`;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(hp, BOARD_WIDTH / 2 + 1, by + barH / 2 + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(hp, BOARD_WIDTH / 2, by + barH / 2);

    top += rowH;
  }
  ctx.textBaseline = 'alphabetic';
}

function drawSelectedAoe(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  ui: RenderUiState,
): void {
  if (ui.selectedTowerUid == null) return;
  const tower = engine.towers.find((t) => t.uid === ui.selectedTowerUid);
  if (tower) drawAoeIndicator(ctx, engine, tower);
}

/**
 * Optional per-level cosmetic palette, keyed by level id, for the hand-authored
 * castle stages. A stage may instead carry its own `theme` in the level data
 * (e.g. one exported from the Level Designer), which takes precedence — see
 * `themeFor`. Levels with neither use the default blue-slate board.
 */
const BOARD_THEMES: Record<number, BoardTheme> = {
  // Castle Door (level 1): cool grey cobblestone with a stone-slab road.
  1: {
    groundEven: '#333a44',
    groundOdd: '#3c4450',
    path: [
      ['#191d24', TILE - 4], // dark mortar edge
      ['#57606b', TILE - 12], // grey flagstone
      ['#68727e', TILE - 26], // worn centre track
    ],
  },
  // Dining Room (now level 2): warm wood-plank floor with a burgundy table runner.
  2: {
    groundEven: '#4a3728',
    groundOdd: '#54402f',
    path: [
      ['#7a5a2e', TILE - 4], // braided gold edge
      ['#6d3a30', TILE - 12], // burgundy runner
      ['#8a4a3e', TILE - 26], // lighter centre weave
    ],
  },
  // The Grand Hall (now level 3): bluish marble with a royal blue-and-gold runner.
  3: {
    groundEven: '#3f4356',
    groundOdd: '#484d62',
    path: [
      ['#b7933f', TILE - 4], // gold trim border
      ['#2b3d78', TILE - 12], // deep blue carpet
      ['#3a51a4', TILE - 26], // lighter runner down the middle
    ],
  },
  // The King's Chamber (now level 4): rich royal-purple stone with a purple-and-gold
  // carpet, the deepest, most opulent room of the castle.
  4: {
    groundEven: '#2a2038',
    groundOdd: '#332a46',
    path: [
      ['#c9a24a', TILE - 4], // gold trim border
      ['#472a6b', TILE - 12], // royal purple carpet
      ['#5b378a', TILE - 26], // lighter runner down the middle
    ],
  },
  // Throne Room (now level 5): muted plum-stone floor (light enough that the dark
  // dais + torch stems read against it) with a crimson-and-gold royal carpet
  // in place of the dirt path.
  5: {
    groundEven: '#3a2836',
    groundOdd: '#443040',
    path: [
      ['#c8a24a', TILE - 4], // gold trim border
      ['#7c1b2b', TILE - 12], // crimson carpet
      ['#9e2a3c', TILE - 26], // lighter runner down the middle
    ],
  },
};

function themeFor(engine: GameEngine): BoardTheme | undefined {
  // Level-data theme (e.g. authored in the Level Designer) wins over the
  // built-in per-id table.
  return engine.level.theme ?? BOARD_THEMES[engine.level.id];
}

function drawGround(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const theme = themeFor(engine);
  const even = theme?.groundEven ?? DEFAULT_THEME.groundEven;
  const odd = theme?.groundOdd ?? DEFAULT_THEME.groundOdd;
  // Subtle checker painted across the WHOLE board (path cells included). The
  // path is stroked on top, so the corner slivers its rounded joins don't cover
  // show the floor beneath instead of bare black canvas.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = (c + r) % 2 === 0 ? even : odd;
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    }
  }
}

/**
 * Dispatch per-level cosmetic decorations drawn beneath gameplay tokens. Every
 * prop below is placed on cells the level's path never occupies, so the
 * furnishings never sit under the enemy corridor. They are purely cosmetic — the
 * engine neither knows nor cares they exist.
 */
function drawDecor(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  // A stage carrying its own `decor` data (e.g. exported from the Level
  // Designer) draws that; the hand-authored castle stages fall through to the
  // switch below.
  const decor = engine.level.decor;
  if (decor && decor.length > 0) {
    for (const p of decor) drawProp(ctx, p.kind, cellX(p.col), cellY(p.row), p.color);
    return;
  }
  switch (engine.level.id) {
    case 1:
      drawCastleDoorDecor(ctx);
      break;
    case 2:
      drawDiningRoomDecor(ctx);
      break;
    case 3:
      drawGrandHallDecor(ctx);
      break;
    case 4:
      drawKingsChamberDecor(ctx);
      break;
    case 5:
      drawThroneRoomDecor(ctx);
      break;
  }
}

const cellX = (col: number) => col * TILE + TILE / 2;
const cellY = (row: number) => row * TILE + TILE / 2;

/**
 * Registry mapping each decorative `PropKind` to the primitive that draws it at
 * a board position (`x`,`y` = the prop's centre). This is the single dispatch
 * table both the board renderer (`drawDecor`) and the Level Designer preview go
 * through, so a prop looks identical in-game and while it's being placed.
 */
const PROP_DRAWERS: Record<
  PropKind,
  (ctx: CanvasRenderingContext2D, x: number, y: number, color?: string) => void
> = {
  pillar: (c, x, y) => drawPillar(c, x, y),
  torch: (c, x, y) => drawTorch(c, x, y),
  // The throne prop is the throne + dais monument (3×2; centred on its footprint).
  throne: (c, x, y) => drawThroneDais(c, x + TILE, y + TILE / 2),
  chandelier: (c, x, y) => drawChandelier(c, x, y),
  banner: (c, x, y, color) => drawBanner(c, x, y, color ?? DEFAULT_BANNER_COLOR),
  diningTable: (c, x, y) => drawDiningTable(c, x, y),
  bed: (c, x, y) => drawBed(c, x, y),
  chest: (c, x, y) => drawChest(c, x, y),
  gate: (c, x, y) => drawGate(c, x, y),
  // The battlement band spans the whole top wall, ignoring the placed cell.
  battlements: (c) => drawBattlements(c),
  barrel: (c, x, y) => drawBarrel(c, x, y),
  crate: (c, x, y) => drawCrate(c, x, y),
  weaponRack: (c, x, y) => drawWeaponRack(c, x, y),
  bookshelf: (c, x, y) => drawBookshelf(c, x, y),
  statue: (c, x, y) => drawStatue(c, x, y),
  fountain: (c, x, y) => drawFountain(c, x, y),
  house: (c, x, y) => drawHouse(c, x, y),
  castle: (c, x, y) => drawCastle(c, x, y),
};

/** Draw one decorative prop of `kind` centred at (`x`,`y`). Shared with the UI. */
export function drawProp(
  ctx: CanvasRenderingContext2D,
  kind: PropKind,
  x: number,
  y: number,
  color?: string,
): void {
  PROP_DRAWERS[kind]?.(ctx, x, y, color);
}

/**
 * Castle Door (level 1): a fortified gatehouse. Battlements crown the top wall,
 * a barred stone gate sits on the wall flanked by torches, and stone gate-towers
 * frame the courtyard. Path: (-1,2)→(8,2)→(8,8)→(16,8).
 */
function drawCastleDoorDecor(ctx: CanvasRenderingContext2D): void {
  drawBattlements(ctx);
  // The barred castle door high on the right wall, torches to either side.
  drawGate(ctx, cellX(13), cellY(2));
  drawTorch(ctx, cellX(12), cellY(2));
  drawTorch(ctx, cellX(14), cellY(2));
  // Stone gate-towers framing the lower courtyard (all off-path cells).
  drawPillar(ctx, cellX(11), cellY(5));
  drawPillar(ctx, cellX(14), cellY(5));
  drawPillar(ctx, cellX(2), cellY(5));
}

/**
 * The Grand Hall (now level 3): a colonnaded state room. Two rows of marble columns
 * line the hall, chandeliers hang from the ceiling and banners drape the back
 * wall. Path threads between them.
 */
function drawGrandHallDecor(ctx: CanvasRenderingContext2D): void {
  // Colonnade — a row of columns top and bottom (open cells either side of path).
  for (const col of [5, 9, 13]) {
    drawPillar(ctx, cellX(col), cellY(1));
    drawPillar(ctx, cellX(col), cellY(9));
  }
  // Chandeliers hung high between the top columns.
  drawChandelier(ctx, cellX(7), 16);
  drawChandelier(ctx, cellX(11), 16);
  // Banners on the back wall.
  drawBanner(ctx, cellX(3), 4, '#2b3d78');
  drawBanner(ctx, cellX(15), 4, '#8e1f2d');
}

/**
 * Dining Room (now level 2): a feast interrupted. Long banquet tables set with
 * plates and candelabra, chairs down each side, and wall sconces.
 */
function drawDiningRoomDecor(ctx: CanvasRenderingContext2D): void {
  drawDiningTable(ctx, cellX(9), cellY(8));
  drawDiningTable(ctx, cellX(14), cellY(2));
  // Wall sconces lighting the room.
  drawTorch(ctx, cellX(2), cellY(5));
  drawTorch(ctx, cellX(15), cellY(4));
  drawTorch(ctx, cellX(8), cellY(0) + 4);
}

/**
 * The Throne Room's furnishings: stone pillars in the open corners, wall torches
 * flanking a raised dais, and a golden throne at the head of the hall.
 */
function drawThroneRoomDecor(ctx: CanvasRenderingContext2D): void {
  const cx = cellX;
  const cy = cellY;
  // Pillars in open corners of the hall (all off-path cells).
  for (const [col, row] of [[1, 1], [14, 1], [1, 8], [14, 8]] as const) {
    drawPillar(ctx, cx(col), cy(row));
  }
  // The throne-on-dais monument at the top-centre of the hall, flanked by torches.
  drawThroneDais(ctx, cx(8), cy(1) + 15);
  drawTorch(ctx, cx(6), cy(1));
  drawTorch(ctx, cx(10), cy(1));
}

/**
 * The King's Chamber (now level 4): the corrupt king's opulent private room. A
 * canopy bed at the head, spilled treasure chests, a small side throne and
 * banners — the deepest room of the castle. The two lanes enter along rows 2 & 8
 * and merge on row 6, leaving the mid-left and top open for furnishings.
 */
function drawKingsChamberDecor(ctx: CanvasRenderingContext2D): void {
  // Grand canopy bed spanning the top-centre (2×2, anchored at cell (5,0)).
  drawBed(ctx, cellX(5), cellY(0));
  // Treasure hoard along the open mid-left.
  drawChest(ctx, cellX(2), cellY(4));
  drawChest(ctx, cellX(4), cellY(4) + 4);
  // A small side throne against the right wall.
  drawThrone(ctx, cellX(14), cellY(4));
  // Candle-torches flanking the bed + banners on the back wall.
  drawTorch(ctx, cellX(4), cellY(0) + 6);
  drawTorch(ctx, cellX(8), cellY(0) + 6);
  drawBanner(ctx, cellX(11), 4, '#472a6b');
  drawBanner(ctx, cellX(14), 4, '#c9a24a');
}

/** A short round stone pillar with a lit top, casting a soft ground shadow. */
function drawPillar(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 15, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shaft.
  const g = ctx.createLinearGradient(-11, 0, 11, 0);
  g.addColorStop(0, '#4a4150');
  g.addColorStop(0.5, '#7d7286');
  g.addColorStop(1, '#4a4150');
  ctx.fillStyle = g;
  ctx.fillRect(-11, -16, 22, 32);
  // Cap + base slabs.
  ctx.fillStyle = '#9a8fa6';
  ctx.fillRect(-14, -20, 28, 6);
  ctx.fillRect(-14, 12, 28, 6);
  ctx.restore();
}

/** A wall torch: dark bracket with a warm flame and glow. */
function drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  // Small ground shadow at the base.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 10, 7, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Bracket.
  ctx.strokeStyle = '#2a2230';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(0, -4);
  ctx.stroke();
  // Flame glow + body.
  ctx.shadowColor = '#ff9d3c';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#ffd15a';
  ctx.beginPath();
  ctx.ellipse(0, -9, 4.5, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ff8a2c';
  ctx.beginPath();
  ctx.ellipse(0, -8, 2.4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The throne standing on its raised dais, drawn as one monument centred at
 * (`x`,`y`) — the same arrangement (and size) the Throne Room stage uses. This
 * is what the `throne` prop places; its footprint is 3×2 (anchor = top-left),
 * so the drawer is invoked at the footprint centroid.
 */
function drawThroneDais(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  drawDais(ctx, x, y + 11);
  drawThrone(ctx, x, y - 11);
}

/** A two-step stone dais beneath the throne. */
function drawDais(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#3b2130';
  roundRect(ctx, -60, -6, 120, 20, 5);
  ctx.fill();
  ctx.fillStyle = '#4a2a3d';
  roundRect(ctx, -44, -16, 88, 18, 5);
  ctx.fill();
  ctx.restore();
}

/** A golden high-backed throne with a red cushion and a small crown finial. */
function drawThrone(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  const gold = '#e7b64a';
  const goldDark = '#a97e26';
  // High back.
  ctx.fillStyle = gold;
  roundRect(ctx, -16, -34, 32, 40, 5);
  ctx.fill();
  ctx.fillStyle = goldDark;
  roundRect(ctx, -12, -30, 24, 32, 4);
  ctx.fill();
  // Red cushion / backrest padding.
  ctx.fillStyle = '#8e1f2d';
  roundRect(ctx, -10, -26, 20, 24, 3);
  ctx.fill();
  ctx.fillStyle = '#b5303f';
  roundRect(ctx, -10, -4, 20, 10, 3);
  ctx.fill();
  // Armrests.
  ctx.fillStyle = gold;
  roundRect(ctx, -20, -6, 8, 14, 2);
  ctx.fill();
  roundRect(ctx, 12, -6, 8, 14, 2);
  ctx.fill();
  // Crown finial on top of the backrest.
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(-9, -34);
  ctx.lineTo(-9, -42);
  ctx.lineTo(-4.5, -37);
  ctx.lineTo(0, -44);
  ctx.lineTo(4.5, -37);
  ctx.lineTo(9, -42);
  ctx.lineTo(9, -34);
  ctx.closePath();
  ctx.fill();
  // Jewels on the crown.
  ctx.fillStyle = '#e7443f';
  ctx.beginPath();
  ctx.arc(0, -40, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A crenellated stone battlement strip across the very top edge of the board —
 * the castle's outer wall. Purely a backdrop band; nothing is placed on a cell.
 */
function drawBattlements(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  // Wall face.
  ctx.fillStyle = '#3a4048';
  ctx.fillRect(0, 0, BOARD_WIDTH, 14);
  ctx.fillStyle = '#2c3138';
  ctx.fillRect(0, 12, BOARD_WIDTH, 3);
  // Merlons (the raised teeth) marching along the top.
  ctx.fillStyle = '#4a515a';
  const step = 24;
  for (let x = 0; x < BOARD_WIDTH; x += step) {
    ctx.fillRect(x + 3, 0, step - 6, 8);
  }
  ctx.restore();
}

/** A barred stone gate: an arched opening, a raised portcullis and iron studs. */
function drawGate(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  // Stone surround.
  ctx.fillStyle = '#5a626c';
  roundRect(ctx, -20, -20, 40, 40, 4);
  ctx.fill();
  // Dark archway.
  ctx.fillStyle = '#14171c';
  ctx.beginPath();
  ctx.moveTo(-13, 18);
  ctx.lineTo(-13, -4);
  ctx.arc(0, -4, 13, Math.PI, 0);
  ctx.lineTo(13, 18);
  ctx.closePath();
  ctx.fill();
  // Portcullis grid over the opening.
  ctx.strokeStyle = '#8b929b';
  ctx.lineWidth = 2;
  for (const gx of [-8, 0, 8]) {
    ctx.beginPath();
    ctx.moveTo(gx, -12);
    ctx.lineTo(gx, 17);
    ctx.stroke();
  }
  for (const gy of [-4, 4, 12]) {
    ctx.beginPath();
    ctx.moveTo(-12, gy);
    ctx.lineTo(12, gy);
    ctx.stroke();
  }
  ctx.restore();
}

/** A hanging chandelier: a chain, an iron ring and a crown of candle flames. */
function drawChandelier(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  // Chain up to the ceiling.
  ctx.strokeStyle = '#4b4030';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -y);
  ctx.lineTo(0, -6);
  ctx.stroke();
  // Iron ring.
  ctx.strokeStyle = '#6b5a34';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.stroke();
  // Candle flames around the ring.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const cxp = Math.cos(a) * 12;
    const cyp = Math.sin(a) * 12;
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffd15a';
    ctx.beginPath();
    ctx.ellipse(cxp, cyp - 3, 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/** A hanging wall banner (pennant) in the given colour with a pale sigil bar. */
function drawBanner(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  // Rod.
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(-13, 0, 26, 3);
  // Cloth with a notched (swallowtail) bottom.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-11, 3);
  ctx.lineTo(11, 3);
  ctx.lineTo(11, 34);
  ctx.lineTo(0, 26);
  ctx.lineTo(-11, 34);
  ctx.closePath();
  ctx.fill();
  // Pale central emblem bar.
  ctx.fillStyle = 'rgba(233,238,252,0.85)';
  ctx.fillRect(-2.5, 8, 5, 14);
  ctx.restore();
}

/** A long banquet table: cloth, place settings, a candelabra and side chairs. */
function drawDiningTable(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const halfW = 46;
  ctx.save();
  ctx.translate(x, y);
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, -halfW - 2, 12, halfW * 2 + 4, 10, 4);
  ctx.fill();
  // Chairs down each long side (drawn under the tabletop).
  ctx.fillStyle = '#3a2a1c';
  for (const cxp of [-30, -10, 10, 30]) {
    ctx.fillRect(cxp - 5, -22, 10, 8);
    ctx.fillRect(cxp - 5, 14, 10, 8);
  }
  // White tablecloth.
  ctx.fillStyle = '#d9d2c4';
  roundRect(ctx, -halfW, -14, halfW * 2, 28, 5);
  ctx.fill();
  ctx.fillStyle = '#c3bba8';
  ctx.fillRect(-halfW, 8, halfW * 2, 6);
  // Plates.
  ctx.fillStyle = '#8b929b';
  for (const px of [-32, -12, 12, 32]) {
    ctx.beginPath();
    ctx.arc(px, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Central candelabra.
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -10);
  ctx.moveTo(-6, -6);
  ctx.lineTo(6, -6);
  ctx.stroke();
  for (const fx of [-6, 0, 6]) {
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 7;
    ctx.fillStyle = '#ffd15a';
    ctx.beginPath();
    ctx.ellipse(fx, -12, 1.8, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/**
 * A grand four-poster canopy bed with a draped valance and pillows. Footprint
 * is 2×2 (anchor is the top-left cell), so its centre sits half a cell right
 * and down from the anchor.
 */
function drawBed(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x + TILE / 2, y + TILE / 2);
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, -44, 30, 88, 14, 6);
  ctx.fill();
  // Mattress.
  ctx.fillStyle = '#e7e1d4';
  roundRect(ctx, -42, -10, 84, 44, 6);
  ctx.fill();
  // Blanket.
  ctx.fillStyle = '#5a2a6e';
  roundRect(ctx, -42, 12, 84, 22, 6);
  ctx.fill();
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(-42, 12, 84, 4);
  // Pillows.
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, -36, -4, 30, 14, 4);
  ctx.fill();
  roundRect(ctx, 6, -4, 30, 14, 4);
  ctx.fill();
  // Bedposts.
  ctx.fillStyle = '#7a5a2e';
  for (const px of [-42, 42]) {
    ctx.fillRect(px - 4, -38, 8, 72);
  }
  // Canopy top + drape.
  ctx.fillStyle = '#472a6b';
  ctx.fillRect(-47, -40, 94, 12);
  ctx.fillStyle = '#5a2a6e';
  ctx.beginPath();
  ctx.moveTo(-47, -28);
  ctx.quadraticCurveTo(-30, -16, -16, -28);
  ctx.quadraticCurveTo(0, -16, 16, -28);
  ctx.quadraticCurveTo(30, -16, 47, -28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A treasure chest brimming with gold coins. */
function drawChest(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 14, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body.
  ctx.fillStyle = '#5a3a1e';
  roundRect(ctx, -16, -2, 32, 16, 3);
  ctx.fill();
  // Lid (open, tilted back).
  ctx.fillStyle = '#6e4a26';
  roundRect(ctx, -16, -12, 32, 10, 3);
  ctx.fill();
  // Iron bands + lock.
  ctx.fillStyle = '#3a2a1c';
  ctx.fillRect(-2, -2, 4, 16);
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(-3, 4, 6, 5);
  // Gold coins spilling from the top.
  ctx.fillStyle = '#f2cf5b';
  for (const [gx, gy] of [[-8, -3], [-1, -5], [6, -3], [-4, 0], [3, -1]] as const) {
    ctx.beginPath();
    ctx.arc(gx, gy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A stout wooden barrel with iron hoops. */
function drawBarrel(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 16, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Barrel body (bulging staves).
  const g = ctx.createLinearGradient(-13, 0, 13, 0);
  g.addColorStop(0, '#5a3a1e');
  g.addColorStop(0.5, '#8a5a2e');
  g.addColorStop(1, '#5a3a1e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-11, -15);
  ctx.quadraticCurveTo(-16, 0, -11, 15);
  ctx.lineTo(11, 15);
  ctx.quadraticCurveTo(16, 0, 11, -15);
  ctx.closePath();
  ctx.fill();
  // Stave seams.
  ctx.strokeStyle = 'rgba(40,24,12,0.5)';
  ctx.lineWidth = 1;
  for (const sx of [-5, 0, 5]) {
    ctx.beginPath();
    ctx.moveTo(sx, -14);
    ctx.lineTo(sx, 14);
    ctx.stroke();
  }
  // Iron hoops.
  ctx.strokeStyle = '#3a3a42';
  ctx.lineWidth = 2.5;
  for (const hy of [-10, 0, 10]) {
    ctx.beginPath();
    ctx.moveTo(-14, hy);
    ctx.quadraticCurveTo(0, hy + 2, 14, hy);
    ctx.stroke();
  }
  // Lid.
  ctx.fillStyle = '#6e4a26';
  ctx.beginPath();
  ctx.ellipse(0, -15, 11, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A wooden supply crate with cross-braced planks. */
function drawCrate(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 16, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Box.
  const g = ctx.createLinearGradient(-15, 0, 15, 0);
  g.addColorStop(0, '#6e4a26');
  g.addColorStop(0.5, '#8a642e');
  g.addColorStop(1, '#6e4a26');
  ctx.fillStyle = g;
  roundRect(ctx, -15, -14, 30, 28, 2);
  ctx.fill();
  // Plank frame + diagonal braces.
  ctx.strokeStyle = '#4a2f18';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-15, -14, 30, 28);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-15, -14);
  ctx.lineTo(15, 14);
  ctx.moveTo(15, -14);
  ctx.lineTo(-15, 14);
  ctx.stroke();
  ctx.restore();
}

/** A wall rack holding crossed spears and a sword. */
function drawWeaponRack(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 18, 15, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wooden rack frame.
  ctx.fillStyle = '#4a2f18';
  ctx.fillRect(-15, -18, 4, 36);
  ctx.fillRect(11, -18, 4, 36);
  ctx.fillRect(-15, -18, 30, 4);
  ctx.fillRect(-15, 14, 30, 4);
  // Two upright spears.
  ctx.strokeStyle = '#7a5a2e';
  ctx.lineWidth = 2;
  for (const sx of [-6, 6]) {
    ctx.beginPath();
    ctx.moveTo(sx, 14);
    ctx.lineTo(sx, -20);
    ctx.stroke();
    // Spearhead.
    ctx.fillStyle = '#c8ccd4';
    ctx.beginPath();
    ctx.moveTo(sx, -26);
    ctx.lineTo(sx - 3, -18);
    ctx.lineTo(sx + 3, -18);
    ctx.closePath();
    ctx.fill();
  }
  // A sword hung across the middle.
  ctx.strokeStyle = '#b7bcc6';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-12, 2);
  ctx.lineTo(12, -4);
  ctx.stroke();
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-13, 3);
  ctx.lineTo(-9, 0);
  ctx.stroke();
  ctx.restore();
}

/**
 * A tall two-bay bookshelf. Footprint spans two cells (anchor + the cell to its
 * right), so its visual centre sits on the seam between them.
 */
function drawBookshelf(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x + TILE / 2, y);
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, -40, 16, 80, 9, 4);
  ctx.fill();
  // Case.
  ctx.fillStyle = '#4a2f18';
  roundRect(ctx, -40, -22, 80, 42, 3);
  ctx.fill();
  // Back panel.
  ctx.fillStyle = '#2f1d0f';
  ctx.fillRect(-36, -18, 72, 34);
  // Shelves + book rows.
  const bookColors = ['#7a2a2a', '#2a4a7a', '#2a6a3a', '#8a6a2a', '#5a2a6a'];
  for (let s = 0; s < 3; s++) {
    const shelfY = -18 + s * 12;
    // Books standing on the shelf.
    let bx = -35;
    let ci = s;
    while (bx < 35) {
      const bw = 3 + ((ci * 7) % 4);
      const bh = 8 + ((ci * 5) % 3);
      ctx.fillStyle = bookColors[ci % bookColors.length];
      ctx.fillRect(bx, shelfY + 10 - bh, bw, bh);
      bx += bw + 1.5;
      ci++;
    }
    // Shelf board.
    ctx.fillStyle = '#3a2410';
    ctx.fillRect(-36, shelfY + 10, 72, 2);
  }
  // Central divider between the two bays.
  ctx.fillStyle = '#3a2410';
  ctx.fillRect(-1.5, -18, 3, 34);
  ctx.restore();
}

/**
 * A stone knight statue on a pedestal. Footprint is one cell wide and two tall
 * (anchor + the cell below), so it reads as a full-height monument.
 */
function drawStatue(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y + TILE / 2);
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(0, 40, 20, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pedestal.
  const pg = ctx.createLinearGradient(-16, 0, 16, 0);
  pg.addColorStop(0, '#5a626c');
  pg.addColorStop(0.5, '#7d8792');
  pg.addColorStop(1, '#5a626c');
  ctx.fillStyle = pg;
  ctx.fillRect(-16, 20, 32, 20);
  ctx.fillStyle = '#8b929b';
  ctx.fillRect(-19, 16, 38, 6);
  ctx.fillStyle = '#48505a';
  ctx.fillRect(-16, 36, 32, 4);
  // Stone knight figure.
  const sg = ctx.createLinearGradient(-10, 0, 10, 0);
  sg.addColorStop(0, '#6a727c');
  sg.addColorStop(0.5, '#9aa2ac');
  sg.addColorStop(1, '#6a727c');
  ctx.fillStyle = sg;
  // Legs/robe.
  ctx.beginPath();
  ctx.moveTo(-9, 16);
  ctx.lineTo(-7, -6);
  ctx.lineTo(7, -6);
  ctx.lineTo(9, 16);
  ctx.closePath();
  ctx.fill();
  // Torso + head.
  ctx.beginPath();
  ctx.moveTo(-7, -4);
  ctx.lineTo(-6, -20);
  ctx.lineTo(6, -20);
  ctx.lineTo(7, -4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -25, 6, 0, Math.PI * 2);
  ctx.fill();
  // A grounded sword the statue rests both hands on.
  ctx.strokeStyle = '#b7bcc6';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(0, 16);
  ctx.stroke();
  ctx.strokeStyle = '#8b929b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-5, -10);
  ctx.lineTo(5, -10);
  ctx.stroke();
  ctx.restore();
}

/**
 * A square ornamental fountain. Footprint is 2×2 (anchor is the top-left cell),
 * so its centre sits where the four cells meet.
 */
function drawFountain(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x + TILE / 2, y + TILE / 2);
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 34, 40, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Outer stone basin.
  ctx.fillStyle = '#7d8792';
  ctx.beginPath();
  ctx.ellipse(0, 8, 40, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a626c';
  ctx.beginPath();
  ctx.ellipse(0, 12, 40, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  // Water pool.
  ctx.fillStyle = '#2f6b8a';
  ctx.beginPath();
  ctx.ellipse(0, 8, 33, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3f88ad';
  ctx.beginPath();
  ctx.ellipse(0, 7, 33, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  // Central pillar + upper tier.
  ctx.fillStyle = '#8b929b';
  ctx.fillRect(-6, -18, 12, 24);
  ctx.beginPath();
  ctx.ellipse(0, -18, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3f88ad';
  ctx.beginPath();
  ctx.ellipse(0, -19, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Water jets arcing off the top.
  ctx.strokeStyle = 'rgba(180,225,245,0.8)';
  ctx.lineWidth = 2;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.quadraticCurveTo(dir * 16, -30, dir * 24, 2);
    ctx.stroke();
  }
  // Ripple highlights.
  ctx.strokeStyle = 'rgba(200,235,250,0.5)';
  ctx.lineWidth = 1;
  for (const ry of [4, 10]) {
    ctx.beginPath();
    ctx.ellipse(0, ry, 20, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A large timber-framed house. Footprint is 3×2 (anchor is the top-left cell),
 * so its centre sits one cell right and half a cell down from the anchor.
 */
function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x + TILE, y + TILE / 2);
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 44, 68, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Chimney (behind the roof, smoking).
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(28, -58, 14, 30);
  ctx.fillStyle = '#3f2c20';
  ctx.fillRect(26, -60, 18, 6);
  // Plaster walls.
  const wg = ctx.createLinearGradient(-54, 0, 54, 0);
  wg.addColorStop(0, '#c9b48c');
  wg.addColorStop(0.5, '#e0cda2');
  wg.addColorStop(1, '#c9b48c');
  ctx.fillStyle = wg;
  ctx.fillRect(-54, -10, 108, 54);
  // Timber framing (Tudor beams).
  ctx.strokeStyle = '#5a3a24';
  ctx.lineWidth = 3;
  ctx.strokeRect(-54, -10, 108, 54);
  ctx.beginPath();
  ctx.moveTo(-54, 18); ctx.lineTo(54, 18);       // mid rail
  ctx.moveTo(-20, -10); ctx.lineTo(-20, 44);      // posts
  ctx.moveTo(20, -10); ctx.lineTo(20, 44);
  ctx.moveTo(-54, -10); ctx.lineTo(-20, 18);      // braces
  ctx.moveTo(54, -10); ctx.lineTo(20, 18);
  ctx.stroke();
  // Pitched roof.
  const rg = ctx.createLinearGradient(0, -60, 0, -8);
  rg.addColorStop(0, '#7a2f2a');
  rg.addColorStop(1, '#5a221e');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(-64, -8);
  ctx.lineTo(0, -58);
  ctx.lineTo(64, -8);
  ctx.closePath();
  ctx.fill();
  // Roof ridge + eave line.
  ctx.strokeStyle = '#3f1714';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Door.
  ctx.fillStyle = '#4a2f18';
  roundRect(ctx, -10, 14, 20, 30, 3);
  ctx.fill();
  ctx.fillStyle = '#c9a24a';
  ctx.beginPath();
  ctx.arc(5, 30, 1.8, 0, Math.PI * 2);
  ctx.fill();
  // Windows with cross mullions and a warm glow.
  for (const wx of [-36, 36]) {
    ctx.fillStyle = '#ffd98a';
    roundRect(ctx, wx - 9, -2, 18, 16, 2);
    ctx.fill();
    ctx.strokeStyle = '#5a3a24';
    ctx.lineWidth = 2;
    ctx.strokeRect(wx - 9, -2, 18, 16);
    ctx.beginPath();
    ctx.moveTo(wx, -2); ctx.lineTo(wx, 14);
    ctx.moveTo(wx - 9, 6); ctx.lineTo(wx + 9, 6);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw a crenellated (merlon-toothed) parapet along the top of a tower/wall. */
function crenellate(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  merlonH: number,
  color: string,
): void {
  ctx.fillStyle = color;
  const step = width / 5;
  for (let i = 0; i < 5; i += 2) {
    ctx.fillRect(left + i * step, top, step, merlonH);
  }
}

/**
 * A very large stone castle: a central keep flanked by two crenellated towers
 * over a barbican gate. Footprint is 3×3 (anchor is the top-left cell), so its
 * centre sits one cell right and one cell down from the anchor.
 */
function drawCastle(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x + TILE, y + TILE);
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(0, 62, 78, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  const stone = (x0: number, w: number) => {
    const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    g.addColorStop(0, '#5a626c');
    g.addColorStop(0.5, '#828c98');
    g.addColorStop(1, '#5a626c');
    return g;
  };

  // Curtain wall + central keep body.
  ctx.fillStyle = stone(-58, 116);
  ctx.fillRect(-58, -8, 116, 68);
  crenellate(ctx, -58, -18, 116, 10, '#6b7480');

  // Central keep, taller than the wall.
  ctx.fillStyle = stone(-26, 52);
  ctx.fillRect(-26, -50, 52, 110);
  crenellate(ctx, -26, -62, 52, 12, '#77808c');

  // Two flanking corner towers, tallest of all.
  for (const tx of [-58, 34]) {
    ctx.fillStyle = stone(tx, 24);
    ctx.fillRect(tx, -44, 24, 104);
    crenellate(ctx, tx, -56, 24, 12, '#77808c');
    // A conical banner-topped turret cap? keep it flat-crenellated; add a slit.
    ctx.fillStyle = '#20262e';
    ctx.fillRect(tx + 9, -34, 6, 14);
  }

  // Stone coursing lines across the keep for texture.
  ctx.strokeStyle = 'rgba(30,36,44,0.35)';
  ctx.lineWidth = 1;
  for (let ly = -40; ly < 56; ly += 12) {
    ctx.beginPath();
    ctx.moveTo(-26, ly); ctx.lineTo(26, ly);
    ctx.stroke();
  }

  // Barbican gate: dark arched opening with a portcullis.
  ctx.fillStyle = '#14171c';
  ctx.beginPath();
  ctx.moveTo(-16, 60);
  ctx.lineTo(-16, 18);
  ctx.arc(0, 18, 16, Math.PI, 0);
  ctx.lineTo(16, 60);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8b929b';
  ctx.lineWidth = 2;
  for (const gx of [-9, 0, 9]) {
    ctx.beginPath(); ctx.moveTo(gx, 6); ctx.lineTo(gx, 58); ctx.stroke();
  }
  for (const gy of [18, 30, 44]) {
    ctx.beginPath(); ctx.moveTo(-15, gy); ctx.lineTo(15, gy); ctx.stroke();
  }

  // Arrow-slit windows on the keep.
  ctx.fillStyle = '#20262e';
  for (const wy of [-30, -8]) {
    ctx.fillRect(-4, wy, 8, 14);
  }

  // A pennant flying from the keep.
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -62); ctx.lineTo(0, -80);
  ctx.stroke();
  ctx.fillStyle = '#8e1f2d';
  ctx.beginPath();
  ctx.moveTo(0, -80);
  ctx.lineTo(18, -75);
  ctx.lineTo(0, -70);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPath(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Paint layer by layer across all lanes so converging lanes' borders never
  // overdraw another lane's fill. A themed level (e.g. the Throne Room's carpet)
  // can override these layers; otherwise the default dirt track is used.
  const layers: [string, number][] = themeFor(engine)?.path ?? DEFAULT_PATH_LAYERS;
  // Each lane draws only its revealed fraction (1 for normal lanes); a lane
  // opening mid-battle rolls out from its spawn like a carpet.
  const laneShapes = engine.lanes.map((lane, i) => {
    const frac = engine.laneRevealFraction(i);
    if (frac <= 0) return null;
    return frac >= 1 ? lane.waypoints : partialPolyline(lane.waypoints, frac);
  });
  for (const [color, width] of layers) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const pts of laneShapes) {
      if (pts) strokePolyline(ctx, pts);
    }
  }
  ctx.restore();
}

function strokePolyline(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/**
 * The leading portion of a polyline covering `frac` (0→1) of its total length,
 * ending at an interpolated point — used to animate a path "rolling out" from
 * its spawn toward the exit.
 */
function partialPolyline(
  pts: { x: number; y: number }[],
  frac: number,
): { x: number; y: number }[] {
  if (pts.length < 2) return pts;
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  }
  const target = total * frac;
  const out = [pts[0]];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    if (acc + len >= target) {
      const t = (target - acc) / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      return out;
    }
    out.push(b);
    acc += len;
  }
  return out;
}

/**
 * Pre-battle route preview: an animated trail of chevrons (plus a marching
 * dashed line) that flows along each lane from spawn to base, so the player can
 * see where enemies will walk before committing to placements. Only shown while
 * the stage is still in its opening prep — i.e. the very first wave has not yet
 * started; it disappears for the rest of the battle.
 */
function drawPathPreview(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  if (engine.phase !== 'prep' || engine.waveIndex !== 0) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  engine.lanes.forEach((lane, i) => {
    if (engine.laneVisible(i)) drawLaneFlow(ctx, lane.waypoints, now);
  });
}

/** Animate one lane's arrow trail (see `drawPathPreview`). */
function drawLaneFlow(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  now: number,
): void {
  if (pts.length < 2) return;

  const speed = 46; // px/sec the trail scrolls toward the base
  const t = (now / 1000) * speed;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Marching-ants dashed guide line running the whole route.
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.5)';
  ctx.lineWidth = 3;
  ctx.setLineDash([9, 15]);
  ctx.lineDashOffset = -t;
  strokePolyline(ctx, pts);
  ctx.setLineDash([]);

  // Flowing chevrons spaced along the arc length, marching in the walk order.
  // Build per-segment unit directions + cumulative start distances.
  const segs: { x: number; y: number; ux: number; uy: number; len: number; start: number }[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len = Math.hypot(dx, dy) || 1;
    segs.push({ x: pts[i].x, y: pts[i].y, ux: dx / len, uy: dy / len, len, start: total });
    total += len;
  }

  const spacing = 40;
  ctx.strokeStyle = 'rgba(160, 218, 255, 0.95)';
  ctx.lineWidth = 3;
  for (let d = t % spacing; d < total; d += spacing) {
    // Locate the segment containing arc-distance `d`.
    let s = segs[0];
    for (const seg of segs) {
      if (d >= seg.start && d <= seg.start + seg.len) {
        s = seg;
        break;
      }
    }
    const into = d - s.start;
    const x = s.x + s.ux * into;
    const y = s.y + s.uy * into;
    const ang = Math.atan2(s.uy, s.ux);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(-4, -5);
    ctx.lineTo(4, 0);
    ctx.lineTo(-4, 5);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawPlacementHints(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  ui: RenderUiState,
): void {
  if (!ui.selectedUnitId) return;
  const def = getUnit(ui.selectedUnitId);
  if (!def) return;
  const { hoverCol, hoverRow } = ui;
  if (hoverCol < 0 || hoverRow < 0) return;

  // The cell highlight reflects buildability alone (gold is only enforced on the
  // click), but the range circle also reddens when the unit is unaffordable.
  const buildable = engine.canPlaceAt(hoverCol, hoverRow);
  const ok = buildable && engine.currency >= def.cost;
  const cx = hoverCol * TILE + TILE / 2;
  const cy = hoverRow * TILE + TILE / 2;
  // Preview the range the unit will actually deploy with (mastery included).
  const previewRange = engine.deployStats(def.id)?.range ?? def.range;

  // Range preview.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, previewRange, 0, Math.PI * 2);
  ctx.fillStyle = ok ? 'rgba(95, 211, 138, 0.10)' : 'rgba(255, 90, 90, 0.10)';
  ctx.fill();
  ctx.strokeStyle = ok ? 'rgba(95, 211, 138, 0.6)' : 'rgba(255, 90, 90, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cell highlight.
  ctx.fillStyle = buildable ? 'rgba(95, 211, 138, 0.25)' : 'rgba(255, 90, 90, 0.25)';
  ctx.fillRect(hoverCol * TILE, hoverRow * TILE, TILE, TILE);
  ctx.restore();
}

function drawTowers(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  ui: RenderUiState,
): void {
  for (const t of engine.towers) {
    const { x, y } = t.pos;
    const selected = t.uid === ui.selectedTowerUid;

    if (selected && !t.def.generator) {
      // Reach circle (all AoE types can pivot within this radius).
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, t.range, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // Resolve this tower's aim (live target first, else its last aim point) for
    // both the attack lunge and which way a drawn figure faces.
    const target =
      t.targetUid != null
        ? engine.enemies.find((e) => e.uid === t.targetUid && !e.dead)
        : undefined;
    const aimPt = target?.pos ?? t.aimTarget ?? null;
    const faceLeft = aimPt ? aimPt.x < x : false;

    // Aim direction for a small lunge on attack.
    let ox = 0;
    let oy = 0;
    if (t.attackAnim > 0 && target) {
      const dx = target.pos.x - x;
      const dy = target.pos.y - y;
      const d = Math.hypot(dx, dy) || 1;
      const push = (t.attackAnim / 0.18) * 5;
      ox = (dx / d) * push;
      oy = (dy / d) * push;
    }

    // Better Morale (Swordsman): a golden pulse whose strength grows with the
    // number of adjacent allies boosting this tower.
    const moraleStacks = t.adjacentDamageMult > 0 ? t.adjacentAllies : 0;

    ctx.save();
    ctx.translate(x + ox, y + oy);
    // A subtle scale pulse of the whole tower while the morale buff is active;
    // each stack widens the pulse a little.
    if (moraleStacks > 0) {
      const osc = moralePulse(); // 0..1
      const amp = Math.min(0.06, 0.02 + 0.012 * (moraleStacks - 1));
      const s = 1 + amp * osc;
      ctx.scale(s, s);
    }
    // Base pad — its shadow glows gold while the Better Morale aura is active
    // (drawn under the pad so the glow reads as a warm pool at the unit's feet).
    if (moraleStacks > 0) drawMoraleGlow(ctx, moraleStacks);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // The player's own champion gets a thin outline around its foot shadow, tinted
    // from its portrait's outfit colour — a subtle "this hero is yours" marker that
    // sets it apart from the summoned roster. Lightened so it reads against the
    // dark pad, with a soft same-colour glow.
    if (t.def.visual.shape.startsWith('player-')) {
      const accent = t.def.visual.playerConfig?.outfitColor ?? t.def.visual.color;
      ctx.save();
      ctx.strokeStyle = shade(accent, 0.2);
      ctx.lineWidth = 1.6;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(0, 10, 15, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (hasSprite(t.def.visual.shape)) {
      // Procedural figure in place of the flat disc + emoji token. `anim` eases
      // with the attack (1 just after a strike -> 0 at rest); each sprite reads
      // it its own way (bowstring snap, sword swing). While a throw is playing,
      // drive the sprite from the longer `throwAnim` instead so the Spearman's
      // flung javelin (Javelin Toss) stays visible past the throw beam. While a
      // charged attack winds up, ramp the same value 0->1 across the charge so
      // the caster visibly gathers the attack (the Wizard raising his staff).
      const throwing = t.throwAnim > 0;
      const charging = t.charge > 0 && t.chargeMax > 0;
      const anim = charging
        ? 1 - t.charge / t.chargeMax
        : throwing
          ? t.throwAnim / THROW_ANIM_TIME
          : Math.max(0, Math.min(1, t.attackAnim / 0.18));
      // The "empowered" flourish marks a champion whose signature upgrade is
      // bought — faint wind motes for the Wizard (Wind Slice → cone), and arcane
      // sparkles off the Elf's bow once she buys Chain Enchantment (which lifts
      // her bounce count above the base). Each sprite reads the flag its own way.
      const empowered =
        t.aoe === 'cone' ||
        (t.def.visual.shape === 'elf' && t.bounces > (t.def.bounces ?? 0));
      drawUnitSprite(
        ctx,
        t.def.visual.shape,
        t.def.visual.color,
        faceLeft,
        anim,
        throwing,
        empowered,
        t.def.visual.playerConfig,
      );
      // The Magic adventurer visibly gathers its orb during the wind-up: a
      // growing ball of the caster's own colour cupped in the raised hands, in
      // front of the figure on the side it faces. It grows with the charge, then
      // launches as a projectile the moment the cast releases.
      if (t.aoe === 'circle' && t.charge > 0 && t.chargeMax > 0) {
        const grow = 1 - t.charge / t.chargeMax; // 0 at cast start → 1 at release
        const accent = t.def.visual.playerConfig?.outfitColor ?? t.def.visual.color;
        const cx = (faceLeft ? -1 : 1) * (12 + 1.6 * grow);
        drawChargingOrb(ctx, cx, -4.5, 1.2 + 4.3 * grow, accent, grow);
      }
    } else {
      // Body disc.
      ctx.fillStyle = t.def.visual.color;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
      // Icon.
      ctx.font = '17px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.def.visual.icon, 0, 1);
    }
    // Preload status gem (Crossbow's Quick Loader): a small diamond tucked at
    // the tower's foot — black when empty, blue-green when a spare is ready.
    if (t.preloadMax > 0) drawPreloadGem(ctx, t.preloaded > 0);
    // A Wizard's Guiding Gale wraps the champion in a small swirling wind —
    // drawn over the figure so it reads as enveloping the unit, not a foot pool.
    if (t.rangeBuffed) drawWindShroud(ctx);
    ctx.restore();

    // Music notes orbiting a champion currently hastened by a Bard's tune —
    // drawn in world space (outside the tower's lunge/scale transform) so they
    // circle steadily around its head. Tinted the Bard's colour, not the buffed
    // unit's, so every buffed ally floats the same minstrel-pink notes.
    if (t.attackSpeedBuffTimer > 0) {
      drawBuffNotes(ctx, x, y, t.attackSpeedBuffColor || t.def.visual.color);
    }
  }
}

/** Small palette of note glyphs cycled around a buffed champion. */
const BUFF_NOTE_GLYPHS = ['♪', '♫', '♬'];

/**
 * Music notes circling a champion buffed by the Bard's tune. Three glyphs orbit
 * the figure's head at a steady clip, each bobbing on its own phase, tinted the
 * Bard's colour with a soft glow so the buff reads at a glance.
 */
function drawBuffNotes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const t = now / 620;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  for (let i = 0; i < BUFF_NOTE_GLYPHS.length; i++) {
    const a = t + (i * Math.PI * 2) / BUFF_NOTE_GLYPHS.length;
    const nx = x + Math.cos(a) * 17;
    const ny = y - 14 + Math.sin(a * 1.3) * 4;
    ctx.globalAlpha = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(a));
    ctx.font = `${11 + (i % 2)}px serif`;
    ctx.fillText(BUFF_NOTE_GLYPHS[i], nx, ny);
  }
  ctx.restore();
}

/** Shared 0..1 pulse oscillator for the Better Morale effect. */
function moralePulse(): number {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return 0.5 - 0.5 * Math.cos(now / 280);
}

/**
 * A pulsing golden glow pooled in the tower's ground shadow — the visual tell
 * that the Swordsman's Better Morale aura is active. More adjacent allies
 * (`stacks`) brighten and spread the glow. Drawn in the tower's local space
 * (origin at the tower centre), beneath the dark base pad so it reads as a warm
 * halo around the unit's feet rather than a ring around the whole figure.
 */
function drawMoraleGlow(ctx: CanvasRenderingContext2D, stacks: number): void {
  const osc = moralePulse(); // 0..1
  const intensity = Math.min(1, 0.35 + 0.22 * stacks); // grows with stacks
  ctx.save();
  ctx.globalAlpha = Math.min(1, 0.35 + 0.45 * intensity * osc);
  ctx.fillStyle = '#ffd15a';
  ctx.shadowColor = '#ffbe3c';
  ctx.shadowBlur = (7 + 13 * intensity) * (0.6 + 0.4 * osc);
  ctx.beginPath();
  ctx.ellipse(0, 10, 14, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A pulsing crimson glow pooled in an enemy's ground shadow — the visual tell
 * that it's being shielded by a nearby protective aura (The Iron Warden's
 * Aegis). Styled like the Swordsman's Better Morale glow but in the Warden's
 * red so the buff reads as protection. Drawn in the enemy's local ground space
 * (origin at the shadow centre); `r` is the enemy's board radius so the halo
 * scales with the foe. Non-stacking, so a single fixed intensity.
 */
function drawWardGlow(ctx: CanvasRenderingContext2D, r: number): void {
  const osc = moralePulse(); // 0..1 — share the morale oscillator for a matched pulse
  ctx.save();
  ctx.globalAlpha = 0.4 + 0.4 * osc;
  ctx.fillStyle = '#ff6a7a';
  ctx.shadowColor = '#e0455a';
  ctx.shadowBlur = (8 + 10 * osc);
  ctx.beginPath();
  ctx.ellipse(0, r * 0.7, r * 0.95, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A pulsing arcane-cyan glow pooled in the tower's ground shadow — the visual
 * tell that this unit's range is being lifted by a Wizard's Guiding Gale.
 * Styled like the Better Morale glow but in the Wizard's cyan so the two auras
 * read apart. Non-stacking, so it has a single fixed intensity. Drawn in the
 * tower's local space (origin at the tower centre), beneath the base pad.
 */
/**
 * A small swirling wind wrapping a champion whose range is being lifted by a
 * Wizard's Guiding Gale. Drawn over the figure (origin at the tower centre) as a
 * few faint cyan crescent gusts orbiting the body at different radii/phases,
 * plus a couple of drifting motes — so the unit looks caught in a light breeze
 * rather than standing over a glowing pool. Animated from wall-clock time so the
 * gusts rotate continuously.
 */
function drawWindShroud(ctx: CanvasRenderingContext2D): void {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const t = now / 1000;
  ctx.save();
  ctx.strokeStyle = '#bfeef0';
  ctx.lineCap = 'round';
  // Three curved gusts circling the figure — each at its own radius, vertical
  // squash (so they hug the body as ellipses), speed and starting phase.
  const gusts = [
    { rx: 15, ry: 17, spin: 1.7, phase: 0, span: 0.8, width: 1.6 },
    { rx: 12, ry: 20, spin: -2.2, phase: 2.1, span: 0.6, width: 1.3 },
    { rx: 17, ry: 13, spin: 2.7, phase: 4.2, span: 0.55, width: 1.1 },
  ];
  for (const g of gusts) {
    const a = t * g.spin + g.phase;
    // A soft flicker so each gust breathes in and out of view.
    ctx.globalAlpha = 0.28 + 0.22 * (0.5 + 0.5 * Math.sin(t * 2 + g.phase));
    ctx.lineWidth = g.width;
    ctx.beginPath();
    ctx.ellipse(0, -3, g.rx, g.ry, 0, a, a + g.span);
    ctx.stroke();
    // A little tail-mote flung off the leading edge of the gust.
    const ex = Math.cos(a + g.span) * g.rx;
    const ey = -3 + Math.sin(a + g.span) * g.ry;
    ctx.globalAlpha *= 0.9;
    ctx.beginPath();
    ctx.arc(ex, ey, 0.9, 0, Math.PI * 2);
    ctx.fillStyle = '#dff7f8';
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A small diamond at the tower's foot, slightly overlapping the body, marking
 * whether a preloaded spare shot is ready (see the Crossbow's Quick Loader):
 * black when empty, a bright blue-green when a spare is loaded. Drawn in the
 * tower's local space (origin at the tower centre).
 */
function drawPreloadGem(ctx: CanvasRenderingContext2D, loaded: boolean): void {
  const cy = 14; // near the bottom edge of the 15px body, slightly overlapping
  const r = 4.5; // half-diagonal of the diamond
  ctx.save();
  ctx.translate(0, cy);
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r, 0);
  ctx.closePath();
  if (loaded) {
    ctx.shadowColor = '#3fe0b0';
    ctx.shadowBlur = 6;
  }
  ctx.fillStyle = loaded ? '#3fe0b0' : '#0d0f14';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
  ctx.restore();
}

/**
 * Visualise the selected tower's AoE shape, aimed at its live target if it is
 * firing, else at its last struck point, else a default facing.
 *  - line  : the piercing corridor down the aim axis to the end of range.
 *  - cone  : the wedge spread around the aim axis to the end of range.
 *  - circle: the blast circle (`burstRadius`) around the point the orb detonates.
 *  - single: an 'x' marking the single point it strikes.
 */
function drawAoeIndicator(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  t: GameEngine['towers'][number],
): void {
  if (t.def.generator) return; // economy units have no attack area
  // Resolve the aim point: live target > last struck point > default facing.
  let aim: { x: number; y: number } | null = null;
  if (t.targetUid != null) {
    const target = engine.enemies.find((e) => e.uid === t.targetUid);
    if (target) aim = target.pos;
  }
  if (!aim) aim = t.aimTarget;

  const color = t.def.visual.color;
  const angle = aim
    ? Math.atan2(aim.y - t.pos.y, aim.x - t.pos.x)
    : 0; // idle & never fired: default facing (+x)

  if (t.aoe === 'cone') {
    const half = ((coneAngleDeg(t.def) * Math.PI) / 180) / 2;
    const range = t.range;
    ctx.save();
    ctx.translate(t.pos.x, t.pos.y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, range, -half, half);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, range, -half, half);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  if (t.aoe === 'line') {
    const halfW = t.def.aoeWidth ?? 14;
    const range = t.range;
    ctx.save();
    ctx.translate(t.pos.x, t.pos.y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    ctx.fillRect(0, -halfW, range, halfW * 2);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(0, -halfW, range, halfW * 2);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(range, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(range, 0);
    ctx.lineTo(range - 9, -6);
    ctx.lineTo(range - 9, 6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 1;
    ctx.fill();
    ctx.restore();
    return;
  }

  // Default aim point (never fired) sits partway along the facing at 60% range —
  // shared by the circle blast preview and the single-target cross below.
  const point = aim ?? {
    x: t.pos.x + Math.cos(angle) * t.range * 0.6,
    y: t.pos.y + Math.sin(angle) * t.range * 0.6,
  };

  if (t.aoe === 'circle') {
    // The orb detonates at the aim point, so show the blast circle there (its
    // `burstRadius`) plus a small cross marking the impact centre.
    const radius = t.def.burstRadius ?? DEFAULT_BURST_RADIUS;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Impact-centre cross.
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 5;
    drawCross(ctx, 7);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    drawCross(ctx, 7);
    ctx.restore();
    return;
  }

  // Single target: mark the strike point with an 'x'.
  const s = 9; // arm length of the cross
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.lineCap = 'round';
  // Dark outline for legibility over any enemy/terrain.
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 5;
  drawCross(ctx, s);
  // Colored 'x'.
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  drawCross(ctx, s);
  ctx.restore();
}

function drawCross(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(-s, -s);
  ctx.lineTo(s, s);
  ctx.moveTo(s, -s);
  ctx.lineTo(-s, s);
  ctx.stroke();
}

/**
 * The boss seated on his throne, drawn until he actually spawns (rises) on the
 * final wave. It's the boss's own walking sprite in its fully-seated pose,
 * placed exactly where the risen boss will first appear — one `RISE_LIFT` above
 * the reveal lane's spawn cell — so the hand-off to the live, rising enemy is
 * seamless. Shown for any stage with a hidden reveal lane whose boss has a
 * sprite (currently the Throne Room king).
 */
/**
 * Extra upward draw offset for oversized boss sprites so their feet and shadow
 * land on the path centreline rather than hanging below it (a scaled-up figure
 * reaches further past `pos` than a normal enemy token). Applied to the sprite,
 * its shadow and health bar together — and to the king's seated pose — so the
 * figure stays put on the path (through the whole rise, for the king). Roughly
 * tracks each sprite's up-scale: the king's 1.7× and the captain's 1.28×.
 */
const KING_FOOT_LIFT = 16;
const CAPTAIN_FOOT_LIFT = 9;
const MERCENARY_FOOT_LIFT = 9;
const WARDEN_FOOT_LIFT = 13; // the Iron Warden's heavy 1.5× frame
const GOWZER_FOOT_LIFT = 6; // Gowzer's slight 1.15× frame
function footLiftFor(id: string): number {
  if (id === 'boss5') return KING_FOOT_LIFT;
  if (id === 'boss1') return CAPTAIN_FOOT_LIFT;
  if (id === 'boss2') return MERCENARY_FOOT_LIFT;
  if (id === 'boss3') return WARDEN_FOOT_LIFT;
  if (id === 'boss4') return GOWZER_FOOT_LIFT;
  return 0;
}

function drawSeatedKing(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  if (engine.bossHasSpawned || engine.outcome !== 'playing') return;
  const laneIdx = engine.level.lanes.findIndex((l) => l.revealAtWave !== undefined);
  if (laneIdx < 0) return;
  const def = getEnemy(engine.level.bossId);
  if (!hasEnemySprite(def.id)) return;
  const spawn = engine.lanes[laneIdx].waypoints[0];
  ctx.save();
  ctx.translate(spawn.x, spawn.y - RISE_LIFT - footLiftFor(def.id));
  // Front view (facing the room), fully seated, at rest.
  drawEnemySprite(ctx, def.id, def.visual.color, 'front', false, 0, 1);
  ctx.restore();
}

function drawEnemies(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  for (const e of engine.enemies) {
    if (e.dead) continue;
    // An enemy playing out a special death draws its own sequence (and no health
    // bar / speech), so branch out before the normal token rendering.
    if (e.dying) {
      drawDeathAnimation(ctx, e);
      continue;
    }
    const { x } = e.pos;
    const R = e.def.radius;
    // A boss rising off its throne is drawn lifted (its seat height above the
    // path) easing to 0 as it stands. A tall sprite also gets a fixed foot-lift
    // so its feet/shadow rest on the path centreline instead of below it.
    const lift = RISE_LIFT * (e.rise ?? 0);
    const foot = footLiftFor(e.def.id);
    const groundY = e.pos.y - foot; // where the shadow (and feet) sit
    const y = groundY - lift;

    // Dodge weave: an evasive enemy slipping a blow sidesteps perpendicular to
    // its travel and springs back over the anim, with a small nimble hop at the
    // peak. Purely cosmetic; the whole token (shadow, figure, bar) shifts as one.
    let dodgeX = 0;
    let dodgeY = 0;
    let dodgeHop = 0;
    if ((e.dodge ?? 0) > 0) {
      const amt = Math.sin(Math.PI * (1 - e.dodge / DODGE_ANIM_TIME)); // 0→1→0
      dodgeX = -e.heading.y * amt * DODGE_DIST; // perpendicular to heading
      dodgeY = e.heading.x * amt * DODGE_DIST;
      dodgeHop = -amt * 2; // slight upward spring
    }

    ctx.save();
    ctx.translate(x + dodgeX, groundY + dodgeY);
    // A crimson glow pooled in the shadow marks an enemy shielded by a nearby
    // protective aura (The Iron Warden's Aegis) — styled like the Swordsman's
    // Better Morale glow, drawn under the enemy so it reads as a warding halo.
    if ((e.wardReduction ?? 0) > 0) drawWardGlow(ctx, R);
    // Shadow (on the ground; tightens a touch while lifted).
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, R * 0.7, R * (1 - 0.25 * (e.rise ?? 0)), R * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x + dodgeX, y + dodgeY + dodgeHop);

    if (hasEnemySprite(e.def.id)) {
      // Procedural walk-figure in place of the disc + emoji token. Pick the view
      // from the travel heading (side profile when moving along a row, front/back
      // when moving down/up a column) and drive the stride from distance walked
      // so the legs move in step with actual motion. Flash white on hit by
      // tinting the whole figure, matching the disc's hit feedback.
      const hx = e.heading.x;
      const hy = e.heading.y;
      const view = Math.abs(hx) >= Math.abs(hy) ? 'side' : hy > 0 ? 'front' : 'back';
      const color = e.hitFlash > 0 ? '#ffffff' : e.def.visual.color;
      drawEnemySprite(ctx, e.def.id, color, view, hx < 0, e.dist, e.rise ?? 0);
    } else {
      // Body.
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.def.visual.color;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
      if (e.def.boss) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffd76a';
        ctx.stroke();
      }
      ctx.font = `${Math.round(R * 1.2)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.def.visual.icon, 0, 1);
    }
    ctx.restore();

    // Health bar.
    const pct = Math.max(0, e.health / e.def.health);
    const w = e.def.boss ? R * 2.4 : R * 1.8;
    const bx = x + dodgeX - w / 2;
    const by = y + dodgeY - R - (e.def.boss ? 12 : 8);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 1, by - 1, w + 2, 5);
    ctx.fillStyle = pct > 0.5 ? '#5fd38a' : pct > 0.25 ? '#f2b23c' : '#ff5a5a';
    ctx.fillRect(bx, by, w * pct, 3);

    // Intro speech bubble: while an enemy is delivering its spawn lines (Gowzer),
    // float the current line above it.
    const line = currentSpeechLine(e);
    if (line) drawSpeechBubble(ctx, x + dodgeX, by - 8, line);
  }
}

/**
 * Special death sequence for an enemy with `deathAnimation` (Gowzer's
 * 'shadowSwallow'): it first slumps to the ground (over DEATH_FALL_TIME), then
 * is drawn down into an expanding pool of its own shadow that draws shut over it.
 * Reads `e.deathT` (elapsed seconds); drawn entirely in world space.
 */
function drawDeathAnimation(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const x = e.pos.x;
  const R = e.def.radius;
  const foot = footLiftFor(e.def.id);
  const groundY = e.pos.y - foot;

  const t = e.deathT;
  const fall = Math.min(1, t / DEATH_FALL_TIME); // 0→1 slump to the ground
  const fallEase = 1 - (1 - fall) * (1 - fall); // easeOut — quick topple, soft landing
  // After the fall he lies fallen for DEATH_HOLD_TIME, then the shadow swallow
  // runs over whatever time remains.
  const swallowStart = DEATH_FALL_TIME + DEATH_HOLD_TIME;
  const swallow = Math.min(
    1,
    Math.max(0, (t - swallowStart) / (DEATH_ANIM_TIME - swallowStart)),
  ); // 0→1 sink into the shadow

  // Shadow pool: the normal shadow swells into a dark pool as it swallows him,
  // then draws shut to nothing at the very end.
  const grow = Math.min(1, swallow / 0.65);
  const close = swallow < 0.65 ? 0 : (swallow - 0.65) / 0.35;
  const poolScale = (1 + grow * 1.05) * (1 - close);
  ctx.save();
  ctx.translate(x, groundY + R * 0.7);
  ctx.fillStyle = `rgba(0,0,0,${(0.32 + 0.5 * grow).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, R * poolScale, R * 0.42 * poolScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The figure topples about its feet, then shrinks and fades as it's drawn
  // under. It slumps in the direction it was last facing.
  const dir = e.heading.x < 0 ? -1 : 1;
  const pivot = R * 0.7; // roughly the feet, below the sprite's centre origin
  const fallSink = fallEase * R * 0.28;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - swallow * 1.05);
  ctx.translate(x, groundY + fallSink + swallow * 10); // settle, then sink under
  ctx.translate(0, pivot);
  ctx.rotate(dir * 1.05 * fallEase); // topple to ~60°
  ctx.translate(0, -pivot);
  const shrink = 1 - swallow * 0.45;
  ctx.scale(shrink, shrink);

  if (hasEnemySprite(e.def.id)) {
    const hx = e.heading.x;
    const hy = e.heading.y;
    const view = Math.abs(hx) >= Math.abs(hy) ? 'side' : hy > 0 ? 'front' : 'back';
    drawEnemySprite(ctx, e.def.id, e.def.visual.color, view, hx < 0, e.dist, 0);
  } else {
    ctx.fillStyle = e.def.visual.color;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${Math.round(R * 1.2)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.def.visual.icon, 0, 1);
  }
  ctx.restore();

  // Final words: a bubble floating above him, held through the fall and fading
  // out as the shadow swallows him.
  if (e.def.deathLine) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - swallow);
    drawSpeechBubble(ctx, x, groundY - R * 1.8, e.def.deathLine);
    ctx.restore();
  }
}

/**
 * A small comic speech bubble centred horizontally on `cx`, its downward tail
 * tip resting at `tailY`, carrying `text`. Sized to the text.
 */
function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  tailY: number,
  text: string,
): void {
  ctx.save();
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const padX = 8;
  const padY = 5;
  const tw = ctx.measureText(text).width;
  const bw = tw + padX * 2;
  const bh = 11 + padY * 2;
  const tail = 6;
  const bottom = tailY - tail; // bubble box sits above the tail
  const top = bottom - bh;
  const left = cx - bw / 2;
  const r = 6;

  // Rounded-rect body.
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(left + bw - r, top);
  ctx.quadraticCurveTo(left + bw, top, left + bw, top + r);
  ctx.lineTo(left + bw, bottom - r);
  ctx.quadraticCurveTo(left + bw, bottom, left + bw - r, bottom);
  // Down to the tail on the way across the bottom edge.
  ctx.lineTo(cx + 5, bottom);
  ctx.lineTo(cx, bottom + tail);
  ctx.lineTo(cx - 5, bottom);
  ctx.lineTo(left + r, bottom);
  ctx.quadraticCurveTo(left, bottom, left, bottom - r);
  ctx.lineTo(left, top + r);
  ctx.quadraticCurveTo(left, top, left + r, top);
  ctx.closePath();
  ctx.fillStyle = 'rgba(20, 12, 24, 0.92)';
  ctx.fill();
  ctx.strokeStyle = '#d9b24a'; // Night Falcon gold
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = '#f4ecd8';
  ctx.fillText(text, cx, top + bh / 2 + 0.5);
  ctx.restore();
}

function drawShots(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  for (const s of engine.shots) {
    if (s.style !== 'slash') continue; // arrows/bolts are projectiles now
    const a = s.ttl / s.maxTtl;
    ctx.save();
    ctx.lineCap = 'round';
    // Melee/thrust slash near the strike point, oriented along the blow: a faint
    // wide swoosh with a brighter arc riding on top.
    const ang = Math.atan2(s.to.y - s.from.y, s.to.x - s.from.x);
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = a * 0.3;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(s.to.x, s.to.y, 14, ang - 0.85, ang + 0.85);
    ctx.stroke();
    ctx.globalAlpha = a;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.arc(s.to.x, s.to.y, 14, ang - 0.65, ang + 0.65);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Draw in-flight arrows/bolts — a small arrow at each projectile's current
 * position, pointed at the enemy it is homing toward (or its last known point).
 */
function drawProjectiles(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  for (const p of engine.projectiles) {
    const target = engine.enemies.find((e) => e.uid === p.targetUid && !e.dead);
    const dest = target ? target.pos : p.last;
    const ang = Math.atan2(dest.y - p.pos.y, dest.x - p.pos.x);
    // Fading magical tail: draw the arrow's recent positions (world space, before
    // the local rotate/scale) as motes that shrink and dim into the distance.
    if (p.trail && p.trail.length) drawMagicTrail(ctx, p.trail, p.color);
    ctx.save();
    ctx.translate(p.pos.x, p.pos.y);
    ctx.rotate(ang);
    ctx.scale(p.scale, p.scale);
    ctx.lineCap = 'round';
    if (p.style === 'wind') {
      drawWindBullet(ctx, p.color);
    } else if (p.style === 'magic') {
      drawMagicArrow(ctx, p.color);
    } else if (p.style === 'orb') {
      // The Magic adventurer's charged orb in flight — a glowing ball in the
      // caster's colour. Drawn unrotated-looking (a sphere reads the same at any
      // heading), so undo the travel rotation before painting it round.
      ctx.rotate(-ang);
      drawChargingOrb(ctx, 0, 0, 5.5, p.color, 1);
    } else {
      // Shaft.
      ctx.strokeStyle = '#6e4a26';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      // Arrowhead.
      ctx.fillStyle = '#e8eef6';
      ctx.beginPath();
      ctx.moveTo(4, -1.7);
      ctx.lineTo(8.5, 0);
      ctx.lineTo(4, 1.7);
      ctx.closePath();
      ctx.fill();
      // Fletching, tinted with the champion's colour.
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-8.5, -1.8);
      ctx.moveTo(-6, 0);
      ctx.lineTo(-8.5, 1.8);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** A `#rgb`/`#rrggbb` colour as an `rgba(...)` string with the given alpha. */
function withAlpha(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * The Magic adventurer's orb — a glowing ball in the caster's colour, drawn
 * centred at (cx, cy) with the given body `radius`. Used both for the charging
 * orb cupped in the caster's hands (radius grows with the wind-up) and for the
 * orb in flight. `intensity` (0..1) brightens the core and adds a faint outer
 * bloom as the charge fills, so a nearly-charged orb reads hotter.
 */
function drawChargingOrb(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  intensity: number,
): void {
  const k = Math.max(0, Math.min(1, intensity));
  ctx.save();
  // Soft outer bloom that swells as the orb charges.
  ctx.fillStyle = withAlpha(color, 0.18 + 0.14 * k);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * (1.7 + 0.3 * k), 0, Math.PI * 2);
  ctx.fill();
  // Main coloured body.
  ctx.fillStyle = withAlpha(color, 0.9);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  // A brighter tint ring inside the body.
  ctx.fillStyle = withAlpha(shade(color, 0.28), 0.95);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.66, 0, Math.PI * 2);
  ctx.fill();
  // Hot white core, growing with intensity.
  ctx.fillStyle = withAlpha('#ffffff', 0.6 + 0.4 * k);
  ctx.beginPath();
  ctx.arc(cx - radius * 0.12, cy - radius * 0.12, radius * (0.28 + 0.14 * k), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The Wizard's wind bullet — a compact swirl of gust drawn in the projectile's
 * local space (already translated to its position and rotated to face travel,
 * +x forward). A bright leading core with two curled tails trailing behind, so
 * the gust reads as a spinning knot of air streaking toward its target.
 */
function drawWindBullet(ctx: CanvasRenderingContext2D, color: string): void {
  // The whole gust reads as translucent air — a touch see-through overall.
  ctx.save();
  ctx.globalAlpha *= 0.82;
  // Faint outer gust halo.
  ctx.fillStyle = withAlpha(color, 0.22);
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  // Curled wind tails streaming behind the core.
  ctx.strokeStyle = withAlpha(color, 0.8);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(-3, -1.4, 3.4, -0.6, Math.PI * 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-3, 1.4, 3.4, -Math.PI * 0.9, 0.6, true);
  ctx.stroke();
  // Bright leading core.
  ctx.fillStyle = '#f2ffff';
  ctx.beginPath();
  ctx.arc(2.2, 0, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha(color, 0.95);
  ctx.beginPath();
  ctx.arc(2.2, 0, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2ffff';
  ctx.beginPath();
  ctx.arc(2.6, -0.4, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The fading, translucent tail behind the Elf's magic arrow. Given the arrow's
 * recent positions (newest first, in world space), it draws a long streak that
 * tapers and dims from the head toward the tail: a soft outer glow ribbon, a
 * brighter inner core ribbon, and a few white shimmer sparks near the head. Each
 * segment is stroked on its own so width and opacity can fall off smoothly along
 * the streak. Drawn before the arrow itself.
 */
function drawMagicTrail(
  ctx: CanvasRenderingContext2D,
  trail: { x: number; y: number }[],
  color: string,
): void {
  const n = trail.length;
  if (n < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Two passes: a wide translucent glow, then a brighter thin core over it.
  const passes: [string, number, number][] = [
    // colour, base width, base alpha
    [color, 5.5, 0.28],
    ['#f4eeff', 2.2, 0.5],
  ];
  for (const [col, baseW, baseA] of passes) {
    for (let i = 0; i < n - 1; i++) {
      const f = 1 - i / n; // 1 near the head, →0 at the tail
      ctx.strokeStyle = withAlpha(col, baseA * f * f);
      ctx.lineWidth = Math.max(0.4, baseW * f);
      ctx.beginPath();
      ctx.moveTo(trail[i].x, trail[i].y);
      ctx.lineTo(trail[i + 1].x, trail[i + 1].y);
      ctx.stroke();
    }
  }
  // A couple of bright shimmer sparks riding the freshest part of the streak.
  ctx.fillStyle = '#f4eeff';
  for (let i = 0; i < Math.min(3, n); i++) {
    const f = 1 - i / n;
    ctx.globalAlpha = 0.6 * f;
    ctx.beginPath();
    ctx.arc(trail[i].x, trail[i].y, 0.6 + 1.1 * f, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The Elf's enchanted magic arrow — drawn in the projectile's local space
 * (translated to its position, rotated to face travel, +x forward). A fletched
 * shaft wrapped in a soft glow of the champion's arcane colour, with a bright
 * arrowhead and a sparkle or two trailing behind, so it reads as a spell-charged
 * shaft rather than a plain arrow.
 */
function drawMagicArrow(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.save();
  // Soft arcane glow along the shaft.
  ctx.strokeStyle = withAlpha(color, 0.3);
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(7, 0);
  ctx.stroke();
  // Bright glowing core shaft.
  ctx.strokeStyle = withAlpha(color, 0.95);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(6, 0);
  ctx.stroke();
  // Crystalline arrowhead.
  ctx.fillStyle = '#f4eeff';
  ctx.beginPath();
  ctx.moveTo(5, -2);
  ctx.lineTo(9.5, 0);
  ctx.lineTo(5, 2);
  ctx.closePath();
  ctx.fill();
  // Twin arcane fletches.
  ctx.strokeStyle = withAlpha(color, 0.9);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(-8.5, -1.8);
  ctx.moveTo(-6, 0);
  ctx.lineTo(-8.5, 1.8);
  ctx.stroke();
  // Trailing sparkle motes.
  ctx.fillStyle = withAlpha(color, 0.85);
  ctx.beginPath();
  ctx.arc(-8.5, -1.6, 0.9, 0, Math.PI * 2);
  ctx.arc(-10.5, 1, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The Wizard's Wind Slice — each `Slice` is drawn as a single crescent blade of
 * wind riding the engine-advanced leading radius (`s.lead`), which travels at a
 * constant speed from the caster to the end of range. The crescent spans the
 * full cone angle and fades over its life. The engine cuts each enemy as this
 * same edge reaches it, so the visual and the damage land together.
 */
function drawSlices(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  for (const s of engine.slices) {
    const p = 1 - s.ttl / s.maxTtl; // 0 at spawn → 1 at end
    const half = s.halfAngle;
    const lead = s.lead;
    const thick = Math.max(2, s.range * 0.07);
    const inner = Math.max(0, lead - thick);
    // Swell in quickly, fade out over the tail of the life.
    const alpha = Math.min(1, (s.ttl / s.maxTtl) * 1.25) * Math.min(1, p / 0.12 + 0.15);
    if (lead <= 0) continue;

    ctx.save();
    ctx.translate(s.pos.x, s.pos.y);
    ctx.rotate(s.angle);
    ctx.lineCap = 'round';

    // The crescent body: the ring slice between `inner` and `lead` across the cone.
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(0, 0, lead, -half, half);
    ctx.arc(0, 0, inner, half, -half, true);
    ctx.closePath();
    ctx.fill();

    // Bright leading edge — the cutting arc.
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#f2ffff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, lead, -half, half);
    ctx.stroke();
    // A softer trailing edge tinted with the champion colour.
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, inner, -half, half);
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Draw the Spearman's flung javelin (Javelin Toss) in world space. On release
 * the spear flies fast from the tower out along the exact attack direction
 * (toward the throw's target) in a straight line with no arc, covering twice the
 * Spearman's range in a short flight, then briefly fading once it lands.
 */
function drawThrownSpears(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const FLIGHT_TIME = 0.3; // seconds to cross the full reach (high velocity)
  const FADE_TIME = 0.18; // brief fade once it lands
  for (const t of engine.towers) {
    if (t.throwAnim <= 0 || t.def.visual.shape !== 'spear') continue;
    const aim = t.aimTarget;
    if (!aim) continue;
    const angle = Math.atan2(aim.y - t.pos.y, aim.x - t.pos.x);
    const elapsed = THROW_ANIM_TIME - t.throwAnim; // seconds since release
    const reach = t.range * 2;
    const p = Math.min(1, elapsed / FLIGHT_TIME);
    const dist = 14 + p * (reach - 14);
    const landed = elapsed - FLIGHT_TIME;
    const alpha = landed <= 0 ? 1 : 1 - landed / FADE_TIME;
    if (alpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(t.pos.x + Math.cos(angle) * dist, t.pos.y + Math.sin(angle) * dist);
    ctx.rotate(angle);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Shaft.
    ctx.strokeStyle = '#6e4a26';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(10, 0);
    ctx.stroke();
    // Butt cap.
    ctx.fillStyle = '#8b95a3';
    ctx.beginPath();
    ctx.arc(-14, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    // Leaf head + edge highlight.
    ctx.fillStyle = '#c9d2dc';
    ctx.beginPath();
    ctx.moveTo(10, -3);
    ctx.lineTo(21, 0);
    ctx.lineTo(10, 3);
    ctx.quadraticCurveTo(7.6, 0, 10, -3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#eef3f8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(19, 0);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * While the *selected* "throw" tower (e.g. Spearman's Javelin Toss) is winding
 * up its next attack — the throw — preview its extended reach: a pulsing
 * corridor from the normal reach out to the throw reach, aimed at its current
 * target. This makes the added range visible for the whole gap between the prior
 * attack and the throw (the throw beam itself then shows the same reach when it
 * fires). Gated to the selection so idle towers don't clutter the board.
 */
function drawThrowCharge(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  ui: RenderUiState,
): void {
  if (ui.selectedTowerUid == null) return;
  const now =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const pulse = 0.5 + 0.5 * Math.sin(now / 140);
  for (const t of engine.towers) {
    if (t.uid !== ui.selectedTowerUid) continue;
    if (t.throwEvery <= 0) continue;
    // The next attack is the throw when the count sits one short of a multiple.
    const charging = t.attackCount % t.throwEvery === t.throwEvery - 1;
    if (!charging) continue;
    // Need a live target to know which way the spear will fly.
    const target =
      t.targetUid != null
        ? engine.enemies.find((e) => e.uid === t.targetUid && !e.dead)
        : undefined;
    if (!target) continue;

    const angle = Math.atan2(target.pos.y - t.pos.y, target.pos.x - t.pos.x);
    const halfW = t.def.aoeWidth ?? 14;
    const normal = t.range;
    const extended = t.range * t.throwRangeMult;
    if (extended <= normal) continue;

    ctx.save();
    ctx.translate(t.pos.x, t.pos.y);
    ctx.rotate(angle);

    // Filled extra-reach corridor (pulsing).
    ctx.globalAlpha = 0.1 + 0.16 * pulse;
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(normal, -halfW, extended - normal, halfW * 2);

    // Animated dashed outline of the extra corridor.
    ctx.globalAlpha = 0.45 + 0.4 * pulse;
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -((now / 45) % 11);
    ctx.strokeRect(normal, -halfW, extended - normal, halfW * 2);
    ctx.setLineDash([]);

    // Centre guide + arrowhead at the throw tip.
    ctx.beginPath();
    ctx.moveTo(normal, 0);
    ctx.lineTo(extended, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(extended, 0);
    ctx.lineTo(extended - 11, -7);
    ctx.lineTo(extended - 11, 7);
    ctx.closePath();
    ctx.fillStyle = '#ffd76a';
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.fill();

    // Tick where the normal thrust would have stopped.
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(normal, -halfW - 3);
    ctx.lineTo(normal, halfW + 3);
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Wind-puff motes kicked up when an enemy is knocked back (the Wizard's Gale
 * Force): small cyan streaks blown along the push direction, fading as they go.
 */
function drawPuffs(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  ctx.save();
  ctx.lineCap = 'round';
  for (const p of engine.puffs) {
    const life = Math.max(0, p.ttl / p.maxTtl); // 1 -> 0
    const speed = Math.hypot(p.vel.x, p.vel.y) || 1;
    // A streak trailing behind the direction of travel.
    const len = 7 + speed * 0.07;
    const tx = (p.vel.x / speed) * len;
    const ty = (p.vel.y / speed) * len;
    // A faint glow lifts the gust off the board without shouting.
    ctx.globalAlpha = Math.min(1, 0.65 * life + 0.05);
    ctx.strokeStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 3 * life;
    ctx.lineWidth = 2.6 * life + 0.7;
    ctx.beginPath();
    ctx.moveTo(p.pos.x, p.pos.y);
    ctx.lineTo(p.pos.x - tx, p.pos.y - ty);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBursts(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  for (const b of engine.bursts) {
    const p = 1 - b.ttl / b.maxTtl; // 0 -> 1
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 3 * (1 - p) + 1;
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, b.radius + p * 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFloaters(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  ctx.save();
  ctx.textAlign = 'center';
  for (const f of engine.floaters) {
    ctx.font = `bold ${f.size ?? 13}px system-ui, sans-serif`;
    ctx.globalAlpha = Math.min(1, f.ttl / f.maxTtl + 0.2);
    ctx.fillStyle = f.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.pos.x, f.pos.y);
    ctx.fillText(f.text, f.pos.x, f.pos.y);
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Canvas renderer.
 *
 * Pure drawing: reads an immutable snapshot of engine state plus a little UI
 * state (hover cell, selected unit) and paints the board. Contains no game
 * rules — it can be swapped or restyled without touching the simulation.
 *
 * A frame is composed in passes, back to front:
 *
 *   1. **Ground** — the stage's floor + path, baked once into an offscreen
 *      canvas (`terrain.ts`); a lane mid-reveal is drawn live over it.
 *   2. **World** — ground-layer props, then props / champions / foes / corpses
 *      depth-sorted by where they meet the floor, each figure finished through
 *      the shared compositor (`figure.ts`: ink outline, form shading, rim
 *      light, hit flash), then smoke/dust/debris.
 *   3. **Lighting** — the stage's ambient darkness with every light punched
 *      out of it, an additive colour bloom, grade (`lighting.ts`).
 *   4. **Glow** — attacks, projectiles, sparks, embers, flashes: drawn after
 *      the darkness so they read as light sources (`vfx.ts`).
 *   5. **Overlays** — health bars, range/AoE guides, damage numbers, boss
 *      bars: never darkened, never shaken, always legible.
 *
 * Per-board caches (baked terrain, lighting layers, the VFX pool) live in a
 * `WeakMap` keyed by the engine, so a new stage mount gets fresh state and an
 * old one is collected with its engine.
 */

import { BOARD_HEIGHT, BOARD_WIDTH, TILE } from '../domain/grid';
import { DEFAULT_PATH_LAYERS, type BoardTheme } from '../domain/decor';
import { atmosphereFor, type Atmosphere } from '../domain/atmosphere';
import { coneAngleDeg, DEFAULT_BURST_RADIUS, getUnit } from '../domain/units';
import { getEnemy } from '../domain/enemies';
import { drawEnemySprite, drawFeather, drawUnitSprite, enemyWalkPeriod, hasEnemySprite, hasSprite } from './sprites';
import { BOSS_BOX, DEFAULT_BOX, paintFigure, type FigureStyle } from './figure';
import { bakeTerrain } from './terrain';
import { Lighting, flicker, type Light } from './lighting';
import { Vfx, type Corpse } from './vfx';
import { drawLegacyDecor, drawProp, propAnchor, PROP_META } from './props';
import { FEEDBACK, INK, LIGHT, ease, shade, withAlpha } from './palette';
import {
  THROW_ANIM_TIME,
  RISE_LIFT,
  DODGE_ANIM_TIME,
  DODGE_DIST,
  DEATH_ANIM_TIME,
  DEATH_FALL_TIME,
  DEATH_HOLD_TIME,
} from './GameEngine';
import { currentSpeechLine, isSpeaking } from './types';
import type { Enemy, Tower } from './types';
import type { GameEngine } from './GameEngine';

export { drawProp };

export interface RenderUiState {
  hoverCol: number;
  hoverRow: number;
  selectedUnitId: string | null;
  selectedTowerUid: number | null;
  /** Enemy under the cursor (outlined as a threat); optional. */
  hoverEnemyUid?: number | null;
}

/**
 * Board scale of a standard figure (champions and rank-and-file foes), applied
 * about the feet. Slightly larger than the authored sprite so silhouettes read
 * at a glance; bosses scale themselves inside their own sprite.
 */
const FIGURE_SCALE = 1.12;

/** Stable cache-key fragment for a player avatar config (memoized per object). */
const CFG_KEYS = new WeakMap<object, string>();
function cfgKey(cfg: object | undefined): string {
  if (!cfg) return '';
  let k = CFG_KEYS.get(cfg);
  if (!k) {
    k = JSON.stringify(cfg);
    CFG_KEYS.set(cfg, k);
  }
  return k;
}

/**
 * Quantize a foe's walked distance onto one of a fixed number of stride frames
 * within its sprite's repeat period, so walking figures hit the frame cache.
 */
function strideFrame(id: string, dist: number): { q: number; idx: number } {
  const period = enemyWalkPeriod(id);
  const frames = id === 'cas_brute' ? 48 : 16;
  const idx = Math.floor((((dist % period) + period) % period) / period * frames) % frames;
  return { q: (idx * period) / frames, idx };
}

/** Typeface stacks for canvas text (match the UI's CSS tokens). */
const FONT_TITLE = "'Cinzel', 'Georgia', serif";
const FONT_UI = "'Inter', system-ui, sans-serif";

// ---------------------------------------------------------------------------
// Per-board render state
// ---------------------------------------------------------------------------

interface StaticLight extends Light {
  flicker: boolean;
  phase: number;
}

interface BoardState {
  atmo: Atmosphere;
  terrain: HTMLCanvasElement | null;
  terrainKey: string;
  lighting: Lighting;
  vfx: Vfx;
  last: number;
  /** Prop lights (static positions; flicker applied per frame). */
  propLights: StaticLight[];
  flames: { x: number; y: number; strength: number }[];
  chimneys: { x: number; y: number }[];
  /** Reused per frame to avoid allocation churn. */
  lights: Light[];
  drawables: Drawable[];
}

const STATES = new WeakMap<GameEngine, BoardState>();

function stateFor(engine: GameEngine): BoardState {
  let st = STATES.get(engine);
  if (st) return st;
  const propLights: StaticLight[] = [];
  const flames: BoardState['flames'] = [];
  const chimneys: BoardState['chimneys'] = [];
  for (const p of engine.level.decor ?? []) {
    const meta = PROP_META[p.kind];
    const a = propAnchor(p.col, p.row);
    for (const L of meta.lights ?? []) {
      propLights.push({
        x: a.x + L.dx,
        y: a.y + L.dy,
        radius: L.radius,
        family: L.family,
        intensity: L.intensity,
        glow: L.glow ?? 1,
        flicker: !!L.flicker,
        phase: (p.col * 7.1 + p.row * 3.3) % 6.28,
      });
    }
    for (const f of meta.flames ?? []) flames.push({ x: a.x + f.dx, y: a.y + f.dy, strength: f.strength ?? 1 });
    for (const c of meta.chimneys ?? []) chimneys.push({ x: a.x + c.dx, y: a.y + c.dy });
  }
  st = {
    atmo: atmosphereFor(engine.level.id, engine.level.section),
    terrain: null,
    terrainKey: '',
    lighting: new Lighting(),
    vfx: new Vfx(),
    last: now(),
    propLights,
    flames,
    chimneys,
    lights: [],
    drawables: [],
  };
  STATES.set(engine, st);
  return st;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  ui: RenderUiState,
): void {
  const st = stateFor(engine);
  const t = now();
  const dt = Math.min(0.05, Math.max(0, (t - st.last) / 1000));
  st.last = t;

  // Drain this frame's cosmetic events into the VFX layer and advance it.
  if (engine.fx.length) {
    st.vfx.consume(engine.fx);
    engine.fx.length = 0;
  }
  st.vfx.update(dt);
  st.vfx.weather(st.atmo.weather, st.atmo.weatherDensity ?? 1, dt);
  for (const f of st.flames) st.vfx.flame(f.x, f.y, dt, f.strength);
  for (const c of st.chimneys) st.vfx.chimney(c.x, c.y, dt);

  ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  const shake = st.vfx.shakeOffset();
  ctx.save();
  ctx.translate(shake.x, shake.y);

  // 1. Ground.
  drawGround(ctx, engine, st);
  drawPathPreview(ctx, engine);
  drawPlacementHints(ctx, engine, ui);
  drawSelectedRange(ctx, engine, ui);

  // 2. World: props + figures, depth-sorted.
  drawWorld(ctx, engine, ui, st);
  st.vfx.drawWorld(ctx);
  drawShots(ctx, engine);

  // 3. Lighting.
  const lights = collectLights(engine, st, t / 1000);
  const bossDark = engine.enemies.some((e) => e.def.boss && !e.dead) ? 0.08 : 0;
  const atmo = bossDark ? { ...st.atmo, darkness: Math.min(0.75, st.atmo.darkness + bossDark) } : st.atmo;
  st.lighting.render(ctx, lights, atmo, st.vfx.exposure);

  // 4. Glow: attacks and spells read as light.
  drawSlices(ctx, engine);
  drawBeams(ctx, engine);
  drawProjectiles(ctx, engine, st.vfx, dt);
  drawThrownSpears(ctx, engine);
  drawPuffs(ctx, engine);
  drawBursts(ctx, engine);
  drawCyclones(ctx, engine);
  st.vfx.drawGlow(ctx);
  st.lighting.drawVignette(ctx, st.atmo.vignette);
  ctx.restore();

  // 5. Overlays (unshaken, unlit).
  drawTowerOverlays(ctx, engine);
  drawEnemyOverlays(ctx, engine, ui);
  drawThrowCharge(ctx, engine, ui);
  drawSelectedAoe(ctx, engine, ui);
  drawFloaters(ctx, engine, st.vfx);
  drawBossBars(ctx, engine);
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

/**
 * Optional per-level cosmetic palette, keyed by level id, for the hand-authored
 * castle stages. A stage may instead carry its own `theme` in the level data
 * (e.g. one exported from the Level Designer), which takes precedence — see
 * `themeFor`. Levels with neither use the default blue-slate board.
 */
const BOARD_THEMES: Record<number, BoardTheme> = {
  1: { groundEven: '#333a44', groundOdd: '#3c4450', floor: 'cobble', path: [['#191d24', TILE - 4], ['#57606b', TILE - 12], ['#68727e', TILE - 26]], pathKind: 'stone' },
  2: { groundEven: '#4a3728', groundOdd: '#54402f', floor: 'wood', path: [['#7a5a2e', TILE - 4], ['#6d3a30', TILE - 12], ['#8a4a3e', TILE - 26]], pathKind: 'carpet' },
  3: { groundEven: '#3f4356', groundOdd: '#484d62', floor: 'marble', path: [['#b7933f', TILE - 4], ['#2b3d78', TILE - 12], ['#3a51a4', TILE - 26]], pathKind: 'carpet' },
  4: { groundEven: '#2a2038', groundOdd: '#332a46', floor: 'flagstone', path: [['#c9a24a', TILE - 4], ['#472a6b', TILE - 12], ['#5b378a', TILE - 26]], pathKind: 'carpet' },
  5: { groundEven: '#3a2836', groundOdd: '#443040', floor: 'stone', path: [['#c8a24a', TILE - 4], ['#7c1b2b', TILE - 12], ['#9e2a3c', TILE - 26]], pathKind: 'carpet' },
};

function themeFor(engine: GameEngine): BoardTheme | undefined {
  // Level-data theme (e.g. authored in the Level Designer) wins over the
  // built-in per-id table.
  return engine.level.theme ?? BOARD_THEMES[engine.level.id];
}

/**
 * The baked floor + path, re-baked only when the set of fully revealed lanes
 * changes (or the device scale does). A lane still rolling out is stroked live
 * on top with its plain layers until it completes and joins the bake.
 */
function drawGround(ctx: CanvasRenderingContext2D, engine: GameEngine, st: BoardState): void {
  const scale = Math.min(2, Math.max(1, ctx.getTransform().a));
  const done: number[] = [];
  const rolling: number[] = [];
  engine.lanes.forEach((_, i) => {
    const frac = engine.laneRevealFraction(i);
    if (frac >= 1) done.push(i);
    else if (frac > 0) rolling.push(i);
  });
  const key = `${done.join(',')}@${scale}`;
  if (!st.terrain || st.terrainKey !== key) {
    st.terrain = bakeTerrain({
      stageKey: engine.level.id,
      theme: themeFor(engine),
      lanes: done.map((i) => engine.lanes[i].waypoints),
      scale,
    });
    st.terrainKey = key;
  }
  ctx.drawImage(st.terrain, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  if (rolling.length) drawRollingLanes(ctx, engine, rolling);
}

/** A hidden lane rolling out mid-battle: its leading fraction, plain layers. */
function drawRollingLanes(ctx: CanvasRenderingContext2D, engine: GameEngine, lanes: number[]): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const layers: [string, number][] = themeFor(engine)?.path ?? DEFAULT_PATH_LAYERS;
  const shapes = lanes.map((i) => partialPolyline(engine.lanes[i].waypoints, engine.laneRevealFraction(i)));
  for (const [color, width] of layers) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const pts of shapes) strokePolyline(ctx, pts);
  }
  // A bright leading edge where the carpet is unrolling.
  for (const pts of shapes) {
    const tip = pts[pts.length - 1];
    const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 26);
    g.addColorStop(0, 'rgba(255,220,150,0.55)');
    g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(tip.x - 26, tip.y - 26, 52, 52);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// World (depth-sorted props + figures)
// ---------------------------------------------------------------------------

type Drawable =
  | { k: 'prop'; base: number; i: number; alpha: number }
  | { k: 'tower'; base: number; t: Tower }
  | { k: 'enemy'; base: number; e: Enemy }
  | { k: 'corpse'; base: number; c: Corpse }
  | { k: 'king'; base: number };

function drawWorld(ctx: CanvasRenderingContext2D, engine: GameEngine, ui: RenderUiState, st: BoardState): void {
  const decor = engine.level.decor ?? [];
  // Ground-layer props first (under every figure).
  for (const p of decor) {
    if (PROP_META[p.kind].layer !== 'ground') continue;
    const a = propAnchor(p.col, p.row);
    drawProp(ctx, p.kind, a.x, a.y, p.color);
  }
  if (decor.length === 0) drawLegacyDecor(ctx, engine.level.id);

  const list = st.drawables;
  list.length = 0;
  for (const t of engine.towers) list.push({ k: 'tower', base: t.pos.y + 10, t });
  for (const e of engine.enemies) {
    if (e.dead) continue;
    list.push({ k: 'enemy', base: e.pos.y - footLiftFor(e.def.id) + e.def.radius * 0.7, e });
  }
  for (const c of st.vfx.corpses) list.push({ k: 'corpse', base: c.y + c.enemy.def.radius * 0.5, c });
  const king = seatedKingSpawn(engine);
  if (king) list.push({ k: 'king', base: king.y - RISE_LIFT + 4 });
  decor.forEach((p, i) => {
    const meta = PROP_META[p.kind];
    if (meta.layer !== 'standing') return;
    const a = propAnchor(p.col, p.row);
    list.push({ k: 'prop', base: a.y + meta.base, i, alpha: 1 });
  });

  // Occlusion: a tall prop drawn *in front of* a figure (figure's base is
  // above the prop's) that overlaps it fades so the unit stays readable.
  for (const d of list) {
    if (d.k !== 'prop') continue;
    const p = decor[d.i];
    const meta = PROP_META[p.kind];
    if (!meta.occludes) continue;
    const a = propAnchor(p.col, p.row);
    const [x0, y0, x1, y1] = meta.bounds;
    for (const o of list) {
      if (o.k !== 'tower' && o.k !== 'enemy') continue;
      if (o.base >= d.base) continue;
      const pos = o.k === 'tower' ? o.t.pos : o.e.pos;
      if (pos.x > a.x + x0 - 8 && pos.x < a.x + x1 + 8 && pos.y > a.y + y0 - 4 && pos.y - 20 < a.y + y1) {
        d.alpha = 0.5;
        break;
      }
    }
  }

  list.sort((a, b) => a.base - b.base);
  for (const d of list) {
    switch (d.k) {
      case 'prop': {
        const p = decor[d.i];
        const a = propAnchor(p.col, p.row);
        if (d.alpha < 1) {
          ctx.save();
          ctx.globalAlpha = d.alpha;
          drawProp(ctx, p.kind, a.x, a.y, p.color);
          ctx.restore();
        } else {
          drawProp(ctx, p.kind, a.x, a.y, p.color);
        }
        break;
      }
      case 'tower':
        drawTower(ctx, engine, ui, st, d.t);
        break;
      case 'enemy':
        if (d.e.dying) drawDeathAnimation(ctx, d.e, st);
        else drawEnemy(ctx, ui, st, d.e);
        break;
      case 'corpse':
        drawCorpse(ctx, st, d.c);
        break;
      case 'king':
        drawSeatedKing(ctx, engine, st);
        break;
    }
  }

  // Overhead props (chandeliers) hang above everyone.
  for (const p of decor) {
    if (PROP_META[p.kind].layer !== 'overhead') continue;
    const a = propAnchor(p.col, p.row);
    drawProp(ctx, p.kind, a.x, a.y, p.color);
  }
}

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------

function collectLights(engine: GameEngine, st: BoardState, time: number): Light[] {
  const out = st.lights;
  out.length = 0;
  for (const L of st.propLights) {
    const f = L.flicker ? flicker(time, L.phase) : 1;
    out.push({ x: L.x, y: L.y, radius: L.radius * (0.96 + 0.04 * f), family: L.family, intensity: L.intensity * f, glow: L.glow });
  }
  // Champions carry a soft pool of light — the player's units are always the
  // best-lit things on the board (readability before mood).
  const pool = st.atmo.championLight;
  for (const t of engine.towers) {
    out.push({ x: t.pos.x, y: t.pos.y + 2, radius: pool, family: 'candle', intensity: 0.6, glow: 0.18 });
    // Guiding Gale's wind carries a faint cool light so it reads in dark rooms.
    if (t.rangeBuffed) out.push({ x: t.pos.x, y: t.pos.y - 4, radius: 30, family: 'wind', intensity: 0.2 });
    if (t.charge > 0 && t.chargeMax > 0) {
      const k = 1 - t.charge / t.chargeMax;
      const fam = t.def.visual.shape === 'wizard' ? 'wind' : 'arcane';
      out.push({ x: t.pos.x, y: t.pos.y - 6, radius: 30 + 60 * k, family: fam, intensity: 0.4 + 0.5 * k });
    }
    if (t.beamTimer > 0) {
      const ux = Math.cos(t.beamAngle);
      const uy = Math.sin(t.beamAngle);
      for (let d = 20; d < t.beamRange; d += 60) {
        out.push({ x: t.pos.x + ux * d, y: t.pos.y + uy * d, radius: 80, family: 'arcane', intensity: 0.75 });
      }
    }
  }
  for (const p of engine.projectiles) {
    if (p.style === 'orb') out.push({ x: p.pos.x, y: p.pos.y, radius: 80, family: 'arcane', intensity: 0.85 });
    else if (p.style === 'magic') out.push({ x: p.pos.x, y: p.pos.y, radius: 46, family: 'arcane', intensity: 0.6 });
    else if (p.style === 'wind') out.push({ x: p.pos.x, y: p.pos.y, radius: 34, family: 'wind', intensity: 0.45 });
  }
  for (const s of engine.slices) {
    const lx = s.pos.x + Math.cos(s.angle) * s.lead;
    const ly = s.pos.y + Math.sin(s.angle) * s.lead;
    out.push({ x: lx, y: ly, radius: 70, family: 'wind', intensity: 0.5 });
  }
  for (const c of engine.cyclones) {
    const k = c.ttl / c.maxTtl;
    out.push({ x: c.pos.x, y: c.pos.y, radius: c.radius * 1.6, family: 'holy', intensity: 0.8 * k });
  }
  for (const e of engine.enemies) {
    if (e.dead) continue;
    if (e.def.boss) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
      const fam = e.def.id === 'boss4' ? 'dark' : 'blood';
      out.push({ x: e.pos.x, y: e.pos.y, radius: 70 + 14 * pulse, family: fam, intensity: 0.35 + 0.15 * pulse, glow: 0.9 });
      // Gowzer's eyes glare gold out of the hood (gone once he falls).
      if (e.def.id === 'boss4' && !e.dying) out.push({ x: e.pos.x, y: e.pos.y - footLiftFor(e.def.id) - 15, radius: 16, family: 'holy', intensity: 0.5, glow: 0.5 });
    } else if (e.def.id === 'cas_mage') {
      out.push({ x: e.pos.x, y: e.pos.y - 10, radius: 40, family: 'arcane', intensity: 0.35 });
    }
  }
  for (const ex of engine.baseExits) {
    out.push({ x: ex.x, y: ex.y, radius: 70, family: 'moon', intensity: 0.4, glow: 0.6 });
  }
  st.vfx.lights(out);
  return out;
}

// ---------------------------------------------------------------------------
// Boss bars + selection guides
// ---------------------------------------------------------------------------

/**
 * Boss health bars pinned to the top-centre of the board, drawn over everything
 * else. One stacked bar per living boss on the field: the boss's name sits above
 * the bar and its current/max HP reads inside it. Only shown once a boss has
 * actually spawned (a seated/hidden throne boss doesn't get a bar yet).
 */
function drawBossBars(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const bosses = engine.enemies.filter((e) => e.def.boss && (e.rise ?? 0) === 0);
  if (bosses.length === 0) return;

  const barW = Math.min(BOARD_WIDTH - 60, 460);
  const barH = 14;
  const nameH = 20;
  const rowH = nameH + barH + 14;
  let top = 12;

  for (const e of bosses) {
    const pct = Math.max(0, Math.min(1, e.health / e.def.health));
    const bx = (BOARD_WIDTH - barW) / 2;
    const by = top + nameH;

    ctx.save();
    // Name plate.
    ctx.font = `700 15px ${FONT_TITLE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(8,4,12,0.85)';
    ctx.strokeText(e.def.name, BOARD_WIDTH / 2, top + 14);
    const ng = ctx.createLinearGradient(0, top, 0, top + 16);
    ng.addColorStop(0, '#fff1c4');
    ng.addColorStop(1, '#e7b64a');
    ctx.fillStyle = ng;
    ctx.fillText(e.def.name, BOARD_WIDTH / 2, top + 14);

    // Frame: dark well with a thin gold rule and pointed end caps.
    ctx.fillStyle = 'rgba(8,4,12,0.78)';
    roundRect(ctx, bx - 4, by - 4, barW + 8, barH + 8, 4);
    ctx.fill();
    ctx.fillStyle = FEEDBACK.hpTrack;
    ctx.fillRect(bx, by, barW, barH);
    // Fill: deep crimson with a lit top edge (boss HP always reads as danger).
    const fg = ctx.createLinearGradient(0, by, 0, by + barH);
    fg.addColorStop(0, '#ff6a5a');
    fg.addColorStop(0.5, '#c8283a');
    fg.addColorStop(1, '#7a1020');
    ctx.fillStyle = fg;
    ctx.fillRect(bx, by, barW * pct, barH);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(bx, by, barW * pct, 2);
    // Quarter ticks.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (const q of [0.25, 0.5, 0.75]) ctx.fillRect(bx + barW * q - 0.5, by, 1, barH);
    ctx.strokeStyle = '#c9a24a';
    ctx.lineWidth = 1.2;
    roundRect(ctx, bx - 2, by - 2, barW + 4, barH + 4, 3);
    ctx.stroke();
    for (const side of [-1, 1]) {
      const cx = side < 0 ? bx - 8 : bx + barW + 8;
      ctx.fillStyle = '#e7b64a';
      ctx.beginPath();
      ctx.moveTo(cx, by + barH / 2 - 5);
      ctx.lineTo(cx + side * 6, by + barH / 2);
      ctx.lineTo(cx, by + barH / 2 + 5);
      ctx.lineTo(cx - side * 3, by + barH / 2);
      ctx.closePath();
      ctx.fill();
    }

    const hp = `${Math.max(0, Math.ceil(e.health))} / ${Math.round(e.def.health)}`;
    ctx.font = `700 10.5px ${FONT_UI}`;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(hp, BOARD_WIDTH / 2, by + barH / 2 + 0.5);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(hp, BOARD_WIDTH / 2, by + barH / 2 + 0.5);
    ctx.restore();

    top += rowH;
  }
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

/** The selected champion's reach, drawn on the floor under the figures. */
function drawSelectedRange(ctx: CanvasRenderingContext2D, engine: GameEngine, ui: RenderUiState): void {
  if (ui.selectedTowerUid == null) return;
  const t = engine.towers.find((x) => x.uid === ui.selectedTowerUid);
  if (!t || t.def.generator) return;
  const { x, y } = t.pos;
  const time = now() / 1000;
  ctx.save();
  const g = ctx.createRadialGradient(x, y, t.range * 0.2, x, y, t.range);
  g.addColorStop(0, 'rgba(255,230,160,0)');
  g.addColorStop(0.85, 'rgba(255,230,160,0.06)');
  g.addColorStop(1, 'rgba(255,230,160,0.14)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, t.range, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,224,150,0.7)';
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -time * 14;
  ctx.lineWidth = 1.4;
  ctx.stroke();
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
  ctx.strokeStyle = 'rgba(255, 226, 160, 0.45)';
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
  ctx.strokeStyle = 'rgba(255, 236, 190, 0.95)';
  ctx.shadowColor = 'rgba(255, 190, 90, 0.8)';
  ctx.shadowBlur = 6;
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

/**
 * Shared compositor settings for a board figure: ink outline, the stage's rim
 * light, form shading, and (on sunlit stages) a cast shadow along the sun.
 */
function boardStyle(st: BoardState, accent: string, boss = false): FigureStyle {
  const rim = LIGHT[st.atmo.light].core;
  const sun = st.atmo.sun;
  return {
    accent,
    outline: 0.95,
    rim,
    rimAlpha: 0.45 + 0.25 * st.atmo.darkness,
    shading: 1,
    headY: boss ? -40 : -20,
    feetY: 12,
    box: boss ? BOSS_BOX : DEFAULT_BOX,
    cast: sun
      ? { dx: Math.cos(sun.angle) * 0.55, dy: Math.max(0.12, Math.sin(sun.angle) * 0.4), alpha: 0.28 }
      : undefined,
  };
}

/** Soft contact shadow pooled under a figure's feet (local origin = figure). */
function contactShadow(ctx: CanvasRenderingContext2D, y: number, rx: number, ry: number, alpha = 1): void {
  const g = ctx.createRadialGradient(0, y, 0, 0, y, rx);
  g.addColorStop(0, `rgba(8,5,14,${0.55 * alpha})`);
  g.addColorStop(0.55, `rgba(8,5,14,${0.32 * alpha})`);
  g.addColorStop(1, 'rgba(8,5,14,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * One deployed champion: contact shadow, aura tells, then the figure through
 * the compositor with idle breathing, a weight-shift sway, an anticipation lean
 * before each strike and an eased lunge/follow-through after it.
 */
function drawTower(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  ui: RenderUiState,
  st: BoardState,
  t: Tower,
): void {
  const { x, y } = t.pos;
  const selected = t.uid === ui.selectedTowerUid;
  const hovered = !selected && ui.hoverCol === t.col && ui.hoverRow === t.row;
  const time = st.vfx.time;

  // Resolve this tower's aim (live target first, else its last aim point) for
  // both the attack lunge and which way a drawn figure faces.
  const target =
    t.targetUid != null
      ? engine.enemies.find((e) => e.uid === t.targetUid && !e.dead)
      : undefined;
  const aimPt = target?.pos ?? t.aimTarget ?? null;
  const faceLeft = aimPt ? aimPt.x < x : false;
  let ux = 0;
  let uy = 0;
  if (target) {
    const d = Math.hypot(target.pos.x - x, target.pos.y - y) || 1;
    ux = (target.pos.x - x) / d;
    uy = (target.pos.y - y) / d;
  }

  // Lunge after a strike (eased: snaps out, settles back) and an anticipation
  // lean *away* from the target in the last instant before the next blow.
  let ox = 0;
  let oy = 0;
  let squash = 0;
  const strike = Math.max(0, Math.min(1, t.attackAnim / 0.18));
  if (strike > 0 && target) {
    const push = ease.outCubic(strike) * 5;
    ox += ux * push;
    oy += uy * push;
    squash -= 0.04 * strike;
  } else if (target && t.cooldown > 0 && t.cooldown < 0.14 && t.charge <= 0) {
    const wind = 1 - t.cooldown / 0.14;
    const back = ease.inCubic(wind) * 1.8;
    ox -= ux * back;
    oy -= uy * back;
    squash += 0.035 * wind;
  }

  // Idle life: breathing (a gentle rise and settle about the feet) and a slow
  // weight shift. Damped while the champion is mid-attack.
  const phase = t.uid * 1.37;
  const idle = strike > 0 || t.charge > 0 ? 0.3 : 1;
  const breath = Math.sin(time * 2.1 + phase) * idle;
  const sway = Math.sin(time * 0.85 + phase * 0.7) * 0.35 * idle;

  // Better Morale (Swordsman): a golden pulse whose strength grows with the
  // number of adjacent allies boosting this tower.
  const moraleStacks = t.adjacentDamageMult > 0 ? t.adjacentAllies : 0;

  ctx.save();
  ctx.translate(x + ox, y + oy);
  if (moraleStacks > 0) {
    const osc = moralePulse();
    const amp = Math.min(0.06, 0.02 + 0.012 * (moraleStacks - 1));
    const s = 1 + amp * osc;
    ctx.scale(s, s);
    drawMoraleGlow(ctx, moraleStacks);
  }
  contactShadow(ctx, 10.5, 15, 6);
  // The player's own champion gets a thin outline around its foot shadow, tinted
  // from its portrait's outfit colour — a subtle "this hero is yours" marker.
  // While its ability haste is active (the Bow's Quickdraw) the ring *flares*.
  if (t.def.visual.shape.startsWith('player-')) {
    const accent = t.def.visual.playerConfig?.outfitColor ?? t.def.visual.color;
    const flaring = t.abilitySpeedBuffTimer > 0;
    const pulse = flaring ? moralePulse() : 0;
    ctx.save();
    ctx.strokeStyle = shade(accent, flaring ? 0.5 : 0.2);
    ctx.lineWidth = flaring ? 2.4 + pulse * 1.6 : 1.6;
    ctx.shadowColor = accent;
    ctx.shadowBlur = flaring ? 14 + pulse * 12 : 6;
    ctx.beginPath();
    ctx.ellipse(0, 10, 15 + (flaring ? 2 + pulse * 2 : 0), 6 + (flaring ? 1 + pulse : 0), 0, 0, Math.PI * 2);
    ctx.stroke();
    if (flaring) {
      ctx.globalAlpha = 0.3 + 0.3 * pulse;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 10, 20 + pulse * 5, 8.5 + pulse * 2.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Breathing + sway + squash about the feet.
  ctx.translate(sway, 11);
  ctx.scale(FIGURE_SCALE * (1 - 0.008 * breath - squash * 0.5), FIGURE_SCALE * (1 + 0.018 * breath + squash));
  ctx.translate(0, -11);

  if (t.rangeBuffed) drawGale(ctx, 'back', t.uid * 0.37);
  if (hasSprite(t.def.visual.shape)) {
    // `anim` eases with the attack (1 just after a strike → 0 at rest); each
    // sprite reads it its own way (bowstring snap, sword swing). A throw drives
    // it from the longer `throwAnim`; a charge ramps it 0→1 across the wind-up.
    const throwing = t.throwAnim > 0;
    const charging = t.charge > 0 && t.chargeMax > 0;
    const rawAnim = charging
      ? ease.inOutSine(1 - t.charge / t.chargeMax)
      : throwing
        ? t.throwAnim / THROW_ANIM_TIME
        : ease.outQuad(strike);
    // Quantized so attack poses reuse cached frames (12 steps is smooth at 0.18s).
    const anim = Math.round(rawAnim * 12) / 12;
    // The "empowered" flourish marks a champion whose signature upgrade is
    // bought — wind motes for the Wizard (Wind Slice → cone), arcane sparkles
    // off the Elf's bow once Chain Enchantment lifts her bounce count.
    const empowered =
      t.aoe === 'cone' ||
      (t.def.visual.shape === 'elf' && t.bounces > (t.def.bounces ?? 0));
    const style = boardStyle(st, t.def.visual.playerConfig?.outfitColor ?? t.def.visual.color);
    if (selected) {
      style.ink = INK.select;
      style.glow = 2.4;
    } else if (hovered) {
      style.rimAlpha = (style.rimAlpha ?? 0.5) + 0.3;
    }
    // Empowered Wizard/Elf flourishes animate from inside the sprite: no cache.
    const live = empowered && (t.def.visual.shape === 'elf' || t.def.visual.shape === 'wizard');
    paintFigure(
      ctx,
      (g) =>
        drawUnitSprite(g, t.def.visual.shape, t.def.visual.color, faceLeft, anim, throwing, empowered, t.def.visual.playerConfig),
      style,
      live
        ? undefined
        : `u|${t.def.visual.shape}|${t.def.visual.color}|${faceLeft ? 1 : 0}|${anim}|${throwing ? 1 : 0}|${empowered ? 1 : 0}|${cfgKey(t.def.visual.playerConfig)}`,
    );
    // The Magic adventurer visibly gathers its orb during the wind-up.
    if (t.aoe === 'circle' && charging) {
      const grow = 1 - t.charge / t.chargeMax;
      const accent = t.def.visual.playerConfig?.outfitColor ?? t.def.visual.color;
      const cx = (faceLeft ? -1 : 1) * (12 + 1.6 * grow);
      drawChargingOrb(ctx, cx, -4.5, 1.2 + 4.3 * grow, accent, grow);
    }
  } else {
    // Emoji fallback token: a lit disc with an inked rim.
    const g = ctx.createRadialGradient(-4, -5, 2, 0, 0, 15);
    g.addColorStop(0, shade(t.def.visual.color, 0.3));
    g.addColorStop(1, shade(t.def.visual.color, -0.2));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = selected ? INK.select : INK.base;
    ctx.stroke();
    ctx.font = '17px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.def.visual.icon, 0, 1);
  }
  if (t.preloadMax > 0) drawPreloadGem(ctx, t.preloaded > 0);
  if (t.rangeBuffed) drawGale(ctx, 'front', t.uid * 0.37);
  ctx.restore();
}

/** Post-lighting champion tells (Bard notes circle the head). */
function drawTowerOverlays(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  for (const t of engine.towers) {
    if (t.attackSpeedBuffTimer > 0) {
      drawBuffNotes(ctx, t.pos.x, t.pos.y, t.attackSpeedBuffColor || t.def.visual.color);
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
  const t = now() / 620;
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
 * Guiding Gale: the wind lifting this champion's range. Three tapered ribbons
 * spiral up from the feet past the head, each fading in low and out high, with
 * a mote riding its leading edge, over a faint swirl on the ground. Every orbit
 * is split by depth: the `back` layer (drawn before the figure) holds the half
 * of each loop passing behind the body plus the ground swirl, and the `front`
 * layer (after the figure) the half crossing in front, so the wind wraps the
 * champion instead of sitting on top of it. Drawn in the figure's scaled local
 * space (feet ≈ y 11, head ≈ y −16); `seed` desyncs neighbouring champions.
 */
const GALE_GUSTS = [
  { phase: 0, rx: 13.5, width: 1.8, spin: 3.1 },
  { phase: 0.34, rx: 15.5, width: 1.5, spin: 2.7 },
  { phase: 0.67, rx: 12, width: 1.35, spin: 3.4 },
];
const GALE_RISE = 0.38; // lifecycles per second (feet → above the head)
const GALE_SEGS = 14;

function drawGale(ctx: CanvasRenderingContext2D, layer: 'back' | 'front', seed: number): void {
  const time = now() / 1000;
  ctx.save();
  ctx.lineCap = 'round';
  if (layer === 'back') {
    // A slow swirl of air stirring the ground at the champion's feet.
    ctx.strokeStyle = '#9fecea';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) {
      const a = time * 1.6 + seed + i * Math.PI;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.ellipse(0, 10.5, 15 - i * 3, 5 - i, 0, a, a + 1.9);
      ctx.stroke();
    }
  }
  for (const g of GALE_GUSTS) {
    const u = (((time * GALE_RISE + g.phase + seed) % 1) + 1) % 1; // 0..1 lifecycle
    const fade = Math.sin(Math.PI * u);
    if (fade < 0.02) continue;
    const yBase = 10 - u * 30;
    const rx = g.rx * (0.85 + 0.3 * u);
    const ry = rx * 0.32;
    const head = time * g.spin + g.phase * Math.PI * 2 + seed * 3;
    const pt = (th: number, k: number) => ({ x: Math.cos(th) * rx, y: yBase + Math.sin(th) * ry + k * 4 });
    // Ribbon: segments from the head back along the orbit, tapering and
    // fading toward the tail; two passes for a soft halo round a bright core.
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? '#6fe3e0' : '#f2ffff';
      for (let i = 0; i < GALE_SEGS; i++) {
        const k0 = i / GALE_SEGS;
        const k1 = (i + 1) / GALE_SEGS;
        const t0 = head - k0 * 2.3;
        const t1 = head - k1 * 2.3;
        const front = Math.sin((t0 + t1) / 2) > 0;
        if (front !== (layer === 'front')) continue;
        const taper = Math.pow(1 - k0, 0.8);
        const w = g.width * taper * (0.6 + 0.4 * fade);
        ctx.lineWidth = pass === 0 ? w * 2.2 : w;
        ctx.globalAlpha = fade * (1 - k0) * (pass === 0 ? 0.13 : 0.48);
        const p0 = pt(t0, k0);
        const p1 = pt(t1, k1);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }
    // The mote carried on the gust's leading edge.
    if (Math.sin(head) > 0 === (layer === 'front')) {
      const m = pt(head + 0.25, 0);
      ctx.globalAlpha = fade * 0.6;
      ctx.fillStyle = '#f2ffff';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, 1.2, 0.65, head, 0, Math.PI * 2);
      ctx.fill();
    }
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

/** Walk view from a travel heading (side profile along rows, front/back on columns). */
function viewFor(h: { x: number; y: number }): 'side' | 'front' | 'back' {
  return Math.abs(h.x) >= Math.abs(h.y) ? 'side' : h.y > 0 ? 'front' : 'back';
}

/**
 * Where the Throne Room boss sits until he rises: one `RISE_LIFT` above the
 * hidden reveal lane's spawn cell, so the hand-off to the live, rising enemy is
 * seamless. Null when no seated boss should be drawn.
 */
function seatedKingSpawn(engine: GameEngine): { x: number; y: number } | null {
  if (engine.bossHasSpawned || engine.outcome !== 'playing') return null;
  const laneIdx = engine.level.lanes.findIndex((l) => l.revealAtWave !== undefined);
  if (laneIdx < 0) return null;
  if (!hasEnemySprite(engine.level.bossId)) return null;
  return engine.lanes[laneIdx].waypoints[0];
}

/**
 * The boss seated on his throne, drawn until he actually spawns (rises) on the
 * final wave — his own walking sprite in its fully-seated pose, front view.
 */
function drawSeatedKing(ctx: CanvasRenderingContext2D, engine: GameEngine, st: BoardState): void {
  const spawn = seatedKingSpawn(engine);
  if (!spawn) return;
  const def = getEnemy(engine.level.bossId);
  ctx.save();
  ctx.translate(spawn.x, spawn.y - RISE_LIFT - footLiftFor(def.id));
  const style = boardStyle(st, def.visual.color, true);
  style.cast = undefined;
  paintFigure(ctx, (g) => drawEnemySprite(g, def.id, def.visual.color, 'front', false, 0, 1), style, `e|${def.id}|${def.visual.color}|front|0|0|sit`);
  ctx.restore();
}

/**
 * One marching foe: ground shadow (and the Warden's aegis glow), then its walk
 * figure through the compositor — hit flash, recoil away from the blow with a
 * squash, a dodge weave, and a threat outline when the cursor is on it.
 */
function drawEnemy(ctx: CanvasRenderingContext2D, ui: RenderUiState, st: BoardState, e: Enemy): void {
  const x = e.pos.x;
  const R = e.def.radius;
  const boss = e.def.boss;
  // A boss rising off its throne is drawn lifted (its seat height above the
  // path) easing to 0 as it stands. A tall sprite also gets a fixed foot-lift
  // so its feet/shadow rest on the path centreline instead of below it.
  const lift = RISE_LIFT * (e.rise ?? 0);
  const groundY = e.pos.y - footLiftFor(e.def.id);
  const y = groundY - lift;

  // Dodge weave: sidestep perpendicular to travel and spring back.
  let dodgeX = 0;
  let dodgeY = 0;
  let dodgeHop = 0;
  if ((e.dodge ?? 0) > 0) {
    const amt = Math.sin(Math.PI * (1 - e.dodge / DODGE_ANIM_TIME));
    dodgeX = -e.heading.y * amt * DODGE_DIST;
    dodgeY = e.heading.x * amt * DODGE_DIST;
    dodgeHop = -amt * 2;
  }
  const rc = st.vfx.recoilOf(e.uid);

  ctx.save();
  ctx.translate(x + dodgeX + rc.dx * 0.5, groundY + dodgeY + rc.dy * 0.5);
  if ((e.wardReduction ?? 0) > 0) drawWardGlow(ctx, R);
  contactShadow(ctx, R * 0.7, R * (1 - 0.25 * (e.rise ?? 0)), R * 0.42, boss ? 1.1 : 0.9);
  ctx.restore();

  ctx.save();
  ctx.translate(x + dodgeX + rc.dx, y + dodgeY + dodgeHop + rc.dy);
  {
    // Board scale + a quick flinch squash about the feet when struck.
    const s = boss ? 1 : FIGURE_SCALE;
    ctx.translate(0, 11);
    ctx.scale(s * (1 + 0.06 * rc.squash), s * (1 - 0.08 * rc.squash));
    ctx.translate(0, -11);
  }
  if (hasEnemySprite(e.def.id)) {
    const view = viewFor(e.heading);
    const style = boardStyle(st, e.def.visual.color, boss);
    style.flash = e.hitFlash > 0 ? Math.min(1, e.hitFlash / 0.12) * 0.75 : 0;
    if (ui.hoverEnemyUid === e.uid) {
      style.ink = INK.threat;
      style.glow = 2;
    }
    // A rising boss shouldn't throw a long sun shadow off the throne.
    if ((e.rise ?? 0) > 0) style.cast = undefined;
    const rising = (e.rise ?? 0) > 0;
    const sf = strideFrame(e.def.id, e.dist);
    const left = e.heading.x < 0;
    // A speaking boss with a taunt pose (Gowzer) straightens up and twirls a
    // dagger through his lines: the twirl loops every TAUNT_TWIRL seconds,
    // quantized to 16 cached frames.
    const taunting = isSpeaking(e) && TAUNT_POSE.has(e.def.id);
    const twirl = taunting ? Math.floor(((now() / 1000 / TAUNT_TWIRL) % 1) * 16) / 16 : 0;
    const pose = taunting ? 1 : (e.rise ?? 0);
    paintFigure(
      ctx,
      (g) => drawEnemySprite(g, e.def.id, e.def.visual.color, view, left, rising ? e.dist : sf.q, pose, twirl),
      style,
      rising
        ? undefined
        : `e|${e.def.id}|${e.def.visual.color}|${view}|${left ? 1 : 0}|${sf.idx}${taunting ? `|t${twirl}` : ''}`,
    );
  } else {
    // Emoji fallback token: lit disc, inked rim (gold for a boss).
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.35, 1, 0, 0, R);
    g.addColorStop(0, shade(e.def.visual.color, 0.25));
    g.addColorStop(1, shade(e.def.visual.color, -0.25));
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = boss ? 3 : 1.6;
    ctx.strokeStyle = boss ? '#ffd76a' : INK.base;
    ctx.stroke();
    ctx.font = `${Math.round(R * 1.2)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.def.visual.icon, 0, 1);
  }
  ctx.restore();
}

/**
 * Health bars and spawn speech, drawn after lighting so they never sink into a
 * dark room. A full-health rank-and-file foe shows no bar at all — the board
 * stays calm until something is actually taking damage.
 */
function drawEnemyOverlays(ctx: CanvasRenderingContext2D, engine: GameEngine, ui: RenderUiState): void {
  for (const e of engine.enemies) {
    if (e.dead || e.dying) continue;
    const R = e.def.radius;
    const y = e.pos.y - footLiftFor(e.def.id) - RISE_LIFT * (e.rise ?? 0);
    let dodgeX = 0;
    if ((e.dodge ?? 0) > 0) dodgeX = -e.heading.y * Math.sin(Math.PI * (1 - e.dodge / DODGE_ANIM_TIME)) * DODGE_DIST;
    const pct = Math.max(0, e.health / e.def.health);
    const hovered = ui.hoverEnemyUid === e.uid;
    const by = y - R - (e.def.boss ? 14 : 9);
    if (pct < 0.999 || e.def.boss || hovered) {
      const w = e.def.boss ? R * 2.2 : Math.max(18, R * 1.7);
      const bx = e.pos.x + dodgeX - w / 2;
      const h = e.def.boss ? 4 : 3;
      ctx.save();
      ctx.fillStyle = 'rgba(8,4,12,0.78)';
      roundRect(ctx, bx - 1.5, by - 1.5, w + 3, h + 3, 2);
      ctx.fill();
      const col = pct > 0.5 ? FEEDBACK.hpHigh : pct > 0.25 ? FEEDBACK.hpMid : FEEDBACK.hpLow;
      ctx.fillStyle = col;
      ctx.fillRect(bx, by, w * pct, h);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(bx, by, w * pct, 1);
      ctx.restore();
    }
    const line = currentSpeechLine(e);
    if (line) drawSpeechBubble(ctx, e.pos.x + dodgeX, by - 8, line);
  }
}

/**
 * A felled foe's short death: knocked back from the killing blow, it toppled
 * about its feet, flashes white on the instant of death, then sinks and fades
 * while its shadow thins. Arcane kills dissolve toward violet.
 */
function drawCorpse(ctx: CanvasRenderingContext2D, st: BoardState, c: Corpse): void {
  const e = c.enemy;
  const R = e.def.radius;
  const k = c.t / c.max;
  const fall = ease.outCubic(Math.min(1, k / 0.42));
  const fade = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
  const sink = Math.max(0, (k - 0.45) / 0.55) * 4;
  const groundY = c.y - footLiftFor(e.def.id);
  const dir = c.kx >= 0 ? 1 : -1;
  const knock = 7 * ease.outCubic(Math.min(1, k / 0.3));

  ctx.save();
  ctx.translate(c.x + c.kx * knock, groundY + c.ky * knock * 0.5);
  contactShadow(ctx, R * 0.7, R * (1 + 0.3 * fall), R * 0.45, fade);
  ctx.translate(0, sink);
  // Topple about the feet (the sprite origin sits ~11 above them).
  const pivot = 11;
  const s = e.def.boss ? 1 : FIGURE_SCALE;
  ctx.translate(0, pivot);
  ctx.rotate(dir * 1.35 * fall);
  ctx.scale(s, s);
  ctx.translate(0, -pivot);
  if (hasEnemySprite(e.def.id)) {
    const style = boardStyle(st, e.def.visual.color, e.def.boss);
    style.cast = undefined;
    style.alpha = Math.max(0, fade);
    style.flash = k < 0.12 ? (1 - k / 0.12) * 0.9 : 0;
    if (c.element === 'arcane') {
      style.tint = '#b48cf0';
      style.tintAmount = 0.55 * k;
    }
    const sf = strideFrame(e.def.id, c.dist);
    paintFigure(
      ctx,
      (g) => drawEnemySprite(g, e.def.id, e.def.visual.color, c.view, c.faceLeft, sf.q, 0),
      style,
      style.tint ? undefined : `e|${e.def.id}|${e.def.visual.color}|${c.view}|${c.faceLeft ? 1 : 0}|${sf.idx}`,
    );
  } else {
    ctx.globalAlpha = Math.max(0, fade);
    ctx.fillStyle = e.def.visual.color;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Enemies with an intro taunt pose, driven by `sit`/`flourish` while speaking. */
const TAUNT_POSE = new Set(['boss4']);
const TAUNT_TWIRL = 1.4; // seconds per dagger twirl

/**
 * Gowzer's feathers torn loose as he falls: a burst flung out from his body
 * that drifts down rocking side to side and fades. Fully deterministic from
 * `t` (seconds since the killing blow), so it needs no particle state.
 */
const DEATH_FEATHERS = 14;
const FEATHER_DEATH = new Set(['boss4']);
function drawFeatherBurst(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, dir: number): void {
  for (let i = 0; i < DEATH_FEATHERS; i++) {
    const a = (i / DEATH_FEATHERS) * Math.PI * 2 + i * 0.7;
    const speed = 14 + ((i * 37) % 11) * 1.6;
    const out = 1 - Math.exp(-t * 3.2);
    const life = 2.2 + ((i * 13) % 7) * 0.12;
    if (t > life) continue;
    const fx = x + Math.cos(a) * speed * out + dir * t * 4 + Math.sin(t * 3.4 + i) * 2.4;
    const fy = y - 8 + Math.sin(a) * speed * 0.55 * out - 10 * out + t * t * 3.2;
    const fade = 1 - t / life;
    ctx.save();
    ctx.globalAlpha = Math.min(1, fade * 1.4);
    drawFeather(ctx, fx, fy, 6.2, 1.8, a + Math.sin(t * 4 + i) * 0.7, i % 3 ? '#2b2539' : '#1c1826', i % 3 !== 1 ? '#e2bb55' : undefined, '#6a5d88');
    ctx.restore();
  }
}

/**
 * Special death sequence for an enemy with `deathAnimation` (Gowzer's
 * 'shadowSwallow'): it first slumps to the ground (over DEATH_FALL_TIME), then
 * is drawn down into an expanding pool of its own shadow that draws shut over it.
 * Reads `e.deathT` (elapsed seconds); drawn entirely in world space.
 */
function drawDeathAnimation(ctx: CanvasRenderingContext2D, e: Enemy, st: BoardState): void {
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
  ctx.translate(x, groundY + fallSink + swallow * 10); // settle, then sink under
  ctx.translate(0, pivot);
  ctx.rotate(dir * 1.05 * fallEase); // topple to ~60°
  ctx.translate(0, -pivot);
  const shrink = 1 - swallow * 0.45;
  ctx.scale(shrink, shrink);

  if (hasEnemySprite(e.def.id)) {
    const style = boardStyle(st, e.def.visual.color, e.def.boss);
    style.cast = undefined;
    style.alpha = Math.max(0, 1 - swallow * 1.05);
    style.tint = '#1a0a24';
    style.tintAmount = 0.6 * swallow;
    paintFigure(ctx, (g) => drawEnemySprite(g, e.def.id, e.def.visual.color, viewFor(e.heading), e.heading.x < 0, e.dist, 0), style);
  } else {
    ctx.globalAlpha = Math.max(0, 1 - swallow * 1.05);
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

  if (FEATHER_DEATH.has(e.def.id)) drawFeatherBurst(ctx, x, groundY, t, dir);

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
 * Draw in-flight projectiles — after lighting, so every shot stays legible in a
 * dark hall. Each has a clear head, a trail and its colour identity: arrows and
 * bolts streak a faint motion line with a glinting tip; the Elf's shaft trails
 * arcane motes; the Wizard's gust sheds wisps; the Mage's orb sheds sparks.
 */
function drawProjectiles(ctx: CanvasRenderingContext2D, engine: GameEngine, vfx: Vfx, dt: number): void {
  for (const p of engine.projectiles) {
    const target = engine.enemies.find((e) => e.uid === p.targetUid && !e.dead);
    const dest = target ? target.pos : p.last;
    const ang = Math.atan2(dest.y - p.pos.y, dest.x - p.pos.x);
    // Fading magical tail: draw the arrow's recent positions (world space, before
    // the local rotate/scale) as motes that shrink and dim into the distance.
    if (p.trail && p.trail.length) drawMagicTrail(ctx, p.trail, p.color);
    if (p.style === 'orb') vfx.trail('orb', p.pos.x, p.pos.y, p.color, dt);
    else if (p.style === 'magic') vfx.trail('arcane', p.pos.x, p.pos.y, p.color, dt);
    else if (p.style === 'wind') vfx.trail('wind', p.pos.x, p.pos.y, p.color, dt);
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
      // Motion streak: a soft line trailing the shaft, fading to nothing.
      const sg = ctx.createLinearGradient(-26, 0, -6, 0);
      sg.addColorStop(0, 'rgba(255,248,230,0)');
      sg.addColorStop(1, 'rgba(255,248,230,0.45)');
      ctx.strokeStyle = sg;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.lineTo(-6, 0);
      ctx.stroke();
      // Dark under-line so the shaft reads over bright floors.
      ctx.strokeStyle = 'rgba(20,12,8,0.55)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(5, 0);
      ctx.stroke();
      // Shaft.
      ctx.strokeStyle = '#8a6036';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      // Arrowhead with a hot glint.
      ctx.fillStyle = '#eef3f8';
      ctx.beginPath();
      ctx.moveTo(3.6, -2);
      ctx.lineTo(9, 0);
      ctx.lineTo(3.6, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(8, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      // Fletching, tinted with the champion's colour.
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-8.5, -2.2);
      ctx.moveTo(-5, 0);
      ctx.lineTo(-8.5, 2.2);
      ctx.stroke();
    }
    ctx.restore();
  }
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

/**
 * Cyclone Slash (the Blade adventurer's ability): a spinning whirlwind of steel
 * centred on the champion, filling its attack radius. Expanding, rotating
 * blade-arcs in the champion's colour with white leading edges, an inner sweep
 * disc and an expanding shock ring — all fading over the whirlwind's short life.
 */
function drawCyclones(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  for (const c of engine.cyclones) {
    const p = 1 - c.ttl / c.maxTtl; // 0 -> 1 over its life
    const alpha = Math.max(0, 1 - p);
    // Reach full radius quickly (by ~45% of the life), then hold and fade.
    const grow = Math.min(1, p / 0.45);
    const R = c.radius * (0.3 + 0.7 * grow);
    const spin = p * Math.PI * 3; // several turns across the life

    ctx.save();
    ctx.translate(c.pos.x, c.pos.y);

    // Faint swept disc suggesting the cut area.
    ctx.globalAlpha = alpha * 0.14;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();

    // Spinning blade-arcs, each a tapered sweep at its own radius. Drawn twice:
    // a coloured glow underneath and a bright white leading edge on top.
    ctx.rotate(spin);
    const arcs = 4;
    for (let i = 0; i < arcs; i++) {
      const rr = R * (0.5 + 0.13 * i);
      const a0 = (i / arcs) * Math.PI * 2;
      const sweep = Math.PI * 0.9;
      // Coloured glow.
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.shadowColor = c.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, rr, a0, a0 + sweep);
      ctx.stroke();
      // Bright white core along the leading part of the arc.
      ctx.shadowBlur = 0;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, rr, a0 + sweep * 0.55, a0 + sweep);
      ctx.stroke();
    }
    ctx.restore();

    // Expanding shock ring at the whirlwind's edge (un-rotated).
    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 * alpha + 0.5;
    ctx.beginPath();
    ctx.arc(c.pos.x, c.pos.y, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Mana Ray beams (the Mage adventurer's channelled ability): a fixed, glowing
 * line of mana from each channelling champion out to its locked reach, in the
 * champion's colour. Drawn in layers — a soft wide outer glow, a solid core and a
 * bright white centre line — with a flowing dashed shimmer and a pulsing muzzle
 * flare at the origin. Fades over the last stretch of the channel.
 */
function drawBeams(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  for (const t of engine.towers) {
    if (t.beamTimer <= 0) continue;
    const accent = t.def.visual.playerConfig?.outfitColor ?? t.def.visual.color;
    const ux = Math.cos(t.beamAngle);
    const uy = Math.sin(t.beamAngle);
    // A slim visual beam (thinner than the wider hit corridor) that emerges from
    // the mage's raised hands — offset forward along the beam and lifted to hand
    // height — rather than from a big orb over his body.
    const coreW = 6; // slim core; the hit corridor stays BEAM_HALF_WIDTH wide
    const handDist = 12;
    const x0 = t.pos.x + ux * handDist;
    const y0 = t.pos.y + uy * handDist - 4;
    const x1 = t.pos.x + ux * t.beamRange;
    const y1 = t.pos.y + uy * t.beamRange;
    // Ease the beam out over the last 0.3s of the channel.
    const fade = Math.min(1, t.beamTimer / 0.3);
    const pulse = 0.5 - 0.5 * Math.cos(now / 70);

    ctx.save();
    ctx.lineCap = 'round';
    // Soft outer glow.
    ctx.globalAlpha = 0.25 * fade;
    ctx.strokeStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 9;
    ctx.lineWidth = coreW * 1.9;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    // Solid core.
    ctx.globalAlpha = 0.85 * fade;
    ctx.shadowBlur = 5;
    ctx.lineWidth = coreW * (0.9 + pulse * 0.2);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    // Bright white centre with a flowing dash shimmer.
    ctx.globalAlpha = fade;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(1.4, coreW * 0.35);
    ctx.setLineDash([9, 7]);
    ctx.lineDashOffset = -(now / 12) % 16;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    // A small spark at the hands where the beam is loosed (not a body-covering orb).
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x0, y0, coreW * (0.5 + pulse * 0.25), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Floating text: gold, mana, level-ups and callouts from the engine plus the
 * VFX layer's crit damage numbers. Each pops in (a quick overshoot scale), then
 * drifts and fades; words set in the title face, numbers in the UI face, all
 * with a dark ink stroke so they read over any floor.
 */
function drawFloaters(ctx: CanvasRenderingContext2D, engine: GameEngine, vfx: Vfx): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const one = (text: string, x: number, y: number, color: string, size: number, life: number) => {
    // life: 1 at spawn → 0 at expiry.
    const age = 1 - life;
    const pop = age < 0.12 ? ease.outBack(age / 0.12) : 1;
    const numeric = /^[+-]?\d/.test(text);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.globalAlpha = Math.min(1, life * 2.2);
    ctx.font = numeric ? `800 ${size}px ${FONT_UI}` : `700 ${size}px ${FONT_TITLE}`;
    ctx.strokeStyle = 'rgba(10,6,14,0.85)';
    ctx.lineWidth = Math.max(2.5, size * 0.24);
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  for (const f of engine.floaters) one(f.text, f.pos.x, f.pos.y, f.color, f.size ?? 13, f.ttl / f.maxTtl);
  for (const f of vfx.texts) one(f.text, f.x, f.y, f.color, f.size, 1 - f.t / f.max);
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

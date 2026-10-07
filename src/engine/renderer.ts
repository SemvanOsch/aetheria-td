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

import { BOARD_HEIGHT, BOARD_WIDTH, TILE, type Vec2 } from '../domain/grid';
import { DEFAULT_PATH_LAYERS, type BoardTheme } from '../domain/decor';
import { atmosphereFor, type Atmosphere } from '../domain/atmosphere';
import { coneAngleDeg, getUnit } from '../domain/units';
import { getEnemy } from '../domain/enemies';
import {
  drawBladeTrails,
  drawClaymoreTrails,
  drawEnemySprite,
  drawFeather,
  drawUnitSprite,
  enemyWalkPeriod,
  greaterOrbAnchor,
  greaterOrbRadius,
  hasEnemySprite,
  hasSprite,
  longbowArrow,
  longbowCastGlow,
  MAGIC_CAST_POINT,
  magicOrbAnchor,
  magicOrbRadius,
} from './sprites';
import { BOSS_BOX, DEFAULT_BOX, paintFigure, type FigureStyle } from './figure';
import { bakeTerrain } from './terrain';
import { Lighting, flicker, type Light } from './lighting';
import { Vfx, type Corpse } from './vfx';
import { drawLegacyDecor, drawProp, propAnchor, PROP_META } from './props';
import { FEEDBACK, INK, LIGHT, ease, shade, tintRamp, withAlpha } from './palette';
import {
  THROW_ANIM_TIME,
  RISE_LIFT,
  DODGE_ANIM_TIME,
  DODGE_DIST,
  DEATH_ANIM_TIME,
  DEATH_FALL_TIME,
  DEATH_HOLD_TIME,
} from './GameEngine';
import {
  attackAnimTime,
  currentSpeechLine,
  EARTHSPLITTER_HIT_DELAY,
  GREATER_ORB_APEX,
  GREATER_ORB_CROUCH,
  GREATER_ORB_JUMP,
  GREATER_ORB_LAND,
  GREATER_ORB_THROW_TIME,
  isSpeaking,
  PIERCING_CAST_ANIM_TIME,
  specialAnimTime,
} from './types';
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
  /** Each Greater Orb caster's drawn leap height, and any drop out of it (see `settleLeap`). */
  leaps: WeakMap<Tower, LeapState>;
}

/**
 * Where a Greater Orb caster was last drawn in its leap (`lift`), and — once a
 * Mana Ray has cut the leap short — the height it is dropping from and when the
 * drop began (`dropAt` < 0 when not dropping).
 */
interface LeapState {
  lift: number;
  dropFrom: number;
  dropAt: number;
  landed: boolean;
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
    atmo: engine.level.atmosphere ?? atmosphereFor(engine.level.mood, engine.level.section),
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
    leaps: new WeakMap(),
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
  for (const tw of engine.towers) {
    if (tw.beamTimer <= 0) continue;
    const { reach, width } = beamPhase(tw);
    const o = beamOrigin(tw);
    const ex = tw.pos.x + Math.cos(tw.beamAngle) * tw.beamRange * reach;
    const ey = tw.pos.y + Math.sin(tw.beamAngle) * tw.beamRange * reach;
    st.vfx.beam(o.x, o.y, ex, ey, tw.def.visual.playerConfig?.outfitColor ?? tw.def.visual.color, dt * width, reach > 0.95);
  }
  for (const tw of engine.towers) {
    const q = quickdrawLevel(tw);
    if (q > 0) st.vfx.quickdraw(tw.pos.x, tw.pos.y, tw.def.visual.color, dt * q);
  }

  ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  const shake = st.vfx.shakeOffset();
  ctx.save();
  ctx.translate(shake.x, shake.y);

  // 1. Ground.
  drawGround(ctx, engine, st);
  st.vfx.drawDecals(ctx);
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
  drawSlamTelegraphs(ctx, engine);
  drawQuickdraws(ctx, engine);
  drawLongbowGlows(ctx, engine);
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
  drawFloaters(ctx, engine);
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
    // Quickdraw's charged bow casts a soft light in the archer's colour.
    const qd = quickdrawLevel(t);
    if (qd > 0) out.push({ x: t.pos.x, y: t.pos.y - 4, radius: 56, family: 'holy', intensity: 0.45 * qd, glow: 0.35, tint: t.def.visual.color });
    if (t.charge > 0 && t.chargeMax > 0 && t.def.visual.shape === 'player-longbow') {
      // A plain draw is no spell: just a faint warmth in the archer's colour
      // building toward the loose.
      const k = 1 - t.charge / t.chargeMax;
      out.push({ x: t.pos.x, y: t.pos.y - 6, radius: 24 + 14 * k, family: 'holy', intensity: 0.12 + 0.18 * k, glow: 0.1, tint: t.def.visual.color });
    } else if (t.charge > 0 && t.chargeMax > 0) {
      const c = 1 - t.charge / t.chargeMax;
      const fam = t.def.visual.shape === 'wizard' ? 'wind' : 'arcane';
      // The Magic adventurer's orb glows in its own colour; the Greater Orb's
      // swells overhead (glowing only once it kindles) and lights a wider pool.
      const tint = t.def.visual.shape === 'player-magic' ? t.def.visual.color : undefined;
      if (t.greaterOrb) {
        const k = greaterOrbRadius(c) / greaterOrbRadius(1);
        if (k > 0) out.push({ x: t.pos.x, y: t.pos.y - 32, radius: 40 + 90 * k, family: fam, intensity: 0.35 + 0.6 * k, tint });
      } else {
        out.push({ x: t.pos.x, y: t.pos.y - 6, radius: 30 + 60 * c, family: fam, intensity: 0.4 + 0.5 * c, tint });
      }
    }
    if (t.beamTimer > 0) {
      const ux = Math.cos(t.beamAngle);
      const uy = Math.sin(t.beamAngle);
      const { reach, width, surge } = beamPhase(t);
      const level = (0.6 + 0.25 * surge) * width;
      // Low additive glow: the beam clears the dark around it, but its own
      // layers carry the brightness (full glow bloomed it out to white).
      for (let d = 40; d < t.beamRange * reach; d += 60) {
        out.push({ x: t.pos.x + ux * d, y: t.pos.y + uy * d, radius: 80, family: 'arcane', intensity: level, glow: 0.25, tint: t.def.visual.color });
      }
      // A pool where the beam sears its far end.
      if (reach > 0.95) {
        out.push({ x: t.pos.x + ux * t.beamRange, y: t.pos.y + uy * t.beamRange, radius: 60, family: 'arcane', intensity: level, glow: 0.4, tint: t.def.visual.color });
      }
    }
  }
  for (const p of engine.projectiles) {
    if (p.style === 'orb') out.push({ x: p.pos.x, y: p.pos.y, radius: 80 * p.scale, family: 'arcane', intensity: 0.85, tint: p.color });
    else if (p.style === 'magic') out.push({ x: p.pos.x, y: p.pos.y, radius: 46, family: 'arcane', intensity: 0.6 });
    else if (p.style === 'wind') out.push({ x: p.pos.x, y: p.pos.y, radius: 34, family: 'wind', intensity: 0.45 });
    else if (p.style === 'pierce') out.push({ x: p.pos.x, y: p.pos.y, radius: 64, family: 'arcane', intensity: 0.75, tint: p.color });
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
  // Converging lanes share corridors: each lane only draws the stretches no
  // earlier lane has, so a shared route shows one trail, not one per lane.
  const drawn = new Set<string>();
  engine.lanes.forEach((lane, i) => {
    if (!engine.laneVisible(i)) return;
    for (const run of unsharedRuns(lane.waypoints, drawn)) drawLaneFlow(ctx, run.pts, now, run.offset);
  });
}

/**
 * Split a lane into the runs of tile-steps not yet in `drawn` (then add its
 * steps to it), each with its distance from the lane's spawn so the trail's
 * rhythm carries on where a branch splits off.
 */
function unsharedRuns(pts: Vec2[], drawn: Set<string>): { pts: Vec2[]; offset: number }[] {
  const key = (p: Vec2) => `${Math.round(p.x)},${Math.round(p.y)}`;
  const runs: { pts: Vec2[]; offset: number }[] = [];
  let cur: { pts: Vec2[]; offset: number } | null = null;
  let dist = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.round(len / TILE));
    for (let s = 0; s < steps; s++) {
      const p = { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps };
      const q = { x: a.x + ((b.x - a.x) * (s + 1)) / steps, y: a.y + ((b.y - a.y) * (s + 1)) / steps };
      const kp = key(p);
      const kq = key(q);
      const step = kp < kq ? `${kp}|${kq}` : `${kq}|${kp}`;
      if (drawn.has(step)) {
        cur = null;
      } else {
        drawn.add(step);
        if (!cur) runs.push((cur = { pts: [p], offset: dist }));
        cur.pts.push(q);
      }
      dist += len / steps;
    }
  }
  return runs;
}

/**
 * Animate one stretch of a lane's arrow trail (see `drawPathPreview`).
 * `offset` is how far along the lane the stretch starts, keeping its dashes and
 * chevrons in step with the rest of the route.
 */
function drawLaneFlow(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  now: number,
  offset = 0,
): void {
  if (pts.length < 2) return;

  const speed = 46; // px/sec the trail scrolls toward the base
  const t = (now / 1000) * speed - offset;

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
  for (let d = ((t % spacing) + spacing) % spacing; d < total; d += spacing) {
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
 * The Greater Orb caster's whole-body motion, along the phases in `types.ts`:
 * `lift` (board px off the floor) and a `squash` added to the figure's stretch
 * (negative = crouched). The charge is the leap — a crouch, the spring (the
 * crouch snapping into a stretch), then a hang at the apex with a slow bob that
 * turns to a strained tremble as the orb fills. The throw-down holds the apex
 * through the hurl, falls under gravity and lands in a squash that recovers.
 * Zero for every other champion, and while a Mana Ray channels.
 */
function greaterOrbBody(t: Tower, time: number): { lift: number; squash: number } {
  const none = { lift: 0, squash: 0 };
  if (!t.greaterOrb || t.beamTimer > 0) return none;
  if (t.specialAnim > 0) {
    const u = 1 - t.specialAnim / GREATER_ORB_THROW_TIME;
    if (u < 0.24) return { lift: GREATER_ORB_JUMP, squash: 0.03 * ease.hump(u / 0.24) };
    if (u < GREATER_ORB_LAND) {
      const k = (u - 0.24) / (GREATER_ORB_LAND - 0.24);
      return { lift: GREATER_ORB_JUMP * (1 - k * k), squash: 0.04 * k };
    }
    const k = (u - GREATER_ORB_LAND) / (1 - GREATER_ORB_LAND);
    return { lift: 0, squash: -0.12 * (1 - ease.outQuad(k)) };
  }
  if (t.charge > 0 && t.chargeMax > 0) {
    const c = 1 - t.charge / t.chargeMax;
    if (c < GREATER_ORB_CROUCH) return { lift: 0, squash: -0.11 * ease.inOutSine(c / GREATER_ORB_CROUCH) };
    if (c < GREATER_ORB_APEX) {
      const k = (c - GREATER_ORB_CROUCH) / (GREATER_ORB_APEX - GREATER_ORB_CROUCH);
      return {
        lift: GREATER_ORB_JUMP * ease.outCubic(k),
        squash: -0.11 * Math.max(0, 1 - k * 4) + 0.07 * ease.hump(k),
      };
    }
    const h = (c - GREATER_ORB_APEX) / (1 - GREATER_ORB_APEX);
    const strain = Math.max(0, (h - 0.7) / 0.3);
    const bob = Math.sin(time * 5) * 0.5 * (1 - strain) + Math.sin(time * 51) * 0.25 * strain;
    return { lift: GREATER_ORB_JUMP + bob, squash: 0 };
  }
  return none;
}

/** Seconds a Greater Orb caster takes to fall out of a leap a Mana Ray cut short (its landing squash takes as long again). */
const LEAP_DROP_TIME = 0.1;

/**
 * Smooth a Greater Orb caster out of a leap that a Mana Ray cuts short. The cast
 * drops the engine's charge at once, so `greaterOrbBody` goes straight to the
 * floor; instead the hero falls from the height it was last drawn at over
 * `LEAP_DROP_TIME` (accelerating, like the throw's fall), touches down with dust
 * and settles a quick squash. Otherwise passes `body` through, remembering its
 * height for next frame.
 */
function settleLeap(
  st: BoardState,
  t: Tower,
  body: { lift: number; squash: number },
  time: number,
): { lift: number; squash: number } {
  if (!t.greaterOrb) return body;
  let s = st.leaps.get(t);
  if (!s) {
    s = { lift: 0, dropFrom: 0, dropAt: -1, landed: false };
    st.leaps.set(t, s);
  }
  if (t.beamTimer > 0 && s.lift > 0.01 && s.dropAt < 0) {
    s.dropFrom = s.lift;
    s.dropAt = time;
    s.landed = false;
  }
  let out = body;
  if (s.dropAt >= 0) {
    const k = (time - s.dropAt) / LEAP_DROP_TIME;
    if (k < 1) {
      out = { lift: s.dropFrom * (1 - k * k), squash: 0.03 * k };
    } else if (k < 2) {
      if (!s.landed) {
        s.landed = true;
        st.vfx.consume([{ kind: 'cast', ability: 'land', x: t.pos.x, y: t.pos.y, color: t.def.visual.color, radius: 24 }]);
      }
      out = { lift: 0, squash: -0.09 * (2 - k) };
    } else {
      s.dropAt = -1;
    }
  }
  s.lift = out.lift;
  return out;
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
  const shape = t.def.visual.shape;
  const strike = Math.max(0, Math.min(1, t.attackAnim / attackAnimTime(shape)));
  if (strike > 0 && target) {
    // The Claymore's heavy swing carries the whole body a step further in; the
    // Longbow's heavy loose instead rocks the archer back a little.
    const push = ease.outCubic(strike) * (shape === 'player-claymore' ? 6.5 : shape === 'player-longbow' ? -1.6 : 5);
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
  // The Magic adventurer leans back as it draws its swelling orb in, and leans
  // into a channelled Mana Ray, trembling with the strain of holding it. The
  // Greater Orb caster instead leaps (see `greaterOrbBody`), easing back down if
  // a Mana Ray cuts the leap short (`settleLeap`).
  const leap = settleLeap(st, t, greaterOrbBody(t, time), time);
  squash += leap.squash;
  if (t.def.visual.shape === 'player-magic') {
    if (t.charge > 0 && t.chargeMax > 0 && target && !t.greaterOrb) {
      const k = ease.inOutSine(1 - t.charge / t.chargeMax);
      ox -= ux * 1.6 * k;
      oy -= uy * 0.8 * k;
      squash += 0.02 * k;
    }
    if (t.beamTimer > 0) {
      ox += Math.cos(t.beamAngle) * 1.4 + Math.sin(time * 47) * 0.35;
      oy += Math.sin(t.beamAngle) * 0.7;
    }
  }
  // The Claymore leans back and sinks as it hefts the great blade up.
  if (shape === 'player-claymore' && t.charge > 0 && t.chargeMax > 0 && target) {
    const k = ease.inOutSine(1 - t.charge / t.chargeMax);
    ox -= ux * 2.2 * k;
    oy -= uy * 1.1 * k;
    squash += 0.035 * k;
  }
  // The Longbow leans back into its slow draw, trembling with the strain as it
  // holds at full draw.
  if (shape === 'player-longbow' && t.charge > 0 && t.chargeMax > 0 && target) {
    const k = ease.inOutSine(1 - t.charge / t.chargeMax);
    const hold = Math.max(0, (k - 0.85) / 0.15);
    ox -= ux * 1.4 * k + Math.sin(time * 53) * 0.25 * hold;
    oy -= uy * 0.6 * k;
    squash += 0.02 * k;
  }
  // Signature moves (`u` 0 → 1 through the move), toward the aim point:
  //  - Cross Slash: settles back into the coil, then lunges through the X and
  //    holds the follow-through before stepping back.
  //  - Earthsplitter: stretches tall as the blade goes up, then drops its whole
  //    weight into the slam — a crouch and a short step in — and rises again.
  const sp = t.specialAnim > 0 ? 1 - t.specialAnim / specialAnimTime(shape) : -1;
  if (sp >= 0 && aimPt) {
    const d = Math.hypot(aimPt.x - x, aimPt.y - y) || 1;
    const ax = (aimPt.x - x) / d;
    const ay = (aimPt.y - y) / d;
    const recover = 1 - ease.inOutSine(Math.max(0, (sp - 0.62) / 0.38));
    if (shape === 'player-blade') {
      const coil = sp < 0.3 ? ease.inOutSine(Math.min(1, sp / 0.24)) : 0;
      const lunge = sp >= 0.3 ? ease.outCubic(Math.min(1, (sp - 0.3) / 0.12)) * recover : 0;
      const push = lunge * 7 - coil * 2.4;
      ox += ax * push;
      oy += ay * push;
      squash += coil * 0.045 - lunge * 0.05;
    } else if (shape === 'player-longbow') {
      // Piercing Shot: the archer straightens tall as the bow goes up to the sky.
      squash -= 0.05 * longbowCastGlow(t.specialAnim / PIERCING_CAST_ANIM_TIME);
    } else if (shape === 'player-magic') {
      // The Greater Orb's throw-down: a small forward drive as the orb is hurled
      // (its fall and landing ride on `greaterOrbBody`).
      const drive = ease.hump(Math.min(1, sp / 0.4)) * 1.6;
      ox += ax * drive;
      oy += ay * drive * 0.5;
    } else {
      // Phases match `claymoreSlamPose`: hoist to 0.18, held wind-up (leaning
      // back, rising onto the toes) to 0.46, the fall to 0.571, then recovery.
      const lift = sp < 0.46 ? ease.inOutSine(Math.min(1, sp / 0.4)) : sp < 0.571 ? 1 - (sp - 0.46) / 0.111 : 0;
      const drop = sp >= 0.571 ? (1 - ease.inOutSine(Math.min(1, (sp - 0.571) / 0.4))) : 0;
      const push = drop * 3.2 - lift * 2;
      ox += ax * push;
      oy += ay * push * 0.5;
      squash += drop * 0.09 - lift * 0.05;
    }
  }

  // Idle life: breathing (a gentle rise and settle about the feet) and a slow
  // weight shift. Damped while the champion is mid-attack.
  const phase = t.uid * 1.37;
  const idle = strike > 0 || t.charge > 0 || t.specialAnim > 0 ? 0.3 : 1;
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
  // The shadow stays on the floor and shrinks while the Greater Orb caster is airborne.
  const air = leap.lift / GREATER_ORB_JUMP;
  contactShadow(ctx, 10.5, 15 * (1 - 0.3 * air), 6 * (1 - 0.3 * air), 1 - 0.45 * air);
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

  // Off the ground for the Greater Orb's leap (the foot ring stays below).
  if (leap.lift) ctx.translate(0, -leap.lift);
  // Breathing + sway + squash about the feet.
  ctx.translate(sway, 11);
  ctx.scale(FIGURE_SCALE * (1 - 0.008 * breath - squash * 0.5), FIGURE_SCALE * (1 + 0.018 * breath + squash));
  ctx.translate(0, -11);

  if (t.rangeBuffed) drawGale(ctx, 'back', t.uid * 0.37);
  if (hasSprite(t.def.visual.shape)) {
    // `anim` eases with the attack (1 just after a strike → 0 at rest); each
    // sprite reads it its own way (bowstring snap, sword swing). A throw drives
    // it from the longer `throwAnim`, a signature move (Cross Slash /
    // Earthsplitter) from `specialAnim`; a charge ramps it 0→1 across the wind-up.
    const special = t.specialAnim > 0;
    const throwing = t.throwAnim > 0 || special;
    const charging = t.charge > 0 && t.chargeMax > 0;
    const rawAnim = special
      ? t.specialAnim / specialAnimTime(shape) // linear: its blow is timed to the cut window
      : shape === 'player-magic'
        ? t.beamTimer > 0
          ? 1 // hands held thrust out through a Mana Ray channel
          : strike // throw → recover (its charge rides on `draw`)
        : shape === 'player-claymore' || shape === 'player-longbow'
          ? strike // linear release; the heft wind-up / slow draw rides on `draw`
          : charging
            ? ease.inOutSine(1 - t.charge / t.chargeMax)
            : throwing
              ? t.throwAnim / THROW_ANIM_TIME
              : shape === 'player-blade' || shape === 'player-bow'
                ? strike // linear: the Blade's cuts land with its two hits; the Bow's phases are timed
                : ease.outQuad(strike);
    // Quantized so attack poses reuse cached frames (12 steps is smooth at 0.18s;
    // the longer signature moves and the Claymore's fast cut need 24).
    const animSteps = special || shape === 'player-claymore' || shape === 'player-longbow' ? 24 : 12;
    const anim = Math.round(rawAnim * animSteps) / animSteps;
    // The sprite's second input: the Bow's raise + draw, the Magic orb charge,
    // the Claymore's heft or the Longbow's slow draw.
    const rawDraw =
      shape === 'player-magic' || shape === 'player-claymore' || shape === 'player-longbow'
        ? charging
          ? 1 - t.charge / t.chargeMax
          : 0
        : bowDraw(t, !!target);
    // Finer steps for the slow orb charge (so the cupping hands track the orb)
    // and the heft; finer still for the Greater Orb's leap, whose arms sweep
    // overhead in a short slice of a long charge.
    const drawSteps = t.greaterOrb
      ? 48
      : shape === 'player-magic' || shape === 'player-claymore' || shape === 'player-longbow'
        ? 24
        : 12;
    const draw = Math.round(rawDraw * drawSteps) / drawSteps;
    // The "empowered" flourish marks a champion whose signature upgrade is
    // bought — wind motes for the Wizard (Wind Slice → cone), arcane sparkles
    // off the Elf's bow once Chain Enchantment lifts her bounce count, and the
    // Magic adventurer's leaping overhead cast once the Greater Orb is active.
    const empowered =
      t.aoe === 'cone' ||
      (t.def.visual.shape === 'elf' && t.bounces > (t.def.bounces ?? 0)) ||
      (shape === 'player-magic' && t.greaterOrb);
    const style = boardStyle(st, t.def.visual.playerConfig?.outfitColor ?? t.def.visual.color);
    // The player's adventurer often shows bare, dark hair, which the full rim and
    // head lift wash to grey; give it the journal portrait's softer light.
    if (t.def.visual.playerConfig) {
      style.rimAlpha = (style.rimAlpha ?? 0.55) * 0.25;
      style.shading = 0.5;
    }
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
        drawUnitSprite(g, t.def.visual.shape, t.def.visual.color, faceLeft, anim, throwing, empowered, t.def.visual.playerConfig, draw),
      style,
      live
        ? undefined
        : `u|${t.def.visual.shape}|${t.def.visual.color}|${faceLeft ? 1 : 0}|${anim}|${throwing ? 1 : 0}|${empowered ? 1 : 0}|${draw}|${cfgKey(t.def.visual.playerConfig)}`,
    );
    // The Blade adventurer's slash streaks and the Claymore's smear, outside the
    // compositor so they stay clean light (from the unquantized anim, so they
    // sweep smoothly).
    if (shape === 'player-blade') drawBladeTrails(ctx, faceLeft, rawAnim, special);
    else if (shape === 'player-claymore') drawClaymoreTrails(ctx, faceLeft, rawAnim, special);
    // The Magic adventurer visibly gathers its orb during the wind-up.
    if (t.aoe === 'circle' && charging) {
      // Held where the sprite's hands cup it (same charge step as the sprite).
      const grow = draw;
      const accent = t.def.visual.playerConfig?.outfitColor ?? t.def.visual.color;
      if (t.greaterOrb) {
        // The Greater Orb swells above the head on the raised palms, drawing
        // motes in from the air around it.
        const radius = greaterOrbRadius(grow);
        if (radius > 0) {
          const o = greaterOrbAnchor(grow);
          const cx = (faceLeft ? -1 : 1) * o.x;
          const k = radius / greaterOrbRadius(1);
          drawOrbGather(ctx, cx, o.y, radius, accent, time, k);
          drawChargingOrb(ctx, cx, o.y, radius, accent, k);
        }
      } else {
        const o = magicOrbAnchor(grow);
        drawChargingOrb(ctx, (faceLeft ? -1 : 1) * o.x, o.y, magicOrbRadius(grow), accent, grow);
      }
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
    // mastery-widened `burstRadius`) plus a small cross marking the impact centre.
    const radius = t.burstRadius;
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
      style.tint = c.tint ? shade(c.tint, 0.3) : '#b48cf0';
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
    // A piercing arrow flies straight on rather than homing.
    const ang = p.pierce ? Math.atan2(p.pierce.dir.y, p.pierce.dir.x) : Math.atan2(dest.y - p.pos.y, dest.x - p.pos.x);
    // Fading magical tail: draw the arrow's recent positions (world space, before
    // the local rotate/scale) as motes that shrink and dim into the distance.
    if (p.trail && p.trail.length) drawMagicTrail(ctx, p.trail, p.color);
    if (p.style === 'orb') vfx.trail('orb', p.pos.x, p.pos.y, p.color, dt);
    else if (p.style === 'magic') vfx.trail('arcane', p.pos.x, p.pos.y, p.color, dt);
    else if (p.style === 'wind') vfx.trail('wind', p.pos.x, p.pos.y, p.color, dt);
    else if (p.style === 'pierce') vfx.trail('arcane', p.pos.x, p.pos.y, p.color, dt);
    else if (quickdrawLevel(p.source) > 0) vfx.trail('arcane', p.pos.x, p.pos.y, p.color, dt);
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
    } else if (p.style === 'pierce') {
      drawPiercingArrow(ctx, p.color);
    } else {
      // An arrow loosed under Quickdraw streaks in as a bolt of the archer's colour.
      const q = quickdrawLevel(p.source);
      if (q > 0) drawQuickdrawStreak(ctx, p.color, q);
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
 * Motes spiralling in toward the swelling Greater Orb at (cx, cy) — the air
 * being drawn into the spell. Each mote fades in far out, brightens as it
 * closes, and vanishes into the orb's rim; `k` (0..1, the orb's growth) thickens
 * the stream.
 */
function drawOrbGather(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  time: number,
  k: number,
): void {
  ctx.save();
  ctx.fillStyle = shade(color, 0.45);
  for (let i = 0; i < 7; i++) {
    const p = (time * 1.4 + i / 7) % 1; // 0 far out → 1 arriving
    const a = i * 2.39 + time * 2.4 + p * 1.6;
    const d = radius + 1.5 + (1 - p) * 10;
    ctx.globalAlpha = Math.min(1, p * 3) * (1 - p) * 1.8 * (0.35 + 0.65 * k);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, 0.6 + 0.5 * p, 0, Math.PI * 2);
    ctx.fill();
  }
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

/** Seconds before a volley over which the Bow adventurer raises and draws. */
const BOW_DRAW_TIME = 0.32;

/**
 * The Bow adventurer's raise + draw for its next shot (the sprite's `draw`, see
 * `drawPlayerShortbow`): held at full draw through a volley, drawn up over the
 * last `BOW_DRAW_TIME` of the reload when it has a target, relaxed otherwise.
 * 0 for every other champion.
 */
function bowDraw(t: Tower, hasTarget: boolean): number {
  if (t.def.visual.shape !== 'player-bow') return 0;
  if (t.burstLeft > 0) return 1;
  if (!hasTarget) return 0;
  return ease.inOutSine(Math.max(0, Math.min(1, 1 - t.cooldown / BOW_DRAW_TIME)));
}

/**
 * How strongly the Bow adventurer's Quickdraw is showing (0 when inactive): eases
 * in over its first 0.2s and out over its last 0.4s.
 */
function quickdrawLevel(t: Tower): number {
  if (t.abilitySpeedBuffTimer <= 0 || t.def.visual.shape !== 'player-bow') return 0;
  const duration = t.ability?.duration ?? t.abilitySpeedBuffTimer;
  return Math.min(1, t.abilitySpeedBuffTimer / 0.4, (duration - t.abilitySpeedBuffTimer) / 0.2 + 0.2);
}

/**
 * Quickdraw (the Bow adventurer's haste), drawn additively in the glow pass in
 * the archer's colour: a charged glow around the bow, and wind-swept speed
 * streaks peeling back off the figure away from where it faces. The foot ring
 * flares too (`drawTower`), rising motes come from `Vfx.quickdraw` and arrows
 * loosed meanwhile streak in as bolts (`drawQuickdrawStreak`).
 */
function drawQuickdraws(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const time = now() / 1000;
  for (const t of engine.towers) {
    const q = quickdrawLevel(t);
    if (q <= 0) continue;
    const color = t.def.visual.color;
    const aim = t.aimTarget;
    const dir = aim && aim.x < t.pos.x ? -1 : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Charged bow: a pulsing glow where the bow is held up (local ~(9, -4)).
    const pulse = 0.8 + 0.2 * Math.sin(time * 14 + t.uid);
    const bx = t.pos.x + dir * 9 * FIGURE_SCALE;
    const by = t.pos.y + 11 + (-4 - 11) * FIGURE_SCALE;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, 13);
    g.addColorStop(0, withAlpha('#ffffff', 0.55 * q * pulse));
    g.addColorStop(0.35, withAlpha(color, 0.45 * q * pulse));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, 13, 0, Math.PI * 2);
    ctx.fill();
    // Speed streaks: short lines sliding back off the figure and fading.
    ctx.lineCap = 'round';
    ctx.strokeStyle = shade(color, 0.45);
    for (let i = 0; i < 5; i++) {
      const u = (time * 2.6 + i * 0.37 + t.uid * 0.13) % 1;
      const y = t.pos.y - 14 + ((i * 7.3) % 22);
      const x0 = t.pos.x - dir * (4 + u * 16);
      const len = 7 + 5 * Math.sin(i * 1.7) ** 2;
      ctx.globalAlpha = q * 0.7 * Math.sin(Math.PI * u);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 - dir * len, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * The bolt-of-light tail of an arrow loosed under Quickdraw, drawn in the arrow's
 * local frame (+x forward) under the shaft: a long tapered streak in the archer's
 * colour with a white core.
 */
function drawQuickdrawStreak(ctx: CanvasRenderingContext2D, color: string, q: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(-34, 0, 6, 0);
  g.addColorStop(0, withAlpha(color, 0));
  g.addColorStop(1, withAlpha(color, 0.75 * q));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-34, 0);
  ctx.lineTo(4, -2.4);
  ctx.lineTo(8, 0);
  ctx.lineTo(4, 2.4);
  ctx.closePath();
  ctx.fill();
  const c = ctx.createLinearGradient(-20, 0, 6, 0);
  c.addColorStop(0, 'rgba(255,255,255,0)');
  c.addColorStop(1, withAlpha('#ffffff', 0.8 * q));
  ctx.strokeStyle = c;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.lineTo(6, 0);
  ctx.stroke();
  ctx.restore();
}

/**
 * The Longbow's piercing arrow in flight, in its local frame (+x forward): a
 * long blazing streak and a halo in the archer's colour, then the big arrow
 * itself with a white-hot point — it reads as light, never darkened.
 */
function drawPiercingArrow(ctx: CanvasRenderingContext2D, color: string): void {
  const ramp = tintRamp(color);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Wide soft halo along the shaft.
  const halo = ctx.createLinearGradient(-40, 0, 10, 0);
  halo.addColorStop(0, withAlpha(color, 0));
  halo.addColorStop(1, withAlpha(color, 0.5));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.moveTo(-40, 0);
  ctx.lineTo(2, -4.5);
  ctx.quadraticCurveTo(12, 0, 2, 4.5);
  ctx.closePath();
  ctx.fill();
  // Bright streak with a white core.
  const streak = ctx.createLinearGradient(-30, 0, 8, 0);
  streak.addColorStop(0, withAlpha(ramp[1], 0));
  streak.addColorStop(1, withAlpha(ramp[1], 0.9));
  ctx.strokeStyle = streak;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.lineTo(6, 0);
  ctx.stroke();
  const core = ctx.createLinearGradient(-16, 0, 8, 0);
  core.addColorStop(0, 'rgba(255,255,255,0)');
  core.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.strokeStyle = core;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.lineTo(7, 0);
  ctx.stroke();
  ctx.restore();
  // The arrow: shaft, fletching in the archer's colour, a glowing bodkin point.
  ctx.strokeStyle = '#8a6036';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(4, 0);
  ctx.stroke();
  ctx.strokeStyle = shade(color, 0.3);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(-8.5, -2.2);
  ctx.moveTo(-5, 0);
  ctx.lineTo(-8.5, 2.2);
  ctx.stroke();
  ctx.fillStyle = shade(color, 0.6);
  ctx.beginPath();
  ctx.moveTo(3.6, -2);
  ctx.lineTo(9.5, 0);
  ctx.lineTo(3.6, 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(8, 0, 1.1, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The Longbow's Piercing Shot, drawn additively in the glow pass in the archer's
 * colour:
 *  - the cast: as the bow is raised to the sky its arrow kindles — a glow along
 *    the shaft and a flaring, turning star at the point (the ring, sparks and
 *    light pulse come from `Vfx`'s `piercingShot` cast);
 *  - while piercing arrows remain nocked: the arrow on the string keeps a soft,
 *    pulsing glow, and a small glowing pip per arrow floats above the archer.
 */
function drawLongbowGlows(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const time = now() / 1000;
  for (const t of engine.towers) {
    if (t.def.visual.shape !== 'player-longbow') continue;
    const castAnim = t.specialAnim > 0 ? t.specialAnim / PIERCING_CAST_ANIM_TIME : 0;
    const cast = longbowCastGlow(castAnim);
    if (cast <= 0 && t.pierceShots <= 0) continue;
    const color = t.def.visual.color;
    const ramp = tintRamp(color);
    const aim = t.aimTarget;
    const dir = aim && aim.x < t.pos.x ? -1 : 1;
    // Local sprite point → board, through the figure's scale about its feet.
    const toBoard = (lx: number, ly: number) => ({
      x: t.pos.x + dir * lx * FIGURE_SCALE,
      y: t.pos.y + 11 + (ly - 11) * FIGURE_SCALE,
    });
    const release = castAnim > 0 ? 0 : t.attackAnim / attackAnimTime('player-longbow');
    const draw = t.charge > 0 && t.chargeMax > 0 ? 1 - t.charge / t.chargeMax : 0;
    const arrow = longbowArrow(release, draw, castAnim);
    const pulse = 0.75 + 0.25 * Math.sin(time * 9 + t.uid);
    const level = Math.max(cast, t.pierceShots > 0 ? 0.55 * pulse : 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    if (arrow && level > 0) {
      const head = toBoard(arrow.x, arrow.y);
      const ang = dir > 0 ? arrow.angle : Math.PI - arrow.angle;
      const len = arrow.length * FIGURE_SCALE;
      const tail = { x: head.x - Math.cos(ang) * len, y: head.y - Math.sin(ang) * len };
      // A glow running the length of the shaft…
      const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      g.addColorStop(0, withAlpha(color, 0));
      g.addColorStop(1, withAlpha(ramp[1], 0.7 * level));
      ctx.strokeStyle = g;
      ctx.lineWidth = 3 + 2 * cast;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
      // …and a burning point.
      const r = 6 + 10 * cast;
      const pt = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, r);
      pt.addColorStop(0, withAlpha('#ffffff', 0.8 * level));
      pt.addColorStop(0.35, withAlpha(color, 0.55 * level));
      pt.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = pt;
      ctx.beginPath();
      ctx.arc(head.x, head.y, r, 0, Math.PI * 2);
      ctx.fill();
      // The cast flares a turning four-point star at the point.
      if (cast > 0) {
        const spin = time * 3 + t.uid;
        ctx.strokeStyle = withAlpha('#ffffff', 0.85 * cast);
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) {
          const a = spin + (i * Math.PI) / 2;
          const reach = (i % 2 ? 8 : 13) * cast;
          ctx.beginPath();
          ctx.moveTo(head.x, head.y);
          ctx.lineTo(head.x + Math.cos(a) * reach, head.y + Math.sin(a) * reach);
          ctx.stroke();
        }
      }
    }
    // One pip per piercing arrow still nocked, floating above the archer.
    if (t.pierceShots > 0) {
      const top = toBoard(0, -22);
      for (let i = 0; i < t.pierceShots; i++) {
        const px = top.x + (i - (t.pierceShots - 1) / 2) * 6;
        const py = top.y + Math.sin(time * 4 + i * 1.3) * 0.8;
        ctx.fillStyle = withAlpha(color, 0.45 * pulse);
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = withAlpha(ramp[1], 0.95);
        ctx.beginPath();
        ctx.moveTo(px, py - 2.6);
        ctx.lineTo(px + 1.6, py);
        ctx.lineTo(px, py + 2.6);
        ctx.lineTo(px - 1.6, py);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/** Seconds the Mana Ray takes to lance out to full reach when cast. */
const BEAM_IGNITE = 0.16;
/** Seconds over which it collapses to a thread at the end of the channel. */
const BEAM_COLLAPSE = 0.3;

/**
 * Lifecycle of a channelling Mana Ray, shared by the beam drawing, its light and
 * its particle emitter: `reach` 0→1 as it lances out on cast, `width` 1→0 as it
 * collapses at the end, and `surge` 1→0 just after each damage tick (the beam
 * swells as it sears).
 */
function beamPhase(t: Tower): { reach: number; width: number; surge: number; age: number } {
  const duration = t.ability?.duration ?? t.beamTimer;
  const age = Math.max(0, duration - t.beamTimer);
  const reach = ease.outCubic(Math.min(1, age / BEAM_IGNITE));
  const width = ease.outQuad(Math.min(1, t.beamTimer / BEAM_COLLAPSE));
  const interval = t.ability?.tickInterval ?? 0.5;
  const sinceTick = interval - t.beamTickTimer;
  const surge = sinceTick >= 0 && sinceTick < 0.18 ? 1 - sinceTick / 0.18 : 0;
  return { reach, width, surge, age };
}

/**
 * Where a Mana Ray leaves the caster's thrust-out palms (`MAGIC_CAST_POINT`,
 * mapped through the figure's board scale and its lean into the beam — see
 * `drawTower`), on the side it faces.
 */
function beamOrigin(t: Tower): Vec2 {
  const ux = Math.cos(t.beamAngle);
  const uy = Math.sin(t.beamAngle);
  const dir = ux < 0 ? -1 : 1;
  return {
    x: t.pos.x + ux * 1.4 + dir * MAGIC_CAST_POINT.x * FIGURE_SCALE,
    y: t.pos.y + uy * 0.7 + 11 + (MAGIC_CAST_POINT.y - 11) * FIGURE_SCALE,
  };
}

/**
 * Mana Ray beams (the Mage adventurer's channelled ability), drawn in the glow
 * pass, entirely in the champion's colour (only the outer haze is
 * additive, so the beam keeps its violet on bright floors):
 *  - a rotating sigil disc at the hands, seen edge-on like a portal the beam
 *    is fired through, blooming open on cast and folding shut at the end;
 *  - a tapered beam body (haze → colour → white-hot core) that lances out on
 *    cast, ripples, swells on every damage tick and collapses to a thread;
 *  - two helix strands winding around it and bright packets racing outward;
 *  - a flickering, crackling flare where it ends.
 * Particles shed along its length come from `Vfx.beam` (see `drawBoard`).
 */
/**
 * The Earthsplitter's telegraph (glow pass, additive): while the slam is wound
 * up (`Tower.slam` pending), the crack's coming path smoulders on the floor — a
 * faint molten band out along the locked aim that creeps out from the hero's
 * feet and brightens as the blade is about to fall.
 */
function drawSlamTelegraphs(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  for (const t of engine.towers) {
    const s = t.slam;
    if (!s) continue;
    const k = Math.max(0, Math.min(1, 1 - s.timer / EARTHSPLITTER_HIT_DELAY));
    const show = ease.inOutSine(Math.min(1, k / 0.6));
    if (show <= 0.01) continue;
    const len = (s.reach - 12) * ease.outCubic(Math.min(1, k * 1.25));
    if (len < 1) continue;
    const flicker = 0.85 + 0.15 * Math.sin(s.timer * 47 + t.uid);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(t.pos.x + Math.cos(s.angle) * 12, t.pos.y + Math.sin(s.angle) * 12 + 8);
    ctx.rotate(s.angle);
    const hw = s.halfWidth * (0.55 + 0.25 * k);
    const band = ctx.createLinearGradient(0, -hw, 0, hw);
    band.addColorStop(0, 'rgba(255,120,40,0)');
    band.addColorStop(0.5, `rgba(255,130,45,${0.2 * show * flicker})`);
    band.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.moveTo(0, -hw * 0.5);
    ctx.lineTo(len, -hw);
    ctx.lineTo(len, hw);
    ctx.lineTo(0, hw * 0.5);
    ctx.closePath();
    ctx.fill();
    // A thin hot seam down the middle, fading out toward its far end.
    const seam = ctx.createLinearGradient(0, 0, len, 0);
    seam.addColorStop(0, `rgba(255,214,140,${0.55 * show * flicker})`);
    seam.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.strokeStyle = seam;
    ctx.lineWidth = 1 + k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.restore();
  }
}

function drawBeams(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  for (const t of engine.towers) {
    if (t.beamTimer <= 0) continue;
    const accent = t.def.visual.playerConfig?.outfitColor ?? t.def.visual.color;
    const ramp = tintRamp(accent);
    const { reach, width, surge, age } = beamPhase(t);
    const o = beamOrigin(t);
    const ex = t.pos.x + Math.cos(t.beamAngle) * t.beamRange;
    const ey = t.pos.y + Math.sin(t.beamAngle) * t.beamRange;
    const ang = Math.atan2(ey - o.y, ex - o.x);
    const len = Math.hypot(ex - o.x, ey - o.y) * reach;
    if (len < 1) continue;
    // Half-width of the beam body: slim (the hit corridor stays BEAM_HALF_WIDTH
    // wide), breathing, swelling on each sear, thinning to a thread as it ends.
    const breathe = 1 + 0.08 * Math.sin(now * 23) + 0.05 * Math.sin(now * 37 + 1);
    const hw = 4.2 * breathe * (1 + 0.45 * surge) * (0.15 + 0.85 * width);
    const alpha = Math.min(1, width * 1.6);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(o.x, o.y);
    ctx.rotate(ang);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // A tapered ribbon along +x: pinched at the hands, full through the body,
    // narrowing slightly toward the far end, with a gentle travelling ripple.
    const steps = Math.max(6, Math.ceil(len / 14));
    const ribbon = (half: number, ripple: number) => {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = (len * i) / steps;
        const u = x / len;
        const taper = Math.min(1, u * 9 + 0.25) * (1 - 0.25 * u);
        const w = half * taper * (1 + ripple * Math.sin(x * 0.11 - now * 26));
        if (i === 0) ctx.moveTo(x, -w);
        else ctx.lineTo(x, -w);
      }
      for (let i = steps; i >= 0; i--) {
        const x = (len * i) / steps;
        const u = x / len;
        const taper = Math.min(1, u * 9 + 0.25) * (1 - 0.25 * u);
        const w = half * taper * (1 + ripple * Math.sin(x * 0.11 - now * 26 + 1.7));
        ctx.lineTo(x, w);
      }
      ctx.closePath();
    };
    const across = (half: number, stops: [number, string][]) => {
      const g = ctx.createLinearGradient(0, -half, 0, half);
      for (const [at, c] of stops) g.addColorStop(at, c);
      return g;
    };

    // 1. Wide soft haze — the only additive layer, so the beam lights dark
    // rooms without washing out to white on a bright floor.
    ctx.globalAlpha = alpha;
    const haze = hw * 3.4;
    ctx.fillStyle = across(haze, [
      [0, withAlpha(accent, 0)],
      [0.5, withAlpha(accent, 0.22 + 0.15 * surge)],
      [1, withAlpha(accent, 0)],
    ]);
    ribbon(haze, 0.12);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // 2. Coloured body: deep violet edges into a pale lilac centre.
    const body = hw * 1.7;
    ctx.fillStyle = across(body, [
      [0, withAlpha(ramp[3], 0)],
      [0.18, withAlpha(ramp[3], 0.55)],
      [0.36, withAlpha(ramp[2], 0.9)],
      [0.5, withAlpha(ramp[1], 1)],
      [0.64, withAlpha(ramp[2], 0.9)],
      [0.82, withAlpha(ramp[3], 0.55)],
      [1, withAlpha(ramp[3], 0)],
    ]);
    ribbon(body, 0.08);
    ctx.fill();
    // 3. White-hot core.
    ctx.fillStyle = across(hw * 0.6, [
      [0, 'rgba(255,255,255,0)'],
      [0.5, 'rgba(255,255,255,1)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ribbon(hw * 0.6, 0.04);
    ctx.fill();

    // 4. Helix strands winding around the beam, scrolling outward.
    ctx.lineWidth = 1.3;
    ctx.globalAlpha = alpha * 0.85;
    for (let s = 0; s < 2; s++) {
      ctx.strokeStyle = s === 0 ? ramp[1] : accent;
      ctx.beginPath();
      for (let x = 0; x <= len; x += 4) {
        const u = x / len;
        const amp = hw * 1.9 * Math.min(1, u * 6) * (1 - 0.3 * u);
        const y = Math.sin(x * 0.085 - now * 14 + s * Math.PI) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 5. Energy packets racing from the hands to the end.
    ctx.globalAlpha = 1;
    const packets = Math.max(2, Math.round(len / 55));
    for (let i = 0; i < packets; i++) {
      const u = (now * 2.4 + i / packets) % 1;
      const px = u * len;
      // Born just past the hands, swallowed by the terminus flare.
      ctx.globalAlpha = Math.min(1, u * 5) * Math.min(1, (1 - u) * 6);
      const r = hw * (1.5 + 0.6 * Math.sin(i * 2.3));
      const g = ctx.createRadialGradient(px, 0, 0, px, 0, r * 2.2);
      g.addColorStop(0, withAlpha('#ffffff', 0.9 * alpha));
      g.addColorStop(0.35, withAlpha(ramp[1], 0.55 * alpha));
      g.addColorStop(1, withAlpha(accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, 0, r * 2.2, r * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Terminus flare: a flickering bloom with short crackling arcs.
    if (reach > 0.95) {
      const fl = 0.75 + 0.25 * Math.sin(now * 41) * Math.sin(now * 17 + 2);
      const fr = hw * (3.2 + 1.6 * surge) * fl;
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(len, 0, 0, len, 0, fr * 2);
      g.addColorStop(0, withAlpha('#ffffff', 0.95 * alpha));
      g.addColorStop(0.3, withAlpha(ramp[1], 0.6 * alpha));
      g.addColorStop(1, withAlpha(accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(len, 0, fr * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ramp[1];
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha * 0.8;
      const seed = Math.floor(now * 20);
      for (let k = 0; k < 3; k++) {
        const a0 = (((seed * 7 + k * 13) % 17) / 17) * Math.PI * 2;
        let x = len;
        let y = 0;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let j = 1; j <= 3; j++) {
          const a = a0 + Math.sin(seed + j * 3.1 + k) * 0.9;
          x += Math.cos(a) * fr * 0.55;
          y += Math.sin(a) * fr * 0.55;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // 7. Sigil disc at the hands — a rune ring with orbiting ticks and a
    // counter-rotating hexagram, seen edge-on (squashed along the beam) so the
    // ray reads as fired through a portal.
    const open = ease.outBack(Math.min(1, age / 0.22)) * width;
    if (open > 0.01) {
      const sq = 0.38;
      ctx.save();
      ctx.scale(sq, 1);
      const R = 13 * open * (1 + 0.12 * surge);
      ctx.globalAlpha = alpha;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.5);
      g.addColorStop(0, withAlpha(ramp[1], 0.45));
      g.addColorStop(0.4, withAlpha(ramp[2], 0.35));
      g.addColorStop(1, withAlpha(accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = ramp[1];
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = accent;
      for (let i = 0; i < 8; i++) {
        const a = now * 2.2 + (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 1.08, Math.sin(a) * R * 1.08);
        ctx.lineTo(Math.cos(a) * R * 1.3, Math.sin(a) * R * 1.3);
        ctx.stroke();
      }
      ctx.strokeStyle = ramp[1];
      for (let tri = 0; tri < 2; tri++) {
        const base = -now * 3 + tri * Math.PI;
        ctx.beginPath();
        for (let v = 0; v <= 3; v++) {
          const a = base + (v / 3) * Math.PI * 2;
          if (v === 0) ctx.moveTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7);
          else ctx.lineTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

/**
 * Floating text: gold, mana, level-ups and callouts (CRIT!) from the engine.
 * Each pops in (a quick overshoot scale), then
 * drifts and fades; words set in the title face, numbers in the UI face, all
 * with a dark ink stroke so they read over any floor.
 */
function drawFloaters(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
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

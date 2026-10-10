/**
 * The Sewers' ending, on the board (The Sewers, `ending: 'sludgeFather'`).
 *
 * Captain Draven can't be felled; the stage is won the moment he reaches the
 * cistern (`LevelDef.bossHaltAt`), and this takes it from there. He pulls up at
 * the water's edge, banner high, as the cistern starts to bubble and a rumble
 * builds; the foes still on the board break and run, away from the pool (the
 * sludge ones sinking back into it). He turns to face the water. A vast hand of
 * sludge bursts out of it, rears over him, and slams down, crushing him where
 * he stands; the royal banner is left lying in the muck. Leaning on that hand,
 * the Sludge Father hauls the rest of itself up out of the cistern, a second
 * hand slapping down on the floor, its hump rising behind until it fills the
 * back of the sewer, and roars. The champions take their chance: they bound
 * along the channel to the far tunnel and vanish into it one by one, and when
 * the last is gone the thing is left alone in the sewer, breathing.
 *
 * A director over a finished engine: it never steps the simulation. Draven is
 * taken off the board (`BoardScene.hiddenEnemies`) and drawn here, as are the
 * champions (`hideTowers`) and the Sludge Father, all as depth-sorted actors lit
 * with the rest of the world; the fleeing foes are walked along their lanes
 * directly. It also directs a `camera` (push in on the cistern, pull back to
 * reveal it) for the UI to apply. Audio is left to the UI, which drains `cues`.
 * `settle()` jumps to the aftermath, which the battle screen keeps showing
 * under the result card.
 */

import { EMERGE_BACK, type GameEngine } from '../GameEngine';
import type { Enemy, Tower } from '../types';
import { cellCenter, type Vec2 } from '../../domain/grid';
import { isPlayerChampionId } from '../../domain/playerChampion';
import { propAnchor } from '../props';
import { paintFigure, type FigureBox } from '../figure';
import {
  drawEnemySprite,
  drawSludgeArm,
  drawSludgeFatherBody,
  sludgeFatherHead,
  sludgeFatherShoulder,
  type SludgeArmPose,
  type SludgeFatherPose,
} from '../sprites';
import { contactShadow, drawRoyalAura, foeFigureStyle, footLiftFor, stageFigureStyle, type BoardScene, type SceneActor } from '../renderer';
import { ease } from '../palette';
import type { Light } from '../lighting';
import { alongRoute, drawRunner, routeAlongRoad, routeLengths, type RunnerPose } from './runners';

/** Sound/beat cues for the UI to voice. */
export type SludgeFatherCue = 'bubbles' | 'rumble' | 'eruption' | 'crush' | 'heave' | 'thud' | 'roar' | 'hop' | 'growl';

// The timeline (seconds from the start of the cutscene; the first ~1.3s is the
// UI's zoom from the battle board, so only Draven's halt and the first bubbles
// play under it).
const HALT_TIME = 0.45;
const BUBBLE_AT = 0.4;
const RUMBLE_AT = 1.4;
const FLEE_AT = 1.5;
/** The longest any fleeing foe takes to get off the board (s). */
const FLEE_TIME = 4.5;
const TURN_AT = 1.9;
const BURST_AT = 2.8;
const APEX_AT = 3.45;
const SLAM_AT = 4.05;
const IMPACT_AT = 4.3;
const PULL_AT = 5.2;
/** The left hand, relative to PULL_AT: out of the water, up, and slapped down. */
const LEFT_OUT = 0.1;
const LEFT_UP = 0.55;
const LEFT_DOWN = 0.82;
const RISEN_AT = 7.6;
const ROAR_AT = 7.8;
const ROAR_TIME = 1.7;
/** The champions bolt for the tunnel a beat into the roar. */
const RUN_AT = 8.5;
/** Target length of the dash (the farthest champion's run is fitted to it). */
const DASH = 3.2;
const RUN_SPEED_MIN = 130;
const RUN_SPEED_MAX = 330;
/** Bounds per second (a faster runner takes longer strides, not quicker ones). */
const HOP_RATE = 6;
/** Least gap between two champions disappearing into the tunnel. */
const EXIT_GAP = 0.16;
/** How far into the tunnel a champion runs past the channel's end, fading. */
const INTO_TUNNEL = 36;
/** The thing alone in the sewer before the scene closes. */
const HOLD = 1.5;
/**
 * The chase camera: how close it follows the runners, and when it starts
 * closing in (a beat after they set off, so the risen Sludge Father gets a
 * good look first).
 */
const CHASE_ZOOM = 1.25;
const CHASE_AT = RUN_AT + 1;
/** How much of the frame's aim is on the player's hero (the rest on the party's middle). */
const CHASE_HERO_WEIGHT = 0.7;

/** When the name card comes up over the roar, and for how long (s). */
export const NAMECARD_AT = ROAR_AT + 0.25;
export const NAMECARD_TIME = 3.4;

/** The Sludge Father's look: overall sludge colour (outline ink). */
const FATHER_ACCENT = '#435a22';
/** Compositor box for the body, in its local space (origin at the water's centre). */
const BODY_BOX: FigureBox = { x: -200, y: -150, w: 400, h: 250 };
/** Where the right hand rears to above the pool, relative to the water's centre. */
const APEX: Vec2 = { x: 34, y: -58 };
/** The arms' roots in the water before the body comes up behind them. */
const RIGHT_ROOT: Vec2 = { x: 26, y: 6 };
const LEFT_ROOT: Vec2 = { x: -28, y: 6 };
const LEFT_APEX: Vec2 = { x: -48, y: -34 };

interface Runner extends RunnerPose {
  tower: Tower;
  route: Vec2[];
  cum: number[];
  length: number;
  start: number;
  speed: number;
  hops: number;
  gone: boolean;
  actor: SceneActor;
}

interface Fleer {
  e: Enemy;
  /** +1 on toward the channel's end, −1 back the way it came. */
  dir: 1 | -1;
  at: number;
  speed: number;
  end: number;
  /** Back into the cistern it came out of. */
  sink: boolean;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  floor: number;
}

export interface SceneCamera {
  /** Zoom about `cx`,`cy` (board px), 1 = the whole board. */
  zoom: number;
  cx: number;
  cy: number;
  /** Shake amplitude (px) this frame. */
  shake: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export class SludgeFatherScene {
  time = 0;
  /** True once the last champion is gone and the thing has had its moment. */
  done = false;
  readonly cues: SludgeFatherCue[] = [];
  readonly camera: SceneCamera = { zoom: 1, cx: 0, cy: 0, shake: 0 };

  /** The centre of the cistern's water: the Sludge Father's local origin. */
  private readonly W: Vec2;
  /** Where Draven stands (and is crushed). */
  private readonly D: Vec2;
  private readonly draven: Enemy | null;
  private readonly runners: Runner[] = [];
  private readonly fleers: Fleer[] = [];
  private readonly bubbles: Bubble[] = [];
  private readonly drops: Drop[] = [];
  private bubbleClock = 0;
  private dropClock = 0;
  private fled = false;
  private lastExit = 0;
  /** Settled into the aftermath: idle motion runs off the wall clock. */
  private settled = false;
  private readonly scene: BoardScene;
  private readonly eyeLight: Light = { x: 0, y: 0, radius: 60, family: 'poison', intensity: 0, glow: 0.9 };
  private readonly poolLight: Light = { x: 0, y: 0, radius: 80, family: 'poison', intensity: 0, glow: 0.6 };
  private readonly bodyLight: Light = { x: 0, y: 0, radius: 200, family: 'poison', intensity: 0 };
  private readonly woundLight: Light = { x: 0, y: 0, radius: 46, family: 'blood', intensity: 0, glow: 0.8 };
  /** Draven's royal gold, as the board gives him (his own light is hidden with him). */
  private readonly dravenLight: Light = { x: 0, y: 0, radius: 76, family: 'holy', intensity: 0, glow: 0.9 };
  private readonly bodyActor: SceneActor;
  private readonly rightActor: SceneActor;
  private readonly leftActor: SceneActor;
  private readonly dravenActor: SceneActor;
  private readonly bannerActor: SceneActor;
  private readonly poolActor: SceneActor;
  private readonly dropsActor: SceneActor;

  constructor(private readonly engine: GameEngine) {
    const decor = engine.level.decor ?? [];
    const pool = decor.find((p) => p.kind === 'cistern');
    const a = pool ? propAnchor(pool.col, pool.row) : { x: 360, y: 72 };
    // The cistern is 2×2 anchored top-left; its water sits a touch below centre.
    this.W = { x: a.x + 24, y: a.y + 30 };
    this.draven = engine.haltedBoss;
    const halt = engine.level.bossHaltAt;
    this.D = this.draven
      ? { ...this.draven.pos }
      : halt
        ? cellCenter(halt.col, halt.row)
        : { x: this.W.x + 24, y: this.W.y + 66 };

    this.scene = {
      hideTowers: true,
      hiddenEnemies: new Set(this.draven ? [this.draven.uid] : []),
      actors: [],
      lights: [this.poolLight, this.bodyLight, this.woundLight, this.eyeLight, this.dravenLight],
    };
    this.poolActor = { base: this.W.y + 26, draw: (ctx) => this.drawPool(ctx) };
    this.bodyActor = { base: this.W.y + 74, draw: (ctx) => this.drawBody(ctx) };
    this.rightActor = { base: 0, draw: (ctx) => this.drawArm(ctx, this.rightArm()) };
    this.leftActor = { base: 0, draw: (ctx) => this.drawArm(ctx, this.leftArm()) };
    this.dravenActor = { base: 0, draw: (ctx) => this.drawDraven(ctx) };
    this.bannerActor = { base: this.D.y + 2, draw: (ctx) => this.drawFallenBanner(ctx) };
    this.dropsActor = { base: 1e9, draw: (ctx) => this.drawDrops(ctx) };
    this.planRunners();
    this.camera.cx = 384;
    this.camera.cy = 240;
    this.update(0);
  }

  /** The board hooks to pass as `RenderUiState.scene` this frame. */
  get boardScene(): BoardScene {
    return this.scene;
  }

  update(dt: number): void {
    const prev = this.time;
    this.time += dt;
    const t = this.time;
    const crossed = (at: number) => prev < at && t >= at;

    if (crossed(BUBBLE_AT)) this.cues.push('bubbles');
    if (crossed(RUMBLE_AT)) this.cues.push('rumble');
    if (crossed(BURST_AT)) {
      this.cues.push('eruption');
      this.splash(this.W.x + RIGHT_ROOT.x, this.W.y + RIGHT_ROOT.y, 40, 0.45);
    }
    if (crossed(IMPACT_AT)) {
      this.cues.push('crush');
      this.splash(this.D.x, this.D.y + 4, 52, 0.95);
      // His plate and the banner's navy go flying from under it.
      this.engine.fx.push({ kind: 'block', x: this.D.x, y: this.D.y, fromX: this.D.x, fromY: this.D.y - 60, broke: true });
    }
    if (crossed(PULL_AT)) this.cues.push('heave');
    if (crossed(PULL_AT + LEFT_DOWN)) {
      this.cues.push('thud');
      const lh = this.leftHandTarget();
      this.splash(lh.x, lh.y + 4, 36, 0.5);
    }
    if (crossed(ROAR_AT)) {
      this.cues.push('roar');
      this.engine.fx.push({ kind: 'sludgeSplash', x: this.W.x - 20, y: this.W.y + 40, radius: 20, shake: 0.7 });
    }
    if (!this.fled && t >= FLEE_AT) this.startFleeing();

    for (const f of this.fleers) this.updateFleer(f, dt, t);
    for (const r of this.runners) this.updateRunner(r, t);
    this.updateBubbles(dt, t);
    this.updateDrops(dt, t);
    this.updateCamera(t, dt);
    this.updateLights(t);

    if (!this.done) {
      const allGone = this.runners.every((r) => r.gone);
      const end = this.runners.length ? Math.max(RUN_AT, this.lastExit) + HOLD : RUN_AT + 2;
      if (crossed(end - 0.5)) this.cues.push('growl');
      if (allGone && t >= end) this.done = true;
    }

    this.rebuildActors(t);
  }

  /**
   * Jump to the aftermath: Draven crushed, every foe gone, the champions away
   * through the tunnel, and the Sludge Father risen and breathing in the
   * cistern. Its idle motion then runs off the wall clock (no more updates).
   */
  settle(): void {
    this.time = 1e6;
    this.settled = true;
    this.done = true;
    for (const e of this.engine.enemies) if (e !== this.draven) e.dead = true;
    for (const r of this.runners) r.gone = true;
    this.bubbles.length = 0;
    this.drops.length = 0;
    this.camera.zoom = 1;
    this.camera.cx = 384;
    this.camera.cy = 240;
    this.camera.shake = 0;
    this.updateLights(this.time);
    this.rebuildActors(this.time);
  }

  // ------------------------------------------------------------------ timing

  /** Seconds for idle motion: the scene clock, or the wall clock once settled. */
  private get clock(): number {
    return this.settled ? performance.now() / 1000 : this.time;
  }

  /** How far the body has hauled itself out, 0..1. */
  private riseAt(t: number): number {
    return clamp01((t - PULL_AT) / (RISEN_AT - PULL_AT));
  }

  /** The roar's swell, 0..1..0. */
  private roarAt(t: number): number {
    const u = (t - ROAR_AT) / ROAR_TIME;
    if (u <= 0 || u >= 1) return 0;
    return u < 0.15 ? ease.outCubic(u / 0.15) : u > 0.7 ? 1 - ease.inOutSine((u - 0.7) / 0.3) : 1;
  }

  /** How hard the cistern is churning, 0..1. */
  private churnAt(t: number): number {
    if (t < BUBBLE_AT) return 0;
    if (t < BURST_AT) return 0.25 + 0.75 * clamp01((t - BUBBLE_AT) / (BURST_AT - BUBBLE_AT));
    return Math.max(0.25, 1 - clamp01((t - RISEN_AT) / 2) * 0.75);
  }

  // ---------------------------------------------------------------- the arms

  private leftHandTarget(): Vec2 {
    return { x: this.D.x - 110, y: this.D.y + 2 };
  }

  /** Board space → the Father's local space (origin at the water's centre). */
  private local(p: Vec2): Vec2 {
    return { x: p.x - this.W.x, y: p.y - this.W.y };
  }

  private rightArm(): SludgeArmPose | null {
    const t = this.time;
    if (t < BURST_AT) return null;
    const clock = this.clock;
    const rise = this.riseAt(t);
    const shoulder = sludgeFatherShoulder(rise, 1);
    const root = { x: lerp(RIGHT_ROOT.x, shoulder.x, ease.inOutSine(rise)), y: lerp(RIGHT_ROOT.y, shoulder.y, ease.inOutSine(rise)) };
    const target = this.local({ x: this.D.x, y: this.D.y - 2 });
    let hand: Vec2;
    let spread = 1;
    let planted = false;
    let bulge = 10;
    let size = 1.15;
    if (t < APEX_AT) {
      // Bursting up out of the water, fingers opening.
      const u = ease.outCubic((t - BURST_AT) / (APEX_AT - BURST_AT));
      hand = { x: lerp(RIGHT_ROOT.x, APEX.x, u), y: lerp(RIGHT_ROOT.y + 10, APEX.y, u) };
      spread = u;
      size = 0.8 + 0.35 * u;
    } else if (t < SLAM_AT) {
      // Rearing over him, drawing back for the blow.
      const u = ease.inOutSine((t - APEX_AT) / (SLAM_AT - APEX_AT));
      hand = { x: APEX.x + Math.sin(clock * 3) * 2 - 6 * u, y: APEX.y - 8 * u + Math.sin(clock * 2.3) * 1.5 };
    } else if (t < IMPACT_AT) {
      // The slam: accelerating down onto him, the arm bowing as it swings over.
      const u = (t - SLAM_AT) / (IMPACT_AT - SLAM_AT);
      const from = { x: APEX.x - 6, y: APEX.y - 8 };
      hand = { x: lerp(from.x, target.x, ease.outCubic(u)), y: lerp(from.y, target.y, ease.inCubic(u)) };
      bulge = 10 + 30 * u;
    } else {
      // Planted on what is left of him, pressing down; it leans on it to haul
      // itself out.
      const k = Math.max(0, 1 - (t - IMPACT_AT) / 0.35);
      hand = { x: target.x, y: target.y + 3 * k };
      planted = true;
      bulge = 26 - 16 * rise;
    }
    return { root, hand, bulge, spread, planted, time: clock, size };
  }

  private leftArm(): SludgeArmPose | null {
    const t = this.time;
    const t0 = PULL_AT + LEFT_OUT;
    if (t < t0) return null;
    const clock = this.clock;
    const rise = this.riseAt(t);
    const shoulder = sludgeFatherShoulder(rise, -1);
    const root = { x: lerp(LEFT_ROOT.x, shoulder.x, ease.inOutSine(rise)), y: lerp(LEFT_ROOT.y, shoulder.y, ease.inOutSine(rise)) };
    const target = this.local(this.leftHandTarget());
    let hand: Vec2;
    let spread = 1;
    let planted = false;
    if (t < PULL_AT + LEFT_UP) {
      const u = ease.outCubic((t - t0) / (LEFT_UP - LEFT_OUT));
      hand = { x: lerp(LEFT_ROOT.x, LEFT_APEX.x, u), y: lerp(LEFT_ROOT.y + 10, LEFT_APEX.y, u) };
      spread = u;
    } else if (t < PULL_AT + LEFT_DOWN) {
      const u = (t - PULL_AT - LEFT_UP) / (LEFT_DOWN - LEFT_UP);
      hand = { x: lerp(LEFT_APEX.x, target.x, ease.outCubic(u)), y: lerp(LEFT_APEX.y, target.y, ease.inCubic(u)) };
    } else {
      hand = target;
      planted = true;
    }
    return { root, hand, bulge: -14, spread, planted, time: clock, size: 1.05 };
  }

  // ----------------------------------------------------------------- updates

  private startFleeing(): void {
    this.fled = true;
    let i = 0;
    for (const e of this.engine.enemies) {
      if (e.dead || e.dying || e === this.draven) continue;
      const lane = this.engine.level.lanes[e.laneIndex];
      const at = this.engine.laneDistanceTo(e.laneIndex, this.D);
      const forward = at !== null && e.dist > at;
      const start = lane?.emerge ? -EMERGE_BACK : 0;
      const end = forward ? this.engine.lanes[e.laneIndex].totalPathLength : start;
      this.fleers.push({
        e,
        dir: forward ? 1 : -1,
        at: FLEE_AT + (i++ % 6) * 0.08 + Math.random() * 0.15,
        // A panicked run, and fast enough to be off the board before the
        // champions take the same channel out.
        speed: Math.max(e.def.speed * 1.9 + 20, Math.abs(end - e.dist) / FLEE_TIME),
        end,
        sink: !forward && !!lane?.emerge,
      });
    }
  }

  /** A foe running from the cistern: on to the channel's end, or back where it came from. */
  private updateFleer(f: Fleer, dt: number, t: number): void {
    const e = f.e;
    if (e.dead || t < f.at) return;
    const past = f.dir > 0 ? e.dist >= f.end : e.dist <= f.end;
    if (past) {
      if (f.sink) {
        // Back under the water it climbed out of.
        e.riseFrom = 'water';
        e.rise = Math.min(1, (e.rise ?? 0) + dt / 0.8);
        if (e.rise >= 1) e.dead = true;
      } else {
        e.dead = true; // into the tunnel
      }
      return;
    }
    e.rise = 0;
    e.dist += f.dir * f.speed * dt;
    e.pos = this.engine.pointOnLane(e.laneIndex, e.dist);
    const h = this.engine.headingOnLane(e.laneIndex, Math.max(0, e.dist));
    e.heading = { x: h.x * f.dir, y: h.y * f.dir };
  }

  private planRunners(): void {
    // The way out: the channel from where Draven fell on to its end under the
    // far arch, and on into the tunnel.
    const laneIdx = this.draven?.laneIndex ?? 0;
    const pts = this.engine.lanes[laneIdx]?.waypoints ?? [];
    const at = this.engine.laneDistanceTo(laneIdx, this.D) ?? 0;
    const road: Vec2[] = [{ ...this.D }];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (acc > at + 1) road.push({ ...pts[i] });
    }
    const plans = this.engine.towers.map((tower) => {
      const route = road.length > 1 ? routeAlongRoad(tower.pos, [road], -INTO_TUNNEL) : [{ ...tower.pos }];
      const cum = routeLengths(route);
      return { tower, route, cum, length: cum[cum.length - 1] };
    });
    const longest = plans.reduce((m, p) => Math.max(m, p.length), 0);
    const speed = Math.max(RUN_SPEED_MIN, Math.min(RUN_SPEED_MAX, longest / DASH));
    // Set off together (a touch staggered), reach the tunnel in order of
    // distance, a beat apart.
    const order = plans
      .map((p, i) => ({ p, start: RUN_AT + (i % 4) * 0.06 }))
      .map((o) => ({ ...o, arrive: o.start + o.p.length / speed }))
      .sort((x, y) => x.arrive - y.arrive);
    let last = -Infinity;
    for (const o of order) {
      const arrive = Math.max(o.arrive, last + EXIT_GAP);
      last = arrive;
      const runner: Runner = {
        ...o.p,
        start: o.start,
        speed: o.p.length > 0 ? o.p.length / Math.max(0.2, arrive - o.start) : speed,
        pos: { ...o.p.tower.pos },
        lift: 0,
        squash: 0,
        lean: 0,
        alpha: 1,
        scale: 1,
        faceLeft: o.p.tower.aimTarget ? o.p.tower.aimTarget.x < o.p.tower.pos.x : false,
        hops: 0,
        gone: false,
        actor: { base: 0, draw: () => {} },
      };
      runner.actor = { base: 0, draw: (ctx) => drawRunner(ctx, this.engine, runner.tower.def, runner) };
      this.runners.push(runner);
    }
    this.lastExit = this.runners.length ? last : 0;
  }

  private updateRunner(r: Runner, t: number): void {
    if (r.gone) return;
    r.squash = 0;
    r.lift = 0;
    r.lean = 0;
    if (t < r.start) {
      // The roar: a startled jolt, a look at the thing, then a wheel round for
      // the tunnel, crouched to sprint.
      const k = t - ROAR_AT - 0.1 - (r.tower.uid % 5) * 0.03;
      if (k > 0 && k < 0.22) {
        const b = Math.sin((Math.PI * k) / 0.22);
        r.lift = b * 5;
        r.squash = k < 0.04 ? 0.14 : -0.06 * b;
      }
      if (t >= IMPACT_AT) r.faceLeft = this.W.x < r.pos.x;
      if (t >= r.start - 0.12) {
        const next = r.route[1] ?? r.pos;
        r.faceLeft = next.x < r.pos.x;
        r.squash = 0.12;
      }
    } else {
      const s = Math.min(r.length, (t - r.start) * r.speed);
      const { p, dir } = alongRoute(r.route, r.cum, s);
      r.pos.x = p.x;
      r.pos.y = p.y;
      const phase = (t - r.start) * HOP_RATE;
      const bounce = Math.abs(Math.sin(Math.PI * phase));
      r.lift = bounce * (4 + r.speed * 0.022);
      r.squash = bounce < 0.25 ? 0.14 * (1 - bounce / 0.25) : -0.05 * bounce;
      r.lean = dir.x * 0.2;
      if (Math.abs(dir.x) > 0.1) r.faceLeft = dir.x < 0;
      const hops = Math.floor(phase);
      if (hops > r.hops) {
        r.hops = hops;
        this.cues.push('hop');
      }
      // Fading into the dark of the tunnel over the last stretch.
      r.alpha = clamp01((r.length - s) / INTO_TUNNEL);
      if (s >= r.length) r.gone = true;
    }
    r.actor.base = r.pos.y + 10;
  }

  private updateBubbles(dt: number, t: number): void {
    const churn = this.churnAt(t);
    this.bubbleClock -= dt * (2 + churn * 26);
    while (churn > 0 && this.bubbleClock <= 0 && this.bubbles.length < 60) {
      this.bubbleClock += 1;
      this.bubbles.push({
        x: this.W.x + (Math.random() - 0.5) * 70,
        y: this.W.y + (Math.random() - 0.5) * 40,
        r: 1.5 + Math.random() * (2 + churn * 4),
        age: 0,
        life: 0.5 + Math.random() * 0.6,
      });
    }
    for (const b of this.bubbles) b.age += dt;
    for (let i = this.bubbles.length - 1; i >= 0; i--) if (this.bubbles[i].age >= this.bubbles[i].life) this.bubbles.splice(i, 1);
  }

  private updateDrops(dt: number, t: number): void {
    // Sludge raining off the hand while it is up.
    const arm = t >= BURST_AT && t < IMPACT_AT ? this.rightArm() : null;
    if (arm) {
      this.dropClock -= dt * 14;
      while (this.dropClock <= 0 && this.drops.length < 40) {
        this.dropClock += 1;
        this.drops.push({
          x: this.W.x + arm.hand.x + (Math.random() - 0.5) * 34,
          y: this.W.y + arm.hand.y + 10,
          vx: (Math.random() - 0.5) * 20,
          vy: 10 + Math.random() * 30,
          floor: this.W.y + 4 + Math.random() * 20,
        });
      }
    }
    for (const d of this.drops) {
      d.vy += 420 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.y >= d.floor) {
        this.drops.splice(i, 1);
        this.bubbles.push({ x: d.x, y: d.floor, r: 2, age: 0.25, life: 0.6 });
      }
    }
  }

  private updateCamera(t: number, dt: number): void {
    const c = this.camera;
    if (t < CHASE_AT) {
      // Push in on Draven and the pool, hold through the crush, then pull back
      // out as the thing rises to show the whole of it.
      const pushIn = ease.inOutSine(clamp01((t - 1.3) / 1.4));
      const pullOut = ease.inOutSine(clamp01((t - PULL_AT - 0.4) / (RISEN_AT - PULL_AT)));
      const k = pushIn * (1 - pullOut);
      c.zoom = 1 + 0.32 * k;
      c.cx = lerp(384, this.D.x - 8, k);
      c.cy = lerp(240, this.D.y + 10, k);
    } else {
      // The escape: follow the runners in close, framed on the player's hero
      // with the rest of the party pulling the frame their way; once they are
      // all through the tunnel, ease back out on the thing left behind.
      const live = this.runners.filter((r) => !r.gone && r.alpha > 0.35);
      let tz = 1;
      let tx = 384;
      let ty = 240;
      if (live.length) {
        const ax = live.reduce((s, r) => s + r.pos.x, 0) / live.length;
        const ay = live.reduce((s, r) => s + r.pos.y, 0) / live.length;
        const hero = live.find((r) => isPlayerChampionId(r.tower.def.id));
        tx = hero ? lerp(ax, hero.pos.x, CHASE_HERO_WEIGHT) : ax;
        ty = (hero ? lerp(ay, hero.pos.y, CHASE_HERO_WEIGHT) : ay) - 8;
        tz = CHASE_ZOOM;
      }
      const follow = 1 - Math.exp(-dt * (live.length ? 3.2 : 1.6));
      // The zoom eases in gentler than the aim, so the push-in reads as a glide.
      c.zoom += (tz - c.zoom) * (1 - Math.exp(-dt * (live.length ? 2 : 1.6)));
      c.cx += (tx - c.cx) * follow;
      c.cy += (ty - c.cy) * follow;
    }
    // The rumble building, the heave and the roar shake the frame.
    const rumble = t >= RUMBLE_AT && t < BURST_AT ? 0.4 + 1.2 * clamp01((t - RUMBLE_AT) / (BURST_AT - RUMBLE_AT)) : 0;
    const heave = t >= PULL_AT && t < RISEN_AT ? 1.4 * Math.sin(Math.PI * this.riseAt(t)) : 0;
    const roar = this.roarAt(t) * 2.4;
    c.shake = Math.max(rumble, heave, roar);
  }

  private updateLights(t: number): void {
    const W = this.W;
    const churn = this.churnAt(t);
    this.poolLight.x = W.x;
    this.poolLight.y = W.y;
    this.poolLight.intensity = 0.45 * churn;
    const rise = this.riseAt(t);
    const pose = this.pose(t);
    const head = sludgeFatherHead(pose);
    const open = clamp01((ease.inOutSine(rise) - 0.55) / 0.25);
    this.eyeLight.x = W.x + head.x;
    this.eyeLight.y = W.y + head.y - 5;
    this.eyeLight.intensity = open * (0.6 + 0.5 * pose.roar);
    this.bodyLight.x = W.x;
    this.bodyLight.y = W.y + 10;
    this.bodyLight.intensity = 0.24 * ease.inOutSine(rise);
    const ls = sludgeFatherShoulder(rise, -1);
    this.woundLight.x = W.x + ls.x - 5;
    this.woundLight.y = W.y + ls.y - 7;
    this.woundLight.intensity = 0.5 * clamp01((ease.inOutSine(rise) - 0.35) / 0.65);
    // His gold burns until the hand comes down, guttering as it looms over him.
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 2.4);
    const gutter = t < APEX_AT ? 1 : t < IMPACT_AT ? 0.6 + 0.4 * Math.sin(t * 40) * 0.5 : 0;
    this.dravenLight.x = this.D.x;
    this.dravenLight.y = this.D.y + this.stumble(t).dy;
    this.dravenLight.intensity = this.draven ? (0.35 + 0.15 * pulse) * gutter : 0;
  }

  private pose(t: number): SludgeFatherPose {
    const rise = this.riseAt(t);
    let look = 0;
    if (t >= RUN_AT && !this.settled) {
      // Its head follows the champions as they run for it.
      const live = this.runners.filter((r) => !r.gone);
      if (live.length) {
        const ax = live.reduce((s, r) => s + r.pos.x, 0) / live.length;
        look = Math.max(-1, Math.min(1, (ax - this.W.x) / 200)) * clamp01((t - RUN_AT) / 0.8);
      }
    }
    return { rise, roar: this.roarAt(t), time: this.clock, look };
  }

  private rebuildActors(t: number): void {
    const actors = this.scene.actors!;
    actors.length = 0;
    if (t >= BUBBLE_AT && t < RISEN_AT + 3) actors.push(this.poolActor);
    if (t >= BURST_AT) actors.push(this.bodyActor);
    const right = this.rightArm();
    if (right) {
      // Behind Draven while it rises out of the pool, over him once it comes down.
      this.rightActor.base = t >= SLAM_AT + (IMPACT_AT - SLAM_AT) * 0.5 ? this.W.y + right.hand.y + 18 : this.W.y + 30;
      actors.push(this.rightActor);
    }
    const left = this.leftArm();
    if (left) {
      this.leftActor.base = left.planted || t >= PULL_AT + LEFT_UP ? this.W.y + left.hand.y + 18 : this.W.y + 30;
      actors.push(this.leftActor);
    }
    if (this.draven && t < IMPACT_AT) {
      this.dravenActor.base = this.D.y - footLiftFor(this.draven.def.id) + this.draven.def.radius * 0.7 + this.stumble(t).dy;
      actors.push(this.dravenActor);
    }
    if (t >= IMPACT_AT) actors.push(this.bannerActor);
    for (const r of this.runners) if (!r.gone) actors.push(r.actor);
    if (this.drops.length) actors.push(this.dropsActor);
  }

  /** Draven's stagger back from the hand as it rears up out of the water. */
  private stumble(t: number): { dy: number; lift: number } {
    const k = clamp01((t - BURST_AT - 0.05) / 0.5);
    return { dy: 9 * ease.outCubic(k), lift: Math.sin(Math.PI * k) * 4 };
  }

  private splash(x: number, y: number, radius: number, shake: number): void {
    this.engine.fx.push({ kind: 'sludgeSplash', x, y, radius, shake });
  }

  // ------------------------------------------------------------------ drawing

  private drawBody(ctx: CanvasRenderingContext2D): void {
    const pose = this.pose(this.time);
    const style = stageFigureStyle(this.engine, FATHER_ACCENT);
    style.box = BODY_BOX;
    style.headY = -110;
    style.feetY = 80;
    style.outline = 1.2;
    style.cast = undefined;
    ctx.save();
    ctx.translate(this.W.x, this.W.y);
    paintFigure(ctx, (g) => drawSludgeFatherBody(g, pose), style);
    ctx.restore();
  }

  private drawArm(ctx: CanvasRenderingContext2D, arm: SludgeArmPose | null): void {
    if (!arm) return;
    const pad = 46 * arm.size;
    const x0 = Math.min(arm.root.x, arm.hand.x) - pad - Math.abs(arm.bulge);
    const y0 = Math.min(arm.root.y, arm.hand.y) - pad - Math.abs(arm.bulge);
    const x1 = Math.max(arm.root.x, arm.hand.x) + pad + Math.abs(arm.bulge);
    const y1 = Math.max(arm.root.y, arm.hand.y) + pad + 20 + Math.abs(arm.bulge);
    const style = stageFigureStyle(this.engine, FATHER_ACCENT);
    style.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    style.headY = y0;
    style.feetY = y1;
    style.outline = 1.1;
    style.cast = undefined;
    ctx.save();
    ctx.translate(this.W.x, this.W.y);
    paintFigure(ctx, (g) => drawSludgeArm(g, arm), style);
    ctx.restore();
  }

  private drawDraven(ctx: CanvasRenderingContext2D): void {
    const e = this.draven;
    if (!e) return;
    const t = this.time;
    const def = e.def;
    const R = def.radius;
    const lift = footLiftFor(def.id);
    const { dy, lift: hop } = this.stumble(t);
    // Turned to face the pool (away from us) once it starts to stir.
    const view = t < TURN_AT ? viewFor(e.heading) : 'back';
    const faceLeft = e.heading.x < 0;
    const halt = ease.outCubic(clamp01(t / HALT_TIME));
    // Skidding the last step to a stop, then braced; the banner keeps flying.
    const phase = e.dist * 0.16 + (1 - halt) * 0.8;
    const wave = Math.floor(((this.clock * 0.9) % 1) * 12) / 12;
    ctx.save();
    ctx.translate(this.D.x, this.D.y - lift + dy);
    contactShadow(ctx, R * 0.7, R, R * 0.42, 1.1);
    drawRoyalAura(ctx, R, this.clock, 'back');
    ctx.translate(0, -hop);
    const style = foeFigureStyle(this.engine, def);
    style.cast = undefined;
    paintFigure(
      ctx,
      (g) => drawEnemySprite(g, def.id, def.visual.color, view, faceLeft, phase, halt, wave),
      style,
      halt >= 1 ? `cut|${def.id}|${view}|${faceLeft ? 1 : 0}|${wave}` : undefined,
    );
    ctx.translate(0, hop);
    drawRoyalAura(ctx, R, this.clock, 'front');
    ctx.restore();
  }

  /** The royal standard left lying in the muck, sticking out from under the hand. */
  private drawFallenBanner(ctx: CanvasRenderingContext2D): void {
    const x = this.D.x;
    const y = this.D.y + 6;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3e2f22';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x + 4, y - 2);
    ctx.lineTo(x + 40, y - 14);
    ctx.stroke();
    ctx.fillStyle = '#e7b64a'; // the finial
    ctx.beginPath();
    ctx.moveTo(x + 46, y - 16);
    ctx.lineTo(x + 39, y - 11.6);
    ctx.lineTo(x + 38.4, y - 15.4);
    ctx.closePath();
    ctx.fill();
    // The flag, crumpled on the floor beside the pole.
    ctx.fillStyle = '#1e2f66';
    ctx.beginPath();
    ctx.moveTo(x + 36, y - 12);
    ctx.quadraticCurveTo(x + 30, y - 2, x + 20, y + 2);
    ctx.lineTo(x + 26, y + 6);
    ctx.lineTo(x + 18, y + 9);
    ctx.quadraticCurveTo(x + 30, y + 8, x + 40, y - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c99a3a';
    ctx.beginPath();
    ctx.arc(x + 31, y - 1, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** The cistern churning: bubbles swelling and popping on the water. */
  private drawPool(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const b of this.bubbles) {
      const k = b.age / b.life;
      if (k > 0.8) {
        // Popped: a ring spreading out.
        const p = (k - 0.8) / 0.2;
        ctx.strokeStyle = `rgba(169,191,106,${0.5 * (1 - p)})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.r * (1 + p * 2), b.r * (1 + p * 2) * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      const r = b.r * (0.4 + 0.6 * ease.outCubic(k / 0.8));
      ctx.fillStyle = 'rgba(46,58,34,0.9)';
      ctx.beginPath();
      ctx.arc(b.x, b.y - r * 0.4, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(169,191,106,0.7)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.fillStyle = 'rgba(226,248,160,0.7)';
      ctx.beginPath();
      ctx.arc(b.x - r * 0.35, b.y - r * 0.8, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawDrops(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = '#7ea83a';
    for (const d of this.drops) {
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 1.6, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Walk view from a travel heading (side profile along rows, front/back on columns). */
function viewFor(h: { x: number; y: number }): 'side' | 'front' | 'back' {
  return Math.abs(h.x) >= Math.abs(h.y) ? 'side' : h.y > 0 ? 'front' : 'back';
}

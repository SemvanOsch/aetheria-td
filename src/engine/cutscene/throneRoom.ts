/**
 * The Throne Room's ending (`ending: 'throneRoom'`), closing the Castle chapter.
 *
 * King Kael is dead and the hall falls quiet. The player's hero (or, if the
 * hero isn't deployed, a champion picked at random) shoulders the furled rebel
 * flag, walks up to the empty throne and climbs the dais. They raise the flag
 * high and drive its pole down through the royal seat. It unfurls: the
 * kingdom's navy and gold star, slashed through with crimson. The camera has
 * pushed in on the throne for this. The party cheers ("For Aetheria!"), but a
 * war horn answers from the hall's doors. Castle guards, the foes they have
 * already met, pour in from the entrance, and every champion bolts for the far
 * exit with the guards on their heels. They pile up at the exit as the last
 * champion gets away.
 *
 * A director over a finished engine, like the Getaway's: it never steps the
 * simulation. It takes the champions off the board (`BoardScene.hideTowers`)
 * and redraws them as its own lit actors. The guards are real foes added
 * through `addSceneFoe` and walked along the entrance lane here; `dispose` takes
 * them away. `settle()` jumps to the aftermath the battle screen keeps under the
 * result card: the flag standing in the throne, the hall empty. Audio is left
 * to the UI, which drains `cues` each frame.
 */

import type { GameEngine } from '../GameEngine';
import type { Enemy, Tower } from '../types';
import { BOARD_WIDTH, TILE, type Vec2 } from '../../domain/grid';
import { isPlayerChampionId } from '../../domain/playerChampion';
import { propAnchor } from '../props';
import { paintFigure, type FigureBox } from '../figure';
import { fillStar8 } from '../sprites';
import { stageFigureStyle, type BoardScene, type SceneActor } from '../renderer';
import { ease, shade } from '../palette';
import type { Light } from '../lighting';
import { alongRoute, dist, drawRunner, routeAlongRoad, routeLengths, type RunnerPose } from './runners';
import type { SceneCamera } from './sludgeFather';

/** Sound/beat cues for the UI to voice. */
export type ThroneRoomCue = 'step' | 'plant' | 'unfurl' | 'cheer' | 'horn' | 'hop' | 'warCry' | 'march';

// The timeline (seconds; the UI holds the clock at 0 while it zooms out from
// the battle board). The flag-bearer's walk sets everything after it.
/**
 * The bearer turning for the throne and heaving the furled flag up over their
 * shoulder (it slides up from behind them as it fades in), before the walk.
 */
const FLAG_IN_AT = 0.1;
const FLAG_IN = 0.5;
/** How far down its own pole the flag starts, tucked behind the bearer. */
const FLAG_IN_SLIDE = 26;
const WALK_AT = FLAG_IN_AT + FLAG_IN + 0.1;
const WALK_SPEED = 115;
const WALK_MIN = 0.9;
const WALK_MAX = 3.4;
/** Steps per second on the walk up. */
const STEP_RATE = 3.4;
/** Up the two steps of the dais. */
const CLIMB = 0.55;
/** A breath on the dais, then the flag hoisted upright, high over the seat. */
const RAISE_PAUSE = 0.15;
const RAISE = 0.75;
/** The pole driven down into the seat. */
const DRIVE = 0.13;
/** The cloth unrolling once the pole is home. */
const UNFURL_AFTER = 0.22;
const UNFURL = 1.05;
/** The bearer stepping back down off the dais to face the room. */
const STEP_DOWN_AFTER = 0.75;
const STEP_DOWN = 0.5;
/** The cheer, and how long the party has to enjoy it before the horn. */
const CHEER_AFTER = 0.05;
const CHEER = 0.75;
const HORN_AFTER = 1.75;
/** The flinch and glance toward the doors before the sprint. */
const RUN_AFTER = 0.55;
/** The guards come through the doors a beat after the horn. */
const STORM_AFTER = 0.3;
/** Target length of the sprint (the farthest champion's run is fitted to it). */
const DASH = 3.2;
const RUN_SPEED_MIN = 140;
const RUN_SPEED_MAX = 330;
/** Bounds per second (a faster runner takes longer strides, not quicker ones). */
const HOP_RATE = 6;
/** How far past the exit (off the board's edge) a champion runs. */
const OVERRUN = 70;
/** The hall left to the guards before the scene closes. */
const HOLD = 0.9;
const SHOUT_TIME = 1.5;

/** The push-in on the throne for the planting, and the pull back at the horn. */
const CAM_ZOOM = 1.55;
const CAM_IN = 1.2;
const CAM_OUT = 0.8;
/**
 * Where the camera rests for the chase: a little above the board's middle,
 * so the flag at the top stays clear of the cutscene's letterbox bar (the
 * view shows as far past the board's top edge as that bar hides).
 */
const CHASE_CY = 217;

/**
 * The guards storming in through the hall's doors after them (the entrance
 * lane): only the Castle's own foes, the ones the party has already fought.
 * `at` is seconds after they start coming, `speed` their run in px/s.
 */
const STORMERS: { id: string; at: number; speed: number }[] = [
  { id: 'cas_runner', at: 0, speed: 320 },
  { id: 'cas_grunt', at: 0.18, speed: 300 },
  { id: 'cas_grunt', at: 0.34, speed: 296 },
  { id: 'cas_mage', at: 0.5, speed: 272 },
  { id: 'cas_grunt2', at: 0.64, speed: 258 },
  { id: 'cas_runner', at: 0.76, speed: 318 },
  { id: 'cas_grunt', at: 0.92, speed: 298 },
  { id: 'cas_grunt', at: 1.08, speed: 292 },
  { id: 'cas_grunt2', at: 1.26, speed: 254 },
  { id: 'cas_mage', at: 1.42, speed: 268 },
  { id: 'cas_grunt', at: 1.58, speed: 300 },
];
/** How far (px of road left to the exit) the front of the charge stays behind the hindmost runner. */
const CHASE_GAP = 70;
/** Least gap between two guards along the road, and how far short of the exit the first one stops. */
const STORM_SPACING = 20;
const STORM_STOP = 34;
/** Beat of the guards' armoured footfalls while they are on the move (s). */
const MARCH_EVERY = 0.3;

// The rebel flag: the kingdom's navy and gold star, slashed through in crimson.
const POLE = 68;
const CLOTH_TOP = -POLE + 5;
const CLOTH_H = 30;
const CLOTH_W = 50;
const NAVY = '#25397a';
const GOLD = '#e7b64a';
const CRIMSON = '#c4303a';
const WOOD = '#5a3f28';
/** Compositor box for the flag, in its local space (origin at the pole's foot). */
const FLAG_BOX: FigureBox = { x: -12, y: -POLE - 16, w: CLOTH_W + 28, h: POLE + 22 };
/** Wave cycles per second of the cloth in the hall's draught, and frames per cycle once settled. */
const WAVE_RATE = 0.55;
const SETTLED_FRAMES = 24;

interface Runner extends RunnerPose {
  tower: Tower;
  /** Where it stood on the board. */
  home: Vec2;
  /** The way out: onto the road and along it, off the board's edge. */
  route: Vec2[];
  cum: number[];
  length: number;
  start: number;
  speed: number;
  /** Bounds taken on the run. */
  hops: number;
  /** Beats before it: the bearer's footsteps, an onlooker's jumps for joy. */
  steps: number;
  gone: boolean;
  actor: SceneActor;
}

interface Stormer {
  id: string;
  at: number;
  speed: number;
  /** Sideways place in the crowd (px off the road's centre line), and the smoothed offset. */
  side: number;
  ox: number;
  oy: number;
  dustClock: number;
  e: Enemy | null;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Floor height it falls back to (chips), or none (dust drifts up). */
  floor: number | null;
  age: number;
  life: number;
  r: number;
  color: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export class ThroneRoomScene {
  time = 0;
  /** True once the last champion is out and the guards have the hall. */
  done = false;
  readonly cues: ThroneRoomCue[] = [];
  readonly camera: SceneCamera = { zoom: 1, cx: BOARD_WIDTH / 2, cy: 240, shake: 0 };

  /** The throne's centre at the foot of its back (its local origin). */
  private readonly O: Vec2;
  /** Where the pole goes in: the middle of the seat. */
  private readonly seat: Vec2;
  /** The bearer's spots: the foot of the dais, on the upper step, and back down facing the room. */
  private readonly foot: Vec2;
  private readonly stand: Vec2;
  private readonly down: Vec2;
  /** Where the guards come from (the entrance lane's start). */
  private readonly threat: Vec2;
  private readonly runners: Runner[] = [];
  private readonly bearer: Runner | null;
  private readonly stormers: Stormer[];
  private readonly motes: Mote[] = [];
  private marchClock = 0;
  private lastExit = 0;
  /** Settled into the aftermath: the flag's idle wave runs off the wall clock. */
  private settled = false;
  private readonly scene: BoardScene;
  private readonly flagActor: SceneActor;
  /** The flag's own glow once it stands: a flare as it unfurls, then a steady warm light. */
  private readonly flagLight: Light = { x: 0, y: 0, radius: 120, family: 'holy', intensity: 0, glow: 0.7 };
  private readonly bubbles: { at: number; text: string }[] = [];

  // The bearer's timeline, fitted to its walk.
  private readonly climbAt: number;
  private readonly raiseAt: number;
  private readonly driveAt: number;
  private readonly plantAt: number;
  private readonly unfurlAt: number;
  private readonly stepAt: number;
  private readonly cheerAt: number;
  private readonly hornAt: number;
  private readonly runAt: number;
  private readonly stormAt: number;
  private readonly walkDur: number;

  constructor(private readonly engine: GameEngine) {
    const decor = engine.level.decor ?? [];
    const throne = decor.find((p) => p.kind === 'throne');
    const a = throne ? propAnchor(throne.col, throne.row) : { x: 312, y: 72 };
    // The throne prop's origin sits one cell right and half a cell down of its anchor.
    this.O = { x: a.x + TILE, y: a.y + TILE / 2 };
    this.seat = { x: this.O.x, y: this.O.y - 12 };
    this.stand = { x: this.O.x - 13, y: this.O.y + 4 };
    this.foot = { x: this.O.x - 22, y: this.O.y + 38 };
    this.down = { x: this.O.x - 36, y: this.O.y + 42 };
    this.threat = engine.lanes[0]?.waypoints[0] ?? { x: 0, y: 480 };

    this.scene = { hideTowers: true, actors: [], lights: [this.flagLight] };
    this.flagActor = { base: this.seat.y + 6, draw: (ctx) => this.drawPlantedFlag(ctx) };

    // The hero carries the flag if deployed; otherwise any champion on the board.
    const towers = engine.towers;
    const hero = towers.find((t) => isPlayerChampionId(t.def.id));
    const bearerTower = hero ?? (towers.length ? towers[Math.floor(Math.random() * towers.length)] : null);

    this.walkDur = bearerTower
      ? Math.max(WALK_MIN, Math.min(WALK_MAX, dist(bearerTower.pos, this.foot) / WALK_SPEED))
      : 0;
    this.climbAt = WALK_AT + this.walkDur;
    this.raiseAt = this.climbAt + CLIMB + RAISE_PAUSE;
    this.driveAt = this.raiseAt + RAISE;
    this.plantAt = this.driveAt + DRIVE;
    this.unfurlAt = this.plantAt + UNFURL_AFTER;
    this.stepAt = this.plantAt + STEP_DOWN_AFTER;
    this.cheerAt = this.stepAt + STEP_DOWN + CHEER_AFTER;
    this.hornAt = this.cheerAt + HORN_AFTER;
    this.runAt = this.hornAt + RUN_AFTER;
    this.stormAt = this.hornAt + STORM_AFTER;

    this.planRunners(bearerTower);
    this.bearer = this.runners.find((r) => r.tower === bearerTower) ?? null;
    if (this.bearer) {
      this.bubbles.push({ at: this.cheerAt, text: 'For Aetheria!' });
      this.bubbles.push({ at: this.hornAt + 0.25, text: 'Guards! Run!' });
    }

    this.stormers = STORMERS.map((s, i) => ({
      ...s,
      side: (((i * 7) % 5) - 2) * 4.5,
      ox: 0,
      oy: 0,
      dustClock: Math.random() * 0.2,
      e: null,
    }));
    this.update(0);
  }

  /** Take the guards back off the board (the cutscene is over or skipped). */
  dispose(): void {
    for (const s of this.stormers) if (s.e) s.e.dead = true;
  }

  /** The board hooks to pass as `RenderUiState.scene` this frame. */
  get boardScene(): BoardScene {
    return this.scene;
  }

  /**
   * Jump to the aftermath: the flag standing in the throne, every champion
   * gone and the guards with them. The cloth's wave then runs off the wall
   * clock (no more updates).
   */
  settle(): void {
    this.time = 1e6;
    this.settled = true;
    this.done = true;
    this.dispose();
    for (const r of this.runners) r.gone = true;
    this.motes.length = 0;
    this.bubbles.length = 0;
    this.camera.zoom = 1;
    this.camera.cx = BOARD_WIDTH / 2;
    this.camera.cy = 240;
    this.camera.shake = 0;
    this.updateLight(this.time);
    this.rebuildActors();
  }

  update(dt: number): void {
    const prev = this.time;
    this.time += dt;
    const t = this.time;
    const crossed = (at: number) => prev < at && t >= at;

    if (this.bearer) {
      if (crossed(this.plantAt)) {
        this.cues.push('plant');
        this.splinter();
      }
      if (crossed(this.unfurlAt)) this.cues.push('unfurl');
      if (crossed(this.cheerAt)) this.cues.push('cheer');
    }
    if (crossed(this.hornAt)) this.cues.push('horn');

    for (const r of this.runners) this.updateRunner(r, t);
    this.updateStormers(dt, t);
    this.updateMotes(dt);
    this.updateCamera(t);
    this.updateLight(t);

    if (!this.done && t >= this.runAt && this.runners.every((r) => r.gone) && t >= Math.max(this.runAt, this.lastExit) + HOLD) {
      this.done = true;
    }
    this.rebuildActors();
  }

  /** Unlit overlay drawn over the finished board: the bearer's shouts. */
  drawOverlay(ctx: CanvasRenderingContext2D): void {
    const b = this.bearer;
    if (!b || b.gone) return;
    for (const s of this.bubbles) this.drawBubble(ctx, s.text, (this.time - s.at) / SHOUT_TIME, b);
  }

  // ------------------------------------------------------------------ timing

  /** How far the cloth has unrolled, 0..1. */
  private unfurlAmount(t: number): number {
    if (!this.bearer) return 0;
    return clamp01((t - this.unfurlAt) / UNFURL);
  }

  /** The cloth's wave phase: the scene clock, or the wall clock once settled (quantized to cached frames). */
  private wavePhase(t: number): number {
    if (!this.settled) return t * WAVE_RATE * Math.PI * 2;
    const cycle = ((performance.now() / 1000) * WAVE_RATE) % 1;
    return (Math.floor(cycle * SETTLED_FRAMES) / SETTLED_FRAMES) * Math.PI * 2;
  }

  // ----------------------------------------------------------------- runners

  private planRunners(bearerTower: Tower | null): void {
    const roads = this.engine.lanes.map((l) => l.waypoints);
    const plans = this.engine.towers.map((tower) => {
      // The bearer sets off from the foot of the dais, everyone else from where they stood.
      const from = tower === bearerTower ? this.down : tower.pos;
      const route = routeAlongRoad(from, roads, -OVERRUN);
      const cum = routeLengths(route);
      return { tower, route, cum, length: cum[cum.length - 1] };
    });
    const longest = plans.reduce((m, p) => Math.max(m, p.length), 0);
    const speed = Math.max(RUN_SPEED_MIN, Math.min(RUN_SPEED_MAX, longest / DASH));
    plans.forEach((p, i) => {
      const tower = p.tower;
      const r: Runner = {
        ...p,
        home: { ...tower.pos },
        start: this.runAt + (i % 4) * 0.06,
        speed,
        hops: 0,
        steps: 0,
        gone: false,
        pos: { ...tower.pos },
        lift: 0,
        squash: 0,
        lean: 0,
        alpha: 1,
        scale: 1,
        faceLeft: tower.aimTarget ? tower.aimTarget.x < tower.pos.x : false,
        actor: { base: 0, draw: () => {} },
      };
      r.actor = {
        base: 0,
        draw: (ctx) => this.drawFigure(ctx, r),
      };
      this.runners.push(r);
    });
  }

  private updateRunner(r: Runner, t: number): void {
    if (r.gone) return;
    r.lift = 0;
    r.squash = 0;
    r.lean = 0;
    if (t < r.start) {
      if (r === this.bearer) this.updateBearer(r, t);
      else this.updateOnlooker(r, t);
      // The horn: a startled jolt and a glance back at the doors, then a
      // wheel round for the exit, crouched to sprint.
      const k = t - this.hornAt - (r.tower.uid % 5) * 0.03;
      if (k > 0 && k < 0.22) {
        const b = Math.sin((Math.PI * k) / 0.22);
        r.lift = b * 5;
        r.squash = k < 0.04 ? 0.14 : -0.06 * b;
      }
      if (k > 0) r.faceLeft = this.threat.x < r.pos.x;
      if (t >= r.start - 0.12) {
        const ahead = r.route[Math.min(1, r.route.length - 1)];
        if (Math.abs(ahead.x - r.pos.x) > 2) r.faceLeft = ahead.x < r.pos.x;
        r.squash = 0.12;
      }
    } else {
      // Bounding along the road and off the board's edge.
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
        this.dust(r.pos.x - dir.x * 4, r.pos.y + 11, -dir.x * 18, 3.2);
        this.cues.push('hop');
      }
      r.alpha = 1 - clamp01((r.pos.x - (BOARD_WIDTH - 6)) / 40);
      if (s >= r.length) {
        r.gone = true;
        this.lastExit = t;
      }
    }
    r.actor.base = r.pos.y + 10;
  }

  /** A champion watching the bearer: turned toward the throne, then cheering. */
  private updateOnlooker(r: Runner, t: number): void {
    const b = this.bearer;
    if (b && t >= WALK_AT && t < this.hornAt) r.faceLeft = b.pos.x < r.pos.x;
    const k = t - this.cheerAt - (r.tower.uid % 4) * 0.05;
    if (k > 0 && k < CHEER) {
      // Two jumps for joy.
      const v = Math.abs(Math.sin((2 * Math.PI * k) / CHEER));
      r.lift = v * 8;
      r.squash = v < 0.25 ? 0.12 * (1 - v / 0.25) : -0.06 * v;
      const jump = Math.floor((k / CHEER) * 2) + 1;
      if (jump > r.steps) {
        r.steps = jump;
        this.cues.push('hop');
      }
    }
  }

  /** The flag-bearer: the walk up, the climb, the planting and the step back down. */
  private updateBearer(r: Runner, t: number): void {
    if (t < FLAG_IN_AT) return;
    if (t < WALK_AT) {
      // Turned for the throne, a small heave as the flag comes up onto the shoulder.
      if (Math.abs(this.foot.x - r.home.x) > 4) r.faceLeft = this.foot.x < r.home.x;
      const k = ease.hump(clamp01((t - FLAG_IN_AT) / FLAG_IN));
      r.lift = k * 1.6;
      r.squash = -0.06 * k;
      return;
    }
    if (t < this.climbAt) {
      // A steady, purposeful walk to the foot of the dais.
      const u = clamp01((t - WALK_AT) / this.walkDur);
      const e = ease.inOutSine(u);
      r.pos.x = lerp(r.home.x, this.foot.x, e);
      r.pos.y = lerp(r.home.y, this.foot.y, e);
      if (Math.abs(this.foot.x - r.home.x) > 4) r.faceLeft = this.foot.x < r.home.x;
      const phase = (t - WALK_AT) * STEP_RATE;
      const bob = Math.abs(Math.sin(Math.PI * phase));
      r.lift = bob * 2.2;
      r.squash = bob < 0.2 ? 0.06 : -0.02 * bob;
      const steps = Math.floor(phase);
      if (steps > r.steps) {
        r.steps = steps;
        this.cues.push('step');
      }
      return;
    }
    if (t < this.climbAt + CLIMB) {
      // Two steps up onto the dais.
      const u = (t - this.climbAt) / CLIMB;
      const step = u < 0.5 ? 0 : 1;
      const k = (u - step * 0.5) / 0.5;
      const mid = { x: lerp(this.foot.x, this.stand.x, 0.5), y: lerp(this.foot.y, this.stand.y, 0.5) };
      const [a, b] = step === 0 ? [this.foot, mid] : [mid, this.stand];
      const e = ease.inOutSine(k);
      r.pos.x = lerp(a.x, b.x, e);
      r.pos.y = lerp(a.y, b.y, e);
      r.lift = Math.sin(Math.PI * k) * 5;
      r.faceLeft = false;
      if (r.steps < 1000 + step) {
        r.steps = 1000 + step;
        this.cues.push('step');
      }
      return;
    }
    r.faceLeft = false;
    if (t < this.stepAt) {
      r.pos.x = this.stand.x;
      r.pos.y = this.stand.y;
      if (t >= this.raiseAt && t < this.driveAt) {
        // Stretching up to hoist the flag high.
        r.squash = -0.08 * ease.outCubic((t - this.raiseAt) / RAISE);
      } else if (t >= this.driveAt && t < this.plantAt + 0.2) {
        // Driving it down with their whole weight, and the jolt as it bites.
        const k = (t - this.driveAt) / (DRIVE + 0.2);
        r.squash = 0.16 * Math.sin(Math.PI * k);
      }
      return;
    }
    // Back down off the dais, turning to face the room.
    const u = clamp01((t - this.stepAt) / STEP_DOWN);
    const e = ease.inOutSine(u);
    r.pos.x = lerp(this.stand.x, this.down.x, e);
    r.pos.y = lerp(this.stand.y, this.down.y, e);
    r.lift = Math.sin(Math.PI * u) * 6;
    r.faceLeft = u > 0.3;
    if (u > 0 && r.steps < 2000) {
      r.steps = 2000;
      this.cues.push('step');
    }
    // Then a fist in the air with the cheer.
    const k = t - this.cheerAt;
    if (k > 0 && k < CHEER * 0.6) {
      const v = Math.sin((Math.PI * k) / (CHEER * 0.6));
      r.lift = v * 10;
      r.squash = -0.08 * v;
    }
  }

  /**
   * The flag as the bearer holds it, in board space: where the pole's foot
   * is, how far it leans off upright (radians) and how far it is drawn up
   * onto the shoulder yet (0..1), or null before it comes up and once it
   * stands in the throne.
   */
  private heldFlag(t: number): { foot: Vec2; angle: number; shown: number } | null {
    const r = this.bearer;
    if (!r || t < FLAG_IN_AT || t >= this.plantAt) return null;
    const dir = r.faceLeft ? -1 : 1;
    // Shouldered on the walk: the foot at the leading hand, leaning back over the shoulder.
    const shown = ease.outCubic(clamp01((t - FLAG_IN_AT) / FLAG_IN));
    const carry = { foot: { x: r.pos.x + dir * 7, y: r.pos.y - 4 - r.lift }, angle: -dir * 0.62, shown };
    if (t < this.raiseAt) return carry;
    // Hoisted upright and high over the seat, then driven down into it.
    const high = { x: this.seat.x, y: this.seat.y - 18 };
    if (t < this.driveAt) {
      const e = ease.inOutSine((t - this.raiseAt) / RAISE);
      return {
        foot: { x: lerp(carry.foot.x, high.x, e), y: lerp(carry.foot.y, high.y, e) },
        angle: lerp(carry.angle, 0, e),
        shown: 1,
      };
    }
    const e = ease.inCubic((t - this.driveAt) / DRIVE);
    return { foot: { x: high.x, y: lerp(high.y, this.seat.y, e) }, angle: 0, shown: 1 };
  }

  // ---------------------------------------------------------------- stormers

  /**
   * The guards pouring through the doors and charging down the road after the
   * champions. The front of the charge is held `CHASE_GAP` behind whichever
   * champion has the most road left to the exit (every lane shares it), and
   * each guard keeps a stride behind the one ahead, so they bunch into a mob.
   */
  private updateStormers(dt: number, t: number): void {
    if (dt <= 0 || !this.engine.lanes.length) return;
    for (const s of this.stormers) {
      if (s.e || t < this.stormAt + s.at) continue;
      s.e = this.engine.addSceneFoe(s.id, 0, 0);
      if (s === this.stormers[0]) this.cues.push('warCry');
    }
    let hindmost = 0;
    for (const r of this.runners) {
      if (r.gone) continue;
      const run = t < r.start ? 0 : Math.min(r.length, (t - r.start) * r.speed);
      hindmost = Math.max(hindmost, r.length - run - OVERRUN);
    }
    const total = this.engine.lanes[0].totalPathLength;
    const live = this.stormers
      .filter((s): s is Stormer & { e: Enemy } => s.e !== null)
      .map((s) => ({ s, left: total - s.e.dist }))
      .sort((a, b) => a.left - b.left);
    let floor = Math.max(STORM_STOP, hindmost > 0 ? hindmost + CHASE_GAP : 0);
    let moving = false;
    for (const { s, left } of live) {
      const e = s.e;
      // Ease to a halt short of the one ahead (or the hindmost champion).
      const v = s.speed * clamp01((left - floor) / 40);
      e.dist = Math.max(0, Math.min(total - floor, e.dist + v * dt), e.dist);
      floor = Math.max(floor, total - e.dist) + STORM_SPACING;
      const p = this.engine.pointOnLane(0, e.dist);
      const h = this.engine.headingOnLane(0, e.dist);
      // Spread across the road; the offset swings smoothly round the corners.
      const k = Math.min(1, dt * 7);
      s.ox += (-h.y * s.side - s.ox) * k;
      s.oy += (h.x * s.side - s.oy) * k;
      e.pos = { x: p.x + s.ox, y: p.y + s.oy };
      e.heading = h;
      if (v > 20) {
        moving = true;
        s.dustClock -= dt;
        if (s.dustClock <= 0) {
          s.dustClock = 0.22 + Math.random() * 0.1;
          this.dust(e.pos.x - h.x * 6, e.pos.y + 10, -h.x * 16, 3.4);
        }
      }
    }
    this.marchClock -= dt;
    if (moving && this.marchClock <= 0) {
      this.marchClock = MARCH_EVERY;
      this.cues.push('march');
    }
  }

  // ------------------------------------------------------------ camera/light

  private updateCamera(t: number): void {
    const c = this.camera;
    if (this.settled || !this.bearer) {
      c.zoom = 1;
      c.cx = BOARD_WIDTH / 2;
      c.cy = 240;
      c.shake = 0;
      return;
    }
    // In on the throne as the bearer reaches it, held through the cheer,
    // back out to the whole hall as the horn sounds (resting a touch higher
    // than it started, to keep the flag in view through the chase).
    const inAt = this.climbAt - 0.9;
    const before = t < this.hornAt;
    const k = before ? ease.inOutSine(clamp01((t - inAt) / CAM_IN)) : 1 - ease.inOutSine(clamp01((t - this.hornAt) / CAM_OUT));
    c.zoom = lerp(1, CAM_ZOOM, k);
    c.cx = lerp(BOARD_WIDTH / 2, this.O.x, k);
    c.cy = lerp(before ? 240 : CHASE_CY, this.O.y + 10, k);
    const s = t - this.plantAt;
    c.shake = s >= 0 && s < 0.45 ? 3.2 * Math.exp(-s * 9) : 0;
  }

  private updateLight(t: number): void {
    const u = this.unfurlAmount(t);
    const l = this.flagLight;
    l.x = this.seat.x + CLOTH_W * 0.45;
    l.y = this.seat.y + CLOTH_TOP + CLOTH_H / 2;
    const flare = this.settled ? 0 : Math.max(0, 1 - Math.abs(t - this.unfurlAt - UNFURL * 0.6) / (UNFURL * 0.6));
    l.intensity = this.bearer && t >= this.plantAt ? 0.35 * u + 0.45 * flare : 0;
  }

  // ------------------------------------------------------------------ motes

  /** Splinters of the seat and gilt flying as the pole bites, and a puff of dust. */
  private splinter(): void {
    const { x, y } = this.seat;
    const colors = ['#c8404f', '#7a1a28', GOLD, '#f2cf6a', '#5a3f28'];
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 50 + Math.random() * 90;
      this.motes.push({
        x: x + (Math.random() - 0.5) * 6,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        floor: y + 10 + Math.random() * 14,
        age: 0,
        life: 0.7 + Math.random() * 0.4,
        r: 0.9 + Math.random() * 1.1,
        color: colors[i % colors.length],
      });
    }
    for (let i = 0; i < 6; i++) this.dust(x + (Math.random() - 0.5) * 20, y + 4, (Math.random() - 0.5) * 40, 4);
  }

  private dust(x: number, y: number, vx: number, r: number): void {
    if (this.motes.length > 240) return;
    this.motes.push({ x, y, vx, vy: -6 - Math.random() * 10, floor: null, age: 0, life: 0.55 + Math.random() * 0.4, r, color: '' });
  }

  private updateMotes(dt: number): void {
    for (const m of this.motes) {
      m.age += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.floor === null) {
        m.vx *= 1 - 1.8 * dt;
        m.vy -= 6 * dt;
      } else {
        m.vy += 420 * dt;
        if (m.y >= m.floor) {
          m.y = m.floor;
          m.vy *= -0.3;
          m.vx *= 0.5;
        }
      }
    }
    for (let i = this.motes.length - 1; i >= 0; i--) if (this.motes[i].age >= this.motes[i].life) this.motes.splice(i, 1);
  }

  // ---------------------------------------------------------------- drawing

  private rebuildActors(): void {
    const actors = this.scene.actors!;
    actors.length = 0;
    actors.push({ base: -1e9, draw: (ctx) => this.drawDust(ctx) });
    if (this.bearer && this.time >= this.plantAt) actors.push(this.flagActor);
    for (const r of this.runners) if (!r.gone) actors.push(r.actor);
    actors.push({ base: 1e9, draw: (ctx) => this.drawChips(ctx) });
  }

  private drawFigure(ctx: CanvasRenderingContext2D, r: Runner): void {
    const held = r === this.bearer ? this.heldFlag(this.time) : null;
    // Shouldered, the pole rides behind the figure; hoisted, it is in their hands in front.
    const behind = held !== null && this.time < this.raiseAt;
    if (held && behind) this.drawFlagAt(ctx, held.foot, held.angle, 0, held.shown);
    drawRunner(ctx, this.engine, r.tower.def, r);
    if (held && !behind) this.drawFlagAt(ctx, held.foot, held.angle, 0, held.shown);
  }

  private drawPlantedFlag(ctx: CanvasRenderingContext2D): void {
    this.drawFlagAt(ctx, this.seat, 0, this.unfurlAmount(this.time));
  }

  /**
   * The flag with its pole's foot at `foot`, leaning `angle` off upright.
   * `shown` < 1 while it is coming up onto the shoulder: slid back down its
   * own pole (behind the bearer) and faded.
   */
  private drawFlagAt(ctx: CanvasRenderingContext2D, foot: Vec2, angle: number, unfurl: number, shown = 1): void {
    if (shown <= 0) return;
    const wave = this.wavePhase(this.time);
    ctx.save();
    ctx.translate(foot.x, foot.y);
    ctx.rotate(angle);
    ctx.translate(0, (1 - shown) * FLAG_IN_SLIDE);
    const style = {
      ...stageFigureStyle(this.engine, NAVY),
      box: FLAG_BOX,
      headY: -POLE,
      feetY: 0,
      cast: undefined,
      alpha: Math.min(1, shown * 1.6),
    };
    const key = this.settled ? `rebelFlag|${Math.round((wave / (Math.PI * 2)) * SETTLED_FRAMES)}` : undefined;
    paintFigure(ctx, (g) => drawRebelFlag(g, wave, unfurl), style, key);
    ctx.restore();
  }

  private drawDust(ctx: CanvasRenderingContext2D): void {
    for (const m of this.motes) {
      if (m.floor !== null) continue;
      const k = m.age / m.life;
      ctx.fillStyle = `rgba(150,128,110,${0.4 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * (1 + k * 1.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawChips(ctx: CanvasRenderingContext2D): void {
    for (const m of this.motes) {
      if (m.floor === null) continue;
      ctx.globalAlpha = 1 - clamp01((m.age / m.life - 0.7) / 0.3);
      ctx.fillStyle = m.color;
      ctx.fillRect(m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
    }
    ctx.globalAlpha = 1;
  }

  private drawBubble(ctx: CanvasRenderingContext2D, text: string, u: number, r: Runner): void {
    if (u < 0 || u > 1) return;
    const pop = u < 0.12 ? ease.outBack(u / 0.12) : u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
    const x = r.pos.x + 6;
    const y = r.pos.y - 22 - r.lift;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.globalAlpha = Math.min(1, pop * 1.4);
    ctx.font = 'italic 600 14px "EB Garamond", Georgia, serif';
    const w = ctx.measureText(text).width + 18;
    const h = 22;
    const bx = -w + 14;
    const by = -h - 10;
    ctx.fillStyle = '#f2ebda';
    ctx.strokeStyle = '#140d17';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 8);
    ctx.moveTo(-2, by + h);
    ctx.lineTo(4, by + h + 9);
    ctx.lineTo(8, by + h);
    ctx.fill();
    ctx.stroke();
    // Cover the seam between the bubble and its tail.
    ctx.fillRect(-1, by + h - 1.5, 8.5, 2.5);
    ctx.fillStyle = '#2a1a10';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 9, by + h / 2 + 0.5);
    ctx.restore();
  }
}

/**
 * The rebel flag in its local space: the pole's foot at the origin, the pole
 * straight up, the cloth flying off to +x. `wave` is the cloth's phase
 * (radians), `unfurl` 0 (rolled tight round the pole, tied) to 1 (flying).
 * The kingdom's navy and gold star, with a crimson slash daubed across it and
 * a ragged fly end: the royal banner, taken and defaced.
 */
function drawRebelFlag(g: CanvasRenderingContext2D, wave: number, unfurl: number): void {
  // Pole and its gilt spear-head.
  g.fillStyle = WOOD;
  g.fillRect(-1.3, -POLE, 2.6, POLE);
  g.fillStyle = shade(WOOD, 0.25);
  g.fillRect(-1.3, -POLE, 0.9, POLE);
  g.fillStyle = GOLD;
  g.beginPath();
  g.moveTo(0, -POLE - 10);
  g.lineTo(2.6, -POLE - 2.5);
  g.lineTo(0, -POLE - 0.5);
  g.lineTo(-2.6, -POLE - 2.5);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(0, -POLE, 2.1, 0, Math.PI * 2);
  g.fill();

  const open = ease.outCubic(unfurl);
  const w = CLOTH_W * open;
  if (w > 2) {
    // The cloth's ripple, growing toward the fly; while still unrolling it
    // sags a little, then catches the draught.
    const off = (x: number) => {
      const k = x / CLOTH_W;
      return Math.sin(wave - k * 5.2) * (1 + 3.2 * k) * (0.35 + 0.65 * unfurl) + (1 - unfurl) * k * 12;
    };
    const n = 10;
    const top: Vec2[] = [];
    const bottom: Vec2[] = [];
    for (let i = 0; i <= n; i++) {
      const x = 1.2 + (w * i) / n;
      top.push({ x, y: CLOTH_TOP + off(x) });
      bottom.push({ x, y: CLOTH_TOP + CLOTH_H + off(x) * 1.1 });
    }
    // A ragged, torn fly end.
    const end = top[n].x;
    const rag = [0.18, 0.34, 0.52, 0.7, 0.86].map((f, i) => ({
      x: end - (i % 2 ? 4.5 : 0.5) * open,
      y: CLOTH_TOP + CLOTH_H * f + off(end),
    }));
    g.beginPath();
    g.moveTo(top[0].x, top[0].y);
    for (const p of top) g.lineTo(p.x, p.y);
    for (const p of rag) g.lineTo(p.x, p.y);
    for (let i = n; i >= 0; i--) g.lineTo(bottom[i].x, bottom[i].y);
    g.closePath();
    // Folds: light and shade following the ripple's slope.
    const grad = g.createLinearGradient(0, 0, w + 2, 0);
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      grad.addColorStop(k, shade(NAVY, 0.18 * Math.cos(wave - k * 5.2 * open)));
    }
    g.fillStyle = grad;
    g.fill();
    // Gold trim down the hoist.
    g.fillStyle = GOLD;
    g.beginPath();
    g.moveTo(top[0].x, top[0].y);
    g.lineTo(top[0].x + 2.2, top[0].y);
    g.lineTo(bottom[0].x + 2.2, bottom[0].y);
    g.lineTo(bottom[0].x, bottom[0].y);
    g.closePath();
    g.fill();

    // The star and the slash across it, riding the ripple.
    if (open > 0.35) {
      const s = clamp01((open - 0.35) / 0.65);
      const cx = 1.2 + w * 0.48;
      const cy = CLOTH_TOP + CLOTH_H / 2 + off(cx);
      fillStar8(g, cx, cy, 10 * s, GOLD);
      const slash = (u: number) => {
        const x = cx + lerp(12, -12, u) * s;
        return { x, y: cy + lerp(-12, 12, u) * s + off(x) - off(cx) };
      };
      g.fillStyle = CRIMSON;
      g.beginPath();
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const p = slash(i / steps);
        const half = (0.6 + 2.2 * Math.sin((Math.PI * i) / steps)) * s;
        if (i === 0) g.moveTo(p.x - half, p.y - half);
        else g.lineTo(p.x - half, p.y - half);
      }
      for (let i = steps; i >= 0; i--) {
        const p = slash(i / steps);
        const half = (0.6 + 2.2 * Math.sin((Math.PI * i) / steps)) * s;
        g.lineTo(p.x + half, p.y + half);
      }
      g.closePath();
      g.fill();
      // Paint run down from the daub.
      for (const [u, len] of [[0.42, 5], [0.7, 3.5], [0.2, 2.6]] as const) {
        const p = slash(u);
        g.beginPath();
        g.moveTo(p.x - 0.8 * s, p.y);
        g.lineTo(p.x - 0.5 * s, p.y + len * s);
        g.arc(p.x, p.y + len * s, 0.8 * s, Math.PI, 0, true);
        g.lineTo(p.x + 0.8 * s, p.y);
        g.closePath();
        g.fill();
      }
    }
  }

  // The roll still wrapped round the pole, thinning as it lets go; tied with
  // gold cord while it is carried.
  if (unfurl < 1) {
    const rw = 2.8 + 5.2 * (1 - unfurl);
    g.fillStyle = shade(NAVY, -0.05);
    g.beginPath();
    g.roundRect(-rw / 2 + 0.8, CLOTH_TOP - 1, rw, CLOTH_H + 4, rw / 2);
    g.fill();
    g.fillStyle = shade(NAVY, 0.2);
    g.fillRect(-rw / 2 + 1.6, CLOTH_TOP + 1, 1, CLOTH_H);
    if (unfurl === 0) {
      g.fillStyle = GOLD;
      for (const y of [CLOTH_TOP + 7, CLOTH_TOP + CLOTH_H - 5]) g.fillRect(-rw / 2 + 0.5, y, rw + 0.6, 1.5);
    }
  }
}

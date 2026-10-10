/**
 * The getaway ending, part one — on the board (The Getaway, `ending: 'getaway'`).
 *
 * No celebration: the moment the last wave falls, the royal army's war horn
 * sounds behind them. Every champion still standing flinches, glances back the
 * way the foes came, and sprints for the wagon along the road while the hooded
 * driver yells at them to hurry. They fling themselves aboard one after
 * another, the wagon rocking on its springs as each lands; the horn sounds
 * again, nearer, and the team is already lunging off as the last one leaps,
 * the driver cracking the reins, hauling the wagon off the edge of the board
 * in a trail of dust.
 *
 * A director over a finished engine: it never steps the simulation. It takes
 * the champions and the parked wagon off the board (`BoardScene.hideTowers` /
 * `hiddenDecor`) and redraws them as its own depth-sorted actors, lit like the
 * rest of the world; the driver's shout is an unlit overlay. Audio is left to
 * the UI, which drains `cues` each frame.
 */

import type { GameEngine } from '../GameEngine';
import type { Tower } from '../types';
import { BOARD_WIDTH, TILE, type Vec2 } from '../../domain/grid';
import { drawWagonRig, propAnchor, WAGON_WHEEL_R } from '../props';
import type { BoardScene, SceneActor } from '../renderer';
import { ease } from '../palette';
import type { Light } from '../lighting';
import { alongRoute, drawRunner, routeAlongRoad, routeLengths } from './runners';

/** Sound/beat cues for the UI to voice. */
export type GetawayCue = 'horn' | 'hornNear' | 'hop' | 'board' | 'shout' | 'whip' | 'depart';

/** When the army's horn sounds, and the start of the champions' flinch. */
const HORN_AT = 0.1;
/** The flinch and the glance back before the sprint. */
const REACT = 0.55;
/** Target length of the sprint (the farthest champion's run is fitted to it). */
const DASH = 3.1;
const RUN_SPEED_MIN = 130;
const RUN_SPEED_MAX = 330;
/** Bounds per second (a faster runner takes longer strides, not quicker ones). */
const HOP_RATE = 6;
/** Crouch + leap up into the wagon. */
const JUMP_TIME = 0.45;
/** Least gap between two champions leaping aboard. */
const BOARD_GAP = 0.3;
/** How far short of the wagon's tail a champion stops to leap. */
const STOP_BACK = 30;
/** The driver's yell at the runners, shown while they sprint. */
const HURRY_AT = REACT + 0.1;
/** Beats around the last leap: the nearer horn, then the team lunges off mid-leap. */
const HORN_NEAR_BEFORE = 0.5;
const DEPART_INTO_LEAP = 0.5;
const SHOUT_TIME = 1.6;
/** The team's pull: px/s² while hauling away, and its top speed. */
const DEPART_ACCEL = 230;
const DEPART_TOP = 340;
/** Horse stride (px per gait cycle). */
const STRIDE = 42;

interface Rider {
  tower: Tower;
  route: Vec2[];
  /** Cumulative length at each route point. */
  cum: number[];
  length: number;
  start: number;
  speed: number;
  jumpAt: number;
  pos: Vec2;
  lift: number;
  squash: number;
  lean: number;
  alpha: number;
  scale: number;
  faceLeft: boolean;
  hops: number;
  boarded: boolean;
  actor: SceneActor;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
}

export class GetawayBoardScene {
  time = 0;
  /** True once the wagon has gone off the board. */
  done = false;
  readonly cues: GetawayCue[] = [];

  private readonly riders: Rider[] = [];
  private readonly wagonIndex: number;
  private readonly anchor: Vec2;
  private readonly opening: Vec2;
  /** Where the foes came from (the first lane's spawn): the way they glance back. */
  private readonly threat: Vec2;
  private wx = 0;
  private wv = 0;
  private spin = 0;
  private gait = 0;
  private rock = 0;
  private rockV = 0;
  private hornNearAt = Infinity;
  private departAt = Infinity;
  /** The driver's speech bubbles: when each pops up, and what it says. */
  private readonly bubbles: { at: number; text: string }[] = [];
  private departed = false;
  private dustClock = 0;
  private readonly dust: Dust[] = [];
  private readonly scene: BoardScene;
  private readonly lantern: Light = { x: 0, y: 0, radius: 110, family: 'lantern', intensity: 0.8, glow: 1 };

  constructor(private readonly engine: GameEngine) {
    const decor = engine.level.decor ?? [];
    this.wagonIndex = decor.findIndex((p) => p.kind === 'escapeWagon');
    const w = decor[this.wagonIndex];
    this.anchor = w ? propAnchor(w.col, w.row) : { x: BOARD_WIDTH + 200, y: 0 };
    // The rolled-up flap over the cargo: where the champions leap in.
    this.opening = { x: this.anchor.x, y: this.anchor.y + 22 };
    this.threat = engine.lanes[0]?.waypoints[0] ?? { x: 0, y: 0 };

    this.scene = {
      hideTowers: true,
      hiddenDecor: new Set(w ? [this.wagonIndex] : []),
      actors: [],
      lights: [this.lantern],
    };
    this.planRiders();
    if (!w) this.done = true;
  }

  /** The board hooks to pass as `RenderUiState.scene` this frame. */
  get boardScene(): BoardScene {
    return this.scene;
  }

  /** How fast the wagon is rolling away, 0..1 (for the hoofbeats). */
  get wagonSpeed(): number {
    return Math.min(1, this.wv / 220);
  }

  update(dt: number): void {
    const prev = this.time;
    this.time += dt;
    const t = this.time;
    if (prev < HORN_AT && t >= HORN_AT) this.cues.push('horn');
    if (prev < this.hornNearAt && t >= this.hornNearAt) this.cues.push('hornNear');

    for (const r of this.riders) this.updateRider(r, t);

    // Springs: each landing in the bed kicks the wagon, which settles back.
    this.rockV += (-130 * this.rock - 9 * this.rockV) * dt;
    this.rock += this.rockV * dt;

    if (t >= this.departAt) {
      if (!this.departed) {
        // The driver lashes the team on before everyone is even seated.
        this.departed = true;
        this.cues.push('shout', 'whip', 'depart');
        this.rockV += 26;
      }
      this.wv = Math.min(DEPART_TOP, this.wv + DEPART_ACCEL * dt);
      this.wx += this.wv * dt;
      this.spin += (this.wv * dt) / WAGON_WHEEL_R;
      this.gait += ((this.wv * dt) / STRIDE) * Math.PI * 2;
      // Dust thrown up behind the wheels and hooves.
      this.dustClock -= dt;
      if (this.dustClock <= 0) {
        this.dustClock = 0.035;
        const ox = this.anchor.x + TILE + this.wx;
        const oy = this.anchor.y + TILE / 2;
        for (const dx of [-44, 4, 30]) this.puff(ox + dx, oy + 42, -20 - Math.random() * 30, 5 + Math.random() * 3);
      }
      if (this.anchor.x - 30 + this.wx > BOARD_WIDTH + 40) this.done = true;
    }

    for (const d of this.dust) {
      d.age += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= 1 - 1.8 * dt;
      d.vy -= 6 * dt;
    }
    for (let i = this.dust.length - 1; i >= 0; i--) if (this.dust[i].age >= this.dust[i].life) this.dust.splice(i, 1);

    // Rebuild this frame's actors.
    const actors = this.scene.actors!;
    actors.length = 0;
    actors.push({ base: -1e9, draw: (ctx) => this.drawDust(ctx) });
    for (const r of this.riders) if (!r.boarded) actors.push(r.actor);
    const wagonBase = this.anchor.y + 52;
    actors.push({ base: wagonBase, draw: (ctx) => this.drawWagon(ctx) });

    const lx = this.anchor.x + TILE - 6 + this.wx;
    const ly = this.anchor.y + TILE / 2 - 31 - this.rock;
    this.lantern.x = lx;
    this.lantern.y = ly;
    this.lantern.intensity = 0.75 + 0.05 * Math.sin(t * 11) + 0.04 * Math.sin(t * 17.3);
  }

  /** Unlit overlay drawn over the finished board: the driver's yells. */
  drawOverlay(ctx: CanvasRenderingContext2D): void {
    for (const b of this.bubbles) this.drawBubble(ctx, b.text, (this.time - b.at) / SHOUT_TIME);
  }

  private drawBubble(ctx: CanvasRenderingContext2D, text: string, u: number): void {
    if (u < 0 || u > 1) return;
    const pop = u < 0.12 ? ease.outBack(u / 0.12) : u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
    const x = this.anchor.x + TILE + 13 + this.wx;
    const y = this.anchor.y + TILE / 2 - 34 - this.rock;
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

  // -------------------------------------------------------------------------

  /** The wagon's open flap, wherever the wagon has got to. */
  private get mouth(): Vec2 {
    return { x: this.opening.x + this.wx, y: this.opening.y };
  }

  private planRiders(): void {
    const lanes = this.engine.lanes.map((l) => l.waypoints);
    const plans = this.engine.towers.map((tower) => {
      // Onto the road and along it to the wagon's tail, stopping short to leap.
      const route = routeAlongRoad(tower.pos, lanes, STOP_BACK);
      const cum = routeLengths(route);
      return { tower, route, cum, length: cum[cum.length - 1] };
    });
    const longest = plans.reduce((m, p) => Math.max(m, p.length), 0);
    const speed = Math.max(RUN_SPEED_MIN, Math.min(RUN_SPEED_MAX, longest / DASH));
    // Set off together (a touch staggered), arrive in order of distance, never
    // two leaping at once.
    const order = plans
      .map((p, i) => ({ p, i, start: REACT + (i % 4) * 0.05 }))
      .map((o) => ({ ...o, arrive: o.start + o.p.length / speed }))
      .sort((a, b) => a.arrive - b.arrive);
    let last = -Infinity;
    for (const o of order) {
      const arrive = Math.max(o.arrive, last + BOARD_GAP);
      last = arrive;
      const runSpeed = o.p.length > 0 ? o.p.length / Math.max(0.2, arrive - o.start) : speed;
      const rider: Rider = {
        ...o.p,
        start: o.start,
        speed: runSpeed,
        jumpAt: arrive,
        pos: { ...o.p.tower.pos },
        lift: 0,
        squash: 0,
        lean: 0,
        alpha: 1,
        scale: 1,
        // As it last stood on the board (facing its last aim), until the horn.
        faceLeft: o.p.tower.aimTarget ? o.p.tower.aimTarget.x < o.p.tower.pos.x : false,
        hops: 0,
        boarded: false,
        actor: { base: 0, draw: () => {} },
      };
      rider.actor = { base: 0, draw: (ctx) => this.drawRider(ctx, rider) };
      this.riders.push(rider);
    }
    // The team lunges off while the last champion is still in the air.
    const lastLeap = this.riders.length ? last : 0.4;
    this.departAt = lastLeap + (this.riders.length ? JUMP_TIME * DEPART_INTO_LEAP : 0);
    this.hornNearAt = Math.max(HURRY_AT + 0.8, this.departAt - HORN_NEAR_BEFORE);
    if (this.riders.length) this.bubbles.push({ at: HURRY_AT, text: 'They’re coming, hurry!' });
    this.bubbles.push({ at: this.departAt, text: 'Hyah!' });
  }

  private updateRider(r: Rider, t: number): void {
    if (r.boarded) return;
    r.squash = 0;
    r.lift = 0;
    r.lean = 0;
    if (t < r.start) {
      // The horn: a startled jolt and a glance back the way the foes came,
      // then a wheel round for the wagon, crouched to sprint.
      const k = t - HORN_AT - (r.tower.uid % 5) * 0.03;
      if (k > 0 && k < 0.22) {
        const b = Math.sin((Math.PI * k) / 0.22);
        r.lift = b * 5;
        r.squash = k < 0.04 ? 0.14 : -0.06 * b;
      }
      if (k > 0) r.faceLeft = this.threat.x < r.pos.x;
      if (t >= r.start - 0.12) {
        r.faceLeft = this.opening.x < r.pos.x;
        r.squash = 0.12;
      }
    } else if (t < r.jumpAt) {
      // Bounding along the road.
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
        this.puff(r.pos.x - dir.x * 4, r.pos.y + 11, -dir.x * 18, 3.2);
        this.cues.push('hop');
      }
    } else {
      // Crouch, then leap up into the wagon, vanishing under the canvas.
      // The flap moves off with the wagon if the team has already lunged away.
      const u = Math.min(1, (t - r.jumpAt) / JUMP_TIME);
      const stop = r.route[r.route.length - 1];
      const mouth = this.mouth;
      r.faceLeft = mouth.x < stop.x;
      if (u < 0.2) {
        r.pos.x = stop.x;
        r.pos.y = stop.y;
        r.squash = 0.2 * Math.sin((u / 0.2) * Math.PI * 0.5);
      } else {
        const v = (u - 0.2) / 0.8;
        const e = ease.inOutSine(v);
        r.pos.x = stop.x + (mouth.x - stop.x) * e;
        r.pos.y = stop.y + (mouth.y - stop.y) * e;
        r.lift = Math.sin(Math.PI * v) * 30;
        r.squash = v < 0.15 ? -0.12 : 0;
        r.lean = 0.25 * Math.sin(Math.PI * v) * (mouth.x >= stop.x ? 1 : -1);
        r.scale = 1 - 0.3 * Math.max(0, (v - 0.55) / 0.45);
        r.alpha = v < 0.62 ? 1 : 1 - (v - 0.62) / 0.38;
      }
      if (u >= 1) {
        r.boarded = true;
        this.cues.push('board');
        this.rockV -= 26;
        for (let i = 0; i < 5; i++) this.puff(mouth.x + (Math.random() - 0.5) * 18, mouth.y + 2, (Math.random() - 0.5) * 30, 2.6);
      }
    }
    // Depth: a leaping champion stays on its take-off line, in front of the wagon.
    const ground = t >= r.jumpAt ? r.route[r.route.length - 1].y : r.pos.y;
    r.actor.base = ground + 10;
  }

  private drawRider(ctx: CanvasRenderingContext2D, r: Rider): void {
    drawRunner(ctx, this.engine, r.tower.def, r);
  }

  private drawWagon(ctx: CanvasRenderingContext2D): void {
    const moving = this.departed;
    drawWagonRig(ctx, this.anchor.x + this.wx, this.anchor.y, {
      spin: this.spin,
      gait: moving ? this.gait : null,
      speed: Math.min(1, this.wv / 220),
      bob: this.rock + (moving ? Math.abs(Math.sin(this.gait)) * 1.2 : 0),
    });
  }

  private drawDust(ctx: CanvasRenderingContext2D): void {
    for (const d of this.dust) {
      const k = d.age / d.life;
      ctx.fillStyle = `rgba(150,128,96,${0.42 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (1 + k * 1.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private puff(x: number, y: number, vx: number, r: number): void {
    if (this.dust.length > 220) return;
    this.dust.push({ x, y, vx, vy: -6 - Math.random() * 10, age: 0, life: 0.55 + Math.random() * 0.4, r });
  }
}

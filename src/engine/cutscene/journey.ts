/**
 * The getaway ending, part two — the ride (after `getawayBoard.ts`).
 *
 * A side-on travelling shot on the board canvas (768×480): the wagon trots
 * east along a dirt road while the land scrolls past in parallax and a whole
 * day goes by overhead — a rose dawn with the Capital still smoking on the
 * hills behind, a clear blue morning over farmland (a windmill, farmsteads,
 * sheep, a flight of birds), a golden afternoon, a burning sunset as the old
 * forest closes in, and a starlit night. The road slows to a halt before an
 * inn at the forest's edge; its door swings open, the party hops down out of
 * the wagon and bounds inside one by one, and the door shuts behind them.
 *
 * Pure canvas painting over a timeline (`update(dt)` / `draw(ctx)`), no React;
 * cues for the UI's audio are pushed to `cues`, and `speed` exposes how fast
 * the wagon is rolling (for the hoofbeats). Layers, back to front: sky, sun,
 * moon, clouds, mountains, the Capital, far hills, near hills, the midground
 * field, the far roadside, the inn, the road, the wagon and the party, the
 * foreground verge; then the night's darkness, and the lights laid over it.
 */

import { BOARD_HEIGHT, BOARD_WIDTH } from '../../domain/grid';
import type { UnitDef } from '../../domain/units';
import { DEFAULT_BOX, paintFigure, type FigureStyle } from '../figure';
import { drawUnitSprite, hasSprite } from '../sprites';
import { drawWagonRig, WAGON_WHEEL_R } from '../props';
import { ease, mix, shade, withAlpha } from '../palette';
import { FIGURE_SCALE, cfgKey } from '../renderer';

type Ctx = CanvasRenderingContext2D;

const W = BOARD_WIDTH;
const H = BOARD_HEIGHT;
const HORIZON = 262;
const ROAD_TOP = 372;
const ROAD_BOT = 422;
/** Where the wagon's wheels meet the road. */
const ROAD_Y = 402;
/** The rig drawn larger than on the board: the camera is closer. */
const RIG = 1.55;
/** Scroll speed of the road while travelling (px/s). */
const SPEED = 150;
/** The horses' stride in rig px per gait cycle. */
const STRIDE = 42;

/** Timeline (seconds). */
export const JOURNEY = {
  /** The road stops scrolling at a steady pace and starts to slow. */
  slow: 17,
  /** The wagon halts before the inn. */
  stop: 20.5,
  /** The first of the party hops down. */
  dismount: 21.1,
  /** Gap between two of the party hopping down. */
  dismountGap: 0.42,
  /** Hold after the door shuts before the scene counts as finished. */
  hold: 1.6,
};

const DECEL = JOURNEY.stop - JOURNEY.slow;
const S_END = SPEED * JOURNEY.slow + (SPEED * DECEL) / 2;
/** The inn's centre in road-layer world space: it ends up at screen x 585. */
const INN_X = S_END + 585;
const INN_BASE = 368;
/** Where the inn's door is, relative to its centre. */
const DOOR_X = -22;
const WAGON_X0 = 245;
const WAGON_X1 = 372;

export type JourneyCue = 'birds' | 'slow' | 'whoa' | 'door' | 'hop' | 'doorClose' | 'crickets' | 'owl';

/** Road scroll at time `t` (the camera's travel): steady, then easing to a halt. */
function scrollAt(t: number): number {
  if (t < JOURNEY.slow) return SPEED * Math.max(0, t);
  const u = Math.min(DECEL, t - JOURNEY.slow);
  return SPEED * JOURNEY.slow + SPEED * (u - (u * u) / (2 * DECEL));
}

/** The wagon's screen x: it holds its place, then rolls on up to the inn as the road slows. */
function wagonXAt(t: number): number {
  if (t < JOURNEY.slow) return WAGON_X0;
  const u = Math.min(1, (t - JOURNEY.slow) / DECEL);
  return WAGON_X0 + (WAGON_X1 - WAGON_X0) * ease.inOutSine(u);
}

// ---------------------------------------------------------------------------
// Time of day
// ---------------------------------------------------------------------------

interface SkyKey {
  q: number;
  top: string;
  mid: string;
  bottom: string;
  /** Colour distant land fades into. */
  haze: string;
  sun: string;
  /** Night darkness laid over the land (0..1). */
  dark: number;
}

const SKY: SkyKey[] = [
  { q: 0, top: '#2c2c5c', mid: '#c87a8a', bottom: '#f6b98a', haze: '#c99aa0', sun: '#ffd8a8', dark: 0.16 },
  { q: 0.27, top: '#3f6fb8', mid: '#8fb8e0', bottom: '#d8ecf2', haze: '#a9c4d6', sun: '#fff6dc', dark: 0 },
  { q: 0.55, top: '#4466aa', mid: '#a8bcd0', bottom: '#f0dcb0', haze: '#d4c4a4', sun: '#ffe2a0', dark: 0.02 },
  { q: 0.77, top: '#33295e', mid: '#b4567a', bottom: '#f39a52', haze: '#b07a76', sun: '#ff9a50', dark: 0.2 },
  { q: 0.9, top: '#161638', mid: '#4a2e5e', bottom: '#8a4a5a', haze: '#5a4060', sun: '#ff7a40', dark: 0.38 },
  { q: 1, top: '#080b22', mid: '#1c1e44', bottom: '#38305a', haze: '#2e3052', sun: '#c8d4ff', dark: 0.55 },
];

function skyAt(q: number): SkyKey {
  let i = 0;
  while (i < SKY.length - 2 && q > SKY[i + 1].q) i++;
  const a = SKY[i];
  const b = SKY[i + 1];
  const f = Math.max(0, Math.min(1, (q - a.q) / (b.q - a.q)));
  return {
    q,
    top: mix(a.top, b.top, f),
    mid: mix(a.mid, b.mid, f),
    bottom: mix(a.bottom, b.bottom, f),
    haze: mix(a.haze, b.haze, f),
    sun: mix(a.sun, b.sun, f),
    dark: a.dark + (b.dark - a.dark) * f,
  };
}

// ---------------------------------------------------------------------------
// Deterministic scatter
// ---------------------------------------------------------------------------

/** A stable pseudo-random value in [0, 1) for item `i` of a layer (`salt`). */
function hash(i: number, salt: number): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

type Biome = 'farm' | 'meadow' | 'forest';

/** Which stretch of country a feature at layer world x `wx` (parallax `p`) belongs to. */
function biomeAt(wx: number, p: number): Biome {
  const u = (wx - W / 2) / (p * S_END);
  return u < 0.42 ? 'farm' : u < 0.6 ? 'meadow' : 'forest';
}

// ---------------------------------------------------------------------------

interface Rider {
  def: UnitDef;
  /** When it hops down. */
  at: number;
  x: number;
  y: number;
  lift: number;
  squash: number;
  lean: number;
  alpha: number;
  scale: number;
  faceLeft: boolean;
  gone: boolean;
  landed: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
  kind: 'dust' | 'smoke' | 'citySmoke';
}

export class JourneyScene {
  time = 0;
  /** True once the door has shut and the hold has run out. */
  finished = false;
  readonly cues: JourneyCue[] = [];
  /** How fast the wagon is rolling, 0..1 (for the hoofbeats and wheel rumble). */
  speed = 1;

  private readonly riders: Rider[];
  private readonly particles: Particle[] = [];
  private travelled = 0;
  private lastWorld = scrollAt(0) + wagonXAt(0);
  private doorOpen = 0;
  private doorOpenAt = Infinity;
  private doorCloseAt = Infinity;
  private emit = 0;
  private innCache: HTMLCanvasElement | null = null;

  constructor(party: UnitDef[]) {
    this.riders = party.map((def, i) => ({
      def,
      at: JOURNEY.dismount + i * JOURNEY.dismountGap,
      x: 0,
      y: 0,
      lift: 0,
      squash: 0,
      lean: 0,
      alpha: 0,
      scale: 1,
      faceLeft: true,
      gone: false,
      landed: false,
    }));
    if (!party.length) this.doorCloseAt = JOURNEY.dismount + 1.2;
  }

  update(dt: number): void {
    const prev = this.time;
    const t = (this.time += dt);
    const crossed = (at: number) => prev < at && t >= at;
    if (crossed(0.4)) this.cues.push('birds');
    if (crossed(JOURNEY.slow)) this.cues.push('slow');
    if (crossed(JOURNEY.stop - 0.7)) this.cues.push('whoa');
    if (crossed(14.5)) this.cues.push('crickets');
    if (crossed(JOURNEY.stop + 0.3)) this.cues.push('owl');

    // The wagon's travel drives its wheels and team.
    const world = scrollAt(t) + wagonXAt(t);
    const step = world - this.lastWorld;
    this.lastWorld = world;
    this.travelled += step;
    this.speed = dt > 0 ? Math.min(1, step / dt / SPEED) : this.speed;

    // Dust off the wheels while rolling; smoke from the inn's chimney and the
    // burning Capital.
    this.emit -= dt;
    if (this.emit <= 0) {
      this.emit = 0.045;
      const S = scrollAt(t);
      const wx = wagonXAt(t);
      if (this.speed > 0.08) {
        for (const dx of [-44, 4, 30]) {
          this.particles.push({
            x: S + wx + dx * RIG,
            y: ROAD_Y - 2,
            vx: -10 - Math.random() * 20,
            vy: -8 - Math.random() * 10,
            age: 0,
            life: 0.7 + Math.random() * 0.5,
            r: 3 + Math.random() * 3,
            kind: 'dust',
          });
        }
      }
      if (S > S_END - 1200) {
        this.particles.push({ x: INN_X + 70 + Math.random() * 6, y: INN_BASE - 206, vx: 4 + Math.random() * 4, vy: -14 - Math.random() * 6, age: 0, life: 4, r: 5, kind: 'smoke' });
      }
      if (S * 0.18 < 500) {
        for (const cx of [128, 172, 205]) {
          this.particles.push({ x: cx + (Math.random() - 0.5) * 6, y: 250 + Math.random() * 4, vx: 3 + Math.random() * 3, vy: -9 - Math.random() * 5, age: 0, life: 5, r: 3.5, kind: 'citySmoke' });
        }
      }
    }
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'dust') p.vx *= 1 - 1.5 * dt;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) if (this.particles[i].age >= this.particles[i].life) this.particles.splice(i, 1);

    this.updateRiders(t);

    // The door: swings open as the first lands, shuts after the last is in.
    if (crossed(this.doorOpenAt)) this.cues.push('door');
    if (crossed(this.doorCloseAt)) this.cues.push('doorClose');
    const target = t >= this.doorOpenAt && t < this.doorCloseAt ? 1 : 0;
    this.doorOpen += (target - this.doorOpen) * Math.min(1, dt * (target ? 4 : 7));
    if (t > this.doorCloseAt + JOURNEY.hold) this.finished = true;
  }

  draw(ctx: Ctx): void {
    const t = this.time;
    const S = scrollAt(t);
    const q = Math.min(1, t / JOURNEY.stop);
    const sky = skyAt(q);

    ctx.save();
    this.drawSky(ctx, sky);
    this.drawSun(ctx, sky, q);
    this.drawClouds(ctx, sky, S, t);
    this.drawMountains(ctx, sky, S);
    this.drawCity(ctx, sky, S, t);
    this.drawHaze(ctx, sky);
    this.drawHillsFar(ctx, sky, S);
    this.drawHillsNear(ctx, sky, S);
    this.drawField(ctx, sky, S, t);
    this.drawRoadside(ctx, sky, S);
    this.drawInn(ctx, S);
    this.drawParticles(ctx, S, 'smoke');
    this.drawRoad(ctx, sky, S);
    this.drawParticles(ctx, S, 'dust');
    this.drawWagonAndParty(ctx, t, S);
    this.drawForeground(ctx, sky, S);
    this.drawBirds(ctx, t);
    this.drawNight(ctx, sky, S, t);
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // The party

  private updateRiders(t: number): void {
    const wx = wagonXAt(t);
    // Out of the rolled-up flap, down behind the wagon, along the road in
    // front of the team (never behind the wagon), then up the yard to the door.
    const hatch = { x: wx - 48 * RIG, y: ROAD_Y - 44 * RIG };
    const land = { x: wx - 92 * RIG, y: ROAD_Y + 9 };
    const S = scrollAt(t);
    const door = { x: INN_X - S + DOOR_X, y: INN_BASE + 2 };
    const route = [land, { x: wx + 82 * RIG, y: ROAD_Y + 11 }, door];
    const legs = [Math.hypot(route[1].x - land.x, route[1].y - land.y), Math.hypot(door.x - route[1].x, door.y - route[1].y)];
    const runSpeed = 175;
    for (const r of this.riders) {
      if (t < r.at) continue;
      const u = t - r.at;
      r.lean = 0;
      r.squash = 0;
      r.lift = 0;
      const hopT = 0.48;
      if (u < hopT) {
        // Down out of the back of the wagon.
        const k = u / hopT;
        r.alpha = Math.min(1, k * 3);
        r.scale = 0.75 + 0.25 * Math.min(1, k * 1.6);
        r.x = hatch.x + (land.x - hatch.x) * k;
        r.y = hatch.y + (land.y - hatch.y) * ease.inCubic(k);
        r.lift = Math.sin(Math.PI * k) * 18;
        r.faceLeft = true;
        r.lean = -0.18 * Math.sin(Math.PI * k);
      } else {
        if (!r.landed) {
          r.landed = true;
          this.cues.push('hop');
          if (this.doorOpenAt === Infinity) this.doorOpenAt = t;
        }
        // A beat to turn, then bounding off to the door.
        const runStart = hopT + 0.18;
        const len = legs[0] + legs[1];
        const s = Math.max(0, (u - runStart) * runSpeed);
        const k = Math.min(1, s / len);
        const onFirst = s < legs[0];
        const a = onFirst ? route[0] : route[1];
        const b = onFirst ? route[1] : route[2];
        const f = onFirst ? s / legs[0] : Math.min(1, (s - legs[0]) / legs[1]);
        r.x = a.x + (b.x - a.x) * f;
        r.y = a.y + (b.y - a.y) * f;
        r.alpha = 1;
        r.faceLeft = u < runStart * 0.85;
        if (u < runStart) r.squash = 0.14 * (1 - (u - hopT) / (runStart - hopT));
        else {
          const b = Math.abs(Math.sin((Math.PI * s) / 26));
          r.lift = b * 7;
          r.squash = b < 0.25 ? 0.12 * (1 - b / 0.25) : -0.05 * b;
          r.lean = 0.12;
        }
        // Smaller as it heads up the yard, away from the camera.
        r.scale = 1 - 0.14 * (onFirst ? 0 : f);
        if (k >= 1) {
          // Through the door: fading into the light.
          const fade = (s - len) / (runSpeed * 0.32);
          r.alpha = Math.max(0, 1 - fade);
          r.scale *= 1 - 0.15 * Math.min(1, fade);
          r.lift = 0;
          if (fade >= 1) r.gone = true;
        }
      }
    }
    if (this.riders.length && this.riders.every((r) => r.gone) && this.doorCloseAt === Infinity) {
      this.doorCloseAt = t + 0.25;
    }
  }

  private drawWagonAndParty(ctx: Ctx, t: number, S: number): void {
    const wx = wagonXAt(t);
    const rolling = this.speed > 0.03;
    const spin = this.travelled / (WAGON_WHEEL_R * RIG);
    const gait = (this.travelled / (STRIDE * RIG)) * Math.PI * 2;
    const items: { y: number; draw: () => void }[] = [];
    items.push({
      y: ROAD_Y,
      draw: () => {
        ctx.save();
        ctx.translate(wx, ROAD_Y);
        ctx.scale(RIG, RIG);
        // Rig origin = anchor + (48, 24); its wheels touch y = 42 below it.
        drawWagonRig(ctx, -48, -66, {
          spin: rolling ? spin : 0,
          gait: rolling ? gait : null,
          speed: Math.min(1, this.speed * 0.75),
          bob: rolling ? Math.abs(Math.sin(gait)) * 1.4 * this.speed : 0,
        });
        ctx.restore();
      },
    });
    for (const r of this.riders) {
      if (t < r.at || r.gone) continue;
      items.push({ y: r.y, draw: () => this.drawRider(ctx, r) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    void S;
  }

  private drawRider(ctx: Ctx, r: Rider): void {
    const def = r.def;
    const shape = def.visual.shape;
    const cfg = def.visual.playerConfig;
    const scale = RIG * FIGURE_SCALE * r.scale;
    ctx.save();
    ctx.globalAlpha *= r.alpha;
    ctx.translate(r.x, r.y);
    const k = 1 - Math.min(1, r.lift / 40) * 0.5;
    ctx.fillStyle = `rgba(8,5,14,${0.35 * k})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16 * k * r.scale, 5 * k * r.scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(0, -r.lift);
    ctx.rotate(r.lean);
    ctx.scale(scale * (1 + r.squash * 0.6), scale * (1 - r.squash));
    ctx.translate(0, -11);
    if (hasSprite(shape)) {
      const style: FigureStyle = {
        accent: cfg?.outfitColor ?? def.visual.color,
        outline: 0.9,
        rim: '#ffe6c0',
        rimAlpha: cfg ? 0.1 : 0.4,
        shading: cfg ? 0.5 : 1,
        headY: -20,
        feetY: 12,
        box: DEFAULT_BOX,
      };
      paintFigure(
        ctx,
        (g) => drawUnitSprite(g, shape, def.visual.color, r.faceLeft, 0, false, false, cfg, 0),
        style,
        `jour|${shape}|${def.visual.color}|${r.faceLeft ? 1 : 0}|${cfgKey(cfg)}`,
      );
    } else {
      ctx.fillStyle = def.visual.color;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Sky

  private drawSky(ctx: Ctx, sky: SkyKey): void {
    const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 30);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.6, sky.mid);
    g.addColorStop(1, sky.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HORIZON + 80);
  }

  /** The sun's arc across the day: up from the left at dawn, down behind the hills at dusk. */
  private sunPos(q: number): { x: number; y: number } {
    const s = Math.min(1, q / 0.88);
    return { x: 70 + s * 640, y: HORIZON + 14 - Math.sin(s * Math.PI) * 200 };
  }

  private drawSun(ctx: Ctx, sky: SkyKey, q: number): void {
    const { x, y } = this.sunPos(q);
    if (y > HORIZON + 40) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const low = 1 - Math.min(1, (HORIZON - y) / 140);
    const glow = ctx.createRadialGradient(x, y, 4, x, y, 120 + low * 80);
    glow.addColorStop(0, withAlpha(sky.sun, 0.55));
    glow.addColorStop(0.3, withAlpha(sky.sun, 0.2));
    glow.addColorStop(1, withAlpha(sky.sun, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - 220, y - 220, 440, 440);
    ctx.restore();
    ctx.fillStyle = mix(sky.sun, '#ffffff', 0.45);
    ctx.beginPath();
    ctx.arc(x, y, 17 + low * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawClouds(ctx: Ctx, sky: SkyKey, S: number, t: number): void {
    const lit = mix(sky.bottom, '#ffffff', 0.35);
    const dim = mix(sky.top, sky.mid, 0.6);
    for (let i = 0; i < 8; i++) {
      const span = 1180;
      const base = hash(i, 1) * span;
      const x = ((((base - S * 0.035 - t * 5) % span) + span) % span) - 200;
      const y = 50 + hash(i, 2) * 130;
      const s = 0.6 + hash(i, 3) * 0.9;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s * 0.8);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = dim;
      for (const [cx, cy, r] of [[0, 6, 26], [30, 0, 30], [62, 8, 22], [-24, 10, 16], [86, 12, 14]] as const) {
        ctx.beginPath();
        ctx.ellipse(cx, cy + 4, r * 1.2, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = lit;
      for (const [cx, cy, r] of [[2, 2, 22], [30, -4, 26], [60, 4, 18], [-20, 6, 12]] as const) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 1.15, r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // The land, back to front

  private ridge(ctx: Ctx, off: number, f: (wx: number) => number, color: string, bottom = H): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-10, bottom);
    for (let x = -10; x <= W + 10; x += 6) ctx.lineTo(x, f(x + off));
    ctx.lineTo(W + 10, bottom);
    ctx.closePath();
    ctx.fill();
  }

  private drawMountains(ctx: Ctx, sky: SkyKey, S: number): void {
    const off = S * 0.04;
    const m = (wx: number) =>
      206 + 26 * Math.sin(wx * 0.0105) + 15 * Math.sin(wx * 0.027 + 1.3) + 7 * Math.sin(wx * 0.071 + 0.4) - 22 * Math.max(0, Math.sin(wx * 0.0042 + 0.8));
    this.ridge(ctx, off, m, mix('#5e6a8a', sky.haze, 0.62), HORIZON + 40);
    // Snow on the high peaks, catching the light.
    ctx.strokeStyle = withAlpha(mix('#ffffff', sky.sun, 0.3), 0.45);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const y = m(x + off);
      if (y < 196) ctx.lineTo(x, y + 1);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  /** The Capital on the hills behind, still smoking from the fire. */
  private drawCity(ctx: Ctx, sky: SkyKey, S: number, t: number): void {
    const x0 = 165 - S * 0.18;
    if (x0 < -180) return;
    const col = mix('#3a3448', sky.haze, 0.42);
    const baseY = 262;
    ctx.save();
    ctx.translate(x0, baseY);
    // The hill it sits on.
    ctx.fillStyle = mix('#4a5a4a', sky.haze, 0.5);
    ctx.beginPath();
    ctx.ellipse(10, 18, 150, 30, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = col;
    // Walls and roofs.
    ctx.fillRect(-110, -14, 230, 20);
    for (let i = 0; i < 18; i++) {
      const x = -104 + i * 12.5;
      const h = 8 + hash(i, 9) * 14;
      ctx.beginPath();
      ctx.moveTo(x, -14);
      ctx.lineTo(x + 6, -14 - h);
      ctx.lineTo(x + 12, -14);
      ctx.fill();
    }
    // Towers and the castle keep on the crest.
    for (const [x, w, h] of [[-80, 12, 40], [-30, 14, 52], [8, 30, 74], [44, 14, 56], [92, 12, 38]] as const) {
      ctx.fillRect(x - w / 2, -14 - h, w, h);
      ctx.beginPath();
      ctx.moveTo(x - w / 2 - 3, -14 - h);
      ctx.lineTo(x, -14 - h - w * 0.9);
      ctx.lineTo(x + w / 2 + 3, -14 - h);
      ctx.fill();
    }
    ctx.restore();
    // Smoke rising off it in slow columns.
    this.drawParticles(ctx, 0, 'citySmoke', S * 0.18);
    // The fires still burning, glowing at the foot of the smoke.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const cx of [-37, 7, 40]) {
      const fl = 0.5 + 0.2 * Math.sin(t * 6 + cx);
      const g = ctx.createRadialGradient(x0 + cx, baseY - 18, 1, x0 + cx, baseY - 18, 26);
      g.addColorStop(0, `rgba(255,140,60,${0.45 * fl})`);
      g.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x0 + cx - 30, baseY - 48, 60, 60);
    }
    ctx.restore();
  }

  private drawHaze(ctx: Ctx, sky: SkyKey): void {
    const g = ctx.createLinearGradient(0, HORIZON - 30, 0, HORIZON + 40);
    g.addColorStop(0, withAlpha(sky.haze, 0));
    g.addColorStop(0.6, withAlpha(sky.haze, 0.4));
    g.addColorStop(1, withAlpha(sky.haze, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, HORIZON - 30, W, 70);
  }

  private drawHillsFar(ctx: Ctx, sky: SkyKey, S: number): void {
    const off = S * 0.14;
    const f = (wx: number) => 272 + 10 * Math.sin(wx * 0.008) + 6 * Math.sin(wx * 0.021 + 2);
    const col = mix('#5d7a52', sky.haze, 0.5);
    this.ridge(ctx, off, f, col, 322);
    // Copses dotted along the ridge.
    ctx.fillStyle = shade(col, -0.12);
    const sp = 34;
    for (let i = Math.floor((off - 40) / sp); i < (off + W + 40) / sp; i++) {
      if (hash(i, 21) < 0.45) continue;
      const wx = i * sp + hash(i, 22) * sp;
      const x = wx - off;
      const forest = biomeAt(wx, 0.14) === 'forest';
      const r = 4 + hash(i, 23) * 4;
      if (forest) {
        ctx.beginPath();
        ctx.moveTo(x - r, f(wx) + 2);
        ctx.lineTo(x, f(wx) - r * 3);
        ctx.lineTo(x + r, f(wx) + 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x, f(wx) - r * 0.6, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawHillsNear(ctx: Ctx, sky: SkyKey, S: number): void {
    const off = S * 0.3;
    const f = (wx: number) => 300 + 12 * Math.sin(wx * 0.006 + 1) + 7 * Math.sin(wx * 0.017);
    const col = mix('#4f6e40', sky.haze, 0.3);
    this.ridge(ctx, off, f, col, 348);
    // Field strips and hedgerows on the farmland; a wall of pines in the forest.
    const sp = 26;
    for (let i = Math.floor((off - 60) / sp); i < (off + W + 60) / sp; i++) {
      const wx = i * sp + hash(i, 31) * sp * 0.5;
      const x = wx - off;
      const y = f(wx);
      const biome = biomeAt(wx, 0.3);
      if (biome === 'forest' || (biome === 'meadow' && hash(i, 32) < 0.35)) {
        const h = 22 + hash(i, 33) * 18;
        this.pine(ctx, x, y + 4, h, shade(col, -0.22), shade(col, -0.05));
      } else if (hash(i, 34) < 0.22) {
        ctx.fillStyle = shade(col, -0.16);
        ctx.beginPath();
        ctx.arc(x, y - 4, 6 + hash(i, 35) * 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (biome === 'farm' && hash(i, 36) < 0.12) {
        // A distant farmstead.
        ctx.fillStyle = shade(col, 0.35);
        ctx.fillRect(x - 6, y - 7, 12, 7);
        ctx.fillStyle = mix('#8a3a30', sky.haze, 0.4);
        ctx.beginPath();
        ctx.moveTo(x - 8, y - 7);
        ctx.lineTo(x, y - 13);
        ctx.lineTo(x + 8, y - 7);
        ctx.fill();
      }
    }
  }

  private drawField(ctx: Ctx, sky: SkyKey, S: number, t: number): void {
    const off = S * 0.56;
    const f = (wx: number) => 334 + 4 * Math.sin(wx * 0.01);
    const col = mix('#5a7a44', sky.haze, 0.16);
    this.ridge(ctx, off, f, col, 356);
    // Furrowed strips in the farmland.
    const sp = 128;
    for (let i = Math.floor((off - 300) / sp); i < (off + W + 300) / sp; i++) {
      const wx = i * sp + hash(i, 41) * sp * 0.4;
      const x = wx - off;
      const y = f(wx);
      const biome = biomeAt(wx, 0.56);
      const r = hash(i, 42);
      if (biome === 'forest') {
        for (let k = 0; k < 3; k++) {
          const px = x + k * 42 + hash(i * 3 + k, 43) * 20;
          this.pine(ctx, px, y + 6, 70 + hash(i * 3 + k, 44) * 50, shade(col, -0.32), shade(col, -0.12));
        }
      } else if (biome === 'farm' && i % 9 === 3) {
        this.windmill(ctx, x, y + 2, shade(col, 0.5), t);
      } else if (biome === 'farm' && r < 0.3) {
        this.farmhouse(ctx, x, y + 4, sky);
      } else if (biome === 'farm' && r < 0.5) {
        for (let k = 0; k < 3; k++) this.haystack(ctx, x + k * 18, y + 6 + (k % 2) * 3, sky);
      } else if (r < 0.72) {
        for (let k = 0; k < 4; k++) this.sheep(ctx, x + k * 11 + hash(i + k, 45) * 6, y + 9 + hash(i + k, 46) * 6, t + k);
      } else {
        this.roundTree(ctx, x, y + 6, 26 + r * 12, shade(col, -0.2), shade(col, 0.06));
      }
    }
  }

  private drawRoadside(ctx: Ctx, sky: SkyKey, S: number): void {
    const off = S;
    const col = mix('#4e7a3a', sky.haze, 0.04);
    ctx.fillStyle = col;
    ctx.fillRect(0, 352, W, ROAD_TOP - 352 + 2);
    // A soft edge where the field meets the verge.
    const g = ctx.createLinearGradient(0, 340, 0, 358);
    g.addColorStop(0, withAlpha(col, 0));
    g.addColorStop(1, col);
    ctx.fillStyle = g;
    ctx.fillRect(0, 340, W, 18);
    // Fence along the farmland, then trees; the forest crowds in at the end.
    const sp = 36;
    ctx.lineCap = 'round';
    for (let i = Math.floor((off - 80) / sp); i < (off + W + 80) / sp; i++) {
      const wx = i * sp;
      if (Math.abs(wx - INN_X) < 260) continue;
      const x = wx - off;
      const biome = biomeAt(wx, 1);
      if (biome === 'farm') {
        ctx.strokeStyle = '#6a5034';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, ROAD_TOP - 4);
        ctx.lineTo(x, ROAD_TOP - 22);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#7a6040';
        ctx.beginPath();
        ctx.moveTo(x, ROAD_TOP - 17);
        ctx.lineTo(x + sp, ROAD_TOP - 17);
        ctx.moveTo(x, ROAD_TOP - 10);
        ctx.lineTo(x + sp, ROAD_TOP - 10);
        ctx.stroke();
      }
      if (biome !== 'farm' && hash(i, 51) < 0.45) {
        const tall = biome === 'forest' ? 90 + hash(i, 52) * 60 : 60;
        if (biome === 'forest' || hash(i, 53) < 0.4) this.pine(ctx, x, ROAD_TOP - 2, tall, '#1e3a2a', '#3a6a44');
        else this.roundTree(ctx, x, ROAD_TOP - 2, 52, '#2e5a2c', '#5a9a48');
      } else if (biome === 'farm' && i % 23 === 7) {
        this.roundTree(ctx, x + 10, ROAD_TOP - 4, 64, '#2e5a2c', '#5a9a48');
      }
      if (i % 31 === 11) this.milestone(ctx, x + 14, ROAD_TOP - 3);
    }
    ctx.lineCap = 'butt';
  }

  private drawRoad(ctx: Ctx, sky: SkyKey, S: number): void {
    const dirt = mix('#8a7254', sky.haze, 0.05);
    const g = ctx.createLinearGradient(0, ROAD_TOP, 0, ROAD_BOT);
    g.addColorStop(0, shade(dirt, -0.1));
    g.addColorStop(1, shade(dirt, 0.08));
    ctx.fillStyle = g;
    ctx.fillRect(0, ROAD_TOP, W, ROAD_BOT - ROAD_TOP);
    ctx.fillStyle = shade(dirt, -0.35);
    ctx.fillRect(0, ROAD_TOP, W, 2);
    // Wheel ruts.
    for (const y of [ROAD_Y - 6, ROAD_Y + 9]) {
      ctx.fillStyle = withAlpha(shade(dirt, -0.3), 0.55);
      ctx.fillRect(0, y, W, 3);
    }
    // Stones and tufts scrolling past.
    const sp = 17;
    for (let i = Math.floor(S / sp) - 1; i < (S + W) / sp + 1; i++) {
      const x = i * sp + hash(i, 61) * sp - S;
      const y = ROAD_TOP + 5 + hash(i, 62) * (ROAD_BOT - ROAD_TOP - 8);
      const r = 0.8 + hash(i, 63) * 1.8;
      ctx.fillStyle = hash(i, 64) < 0.5 ? shade(dirt, 0.25) : shade(dirt, -0.25);
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.4, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The verge below the road.
    const verge = mix('#46703a', sky.haze, 0.02);
    ctx.fillStyle = verge;
    ctx.fillRect(0, ROAD_BOT, W, H - ROAD_BOT);
    ctx.fillStyle = shade(verge, -0.2);
    ctx.fillRect(0, ROAD_BOT, W, 2);
    for (let i = Math.floor(S / 9) - 1; i < (S + W) / 9 + 1; i++) {
      const x = i * 9 + hash(i, 65) * 9 - S;
      const y = ROAD_BOT + 4 + hash(i, 66) * 30;
      ctx.strokeStyle = hash(i, 67) < 0.5 ? shade(verge, 0.2) : shade(verge, -0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1.5, y - 4 - hash(i, 68) * 4);
      ctx.stroke();
    }
  }

  private drawForeground(ctx: Ctx, sky: SkyKey, S: number): void {
    const off = S * 1.5;
    const col = shade(mix('#2e4a26', sky.haze, 0), -0.1);
    const sp = 34;
    for (let i = Math.floor((off - 60) / sp); i < (off + W + 60) / sp; i++) {
      const x = i * sp + hash(i, 71) * sp - off;
      const big = hash(i, 72) < 0.08;
      ctx.fillStyle = col;
      if (big) {
        // A dark bush sweeping past right in front of the camera.
        for (const [dx, dy, r] of [[0, 0, 26], [22, 6, 20], [-20, 8, 18]] as const) {
          ctx.beginPath();
          ctx.arc(x + dx, H + 6 + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          ctx.moveTo(x + k * 3, H);
          ctx.quadraticCurveTo(x + k * 3 + 2, H - 8, x + k * 3 + 4 + hash(i + k, 73) * 4, H - 12 - hash(i + k, 74) * 12);
        }
        ctx.stroke();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Night, and the lights that shine through it

  private drawNight(ctx: Ctx, sky: SkyKey, S: number, t: number): void {
    if (sky.dark > 0.005) {
      ctx.fillStyle = withAlpha('#060a1e', sky.dark);
      ctx.fillRect(0, 0, W, H);
    }
    const q = sky.q;
    // Stars and the moon.
    const stars = Math.max(0, (q - 0.8) / 0.2);
    if (stars > 0) {
      for (let i = 0; i < 70; i++) {
        const x = hash(i, 81) * W;
        const y = hash(i, 82) * (HORIZON - 40);
        const tw = 0.6 + 0.4 * Math.sin(t * (1 + hash(i, 83) * 3) + i);
        ctx.fillStyle = `rgba(235,240,255,${stars * tw * (0.4 + hash(i, 84) * 0.6)})`;
        ctx.fillRect(x, y, 1.4, 1.4);
      }
      const my = 150 - stars * 70;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const mg = ctx.createRadialGradient(150, my, 2, 150, my, 70);
      mg.addColorStop(0, `rgba(200,214,255,${0.35 * stars})`);
      mg.addColorStop(1, 'rgba(200,214,255,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(80, my - 70, 140, 140);
      ctx.restore();
      ctx.fillStyle = `rgba(236,240,255,${stars})`;
      ctx.beginPath();
      ctx.arc(150, my, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(190,200,230,${0.5 * stars})`;
      for (const [dx, dy, r] of [[-4, -3, 3], [4, 3, 2.2], [3, -5, 1.4]] as const) {
        ctx.beginPath();
        ctx.arc(150 + dx, my + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const night = Math.min(1, sky.dark / 0.5);
    // The inn's windows and open door.
    const ix = INN_X - S;
    if (ix > -260 && ix < W + 260) {
      for (const [dx, dy, r] of INN_WINDOWS) {
        const fl = 0.85 + 0.15 * Math.sin(t * 7 + dx);
        const g = ctx.createRadialGradient(ix + dx, INN_BASE + dy, 1, ix + dx, INN_BASE + dy, r);
        g.addColorStop(0, `rgba(255,200,110,${(0.25 + 0.45 * night) * fl})`);
        g.addColorStop(1, 'rgba(255,150,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(ix + dx - r, INN_BASE + dy - r, r * 2, r * 2);
      }
      if (this.doorOpen > 0.01) {
        const d = this.doorOpen;
        const dx = ix + DOOR_X;
        const spill = ctx.createLinearGradient(0, INN_BASE - 40, 0, ROAD_BOT + 30);
        spill.addColorStop(0, `rgba(255,196,110,${0.5 * d})`);
        spill.addColorStop(1, 'rgba(255,160,70,0)');
        ctx.fillStyle = spill;
        ctx.beginPath();
        ctx.moveTo(dx - 15 * d, INN_BASE - 2);
        ctx.lineTo(dx + 15 * d, INN_BASE - 2);
        ctx.lineTo(dx + 60 * d, ROAD_BOT + 30);
        ctx.lineTo(dx - 50 * d, ROAD_BOT + 30);
        ctx.closePath();
        ctx.fill();
      }
      // The lantern by the door.
      const lg = ctx.createRadialGradient(ix - 62, INN_BASE - 66, 1, ix - 62, INN_BASE - 66, 60);
      lg.addColorStop(0, `rgba(255,214,140,${0.25 + 0.5 * night})`);
      lg.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(ix - 122, INN_BASE - 126, 120, 120);
    }
    // The wagon's lantern.
    if (night > 0.05) {
      const wx = wagonXAt(t) - 6 * RIG;
      const wy = ROAD_Y - (42 + 31) * RIG;
      const fl = 0.9 + 0.1 * Math.sin(t * 13);
      const g = ctx.createRadialGradient(wx, wy, 1, wx, wy, 70);
      g.addColorStop(0, `rgba(255,214,140,${0.5 * night * fl})`);
      g.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(wx - 70, wy - 70, 140, 140);
    }
    // Fireflies over the meadow at dusk.
    const ff = Math.max(0, (q - 0.72) / 0.28);
    if (ff > 0) {
      for (let i = 0; i < 26; i++) {
        const x = ((hash(i, 91) * W + Math.sin(t * 0.5 + i) * 30) % W + W) % W;
        const y = 300 + hash(i, 92) * 120 + Math.sin(t * 0.9 + i * 2) * 10;
        const blink = Math.max(0, Math.sin(t * (1.5 + hash(i, 93) * 2) + i * 3));
        const a = ff * blink * 0.8;
        if (a < 0.02) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 6);
        g.addColorStop(0, `rgba(220,255,140,${a})`);
        g.addColorStop(1, 'rgba(200,255,120,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 6, y - 6, 12, 12);
      }
    }
    // Dawn: low warm light raking in from the rising sun.
    if (q < 0.25) {
      const k = 1 - q / 0.25;
      const g = ctx.createLinearGradient(0, 0, W * 0.8, H * 0.6);
      g.addColorStop(0, `rgba(255,170,110,${0.22 * k})`);
      g.addColorStop(1, 'rgba(255,170,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // The inn at the forest's edge

  private drawInn(ctx: Ctx, S: number): void {
    const ix = INN_X - S;
    if (ix < -300 || ix > W + 300) return;
    // A wall of old forest behind and around it.
    for (const [dx, h, k] of [[-210, 150, 0], [-170, 190, 1], [-120, 220, 2], [150, 210, 3], [205, 170, 4], [250, 200, 5], [300, 160, 6], [-260, 140, 7]] as const) {
      this.pine(ctx, ix + dx + hash(k, 101) * 10, INN_BASE - 4, h, '#18301f', '#2e5a38');
    }
    if (!this.innCache) this.innCache = paintInnCache();
    const c = this.innCache;
    ctx.drawImage(c, ix - INN_ORIGIN.x, INN_BASE - INN_ORIGIN.y, c.width / INN_RES, c.height / INN_RES);
    // The door: open onto a warm interior, or shut.
    const dx = ix + DOOR_X;
    const top = INN_BASE - 54;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dx - 17, INN_BASE);
    ctx.lineTo(dx - 17, top + 17);
    ctx.arc(dx, top + 17, 17, Math.PI, 0);
    ctx.lineTo(dx + 17, INN_BASE);
    ctx.closePath();
    ctx.clip();
    const inside = ctx.createLinearGradient(0, top, 0, INN_BASE);
    inside.addColorStop(0, '#ffcf80');
    inside.addColorStop(1, '#c8702a');
    ctx.fillStyle = inside;
    ctx.fillRect(dx - 18, top - 2, 36, 58);
    // The door leaf swings in (narrowing toward its hinge).
    const w = 34 * (1 - this.doorOpen * 0.85);
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(dx - 17, top - 2, w, 58);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let k = 1; k < 4; k++) ctx.fillRect(dx - 17 + (w / 4) * k, top - 2, 0.8, 58);
    ctx.fillStyle = '#2a2420';
    ctx.fillRect(dx - 17, top + 14, w, 1.6);
    ctx.fillRect(dx - 17, top + 38, w, 1.6);
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Particles

  private drawParticles(ctx: Ctx, S: number, kind: Particle['kind'], shift = 0): void {
    for (const p of this.particles) {
      if (p.kind !== kind) continue;
      const k = p.age / p.life;
      const x = kind === 'dust' ? p.x - S : kind === 'smoke' ? p.x - S : p.x - shift;
      if (kind === 'dust') ctx.fillStyle = `rgba(160,136,104,${0.4 * (1 - k)})`;
      else if (kind === 'smoke') ctx.fillStyle = `rgba(150,150,160,${0.35 * (1 - k)})`;
      else ctx.fillStyle = `rgba(70,60,70,${0.4 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(x, p.y, p.r * (1 + k * 2.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // -------------------------------------------------------------------------
  // Scenery pieces

  private pine(ctx: Ctx, x: number, y: number, h: number, dark: string, lit: string): void {
    const w = h * 0.34;
    ctx.fillStyle = shade(dark, -0.2);
    ctx.fillRect(x - h * 0.025, y - h * 0.16, h * 0.05, h * 0.16);
    for (let k = 0; k < 4; k++) {
      const base = y - h * 0.1 - k * h * 0.2;
      const half = w * (1 - k * 0.2);
      const top = base - h * 0.34;
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(x - half, base);
      ctx.lineTo(x, top);
      ctx.lineTo(x + half, base);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = lit;
      ctx.beginPath();
      ctx.moveTo(x - half, base);
      ctx.lineTo(x, top);
      ctx.lineTo(x - half * 0.15, base);
      ctx.closePath();
      ctx.fill();
    }
  }

  private roundTree(ctx: Ctx, x: number, y: number, h: number, dark: string, lit: string): void {
    ctx.fillStyle = '#4a3424';
    ctx.fillRect(x - h * 0.04, y - h * 0.38, h * 0.08, h * 0.38);
    ctx.fillStyle = dark;
    for (const [dx, dy, r] of [[0, -0.62, 0.3], [-0.2, -0.5, 0.22], [0.22, -0.52, 0.22]] as const) {
      ctx.beginPath();
      ctx.arc(x + dx * h, y + dy * h, r * h, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = lit;
    for (const [dx, dy, r] of [[-0.08, -0.7, 0.16], [-0.24, -0.55, 0.1]] as const) {
      ctx.beginPath();
      ctx.arc(x + dx * h, y + dy * h, r * h, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private windmill(ctx: Ctx, x: number, y: number, col: string, t: number): void {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - 11, y);
    ctx.lineTo(x - 6, y - 52);
    ctx.lineTo(x + 6, y - 52);
    ctx.lineTo(x + 11, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(col, -0.35);
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 52);
    ctx.lineTo(x, y - 62);
    ctx.lineTo(x + 9, y - 52);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 2, y - 14, 4, 8);
    ctx.save();
    ctx.translate(x, y - 54);
    ctx.rotate(t * 0.9);
    ctx.fillStyle = shade(col, -0.45);
    for (let k = 0; k < 4; k++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillRect(-1, 0, 2, 30);
      ctx.fillStyle = withAlpha(shade(col, 0.15), 0.9);
      ctx.fillRect(1, 8, 7, 22);
      ctx.fillStyle = shade(col, -0.45);
    }
    ctx.restore();
  }

  private farmhouse(ctx: Ctx, x: number, y: number, sky: SkyKey): void {
    ctx.fillStyle = mix('#e0d0aa', sky.haze, 0.15);
    ctx.fillRect(x - 18, y - 16, 36, 16);
    ctx.fillStyle = mix('#8a3a30', sky.haze, 0.15);
    ctx.beginPath();
    ctx.moveTo(x - 22, y - 15);
    ctx.lineTo(x, y - 32);
    ctx.lineTo(x + 22, y - 15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(x - 3, y - 9, 6, 9);
    ctx.fillStyle = '#e8b860';
    ctx.fillRect(x - 13, y - 12, 5, 5);
    ctx.fillRect(x + 8, y - 12, 5, 5);
  }

  private haystack(ctx: Ctx, x: number, y: number, sky: SkyKey): void {
    ctx.fillStyle = mix('#d8b05a', sky.haze, 0.1);
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.quadraticCurveTo(x - 8, y - 16, x, y - 17);
    ctx.quadraticCurveTo(x + 8, y - 16, x + 8, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,30,0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 6);
    ctx.lineTo(x + 7, y - 6);
    ctx.stroke();
  }

  private sheep(ctx: Ctx, x: number, y: number, t: number): void {
    const graze = Math.sin(t * 0.7) > 0.3 ? 2 : 0;
    ctx.fillStyle = '#f0ece0';
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 5, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2420';
    ctx.beginPath();
    ctx.ellipse(x + 5, y - 5 + graze, 1.8, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 3, y - 1.5, 1, 2);
    ctx.fillRect(x + 2, y - 1.5, 1, 2);
  }

  private milestone(ctx: Ctx, x: number, y: number): void {
    ctx.fillStyle = '#9a968a';
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x - 5, y - 13);
    ctx.arc(x, y - 13, 5, Math.PI, 0);
    ctx.lineTo(x + 5, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(40,36,30,0.6)';
    ctx.fillRect(x - 2.5, y - 12, 5, 1);
    ctx.fillRect(x - 2.5, y - 9, 5, 1);
  }

  private drawBirds(ctx: Ctx, t: number): void {
    const u = (t - 3.2) / 7;
    if (u < 0 || u > 1) return;
    ctx.strokeStyle = 'rgba(30,30,50,0.75)';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const row = Math.abs(i - 3);
      const x = W + 40 - u * (W + 160) + row * 14 + i * 2;
      const y = 112 + row * 8 + Math.sin(t * 1.3 + i) * 3;
      const flap = Math.sin(t * 9 + i * 1.7) * 3;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - flap);
      ctx.quadraticCurveTo(x - 3, y - 2, x, y);
      ctx.quadraticCurveTo(x + 3, y - 2, x + 6, y - flap);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
}

// ---------------------------------------------------------------------------
// The inn, painted once into a cache (the door and its light are drawn live)
// ---------------------------------------------------------------------------

/** Cache resolution (device pixels per scene pixel). */
const INN_RES = 2;
/** The inn's base-centre within its cache canvas (scene px). */
const INN_ORIGIN = { x: 170, y: 232 };
/** Window glows over the inn at night: [dx, dy, radius] from its base centre. */
const INN_WINDOWS: [number, number, number][] = [
  [-80, -40, 36],
  [45, -40, 36],
  [85, -40, 36],
  [-80, -108, 32],
  [-14, -108, 32],
  [58, -108, 32],
  [1, -172, 24],
];

function paintInnCache(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 380 * INN_RES;
  c.height = 250 * INN_RES;
  const g = c.getContext('2d')!;
  g.scale(INN_RES, INN_RES);
  g.translate(INN_ORIGIN.x, INN_ORIGIN.y);
  paintInn(g);
  return c;
}

function stones(g: Ctx, x: number, y: number, w: number, h: number, base: string, seed: number): void {
  g.fillStyle = shade(base, -0.4);
  g.fillRect(x, y, w, h);
  let row = 0;
  for (let yy = y; yy < y + h; yy += 7) {
    let xx = x - (row % 2) * 6;
    while (xx < x + w) {
      const sw = 10 + hash(row * 31 + Math.floor(xx), seed) * 8;
      g.fillStyle = shade(base, (hash(row * 17 + Math.floor(xx), seed + 1) - 0.5) * 0.25);
      const x0 = Math.max(x, xx + 0.6);
      const x1 = Math.min(x + w, xx + sw - 0.6);
      if (x1 > x0) g.fillRect(x0, yy + 0.6, x1 - x0, Math.min(6, y + h - yy - 0.6));
      xx += sw;
    }
    row++;
  }
}

function litPane(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.fillStyle = '#3a2416';
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  const gr = g.createRadialGradient(x + w / 2, y + h * 0.6, 1, x + w / 2, y + h / 2, Math.max(w, h));
  gr.addColorStop(0, '#fff2c0');
  gr.addColorStop(0.6, '#ffc870');
  gr.addColorStop(1, '#d9822e');
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  g.fillStyle = '#3a2416';
  g.fillRect(x + w / 2 - 0.8, y, 1.6, h);
  g.fillRect(x, y + h / 2 - 0.8, w, 1.6);
  g.fillStyle = '#6e4a2a';
  g.fillRect(x - 3, y + h + 1, w + 6, 2.4);
}

function paintInn(g: Ctx): void {
  // Ground shadow.
  const sh = g.createRadialGradient(20, 2, 4, 20, 2, 190);
  sh.addColorStop(0, 'rgba(8,5,14,0.45)');
  sh.addColorStop(1, 'rgba(8,5,14,0)');
  g.fillStyle = sh;
  g.save();
  g.scale(1, 0.12);
  g.beginPath();
  g.arc(20, 10, 190, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // Chimney (behind the roof).
  stones(g, 58, -222, 24, 90, '#8a7a6a', 3);
  g.fillStyle = '#4a3a30';
  g.fillRect(55, -226, 30, 5);
  // Stable lean-to on the right.
  g.fillStyle = '#3a2618';
  g.fillRect(112, -62, 84, 62);
  g.fillStyle = '#7a5434';
  for (const x of [114, 192]) g.fillRect(x, -64, 5, 64);
  g.fillStyle = '#6a4a2c';
  g.beginPath();
  g.moveTo(108, -72);
  g.lineTo(202, -52);
  g.lineTo(202, -46);
  g.lineTo(108, -64);
  g.closePath();
  g.fill();
  for (const [x, y] of [[132, -14], [156, -14], [144, -28]] as const) {
    g.fillStyle = '#d0aa5a';
    g.fillRect(x - 11, y, 22, 14);
    g.strokeStyle = 'rgba(110,80,30,0.6)';
    g.lineWidth = 0.8;
    g.strokeRect(x - 11, y, 22, 14);
    g.beginPath();
    g.moveTo(x - 11, y + 7);
    g.lineTo(x + 11, y + 7);
    g.stroke();
  }
  // Stone ground storey.
  stones(g, -112, -72, 224, 72, '#9a8c7a', 7);
  // Timbered upper storey, jettied out over it.
  g.fillStyle = '#e4cfa2';
  g.fillRect(-120, -140, 240, 66);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = hash(i, 201) < 0.5 ? 'rgba(120,90,50,0.08)' : 'rgba(255,255,255,0.1)';
    g.fillRect(-120 + hash(i, 202) * 240, -140 + hash(i, 203) * 66, 2, 2);
  }
  g.fillStyle = '#4a2e1c';
  for (const x of [-120, -76, -36, 4, 44, 84, 116]) g.fillRect(x, -140, 4, 66);
  g.strokeStyle = '#4a2e1c';
  g.lineWidth = 3;
  g.beginPath();
  for (const [x0, x1] of [[-116, -76], [-36, 4], [44, 84]] as const) {
    g.moveTo(x0 + 2, -76);
    g.lineTo(x1, -138);
  }
  g.stroke();
  g.fillStyle = '#3a2416';
  g.fillRect(-124, -76, 248, 6);
  g.fillStyle = 'rgba(255,220,180,0.25)';
  g.fillRect(-124, -76, 248, 1.2);
  // Windows.
  litPane(g, -94, -52, 28, 22);
  litPane(g, 32, -52, 26, 22);
  litPane(g, 72, -52, 26, 22);
  for (const x of [-92, -26, 46]) {
    litPane(g, x, -122, 24, 22);
    // Flower boxes under the upper windows.
    g.fillStyle = '#6e4a26';
    g.fillRect(x - 3, -96, 30, 4);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = ['#e05a6a', '#f2d35a', '#f4e9c4'][k % 3];
      g.beginPath();
      g.arc(x + k * 5, -97, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Door frame (the leaf and its light are drawn live).
  g.fillStyle = '#7a6a5a';
  g.beginPath();
  g.moveTo(DOOR_X - 21, 0);
  g.lineTo(DOOR_X - 21, -37);
  g.arc(DOOR_X, -37, 21, Math.PI, 0);
  g.lineTo(DOOR_X + 21, 0);
  g.closePath();
  g.fill();
  // Steps.
  g.fillStyle = '#8a8070';
  g.fillRect(DOOR_X - 26, -2, 52, 5);
  g.fillStyle = '#9a9080';
  g.fillRect(DOOR_X - 22, -6, 44, 4);
  // Lantern by the door.
  g.strokeStyle = '#22252c';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(-50, -80);
  g.lineTo(-62, -80);
  g.lineTo(-62, -76);
  g.stroke();
  g.fillStyle = '#22252c';
  g.fillRect(-67, -76, 10, 2);
  const lg = g.createRadialGradient(-62, -67, 0.5, -62, -67, 6);
  lg.addColorStop(0, '#fff6d0');
  lg.addColorStop(1, '#e8962e');
  g.fillStyle = lg;
  g.fillRect(-66, -74, 8, 13);
  g.fillStyle = '#22252c';
  g.fillRect(-67, -61, 10, 2);
  // Barrels and a bench by the wall.
  for (const x of [-138, -124]) {
    g.fillStyle = '#6e4a2a';
    g.fillRect(x, -22, 13, 22);
    g.fillStyle = '#3a3640';
    g.fillRect(x, -17, 13, 1.4);
    g.fillRect(x, -6, 13, 1.4);
  }
  g.fillStyle = '#7a5434';
  g.fillRect(36, -14, 50, 4);
  g.fillRect(40, -10, 3, 10);
  g.fillRect(79, -10, 3, 10);
  // Roof: deep golden thatch over the whole, with a dormer.
  const roof = (): void => {
    g.beginPath();
    g.moveTo(-142, -134);
    g.quadraticCurveTo(-120, -190, -86, -214);
    g.lineTo(86, -214);
    g.quadraticCurveTo(120, -190, 142, -134);
    g.quadraticCurveTo(0, -126, -142, -134);
    g.closePath();
  };
  const tg = g.createLinearGradient(0, -214, 0, -128);
  tg.addColorStop(0, '#a88a50');
  tg.addColorStop(1, '#6e5630');
  g.fillStyle = tg;
  roof();
  g.fill();
  g.save();
  roof();
  g.clip();
  g.lineWidth = 0.8;
  for (let i = 0; i < 520; i++) {
    const x = -140 + hash(i, 211) * 280;
    const y = -214 + hash(i, 212) * 86;
    g.strokeStyle = hash(i, 213) < 0.6 ? 'rgba(70,50,20,0.4)' : 'rgba(240,210,140,0.3)';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (x / 140) * 2, y + 5);
    g.stroke();
  }
  g.restore();
  // Ragged eave line and a ridge.
  g.fillStyle = '#5a4424';
  for (let x = -140; x < 142; x += 6) {
    const y = -134 + Math.pow(x / 142, 2) * 6 - 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 3, y + 5 + hash(x, 214) * 3);
    g.lineTo(x + 6, y);
    g.fill();
  }
  g.fillStyle = '#5e4826';
  g.fillRect(-86, -217, 172, 5);
  // Dormer.
  g.fillStyle = '#e4cfa2';
  g.fillRect(-14, -186, 30, 22);
  litPane(g, -6, -182, 14, 13);
  g.fillStyle = '#7a6238';
  g.beginPath();
  g.moveTo(-20, -184);
  g.lineTo(1, -200);
  g.lineTo(22, -184);
  g.closePath();
  g.fill();
  // The hanging sign: a gilt tankard on green.
  g.strokeStyle = '#22252c';
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(118, -112);
  g.lineTo(160, -112);
  g.moveTo(124, -112);
  g.quadraticCurveTo(122, -102, 118, -100);
  g.stroke();
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(130, -112);
  g.lineTo(130, -106);
  g.moveTo(154, -112);
  g.lineTo(154, -106);
  g.stroke();
  g.fillStyle = '#2f4a36';
  g.fillRect(126, -106, 32, 26);
  g.strokeStyle = '#c9a24a';
  g.lineWidth = 1.2;
  g.strokeRect(128, -104, 28, 22);
  g.fillStyle = '#c9a24a';
  g.fillRect(136, -99, 10, 13);
  g.fillStyle = '#f4ead0';
  g.beginPath();
  g.ellipse(141, -99, 6, 2.4, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#c9a24a';
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(147, -93, 3.4, -Math.PI / 2, Math.PI / 2);
  g.stroke();
}

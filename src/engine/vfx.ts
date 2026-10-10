/**
 * Renderer-side VFX — every short-lived cosmetic the board shows that the
 * simulation doesn't need to know about: particles, impact flashes, slash
 * crescents, shock rings, corpses, hit recoil, light pulses and screen shake.
 *
 * It reacts to the engine's `fx` event queue (hits, kills, blasts, casts) and
 * owns all of its own state, so effects never touch game rules. Everything is
 * pooled and capped: particles live in a fixed array recycled through a free
 * list (no per-frame allocation), and every list has a hard ceiling so a
 * crowded late wave stays smooth.
 *
 * Draw is split by blend so the lighting pass can sit between them:
 *  - `drawWorld`   — normal-blend matter (smoke, dust, debris, leaves) that
 *                    should be darkened by the stage's ambient like everything
 *                    else on the floor.
 *  - `drawGlow`    — additive light (sparks, embers, motes, flashes, rings)
 *                    composited *after* the darkness so it glows in the dark.
 */

import type { Weather } from '../domain/atmosphere';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../domain/grid';
import type { Enemy, FxElement, FxEvent } from './types';
import { MAGIC, ease, shade, tintRamp, withAlpha, type LightFamily, type MagicFamily } from './palette';
import type { Light } from './lighting';

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

export type ParticleKind =
  | 'spark' // fast streak along velocity (additive)
  | 'ember' // rising flickering hot dot (additive)
  | 'mote' // soft glowing dot (additive)
  | 'shard' // crystalline diamond (additive)
  | 'firefly' // blinking yellow-green glow (additive)
  | 'gust' // short curved wind wisp (additive)
  | 'smoke' // soft expanding puff (normal)
  | 'dust' // small earthy speck (normal)
  | 'debris' // tumbling chip with gravity (normal)
  | 'leaf' // fluttering leaf / petal (normal)
  | 'ash'; // drifting grey flake (normal)

const ADDITIVE: Record<ParticleKind, boolean> = {
  spark: true,
  ember: true,
  mote: true,
  shard: true,
  firefly: true,
  gust: true,
  smoke: false,
  dust: false,
  debris: false,
  leaf: false,
  ash: false,
};

interface Particle {
  alive: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  /** Size growth per second (smoke billows). */
  grow: number;
  color: string;
  color2: string;
  drag: number;
  grav: number;
  rot: number;
  spin: number;
  phase: number;
  /** Ambient particles wrap the board instead of dying at the edge. */
  ambient: boolean;
}

const MAX_PARTICLES = 900;
const MAX_AMBIENT = 70;

export interface SpawnOpts {
  vx?: number;
  vy?: number;
  life?: number;
  size?: number;
  grow?: number;
  color?: string;
  color2?: string;
  drag?: number;
  grav?: number;
  spin?: number;
  rot?: number;
  ambient?: boolean;
}

// ---------------------------------------------------------------------------
// Shaped one-offs
// ---------------------------------------------------------------------------

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  t: number;
  max: number;
  color: string;
  width: number;
  /** Squash for a ground ring seen at an angle (1 = circle). */
  squash: number;
}

interface Flash {
  x: number;
  y: number;
  r: number;
  t: number;
  max: number;
  color: string;
}

interface Slash {
  x: number;
  y: number;
  angle: number;
  radius: number;
  t: number;
  max: number;
  color: string;
  width: number;
  span: number;
}

/** The Blade's Cross Slash mark: two long cuts flashing over a foe in an X. */
interface CrossMark {
  x: number;
  y: number;
  /** +1 when the blow travels rightward, -1 leftward: mirrors which cut leads. */
  side: number;
  /** Length of each cut. */
  size: number;
  t: number;
  max: number;
  color: string;
}

/** A Claymore swing: a broad crescent sweeping across the arc it cleaves. */
interface CleaveArc {
  x: number;
  y: number;
  angle: number;
  half: number;
  radius: number;
  /** Sweep direction in angle (+1 / -1): always enters from the arc's top side. */
  dir: number;
  t: number;
  max: number;
  color: string;
}

/** One point of a fissure's jagged line, with the crack's width there. */
interface CrackPoint {
  x: number;
  y: number;
  w: number;
}

/** The Earthsplitter's crack: a jagged line torn through the floor, with side cracks. */
interface Fissure {
  pts: CrackPoint[];
  /** Side cracks, each opening once the main crack has run `at` (0..1) of its length. */
  branches: { at: number; pts: CrackPoint[] }[];
  t: number;
  max: number;
}

interface LightPulse {
  x: number;
  y: number;
  radius: number;
  family: LightFamily;
  intensity: number;
  t: number;
  max: number;
  /** Caster colour replacing the family's glow. */
  tint?: string;
}

/** A felled foe playing a short death: recoil, topple, sink and fade. */
export interface Corpse {
  enemy: Enemy;
  x: number;
  y: number;
  view: 'side' | 'front' | 'back';
  faceLeft: boolean;
  dist: number;
  /** Direction it's knocked (unit vector away from the killing blow). */
  kx: number;
  ky: number;
  t: number;
  max: number;
  element: FxElement;
  /** Caster colour of the killing magic (tints the dissolve). */
  tint?: string;
}

interface Recoil {
  dx: number;
  dy: number;
  t: number;
}

const MAX_RINGS = 60;
const MAX_FLASHES = 40;
const MAX_SLASHES = 40;
const MAX_PULSES = 24;
const MAX_CORPSES = 40;
const MAX_CROSSES = 12;
const MAX_CLEAVES = 12;
const MAX_FISSURES = 6;
/** How long a fissure takes to run its full length. */
const FISSURE_GROW = 0.2;

/**
 * Particle ramp + light for an attack: the element's fixed ramp, or a ramp
 * built from the caster's colour when the event carries a `tint`.
 */
function magicOf(el: FxElement, tint?: string): { light: LightFamily; ramp: readonly string[]; tint?: string } {
  const fam = MAGIC[familyOf(el)];
  return tint ? { light: fam.light, ramp: tintRamp(tint), tint } : fam;
}

/** Particle colour ramp + light family for an attack element. */
function familyOf(el: FxElement): MagicFamily {
  switch (el) {
    case 'wind':
      return 'wind';
    case 'arcane':
      return 'arcane';
    case 'fire':
      return 'fire';
    case 'frost':
      return 'frost';
    case 'holy':
      return 'holy';
    case 'dark':
      return 'dark';
    default:
      return 'steel';
  }
}

/** Fill a lens (a cut tapered to a point at both ends) along +x from 0 to `len`, `w` thick. */
function lens(ctx: CanvasRenderingContext2D, len: number, w: number): void {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len / 2, -w, len, 0);
  ctx.quadraticCurveTo(len / 2, w, 0, 0);
  ctx.closePath();
  ctx.fill();
}

const reducedMotion = (() => {
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
})();

export class Vfx {
  private pool: Particle[] = [];
  private free: number[] = [];
  private ambientCount = 0;
  rings: Ring[] = [];
  flashes: Flash[] = [];
  slashes: Slash[] = [];
  crosses: CrossMark[] = [];
  cleaves: CleaveArc[] = [];
  fissures: Fissure[] = [];
  pulses: LightPulse[] = [];
  corpses: Corpse[] = [];
  private recoil = new Map<number, Recoil>();
  /** Screen-shake trauma 0..1 (offset ∝ trauma²). */
  private trauma = 0;
  /** Transient exposure lift for the lighting pass (big spells). */
  exposure = 0;
  /** Seconds since this board's VFX started (drives ambient motion). */
  time = 0;
  private seed = 1;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        alive: false,
        kind: 'dust',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        max: 1,
        size: 1,
        grow: 0,
        color: '#fff',
        color2: '#fff',
        drag: 0,
        grav: 0,
        rot: 0,
        spin: 0,
        phase: 0,
        ambient: false,
      });
      this.free.push(MAX_PARTICLES - 1 - i);
    }
  }

  /** Cheap deterministic-enough jitter (no Math.random churn in hot loops). */
  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  spawn(kind: ParticleKind, x: number, y: number, o: SpawnOpts = {}): void {
    const idx = this.free.pop();
    if (idx === undefined) return; // pool exhausted — drop, never grow
    const p = this.pool[idx];
    p.alive = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.max = p.life = o.life ?? 0.6;
    p.size = o.size ?? 1.5;
    p.grow = o.grow ?? 0;
    p.color = o.color ?? '#ffffff';
    p.color2 = o.color2 ?? p.color;
    p.drag = o.drag ?? 2;
    p.grav = o.grav ?? 0;
    p.rot = o.rot ?? this.rand() * Math.PI * 2;
    p.spin = o.spin ?? 0;
    p.phase = this.rand() * Math.PI * 2;
    p.ambient = o.ambient ?? false;
    if (p.ambient) this.ambientCount++;
  }

  /** A burst of `n` particles flung outward around (x, y). */
  burst(kind: ParticleKind, x: number, y: number, n: number, speed: number, o: SpawnOpts & { dir?: number; spread?: number } = {}): void {
    const dir = o.dir;
    const spread = o.spread ?? Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = dir === undefined ? this.rand() * Math.PI * 2 : dir + (this.rand() - 0.5) * spread;
      const s = speed * (0.45 + this.rand() * 0.75);
      this.spawn(kind, x, y, {
        ...o,
        vx: Math.cos(a) * s + (o.vx ?? 0),
        vy: Math.sin(a) * s + (o.vy ?? 0),
        life: (o.life ?? 0.5) * (0.7 + this.rand() * 0.6),
        size: (o.size ?? 1.5) * (0.7 + this.rand() * 0.6),
      });
    }
  }

  ring(x: number, y: number, r0: number, r1: number, max: number, color: string, width = 2, squash = 1): void {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x, y, r0, r1, t: 0, max, color, width, squash });
  }

  flash(x: number, y: number, r: number, max: number, color: string): void {
    if (this.flashes.length >= MAX_FLASHES) this.flashes.shift();
    this.flashes.push({ x, y, r, t: 0, max, color });
  }

  slash(x: number, y: number, angle: number, radius: number, max: number, color: string, width = 3, span = 1.3): void {
    if (this.slashes.length >= MAX_SLASHES) this.slashes.shift();
    this.slashes.push({ x, y, angle, radius, t: 0, max, color, width, span });
  }

  pulse(x: number, y: number, radius: number, family: LightFamily, intensity: number, max: number, tint?: string): void {
    if (this.pulses.length >= MAX_PULSES) this.pulses.shift();
    this.pulses.push({ x, y, radius, family, intensity, t: 0, max, tint });
  }

  shake(amount: number): void {
    if (reducedMotion) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Current screen-shake offset (px). */
  shakeOffset(): { x: number; y: number } {
    if (this.trauma <= 0.001) return { x: 0, y: 0 };
    const k = this.trauma * this.trauma * 6;
    const t = this.time * 60;
    return {
      x: k * (Math.sin(t * 1.7) * 0.6 + Math.sin(t * 3.1 + 1) * 0.4),
      y: k * (Math.sin(t * 2.3 + 2) * 0.6 + Math.sin(t * 3.7) * 0.4),
    };
  }

  /** Hit-recoil offset + squash for an enemy (0 when not recently hit). */
  recoilOf(uid: number): { dx: number; dy: number; squash: number } {
    const r = this.recoil.get(uid);
    if (!r) return { dx: 0, dy: 0, squash: 0 };
    const k = 1 - r.t / 0.16; // 1 at the hit → 0
    const e = k * k;
    return { dx: r.dx * e, dy: r.dy * e, squash: e };
  }

  // -------------------------------------------------------------------------
  // Event handling
  // -------------------------------------------------------------------------

  /** React to the engine's cosmetic events (drained by the caller). */
  consume(events: readonly FxEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'hit':
          this.onHit(e);
          break;
        case 'kill':
          this.onKill(e.enemy, e.fromX, e.fromY, e.element, e.tint);
          break;
        case 'blast':
          this.onBlast(e.x, e.y, e.radius, e.color, e.element, e.crit, e.tint, e.heavy);
          break;
        case 'cast':
          this.onCast(e.ability, e.x, e.y, e.color, e.radius);
          break;
        case 'crossSlash':
          this.onCrossSlash(e.x, e.y, e.angle, e.color, e.crit);
          break;
        case 'cleave':
          this.onCleave(e.x, e.y, e.angle, e.halfAngle, e.radius, e.color);
          break;
        case 'fissure':
          this.onFissure(e.x, e.y, e.angle, e.length);
          break;
        case 'dodge':
          this.burst('gust', e.x, e.y - 4, 4, 60, { life: 0.3, size: 5, color: '#dff4ff' });
          break;
        case 'block':
          this.onBlock(e);
          break;
        case 'rally':
          if (!e.granted) {
            // The standard goes up: a gold flare above him and a dust kick.
            this.flash(e.x, e.y - 40, 40, 0.3, '#ffe6a0');
            this.burst('dust', e.x, e.y + 12, 10, 36, { life: 0.5, size: 1.4, color: '#c9b48c', drag: 5, vy: -6 });
            this.pulse(e.x, e.y - 30, 120, 'holy', 0.6, 0.6);
          } else {
            // The blessing: a gold ring sweeping out from him, and each foe's
            // shield lighting up blue with motes rising off it.
            this.ring(e.x, e.y, 10, 170, 0.7, '#ffd76a', 2.6, 0.5);
            this.flash(e.x, e.y - 30, 60, 0.3, '#fff1c4');
            for (const t of e.targets) {
              this.ring(t.x, t.y - 4, 3, 18, 0.4, '#8fb4ff', 1.6);
              this.burst('mote', t.x, t.y - 4, 5, 24, { life: 0.6, size: 1.5, color: '#bcd4ff', vy: -26, drag: 1.5 });
            }
          }
          break;
        case 'breach':
          this.flash(e.x, e.y, e.boss ? 90 : 40, 0.4, '#ff5a5a');
          this.ring(e.x, e.y, 6, e.boss ? 110 : 46, 0.5, '#ff6a5a', 3, 0.6);
          this.burst('smoke', e.x, e.y, 6, 30, { life: 0.8, size: 6, grow: 10, color: '#3a1a1a' });
          break;
        case 'deploy':
          this.ring(e.x, e.y + 10, 4, 26, 0.45, e.color, 2, 0.45);
          this.burst('dust', e.x, e.y + 10, 10, 40, { life: 0.5, size: 1.4, color: '#c9b48c', drag: 5, vy: -8 });
          this.burst('mote', e.x, e.y, 8, 26, { life: 0.7, size: 1.6, color: e.color, vy: -30, drag: 1.5 });
          this.pulse(e.x, e.y, 70, 'holy', 0.5, 0.5);
          break;
        case 'summon':
          // The hounds burst out of the mist beside him: a kick of dust and dark
          // smoke where each one appears.
          for (const s of e.spawns) {
            this.burst('smoke', s.x, s.y + 6, 8, 40, { life: 0.8, size: 5, grow: 9, color: '#1c1a18', drag: 3 });
            this.burst('dust', s.x, s.y + 10, 10, 46, { life: 0.55, size: 1.5, color: '#b8a888', drag: 5, vy: -10 });
            this.ring(s.x, s.y + 10, 4, 22, 0.4, '#8a7a66', 1.6, 0.45);
          }
          break;
        case 'skid':
          // Paws braced: a spray of dust thrown forward off the skid.
          this.burst('dust', e.x + e.dx * 6, e.y + 10, 9, 40, { life: 0.55, size: 1.5, color: '#b8a888', drag: 5, vy: -10 });
          break;
        case 'lantern':
          // The wick catches: a flare in the glass, a few sparks, and a warm
          // ring sweeping out over the ground to the edge of the cleared mist.
          this.flash(e.x, e.y, 34, 0.45, '#fff1c4');
          this.burst('ember', e.x, e.y, 10, 46, { life: 0.7, size: 1.3, color: '#ffc874', vy: -26 });
          this.ring(e.cx, e.cy + 6, 8, e.radius, 0.55, '#ffd27a', 2.2, 0.55);
          this.pulse(e.x, e.y, e.radius * 1.4, 'lantern', 0.8, 0.9);
          break;
        case 'bossSpawn':
          this.ring(e.x, e.y + 8, 10, 120, 0.9, '#ff3a3a', 3, 0.5);
          this.ring(e.x, e.y + 8, 6, 80, 0.7, '#ffd77a', 2, 0.5);
          this.burst('smoke', e.x, e.y + 6, 18, 60, { life: 1.1, size: 7, grow: 14, color: '#1a0c14', drag: 2.5 });
          this.burst('ember', e.x, e.y, 22, 80, { life: 1, size: 1.6, color: '#ffb347', vy: -40 });
          this.pulse(e.x, e.y, 200, 'blood', 0.8, 1.2);
          this.shake(0.55);
          break;
      }
    }
  }

  private onHit(e: Extract<FxEvent, { kind: 'hit' }>): void {
    const fam = magicOf(e.element, e.tint);
    const ang = Math.atan2(e.y - e.fromY, e.x - e.fromX);
    const melee = e.melee;
    const big = e.crit ? 1.8 : 1;
    // Target recoil away from the blow (stronger for heavy hits).
    const push = Math.min(4, 1.4 + e.weight * 10) * big;
    this.recoil.set(e.enemyUid, { dx: Math.cos(ang) * push, dy: Math.sin(ang) * push, t: 0 });
    const hx = e.x - Math.cos(ang) * 6;
    const hy = e.y - 4 - Math.sin(ang) * 4;

    // Impact flash at the point of contact.
    this.flash(hx, hy, (e.crit ? 20 : 10) + e.weight * 30, e.crit ? 0.18 : 0.11, fam.ramp[1]);
    switch (e.element) {
      case 'wind':
        this.burst('gust', hx, hy, e.crit ? 6 : 3, 70, { dir: ang, spread: 1.6, life: 0.32, size: 5, color: fam.ramp[1] });
        this.burst('mote', hx, hy, e.crit ? 8 : 4, 60, { dir: ang, spread: 2, life: 0.4, size: 1.3, color: fam.ramp[2] });
        break;
      case 'arcane':
        this.burst('shard', hx, hy, e.crit ? 10 : 5, 80, { life: 0.42, size: 2, color: fam.ramp[1], color2: fam.ramp[2], drag: 4 });
        this.burst('mote', hx, hy, e.crit ? 8 : 4, 40, { life: 0.6, size: 1.6, color: fam.ramp[2], vy: -20 });
        this.ring(hx, hy, 2, e.crit ? 22 : 13, 0.24, fam.ramp[2], 1.4);
        break;
      case 'holy':
        this.burst('mote', hx, hy, 6, 40, { life: 0.6, size: 1.6, color: fam.ramp[2], vy: -24 });
        break;
      default: {
        // Steel: hot sparks thrown along the blow, plus a directional slash
        // crescent for melee strikes.
        this.burst('spark', hx, hy, e.crit ? 12 : 5, e.crit ? 190 : 140, {
          dir: ang,
          spread: 1.9,
          life: 0.22,
          size: 1.1,
          color: '#fff6dc',
          color2: '#ffb347',
          drag: 5,
          grav: 160,
        });
        if (melee) this.slash(e.x, e.y - 4, ang, 13 + e.weight * 10, 0.16, e.color, e.crit ? 4 : 2.6);
        break;
      }
    }
    if (e.crit) {
      this.ring(hx, hy, 4, 34, 0.32, '#ffd76a', 2.4);
      this.flash(hx, hy, 46, 0.22, '#fff1c4');
      this.pulse(hx, hy, 110, fam.light, 0.7, 0.3, fam.tint);
      this.exposure = Math.min(0.5, this.exposure + 0.08);
    }
  }

  /**
   * A shielded foe turning a blow aside: a cold steel glint and a spray of sparks
   * glancing back toward the attacker, with a small ring off the shield face. The
   * last point breaking is bigger: a bright flash, a wider ring and tumbling
   * shield chips.
   */
  private onBlock(e: Extract<FxEvent, { kind: 'block' }>): void {
    const ang = Math.atan2(e.y - e.fromY, e.x - e.fromX);
    const hx = e.x - Math.cos(ang) * 7;
    const hy = e.y - 3 - Math.sin(ang) * 4;
    // Sparks glance back off the shield, away from the target.
    this.burst('spark', hx, hy, e.broke ? 12 : 6, e.broke ? 170 : 120, {
      dir: ang + Math.PI,
      spread: 2.2,
      life: 0.22,
      size: 1.1,
      color: '#ffffff',
      color2: '#9fc4ff',
      drag: 5,
      grav: 140,
    });
    this.flash(hx, hy, e.broke ? 34 : 14, e.broke ? 0.2 : 0.1, '#dce8ff');
    this.ring(hx, hy, 2, e.broke ? 30 : 14, e.broke ? 0.34 : 0.2, '#cfe0ff', e.broke ? 2.4 : 1.4);
    if (e.broke) {
      this.burst('debris', hx, hy, 8, 90, { life: 0.6, size: 1.8, color: '#25397a', color2: '#c9d2dc', grav: 260, vy: -50 });
      this.pulse(hx, hy, 80, 'holy', 0.5, 0.3);
    }
  }

  /** Record a corpse (for a normal foe) and throw death debris. */
  private onKill(enemy: Enemy, fromX: number, fromY: number, element: FxElement, tint?: string): void {
    const x = enemy.pos.x;
    const y = enemy.pos.y;
    const R = enemy.def.radius;
    let kx = x - fromX;
    let ky = y - fromY;
    const kl = Math.hypot(kx, ky) || 1;
    kx /= kl;
    ky /= kl;
    const fam = magicOf(element, tint);
    // Elemental death flourish.
    if (element === 'arcane') {
      this.burst('mote', x, y - 6, 14, 60, { life: 0.8, size: 1.8, color: fam.ramp[2], vy: -30 });
      this.burst('shard', x, y - 6, 8, 90, { life: 0.5, size: 2.2, color: fam.ramp[1], color2: fam.ramp[3] });
    } else if (element === 'wind') {
      this.burst('gust', x, y - 6, 6, 90, { dir: Math.atan2(ky, kx), spread: 2, life: 0.4, size: 6, color: fam.ramp[1] });
    } else {
      this.burst('spark', x, y - 6, 6, 120, { life: 0.25, size: 1, color: '#fff6dc', color2: '#ff9a3c', grav: 200 });
    }
    // Dust kicked up where it falls + a few chips of kit.
    this.burst('dust', x + kx * 6, y + R * 0.6, 10, 46, { life: 0.7, size: 1.8, color: '#a89878', drag: 4, vy: -10 });
    this.burst('debris', x, y - 4, enemy.def.boss ? 12 : 5, 90, {
      life: 0.7,
      size: 1.6,
      color: shade(enemy.def.visual.color, -0.25),
      grav: 380,
      drag: 1.2,
      vy: -70,
      spin: 10,
    });
    this.flash(x, y - 6, R * 1.6, 0.16, fam.ramp[1]);
    if (enemy.def.boss) {
      this.ring(x, y + R * 0.6, 8, 140, 0.8, '#ffd77a', 3, 0.5);
      this.pulse(x, y, 220, 'holy', 0.9, 1.1);
      this.exposure = Math.min(0.6, this.exposure + 0.35);
    }
    // A special scripted death (Gowzer) plays its own sequence in the renderer.
    if (enemy.def.deathAnimation) return;
    const hx = enemy.heading.x;
    const hy = enemy.heading.y;
    const view = Math.abs(hx) >= Math.abs(hy) ? 'side' : hy > 0 ? 'front' : 'back';
    if (this.corpses.length >= MAX_CORPSES) this.corpses.shift();
    this.corpses.push({
      enemy,
      x,
      y,
      view,
      faceLeft: hx < 0,
      dist: enemy.dist,
      kx,
      ky,
      t: 0,
      max: enemy.def.boss ? 1.4 : 0.85,
      element,
      tint,
    });
  }

  private onBlast(
    x: number,
    y: number,
    radius: number,
    color: string,
    element: FxElement,
    crit: boolean,
    tint?: string,
    heavy = false,
  ): void {
    const fam = magicOf(element, tint);
    this.flash(x, y, radius * 1.2, 0.28, fam.ramp[1]);
    this.ring(x, y, radius * 0.2, radius * 1.05, 0.42, color, 3);
    this.ring(x, y + 4, radius * 0.3, radius * 1.2, 0.55, fam.ramp[2], 1.5, 0.55);
    this.burst('shard', x, y, crit ? 26 : 16, radius * 3.2, { life: 0.5, size: 2.2, color: fam.ramp[1], color2: color, drag: 4 });
    this.burst('mote', x, y, 14, radius * 1.6, { life: 0.9, size: 2, color, vy: -20, drag: 2 });
    this.burst('smoke', x, y + 4, 6, radius * 0.8, { life: 0.9, size: 6, grow: 12, color: shade(color, -0.6) });
    this.pulse(x, y, radius * 3.2, fam.light, 1, 0.45, fam.tint);
    this.exposure = Math.min(0.6, this.exposure + 0.12);
    if (heavy) {
      // A Greater Orb crashing down: a white-hot core, a slower outer shock ring
      // rolling along the floor, sparks thrown upward, dust kicked out from the
      // rim and a short shake for the weight of it.
      this.flash(x, y - 4, radius * 0.7, 0.2, '#ffffff');
      this.ring(x, y + 6, radius * 0.5, radius * 1.45, 0.75, fam.ramp[1], 2.4, 0.5);
      this.burst('spark', x, y, crit ? 24 : 16, radius * 3, { dir: -Math.PI / 2, spread: 1.3, life: 0.45, size: 1.3, color: '#ffffff', color2: color, drag: 3, grav: 140 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        this.burst('dust', x + Math.cos(a) * radius * 0.85, y + 8 + Math.sin(a) * radius * 0.4, 3, 34, { life: 0.7, size: 1.8, color: '#b8a888', drag: 4 });
      }
      this.exposure = Math.min(0.7, this.exposure + 0.1);
      this.shake(0.28);
    }
  }

  private onCast(
    ability: Extract<FxEvent, { kind: 'cast' }>['ability'],
    x: number,
    y: number,
    color: string,
    radius: number,
  ): void {
    switch (ability) {
      case 'cyclone':
        this.flash(x, y, radius * 0.9, 0.3, '#fff6dc');
        this.ring(x, y + 6, 10, radius, 0.5, color, 4, 0.55);
        this.burst('spark', x, y, 28, radius * 3, { life: 0.35, size: 1.2, color: '#ffffff', color2: color, drag: 3 });
        this.burst('dust', x, y + 10, 18, radius * 1.4, { life: 0.8, size: 2, color: '#b8a888', drag: 3 });
        this.pulse(x, y, radius * 2.4, 'holy', 1, 0.6);
        this.exposure = Math.min(0.7, this.exposure + 0.35);
        break;
      case 'quickdraw': {
        // A snap of focus in the archer's colour: a ring cinching in on the bow
        // hand, a flash, a fan of sparks thrown forward-up and a ground ring.
        const ramp = tintRamp(color);
        this.ring(x, y - 4, 30, 4, 0.2, ramp[1], 2);
        this.flash(x, y - 4, 42, 0.26, ramp[1]);
        this.ring(x, y + 10, 6, 38, 0.55, color, 2.4, 0.45);
        this.burst('spark', x, y - 4, 20, 170, { life: 0.35, size: 1.1, color: '#ffffff', color2: color, drag: 4 });
        this.burst('mote', x, y, 16, 60, { life: 0.8, size: 1.6, color: ramp[1], vy: -40, drag: 1.5 });
        this.pulse(x, y, 120, 'holy', 0.8, 0.5, color);
        this.exposure = Math.min(0.5, this.exposure + 0.12);
        break;
      }
      case 'piercingShot': {
        // The arrow kindles as the bow goes up to the sky: a ring cinching in on
        // the archer, a ground ring, motes streaming upward along the raised
        // bow and a light pulse — all in the archer's own colour.
        const ramp = tintRamp(color);
        this.ring(x, y - 8, 34, 4, 0.24, ramp[1], 2);
        this.flash(x, y - 10, 40, 0.24, ramp[1]);
        this.ring(x, y + 10, 6, radius, 0.6, color, 2.4, 0.45);
        this.burst('mote', x, y - 6, 18, 50, { life: 0.9, size: 1.7, color: ramp[1], vy: -70, drag: 1.2 });
        this.burst('spark', x, y - 14, 12, 120, { dir: -Math.PI / 2, spread: 0.9, life: 0.4, size: 1.1, color: '#ffffff', color2: color, drag: 3 });
        this.pulse(x, y, 140, 'arcane', 0.9, 0.6, color);
        this.exposure = Math.min(0.5, this.exposure + 0.14);
        break;
      }
      case 'manaRay': {
        // Gathering then release: an inward-snapping ring, a ground sigil ring
        // and a spray of shards, then a strong light pulse — all in the
        // caster's own colour, like the orb.
        const ramp = tintRamp(color);
        this.flash(x, y - 4, 56, 0.32, ramp[1]);
        this.ring(x, y - 4, 44, 6, 0.22, ramp[1], 2.2);
        this.ring(x, y + 8, 6, 40, 0.6, color, 2.4, 0.45);
        this.ring(x, y + 8, 4, 28, 0.5, ramp[2], 1.4, 0.45);
        this.burst('shard', x, y - 4, 18, 120, { life: 0.5, size: 2, color: ramp[1], color2: color });
        this.burst('mote', x, y, 14, 50, { life: 0.8, size: 1.6, color, vy: -30, drag: 1.5 });
        this.pulse(x, y, 180, 'arcane', 1, 0.8, color);
        this.exposure = Math.min(0.7, this.exposure + 0.3);
        break;
      }
      case 'manaStorm': {
        // The staff goes up: a ring cinching in on the caster, a soft ground
        // ring out to the storm's reach, motes and shards flung skyward and a
        // light pulse — all in the caster's own colour.
        const ramp = tintRamp(color);
        this.ring(x, y - 12, 40, 5, 0.24, ramp[1], 2.2);
        this.flash(x, y - 20, 48, 0.28, ramp[1]);
        this.ring(x, y + 10, 6, radius, 0.7, withAlpha(color, 0.5), 1.6, 0.45);
        this.burst('mote', x, y - 10, 20, 60, { life: 1, size: 1.7, color: ramp[1], vy: -80, drag: 1.2 });
        this.burst('shard', x, y - 30, 12, 140, { dir: -Math.PI / 2, spread: 0.8, life: 0.45, size: 1.8, color: ramp[1], color2: color });
        this.pulse(x, y, 170, 'arcane', 0.9, 0.7, color);
        this.exposure = Math.min(0.6, this.exposure + 0.2);
        break;
      }
      case 'bard':
        this.burst('mote', x, y - 6, 12, 50, { life: 1, size: 1.6, color, vy: -30 });
        this.pulse(x, y, 90, 'holy', 0.45, 0.8);
        break;
      case 'harvest':
        this.burst('mote', x, y - 4, 7, 40, { life: 0.8, size: 1.7, color: '#ffd76a', vy: -40 });
        this.burst('leaf', x, y + 4, 4, 40, { life: 0.9, size: 2.2, color: '#c9a24a', vy: -30, grav: 60, spin: 6 });
        break;
      case 'throw':
        this.burst('dust', x, y + 8, 8, 50, { life: 0.5, size: 1.6, color: '#b8a888', drag: 4 });
        break;
      case 'leap':
        // The Greater Orb caster springing off the floor: a puff of dust and a
        // barely-there ring in its colour where its feet were (kept faint: it
        // fires every attack).
        this.burst('dust', x, y + 10, 10, 46, { life: 0.5, size: 1.6, color: '#b8a888', drag: 4, vy: -6 });
        this.ring(x, y + 10, 4, radius * 0.8, 0.35, withAlpha(color, 0.3), 1, 0.45);
        break;
      case 'land':
        // Touching back down: a broader dust skirt and a quick ground ring.
        this.burst('dust', x, y + 10, 14, 60, { life: 0.6, size: 1.8, color: '#b8a888', drag: 4.5, vy: -4 });
        this.ring(x, y + 10, 6, radius * 0.85, 0.3, withAlpha('#d8c8a8', 0.3), 1.1, 0.45);
        break;
      case 'greaterOrb': {
        // The swollen orb leaving the raised hands: a flash and a ring snapping
        // outward overhead, sparks shed downward along its throw, and a light
        // pulse — all in the caster's colour.
        const ramp = tintRamp(color);
        this.flash(x, y, 34, 0.22, ramp[1]);
        this.ring(x, y, 6, 30, 0.3, ramp[1], 2.2);
        this.burst('spark', x, y, 12, 140, { dir: Math.PI / 2, spread: 1.1, life: 0.35, size: 1.2, color: '#ffffff', color2: color, drag: 3 });
        this.burst('mote', x, y, 10, 40, { life: 0.7, size: 1.6, color: ramp[1], drag: 1.5 });
        this.pulse(x, y, 130, 'arcane', 0.8, 0.45, color);
        this.exposure = Math.min(0.5, this.exposure + 0.1);
        break;
      }
      case 'levelUp':
        this.ring(x, y + 8, 6, 40, 0.8, '#ffd76a', 2.6, 0.5);
        this.ring(x, y + 8, 4, 28, 0.6, '#fff1c4', 1.4, 0.5);
        this.burst('mote', x, y, 26, 70, { life: 1.2, size: 1.8, color: '#ffd76a', vy: -50, drag: 1.4 });
        this.pulse(x, y, 140, 'holy', 1, 1);
        this.exposure = Math.min(0.5, this.exposure + 0.15);
        break;
    }
  }

  /**
   * The Blade's Cross Slash lands: a screen-aligned X of two cuts flashes over
   * the foe (drawn in `drawGlow`; the lead cut mirrors with the blow, like the
   * hero's swing), sparks fly both ways along each cut, and a white flash, ring
   * and light pulse sell the weight of the blow — kept small enough that the X
   * still reads through them.
   */
  private onCrossSlash(x: number, y: number, angle: number, color: string, crit: boolean): void {
    const cy = y - 5;
    const side = Math.cos(angle) >= 0 ? 1 : -1;
    if (this.crosses.length >= MAX_CROSSES) this.crosses.shift();
    this.crosses.push({ x, y: cy, side, size: crit ? 46 : 40, t: 0, max: 0.5, color });
    this.flash(x, cy, crit ? 34 : 26, 0.16, '#fff6dc');
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      for (const along of [a, a + Math.PI]) {
        this.burst('spark', x, cy, 5, 210, {
          dir: along,
          spread: 0.45,
          life: 0.26,
          size: 1.2,
          color: '#ffffff',
          color2: color,
          drag: 5,
          grav: 120,
        });
      }
    }
    this.ring(x, cy, 4, 32, 0.3, '#fff1c4', 2.2);
    this.pulse(x, cy, 130, 'holy', 0.85, 0.35);
    this.exposure = Math.min(0.5, this.exposure + 0.1);
  }

  /**
   * A Claymore swing: a broad crescent sweeps across the arc it cleaves (drawn
   * in `drawGlow`), always entering from the arc's upper side like the overhead
   * swing, with dust kicked up from the floor beneath it.
   */
  private onCleave(x: number, y: number, angle: number, half: number, radius: number, color: string): void {
    if (this.cleaves.length >= MAX_CLEAVES) this.cleaves.shift();
    const dir = Math.cos(angle) >= 0 ? 1 : -1;
    this.cleaves.push({ x, y: y - 3, angle, half, radius, dir, t: 0, max: 0.34, color });
    for (let i = 0; i < 4; i++) {
      const a = angle + (i / 3 - 0.5) * 1.6 * half;
      const r = radius * 0.72;
      this.burst('dust', x + Math.cos(a) * r, y + Math.sin(a) * r + 8, 3, 40, {
        life: 0.55,
        size: 1.7,
        color: '#b8a888',
        drag: 4,
        vy: -10,
      });
    }
    this.pulse(x + Math.cos(angle) * radius * 0.55, y + Math.sin(angle) * radius * 0.55, radius * 1.7, 'candle', 0.5, 0.3);
  }

  /**
   * The Earthsplitter: a jagged crack torn through the floor from where the blade
   * struck, out along `angle` for `length` px (the dark crack is a ground decal,
   * `drawDecals`; its molten glow is in `drawGlow`), with side cracks, rock and
   * dust thrown up along it, a shock ring at the root, warm light pulses and a
   * short jolt of screen shake.
   */
  private onFissure(x: number, y: number, angle: number, length: number): void {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const px = -uy;
    const py = ux;
    const pts: CrackPoint[] = [];
    const n = Math.max(3, Math.round(length / 7));
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const j = i === 0 ? 0 : (this.rand() - 0.5) * 6 * (1 - 0.4 * f);
      pts.push({ x: x + ux * length * f + px * j, y: y + uy * length * f + py * j, w: 5.6 * (1 - f) + 1.4 });
    }
    const branches: Fissure['branches'] = [];
    for (let i = 2; i < n - 1; i += 2 + Math.floor(this.rand() * 2)) {
      const root = pts[i];
      const side = this.rand() < 0.5 ? -1 : 1;
      const a = angle + side * (0.5 + this.rand() * 0.6);
      const len = 6 + this.rand() * 8;
      const bp: CrackPoint[] = [{ ...root, w: root.w * 0.6 }];
      for (let k = 1; k <= 2; k++) {
        const f = k / 2;
        const j = (this.rand() - 0.5) * 3;
        bp.push({
          x: root.x + Math.cos(a) * len * f - Math.sin(a) * j,
          y: root.y + Math.sin(a) * len * f + Math.cos(a) * j,
          w: root.w * 0.6 * (1 - f) + 0.5,
        });
      }
      branches.push({ at: i / n, pts: bp });
    }
    if (this.fissures.length >= MAX_FISSURES) this.fissures.shift();
    this.fissures.push({ pts, branches, t: 0, max: 1.8 });

    // Rock and dust burst up along the crack, the root kicking hardest.
    for (let i = 0; i <= 5; i++) {
      const f = i / 5;
      const bx = x + ux * length * f;
      const by = y + uy * length * f;
      this.burst('debris', bx, by, i === 0 ? 7 : 3, 70, {
        life: 0.7,
        size: 1.7,
        color: '#6a5a48',
        grav: 380,
        drag: 1.2,
        vy: -70,
        spin: 10,
      });
      this.burst('smoke', bx, by, 2, 20, { life: 1, size: 5, grow: 10, color: '#5a4a3a', drag: 2 });
      this.burst('dust', bx, by, 4, 50, { life: 0.6, size: 1.6, color: '#b8a888', drag: 4, vy: -14 });
    }
    this.ring(x, y, 4, 44, 0.45, '#ffd7a0', 2.8, 0.5);
    this.flash(x, y - 4, 50, 0.24, '#fff1c4');
    for (const f of [0, 0.5, 1]) {
      this.pulse(x + ux * length * f, y + uy * length * f, 90, 'fire', 0.7, 0.6);
    }
    this.exposure = Math.min(0.6, this.exposure + 0.15);
    this.shake(0.22);
  }

  // -------------------------------------------------------------------------
  // Ambient weather + emitters
  // -------------------------------------------------------------------------

  /** Keep the stage's ambient weather topped up (called each frame). */
  weather(kind: Weather, density: number, dt: number): void {
    if (kind === 'none') return;
    const target = Math.round(MAX_AMBIENT * 0.6 * density);
    // Trickle in toward the target so a stage starts settled, not in a burst.
    const want = Math.min(target - this.ambientCount, Math.ceil(dt * 40));
    for (let i = 0; i < want; i++) {
      const x = this.rand() * BOARD_WIDTH;
      const y = this.rand() * BOARD_HEIGHT;
      switch (kind) {
        case 'dust':
          this.spawn('dust', x, y, { ambient: true, life: 6 + this.rand() * 6, size: 0.9 + this.rand() * 0.9, color: '#f3e3c0', vx: 3 + this.rand() * 4, vy: -2 + this.rand() * 4, drag: 0 });
          break;
        case 'motes':
          this.spawn('mote', x, y, { ambient: true, life: 5 + this.rand() * 5, size: 1 + this.rand(), color: this.rand() < 0.5 ? '#c9b8ff' : '#fff1c4', vx: (this.rand() - 0.5) * 6, vy: -3 - this.rand() * 4, drag: 0 });
          break;
        case 'embers':
          this.spawn('ember', x, y, { ambient: true, life: 4 + this.rand() * 4, size: 0.6 + this.rand() * 0.7, color: '#ffb347', color2: '#ff5a2a', vx: (this.rand() - 0.5) * 10, vy: -18 - this.rand() * 18, drag: 0 });
          break;
        case 'leaves':
          this.spawn('leaf', -6, y, { ambient: true, life: 9 + this.rand() * 6, size: 2 + this.rand() * 1.4, color: this.rand() < 0.5 ? '#c98a3a' : '#9a6a2a', vx: 22 + this.rand() * 18, vy: 4 + this.rand() * 6, spin: 2 + this.rand() * 3, drag: 0 });
          break;
        case 'petals':
          this.spawn('leaf', -6, y, { ambient: true, life: 9 + this.rand() * 6, size: 1.6 + this.rand(), color: this.rand() < 0.6 ? '#f6d2dc' : '#fff6e8', vx: 16 + this.rand() * 14, vy: 3 + this.rand() * 5, spin: 3 + this.rand() * 3, drag: 0 });
          break;
        case 'fireflies':
          this.spawn('firefly', x, y, { ambient: true, life: 5 + this.rand() * 5, size: 1.4, color: '#e6ff8a', vx: (this.rand() - 0.5) * 8, vy: (this.rand() - 0.5) * 8, drag: 0 });
          break;
        case 'ash':
          this.spawn('ash', x, -4, { ambient: true, life: 9 + this.rand() * 5, size: 1 + this.rand(), color: '#9a9490', vx: 4 + this.rand() * 4, vy: 10 + this.rand() * 8, spin: 2, drag: 0 });
          break;
      }
    }
  }

  /** A torch/brazier flame: occasional rising embers and a wisp of smoke. */
  flame(x: number, y: number, dt: number, strength = 1): void {
    if (this.rand() < dt * 5 * strength) {
      this.spawn('ember', x + (this.rand() - 0.5) * 4, y, {
        life: 0.7 + this.rand() * 0.6,
        size: 0.9 + this.rand() * 0.6,
        color: '#ffd27a',
        color2: '#ff5a2a',
        vx: (this.rand() - 0.5) * 12,
        vy: -26 - this.rand() * 20,
        drag: 0.6,
      });
    }
    if (this.rand() < dt * 2.2 * strength) {
      this.spawn('smoke', x + (this.rand() - 0.5) * 3, y - 6, {
        life: 1.3 + this.rand() * 0.8,
        size: 2.4,
        grow: 5,
        color: '#2a2228',
        vx: 3 + (this.rand() - 0.5) * 4,
        vy: -16,
        drag: 0.4,
      });
    }
  }

  /** Chimney smoke: a lazy rising column. */
  chimney(x: number, y: number, dt: number): void {
    if (this.rand() < dt * 1.6) {
      this.spawn('smoke', x, y, { life: 3 + this.rand() * 1.5, size: 3, grow: 6, color: '#8a8890', vx: 6 + this.rand() * 4, vy: -12, drag: 0.2 });
    }
  }

  /**
   * A channelling Mana Ray (see the renderer's `drawBeams`): sheds arcane motes
   * and shards along its length that drift off sideways, and — once it has
   * reached full length — sprays sparks off the far end where it sears.
   */
  beam(x0: number, y0: number, x1: number, y1: number, color: string, dt: number, live: boolean): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const ramp = tintRamp(color);
    const want = len * dt * 0.35;
    const n = Math.floor(want) + (this.rand() < want % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const u = this.rand();
      const side = this.rand() < 0.5 ? -1 : 1;
      const s = 10 + this.rand() * 22;
      const shard = this.rand() < 0.3;
      this.spawn(shard ? 'shard' : 'mote', x0 + dx * u - uy * side * 3, y0 + dy * u + ux * side * 3, {
        vx: -uy * side * s + ux * 30,
        vy: ux * side * s + uy * 30 - 8,
        life: 0.4 + this.rand() * 0.4,
        size: shard ? 1.4 : 1.1 + this.rand() * 0.8,
        color: this.rand() < 0.5 ? ramp[1] : color,
        color2: ramp[2],
        drag: 2.5,
      });
    }
    if (live && this.rand() < dt * 30) {
      this.burst('spark', x1, y1, 2, 120, {
        dir: Math.atan2(uy, ux),
        spread: 2.6,
        life: 0.25,
        size: 1,
        color: '#ffffff',
        color2: ramp[2],
        drag: 4,
      });
    }
  }

  /** Quickdraw active on an archer at (x, y): motes of its colour drifting up. */
  quickdraw(x: number, y: number, color: string, dt: number): void {
    if (this.rand() < dt * 14) {
      this.spawn('mote', x + (this.rand() - 0.5) * 18, y + 6 - this.rand() * 10, {
        life: 0.6 + this.rand() * 0.4,
        size: 1 + this.rand() * 0.7,
        color: this.rand() < 0.5 ? color : shade(color, 0.5),
        vx: (this.rand() - 0.5) * 8,
        vy: -26 - this.rand() * 14,
        drag: 1,
      });
    }
  }

  /**
   * A Mana Storm's overflowing pool at (x, y) (see the renderer's
   * `drawManaPools`), `rx` wide: motes bubbling up off its whole surface and the
   * odd bright droplet leaping out of it and falling back.
   */
  manaPool(x: number, y: number, rx: number, color: string, dt: number): void {
    const ramp = tintRamp(color);
    const want = dt * (8 + rx * 0.5);
    const n = Math.floor(want) + (this.rand() < want % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const d = Math.sqrt(this.rand());
      this.spawn('mote', x + Math.cos(a) * rx * d, y + Math.sin(a) * rx * 0.45 * d, {
        life: 0.6 + this.rand() * 0.6,
        size: 1 + this.rand() * 0.9,
        color: this.rand() < 0.5 ? ramp[1] : color,
        vx: (this.rand() - 0.5) * 6,
        vy: -18 - this.rand() * 22,
        drag: 1,
      });
    }
    if (this.rand() < dt * 5) {
      const a = this.rand() * Math.PI * 2;
      const d = 0.4 + this.rand() * 0.5;
      this.spawn('shard', x + Math.cos(a) * rx * d, y + Math.sin(a) * rx * 0.45 * d, {
        life: 0.5,
        size: 1.3,
        color: '#ffffff',
        color2: color,
        vx: Math.cos(a) * 14,
        vy: -60 - this.rand() * 30,
        grav: 200,
      });
    }
  }

  /** Trail motes behind a projectile in flight. */
  trail(kind: 'arcane' | 'wind' | 'orb' | 'arrow', x: number, y: number, color: string, dt: number): void {
    switch (kind) {
      case 'orb':
        if (this.rand() < dt * 40) this.spawn('mote', x + (this.rand() - 0.5) * 6, y + (this.rand() - 0.5) * 6, { life: 0.5, size: 1.8, color, vy: -10, drag: 2 });
        if (this.rand() < dt * 18) this.spawn('shard', x, y, { life: 0.35, size: 1.4, color: '#ffffff', color2: color, vx: (this.rand() - 0.5) * 30, vy: (this.rand() - 0.5) * 30 });
        break;
      case 'arcane':
        if (this.rand() < dt * 26) this.spawn('mote', x, y, { life: 0.4, size: 1.2, color, drag: 3 });
        break;
      case 'wind':
        if (this.rand() < dt * 14) this.spawn('gust', x, y, { life: 0.22, size: 3.5, color: '#e2fbfb', vx: (this.rand() - 0.5) * 20, vy: (this.rand() - 0.5) * 20 });
        break;
      case 'arrow':
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.exposure = Math.max(0, this.exposure - dt * 1.4);
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.kill(i, p);
        continue;
      }
      const drag = Math.max(0, 1 - p.drag * dt);
      p.vx *= drag;
      p.vy = p.vy * drag + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.size += p.grow * dt;
      if (p.kind === 'leaf' || p.kind === 'ash') {
        // Flutter: sway side to side as it drifts.
        p.x += Math.sin(this.time * 2.4 + p.phase) * 10 * dt;
      } else if (p.kind === 'firefly' || (p.ambient && p.kind === 'mote')) {
        p.vx += Math.sin(this.time * 1.3 + p.phase) * 6 * dt;
        p.vy += Math.cos(this.time * 1.1 + p.phase) * 6 * dt;
      }
      if (p.ambient && (p.x < -12 || p.x > BOARD_WIDTH + 12 || p.y < -12 || p.y > BOARD_HEIGHT + 12)) {
        this.kill(i, p);
      }
    }
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.max);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.max);
    for (const s of this.slashes) s.t += dt;
    this.slashes = this.slashes.filter((s) => s.t < s.max);
    for (const c of this.crosses) c.t += dt;
    this.crosses = this.crosses.filter((c) => c.t < c.max);
    for (const c of this.cleaves) c.t += dt;
    this.cleaves = this.cleaves.filter((c) => c.t < c.max);
    for (const f of this.fissures) f.t += dt;
    this.fissures = this.fissures.filter((f) => f.t < f.max);
    for (const l of this.pulses) l.t += dt;
    this.pulses = this.pulses.filter((l) => l.t < l.max);
    for (const c of this.corpses) c.t += dt;
    this.corpses = this.corpses.filter((c) => c.t < c.max);
    for (const [uid, r] of this.recoil) {
      r.t += dt;
      if (r.t >= 0.16) this.recoil.delete(uid);
    }
  }

  private kill(i: number, p: Particle): void {
    p.alive = false;
    if (p.ambient) this.ambientCount--;
    this.free.push(i);
  }

  /** Light pulses contributed to this frame's lighting pass. */
  lights(out: Light[]): void {
    for (const l of this.pulses) {
      const k = 1 - l.t / l.max;
      out.push({ x: l.x, y: l.y, radius: l.radius * (0.8 + 0.2 * k), family: l.family, intensity: l.intensity * ease.outQuad(k), glow: 1, tint: l.tint });
    }
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  /**
   * Marks on the floor itself, drawn straight after the ground (under every
   * figure): the Earthsplitter's cracks, running out over `FISSURE_GROW`, each
   * a dark tapered channel with a pale broken lip, fading late in its life.
   */
  drawDecals(ctx: CanvasRenderingContext2D): void {
    if (this.fissures.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const f of this.fissures) {
      const k = f.t / f.max;
      const grow = ease.outCubic(Math.min(1, f.t / FISSURE_GROW));
      const alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      // Broken earth: a soft scorch either side, then the lit lip and the dark channel.
      this.strokeCrack(ctx, f.pts, grow, `rgba(40,28,18,${0.28 * alpha})`, 2.8, 0);
      this.strokeCrack(ctx, f.pts, grow, `rgba(214,190,150,${0.45 * alpha})`, 0.6, -0.6);
      this.strokeCrack(ctx, f.pts, grow, `rgba(20,12,8,${0.85 * alpha})`, 1, 0);
      for (const b of f.branches) {
        if (grow <= b.at) continue;
        const bg = Math.min(1, (grow - b.at) / 0.25);
        this.strokeCrack(ctx, b.pts, bg, `rgba(20,12,8,${0.75 * alpha})`, 1, 0);
      }
    }
    ctx.restore();
  }

  /**
   * Stroke the first `grow` (0..1) of a crack polyline as tapered segments,
   * each `scale`× its point's width and nudged `lift` widths up the screen.
   */
  private strokeCrack(
    ctx: CanvasRenderingContext2D,
    pts: readonly CrackPoint[],
    grow: number,
    style: string,
    scale: number,
    lift: number,
  ): void {
    const reach = grow * (pts.length - 1);
    ctx.strokeStyle = style;
    for (let i = 1; i < pts.length; i++) {
      const part = Math.min(1, reach - (i - 1));
      if (part <= 0) break;
      const a = pts[i - 1];
      const b = pts[i];
      ctx.lineWidth = a.w * scale;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + a.w * lift);
      ctx.lineTo(a.x + (b.x - a.x) * part, a.y + (b.y - a.y) * part + b.w * lift);
      ctx.stroke();
    }
  }

  /** Normal-blend matter, drawn in the world (before lighting). */
  drawWorld(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const p of this.pool) {
      if (!p.alive || ADDITIVE[p.kind]) continue;
      const k = p.life / p.max; // 1 → 0
      switch (p.kind) {
        case 'smoke': {
          ctx.globalAlpha = 0.32 * Math.sin(Math.PI * Math.min(1, (1 - k) * 1.4 + 0.05)) * Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'dust': {
          ctx.globalAlpha = (p.ambient ? 0.35 : 0.6) * Math.min(1, k * 3) * Math.min(1, (1 - k) * 8 + 0.2);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        }
        case 'debris': {
          ctx.globalAlpha = Math.min(1, k * 3);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
          ctx.restore();
          break;
        }
        case 'leaf':
        case 'ash': {
          ctx.globalAlpha = Math.min(1, k * 4) * Math.min(1, (1 - k) * 6) * (p.kind === 'ash' ? 0.6 : 0.85);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.abs(Math.sin(p.rot * 1.3)) * 0.7 + 0.3);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
      }
    }
    ctx.restore();
  }

  /** Additive light: sparks, embers, motes, flashes, rings, slashes. */
  drawGlow(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // Flashes: hot radial bursts.
    for (const f of this.flashes) {
      const k = 1 - f.t / f.max;
      const r = f.r * (0.6 + 0.4 * ease.outCubic(1 - k));
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, withAlpha('#ffffff', 0.85 * k));
      g.addColorStop(0.25, withAlpha(f.color, 0.55 * k));
      g.addColorStop(1, withAlpha(f.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
    }
    // Rings: expanding shockwaves, thinning as they grow.
    for (const r of this.rings) {
      const k = r.t / r.max;
      const e = ease.outCubic(k);
      const rad = r.r0 + (r.r1 - r.r0) * e;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k * 0.7);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rad, rad * r.squash, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Slashes: a crescent swept across the strike, bright core over a colour edge.
    for (const s of this.slashes) {
      const k = s.t / s.max;
      const sweep = ease.outCubic(Math.min(1, k * 1.6));
      const a0 = s.angle - s.span / 2 - 0.4;
      const a1 = a0 + s.span * sweep;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * 2;
      ctx.beginPath();
      ctx.arc(s.x - Math.cos(s.angle) * s.radius * 0.6, s.y - Math.sin(s.angle) * s.radius * 0.6, s.radius, a0, a1);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s.width * 0.7;
      ctx.beginPath();
      ctx.arc(s.x - Math.cos(s.angle) * s.radius * 0.6, s.y - Math.sin(s.angle) * s.radius * 0.6, s.radius, a0 + (a1 - a0) * 0.35, a1);
      ctx.stroke();
    }
    // Claymore cleaves: a broad crescent band whose leading edge sweeps across
    // the arc, densest at the edge and trailing off, with a bright rim.
    for (const c of this.cleaves) {
      const k = c.t / c.max;
      const sweep = ease.outCubic(Math.min(1, k * 1.8));
      const a0 = c.angle - c.half * c.dir;
      const lead = a0 + 2 * c.half * c.dir * sweep;
      const span = 2 * c.half * 0.75;
      const r1 = c.radius * 0.98;
      const r0 = c.radius * 0.5;
      const ccw = c.dir < 0;
      const clampA = (a: number) => ((a - a0) * c.dir < 0 ? a0 : a);
      const N = 12;
      for (let i = 0; i < N; i++) {
        const f1 = (i + 1) / N; // 0 at the tail → 1 at the leading edge
        const s0 = clampA(lead - c.dir * span * (1 - i / N));
        const s1 = clampA(lead - c.dir * span * (1 - f1));
        if (s0 === s1) continue;
        const inner = r0 + (r1 - r0) * 0.55 * (1 - f1);
        ctx.globalAlpha = (1 - k) * 0.45 * f1;
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r1, s0, s1, ccw);
        ctx.arc(c.x, c.y, inner, s1, s0, !ccw);
        ctx.closePath();
        ctx.fill();
      }
      const tailA = clampA(lead - c.dir * span * 0.6);
      if (tailA !== lead) {
        ctx.globalAlpha = (1 - k) * 0.95;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.4 * (1 - k * 0.6);
        ctx.beginPath();
        ctx.arc(c.x, c.y, r1, tailA, lead, ccw);
        ctx.stroke();
      }
    }
    // Cross Slash marks: two tapered diagonal cuts that wipe in one a beat after
    // the other — the lead's chop down ("\" facing right), then the off blade's
    // rip up ("/") — a colour edge under a white core, then thin and fade.
    for (const c of this.crosses) {
      const k = c.t / c.max;
      const fade = 1 - Math.max(0, (k - 0.35) / 0.65);
      for (let i = 0; i < 2; i++) {
        const w = Math.min(1, Math.max(0, (k - i * 0.1) / 0.18));
        if (w <= 0) continue;
        // Lead: from the top on the swing's back side, down across; off: from the
        // bottom on the back side, up across.
        const a = c.side > 0 ? (i === 0 ? Math.PI / 4 : -Math.PI / 4) : i === 0 ? (3 * Math.PI) / 4 : (-3 * Math.PI) / 4;
        const len = c.size * ease.outCubic(w);
        const thick = 3.8 - 2 * k;
        ctx.save();
        ctx.translate(c.x - (Math.cos(a) * c.size) / 2, c.y - (Math.sin(a) * c.size) / 2);
        ctx.rotate(a);
        ctx.globalAlpha = fade * 0.9;
        ctx.fillStyle = c.color;
        lens(ctx, len, thick * 1.9);
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#ffffff';
        lens(ctx, len, thick);
        ctx.restore();
      }
    }
    // Fissure glow: molten light inside a fresh crack, cooling fast.
    for (const f of this.fissures) {
      const heat = 1 - f.t / 0.6;
      if (heat <= 0) continue;
      const grow = ease.outCubic(Math.min(1, f.t / FISSURE_GROW));
      ctx.lineJoin = 'round';
      ctx.globalAlpha = heat * 0.8;
      this.strokeCrack(ctx, f.pts, grow, '#ff6a2a', 0.6, 0);
      ctx.globalAlpha = heat;
      this.strokeCrack(ctx, f.pts, grow, '#ffc46a', 0.22, 0);
    }
    ctx.globalAlpha = 1;
    // Particles.
    for (const p of this.pool) {
      if (!p.alive || !ADDITIVE[p.kind]) continue;
      const k = p.life / p.max;
      switch (p.kind) {
        case 'spark': {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = Math.min(10, 2 + sp * 0.03);
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.strokeStyle = k > 0.5 ? p.color : p.color2;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
          ctx.stroke();
          break;
        }
        case 'ember': {
          const fl = 0.7 + 0.3 * Math.sin(this.time * 18 + p.phase);
          ctx.globalAlpha = Math.min(1, k * 2) * fl * (p.ambient ? 0.8 : 1);
          ctx.fillStyle = k > 0.5 ? p.color : p.color2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha *= p.ambient ? 0.16 : 0.3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (p.ambient ? 2 : 3), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'mote':
        case 'firefly': {
          const blink = p.kind === 'firefly' ? Math.max(0, Math.sin(this.time * 2.2 + p.phase)) : 1;
          const fade = p.ambient ? Math.min(1, k * 3) * Math.min(1, (1 - k) * 3) : Math.min(1, k * 2);
          ctx.globalAlpha = fade * blink * (p.ambient ? 0.55 : 0.9);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2.4, 0, Math.PI * 2);
          ctx.globalAlpha *= 0.35;
          ctx.fill();
          ctx.globalAlpha = fade * blink * (p.ambient ? 0.7 : 1);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'shard': {
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = k > 0.5 ? p.color : p.color2;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.moveTo(0, -p.size * 1.4);
          ctx.lineTo(p.size * 0.6, 0);
          ctx.lineTo(0, p.size * 1.4);
          ctx.lineTo(-p.size * 0.6, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'gust': {
          const sp = Math.atan2(p.vy, p.vx);
          ctx.globalAlpha = Math.min(1, k * 2) * 0.7;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, sp + 1.2, sp + 2.6);
          ctx.stroke();
          break;
        }
      }
    }
    ctx.restore();
  }
}

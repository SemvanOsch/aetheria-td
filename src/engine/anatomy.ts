/**
 * Shared body construction for the procedural figures in `sprites.ts`.
 *
 * Every champion and foe used to be the same blank: two stroked stick legs and a
 * teardrop torso, told apart only by headgear and weapon. These helpers build a
 * body from parts instead — jointed legs with knees and booted feet, a torso with
 * shoulders, waist and a skirt/hem, elbowed arms ending in hands, pauldrons and
 * capes — so each archetype can carry its own proportions (broad tanks, lean
 * rangers, flowing casters) while sharing one construction language.
 *
 * Conventions match the sprites: local space with the origin at the figure's
 * centre, side views authored facing +x, flat fills only (the figure compositor
 * adds form shading, rim light and the ink outline over the finished figure).
 */

import { shade } from './palette';

type Ctx = CanvasRenderingContext2D;

/**
 * A filled tapered capsule from (x0,y0) radius r0 to (x1,y1) radius r1 — the
 * primitive every limb segment is built from (thigh, shin, upper arm, forearm).
 */
export function seg(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, fill: string): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 0.001;
  const a = Math.atan2(dy, dx);
  const phi = Math.asin(Math.max(-1, Math.min(1, (r0 - r1) / len)));
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x0, y0, r0, a + Math.PI / 2 + phi, a + (Math.PI * 3) / 2 - phi);
  ctx.arc(x1, y1, r1, a - Math.PI / 2 - phi, a + Math.PI / 2 + phi);
  ctx.closePath();
  ctx.fill();
}

// --- legs -------------------------------------------------------------------

export interface LegLook {
  /** Trouser / hose / greave colour. */
  cloth: string;
  boot: string;
  /** Thigh width (the shin tapers from it). */
  w: number;
  /** How far up the shin the boot shaft reaches (0..1 of the shin). */
  bootUp?: number;
  /** Toe length ahead of the ankle (side view). */
  toe?: number;
  /** Optional knee cop / poleyn colour (plate legs). */
  knee?: string;
  /** Pointed shoe (the Bard's) rather than a blunt boot. */
  pointed?: boolean;
}

/**
 * A side-on leg from the hip (hx,hy) to the sole under the ankle (fx,fy): a
 * tapered thigh and shin hinged at a knee pushed forward (+x) by `bend`, a boot
 * shaft over the lower shin, and a foot whose toe points +x.
 */
export function legSide(ctx: Ctx, hx: number, hy: number, fx: number, fy: number, look: LegLook, bend = 1): void {
  const r = look.w / 2;
  const ax = fx;
  const ay = fy - 1.5;
  const len = Math.hypot(ax - hx, ay - hy) || 0.001;
  // Perpendicular to the leg, oriented toward +x so knees bend forward.
  let nx = (ay - hy) / len;
  let ny = -(ax - hx) / len;
  if (nx < 0) {
    nx = -nx;
    ny = -ny;
  }
  const kx = (hx + ax) / 2 + nx * bend;
  const ky = (hy + ay) / 2 + ny * bend;
  seg(ctx, hx, hy, kx, ky, r, r * 0.8, look.cloth);
  seg(ctx, kx, ky, ax, ay, r * 0.8, r * 0.66, look.cloth);
  // Boot shaft up the shin.
  const up = look.bootUp ?? 0.5;
  const bx = ax + (kx - ax) * up;
  const by = ay + (ky - ay) * up;
  seg(ctx, bx, by, ax, ay, r * 0.86, r * 0.76, look.boot);
  if (look.knee) {
    ctx.fillStyle = look.knee;
    ctx.beginPath();
    ctx.ellipse(kx + 0.3, ky, r * 0.9, r * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Foot: heel behind the ankle, toe reaching forward.
  const toe = look.toe ?? r * 1.5 + 0.6;
  const heel = r * 0.8;
  ctx.fillStyle = look.boot;
  ctx.beginPath();
  ctx.moveTo(ax - heel, fy);
  if (look.pointed) {
    ctx.lineTo(ax + toe + 1.2, fy - 0.9);
    ctx.quadraticCurveTo(ax + toe * 0.5, fy - 2.4, ax - heel * 0.4, fy - 2.6);
  } else {
    ctx.lineTo(ax + toe, fy);
    ctx.quadraticCurveTo(ax + toe + 0.7, fy - 1.7, ax + toe * 0.3, fy - 2.4);
    ctx.lineTo(ax - heel * 0.6, fy - 2.7);
  }
  ctx.quadraticCurveTo(ax - heel - 0.3, fy - 1.6, ax - heel, fy);
  ctx.closePath();
  ctx.fill();
}

/**
 * A leg seen from the front or back: hip (hx,hy) down to the sole at (fx,fy),
 * a slight inward knee, boot shaft, and a foot that reads as a toe-cap toward the
 * viewer (front) or a heel (back).
 */
export function legFront(ctx: Ctx, hx: number, hy: number, fx: number, fy: number, look: LegLook, back = false): void {
  const r = look.w / 2;
  const ay = fy - 1.6;
  const kx = (hx + fx) / 2 - Math.sign(hx || 1) * 0.25;
  const ky = (hy + ay) / 2;
  seg(ctx, hx, hy, kx, ky, r, r * 0.82, look.cloth);
  seg(ctx, kx, ky, fx, ay, r * 0.82, r * 0.7, look.cloth);
  const up = look.bootUp ?? 0.5;
  seg(ctx, fx + (kx - fx) * up, ay + (ky - ay) * up, fx, ay, r * 0.9, r * 0.8, look.boot);
  if (look.knee) {
    ctx.fillStyle = look.knee;
    ctx.beginPath();
    ctx.ellipse(kx, ky, r * 0.85, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = look.boot;
  ctx.beginPath();
  if (back) ctx.ellipse(fx, fy - 1, r * 0.95, 1.3, 0, 0, Math.PI * 2);
  else ctx.ellipse(fx, fy - 0.9, r * 1.12, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Both legs of a side-on walker, stride driven by `phase` (radians, advanced
 * from distance travelled). The far leg is drawn first and a shade darker; the
 * leg swinging forward lifts its foot and bends its knee harder, so the gait
 * reads as a step rather than a pair of scissors.
 */
export function walkLegsSide(
  ctx: Ctx,
  phase: number,
  o: { hipY: number; footY: number; stride: number; look: LegLook; hipX?: number; lift?: number },
): void {
  const s = Math.sin(phase) * o.stride;
  const c = Math.cos(phase);
  const hx = o.hipX ?? 0;
  const lift = o.lift ?? 1.6;
  const liftA = Math.max(0, c) * lift; // near leg swings forward while cos > 0
  const liftB = Math.max(0, -c) * lift;
  const far: LegLook = { ...o.look, cloth: shade(o.look.cloth, -0.16), boot: shade(o.look.boot, -0.12) };
  if (o.look.knee) far.knee = shade(o.look.knee, -0.16);
  legSide(ctx, hx - 0.8, o.hipY, hx - 1 - s, o.footY - liftB, far, 0.7 + liftB * 0.9);
  legSide(ctx, hx + 0.8, o.hipY, hx + 1 + s, o.footY - liftA, o.look, 0.7 + liftA * 0.9);
}

/** Both legs of a walker marching toward (front) or away from (back) the viewer. */
export function walkLegsFront(
  ctx: Ctx,
  phase: number,
  o: { hipY: number; footY: number; sep: number; look: LegLook; back: boolean; lift?: number; splay?: number },
): void {
  const swing = Math.sin(phase);
  const lift = o.lift ?? 2.6;
  const splay = o.splay ?? 0.4;
  const lL = Math.max(0, swing) * lift;
  const lR = Math.max(0, -swing) * lift;
  legFront(ctx, -o.sep, o.hipY, -o.sep - splay, o.footY - lL, o.look, o.back);
  legFront(ctx, o.sep, o.hipY, o.sep + splay, o.footY - lR, o.look, o.back);
}

// --- arms -------------------------------------------------------------------

export interface ArmLook {
  sleeve: string;
  /** Hand colour — skin, or a glove/gauntlet. */
  hand: string;
  /** Upper-arm width. */
  w: number;
  /** Optional cuff / bracer band at the wrist. */
  cuff?: string;
  /** Bell sleeve (casters): the forearm flares wide toward the wrist. */
  bell?: boolean;
}

/**
 * An arm from the shoulder (sx,sy) to the hand (hx,hy), hinged at an elbow offset
 * by `bend` along the arm's left-hand perpendicular (for an arm reaching +x a
 * positive bend drops the elbow). Ends in a round hand.
 */
export function arm(ctx: Ctx, sx: number, sy: number, hx: number, hy: number, look: ArmLook, bend = 1.2): void {
  const r = look.w / 2;
  const dx = hx - sx;
  const dy = hy - sy;
  const len = Math.hypot(dx, dy) || 0.001;
  const ex = (sx + hx) / 2 + (-dy / len) * bend;
  const ey = (sy + hy) / 2 + (dx / len) * bend;
  seg(ctx, sx, sy, ex, ey, r, r * 0.84, look.sleeve);
  forearm(ctx, sx, sy, hx, hy, look, bend);
}

/**
 * Just the lower half of `arm` with the same arguments: the forearm from the
 * elbow, the cuff and the hand. Repainting it over a mantle lets a raised
 * forearm sit in front of a cloak that still covers the upper arm.
 */
export function forearm(ctx: Ctx, sx: number, sy: number, hx: number, hy: number, look: ArmLook, bend = 1.2): void {
  const r = look.w / 2;
  const dx = hx - sx;
  const dy = hy - sy;
  const len = Math.hypot(dx, dy) || 0.001;
  const ex = (sx + hx) / 2 + (-dy / len) * bend;
  const ey = (sy + hy) / 2 + (dx / len) * bend;
  if (look.bell) {
    // A flared sleeve: the cuff opening is wider than the elbow.
    seg(ctx, ex, ey, hx - (hx - ex) * 0.18, hy - (hy - ey) * 0.18, r * 0.84, r * 1.25, look.sleeve);
  } else {
    seg(ctx, ex, ey, hx, hy, r * 0.84, r * 0.68, look.sleeve);
  }
  if (look.cuff) {
    const cx = hx - (hx - ex) * 0.22;
    const cy = hy - (hy - ey) * 0.22;
    seg(ctx, cx, cy, hx - (hx - ex) * 0.04, hy - (hy - ey) * 0.04, r * 0.8, r * 0.76, look.cuff);
  }
  ctx.fillStyle = look.hand;
  ctx.beginPath();
  ctx.arc(hx, hy, Math.max(1.1, r * 0.66), 0, Math.PI * 2);
  ctx.fill();
}

// --- torsos -----------------------------------------------------------------

export interface TorsoSide {
  color: string;
  lit: string;
  dark: string;
  /** Neckline y (top of the torso). */
  top: number;
  waistY: number;
  /** Bottom of the tunic / skirt / tassets. */
  hemY: number;
  /** Chest reach forward (+x) and back reach (-x) at the shoulders. */
  chest: number;
  back: number;
  /** Half-depth at the waist. */
  waist: number;
  /** Skirt reach at the hem, front and back (a flare reads as a tunic/coat). */
  hemF: number;
  hemB: number;
  /** Shift the whole body forward/back by y (a lean into the attack). */
  lean?: number;
}

/**
 * A side-view torso: rounded shoulders, a chest bulging forward, a waist pinch,
 * and a skirt that flares to the hem — then a lit band down the front and a cool
 * band down the back so it reads as a volume rather than a blob.
 */
export function torsoSide(ctx: Ctx, t: TorsoSide): void {
  const lean = t.lean ?? 0;
  const L = (y: number) => lean * ((t.hemY - y) / (t.hemY - t.top || 1));
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-t.back * 0.45 + L(t.top), t.top);
    ctx.quadraticCurveTo(-t.back + L(t.top), t.top + 0.4, -t.back + L(t.top + 3), t.top + 3.2);
    ctx.quadraticCurveTo(-t.back * 0.98 + L(t.waistY - 2), t.waistY - 2.4, -t.waist + L(t.waistY), t.waistY);
    ctx.quadraticCurveTo(-t.hemB * 0.9, (t.waistY + t.hemY) / 2 + 0.6, -t.hemB, t.hemY);
    ctx.quadraticCurveTo(0, t.hemY + 1.3, t.hemF, t.hemY - 0.2);
    ctx.quadraticCurveTo(t.waist * 1.05 + L(t.waistY + 1), t.waistY + 1.6, t.waist + L(t.waistY), t.waistY);
    ctx.quadraticCurveTo(t.chest * 1.12 + L(t.top + 4), t.top + 4, t.chest * 0.5 + L(t.top), t.top - 0.1);
    ctx.quadraticCurveTo(0 + L(t.top), t.top - 0.9, -t.back * 0.45 + L(t.top), t.top);
    ctx.closePath();
  };
  path();
  ctx.fillStyle = t.color;
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  const midY = (t.top + t.hemY) / 2;
  const h = t.hemY - t.top;
  ctx.fillStyle = t.lit;
  ctx.beginPath();
  ctx.ellipse(t.chest * 1.05 + lean * 0.5, midY - 0.5, t.chest * 0.62, h * 0.66, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = t.dark;
  ctx.beginPath();
  ctx.ellipse(-t.back * 1.12 + lean * 0.5, midY + 1, t.back * 0.5, h * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export interface TorsoFront {
  color: string;
  lit: string;
  dark: string;
  top: number;
  waistY: number;
  hemY: number;
  /** Half-widths at the shoulders, waist and hem. */
  shoulder: number;
  waist: number;
  hem: number;
  /** Seen from behind: no lit centre, a spine seam instead. */
  back?: boolean;
  /** Spine / centre seam colour (back view). */
  seam?: string;
}

/** A front/back torso: shoulders → waist pinch → hem, symmetric. */
export function torsoFront(ctx: Ctx, t: TorsoFront): void {
  const n = t.shoulder * 0.34;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-n, t.top);
    ctx.quadraticCurveTo(-t.shoulder * 0.9, t.top - 0.3, -t.shoulder, t.top + 2.6);
    ctx.quadraticCurveTo(-t.shoulder * 0.96, t.waistY - 3, -t.waist, t.waistY);
    ctx.quadraticCurveTo(-t.hem * 0.96, (t.waistY + t.hemY) / 2, -t.hem, t.hemY);
    ctx.quadraticCurveTo(0, t.hemY + 1.5, t.hem, t.hemY);
    ctx.quadraticCurveTo(t.hem * 0.96, (t.waistY + t.hemY) / 2, t.waist, t.waistY);
    ctx.quadraticCurveTo(t.shoulder * 0.96, t.waistY - 3, t.shoulder, t.top + 2.6);
    ctx.quadraticCurveTo(t.shoulder * 0.9, t.top - 0.3, n, t.top);
    ctx.quadraticCurveTo(0, t.top + (t.back ? 0.2 : 1.1), -n, t.top);
    ctx.closePath();
  };
  path();
  ctx.fillStyle = t.color;
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  const midY = (t.top + t.hemY) / 2;
  const h = t.hemY - t.top;
  ctx.fillStyle = t.dark;
  ctx.beginPath();
  ctx.ellipse(-t.shoulder * 1.15, midY + 1, t.shoulder * 0.42, h * 0.72, 0, 0, Math.PI * 2);
  ctx.ellipse(t.shoulder * 1.15, midY + 1, t.shoulder * 0.42, h * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!t.back) {
    ctx.fillStyle = t.lit;
    ctx.beginPath();
    ctx.ellipse(-t.shoulder * 0.12, midY - 1, t.shoulder * 0.4, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (t.seam) {
    ctx.strokeStyle = t.seam;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, t.top + 1);
    ctx.lineTo(0, t.hemY);
    ctx.stroke();
  }
  ctx.restore();
}

// --- armour, belts, capes ---------------------------------------------------

/**
 * A layered shoulder pauldron centred on (x,y): a domed cap over a lower lame,
 * with a lit crown. `r` is the cap's half-width; `tilt` rotates it.
 */
export function pauldron(ctx: Ctx, x: number, y: number, r: number, metal: string, tilt = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = shade(metal, -0.28);
  ctx.beginPath();
  ctx.ellipse(0, r * 0.5, r * 0.96, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.7, 0, Math.PI, 0);
  ctx.quadraticCurveTo(r * 0.9, r * 0.45, 0, r * 0.4);
  ctx.quadraticCurveTo(-r * 0.9, r * 0.45, -r, 0);
  ctx.fill();
  ctx.fillStyle = shade(metal, 0.3);
  ctx.beginPath();
  ctx.ellipse(-r * 0.2, -r * 0.3, r * 0.5, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A belt across a torso from x0 to x1 at y, sagging by `sag`, with a buckle. */
export function belt(ctx: Ctx, x0: number, x1: number, y: number, color: string, buckle?: string, sag = 1, w = 1.5, buckleX?: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.quadraticCurveTo((x0 + x1) / 2, y + sag, x1, y);
  ctx.stroke();
  ctx.lineCap = 'round';
  if (buckle) {
    const bx = buckleX ?? (x0 + x1) / 2;
    const t = (bx - x0) / (x1 - x0 || 1);
    const by = y + sag * 2 * t * (1 - t);
    ctx.fillStyle = buckle;
    ctx.fillRect(bx - w * 0.6, by - w * 0.7, w * 1.2, w * 1.4);
  }
}

/**
 * A side-view cape hanging from the shoulder (x,y) and trailing behind (-x):
 * `len` long, flaring `flare` at the hem and streaming back by `wind` (0..1).
 */
export function capeSide(ctx: Ctx, x: number, y: number, len: number, flare: number, color: string, wind = 0, trim?: string): void {
  const tailX = x - flare - wind * 3;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + 1.2, y - 0.6);
  ctx.quadraticCurveTo(x - flare * 0.6 - wind * 2.5, y + len * 0.35, tailX, y + len);
  ctx.quadraticCurveTo(x - flare * 0.4, y + len + 0.6 - wind, x + 0.6, y + len - 1.4);
  ctx.quadraticCurveTo(x + 0.4, y + len * 0.5, x + 1.2, y - 0.6);
  ctx.closePath();
  ctx.fill();
  if (trim) {
    ctx.strokeStyle = trim;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(tailX, y + len);
    ctx.quadraticCurveTo(x - flare * 0.4, y + len + 0.6 - wind, x + 0.6, y + len - 1.4);
    ctx.stroke();
  }
}

/** A neck stub joining head to torso (reads at small sizes as posture). */
export function neck(ctx: Ctx, x: number, top: number, bottom: number, w: number, skin: string): void {
  seg(ctx, x, top, x, bottom, w / 2, w / 2 + 0.2, skin);
}

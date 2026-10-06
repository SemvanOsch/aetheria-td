/**
 * Armor art — the item icons for the player's equipment.
 *
 * Armor is stat-boosting equipment and is never drawn on the adventurer; these
 * painters exist only for `drawArmorIcon` (the armory, the loot toast, the
 * journal plate). Each piece is still authored in the adventurer's figure
 * space (feet at y≈+11, head centre at y≈-11.6, facing +x) with flat fills, so
 * the figure compositor finishes an icon exactly like a sprite.
 *
 * A piece's *shape* comes from its set's `style`; its *metal* from its rarity
 * (`FINISH`): iron → polished steel → blackened steel and gold → gilded plate.
 */

import type { ArmorLookPiece, ArmorRarity, ArmorSlot } from '../domain/armor';
import { seg } from './anatomy';
import { LIGHT, MATERIAL, shade, withAlpha } from './palette';

type Ctx = CanvasRenderingContext2D;

/** The body measurements the pieces fit to (structurally the sprite's build). */
interface ArmorFit {
  /** Foot spread. */
  leg: number;
  head: number;
  shoulder: number;
  waist: number;
  legW: number;
}

/** Torso landmarks shared with `drawPlayerSprite`. */
const TORSO_TOP = -7.4;
const WAIST_Y = 1.2;
const SHOULDER_Y = -5.6;
const HEAD_Y = -11.6;

interface Finish {
  metal: string;
  lit: string;
  dark: string;
  trim: string;
  /** Inset gem (rare and up). */
  gem?: string;
}

/** The metal each rarity is forged from. */
const FINISH: Record<ArmorRarity, Finish> = {
  common: {
    metal: MATERIAL.stone,
    lit: shade(MATERIAL.stone, 0.28),
    dark: MATERIAL.stoneDark,
    trim: MATERIAL.leather,
  },
  rare: {
    metal: MATERIAL.steel,
    lit: shade(MATERIAL.steel, 0.5),
    dark: MATERIAL.steelDark,
    trim: shade(MATERIAL.steelDark, -0.2),
    gem: LIGHT.frost.glow,
  },
  epic: {
    metal: shade(MATERIAL.iron, -0.1),
    lit: shade(MATERIAL.iron, 0.22),
    dark: shade(MATERIAL.iron, -0.42),
    trim: MATERIAL.gold,
    gem: LIGHT.arcane.glow,
  },
  legendary: {
    metal: MATERIAL.gold,
    lit: shade(MATERIAL.gold, 0.45),
    dark: MATERIAL.goldDark,
    trim: LIGHT.holy.core,
    gem: LIGHT.blood.glow,
  },
};

function finishOf(piece: ArmorLookPiece): Finish {
  return FINISH[piece.rarity] ?? FINISH.common;
}

/** A small faceted gem with a highlight. */
function gem(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = shade(color, -0.35);
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.8, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.8, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.7);
  ctx.lineTo(x + r * 0.5, y);
  ctx.lineTo(x, y + r * 0.4);
  ctx.lineTo(x - r * 0.5, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y - r * 0.3, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Hip, knee and ankle of one leg — the same joints `legSide` hinges on. */
function legJoints(hx: number, hy: number, fx: number, fy: number, bend: number) {
  const ax = fx;
  const ay = fy - 1.5;
  const len = Math.hypot(ax - hx, ay - hy) || 0.001;
  let nx = (ay - hy) / len;
  let ny = -(ax - hx) / len;
  if (nx < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { hx, hy, kx: (hx + ax) / 2 + nx * bend, ky: (hy + ay) / 2 + ny * bend, ax, ay, fy };
}

/** Both legs as `drawPlayerSprite` stands them: far (dim) first, then near. */
function legsOf(fit: ArmorFit) {
  return [
    { ...legJoints(-1.4, 4, -fit.leg, 11, 0.6), far: true },
    { ...legJoints(2, 4, fit.leg + 0.2, 11, 1), far: false },
  ];
}

// ---------------------------------------------------------------- legs

/** Cuisses over the thighs, greaves down the shins and a knee cop. */
function drawArmorLegPlates(ctx: Ctx, fit: ArmorFit, piece: ArmorLookPiece): void {
  const f = finishOf(piece);
  const r = fit.legW / 2;
  for (const l of legsOf(fit)) {
    const dim = l.far ? -0.16 : 0;
    seg(ctx, l.hx, l.hy + 0.4, l.kx, l.ky, r * 1.04, r * 0.86, shade(f.metal, dim));
    seg(ctx, l.kx, l.ky, l.ax, l.ay - 0.6, r * 0.88, r * 0.74, shade(f.metal, dim - 0.05));
    // A lit ridge down the front of the greave.
    seg(ctx, l.kx + r * 0.35, l.ky + 0.6, l.ax + r * 0.3, l.ay - 1.4, r * 0.22, r * 0.16, shade(f.lit, dim));
    // Knee cop with a trimmed wing.
    ctx.fillStyle = shade(f.trim, dim);
    ctx.beginPath();
    ctx.ellipse(l.kx + 0.5, l.ky, r * 0.95, r * 0.8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(f.lit, dim);
    ctx.beginPath();
    ctx.ellipse(l.kx + 0.6, l.ky - 0.1, r * 0.55, r * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Tassets: two rows of lames hanging from the waist over the hips. */
function drawArmorTassets(ctx: Ctx, fit: ArmorFit, piece: ArmorLookPiece): void {
  const f = finishOf(piece);
  const w = fit.waist + 0.9;
  const rows = [
    { y: WAIST_Y + 0.5, h: 2.4, w },
    { y: WAIST_Y + 2.5, h: 2.2, w: w + 0.5 },
  ];
  for (const [i, row] of rows.entries()) {
    const lame = () => {
      ctx.beginPath();
      ctx.moveTo(-row.w + 0.2, row.y);
      ctx.lineTo(row.w - 0.2 + 0.4, row.y);
      ctx.lineTo(row.w + 0.5, row.y + row.h);
      ctx.quadraticCurveTo(0.3, row.y + row.h + 0.9, -row.w - 0.3, row.y + row.h);
      ctx.closePath();
    };
    lame();
    ctx.fillStyle = i === 0 ? f.metal : shade(f.metal, -0.08);
    ctx.fill();
    ctx.save();
    lame();
    ctx.clip();
    ctx.fillStyle = f.lit;
    ctx.fillRect(-row.w - 1, row.y, row.w * 0.45, row.h + 1);
    ctx.fillStyle = f.dark;
    ctx.fillRect(row.w * 0.55, row.y, row.w, row.h + 1);
    ctx.restore();
    // Trimmed lower edge.
    ctx.strokeStyle = f.trim;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(row.w + 0.5, row.y + row.h);
    ctx.quadraticCurveTo(0.3, row.y + row.h + 0.9, -row.w - 0.3, row.y + row.h);
    ctx.stroke();
  }
  // The centre split between the left and right tasset.
  ctx.strokeStyle = f.dark;
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(0.4, WAIST_Y + 0.6);
  ctx.lineTo(0.4, WAIST_Y + 5.3);
  ctx.stroke();
}

// ---------------------------------------------------------------- boots

/** Sabatons: a plated shaft up the shin and a laminated foot with a pointed toe. */
function drawArmorBoots(ctx: Ctx, fit: ArmorFit, piece: ArmorLookPiece): void {
  const f = finishOf(piece);
  const r = fit.legW / 2;
  for (const l of legsOf(fit)) {
    const dim = l.far ? -0.16 : 0;
    const metal = shade(f.metal, dim);
    // Shaft: the lower 45% of the shin.
    const bx = l.ax + (l.kx - l.ax) * 0.45;
    const by = l.ay + (l.ky - l.ay) * 0.45;
    seg(ctx, bx, by, l.ax, l.ay, r * 0.98, r * 0.86, metal);
    // Cuff band at the top of the shaft.
    seg(ctx, bx - 0.1, by, bx + 0.05, by + 0.5, r * 1.04, r * 1.02, shade(f.trim, dim));
    // Foot: heel behind the ankle, a long pointed toe ahead.
    const ax = l.ax;
    const fy = l.fy;
    const toe = r * 1.5 + 1.4;
    const heel = r * 0.85;
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.moveTo(ax - heel, fy);
    ctx.lineTo(ax + toe + 0.8, fy - 0.2);
    ctx.quadraticCurveTo(ax + toe * 0.5, fy - 2.3, ax - heel * 0.5, fy - 2.8);
    ctx.quadraticCurveTo(ax - heel - 0.4, fy - 1.6, ax - heel, fy);
    ctx.closePath();
    ctx.fill();
    // Lames across the instep and a lit ridge.
    ctx.strokeStyle = shade(f.dark, dim);
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    for (const t of [0.35, 0.65]) {
      const x = ax - heel * 0.4 + (toe + heel) * t;
      ctx.moveTo(x - 0.2, fy - 2.2 + t * 1.3);
      ctx.lineTo(x + 0.3, fy - 0.2);
    }
    ctx.stroke();
    ctx.fillStyle = shade(f.lit, dim);
    ctx.beginPath();
    ctx.ellipse(ax + toe * 0.35, fy - 1.6, toe * 0.35, 0.3, 0.25, 0, Math.PI * 2);
    ctx.fill();
    // Sole.
    ctx.fillStyle = shade(f.dark, dim - 0.2);
    ctx.fillRect(ax - heel, fy - 0.45, toe + heel + 0.6, 0.45);
  }
}

// ---------------------------------------------------------------- chest

/** Breastplate, gorget and the set's tabard. */
function drawArmorCuirass(ctx: Ctx, fit: ArmorFit, piece: ArmorLookPiece): void {
  const f = finishOf(piece);
  const sh = fit.shoulder + 0.3;
  const wa = fit.waist + 0.4;
  const top = TORSO_TOP + 0.5;
  const bottom = WAIST_Y + 1;

  // Tabard in the set's cloth, hanging below the plate to the knees.
  const cloth = piece.cloth;
  const tw = Math.min(fit.shoulder, fit.waist) * 0.62;
  const tabard = () => {
    ctx.beginPath();
    ctx.moveTo(-tw * 0.8, bottom - 1);
    ctx.lineTo(tw * 0.8 + 0.4, bottom - 1);
    ctx.lineTo(tw + 0.7, bottom + 6);
    ctx.lineTo(0.35, bottom + 7.2);
    ctx.lineTo(-tw - 0.2, bottom + 6);
    ctx.closePath();
  };
  tabard();
  ctx.fillStyle = cloth;
  ctx.fill();
  ctx.save();
  tabard();
  ctx.clip();
  ctx.fillStyle = shade(cloth, 0.16);
  ctx.fillRect(-tw - 1, bottom - 1, tw * 0.9, 9);
  ctx.restore();
  tabard();
  ctx.strokeStyle = f.trim;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // The breastplate: a rounded shell with a centre ridge.
  const plate = () => {
    ctx.beginPath();
    ctx.moveTo(-sh * 0.42, top);
    ctx.quadraticCurveTo(-sh, top - 0.2, -sh, top + 2.4);
    ctx.quadraticCurveTo(-sh * 0.98, bottom - 3, -wa, bottom);
    ctx.quadraticCurveTo(0.3, bottom + 1.2, wa + 0.4, bottom);
    ctx.quadraticCurveTo(sh * 0.98 + 0.4, bottom - 3, sh + 0.4, top + 2.4);
    ctx.quadraticCurveTo(sh + 0.4, top - 0.2, sh * 0.42 + 0.4, top);
    ctx.quadraticCurveTo(0.3, top + 1.4, -sh * 0.42, top);
    ctx.closePath();
  };
  plate();
  ctx.fillStyle = f.metal;
  ctx.fill();
  ctx.save();
  plate();
  ctx.clip();
  // Lit left breast, shadowed right flank.
  ctx.fillStyle = f.lit;
  ctx.beginPath();
  ctx.ellipse(-sh * 0.35, top + 3.2, sh * 0.45, 2.6, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = f.dark;
  ctx.beginPath();
  ctx.ellipse(sh * 1.05, (top + bottom) / 2 + 1, sh * 0.45, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Centre ridge.
  ctx.strokeStyle = f.dark;
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(0.3, top + 1.4);
  ctx.lineTo(0.35, bottom + 0.6);
  ctx.stroke();
  // Lower plackart lame.
  ctx.strokeStyle = withAlpha(f.dark, 0.9);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(-wa - 0.4, bottom - 2.2);
  ctx.quadraticCurveTo(0.3, bottom - 1.2, wa + 0.8, bottom - 2.2);
  ctx.stroke();
  ctx.restore();
  // Trimmed neckline and hem.
  ctx.strokeStyle = f.trim;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-sh * 0.42, top);
  ctx.quadraticCurveTo(0.3, top + 1.4, sh * 0.42 + 0.4, top);
  ctx.moveTo(-wa, bottom);
  ctx.quadraticCurveTo(0.3, bottom + 1.2, wa + 0.4, bottom);
  ctx.stroke();

  // Gorget band around the neck.
  ctx.fillStyle = f.metal;
  ctx.beginPath();
  ctx.ellipse(0.25, top - 0.1, 2.3, 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = f.lit;
  ctx.beginPath();
  ctx.ellipse(-0.3, top - 0.4, 1.2, 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // The crown sigil on the chest: a gem for rare and up, else an embossed boss.
  if (f.gem) gem(ctx, 0.3, top + 3.6, 1.05, f.gem);
  else {
    ctx.fillStyle = f.trim;
    ctx.beginPath();
    ctx.arc(0.3, top + 3.6, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Layered pauldrons over both shoulders. */
function drawArmorPauldrons(ctx: Ctx, fit: ArmorFit, piece: ArmorLookPiece): void {
  const f = finishOf(piece);
  const r = 2.05 + fit.shoulder * 0.08;
  for (const [x, far] of [[-fit.shoulder + 0.9, true], [fit.shoulder - 0.6, false]] as const) {
    const dim = far ? -0.18 : 0;
    ctx.save();
    ctx.translate(x, SHOULDER_Y + 0.2);
    ctx.rotate(far ? -0.3 : 0.3);
    // Lower lame, then the cap.
    ctx.fillStyle = shade(f.dark, dim);
    ctx.beginPath();
    ctx.ellipse(0, r * 0.62, r * 0.98, r * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(f.trim, dim);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.62, r * 0.98, r * 0.48, 0, 0.1, Math.PI - 0.1);
    ctx.stroke();
    ctx.fillStyle = shade(f.metal, dim);
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.74, 0, Math.PI, 0);
    ctx.quadraticCurveTo(r * 0.9, r * 0.5, 0, r * 0.44);
    ctx.quadraticCurveTo(-r * 0.9, r * 0.5, -r, 0);
    ctx.fill();
    ctx.fillStyle = shade(f.lit, dim);
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, -r * 0.32, r * 0.5, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    // Trimmed edge of the cap.
    ctx.strokeStyle = shade(f.trim, dim);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.quadraticCurveTo(-r * 0.9, r * 0.5, 0, r * 0.44);
    ctx.quadraticCurveTo(r * 0.9, r * 0.5, r, 0);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- helmet

/**
 * The Kingsguard helm: an open-faced bascinet with a trimmed brow band, a cheek
 * guard down the side of the face and the set's plume streaming back. The face
 * opening shows the dark padded lining (there is no head inside).
 */
function drawArmorHelmet(ctx: Ctx, fit: ArmorFit, piece: ArmorLookPiece): void {
  const f = finishOf(piece);
  const cx = 0;
  const cy = HEAD_Y;
  const r = fit.head;

  ctx.fillStyle = shade(piece.cloth, -0.55);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Plume: a sweep of the set's cloth from the crest, trailing back (-x).
  const plume = piece.cloth;
  ctx.fillStyle = shade(plume, -0.2);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.1, cy - r - 1.6);
  ctx.quadraticCurveTo(cx - r - 2.4, cy - r - 3.6, cx - r - 4.2, cy - r * 0.2);
  ctx.quadraticCurveTo(cx - r - 2.6, cy - r - 1.2, cx - r * 0.3, cy - r - 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = plume;
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.2, cy - r - 1.9);
  ctx.quadraticCurveTo(cx - r - 1.2, cy - r - 4.4, cx - r - 3.4, cy - r - 1.2);
  ctx.quadraticCurveTo(cx - r - 1, cy - r - 2, cx - r * 0.1, cy - r - 1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(plume, 0.25);
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r - 1.6);
  ctx.quadraticCurveTo(cx - r - 1, cy - r - 3.4, cx - r - 3, cy - r - 1.3);
  ctx.stroke();

  // The dome, open at the face (+x), dropping to a cheek guard.
  const dome = () => {
    ctx.beginPath();
    ctx.moveTo(cx - r - 0.7, cy + r * 0.75);
    ctx.quadraticCurveTo(cx - r - 1.3, cy - r - 1.7, cx + 0.2, cy - r - 1.5);
    ctx.quadraticCurveTo(cx + r + 1.3, cy - r - 1.1, cx + r + 0.7, cy - r * 0.3);
    ctx.lineTo(cx + r * 0.05, cy - r * 0.4);
    ctx.quadraticCurveTo(cx - r * 0.35, cy - r * 0.2, cx - r * 0.25, cy + r * 0.55);
    ctx.lineTo(cx - r * 0.1, cy + r * 1.05);
    ctx.lineTo(cx - r * 0.75, cy + r * 1.1);
    ctx.closePath();
  };
  ctx.fillStyle = f.metal;
  dome();
  ctx.fill();
  ctx.save();
  dome();
  ctx.clip();
  ctx.fillStyle = f.lit;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.3, cy - r - 0.3, r * 0.75, 0.85, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = f.dark;
  ctx.beginPath();
  ctx.ellipse(cx - r - 0.5, cy + r * 0.2, 1.4, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Breaths / rivet line along the cheek guard.
  ctx.fillStyle = f.dark;
  for (const t of [0.25, 0.55, 0.85]) {
    ctx.beginPath();
    ctx.arc(cx - r * 0.55, cy - r * 0.1 + r * 1.05 * t, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Brow band in the trim and a gem at the brow; the face stays open.
  ctx.strokeStyle = f.trim;
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(cx - r - 0.9, cy - r * 0.15);
  ctx.quadraticCurveTo(cx - r * 0.4, cy - r * 0.62, cx + r + 0.7, cy - r * 0.3);
  ctx.stroke();
  ctx.strokeStyle = f.trim;
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.25, cy + r * 0.55);
  ctx.lineTo(cx - r * 0.1, cy + r * 1.05);
  ctx.stroke();
  // Crest ridge over the top.
  ctx.strokeStyle = f.trim;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - r - 0.9, cy - r * 0.2);
  ctx.quadraticCurveTo(cx - r * 0.7, cy - r - 1.8, cx + r * 0.4, cy - r - 1.35);
  ctx.stroke();
  if (f.gem) gem(ctx, cx + r * 0.05, cy - r * 0.55, 0.75, f.gem);
}

// ---------------------------------------------------------------- icons

/** Average-build fit used for the stand-alone icons. */
const ICON_FIT: ArmorFit = { leg: 3.2, head: 3.5, shoulder: 4.8, waist: 3.7, legW: 3.3 };
/** Boots and greaves stand closer together on their own, so they fill the icon. */
const ICON_FIT_FEET: ArmorFit = { ...ICON_FIT, leg: 1.3 };

/** The figure-space box that frames each slot's icon (x, y, w, h). */
export const ARMOR_ICON_BOX: Record<ArmorSlot, { x: number; y: number; w: number; h: number }> = {
  helmet: { x: -8.6, y: -20.4, w: 14.2, h: 13.6 },
  chest: { x: -9, y: -9.6, w: 18.4, h: 19.6 },
  legs: { x: -5.6, y: 0.8, w: 11.6, h: 11 },
  boots: { x: -3.6, y: 7.2, w: 10.6, h: 4.4 },
};

/** Draw one piece on its own, in figure space, framed by `ARMOR_ICON_BOX[slot]`. */
export function drawArmorIcon(ctx: Ctx, slot: ArmorSlot, piece: ArmorLookPiece): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (slot) {
    case 'helmet':
      drawArmorHelmet(ctx, ICON_FIT, piece);
      break;
    case 'chest':
      drawArmorCuirass(ctx, ICON_FIT, piece);
      drawArmorPauldrons(ctx, ICON_FIT, piece);
      break;
    case 'legs':
      drawArmorLegPlates(ctx, ICON_FIT_FEET, piece);
      drawArmorTassets(ctx, ICON_FIT, piece);
      break;
    case 'boots':
      drawArmorBoots(ctx, ICON_FIT_FEET, piece);
      break;
  }
  ctx.restore();
}

/**
 * Procedural unit sprites.
 *
 * Framework-agnostic canvas drawing shared by the in-battle `renderer` and the
 * React card UI (`UnitSprite`), so a champion looks identical on the board and
 * on every menu card. Pure drawing — no game rules, no engine state.
 */

import type { PlayerSpriteConfig } from '../domain/playerSprite';
import type { Proficiency } from '../domain/proficiency';
import { ease, shade, withAlpha } from './palette';
import { GREATER_ORB_APEX, GREATER_ORB_CROUCH, GREATER_ORB_LAND } from './types';
import { arm, belt, forearm, capeSide, legFront, legSide, neck, pauldron, seg, torsoFront, torsoSide, walkLegsFront, walkLegsSide, type ArmLook, type LegLook } from './anatomy';

// `shade` lives in the shared palette now; re-exported for existing callers.
export { shade };

/**
 * A readable face for a head authored facing +x, painted *over* the head and
 * any headgear (so brims never swallow it) — tuned for the 3–4px head radius
 * the figures use: a dark almond eye with a catch-light, a brow, a nose nub on
 * the profile, a hint of mouth and cheek warmth. `eyeY` is the eye's offset
 * below the head centre (push it down under a low brim); `brow: null` omits the
 * brow (hidden under a helm). `twoEyes` adds the far eye for a three-quarter
 * view (the player's avatar). Small enough to vanish gracefully at icon size.
 */
export function drawProfileFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  skin: string,
  o: {
    eyeY?: number;
    brow?: string | null;
    mouth?: boolean;
    twoEyes?: boolean;
    lashes?: boolean;
    eye?: string;
    /** Cheek blush (default on). */
    cheek?: boolean;
  } = {},
): void {
  const ex = cx + r * (o.twoEyes ? 0.38 : 0.46);
  const ey = cy + (o.eyeY ?? r * 0.1);
  ctx.save();
  // Nose nub breaking the profile contour (skipped head-on).
  if (!o.twoEyes) {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(cx + r * 0.93, ey + r * 0.24, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cheek warmth.
  if (o.cheek !== false) {
    ctx.fillStyle = 'rgba(214,104,88,0.32)';
    ctx.beginPath();
    ctx.arc(ex - r * 0.06, ey + r * 0.44, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }
  // Eye(s).
  const eyeCol = o.eye ?? '#24161a';
  ctx.fillStyle = eyeCol;
  ctx.beginPath();
  ctx.ellipse(ex, ey, r * 0.14, r * 0.21, 0, 0, Math.PI * 2);
  if (o.twoEyes) ctx.ellipse(cx - r * 0.18, ey, r * 0.12, r * 0.19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(ex + r * 0.04, ey - r * 0.08, r * 0.06, 0, Math.PI * 2);
  ctx.fill();
  if (o.lashes) {
    ctx.strokeStyle = eyeCol;
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.moveTo(ex + r * 0.1, ey - r * 0.16);
    ctx.lineTo(ex + r * 0.28, ey - r * 0.26);
    ctx.stroke();
  }
  // Brow.
  if (o.brow !== null) {
    ctx.strokeStyle = o.brow ?? shade(skin, -0.55);
    ctx.lineWidth = r * 0.12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - r * 0.2, ey - r * 0.36);
    ctx.lineTo(ex + r * 0.24, ey - r * 0.42);
    if (o.twoEyes) {
      ctx.moveTo(cx - r * 0.34, ey - r * 0.38);
      ctx.lineTo(cx - r * 0.02, ey - r * 0.4);
    }
    ctx.stroke();
  }
  // Mouth.
  if (o.mouth !== false) {
    ctx.strokeStyle = shade(skin, -0.4);
    ctx.lineWidth = r * 0.09;
    ctx.beginPath();
    const mx = o.twoEyes ? cx + r * 0.12 : cx + r * 0.62;
    ctx.moveTo(mx - r * 0.12, ey + r * 0.62);
    ctx.lineTo(mx + r * 0.14, ey + r * 0.58);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Procedural Archer silhouette — a hooded ranger drawing a longbow — painted in
 * the caller's local space (origin at the figure's centre; feet near y=+11, head
 * near y=-16, bow reaching to about x=+18). The figure is authored facing +x and
 * flipped horizontally when `faceLeft`. `release` (0..1) snaps the bowstring
 * forward and empties the nock just after a shot, easing back to a ready draw at
 * rest. Replaces the emoji token for `shape: 'archer'` units.
 */
export function drawArcher(
  ctx: CanvasRenderingContext2D,
  color: string,
  faceLeft: boolean,
  release: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (faceLeft) ctx.scale(-1, 1);

  const cloakLit = shade(color, 0.18);
  const cloakDark = shade(color, -0.26);
  const sleeve = shade(color, -0.14);
  const leather = '#5a4330';
  const skin = '#e8c39c';

  // A lean ranger: long legs, a split-skirted jerkin, a cloak trailing off the
  // shoulders and a quiver across the back — light, quick, built to move.
  capeSide(ctx, -1.6, -7.6, 16.8, 5.4, cloakDark, 0.35);

  // Quiver slung across the back, fletchings over the rear shoulder.
  ctx.save();
  ctx.translate(-4.4, -3.4);
  ctx.rotate(-0.42);
  ctx.fillStyle = leather;
  ctx.fillRect(-1.7, -6, 3.4, 10.5);
  ctx.fillStyle = shade(leather, 0.2);
  ctx.fillRect(-1.7, -6, 3.4, 1.3);
  ctx.fillStyle = '#ece4cf';
  for (const fx of [-1, 0.2, 1.3]) {
    ctx.beginPath();
    ctx.moveTo(fx - 0.8, -6);
    ctx.lineTo(fx, -9.4);
    ctx.lineTo(fx + 0.8, -6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const legs: LegLook = { cloth: '#4d4034', boot: '#3a2a1c', w: 3.1, bootUp: 0.66 };
  legSide(ctx, -0.8, 3, -3.6, 11, { ...legs, cloth: shade(legs.cloth, -0.16), boot: shade(legs.boot, -0.12) }, 0.5);
  legSide(ctx, 1.2, 3, 3.8, 11, legs, 1.2);

  torsoSide(ctx, {
    color, lit: cloakLit, dark: cloakDark,
    top: -8.6, waistY: 0, hemY: 5.8, chest: 4.4, back: 4, waist: 3.1, hemF: 4.8, hemB: 5.2,
  });
  // Quiver strap across the chest, then the belt.
  ctx.strokeStyle = leather;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-2.6, -8);
  ctx.lineTo(3.8, -0.6);
  ctx.stroke();
  belt(ctx, -3.3, 3.5, 0.7, leather, '#c8a24a', 0.8, 1.5, 2.6);

  // Dagged hood mantle over the shoulders.
  ctx.fillStyle = shade(color, 0.06);
  ctx.beginPath();
  ctx.moveTo(-4.6, -7.6);
  ctx.quadraticCurveTo(0, -10.2, 4.6, -7.4);
  ctx.quadraticCurveTo(4.8, -4.6, 3, -3.4);
  ctx.lineTo(1.6, -4.8);
  ctx.lineTo(0, -3.2);
  ctx.lineTo(-1.6, -4.6);
  ctx.lineTo(-3.4, -3.4);
  ctx.quadraticCurveTo(-5.4, -5.4, -4.6, -7.6);
  ctx.closePath();
  ctx.fill();

  // Head + hood.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(1.6, -11.4, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color; // hood over the crown & back of the head
  ctx.beginPath();
  ctx.moveTo(-3.6, -7.8);
  ctx.quadraticCurveTo(-4.8, -16.2, 2, -16.2);
  ctx.quadraticCurveTo(5.8, -15.2, 4.8, -10.6);
  ctx.quadraticCurveTo(2.2, -13, -0.4, -12.6);
  ctx.quadraticCurveTo(-3, -12, -3.6, -7.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = cloakDark; // hood tip drooping behind
  ctx.beginPath();
  ctx.moveTo(-2.4, -15.4);
  ctx.quadraticCurveTo(-6.4, -15.4, -7, -12);
  ctx.quadraticCurveTo(-4.6, -13.4, -3.4, -12.6);
  ctx.closePath();
  ctx.fill();
  drawProfileFace(ctx, 1.6, -11.4, 3.5, skin, { eyeY: 0.5 });

  // --- Bow & arms ---
  // The string hand pulls back at full draw (release -> 0) and snaps to the bow
  // as the shot looses (release -> 1).
  const gripX = 9.5; // bow hand, out front
  const gripY = -4.5;
  const bowCx = gripX - 1;
  const bowCy = gripY + 2.5;
  const bowR = 8.5;
  const drawBack = 5 * (1 - release);
  const stringX = gripX - 7 - drawBack;
  const stringY = gripY + 3;

  // Bow limb (brown arc), belly facing forward, with lighter tips.
  ctx.strokeStyle = '#6e4a26';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(bowCx, bowCy, bowR, -1.15, 1.15);
  ctx.stroke();
  ctx.strokeStyle = '#a07040';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(bowCx, bowCy, bowR + 0.5, -0.8, 0.8);
  ctx.stroke();

  // Bowstring from top limb to the draw hand to the bottom limb.
  const topX = bowCx + Math.cos(-1.15) * bowR;
  const topY = bowCy + Math.sin(-1.15) * bowR;
  const botX = bowCx + Math.cos(1.15) * bowR;
  const botY = bowCy + Math.sin(1.15) * bowR;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(topX, topY);
  ctx.lineTo(stringX, stringY);
  ctx.lineTo(botX, botY);
  ctx.stroke();

  // Nocked arrow (only while still drawn).
  if (release < 0.5) {
    ctx.strokeStyle = '#d8d2c0';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(stringX, stringY);
    ctx.lineTo(gripX + 3, gripY + 1);
    ctx.stroke();
  }

  // Arms: the draw arm cocked back with its elbow high, the bow arm straight out.
  arm(ctx, 0.2, -6, stringX, stringY, { sleeve: shade(sleeve, -0.1), hand: skin, w: 2.6, cuff: leather }, 1.4);
  arm(ctx, 1.4, -6.3, gripX, gripY, { sleeve, hand: skin, w: 2.6, cuff: leather }, 0.3);

  ctx.restore();
}

/**
 * Procedural Elf silhouette — a slender female woodland archer drawing a glowing
 * enchanted longbow — painted in the caller's local space (origin at the figure's
 * centre; feet near y=+11, head near y=-16, bow reaching to about x=+18). The
 * figure is authored facing +x and flipped horizontally when `faceLeft`.
 * `release` (0..1) snaps the bowstring forward and empties the nock just after a
 * shot, easing back to a ready draw at rest. Distinguished from the Archer by a
 * long golden ponytail, a pointed ear and a slim circlet, and by the arcane glow
 * on her bow and nocked shaft. Replaces the emoji token for `shape: 'elf'` units.
 */
export function drawElf(
  ctx: CanvasRenderingContext2D,
  color: string,
  faceLeft: boolean,
  release: number,
  empowered = false,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (faceLeft) ctx.scale(-1, 1);

  const tunicLit = shade(color, 0.2);
  const tunicDark = shade(color, -0.24);
  const sleeve = shade(color, -0.2);
  const glow = shade(color, 0.4);
  const hair = '#e6c25a';
  const hairDark = shade(hair, -0.28);
  const skin = '#f0d0ad';
  const leaf = '#4a6a3a';

  // Slender and long-limbed: the narrowest waist on the roster, a high-slit
  // tunic and a leaf-green sash ribbon streaming behind. Taller in the leg than
  // the human archer, so even at a glance the two never read as the same figure.

  // Long ponytail flowing back behind the torso (drawn first so it sits behind).
  ctx.fillStyle = hairDark;
  ctx.beginPath();
  ctx.moveTo(-2.5, -12.4);
  ctx.quadraticCurveTo(-10, -8, -8.2, 4);
  ctx.quadraticCurveTo(-6.4, -0.6, -4.2, -5);
  ctx.quadraticCurveTo(-3, -9, -2.5, -12.4);
  ctx.closePath();
  ctx.fill();

  // Sash ribbon trailing off the waist.
  ctx.fillStyle = leaf;
  ctx.beginPath();
  ctx.moveTo(-2.4, 0);
  ctx.quadraticCurveTo(-7, 2, -9.4, 6.4);
  ctx.lineTo(-7.6, 6.8);
  ctx.quadraticCurveTo(-5.6, 3.4, -2, 1.6);
  ctx.closePath();
  ctx.fill();

  const legs: LegLook = { cloth: '#4a5a3a', boot: '#6a5034', w: 2.6, bootUp: 0.86, toe: 2.6 };
  legSide(ctx, -0.6, 2.2, -3.2, 11, { ...legs, cloth: shade(legs.cloth, -0.16), boot: shade(legs.boot, -0.14) }, 0.5);
  legSide(ctx, 1, 2.2, 3.6, 11, legs, 1.2);

  torsoSide(ctx, {
    color, lit: tunicLit, dark: tunicDark,
    top: -8.6, waistY: -0.6, hemY: 4.6, chest: 3.8, back: 3.4, waist: 2.5, hemF: 4.6, hemB: 4.8,
  });
  // Leaf-green sash at the waist + a fine gold clasp.
  belt(ctx, -2.8, 3, -0.2, leaf, '#e8d27a', 0.6, 1.4, 2.2);
  // Leaf-shaped shoulder guard.
  ctx.fillStyle = leaf;
  ctx.beginPath();
  ctx.moveTo(-1.6, -8.2);
  ctx.quadraticCurveTo(3, -9.2, 4, -5.6);
  ctx.quadraticCurveTo(1, -6.2, -1.6, -8.2);
  ctx.closePath();
  ctx.fill();

  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(1.6, -11.6, 3.2, 0, Math.PI * 2);
  ctx.fill();
  // Pointed ear swept back.
  ctx.beginPath();
  ctx.moveTo(-0.8, -11.8);
  ctx.lineTo(-3.8, -13.8);
  ctx.lineTo(-1.2, -10.2);
  ctx.closePath();
  ctx.fill();
  // Hair crown / fringe over the head.
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.moveTo(-2.2, -10.8);
  ctx.quadraticCurveTo(-3, -16.2, 2, -16.2);
  ctx.quadraticCurveTo(5.4, -15.6, 4.8, -11.2);
  ctx.quadraticCurveTo(2.6, -14.2, 0, -13.8);
  ctx.quadraticCurveTo(-1.8, -13.6, -2.2, -10.8);
  ctx.closePath();
  ctx.fill();
  // Slim circlet band across the brow.
  ctx.strokeStyle = glow;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-1.4, -12.8);
  ctx.quadraticCurveTo(1.8, -14.6, 4.4, -12.4);
  ctx.stroke();
  drawProfileFace(ctx, 1.6, -11.6, 3.2, skin, { eyeY: 0.45, lashes: true, eye: '#3a2a5a', brow: '#b8913a' });

  // --- Enchanted bow & arms ---
  // The string hand pulls back at full draw (release -> 0) and snaps to the bow
  // as the shot looses (release -> 1). Mirrors the Archer's bow geometry.
  const gripX = 9.5;
  const gripY = -4.5;
  const bowCx = gripX - 1;
  const bowCy = gripY + 2.5;
  const bowR = 8.5;
  const drawBack = 5 * (1 - release);
  const stringX = gripX - 7 - drawBack;
  const stringY = gripY + 3;

  // Bow limb — a glowing arcane arc rather than plain wood.
  ctx.strokeStyle = withAlpha(color, 0.28);
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.arc(bowCx, bowCy, bowR, -1.15, 1.15);
  ctx.stroke();
  ctx.strokeStyle = glow;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(bowCx, bowCy, bowR, -1.15, 1.15);
  ctx.stroke();

  // Bowstring from top limb to the draw hand to the bottom limb.
  const topX = bowCx + Math.cos(-1.15) * bowR;
  const topY = bowCy + Math.sin(-1.15) * bowR;
  const botX = bowCx + Math.cos(1.15) * bowR;
  const botY = bowCy + Math.sin(1.15) * bowR;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(topX, topY);
  ctx.lineTo(stringX, stringY);
  ctx.lineTo(botX, botY);
  ctx.stroke();

  // Nocked magic arrow (only while still drawn) — a glowing shaft with a bright tip.
  if (release < 0.5) {
    ctx.strokeStyle = glow;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(stringX, stringY);
    ctx.lineTo(gripX + 4, gripY + 1);
    ctx.stroke();
    ctx.fillStyle = '#f4eeff';
    ctx.beginPath();
    ctx.arc(gripX + 4, gripY + 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Slim arms with leather bracers: draw arm elbow-high, bow arm straight.
  arm(ctx, 0.2, -6.2, stringX, stringY, { sleeve: shade(sleeve, -0.1), hand: skin, w: 2.2, cuff: '#6a5034' }, 1.4);
  arm(ctx, 1.2, -6.4, gripX, gripY, { sleeve, hand: skin, w: 2.2, cuff: '#6a5034' }, 0.3);

  // Enchanted sparkles spilling off the whole bow limb once Chain Enchantment is
  // bought (the limb is the arc centred at (bowCx, bowCy), radius bowR).
  if (empowered) drawBowSparkles(ctx, color, bowCx, bowCy, bowR);

  ctx.restore();
}

/**
 * Small arcane sparkles spilling off the Elf's whole bow limb — the ambient tell
 * that her Chain Enchantment upgrade is bought. The limb is the arc centred at
 * `(cx, cy)` with radius `r` (drawn in the figure's local space). Each mote is
 * born at a point spread along that arc, then drifts outward (away from the bow's
 * centre) and fades over its own looped life off the shared clock, so motes rise
 * from the top, middle and bottom of the bow alike. A soft coloured glow with a
 * bright core, tinted the champion's arcane colour.
 */
function drawBowSparkles(
  ctx: CanvasRenderingContext2D,
  color: string,
  cx: number,
  cy: number,
  r: number,
): void {
  const t = nowMs() / 1000;
  const a0 = -1.15; // top limb tip (matches the bow arc drawn above)
  const a1 = 1.15; // bottom limb tip
  ctx.save();
  const N = 8;
  for (let i = 0; i < N; i++) {
    const seed = i * 1.7;
    const life = (t * 0.85 + i / N) % 1; // 0→1 loop, staggered per mote
    // Birth point spread along the limb, drifting slowly so motes keep appearing
    // at fresh spots up and down the bow rather than fixed stations.
    const frac = ((i / N) + t * 0.11 + 0.5 * Math.sin(seed)) % 1;
    const ang = a0 + (a1 - a0) * ((frac + 1) % 1);
    const nx = Math.cos(ang);
    const ny = Math.sin(ang);
    // Drift outward along the limb's normal, plus a small sideways wobble.
    const out = life * 3.5;
    const x = cx + nx * (r + out) + Math.sin(t * 3 + seed) * 0.7;
    const y = cy + ny * (r + out) - life * 1.5;
    // Fade in then out over the life, with a small twinkle.
    const alpha = Math.sin(life * Math.PI) * (0.55 + 0.2 * Math.sin(t * 5 + seed));
    const size = 1.1 * (1 - life * 0.4);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = withAlpha(color, 0.6);
    ctx.beginPath();
    ctx.arc(x, y, size + 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4eeff';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Procedural Swordsman silhouette — a sturdy front-line soldier with a round
 * shield and a raised blade — painted in the caller's local space (origin at the
 * figure's centre; feet near y=+11, head near y=-17). Authored facing +x and
 * flipped horizontally when `faceLeft`. `swing` (0..1) drives the sword's chop:
 * 0 is the cocked-back ready pose, 1 is just after a strike (blade swung down and
 * forward). Replaces the emoji token for `shape: 'sword'` units.
 */
export function drawSwordsman(
  ctx: CanvasRenderingContext2D,
  color: string,
  faceLeft: boolean,
  swing: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (faceLeft) ctx.scale(-1, 1);

  const bodyLit = shade(color, 0.18);
  const bodyDark = shade(color, -0.24);
  const steel = '#c9d2dc';
  const steelDark = '#8b95a3';
  const gauntlet = '#a4aeba';

  // The front-liner: the broadest shoulders on the roster, a plate pauldron and
  // greaves, a mail skirt under the tabard and a big round shield — a block of a
  // man planted in a wide stance.

  // Round shield on the rear arm, tucked behind the torso.
  ctx.save();
  ctx.translate(-7, -0.6);
  ctx.fillStyle = bodyDark;
  ctx.beginPath();
  ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(color, -0.1); // lit upper half of the face
  ctx.beginPath();
  ctx.arc(0, 0, 6.2, Math.PI * 1.05, Math.PI * 1.95);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = steelDark;
  ctx.beginPath();
  ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = steel; // central boss + rim rivets
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 5.6, Math.sin(a) * 5.6, 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const legs: LegLook = { cloth: '#4a4038', boot: '#6a7380', w: 4, bootUp: 0.78, knee: steel, toe: 3.2 };
  legSide(ctx, -1.6, 3.8, -5.4, 11, { ...legs, cloth: shade(legs.cloth, -0.16), boot: shade(legs.boot, -0.14), knee: steelDark }, 0.3);
  legSide(ctx, 2, 3.8, 5.6, 11, legs, 1);

  // Mail skirt peeking under the tabard.
  ctx.fillStyle = steelDark;
  ctx.beginPath();
  ctx.ellipse(0.2, 6.4, 6.6, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  torsoSide(ctx, {
    color, lit: bodyLit, dark: bodyDark,
    top: -9, waistY: 0.6, hemY: 6, chest: 6.2, back: 5.6, waist: 4.8, hemF: 6.4, hemB: 6.6,
  });
  // Tabard chevron + sword belt.
  ctx.fillStyle = shade(color, 0.38);
  ctx.beginPath();
  ctx.moveTo(1.4, -5.4);
  ctx.lineTo(3.4, -2.8);
  ctx.lineTo(5.4, -5.4);
  ctx.lineTo(5.4, -4);
  ctx.lineTo(3.4, -1.4);
  ctx.lineTo(1.4, -4);
  ctx.closePath();
  ctx.fill();
  belt(ctx, -5.2, 5.6, 0.9, '#5a3d28', '#e7c25a', 1, 1.8, 3.6);
  // Gorget at the throat.
  ctx.fillStyle = steelDark;
  ctx.beginPath();
  ctx.ellipse(0.8, -8.6, 3.8, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head + steel helmet with a short crest.
  ctx.fillStyle = '#e8c39c'; // face
  ctx.beginPath();
  ctx.arc(1.4, -11.2, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = steel; // helmet dome with cheek guard
  ctx.beginPath();
  ctx.moveTo(-3.4, -10.2);
  ctx.quadraticCurveTo(-3.6, -17.2, 1.2, -17.2);
  ctx.quadraticCurveTo(5.8, -17.2, 5.8, -11.5);
  ctx.quadraticCurveTo(1.2, -13.6, -0.6, -11.6);
  ctx.lineTo(-0.6, -9.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = steelDark; // brow ridge
  ctx.fillRect(-0.6, -12.6, 6.4, 1);
  ctx.strokeStyle = color; // crest / plume flicking back
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(1.4, -17.2);
  ctx.quadraticCurveTo(0, -20.6, -2.6, -19.6);
  ctx.stroke();
  drawProfileFace(ctx, 1.4, -11.2, 3.6, '#e8c39c', { eyeY: 0.75, brow: null });

  // Great pauldron capping the sword shoulder.
  pauldron(ctx, 1.2, -7, 4, steel, -0.18);

  // --- Sword arm & blade ---
  // The blade pivots about the sword hand: cocked back over the shoulder at rest
  // (swing -> 0), chopping down and forward on a strike (swing -> 1).
  const handX = 6;
  const handY = -6;
  arm(ctx, 2.4, -5.4, handX, handY, { sleeve: bodyDark, hand: gauntlet, w: 3.2, cuff: steel }, 1);

  const aReady = (-162 * Math.PI) / 180; // carried back over the shoulder, clear of the face
  const aStrike = (40 * Math.PI) / 180;
  const ang = aReady + (aStrike - aReady) * swing;
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(ang);
  // Grip + pommel.
  ctx.strokeStyle = '#4a3a2a';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-3, 0);
  ctx.lineTo(0, 0);
  ctx.stroke();
  ctx.fillStyle = steelDark;
  ctx.beginPath();
  ctx.arc(-3.4, 0, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Crossguard.
  ctx.strokeStyle = steelDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -2.8);
  ctx.lineTo(0, 2.8);
  ctx.stroke();
  // Broad tapered blade with a fuller + a bright edge highlight.
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.moveTo(0.5, -1.9);
  ctx.lineTo(13.4, -0.8);
  ctx.lineTo(15.2, 0);
  ctx.lineTo(13.4, 0.8);
  ctx.lineTo(0.5, 1.9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = steelDark;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(1.2, 0.3);
  ctx.lineTo(10, 0.2);
  ctx.stroke();
  ctx.strokeStyle = '#eef3f8';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(1, -0.8);
  ctx.lineTo(13, -0.4);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/**
 * Procedural Spearman silhouette — a soldier in a forward lunge driving a long
 * two-handed spear — painted in the caller's local space (origin at the figure's
 * centre; feet near y=+11, head near y=-16, spear reaching forward past x=+18).
 * Authored facing +x and flipped horizontally when `faceLeft`. `thrust` (0..1)
 * jabs the spear forward: 0 is the drawn-back ready pose, 1 is a fully-extended
 * strike. When `throwing` is set (the Javelin Toss), that same `thrust` value
 * instead drives a release: the spear leaves the front hand and flies forward,
 * fading as it goes, with an empty follow-through arm. Replaces the emoji token
 * for `shape: 'spear'` units.
 */
export function drawSpearman(
  ctx: CanvasRenderingContext2D,
  color: string,
  faceLeft: boolean,
  thrust: number,
  throwing = false,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (faceLeft) ctx.scale(-1, 1);

  const bodyLit = shade(color, 0.18);
  const bodyDark = shade(color, -0.26);
  const steel = '#c9d2dc';
  const steelDark = '#8b95a3';
  const wood = '#6e4a26';
  const glove = '#4a3a2a';

  // A drilled pikeman in a quilted gambeson, caught mid-lunge: rear leg driven
  // straight back, front knee bent deep, the whole body leaning into the reach.
  const legs: LegLook = { cloth: '#4a3d32', boot: '#3a2f26', w: 3.6, bootUp: 0.58 };
  legSide(ctx, -1.6, 4, -6.6, 11, { ...legs, cloth: shade(legs.cloth, -0.16), boot: shade(legs.boot, -0.12) }, 0.1);
  legSide(ctx, 2.4, 4, 7.4, 11, legs, 2.2);

  torsoSide(ctx, {
    color, lit: bodyLit, dark: bodyDark,
    top: -9, waistY: 0.6, hemY: 6, chest: 5.2, back: 4.8, waist: 3.9, hemF: 6, hemB: 5.6, lean: 1.4,
  });
  // Quilting stitched across the gambeson.
  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (const y of [-5.6, -3, -0.6]) {
    ctx.moveTo(-3.6 + (0 - y) * 0.06, y);
    ctx.lineTo(4.6 + (0 - y) * 0.12, y + 0.3);
  }
  ctx.moveTo(1.6, -7.6);
  ctx.lineTo(2.4, 5.6);
  ctx.stroke();
  belt(ctx, -4, 5, 1.4, '#5a3d28', '#c9d2dc', 1, 1.6, 3.4);
  // Leather spaulder on the lead shoulder.
  pauldron(ctx, 1.6, -6.9, 3, '#7a5a3a', -0.2);

  // Head + wide-brim kettle helm (brim first, a touch darker; dome on top).
  ctx.fillStyle = '#e8c39c'; // face
  ctx.beginPath();
  ctx.arc(2.2, -11, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = steelDark; // brim
  ctx.beginPath();
  ctx.ellipse(2, -11.8, 6.6, 1.6, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = steel; // dome
  ctx.beginPath();
  ctx.moveTo(-2, -12);
  ctx.quadraticCurveTo(-2.2, -16.6, 2.2, -16.6);
  ctx.quadraticCurveTo(5.8, -16.6, 5.6, -12);
  ctx.quadraticCurveTo(2.2, -13.4, -2, -12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = steelDark; // dome ridge
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(1.6, -16.5);
  ctx.quadraticCurveTo(2.2, -14.4, 1.8, -12.6);
  ctx.stroke();
  drawProfileFace(ctx, 2.2, -11, 3.5, '#e8c39c', { eyeY: 1.3, brow: null });

  const shaftY = -3;
  if (throwing && thrust > 0) {
    // --- Javelin Toss follow-through ---
    // The spear itself is drawn separately in world space (see the renderer) so
    // it flies along the exact attack direction; here the figure just holds the
    // empty release pose: throwing arm flung forward, rear arm back.
    arm(ctx, -1.2, -5.4, -6, -1, { sleeve: shade(bodyDark, -0.1), hand: glove, w: 2.8 }, -1);
    arm(ctx, 1.6, -6, 10.4, -8.4, { sleeve: bodyDark, hand: glove, w: 2.8 }, -0.6);
    ctx.restore();
    return;
  }

  // --- Spear (two-handed, level, thrusting forward) ---
  const dx = 5 * thrust;
  const backX = -8 + dx;
  const tipBase = 14 + dx; // where the shaft ends and the head begins
  // Rear arm first (behind the shaft), then the shaft, then the lead arm.
  const frontHandX = tipBase - 5;
  const backHandX = backX + 6;
  arm(ctx, -1.2, -5.4, backHandX, shaftY, { sleeve: shade(bodyDark, -0.1), hand: glove, w: 2.8 }, 1.6);
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(backX, shaftY);
  ctx.lineTo(tipBase, shaftY);
  ctx.stroke();
  ctx.fillStyle = steelDark; // butt cap
  ctx.beginPath();
  ctx.arc(backX, shaftY, 1.4, 0, Math.PI * 2);
  ctx.fill();
  // Leaf spearhead with a small central ridge.
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.moveTo(tipBase, -1.7);
  ctx.lineTo(tipBase + 6, shaftY);
  ctx.lineTo(tipBase, shaftY + 1.7);
  ctx.quadraticCurveTo(tipBase - 1.4, shaftY, tipBase, -1.7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#eef3f8';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(tipBase, shaftY);
  ctx.lineTo(tipBase + 5, shaftY);
  ctx.stroke();
  // A red pennon tied below the head.
  ctx.fillStyle = '#b23a3a';
  ctx.beginPath();
  ctx.moveTo(tipBase - 1, shaftY);
  ctx.lineTo(tipBase - 5.4, shaftY + 3.2);
  ctx.lineTo(tipBase - 3.4, shaftY + 0.4);
  ctx.closePath();
  ctx.fill();
  arm(ctx, 1.6, -6, frontHandX, shaftY, { sleeve: bodyDark, hand: glove, w: 2.8 }, 1.2);

  ctx.restore();
}

/**
 * Procedural Crossbow silhouette — a braced marksman sighting down a horizontal
 * crossbow — painted in the caller's local space (origin at the figure's centre;
 * feet near y=+11, head near y=-16, weapon reaching forward past x=+16). Authored
 * facing +x and flipped horizontally when `faceLeft`. `fire` (0..1) kicks the
 * weapon back on the shot and empties the nock: at rest (0) a bolt is loaded and
 * the string drawn; just after firing (1) both are gone and the weapon recoils.
 * Replaces the emoji token for `shape: 'crossbow'` units.
 */
export function drawCrossbowman(
  ctx: CanvasRenderingContext2D,
  color: string,
  faceLeft: boolean,
  fire: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (faceLeft) ctx.scale(-1, 1);

  const bodyLit = shade(color, 0.18);
  const bodyDark = shade(color, -0.24);
  const steel = '#c9d2dc';
  const steelDark = '#8b95a3';
  const wood = '#5a4634';
  const glove = '#4a3a2a';

  // A stocky arbalester: thick through the middle in a studded brigandine, short
  // sturdy legs braced wide, a bolt case on the hip — solid, not nimble.

  // Bolt case hanging at the rear hip, bolt tails poking out.
  ctx.save();
  ctx.translate(-5.6, 2.4);
  ctx.rotate(0.3);
  ctx.fillStyle = '#5a3d28';
  ctx.fillRect(-1.6, -3.4, 3.2, 7);
  ctx.fillStyle = '#d8d2c0';
  ctx.fillRect(-1.2, -5, 0.8, 1.8);
  ctx.fillRect(0.4, -5.4, 0.8, 2.2);
  ctx.restore();

  const legs: LegLook = { cloth: '#4a4036', boot: '#3a2f26', w: 3.9, bootUp: 0.56 };
  legSide(ctx, -1.6, 4, -4.8, 11, { ...legs, cloth: shade(legs.cloth, -0.16), boot: shade(legs.boot, -0.12) }, 0.4);
  legSide(ctx, 1.8, 4, 5, 11, legs, 1.3);

  torsoSide(ctx, {
    color, lit: bodyLit, dark: bodyDark,
    top: -8.8, waistY: 0.8, hemY: 6.2, chest: 5.6, back: 5.4, waist: 5.1, hemF: 6, hemB: 6.2,
  });
  // Brigandine rivets studding the coat.
  ctx.fillStyle = steelDark;
  for (const [sx, sy] of [[0.4, -5.6], [2.6, -5.4], [4.4, -4.6], [1.4, -3], [3.6, -2.4], [0.4, -0.6], [2.6, 0]]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  belt(ctx, -5, 5.6, 1.4, '#5a3d28', steel, 1.1, 1.9, 3.6);
  // Padded collar.
  ctx.fillStyle = bodyDark;
  ctx.beginPath();
  ctx.ellipse(0.4, -8.4, 4, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head + peaked cap.
  ctx.fillStyle = '#e8c39c'; // face
  ctx.beginPath();
  ctx.arc(0.8, -11.6, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color; // cap crown
  ctx.beginPath();
  ctx.moveTo(-3, -12.1);
  ctx.quadraticCurveTo(-3.4, -16.4, 1, -16.4);
  ctx.quadraticCurveTo(4.6, -16.4, 4.4, -12.3);
  ctx.quadraticCurveTo(1, -13.7, -3, -12.1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = bodyDark; // short peak toward the front
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(3.6, -12.8);
  ctx.lineTo(7, -13.2);
  ctx.stroke();
  drawProfileFace(ctx, 0.8, -11.6, 3.5, '#e8c39c', { eyeY: 0.6 });

  // --- Crossbow (held level, aimed forward) ---
  const dx = -3 * fire; // recoil kick on the shot
  const y = -5;
  const backX = 1 + dx;
  const frontX = 16 + dx;
  const prodX = 13 + dx;
  const loaded = fire < 0.5;
  const frontHandX = prodX - 3;
  const backHandX = backX + 4;
  // Rear (trigger) arm sits behind the stock.
  arm(ctx, -0.8, -5.8, backHandX, y, { sleeve: shade(bodyDark, -0.1), hand: glove, w: 3 }, 1.4);
  // Stock / tiller.
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(backX, y);
  ctx.lineTo(frontX, y);
  ctx.stroke();
  // Prod (bow limbs) — a vertical arc bulging forward, mounted near the front.
  ctx.strokeStyle = steelDark;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(prodX - 5, y, 6.5, -1.0, 1.0);
  ctx.stroke();
  const topTipX = prodX - 5 + Math.cos(-1.0) * 6.5;
  const topTipY = y + Math.sin(-1.0) * 6.5;
  const botTipX = prodX - 5 + Math.cos(1.0) * 6.5;
  const botTipY = y + Math.sin(1.0) * 6.5;
  // Bowstring — drawn back to the lock while loaded, snapped forward once fired.
  const lockX = backX + 5;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(topTipX, topTipY);
  ctx.lineTo(loaded ? lockX : prodX - 3.5, y);
  ctx.lineTo(botTipX, botTipY);
  ctx.stroke();
  // Loaded bolt along the stock, tip past the prod.
  if (loaded) {
    ctx.strokeStyle = '#d8d2c0';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(lockX, y);
    ctx.lineTo(frontX + 2, y);
    ctx.stroke();
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.moveTo(frontX + 2, y - 1.4);
    ctx.lineTo(frontX + 4.5, y);
    ctx.lineTo(frontX + 2, y + 1.4);
    ctx.closePath();
    ctx.fill();
  }
  // Lead arm cradling the prod.
  arm(ctx, 1.6, -6.2, frontHandX, y + 0.5, { sleeve: bodyDark, hand: glove, w: 3 }, 1.2);

  ctx.restore();
}

/**
 * Procedural Farmer silhouette — a peaceful field hand in a wide-brim straw hat,
 * leaning on a hoe with a bundle of wheat in the off hand — painted in the
 * caller's local space (origin at the figure's centre; feet near y=+11, hat near
 * y=-17). Authored facing +x and flipped horizontally when `faceLeft`. Being an
 * economy unit it has no attack, so it ignores the shared `anim` value and holds
 * a static idle pose. Replaces the emoji token for `shape: 'farmer'` units.
 */
export function drawFarmer(
  ctx: CanvasRenderingContext2D,
  color: string,
  faceLeft: boolean,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (faceLeft) ctx.scale(-1, 1);

  const bodyLit = shade(color, 0.18);
  const bodyDark = shade(color, -0.26);
  const straw = '#e3c66a';
  const strawDark = shade(straw, -0.28);
  const wood = '#6e4a26';
  const grain = '#d9a63a';
  const skin = '#e8c39c';
  const apron = '#8a7650';

  // A round, comfortable field hand: a belly wider than his shoulders, rolled
  // sleeves over bare forearms, a work apron and rolled trousers over clogs.

  const legs: LegLook = { cloth: '#6a5a3e', boot: '#4a3626', w: 3.5, bootUp: 0.42, toe: 2.8 };
  legSide(ctx, -1.2, 3.6, -3.4, 11, { ...legs, cloth: shade(legs.cloth, -0.16), boot: shade(legs.boot, -0.12) }, 0.5);
  legSide(ctx, 1.6, 3.6, 3.6, 11, legs, 0.9);

  // Wheat bundle in the rear (off) hand — stalks with grain heads, behind the
  // body so it reads as tucked under the arm.
  const whX = -6.5;
  const whY = -1;
  ctx.strokeStyle = grain;
  ctx.lineWidth = 1;
  for (const a of [-0.5, -0.2, 0.12]) {
    const tx = whX + Math.sin(a) * 8;
    const ty = whY - 8;
    ctx.beginPath();
    ctx.moveTo(whX, whY);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.fillStyle = grain;
    ctx.beginPath();
    ctx.ellipse(tx, ty, 1, 2, a, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rear arm to the wheat, behind the body.
  arm(ctx, -1.6, -5.2, whX, whY, { sleeve: skin, hand: skin, w: 2.6 }, -0.6);
  seg(ctx, -1.6, -5.2, -3.2, -3.2, 1.5, 1.4, shade(bodyDark, -0.1));

  torsoSide(ctx, {
    color, lit: bodyLit, dark: bodyDark,
    top: -8, waistY: 1, hemY: 5.8, chest: 4.6, back: 4.2, waist: 5.6, hemF: 5.6, hemB: 5,
  });
  // Work apron over the belly, tied with a rope belt.
  ctx.fillStyle = apron;
  ctx.beginPath();
  ctx.moveTo(0.8, -5.2);
  ctx.lineTo(4.4, -5);
  ctx.quadraticCurveTo(6.4, 0.6, 5.8, 6.4);
  ctx.lineTo(1.6, 6.6);
  ctx.quadraticCurveTo(1.6, 0.6, 0.8, -5.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(apron, -0.3);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0.9, -5.2);
  ctx.lineTo(-1.4, -8);
  ctx.stroke();
  belt(ctx, -4.6, 5.6, 1.2, '#b8a070', undefined, 1, 1.2);

  // Head + wide-brim straw hat (brim, then crown on top).
  ctx.fillStyle = skin; // face
  ctx.beginPath();
  ctx.arc(1, -10.2, 3.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = straw; // brim
  ctx.beginPath();
  ctx.ellipse(1, -13, 7.4, 1.9, -0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = strawDark;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = straw; // crown
  ctx.beginPath();
  ctx.moveTo(-2.2, -13.2);
  ctx.quadraticCurveTo(1, -18, 4.2, -13.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a0503a'; // hat band
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-2, -13.6);
  ctx.quadraticCurveTo(1, -14.6, 4, -13.6);
  ctx.stroke();
  drawProfileFace(ctx, 1, -10.2, 3.3, skin, { eyeY: 0.55, brow: null });

  // Hoe — shaft from the front hand down to the ground, with a small blade.
  const handX = 5.4;
  const handY = -3.6;
  const footX = 11;
  const footY = 11;
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(handX - 0.4, handY - 1);
  ctx.lineTo(footX, footY);
  ctx.stroke();
  ctx.strokeStyle = '#7f8895'; // metal head
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(footX, footY);
  ctx.lineTo(footX + 3.5, footY - 1);
  ctx.stroke();

  // Front arm: rolled sleeve over a bare forearm, hand on the hoe.
  arm(ctx, 1.4, -5.4, handX, handY, { sleeve: skin, hand: skin, w: 2.6 }, 1);
  seg(ctx, 1.4, -5.4, 2.6, -3.2, 1.6, 1.5, bodyDark);

  ctx.restore();
}

/**
 * Procedural Bard silhouette — a wandering minstrel in a feathered cap and short
 * tunic, cradling a round-bellied lute he strums. Painted in the caller's local
 * space (origin at the figure's centre; feet near y=+11, cap feather near
 * y=-19). Authored facing +x and flipped when `faceLeft`. `strum` (0..1) drives
 * the picking hand across the strings during a performance (1 just after a tune
 * strikes up, easing to 0 at rest). Replaces the emoji token for `shape: 'bard'`.
 */
export function drawBard(
  ctx: CanvasRenderingContext2D,
  color: string,
  faceLeft: boolean,
  strum = 0,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (faceLeft) ctx.scale(-1, 1);

  const bodyLit = shade(color, 0.2);
  const bodyDark = shade(color, -0.28);
  const skin = '#e8c39c';
  const wood = '#a4682f';
  const woodLit = shade(wood, 0.22);
  const woodDark = shade(wood, -0.3);
  const feather = shade(color, 0.34);
  const gold = '#e7c25a';

  // A dandy minstrel: wasp waist, puffed and slashed sleeves, a peplum doublet,
  // motley hose (one leg cream, one dark) and pointed shoes — a jaunty, curvy
  // silhouette with a short cape slung off one shoulder.
  capeSide(ctx, -1.8, -7.8, 11.4, 4.6, bodyDark, 0.25, gold);

  const shoe = '#4a2a36';
  legSide(ctx, -0.8, 2.6, -3, 11, { cloth: bodyDark, boot: shade(shoe, -0.1), w: 2.5, bootUp: 0.2, pointed: true }, 0.6);
  legSide(ctx, 1, 2.6, 3.8, 11, { cloth: '#e8dcb0', boot: shoe, w: 2.5, bootUp: 0.2, pointed: true }, 1);

  torsoSide(ctx, {
    color, lit: bodyLit, dark: bodyDark,
    top: -8, waistY: -0.4, hemY: 4.4, chest: 4.2, back: 3.8, waist: 2.8, hemF: 5.6, hemB: 5.8,
  });
  // Slashed doublet: pale slits down the chest.
  ctx.strokeStyle = feather;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (const sx of [1.4, 2.8]) {
    ctx.moveTo(sx, -6.6);
    ctx.lineTo(sx + 0.2, -2.6);
  }
  ctx.stroke();
  belt(ctx, -3, 3.2, -0.2, '#6a4a2a', gold, 0.8, 1.4, 2.4);

  // Lute — a round wooden belly held across the body, its neck angling up over
  // the off shoulder. Drawn before the arms so the picking hand sits over it.
  const bellyX = -3.5;
  const bellyY = 1.5;
  ctx.save();
  ctx.translate(bellyX, bellyY);
  ctx.rotate(-0.35);
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.ellipse(0, 0, 5.6, 6.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = woodLit; // lit belly edge
  ctx.beginPath();
  ctx.ellipse(1.6, -1.2, 3.2, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = woodDark; // sound hole
  ctx.beginPath();
  ctx.arc(0, 0.5, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Neck + a couple of pegs, rising toward the off shoulder.
  const neckTipX = -12;
  const neckTipY = -8.5;
  ctx.strokeStyle = woodDark;
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(bellyX - 1.5, bellyY - 3.5);
  ctx.lineTo(neckTipX, neckTipY);
  ctx.stroke();
  ctx.strokeStyle = '#e7d9b0'; // strings, a pale glint
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(bellyX - 0.5, bellyY - 2.5);
  ctx.lineTo(neckTipX + 1, neckTipY + 0.5);
  ctx.stroke();
  ctx.fillStyle = feather;
  ctx.beginPath();
  ctx.arc(neckTipX, neckTipY, 1.3, 0, Math.PI * 2);
  ctx.fill();

  // Arms: rear arm frets the neck; front (picking) arm sweeps across the strings
  // with the strum, kicking a touch outward on the pluck. Puffed upper sleeves.
  const pluck = -1 + strum * 4;
  arm(ctx, -1.2, -5.6, neckTipX + 3.5, neckTipY + 2, { sleeve: shade(bodyDark, -0.08), hand: skin, w: 2.3 }, 1);
  arm(ctx, 1.4, -5.6, 1 + pluck, bellyY - 0.5, { sleeve: bodyDark, hand: skin, w: 2.3 }, 1.2);
  ctx.fillStyle = bodyLit; // puffed shoulder
  ctx.beginPath();
  ctx.ellipse(1.6, -5.8, 2.6, 2.1, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = feather; // its slashes
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0.6, -7.2);
  ctx.lineTo(1, -4.4);
  ctx.moveTo(2.4, -7.4);
  ctx.lineTo(2.6, -4.6);
  ctx.stroke();

  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(1, -10.6, 3.4, 0, Math.PI * 2);
  ctx.fill();

  // Feathered cap — a soft slouch hat with a jaunty plume.
  ctx.fillStyle = bodyDark;
  ctx.beginPath();
  ctx.moveTo(-3.2, -12);
  ctx.quadraticCurveTo(0.6, -17, 5.6, -12.8);
  ctx.quadraticCurveTo(2, -12, -3.2, -12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = bodyLit; // brim glint
  ctx.beginPath();
  ctx.ellipse(0.8, -12.1, 4.8, 1.2, -0.08, 0, Math.PI * 2);
  ctx.fill();
  // Plume sweeping back off the cap.
  ctx.strokeStyle = feather;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(3.5, -14.2);
  ctx.quadraticCurveTo(-2, -19.6, -7, -17.6);
  ctx.stroke();
  drawProfileFace(ctx, 1, -10.6, 3.4, skin, { eyeY: 0.45, brow: null });

  ctx.restore();
}

/**
 * Procedural Wizard silhouette — a storm-caller in a peaked hat and long robe,
 * levelling a gnarled staff toward the foe — painted in the caller's local space
 * (origin at the figure's centre; robe hem near y=+11, hat tip near y=-20, staff
 * reaching past x=+15). Authored facing +x and flipped horizontally when
 * `faceLeft`. `cast` (0..1) drives the spell: at rest (0) the staff is level and
 * quiet; on a cast (1) the staff kicks up and a swirl of wind gathers and bursts
 * at its crystal. When `empowered` (the Wind Slice upgrade is unlocked) a few
 * small, faint wind motes drift around the figure. Replaces the emoji token for
 * `shape: 'wizard'` units.
 */
export function drawWizard(
  ctx: CanvasRenderingContext2D,
  color: string,
  faceLeft: boolean,
  cast: number,
  empowered = false,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (faceLeft) ctx.scale(-1, 1);

  const robeLit = shade(color, 0.2);
  const robeDark = shade(color, -0.28);
  const under = shade(color, 0.36);
  const skin = '#e8c39c';
  const wood = '#6e4a26';
  const rope = '#d9b45a';

  // A tall, narrow-shouldered caster: the robe is the silhouette — it flares from
  // slim shoulders to a wide hem that sweeps out behind him, a pale under-robe
  // showing at the front slit, a bell sleeve on the casting arm and a long beard.

  // Trailing back panel of the robe sweeping behind.
  ctx.fillStyle = robeDark;
  ctx.beginPath();
  ctx.moveTo(-2.4, -7.6);
  ctx.quadraticCurveTo(-6, 0, -11.4, 11.2);
  ctx.quadraticCurveTo(-6, 12, -1, 11);
  ctx.closePath();
  ctx.fill();
  // Shoe tip peeking under the hem.
  ctx.fillStyle = '#3a2a3a';
  ctx.beginPath();
  ctx.moveTo(4, 11.2);
  ctx.quadraticCurveTo(7.6, 10.2, 9.4, 11.2);
  ctx.closePath();
  ctx.fill();

  // Robe — slim shoulders flaring to a wide hem.
  const robePath = () => {
    ctx.beginPath();
    ctx.moveTo(-3.4, -8.2);
    ctx.quadraticCurveTo(0, -9.8, 3.4, -8);
    ctx.quadraticCurveTo(4.8, -5.8, 4.4, -1);
    ctx.quadraticCurveTo(6.2, 5, 8.6, 11.2);
    ctx.quadraticCurveTo(0, 12.4, -8.6, 11.2);
    ctx.quadraticCurveTo(-5.6, 3, -4.4, -2.6);
    ctx.quadraticCurveTo(-4.8, -6.4, -3.4, -8.2);
    ctx.closePath();
  };
  robePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  robePath();
  ctx.clip();
  ctx.fillStyle = robeLit; // lit front fold
  ctx.beginPath();
  ctx.ellipse(6, 3, 4, 11, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = under; // pale under-robe at the front slit
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.quadraticCurveTo(5.4, 6, 6.2, 12);
  ctx.lineTo(9, 12);
  ctx.quadraticCurveTo(6.6, 5, 4.8, -0.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = robeDark; // hem creases
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-4, 11.4);
  ctx.quadraticCurveTo(-2.4, 6, -2, 2);
  ctx.moveTo(0.6, 11.6);
  ctx.quadraticCurveTo(1, 7, 1.2, 3);
  ctx.stroke();
  ctx.restore();
  // Rope belt with a hanging tassel.
  belt(ctx, -4.2, 4.6, -0.8, rope, undefined, 0.8, 1.1);
  ctx.strokeStyle = rope;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(3, -0.4);
  ctx.quadraticCurveTo(3.6, 2.6, 3.2, 5);
  ctx.stroke();
  ctx.fillStyle = rope;
  ctx.beginPath();
  ctx.ellipse(3.2, 5.6, 0.8, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head + a long beard down the chest.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(1.4, -11.2, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#dfe6ee'; // flowing beard
  ctx.beginPath();
  ctx.moveTo(-1.4, -10.2);
  ctx.quadraticCurveTo(0, -3.6, 1.6, -1.6);
  ctx.quadraticCurveTo(2.6, -3.4, 4.4, -9.6);
  ctx.quadraticCurveTo(2.4, -8.2, 1.4, -8.4);
  ctx.closePath();
  ctx.fill();

  // Pointed wizard hat — wide brim, then a tall crown bending back at the tip.
  ctx.fillStyle = robeDark;
  ctx.beginPath();
  ctx.ellipse(1.2, -13.6, 7, 1.9, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-3.6, -13.6);
  ctx.quadraticCurveTo(-1.6, -19.6, -4.2, -23.2); // back edge up to the tip, bent back
  ctx.quadraticCurveTo(2.8, -20.4, 5.2, -13.8); // front edge back down to the brim
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = robeLit; // a lit band of the crown
  ctx.beginPath();
  ctx.moveTo(-2.4, -13.8);
  ctx.quadraticCurveTo(-0.8, -19, 1.2, -19.4);
  ctx.quadraticCurveTo(0.4, -16.4, 1.8, -13.9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rope; // hat band
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-3.2, -14.4);
  ctx.quadraticCurveTo(0.8, -15.6, 4.8, -14.4);
  ctx.stroke();
  drawProfileFace(ctx, 1.4, -11.2, 3.4, skin, { eyeY: 0.1, mouth: false, brow: '#dfe6ee' });

  // --- Staff & casting arm ---
  // The staff pivots about the front hand: level at rest, kicked up on a cast.
  const handX = 6.5;
  const handY = -3;
  const ang = (-8 - 26 * cast) * (Math.PI / 180); // raises with the cast

  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(ang);
  // Gnarled shaft.
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.lineTo(11, 0);
  ctx.stroke();
  // Crystal head at the tip.
  const crystal = shade(color, 0.28);
  ctx.fillStyle = crystal;
  ctx.beginPath();
  ctx.moveTo(11, -2.6);
  ctx.lineTo(13.4, 0);
  ctx.lineTo(11, 2.6);
  ctx.lineTo(9.4, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f2ffff';
  ctx.beginPath();
  ctx.arc(11, -0.4, 0.9, 0, Math.PI * 2);
  ctx.fill();

  // Gathering wind swirl at the crystal, growing as the cast peaks.
  if (cast > 0.15) {
    const a = Math.min(1, cast);
    ctx.globalAlpha = a;
    ctx.strokeStyle = crystal;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(13.5, -1, 2.4 + a * 1.5, -0.4, Math.PI * 1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(13.5, 1, 2.4 + a * 1.5, Math.PI * 0.9, Math.PI * 2.4);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Bell-sleeved casting arm over the staff grip.
  arm(ctx, 1.6, -6.4, handX, handY, { sleeve: color, hand: skin, w: 2.8, bell: true }, 1.2);

  // Faint wind motes orbiting the caster once the Wind Slice upgrade is unlocked.
  if (empowered) drawWindMotes(ctx, color);

  ctx.restore();
}

/** Millisecond clock for time-driven sprite effects (falls back to Date.now). */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * A handful of small, slightly transparent wind motes drifting around the Wizard
 * — the ambient tell that his Wind Slice is unlocked. Drawn in the figure's local
 * space (origin at its centre); each mote rides a slow elliptical orbit off the
 * shared clock, with a gentle alpha twinkle, tinted a lightened wind colour.
 */
function drawWindMotes(ctx: CanvasRenderingContext2D, color: string): void {
  const t = nowMs() / 1000;
  const tint = shade(color, 0.35);
  ctx.save();
  ctx.fillStyle = tint;
  // Each mote: phase offset, orbit speed, x/y radii, centre offset, size.
  const motes: [number, number, number, number, number, number, number][] = [
    // phase, speed, rx, ry, cx, cy, size
    [0.0, 0.9, 11, 6, 0, -4, 1.3],
    [2.1, -0.7, 9, 8, 1, -6, 1.0],
    [4.0, 1.15, 13, 5, -1, -3, 1.15],
    [1.2, -1.0, 7, 9, 2, -8, 0.9],
    [5.2, 0.75, 12, 7, -1, -5, 1.05],
  ];
  for (const [phase, speed, rx, ry, cx, cy, size] of motes) {
    const a = t * speed + phase;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    // Twinkle between ~0.2 and ~0.5 so the motes stay subtle and airy.
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 3 + phase);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A solid, detailed back-of-helm for the marching humanoids' 'back' view. The
 * front views build a head from a skin face plus a thin dome cap; seen from
 * behind that cap alone leaves the head a sliver that reads as "missing". This
 * fills a full rounded helm instead — with a short nape bridging it to the
 * shoulders, a lower rim, a centre seam and a pair of side rivets — so the head
 * is unmistakable and the back isn't a bland blank. Drawn in the caller's local
 * space; `cy`/`r` are the head centre and radius. Any crest/plume the sprite
 * draws afterward still layers on top.
 */
function drawBackHelm(
  ctx: CanvasRenderingContext2D,
  cy: number,
  r: number,
  dome: string,
  rim: string,
  nape: string,
): void {
  // Neck / nape stub bridging the shoulders up to the helm.
  ctx.fillStyle = nape;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, cy);
  ctx.lineTo(r * 0.5, cy);
  ctx.lineTo(r * 0.4, cy + r * 1.2);
  ctx.lineTo(-r * 0.4, cy + r * 1.2);
  ctx.closePath();
  ctx.fill();
  // Full rounded helm back.
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.arc(0, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Lower rim band.
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.ellipse(0, cy + r * 0.62, r * 0.98, r * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  // Centre seam + a pair of side rivets for definition.
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, cy - r * 0.9);
  ctx.lineTo(0, cy + r * 0.5);
  ctx.stroke();
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(-r * 0.62, cy - r * 0.05, 0.6, 0, Math.PI * 2);
  ctx.arc(r * 0.62, cy - r * 0.05, 0.6, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A short flanged mace head centred on `(x, y)`, sized by `r`: a steel knob ringed
 * by a handful of stubby wedge flanges, with a small top spike and a highlight dot.
 * Shared by the Man-at-Arms' three views so his weapon reads the same whichever way
 * he marches. Drawn in the caller's local space with the shaft assumed to arrive
 * from below-left of the head.
 */
function drawFlangedMaceHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  steel: string,
  steelDark: string,
): void {
  // Wedge flanges radiating from the core.
  ctx.fillStyle = steelDark;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const bx = x + Math.cos(a) * r * 0.6;
    const by = y + Math.sin(a) * r * 0.6;
    const tx = x + Math.cos(a) * r * 1.7;
    const ty = y + Math.sin(a) * r * 1.7;
    const px = Math.cos(a + Math.PI / 2) * r * 0.55;
    const py = Math.sin(a + Math.PI / 2) * r * 0.55;
    ctx.beginPath();
    ctx.moveTo(bx + px, by + py);
    ctx.lineTo(tx, ty);
    ctx.lineTo(bx - px, by - py);
    ctx.closePath();
    ctx.fill();
  }
  // Central knob.
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#eef3f8'; // glint
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A wooden round shield of radius `r` centred on the caller's local origin: a
 * plank-boarded face with a couple of seam lines and a lit edge, ringed by a steel
 * rim and capped with a steel central boss. Gives the Grunt footman a timber shield
 * distinct from the Man-at-Arms' bare steel heater. Drawn face-on; the caller
 * translates/positions it.
 */
function drawWoodenRoundShield(
  ctx: CanvasRenderingContext2D,
  r: number,
  steel: string,
  steelDark: string,
): void {
  const wood = '#7a5a34';
  const woodDark = shade(wood, -0.3);
  const woodLit = shade(wood, 0.14);
  // Planked face.
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = woodLit; // lit half for a little grain volume
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI * 1.15, Math.PI * 1.95);
  ctx.arc(0, 0, r * 0.2, Math.PI * 1.95, Math.PI * 1.15, true);
  ctx.closePath();
  ctx.fill();
  // Plank seams (clipped to the disc).
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = woodDark;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, -r);
  ctx.lineTo(-r * 0.4, r);
  ctx.moveTo(r * 0.4, -r);
  ctx.lineTo(r * 0.4, r);
  ctx.stroke();
  ctx.restore();
  // Steel rim.
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = steelDark;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  // Steel central boss.
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.29, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Procedural Grunt silhouette — a shield-and-spear footman marching along the
 * path — painted in the caller's local space (origin at the figure's centre;
 * feet near y=+12, head near y=-15). Unlike the champion sprites (which always
 * face their target in profile) an enemy walks in whatever direction the path
 * heads, so this one has three authored views selected by `view`:
 *  - 'side'  : a profile authored facing +x, flipped when `faceLeft` (walking
 *              left/right along the path);
 *  - 'front' : marching toward the viewer (walking down the board) — face and
 *              shield boss visible;
 *  - 'back'  : marching away (walking up the board) — back of the helm, a cloak.
 * `phase` (radians) is the walk-cycle position, advanced from distance travelled
 * so the legs stride in step with actual movement. Replaces the emoji token for
 * the Castle grunt (`cas_grunt`).
 */
export function drawGrunt(
  ctx: CanvasRenderingContext2D,
  color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  phase: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view === 'side' && faceLeft) ctx.scale(-1, 1);

  const armorLit = shade(color, 0.18);
  const armorDark = shade(color, -0.28);
  const steel = '#c9d2dc';
  const steelDark = '#8b95a3';
  const skin = '#e8c39c';
  const boot = '#3a2f26';
  const wood = '#6e4a26';
  const legs: LegLook = { cloth: '#4a4038', boot, w: 3.3, bootUp: 0.6 };

  const bob = Math.abs(Math.sin(phase)); // 0..1 vertical bob on each stride

  if (view === 'side') {
    // --- Profile (walking along the row) ---
    walkLegsSide(ctx, phase, { hipY: 3.4, footY: 12, stride: 3.6, look: legs });

    ctx.save();
    ctx.translate(0, -bob * 1.2); // upper body bobs with each step

    // Spear slung over the rear shoulder, angled up and back.
    ctx.strokeStyle = wood;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-1, -1.4);
    ctx.lineTo(-11, -18);
    ctx.stroke();
    ctx.fillStyle = steel; // leaf head
    ctx.beginPath();
    ctx.moveTo(-11, -18);
    ctx.lineTo(-13.6, -22.5);
    ctx.lineTo(-9.2, -21);
    ctx.closePath();
    ctx.fill();
    // Rear hand steadying the shaft at the shoulder.
    arm(ctx, -0.8, -6.2, -4.2, -6.4, { sleeve: shade(armorDark, -0.1), hand: skin, w: 2.6 }, -1.6);

    // Padded jack over a short skirt, belted.
    torsoSide(ctx, {
      color, lit: armorLit, dark: armorDark,
      top: -9, waistY: 0, hemY: 5.4, chest: 5, back: 4.6, waist: 3.8, hemF: 5.4, hemB: 5.6,
    });
    belt(ctx, -4, 4.4, 0.6, '#5a3d28', steelDark, 0.9, 1.5, 3);

    // Head + kettle helm (brim, then dome).
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(1.6, -11, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = steelDark; // brim
    ctx.beginPath();
    ctx.ellipse(1.4, -11.9, 6, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = steel; // dome
    ctx.beginPath();
    ctx.moveTo(-2.4, -12);
    ctx.quadraticCurveTo(-2.6, -16, 1.6, -16);
    ctx.quadraticCurveTo(5, -16, 4.8, -12);
    ctx.quadraticCurveTo(1.6, -13.2, -2.4, -12);
    ctx.closePath();
    ctx.fill();
    drawProfileFace(ctx, 1.6, -11, 3.4, skin, { eyeY: 1.15, brow: null });

    // Round shield carried on the front arm.
    ctx.save();
    ctx.translate(5.5, 0.5);
    drawWoodenRoundShield(ctx, 6, steel, steelDark);
    ctx.restore();

    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Front / back (marching toward or away from the viewer) ---
  const back = view === 'back';
  walkLegsFront(ctx, phase, { hipY: 3.4, footY: 12, sep: 2.6, look: legs, back });

  ctx.save();
  ctx.translate(0, -bob * 1);

  torsoFront(ctx, {
    color: back ? armorDark : color, lit: armorLit, dark: shade(color, -0.4),
    top: -9, waistY: 0.4, hemY: 6, shoulder: 6.4, waist: 4.6, hem: 6, back, seam: shade(color, -0.45),
  });
  if (back) {
    // Cloak folds so the back isn't a flat blank.
    ctx.strokeStyle = shade(color, -0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3.6, -5);
    ctx.quadraticCurveTo(-2.6, 1, -3.2, 6);
    ctx.moveTo(3.6, -5);
    ctx.quadraticCurveTo(2.6, 1, 3.2, 6);
    ctx.stroke();
  }
  belt(ctx, -4.6, 4.6, 0.8, '#5a3d28', back ? undefined : steelDark, 0.9, 1.5);

  // Round shield: face-on and central when marching toward us, a slim edge
  // peeking past the side when marching away.
  if (back) {
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.ellipse(-6.8, 1, 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.save();
    ctx.translate(-4.5, 1);
    drawWoodenRoundShield(ctx, 5.5, steel, steelDark);
    ctx.restore();
  }

  // Spear held upright on the far side, the hand gripping it.
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(6.4, -16);
  ctx.lineTo(6.4, 8);
  ctx.stroke();
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.moveTo(6.4, -20);
  ctx.lineTo(4.8, -16);
  ctx.lineTo(8, -16);
  ctx.closePath();
  ctx.fill();
  arm(ctx, 5.2, -6.2, 6.4, -0.4, { sleeve: armorDark, hand: skin, w: 2.6 }, back ? -0.6 : 0.6);

  // Head — face + kettle helm toward us; a full detailed helm from behind so
  // the head reads clearly instead of vanishing to a thin cap.
  if (back) {
    drawBackHelm(ctx, -12.6, 4.4, steel, steelDark, skin);
  } else {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -11, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = steelDark; // brim
    ctx.beginPath();
    ctx.ellipse(0, -11.8, 5.4, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = steel; // dome
    ctx.beginPath();
    ctx.arc(0, -12.6, 4.2, Math.PI, 0);
    ctx.fill();
    // Eyes peering out under the brim.
    ctx.fillStyle = '#2a2230';
    ctx.beginPath();
    ctx.arc(-1.5, -10.6, 0.7, 0, Math.PI * 2);
    ctx.arc(1.5, -10.6, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

/**
 * Procedural Rebel Sergeant silhouette — a heavier castle footman: the same
 * marching build as the grunt but armoured up, with a red helm plume, steel
 * pauldrons, a kite shield and a longsword instead of the grunt's spear. Same
 * three authored views ('side' mirrored on `faceLeft`, 'front', 'back') and the
 * `phase` walk cadence advanced from distance travelled. Replaces the emoji
 * token for the Castle heavy grunt (`cas_grunt2`).
 */
export function drawGrunt2(
  ctx: CanvasRenderingContext2D,
  color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  phase: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view === 'side' && faceLeft) ctx.scale(-1, 1);

  const armorLit = shade(color, 0.18);
  const armorDark = shade(color, -0.3);
  const steel = '#c9d2dc';
  const steelDark = '#8b95a3';
  const skin = '#e8c39c';
  const plume = '#b23a3a';
  // Heavier than the grunt: plate knees, broader plate torso, pauldrons.
  const legs: LegLook = { cloth: '#4a4038', boot: '#5d6672', w: 3.8, bootUp: 0.72, knee: steel };

  const bob = Math.abs(Math.sin(phase));

  if (view === 'side') {
    // --- Profile (walking along the row) ---
    walkLegsSide(ctx, phase, { hipY: 3.6, footY: 12, stride: 3.5, look: legs });

    ctx.save();
    ctx.translate(0, -bob * 1.2);

    // Longsword shouldered, angled up and back.
    ctx.strokeStyle = steel;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-3, -4);
    ctx.lineTo(-12, -20);
    ctx.stroke();
    ctx.strokeStyle = '#eef3f8';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-3.6, -4.6);
    ctx.lineTo(-11.6, -19.4);
    ctx.stroke();
    ctx.strokeStyle = steelDark; // crossguard
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-1.4, -2.6);
    ctx.lineTo(-4.6, -5.6);
    ctx.stroke();
    // Rear hand on the grip below the guard.
    arm(ctx, -0.6, -6.4, -2.2, -2.2, { sleeve: shade(armorDark, -0.1), hand: '#7a828e', w: 2.8 }, -0.8);

    // Mail skirt under a plate cuirass.
    ctx.fillStyle = steelDark;
    ctx.beginPath();
    ctx.ellipse(0, 6, 5.8, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
    torsoSide(ctx, {
      color, lit: armorLit, dark: armorDark,
      top: -9, waistY: 0.4, hemY: 5.6, chest: 5.8, back: 5.2, waist: 4.4, hemF: 5.8, hemB: 6,
    });
    belt(ctx, -4.6, 5, 0.9, '#4a3020', '#e7c25a', 0.9, 1.6, 3.4);
    pauldron(ctx, 1.6, -6.8, 3.4, steelDark, -0.2);

    // Head + helm with a swept-back plume.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(1.6, -11, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.moveTo(-2.6, -11);
    ctx.quadraticCurveTo(-2.8, -16, 1.6, -16);
    ctx.quadraticCurveTo(5.2, -16, 5, -11);
    ctx.quadraticCurveTo(1.6, -12.6, -2.6, -11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = steelDark; // visor slit
    ctx.fillRect(1, -12.4, 4, 1);
    drawProfileFace(ctx, 1.6, -11, 3.4, skin, { eyeY: 0.9, brow: null });
    ctx.strokeStyle = plume;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(1.4, -16.4);
    ctx.quadraticCurveTo(-3, -18, -5, -13.5);
    ctx.stroke();

    // Kite shield on the front arm.
    ctx.save();
    ctx.translate(5.8, 0.5);
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.quadraticCurveTo(4, -5, 4, 1);
    ctx.quadraticCurveTo(4, 6, 0, 9);
    ctx.quadraticCurveTo(-4, 6, -4, 1);
    ctx.quadraticCurveTo(-4, -5, 0, -6);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = steelDark;
    ctx.stroke();
    ctx.strokeStyle = steel; // cross emblem
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 6);
    ctx.moveTo(-3, 1);
    ctx.lineTo(3, 1);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Front / back (marching toward or away from the viewer) ---
  const back = view === 'back';
  walkLegsFront(ctx, phase, { hipY: 3.6, footY: 12, sep: 2.8, look: legs, back });

  ctx.save();
  ctx.translate(0, -bob * 1);

  ctx.fillStyle = steelDark; // mail skirt
  ctx.beginPath();
  ctx.ellipse(0, 6.2, 6.4, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  torsoFront(ctx, {
    color: back ? armorDark : color, lit: armorLit, dark: shade(color, -0.42),
    top: -9, waistY: 0.6, hemY: 5.8, shoulder: 7, waist: 4.8, hem: 6.2, back, seam: shade(color, -0.5),
  });
  if (back) {
    // Backplate lames flanking the spine.
    ctx.strokeStyle = shade(color, -0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4.2, -6);
    ctx.lineTo(-3.6, 5.4);
    ctx.moveTo(4.2, -6);
    ctx.lineTo(3.6, 5.4);
    ctx.stroke();
  }
  belt(ctx, -4.8, 4.8, 1, '#4a3020', back ? undefined : '#e7c25a', 0.9, 1.6);
  // Pauldrons on both shoulders.
  pauldron(ctx, -6.4, -6.4, 3, steelDark, -0.25);
  pauldron(ctx, 6.4, -6.4, 3, steelDark, 0.25);

  // Sword held upright on the far side, a gauntlet on the grip.
  ctx.strokeStyle = steel;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(6.8, -18);
  ctx.lineTo(6.8, 6);
  ctx.stroke();
  ctx.strokeStyle = steelDark; // crossguard + pommel
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4.8, 3.5);
  ctx.lineTo(8.8, 3.5);
  ctx.stroke();
  arm(ctx, 6, -5.4, 6.8, 4.6, { sleeve: armorDark, hand: '#7a828e', w: 2.8 }, back ? -0.5 : 0.5);

  // Shield: kite face-on when marching toward us, a slim edge from behind.
  if (back) {
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.ellipse(-7.2, 1, 2, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.save();
    ctx.translate(-5, 1);
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.quadraticCurveTo(3.5, -5, 3.5, 1);
    ctx.quadraticCurveTo(3.5, 6, 0, 8.5);
    ctx.quadraticCurveTo(-3.5, 6, -3.5, 1);
    ctx.quadraticCurveTo(-3.5, -5, 0, -6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = steel;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 6);
    ctx.moveTo(-2.6, 1);
    ctx.lineTo(2.6, 1);
    ctx.stroke();
    ctx.restore();
  }

  // Head + helm — a full detailed helm from behind so it doesn't vanish.
  if (back) {
    drawBackHelm(ctx, -12.2, 4.5, steel, steelDark, skin);
  } else {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -11, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = steelDark; // brim
    ctx.beginPath();
    ctx.ellipse(0, -11.4, 4.8, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = steel; // dome
    ctx.beginPath();
    ctx.arc(0, -12.2, 4.3, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#2a2230'; // visor slit
    ctx.fillRect(-2, -11.2, 4, 1);
  }
  if (back) {
    // The swept-back plume seen from behind: a full crest rising off the crown
    // and cascading down the helm's centre seam to the nape, so the sergeant's
    // red still reads as he marches away.
    ctx.fillStyle = plume;
    ctx.beginPath();
    ctx.moveTo(-1.9, -16.2);
    ctx.quadraticCurveTo(-1.6, -19.8, 0, -19.9);
    ctx.quadraticCurveTo(1.6, -19.8, 1.9, -16.2);
    ctx.quadraticCurveTo(2.5, -12, 1.5, -8.2);
    ctx.quadraticCurveTo(0, -7.2, -1.5, -8.2);
    ctx.quadraticCurveTo(-2.5, -12, -1.9, -16.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(plume, -0.35); // horsehair strands
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-0.8, -18.6);
    ctx.quadraticCurveTo(-1.2, -13, -0.8, -8.2);
    ctx.moveTo(0.8, -18.6);
    ctx.quadraticCurveTo(1.2, -13, 0.8, -8.2);
    ctx.stroke();
    ctx.strokeStyle = shade(plume, 0.3); // lit crown
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-1, -19);
    ctx.quadraticCurveTo(0, -19.6, 1, -19);
    ctx.stroke();
  } else {
    // Red plume tuft on the crown.
    ctx.fillStyle = plume;
    ctx.beginPath();
    ctx.moveTo(-1.3, -16.4);
    ctx.quadraticCurveTo(0, -18.8, 1.3, -16.4);
    ctx.quadraticCurveTo(0, -14.6, -1.3, -16.4);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

/**
 * Procedural Man-at-Arms silhouette — a grizzled, road-worn veteran in the vein of
 * Darkest Dungeon's man-at-arms: lighter than the Rebel Sergeant (mail hauberk and
 * an open barbute helm rather than full plate and a visored great-helm), a bearded
 * face left bare, a small battered heater shield and a flanged war-mace instead of
 * a sword. Same three authored views ('side' mirrored on `faceLeft`, 'front',
 * 'back') and the `phase` walk cadence advanced from distance travelled. Replaces
 * the emoji token for the Castle man-at-arms (`cas_grunt3`).
 */
export function drawGrunt3(
  ctx: CanvasRenderingContext2D,
  color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  phase: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view === 'side' && faceLeft) ctx.scale(-1, 1);

  const armorLit = shade(color, 0.18);
  const armorDark = shade(color, -0.28);
  const steel = '#c9d2dc';
  const steelDark = '#8b95a3';
  const skin = '#d9ad82';
  const beard = '#6b6156';
  const boot = '#3a2f26';
  const wood = '#5a4634';
  // A road-worn veteran: a knee-length mail hauberk, a slight stoop, worn boots.
  const legs: LegLook = { cloth: '#50463a', boot, w: 3.4, bootUp: 0.66 };

  const bob = Math.abs(Math.sin(phase));

  if (view === 'side') {
    // --- Profile (walking along the row) ---
    walkLegsSide(ctx, phase, { hipY: 4.4, footY: 12, stride: 3.5, look: legs });

    ctx.save();
    ctx.translate(0, -bob * 1.2);

    // War-mace shouldered, haft angled up and back, flanged head at the top.
    ctx.strokeStyle = wood;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-2.5, -3.5);
    ctx.lineTo(-10.5, -18);
    ctx.stroke();
    drawFlangedMaceHead(ctx, -11.4, -20, 2.6, steel, steelDark);
    arm(ctx, -0.6, -6.2, -3.6, -6, { sleeve: shade(armorDark, -0.1), hand: skin, w: 2.6 }, -1.4);

    // Mail hauberk to the knee, with a scatter of rings for texture.
    torsoSide(ctx, {
      color, lit: armorLit, dark: armorDark,
      top: -9, waistY: 0.4, hemY: 7.2, chest: 4.9, back: 4.8, waist: 3.9, hemF: 5.2, hemB: 5.6, lean: 0.6,
    });
    ctx.fillStyle = armorDark; // mail-ring speckle
    for (const [mx, my] of [[-2, -4], [1, -2], [-1, 1], [2, 3], [-3, 3], [0.6, 5.4], [-2.4, 5.8]]) {
      ctx.beginPath();
      ctx.arc(mx, my, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    belt(ctx, -4, 4.4, 0.9, '#4a3020', steelDark, 0.9, 1.5, 3);

    // Head — open barbute helm with a bare, bearded veteran's face and a nasal bar.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(1.8, -11, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = beard; // jaw stubble
    ctx.beginPath();
    ctx.moveTo(-0.4, -10);
    ctx.quadraticCurveTo(1.8, -6.4, 4.4, -9.5);
    ctx.quadraticCurveTo(2.6, -8.6, 1.6, -8.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = steel; // helm skull-cap
    ctx.beginPath();
    ctx.moveTo(-2.4, -11.4);
    ctx.quadraticCurveTo(-2.6, -16, 1.8, -16);
    ctx.quadraticCurveTo(5.4, -16, 5, -11.4);
    ctx.quadraticCurveTo(4.4, -12.6, 3.4, -12.4);
    ctx.lineTo(3.4, -11.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = steelDark; // nasal bar
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(3.6, -12.2);
    ctx.lineTo(3.9, -9.6);
    ctx.stroke();
    drawProfileFace(ctx, 1.4, -11, 3.4, skin, { eyeY: 0.7, brow: null, mouth: false });

    // Small battered heater shield on the front arm.
    ctx.save();
    ctx.translate(5.2, 0.8);
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.moveTo(-3.4, -5);
    ctx.lineTo(3.4, -5);
    ctx.quadraticCurveTo(3.4, 3, 0, 6.5);
    ctx.quadraticCurveTo(-3.4, 3, -3.4, -5);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = steelDark;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Front / back (marching toward or away from the viewer) ---
  const back = view === 'back';
  walkLegsFront(ctx, phase, { hipY: 4.4, footY: 12, sep: 2.6, look: legs, back });

  ctx.save();
  ctx.translate(0, -bob * 1);

  torsoFront(ctx, {
    color: back ? armorDark : color, lit: armorLit, dark: shade(color, -0.42),
    top: -9, waistY: 0.6, hemY: 7.4, shoulder: 6.4, waist: 4.6, hem: 6, back,
  });
  ctx.fillStyle = back ? shade(color, -0.5) : armorDark; // mail rings
  for (const [mx, my] of back
    ? [[0, -5], [-2.5, -2], [2.5, -2], [0, 1], [-2, 4], [2, 4], [0, 6.4]]
    : [[-2.5, -3], [2.5, -3], [0, 0], [-2.5, 3], [2.5, 3], [0, 5.8]]) {
    ctx.beginPath();
    ctx.arc(mx, my, 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  belt(ctx, -4.6, 4.6, 1, '#4a3020', back ? undefined : steelDark, 0.9, 1.5);

  // Mace held upright on the far side: haft with the flanged head up top.
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(6.6, -13);
  ctx.lineTo(6.6, 7);
  ctx.stroke();
  drawFlangedMaceHead(ctx, 6.6, -15.5, 2.6, steel, steelDark);
  arm(ctx, 5.2, -6, 6.6, 0.4, { sleeve: armorDark, hand: skin, w: 2.6 }, back ? -0.6 : 0.6);

  // Small heater shield: face-on when marching toward us, a slim edge from behind.
  if (back) {
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.ellipse(-6.8, 1, 1.8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.save();
    ctx.translate(-5, 1);
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.moveTo(-3, -5);
    ctx.lineTo(3, -5);
    ctx.quadraticCurveTo(3, 3, 0, 6);
    ctx.quadraticCurveTo(-3, 3, -3, -5);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = steelDark;
    ctx.stroke();
    ctx.restore();
  }

  // Head — bare bearded face + open barbute toward us; a full helm from behind so
  // the head reads clearly rather than vanishing to a thin cap.
  if (back) {
    drawBackHelm(ctx, -12.2, 4.3, steel, steelDark, skin);
  } else {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -11, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = beard; // beard framing the jaw
    ctx.beginPath();
    ctx.moveTo(-3.2, -11);
    ctx.quadraticCurveTo(0, -6.2, 3.2, -11);
    ctx.quadraticCurveTo(0, -8.8, -3.2, -11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = steel; // helm skull-cap
    ctx.beginPath();
    ctx.arc(0, -12, 4.1, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = steelDark; // nasal bar
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -12.4);
    ctx.lineTo(0, -9.6);
    ctx.stroke();
    ctx.fillStyle = '#2a2230'; // eyes under the brow
    ctx.beginPath();
    ctx.arc(-1.7, -11.4, 0.7, 0, Math.PI * 2);
    ctx.arc(1.7, -11.4, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

/**
 * Procedural Outrider silhouette — a light cavalry scout: a palomino horse at a
 * gallop with an armoured rider and raised sabre — painted in the caller's local
 * space (origin at the figure's centre; hooves near y=+12). Like the grunt it has
 * three authored views selected by `view` ('side' profile, mirrored on `faceLeft`;
 * 'front' charging toward the viewer; 'back' galloping away). `phase` (radians)
 * advances from distance travelled so the gallop reads in step with real motion.
 * Replaces the emoji token for the Castle runner (`cas_runner`).
 */
export function drawOutrider(
  ctx: CanvasRenderingContext2D,
  color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  phase: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view === 'side' && faceLeft) ctx.scale(-1, 1);

  const coat = color;
  const coatLit = shade(color, 0.16);
  const coatDark = shade(color, -0.28);
  const hair = '#f2e4bc'; // cream mane & tail (palomino)
  const hoof = '#2a2018';
  const rider = '#5b6472';
  const steel = '#c9d2dc';
  const skin = '#e8c39c';
  const leather = '#6e4a26';

  const step = Math.sin(phase);

  if (view === 'side') {
    // Galloping legs: front and rear pairs reach out in opposite phase.
    const f = Math.cos(phase) * 3.4;
    const b = Math.cos(phase + Math.PI) * 3.4;
    const up = Math.sin(phase);
    // Jointed legs: a muscled forearm/gaskin, a knee (front) or hock (hind)
    // that folds as the hoof lifts, a slim cannon and a dark hoof. Far pair first.
    const horseLeg = (x0: number, d: number, lift: number, front: boolean, c: string) => {
      const hx = x0 + d;
      const hy = 12 - lift;
      const kx = x0 + d * 0.45 + (front ? 1 : -1) * (0.4 + lift * 0.9);
      const ky = 7 - lift * 0.5;
      seg(ctx, x0, 1, kx, ky, 2.1, 1.1, c);
      seg(ctx, kx, ky, hx, hy - 1, 1.1, 0.85, c);
      ctx.fillStyle = hoof;
      ctx.beginPath();
      ctx.ellipse(hx + (front ? 0.3 : -0.1), hy - 0.4, 1.3, 1, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const farCoat = shade(coatDark, -0.12);
    horseLeg(-4.5, -b, Math.max(0, -up) * 1.8, false, farCoat);
    horseLeg(8, -f, Math.max(0, up) * 1.8, true, farCoat);
    horseLeg(-7, b, Math.max(0, up) * 1.8, false, coatDark);
    horseLeg(5.5, f, Math.max(0, -up) * 1.8, true, coatDark);

    // Flowing tail off the rump.
    ctx.strokeStyle = hair;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-11, -2);
    ctx.quadraticCurveTo(-16, -1, -15, 7);
    ctx.stroke();

    // Barrel of the horse + a lit topline.
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = coatLit;
    ctx.beginPath();
    ctx.ellipse(-1, -2, 8.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Neck + head reaching forward (+x).
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.moveTo(7, -3);
    ctx.quadraticCurveTo(12, -6, 13, -11);
    ctx.lineTo(17, -11);
    ctx.quadraticCurveTo(18.5, -8, 16.5, -6);
    ctx.lineTo(13, -5);
    ctx.quadraticCurveTo(11, -3, 9, -1);
    ctx.closePath();
    ctx.fill();
    // Mane down the neck.
    ctx.strokeStyle = hair;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(8, -4);
    ctx.quadraticCurveTo(12, -7.5, 13.5, -11);
    ctx.stroke();
    // Ear + eye.
    ctx.fillStyle = coatDark;
    ctx.beginPath();
    ctx.moveTo(13.5, -11);
    ctx.lineTo(13, -14.5);
    ctx.lineTo(15.2, -11.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2a2018';
    ctx.beginPath();
    ctx.arc(15, -9, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // --- Rider ---
    ctx.fillStyle = leather; // saddle
    ctx.beginPath();
    ctx.ellipse(-1, -6, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = steel; // raised sabre in the rear hand
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-2, -12);
    ctx.lineTo(-7.5, -18.5);
    ctx.stroke();
    legSide(ctx, -0.4, -6.4, 1.6, -0.6, { cloth: '#4a4038', boot: '#2a2018', w: 2.6, bootUp: 0.6, toe: 2 }, 2);
    ctx.fillStyle = rider; // torso
    ctx.beginPath();
    ctx.moveTo(-2.5, -6);
    ctx.quadraticCurveTo(-4.5, -12, -1, -14);
    ctx.quadraticCurveTo(3.5, -13.5, 2.5, -7);
    ctx.closePath();
    ctx.fill();
    arm(ctx, 0.8, -11, 8.6, -6.4, { sleeve: shade(rider, -0.2), hand: '#4a3a2a', w: 2.2 }, 1.2); // to the reins
    ctx.fillStyle = skin; // head
    ctx.beginPath();
    ctx.arc(0, -15, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = steel; // helm dome
    ctx.beginPath();
    ctx.arc(0, -15.6, 3, Math.PI, 0);
    ctx.fill();

    ctx.restore();
    return;
  }

  // --- Front / back (charging toward or away from the viewer) ---
  const back = view === 'back';
  // Legs step alternately in place.
  for (const [lx, lift] of [[-5.2, Math.max(0, step) * 2], [5.2, Math.max(0, -step) * 2]] as const) {
    seg(ctx, lx, 2, lx * 1.04, 7 - lift * 0.5, 2.1, 1.2, coatDark);
    seg(ctx, lx * 1.04, 7 - lift * 0.5, lx, 11 - lift, 1.2, 0.95, coatDark);
    ctx.fillStyle = hoof;
    ctx.beginPath();
    ctx.ellipse(lx, 11.6 - lift, 1.4, 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (back) {
    // Rounded hindquarters + tail + a rump highlight.
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = coatDark;
    ctx.beginPath();
    ctx.ellipse(0, 3, 8.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hair; // tail down the centre
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.quadraticCurveTo(1.5, 2, 0, 9);
    ctx.stroke();
  } else {
    // Front legs step (over the chest), then chest, neck & head face-on.
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(0, 1, 7.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = coatLit;
    ctx.beginPath();
    ctx.ellipse(-2, -1, 2.4, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head.
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(0, -9, 3.6, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = coatDark; // ears
    for (const ex of [-3, 3]) {
      ctx.beginPath();
      ctx.moveTo(ex, -12);
      ctx.lineTo(ex * 1.3, -15);
      ctx.lineTo(ex * 0.4, -12.4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = hair; // forelock
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(-1.4, -9.5);
    ctx.lineTo(1.4, -9.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2a2018'; // eyes + nostrils
    ctx.beginPath();
    ctx.arc(-1.6, -9.5, 0.8, 0, Math.PI * 2);
    ctx.arc(1.6, -9.5, 0.8, 0, Math.PI * 2);
    ctx.arc(-1, -6, 0.6, 0, Math.PI * 2);
    ctx.arc(1, -6, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rider peeking above the horse: shoulders + helmeted head.
  ctx.fillStyle = rider;
  ctx.beginPath();
  ctx.ellipse(0, back ? -7 : -13, 4.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, back ? -11 : -16.5, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.arc(0, back ? -11.6 : -17, 3, Math.PI, 0);
  ctx.fill();
  if (!back) {
    ctx.fillStyle = '#2a2230';
    ctx.beginPath();
    ctx.arc(-1, -16, 0.6, 0, Math.PI * 2);
    ctx.arc(1, -16, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** A small spoked wooden wheel (side view), spokes rotated by `roll` radians. */
function drawWheel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  roll: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#3a2f22';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5a4634';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.rotate(roll);
  ctx.strokeStyle = '#4a3a28';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
    ctx.stroke();
  }
  ctx.fillStyle = '#5a4634';
  ctx.beginPath();
  ctx.arc(0, 0, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Procedural Siege Ram silhouette — a wheeled battering ram: an iron ram's-head
 * log slung in a timber A-frame under a pent roof — painted in the caller's local
 * space (origin at the figure's centre; wheels near y=+10). Three authored views
 * selected by `view` ('side' profile, mirrored on `faceLeft`; 'front' bearing the
 * ram head at the viewer; 'back' the timber rear). `roll` (radians) is the wheel
 * rotation, advanced from distance travelled so the wheels turn as it rolls; the
 * slung log swings on a slower beat off the same value. Replaces the emoji token
 * for the Castle brute (`cas_brute`).
 */
export function drawSiegeRam(
  ctx: CanvasRenderingContext2D,
  color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  roll: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view === 'side' && faceLeft) ctx.scale(-1, 1);

  const beam = '#5a4634';
  const plank = '#6e4a26';
  const roof = '#4a3018';
  const logWood = '#7a5a34';
  const metal = color;
  const metalDark = shade(color, -0.3);
  const metalLit = shade(color, 0.16);
  const swing = Math.sin(roll * 0.4) * 2.6; // ram log rocks on a slower beat

  if (view === 'side') {
    drawWheel(ctx, -6.5, 10, 5, roll);
    drawWheel(ctx, 7, 10, 5, roll);
    // Cart bed + A-frame uprights + top beam.
    ctx.fillStyle = plank;
    ctx.fillRect(-11, 5, 22, 3);
    ctx.strokeStyle = beam;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-9, 6);
    ctx.lineTo(-6, -6);
    ctx.moveTo(9, 6);
    ctx.lineTo(6, -6);
    ctx.moveTo(-7, -6);
    ctx.lineTo(7, -6);
    ctx.stroke();
    // Pent roof over the frame.
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(-11, -6);
    ctx.lineTo(0, -11);
    ctx.lineTo(11, -6);
    ctx.closePath();
    ctx.fill();
    // Suspension ropes down to the slung log.
    ctx.strokeStyle = '#3a2f22';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, -6);
    ctx.lineTo(-4 + swing, -0.5);
    ctx.moveTo(4, -6);
    ctx.lineTo(4 + swing, -0.5);
    ctx.stroke();
    // The ram log.
    ctx.strokeStyle = logWood;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-9 + swing, -0.5);
    ctx.lineTo(9 + swing, -0.5);
    ctx.stroke();
    ctx.strokeStyle = '#8a6a40';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-8 + swing, -2);
    ctx.lineTo(8 + swing, -2);
    ctx.stroke();
    // Iron ram's head at the business end (a blunt snout with a curled horn).
    ctx.save();
    ctx.translate(9 + swing, -0.5);
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(7, -3);
    ctx.quadraticCurveTo(9.5, 0, 7, 3);
    ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = metalLit;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(7, -3);
    ctx.lineTo(6, -1.2);
    ctx.lineTo(0, -1.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = metalDark; // curled horn
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(1.5, -3, 3, Math.PI * 0.4, Math.PI * 2.1);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
    return;
  }

  // --- Front / back (bearing down on, or trundling away from, the viewer) ---
  const back = view === 'back';
  ctx.save();
  ctx.translate(0, Math.abs(Math.sin(roll)) * 0.5); // slight rolling rumble
  drawWheel(ctx, -8, 10, 4, roll);
  drawWheel(ctx, 8, 10, 4, roll);
  // Frame uprights.
  ctx.strokeStyle = beam;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-9, 9);
  ctx.lineTo(-8, -6);
  ctx.moveTo(9, 9);
  ctx.lineTo(8, -6);
  ctx.stroke();
  // Pent roof.
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(-11, -6);
  ctx.lineTo(0, -11);
  ctx.lineTo(11, -6);
  ctx.closePath();
  ctx.fill();

  if (back) {
    // Timber X-brace + the round butt of the log.
    ctx.strokeStyle = plank;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -5);
    ctx.lineTo(8, 8);
    ctx.moveTo(8, -5);
    ctx.lineTo(-8, 8);
    ctx.stroke();
    ctx.fillStyle = logWood;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a4020';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#6a4a2a';
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Iron ram face bearing down: metal plate with two curled horns + studs.
    for (const sgn of [1, -1] as const) {
      ctx.save();
      ctx.scale(sgn, 1);
      ctx.strokeStyle = metalDark;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(-5, -3, 3.2, Math.PI * 0.9, Math.PI * 2.4);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.ellipse(0, 1, 5.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = metalLit;
    ctx.beginPath();
    ctx.ellipse(-1.6, -1, 2.2, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = metalDark; // nostril studs
    ctx.beginPath();
    ctx.arc(-1.8, 4.5, 0.9, 0, Math.PI * 2);
    ctx.arc(1.8, 4.5, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

/**
 * Procedural King sprite — the Throne Room boss (Kael, the Usurper King): a
 * crowned, ermine-collared figure in a long royal robe holding an orbed scepter,
 * scaled up to boss size. Like the other enemy sprites it has three authored
 * views ('side' profile mirrored on `faceLeft`, 'front' toward the viewer,
 * 'back' away) and a `phase` (radians) walk cadence advanced from distance
 * travelled. `sit` (0..1) blends the pose from walking (0) to seated on the
 * throne (1): the robe pools into a lap, the stride and foot-shuffle fade, and
 * the figure sinks — used to play a smooth rise as the king gets up to walk.
 */
export function drawKing(
  ctx: CanvasRenderingContext2D,
  color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  phase: number,
  sit: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view === 'side' && faceLeft) ctx.scale(-1, 1);
  ctx.scale(1.7, 1.7); // boss-sized

  const robe = color;
  const robeLit = shade(color, 0.18);
  const robeDark = shade(color, -0.3);
  const gold = '#e7b64a';
  const goldDark = '#a97e26';
  const fur = '#efe9dc';
  const furDark = '#c9c2b2';
  const skin = '#e8c39c';
  const boot = '#2f2620';

  const walk = 1 - sit;
  const swing = Math.sin(phase) * walk;
  const bob = Math.abs(Math.sin(phase)) * walk;
  const slump = sit * 1.5; // sinks into the throne when seated
  const back = view === 'back';
  const side = view === 'side';

  ctx.translate(0, slump - bob * 0.8);

  // Cape behind the figure — pools wider when seated.
  ctx.fillStyle = robeDark;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.quadraticCurveTo(10, -4, 9 + sit * 3, 13);
  ctx.lineTo(-9 - sit * 3, 13);
  ctx.quadraticCurveTo(-10, -4, 0, -9);
  ctx.closePath();
  ctx.fill();

  // Feet peeking at the hem while walking (hidden as he sits).
  if (!back && walk > 0.05) {
    const lift = 2.2 * walk;
    const lL = Math.max(0, swing) * lift;
    const lR = Math.max(0, -swing) * lift;
    ctx.fillStyle = boot;
    ctx.beginPath();
    if (side) {
      ctx.ellipse(2.4 + swing * 1.4, 13.2 - lL, 2.4, 1.2, 0, 0, Math.PI * 2);
      ctx.ellipse(-1.6 - swing * 1.4, 13.2 - lR, 2.2, 1.1, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(-2.6, 13.2 - lL, 1.8, 1.3, 0, 0, Math.PI * 2);
      ctx.ellipse(2.6, 13.2 - lR, 1.8, 1.3, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // Robe — a long bell; the hem lifts into a lap as he sits.
  const hemW = 8 + sit * 3;
  const lapY = 13 - sit * 4;
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.quadraticCurveTo(8, -5, hemW, lapY);
  ctx.quadraticCurveTo(0, lapY + sit * 2, -hemW, lapY);
  ctx.quadraticCurveTo(-8, -5, 0, -9);
  ctx.closePath();
  ctx.fill();
  // Lit front fold.
  ctx.fillStyle = robeLit;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.quadraticCurveTo(4, -5, 3, lapY - 1);
  ctx.quadraticCurveTo(0, lapY, -0.5, lapY - 1);
  ctx.quadraticCurveTo(0, -6, 0, -9);
  ctx.closePath();
  ctx.fill();
  // Gold hem trim.
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(hemW, lapY);
  ctx.quadraticCurveTo(0, lapY + sit * 2, -hemW, lapY);
  ctx.stroke();
  // Seated lap shelf (draped knees) fades in with sit.
  if (sit > 0.05) {
    ctx.globalAlpha = sit;
    ctx.fillStyle = robeLit;
    ctx.beginPath();
    ctx.ellipse(0, lapY - 2, hemW * 0.9, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Ermine fur collar across the shoulders.
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(0, -8, 7, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = furDark;
  for (const fx of [-4, -1.3, 1.3, 4]) {
    ctx.beginPath();
    ctx.arc(fx, -7.4, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head.
  if (!back) {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -12.5, 3.6, 0, Math.PI * 2);
    ctx.fill();
    // Beard.
    ctx.fillStyle = '#d9d2c4';
    ctx.beginPath();
    ctx.moveTo(-2.6, -11.5);
    ctx.quadraticCurveTo(0, -6.5, 2.6, -11.5);
    ctx.quadraticCurveTo(0, -10.5, -2.6, -11.5);
    ctx.closePath();
    ctx.fill();
    // Eyes (both from the front, one in profile).
    ctx.fillStyle = '#2a2230';
    ctx.beginPath();
    if (side) {
      ctx.arc(1.6, -12.8, 0.6, 0, Math.PI * 2);
    } else {
      ctx.arc(-1.4, -12.8, 0.6, 0, Math.PI * 2);
      ctx.arc(1.4, -12.8, 0.6, 0, Math.PI * 2);
    }
    ctx.fill();
  } else {
    ctx.fillStyle = shade(skin, -0.25); // back of the head
    ctx.beginPath();
    ctx.arc(0, -12.5, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crown — a gold band with zig-zag points and jewels.
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(-4.4, -15);
  ctx.lineTo(4.4, -15);
  ctx.lineTo(4.4, -16.2);
  ctx.lineTo(2.6, -18.4);
  ctx.lineTo(1.3, -16.4);
  ctx.lineTo(0, -19);
  ctx.lineTo(-1.3, -16.4);
  ctx.lineTo(-2.6, -18.4);
  ctx.lineTo(-4.4, -16.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = goldDark;
  ctx.fillRect(-4.4, -15.4, 8.8, 0.9);
  ctx.fillStyle = '#e7443f'; // centre jewel
  ctx.beginPath();
  ctx.arc(0, -18.6, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4fa3e0'; // side jewels
  ctx.beginPath();
  ctx.arc(2.6, -18.2, 0.6, 0, Math.PI * 2);
  ctx.arc(-2.6, -18.2, 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Orbed scepter in the near hand (not drawn from behind).
  if (!back) {
    const hx = 6.3;
    arm(ctx, 3.4, -6.6, hx - 0.4, -3, { sleeve: robeDark, hand: skin, w: 2.6, cuff: fur }, 1);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(hx, -9);
    ctx.lineTo(hx, -1);
    ctx.stroke();
    ctx.fillStyle = '#e7443f';
    ctx.beginPath();
    ctx.arc(hx, -10.4, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(hx, -12, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Procedural Captain sprite — Captain Aldric, the Stage 1 boss and commander of
 * the knight company: a plate-armoured officer in a gold-trimmed cuirass with a
 * plumed helm, a royal cape and a raised longsword leading the charge. Scaled up
 * a touch (≈1.28×) so he reads as a heavier, grander figure than the rank-and-file
 * grunt/sergeant he leads. Like the other enemy sprites he has three authored
 * views ('side' profile mirrored on `faceLeft` — walking along a row; 'front'
 * marching toward the viewer — walking down; 'back' marching away — walking up)
 * and a `phase` (radians) walk cadence advanced from distance travelled. Replaces
 * the emoji token for `boss1`.
 */
export function drawCaptain(
  ctx: CanvasRenderingContext2D,
  color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  phase: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view === 'side' && faceLeft) ctx.scale(-1, 1);
  ctx.scale(1.28, 1.28); // a shade larger than the grunts he commands

  const armorLit = shade(color, 0.2);
  const armorDark = shade(color, -0.32);
  const steel = '#c9d2dc';
  const steelDark = '#8b95a3';
  const skin = '#e8c39c';
  const gold = '#e7b64a';
  const goldDark = '#a97e26';
  const plume = '#f0f3f8'; // officer's white horsehair crest
  const plumeDark = '#c3cad6';
  const cape = '#33509e'; // knight-company royal blue
  const capeDark = shade(cape, -0.3);
  const gauntlet = '#a4aeba';
  // An officer in full plate: steel greaves with gold-edged knee cops.
  const legs: LegLook = { cloth: '#34303a', boot: '#7a8492', w: 3.9, bootUp: 0.8, knee: gold, toe: 3.2 };

  const bob = Math.abs(Math.sin(phase));

  if (view === 'side') {
    // --- Profile (walking along the row) ---
    // Cape streaming off the rear shoulder, trailing behind the march.
    capeSide(ctx, -1.2, -7.6, 16.4, 7.4, cape, bob, gold);

    walkLegsSide(ctx, phase, { hipY: 3, footY: 12, stride: 4.2, look: legs });

    ctx.save();
    ctx.translate(0, -bob * 1.2);

    // Raised longsword, cocked back over the shoulder leading the advance.
    ctx.strokeStyle = steel;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(3, -6);
    ctx.lineTo(15, -20);
    ctx.stroke();
    ctx.strokeStyle = '#eef3f8'; // edge highlight
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(3.6, -6.6);
    ctx.lineTo(14.6, -19.4);
    ctx.stroke();
    ctx.strokeStyle = gold; // crossguard
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(1.2, -3.6);
    ctx.lineTo(5, -8);
    ctx.stroke();
    ctx.fillStyle = gold; // pommel
    ctx.beginPath();
    ctx.arc(1.8, -3, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Mail skirt under a broad gold-trimmed cuirass.
    ctx.fillStyle = steelDark;
    ctx.beginPath();
    ctx.ellipse(0, 5.4, 5.6, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    torsoSide(ctx, {
      color, lit: armorLit, dark: armorDark,
      top: -9, waistY: 0.2, hemY: 4.8, chest: 6, back: 5.6, waist: 4.4, hemF: 5.8, hemB: 6,
    });
    belt(ctx, -5.2, 5.6, 1, goldDark, gold, 1, 1.6, 3.6);
    ctx.strokeStyle = gold; // breastplate ridge
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(3.6, -7.6);
    ctx.quadraticCurveTo(5.6, -3.6, 4.4, 0.4);
    ctx.stroke();
    // Sword arm: gauntlet closed on the hilt.
    arm(ctx, 0.6, -6.6, 2.6, -4.4, { sleeve: armorDark, hand: gauntlet, w: 3, cuff: gold }, 1.4);
    pauldron(ctx, 1.8, -7, 3.8, gold, -0.2);

    // Head + tall crested helm with a swept-back white plume.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(2, -11.4, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = steel; // helm dome
    ctx.beginPath();
    ctx.moveTo(-2.4, -11.6);
    ctx.quadraticCurveTo(-2.8, -17.4, 2, -17.4);
    ctx.quadraticCurveTo(5.8, -17.4, 5.6, -11.6);
    ctx.quadraticCurveTo(2, -13.2, -2.4, -11.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = gold; // gold brow band
    ctx.fillRect(-2.4, -12.6, 8, 1.2);
    ctx.fillStyle = steelDark; // visor slit
    ctx.fillRect(1.4, -13, 4.2, 1);
    drawProfileFace(ctx, 2, -11.4, 3.4, skin, { eyeY: 1.0, brow: null });
    // Crest holder + horsehair plume flowing back off the crown.
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.ellipse(1.6, -17.6, 2, 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = plume;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(1.6, -18);
    ctx.quadraticCurveTo(-4, -20, -8, -14.5);
    ctx.stroke();
    ctx.strokeStyle = plumeDark;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(1.4, -18.2);
    ctx.quadraticCurveTo(-4, -19, -7.4, -14.8);
    ctx.stroke();

    // Kite shield on the front arm, blazoned with a gold company cross.
    ctx.save();
    ctx.translate(6, 0.8);
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.quadraticCurveTo(4.4, -5.5, 4.4, 1);
    ctx.quadraticCurveTo(4.4, 6.6, 0, 9.6);
    ctx.quadraticCurveTo(-4.4, 6.6, -4.4, 1);
    ctx.quadraticCurveTo(-4.4, -5.5, 0, -6.5);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = gold;
    ctx.stroke();
    ctx.strokeStyle = gold; // cross emblem
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -4.2);
    ctx.lineTo(0, 6.4);
    ctx.moveTo(-3.2, 1);
    ctx.lineTo(3.2, 1);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Front / back (marching toward or away from the viewer) ---
  const back = view === 'back';
  walkLegsFront(ctx, phase, { hipY: 3.6, footY: 12, sep: 3, look: legs, back, lift: 2.8 });

  ctx.save();
  ctx.translate(0, -bob * 1);

  if (back) {
    // Full royal cape draped down the back, gold-trimmed with a centre seam.
    ctx.fillStyle = cape;
    ctx.beginPath();
    ctx.moveTo(0, -9.5);
    ctx.quadraticCurveTo(9.4, -6, 8.4, 9.5);
    ctx.quadraticCurveTo(0, 11, -8.4, 9.5);
    ctx.quadraticCurveTo(-9.4, -6, 0, -9.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = capeDark; // fold shadows
    ctx.beginPath();
    ctx.moveTo(-3, -6);
    ctx.quadraticCurveTo(-2, 2, -3.6, 10);
    ctx.lineTo(-1.6, 10.3);
    ctx.quadraticCurveTo(-1, 2, -3, -6);
    ctx.moveTo(3, -6);
    ctx.quadraticCurveTo(2, 2, 3.6, 10);
    ctx.lineTo(1.6, 10.3);
    ctx.quadraticCurveTo(1, 2, 3, -6);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8.4, 9.5);
    ctx.quadraticCurveTo(0, 11, 8.4, 9.5);
    ctx.stroke();
  } else {
    // Cape edges flaring out past both shoulders.
    ctx.fillStyle = capeDark;
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.quadraticCurveTo(-11.4, -2, -9, 9);
    ctx.lineTo(-5, 7);
    ctx.quadraticCurveTo(-6, -2, -6, -8);
    ctx.closePath();
    ctx.moveTo(6, -8);
    ctx.quadraticCurveTo(11.4, -2, 9, 9);
    ctx.lineTo(5, 7);
    ctx.quadraticCurveTo(6, -2, 6, -8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = steelDark; // mail skirt
    ctx.beginPath();
    ctx.ellipse(0, 5.6, 6, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    torsoFront(ctx, {
      color, lit: armorLit, dark: armorDark,
      top: -9.5, waistY: 0.4, hemY: 5, shoulder: 7.2, waist: 5, hem: 6.2,
    });
    ctx.strokeStyle = gold; // sternum ridge
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 0.6);
    ctx.stroke();
    belt(ctx, -5, 5, 1.2, goldDark, gold, 1, 1.6);
  }

  // Gold-capped pauldrons on both shoulders.
  pauldron(ctx, -7, -6.4, 3.4, gold, -0.25);
  pauldron(ctx, 7, -6.4, 3.4, gold, 0.25);

  // Raised longsword held upright on the near side (tip poking up from behind).
  ctx.strokeStyle = steel;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(7.4, -20);
  ctx.lineTo(7.4, back ? -6 : 6);
  ctx.stroke();
  ctx.strokeStyle = '#eef3f8';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(6.9, -19.5);
  ctx.lineTo(6.9, back ? -6 : 5);
  ctx.stroke();
  if (!back) {
    ctx.strokeStyle = gold; // crossguard + pommel toward the viewer
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(4.6, 1);
    ctx.lineTo(10.2, 1);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(7.4, 6.6, 1.2, 0, Math.PI * 2);
    ctx.fill();
    arm(ctx, 6.6, -5.4, 7.4, 3.6, { sleeve: armorDark, hand: gauntlet, w: 3, cuff: gold }, 0.6);
  }

  // Head — face + crested helm toward us; a full detailed helm from behind so
  // it doesn't thin out to a cap, still capped by the gold brow band and crest.
  if (back) {
    drawBackHelm(ctx, -12.6, 4.7, steel, steelDark, skin);
    ctx.fillStyle = gold; // gold brow band wrapping the back
    ctx.fillRect(-4.4, -11.4, 8.8, 1.3);
  } else {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -11.4, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = steel; // helm dome
    ctx.beginPath();
    ctx.arc(0, -12.4, 4.4, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = steel;
    ctx.fillRect(-4.4, -12.4, 8.8, 2.4);
    ctx.fillStyle = gold; // gold brow band
    ctx.fillRect(-4.4, -11.4, 8.8, 1.3);
    ctx.fillStyle = steelDark; // visor slit + eyes
    ctx.fillRect(-3.4, -12.8, 6.8, 1.1);
    ctx.fillStyle = '#2a2230';
    ctx.beginPath();
    ctx.arc(-1.6, -10.4, 0.7, 0, Math.PI * 2);
    ctx.arc(1.6, -10.4, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  // Crest holder + white plume rising over the crown and flopping back.
  ctx.fillStyle = gold;
  ctx.fillRect(-1, -18.6, 2, 3.4);
  ctx.strokeStyle = plume;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(0, -18.4);
  ctx.quadraticCurveTo(back ? 1 : -1, -21.4, back ? 4.5 : -4.5, -17.5);
  ctx.stroke();
  ctx.strokeStyle = plumeDark;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, -18.6);
  ctx.quadraticCurveTo(back ? 1 : -1, -20.8, back ? 4 : -4, -17.6);
  ctx.stroke();

  ctx.restore();
  ctx.restore();
}

/**
 * Procedural Captain Roland sprite — the Capital's first boss, captain of
 * Squadron 8: a bare-headed knight in pale plate with long golden hair, riding
 * a dark bay warhorse in a steel chanfron and a navy caparison blazoned with the
 * squadron's gold eight-pointed star, a couched lance flying a swallowtail
 * pennant. Scaled ≈1.3× like the other champions of the court. Three authored
 * views ('side' profile mirrored on `faceLeft`; 'front' charging toward the
 * viewer; 'back' riding away, the hair falling down his back), with `phase`
 * (radians, from distance travelled) driving the gallop. Replaces the emoji
 * token for `boss6`.
 */
export function drawRoland(
  ctx: CanvasRenderingContext2D,
  color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  phase: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view === 'side' && faceLeft) ctx.scale(-1, 1);
  ctx.scale(1.3, 1.3);

  const plateLit = shade(color, 0.2);
  const plateDark = shade(color, -0.3);
  const steel = '#d6dde6';
  const steelDark = '#8b95a3';
  const gold = '#e7b64a';
  const goldDark = '#a97e26';
  const hair = '#e9c45a';
  const hairLit = '#f8e09a';
  const hairDark = '#b8892c';
  const skin = '#ecc8a2';
  const coat = '#6e4128'; // dark bay warhorse
  const coatLit = shade(coat, 0.2);
  const coatDark = shade(coat, -0.3);
  const mane = '#22160f';
  const hoof = '#1e1610';
  const cloth = '#25397a'; // Squadron 8 navy
  const clothLit = shade(cloth, 0.18);
  const clothDark = shade(cloth, -0.3);
  const wood = '#8a6a44';
  const gauntlet = '#a4aeba';
  const legs: LegLook = { cloth: plateDark, boot: steelDark, w: 2.9, bootUp: 0.7, knee: gold, toe: 2.4 };

  const step = Math.sin(phase);
  const bob = Math.abs(step);
  const wave = Math.sin(phase * 2) * 0.8; // hair and pennant ripple

  /** The squadron's eight-pointed gold star. */
  const star8 = (cx: number, cy: number, r: number) => {
    ctx.fillStyle = gold;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  };
  /** A swallowtail pennant hanging off a lance at (x,y), streaming toward `dir`. */
  const pennant = (x: number, y: number, dir: number, len: number) => {
    const w = wave;
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dir * len * 0.5, y - 0.6 + w, x + dir * len, y + 0.4 + w);
    ctx.lineTo(x + dir * len * 0.7, y + 1.8 + w * 0.6);
    ctx.lineTo(x + dir * len, y + 3.4 + w);
    ctx.quadraticCurveTo(x + dir * len * 0.5, y + 3 + w * 0.5, x, y + 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y + 1.6);
    ctx.quadraticCurveTo(x + dir * len * 0.4, y + 1.4 + w * 0.5, x + dir * len * 0.62, y + 1.8 + w * 0.6);
    ctx.stroke();
  };
  /** A scalloped cloth hem from x0 to x1 along y (the caparison's edge). */
  const scallops = (x0: number, x1: number, y: number, n: number) => {
    const d = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const a = x0 + d * i;
      ctx.quadraticCurveTo(a + d / 2, y + 1.6, a + d, y);
    }
  };
  /** A lance standing upright at x from y0 (butt) to its tip, pennant flying. */
  const uprightLance = (x: number, y0: number, dir: number) => {
    seg(ctx, x, y0, x, -30, 0.85, 0.7, wood);
    ctx.fillStyle = steel; // tip
    ctx.beginPath();
    ctx.moveTo(x - 0.9, -30);
    ctx.lineTo(x, -34.5);
    ctx.lineTo(x + 0.9, -30);
    ctx.closePath();
    ctx.fill();
    pennant(x, -29.4, dir, 7);
  };

  if (view === 'side') {
    // --- Profile (galloping along the row, +x forward) ---
    const f = Math.cos(phase) * 3.6;
    const b = Math.cos(phase + Math.PI) * 3.6;
    const up = step;
    const horseLeg = (x0: number, d: number, lift: number, front: boolean, c: string) => {
      const hx = x0 + d;
      const hy = 12 - lift;
      const kx = x0 + d * 0.45 + (front ? 1 : -1) * (0.4 + lift * 0.9);
      const ky = 7 - lift * 0.5;
      seg(ctx, x0, 1, kx, ky, 2.3, 1.2, c);
      seg(ctx, kx, ky, hx, hy - 1, 1.2, 0.95, c);
      // Feathering over the hoof (a heavy warhorse).
      seg(ctx, hx, hy - 2.2, hx + (front ? 0.2 : -0.1), hy - 0.6, 1.05, 1.35, shade(c, -0.15));
      ctx.fillStyle = hoof;
      ctx.beginPath();
      ctx.ellipse(hx + (front ? 0.3 : -0.1), hy - 0.4, 1.4, 1, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const farCoat = shade(coatDark, -0.12);
    horseLeg(-5, -b, Math.max(0, -up) * 1.9, false, farCoat);
    horseLeg(8.5, -f, Math.max(0, up) * 1.9, true, farCoat);
    horseLeg(-7.5, b, Math.max(0, up) * 1.9, false, coatDark);
    horseLeg(6, f, Math.max(0, -up) * 1.9, true, coatDark);

    ctx.save();
    ctx.translate(0, -bob * 0.7);

    // Tail streaming off the rump.
    ctx.strokeStyle = mane;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-12, -2.6);
    ctx.quadraticCurveTo(-17.5, -2 + wave, -16.5, 7);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-12.6, -2);
    ctx.quadraticCurveTo(-15.8, 1, -18, 5 + wave);
    ctx.stroke();

    // Barrel.
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12.6, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Arched neck + head reaching forward, mane down the crest.
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.moveTo(7, -3.6);
    ctx.quadraticCurveTo(11.5, -8, 13.6, -12.6);
    ctx.lineTo(17.6, -12.2);
    ctx.quadraticCurveTo(19.6, -8.6, 17.6, -6.4);
    ctx.lineTo(14, -5.4);
    ctx.quadraticCurveTo(11.6, -3, 9.6, -0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = coatLit;
    ctx.beginPath();
    ctx.ellipse(11.6, -6.4, 1.6, 3.2, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = mane;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(7.6, -5);
    ctx.quadraticCurveTo(11.4, -8.8, 13.8, -12.6);
    ctx.stroke();
    ctx.fillStyle = coatDark; // ear
    ctx.beginPath();
    ctx.moveTo(14, -12.4);
    ctx.lineTo(13.4, -15.8);
    ctx.lineTo(15.8, -12.8);
    ctx.closePath();
    ctx.fill();
    // Chanfron: a steel face plate with a gold crest spike.
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.moveTo(14.6, -12.4);
    ctx.lineTo(17.8, -12);
    ctx.quadraticCurveTo(19.4, -9, 18.4, -7.6);
    ctx.lineTo(16.6, -8.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(15.4, -12.3);
    ctx.lineTo(16.4, -14.6);
    ctx.lineTo(16.8, -12.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a1210'; // eye + nostril
    ctx.beginPath();
    ctx.arc(15.6, -10.2, 0.75, 0, Math.PI * 2);
    ctx.arc(18.2, -6.9, 0.45, 0, Math.PI * 2);
    ctx.fill();
    // Reins back to the rider's hidden bridle hand.
    ctx.strokeStyle = '#3a2416';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(17.4, -6.8);
    ctx.quadraticCurveTo(11, -7, 4.6, -9.6);
    ctx.stroke();

    // Caparison draped over the barrel: navy, scalloped, gold-edged, starred.
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(-12.8, 4.6);
    ctx.lineTo(-12.6, -2.2);
    ctx.quadraticCurveTo(-9, -6.9, 0, -6.9);
    ctx.quadraticCurveTo(7, -6.7, 9.6, -2.6);
    ctx.lineTo(10.2, 4);
    scallops(10.2, -12.8, 4.3, 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = clothLit;
    ctx.beginPath();
    ctx.ellipse(-1, -4.4, 8.5, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = clothDark;
    ctx.fillRect(-12.4, 2, 22.4, 2.2);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(10.2, 4);
    scallops(10.2, -12.8, 4.3, 7);
    ctx.stroke();
    star8(-4.6, -0.6, 2.6);

    // --- Rider ---
    ctx.fillStyle = '#5a3a20'; // saddle cantle + pommel
    ctx.beginPath();
    ctx.ellipse(-4.2, -8, 1.3, 2, -0.3, 0, Math.PI * 2);
    ctx.ellipse(3.6, -7.6, 1, 1.4, 0.3, 0, Math.PI * 2);
    ctx.fill();
    capeSide(ctx, -1.8, -15, 8.4, 5, cloth, bob, gold);
    // Long golden hair streaming back off the crown.
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(-1.4, -21.8);
    ctx.quadraticCurveTo(-6.2, -21.4, -7.8, -16.4);
    ctx.quadraticCurveTo(-9.6, -12.6 + wave, -12, -11 + wave);
    ctx.quadraticCurveTo(-8.6, -10.8, -6.6, -12.2);
    ctx.quadraticCurveTo(-6, -9.8, -3.6, -9.4);
    ctx.quadraticCurveTo(-2.4, -12.6, -1, -15.6);
    ctx.lineTo(2.6, -17.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hairDark;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-3, -20);
    ctx.quadraticCurveTo(-7, -16, -10.6, -11.4 + wave);
    ctx.moveTo(-1.8, -17);
    ctx.quadraticCurveTo(-4.4, -13, -4.4, -10.2);
    ctx.stroke();
    ctx.strokeStyle = hairLit;
    ctx.beginPath();
    ctx.moveTo(-2.4, -21.2);
    ctx.quadraticCurveTo(-6, -19.6, -7, -15.4);
    ctx.stroke();

    legSide(ctx, -0.2, -8.2, 2.4, -0.4, legs, 2);
    ctx.strokeStyle = steelDark; // stirrup
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(1.4, -3.4);
    ctx.lineTo(1.2, -0.2);
    ctx.lineTo(4.4, -0.2);
    ctx.stroke();
    torsoSide(ctx, {
      color, lit: plateLit, dark: plateDark,
      top: -16.2, waistY: -10.8, hemY: -7, chest: 4.8, back: 4.2, waist: 3.4, hemF: 4.8, hemB: 5,
    });
    belt(ctx, -4.2, 4.4, -9.8, goldDark, gold, 0.6, 1.1, 2.6);
    ctx.strokeStyle = gold; // breastplate ridge
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(3.2, -15);
    ctx.quadraticCurveTo(4.8, -12.6, 3.8, -10.6);
    ctx.stroke();
    // Gorget, head, golden crown of hair and a thin gold circlet.
    ctx.fillStyle = steelDark;
    ctx.beginPath();
    ctx.ellipse(0.6, -16.2, 2.6, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(1, -19.2, 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(-2.2, -18.2);
    ctx.quadraticCurveTo(-2.8, -22.8, 1, -22.8);
    ctx.quadraticCurveTo(4.4, -22.6, 4.4, -19.8);
    ctx.quadraticCurveTo(2.8, -21, 1.4, -20.6);
    ctx.quadraticCurveTo(0, -19.4, -0.4, -16.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hairLit;
    ctx.beginPath();
    ctx.ellipse(0.4, -22, 2, 0.6, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-1.8, -20.9);
    ctx.quadraticCurveTo(1.2, -21.6, 4.1, -21);
    ctx.stroke();
    drawProfileFace(ctx, 1, -19.2, 3.1, skin, { eyeY: 0.5, brow: hairDark });

    // Couched lance under the arm, pennant flying back off the tip.
    seg(ctx, -7, -9.8, 21, -16, 0.9, 0.7, wood);
    ctx.fillStyle = steel; // tip
    ctx.beginPath();
    ctx.moveTo(20.8, -16.9);
    ctx.lineTo(26.2, -17.2);
    ctx.lineTo(21.2, -15.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = steelDark; // vamplate guarding the hand
    ctx.beginPath();
    ctx.moveTo(4.6, -14.2);
    ctx.quadraticCurveTo(6.4, -12.4, 5.6, -10.2);
    ctx.lineTo(7.8, -12.6);
    ctx.closePath();
    ctx.fill();
    pennant(19.4, -16.2, -1, 7.5);
    arm(ctx, 0.4, -14, 3.8, -11.6, { sleeve: plateDark, hand: gauntlet, w: 2.6, cuff: gold }, 1.4);
    pauldron(ctx, 0.2, -14.6, 3.2, steel, -0.2);

    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Front / back (charging toward or riding away from the viewer) ---
  const back = view === 'back';
  for (const [lx, lift] of [[-5.6, Math.max(0, step) * 2.2], [5.6, Math.max(0, -step) * 2.2]] as const) {
    seg(ctx, lx, 2, lx * 1.04, 7 - lift * 0.5, 2.3, 1.3, coatDark);
    seg(ctx, lx * 1.04, 7 - lift * 0.5, lx, 10.6 - lift, 1.3, 1.05, coatDark);
    seg(ctx, lx, 9.6 - lift, lx, 11 - lift, 1.1, 1.4, shade(coatDark, -0.15));
    ctx.fillStyle = hoof;
    ctx.beginPath();
    ctx.ellipse(lx, 11.6 - lift, 1.5, 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // The rider rides up and down with the gallop.
  const ry = -bob * 0.8;
  const lanceX = back ? -9.6 : 9.6;
  ctx.save();
  ctx.translate(0, ry);
  // Plated legs hanging either side of the horse.
  legFront(ctx, -7.4, -8.4, -8.4, 1, legs, back);
  legFront(ctx, 7.4, -8.4, 8.4, 1, legs, back);
  if (!back) {
    // Hair falling behind the shoulders, framing the head.
    ctx.fillStyle = hairDark;
    ctx.beginPath();
    ctx.moveTo(-4.2, -22);
    ctx.quadraticCurveTo(-6.2, -17, -5.8, -12.6);
    ctx.lineTo(5.8, -12.6);
    ctx.quadraticCurveTo(6.2, -17, 4.2, -22);
    ctx.closePath();
    ctx.fill();
  } else {
    // Short navy cape over the back.
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(-5.4, -17.2);
    ctx.quadraticCurveTo(-7.2, -12, -6.6, -7.4);
    ctx.quadraticCurveTo(0, -6.4, 6.6, -7.4);
    ctx.quadraticCurveTo(7.2, -12, 5.4, -17.2);
    ctx.closePath();
    ctx.fill();
  }
  torsoFront(ctx, {
    color, lit: plateLit, dark: plateDark,
    top: -17.6, waistY: -11.2, hemY: -7.4, shoulder: 6, waist: 4.2, hem: 5.4,
    back, seam: plateDark,
  });
  if (back) {
    ctx.fillStyle = cloth; // cape panel down the spine, gold-edged
    ctx.beginPath();
    ctx.moveTo(-4, -17);
    ctx.quadraticCurveTo(-4.6, -12, -4.4, -7.6);
    ctx.quadraticCurveTo(0, -6.8, 4.4, -7.6);
    ctx.quadraticCurveTo(4.6, -12, 4, -17);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-4.4, -7.6);
    ctx.quadraticCurveTo(0, -6.8, 4.4, -7.6);
    ctx.stroke();
  } else {
    ctx.strokeStyle = gold; // sternum ridge
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, -15.6);
    ctx.lineTo(0, -10.6);
    ctx.stroke();
  }
  pauldron(ctx, -6.2, -15.6, 3, steel, -0.25);
  pauldron(ctx, 6.2, -15.6, 3, steel, 0.25);

  // Head.
  ctx.fillStyle = steelDark; // gorget
  ctx.beginPath();
  ctx.ellipse(0, -17.4, 2.8, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (back) {
    // Back of the head: a little nape, then the long hair spilling down the back.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -19.6, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(-3.6, -21.6);
    ctx.arc(0, -21, 3.7, Math.PI * 1.05, Math.PI * 1.95);
    ctx.quadraticCurveTo(5.4, -16, 4.6 + wave * 0.3, -10.6);
    ctx.quadraticCurveTo(2.4, -9.6, 0, -10.2);
    ctx.quadraticCurveTo(-2.4, -9.6, -4.6 + wave * 0.3, -10.6);
    ctx.quadraticCurveTo(-5.4, -16, -3.6, -21.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hairDark;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const sx of [-2.4, 0, 2.4]) {
      ctx.moveTo(sx * 0.6, -22.6);
      ctx.quadraticCurveTo(sx * 1.3, -16, sx * 1.1, -10.6);
    }
    ctx.stroke();
    ctx.strokeStyle = hairLit;
    ctx.beginPath();
    ctx.moveTo(-1.6, -23.8);
    ctx.quadraticCurveTo(-3.4, -19, -3, -14);
    ctx.stroke();
    ctx.strokeStyle = gold; // circlet round the back of the head
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-3.6, -21.6);
    ctx.quadraticCurveTo(0, -20.6, 3.6, -21.6);
    ctx.stroke();
  } else {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -20.4, 3.2, 0, Math.PI * 2);
    ctx.fill();
    // Crown of hair, parted in the middle, locks falling past the jaw.
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(-3.6, -19.6);
    ctx.quadraticCurveTo(-3.8, -24.4, 0, -24.2);
    ctx.quadraticCurveTo(3.8, -24.4, 3.6, -19.6);
    ctx.quadraticCurveTo(2.6, -21.8, 0.4, -22.2);
    ctx.lineTo(0, -21.2);
    ctx.lineTo(-0.4, -22.2);
    ctx.quadraticCurveTo(-2.6, -21.8, -3.6, -19.6);
    ctx.closePath();
    ctx.fill();
    seg(ctx, -3.3, -20.4, -4.4, -14.2, 1.2, 0.9, hair);
    seg(ctx, 3.3, -20.4, 4.4, -14.2, 1.2, 0.9, hair);
    ctx.fillStyle = hairLit;
    ctx.beginPath();
    ctx.ellipse(-1.6, -23.2, 1.4, 0.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gold; // circlet
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-3.4, -21.6);
    ctx.quadraticCurveTo(0, -22.6, 3.4, -21.6);
    ctx.stroke();
    // Face: brows, eyes, mouth.
    ctx.strokeStyle = hairDark;
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(-2, -20.6);
    ctx.lineTo(-0.6, -20.4);
    ctx.moveTo(0.6, -20.4);
    ctx.lineTo(2, -20.6);
    ctx.stroke();
    ctx.fillStyle = '#24161a';
    ctx.beginPath();
    ctx.arc(-1.3, -19.7, 0.55, 0, Math.PI * 2);
    ctx.arc(1.3, -19.7, 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(skin, -0.4);
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(-0.7, -18);
    ctx.lineTo(0.7, -18);
    ctx.stroke();
  }
  ctx.restore();

  if (back) {
    // Hindquarters under a starred caparison, tail through the crupper.
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(0, -0.4, 9.6, 8.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(-10, 5.6);
    ctx.quadraticCurveTo(-11, -6.4, 0, -8.8);
    ctx.quadraticCurveTo(11, -6.4, 10, 5.6);
    scallops(10, -10, 5.8, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = clothDark;
    ctx.beginPath();
    ctx.ellipse(0, 3.6, 9.4, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(10, 5.6);
    scallops(10, -10, 5.8, 6);
    ctx.stroke();
    star8(-5, -1, 2.2);
    star8(5, -1, 2.2);
    ctx.strokeStyle = mane;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(0, -6.4);
    ctx.quadraticCurveTo(1.6 + wave, 2, 0.4, 10);
    ctx.stroke();
  } else {
    // Chest under the caparison's front panel, then the armoured head.
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(0, 1, 7.8, 7.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(-8.4, 6);
    ctx.quadraticCurveTo(-9, -3.4, -4, -4.6);
    ctx.lineTo(4, -4.6);
    ctx.quadraticCurveTo(9, -3.4, 8.4, 6);
    scallops(8.4, -8.4, 6.2, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = clothLit;
    ctx.beginPath();
    ctx.ellipse(-2.6, -1.4, 2.4, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(8.4, 6);
    scallops(8.4, -8.4, 6.2, 5);
    ctx.stroke();
    star8(0, 1.6, 2.6);
    // Neck + head.
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(0, -5, 3.4, 3.6, 0, 0, Math.PI * 2);
    ctx.ellipse(0, -8.4, 3.6, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = coatDark; // ears
    for (const ex of [-2.8, 2.8]) {
      ctx.beginPath();
      ctx.moveTo(ex, -11.8);
      ctx.lineTo(ex * 1.3, -15.2);
      ctx.lineTo(ex * 0.35, -12.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = steel; // chanfron down the face
    ctx.beginPath();
    ctx.moveTo(-2.4, -12.4);
    ctx.lineTo(2.4, -12.4);
    ctx.lineTo(1.4, -6.2);
    ctx.lineTo(-1.4, -6.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(-0.7, -12.4);
    ctx.lineTo(0, -14.8);
    ctx.lineTo(0.7, -12.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = coat; // muzzle below the plate
    ctx.beginPath();
    ctx.ellipse(0, -5.4, 2.4, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1210'; // eyes + nostrils
    ctx.beginPath();
    ctx.arc(-2.7, -9.6, 0.7, 0, Math.PI * 2);
    ctx.arc(2.7, -9.6, 0.7, 0, Math.PI * 2);
    ctx.arc(-1, -5, 0.5, 0, Math.PI * 2);
    ctx.arc(1, -5, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = mane; // forelock spilling over the plate's top
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -13.2);
    ctx.lineTo(-0.8, -11.6);
    ctx.stroke();
  }

  // Lance held upright, the gauntlet closed on it.
  ctx.save();
  ctx.translate(0, ry);
  uprightLance(lanceX, 3, back ? 1 : -1);
  arm(ctx, back ? -6 : 6, -15.4, lanceX, -11.6, { sleeve: plateDark, hand: gauntlet, w: 2.6, cuff: gold }, back ? -0.8 : 0.8);
  ctx.restore();

  ctx.restore();
}

/**
 * Procedural Mercenary sprite — Garrick Vane, the Stage 2 boss: a hardened
 * veteran sellsword in the king's pay who scorns armour and fights on pure skill
 * — bare, battle-scarred torso, a leather baldric, forearm wraps, a red war-band
 * over grizzled features, and a well-worn longsword carried in an easy ready
 * guard. Still a shade larger than the grunts (≈1.3×) and coldly intimidating.
 * Like the other enemy sprites he has three authored views ('side' profile
 * mirrored on `faceLeft` — walking a row; 'front' toward the viewer — walking
 * down; 'back' away — walking up) and a `phase` (radians) walk cadence advanced
 * from distance travelled. Replaces the emoji token for `boss2`.
 */
export function drawMercenary(
  ctx: CanvasRenderingContext2D,
  color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  phase: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view === 'side' && faceLeft) ctx.scale(-1, 1);
  ctx.scale(1.3, 1.3); // a bigger, harder-worn build than the rank and file

  const cloth = color; // worn trousers / sash take the enemy tint (flash on hit)
  const clothDark = shade(color, -0.28);
  const skin = '#c08a52'; // weathered, sun-darkened hide
  const skinLit = shade(skin, 0.14);
  const skinDark = shade(skin, -0.2);
  const muscle = shade(skin, -0.32); // deep muscle shadow
  const scar = '#e0b48c'; // pale old scar tissue
  const steel = '#c9d2dc';
  const steelEdge = '#eef3f8';
  const steelDark = '#8b95a3';
  const hilt = '#6e4a26';
  const leather = '#5a3d28'; // baldric / belt
  const leatherLit = shade(leather, 0.18);
  const wrap = '#b7a882'; // linen forearm wraps
  const hair = '#3a332c'; // grizzled dark hair, a fleck of grey
  const grey = '#8a8378';
  const band = '#a83a30'; // red war-band
  const boot = '#3a2a1e';
  // A fighter's V: broad bare shoulders over a narrow waist, loose trousers
  // bloused into low boots.
  const legs: LegLook = { cloth, boot, w: 4.2, bootUp: 0.4 };

  const swing = Math.sin(phase);
  const bob = Math.abs(Math.sin(phase));

  if (view === 'side') {
    // --- Profile (walking along the row) ---
    walkLegsSide(ctx, phase, { hipY: 3, footY: 12.5, stride: 3.9, look: legs });

    ctx.save();
    ctx.translate(0, -bob * 1.1);

    // A sheathed dagger tucked at the small of the back.
    ctx.strokeStyle = leather;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3.6, 1);
    ctx.lineTo(-7.5, 5.5);
    ctx.stroke();

    // Rear (off) arm swinging loose behind, bare with a linen wrap.
    arm(ctx, -0.8, -6.4, -4.4 - swing * 1.8, 0.8, { sleeve: skinDark, hand: skinDark, w: 3, cuff: wrap }, -0.9);

    // Bare torso — wide lats tapering to a narrow waist.
    torsoSide(ctx, {
      color: skin, lit: skinLit, dark: skinDark,
      top: -9, waistY: 0.8, hemY: 5, chest: 5.4, back: 4.8, waist: 3.4, hemF: 4.4, hemB: 4.4,
    });
    // Pectoral + abdominal muscle shading.
    ctx.strokeStyle = muscle;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0.8, -4.6);
    ctx.quadraticCurveTo(3.6, -3.4, 4.8, -5); // pec underline
    ctx.moveTo(2.6, -1.5);
    ctx.lineTo(2.9, 4.2); // ab centre line
    ctx.moveTo(1.2, 0.4);
    ctx.lineTo(3.9, 0.8); // upper ab crease
    ctx.moveTo(1.4, 3);
    ctx.lineTo(3.8, 3.4); // lower ab crease
    ctx.stroke();

    // Leather baldric strap crossing the chest.
    ctx.strokeStyle = leather;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(3.6, -8.2);
    ctx.lineTo(-1.9, 4.3);
    ctx.stroke();
    ctx.strokeStyle = leatherLit;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(3.5, -7.8);
    ctx.lineTo(-1.9, 4);
    ctx.stroke();
    // Waist sash over the trousers.
    ctx.fillStyle = clothDark;
    ctx.beginPath();
    ctx.moveTo(-4.4, 3.4);
    ctx.quadraticCurveTo(0, 5.4, 4.4, 3.4);
    ctx.lineTo(4.6, 6);
    ctx.quadraticCurveTo(0, 7.8, -4.6, 6);
    ctx.closePath();
    ctx.fill();
    // An old sword-scar slashed across the ribs.
    ctx.strokeStyle = scar;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(1.2, -6);
    ctx.lineTo(4.2, -1.6);
    ctx.stroke();

    // Head — weathered, stubbled, grim, under a red war-band; hair tied back.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(1.8, -11.4, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skinDark; // jaw / cheek shadow + stubble base
    ctx.beginPath();
    ctx.arc(2.6, -10, 2.6, -0.4, Math.PI * 0.9);
    ctx.fill();
    ctx.fillStyle = hair; // hair at the back, gathered into a short tail
    ctx.beginPath();
    ctx.moveTo(-1.6, -11.6);
    ctx.quadraticCurveTo(-2.4, -14.6, 1.6, -14.8);
    ctx.quadraticCurveTo(0, -12.6, -0.4, -10.8);
    ctx.quadraticCurveTo(-1.4, -10.6, -1.6, -11.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hair;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-1.6, -12.4);
    ctx.quadraticCurveTo(-5, -12, -6, -10.4); // ponytail flick
    ctx.stroke();
    ctx.strokeStyle = grey; // a streak of grey
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-1.8, -12.6);
    ctx.quadraticCurveTo(-4.6, -12.2, -5.6, -10.8);
    ctx.stroke();
    ctx.strokeStyle = band; // red war-band across the brow
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-1.8, -13.4);
    ctx.quadraticCurveTo(2, -14.9, 5, -12.9);
    ctx.stroke();
    // Hard scowling eye + brow, and a scar through it.
    ctx.strokeStyle = muscle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2.4, -11.6);
    ctx.lineTo(4.6, -11);
    ctx.stroke();
    ctx.fillStyle = '#241c18';
    ctx.beginPath();
    ctx.arc(3.6, -10.6, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = scar;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(3.4, -13);
    ctx.lineTo(4, -8.8);
    ctx.stroke();

    // --- Sword held forward in an easy ready guard ---
    const gripX = 5.8, gripY = -2.2;
    // Worn longsword: grip, crossguard, tapered blade angled forward-down.
    ctx.save();
    ctx.translate(gripX, gripY);
    ctx.rotate(0.32);
    ctx.strokeStyle = hilt; // grip
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-2.6, 0);
    ctx.lineTo(0.4, 0);
    ctx.stroke();
    ctx.fillStyle = steelDark; // pommel
    ctx.beginPath();
    ctx.arc(-3, 0, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = steelDark; // crossguard
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0.4, -2.4);
    ctx.lineTo(0.4, 2.4);
    ctx.stroke();
    ctx.fillStyle = steel; // blade
    ctx.beginPath();
    ctx.moveTo(1, -1.5);
    ctx.lineTo(15, -0.5);
    ctx.lineTo(16.6, 0);
    ctx.lineTo(15, 0.5);
    ctx.lineTo(1, 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = steelEdge; // edge highlight
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(1.4, -0.3);
    ctx.lineTo(14.6, -0.1);
    ctx.stroke();
    ctx.restore();
    // Lead arm to the grip, bare with a forearm wrap.
    arm(ctx, 1.8, -6.4, gripX - 0.6, gripY - 0.2, { sleeve: skin, hand: skin, w: 3, cuff: wrap }, 1.3);

    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Front / back (marching toward or away from the viewer) ---
  const back = view === 'back';
  walkLegsFront(ctx, phase, { hipY: 3, footY: 12.5, sep: 3.2, look: legs, back, lift: 2.9 });

  ctx.save();
  ctx.translate(0, -bob * 1);

  // Bare, wiry torso (broad shoulders tapering to a narrow waist).
  torsoFront(ctx, {
    color: back ? skinDark : skin, lit: skinLit, dark: muscle,
    top: -9.5, waistY: 1, hemY: 5.6, shoulder: 6.8, waist: 4, hem: 4.8, back,
  });

  if (back) {
    // Back muscle definition: spine channel + shoulder blades.
    ctx.strokeStyle = muscle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 5);
    ctx.moveTo(-3.6, -6);
    ctx.quadraticCurveTo(-2, -4, -1.1, -5.5);
    ctx.moveTo(3.6, -6);
    ctx.quadraticCurveTo(2, -4, 1.1, -5.5);
    ctx.stroke();
    // Baldric strap crossing the back.
    ctx.strokeStyle = leather;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-4, -7.5);
    ctx.lineTo(4, 4);
    ctx.stroke();
  } else {
    // Front muscle definition: pecs + centre line + ab creases.
    ctx.strokeStyle = muscle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3.8, -5.5);
    ctx.quadraticCurveTo(-1.3, -3.4, 0, -5.2); // left pec
    ctx.moveTo(3.8, -5.5);
    ctx.quadraticCurveTo(1.3, -3.4, 0, -5.2); // right pec
    ctx.moveTo(0, -3.4);
    ctx.lineTo(0, 4.6); // centre line
    ctx.moveTo(-2.4, -0.4);
    ctx.lineTo(2.4, -0.4); // upper abs
    ctx.moveTo(-2.2, 2.4);
    ctx.lineTo(2.2, 2.4); // lower abs
    ctx.stroke();
    // Crossed leather baldric (X across the chest).
    ctx.strokeStyle = leather;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4.4, -7.4);
    ctx.lineTo(4.2, 4);
    ctx.moveTo(4.4, -7.4);
    ctx.lineTo(-4.2, 4);
    ctx.stroke();
    // Old scar across the chest.
    ctx.strokeStyle = scar;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-2.8, -6.5);
    ctx.lineTo(1.2, -2);
    ctx.stroke();
  }

  // Waist sash over the trousers.
  ctx.fillStyle = clothDark;
  ctx.beginPath();
  ctx.moveTo(-4.8, 4.2);
  ctx.quadraticCurveTo(0, 6.2, 4.8, 4.2);
  ctx.lineTo(5, 7);
  ctx.quadraticCurveTo(0, 8.8, -5, 7);
  ctx.closePath();
  ctx.fill();

  // Heavy bare arms down the sides, each ending in a linen forearm wrap.
  const armSkin = back ? skinDark : skin;
  arm(ctx, -6, -6.6, -6.6, 1.6, { sleeve: armSkin, hand: armSkin, w: 3, cuff: wrap }, -0.5);
  arm(ctx, 6, -6.6, 6.6, 1.6, { sleeve: armSkin, hand: armSkin, w: 3, cuff: wrap }, 0.5);

  // Longsword held upright in the near hand (blade rising past the shoulder).
  ctx.save();
  ctx.translate(6.6, 1.6);
  ctx.strokeStyle = hilt; // grip below the hand
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, 1.6);
  ctx.lineTo(0, -1.4);
  ctx.stroke();
  ctx.strokeStyle = steelDark; // crossguard
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-2, -1.4);
  ctx.lineTo(2, -1.4);
  ctx.stroke();
  ctx.fillStyle = steel; // blade rising upward
  ctx.beginPath();
  ctx.moveTo(-1.3, -1.6);
  ctx.lineTo(-0.4, -20);
  ctx.lineTo(0, -21);
  ctx.lineTo(0.4, -20);
  ctx.lineTo(1.3, -1.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = steelEdge;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(0, -19.5);
  ctx.stroke();
  ctx.restore();

  // Head — weathered face or grizzled back-of-head, red war-band, tied hair.
  ctx.fillStyle = back ? skinDark : skin;
  ctx.beginPath();
  ctx.arc(0, -11.6, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hair; // hair crown
  ctx.beginPath();
  ctx.arc(0, -12.8, 3.6, Math.PI, 0);
  ctx.fill();
  if (back) {
    // Short tied tail at the back of the head.
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(0, -9.4, 1.6, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = grey;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-1.4, -13);
    ctx.lineTo(-0.6, -11);
    ctx.stroke();
  } else {
    // Stubbled jaw, hard scowling eyes under a heavy brow, scar down one cheek.
    ctx.fillStyle = skinDark;
    ctx.beginPath();
    ctx.arc(0, -9.8, 3, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = muscle; // heavy brow
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3, -12.4);
    ctx.lineTo(-0.8, -11.7);
    ctx.moveTo(3, -12.4);
    ctx.lineTo(0.8, -11.7);
    ctx.stroke();
    ctx.fillStyle = '#241c18'; // cold, deep-set eyes
    ctx.beginPath();
    ctx.arc(-1.7, -11.2, 0.7, 0, Math.PI * 2);
    ctx.arc(1.7, -11.2, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = scar; // scar down the cheek
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(2.2, -12.4);
    ctx.lineTo(1.6, -8.6);
    ctx.stroke();
  }
  // Red war-band across the brow (both facings).
  ctx.strokeStyle = band;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-3.6, -12.9);
  ctx.quadraticCurveTo(0, -14, 3.6, -12.9);
  ctx.stroke();
  // Trailing knot ends of the war-band.
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(back ? 3.4 : -3.4, -12.9);
  ctx.lineTo(back ? 5.6 : -5.6, -11);
  ctx.stroke();

  ctx.restore();
  ctx.restore();
}

/**
 * The Iron Warden (boss3): a towering knight sealed head-to-toe in steel plate,
 * hauling a great crimson-emblazoned tower shield. Bulky and slow — every panel
 * is steel (no skin shows through the closed great helm), and `color` (his
 * crimson) paints only the shield's emblem so the Aegis theme reads at a glance.
 * Scaled up well past the grunts he shields. Side / front / back like the others.
 */
export function drawIronWarden(
  ctx: CanvasRenderingContext2D,
  color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  phase: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view === 'side' && faceLeft) ctx.scale(-1, 1);
  ctx.scale(1.5, 1.5); // a huge man — dwarfs the footmen around him

  const steel = '#c3ccd6';
  const steelMid = '#9aa4b0';
  const steelDark = '#6c7480';
  const steelDeep = '#474e58';
  const crimson = color;
  const crimsonLit = shade(color, 0.22);
  const crimsonDark = shade(color, -0.34);
  // Sealed in plate head to toe: thick plated legs, sabatons, knee cops.
  const legs: LegLook = { cloth: steelDark, boot: steelDeep, w: 5, bootUp: 0.66, knee: steel, toe: 3.8 };

  const bob = Math.abs(Math.sin(phase));

  // Draws the crimson emblem (a bold cross-patty over a diamond boss) centred at
  // the current origin, sized by `r`. Shared by every facing that shows the face.
  const emblem = (r: number) => {
    ctx.fillStyle = crimson;
    const bar = r * 0.34;
    // Vertical + horizontal flared bars.
    ctx.beginPath();
    ctx.moveTo(-bar, -r);
    ctx.lineTo(bar, -r);
    ctx.lineTo(bar * 0.5, 0);
    ctx.lineTo(bar, r);
    ctx.lineTo(-bar, r);
    ctx.lineTo(-bar * 0.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r, -bar);
    ctx.lineTo(-r, bar);
    ctx.lineTo(0, bar * 0.5);
    ctx.lineTo(r, bar);
    ctx.lineTo(r, -bar);
    ctx.lineTo(0, -bar * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = crimsonDark; // central boss, rimmed then lit
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.46);
    ctx.lineTo(r * 0.46, 0);
    ctx.lineTo(0, r * 0.46);
    ctx.lineTo(-r * 0.46, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = crimsonLit;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.34);
    ctx.lineTo(r * 0.34, 0);
    ctx.lineTo(0, r * 0.34);
    ctx.lineTo(-r * 0.34, 0);
    ctx.closePath();
    ctx.fill();
  };

  if (view === 'side') {
    // --- Profile (marching along the row) ---
    walkLegsSide(ctx, phase, { hipY: 3, footY: 13, stride: 3.6, look: legs, lift: 1.2 });

    ctx.save();
    ctx.translate(0, -bob * 1);

    // Plate tassets over the hips, then a barrel of a cuirass.
    ctx.fillStyle = steelDark;
    ctx.beginPath();
    ctx.ellipse(0.4, 5, 6.8, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    torsoSide(ctx, {
      color: steelMid, lit: steel, dark: steelDark,
      top: -11, waistY: 0, hemY: 4.6, chest: 8.4, back: 8, waist: 7, hemF: 7.8, hemB: 8,
    });
    ctx.strokeStyle = steelDark; // fauld / belt line
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-7.8, 1.6);
    ctx.quadraticCurveTo(0, 3.8, 8, 1.6);
    ctx.stroke();
    // Bulky pauldrons, the rear one in shadow.
    pauldron(ctx, -3.8, -8.6, 4.4, steelDark, 0.1);
    pauldron(ctx, 2.8, -8.8, 4.6, steelMid, -0.15);

    // Closed great helm — a steel bucket, no skin, a dark visor slit.
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.moveTo(-3.6, -12);
    ctx.quadraticCurveTo(-4, -19, 2.4, -19);
    ctx.quadraticCurveTo(7, -19, 6.6, -11.6);
    ctx.quadraticCurveTo(1.5, -13, -3.6, -12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = steelDeep; // visor slit
    ctx.fillRect(1.6, -15.8, 5.4, 1.3);
    ctx.strokeStyle = steelDark; // breath holes / rivet line
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(2.2, -13.4);
    ctx.lineTo(6.2, -13.4);
    ctx.stroke();

    // Great tower shield on the front arm — tall, rounded, crimson emblem facing
    // the direction of the march.
    ctx.save();
    ctx.translate(8, 0);
    ctx.fillStyle = steelMid;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.quadraticCurveTo(5.5, -9.5, 5.5, 0);
    ctx.quadraticCurveTo(5.5, 9, 0, 13);
    ctx.quadraticCurveTo(-2.4, 9, -2.4, 0);
    ctx.quadraticCurveTo(-2.4, -9.5, 0, -11);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.4; // steel rim
    ctx.strokeStyle = steel;
    ctx.stroke();
    ctx.save(); // crimson emblem, riding the shield face
    ctx.translate(1.4, 0.5);
    emblem(3.4);
    ctx.restore();
    ctx.restore();

    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Front / back (marching toward or away from the viewer) ---
  const back = view === 'back';
  walkLegsFront(ctx, phase, { hipY: 3, footY: 13, sep: 4, look: legs, back, lift: 2.4 });

  ctx.save();
  ctx.translate(0, -bob * 0.9);

  ctx.fillStyle = steelDeep; // tassets
  ctx.beginPath();
  ctx.ellipse(0, 5.4, 7.6, 1.9, 0, 0, Math.PI * 2);
  ctx.fill();
  torsoFront(ctx, {
    color: back ? steelDark : steelMid, lit: steel, dark: steelDeep,
    top: -11, waistY: 0.4, hemY: 5, shoulder: 9.8, waist: 7, hem: 8, back, seam: steelDeep,
  });
  if (back) {
    // Backplate: two flanking lame seams and a lit highlight down the spine.
    ctx.strokeStyle = steelDeep;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-5, -7);
    ctx.lineTo(-4.2, 6.5);
    ctx.moveTo(5, -7);
    ctx.lineTo(4.2, 6.5);
    ctx.stroke();
    ctx.strokeStyle = steel;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-0.8, -8.5);
    ctx.lineTo(-0.8, 6);
    ctx.stroke();
  }
  ctx.strokeStyle = steelDeep; // fauld line
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-7.2, 2);
  ctx.quadraticCurveTo(0, 4, 7.2, 2);
  ctx.stroke();
  // Heavy pauldrons on both shoulders.
  pauldron(ctx, -8.6, -7.8, 4, steelDark, -0.3);
  pauldron(ctx, 8.6, -7.8, 4, steelDark, 0.3);
  // Plated arm on the open side, gauntlet hanging at the hip.
  const free = back ? -1 : 1;
  arm(ctx, free * 8.8, -5.6, free * 9.6, 3.4, { sleeve: steelDark, hand: steelMid, w: 4, cuff: steel }, free * 0.6);

  // Great tower shield held across the body: face-on (with emblem) toward us, a
  // slim edge when seen from behind.
  if (back) {
    ctx.fillStyle = steelDeep;
    ctx.beginPath();
    ctx.ellipse(8.6, 1, 2.4, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.save();
    ctx.translate(-6.5, 1);
    ctx.fillStyle = steelMid;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.quadraticCurveTo(5, -8.5, 5, 0);
    ctx.quadraticCurveTo(5, 8.5, 0, 12);
    ctx.quadraticCurveTo(-5, 8.5, -5, 0);
    ctx.quadraticCurveTo(-5, -8.5, 0, -10);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = steel;
    ctx.stroke();
    ctx.save();
    ctx.translate(0, 0.5);
    emblem(3.1);
    ctx.restore();
    ctx.restore();
  }

  // Closed great helm — a steel bucket from either side.
  ctx.fillStyle = back ? steelDark : steel;
  ctx.beginPath();
  ctx.moveTo(-4.4, -11.4);
  ctx.quadraticCurveTo(-4.8, -19.5, 0, -19.5);
  ctx.quadraticCurveTo(4.8, -19.5, 4.4, -11.4);
  ctx.quadraticCurveTo(0, -12.8, -4.4, -11.4);
  ctx.closePath();
  ctx.fill();
  if (!back) {
    ctx.fillStyle = steelDeep; // visor slit + vertical reinforcing bar
    ctx.fillRect(-3.4, -16.4, 6.8, 1.3);
    ctx.fillRect(-0.7, -18.6, 1.4, 6.4);
  } else {
    // Back of the great helm: a crown seam, rivets and a nape guard so it isn't
    // a blank steel dome from behind.
    ctx.strokeStyle = steelDeep;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.lineTo(0, -12); // crown seam
    ctx.stroke();
    ctx.fillStyle = steelDeep;
    ctx.beginPath();
    ctx.arc(-2.5, -15, 0.6, 0, Math.PI * 2);
    ctx.arc(2.5, -15, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = steel; // nape rim catching the light
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-4, -12);
    ctx.quadraticCurveTo(0, -13.2, 4, -12);
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

/**
 * Small glowing spell-orb crowning a staff — a soft outer halo, a mid ring and a
 * bright core, ringed by a gold ferrule. Drawn in local space centred on
 * (`x`,`y`); shared by the Royal Mage's three views so the orb reads the same
 * from every heading.
 */
function drawStaffOrb(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const orb = '#9fe8ff';
  ctx.save();
  ctx.globalAlpha = 0.35; // soft halo
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(x, y, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#3aa6d8'; // mid body
  ctx.beginPath();
  ctx.arc(x, y, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e9fbff'; // bright core
  ctx.beginPath();
  ctx.arc(x - 0.6, y - 0.6, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e8c15a'; // gold ferrule claws holding the orb
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 3.1, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.restore();
}

/**
 * Procedural Royal Wizard silhouette — a robed court mage gliding along the path
 * in a bell-shaped robe, pointed hat and white beard, a glowing spell-staff in
 * hand. Painted in the caller's local space (feet near y=+12, head near y=-16).
 * Same three authored views as the footmen ('side' mirrored on `faceLeft`,
 * 'front', 'back'); the robe hides most of the stride, so the legs read as two
 * boots peeking under a swaying hem while the upper body bobs. `phase` (radians)
 * is the walk-cycle position advanced from distance travelled. Replaces the
 * emoji token for the Castle mage (`cas_mage`).
 */
export function drawRoyalMage(
  ctx: CanvasRenderingContext2D,
  color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  phase: number,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view === 'side' && faceLeft) ctx.scale(-1, 1);

  const robe = color;
  const robeLit = shade(color, 0.22);
  const robeDark = shade(color, -0.32);
  const gold = '#e8c15a';
  const skin = '#e8c39c';
  const beard = '#eef0f2';
  const boot = '#2f2620';
  const wood = '#6e4a26';
  // Only the shoes show under the robe; the stride still drives them.
  const feet: LegLook = { cloth: robeDark, boot, w: 2.8, bootUp: 0.9, toe: 2.6, pointed: true };

  const swing = Math.sin(phase); // -1..1 step
  const bob = Math.abs(Math.sin(phase)); // 0..1 vertical bob
  const sway = swing * 1.1; // hem drift

  if (view === 'side') {
    // --- Profile (walking along the row) ---
    walkLegsSide(ctx, phase, { hipY: 6, footY: 12.5, stride: 2.4, look: feet, lift: 1 });

    ctx.save();
    ctx.translate(0, -bob * 0.9); // upper body bobs with the stride

    // Back of the robe trailing a little behind the step.
    ctx.fillStyle = robeDark;
    ctx.beginPath();
    ctx.moveTo(-3, -7);
    ctx.quadraticCurveTo(-7.4, 2, -9.4 + sway * 0.5, 11);
    ctx.lineTo(-2, 11.2);
    ctx.closePath();
    ctx.fill();

    // Robe: a bell from the shoulders flaring to a swaying hem.
    ctx.fillStyle = robe;
    ctx.beginPath();
    ctx.moveTo(-4, -8);
    ctx.quadraticCurveTo(-8, 2, -7 + sway, 10.5);
    ctx.quadraticCurveTo(0, 12.5, 7 + sway, 10.5);
    ctx.quadraticCurveTo(8, 2, 4, -8);
    ctx.quadraticCurveTo(0, -10, -4, -8);
    ctx.closePath();
    ctx.fill();
    // Lit front panel for volume.
    ctx.fillStyle = robeLit;
    ctx.beginPath();
    ctx.moveTo(1, -8);
    ctx.quadraticCurveTo(6, 1, 6 + sway, 10);
    ctx.quadraticCurveTo(2.5, 11.4, 2, 10);
    ctx.quadraticCurveTo(2.4, 1, 1, -8);
    ctx.closePath();
    ctx.fill();
    // Gold hem trim + a sash across the waist.
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-7 + sway, 10.2);
    ctx.quadraticCurveTo(0, 12.1, 7 + sway, 10.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, -1);
    ctx.quadraticCurveTo(0, 1, 6, -1.5);
    ctx.stroke();

    // Staff planted in the front hand, tilted forward, orb aloft.
    ctx.strokeStyle = wood;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4.5, 12);
    ctx.lineTo(7.5, -18);
    ctx.stroke();
    drawStaffOrb(ctx, 7.9, -20);
    // Bell-sleeved arm gripping the staff.
    arm(ctx, 1.4, -6.4, 6.4, -6.6, { sleeve: robe, hand: skin, w: 2.8, bell: true, cuff: gold }, 1.6);

    // Head + skin, white beard hanging down, pointed hat swept back.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(1.6, -11.5, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = beard; // beard tapering to a point over the chest
    ctx.beginPath();
    ctx.moveTo(-1.4, -10.5);
    ctx.quadraticCurveTo(-0.5, -3, 1.2, -2);
    ctx.quadraticCurveTo(3.2, -4, 4, -9.5);
    ctx.closePath();
    ctx.fill();
    // Pointed hat: a wide brim and a long cone tipping back with a gold band.
    ctx.fillStyle = robeDark;
    ctx.beginPath();
    ctx.ellipse(1.4, -13.6, 5.6, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = robe;
    ctx.beginPath();
    ctx.moveTo(-2.6, -13.8);
    ctx.lineTo(-9, -25); // cone tips backward
    ctx.quadraticCurveTo(-3, -19, 4.6, -13.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2.4, -14.3);
    ctx.quadraticCurveTo(1.2, -15.6, 4.2, -14.3);
    ctx.stroke();
    drawProfileFace(ctx, 1.6, -11.5, 3.3, skin, { eyeY: 0.1, brow: beard, mouth: false });

    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Front / back (marching toward or away from the viewer) ---
  const back = view === 'back';
  walkLegsFront(ctx, phase, { hipY: 7, footY: 12.5, sep: 2.2, look: feet, back, lift: 2 });

  ctx.save();
  ctx.translate(0, -bob * 0.8);

  // Robe bell, symmetric, hem swaying as one.
  ctx.fillStyle = back ? robeDark : robe;
  ctx.beginPath();
  ctx.moveTo(-4.5, -8);
  ctx.quadraticCurveTo(-8.5, 2, -7.5 + sway, 11);
  ctx.quadraticCurveTo(0, 12.8, 7.5 + sway, 11);
  ctx.quadraticCurveTo(8.5, 2, 4.5, -8);
  ctx.quadraticCurveTo(0, -10, -4.5, -8);
  ctx.closePath();
  ctx.fill();

  if (back) {
    // Spine seam and a couple of folds so the back reads with depth.
    ctx.strokeStyle = shade(color, -0.48);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7.5);
    ctx.lineTo(sway, 11);
    ctx.moveTo(-3.8, -4);
    ctx.quadraticCurveTo(-3, 4, -3.6 + sway, 10.5);
    ctx.moveTo(3.8, -4);
    ctx.quadraticCurveTo(3, 4, 3.6 + sway, 10.5);
    ctx.stroke();
  } else {
    // Centre highlight + gold hem and sash from the front.
    ctx.fillStyle = robeLit;
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.2, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-7.5 + sway, 10.6);
    ctx.quadraticCurveTo(0, 12.4, 7.5 + sway, 10.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, -1);
    ctx.quadraticCurveTo(0, 1.2, 5, -1);
    ctx.stroke();
  }
  // Bell sleeve on the free arm, hanging at the side.
  const free = back ? -1 : 1;
  arm(ctx, free * 4.6, -6.4, free * 5.8, 1.4, { sleeve: back ? robeDark : robe, hand: skin, w: 2.8, bell: true, cuff: gold }, free * 0.6);

  // Staff upright on the near side (a slim shaft from behind), orb on top.
  const sx = back ? 6.5 : -6;
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, 11);
  ctx.lineTo(sx, -17);
  ctx.stroke();
  drawStaffOrb(ctx, sx, -19);
  arm(ctx, -free * 4.6, -6.4, sx, -2, { sleeve: back ? robeDark : robe, hand: skin, w: 2.8, bell: true, cuff: gold }, -free * 0.8);

  // Head — face, white beard and hat toward us; hat cone + brim from behind.
  if (back) {
    // Back of the head: a skin nape with white hair spilling under the brim, so
    // the figure isn't a floating hat over bare shoulders.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -11.5, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = beard; // hair fanning onto the shoulders
    ctx.beginPath();
    ctx.moveTo(-3.4, -12);
    ctx.quadraticCurveTo(-4, -8, -2.6, -7);
    ctx.quadraticCurveTo(0, -8.5, 2.6, -7);
    ctx.quadraticCurveTo(4, -8, 3.4, -12);
    ctx.quadraticCurveTo(0, -10, -3.4, -12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = robeDark; // brim
    ctx.beginPath();
    ctx.ellipse(0, -13.4, 5.8, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = robe; // cone
    ctx.beginPath();
    ctx.moveTo(-4, -13.6);
    ctx.lineTo(0, -25.5);
    ctx.lineTo(4, -13.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3.4, -14.4);
    ctx.quadraticCurveTo(0, -15.6, 3.4, -14.4);
    ctx.stroke();
  } else {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -11.5, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2230'; // eyes
    ctx.beginPath();
    ctx.arc(-1.3, -11.8, 0.7, 0, Math.PI * 2);
    ctx.arc(1.3, -11.8, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = beard; // full beard fanning over the chest
    ctx.beginPath();
    ctx.moveTo(-3, -10);
    ctx.quadraticCurveTo(-2.4, -2.5, 0, -1.5);
    ctx.quadraticCurveTo(2.4, -2.5, 3, -10);
    ctx.quadraticCurveTo(0, -8, -3, -10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = robeDark; // brim
    ctx.beginPath();
    ctx.ellipse(0, -13.6, 5.8, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = robe; // cone
    ctx.beginPath();
    ctx.moveTo(-4, -13.8);
    ctx.lineTo(0.6, -26);
    ctx.lineTo(4, -13.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold; // band
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3.4, -14.6);
    ctx.quadraticCurveTo(0.2, -15.8, 3.6, -14.6);
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

/**
 * The Night Falcons' gold sigil — a stylised spread-winged falcon — stamped on
 * Gowzer's chest and hood. Drawn in local space centred on (`x`,`y`), scaled by
 * `s`, in `color`; shared across his three views so the mark reads the same.
 */
function drawFalconSigil(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  // Swept wings spreading from a central body.
  ctx.beginPath();
  ctx.moveTo(0, -0.4);
  ctx.quadraticCurveTo(-3, -1.9, -4.2, 0.2);
  ctx.quadraticCurveTo(-2.2, -0.4, 0, 0.9);
  ctx.quadraticCurveTo(2.2, -0.4, 4.2, 0.2);
  ctx.quadraticCurveTo(3, -1.9, 0, -0.4);
  ctx.closePath();
  ctx.fill();
  // Head/body node.
  ctx.beginPath();
  ctx.arc(0, -0.5, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * One pointed feather from its quill base (x,y) along `angle` (radians, 0 = +x):
 * a slim leaf with a lit leading edge and, optionally, a gold-dipped tip. The
 * building block of Gowzer's mantle, cape and death burst.
 */
export function drawFeather(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  w: number,
  angle: number,
  fill: string,
  tip?: string,
  edge?: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const vane = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.45, -w, len, 0);
    ctx.quadraticCurveTo(len * 0.45, w * 0.8, 0, 0);
    ctx.closePath();
  };
  vane();
  ctx.fillStyle = fill;
  ctx.fill();
  if (edge || tip) {
    ctx.save();
    vane();
    ctx.clip();
    if (edge) {
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.ellipse(len * 0.5, -w * 0.55, len * 0.5, w * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (tip) {
      ctx.fillStyle = tip;
      ctx.fillRect(len * 0.8, -w, len * 0.2 + 0.2, w * 2);
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * A curved Night Falcon dagger held at (x,y), its blade pointing along `angle`:
 * a gold cross-guard and pommel either side of the grip, and a slim blade that
 * sweeps into a hooked, talon-like point.
 */
function drawTalonDagger(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  len: number,
  steel: string,
  gold: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = gold;
  ctx.beginPath(); // pommel behind the fist
  ctx.arc(-1.6, 0, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(0.6, -1.5, 0.8, 3); // cross-guard
  ctx.fillStyle = steel;
  ctx.beginPath(); // blade: straight spine, curved edge, hooked point
  ctx.moveTo(1.3, -0.65);
  ctx.quadraticCurveTo(len * 0.6, -0.9, len, -2.2);
  ctx.quadraticCurveTo(len * 0.72, 0.4, 1.3, 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(steel, 0.35); // a bright edge along the spine
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(1.6, -0.55);
  ctx.quadraticCurveTo(len * 0.6, -0.8, len - 0.3, -2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Procedural Gowzer — a Night Falcon assassin: midnight cloth under a
 * mantle of dark gold-tipped feathers that trails into a feathered cape, a deep
 * hood hiding a bronze falcon half-mask (hooked beak, gold eye slits), the
 * order's sigil on his chest and a talon dagger in each hand. Painted at a
 * modest 1.15× (a shade bigger than the grunts). Same three authored views as
 * the footmen ('side' mirrored on `faceLeft`, 'front', 'back'); `phase`
 * (radians) is the walk-cycle position advanced from distance travelled.
 *
 * His walk is a crouched stalk: leaning in, head level, the mantle and cape
 * fluttering and the daggers swinging against the stride. `taunt` (0..1)
 * straightens him into his intro pose — upright, one dagger raised and spun by
 * `flourish` (0..1 = one full twirl) while he delivers his lines. Boss `boss4`.
 */
export function drawGowzer(
  ctx: CanvasRenderingContext2D,
  _color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  phase: number,
  taunt = 0,
  flourish = 0,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view === 'side' && faceLeft) ctx.scale(-1, 1);
  ctx.scale(1.15, 1.15); // small fry — only a little bigger than the grunts

  // Midnight charcoal with a plum cast: darker than the King's Chamber's
  // purple runner so he reads against it, the gold trim carrying the detail.
  const coat = '#2b2236';
  const coatLit = '#463a56';
  const coatDark = '#17121f';
  const feather = '#1c1826';
  const featherMid = '#2b2539';
  const featherEdge = '#4f4566';
  const gold = '#d9b24a';
  const goldLit = '#f2d67e';
  const mask = '#b8894a';
  const maskLit = '#e2b872';
  const maskDark = '#6e4a22';
  const hood = '#1e1728';
  const hoodIn = '#0b0410';
  const eye = '#ffd25a';
  const eyeGlow = 'rgba(255, 196, 70, 0.35)';
  const steel = '#c9d2dc';
  const leather = '#4a3022';
  const glove = '#24151f';
  const legs: LegLook = { cloth: '#1b1622', boot: '#0f0b12', w: 3, bootUp: 0.86, toe: 2.8, pointed: true };
  const armLook: ArmLook = { sleeve: coatDark, hand: glove, w: 2.4, cuff: leather };

  const stalk = 1 - taunt;
  const bob = Math.abs(Math.sin(phase)) * stalk;
  const flutter = Math.sin(phase * 2 + 0.6) * stalk;
  const swing = Math.cos(phase) * stalk;
  const spin = flourish * Math.PI * 2;

  if (view === 'side') {
    const lean = 1.8 * stalk;
    // --- Feathered cape, streaming behind (drawn first, behind everything) ---
    capeSide(ctx, -0.4, -7, 13.5, 6.4 + flutter * 0.6, feather, 0.5 + 0.5 * flutter);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 0.5 + 0.32 + i * 0.13 + flutter * 0.05 * (i + 1);
      drawFeather(ctx, -1.2 - i * 0.7, -5.6 + i * 1.6, 9 - i * 0.6, 1.9, a, i % 2 ? feather : featherMid, gold, featherEdge);
    }

    // --- Far arm + dagger, swinging against the near one ---
    const rh = taunt > 0.5 ? { x: -2.2, y: 1 } : { x: -2.8 - swing * 1.6, y: 1.6 - Math.abs(swing) * 0.4 };
    arm(ctx, -0.4 + lean * 0.6, -5.8, rh.x, rh.y, { ...armLook, sleeve: shade(coatDark, -0.15) }, -1);
    drawTalonDagger(ctx, rh.x, rh.y, Math.PI * 0.62, 6.4, shade(steel, -0.15), gold);

    walkLegsSide(ctx, phase, { hipY: 4, footY: 12, stride: 3.8 * stalk + 0.4, look: legs, lift: 2 });

    ctx.save();
    ctx.translate(0, -bob * 0.9);

    // --- Coat: lean torso flaring to a split, gold-hemmed skirt ---
    torsoSide(ctx, {
      color: coat, lit: coatLit, dark: coatDark,
      top: -8, waistY: 0, hemY: 7, chest: 4.4, back: 4, waist: 2.9, hemF: 5.4, hemB: 6.6, lean,
    });
    ctx.strokeStyle = gold; // front opening + hem trim
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(3.2 + lean, -6.6);
    ctx.quadraticCurveTo(3.6 + lean * 0.4, 0, 5.2, 6.6);
    ctx.moveTo(-6.4, 7);
    ctx.quadraticCurveTo(-0.6, 8.2, 5.2, 6.7);
    ctx.stroke();
    ctx.strokeStyle = leather; // bandolier across the chest
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-2.6 + lean, -7.2);
    ctx.lineTo(3.4 + lean * 0.3, 0.2);
    ctx.stroke();
    belt(ctx, -3.1 + lean * 0.2, 3.3 + lean * 0.2, 0.5, leather, gold, 0.8, 1.4, 2.6 + lean * 0.2);
    drawFalconSigil(ctx, 2.6 + lean * 0.75, -3.8, 0.5, gold);

    // --- Feather mantle over the shoulders ---
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * 0.5 + 0.55 + i * 0.22 + flutter * 0.04;
      drawFeather(ctx, 1.4 + lean - i * 1.2, -8.2 + i * 0.3, 6.2 - i * 0.3, 1.8, a, i % 2 ? featherMid : feather, gold, featherEdge);
    }

    // --- Hood + falcon mask ---
    const hx = 2 + lean;
    const hy = -12.6;
    ctx.fillStyle = hood; // peaked cowl
    ctx.beginPath();
    ctx.moveTo(hx - 4.6, hy + 5.4);
    ctx.quadraticCurveTo(hx - 6.6, hy - 3.4, hx - 2.4, hy - 6.6);
    ctx.quadraticCurveTo(hx - 4.4, hy - 4, hx - 1.8, hy - 5.4);
    ctx.quadraticCurveTo(hx + 3.8, hy - 6, hx + 4, hy - 0.6);
    ctx.quadraticCurveTo(hx + 4.2, hy + 3, hx + 2.6, hy + 5);
    ctx.quadraticCurveTo(hx - 1, hy + 4, hx - 4.6, hy + 5.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hoodIn; // shadowed face opening
    ctx.beginPath();
    ctx.ellipse(hx + 2.2, hy + 0.4, 2, 3, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mask; // bronze half-mask with a hooked beak
    ctx.beginPath();
    ctx.moveTo(hx + 0.8, hy - 2);
    ctx.quadraticCurveTo(hx + 3.4, hy - 2.6, hx + 4.4, hy - 0.6);
    ctx.quadraticCurveTo(hx + 6.4, hy + 0.2, hx + 5.6, hy + 2.4);
    ctx.quadraticCurveTo(hx + 5.2, hy + 1.2, hx + 3.6, hy + 1.4);
    ctx.quadraticCurveTo(hx + 1.8, hy + 1.2, hx + 0.8, hy + 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = maskLit; // lit ridge of the beak
    ctx.beginPath();
    ctx.moveTo(hx + 2.4, hy - 2.2);
    ctx.quadraticCurveTo(hx + 4.6, hy - 1.6, hx + 5.6, hy + 0.6);
    ctx.quadraticCurveTo(hx + 4.4, hy - 0.6, hx + 2.4, hy - 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = maskDark; // nostril notch
    ctx.beginPath();
    ctx.arc(hx + 4.4, hy + 0.3, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = eyeGlow; // eye glare spilling from the slit
    ctx.beginPath();
    ctx.ellipse(hx + 2.4, hy - 0.8, 1.8, 1.1, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = eye; // gold eye slit, angled in a glare
    ctx.beginPath();
    ctx.moveTo(hx + 1.4, hy - 1.3);
    ctx.lineTo(hx + 3.3, hy - 0.9);
    ctx.lineTo(hx + 1.6, hy - 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold; // gold rim tracing the hood edge
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(hx - 1.8, hy - 5.4);
    ctx.quadraticCurveTo(hx + 3.8, hy - 6, hx + 4, hy - 0.6);
    ctx.stroke();

    // --- Near arm + dagger: low and forward while stalking, raised and
    //     twirling through his intro ---
    if (taunt > 0.5) {
      const h = { x: 7.2, y: -4.2 }; // out ahead of the beak
      arm(ctx, 0.9 + lean, -5.8, h.x, h.y, armLook, 1.6);
      drawTalonDagger(ctx, h.x, h.y, -Math.PI / 2 + spin, 6.4, steel, gold);
    } else {
      const h = { x: 4.8 + lean * 0.6 + swing * 1.6, y: 0.4 - Math.abs(swing) * 0.5 };
      arm(ctx, 0.9 + lean, -5.8, h.x, h.y, armLook, 1.3);
      drawTalonDagger(ctx, h.x, h.y, -0.35, 6.6, steel, gold);
    }

    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Front / back (marching toward or away from the viewer) ---
  const back = view === 'back';

  // Feathered cape behind the body, its edges fanning out past the hips.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 2 + s * (0.34 + i * 0.1 + flutter * 0.04);
      drawFeather(ctx, s * (2.8 + i * 0.5), -7 + i * 1.4, 13 - i * 1.4, 2.1, a, i % 2 ? feather : featherMid, gold, back ? featherEdge : undefined);
    }
  }

  walkLegsFront(ctx, phase, { hipY: 4, footY: 12, sep: 2.2, look: legs, back, lift: 2.2 * stalk + 0.3 });

  ctx.save();
  ctx.translate(0, -bob * 0.8);

  torsoFront(ctx, {
    color: back ? coatDark : coat, lit: coatLit, dark: coatDark,
    top: -8, waistY: 0.5, hemY: 8, shoulder: 5, waist: 3.2, hem: 6.4, back,
  });

  if (back) {
    // The cape covers his back: rows of feathers, gold tips on the last row.
    ctx.fillStyle = feather;
    ctx.beginPath();
    ctx.moveTo(-5, -7.4);
    ctx.quadraticCurveTo(-6.6, 2, -6.4, 9.6);
    ctx.quadraticCurveTo(0, 11, 6.4, 9.6);
    ctx.quadraticCurveTo(6.6, 2, 5, -7.4);
    ctx.quadraticCurveTo(0, -8.6, -5, -7.4);
    ctx.closePath();
    ctx.fill();
    for (let row = 0; row < 3; row++) {
      for (let i = -2; i <= 2; i++) {
        const x = i * 2.4 + (row % 2 ? 1.2 : 0);
        if (Math.abs(x) > 5.4) continue;
        const y = -5 + row * 4.4;
        drawFeather(ctx, x, y, 5.4, 1.5, Math.PI / 2 + i * 0.06 + flutter * 0.04, row % 2 ? featherMid : feather, row === 2 ? gold : undefined, featherEdge);
      }
    }
    drawFalconSigil(ctx, 0, -3.4, 0.6, gold);
  } else {
    ctx.fillStyle = coatDark; // the coat's open front over dark leathers
    ctx.beginPath();
    ctx.moveTo(-1, 0.8);
    ctx.lineTo(-1.6, 8.4);
    ctx.lineTo(1.6, 8.4);
    ctx.lineTo(1, 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold; // opening + hem trim
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(-1.1, 0.8);
    ctx.lineTo(-1.7, 8.4);
    ctx.moveTo(1.1, 0.8);
    ctx.lineTo(1.7, 8.4);
    ctx.moveTo(-6.3, 8);
    ctx.quadraticCurveTo(-4, 9, -1.7, 8.4);
    ctx.moveTo(6.3, 8);
    ctx.quadraticCurveTo(4, 9, 1.7, 8.4);
    ctx.stroke();
    ctx.strokeStyle = leather; // bandolier
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-3.6, -7.2);
    ctx.lineTo(3.4, 0.4);
    ctx.stroke();
    belt(ctx, -3.3, 3.3, 0.8, leather, gold, 0.7, 1.4);
    drawFalconSigil(ctx, -1.4, -3.6, 0.6, gold);
  }

  // Arms: a dagger low in each hand, swinging against the stride. In his
  // intro (front view) the right hand comes up to twirl its blade.
  for (const s of [-1, 1]) {
    const raised = !back && taunt > 0.5 && s === 1;
    const hand = raised
      ? { x: 5.6, y: -7.4 }
      : { x: s * 6.6, y: 2.4 + s * Math.sin(phase) * 0.9 * stalk };
    arm(ctx, s * 4.7, -6.2, hand.x, hand.y, armLook, s * (raised ? -1.6 : 0.7));
    if (raised) drawTalonDagger(ctx, hand.x, hand.y, -Math.PI / 2 + spin, 6.2, steel, gold);
    else if (back) drawTalonDagger(ctx, hand.x, hand.y, Math.PI / 2 + s * 0.5, 5.4, shade(steel, -0.2), gold);
    else drawTalonDagger(ctx, hand.x, hand.y, Math.PI / 2 + s * 0.75, 6, steel, gold);
  }

  // Feather mantle across both shoulders.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + s * (1.05 - i * 0.28) + flutter * 0.03 * s;
      drawFeather(ctx, s * (1.2 + i * 1.1), -8.4 + i * 0.3, 5.8, 1.9, a, i % 2 ? featherMid : feather, gold, featherEdge);
    }
  }

  // Hood — a deep peaked cowl. From the front, the bronze falcon mask fills
  // the opening (beak pointing down, two gold eye slits); from behind, the back
  // of the cowl over a shadowed nape, the sigil stamped on its crown.
  const hy = -12.6;
  if (back) {
    ctx.fillStyle = hoodIn; // nape in the hood's shadow
    ctx.beginPath();
    ctx.arc(0, hy + 1.4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hood;
    ctx.beginPath();
    ctx.moveTo(-5, hy + 4.4);
    ctx.quadraticCurveTo(-5.4, hy - 6, 0, hy - 7.2);
    ctx.quadraticCurveTo(5.4, hy - 6, 5, hy + 4.4);
    ctx.quadraticCurveTo(0, hy + 2.6, -5, hy + 4.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-4.6, hy + 3.9);
    ctx.quadraticCurveTo(0, hy + 2.2, 4.6, hy + 3.9);
    ctx.stroke();
    drawFalconSigil(ctx, 0, hy - 2.2, 0.55, gold);
  } else {
    ctx.fillStyle = hood;
    ctx.beginPath();
    ctx.moveTo(-5, hy + 4.8);
    ctx.quadraticCurveTo(-5.6, hy - 6, 0, hy - 7.2);
    ctx.quadraticCurveTo(5.6, hy - 6, 5, hy + 4.8);
    ctx.quadraticCurveTo(3.4, hy + 3, 3.2, hy + 0.4);
    ctx.quadraticCurveTo(0, hy - 0.8, -3.2, hy + 0.4);
    ctx.quadraticCurveTo(-3.4, hy + 3, -5, hy + 4.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hoodIn;
    ctx.beginPath();
    ctx.ellipse(0, hy + 0.6, 3.1, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mask; // mask across the brow and down into the beak
    ctx.beginPath();
    ctx.moveTo(-3, hy - 1.4);
    ctx.quadraticCurveTo(0, hy - 2.8, 3, hy - 1.4);
    ctx.quadraticCurveTo(3.2, hy + 0.6, 1.4, hy + 1.2);
    ctx.quadraticCurveTo(0.6, hy + 3.4, 0, hy + 4.4);
    ctx.quadraticCurveTo(-0.6, hy + 3.4, -1.4, hy + 1.2);
    ctx.quadraticCurveTo(-3.2, hy + 0.6, -3, hy - 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = maskLit; // lit ridge down the beak
    ctx.beginPath();
    ctx.moveTo(-0.5, hy - 1.9);
    ctx.quadraticCurveTo(0.6, hy + 1, 0, hy + 4.2);
    ctx.quadraticCurveTo(0.2, hy + 1, -0.9, hy - 1.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = eyeGlow;
    ctx.beginPath();
    ctx.ellipse(-1.5, hy - 0.4, 1.7, 1, 0, 0, Math.PI * 2);
    ctx.ellipse(1.5, hy - 0.4, 1.7, 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = eye; // two eye slits slanted into a glare
    ctx.beginPath();
    ctx.moveTo(-2.6, hy - 1);
    ctx.lineTo(-0.6, hy - 0.3);
    ctx.lineTo(-2.3, hy + 0.1);
    ctx.closePath();
    ctx.moveTo(2.6, hy - 1);
    ctx.lineTo(0.6, hy - 0.3);
    ctx.lineTo(2.3, hy + 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold; // rim tracing the hood opening
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-4.4, hy + 3.8);
    ctx.quadraticCurveTo(-5, hy - 5, 0, hy - 6.2);
    ctx.quadraticCurveTo(5, hy - 5, 4.4, hy + 3.8);
    ctx.stroke();
    ctx.fillStyle = goldLit; // clasp at the throat
    ctx.beginPath();
    ctx.arc(0, -7.6, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

/** Enemy ids that have a procedural walk sprite (else the emoji token is used). */
export function hasEnemySprite(id: string): boolean {
  return (
    id === 'cas_grunt' ||
    id === 'cas_grunt2' ||
    id === 'cas_grunt3' ||
    id === 'cas_runner' ||
    id === 'cas_mage' ||
    id === 'cas_brute' ||
    id === 'boss1' ||
    id === 'boss2' ||
    id === 'boss3' ||
    id === 'boss4' ||
    id === 'boss5' ||
    id === 'boss6'
  );
}

/**
 * Dispatch to the right procedural enemy sprite for an enemy `id`, choosing the
 * authored view from the travel direction. `dist` is the distance the enemy has
 * walked along its path; each sprite scales it into its own motion cadence (the
 * grunt's stride, the horse's gallop, the ram's wheel-roll) so movement drives
 * the animation. `sit` is a per-sprite pose blend (the king's seated → standing,
 * Gowzer's intro taunt) and `flourish` (0..1) a looping in-pose gesture (Gowzer's
 * dagger twirl). No-op for ids without a sprite; callers gate on `hasEnemySprite`.
 */
export function drawEnemySprite(
  ctx: CanvasRenderingContext2D,
  id: string,
  color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  dist: number,
  sit = 0,
  flourish = 0,
): void {
  const p = dist * (ENEMY_CADENCE[id] ?? 0.2);
  if (id === 'boss1') drawCaptain(ctx, color, view, faceLeft, p);
  else if (id === 'boss2') drawMercenary(ctx, color, view, faceLeft, p);
  else if (id === 'boss3') drawIronWarden(ctx, color, view, faceLeft, p);
  else if (id === 'boss4') drawGowzer(ctx, color, view, faceLeft, p, sit, flourish);
  else if (id === 'cas_grunt') drawGrunt(ctx, color, view, faceLeft, p);
  else if (id === 'cas_grunt2') drawGrunt2(ctx, color, view, faceLeft, p);
  else if (id === 'cas_grunt3') drawGrunt3(ctx, color, view, faceLeft, p);
  else if (id === 'cas_runner') drawOutrider(ctx, color, view, faceLeft, p);
  else if (id === 'cas_mage') drawRoyalMage(ctx, color, view, faceLeft, p);
  else if (id === 'cas_brute') drawSiegeRam(ctx, color, view, faceLeft, p);
  else if (id === 'boss5') drawKing(ctx, color, view, faceLeft, p, sit);
  else if (id === 'boss6') drawRoland(ctx, color, view, faceLeft, p);
}

/**
 * Walk cadence per enemy: radians of stride phase per pixel walked. The single
 * source for both the sprite dispatch above and `enemyWalkPeriod` below.
 */
const ENEMY_CADENCE: Record<string, number> = {
  boss1: 0.2,
  boss2: 0.19,
  boss3: 0.16,
  boss4: 0.22,
  boss5: 0.16,
  boss6: 0.2,
  cas_grunt: 0.22,
  cas_grunt2: 0.2,
  cas_grunt3: 0.21,
  cas_runner: 0.28,
  cas_mage: 0.2,
  cas_brute: 0.2,
};

/**
 * Pixels walked per full visual cycle of an enemy's sprite (after which every
 * frame repeats exactly). Most strides repeat every 2π of phase; the Siege Ram
 * also rocks its log on a 0.4× beat, so its whole picture repeats every 10π.
 * The renderer quantizes walk distance within this period to cache frames.
 */
export function enemyWalkPeriod(id: string): number {
  const cycle = id === 'cas_brute' ? 10 * Math.PI : 2 * Math.PI;
  return cycle / (ENEMY_CADENCE[id] ?? 0.2);
}

/** Unit `shape`s that have a procedural sprite (else the emoji token is used). */
export function hasSprite(shape: string): boolean {
  return (
    shape === 'archer' ||
    shape === 'sword' ||
    shape === 'spear' ||
    shape === 'crossbow' ||
    shape === 'farmer' ||
    shape === 'wizard' ||
    shape === 'elf' ||
    shape === 'bard' ||
    // The player's own adventurer(s) — drawn from a PlayerSpriteConfig; callers
    // must supply `playerConfig` to drawUnitSprite for these to render.
    shape === 'player-blade' ||
    shape === 'player-claymore' ||
    shape === 'player-bow' ||
    shape === 'player-longbow' ||
    shape === 'player-magic' ||
    shape === 'player-staff'
  );
}

/** The weapon each journal proficiency's champion carries (menus, the armory doll). */
export const PROFICIENCY_WEAPON: Record<Proficiency, PlayerWeapon> = {
  sword: 'dual-swords',
  bow: 'bow',
  magic: 'magic',
};

/** The held weapon a player-champion shape carries, or 'none'. */
export function playerWeaponForShape(shape: string): PlayerWeapon {
  if (shape === 'player-blade') return 'dual-swords';
  if (shape === 'player-claymore') return 'claymore';
  if (shape === 'player-bow') return 'bow';
  if (shape === 'player-longbow') return 'longbow';
  if (shape === 'player-magic') return 'magic';
  if (shape === 'player-staff') return 'staff';
  return 'none';
}

/**
 * Dispatch to the right procedural silhouette for a unit `shape`. `anim` (0..1)
 * is the shared attack-progress value (1 just after an attack, easing to 0 at
 * rest) — each sprite interprets it in its own way (the Archer's bowstring, the
 * Swordsman's sword swing). `throwing` marks the current attack as a special
 * move so its sprite plays that instead of a normal strike — the Spearman's
 * Javelin Toss, the Blade's Cross Slash, the Claymore's Earthsplitter slam, the
 * Greater Orb's throw-down (with `anim` then running over the move's own, longer
 * time); other shapes ignore it. `empowered` marks a unit whose attack
 * has been transformed by an upgrade (the Wizard's unlocked Wind Slice), adding
 * its ambient flourish, or the Magic adventurer casting the Greater Orb (its
 * leaping overhead charge); other shapes ignore it. `playerConfig` supplies the
 * composed avatar for the `player-*` shapes (the player's own adventurer); it is
 * ignored by ordinary champions. `draw` (0..1) is the Bow adventurer's raise +
 * draw for its next shot (see `drawPlayerShortbow`), the Magic adventurer's
 * orb charge (see `drawPlayerCastArms`) or the Claymore's heft wind-up (see
 * `drawClaymore`); others ignore it. No-op for
 * shapes without a sprite; callers should gate on `hasSprite` and fall back to
 * the emoji token.
 */
export function drawUnitSprite(
  ctx: CanvasRenderingContext2D,
  shape: string,
  color: string,
  faceLeft: boolean,
  anim: number,
  throwing = false,
  empowered = false,
  playerConfig?: PlayerSpriteConfig,
  draw = 0,
): void {
  if (shape === 'archer') drawArcher(ctx, color, faceLeft, anim);
  else if (shape === 'sword') drawSwordsman(ctx, color, faceLeft, anim);
  else if (shape === 'spear') drawSpearman(ctx, color, faceLeft, anim, throwing);
  else if (shape === 'crossbow') drawCrossbowman(ctx, color, faceLeft, anim);
  else if (shape === 'farmer') drawFarmer(ctx, color, faceLeft);
  else if (shape === 'wizard') drawWizard(ctx, color, faceLeft, anim, empowered);
  else if (shape === 'elf') drawElf(ctx, color, faceLeft, anim, empowered);
  else if (shape === 'bard') drawBard(ctx, color, faceLeft, anim);
  else if (shape.startsWith('player-') && playerConfig) {
    drawPlayerSprite(ctx, playerConfig, faceLeft, anim, playerWeaponForShape(shape), draw, throwing, empowered);
  }
}

// ============================================================================
// Player adventurer — a composed, preset-driven silhouette.
//
// The champions above are one monolithic function per archetype. The player's
// avatar is instead assembled from interchangeable parts (see
// domain/playerSprite), but it obeys exactly the same drawing conventions so it
// stands beside the champions: authored facing +x (flipped when `faceLeft`),
// origin at the figure's centre with feet near y=+11 and the head near y=-15,
// flat fills, the body built from the shared `anatomy` parts (jointed legs,
// a shaped torso, elbowed arms) and steel/leather materials shared with the
// soldiers. Every part reads a field of the config (build, outfit, accent,
// hair, facial hair, marking, headwear, cloak); the layer order is documented
// on `drawPlayerSprite`. Headwear that covers the crown (cap / hat / helm) makes the hair draw only the fringe beneath it.
// ============================================================================

/** Per-build proportions. */
interface PlayerBuild {
  /** Legacy shoulder sweep (drives the long-hair back mass). */
  sw: number;
  /** Hand spread — also the anchor the held weapons pivot on. */
  hw: number;
  /** Foot spread. */
  leg: number;
  /** Head radius. */
  head: number;
  /** Torso half-widths at the shoulders and the waist. */
  shoulder: number;
  waist: number;
  /** Leg and arm thickness. */
  legW: number;
  armW: number;
}

const PLAYER_BUILDS: Record<string, PlayerBuild> = {
  slim: { sw: 6.0, hw: 5.2, leg: 2.6, head: 3.3, shoulder: 4.0, waist: 3.0, legW: 2.9, armW: 2.3 },
  average: { sw: 7.2, hw: 6.2, leg: 3.2, head: 3.5, shoulder: 4.8, waist: 3.7, legW: 3.3, armW: 2.5 },
  sturdy: { sw: 8.6, hw: 7.4, leg: 4.2, head: 3.7, shoulder: 5.8, waist: 4.9, legW: 3.8, armW: 2.9 },
};

/** Per-outfit cut: where the hem falls and how far it flares past the waist. */
const PLAYER_OUTFITS: Record<string, { hemY: number; flare: number }> = {
  tunic: { hemY: 6.4, flare: 1.4 },
  leather: { hemY: 5.0, flare: 0.7 },
  gambeson: { hemY: 7.0, flare: 1.6 },
  mail: { hemY: 6.6, flare: 1.2 },
  coat: { hemY: 9.6, flare: 2.6 },
  robe: { hemY: 11.2, flare: 3.4 },
};

/** Shared player-sprite materials. */
const P_TROUSERS = '#3a2f26';
const P_BOOT = '#5e3f22';
const P_BRASS = '#d8b04a';
const P_STEEL = '#9aa4b2';
const P_STEEL_DARK = '#6c7684';
const P_STEEL_LIT = '#d5dce4';
const P_PATCH = '#1e1a1c';

/** Torso geometry shared by the outfit, the cloaks and the arm sockets. */
const P_TORSO_TOP = -7.4;
const P_WAIST_Y = 1.2;
const P_SHOULDER_Y = -5.6;

/**
 * A weapon layered onto the composed player avatar. `'none'` is the bare
 * portrait (journal / profile); the martial variants are added when the
 * adventurer is drawn as a deployable champion, one per journal proficiency.
 * `'dual-swords'` (Blade), `'bow'` (Bow) and `'magic'` (the staff-less Magic
 * caster, who conjures the orb in raised bare hands) are the champion variants;
 * `'claymore'` is the Blade's two-handed great sword from its Claymore node,
 * `'longbow'` the Bow's towering longbow from its Longbow node, and `'staff'` the
 * Magic caster's crystal-headed staff from its Arcane Staff node.
 */
export type PlayerWeapon = 'none' | 'dual-swords' | 'claymore' | 'bow' | 'longbow' | 'magic' | 'staff';

/** Headwear that hides the crown of the hair (only a fringe shows beneath). */
const CROWN_COVERING = new Set(['cap', 'hat', 'helm']);

/**
 * Draw the player's custom adventurer described by `cfg`, in the caller's local
 * space (same framing as `drawUnitSprite`). `faceLeft` flips it; `anim` (0..1)
 * eases with an attack (1 just after a strike → 0 at rest) and drives any held
 * weapon's swing — the bare portrait ignores it. `weapon` layers a champion's
 * armament (e.g. the Blade adventurer's two short swords) over the base figure.
 * `draw` (0..1) is the Bow's raise + draw for its next shot, the Magic
 * adventurer's orb charge, or the Claymore's heft wind-up. `special` swaps the
 * weapon's normal strike for its signature move (the Blade's Cross Slash, the
 * Claymore's Earthsplitter slam, the Greater Orb's throw-down), with `anim`
 * running over that move's time — or, for the Staff's Mana Storm hold, how far
 * the staff is hoisted overhead. `empowered` makes the Magic adventurer's charge
 * the Greater Orb's leap (arms raised overhead, legs tucked).
 *
 * Layered back-to-front: cape → back hair (long / braid / ponytail) → legs →
 * neck → outfit → cape clasp → arms + weapon → mantle / scarf → head → war paint
 * → face → markings → facial hair → hair → headwear.
 */
export function drawPlayerSprite(
  ctx: CanvasRenderingContext2D,
  cfg: PlayerSpriteConfig,
  faceLeft: boolean,
  anim = 0,
  weapon: PlayerWeapon = 'none',
  draw = 0,
  special = false,
  empowered = false,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (faceLeft) ctx.scale(-1, 1);
  // The Greater Orb caster's leap (its charge) and throw-down (its signature move).
  const greater = weapon === 'magic' && empowered;
  const tuck = greater ? greaterOrbTuck(special ? anim : 0, special ? 0 : draw) : 0;

  const b = PLAYER_BUILDS[cfg.build] ?? PLAYER_BUILDS.average;
  const skin = cfg.skin;
  const oc = cfg.outfitColor;
  const acc = cfg.accentColor ?? '#6e4a26';
  const cloakC = cfg.cloakColor ?? acc;
  const headC = cfg.headwearColor ?? acc;
  const hairC = cfg.hairColor;
  const hx = 0;
  const hy = -11.6;
  const r = b.head;

  // --- Cape, hanging behind the whole figure ---
  if (cfg.cloak === 'cape') drawPlayerCapeBack(ctx, b, cloakC);

  // --- Back hair (long mass / braid / ponytail) behind the body ---
  drawPlayerBackHair(ctx, cfg.hair, hx, hy, r, b, hairC);

  // --- Legs (a robe hides them; only the boot toes peek out) ---
  // Airborne (`tuck`), the feet draw up and the knees come forward.
  if (cfg.outfit !== 'robe') {
    const legs: LegLook = { cloth: P_TROUSERS, boot: P_BOOT, w: b.legW, bootUp: cfg.outfit === 'coat' ? 0.7 : 0.55 };
    legSide(ctx, -1.4, 4, -b.leg - 0.8 * tuck, 11 - 1.8 * tuck, { ...legs, cloth: shade(legs.cloth, -0.16), boot: shade(legs.boot, -0.12) }, 0.6 + 1.2 * tuck);
    legSide(ctx, 2, 4, b.leg + 0.2 - 0.6 * tuck, 11 - 2.6 * tuck, legs, 1 + 1.6 * tuck);
  } else {
    ctx.fillStyle = shade(P_BOOT, -0.12);
    ctx.beginPath();
    ctx.ellipse(-1.8, 11.1 - 1.4 * tuck, 1.7, 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P_BOOT;
    ctx.beginPath();
    ctx.ellipse(2.6, 11.1 - 2 * tuck, 1.8, 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Neck (behind the collar) ---
  neck(ctx, 0.2, hy + r * 0.4, -6.2, 2.9, shade(skin, -0.16));

  // --- Outfit ---
  drawPlayerOutfit(ctx, cfg, b, skin, oc, acc);
  if (cfg.cloak === 'cape') drawPlayerCapeClasp(ctx, b, cloakC);

  // Mantle / scarf over the shoulders: normally laid over the arms. The armed
  // champions lay it between their sleeves and their weapon / raised forearms
  // (see `drawDualShortSwords`, `drawPlayerShortbow`, `drawPlayerCastArms`), so
  // it still covers the shoulders but never hides a blade, the bow or a hand.
  const drawCloak = () => {
    if (cfg.cloak === 'mantle') drawPlayerMantle(ctx, b, cloakC);
    else if (cfg.cloak === 'scarf') drawPlayerScarf(ctx, cloakC);
  };

  // --- Arms + held weapon ---
  const look = playerArmLook(cfg.outfit, b, skin, oc, acc);
  const backLook: ArmLook = { ...look, sleeve: shade(look.sleeve, -0.12) };
  const sho = b.shoulder - 1.3;
  // A raised near forearm repainted over the head and headwear (the Greater Orb's
  // overhead hands), so a hat brim or long hair never hides it.
  let overHead: (() => void) | null = null;
  if (weapon === 'bow') {
    // A bow shooter needs a proper archer pose (bow arm out to the grip, rear arm
    // on the string), so the shortbow poses its own arms in place of the default
    // hanging ones.
    drawPlayerShortbow(ctx, look, backLook, anim, draw, drawCloak);
  } else if (weapon === 'longbow') {
    // The towering longbow poses both arms like the shortbow; a signature move
    // (`special`) is its Piercing Shot cast, with `anim` running over the cast.
    drawPlayerLongbow(ctx, look, backLook, special ? 0 : anim, draw, special ? anim : 0, acc, drawCloak);
  } else if (weapon === 'magic') {
    // A staff-less caster: hands rest at the sides and only rise to cradle the orb
    // out in front as it charges (higher `anim`) — so the resting pose (cards,
    // idle on the board) matches the other champions. The orb itself is drawn by
    // the renderer (in front of the caster) so it can take the player's colour and
    // animate its charge/flight/burst. The Greater Orb gathers overhead through
    // its leap (`draw`) and hurls it down as its signature move (`special`); a
    // Mana Ray still holds the palms out like the plain cast.
    if (greater && (special || draw > 0)) {
      overHead = drawPlayerGreaterOrbArms(ctx, look, backLook, special ? anim : 0, special ? 0 : draw, b, sho, drawCloak);
    } else {
      drawPlayerCastArms(ctx, look, backLook, anim, draw, b, sho, drawCloak);
    }
  } else if (weapon === 'staff') {
    // The Arcane Staff: held upright at rest, raised two-handed as it kindles
    // (`draw`), then swept forward to point as the volley flies (`anim`). Its
    // signature move (`special`) is the Mana Storm's overhead hold, with `anim`
    // how far the staff is hoisted.
    overHead = drawPlayerStaff(ctx, look, backLook, special ? 0 : anim, special ? 0 : draw, special ? anim : 0, b, sho, oc, drawCloak);
  } else if (weapon === 'dual-swords') {
    // The Blade holds both short swords in a raised guard and cuts with them, so
    // it poses its own arms (see `drawDualShortSwords`).
    drawDualShortSwords(ctx, look, backLook, anim, sho, drawCloak, special);
  } else if (weapon === 'claymore') {
    // Both hands on one long grip: the great blade poses both arms together
    // (see `drawClaymore`).
    drawClaymore(ctx, look, backLook, anim, draw, sho, drawCloak, special);
  } else {
    // Arms hanging at the sides, elbows easing outward.
    arm(ctx, -sho, P_SHOULDER_Y, -b.hw + 1.5, 3.5, backLook, 0.7);
    arm(ctx, sho, P_SHOULDER_Y, b.hw - 0.5, 4, look, -0.7);
  }

  // --- Mantle / scarf over the shoulders ---
  if (weapon === 'none') drawCloak();

  // --- Head, face and everything on it ---
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.fill();
  if (cfg.marking === 'warpaint') drawPlayerWarpaint(ctx, hx, hy, r, acc);
  drawProfileFace(ctx, hx, hy, r, skin, {
    eyeY: 0.45,
    twoEyes: true,
    brow: shade(hairC, -0.2),
    eye: cfg.eyeColor,
    // No blush: on the small three-quarter face it read as a stray nose.
    cheek: false,
    mouth: cfg.facialHair !== 'beard' && cfg.facialHair !== 'longbeard',
  });
  drawPlayerMarking(ctx, cfg.marking, hx, hy, r, skin);
  drawPlayerFacialHair(ctx, cfg.facialHair, hx, hy, r, hairC);
  drawPlayerHair(ctx, cfg.hair, hx, hy, r, hairC, CROWN_COVERING.has(cfg.headwear));
  drawPlayerHeadwear(ctx, cfg.headwear, hx, hy, r, oc, headC);
  overHead?.();

  ctx.restore();
}

/** Sleeve look per outfit: cloth, bracers, mail, cuffs or a bell sleeve. */
function playerArmLook(outfit: string, b: PlayerBuild, skin: string, oc: string, acc: string): ArmLook {
  const w = b.armW;
  switch (outfit) {
    case 'leather':
      return { sleeve: shade(oc, -0.22), hand: skin, w, cuff: shade(acc, -0.08) };
    case 'gambeson':
      return { sleeve: shade(oc, -0.14), hand: skin, w: w + 0.2, cuff: shade(oc, -0.36) };
    case 'mail':
      return { sleeve: P_STEEL_DARK, hand: skin, w, cuff: shade(acc, -0.1) };
    case 'coat':
      return { sleeve: shade(oc, -0.2), hand: skin, w, cuff: shade(oc, -0.42) };
    case 'robe':
      return { sleeve: shade(oc, -0.18), hand: skin, w: w + 0.2, bell: true };
    default:
      return { sleeve: shade(oc, -0.2), hand: skin, w };
  }
}

/** Half-width of the outfit at height `y` (shoulder → waist → hem). */
function outfitWidthAt(y: number, b: PlayerBuild, hemY: number, hem: number): number {
  if (y <= P_WAIST_Y) {
    const t = Math.max(0, (y - P_TORSO_TOP) / (P_WAIST_Y - P_TORSO_TOP));
    return b.shoulder + (b.waist - b.shoulder) * t;
  }
  const t = Math.min(1, (y - P_WAIST_Y) / (hemY - P_WAIST_Y));
  return b.waist + (hem - b.waist) * t;
}

/** The torso garment and its outfit-specific detail. */
function drawPlayerOutfit(
  ctx: CanvasRenderingContext2D,
  cfg: PlayerSpriteConfig,
  b: PlayerBuild,
  skin: string,
  oc: string,
  acc: string,
): void {
  const cut = PLAYER_OUTFITS[cfg.outfit] ?? PLAYER_OUTFITS.tunic;
  const top = P_TORSO_TOP;
  const waistY = P_WAIST_Y;
  const hemY = cut.hemY;
  const hem = b.waist + cut.flare;
  const lit = shade(oc, 0.2);
  const dark = shade(oc, -0.24);
  const fold = shade(oc, -0.36);
  const sh = b.shoulder;
  const body = (color: string, l: string, d: string) =>
    torsoFront(ctx, { color, lit: l, dark: d, top, waistY, hemY, shoulder: sh, waist: b.waist, hem });

  switch (cfg.outfit) {
    case 'leather': {
      body(oc, lit, dark);
      // Chest lacing.
      ctx.strokeStyle = fold;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const y = top + 1.6 + i * 1.5;
        ctx.moveTo(-0.9, y);
        ctx.lineTo(1.1, y + 1);
        ctx.moveTo(1.1, y);
        ctx.lineTo(-0.9, y + 1);
      }
      ctx.stroke();
      // Baldric across the chest, studded.
      const strap = shade(acc, -0.12);
      ctx.strokeStyle = strap;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-sh + 1, top + 1.6);
      ctx.lineTo(b.waist - 0.2, waistY + 1.6);
      ctx.stroke();
      ctx.fillStyle = P_BRASS;
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        ctx.beginPath();
        ctx.arc(-sh + 1 + (b.waist - 0.2 + sh - 1) * t, top + 1.6 + (waistY + 1.6 - top - 1.6) * t, 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      belt(ctx, -b.waist - 0.2, b.waist + 0.2, waistY + 0.6, acc, P_BRASS, 0.8, 1.6, 0.9);
      pauldron(ctx, sh - 1.1, -5.4, 2.2, shade(oc, 0.06), 0.35);
      break;
    }
    case 'gambeson': {
      body(oc, lit, dark);
      // Quilted channels and a centre closure.
      ctx.save();
      ctx.strokeStyle = withAlpha(fold, 0.7);
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      for (let y = top + 2.2; y < hemY - 0.4; y += 1.7) {
        const w = outfitWidthAt(y, b, hemY, hem) - 0.4;
        ctx.moveTo(-w, y);
        ctx.quadraticCurveTo(0, y + 0.55, w, y);
      }
      ctx.moveTo(0.4, top + 1);
      ctx.lineTo(0.5, hemY);
      ctx.stroke();
      ctx.restore();
      // Padded standing collar.
      ctx.fillStyle = shade(oc, 0.08);
      ctx.beginPath();
      ctx.ellipse(0.2, top + 0.2, 2.5, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      belt(ctx, -b.waist - 0.1, b.waist + 0.1, waistY + 0.4, acc, P_BRASS, 0.7, 1.5);
      break;
    }
    case 'mail': {
      // Hauberk of riveted rings…
      body(P_STEEL, P_STEEL_LIT, P_STEEL_DARK);
      ctx.save();
      ctx.strokeStyle = 'rgba(40,46,56,0.38)';
      ctx.lineWidth = 0.32;
      ctx.beginPath();
      let row = 0;
      for (let y = top + 1.6; y < hemY - 0.2; y += 1.05, row++) {
        const w = outfitWidthAt(y, b, hemY, hem) - 0.5;
        for (let x = -w + (row % 2) * 0.5; x <= w; x += 1) {
          ctx.moveTo(x + 0.42, y);
          ctx.arc(x, y, 0.42, 0, Math.PI);
        }
      }
      ctx.stroke();
      ctx.restore();
      // …under a tabard in the outfit colour, edged in the accent.
      const tw = Math.min(sh, b.waist) * 0.62;
      const tabard = () => {
        ctx.beginPath();
        ctx.moveTo(-tw * 0.8, top + 0.6);
        ctx.lineTo(tw * 0.8 + 0.4, top + 0.6);
        ctx.lineTo(tw + 0.6, hemY + 1);
        ctx.lineTo(0.3, hemY + 1.8);
        ctx.lineTo(-tw - 0.2, hemY + 1);
        ctx.closePath();
      };
      tabard();
      ctx.fillStyle = oc;
      ctx.fill();
      ctx.save();
      tabard();
      ctx.clip();
      ctx.fillStyle = lit;
      ctx.fillRect(-tw - 1, top, tw * 0.9, hemY - top + 2);
      ctx.restore();
      tabard();
      ctx.strokeStyle = acc;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // Heraldic lozenge.
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.moveTo(0.3, top + 2.6);
      ctx.lineTo(1.6, top + 4.4);
      ctx.lineTo(0.3, top + 6.2);
      ctx.lineTo(-1, top + 4.4);
      ctx.closePath();
      ctx.fill();
      belt(ctx, -b.waist - 0.3, b.waist + 0.3, waistY + 0.5, shade(acc, -0.2), P_BRASS, 0.7, 1.5);
      break;
    }
    case 'coat': {
      body(oc, lit, dark);
      // Linen shirt in the open V above the waist.
      ctx.fillStyle = '#e6dcc4';
      ctx.beginPath();
      ctx.moveTo(-1.4, top + 0.2);
      ctx.lineTo(1.9, top + 0.2);
      ctx.lineTo(0.5, waistY - 0.4);
      ctx.closePath();
      ctx.fill();
      // The skirts part below the belt, showing the trousers.
      ctx.fillStyle = P_TROUSERS;
      ctx.beginPath();
      ctx.moveTo(0.5, waistY + 1.2);
      ctx.lineTo(3, hemY + 0.6);
      ctx.lineTo(-1.6, hemY + 0.9);
      ctx.closePath();
      ctx.fill();
      // Lapels.
      ctx.fillStyle = lit;
      ctx.beginPath();
      ctx.moveTo(-1.4, top + 0.2);
      ctx.lineTo(-2.6, top + 1.6);
      ctx.lineTo(0.5, waistY - 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(1.9, top + 0.2);
      ctx.lineTo(3.2, top + 1.6);
      ctx.lineTo(0.5, waistY - 0.4);
      ctx.closePath();
      ctx.fill();
      // Buttons down the front edge.
      ctx.fillStyle = acc;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(2.2 - i * 0.4, top + 3 + i * 1.8, 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      belt(ctx, -b.waist - 0.1, b.waist + 0.1, waistY + 0.4, shade(acc, -0.18), P_BRASS, 0.6, 1.4, -0.6);
      break;
    }
    case 'robe': {
      body(oc, lit, dark);
      // Accent trim down the front opening and around the collar.
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-1.8, top + 0.2);
      ctx.lineTo(0.4, top + 3.2);
      ctx.lineTo(2.4, top + 0.2);
      ctx.moveTo(0.4, top + 3.2);
      ctx.quadraticCurveTo(0.2, waistY + 3, 0.8, hemY + 0.6);
      ctx.stroke();
      // Folds in the skirt.
      ctx.strokeStyle = withAlpha(fold, 0.6);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(-2.4, waistY + 2.4);
      ctx.quadraticCurveTo(-2.9, hemY - 3, -3.6, hemY);
      ctx.moveTo(3.2, waistY + 2.4);
      ctx.quadraticCurveTo(3.6, hemY - 3, 4.4, hemY);
      ctx.stroke();
      // Sash with a hanging tail.
      belt(ctx, -b.waist - 0.1, b.waist + 0.1, waistY + 0.4, acc, undefined, 0.8, 1.8);
      seg(ctx, b.waist - 1.2, waistY + 0.8, b.waist - 0.6, waistY + 5, 0.75, 0.6, shade(acc, -0.12));
      break;
    }
    default: {
      // Tunic: a skin V at the neck, a hem band and a belt in the accent.
      body(oc, lit, dark);
      ctx.fillStyle = shade(skin, -0.12);
      ctx.beginPath();
      ctx.moveTo(-1.2, top + 0.1);
      ctx.lineTo(0.5, top + 3);
      ctx.lineTo(2, top + 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = fold;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-1.2, top + 0.1);
      ctx.lineTo(0.5, top + 3);
      ctx.lineTo(2, top + 0.1);
      ctx.stroke();
      ctx.strokeStyle = shade(acc, 0.05);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-hem + 0.2, hemY - 0.5);
      ctx.quadraticCurveTo(0, hemY + 1.1, hem - 0.2, hemY - 0.5);
      ctx.stroke();
      belt(ctx, -b.waist - 0.1, b.waist + 0.1, waistY + 0.4, acc, P_BRASS, 0.7, 1.6);
      break;
    }
  }
}

/** A full cape behind the figure, showing past the shoulders and hem. */
function drawPlayerCapeBack(ctx: CanvasRenderingContext2D, b: PlayerBuild, acc: string): void {
  const sh = b.shoulder;
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(-sh + 0.4, -6.6);
    ctx.quadraticCurveTo(-sh - 2.6, 2, -sh - 3.4, 10.8);
    ctx.quadraticCurveTo(0.4, 12.2, sh + 2, 10.4);
    ctx.quadraticCurveTo(sh + 1.4, 2, sh - 0.6, -6.6);
    ctx.closePath();
  };
  outline();
  ctx.fillStyle = shade(acc, -0.24);
  ctx.fill();
  ctx.save();
  outline();
  ctx.clip();
  // Lit outer fold on the light (-x) side, a darker lining inside the hem.
  ctx.fillStyle = acc;
  ctx.beginPath();
  ctx.moveTo(-sh + 0.4, -6.6);
  ctx.quadraticCurveTo(-sh - 2.6, 2, -sh - 3.4, 10.8);
  ctx.lineTo(-sh - 0.6, 11.4);
  ctx.quadraticCurveTo(-sh - 0.2, 2, -sh + 1.8, -6.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(acc, -0.42);
  ctx.beginPath();
  ctx.ellipse(0.4, 11.6, sh + 3, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The cape's cords and brooch across the collar. */
function drawPlayerCapeClasp(ctx: CanvasRenderingContext2D, b: PlayerBuild, acc: string): void {
  const sh = b.shoulder;
  ctx.fillStyle = shade(acc, -0.08);
  ctx.beginPath();
  ctx.moveTo(-sh + 0.2, -5.2);
  ctx.quadraticCurveTo(-sh + 0.4, -7.4, -1.6, -7.6);
  ctx.lineTo(-1.2, -6.6);
  ctx.quadraticCurveTo(-sh + 1.4, -6.4, -sh + 1.1, -4.8);
  ctx.closePath();
  ctx.moveTo(sh - 0.2, -5.2);
  ctx.quadraticCurveTo(sh - 0.4, -7.4, 2, -7.6);
  ctx.lineTo(1.6, -6.6);
  ctx.quadraticCurveTo(sh - 1.4, -6.4, sh - 1.1, -4.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = P_BRASS;
  ctx.beginPath();
  ctx.arc(0.3, -6.7, 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,248,220,0.8)';
  ctx.beginPath();
  ctx.arc(0, -7, 0.32, 0, Math.PI * 2);
  ctx.fill();
}

/** A short shoulder cape with a scalloped hem, over the arms. */
function drawPlayerMantle(ctx: CanvasRenderingContext2D, b: PlayerBuild, acc: string): void {
  const sh = b.shoulder;
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(-sh - 1.2, -2.4);
    ctx.quadraticCurveTo(-sh - 0.8, -7.6, 0, -8);
    ctx.quadraticCurveTo(sh + 0.8, -7.6, sh + 1.2, -2.4);
    ctx.quadraticCurveTo(sh * 0.55, -0.6, sh * 0.1, -2);
    ctx.quadraticCurveTo(-sh * 0.4, -0.4, -sh - 1.2, -2.4);
    ctx.closePath();
  };
  outline();
  ctx.fillStyle = acc;
  ctx.fill();
  ctx.save();
  outline();
  ctx.clip();
  ctx.fillStyle = shade(acc, 0.16);
  ctx.beginPath();
  ctx.ellipse(-sh * 0.5, -5.6, sh * 0.55, 2, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(acc, -0.22);
  ctx.beginPath();
  ctx.ellipse(sh + 0.6, -3.4, sh * 0.4, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = shade(acc, -0.38);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(sh + 1.2, -2.4);
  ctx.quadraticCurveTo(sh * 0.55, -0.6, sh * 0.1, -2);
  ctx.quadraticCurveTo(-sh * 0.4, -0.4, -sh - 1.2, -2.4);
  ctx.stroke();
  ctx.fillStyle = P_BRASS;
  ctx.beginPath();
  ctx.arc(0.3, -6.9, 0.85, 0, Math.PI * 2);
  ctx.fill();
}

/** A scarf wound at the throat: one tail down the chest, one streaming back. */
function drawPlayerScarf(ctx: CanvasRenderingContext2D, acc: string): void {
  const dark = shade(acc, -0.22);
  // Rear tail fluttering behind the neck.
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-1.8, -7.8);
  ctx.quadraticCurveTo(-5.2, -7.8, -7.4, -5.4);
  ctx.quadraticCurveTo(-5.4, -6, -1.6, -6.4);
  ctx.closePath();
  ctx.fill();
  // Hanging front tail with a fringed end.
  seg(ctx, 1.5, -6.6, 2.3, -1, 1.15, 1, shade(acc, -0.08));
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let i = -1; i <= 1; i++) {
    ctx.moveTo(2.3 + i * 0.5, -0.4);
    ctx.lineTo(2.35 + i * 0.55, 0.5);
  }
  ctx.stroke();
  // The wrap itself.
  ctx.fillStyle = acc;
  ctx.beginPath();
  ctx.ellipse(0.3, -7.3, 3.1, 1.55, 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(acc, 0.16);
  ctx.beginPath();
  ctx.ellipse(-0.6, -7.8, 1.7, 0.6, 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(-2.4, -7.1);
  ctx.quadraticCurveTo(0.3, -6.3, 3, -7.3);
  ctx.stroke();
}

/** Back-layer hair that hangs behind the body: long mass, braid or ponytail. */
function drawPlayerBackHair(
  ctx: CanvasRenderingContext2D,
  hair: string,
  cx: number,
  cy: number,
  r: number,
  b: PlayerBuild,
  hairC: string,
): void {
  if (hair === 'long') {
    ctx.fillStyle = shade(hairC, -0.16);
    ctx.beginPath();
    ctx.moveTo(cx - 2.6, cy - r + 1);
    ctx.quadraticCurveTo(-b.sw + 0.5, -6, -b.hw + 1.5, 4.5);
    ctx.quadraticCurveTo(-2.2, 1, cx - 1.6, cy + 1);
    ctx.closePath();
    ctx.fill();
  } else if (hair === 'ponytail') {
    ctx.fillStyle = shade(hairC, -0.1);
    ctx.beginPath();
    ctx.moveTo(cx - r + 0.3, cy - 1.8);
    ctx.quadraticCurveTo(cx - r - 3.4, cy + 0.4, cx - r - 2.4, cy + 7.4);
    ctx.quadraticCurveTo(cx - r - 1.1, cy + 4, cx - r + 0.7, cy + 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(hairC, 0.06);
    ctx.beginPath();
    ctx.moveTo(cx - r - 0.4, cy - 0.6);
    ctx.quadraticCurveTo(cx - r - 2.6, cy + 1.2, cx - r - 2.3, cy + 5.6);
    ctx.quadraticCurveTo(cx - r - 1.7, cy + 2, cx - r - 0.2, cy + 0.2);
    ctx.closePath();
    ctx.fill();
  } else if (hair === 'braid') {
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? shade(hairC, -0.18) : shade(hairC, -0.04);
      ctx.beginPath();
      ctx.ellipse(cx - r - 0.2 - i * 0.28, cy + 1.2 + i * 1.7, 1.25 - i * 0.07, 1.05, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = shade(hairC, -0.45);
    ctx.fillRect(cx - r - 2.2, cy + 10.8, 1.6, 0.7);
    ctx.fillStyle = shade(hairC, -0.08);
    ctx.beginPath();
    ctx.moveTo(cx - r - 2.1, cy + 11.4);
    ctx.lineTo(cx - r - 2.6, cy + 13);
    ctx.lineTo(cx - r - 1, cy + 11.4);
    ctx.closePath();
    ctx.fill();
  }
}

/** The common hair cap hugging the skull, sweeping to a fringe on the brow. */
function hairCap(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, inset = 0): void {
  const k = inset;
  ctx.beginPath();
  ctx.moveTo(cx - r - 0.6 + k, cy + 2.4 - k * 1.6);
  ctx.quadraticCurveTo(cx - r - 1.0 + k, cy - r - 0.4 + k * 0.6, cx - 0.2, cy - r - 0.6 + k);
  ctx.quadraticCurveTo(cx + r + 1.2 - k, cy - r + 0.3 + k * 0.5, cx + r + 0.7 - k * 1.2, cy + 0.8 - k * 1.4);
  ctx.quadraticCurveTo(cx + r - 0.8, cy - r + 2.8 - k * 0.6, cx + 0.4, cy - r + 2.6 - k);
  ctx.quadraticCurveTo(cx - r + 0.4, cy - r + 3.0 - k, cx - r - 0.6 + k, cy + 2.4 - k * 1.6);
  ctx.closePath();
  ctx.fill();
}

/**
 * The hair over the head. `covered` (a cap, hat or helm on top) draws
 * only the cap and fringe that show beneath it, skipping anything that would
 * poke through (crest, bun, curls, quiff).
 */
function drawPlayerHair(
  ctx: CanvasRenderingContext2D,
  hair: string,
  cx: number,
  cy: number,
  r: number,
  hairC: string,
  covered: boolean,
): void {
  if (hair === 'none') return;
  const lit = shade(hairC, 0.08);
  if (hair === 'mohawk') {
    // Shaved sides…
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = hairC;
    hairCap(ctx, cx, cy, r, 0.7);
    ctx.restore();
    if (covered) return;
    // …and a spiked crest from brow to nape.
    ctx.fillStyle = hairC;
    ctx.beginPath();
    const a0 = -Math.PI / 2 + 0.85;
    const a1 = -Math.PI / 2 - 1.55;
    const n = 7;
    ctx.moveTo(cx + Math.cos(a0) * (r - 0.3), cy + Math.sin(a0) * (r - 0.3));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const tip = r + 2.3 - Math.abs(i - n * 0.4) * 0.22;
      const am = a0 + ((a1 - a0) * (i + 0.5)) / n;
      ctx.lineTo(cx + Math.cos(a) * tip, cy + Math.sin(a) * tip);
      if (i < n) ctx.lineTo(cx + Math.cos(am) * (r + 0.5), cy + Math.sin(am) * (r + 0.5));
    }
    ctx.lineTo(cx + Math.cos(a1) * (r - 0.3), cy + Math.sin(a1) * (r - 0.3));
    ctx.closePath();
    ctx.fill();
    return;
  }

  ctx.fillStyle = hairC;
  hairCap(ctx, cx, cy, r, hair === 'cropped' ? 0.7 : 0);
  if (covered) return;

  if (hair === 'swept') {
    // A quiff rising off the brow and sweeping back.
    ctx.beginPath();
    ctx.moveTo(cx - 0.8, cy - r - 0.3);
    ctx.quadraticCurveTo(cx + r * 0.3, cy - r - 2.8, cx + r + 1.4, cy - r + 0.1);
    ctx.quadraticCurveTo(cx + r * 0.6, cy - r + 0.9, cx + 0.5, cy - r + 1.3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = lit;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - 0.2, cy - r - 0.6);
    ctx.quadraticCurveTo(cx + r * 0.4, cy - r - 2, cx + r + 0.6, cy - r);
    ctx.stroke();
  } else if (hair === 'curly') {
    // Tight curls massed over the crown and down the back.
    const curls: [number, number, number][] = [
      [-2.75, 1.3, 0], [-2.35, 1.35, 0.1], [-1.95, 1.4, 0.2], [-1.55, 1.4, 0.2], [-1.15, 1.35, 0.1],
      [-0.75, 1.2, 0], [2.95, 1.25, 0], [3.35, 1.15, -0.2],
    ];
    for (const [a, cr, d] of curls) {
      ctx.fillStyle = hairC;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (r + 0.2 + d), cy + Math.sin(a) * (r + 0.2 + d), cr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = lit;
    for (const a of [-2.35, -1.55, -0.75]) {
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (r + 0.6) - 0.3, cy + Math.sin(a) * (r + 0.6) - 0.3, 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (hair === 'topknot') {
    ctx.beginPath();
    ctx.arc(cx - 0.9, cy - r - 1.4, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lit;
    ctx.beginPath();
    ctx.arc(cx - 1.4, cy - r - 2, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(hairC, -0.45);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - 2.2, cy - r - 0.2);
    ctx.lineTo(cx + 0.2, cy - r - 0.5);
    ctx.stroke();
  } else if (hair === 'ponytail' || hair === 'braid') {
    // The tie where the tail leaves the head.
    ctx.fillStyle = shade(hairC, -0.45);
    ctx.beginPath();
    ctx.arc(cx - r - 0.1, cy - 0.6, 0.75, 0, Math.PI * 2);
    ctx.fill();
  } else if (hair === 'long') {
    // A lock in front of the ear on the shadow side ties in the back mass.
    ctx.fillStyle = shade(hairC, -0.08);
    ctx.beginPath();
    ctx.moveTo(cx - r - 0.6, cy - 0.6);
    ctx.quadraticCurveTo(cx - r - 1.4, cy + 3, cx - r + 0.6, cy + 3.4);
    ctx.quadraticCurveTo(cx - r + 0.4, cy + 0.6, cx - r - 0.6, cy - 0.6);
    ctx.closePath();
    ctx.fill();
  }
  // A lit strand along the crown for every full style.
  if (hair !== 'curly' && hair !== 'cropped') {
    ctx.strokeStyle = withAlpha(lit, 0.45);
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.7, cy - r * 0.55);
    ctx.quadraticCurveTo(cx - r * 0.1, cy - r - 0.4, cx + r * 0.6, cy - r * 0.7);
    ctx.stroke();
  }
}

/** Face geometry matching `drawProfileFace(..., { eyeY: 0.45, twoEyes: true })`. */
function playerFace(cx: number, cy: number, r: number) {
  const ey = cy + 0.45;
  return { ex: cx + r * 0.38, ex2: cx - r * 0.18, ey, mx: cx + r * 0.12, my: ey + r * 0.6 };
}

/** War paint: a band across the eyes and cheek stripes, under the eyes/brows. */
function drawPlayerWarpaint(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, acc: string): void {
  const { ey, ex } = playerFace(cx, cy, r);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = withAlpha(acc, 0.85);
  ctx.beginPath();
  ctx.moveTo(cx - r, ey - r * 0.32);
  ctx.lineTo(cx + r, ey - r * 0.4);
  ctx.lineTo(cx + r, ey + r * 0.2);
  ctx.lineTo(cx - r, ey + r * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = withAlpha(acc, 0.85);
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.moveTo(ex - r * 0.12, ey + r * 0.38);
  ctx.lineTo(ex - r * 0.04, ey + r * 0.78);
  ctx.moveTo(ex + r * 0.16, ey + r * 0.36);
  ctx.lineTo(ex + r * 0.24, ey + r * 0.72);
  ctx.stroke();
  ctx.restore();
}

/** Freckles, a stitched scar or an eyepatch, painted over the face. */
function drawPlayerMarking(ctx: CanvasRenderingContext2D, marking: string, cx: number, cy: number, r: number, skin: string): void {
  if (!marking || marking === 'none' || marking === 'warpaint') return;
  const { ex, ex2, ey } = playerFace(cx, cy, r);
  if (marking === 'freckles') {
    ctx.fillStyle = withAlpha(shade(skin, -0.38), 0.85);
    const dots: [number, number][] = [
      [ex - r * 0.12, ey + r * 0.4], [ex + r * 0.06, ey + r * 0.52], [ex + r * 0.22, ey + r * 0.38],
      [ex + r * 0.36, ey + r * 0.5], [ex2 - r * 0.06, ey + r * 0.42], [ex2 - r * 0.24, ey + r * 0.34],
      [cx + r * 0.1, ey + r * 0.3],
    ];
    for (const [x, y] of dots) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (marking === 'scar') {
    ctx.strokeStyle = shade(skin, -0.36);
    ctx.lineWidth = r * 0.085;
    ctx.beginPath();
    ctx.moveTo(ex - r * 0.16, ey - r * 0.66);
    ctx.lineTo(ex + r * 0.2, ey + r * 0.52);
    ctx.stroke();
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    for (const t of [0.3, 0.62]) {
      const x = ex - r * 0.16 + r * 0.36 * t;
      const y = ey - r * 0.66 + r * 1.18 * t;
      ctx.moveTo(x - r * 0.12, y + r * 0.02);
      ctx.lineTo(x + r * 0.12, y - r * 0.04);
    }
    ctx.stroke();
  } else if (marking === 'eyepatch') {
    ctx.strokeStyle = P_PATCH;
    ctx.lineWidth = r * 0.11;
    ctx.beginPath();
    ctx.moveTo(ex + r * 0.1, ey - r * 0.12);
    ctx.quadraticCurveTo(cx, cy - r * 0.62, cx - r * 0.98, cy - r * 0.42);
    ctx.stroke();
    ctx.fillStyle = P_PATCH;
    ctx.beginPath();
    ctx.ellipse(ex, ey + r * 0.02, r * 0.27, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(ex - r * 0.08, ey - r * 0.08, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Stubble, moustache, goatee or a beard (short or long), in the hair colour. */
function drawPlayerFacialHair(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, r: number, hairC: string): void {
  if (!kind || kind === 'none') return;
  const { mx, my } = playerFace(cx, cy, r);
  const lit = shade(hairC, 0.07);
  // Two lobes under the nose, tips lifting slightly so it never reads as a frown.
  const moustache = () => {
    ctx.beginPath();
    ctx.ellipse(mx - r * 0.12, my - r * 0.17, r * 0.27, r * 0.12, 0.28, 0, Math.PI * 2);
    ctx.ellipse(mx + r * 0.22, my - r * 0.19, r * 0.27, r * 0.12, -0.28, 0, Math.PI * 2);
    ctx.fill();
  };
  if (kind === 'stubble') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 0.05, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 0.36;
    ctx.fillStyle = hairC;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy + r * 0.05);
    ctx.lineTo(cx - r * 0.6, cy + r * 0.1);
    ctx.quadraticCurveTo(cx - r * 0.4, my - r * 0.25, mx - r * 0.1, my - r * 0.22);
    ctx.quadraticCurveTo(mx + r * 0.3, my - r * 0.32, cx + r, cy + r * 0.3);
    ctx.lineTo(cx + r, cy + r * 1.2);
    ctx.lineTo(cx - r, cy + r * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = hairC;
  if (kind === 'moustache') {
    moustache();
    return;
  }
  if (kind === 'goatee') {
    moustache();
    ctx.beginPath();
    ctx.ellipse(mx + r * 0.06, cy + r * 0.98, r * 0.24, r * 0.36, 0.1, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // A beard framing the jaw from the sideburn round the chin; the long beard
  // runs on to a tapering point.
  const len = kind === 'longbeard' ? 4 : 1;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.98, cy - r * 0.08);
  ctx.lineTo(cx - r * 0.66, cy - r * 0.08);
  ctx.quadraticCurveTo(cx - r * 0.52, my - r * 0.3, mx - r * 0.16, my - r * 0.12);
  ctx.quadraticCurveTo(mx + r * 0.1, my - r * 0.36, mx + r * 0.46, my - r * 0.06);
  ctx.quadraticCurveTo(cx + r * 0.86, cy + r * 0.45, cx + r * 0.97, cy + r * 0.18);
  ctx.quadraticCurveTo(cx + r * 1.05, cy + r + len * 0.35, cx + r * 0.25, cy + r + len);
  ctx.quadraticCurveTo(cx - r * 0.85, cy + r + len * 0.45, cx - r * 0.98, cy - r * 0.08);
  ctx.closePath();
  ctx.fill();
  // Lit strands and the mouth set into the beard.
  ctx.strokeStyle = withAlpha(lit, 0.5);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(mx - r * 0.3, my + r * 0.36);
  ctx.quadraticCurveTo(mx - r * 0.1, cy + r + len * 0.5, cx + r * 0.2, cy + r + len * 0.85);
  ctx.moveTo(mx + r * 0.3, my + r * 0.3);
  ctx.quadraticCurveTo(mx + r * 0.36, cy + r + len * 0.3, cx + r * 0.36, cy + r + len * 0.6);
  ctx.stroke();
  ctx.strokeStyle = shade(hairC, -0.5);
  ctx.lineWidth = r * 0.09;
  ctx.beginPath();
  ctx.moveTo(mx - r * 0.12, my + r * 0.12);
  ctx.lineTo(mx + r * 0.18, my + r * 0.08);
  ctx.stroke();
}

/** Headwear, drawn last so it sits over the hair. */
function drawPlayerHeadwear(
  ctx: CanvasRenderingContext2D,
  kind: string,
  cx: number,
  cy: number,
  r: number,
  oc: string,
  acc: string,
): void {
  if (!kind || kind === 'none') return;
  if (kind === 'cap') {
    // A soft cap with a forward peak and a feather in the outfit colour.
    const feather = shade(oc, 0.12);
    ctx.fillStyle = feather;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.2, cy - r - 0.6);
    ctx.quadraticCurveTo(cx - r - 2, cy - r - 3.4, cx - r - 4.4, cy - r - 2);
    ctx.quadraticCurveTo(cx - r - 1.6, cy - r - 1.2, cx - r * 0.2, cy - r + 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(feather, -0.3);
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.2, cy - r - 0.2);
    ctx.quadraticCurveTo(cx - r - 1.8, cy - r - 2.2, cx - r - 4.2, cy - r - 2);
    ctx.stroke();
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.moveTo(cx - r - 0.8, cy - r * 0.15);
    ctx.quadraticCurveTo(cx - r * 0.7, cy - r - 2.2, cx + r * 0.4, cy - r - 1.3);
    ctx.quadraticCurveTo(cx + r + 0.8, cy - r * 0.65, cx + r + 2.2, cy - r * 0.2);
    ctx.lineTo(cx + r * 0.55, cy - r * 0.18);
    ctx.quadraticCurveTo(cx, cy - r * 0.45, cx - r - 0.8, cy - r * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(acc, 0.18);
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.3, cy - r - 0.6, r * 0.6, 0.6, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(acc, -0.38);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - r - 0.6, cy - r * 0.2);
    ctx.quadraticCurveTo(cx, cy - r * 0.5, cx + r * 0.6, cy - r * 0.24);
    ctx.stroke();
  } else if (kind === 'hat') {
    // A wide-brimmed traveller's hat.
    const crown = () => {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.9, cy - r * 0.55);
      ctx.quadraticCurveTo(cx - r * 0.95, cy - r - 2.5, cx + 0.1, cy - r - 2.7);
      ctx.quadraticCurveTo(cx + r * 0.95, cy - r - 2.5, cx + r * 0.9, cy - r * 0.55);
      ctx.closePath();
    };
    ctx.fillStyle = acc;
    crown();
    ctx.fill();
    ctx.save();
    crown();
    ctx.clip();
    ctx.fillStyle = shade(acc, 0.16);
    ctx.fillRect(cx - r, cy - r - 3, r * 0.8, r + 3);
    ctx.fillStyle = shade(acc, -0.42);
    ctx.fillRect(cx - r, cy - r * 0.95, r * 2, 0.95);
    ctx.restore();
    ctx.fillStyle = shade(acc, -0.12);
    ctx.beginPath();
    ctx.ellipse(cx + 0.3, cy - r * 0.55, r + 3.3, 1.15, -0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(acc, 0.22);
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.ellipse(cx + 0.3, cy - r * 0.55, r + 3.3, 1.15, -0.05, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  } else if (kind === 'headband') {
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.98, cy - r * 0.18);
    ctx.quadraticCurveTo(cx, cy - r * 0.98, cx + r * 0.96, cy - r * 0.42);
    ctx.stroke();
    // Knot and tails at the back.
    ctx.fillStyle = shade(acc, -0.15);
    ctx.beginPath();
    ctx.arc(cx - r - 0.1, cy - r * 0.2, 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - r - 0.2, cy - r * 0.35);
    ctx.quadraticCurveTo(cx - r - 2, cy - r * 0.2, cx - r - 2.9, cy + 1.2);
    ctx.lineTo(cx - r - 2.1, cy + 1.4);
    ctx.quadraticCurveTo(cx - r - 1.2, cy, cx - r - 0.1, cy - r * 0.05);
    ctx.closePath();
    ctx.moveTo(cx - r - 0.1, cy - r * 0.1);
    ctx.quadraticCurveTo(cx - r - 1.2, cy + 0.6, cx - r - 1.6, cy + 2.4);
    ctx.lineTo(cx - r - 0.9, cy + 2.4);
    ctx.quadraticCurveTo(cx - r - 0.6, cy + 0.8, cx - r + 0.2, cy);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'circlet') {
    ctx.strokeStyle = P_BRASS;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.99, cy - r * 0.12);
    ctx.quadraticCurveTo(cx, cy - r * 0.95, cx + r * 0.97, cy - r * 0.38);
    ctx.stroke();
    const gx = cx + r * 0.42;
    const gy = cy - r * 0.66;
    ctx.fillStyle = P_BRASS;
    ctx.beginPath();
    ctx.arc(gx, gy, 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.moveTo(gx, gy - 0.75);
    ctx.lineTo(gx + 0.55, gy);
    ctx.lineTo(gx, gy + 0.75);
    ctx.lineTo(gx - 0.55, gy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(gx - 0.15, gy - 0.25, 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'helm') {
    // An open-faced nasal helm with a plume in the accent colour.
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - r - 0.4, cy - r * 0.4);
    ctx.quadraticCurveTo(cx - r * 0.3, cy - r - 3.8, cx + r * 0.5, cy - r - 1);
    ctx.stroke();
    const dome = () => {
      ctx.beginPath();
      ctx.moveTo(cx - r - 0.6, cy + r * 0.4);
      ctx.quadraticCurveTo(cx - r - 1.1, cy - r - 1.6, cx + 0.2, cy - r - 1.3);
      ctx.quadraticCurveTo(cx + r + 1.2, cy - r - 1, cx + r + 0.6, cy - r * 0.32);
      ctx.lineTo(cx - r * 0.2, cy - r * 0.42);
      ctx.lineTo(cx - r * 0.5, cy + r * 0.3);
      ctx.closePath();
    };
    ctx.fillStyle = P_STEEL;
    dome();
    ctx.fill();
    ctx.save();
    dome();
    ctx.clip();
    ctx.fillStyle = P_STEEL_LIT;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r - 0.2, r * 0.65, 0.75, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P_STEEL_DARK;
    ctx.beginPath();
    ctx.ellipse(cx - r - 0.4, cy, 1.3, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = P_STEEL_DARK;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.2, cy - r * 0.42);
    ctx.lineTo(cx + r + 0.6, cy - r * 0.32);
    ctx.stroke();
    seg(ctx, cx + r * 0.12, cy - r * 0.42, cx + r * 0.1, cy + r * 0.4, 0.42, 0.34, P_STEEL);
    ctx.fillStyle = P_STEEL_DARK;
    for (const t of [0.15, 0.45, 0.75]) {
      ctx.beginPath();
      ctx.arc(cx - r * 0.2 + (r * 1.2 + 0.6) * t, cy - r * 0.42 + r * 0.1 * t - 0.05, 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * One pose of a Blade-adventurer arm: where the hand is, the angle the blade
 * points (degrees from +x, y-down: -90 = straight up) and the elbow bend.
 */
interface BladePose {
  x: number;
  y: number;
  ang: number;
  bend: number;
}

// Keyframes for both arms, authored facing +x. Rest is a ready guard: lead hand
// out at chest height with its blade raised forward, off blade
// held low and forward. The strike is a crossing double cut: the lead blade chops
// from high over the shoulder down through the space ahead, then the off blade
// rips back up across it.
const LEAD_GUARD: BladePose = { x: 6.6, y: -1.2, ang: -48, bend: 1.4 };
const LEAD_RAISED: BladePose = { x: 4.4, y: -13.4, ang: -150, bend: 1.2 };
const LEAD_CUT: BladePose = { x: 8.6, y: 3.4, ang: 58, bend: 0.6 };
const OFF_GUARD: BladePose = { x: -0.6, y: 2.6, ang: 22, bend: 1.2 };
const OFF_LOW: BladePose = { x: -4.2, y: 4.6, ang: 150, bend: 1 };
const OFF_CUT: BladePose = { x: 8.4, y: -5.4, ang: -64, bend: 1.2 };

// Cross Slash keyframes (the Blade's every-third-attack X cut). The hero coils
// both blades wide — lead raised high with its blade laid back over the head,
// off blade dropped low behind — then cuts both through the space ahead at
// once: the lead chops down and the off rips up, so their tips cross in an X.
// The follow-through holds both arms out before easing back to the guard.
const LEAD_COIL: BladePose = { x: 4, y: -14.6, ang: -168, bend: 1.3 };
const LEAD_XCUT: BladePose = { x: 9.6, y: 4.4, ang: 64, bend: 0.5 };
const LEAD_XHOLD: BladePose = { x: 9.2, y: 5.2, ang: 74, bend: 0.5 };
const OFF_COIL: BladePose = { x: -5.2, y: 5.4, ang: 168, bend: 0.9 };
const OFF_XCUT: BladePose = { x: 8.8, y: -7.6, ang: -68, bend: 1 };
const OFF_XHOLD: BladePose = { x: 8.4, y: -8.4, ang: -80, bend: 1 };

const mixPose = (a: BladePose, c: BladePose, k: number): BladePose => ({
  x: a.x + (c.x - a.x) * k,
  y: a.y + (c.y - a.y) * k,
  ang: a.ang + (c.ang - a.ang) * k,
  bend: a.bend + (c.bend - a.bend) * k,
});

/**
 * A three-beat swing through `u` (0 = the instant the attack fires → 1 = back at
 * rest): wound up at `raised`, a fast eased cut to `cut` over `[c0, c1]`, then a
 * smooth recovery to `guard`. Before `c0` it eases from `raised` toward the cut's
 * start so the frame never holds still.
 */
function swingPose(
  u: number,
  guard: BladePose,
  raised: BladePose,
  cut: BladePose,
  c0: number,
  c1: number,
): BladePose {
  if (u >= 1) return guard;
  if (u < c0) return raised;
  if (u < c1) return mixPose(raised, cut, ease.outCubic((u - c0) / (c1 - c0)));
  return mixPose(cut, guard, ease.inOutSine((u - c1) / (1 - c1)));
}

/**
 * A signature move through `u` (0 = the instant it starts → 1 = back at rest):
 * eased from `guard` into a visible `coil` that is reached a little before `c0`
 * and held, a fast cut to `cut` over `[c0, c1]`, a held follow-through drifting
 * to `hold` until `h`, then a smooth recovery to `guard`.
 */
function signaturePose(
  u: number,
  guard: BladePose,
  coil: BladePose,
  cut: BladePose,
  hold: BladePose,
  c0: number,
  c1: number,
  h: number,
): BladePose {
  if (u >= 1) return guard;
  if (u < c0) return mixPose(guard, coil, ease.inOutSine(Math.min(1, u / (c0 * 0.8))));
  if (u < c1) return mixPose(coil, cut, ease.outCubic((u - c0) / (c1 - c0)));
  if (u < h) return mixPose(cut, hold, ease.outQuad((u - c1) / (h - c1)));
  return mixPose(hold, guard, ease.inOutSine((u - h) / (1 - h)));
}

const DEG = Math.PI / 180;
const LEAD_LEN = 11;
const OFF_LEN = 10;

/**
 * The Blade adventurer's arms and two short swords, in the base figure's local
 * space (already flipped for `faceLeft`). `anim` is the shared attack value (1 at
 * the instant of a strike → 0 at rest); read as swing progress `u = 1 - anim`,
 * the lead blade snaps up over the shoulder and chops down through the target,
 * the off blade follows a beat later with a rising cut across it. At rest
 * (cards, idle on the board) both swords sit in a ready guard.
 *
 * Layered sleeves → `cloak` (the mantle / scarf, so it covers the shoulders
 * and upper arms) → swords → fists: each blade is held out in front of its own
 * forearm and over the mantle, and only the fist closes over its grip. The off
 * (far) side goes before the lead side throughout. The slash streaks are a
 * separate pass (`drawBladeTrails`) so the figure compositor doesn't ink them.
 *
 * `cross` plays the Cross Slash instead (`anim` then runs over
 * `CROSS_SLASH_ANIM_TIME`): coil, then both blades cut at once in an X.
 */
function drawDualShortSwords(
  ctx: CanvasRenderingContext2D,
  look: ArmLook,
  backLook: ArmLook,
  anim: number,
  sho: number,
  cloak: () => void,
  cross = false,
): void {
  const steel = '#c9d2dc';
  const steelDark = '#8b95a3';
  const u = 1 - Math.max(0, Math.min(1, anim));
  const lead = cross ? crossLeadPoseAt(u) : leadPoseAt(u);
  const off = cross ? crossOffPoseAt(u) : offPoseAt(u);
  arm(ctx, -sho, P_SHOULDER_Y, off.x, off.y, backLook, off.bend);
  arm(ctx, sho, P_SHOULDER_Y, lead.x, lead.y, look, lead.bend);
  cloak();
  drawShortSword(ctx, off.x, off.y, off.ang * DEG, OFF_LEN, steel, steelDark);
  fist(ctx, off.x, off.y, backLook);
  drawShortSword(ctx, lead.x, lead.y, lead.ang * DEG, LEAD_LEN, steel, steelDark);
  fist(ctx, lead.x, lead.y, look);
}

/** A closed hand over a sword grip — the same disc `arm` ends in. */
function fist(ctx: CanvasRenderingContext2D, x: number, y: number, look: ArmLook): void {
  ctx.fillStyle = look.hand;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.1, (look.w / 2) * 0.66), 0, Math.PI * 2);
  ctx.fill();
}

// Cut windows (in swing progress `u`) for each blade.
const LEAD_CUT_U: [number, number] = [0.04, 0.36];
const OFF_CUT_U: [number, number] = [0.3, 0.62];
const leadPoseAt = (u: number) => swingPose(u, LEAD_GUARD, LEAD_RAISED, LEAD_CUT, ...LEAD_CUT_U);
const offPoseAt = (u: number) => swingPose(u, OFF_GUARD, OFF_LOW, OFF_CUT, ...OFF_CUT_U);

// The Cross Slash's shared cut window and follow-through end (in `u`): the blades
// cross mid-cut at u ≈ 0.38, which is where the engine lands the X
// (`CROSS_SLASH_HIT_DELAY` / `CROSS_SLASH_ANIM_TIME`).
const CROSS_CUT_U: [number, number] = [0.3, 0.46];
const CROSS_HOLD_U = 0.62;
const crossLeadPoseAt = (u: number) =>
  signaturePose(u, LEAD_GUARD, LEAD_COIL, LEAD_XCUT, LEAD_XHOLD, ...CROSS_CUT_U, CROSS_HOLD_U);
const crossOffPoseAt = (u: number) =>
  signaturePose(u, OFF_GUARD, OFF_COIL, OFF_XCUT, OFF_XHOLD, ...CROSS_CUT_U, CROSS_HOLD_U);

/**
 * The Blade adventurer's slash streaks for attack value `anim` (same meaning as
 * in `drawUnitSprite`), drawn by the renderer straight after the figure in the
 * same local frame — outside the compositor, so they stay clean light rather
 * than inked shapes. `faceLeft` mirrors them like the sprite. `cross` draws the
 * Cross Slash's instead: a gleam on the coiled lead blade, then the X itself
 * (`drawCrossStreaks`).
 */
export function drawBladeTrails(ctx: CanvasRenderingContext2D, faceLeft: boolean, anim: number, cross = false): void {
  const u = 1 - Math.max(0, Math.min(1, anim));
  if (u >= 1) return;
  ctx.save();
  if (faceLeft) ctx.scale(-1, 1);
  if (cross) {
    // The gleam: swells as the coil is reached, gone as the cut begins.
    const g = (u - 0.1) / (CROSS_CUT_U[0] - 0.1);
    if (g > 0 && g < 1) {
      const p = crossLeadPoseAt(u);
      const r = LEAD_LEN * 0.72;
      drawGleam(ctx, p.x + Math.cos(p.ang * DEG) * r, p.y + Math.sin(p.ang * DEG) * r, Math.sin(Math.PI * g));
    }
    drawCrossStreaks(ctx, u);
  } else {
    drawBladeTrail(ctx, offPoseAt, u, ...OFF_CUT_U, OFF_LEN);
    drawBladeTrail(ctx, leadPoseAt, u, ...LEAD_CUT_U, LEAD_LEN);
  }
  ctx.restore();
}

// The Cross Slash's X: where its two cuts cross (chest height, ahead of the
// hero), each cut's half-length, and its tilt from level.
const X_CENTER = { x: 14.5, y: -4.5 };
const X_HALF = 12;
const X_TILT = 52 * DEG;

/**
 * The Cross Slash's X: two straight, tapered cuts that wipe across the space
 * ahead as the blades pass through it over the cut window — the lead's chop
 * from top-back down to bottom-front ("\"), the off blade's rip from
 * bottom-back up to top-front ("/") — crossing at chest height, then fading.
 * Mirrors the X mark the board paints over the foe it lands on.
 */
function drawCrossStreaks(ctx: CanvasRenderingContext2D, u: number): void {
  const [c0, c1] = CROSS_CUT_U;
  if (u <= c0) return;
  const fade = u <= c1 ? 1 : Math.max(0, 1 - (u - c1) / 0.3);
  if (fade <= 0) return;
  const grow = ease.outCubic(Math.min(1, (u - c0) / (c1 - c0)));
  const len = 2 * X_HALF * grow;
  // Thick while the cut is fresh, thinning as it fades.
  const w = 2.2 * (0.55 + 0.45 * fade);
  for (const tilt of [X_TILT, -X_TILT]) {
    ctx.save();
    ctx.translate(X_CENTER.x - Math.cos(tilt) * X_HALF, X_CENTER.y - Math.sin(tilt) * X_HALF);
    ctx.rotate(tilt);
    for (const [style, k] of [
      [`rgba(214,228,244,${0.55 * fade})`, 1],
      [`rgba(255,255,255,${0.95 * fade})`, 0.42],
    ] as const) {
      ctx.fillStyle = style;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.55, -w * k, len, 0);
      ctx.quadraticCurveTo(len * 0.55, w * k, 0, 0);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** A four-point glint of light at (x, y), `k` (0..1) its strength. */
function drawGleam(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  if (k <= 0) return;
  const r = 1.4 + 3.6 * k;
  ctx.save();
  const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 1.5);
  halo.addColorStop(0, `rgba(255,255,255,${0.55 * k})`);
  halo.addColorStop(1, 'rgba(214,228,244,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${0.95 * k})`;
  ctx.beginPath();
  const w = r * 0.2;
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + w, y - w);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + w, y + w);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - w, y + w);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - w, y - w);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * A slash streak behind a swinging blade: the path its tip swept over the last
 * stretch of the cut window `[c0, c1]`, drawn as a ribbon that tapers to nothing
 * at its tail and fades out once the cut is over.
 */
function drawBladeTrail(
  ctx: CanvasRenderingContext2D,
  poseAt: (u: number) => BladePose,
  u: number,
  c0: number,
  c1: number,
  len: number,
): void {
  if (u <= c0) return;
  const head = Math.min(u, c1);
  const tail = Math.max(c0, head - 0.13);
  // Fade out over the recovery after the cut lands.
  const fade = u <= c1 ? 1 : Math.max(0, 1 - (u - c1) / 0.18);
  if (fade <= 0 || head - tail < 0.005) return;
  const tip = (v: number) => {
    const p = poseAt(v);
    const r = len + 1.2;
    return { x: p.x + Math.cos(p.ang * DEG) * r, y: p.y + Math.sin(p.ang * DEG) * r };
  };
  const N = 8;
  ctx.save();
  ctx.lineCap = 'round';
  let prev = tip(tail);
  for (let i = 1; i <= N; i++) {
    const k = i / N; // 0 at the tail → 1 at the blade
    const pt = tip(tail + (head - tail) * k);
    ctx.strokeStyle = `rgba(214,228,244,${0.35 * k * fade})`;
    ctx.lineWidth = 0.6 + 2.6 * k;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.75 * k * fade})`;
    ctx.lineWidth = 0.3 + 0.9 * k;
    ctx.stroke();
    prev = pt;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The Claymore — the Blade adventurer's two-handed great sword (Claymore node).
// ---------------------------------------------------------------------------

/**
 * One pose of the Claymore: the lead (near) hand on the grip just under the
 * guard, the blade's angle (degrees from +x, y-down: -90 = straight up) and each
 * elbow's bend. The back (far) hand sits `CLAY_GRIP_GAP` further down the grip,
 * toward the pommel.
 */
interface ClaymorePose {
  x: number;
  y: number;
  ang: number;
  bend: number;
  backBend: number;
}

/** Blade length past the guard, and the gap between the two hands on the grip. */
const CLAY_LEN = 20;
const CLAY_GRIP_GAP = 2.8;
/** Distance from the lead hand to the blade's point (guard + blade). */
const CLAY_REACH = 2.6 + CLAY_LEN + 0.8;

// Keyframes, authored facing +x.
//  - Rest: a high guard, the great blade raised forward in both hands.
//  - Heft (the wind-up, driven by the charge): the blade is raised upright in
//    front of the face (lift), then the hands climb beside the head as it tips
//    back over it — so it never seems to sprout from behind the head.
//  - Cleave: the blade comes over the top and down through the arc ahead, its
//    weight carrying it on into a low follow-through, then it is lifted back.
//  - Slam (Earthsplitter): hoisted straight up, then drawn back further over the
//    head and held there trembling (the wind-up), then driven point-first into
//    the ground ahead and held there a beat before it is wrenched free.
const CLAY_REST: ClaymorePose = { x: 5.4, y: 1.4, ang: -64, bend: 1.2, backBend: 1.4 };
const CLAY_LIFT: ClaymorePose = { x: 7, y: -7.4, ang: -100, bend: 1, backBend: 1.2 };
const CLAY_HEFT: ClaymorePose = { x: 3.4, y: -14.2, ang: -160, bend: 1, backBend: 1.2 };
const CLAY_CUT: ClaymorePose = { x: 9, y: 3, ang: 22, bend: 0.4, backBend: 0.7 };
const CLAY_FOLLOW: ClaymorePose = { x: 8.4, y: 5, ang: 46, bend: 0.5, backBend: 0.8 };
const CLAY_HOIST: ClaymorePose = { x: 4.8, y: -15.4, ang: -96, bend: 0.9, backBend: 1.1 };
const CLAY_WIND: ClaymorePose = { x: 2.8, y: -16.4, ang: -128, bend: 1, backBend: 1.2 };
const CLAY_SLAM: ClaymorePose = { x: 9.4, y: 4.6, ang: 62, bend: 0.4, backBend: 0.6 };
const CLAY_STUCK: ClaymorePose = { x: 9, y: 5.2, ang: 64, bend: 0.45, backBend: 0.65 };

const mixClay = (a: ClaymorePose, c: ClaymorePose, k: number): ClaymorePose => ({
  x: a.x + (c.x - a.x) * k,
  y: a.y + (c.y - a.y) * k,
  ang: a.ang + (c.ang - a.ang) * k,
  bend: a.bend + (c.bend - a.bend) * k,
  backBend: a.backBend + (c.backBend - a.backBend) * k,
});

// Cut windows (in swing progress `u`). The cleave lands as the release begins
// (the engine strikes the arc on release); the slam's blade meets the ground at
// the end of its window, u = 0.571 — `EARTHSPLITTER_HIT_DELAY` /
// `EARTHSPLITTER_ANIM_TIME` — so retime them together. Before it: the hoist
// (to `CLAY_HOIST_U`), then the held wind-up.
const CLAY_CUT_U: [number, number] = [0, 0.2];
const CLAY_SLAM_U: [number, number] = [0.46, 0.571];
const CLAY_HOIST_U = 0.18;

/** The cleave's release `u` (0 = the swing starts from the heft → 1 = at rest). */
function claymoreCleavePose(u: number): ClaymorePose {
  if (u >= 1) return CLAY_REST;
  const [c0, c1] = CLAY_CUT_U;
  if (u < c1) return mixClay(CLAY_HEFT, CLAY_CUT, ease.outCubic((u - c0) / (c1 - c0)));
  if (u < 0.45) return mixClay(CLAY_CUT, CLAY_FOLLOW, ease.outQuad((u - c1) / (0.45 - c1)));
  return mixClay(CLAY_FOLLOW, CLAY_REST, ease.inOutSine((u - 0.45) / 0.55));
}

/** The Earthsplitter slam through `u` (0 = cast → 1 = back at rest). */
function claymoreSlamPose(u: number): ClaymorePose {
  if (u >= 1) return CLAY_REST;
  const [c0, c1] = CLAY_SLAM_U;
  if (u < CLAY_HOIST_U) return mixClay(CLAY_REST, CLAY_HOIST, ease.inOutSine(u / CLAY_HOIST_U));
  if (u < c0) {
    // The wind-up: drawn slowly back over the head and held there, the arms
    // trembling under the weight harder the longer it is held.
    const k = (u - CLAY_HOIST_U) / (c0 - CLAY_HOIST_U);
    const p = mixClay(CLAY_HOIST, CLAY_WIND, ease.outCubic(Math.min(1, k * 1.4)));
    const shake = 0.45 * k * Math.sin(u * 170);
    return { ...p, x: p.x + shake * 0.6, y: p.y + shake * 0.4, ang: p.ang + shake * 3 };
  }
  // A heavy fall: it accelerates all the way down, then stops dead in the ground.
  if (u < c1) return mixClay(CLAY_WIND, CLAY_SLAM, ease.inCubic((u - c0) / (c1 - c0)));
  if (u < 0.78) return mixClay(CLAY_SLAM, CLAY_STUCK, ease.outQuad((u - c1) / (0.78 - c1)));
  return mixClay(CLAY_STUCK, CLAY_REST, ease.inOutSine((u - 0.78) / 0.22));
}

/**
 * How far the Earthsplitter's wind-up has gathered at slam progress `u`: 0
 * through the hoist, ramping to 1 just as the blade falls, then 0 again.
 */
function claymoreGather(u: number): number {
  const [c0, c1] = CLAY_SLAM_U;
  if (u < CLAY_HOIST_U * 0.6 || u >= c1) return 0;
  if (u < c0) {
    const k = (u - CLAY_HOIST_U * 0.6) / (c0 - CLAY_HOIST_U * 0.6);
    return k * k;
  }
  return 1;
}

/**
 * The Claymore's pose for attack value `anim` (1 at the instant of a swing → 0
 * at rest; read as `u = 1 - anim`), the heft wind-up `heft` (0..1, from the
 * charge) and whether the Earthsplitter slam is playing.
 */
function claymorePoseAt(anim: number, heft: number, slam: boolean): ClaymorePose {
  const u = 1 - Math.max(0, Math.min(1, anim));
  if (slam) return claymoreSlamPose(u);
  if (u < 1) return claymoreCleavePose(u);
  const k = ease.inOutSine(Math.max(0, Math.min(1, heft)));
  return k < 0.5 ? mixClay(CLAY_REST, CLAY_LIFT, k * 2) : mixClay(CLAY_LIFT, CLAY_HEFT, k * 2 - 1);
}

/**
 * The Blade adventurer's Claymore and both arms, in the base figure's local
 * space (already flipped for `faceLeft`). Three inputs drive it:
 *  - `heft` (0..1, the charge before a swing): from the high guard at rest
 *    (cards, idle), the hero hauls the great blade up and back over the head.
 *  - `release` (1 the instant the swing is loosed → 0): the cleave — over the
 *    top and down through the arc ahead, the weight carrying it into a low
 *    follow-through, then lifted back to the guard.
 *  - `slam`: plays the Earthsplitter instead (`release` running over
 *    `EARTHSPLITTER_ANIM_TIME`): hoisted overhead, driven point-first into the
 *    ground, held a beat, wrenched free.
 * Both hands share the one long grip, the lead hand under the guard. Layered
 * like the Blade: sleeves → `cloak` → the claymore → fists (far, then near).
 * The swing's smear is a separate pass (`drawClaymoreTrails`).
 */
function drawClaymore(
  ctx: CanvasRenderingContext2D,
  look: ArmLook,
  backLook: ArmLook,
  release: number,
  heft: number,
  sho: number,
  cloak: () => void,
  slam = false,
): void {
  const p = claymorePoseAt(release, heft, slam);
  const a = p.ang * DEG;
  const bx = p.x - Math.cos(a) * CLAY_GRIP_GAP;
  const by = p.y - Math.sin(a) * CLAY_GRIP_GAP;
  arm(ctx, -sho, P_SHOULDER_Y, bx, by, backLook, p.backBend);
  arm(ctx, sho, P_SHOULDER_Y, p.x, p.y, look, p.bend);
  cloak();
  drawClaymoreBlade(ctx, p.x, p.y, a);
  fist(ctx, bx, by, backLook);
  fist(ctx, p.x, p.y, look);
}

/**
 * The great sword itself, gripped at the lead hand `(hx, hy)` and laid along
 * `angle` (radians): a long leather-wrapped grip running back through both fists
 * to a heavy pommel, a wide crossguard with flared quillons, a short blunt
 * ricasso, then a broad blade tapering to its point with a fuller and a bright
 * edge. Flat fills — the compositor shades and inks it with the figure.
 */
function drawClaymoreBlade(ctx: CanvasRenderingContext2D, hx: number, hy: number, angle: number): void {
  const steel = '#c9d2dc';
  const steelDark = '#7f8997';
  const steelLit = '#eef3f8';
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(angle);
  // Grip: wrapped leather from the pommel up through both hands to the guard.
  ctx.strokeStyle = '#4a3420';
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(-CLAY_GRIP_GAP - 1.6, 0);
  ctx.lineTo(1.5, 0);
  ctx.stroke();
  ctx.strokeStyle = '#2e2014';
  ctx.lineWidth = 0.4;
  for (let x = -CLAY_GRIP_GAP - 1.2; x < 1.2; x += 1.1) {
    ctx.beginPath();
    ctx.moveTo(x, -0.95);
    ctx.lineTo(x + 0.6, 0.95);
    ctx.stroke();
  }
  // Pommel: a heavy disc with a brass cap.
  ctx.fillStyle = steelDark;
  ctx.beginPath();
  ctx.arc(-CLAY_GRIP_GAP - 2.4, 0, 1.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P_BRASS;
  ctx.beginPath();
  ctx.arc(-CLAY_GRIP_GAP - 2.4, 0, 0.6, 0, Math.PI * 2);
  ctx.fill();
  // Crossguard: a wide bar, its quillons swept toward the blade with knobbed ends.
  ctx.strokeStyle = steelDark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(3.1, -4.8);
  ctx.quadraticCurveTo(1.6, 0, 3.1, 4.8);
  ctx.stroke();
  ctx.fillStyle = steelDark;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(3.2, s * 4.9, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = P_BRASS;
  ctx.beginPath();
  ctx.arc(2.1, 0, 0.75, 0, Math.PI * 2);
  ctx.fill();
  // Ricasso: a short blunt shoulder before the edge begins.
  ctx.fillStyle = steelDark;
  ctx.fillRect(2.6, -1.5, 1.9, 3);
  // Broad blade, tapering to the point.
  const tip = 2.6 + CLAY_LEN;
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.moveTo(4.4, -2.1);
  ctx.lineTo(tip - 3.6, -1.45);
  ctx.lineTo(tip + 0.8, 0);
  ctx.lineTo(tip - 3.6, 1.45);
  ctx.lineTo(4.4, 2.1);
  ctx.closePath();
  ctx.fill();
  // Fuller groove down the middle, then a bright edge along the top.
  ctx.strokeStyle = steelDark;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(4.6, 0.1);
  ctx.lineTo(tip - 5, 0.05);
  ctx.stroke();
  ctx.strokeStyle = steelLit;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(4.6, -1.5);
  ctx.lineTo(tip - 0.6, -0.4);
  ctx.stroke();
  ctx.restore();
}

/**
 * The Earthsplitter's wind-up telegraph on the blade (slam progress `u`): as the
 * claymore is held overhead it kindles — a molten glow along the edge that
 * deepens the longer it is held, a flaring point, and embers shed off the steel
 * — snuffed the instant the blade bites the ground. Additive, same local frame
 * as `drawClaymoreTrails`.
 */
function drawClaymoreKindle(ctx: CanvasRenderingContext2D, faceLeft: boolean, u: number): void {
  const g = claymoreGather(u);
  if (g <= 0.01) return;
  const p = claymoreSlamPose(u);
  const ca = Math.cos(p.ang * DEG);
  const sa = Math.sin(p.ang * DEG);
  const at = (r: number) => ({ x: p.x + ca * r, y: p.y + sa * r });
  const guard = at(2.6);
  const tip = at(CLAY_REACH);
  const flicker = 0.85 + 0.15 * Math.sin(u * 95);
  ctx.save();
  if (faceLeft) ctx.scale(-1, 1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  // Molten haze and a hot core along the blade.
  ctx.strokeStyle = `rgba(255,128,40,${0.32 * g * flicker})`;
  ctx.lineWidth = 2 + 4.5 * g;
  ctx.beginPath();
  ctx.moveTo(guard.x, guard.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,214,140,${0.6 * g * flicker})`;
  ctx.lineWidth = 0.6 + 1.1 * g;
  ctx.stroke();
  // A flare at the point.
  const fr = 2.5 + 4 * g;
  const flare = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, fr);
  flare.addColorStop(0, `rgba(255,236,190,${0.85 * g})`);
  flare.addColorStop(0.4, `rgba(255,150,50,${0.45 * g})`);
  flare.addColorStop(1, 'rgba(255,110,30,0)');
  ctx.fillStyle = flare;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, fr, 0, Math.PI * 2);
  ctx.fill();
  // Embers peeling off the steel and drifting up.
  for (let i = 0; i < 6; i++) {
    const life = (u * 6 + i * 0.37) % 1;
    const e = at(4 + ((i * 0.61) % 1) * CLAY_LEN);
    const x = e.x + Math.sin(u * 40 + i * 2.3) * 1.6;
    const y = e.y - life * 6;
    ctx.fillStyle = `rgba(255,${170 + i * 12},90,${g * (1 - life) * 0.9})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.45 + 0.35 * (1 - life), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The Claymore's swing smear for attack value `anim` (same meaning as in
 * `drawUnitSprite`), drawn by the renderer straight after the figure in the same
 * local frame, outside the compositor, like `drawBladeTrails`. A heavy weapon
 * leaves a broad smear rather than a thin streak: a band swept between the
 * blade's middle and its point, densest at the blade and fading to its tail,
 * with a bright edge where the point travelled. `slam` draws the
 * Earthsplitter's instead.
 */
export function drawClaymoreTrails(ctx: CanvasRenderingContext2D, faceLeft: boolean, anim: number, slam = false): void {
  const u = 1 - Math.max(0, Math.min(1, anim));
  if (u >= 1) return;
  if (slam) drawClaymoreKindle(ctx, faceLeft, u);
  const [c0, c1] = slam ? CLAY_SLAM_U : CLAY_CUT_U;
  if (u <= c0) return;
  const head = Math.min(u, c1);
  const tail = Math.max(c0, head - (slam ? 0.09 : 0.16));
  const fade = u <= c1 ? 1 : Math.max(0, 1 - (u - c1) / 0.24);
  if (fade <= 0 || head - tail < 0.004) return;
  const poseAt = slam ? claymoreSlamPose : claymoreCleavePose;
  const along = (v: number, r: number) => {
    const p = poseAt(v);
    return { x: p.x + Math.cos(p.ang * DEG) * r, y: p.y + Math.sin(p.ang * DEG) * r };
  };
  ctx.save();
  if (faceLeft) ctx.scale(-1, 1);
  ctx.lineCap = 'round';
  const N = 10;
  let po = along(tail, CLAY_REACH + 0.6);
  let pi = along(tail, CLAY_REACH * 0.42);
  for (let i = 1; i <= N; i++) {
    const k = i / N; // 0 at the tail → 1 at the blade
    const v = tail + (head - tail) * k;
    const o = along(v, CLAY_REACH + 0.6);
    const n = along(v, CLAY_REACH * 0.42);
    ctx.fillStyle = `rgba(214,228,244,${0.3 * k * fade})`;
    ctx.beginPath();
    ctx.moveTo(po.x, po.y);
    ctx.lineTo(o.x, o.y);
    ctx.lineTo(n.x, n.y);
    ctx.lineTo(pi.x, pi.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * k * fade})`;
    ctx.lineWidth = 0.5 + 1.8 * k;
    ctx.beginPath();
    ctx.moveTo(po.x, po.y);
    ctx.lineTo(o.x, o.y);
    ctx.stroke();
    po = o;
    pi = n;
  }
  ctx.restore();
}

/**
 * One short sword gripped at a hand `(hx, hy)`, its blade laid along `angle`
 * (radians, from +x, y-down) reaching `len` px past the hand: a wrapped grip
 * centred on the fist with a pommel behind it, a steel crossguard just ahead of
 * it, and a tapered blade with a fuller and a bright edge. Draw it *before* the
 * arm so the hand closes over the grip.
 */
function drawShortSword(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  angle: number,
  len: number,
  steel: string,
  steelDark: string,
): void {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(angle);
  // Grip through the fist + pommel behind it.
  ctx.strokeStyle = '#4a3a2a';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(-2, 0);
  ctx.lineTo(1.6, 0);
  ctx.stroke();
  ctx.fillStyle = steelDark;
  ctx.beginPath();
  ctx.arc(-2.3, 0, 0.95, 0, Math.PI * 2);
  ctx.fill();
  // Crossguard, slightly swept toward the blade.
  ctx.strokeStyle = steelDark;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(2.4, -2.3);
  ctx.quadraticCurveTo(1.7, 0, 2.4, 2.3);
  ctx.stroke();
  // Tapered blade.
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.moveTo(2.4, -1.25);
  ctx.lineTo(len - 1.2, -0.85);
  ctx.lineTo(len + 0.6, 0);
  ctx.lineTo(len - 1.2, 0.85);
  ctx.lineTo(2.4, 1.25);
  ctx.closePath();
  ctx.fill();
  // Fuller groove down the middle, then a bright edge along the top.
  ctx.strokeStyle = steelDark;
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(3, 0.15);
  ctx.lineTo(len - 3, 0.1);
  ctx.stroke();
  ctx.strokeStyle = '#eef3f8';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(2.8, -0.85);
  ctx.lineTo(len - 0.6, -0.4);
  ctx.stroke();
  ctx.restore();
}

/**
 * The Bow adventurer's shortbow and both arms, in the base figure's local space
 * (already flipped for `faceLeft`). Two inputs drive it:
 *  - `draw` (0..1): how far the archer has raised and drawn for the next shot —
 *    0 is the relaxed rest (bow lowered and tilted, arrow nocked on a slack
 *    string: cards, idle), 1 is aimed at full draw.
 *  - `release` (1 the instant an arrow is loosed → 0): the shot. The string snaps
 *    forward and shivers, the limbs spring back and the draw hand flicks past the
 *    cheek; then a fresh arrow is nocked and pulled straight back to `draw`
 *    (mid-volley that is full draw again). After the volley's last arrow
 *    (`draw` 0) the bow stays up through the follow-through, then lowers.
 * Phase boundaries match `attackAnimTime('player-bow')` (0.24s): snap for the
 * first ~0.035s, re-nock and redraw by ~0.08s, the rest is follow-through.
 * Aimed at full draw the arrowhead sits at ~(12.5, -3.5), the engine's muzzle.
 * Layered like the Blade: sleeves → `cloak` → bow, string and arrow → fists.
 */
function drawPlayerShortbow(
  ctx: CanvasRenderingContext2D,
  look: ArmLook,
  backLook: ArmLook,
  release: number,
  draw: number,
  cloak: () => void,
): void {
  const r = Math.max(0, Math.min(1, release));
  const d = Math.max(0, Math.min(1, draw));
  const SNAP = 0.854; // r above this: string snapped forward, no arrow
  const NOCKED = 0.667; // r below this: the redraw is complete
  const snapping = r > SNAP;
  // Bow raised to aim: held by the draw, or up through the shot and its
  // follow-through, lowering as `release` runs out after the volley's last arrow.
  const raise = ease.inOutSine(Math.max(d, Math.min(1, r / NOCKED)));
  // String pull: 0 while snapped, ramping back to the draw as the next arrow nocks.
  const renock = snapping ? 0 : r > NOCKED ? 1 - (r - NOCKED) / (SNAP - NOCKED) : 1;
  const pull = d * ease.outCubic(renock);
  // Follow-through flick of the draw hand just after the loose.
  const flick = snapping ? (r - SNAP) / (1 - SNAP) : 0;

  // Grip + bow tilt: lowered and pointed down-forward at rest, level when aimed.
  const gx = 6.2 + (9 - 6.2) * raise;
  const gy = 0.6 + (-4 - 0.6) * raise;
  const tilt = 0.62 * (1 - raise);
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const toWorld = (x: number, y: number) => ({ x: gx + x * cos - y * sin, y: gy + x * sin + y * cos });

  // Bow geometry in its own frame: grip at the origin, belly toward +x, limb tips
  // flexing back and in as the string is drawn.
  const tipX = -1.4 - 1.5 * pull;
  const tipY = 6.6 - 0.5 * pull;
  const nockX = tipX - 6 * pull;
  // A shivering string just after the loose.
  const shiver = snapping ? Math.sin(r * 90) * 0.9 * flick : 0;

  // Draw hand: on the nock point, flicked back and up past the cheek on release.
  const nockW = toWorld(nockX + shiver, 0);
  const hand = snapping ? { x: nockW.x - 2.6 * flick, y: nockW.y - 1.2 * flick } : nockW;

  // Sleeves, then the mantle over their shoulders; the bow and fists go on top.
  arm(ctx, -2.4, -5.2, hand.x, hand.y, backLook, 1.1);
  arm(ctx, 1.5, -5.2, gx + 0.4, gy, look, 0.5 + 0.6 * (1 - raise));
  cloak();

  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(tilt);
  // Limbs: two recurved strokes from the grip to the tips, wood then a lit edge.
  const limbs = () => {
    ctx.beginPath();
    ctx.moveTo(tipX, -tipY);
    ctx.quadraticCurveTo(1.9, -tipY * 0.55, 0.9, 0);
    ctx.quadraticCurveTo(1.9, tipY * 0.55, tipX, tipY);
  };
  ctx.strokeStyle = '#6e4a26';
  ctx.lineWidth = 2;
  limbs();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,210,0.5)';
  ctx.lineWidth = 0.7;
  limbs();
  ctx.stroke();
  // Leather grip wrap.
  ctx.strokeStyle = '#3e2a18';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(1, -1.3);
  ctx.lineTo(1, 1.3);
  ctx.stroke();
  // String: tip → nock → tip.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(tipX, -tipY);
  ctx.lineTo(nockX + shiver, 0);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  // Nocked arrow (not while the string is snapped): shaft, fletching and head,
  // riding the string so it slides back with the draw.
  if (!snapping) {
    const tail = nockX;
    const head = nockX + 12.5;
    ctx.strokeStyle = '#d8d2c0';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(tail, 0);
    ctx.lineTo(head - 1.6, 0);
    ctx.stroke();
    ctx.strokeStyle = '#b8a888';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(tail + 0.4, 0);
    ctx.lineTo(tail - 1.2, -1.3);
    ctx.moveTo(tail + 0.4, 0);
    ctx.lineTo(tail - 1.2, 1.3);
    ctx.stroke();
    ctx.fillStyle = '#c9d2dc';
    ctx.beginPath();
    ctx.moveTo(head - 2, -1.2);
    ctx.lineTo(head + 0.4, 0);
    ctx.lineTo(head - 2, 1.2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  fist(ctx, hand.x, hand.y, backLook);
  fist(ctx, gx + 0.4, gy, look);
}

// ============================================================================
// The Longbow — the Bow adventurer's towering bow (Longbow node).
// ============================================================================

/** Grip + tilt of the Longbow at rest (lowered, lower tip near the ground). */
const LB_REST = { x: 8, y: -0.5, tilt: -0.1 };
/** Grip + tilt when aimed (bow upright, arrow level at the chin). */
const LB_AIM = { x: 10.5, y: -7, tilt: 0 };
/** Grip + tilt + pull of the Piercing Shot cast: an arrow aimed at the sky. */
const LB_CAST = { x: 6.5, y: -14, tilt: -1.15, pull: 0.55 };
/** Half-length of a limb (grip → tip) when braced and slack. */
const LB_LIMB = 13;
/** How far the string travels back at full draw (beyond the limbs' flex). */
const LB_DRAW = 9.5;
/** Length of the Longbow's big arrow, nock to point. */
const LB_ARROW = 19;
// Release phases (`release` 1 → 0 over `attackAnimTime('player-longbow')`):
// string snapped forward above SNAP, the bow held up through the follow-through
// until LOWER, then lowered back to rest.
const LB_SNAP = 0.88;
const LB_LOWER = 0.4;

/** One frame of the Longbow, in the figure's local space (facing +x). */
interface LongbowPose {
  gx: number;
  gy: number;
  tilt: number;
  /** String pull, 0 (slack) → 1 (full draw). */
  pull: number;
  tipX: number;
  tipY: number;
  /** Nock point along the bow's frame x (the string's back-most point). */
  nockX: number;
  /** Lateral string shiver just after a loose. */
  shiver: number;
  /** The draw hand. */
  hand: { x: number; y: number };
  /** Whether an arrow is nocked. */
  arrow: boolean;
  frontBend: number;
  rearBend: number;
}

/** Envelope of the Piercing Shot cast pose for `castAnim` (1 at cast → 0). */
function longbowCastLevel(castAnim: number): number {
  if (castAnim <= 0) return 0;
  const u = 1 - Math.min(1, castAnim);
  if (u < 0.3) return ease.inOutSine(u / 0.3);
  if (u < 0.72) return 1;
  return 1 - ease.inOutSine((u - 0.72) / 0.28);
}

/**
 * The Longbow's pose. `draw` (0..1) is the slow draw before a shot: the bow
 * rises upright over its first ~quarter, then the string is hauled back to the
 * jaw, held at full draw for the last tenth. `release` (1 the instant the arrow
 * is loosed → 0) is the shot: the string snaps forward, the draw hand flicks
 * back past the ear, the bow stays up through the follow-through, then lowers.
 * `castAnim` (1 → 0 over `PIERCING_CAST_ANIM_TIME`, 0 when not casting) blends
 * in the Piercing Shot pose: the bow raised with its arrow aimed at the sky.
 */
function longbowPose(release: number, draw: number, castAnim: number): LongbowPose {
  const r = Math.max(0, Math.min(1, release));
  const d = Math.max(0, Math.min(1, draw));
  const drawRaise = ease.inOutSine(Math.min(1, d / 0.28));
  const shotRaise = r <= 0 ? 0 : r > LB_LOWER ? 1 : ease.inOutSine(r / LB_LOWER);
  const raise = Math.max(drawRaise, shotRaise);
  // The draw only pulls the string while a shot isn't still snapping forward.
  let pull = d > 0 && r < LB_SNAP ? ease.inOutSine(Math.max(0, Math.min(1, (d - 0.12) / 0.78))) : 0;
  let gx = LB_REST.x + (LB_AIM.x - LB_REST.x) * raise;
  let gy = LB_REST.y + (LB_AIM.y - LB_REST.y) * raise;
  let tilt = LB_REST.tilt + (LB_AIM.tilt - LB_REST.tilt) * raise;
  const cast = longbowCastLevel(castAnim);
  if (cast > 0) {
    gx += (LB_CAST.x - gx) * cast;
    gy += (LB_CAST.y - gy) * cast;
    tilt += (LB_CAST.tilt - tilt) * cast;
    pull += (LB_CAST.pull - pull) * cast;
  }
  const tipX = -2.2 - 2.8 * pull;
  const tipY = LB_LIMB - 0.8 * pull;
  const snapping = r > LB_SNAP && d === 0;
  const shiver = r > LB_SNAP - 0.06 ? Math.sin(r * 110) * 1.1 * Math.min(1, (r - LB_SNAP + 0.06) / 0.18) : 0;
  const nockX = tipX - LB_DRAW * pull;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const nock = { x: gx + nockX * cos, y: gy + nockX * sin };
  // After the loose the draw hand flicks back past the ear, then eases home.
  const flick = d > 0 ? 0 : r > LB_SNAP ? 1 : r > LB_LOWER ? ease.inOutSine((r - LB_LOWER) / (LB_SNAP - LB_LOWER)) : 0;
  const hand = { x: nock.x - 3 * flick, y: nock.y - 1.6 * flick };
  // Nocked only while drawing (or casting): the long arrow would otherwise jut
  // far past the lowered bow and read as aiming.
  const arrow = !snapping && (d > 0 || cast > 0);
  return {
    gx,
    gy,
    tilt,
    pull,
    tipX,
    tipY,
    nockX,
    shiver,
    hand,
    arrow,
    frontBend: 0.9 - 0.5 * raise,
    // The draw arm folds tight with its elbow drawn back as the string comes in.
    rearBend: 1.1 - 4.6 * pull * (1 - cast),
  };
}

/**
 * The nocked arrow of the Longbow for the given inputs (see `longbowPose`), in
 * local space facing +x: its point and direction, or null when none is nocked.
 * The renderer glows a kindled Piercing Shot arrow along this.
 */
export function longbowArrow(
  release: number,
  draw: number,
  castAnim: number,
): { x: number; y: number; angle: number; length: number } | null {
  const p = longbowPose(release, draw, castAnim);
  if (!p.arrow) return null;
  const head = p.nockX + LB_ARROW;
  return {
    x: p.gx + head * Math.cos(p.tilt),
    y: p.gy + head * Math.sin(p.tilt),
    angle: p.tilt,
    length: LB_ARROW,
  };
}

/** Level (0..1) of the Piercing Shot cast pose — the renderer's flare follows it. */
export function longbowCastGlow(castAnim: number): number {
  return longbowCastLevel(castAnim);
}

/**
 * The Bow adventurer's Longbow and both arms, in the base figure's local space
 * (already flipped for `faceLeft`). See `longbowPose` for the inputs. Aimed at
 * full draw the arrowhead sits at ~(15, -7), the engine's `LONGBOW_MUZZLE` at
 * board scale. The grip is wrapped in the adventurer's accent colour. Layered
 * like the shortbow: sleeves → `cloak` → forearms → bow, string and arrow →
 * fists.
 */
function drawPlayerLongbow(
  ctx: CanvasRenderingContext2D,
  look: ArmLook,
  backLook: ArmLook,
  release: number,
  draw: number,
  castAnim: number,
  accent: string,
  cloak: () => void,
): void {
  const p = longbowPose(release, draw, castAnim);
  const front = { x: p.gx + 0.3, y: p.gy };

  arm(ctx, -2.4, -5.2, p.hand.x, p.hand.y, backLook, p.rearBend);
  arm(ctx, 1.5, -5.2, front.x, front.y, look, p.frontBend);
  cloak();
  // Raised forearms sit over the mantle (the cast pose lifts the bow overhead).
  forearm(ctx, -2.4, -5.2, p.hand.x, p.hand.y, backLook, p.rearBend);
  forearm(ctx, 1.5, -5.2, front.x, front.y, look, p.frontBend);

  ctx.save();
  ctx.translate(p.gx, p.gy);
  ctx.rotate(p.tilt);
  // A long, gently bent D: thick at the grip, tapering to horn-tipped nocks.
  const limbs = () => {
    ctx.beginPath();
    ctx.moveTo(p.tipX, -p.tipY);
    ctx.quadraticCurveTo(2.9, -p.tipY * 0.52, 1.2, 0);
    ctx.quadraticCurveTo(2.9, p.tipY * 0.52, p.tipX, p.tipY);
  };
  ctx.strokeStyle = '#5a3a1e';
  ctx.lineWidth = 2.7;
  limbs();
  ctx.stroke();
  ctx.strokeStyle = '#8a5a30';
  ctx.lineWidth = 1.5;
  limbs();
  ctx.stroke();
  ctx.save();
  ctx.translate(0.55, 0);
  ctx.strokeStyle = 'rgba(255,236,200,0.45)';
  ctx.lineWidth = 0.6;
  limbs();
  ctx.stroke();
  ctx.restore();
  // Horn nocks capping each tip.
  ctx.fillStyle = '#e8dcc0';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(p.tipX, s * p.tipY, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  // Grip wrap in the adventurer's accent, with a dark leather binding.
  ctx.strokeStyle = shade(accent, -0.15);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(1.2, -2);
  ctx.lineTo(1.2, 2);
  ctx.stroke();
  ctx.strokeStyle = '#2e1f12';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-0.3, -2);
  ctx.lineTo(2.7, -2);
  ctx.moveTo(-0.3, 2);
  ctx.lineTo(2.7, 2);
  ctx.stroke();
  // String: tip → nock → tip.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(p.tipX, -p.tipY);
  ctx.lineTo(p.nockX + p.shiver, 0);
  ctx.lineTo(p.tipX, p.tipY);
  ctx.stroke();
  // The big arrow riding the string: shaft, broad fletching and a bodkin point.
  if (p.arrow) {
    const tail = p.nockX;
    const head = p.nockX + LB_ARROW;
    ctx.strokeStyle = '#d8d2c0';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(tail, 0);
    ctx.lineTo(head - 2.4, 0);
    ctx.stroke();
    ctx.fillStyle = '#b8a888';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(tail + 0.6, 0);
      ctx.lineTo(tail + 3.6, 0);
      ctx.lineTo(tail + 1.2, s * 1.9);
      ctx.lineTo(tail - 0.4, s * 1.7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#c9d2dc';
    ctx.beginPath();
    ctx.moveTo(head - 3.2, -1.4);
    ctx.lineTo(head + 0.5, 0);
    ctx.lineTo(head - 3.2, 1.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  fist(ctx, p.hand.x, p.hand.y, backLook);
  fist(ctx, front.x, front.y, look);
}

/** Body radius of the Magic adventurer's orb as it charges (`charge` 0..1). */
export function magicOrbRadius(charge: number): number {
  return 1.2 + 4.3 * Math.max(0, Math.min(1, charge));
}

/**
 * Where the Magic adventurer holds its orb while charging, in the sprite's local
 * space (authored facing +x; mirror x for `faceLeft`): gathered out in front of
 * the chest, then drawn back toward the body as it swells (the wind-up). The
 * renderer paints the orb here and the hands cup it.
 */
export function magicOrbAnchor(charge: number): { x: number; y: number } {
  const k = ease.inOutSine(Math.max(0, Math.min(1, charge)));
  return { x: 8.8 - 2.2 * k, y: -3.9 - 1.3 * k };
}

/**
 * Midpoint of the Magic adventurer's thrust-out hands (local, facing +x): where an
 * orb is launched from and where a Mana Ray leaves the palms.
 */
export const MAGIC_CAST_POINT = { x: 11.4, y: -4.6 };

/**
 * The Magic adventurer's arms (there is no staff), in the sprite's local space
 * (authored facing +x). The attack flows through four beats:
 *  - rest: hands at the sides, like the other champions (cards, idle);
 *  - gather + build (`charge` 0 → 1): the hands rise to the front of the chest,
 *    one above and one below the orb, then draw it back toward the body as it
 *    swells, staying cupped around its edge at every size (`magicOrbAnchor`);
 *  - throw (`release` 1 → 0.7): both palms thrust out to `MAGIC_CAST_POINT`,
 *    launching the orb (held there for the whole Mana Ray channel);
 *  - recover (`release` 0.7 → 0): the hands ease back down to the sides.
 * The upper arms go under the mantle / scarf (`cloak`) and the forearms are
 * repainted over it, so raised hands are never hidden. The orb itself is drawn by
 * the renderer so it can take the player's colour and animate.
 */
function drawPlayerCastArms(
  ctx: CanvasRenderingContext2D,
  look: ArmLook,
  backLook: ArmLook,
  release: number,
  charge: number,
  b: { hw: number },
  sho: number,
  cloak: () => void,
): void {
  const r = Math.max(0, Math.min(1, release));
  const c = Math.max(0, Math.min(1, charge));
  type Hand = { x: number; y: number; bend: number };
  const mix = (a: Hand, z: Hand, k: number): Hand => ({
    x: a.x + (z.x - a.x) * k,
    y: a.y + (z.y - a.y) * k,
    bend: a.bend + (z.bend - a.bend) * k,
  });
  const restF: Hand = { x: b.hw - 0.5, y: 4, bend: -0.7 };
  const restR: Hand = { x: -b.hw + 1.5, y: 3.5, bend: 0.7 };
  const thrustF: Hand = { x: MAGIC_CAST_POINT.x + 0.3, y: MAGIC_CAST_POINT.y - 1.9, bend: 0.4 };
  const thrustR: Hand = { x: MAGIC_CAST_POINT.x - 0.3, y: MAGIC_CAST_POINT.y + 1.9, bend: 0.6 };

  let front: Hand;
  let rear: Hand;
  if (r > 0) {
    // Throw, then recover down to rest.
    const k = r >= 0.7 ? 1 : ease.inOutSine(r / 0.7);
    front = mix(restF, thrustF, k);
    rear = mix(restR, thrustR, k);
  } else if (c > 0) {
    // Hands cup the orb: just above and below its edge, wherever it is.
    const o = magicOrbAnchor(c);
    const gap = magicOrbRadius(c) + 0.9;
    const cupF: Hand = { x: o.x + 0.4, y: o.y - gap, bend: 1 };
    const cupR: Hand = { x: o.x - 0.4, y: o.y + gap, bend: 1.1 };
    // Rise from rest over the first part of the charge (the gather).
    const g = ease.inOutSine(Math.min(1, c / 0.3));
    front = mix(restF, cupF, g);
    rear = mix(restR, cupR, g);
  } else {
    front = restF;
    rear = restR;
  }

  arm(ctx, -sho, P_SHOULDER_Y, rear.x, rear.y, backLook, rear.bend);
  arm(ctx, sho, P_SHOULDER_Y, front.x, front.y, look, front.bend);
  cloak();
  forearm(ctx, -sho, P_SHOULDER_Y, rear.x, rear.y, backLook, rear.bend);
  forearm(ctx, sho, P_SHOULDER_Y, front.x, front.y, look, front.bend);
}

// --- The Greater Orb (the Magic adventurer's mastery node) -------------------
// Its charge (`charge` 0 → 1) is a leap: a crouch with the arms swung back, a
// spring up with both arms sweeping overhead (apex at GREATER_ORB_APEX), then a
// hang in the air while a huge orb swells above the head between the raised
// palms. Its throw-down is a signature move (`release` 1 → 0 over the throw):
// both arms whip over and forward-down, hold through the fall, and ease back to
// the sides after touchdown (GREATER_ORB_LAND). The renderer lifts and squashes
// the whole body along the same phases and paints the orb itself.

/** Where the raised palms meet overhead (local, facing +x); the orb sits on them. */
const GREATER_ORB_PALMS = { x: 1, y: -16.5 };
/** Charge at which the orb starts to kindle overhead (just before the apex). */
const GREATER_ORB_KINDLE = GREATER_ORB_APEX - 0.06;
/** How far apart the raised hands stay, at least — clear of the head either side. */
const GREATER_ORB_MIN_SPREAD = 4.6;

/** Body radius of the Greater Orb as it swells overhead (`charge` 0..1); 0 before it kindles. */
export function greaterOrbRadius(charge: number): number {
  const k = (Math.min(1, charge) - GREATER_ORB_KINDLE) / (1 - GREATER_ORB_KINDLE);
  return k <= 0 ? 0 : 1 + 5.6 * ease.inOutSine(k);
}

/** Distance from the palms' midpoint to each raised hand, which ends up cupping the orb's lower flanks. */
function greaterOrbReach(charge: number): number {
  return (greaterOrbRadius(charge) + 0.8) * Math.SQRT1_2;
}

/**
 * Centre of the Greater Orb above the caster's head (local, facing +x; mirror x
 * for `faceLeft`): resting on the raised palms, rising as it swells. The
 * renderer paints the charging orb here, and the engine launches it from here
 * at full charge (`GREATER_ORB_MUZZLE`).
 */
export function greaterOrbAnchor(charge: number): { x: number; y: number } {
  return { x: GREATER_ORB_PALMS.x, y: GREATER_ORB_PALMS.y - greaterOrbReach(charge) };
}

/**
 * How far the Greater Orb caster's legs are drawn up (0 standing → 1 tucked):
 * up through the spring, dangling a little while it hangs, a kick as it throws,
 * then reaching back down to land at GREATER_ORB_LAND.
 */
function greaterOrbTuck(release: number, charge: number): number {
  if (release > 0) {
    const u = 1 - Math.min(1, release);
    if (u < 0.24) return 0.75 + 0.15 * ease.outQuad(u / 0.24);
    if (u < GREATER_ORB_LAND) return 0.9 * (1 - ease.inOutSine((u - 0.24) / (GREATER_ORB_LAND - 0.24)));
    return 0;
  }
  const c = Math.min(1, charge);
  if (c < GREATER_ORB_CROUCH) return 0;
  if (c < GREATER_ORB_APEX) return ease.inOutSine((c - GREATER_ORB_CROUCH) / (GREATER_ORB_APEX - GREATER_ORB_CROUCH));
  return 1 - 0.25 * ease.inOutSine((c - GREATER_ORB_APEX) / (1 - GREATER_ORB_APEX));
}

/**
 * The Greater Orb caster's arms, in the sprite's local space (authored facing
 * +x). See the section note above for the beats. Returns a repaint of the raised
 * near forearm for the caller to run after the head and headwear (so neither
 * covers it), or null while the hands are low.
 */
function drawPlayerGreaterOrbArms(
  ctx: CanvasRenderingContext2D,
  look: ArmLook,
  backLook: ArmLook,
  release: number,
  charge: number,
  b: { hw: number },
  sho: number,
  cloak: () => void,
): (() => void) | null {
  type Hand = { x: number; y: number; bend: number };
  const mix = (a: Hand, z: Hand, k: number): Hand => ({
    x: a.x + (z.x - a.x) * k,
    y: a.y + (z.y - a.y) * k,
    bend: a.bend + (z.bend - a.bend) * k,
  });
  // A throw swings each arm round its shoulder (angle and length interpolated),
  // so the hands arc over and down instead of cutting straight through the body.
  const swing = (a: Hand, z: Hand, k: number, sx: number): Hand => {
    const a0 = Math.atan2(a.y - P_SHOULDER_Y, a.x - sx);
    const a1 = Math.atan2(z.y - P_SHOULDER_Y, z.x - sx);
    const l0 = Math.hypot(a.x - sx, a.y - P_SHOULDER_Y);
    const l1 = Math.hypot(z.x - sx, z.y - P_SHOULDER_Y);
    const ang = a0 + (a1 - a0) * k;
    const len = l0 + (l1 - l0) * k;
    return { x: sx + Math.cos(ang) * len, y: P_SHOULDER_Y + Math.sin(ang) * len, bend: a.bend + (z.bend - a.bend) * k };
  };
  const restF: Hand = { x: b.hw - 0.5, y: 4, bend: -0.7 };
  const restR: Hand = { x: -b.hw + 1.5, y: 3.5, bend: 0.7 };
  // Swung back and down for the spring.
  const dipF: Hand = { x: b.hw - 2.4, y: 5.4, bend: -1 };
  const dipR: Hand = { x: -b.hw - 0.6, y: 4.8, bend: 0.9 };
  // Raised in a wide V either side of the head, elbows out, palms under the orb.
  const overhead = (c: number): [Hand, Hand] => {
    const spread = Math.max(GREATER_ORB_MIN_SPREAD, greaterOrbReach(c));
    return [
      { x: GREATER_ORB_PALMS.x + spread, y: GREATER_ORB_PALMS.y, bend: 0.8 },
      { x: GREATER_ORB_PALMS.x - spread, y: GREATER_ORB_PALMS.y, bend: -0.8 },
    ];
  };
  // Hurled: both arms driven forward and down toward the foes below.
  const thrownF: Hand = { x: 12, y: -1.2, bend: 0.4 };
  const thrownR: Hand = { x: 5.6, y: 0.2, bend: 0.6 };

  let front: Hand;
  let rear: Hand;
  if (release > 0) {
    const u = 1 - Math.min(1, release);
    const [upF, upR] = overhead(1);
    if (u < 0.24) {
      const k = ease.outCubic(u / 0.24);
      front = swing(upF, thrownF, k, sho);
      rear = swing(upR, thrownR, k, -sho);
    } else if (u < 0.6) {
      front = thrownF;
      rear = thrownR;
    } else {
      const k = ease.inOutSine((u - 0.6) / 0.4);
      front = mix(thrownF, restF, k);
      rear = mix(thrownR, restR, k);
    }
  } else {
    const c = Math.min(1, charge);
    const [upF, upR] = overhead(c);
    if (c < GREATER_ORB_CROUCH) {
      const k = ease.inOutSine(c / GREATER_ORB_CROUCH);
      front = mix(restF, dipF, k);
      rear = mix(restR, dipR, k);
    } else if (c < GREATER_ORB_APEX) {
      const k = ease.outCubic((c - GREATER_ORB_CROUCH) / (GREATER_ORB_APEX - GREATER_ORB_CROUCH));
      front = swing(dipF, upF, k, sho);
      rear = swing(dipR, upR, k, -sho);
    } else {
      front = upF;
      rear = upR;
    }
  }

  arm(ctx, -sho, P_SHOULDER_Y, rear.x, rear.y, backLook, rear.bend);
  arm(ctx, sho, P_SHOULDER_Y, front.x, front.y, look, front.bend);
  cloak();
  forearm(ctx, -sho, P_SHOULDER_Y, rear.x, rear.y, backLook, rear.bend);
  forearm(ctx, sho, P_SHOULDER_Y, front.x, front.y, look, front.bend);
  return front.y < -9 ? () => forearm(ctx, sho, P_SHOULDER_Y, front.x, front.y, look, front.bend) : null;
}

// ============================================================================
// The Arcane Staff — the Magic adventurer's staff (Arcane Staff node).
// A plain wooden staff, brass-shod, whose carved crook cradles a crystal in the
// adventurer's outfit colour. Every frame comes from `staffPose`, which the
// renderer's glow pass also reads (`staffTip`) to light the crystal.
// ============================================================================

/** A staff frame: the front hand's grip, the staff's heading (butt → crystal), and that arm's elbow bend. */
interface StaffGrip {
  x: number;
  y: number;
  ang: number;
  bend: number;
}
/** At rest: planted upright beside the body, leaning a touch forward. */
const STAFF_REST: StaffGrip = { x: 6.2, y: -0.6, ang: -1.466, bend: -0.9 };
/** Raised high in both hands as the crystal kindles (the cast's charge). */
const STAFF_RAISED: StaffGrip = { x: 6.6, y: -6.2, ang: -1.361, bend: 0.8 };
/** Swept forward to point at the foes as the volley flies. */
const STAFF_POINT: StaffGrip = { x: 8, y: -5, ang: -0.314, bend: 0.4 };
/**
 * Hoisted high in both hands for the Mana Storm: held upright just in front of
 * the face, the front hand up at the crown, the crystal to the sky.
 */
const STAFF_HIGH: StaffGrip = { x: 6.4, y: -15.6, ang: -1.5, bend: 1.4 };
/** Grip → crystal, and grip → butt, along the staff. */
const STAFF_HEAD = 15;
const STAFF_BUTT = 11;
/** How far down the shaft from the front hand the rear hand takes hold. */
const STAFF_REAR_HOLD = 4.5;
// Release phases (`release` 1 → 0 over `attackAnimTime('player-staff')`): swept
// from raised to pointing above SWEEP, held pointing until LOWER, then lowered
// back to rest.
const STAFF_SWEEP = 0.78;
const STAFF_LOWER = 0.45;

/**
 * The staff's pose for `release` (1 the instant the volley flies → 0), `charge`
 * (0..1, the raise before it) and `stance` (0..1, how far it is hoisted into the
 * Mana Storm's overhead hold, which overrides the other two): the grip, its
 * heading and how far the rear hand has come up onto the shaft (`hold`, 0
 * hanging → 1 gripping).
 */
function staffPose(release: number, charge: number, stance = 0): StaffGrip & { hold: number } {
  const mix = (a: StaffGrip, z: StaffGrip, k: number): StaffGrip => ({
    x: a.x + (z.x - a.x) * k,
    y: a.y + (z.y - a.y) * k,
    ang: a.ang + (z.ang - a.ang) * k,
    bend: a.bend + (z.bend - a.bend) * k,
  });
  if (stance > 0) {
    const k = ease.inOutSine(Math.min(1, stance));
    return { ...mix(STAFF_REST, STAFF_HIGH, k), hold: Math.min(1, k * 1.6) };
  }
  const r = Math.max(0, Math.min(1, release));
  if (r > 0) {
    if (r > STAFF_SWEEP) return { ...mix(STAFF_RAISED, STAFF_POINT, ease.outCubic((1 - r) / (1 - STAFF_SWEEP))), hold: 1 };
    if (r > STAFF_LOWER) return { ...STAFF_POINT, hold: 1 };
    const k = ease.inOutSine(r / STAFF_LOWER);
    return { ...mix(STAFF_REST, STAFF_POINT, k), hold: k };
  }
  const k = ease.inOutSine(Math.min(1, Math.max(0, charge) / 0.7));
  return { ...mix(STAFF_REST, STAFF_RAISED, k), hold: k };
}

/**
 * The staff's crystal for the given inputs (see `staffPose`), in local space
 * facing +x. The renderer glows it; at the top of the raise (`staffTip(0, 1)`)
 * it is where the engine looses the volley (`STAFF_MUZZLE` at board scale), and
 * hoisted (`staffTip(0, 0, 1)`) where the Mana Storm's bolts leave
 * (`STORM_MUZZLE`).
 */
export function staffTip(release: number, charge: number, stance = 0): { x: number; y: number } {
  const p = staffPose(release, charge, stance);
  return { x: p.x + Math.cos(p.ang) * STAFF_HEAD, y: p.y + Math.sin(p.ang) * STAFF_HEAD };
}

/**
 * The Arcane Staff and both arms, in the base figure's local space (already
 * flipped for `faceLeft`). See `staffPose` for the inputs. Layered: sleeves →
 * `cloak` → forearms → staff → fists, so both hands close over the shaft.
 * Returns a repaint of the near forearm, the staff and both fists for the caller
 * to run after the head and headwear while the staff is hoisted overhead (so a
 * hat brim or hair never hides them), else null.
 */
function drawPlayerStaff(
  ctx: CanvasRenderingContext2D,
  look: ArmLook,
  backLook: ArmLook,
  release: number,
  charge: number,
  stance: number,
  b: { hw: number },
  sho: number,
  oc: string,
  cloak: () => void,
): (() => void) | null {
  const p = staffPose(release, charge, stance);
  const ux = Math.cos(p.ang);
  const uy = Math.sin(p.ang);
  const restR = { x: -b.hw + 1.5, y: 3.5 };
  const onShaft = { x: p.x - ux * STAFF_REAR_HOLD, y: p.y - uy * STAFF_REAR_HOLD };
  const rear = {
    x: restR.x + (onShaft.x - restR.x) * p.hold,
    y: restR.y + (onShaft.y - restR.y) * p.hold,
    bend: 0.7 + 0.3 * p.hold,
  };

  arm(ctx, -sho, P_SHOULDER_Y, rear.x, rear.y, backLook, rear.bend);
  arm(ctx, sho, P_SHOULDER_Y, p.x, p.y, look, p.bend);
  cloak();
  forearm(ctx, -sho, P_SHOULDER_Y, rear.x, rear.y, backLook, rear.bend);
  forearm(ctx, sho, P_SHOULDER_Y, p.x, p.y, look, p.bend);

  const staff = () => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.ang);
    // In the staff's frame +x runs from the grip toward the crystal.
    const shaft = (w: number, color: string, from: number, to: number, off = 0) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(from, off);
      ctx.lineTo(to, off);
      ctx.stroke();
    };
    shaft(2.1, '#3e2814', -STAFF_BUTT, STAFF_HEAD - 2.6);
    shaft(1.25, '#7a5230', -STAFF_BUTT + 0.3, STAFF_HEAD - 2.8);
    shaft(0.4, 'rgba(255,230,190,0.35)', -STAFF_BUTT + 1, STAFF_HEAD - 3.4, -0.35);
    // Brass shoe at the butt and a collar under the crook.
    ctx.fillStyle = P_BRASS;
    ctx.beginPath();
    ctx.arc(-STAFF_BUTT, 0, 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(STAFF_HEAD - 4.2, -1.25, 1.3, 2.5);
    // The carved crook: two prongs curling up around the crystal.
    ctx.strokeStyle = '#3e2814';
    ctx.lineWidth = 1.1;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(STAFF_HEAD - 3, s * 0.4);
      ctx.quadraticCurveTo(STAFF_HEAD - 1.2, s * 2.7, STAFF_HEAD + 1.4, s * 1.7);
      ctx.stroke();
    }
    // The crystal: a long faceted diamond in the adventurer's colour.
    ctx.fillStyle = shade(oc, 0.3);
    ctx.beginPath();
    ctx.moveTo(STAFF_HEAD - 2.2, 0);
    ctx.lineTo(STAFF_HEAD, -1.25);
    ctx.lineTo(STAFF_HEAD + 2.6, 0);
    ctx.lineTo(STAFF_HEAD, 1.25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(STAFF_HEAD - 1, -0.15);
    ctx.lineTo(STAFF_HEAD, -0.95);
    ctx.lineTo(STAFF_HEAD + 1.3, -0.15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  const fists = () => {
    fist(ctx, rear.x, rear.y, backLook);
    fist(ctx, p.x, p.y, look);
  };
  staff();
  fists();
  // Hoisted overhead, the near forearm, the staff and the hands go back over
  // the head (the far forearm stays behind it, reaching round to the shaft).
  return p.y < -9
    ? () => {
        forearm(ctx, sho, P_SHOULDER_Y, p.x, p.y, look, p.bend);
        staff();
        fists();
      }
    : null;
}

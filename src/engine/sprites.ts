/**
 * Procedural unit sprites.
 *
 * Framework-agnostic canvas drawing shared by the in-battle `renderer` and the
 * React card UI (`UnitSprite`), so a champion looks identical on the board and
 * on every menu card. Pure drawing — no game rules, no engine state.
 */

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
  const sleeve = shade(color, -0.18);

  // Legs.
  ctx.strokeStyle = '#3a2f26';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(-1.5, 4);
  ctx.lineTo(-3, 11);
  ctx.moveTo(2.5, 4);
  ctx.lineTo(3.5, 11);
  ctx.stroke();

  // Cloak / torso (teardrop), with a lit front edge for a touch of volume.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.quadraticCurveTo(8, -5, 6.5, 6);
  ctx.quadraticCurveTo(0, 8.5, -6.5, 6);
  ctx.quadraticCurveTo(-8, -5, 0, -9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = cloakLit;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.quadraticCurveTo(8, -5, 6.5, 6);
  ctx.quadraticCurveTo(3.2, 7.4, 2.6, 6);
  ctx.quadraticCurveTo(3.4, -4, 0, -9);
  ctx.closePath();
  ctx.fill();

  // Head + hood.
  ctx.fillStyle = '#e8c39c'; // face
  ctx.beginPath();
  ctx.arc(1.6, -11.4, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color; // hood over the crown & back of the head
  ctx.beginPath();
  ctx.moveTo(-3.4, -8);
  ctx.quadraticCurveTo(-4.6, -16, 2, -16);
  ctx.quadraticCurveTo(5.6, -15, 4.6, -10.6);
  ctx.quadraticCurveTo(2.2, -13, -0.4, -12.6);
  ctx.quadraticCurveTo(-3, -12, -3.4, -8);
  ctx.closePath();
  ctx.fill();

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

  // Bow limb (brown arc), belly facing forward.
  ctx.strokeStyle = '#6e4a26';
  ctx.lineWidth = 2.2;
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

  // Nocked arrow (only while still drawn).
  if (release < 0.5) {
    ctx.strokeStyle = '#d8d2c0';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(stringX, stringY);
    ctx.lineTo(gripX + 3, gripY + 1);
    ctx.stroke();
  }

  // Arms (cloak sleeves): front to the grip, back to the string hand.
  ctx.strokeStyle = sleeve;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(1, -5);
  ctx.lineTo(gripX, gripY);
  ctx.moveTo(0, -4);
  ctx.lineTo(stringX, stringY);
  ctx.stroke();

  ctx.restore();
}

/**
 * Lighten (`amt` > 0) or darken (`amt` < 0) a `#rgb`/`#rrggbb` colour by mixing
 * it toward white or black. `amt` is a 0..1 fraction; returns an `rgb(...)`
 * string. Used to derive shading tones from a unit's single accent colour.
 */
export function shade(hex: string, amt: number): string {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const n = parseInt(full, 16);
  const t = amt < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(amt));
  const mix = (ch: number) => Math.round((t - ch) * p) + ch;
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
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

  // Legs — a wide, planted stance.
  ctx.strokeStyle = '#3a2f26';
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(-2.5, 4);
  ctx.lineTo(-5, 11);
  ctx.moveTo(3, 4);
  ctx.lineTo(5.5, 11);
  ctx.stroke();

  // Round shield on the rear arm, tucked behind the torso.
  ctx.save();
  ctx.translate(-6.5, -1);
  ctx.fillStyle = bodyDark;
  ctx.beginPath();
  ctx.arc(0, 0, 6.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = steelDark;
  ctx.stroke();
  ctx.fillStyle = steel; // central boss
  ctx.beginPath();
  ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Torso / tabard — broad, with a lit front edge for volume.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.quadraticCurveTo(9, -6, 7.5, 7);
  ctx.quadraticCurveTo(0, 9.5, -7.5, 7);
  ctx.quadraticCurveTo(-9, -6, 0, -9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = bodyLit;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.quadraticCurveTo(9, -6, 7.5, 7);
  ctx.quadraticCurveTo(4, 8, 3.4, 7);
  ctx.quadraticCurveTo(4.2, -4, 0, -9);
  ctx.closePath();
  ctx.fill();

  // Head + steel helmet with a short crest.
  ctx.fillStyle = '#e8c39c'; // face
  ctx.beginPath();
  ctx.arc(1.4, -11, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = steel; // helmet dome
  ctx.beginPath();
  ctx.moveTo(-3.2, -11.3);
  ctx.quadraticCurveTo(-3.4, -17, 1.2, -17);
  ctx.quadraticCurveTo(5.6, -17, 5.6, -11.3);
  ctx.quadraticCurveTo(1.2, -13.4, -3.2, -11.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color; // crest / plume flicking back
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(1.4, -17);
  ctx.quadraticCurveTo(0.5, -20, 2.8, -20.3);
  ctx.stroke();

  // --- Sword arm & blade ---
  // The blade pivots about the sword hand: cocked back over the shoulder at rest
  // (swing -> 0), chopping down and forward on a strike (swing -> 1).
  const handX = 6;
  const handY = -6;
  ctx.strokeStyle = bodyDark; // lead arm to the grip
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(2.5, -6);
  ctx.lineTo(handX, handY);
  ctx.stroke();

  const aReady = (-125 * Math.PI) / 180;
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
  ctx.arc(-3.4, 0, 1.1, 0, Math.PI * 2);
  ctx.fill();
  // Crossguard.
  ctx.strokeStyle = steelDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -2.6);
  ctx.lineTo(0, 2.6);
  ctx.stroke();
  // Tapered blade + a bright edge highlight.
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.moveTo(0.5, -1.7);
  ctx.lineTo(13, -0.6);
  ctx.lineTo(14.6, 0);
  ctx.lineTo(13, 0.6);
  ctx.lineTo(0.5, 1.7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#eef3f8';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(1, -0.4);
  ctx.lineTo(12.8, -0.2);
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

  // Legs — a forward lunge (front foot planted ahead).
  ctx.strokeStyle = '#3a2f26';
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(-3, 4);
  ctx.lineTo(-5.5, 11);
  ctx.moveTo(3.5, 4);
  ctx.lineTo(7, 10);
  ctx.stroke();

  // Torso / tabard — leaning slightly into the thrust, with a lit front edge.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0.5, -9);
  ctx.quadraticCurveTo(8.5, -5.5, 6.8, 6.5);
  ctx.quadraticCurveTo(0, 8.5, -6.8, 6.5);
  ctx.quadraticCurveTo(-8, -5.5, 0.5, -9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = bodyLit;
  ctx.beginPath();
  ctx.moveTo(0.5, -9);
  ctx.quadraticCurveTo(8.5, -5.5, 6.8, 6.5);
  ctx.quadraticCurveTo(3.6, 7.5, 3, 6.5);
  ctx.quadraticCurveTo(4, -4, 0.5, -9);
  ctx.closePath();
  ctx.fill();

  // Head + wide-brim kettle helm (brim first, a touch darker; dome on top).
  ctx.fillStyle = '#e8c39c'; // face
  ctx.beginPath();
  ctx.arc(1.6, -11, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = steelDark; // brim
  ctx.beginPath();
  ctx.ellipse(1.4, -11.8, 6.4, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = steel; // dome
  ctx.beginPath();
  ctx.moveTo(-2.6, -12);
  ctx.quadraticCurveTo(-2.8, -16.4, 1.6, -16.4);
  ctx.quadraticCurveTo(5.2, -16.4, 5, -12);
  ctx.quadraticCurveTo(1.6, -13.4, -2.6, -12);
  ctx.closePath();
  ctx.fill();

  const shaftY = -3;
  if (throwing && thrust > 0) {
    // --- Javelin Toss follow-through ---
    // The spear itself is drawn separately in world space (see the renderer) so
    // it flies along the exact attack direction; here the figure just holds the
    // empty release pose: throwing arm flung forward, rear arm back.
    ctx.strokeStyle = bodyDark;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(1, -5);
    ctx.lineTo(10, -8);
    ctx.moveTo(-1.5, -4.5);
    ctx.lineTo(-6, -1);
    ctx.stroke();
    ctx.fillStyle = '#4a3a2a';
    ctx.beginPath();
    ctx.arc(10, -8, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return;
  }

  // --- Spear (two-handed, level, thrusting forward) ---
  const dx = 5 * thrust;
  const backX = -8 + dx;
  const tipBase = 14 + dx; // where the shaft ends and the head begins
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

  // Arms gripping the shaft, then glove marks over the grip points.
  const frontHandX = tipBase - 5;
  const backHandX = backX + 6;
  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(1, -5);
  ctx.lineTo(frontHandX, shaftY);
  ctx.moveTo(-1.5, -4.5);
  ctx.lineTo(backHandX, shaftY);
  ctx.stroke();
  ctx.fillStyle = '#4a3a2a';
  ctx.beginPath();
  ctx.arc(frontHandX, shaftY, 1.5, 0, Math.PI * 2);
  ctx.arc(backHandX, shaftY, 1.5, 0, Math.PI * 2);
  ctx.fill();

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

  // Legs — a braced stance.
  ctx.strokeStyle = '#3a2f26';
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(-2.5, 4);
  ctx.lineTo(-4.5, 11);
  ctx.moveTo(3, 4);
  ctx.lineTo(5, 11);
  ctx.stroke();

  // Torso / coat, with a lit front edge.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.quadraticCurveTo(8, -5.5, 6.6, 6.5);
  ctx.quadraticCurveTo(0, 8.5, -6.6, 6.5);
  ctx.quadraticCurveTo(-8, -5.5, 0, -9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = bodyLit;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.quadraticCurveTo(8, -5.5, 6.6, 6.5);
  ctx.quadraticCurveTo(3.4, 7.5, 2.8, 6.5);
  ctx.quadraticCurveTo(3.8, -4, 0, -9);
  ctx.closePath();
  ctx.fill();

  // Head + peaked cap.
  ctx.fillStyle = '#e8c39c'; // face
  ctx.beginPath();
  ctx.arc(0.8, -11.5, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color; // cap crown
  ctx.beginPath();
  ctx.moveTo(-3, -12);
  ctx.quadraticCurveTo(-3.4, -16, 1, -16);
  ctx.quadraticCurveTo(4.6, -16, 4.4, -12.2);
  ctx.quadraticCurveTo(1, -13.6, -3, -12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = bodyDark; // short peak toward the front
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(3.6, -12.7);
  ctx.lineTo(7, -13.1);
  ctx.stroke();

  // --- Crossbow (held level, aimed forward) ---
  const dx = -3 * fire; // recoil kick on the shot
  const y = -5;
  const backX = 1 + dx;
  const frontX = 16 + dx;
  const prodX = 13 + dx;
  const loaded = fire < 0.5;
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

  // Arms gripping the weapon, then glove marks over the grips.
  const frontHandX = prodX - 3;
  const backHandX = backX + 4;
  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(1, -5);
  ctx.lineTo(frontHandX, y + 0.5);
  ctx.moveTo(-1, -4.5);
  ctx.lineTo(backHandX, y);
  ctx.stroke();
  ctx.fillStyle = '#4a3a2a';
  ctx.beginPath();
  ctx.arc(frontHandX, y + 0.5, 1.5, 0, Math.PI * 2);
  ctx.arc(backHandX, y, 1.5, 0, Math.PI * 2);
  ctx.fill();

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

  // Legs — a relaxed stance.
  ctx.strokeStyle = '#3a2f26';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-2, 4);
  ctx.lineTo(-3.5, 11);
  ctx.moveTo(2.5, 4);
  ctx.lineTo(3.5, 11);
  ctx.stroke();

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

  // Tunic — with a lit front edge.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.quadraticCurveTo(7.5, -4.5, 6.2, 6.5);
  ctx.quadraticCurveTo(0, 8.5, -6.2, 6.5);
  ctx.quadraticCurveTo(-7.5, -4.5, 0, -8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = bodyLit;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.quadraticCurveTo(7.5, -4.5, 6.2, 6.5);
  ctx.quadraticCurveTo(3, 7.5, 2.5, 6.5);
  ctx.quadraticCurveTo(3.6, -3.5, 0, -8);
  ctx.closePath();
  ctx.fill();

  // Head + wide-brim straw hat (brim, then crown on top).
  ctx.fillStyle = '#e8c39c'; // face
  ctx.beginPath();
  ctx.arc(1, -10, 3.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = straw; // brim
  ctx.beginPath();
  ctx.ellipse(1, -12.8, 7, 1.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = strawDark;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = straw; // crown
  ctx.beginPath();
  ctx.moveTo(-2, -13);
  ctx.quadraticCurveTo(1, -17.5, 4, -13);
  ctx.closePath();
  ctx.fill();

  // Hoe — shaft from the front hand down to the ground, with a small blade.
  const handX = 5;
  const handY = -4;
  const footX = 11;
  const footY = 11;
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(handX, handY);
  ctx.lineTo(footX, footY);
  ctx.stroke();
  ctx.strokeStyle = '#7f8895'; // metal head
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(footX, footY);
  ctx.lineTo(footX + 3.5, footY - 1);
  ctx.stroke();

  // Arms: front to the hoe, rear to the wheat; glove marks over each grip.
  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(1, -4.5);
  ctx.lineTo(handX, handY);
  ctx.moveTo(-1.5, -4);
  ctx.lineTo(whX, whY);
  ctx.stroke();
  ctx.fillStyle = '#4a3a2a';
  ctx.beginPath();
  ctx.arc(handX, handY, 1.5, 0, Math.PI * 2);
  ctx.arc(whX, whY, 1.5, 0, Math.PI * 2);
  ctx.fill();

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
  const skin = '#e8c39c';
  const wood = '#6e4a26';

  // Robe — a tall bell from shoulders to a wide hem (hides the feet).
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.quadraticCurveTo(7, -4, 8, 11);
  ctx.lineTo(-8, 11);
  ctx.quadraticCurveTo(-7, -4, 0, -8);
  ctx.closePath();
  ctx.fill();
  // Lit front fold + a couple of hem creases for volume.
  ctx.fillStyle = robeLit;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.quadraticCurveTo(7, -4, 8, 11);
  ctx.lineTo(3, 11);
  ctx.quadraticCurveTo(3.4, -3, 0, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = robeDark;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-3, 11);
  ctx.lineTo(-2, 3);
  ctx.moveTo(1, 11);
  ctx.lineTo(1.2, 4);
  ctx.stroke();

  // Head + a short beard.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(1.4, -11, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#dfe6ee'; // wispy beard
  ctx.beginPath();
  ctx.moveTo(-1.4, -10);
  ctx.quadraticCurveTo(1.4, -4.5, 4.2, -9.5);
  ctx.quadraticCurveTo(2.4, -8, 1.4, -8.2);
  ctx.closePath();
  ctx.fill();

  // Pointed wizard hat — wide brim, then a tall crown bending back at the tip.
  ctx.fillStyle = robeDark;
  ctx.beginPath();
  ctx.ellipse(1.2, -13.4, 6.6, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-3.4, -13.4);
  ctx.quadraticCurveTo(-1, -21, 3.2, -19.6); // back edge up to the bent tip
  ctx.quadraticCurveTo(1.6, -16, 5, -13.6); // front edge back down to the brim
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = robeLit; // a lit band of the crown
  ctx.beginPath();
  ctx.moveTo(-2.4, -13.6);
  ctx.quadraticCurveTo(-0.6, -18.5, 1.2, -18.4);
  ctx.quadraticCurveTo(0.4, -16, 1.8, -13.7);
  ctx.closePath();
  ctx.fill();

  // --- Staff & casting arm ---
  // The staff pivots about the front hand: level at rest, kicked up on a cast.
  const handX = 6.5;
  const handY = -3;
  const ang = (-8 - 26 * cast) * (Math.PI / 180); // raises with the cast
  ctx.strokeStyle = robeDark; // sleeve to the grip
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(1.5, -5);
  ctx.lineTo(handX, handY);
  ctx.stroke();

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

  const swing = Math.sin(phase); // -1..1 leg swing
  const bob = Math.abs(Math.sin(phase)); // 0..1 vertical bob on each stride

  if (view === 'side') {
    // --- Profile (walking along the row) ---
    // Legs stride about the hip: front foot swings ahead as the back foot trails.
    const s = swing * 3.6;
    ctx.strokeStyle = boot;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(1, 3);
    ctx.lineTo(1 + s, 12);
    ctx.moveTo(-1, 3);
    ctx.lineTo(-1 - s, 12);
    ctx.stroke();

    ctx.save();
    ctx.translate(0, -bob * 1.2); // upper body bobs with each step

    // Spear slung over the rear shoulder, angled up and back.
    ctx.strokeStyle = wood;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, -3);
    ctx.lineTo(-11, -18);
    ctx.stroke();
    ctx.fillStyle = steel; // leaf head
    ctx.beginPath();
    ctx.moveTo(-11, -18);
    ctx.lineTo(-13.6, -22.5);
    ctx.lineTo(-9.2, -21);
    ctx.closePath();
    ctx.fill();

    // Torso / cuirass with a lit front edge for volume.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(7, -6, 6, 5);
    ctx.quadraticCurveTo(0, 7.5, -6, 5);
    ctx.quadraticCurveTo(-7, -6, 0, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = armorLit;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(7, -6, 6, 5);
    ctx.quadraticCurveTo(3, 6.4, 2.5, 5);
    ctx.quadraticCurveTo(3.3, -4, 0, -9);
    ctx.closePath();
    ctx.fill();

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

    // Round shield carried on the front arm.
    ctx.save();
    ctx.translate(5.5, 0.5);
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = steelDark;
    ctx.stroke();
    ctx.fillStyle = steel; // central boss
    ctx.beginPath();
    ctx.arc(0, 0, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Front / back (marching toward or away from the viewer) ---
  const back = view === 'back';
  // Legs step in place: each foot lifts on its half of the cycle.
  const liftL = Math.max(0, swing) * 2.6;
  const liftR = Math.max(0, -swing) * 2.6;
  ctx.strokeStyle = boot;
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(-3, 3);
  ctx.lineTo(-3, 12 - liftL);
  ctx.moveTo(3, 3);
  ctx.lineTo(3, 12 - liftR);
  ctx.stroke();

  ctx.save();
  ctx.translate(0, -bob * 1);

  if (back) {
    // Cloak draped down the back, with a spine seam and a couple of folds so it
    // isn't a flat blank from behind.
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(8, -6, 6.5, 7);
    ctx.quadraticCurveTo(0, 8.5, -6.5, 7);
    ctx.quadraticCurveTo(-8, -6, 0, -9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(color, -0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7.5);
    ctx.lineTo(0, 6.5); // spine seam
    ctx.moveTo(-3.6, -5);
    ctx.quadraticCurveTo(-2.6, 1, -3.2, 6); // left fold
    ctx.moveTo(3.6, -5);
    ctx.quadraticCurveTo(2.6, 1, 3.2, 6); // right fold
    ctx.stroke();
  } else {
    // Torso / cuirass, symmetric with a soft centre highlight.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(7.5, -6, 6.5, 6.5);
    ctx.quadraticCurveTo(0, 8, -6.5, 6.5);
    ctx.quadraticCurveTo(-7.5, -6, 0, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = armorLit;
    ctx.beginPath();
    ctx.ellipse(0, -1.5, 2.4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Round shield: face-on and central when marching toward us, a slim edge
  // peeking past the side when marching away.
  if (back) {
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.ellipse(-6.5, 1, 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.save();
    ctx.translate(-4.5, 1);
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = steelDark;
    ctx.stroke();
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Spear held upright on the far side.
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(6, -16);
  ctx.lineTo(6, 8);
  ctx.stroke();
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.moveTo(6, -20);
  ctx.lineTo(4.4, -16);
  ctx.lineTo(7.6, -16);
  ctx.closePath();
  ctx.fill();

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
  const boot = '#3a2f26';
  const plume = '#b23a3a';

  const swing = Math.sin(phase);
  const bob = Math.abs(Math.sin(phase));

  if (view === 'side') {
    // --- Profile (walking along the row) ---
    const s = swing * 3.6;
    ctx.strokeStyle = boot;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(1, 3);
    ctx.lineTo(1 + s, 12);
    ctx.moveTo(-1, 3);
    ctx.lineTo(-1 - s, 12);
    ctx.stroke();

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

    // Torso / cuirass, bulkier than the grunt's.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(7.5, -6, 6.5, 6);
    ctx.quadraticCurveTo(0, 8, -6.5, 6);
    ctx.quadraticCurveTo(-7.5, -6, 0, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = armorLit;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(7.5, -6, 6.5, 6);
    ctx.quadraticCurveTo(3.2, 7, 2.7, 6);
    ctx.quadraticCurveTo(3.6, -4, 0, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = steelDark; // shoulder pauldron
    ctx.beginPath();
    ctx.ellipse(2.4, -6.6, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();

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
    ctx.strokeStyle = plume;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(1.4, -16.4);
    ctx.quadraticCurveTo(-3, -18, -5, -13.5);
    ctx.stroke();

    // Kite shield on the front arm.
    ctx.save();
    ctx.translate(5.5, 0.5);
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
  const liftL = Math.max(0, swing) * 2.6;
  const liftR = Math.max(0, -swing) * 2.6;
  ctx.strokeStyle = boot;
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(-3, 3);
  ctx.lineTo(-3, 12 - liftL);
  ctx.moveTo(3, 3);
  ctx.lineTo(3, 12 - liftR);
  ctx.stroke();

  ctx.save();
  ctx.translate(0, -bob * 1);

  if (back) {
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(8.5, -6, 7, 7);
    ctx.quadraticCurveTo(0, 8.5, -7, 7);
    ctx.quadraticCurveTo(-8.5, -6, 0, -9);
    ctx.closePath();
    ctx.fill();
    // Backplate seams: a spine channel and two flanking lames for definition.
    ctx.strokeStyle = shade(color, -0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7.5);
    ctx.lineTo(0, 6);
    ctx.moveTo(-4.2, -6);
    ctx.lineTo(-3.6, 5.4);
    ctx.moveTo(4.2, -6);
    ctx.lineTo(3.6, 5.4);
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(8, -6, 7, 6.5);
    ctx.quadraticCurveTo(0, 8, -7, 6.5);
    ctx.quadraticCurveTo(-8, -6, 0, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = armorLit;
    ctx.beginPath();
    ctx.ellipse(0, -1.5, 2.6, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pauldrons on both shoulders.
  ctx.fillStyle = steelDark;
  ctx.beginPath();
  ctx.ellipse(-6.6, -6, 2.6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(6.6, -6, 2.6, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sword held upright on the far side.
  ctx.strokeStyle = steel;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(6.5, -18);
  ctx.lineTo(6.5, 6);
  ctx.stroke();
  ctx.strokeStyle = steelDark; // crossguard + pommel
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4.5, 3.5);
  ctx.lineTo(8.5, 3.5);
  ctx.stroke();

  // Shield: kite face-on when marching toward us, a slim edge from behind.
  if (back) {
    ctx.fillStyle = armorDark;
    ctx.beginPath();
    ctx.ellipse(-7, 1, 2, 6.5, 0, 0, Math.PI * 2);
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
  // Red plume tuft on the crown (both facings).
  ctx.fillStyle = plume;
  ctx.beginPath();
  ctx.moveTo(-1.3, -16.4);
  ctx.quadraticCurveTo(0, -18.8, 1.3, -16.4);
  ctx.quadraticCurveTo(0, -14.6, -1.3, -16.4);
  ctx.closePath();
  ctx.fill();

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
    ctx.strokeStyle = coatDark;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-7, 2);
    ctx.lineTo(-7 + b, 12);
    ctx.moveTo(-4.5, 2);
    ctx.lineTo(-4.5 - b, 12);
    ctx.moveTo(5.5, 2);
    ctx.lineTo(5.5 + f, 12);
    ctx.moveTo(8, 2);
    ctx.lineTo(8 - f, 12);
    ctx.stroke();
    ctx.fillStyle = hoof;
    for (const [hx, hy] of [
      [-7 + b, 12],
      [-4.5 - b, 12],
      [5.5 + f, 12],
      [8 - f, 12],
    ] as const) {
      ctx.beginPath();
      ctx.arc(hx, hy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

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
    ctx.fillStyle = rider; // torso
    ctx.beginPath();
    ctx.moveTo(-2.5, -6);
    ctx.quadraticCurveTo(-4.5, -12, -1, -14);
    ctx.quadraticCurveTo(3.5, -13.5, 2.5, -7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(rider, -0.2); // front arm to the reins
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(1, -10);
    ctx.lineTo(9, -6);
    ctx.stroke();
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
  ctx.strokeStyle = coatDark;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(-5.5, 3);
  ctx.lineTo(-5.5, 12 - Math.max(0, step) * 2);
  ctx.moveTo(5.5, 3);
  ctx.lineTo(5.5, 12 - Math.max(0, -step) * 2);
  ctx.stroke();

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
    ctx.strokeStyle = boot;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-2.5, 12);
    ctx.lineTo(-2.5, 13.5 - lL);
    ctx.moveTo(2.5, 12);
    ctx.lineTo(2.5, 13.5 - lR);
    ctx.stroke();
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
    ctx.strokeStyle = robeDark;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(2, -5);
    ctx.lineTo(hx, -3);
    ctx.stroke();
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
  const boot = '#3a2f26';
  const gold = '#e7b64a';
  const goldDark = '#a97e26';
  const plume = '#f0f3f8'; // officer's white horsehair crest
  const plumeDark = '#c3cad6';
  const cape = '#33509e'; // knight-company royal blue
  const capeDark = shade(cape, -0.3);

  const swing = Math.sin(phase);
  const bob = Math.abs(Math.sin(phase));

  if (view === 'side') {
    // --- Profile (walking along the row) ---
    const s = swing * 3.8;
    ctx.strokeStyle = boot;
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(1, 3);
    ctx.lineTo(1 + s, 12);
    ctx.moveTo(-1, 3);
    ctx.lineTo(-1 - s, 12);
    ctx.stroke();

    ctx.save();
    ctx.translate(0, -bob * 1.2);

    // Cape streaming off the rear shoulder, trailing behind the march.
    ctx.fillStyle = cape;
    ctx.beginPath();
    ctx.moveTo(-1.5, -7);
    ctx.quadraticCurveTo(-12 - bob * 2, -3, -9 - bob * 3, 9);
    ctx.quadraticCurveTo(-5, 6, -2, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold; // trailing gold trim
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-12 - bob * 2, -3);
    ctx.quadraticCurveTo(-11 - bob * 3, 4, -9 - bob * 3, 9);
    ctx.stroke();

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

    // Torso / cuirass — broad, with a lit front edge and gold trim.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(7.6, -6, 6.6, 6);
    ctx.quadraticCurveTo(0, 8, -6.6, 6);
    ctx.quadraticCurveTo(-7.6, -6, 0, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = armorLit;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(7.6, -6, 6.6, 6);
    ctx.quadraticCurveTo(3.2, 7, 2.7, 6);
    ctx.quadraticCurveTo(3.6, -4, 0, -9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold; // waist / belt trim
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-6, 3.4);
    ctx.quadraticCurveTo(0, 5.4, 6.2, 3.4);
    ctx.stroke();
    ctx.fillStyle = gold; // shoulder pauldron, gold-capped
    ctx.beginPath();
    ctx.ellipse(2.6, -6.8, 3.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = armorLit;
    ctx.beginPath();
    ctx.ellipse(2.6, -7.2, 2.4, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();

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
    ctx.translate(5.6, 0.8);
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
  const liftL = Math.max(0, swing) * 2.8;
  const liftR = Math.max(0, -swing) * 2.8;
  ctx.strokeStyle = boot;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-3.2, 3);
  ctx.lineTo(-3.2, 12 - liftL);
  ctx.moveTo(3.2, 3);
  ctx.lineTo(3.2, 12 - liftR);
  ctx.stroke();

  ctx.save();
  ctx.translate(0, -bob * 1);

  if (back) {
    // Full royal cape draped down the back, gold-trimmed with a centre seam.
    ctx.fillStyle = cape;
    ctx.beginPath();
    ctx.moveTo(0, -9.5);
    ctx.quadraticCurveTo(9, -6, 8, 9.5);
    ctx.quadraticCurveTo(0, 11, -8, 9.5);
    ctx.quadraticCurveTo(-9, -6, 0, -9.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, 9.5);
    ctx.quadraticCurveTo(0, 11, 8, 9.5);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 10.2);
    ctx.stroke();
  } else {
    // Cape edges flaring out past both shoulders.
    ctx.fillStyle = capeDark;
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.quadraticCurveTo(-11, -2, -8.5, 9);
    ctx.lineTo(-5, 7);
    ctx.quadraticCurveTo(-6, -2, -6, -8);
    ctx.closePath();
    ctx.moveTo(6, -8);
    ctx.quadraticCurveTo(11, -2, 8.5, 9);
    ctx.lineTo(5, 7);
    ctx.quadraticCurveTo(6, -2, 6, -8);
    ctx.closePath();
    ctx.fill();

    // Torso / cuirass, symmetric with a gold sternum ridge and belt.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -9.5);
    ctx.quadraticCurveTo(8, -6, 7, 7);
    ctx.quadraticCurveTo(0, 8.6, -7, 7);
    ctx.quadraticCurveTo(-8, -6, 0, -9.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = armorLit;
    ctx.beginPath();
    ctx.ellipse(0, -1.5, 2.6, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 4);
    ctx.moveTo(-6.4, 4);
    ctx.quadraticCurveTo(0, 6, 6.4, 4);
    ctx.stroke();
  }

  // Gold-capped pauldrons on both shoulders.
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.ellipse(-7, -6.2, 3, 2.2, 0, 0, Math.PI * 2);
  ctx.ellipse(7, -6.2, 3, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = goldDark;
  ctx.beginPath();
  ctx.ellipse(-7, -5.6, 3, 1, 0, 0, Math.PI * 2);
  ctx.ellipse(7, -5.6, 3, 1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Raised longsword held upright on the near side (tip poking up from behind).
  ctx.strokeStyle = steel;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(7.2, -20);
  ctx.lineTo(7.2, back ? -6 : 6);
  ctx.stroke();
  ctx.strokeStyle = '#eef3f8';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(6.7, -19.5);
  ctx.lineTo(6.7, back ? -6 : 5);
  ctx.stroke();
  if (!back) {
    ctx.strokeStyle = gold; // crossguard + pommel toward the viewer
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(4.4, 1);
    ctx.lineTo(10, 1);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(7.2, 6.6, 1.2, 0, Math.PI * 2);
    ctx.fill();
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

  const swing = Math.sin(phase);
  const bob = Math.abs(Math.sin(phase));

  if (view === 'side') {
    // --- Profile (walking along the row) ---
    const s = swing * 3.9;
    // Legs — worn trousers with booted feet, a loose veteran's stride.
    ctx.strokeStyle = cloth;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(1, 2);
    ctx.lineTo(1 + s, 10.5);
    ctx.moveTo(-1, 2);
    ctx.lineTo(-1 - s, 10.5);
    ctx.stroke();
    ctx.strokeStyle = boot;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(1 + s, 10.5);
    ctx.lineTo(1 + s, 12.5);
    ctx.moveTo(-1 - s, 10.5);
    ctx.lineTo(-1 - s, 12.5);
    ctx.stroke();

    ctx.save();
    ctx.translate(0, -bob * 1.1);

    // A sheathed dagger tucked at the small of the back.
    ctx.strokeStyle = leather;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 1);
    ctx.lineTo(-7.5, 5.5);
    ctx.stroke();

    // Rear (off) arm hanging loose behind, bare with a linen wrap.
    ctx.strokeStyle = skinDark;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-1, -6);
    ctx.lineTo(-4.5 - swing * 1.5, 0.5);
    ctx.stroke();
    ctx.strokeStyle = wrap;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-3.4 - swing * 1.2, -1.5);
    ctx.lineTo(-4.5 - swing * 1.5, 0.5);
    ctx.stroke();

    // Bare torso — a lean, wiry, muscled teardrop with a lit front and shadow.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(5.8, -6, 4.9, 6);
    ctx.quadraticCurveTo(0, 7.6, -4.9, 6);
    ctx.quadraticCurveTo(-5.8, -6, 0, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = skinLit; // lit chest & belly down the front
    ctx.beginPath();
    ctx.moveTo(0.5, -8.5);
    ctx.quadraticCurveTo(5.4, -6, 4.6, 6);
    ctx.quadraticCurveTo(2.5, 6.6, 2.1, 6);
    ctx.quadraticCurveTo(2.9, -4, 0.5, -8.5);
    ctx.closePath();
    ctx.fill();
    // Pectoral + abdominal muscle shading.
    ctx.strokeStyle = muscle;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0.8, -4.6);
    ctx.quadraticCurveTo(3.4, -3.6, 4.3, -5); // pec underline
    ctx.moveTo(2.6, -1.5);
    ctx.lineTo(2.9, 4.2); // ab centre line
    ctx.moveTo(1.2, 0.4);
    ctx.lineTo(4.1, 0.8); // upper ab crease
    ctx.moveTo(1.4, 3);
    ctx.lineTo(4, 3.4); // lower ab crease
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
    ctx.moveTo(-4.8, 3.8);
    ctx.quadraticCurveTo(0, 6, 4.8, 3.8);
    ctx.lineTo(4.6, 6.2);
    ctx.quadraticCurveTo(0, 8, -4.6, 6.2);
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

    // --- Sword held forward two-handed in an easy ready guard ---
    const gripX = 5.5, gripY = -2.5;
    // Lead (front) arm to the grip, bare with a forearm wrap.
    ctx.strokeStyle = skin;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(2, -6);
    ctx.lineTo(gripX, gripY);
    ctx.stroke();
    ctx.strokeStyle = wrap;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(4, -4);
    ctx.lineTo(gripX, gripY);
    ctx.stroke();
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

    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Front / back (marching toward or away from the viewer) ---
  const back = view === 'back';
  const liftL = Math.max(0, swing) * 2.9;
  const liftR = Math.max(0, -swing) * 2.9;
  // Legs — trousers with booted feet.
  ctx.strokeStyle = cloth;
  ctx.lineWidth = 4.4;
  ctx.beginPath();
  ctx.moveTo(-3.4, 2);
  ctx.lineTo(-3.4, 11 - liftL);
  ctx.moveTo(3.4, 2);
  ctx.lineTo(3.4, 11 - liftR);
  ctx.stroke();
  ctx.strokeStyle = boot;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(-3.4, 11 - liftL);
  ctx.lineTo(-3.4, 12.5 - liftL);
  ctx.moveTo(3.4, 11 - liftR);
  ctx.lineTo(3.4, 12.5 - liftR);
  ctx.stroke();

  ctx.save();
  ctx.translate(0, -bob * 1);

  // Bare, wiry torso (lean shoulders tapering to a narrow waist).
  ctx.fillStyle = back ? skinDark : skin;
  ctx.beginPath();
  ctx.moveTo(0, -9.5);
  ctx.quadraticCurveTo(6.2, -6.5, 5.2, 6.5);
  ctx.quadraticCurveTo(0, 8, -5.2, 6.5);
  ctx.quadraticCurveTo(-6.2, -6.5, 0, -9.5);
  ctx.closePath();
  ctx.fill();

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
    ctx.fillStyle = skinLit;
    ctx.beginPath();
    ctx.ellipse(0, -1, 1.9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = muscle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3.6, -5.5);
    ctx.quadraticCurveTo(-1.3, -3.6, 0, -5.2); // left pec
    ctx.moveTo(3.6, -5.5);
    ctx.quadraticCurveTo(1.3, -3.6, 0, -5.2); // right pec
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
    ctx.moveTo(-4.2, -7.4);
    ctx.lineTo(4.2, 4);
    ctx.moveTo(4.2, -7.4);
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
  ctx.moveTo(-5.2, 4.5);
  ctx.quadraticCurveTo(0, 6.4, 5.2, 4.5);
  ctx.lineTo(5, 7);
  ctx.quadraticCurveTo(0, 8.8, -5, 7);
  ctx.closePath();
  ctx.fill();

  // Lean bare arms down the sides, each ending in a linen forearm wrap.
  ctx.strokeStyle = back ? skinDark : skin;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-5, -6.5);
  ctx.lineTo(-5.7, 1.5);
  ctx.moveTo(5, -6.5);
  ctx.lineTo(5.7, 1.5);
  ctx.stroke();
  ctx.strokeStyle = wrap;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-5.5, -0.5);
  ctx.lineTo(-5.7, 1.8);
  ctx.moveTo(5.5, -0.5);
  ctx.lineTo(5.7, 1.8);
  ctx.stroke();

  // Longsword held upright in the near hand (blade rising past the shoulder).
  ctx.save();
  ctx.translate(5.7, 1.5);
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

  const swing = Math.sin(phase);
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
    const s = swing * 3.2; // heavy, short strides
    ctx.strokeStyle = steelDark;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(1.5, 4);
    ctx.lineTo(1.5 + s, 13);
    ctx.moveTo(-1.5, 4);
    ctx.lineTo(-1.5 - s, 13);
    ctx.stroke();
    // Sabatons (armored feet).
    ctx.strokeStyle = steelDeep;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(1.5 + s, 13);
    ctx.lineTo(4 + s, 13);
    ctx.moveTo(-1.5 - s, 13);
    ctx.lineTo(1 - s, 13);
    ctx.stroke();

    ctx.save();
    ctx.translate(0, -bob * 1);

    // Broad steel cuirass — a bulky barrel of a torso.
    ctx.fillStyle = steelMid;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.quadraticCurveTo(9.5, -8, 8.5, 7);
    ctx.quadraticCurveTo(0, 9.5, -8.5, 7);
    ctx.quadraticCurveTo(-9.5, -8, 0, -11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = steel; // lit front edge
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.quadraticCurveTo(9.5, -8, 8.5, 7);
    ctx.quadraticCurveTo(4.6, 8, 4, 7);
    ctx.quadraticCurveTo(4.6, -5, 0, -11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = steelDark; // fauld / belt line
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-8, 3.6);
    ctx.quadraticCurveTo(0, 5.8, 8.2, 3.6);
    ctx.stroke();
    // Bulky rear pauldron.
    ctx.fillStyle = steelDark;
    ctx.beginPath();
    ctx.ellipse(-4, -8.4, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = steelMid;
    ctx.beginPath();
    ctx.ellipse(2.8, -8.6, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

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
    ctx.translate(7.5, 0);
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
  const liftL = Math.max(0, swing) * 2.4;
  const liftR = Math.max(0, -swing) * 2.4;
  ctx.strokeStyle = steelDark;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-4, 4);
  ctx.lineTo(-4, 13 - liftL);
  ctx.moveTo(4, 4);
  ctx.lineTo(4, 13 - liftR);
  ctx.stroke();

  ctx.save();
  ctx.translate(0, -bob * 0.9);

  // Broad steel cuirass (back plate is a touch darker).
  ctx.fillStyle = back ? steelDark : steelMid;
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.quadraticCurveTo(10.5, -8, 9, 8);
  ctx.quadraticCurveTo(0, 10, -9, 8);
  ctx.quadraticCurveTo(-10.5, -8, 0, -11);
  ctx.closePath();
  ctx.fill();
  if (!back) {
    ctx.fillStyle = steel; // central lit ridge
    ctx.beginPath();
    ctx.ellipse(0, -1.5, 3, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Backplate: a spine ridge and two flanking lame seams for definition.
    ctx.strokeStyle = steelDeep;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(0, 7);
    ctx.moveTo(-5, -7);
    ctx.lineTo(-4.2, 6.5);
    ctx.moveTo(5, -7);
    ctx.lineTo(4.2, 6.5);
    ctx.stroke();
    ctx.strokeStyle = steel; // a lit highlight down the spine
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-0.8, -8.5);
    ctx.lineTo(-0.8, 6);
    ctx.stroke();
  }
  // Heavy pauldrons on both shoulders.
  ctx.fillStyle = steelDark;
  ctx.beginPath();
  ctx.ellipse(-8.6, -7.5, 3.4, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(8.6, -7.5, 3.4, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Great tower shield held across the body: face-on (with emblem) toward us, a
  // slim edge when seen from behind.
  if (back) {
    ctx.fillStyle = steelDeep;
    ctx.beginPath();
    ctx.ellipse(-8.5, 1, 2.4, 8, 0, 0, Math.PI * 2);
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

  const swing = Math.sin(phase); // -1..1 step
  const bob = Math.abs(Math.sin(phase)); // 0..1 vertical bob
  const sway = swing * 1.1; // hem drift

  if (view === 'side') {
    // --- Profile (walking along the row) ---
    // Two boots peek under the robe, one stepping ahead of the other.
    const s = swing * 2.4;
    ctx.strokeStyle = boot;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(1.2, 9);
    ctx.lineTo(1.2 + s, 12.5);
    ctx.moveTo(-1.2, 9);
    ctx.lineTo(-1.2 - s, 12.5);
    ctx.stroke();

    ctx.save();
    ctx.translate(0, -bob * 0.9); // upper body bobs with the stride

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

    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Front / back (marching toward or away from the viewer) ---
  const back = view === 'back';
  // Boots step in place, each lifting on its half of the cycle, peeking out.
  const liftL = Math.max(0, swing) * 2;
  const liftR = Math.max(0, -swing) * 2;
  ctx.strokeStyle = boot;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(-2.4, 9.5);
  ctx.lineTo(-2.4, 12.5 - liftL);
  ctx.moveTo(2.4, 9.5);
  ctx.lineTo(2.4, 12.5 - liftR);
  ctx.stroke();

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

  // Staff upright on the near side (a slim shaft from behind), orb on top.
  ctx.strokeStyle = wood;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(back ? 6.5 : -6, 11);
  ctx.lineTo(back ? 6.5 : -6, -17);
  ctx.stroke();
  drawStaffOrb(ctx, back ? 6.5 : -6, -19);

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
 * Procedural Gowzer silhouette — a low-ranking Night Falcon: a hooded rogue in
 * dark robes edged with gold, a shadowed face lit only by gold eyes, the order's
 * falcon sigil on his chest and a curved dagger in hand. Painted in the caller's
 * local space at a modest `1.15×` (a shade bigger than the grunts, small fry as
 * bosses go). Same three authored views as the footmen ('side' mirrored on
 * `faceLeft`, 'front', 'back'); `phase` (radians) is the walk-cycle position
 * advanced from distance travelled. Boss `boss4`.
 */
export function drawGowzer(
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
  ctx.scale(1.15, 1.15); // small fry — only a little bigger than the grunts

  const robe = color;
  const robeLit = shade(color, 0.28);
  const robeDark = shade(color, -0.4);
  const gold = '#d9b24a';
  const goldLit = '#f2d67e';
  const steel = '#c9d2dc';
  const boot = '#1a1016';
  const eye = '#ffcf4d'; // gold glare from the hood's shadow
  const faceShadow = '#0a0308';

  const swing = Math.sin(phase);
  const bob = Math.abs(Math.sin(phase));

  if (view === 'side') {
    // --- Profile (walking along the row) ---
    const s = swing * 3.4;
    ctx.strokeStyle = boot;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(1, 4);
    ctx.lineTo(1 + s, 12);
    ctx.moveTo(-1, 4);
    ctx.lineTo(-1 - s, 12);
    ctx.stroke();

    ctx.save();
    ctx.translate(0, -bob * 1.1); // stealthy bob

    // Short cape streaming off the rear shoulder.
    ctx.fillStyle = robeDark;
    ctx.beginPath();
    ctx.moveTo(-1.5, -6);
    ctx.quadraticCurveTo(-9 - bob * 2, -2, -7 - bob * 2, 8);
    ctx.quadraticCurveTo(-4, 5, -1.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold; // trailing gold hem
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-9 - bob * 2, -2);
    ctx.quadraticCurveTo(-8.5 - bob * 2, 3, -7 - bob * 2, 8);
    ctx.stroke();

    // Robe torso, flaring slightly to a gold-hemmed skirt.
    ctx.fillStyle = robe;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.quadraticCurveTo(6.5, -5, 6, 6);
    ctx.quadraticCurveTo(0, 8.5, -6, 6);
    ctx.quadraticCurveTo(-6.5, -5, 0, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = robeLit; // lit front edge
    ctx.beginPath();
    ctx.moveTo(0.5, -8);
    ctx.quadraticCurveTo(5.5, -4, 5, 6);
    ctx.quadraticCurveTo(2.6, 7, 2.2, 6);
    ctx.quadraticCurveTo(2.8, -4, 0.5, -8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold; // sash at the waist
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-5, 2.4);
    ctx.quadraticCurveTo(0, 4.2, 5.6, 2.4);
    ctx.stroke();
    drawFalconSigil(ctx, 3.4, -2.5, 0.62, gold); // sigil on the chest

    // Hood: a dark cowl peaking back over the head, its opening a shadowed face
    // with a single gold eye glinting out.
    ctx.fillStyle = robeDark;
    ctx.beginPath();
    ctx.moveTo(-3, -6.5);
    ctx.quadraticCurveTo(-5.5, -15, -1, -17.5);
    ctx.quadraticCurveTo(5.5, -18, 5.5, -11);
    ctx.quadraticCurveTo(5.5, -8.5, 3.5, -7);
    ctx.quadraticCurveTo(0, -8.5, -3, -6.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = faceShadow; // shadowed face opening
    ctx.beginPath();
    ctx.ellipse(3, -11.4, 2.4, 2.9, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = eye; // gold eye
    ctx.beginPath();
    ctx.ellipse(3.4, -11.6, 0.9, 0.7, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gold; // gold rim tracing the hood edge
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-1, -17.4);
    ctx.quadraticCurveTo(5.4, -17.8, 5.4, -11.2);
    ctx.stroke();

    ctx.restore();
    ctx.restore();
    return;
  }

  // --- Front / back (marching toward or away from the viewer) ---
  const back = view === 'back';
  const liftL = Math.max(0, swing) * 2.4;
  const liftR = Math.max(0, -swing) * 2.4;
  ctx.strokeStyle = boot;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(-2.4, 4);
  ctx.lineTo(-2.4, 12 - liftL);
  ctx.moveTo(2.4, 4);
  ctx.lineTo(2.4, 12 - liftR);
  ctx.stroke();

  ctx.save();
  ctx.translate(0, -bob * 0.9);

  // Robe body, symmetric, flaring to a gold-hemmed skirt.
  ctx.fillStyle = back ? robeDark : robe;
  ctx.beginPath();
  ctx.moveTo(-4.5, -7.5);
  ctx.quadraticCurveTo(-7.5, 0, -7, 9);
  ctx.quadraticCurveTo(0, 11, 7, 9);
  ctx.quadraticCurveTo(7.5, 0, 4.5, -7.5);
  ctx.quadraticCurveTo(0, -9.5, -4.5, -7.5);
  ctx.closePath();
  ctx.fill();

  if (back) {
    // Cape down the back, gold spine seam.
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 9);
    ctx.stroke();
    ctx.strokeStyle = shade(color, -0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3.4, -4);
    ctx.quadraticCurveTo(-3, 3, -3.4, 8.5);
    ctx.moveTo(3.4, -4);
    ctx.quadraticCurveTo(3, 3, 3.4, 8.5);
    ctx.stroke();
  } else {
    ctx.fillStyle = robeLit; // centre highlight
    ctx.beginPath();
    ctx.ellipse(0, 0, 2, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gold; // hem + sash
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-6.6, 8.6);
    ctx.quadraticCurveTo(0, 10.4, 6.6, 8.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4.6, 2);
    ctx.quadraticCurveTo(0, 3.6, 4.6, 2);
    ctx.stroke();
    drawFalconSigil(ctx, 0, -2.5, 0.7, gold); // sigil on the chest
    // Curved dagger held out to one side.
    ctx.strokeStyle = steel;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-6, 3);
    ctx.quadraticCurveTo(-9.5, 1, -10, -3);
    ctx.stroke();
  }

  // Hood — a dark peaked cowl. From the front, a shadowed face with two gold
  // eyes; from behind, the back of the cowl over a shadowed nape (never a bare
  // hood: the head must read under it).
  if (back) {
    ctx.fillStyle = faceShadow; // nape in the hood's shadow
    ctx.beginPath();
    ctx.arc(0, -11, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = robeDark; // cowl
    ctx.beginPath();
    ctx.moveTo(-5, -8.5);
    ctx.quadraticCurveTo(-5, -18.5, 0, -19.5);
    ctx.quadraticCurveTo(5, -18.5, 5, -8.5);
    ctx.quadraticCurveTo(0, -10.5, -5, -8.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold; // gold rim
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-4.6, -9);
    ctx.quadraticCurveTo(0, -11, 4.6, -9);
    ctx.stroke();
    drawFalconSigil(ctx, 0, -14.5, 0.55, gold); // sigil on the hood crown
  } else {
    ctx.fillStyle = robeDark; // cowl framing the face
    ctx.beginPath();
    ctx.moveTo(-5, -8);
    ctx.quadraticCurveTo(-5.4, -18.5, 0, -19.5);
    ctx.quadraticCurveTo(5.4, -18.5, 5, -8);
    ctx.quadraticCurveTo(3.4, -9.5, 3.2, -12);
    ctx.quadraticCurveTo(0, -13, -3.2, -12);
    ctx.quadraticCurveTo(-3.4, -9.5, -5, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = faceShadow; // shadowed face opening
    ctx.beginPath();
    ctx.ellipse(0, -12, 2.9, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = eye; // two gold eyes
    ctx.beginPath();
    ctx.ellipse(-1.3, -12.3, 0.85, 0.7, 0, 0, Math.PI * 2);
    ctx.ellipse(1.3, -12.3, 0.85, 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gold; // gold rim tracing the hood opening
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-4.4, -9);
    ctx.quadraticCurveTo(-5, -17.5, 0, -18.5);
    ctx.quadraticCurveTo(5, -17.5, 4.4, -9);
    ctx.stroke();
    ctx.fillStyle = goldLit; // a small gold clasp at the throat
    ctx.beginPath();
    ctx.arc(0, -7.5, 1, 0, Math.PI * 2);
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
    id === 'cas_runner' ||
    id === 'cas_mage' ||
    id === 'cas_brute' ||
    id === 'boss1' ||
    id === 'boss2' ||
    id === 'boss3' ||
    id === 'boss4' ||
    id === 'boss5'
  );
}

/**
 * Dispatch to the right procedural enemy sprite for an enemy `id`, choosing the
 * authored view from the travel direction. `dist` is the distance the enemy has
 * walked along its path; each sprite scales it into its own motion cadence (the
 * grunt's stride, the horse's gallop, the ram's wheel-roll) so movement drives
 * the animation. No-op for ids without a sprite; callers gate on `hasEnemySprite`.
 */
export function drawEnemySprite(
  ctx: CanvasRenderingContext2D,
  id: string,
  color: string,
  view: 'side' | 'front' | 'back',
  faceLeft: boolean,
  dist: number,
  sit = 0,
): void {
  if (id === 'boss1') drawCaptain(ctx, color, view, faceLeft, dist * 0.2);
  else if (id === 'boss2') drawMercenary(ctx, color, view, faceLeft, dist * 0.19);
  else if (id === 'boss3') drawIronWarden(ctx, color, view, faceLeft, dist * 0.16);
  else if (id === 'boss4') drawGowzer(ctx, color, view, faceLeft, dist * 0.22);
  else if (id === 'cas_grunt') drawGrunt(ctx, color, view, faceLeft, dist * 0.22);
  else if (id === 'cas_grunt2') drawGrunt2(ctx, color, view, faceLeft, dist * 0.2);
  else if (id === 'cas_runner') drawOutrider(ctx, color, view, faceLeft, dist * 0.28);
  else if (id === 'cas_mage') drawRoyalMage(ctx, color, view, faceLeft, dist * 0.2);
  else if (id === 'cas_brute') drawSiegeRam(ctx, color, view, faceLeft, dist * 0.2);
  else if (id === 'boss5') drawKing(ctx, color, view, faceLeft, dist * 0.16, sit);
}

/** Unit `shape`s that have a procedural sprite (else the emoji token is used). */
export function hasSprite(shape: string): boolean {
  return (
    shape === 'archer' ||
    shape === 'sword' ||
    shape === 'spear' ||
    shape === 'crossbow' ||
    shape === 'farmer' ||
    shape === 'wizard'
  );
}

/**
 * Dispatch to the right procedural silhouette for a unit `shape`. `anim` (0..1)
 * is the shared attack-progress value (1 just after an attack, easing to 0 at
 * rest) — each sprite interprets it in its own way (the Archer's bowstring, the
 * Swordsman's sword swing). `throwing` marks the current attack as a special
 * throw (the Spearman's Javelin Toss) so its sprite plays the release instead of
 * a normal strike; other shapes ignore it. `empowered` marks a unit whose attack
 * has been transformed by an upgrade (the Wizard's unlocked Wind Slice), adding
 * its ambient flourish; other shapes ignore it. No-op for shapes without a
 * sprite; callers should gate on `hasSprite` and fall back to the emoji token.
 */
export function drawUnitSprite(
  ctx: CanvasRenderingContext2D,
  shape: string,
  color: string,
  faceLeft: boolean,
  anim: number,
  throwing = false,
  empowered = false,
): void {
  if (shape === 'archer') drawArcher(ctx, color, faceLeft, anim);
  else if (shape === 'sword') drawSwordsman(ctx, color, faceLeft, anim);
  else if (shape === 'spear') drawSpearman(ctx, color, faceLeft, anim, throwing);
  else if (shape === 'crossbow') drawCrossbowman(ctx, color, faceLeft, anim);
  else if (shape === 'farmer') drawFarmer(ctx, color, faceLeft);
  else if (shape === 'wizard') drawWizard(ctx, color, faceLeft, anim, empowered);
}

/**
 * The Sludge Father's entrance on The Getaway (`EnemyDef.entrance: 'sewerBurst'`),
 * played out on the board itself (no letterbox, no camera): its hands slap out
 * of the sewer mouth, it squeezes through the arch and bursts out as a giant,
 * lands, roars, and then the daylight hits it. Its sludge sizzles and crusts
 * over, and it sheds itself away in three lurches down to its walking size.
 *
 * The foe is held and untargetable through all of it (`Enemy.rise`, 1→0 over
 * `SEWER_BURST_TIME`, `riseFrom: 'sewer'`). It is spawned already standing
 * `SEWER_BURST_FORWARD` px down its lane, where the burst lands it, so it walks
 * on from there with no jump. The engine voices the beats (`SEWER_BURST_CUES`,
 * sound and fx) and the renderer draws the figure from `sewerBurstPose`; both
 * read this one timeline. Positions are relative to the lane's start, the cell
 * centre in the middle of the sewer entrance's mouth (`SEWER_MOUTH`).
 */

import { ease } from './palette';

/** Seconds the whole entrance takes. */
export const SEWER_BURST_TIME = 8.8;
/** How far down its lane the burst carries it (px): where it lands and walks on from. */
export const SEWER_BURST_FORWARD = 80;
/**
 * Its size (× its walking size) when it bursts out, before the sun shrinks it:
 * as big as fits between where it lands and the board's top edge as it rears.
 */
export const SEWER_BURST_GIANT = 2.2;

/**
 * The sewer entrance's mouth relative to the lane start (the mouth's
 * bottom-centre cell, see `sewerEntrance` in `props.ts`): its sill `floor` px
 * below, the arch's springline `spring` px above it, and the arch radius.
 */
export const SEWER_MOUTH = { floor: 20, spring: -12, r: 22 } as const;
/** Where the reaching hands slap down: `dy` below the lane start, `dx` either side. */
export const SEWER_BURST_PLANT = { dx: 26, dy: 34 } as const;
/** Its feet sit this far below its position (the walking sprite's foot line). */
export const SEWER_BURST_FEET = 6;

// The beats, in seconds from the spawn.
const REACH_R = [0.45, 0.8] as const; // the first hand out and down
const REACH_L = [0.8, 1.15] as const; // and the second
const SQUEEZE_AT = 1.0; // the body pushing into the arch
const OUT_AT = 1.6; // bursting out
const LAND_AT = 2.05; // landing at full size
const ROAR_AT = 2.35;
const SUN_AT = 3.2; // the daylight strikes
const SHED_AT = [4.7, 6.1, 7.5] as const; // the three lurches it sheds itself down in
const SHED_TIME = 0.4;
const SHRUNK_AT = SHED_AT[2] + SHED_TIME;
const GROWL_AT = 8.15;

/**
 * The health its boss bar shows through the burn: it lands with
 * `SEWER_BURST_HP_MULT` × its real health, and the sun burns that away (a
 * steady sizzle, and a big bite at each lurch) down to its real health by the
 * time it has shrunk. Cosmetic: its real health is untouched (it can't be hit
 * until it is out), so the bar hands over to it seamlessly.
 */
export const SEWER_BURST_HP_MULT = 10;
/** Seconds between the sun's damage numbers popping off it. */
export const SEWER_BURST_TICK = 0.3;
/** When the burn starts and ends (for its damage ticks). */
export const SEWER_BURST_BURN = [SUN_AT, SHRUNK_AT] as const;

/** How sun-scorched it stays once it walks (`drawSludgeFatherBoss`'s `scorch`). */
export const SLUDGE_FATHER_SCORCH = 0.45;

/** The entrance's look at one moment (see `sewerBurstPose`). */
export interface SewerBurstPose {
  /** Px down its lane from the start where its feet are. */
  fwd: number;
  /** Px it is lifted off the ground (the lunge out of the tunnel). */
  lift: number;
  /** × its walking size (0 = not out yet). */
  scale: number;
  /** 1 while it is still squeezing through the arch (clipped to the opening). */
  inMouth: number;
  /** 0..1 the tunnel's darkness still on it. */
  dark: number;
  /** 0..1 how far each reaching arm is out (left / right on screen). */
  reachL: number;
  reachR: number;
  /** 0..1 the reaching arms' opacity (they melt into the body once it is out). */
  arms: number;
  /** 0..1 its rear-up: arms flung up, jaws gaping. */
  rear: number;
  /** 0..1 how sun-crusted its hide is. */
  scorch: number;
  /** 0..1 how hard it shudders in the light. */
  writhe: number;
  /** 0..1 how thickly it steams. */
  steam: number;
  /** 0..1 the daylight glaring on it, and the white flash as it first strikes. */
  glare: number;
  flash: number;
  /** 0..1 sludge spewing out of the mouth. */
  gush: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/** The entrance's pose `t` seconds after the spawn. */
export function sewerBurstPose(t: number): SewerBurstPose {
  const G = SEWER_BURST_GIANT;
  // In the arch, then out in a lunge that overshoots and settles.
  const squeeze = span(t, SQUEEZE_AT, OUT_AT);
  const out = span(t, OUT_AT, LAND_AT);
  let scale = 0;
  let fwd = 0;
  let lift = 0;
  if (t >= SQUEEZE_AT && t < OUT_AT) {
    scale = 0.55 + 0.4 * ease.outCubic(squeeze);
    fwd = -4 + 8 * squeeze;
  } else if (t >= OUT_AT) {
    scale = 0.95 + (G - 0.95) * ease.outBack(out);
    fwd = 4 + (SEWER_BURST_FORWARD - 4) * ease.outCubic(out);
    lift = Math.sin(Math.PI * out) * 20;
  }
  // The sun sheds it down in three lurches.
  for (const at of SHED_AT) {
    scale -= ((G - 1) / SHED_AT.length) * ease.inOutSine(span(t, at - SHED_TIME * 0.4, at + SHED_TIME * 0.6));
  }
  // Rearing to roar, then thrashing in the light, then down on its hands.
  const roar = ease.outCubic(span(t, ROAR_AT, ROAR_AT + 0.25));
  const thrash = 0.4 + 0.3 * Math.sin((t - SUN_AT) * 8.5);
  const toThrash = span(t, SUN_AT - 0.05, SUN_AT + 0.3);
  const down = ease.inOutSine(span(t, SHRUNK_AT, SHRUNK_AT + 0.35));
  const rear = (roar * (1 - toThrash) + thrash * toThrash) * (1 - down);
  const sun = t >= SUN_AT;
  return {
    fwd,
    lift,
    scale: Math.max(0, scale),
    inMouth: t < OUT_AT ? 1 : 0,
    dark: t < OUT_AT ? 0.75 - 0.3 * squeeze : 0,
    reachL: span(t, REACH_L[0], REACH_L[1]),
    reachR: span(t, REACH_R[0], REACH_R[1]),
    arms: 1 - span(t, OUT_AT, OUT_AT + 0.25),
    rear,
    scorch: ease.outCubic(span(t, SUN_AT, SUN_AT + 0.7)) * (1 - (1 - SLUDGE_FATHER_SCORCH) * span(t, SHED_AT[1], SHRUNK_AT + 0.3)),
    writhe: sun ? 1 - span(t, SHRUNK_AT - 0.1, SHRUNK_AT + 0.4) : 0,
    steam: sun ? 1 - 0.75 * span(t, SHRUNK_AT, SEWER_BURST_TIME) : 0,
    // The light flaring and easing as it burns.
    glare: sun ? (1 - 0.55 * span(t, SUN_AT, SUN_AT + 0.6)) * (0.85 + 0.15 * Math.sin((t - SUN_AT) * 5)) * (1 - span(t, SHRUNK_AT, SEWER_BURST_TIME)) : 0,
    flash: sun ? 1 - span(t, SUN_AT, SUN_AT + 0.35) : 0,
    gush: span(t, 0, 0.4) * (1 - 0.7 * span(t, LAND_AT, LAND_AT + 1)),
  };
}

/**
 * The health its boss bar shows `t` seconds in, for a real max health of
 * `maxHp` (see `SEWER_BURST_HP_MULT`); null before it has landed (no bar yet).
 */
export function sewerBurstHp(t: number, maxHp: number): number | null {
  if (t < LAND_AT) return null;
  // A steady sizzle with a waver in it (small enough that it never heals).
  const s = span(t, SUN_AT, SHRUNK_AT);
  const sizzle = s + 0.03 * Math.sin(t * 17.3) * s * (1 - s);
  let lurches = 0;
  for (const at of SHED_AT) lurches += ease.inOutSine(span(t, at - 0.1, at + 0.3)) / SHED_AT.length;
  const burned = 0.6 * sizzle + 0.4 * lurches;
  return maxHp * (SEWER_BURST_HP_MULT - (SEWER_BURST_HP_MULT - 1) * burned);
}

/** A beat the engine voices (sound + fx) as the entrance passes it. */
export type SewerBurstCue =
  | { at: number; kind: 'slam'; side: -1 | 1 }
  | { at: number; kind: 'out' | 'land' | 'roar' | 'sun' | 'growl' }
  | { at: number; kind: 'shed'; dx: number; dy: number };

export const SEWER_BURST_CUES: readonly SewerBurstCue[] = [
  { at: REACH_R[1], kind: 'slam', side: 1 },
  { at: REACH_L[1], kind: 'slam', side: -1 },
  { at: OUT_AT, kind: 'out' },
  { at: LAND_AT, kind: 'land' },
  { at: ROAR_AT, kind: 'roar' },
  { at: SUN_AT, kind: 'sun' },
  { at: SHED_AT[0] + SHED_TIME * 0.3, kind: 'shed', dx: -30, dy: 2 },
  { at: SHED_AT[1] + SHED_TIME * 0.3, kind: 'shed', dx: 32, dy: 6 },
  { at: SHED_AT[2] + SHED_TIME * 0.3, kind: 'shed', dx: -12, dy: 12 },
  { at: GROWL_AT, kind: 'growl' },
];

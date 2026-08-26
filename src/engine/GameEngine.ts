/**
 * The tower-defense simulation.
 *
 * Pure TypeScript, no framework dependency. The engine is fed a level and an
 * initial currency balance, then advanced with `update(dt)`. UI reads its
 * public fields to render and calls intent methods (placeUnit, sellUnit,
 * startWave). It never imports React.
 *
 * Combat model: attacks are hit-scan (damage applied instantly) with a purely
 * cosmetic `Shot` visual — this keeps damage reliable and easy to reason about
 * for an MVP while still giving attack feedback.
 */

import { getEnemy, resistMultiplier } from '../domain/enemies';
import { CASTLE_DECOR_CELLS, decorCellKeys } from '../domain/decor';
import {
  cellCenter,
  cellKey,
  pointToCell,
  type Vec2,
  COLS,
  ROWS,
} from '../domain/grid';
import {
  groupSpacing,
  laneWaypoints,
  lanePathCells,
  levelTotalWaves,
  type LevelDef,
} from '../domain/levels';
import { selectTarget, type TargetingType } from '../domain/targeting';
import {
  coneAngleDeg,
  effectiveAoe,
  effectiveBounces,
  effectiveGenerate,
  getUnit,
  nextUpgrade,
  type UnitDef,
} from '../domain/units';
import {
  expForKill,
  GOLD_PER_EXP,
  masteryAdjacentDamageMult,
  masteryBounceDamageMult,
  masteryFinalBounceDamageMult,
  masteryHarvest,
  masteryKnockback,
  masteryPreload,
  masteryRangeAura,
  masteryUpgradeCost,
  masteryStats,
  masteryThrow,
  type MasteryStats,
} from '../domain/mastery';
import { critChanceFor, critMultiplierFor } from '../domain/combat';
import { isSpeaking } from './types';
import type {
  Burst,
  Enemy,
  FloatingText,
  Outcome,
  Phase,
  Projectile,
  Puff,
  Shot,
  Slice,
  Tower,
} from './types';

interface Segment {
  start: Vec2;
  dir: Vec2; // unit vector
  length: number;
  startDist: number;
}

/** Precomputed geometry for one enemy lane. */
export interface Lane {
  /** Turn points in pixel space (spawn → base). */
  waypoints: Vec2[];
  /** Straight segments with cumulative distances, for position lookup. */
  segments: Segment[];
  /** Total path length in pixels (distance at which an enemy reaches the base). */
  totalPathLength: number;
}

interface ScheduledSpawn {
  enemyId: string;
  time: number;
  laneIndex: number;
}

const SELL_REFUND = 0.7;

// ─── TUNING: End-of-wave cash reward ─────────────────────────────────────────
// Gold banked each time a wave is fully cleared, listed per wave. The first
// entry is wave 1's reward, the second is wave 2's, and so on — just edit,
// add, or remove numbers to retune each wave individually.
// Any wave beyond the end of this list pays WAVE_CLEAR_GOLD_DEFAULT.
export const WAVE_CLEAR_GOLD = [10, 10, 15, 20, 20, 20, 20, 20];
export const WAVE_CLEAR_GOLD_DEFAULT = 30;
// ─────────────────────────────────────────────────────────────────────────────
// Generator (farmer) harvest pacing: first harvest after a short delay, then
// spaced out so the `timesPerWave` harvests land across a typical wave.
const GEN_INITIAL_DELAY = 1.5;
const GEN_INTERVAL = 3;
// Gap before a preloaded spare shot looses after the ready shot — long enough to
// read as a distinct second shot (the bolt streak itself lasts ~0.13s), but
// still a quick double-tap, independent of the tower's normal reload.
const PRELOAD_SHOT_DELAY = 0.28;
// Gap between the arrows of a burst-fire volley (the Bow adventurer's shortbow,
// `UnitDef.burst`). Short enough to read as a quick 3-arrow burst, then a full
// reload follows the last arrow — so the burst repeats at the unit's attack rate.
const BURST_SHOT_DELAY = 0.09;
// How long a thrown-javelin (Spearman's Javelin Toss) animation plays — long
// enough for the spear to fly across the board and linger. Shared with the
// renderer so the sprite's flight is timed to this exact window.
export const THROW_ANIM_TIME = 1.0;
// Wind Slice sweep: how long the crescent takes to travel from the caster to the
// end of range (its "projectile" speed — longer is slower), and the fraction of
// range its leading edge starts at. The engine and renderer share both so the
// on-hit damage lands exactly as the drawn edge passes each enemy.
export const SLICE_SWEEP_TIME = 1.15;
export const SLICE_START_FRAC = 0.12;
// Wind-up before a cone attack (the Wizard's Wind Slice) releases — a short
// telegraph while the caster gathers wind. It is folded into the attack cadence
// (it eats the tail of the reload) so it doesn't slow the tower's overall rate.
export const CONE_CHARGE_TIME = 0.45;
// Knockback (the Wizard's Gale Force). A single cooldown lives on the *enemy*
// (not per Wizard), so its shove rate is capped however many Wizards hit it —
// it can be slowed but never permanently stalled. At 14px per 0.65s (~21.5px/s)
// even the slowest brute (~27px/s) keeps creeping forward. The shove is a smooth
// slide-back (px/second) rather than a teleport, and spits wind-puff particles.
export const KNOCKBACK_COOLDOWN = 0.65;
export const KNOCKBACK_SLIDE_SPEED = 130;
const KNOCKBACK_PUFFS = 6;
// How long a hidden lane's path takes to "roll out" (like a carpet) once its
// reveal wave begins — a touch under the boss's spawn delay so the path is laid
// before the boss steps onto it.
export const LANE_REVEAL_TIME = 1.3;
// A boss spawning on a revealed lane (the Throne Room king) rises off its throne
// before it starts walking: over RISE_TIME it stays put while its sprite eases
// from seated to walking and lowers RISE_LIFT pixels onto the path. RISE_LIFT
// matches the throne seat's height above the lane's spawn cell so the seated
// figure and the risen boss occupy the same spot with no jump.
export const RISE_TIME = 0.9;
export const RISE_LIFT = 40;

/**
 * Semantic sound-cue names the engine emits into `GameEngine.sfx` for the UI to
 * play. The engine stays audio-agnostic — these are just labels, mapped to
 * actual synthesized sounds in `ui/combatAudio.ts`.
 */
export type SfxName =
  | 'archerShot'
  | 'archerHit'
  | 'swordSwing'
  | 'swordHit'
  | 'spearThrust'
  | 'spearThrow'
  | 'spearHit'
  | 'crossbowShot'
  | 'crossbowHit'
  | 'windCast'
  | 'windHit'
  | 'windSlice'
  | 'windSliceHit'
  | 'elfShot'
  | 'elfHit';

// The Elf's magic arrows leap on impact: each bounce seeks the nearest living
// enemy within BOUNCE_RANGE of the impact point that the chain hasn't hit yet.
// Kept modest so a single Elf can't chain-clear a whole pack.
export const BOUNCE_RANGE = 70;
// Per-leap damage multipliers, applied to the ORIGINAL hit's damage (not
// compounding): the 1st bounce uses index 0, the 2nd index 1, and so on. A bounce
// beyond the list reuses the last entry, so tuning each leap — or adding more
// bounces with a different falloff — is just editing this array.
export const BOUNCE_DAMAGE_MULTS = [0.4, 0.4];

/**
 * Damage multiplier for the `index`-th leap of a bounce chain (1 = first bounce),
 * from `BOUNCE_DAMAGE_MULTS`. Leaps past the end of the list reuse the last entry
 * (0 if the list is empty), so any number of bounces is covered.
 */
function bounceDamageMult(index: number): number {
  if (BOUNCE_DAMAGE_MULTS.length === 0) return 0;
  return BOUNCE_DAMAGE_MULTS[Math.min(index, BOUNCE_DAMAGE_MULTS.length) - 1];
}
// How many recent positions a magic arrow (the Elf) keeps for its fading trail —
// enough to streak a long, wispy tail behind the shaft (~9.7px covered per tick).
const MAGIC_TRAIL_LENGTH = 22;

// An enemy with `spawnLines` first walks SPEECH_ENTRY_DIST px onto the board so
// it's clearly on screen, then stops and delivers its lines one at a time —
// staying put and untargetable for SPEECH_LINE_TIME seconds each — before
// resuming its march.
export const SPEECH_ENTRY_DIST = 70;
export const SPEECH_LINE_TIME = 2.5;

// An enemy with a `deathAnimation` lingers on a lethal hit while its special
// death plays out (see EnemyDef.deathAnimation): DEATH_ANIM_TIME total, split
// into the slump to the ground (DEATH_FALL_TIME), a beat lying fallen
// (DEATH_HOLD_TIME) and then being drawn down into its shadow (the remainder).
// Victory is withheld until the whole sequence finishes.
export const DEATH_FALL_TIME = 0.55;
export const DEATH_HOLD_TIME = 2.0;
export const DEATH_ANIM_TIME = 3.85; // fall + hold + ~1.3s shadow swallow
// An evasive enemy (Garrick Vane) plays a quick sidestep-and-back when it dodges
// a hit: the `dodge` timer counts down over DODGE_ANIM_TIME while the renderer
// weaves the sprite up to DODGE_DIST pixels sideways (perpendicular to travel)
// and returns it. Purely cosmetic — the dodge itself already resolved in the sim.
export const DODGE_ANIM_TIME = 0.28;
export const DODGE_DIST = 8;

export class GameEngine {
  readonly level: LevelDef;
  /** Precomputed geometry for each enemy lane (read by the renderer). */
  readonly lanes: Lane[];
  /** Unique base/exit positions (a castle sits at each; converging lanes share). */
  readonly baseExits: Vec2[];
  /**
   * "col,row" keys of every cell a *currently-visible* lane occupies (building
   * forbidden). Grows when a hidden `revealAtWave` lane is revealed mid-battle.
   */
  pathCells: Set<string>;
  /** "col,row" keys of every cell a decorative prop covers (building forbidden). */
  readonly decorCells: Set<string>;

  // --- Battle state (public: read by renderer/HUD) ---
  currency: number;
  baseHealth: number;
  readonly maxBaseHealth: number;
  outcome: Outcome = 'playing';
  phase: Phase = 'prep';
  waveIndex = 0; // 0-based index of current/next wave
  enemies: Enemy[] = [];
  towers: Tower[] = [];
  shots: Shot[] = [];
  projectiles: Projectile[] = [];
  floaters: FloatingText[] = [];
  bursts: Burst[] = [];
  puffs: Puff[] = [];
  slices: Slice[] = [];
  /** Net currency earned/spent during this battle (for end-screen summary). */
  currencyEarned = 0;
  /**
   * Mastery EXP earned this stage per unit id (a unit is credited for every
   * enemy its attacks kill). Banked to the collection when the stage settles.
   */
  readonly masteryEarned: Record<string, number> = {};
  /**
   * Enemies killed this stage, per enemy-def id (bosses included). Banked to the
   * player's persistent kill tallies at settle time to unlock Enemy Index entries.
   */
  readonly enemyKills: Record<string, number> = {};
  /**
   * Leftover generated gold (< GOLD_PER_EXP) per unit id, carried between
   * harvests so a Farmer earns exactly 1 EXP per GOLD_PER_EXP gold produced.
   */
  private readonly masteryGoldBuffer: Record<string, number> = {};
  /** Set true for one frame when the boss appears, for a UI banner. */
  bossJustAppeared = false;
  /** Latched true when a wave containing the boss begins, so the UI can raise
   * the "boss approaches" banner the moment the wave starts even if the boss's
   * own spawn is delayed. The UI clears it once consumed. */
  bossWaveStarted = false;
  /** Latches true once this stage's boss has spawned (e.g. the king rising off
   * his throne on the Throne Room's final wave). */
  bossHasSpawned = false;
  /**
   * Cosmetic sound cues emitted this frame (semantic names only — the engine
   * knows nothing about audio, like `Shot`/`Burst` markers). The UI bridge
   * drains and plays them each frame, then clears the queue. Throttling/mixing
   * is the audio layer's job, so this can safely fill up on busy frames.
   */
  readonly sfx: SfxName[] = [];

  private uidCounter = 1;
  private spawnQueue: ScheduledSpawn[] = [];
  private spawnCursor = 0;
  private waveClock = 0;

  /** Purchased permanent skill-tree upgrades, unit id → learned upgrade ids. */
  private readonly masteryUpgrades: Record<string, string[]>;
  /** Random source for combat rolls (crits); injectable for deterministic tests. */
  private readonly rng: () => number;

  /** Per-lane reveal wave (undefined = visible from the start). */
  private readonly laneRevealAt: (number | undefined)[];
  /** Whether each lane is currently revealed (drawn, pathed, spawning). */
  private readonly laneRevealed: boolean[];
  /**
   * Per-lane reveal animation, 0→1: 1 for lanes present from the start, and for
   * a `revealAtWave` lane it eases from 0 to 1 over `LANE_REVEAL_TIME` once its
   * wave begins, so the path "rolls out" like a carpet. The renderer strokes
   * only this fraction of the lane's length.
   */
  private readonly laneRevealAnim: number[];
  /** Cell-key set for each lane, merged into `pathCells` when it's revealed. */
  private readonly laneCells: Set<string>[];

  constructor(
    level: LevelDef,
    startingCurrency: number,
    masteryUpgrades: Record<string, string[]> = {},
    rng: () => number = Math.random,
  ) {
    this.level = level;
    // Building is forbidden on any *visible* lane's cells. Hidden `revealAtWave`
    // lanes contribute their cells only once revealed (see `revealDueLanes`).
    this.laneRevealAt = level.lanes.map((l) => l.revealAtWave);
    this.laneRevealed = level.lanes.map((l) => l.revealAtWave === undefined);
    this.laneRevealAnim = this.laneRevealed.map((v) => (v ? 1 : 0));
    this.laneCells = level.lanes.map((l) => lanePathCells(l));
    this.pathCells = new Set();
    this.laneCells.forEach((cells, i) => {
      if (this.laneRevealed[i]) for (const key of cells) this.pathCells.add(key);
    });
    // Champions can't stand on decorations. A stage with `decor` data blocks the
    // cells those props cover; the hand-authored castle stages (no data) fall
    // back to the mirror table keyed by level id.
    this.decorCells = decorCellKeys(level.decor);
    if (!level.decor || level.decor.length === 0) {
      for (const [c, r] of CASTLE_DECOR_CELLS[level.id] ?? []) {
        this.decorCells.add(cellKey(c, r));
      }
    }
    this.currency = startingCurrency;
    this.baseHealth = level.baseHealth;
    this.maxBaseHealth = level.baseHealth;
    this.masteryUpgrades = masteryUpgrades;
    this.rng = rng;

    // Precompute geometry for each lane.
    this.lanes = level.lanes.map((lane) => this.buildLane(laneWaypoints(lane)));

    // The exit (last waypoint) of each lane is a base; dedupe so converging
    // lanes that share an exit yield a single castle.
    this.baseExits = [];
    for (const lane of this.lanes) {
      const end = lane.waypoints[lane.waypoints.length - 1];
      if (!this.baseExits.some((e) => Math.round(e.x) === Math.round(end.x) && Math.round(e.y) === Math.round(end.y))) {
        this.baseExits.push({ ...end });
      }
    }
  }

  /** Build straight segments + cumulative distances for a lane's waypoints. */
  private buildLane(waypoints: Vec2[]): Lane {
    const segments: Segment[] = [];
    let acc = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i];
      const b = waypoints[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      segments.push({ start: a, dir: { x: dx / len, y: dy / len }, length: len, startDist: acc });
      acc += len;
    }
    return { waypoints, segments, totalPathLength: acc };
  }

  get totalWaves(): number {
    return levelTotalWaves(this.level);
  }

  /** Enemies still to spawn or alive in the current wave. */
  get enemiesRemaining(): number {
    const unspawned = this.spawnQueue.length - this.spawnCursor;
    const alive = this.enemies.filter((e) => !e.dead).length;
    return unspawned + alive;
  }

  // ---------------------------------------------------------------- geometry
  private positionAtDistance(lane: Lane, dist: number): Vec2 {
    if (lane.segments.length === 0) return { ...lane.waypoints[0] };
    if (dist <= 0) return { ...lane.segments[0].start };
    for (const seg of lane.segments) {
      if (dist <= seg.startDist + seg.length) {
        const d = dist - seg.startDist;
        return {
          x: seg.start.x + seg.dir.x * d,
          y: seg.start.y + seg.dir.y * d,
        };
      }
    }
    const last = lane.segments[lane.segments.length - 1];
    return { x: last.start.x + last.dir.x * last.length, y: last.start.y + last.dir.y * last.length };
  }

  /** Unit travel direction on the lane at a given distance (for walk sprites). */
  private headingAtDistance(lane: Lane, dist: number): Vec2 {
    if (lane.segments.length === 0) return { x: 1, y: 0 };
    for (const seg of lane.segments) {
      if (dist <= seg.startDist + seg.length) return { ...seg.dir };
    }
    return { ...lane.segments[lane.segments.length - 1].dir };
  }

  // ------------------------------------------------------------- placement API
  /** Whether the given cell can host a tower right now. */
  canPlaceAt(col: number, row: number): boolean {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
    if (this.pathCells.has(cellKey(col, row))) return false;
    if (this.decorCells.has(cellKey(col, row))) return false;
    return !this.towers.some((t) => t.col === col && t.row === row);
  }

  /** Whether lane `index` is currently revealed (drawn + active). */
  laneVisible(index: number): boolean {
    return this.laneRevealed[index] ?? true;
  }

  /** How much of lane `index`'s path is currently drawn, 0→1 (see `laneRevealAnim`). */
  laneRevealFraction(index: number): number {
    return this.laneRevealAnim[index] ?? 1;
  }

  towerAt(col: number, row: number): Tower | undefined {
    return this.towers.find((t) => t.col === col && t.row === row);
  }

  /** How many of a given unit type are currently deployed this stage. */
  deployedCount(unitId: string): number {
    let n = 0;
    for (const t of this.towers) if (t.def.id === unitId) n++;
    return n;
  }

  /** Whether another of this unit type may still be deployed (limit check). */
  canDeployMore(unitId: string): boolean {
    const def = getUnit(unitId);
    if (!def) return false;
    return this.deployedCount(unitId) < def.deployLimit;
  }

  /** Attempt to deploy a unit. Returns true on success. */
  placeUnit(unitId: string, col: number, row: number): boolean {
    if (this.outcome !== 'playing') return false;
    const def = getUnit(unitId);
    if (!def) return false;
    if (!this.canPlaceAt(col, row)) return false;
    if (this.currency < def.cost) return false;
    if (this.deployedCount(unitId) >= def.deployLimit) return false;

    this.currency -= def.cost;
    this.currencyEarned -= def.cost;
    const purchased = this.masteryUpgrades[def.id] ?? [];
    const stats = this.towerStats(def, 0);
    const thrown = masteryThrow(def.id, purchased);
    const preloadMax = masteryPreload(def.id, purchased);
    this.towers.push({
      uid: this.uidCounter++,
      def,
      col,
      row,
      pos: cellCenter(col, row),
      upgradeTier: 0,
      aoe: effectiveAoe(def, 0),
      damage: stats.damage,
      attackSpeed: stats.attackSpeed,
      range: stats.range,
      critChance: critChanceFor(def, purchased),
      critMultiplier: critMultiplierFor(def, purchased),
      attackCount: 0,
      throwEvery: thrown?.every ?? 0,
      throwRangeMult: thrown?.rangeMult ?? 1,
      adjacentDamageMult: masteryAdjacentDamageMult(def.id, purchased),
      adjacentAllies: 0,
      rangeAuraMult: masteryRangeAura(def.id, purchased),
      rangeBuffed: false,
      knockback: masteryKnockback(def.id, purchased),
      bounces: effectiveBounces(def, 0),
      bounceDamageMult: masteryBounceDamageMult(def.id, purchased),
      finalBounceMult: masteryFinalBounceDamageMult(def.id, purchased),
      preloadMax,
      preloaded: 0,
      preloadTimer: stats.attackSpeed > 0 ? 1 / stats.attackSpeed : 0,
      burstCount: Math.max(1, def.burst ?? 1),
      burstLeft: 0,
      invested: def.cost,
      genAmount: this.genAmountFor(def, 0),
      // If deployed mid-wave, let it harvest during the rest of this wave.
      genLeft: def.generator && this.phase === 'wave' ? def.generator.timesPerWave : 0,
      genTimer: GEN_INITIAL_DELAY,
      targeting: def.targeting,
      cooldown: 0,
      targetUid: null,
      aimTarget: null,
      attackAnim: 0,
      throwAnim: 0,
      charge: 0,
      chargeMax: 0,
    });
    // A new tower can grant/receive adjacency bonuses (Better Morale).
    this.recomputeAdjacency();
    return true;
  }

  /**
   * Number of allied towers of the same type sitting in one of the 8 tiles
   * surrounding a tower (Chebyshev distance 1), excluding itself.
   */
  private countAdjacentAllies(t: Tower): number {
    let n = 0;
    for (const o of this.towers) {
      if (o === t || o.def.id !== t.def.id) continue;
      if (Math.abs(o.col - t.col) <= 1 && Math.abs(o.row - t.row) <= 1) n++;
    }
    return n;
  }

  /**
   * Refold every board-position aura into tower stats. Both auras read the
   * mastery-adjusted base for a tower's current upgrade tier, so they are
   * recomputed together whenever the board changes (place/sell/upgrade); towers
   * never move, so nothing else can shift them.
   *  - Better Morale (Swordsman): each same-type neighbour adds a flat
   *    `adjacentDamageMult` share to `damage`.
   *  - Guiding Gale (Wizard): a ranged ally within an emitter's range has
   *    its `range` multiplied by the aura (non-stacking; the emitter never
   *    buffs itself).
   */
  private recomputeAdjacency(): void {
    for (const t of this.towers) {
      if (t.adjacentDamageMult <= 0) continue;
      const base = this.towerStats(t.def, t.upgradeTier).damage;
      const allies = this.countAdjacentAllies(t);
      t.adjacentAllies = allies;
      // Additive stacking: each neighbour adds a flat share, so 4 allies give
      // 1 + 0.15×4 = 1.6× rather than compounding.
      t.damage = Math.round(base * (1 + t.adjacentDamageMult * allies));
    }
    this.recomputeRangeAuras();
  }

  /**
   * Reset every ranged tower's range to its mastery-adjusted base, then buff any
   * standing within an allied emitter's range (see the Wizard's Arcane
   * Resonance). An emitter never boosts itself, and the aura does not stack — the
   * first covering emitter wins, so overlapping fields grant the same flat bonus
   * rather than compounding.
   *
   * The aura reaches as far as the emitter's *effective* range, so a Wizard who
   * is himself buffed by another Wizard projects a correspondingly wider field.
   * That makes the emitters mutually dependent, so we resolve to a fixed point:
   * buffs only ever turn on (a wider reach can only cover more allies, never
   * fewer), so re-sweeping until nothing changes converges monotonically in at
   * most one pass per ranged tower.
   */
  private recomputeRangeAuras(): void {
    const emitters = this.towers.filter((t) => t.rangeAuraMult > 1);
    // Start everyone at their unbuffed base; `range` doubles as each emitter's
    // current effective reach as the sweep grows it.
    const baseRange = new Map<number, number>();
    for (const t of this.towers) {
      const base = this.towerStats(t.def, t.upgradeTier).range;
      baseRange.set(t.uid, base);
      t.rangeBuffed = false;
      t.range = base;
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of this.towers) {
        if (t.rangeBuffed || t.def.attackType !== 'ranged') continue;
        let mult = 1;
        for (const w of emitters) {
          if (w === t) continue; // a Wizard never buffs his own range
          const reach = w.range; // effective reach — grows once w is itself buffed
          const dx = w.pos.x - t.pos.x;
          const dy = w.pos.y - t.pos.y;
          if (dx * dx + dy * dy <= reach * reach) {
            mult = w.rangeAuraMult; // non-stacking: take one emitter's bonus
            break;
          }
        }
        if (mult > 1) {
          t.rangeBuffed = true;
          t.range = Math.round(baseRange.get(t.uid)! * mult);
          changed = true; // a newly-buffed emitter may now reach further
        }
      }
    }
  }

  /**
   * Effective combat stats for a tower at a given in-stage upgrade tier,
   * including permanent mastery multipliers. Delegates to the shared
   * `masteryStats` so the engine and every display agree.
   */
  private towerStats(def: UnitDef, tier: number): MasteryStats {
    return masteryStats(def, tier, this.masteryUpgrades[def.id] ?? []);
  }

  /**
   * Mastery-adjusted stats a unit would deploy with (tier 0) — used by the
   * placement preview so the shown reach matches what actually gets built.
   */
  deployStats(unitId: string): MasteryStats | null {
    const def = getUnit(unitId);
    return def ? this.towerStats(def, 0) : null;
  }

  /** Change a deployed tower's targeting mode. */
  setTowerTargeting(uid: number, targeting: TargetingType): void {
    const tower = this.towers.find((t) => t.uid === uid);
    if (tower) tower.targeting = targeting;
  }

  /**
   * Buy the next upgrade tier for a deployed tower. Upgrades are per-stage and
   * paid in gold. Returns true on success.
   */
  upgradeTower(uid: number): boolean {
    if (this.outcome !== 'playing') return false;
    const tower = this.towers.find((t) => t.uid === uid);
    if (!tower) return false;
    const up = nextUpgrade(tower.def, tower.upgradeTier);
    if (!up) return false; // already maxed
    // Cost after any permanent mastery discount (e.g. Magical Bargaining). The
    // next upgrade's 1-based tier is the current tier + 1.
    const cost = masteryUpgradeCost(
      tower.def,
      tower.upgradeTier + 1,
      this.masteryUpgrades[tower.def.id] ?? [],
    );
    if (this.currency < cost) return false;

    this.currency -= cost;
    this.currencyEarned -= cost;
    tower.invested += cost;
    tower.upgradeTier += 1;
    const s = this.towerStats(tower.def, tower.upgradeTier);
    tower.damage = s.damage;
    tower.attackSpeed = s.attackSpeed;
    tower.range = s.range;
    tower.aoe = effectiveAoe(tower.def, tower.upgradeTier);
    tower.bounces = effectiveBounces(tower.def, tower.upgradeTier);
    tower.genAmount = this.genAmountFor(tower.def, tower.upgradeTier);
    // A higher base damage rescales this tower's adjacency aura.
    this.recomputeAdjacency();
    return true;
  }

  /**
   * Gold produced per harvest for a generator champion at a given in-stage
   * upgrade tier, including permanent mastery skill-tree bonuses. Returns 0 for
   * non-generators.
   */
  private genAmountFor(def: UnitDef, tier: number): number {
    return masteryHarvest(
      effectiveGenerate(def, tier),
      def.id,
      this.masteryUpgrades[def.id] ?? [],
    );
  }

  /** Sell a tower, refunding a fraction of its total invested gold. */
  sellUnit(col: number, row: number): boolean {
    const idx = this.towers.findIndex((t) => t.col === col && t.row === row);
    if (idx < 0) return false;
    const refund = Math.round(this.towers[idx].invested * SELL_REFUND);
    this.currency += refund;
    this.currencyEarned += refund;
    this.towers.splice(idx, 1);
    // Removing a tower drops the adjacency bonus it granted to its neighbours.
    this.recomputeAdjacency();
    return true;
  }

  /** Sell refund a tower would give right now (for UI display). */
  sellValue(uid: number): number {
    const t = this.towers.find((x) => x.uid === uid);
    return t ? Math.round(t.invested * SELL_REFUND) : 0;
  }

  cellFromPoint(x: number, y: number) {
    return pointToCell(x, y);
  }

  /** Living enemy under a board point (nearest within its radius), if any. */
  enemyAt(x: number, y: number): Enemy | undefined {
    let best: Enemy | undefined;
    let bestDist = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.y - y);
      if (d <= e.def.radius + 5 && d < bestDist) {
        best = e;
        bestDist = d;
      }
    }
    return best;
  }

  // -------------------------------------------------------------- wave control
  /** Begin the next wave (only valid during the prep phase). */
  startWave(): boolean {
    if (this.phase !== 'prep' || this.outcome !== 'playing') return false;
    if (this.waveIndex >= this.totalWaves) return false;

    // Reveal any hidden lane whose wave has now come (e.g. the Throne Room's
    // throne lane opening on the final wave) before its enemies are queued.
    this.revealDueLanes();
    this.spawnQueue = this.buildSpawnQueue(this.waveIndex);
    this.spawnCursor = 0;
    this.waveClock = 0;
    this.phase = 'wave';

    // Raise the boss banner the instant a boss-bearing wave begins (its own
    // spawn may be delayed within the wave); the UI clears the flag once shown.
    if (this.spawnQueue.some((s) => getEnemy(s.enemyId).boss)) {
      this.bossWaveStarted = true;
    }

    // Refill generator (farmer) harvests for the new wave.
    for (const t of this.towers) {
      if (t.def.generator) {
        t.genLeft = t.def.generator.timesPerWave;
        t.genTimer = GEN_INITIAL_DELAY;
      }
    }
    return true;
  }

  /** Ease every revealed lane's roll-out animation toward fully drawn. */
  private advanceLaneReveals(dt: number): void {
    for (let i = 0; i < this.laneRevealAnim.length; i++) {
      if (this.laneRevealed[i] && this.laneRevealAnim[i] < 1) {
        this.laneRevealAnim[i] = Math.min(1, this.laneRevealAnim[i] + dt / LANE_REVEAL_TIME);
      }
    }
  }

  /** Reveal hidden lanes whose `revealAtWave` has been reached; block their cells. */
  private revealDueLanes(): void {
    this.laneRevealAt.forEach((revealAt, i) => {
      if (revealAt !== undefined && !this.laneRevealed[i] && this.waveIndex >= revealAt) {
        this.laneRevealed[i] = true;
        for (const key of this.laneCells[i]) this.pathCells.add(key);
      }
    });
  }

  private buildSpawnQueue(waveIdx: number): ScheduledSpawn[] {
    const queue: ScheduledSpawn[] = [];
    // Every lane spawns its own wave `waveIdx` (if it has one) at the same
    // moment the wave starts, so lanes run in parallel with independent enemies.
    this.level.lanes.forEach((lane, laneIndex) => {
      if (!this.laneRevealed[laneIndex]) return; // hidden lanes don't spawn yet
      const wave = lane.waves[waveIdx];
      if (!wave) return;
      let groupStart = 0;
      for (const group of wave.groups) {
        const spacing = groupSpacing(group);
        const start = groupStart + (group.delay ?? 0);
        for (let i = 0; i < group.count; i++) {
          queue.push({ enemyId: group.enemyId, time: start + i * spacing, laneIndex });
        }
        // Next group begins relative to when this one started (groups overlap
        // by their delay offsets, matching the data intent).
        groupStart = start;
      }
    });
    queue.sort((a, b) => a.time - b.time);
    return queue;
  }

  // -------------------------------------------------------------------- update
  update(dt: number): void {
    this.bossJustAppeared = false;
    if (this.outcome !== 'playing') {
      this.decayVisuals(dt);
      this.projectiles = []; // drop any in-flight arrows once the battle ends
      return;
    }

    if (this.phase === 'wave') {
      this.waveClock += dt;
      this.spawnDueEnemies();
    }

    this.advanceLaneReveals(dt);

    this.updateEnemies(dt);
    this.recomputeWards();
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateSlices();
    this.decayVisuals(dt);
    this.checkWaveEnd();
  }

  private spawnDueEnemies(): void {
    while (
      this.spawnCursor < this.spawnQueue.length &&
      this.spawnQueue[this.spawnCursor].time <= this.waveClock
    ) {
      const { enemyId, laneIndex } = this.spawnQueue[this.spawnCursor++];
      const def = getEnemy(enemyId);
      this.enemies.push({
        uid: this.uidCounter++,
        def,
        health: def.health,
        laneIndex,
        dist: 0,
        pos: this.positionAtDistance(this.lanes[laneIndex], 0),
        heading: this.headingAtDistance(this.lanes[laneIndex], 0),
        slowFactor: 1,
        slowTimer: 0,
        dead: false,
        hitFlash: 0,
        knockbackRemaining: 0,
        knockbackCooldown: 0,
        // A boss on a reveal lane rises off its throne before walking.
        rise: def.boss && this.laneRevealAt[laneIndex] !== undefined ? 1 : 0,
        // An enemy with intro lines walks in a short way (-1) before speaking.
        speechIndex: def.spawnLines ? -1 : 0,
        speechTimer: def.spawnLines ? SPEECH_LINE_TIME : 0,
        dodge: 0,
        wardReduction: 0,
        dying: false,
        deathT: 0,
      });
      if (def.boss) {
        this.bossJustAppeared = true;
        this.bossHasSpawned = true;
      }
    }
  }

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (e.dead) continue;
      // Playing out a special death (Gowzer): frozen in place while the animation
      // runs, then truly removed. Kept in the list until then so victory waits.
      if (e.dying) {
        e.deathT += dt;
        if (e.deathT >= DEATH_ANIM_TIME) e.dead = true;
        continue;
      }
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.dodge > 0) e.dodge = Math.max(0, e.dodge - dt);
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) e.slowFactor = 1;
      }
      // Tick down this enemy's shared knockback cooldown.
      if (e.knockbackCooldown > 0) e.knockbackCooldown -= dt;
      const lane = this.lanes[e.laneIndex];
      // A boss rising off its throne stays put (and untargetable) until fully up.
      if (e.rise > 0) {
        e.rise = Math.max(0, e.rise - dt / RISE_TIME);
        e.pos = this.positionAtDistance(lane, 0);
        e.heading = this.headingAtDistance(lane, 0);
        continue;
      }
      // An enemy with intro lines walks in until it's on screen, then stops to
      // speak (flip -1 → 0 so isSpeaking takes over from here).
      if (e.def.spawnLines && e.speechIndex < 0 && e.dist >= SPEECH_ENTRY_DIST) {
        e.speechIndex = 0;
        e.speechTimer = SPEECH_LINE_TIME;
      }
      // Delivering its spawn lines: stay put (and untargetable) until every line
      // has been spoken, then start walking.
      if (isSpeaking(e)) {
        e.speechTimer -= dt;
        if (e.speechTimer <= 0) {
          e.speechIndex++;
          e.speechTimer = SPEECH_LINE_TIME;
        }
        // Hold at the spot it walked in to (not the lane start) so it doesn't
        // teleport back while speaking.
        e.pos = this.positionAtDistance(lane, e.dist);
        e.heading = this.headingAtDistance(lane, e.dist);
        continue;
      }
      e.dist += e.def.speed * e.slowFactor * dt;
      // Bleed off any pending knockback as a smooth slide back down the path,
      // capped per frame so it reads as a shove rather than a teleport. Runs
      // after forward motion so a well-timed shove can still deny a base hit.
      if (e.knockbackRemaining > 0) {
        const step = Math.min(e.knockbackRemaining, KNOCKBACK_SLIDE_SPEED * dt);
        e.dist = Math.max(0, e.dist - step);
        e.knockbackRemaining -= step;
      }
      if (e.dist >= lane.totalPathLength) {
        // Reached the base (this lane's exit).
        e.dead = true;
        const exit = lane.waypoints[lane.waypoints.length - 1];
        // A boss reaching the base is an instant defeat, regardless of how much
        // base health is left — letting the boss through is never survivable.
        if (e.def.boss) {
          this.baseHealth = 0;
          this.floaters.push({
            pos: { x: exit.x, y: exit.y },
            text: 'BOSS BREACH!',
            color: '#ff5a5a',
            ttl: 0.9,
            maxTtl: 0.9,
          });
          this.lose();
          continue;
        }
        this.baseHealth -= e.def.damageToBase;
        this.floaters.push({
          pos: { x: exit.x, y: exit.y },
          text: `-${e.def.damageToBase}`,
          color: '#ff5a5a',
          ttl: 0.9,
          maxTtl: 0.9,
        });
        if (this.baseHealth <= 0) {
          this.baseHealth = 0;
          this.lose();
        }
        continue;
      }
      e.pos = this.positionAtDistance(lane, e.dist);
      e.heading = this.headingAtDistance(lane, e.dist);
    }
    // Remove dead enemies (after towers may have referenced them this frame is
    // fine — towers re-scan each tick).
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  /**
   * Recompute each enemy's protective-aura shielding (The Iron Warden's Aegis).
   * Any enemy carrying a `damageAura` reduces incoming damage for every *other*
   * living enemy within its radius; an enemy takes the strongest aura reaching
   * it (auras don't stack). Cheap O(sources × enemies) — there is at most one
   * aura emitter per stage — and recomputed each tick as everyone moves.
   */
  private recomputeWards(): void {
    // Clear last frame's shielding first.
    for (const e of this.enemies) e.wardReduction = 0;
    const emitters = this.enemies.filter(
      (e) => !e.dead && !e.dying && e.rise <= 0 && e.def.damageAura,
    );
    if (emitters.length === 0) return;
    for (const src of emitters) {
      const aura = src.def.damageAura!;
      const r2 = aura.radius * aura.radius;
      for (const e of this.enemies) {
        if (e === src || e.dead) continue; // never shields itself
        const dx = e.pos.x - src.pos.x;
        const dy = e.pos.y - src.pos.y;
        if (dx * dx + dy * dy <= r2) {
          e.wardReduction = Math.max(e.wardReduction, aura.reduction);
        }
      }
    }
  }

  private updateTowers(dt: number): void {
    for (const t of this.towers) {
      if (t.attackAnim > 0) t.attackAnim = Math.max(0, t.attackAnim - dt);
      if (t.throwAnim > 0) t.throwAnim = Math.max(0, t.throwAnim - dt);

      // Economy units harvest gold instead of attacking.
      if (t.def.generator) {
        this.updateGenerator(t, dt);
        continue;
      }

      if (t.cooldown > 0) t.cooldown -= dt;

      // Acquire the aim target EVERY frame (not just when firing) so the
      // beam / marker tracks the enemy smoothly between shots as well.
      const inRange = [];
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.dying) continue; // playing out its death — no longer a valid target
        if (e.rise > 0) continue; // a boss still rising off its throne can't be hit
        if (isSpeaking(e)) continue; // an enemy delivering its intro can't be hit
        const distance = Math.hypot(e.pos.x - t.pos.x, e.pos.y - t.pos.y);
        if (distance <= t.range) {
          // Remaining path to the base, comparable across lanes of different
          // lengths, so "first" targets whoever is nearest the exit.
          const remainingToExit = this.lanes[e.laneIndex].totalPathLength - e.dist;
          inRange.push({ enemy: e, remainingToExit, distance, health: e.health });
        }
      }
      const chosen = inRange.length ? selectTarget(t.targeting, inRange) : undefined;

      if (chosen) {
        t.targetUid = chosen.enemy.uid;
        t.aimTarget = { ...chosen.enemy.pos }; // keep aim fresh for the visual
      } else {
        t.targetUid = null;
      }

      // Charged attack (cone) wind-up: while charging, count down and release the
      // moment it completes — aimed at whatever is in reach then. Takes priority
      // over acquiring/firing so the tower commits to its telegraphed slice.
      if (t.charge > 0) {
        t.charge = Math.max(0, t.charge - dt);
        if (t.charge > 0) continue; // still winding up
        if (chosen) {
          this.fire(t, chosen.enemy);
          // Reload for the remainder of the cadence (the wind-up ate the rest),
          // so charging doesn't slow the tower's overall attack rate.
          t.cooldown = Math.max(0, 1 / t.attackSpeed - CONE_CHARGE_TIME);
        }
        // Target gone at release: cancel the cast and re-acquire next frame.
        continue;
      }

      // Idle (no target in reach): a champion with the Quick Loader trait cranks
      // spare bolts, one per attack interval, up to its preload cap. A burst
      // shooter abandons any half-fired volley so it starts fresh on re-acquire.
      if (!chosen) {
        t.burstLeft = 0;
        if (t.preloadMax > 0 && t.preloaded < t.preloadMax && t.attackSpeed > 0) {
          t.preloadTimer -= dt;
          if (t.preloadTimer <= 0) {
            t.preloaded += 1;
            t.preloadTimer = 1 / t.attackSpeed;
          }
        }
        continue;
      }

      // Fire only when off cooldown.
      if (t.cooldown > 0) continue;

      // Cone attackers begin a wind-up instead of firing instantly; the release
      // (and reload) is handled by the charge block above once it completes.
      if (t.aoe === 'cone') {
        t.charge = CONE_CHARGE_TIME;
        t.chargeMax = CONE_CHARGE_TIME;
        continue;
      }

      this.fire(t, chosen.enemy);
      // Reload cadence:
      //  - Burst shooter (burstCount > 1): loose the volley's arrows one per short
      //    BURST_SHOT_DELAY, then a full reload after the last so the burst repeats
      //    at the unit's attack rate.
      //  - Quick Loader: a preloaded spare looses right after the ready shot.
      //  - Otherwise: reload at the normal rate.
      if (t.burstCount > 1) {
        if (t.burstLeft > 0) {
          // Fired a follow-up arrow; short gap unless that was the volley's last.
          t.burstLeft -= 1;
          t.cooldown = t.burstLeft > 0 ? BURST_SHOT_DELAY : 1 / t.attackSpeed;
        } else {
          // Fired the first arrow of a fresh volley — queue the remaining arrows.
          t.burstLeft = t.burstCount - 1;
          t.cooldown = BURST_SHOT_DELAY;
        }
      } else if (t.preloaded > 0) {
        t.preloaded -= 1;
        t.cooldown = Math.min(PRELOAD_SHOT_DELAY, 1 / t.attackSpeed);
      } else {
        t.cooldown = 1 / t.attackSpeed;
      }
      t.preloadTimer = t.attackSpeed > 0 ? 1 / t.attackSpeed : 0;
    }
  }

  /** Harvest gold for a generator (farmer) tower during an active wave. */
  private updateGenerator(t: Tower, dt: number): void {
    if (this.phase !== 'wave' || t.genLeft <= 0) return;
    t.genTimer -= dt;
    if (t.genTimer > 0) return;

    this.currency += t.genAmount;
    this.currencyEarned += t.genAmount;
    this.creditGeneration(t.def.id, t.genAmount);
    t.genLeft -= 1;
    t.genTimer = GEN_INTERVAL;
    t.attackAnim = 0.25; // little harvest pulse
    this.floaters.push({
      pos: { x: t.pos.x, y: t.pos.y - 8 },
      text: `+${t.genAmount}`,
      color: '#ffd76a',
      ttl: 0.9,
      maxTtl: 0.9,
    });
  }

  private fire(tower: Tower, target: Enemy): void {
    tower.targetUid = target.uid;
    tower.attackAnim = 0.18;
    tower.aimTarget = { ...target.pos };

    // Periodic "throw" attack (e.g. Spearman's Javelin Toss): every Nth attack
    // reaches farther. Counting only fired attacks means the cadence tracks
    // shots actually taken, not idle time.
    tower.attackCount += 1;
    const isThrow =
      tower.throwEvery > 0 && tower.attackCount % tower.throwEvery === 0;
    // Drive a longer, dedicated throw animation so the flung javelin flies well
    // across the board and lingers long after the (shorter) throw beam fades.
    if (isThrow) tower.throwAnim = THROW_ANIM_TIME;
    const attackRange = isThrow ? tower.range * tower.throwRangeMult : tower.range;

    if (tower.aoe === 'line') {
      this.fireLine(tower, target, attackRange, isThrow);
      return;
    }

    if (tower.aoe === 'cone') {
      this.fireCone(tower, target, attackRange);
      return;
    }

    // Single target: archers/crossbows loose a homing arrow, and the Wizard
    // hurls a homing wind bullet — both deal their damage on impact; swordsmen
    // strike instantly with a melee slash.
    const shape = tower.def.visual.shape;
    const crit = this.rollCrit(tower);
    const dmg = tower.damage * (crit ? tower.critMultiplier : 1);

    if (
      shape === 'archer' ||
      shape === 'crossbow' ||
      shape === 'wizard' ||
      shape === 'elf' ||
      shape === 'player-bow'
    ) {
      // The Archer/Elf/Bow adventurer loose from a bow and the Wizard from a
      // raised staff, not the chest. Mirror the renderer's muzzle (local tip ~
      // (12.5, -3.5), flipped to face the target).
      let origin = tower.pos;
      if (shape === 'archer' || shape === 'wizard' || shape === 'elf' || shape === 'player-bow') {
        const dir = target.pos.x >= tower.pos.x ? 1 : -1;
        const offY = shape === 'wizard' ? -6 : -3.5;
        origin = { x: tower.pos.x + dir * 12.5, y: tower.pos.y + offY };
      }
      // The Crossbow's bolt flies a bit faster and reads slightly heavier; the
      // Wizard's gust is a swirling bullet rather than a fletched shaft; the Elf's
      // enchanted shaft glows and leaps once to a nearby foe on impact. The Bow
      // adventurer's shortbow looses a plain (fast, light) fletched arrow.
      const crossbow = shape === 'crossbow';
      const wind = shape === 'wizard';
      const magic = shape === 'elf';
      // A soft release cue per shooter (crossbow snap, airy wizard gust, the
      // Elf's enchanted twang) — the audio layer keeps them quiet and throttled.
      // The Bow adventurer reuses the Archer's bow twang.
      if (shape === 'archer' || shape === 'player-bow') this.sfx.push('archerShot');
      else if (crossbow) this.sfx.push('crossbowShot');
      else if (wind) this.sfx.push('windCast');
      else if (magic) this.sfx.push('elfShot');
      this.projectiles.push({
        pos: { ...origin },
        targetUid: target.uid,
        last: { ...target.pos },
        speed: wind ? 860 : crossbow ? 660 : magic ? 580 : 520,
        damage: dmg,
        crit,
        color: tower.def.visual.color,
        scale: wind ? 1.1 : crossbow ? 1.2 : 1,
        style: wind ? 'wind' : magic ? 'magic' : 'arrow',
        source: tower,
        // The Elf's normal bounces, plus one extra final leap when Parting Shot
        // mastery is active (its weaker fraction is applied in spawnBounce).
        bounces: magic ? tower.bounces + (tower.finalBounceMult > 0 ? 1 : 0) : 0,
        hitUids: magic ? [target.uid] : undefined,
        baseDamage: magic ? dmg : undefined,
        bounceIndex: magic ? 0 : undefined,
        trail: magic ? [] : undefined,
      });
      return;
    }

    // Swordsman melee slash — lands instantly at the target.
    this.shots.push({
      from: { ...tower.pos },
      to: { ...target.pos },
      color: tower.def.visual.color,
      ttl: 0.16,
      maxTtl: 0.16,
      style: 'slash',
    });
    this.sfx.push('swordSwing');
    const landed = this.damageEnemy(target, dmg, tower);
    if (landed) this.sfx.push('swordHit');
    if (crit && landed) this.critFloater(target.pos);
  }

  /**
   * Advance in-flight arrows toward their targets. On impact each applies its
   * carried damage and spawns a small hit burst; an arrow whose target has died
   * flies to the last known point and is dropped without dealing damage.
   */
  private updateProjectiles(dt: number): void {
    const survivors: Projectile[] = [];
    for (const p of this.projectiles) {
      const target = this.enemies.find((e) => e.uid === p.targetUid && !e.dead);
      if (target) p.last = { ...target.pos }; // track the live target
      const dest = target ? target.pos : p.last;
      const dx = dest.x - p.pos.x;
      const dy = dest.y - p.pos.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;

      if (dist <= step) {
        // Impact: deal the carried damage (if the target still lives) and pop a
        // small hit spark either way.
        if (target) {
          const landed = this.damageEnemy(target, p.damage, p.source);
          if (p.crit && landed) this.critFloater(target.pos);
          // A soft impact cue when the shot actually connects, keyed to the
          // shooter (arrow thud, bolt thunk, airy gust, the Elf's chime tick).
          if (landed) {
            const sh = p.source.def.visual.shape;
            if (sh === 'archer' || sh === 'player-bow') this.sfx.push('archerHit');
            else if (sh === 'crossbow') this.sfx.push('crossbowHit');
            else if (sh === 'wizard') this.sfx.push('windHit');
            else if (sh === 'elf') this.sfx.push('elfHit');
          }
        }
        // A magic arrow (the Elf) leaps once to the nearest other foe on impact.
        if (p.bounces > 0) this.spawnBounce(p, dest);
        this.arrowImpact(dest, p.color);
        continue; // drop the arrow
      }

      p.pos = { x: p.pos.x + (dx / dist) * step, y: p.pos.y + (dy / dist) * step };
      // A magic arrow drops a breadcrumb of recent positions so the renderer can
      // streak a fading tail behind it (newest first, capped to a short length).
      if (p.trail) {
        p.trail.unshift({ ...p.pos });
        if (p.trail.length > MAGIC_TRAIL_LENGTH) p.trail.length = MAGIC_TRAIL_LENGTH;
      }
      survivors.push(p);
    }
    this.projectiles = survivors;
  }

  /**
   * Send an Elf's magic arrow leaping from an impact point to the nearest living
   * enemy within `BOUNCE_RANGE` that this chain hasn't hit yet — so a multi-bounce
   * arrow seeks fresh foes instead of ricocheting back. The follow-up arrow
   * carries `BOUNCE_DAMAGE_MULT` of the damage, one fewer bounce, and the extended
   * hit list. Does nothing if no unhit enemy is in reach.
   */
  private spawnBounce(p: Projectile, from: Vec2): void {
    const hit = p.hitUids ?? [p.targetUid];
    let best: Enemy | undefined;
    let bestDist = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.dying || e.rise > 0 || isSpeaking(e)) continue;
      if (hit.includes(e.uid)) continue; // skip foes this chain already struck
      const d = Math.hypot(e.pos.x - from.x, e.pos.y - from.y);
      if (d <= BOUNCE_RANGE && d < bestDist) {
        best = e;
        bestDist = d;
      }
    }
    if (!best) return;
    const base = p.baseDamage ?? p.damage;
    const nextIndex = (p.bounceIndex ?? 0) + 1;
    const newBounces = p.bounces - 1;
    // The extra Parting Shot leap is always the last one in the chain (the leap
    // after which no bounces remain) and deals its own weaker fraction. Every
    // earlier ("normal") leap uses the Resonant Enchantment override if set,
    // otherwise the engine's default per-leap fractions.
    const isFinal = newBounces === 0 && p.source.finalBounceMult > 0;
    const override = p.source.bounceDamageMult;
    const mult = isFinal
      ? p.source.finalBounceMult
      : override > 0
        ? override
        : bounceDamageMult(nextIndex);
    this.projectiles.push({
      pos: { ...from },
      targetUid: best.uid,
      last: { ...best.pos },
      speed: 580,
      damage: base * mult,
      crit: p.crit,
      color: p.color,
      scale: 0.85,
      style: 'magic',
      source: p.source,
      bounces: newBounces,
      hitUids: [...hit, best.uid],
      baseDamage: base,
      bounceIndex: nextIndex,
      trail: [],
    });
  }

  /** A small spark ring where an arrow lands. */
  private arrowImpact(pos: Vec2, color: string): void {
    this.bursts.push({
      pos: { ...pos },
      color,
      ttl: 0.2,
      maxTtl: 0.2,
      radius: 3.5,
    });
  }

  /** Roll whether this attack crits, using the tower's crit chance. */
  private rollCrit(tower: Tower): boolean {
    return this.rng() < tower.critChance;
  }

  /** Spawn a bold "CRIT!" popup plus a spark burst at a hit position. */
  private critFloater(pos: Vec2): void {
    this.floaters.push({
      pos: { x: pos.x, y: pos.y - 12 },
      text: 'CRIT!',
      color: '#ff5a6a',
      ttl: 0.85,
      maxTtl: 0.85,
      size: 19,
    });
    // A quick bright ring at the impact for extra punch.
    this.bursts.push({
      pos: { ...pos },
      color: '#ffd34d',
      ttl: 0.32,
      maxTtl: 0.32,
      radius: 7,
    });
  }

  /**
   * Line AoE: a piercing thrust from the tower toward the target, extending to
   * the end of range. Every living enemy whose center lies within the beam's
   * half-width and forward of the tower (up to range) is hit.
   */
  private fireLine(
    tower: Tower,
    target: Enemy,
    range: number = tower.range,
    isThrow = false,
  ): void {
    const dx = target.pos.x - tower.pos.x;
    const dy = target.pos.y - tower.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const halfWidth = tower.def.aoeWidth ?? 14;

    if (isThrow) {
      this.floaters.push({
        pos: { x: tower.pos.x, y: tower.pos.y - 16 },
        text: 'THROW!',
        color: tower.def.visual.color,
        ttl: 0.7,
        maxTtl: 0.7,
        size: 15,
      });
    }

    // One crit roll for the whole thrust; it applies to every enemy pierced.
    const crit = this.rollCrit(tower);
    const dmg = tower.damage * (crit ? tower.critMultiplier : 1);

    // The thrust's cast cue: the heavier Javelin THROW gets its own launch sound.
    this.sfx.push(isThrow ? 'spearThrow' : 'spearThrust');

    // Pierce the corridor, landing an impact (slash + spark) on each enemy hit
    // rather than drawing a single beam down the line.
    let targetLanded = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const ex = e.pos.x - tower.pos.x;
      const ey = e.pos.y - tower.pos.y;
      const proj = ex * ux + ey * uy; // distance along the thrust axis
      if (proj < 0 || proj > range) continue;
      const perp = Math.abs(ex * uy - ey * ux); // distance from the axis
      if (perp <= halfWidth + e.def.radius) {
        const landed = this.damageEnemy(e, dmg, tower);
        if (e === target) targetLanded = landed;
        // Quieter AoE impact (a thrust can pierce several foes at once).
        if (landed) this.sfx.push('spearHit');
        this.thrustImpact(e.pos, tower.def.visual.color, ux, uy, isThrow);
      }
    }
    // Show the thrust's crit popup only if the primary target didn't evade it.
    if (crit && targetLanded) this.critFloater(target.pos);
  }

  /**
   * Impact feedback at a pierced enemy — a short slash arc oriented along the
   * thrust plus a spark ring — used in place of a beam for the Spearman's line
   * attack (throws land a slightly bigger burst).
   */
  private thrustImpact(
    pos: Vec2,
    color: string,
    ux: number,
    uy: number,
    big: boolean,
  ): void {
    this.shots.push({
      from: { x: pos.x - ux * 10, y: pos.y - uy * 10 },
      to: { x: pos.x, y: pos.y },
      color,
      ttl: 0.16,
      maxTtl: 0.16,
      style: 'slash',
    });
    this.bursts.push({
      pos: { ...pos },
      color,
      ttl: big ? 0.34 : 0.26,
      maxTtl: big ? 0.34 : 0.26,
      radius: big ? 7 : 5,
    });
  }

  /**
   * Cone AoE (the Wizard's Wind Slice): spawn a crescent of wind spread the
   * unit's `coneAngle` wide around the aim direction, reaching the end of range.
   * The crit is rolled once here, but the damage is *not* dealt on cast — the
   * crescent's edge sweeps outward over its life (see `updateSlices`) and cuts
   * each enemy as it reaches them.
   */
  private fireCone(tower: Tower, target: Enemy, range: number = tower.range): void {
    const dx = target.pos.x - tower.pos.x;
    const dy = target.pos.y - tower.pos.y;
    const aim = Math.atan2(dy, dx);
    const halfAngle = (coneAngleDeg(tower.def) * Math.PI) / 180 / 2;

    // One crit roll for the whole slice; it applies to every enemy the edge cuts.
    const crit = this.rollCrit(tower);
    const dmg = tower.damage * (crit ? tower.critMultiplier : 1);

    // The Wind Slice's own sweeping-arc cast cue, distinct from the wind bullet.
    this.sfx.push('windSlice');

    this.slices.push({
      pos: { ...tower.pos },
      angle: aim,
      halfAngle,
      range,
      lead: SLICE_START_FRAC * range,
      damage: dmg,
      crit,
      hit: [],
      source: tower,
      color: tower.def.visual.color,
      ttl: SLICE_SWEEP_TIME,
      maxTtl: SLICE_SWEEP_TIME,
    });
  }

  /**
   * Advance each Wind Slice's leading edge outward and deal its damage on hit:
   * any living enemy the crescent has just reached (within `lead`, inside the
   * cone, not yet struck) is cut once. Enemy radius widens the angular test so a
   * foe grazing the edge still registers. Kept in sync with the renderer, which
   * draws the crescent from the same `lead`.
   */
  private updateSlices(): void {
    for (const s of this.slices) {
      const p = 1 - s.ttl / s.maxTtl; // 0 at spawn → 1 at end
      s.lead = s.range * (SLICE_START_FRAC + (1 - SLICE_START_FRAC) * Math.min(1, p));
      for (const e of this.enemies) {
        if (e.dead || s.hit.includes(e.uid)) continue;
        const ex = e.pos.x - s.pos.x;
        const ey = e.pos.y - s.pos.y;
        const dist = Math.hypot(ex, ey);
        if (dist === 0) continue;
        if (dist > s.lead + e.def.radius) continue; // edge hasn't reached it yet
        if (dist > s.range + e.def.radius) continue; // beyond the slice's reach
        let diff = Math.abs(Math.atan2(ey, ex) - s.angle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff; // wrap to [0, π]
        const slack = Math.atan2(e.def.radius, dist);
        if (diff <= s.halfAngle + slack) {
          s.hit.push(e.uid);
          const landed = this.damageEnemy(e, s.damage, s.source);
          // Quieter AoE cut cue as the crescent reaches each foe.
          if (landed) this.sfx.push('windSliceHit');
          if (s.crit && landed) this.critFloater(e.pos);
          this.bursts.push({
            pos: { ...e.pos },
            color: s.color,
            ttl: 0.24,
            maxTtl: 0.24,
            radius: 5,
          });
        }
      }
    }
  }

  /**
   * Apply `amount` damage to an enemy. `source`, when given, is the tower that
   * dealt the blow — it is credited with mastery EXP if the hit is a kill.
   * Returns whether the hit actually landed: `false` if the enemy was already
   * dead or evaded the blow, so callers can skip the crit popup on a dodge.
   */
  private damageEnemy(enemy: Enemy, amount: number, source?: Tower): boolean {
    if (enemy.dead) return false;
    // Already playing out its death animation — no further hits register.
    if (enemy.dying) return false;
    // Untargetable while delivering its spawn lines — every attack type funnels
    // through here, so this guarantees invulnerability during the intro.
    if (isSpeaking(enemy)) return false;
    // Evasive enemies (the nimble Garrick Vane) slip aside from a fraction of
    // blows, taking no damage. Rolled here so it covers every attack type that
    // funnels through this choke point — melee, projectiles, line-AoE, gusts.
    if (enemy.def.dodgeChance && this.rng() < enemy.def.dodgeChance) {
      enemy.dodge = DODGE_ANIM_TIME; // trigger the sidestep-weave in the renderer
      this.floaters.push({
        pos: { x: enemy.pos.x, y: enemy.pos.y - 6 },
        text: 'Dodge',
        color: '#bfe4ff',
        ttl: 0.7,
        maxTtl: 0.7,
      });
      return false;
    }
    // Physical/magic resistance: the attacker's damage type (if any) is softened
    // by the enemy's matching resistance. resistMultiplier is the single source
    // for turning authored resist fractions into a multiplier. A nearby
    // protective aura (The Iron Warden's Aegis) then softens it further.
    const dealt =
      amount *
      resistMultiplier(enemy.def, source?.def.damageType) *
      (1 - enemy.wardReduction);
    enemy.health -= dealt;
    enemy.hitFlash = 0.12;
    if (enemy.health <= 0) {
      enemy.health = 0;
      // An enemy with a special death lingers to play it out (frozen and
      // untargetable) instead of popping — victory waits until it finishes. Every
      // other enemy dies instantly as before. Rewards/kill credit bank now either
      // way, at the moment of the lethal blow.
      if (enemy.def.deathAnimation) {
        enemy.dying = true;
        enemy.deathT = 0;
      } else {
        enemy.dead = true;
        this.bursts.push({
          pos: { ...enemy.pos },
          color: enemy.def.visual.color,
          ttl: 0.45,
          maxTtl: 0.45,
          radius: enemy.def.radius,
        });
      }
      // Tally the kill for the Enemy Index (regardless of which unit landed it).
      this.enemyKills[enemy.def.id] = (this.enemyKills[enemy.def.id] ?? 0) + 1;
      if (source) this.creditKill(source, enemy);
      this.currency += enemy.def.reward;
      this.currencyEarned += enemy.def.reward;
      this.floaters.push({
        pos: { x: enemy.pos.x, y: enemy.pos.y - 6 },
        text: `+${enemy.def.reward}`,
        color: '#ffd76a',
        ttl: 0.8,
        maxTtl: 0.8,
      });
      // Winning requires clearing every enemy, not just the boss — the victory
      // is declared by checkWaveEnd once the final wave is fully wiped out.
    } else if (
      source &&
      source.knockback > 0 &&
      enemy.knockbackCooldown <= 0
    ) {
      // Survivors are shoved back along their lane (Gale Force). The cooldown is
      // on the enemy, so its shove rate is capped no matter how many Wizards hit
      // it — it can be slowed, never permanently stalled. The push itself is bled
      // off gradually in updateEnemies; here we queue the distance, arm the
      // cooldown, and kick up a little wind. Bosses are heavier — they only take
      // half the shove.
      enemy.knockbackRemaining += source.knockback * (enemy.def.boss ? 0.5 : 1);
      enemy.knockbackCooldown = KNOCKBACK_COOLDOWN;
      this.spawnKnockbackPuffs(enemy);
    }
    return true;
  }

  /** Kick up a few wind-puff motes blown back along an enemy's push direction. */
  private spawnKnockbackPuffs(enemy: Enemy): void {
    // Push direction is opposite the enemy's forward heading.
    const bx = -enemy.heading.x;
    const by = -enemy.heading.y;
    for (let i = 0; i < KNOCKBACK_PUFFS; i++) {
      const spread = (this.rng() - 0.5) * 1.6; // radians of scatter
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      // Rotate the push vector by the scatter angle, then vary the speed.
      const dx = bx * cos - by * sin;
      const dy = bx * sin + by * cos;
      const spd = 46 + this.rng() * 58;
      this.puffs.push({
        pos: { x: enemy.pos.x + (this.rng() - 0.5) * 10, y: enemy.pos.y + (this.rng() - 0.5) * 10 },
        vel: { x: dx * spd, y: dy * spd },
        ttl: 0.36 + this.rng() * 0.2,
        maxTtl: 0.56,
        color: '#cdf3f7',
      });
    }
  }

  /**
   * Credit a tower's champion type with mastery EXP for a kill. The amount
   * depends on the slain enemy (bosses and brutes are worth more).
   */
  private creditKill(tower: Tower, enemy: Enemy): void {
    const id = tower.def.id;
    this.masteryEarned[id] = (this.masteryEarned[id] ?? 0) + expForKill(enemy.def);
  }

  /**
   * Credit a generator champion (Farmer) with mastery EXP for gold it just
   * produced: 1 EXP per GOLD_PER_EXP gold, buffering any remainder so partial
   * amounts across harvests still add up to whole EXP.
   */
  private creditGeneration(id: string, gold: number): void {
    const buffered = (this.masteryGoldBuffer[id] ?? 0) + gold;
    const exp = Math.floor(buffered / GOLD_PER_EXP);
    this.masteryGoldBuffer[id] = buffered - exp * GOLD_PER_EXP;
    if (exp > 0) this.masteryEarned[id] = (this.masteryEarned[id] ?? 0) + exp;
  }

  private decayVisuals(dt: number): void {
    this.shots = this.shots.filter((s) => (s.ttl -= dt) > 0);
    this.bursts = this.bursts.filter((b) => (b.ttl -= dt) > 0);
    this.slices = this.slices.filter((s) => (s.ttl -= dt) > 0);
    this.puffs = this.puffs.filter((p) => {
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.vel.x *= 0.86; // drag, so motes coast to a stop as they fade
      p.vel.y *= 0.86;
      return (p.ttl -= dt) > 0;
    });
    this.floaters = this.floaters.filter((f) => {
      f.ttl -= dt;
      f.pos.y -= 18 * dt; // drift upward
      return f.ttl > 0;
    });
  }

  private checkWaveEnd(): void {
    if (this.phase !== 'wave') return;
    const allSpawned = this.spawnCursor >= this.spawnQueue.length;
    const noneAlive = this.enemies.every((e) => e.dead) || this.enemies.length === 0;
    if (allSpawned && noneAlive) {
      this.waveIndex++;
      // End-of-wave cash (tune via WAVE_CLEAR_GOLD at top of file). waveIndex is
      // now 1-based for the wave just cleared, so wave N reads entry N-1.
      this.currency += WAVE_CLEAR_GOLD[this.waveIndex - 1] ?? WAVE_CLEAR_GOLD_DEFAULT;
      if (this.waveIndex >= this.totalWaves) {
        // Every wave has been fully cleared (all enemies, boss included) — the
        // realm is won.
        this.win();
      } else {
        this.phase = 'prep';
      }
    }
  }

  private win(): void {
    if (this.outcome !== 'playing') return;
    this.outcome = 'won';
    this.phase = 'ended';
  }

  private lose(): void {
    if (this.outcome !== 'playing') return;
    this.outcome = 'lost';
    this.phase = 'ended';
  }
}

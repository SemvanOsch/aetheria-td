/**
 * Runtime types for the tower-defense simulation.
 *
 * These are mutable in-battle entities (distinct from the immutable domain
 * definitions in src/domain). The engine owns and mutates them each tick.
 */

import type { EnemyDef } from '../domain/enemies';
import type { AoeType, UnitDef } from '../domain/units';
import type { Vec2 } from '../domain/grid';
import type { TargetingType } from '../domain/targeting';

export interface Enemy {
  uid: number;
  def: EnemyDef;
  health: number;
  /** Index of the lane this enemy travels (into the engine's lanes). */
  laneIndex: number;
  /** Distance travelled along its lane's path in pixels. */
  dist: number;
  pos: Vec2;
  /**
   * Unit vector of travel along the path (which way it currently walks). Drives
   * the walk-sprite's side/front/back view and facing; updated every tick.
   */
  heading: Vec2;
  /** Multiplicative slow (1 = normal speed); reserved for future effects. */
  slowFactor: number;
  slowTimer: number;
  dead: boolean;
  /** Brief hit flash timer for damage feedback. */
  hitFlash: number;
  /**
   * Pixels of pending knockback still to slide back along the path (see the
   * Wizard's Gale Force). Drained gradually so the shove reads as a push, not a
   * teleport.
   */
  knockbackRemaining: number;
  /**
   * Seconds until this enemy may be knocked back again — a single cooldown on
   * the *enemy*, not per attacking Wizard. This caps the total shove rate no
   * matter how many Wizards target it, so a foe can be slowed but never
   * permanently stalled.
   */
  knockbackCooldown: number;
  /**
   * Throne-rise animation, 1→0: a boss that spawns on a revealed lane (the
   * Throne Room king) sits at 1 and eases to 0 over the rise. While > 0 it stays
   * put (doesn't advance the path) and can't be targeted — it's rising off its
   * throne — and the renderer blends its sprite from seated to walking and lowers
   * it onto the path. 0 for every normal enemy.
   */
  rise: number;
  /**
   * Spawn-speech state. `speechIndex` starts at -1 ("walking in, not yet spoken")
   * so the enemy first advances onto the board; once it has walked in it flips to
   * 0 and delivers each line of `def.spawnLines` in turn (`speechTimer` = seconds
   * left on the current line). While `speechIndex` is a valid index the enemy
   * stays put and can't be hit — it's delivering its intro (Gowzer) — and the
   * renderer floats the current line above it. For silent enemies `def.spawnLines`
   * is undefined, so `isSpeaking` is always false regardless of these values.
   */
  speechIndex: number;
  speechTimer: number;
  /**
   * Dodge-weave animation timer, counting down over `DODGE_ANIM_TIME`: set when
   * an evasive enemy (Garrick Vane) slips a hit, driving a quick cosmetic
   * sidestep in the renderer. 0 when not dodging; never affects the simulation.
   */
  dodge: number;
  /**
   * Damage-reduction fraction (0-1) this enemy is currently receiving from a
   * nearby protective aura (The Iron Warden's Aegis). Recomputed every tick as
   * enemies move; 0 when out of range. Read by `damageEnemy` (softens incoming
   * damage) and by the renderer (a glow pooled in the enemy's shadow).
   */
  wardReduction: number;
  /**
   * Death-animation state. When an enemy with a `def.deathAnimation` takes a
   * lethal hit it doesn't vanish immediately: `dying` flips true and `deathT`
   * counts up in seconds while the renderer plays the special death (Gowzer's
   * fall-and-shadow-swallow). It stays in the enemy list (untargetable, frozen,
   * no longer takes damage) so victory is withheld until the animation finishes;
   * only then is it truly removed. `dying` is false for every ordinary enemy,
   * which pops instantly on death as before.
   */
  dying: boolean;
  deathT: number;
}

/** Whether an enemy is still delivering its spawn lines (frozen & untargetable). */
export function isSpeaking(e: Enemy): boolean {
  return (
    !!e.def.spawnLines &&
    e.speechIndex >= 0 &&
    e.speechIndex < e.def.spawnLines.length
  );
}

/** The line an enemy is currently speaking, or undefined if it isn't speaking. */
export function currentSpeechLine(e: Enemy): string | undefined {
  return isSpeaking(e) ? e.def.spawnLines![e.speechIndex] : undefined;
}

export interface Tower {
  uid: number;
  def: UnitDef;
  col: number;
  row: number;
  pos: Vec2;
  /** Purchased upgrade tier this stage (0 = base, up to the unit's max tier). */
  upgradeTier: number;
  /**
   * Effective attack shape — the unit's base `aoe`, possibly transformed by a
   * purchased upgrade (e.g. the Wizard's Wind Slice → 'cone'). Combat and the
   * AoE indicator read this, not `def.aoe`. Recomputed on deploy and on upgrade.
   */
  aoe: AoeType;
  /** Effective (upgraded) combat stats — combat reads these, not `def`. */
  damage: number;
  attackSpeed: number;
  range: number;
  /** Chance (0–1) each attack crits. */
  critChance: number;
  /** Damage multiplier applied when this tower's attack crits. */
  critMultiplier: number;
  /** Number of attacks this tower has made (drives periodic "throw" attacks). */
  attackCount: number;
  /** Every Nth attack is a throw with extended range (0 = never). */
  throwEvery: number;
  /** Range multiplier applied on a throw attack. */
  throwRangeMult: number;
  /**
   * Bonus damage per adjacent allied tower of the same type (0 = none). Folded
   * into `damage` whenever towers are placed or sold (see Better Morale).
   */
  adjacentDamageMult: number;
  /** Adjacent allies currently boosting this tower (drives the Morale badge). */
  adjacentAllies: number;
  /**
   * Range-aura multiplier this tower *emits* to nearby ranged allies (1 = none;
   * see the Wizard's Guiding Gale). Projected over allies within this
   * tower's range whenever the board changes.
   */
  rangeAuraMult: number;
  /**
   * Whether this tower is currently *receiving* a range-aura buff from an allied
   * emitter. Non-stacking, so it's a flag rather than a count; folded into
   * `range` on the board-change recompute and drives the arcane glow.
   */
  rangeBuffed: boolean;
  /**
   * Pixels each hit shoves an enemy back along its path (0 = none; see the
   * Wizard's Gale Force). A fixed deploy-time property read in `damageEnemy`.
   */
  knockback: number;
  /**
   * Extra foes each of this tower's projectiles leaps to on impact (the Elf's
   * bouncing magic arrow). Its base `bounces` plus any purchased upgrade; folded
   * in on deploy and on upgrade, and read by `fire` when loosing the arrow.
   */
  bounces: number;
  /**
   * Overrides the per-leap damage fraction for this tower's bouncing projectiles
   * (the Elf's Resonant Enchantment mastery). 0 = no override, so the engine uses
   * its default per-leap fractions; a value like 0.5 makes every bounce deal that
   * fraction of the original hit.
   */
  bounceDamageMult: number;
  /**
   * Fraction of the original hit dealt by an extra final leap appended to this
   * tower's bounce chain (the Elf's Parting Shot mastery). 0 = no extra leap; a
   * value like 0.25 adds one last bounce struck after all normal leaps.
   */
  finalBounceMult: number;
  /** Max spare shots this tower can crank up while idle (0 = no preloading). */
  preloadMax: number;
  /** Spare shots currently cranked and ready to loose in quick succession. */
  preloaded: number;
  /** Countdown to cranking the next spare shot while idle (seconds). */
  preloadTimer: number;
  /**
   * Arrows loosed per burst volley (the Bow adventurer's shortbow); 1 = no burst.
   * From `UnitDef.burst`; fixed for the tower's lifetime.
   */
  burstCount: number;
  /**
   * Arrows still to loose in the current burst after the one just fired. Counts
   * down to 0 across quick `BURST_SHOT_DELAY` follow-ups, then a full reload runs.
   */
  burstLeft: number;
  /** Total gold spent on this tower (deploy + upgrades) for sell refunds. */
  invested: number;
  /** Gold produced per harvest (generator units only). */
  genAmount: number;
  /** Harvests remaining this wave (generator units only). */
  genLeft: number;
  /** Countdown to the next harvest (generator units only). */
  genTimer: number;
  /** Current targeting mode (player-changeable in-stage). */
  targeting: TargetingType;
  /** Seconds until the tower may attack again. */
  cooldown: number;
  /** Uid of the enemy currently targeted (for aiming visuals). */
  targetUid: number | null;
  /** Position struck by the last attack; null until the tower first fires. */
  aimTarget: Vec2 | null;
  /** Attack animation timer (drives lunge/draw feedback). */
  attackAnim: number;
  /**
   * Throw animation timer (seconds). Set when a "throw" attack fires and decays
   * on its own — longer than `attackAnim` so the Spearman's flung javelin stays
   * visible past the throw beam. 0 when the last attack was a normal strike.
   */
  throwAnim: number;
  /**
   * Wind-up timer (seconds) for a charged attack such as the Wizard's Wind
   * Slice: while > 0 the tower is visibly charging and does not fire; it releases
   * the moment it hits 0. Drives the charge animation (0 = not charging).
   */
  charge: number;
  /** Full duration of the current charge, for the wind-up animation ramp. */
  chargeMax: number;
}

export type ShotStyle = 'bolt' | 'slash' | 'line';

/** Short-lived visual: a shot/slash/beam from a tower toward a point. */
export interface Shot {
  from: Vec2;
  to: Vec2;
  color: string;
  ttl: number;
  maxTtl: number;
  style: ShotStyle;
  /** Line beam that is an extended "throw" — drawn bolder to read the reach. */
  throw?: boolean;
}

/** Short-lived visual: floating text (currency gains, damage to base). */
export interface FloatingText {
  pos: Vec2;
  text: string;
  color: string;
  ttl: number;
  maxTtl: number;
  /** Optional font size in px (defaults applied by the renderer). */
  size?: number;
}

/** Short-lived visual: an enemy death burst. */
export interface Burst {
  pos: Vec2;
  color: string;
  ttl: number;
  maxTtl: number;
  radius: number;
}

/**
 * A single wind-puff mote kicked up when an enemy is knocked back (the Wizard's
 * Gale Force). Drifts along `vel` and fades over its `ttl`; purely cosmetic.
 */
export interface Puff {
  pos: Vec2;
  vel: Vec2;
  ttl: number;
  maxTtl: number;
  color: string;
}

/**
 * The Wizard's Wind Slice — a crescent of wind that sweeps out from the caster
 * along `angle`, spanning `halfAngle` each side and reaching `range` as it plays.
 * Unlike a pure cosmetic, a slice deals its `damage` *as its leading edge passes
 * over each enemy* (not on cast): the engine advances `lead` each tick and hits
 * any foe the crescent has just reached, recording it in `hit` so each is struck
 * once. The renderer draws the crescent from the same `lead`.
 */
export interface Slice {
  /** Apex of the cone (the caster's position). */
  pos: Vec2;
  /** Centre direction of the cone, in radians. */
  angle: number;
  /** Half the cone's opening angle, in radians. */
  halfAngle: number;
  /** Reach of the slice in pixels. */
  range: number;
  /** Current leading-edge radius (px), advanced by the engine each tick. */
  lead: number;
  /** Damage dealt to each enemy the edge reaches (crit already folded in). */
  damage: number;
  /** Whether this slice's roll crit (drives the CRIT! popup on each hit). */
  crit: boolean;
  /** Uids already struck, so the sweeping edge hits each enemy only once. */
  hit: number[];
  /** Tower that cast it, credited with EXP on a killing cut. */
  source: Tower;
  color: string;
  ttl: number;
  maxTtl: number;
}

/**
 * A travelling arrow/bolt. Unlike a Shot (pure cosmetic), a projectile carries
 * its pending hit and applies the damage on impact — it homes onto its target
 * and deals `damage` when it lands, or is dropped if the target is gone.
 */
export interface Projectile {
  /** Current position, advanced each frame toward the target. */
  pos: Vec2;
  /** Enemy this arrow homes toward. */
  targetUid: number;
  /** Last known target position — flown to as a fallback if the target dies. */
  last: Vec2;
  /** Travel speed in pixels per second. */
  speed: number;
  /** Damage applied on impact (crit multiplier already folded in). */
  damage: number;
  /** Whether this hit is a crit (drives the CRIT! popup on impact). */
  crit: boolean;
  /** Fletching tint (the champion's colour). */
  color: string;
  /** Render size multiplier (e.g. the Crossbow's bolt is a touch bigger). */
  scale: number;
  /** Visual style: a fletched arrow/bolt, the Wizard's wind bullet, or the Elf's magic arrow. */
  style: ProjectileStyle;
  /** Tower that loosed it, credited with EXP if the impact kills. */
  source: Tower;
  /**
   * Remaining leaps to a nearby foe on impact (the Elf's bouncing magic arrow).
   * 0 for an ordinary shot; a magic arrow starts at 1 and, when it lands, spawns
   * a weaker follow-up arrow at `bounces - 1` toward the nearest other enemy.
   */
  bounces: number;
  /**
   * Enemies already struck earlier in this bounce chain (the Elf's magic arrow),
   * so each leap skips foes it has already hit and seeks a fresh target instead
   * of ricocheting back. Undefined for a non-bouncing shot; the first magic arrow
   * starts with its primary target's uid.
   */
  hitUids?: number[];
  /**
   * The original (primary) hit's damage for a bounce chain, crit already folded
   * in. Every leap's damage is this base × its per-bounce multiplier — so bounces
   * scale off the first hit rather than compounding off each other.
   */
  baseDamage?: number;
  /**
   * Which leap of the chain this arrow is: 0 for the primary shot, 1 for the
   * first bounce, and so on. Picks the per-bounce damage multiplier.
   */
  bounceIndex?: number;
  /**
   * Recent positions (newest first) left behind for a fading cosmetic trail —
   * populated only for the Elf's `magic` arrow so it streaks a wispy tail. The
   * engine appends the current position each tick and caps the length; the
   * renderer draws older points progressively fainter. Undefined for plain shots.
   */
  trail?: Vec2[];
  /**
   * Detonation radius (px) for a `burst` projectile (the Magic adventurer's orb):
   * on impact it deals its `damage` to every living enemy within this distance of
   * the impact point, rather than only the target. Undefined for a single-target
   * shot, whose damage lands on its target alone.
   */
  burstRadius?: number;
}

/** How a projectile is drawn in flight. */
export type ProjectileStyle = 'arrow' | 'wind' | 'magic' | 'orb';

export type Outcome = 'playing' | 'won' | 'lost';

export type Phase = 'prep' | 'wave' | 'ended';

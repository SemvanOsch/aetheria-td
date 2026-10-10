/**
 * Runtime types for the tower-defense simulation.
 *
 * These are mutable in-battle entities (distinct from the immutable domain
 * definitions in src/domain). The engine owns and mutates them each tick.
 */

import type { EnemyDef } from '../domain/enemies';
import type { AbilityDef, AoeType, UnitDef } from '../domain/units';
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
  /**
   * A light-shy foe (`EnemyDef.lightSlow`) losing the scent in lantern light,
   * 0→1: eases up while it is in the light and back down out of it. Blends its
   * speed toward `lightSlow` and its sprite from gallop to slink.
   */
  cower: number;
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
   *
   * A foe spawning on an `emerge` lane (the Sewers' cistern) uses the same
   * hold: it surfaces out of the water over `EMERGE_TIME` (see `riseFrom`).
   */
  rise: number;
  /** What a `rise` lifts the foe out of: the king's throne, or a pool of water. */
  riseFrom: 'throne' | 'water';
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
   * Shield points left (see `EnemyDef.shieldHits`): each hit while > 0 is
   * absorbed outright and knocks one off. Starts at `def.shieldHits ?? 0`; the
   * renderer shows it as pips over the health bar.
   */
  shield: number;
  /**
   * The most shield points this enemy has held (its own `shieldHits`, raised
   * when a rally stacks more on). Sizes the pip row so spent points show hollow.
   */
  shieldMax: number;
  /**
   * Rally state (see `EnemyDef.rally`): `rallyTimer` counts down to the next
   * rally while walking; `rallyT` counts up through one (seconds in), -1 when
   * not rallying. While rallying the enemy stands still. Both unused without a
   * `def.rally`.
   */
  rallyTimer: number;
  rallyT: number;
  /**
   * Summon state (see `EnemyDef.summon`), like the rally's: `summonTimer`
   * counts down to the next call while walking; `summonT` counts up through one
   * (seconds in), -1 when not summoning. It stands still while it calls.
   */
  summonTimer: number;
  summonT: number;
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

/**
 * Seconds a champion's normal-attack animation (`Tower.attackAnim`) runs. Purely
 * cosmetic. The Blade adventurer's wind-up → double cut needs longer to read; the
 * Bow adventurer's covers a loose, re-nock and follow-through (mid-volley the
 * next arrow restarts it before the follow-through, see `drawPlayerShortbow`); the
 * Magic adventurer's covers its two-handed throw and the recovery to rest; the
 * Claymore's heavy release carries a long follow-through (its heft wind-up is the
 * charge before it, see `CLAYMORE_WINDUP_TIME`), and so does the Longbow's heavy
 * loose (its slow draw is likewise a charge, `LONGBOW_DRAW_TIME`).
 */
export function attackAnimTime(shape: string): number {
  if (shape === 'player-blade') return 0.3;
  if (shape === 'player-claymore') return 0.42;
  if (shape === 'player-bow') return 0.24;
  if (shape === 'player-longbow') return 0.5;
  if (shape === 'player-magic') return 0.35;
  if (shape === 'player-staff') return 0.42;
  return 0.18;
}

/**
 * Where a lantern post's glass hangs, relative to its cell's centre: the
 * painting (`lanternPost` in `props.ts`), its light and the engine's light-up
 * fx all share it.
 */
export const LANTERN_GLASS = { x: 13, y: -32 } as const;

// Signature moves (`Tower.specialAnim`): each plays its own longer pose, and the
// engine lands the blow `*_HIT_DELAY` into it — matched to the sprite's cut
// window (`drawDualShortSwords` / `drawClaymore`), so retime both together.
/** The Blade's Cross Slash: coil, one crossing X cut, hold, recover. */
export const CROSS_SLASH_ANIM_TIME = 0.5;
export const CROSS_SLASH_HIT_DELAY = 0.19;
/**
 * The Claymore's Earthsplitter: hoist overhead, a held wind-up drawing back (the
 * telegraph: a tremble, the blade kindling, the crack's path glowing on the
 * floor), then the slam into the ground and the recovery.
 */
export const EARTHSPLITTER_ANIM_TIME = 1.05;
export const EARTHSPLITTER_HIT_DELAY = 0.6;

/**
 * The Longbow's Piercing Shot cast: the hero raises the bow and aims a kindling
 * arrow at the sky, holds it while it flares in their colour, then lowers it.
 */
export const PIERCING_CAST_ANIM_TIME = 0.6;

/**
 * The Magic adventurer's Greater Orb (its `greaterOrb` mastery node). The charge
 * is the leap: a crouch for the first `GREATER_ORB_CROUCH` of it, the jump up to
 * the apex by `GREATER_ORB_APEX`, then a hang in the air while the orb swells
 * above the head. On release the throw-down plays as the signature move
 * (`specialAnim`, over `GREATER_ORB_THROW_TIME`): the hurl, the fall, touchdown
 * at `GREATER_ORB_LAND` of it, then the recovery. `GREATER_ORB_JUMP` is the leap's
 * height in board pixels. The renderer's body motion, the sprite's arms and legs
 * and the engine's dust cues all read these, so retime them together.
 */
export const GREATER_ORB_CHARGE_TIME = 1.1;
export const GREATER_ORB_CROUCH = 0.16;
export const GREATER_ORB_APEX = 0.38;
export const GREATER_ORB_THROW_TIME = 0.62;
export const GREATER_ORB_LAND = 0.55;
export const GREATER_ORB_JUMP = 10;

/**
 * Mana Storm (the Arcane Staff's ability) stance timing, in seconds: the staff
 * is hoisted overhead over `MANA_STORM_RAISE` (the first bolt looses as it gets
 * there) and lowered again over the channel's last `MANA_STORM_LOWER`. Shared by
 * the engine's firing and the renderer's pose (`manaStormStance`).
 */
export const MANA_STORM_RAISE = 0.22;
export const MANA_STORM_LOWER = 0.25;

/** How far the Mana Storm stance is held (0 at rest → 1 staff overhead) for a tower. */
export function manaStormStance(t: Tower): number {
  if (!t.storm) return 0;
  const k = Math.min(1, (t.storm.duration - t.storm.timer) / MANA_STORM_RAISE, t.storm.timer / MANA_STORM_LOWER);
  return Math.max(0, k);
}

/** Seconds a champion's signature-move animation (`Tower.specialAnim`) runs. */
export function specialAnimTime(shape: string): number {
  if (shape === 'player-claymore') return EARTHSPLITTER_ANIM_TIME;
  if (shape === 'player-longbow') return PIERCING_CAST_ANIM_TIME;
  if (shape === 'player-magic') return GREATER_ORB_THROW_TIME;
  return CROSS_SLASH_ANIM_TIME;
}

/** Whether an enemy is still delivering its spawn lines (frozen & untargetable). */
/**
 * How far into its rally pose an enemy is, 0..1: eases up over the first
 * `RALLY_POSE_EASE` of the rally, holds, and eases back down over the last
 * stretch. 0 when not rallying. Read by the renderer to blend the sprite.
 */
export function rallyPose(e: Enemy): number {
  const r = e.def.rally;
  if (!r || e.rallyT < 0) return 0;
  const k = e.rallyT / r.duration;
  return Math.max(0, Math.min(1, k / RALLY_POSE_EASE, (1 - k) / RALLY_POSE_EASE));
}
/** Fraction of a rally spent raising (and again lowering) the standard. */
export const RALLY_POSE_EASE = 0.2;

/**
 * How far into its summon pose an enemy is, 0..1 (the Hound Master raising his
 * whistle): eases up over the first `SUMMON_POSE_EASE` of the call, holds while
 * he blows, and eases back down. 0 when not summoning.
 */
export function summonPose(e: Enemy): number {
  const s = e.def.summon;
  if (!s || e.summonT < 0) return 0;
  const k = e.summonT / s.duration;
  return Math.max(0, Math.min(1, k / SUMMON_POSE_EASE, (1 - k) / SUMMON_POSE_EASE));
}
/** Fraction of a summon spent raising (and again lowering) the whistle. */
export const SUMMON_POSE_EASE = 0.25;

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
   * The range-aura multiplier currently lifting this tower's range (1 = none;
   * e.g. 1.1 for the Wizard's Guiding Gale). Stored so the buff panel can show
   * the exact percentage; set alongside `rangeBuffed` on the board recompute.
   */
  rangeBuffMult: number;
  /**
   * The mist multiplier on this tower's range (1 = clear; `MIST_RANGE_MULT` when
   * it stands in the mist of a misty stage, away from any lit lantern). Folded
   * into `range` on the board recompute, like the range aura.
   */
  mistMult: number;
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
  /**
   * Blast radius (px) of this tower's circle attack (the Magic adventurer's orb),
   * mastery widening applied (`masteryBurstRadius`); fixed for its lifetime.
   */
  burstRadius: number;
  /**
   * Whether this tower casts the Greater Orb (the Magic adventurer's mastery
   * node): a longer, leaping charge and a bigger orb hurled down from overhead.
   */
  greaterOrb: boolean;
  /** Total gold spent on this tower (deploy + upgrades) for sell refunds. */
  invested: number;
  /**
   * In-stage EXP pool for a Hero-rarity champion (the player's adventurer).
   * Hero champions never buy upgrades with gold — instead they earn EXP at the
   * end of each wave (see `WAVE_CLEAR_HERO_EXP`) and level up *automatically* when
   * this pool reaches the next tier's `UpgradeDef.cost` (read as an EXP
   * threshold), draining that much on each level-up. Always 0 for ordinary
   * champions, which upgrade through the gold `upgradeTower` path instead.
   */
  heroExp: number;
  /**
   * Seconds between a Bard's performances (0 = not a Bard). A support unit; the
   * engine ticks `bardTimer` and plays a buff when it reaches 0 (see `updateBard`).
   */
  bardEvery: number;
  /** Countdown to this Bard's next performance (Bard units only). */
  bardTimer: number;
  /** How many random allies in range each performance buffs (Bard units only). */
  bardTargets: number;
  /** Attack-speed multiplier a buffed ally receives from this Bard. */
  bardSpeedMult: number;
  /** How long (seconds) a buff this Bard grants lasts on an ally. */
  bardDuration: number;
  /**
   * Attack-speed buff multiplier this tower is currently *receiving* (1 = none;
   * see the Bard). Folded into the firing cadence while `attackSpeedBuffTimer`
   * runs; the renderer floats music notes around a buffed tower.
   */
  attackSpeedBuffMult: number;
  /** Seconds of attack-speed buff left on this tower (0 = unbuffed). */
  attackSpeedBuffTimer: number;
  /**
   * Colour of the Bard that granted the current attack-speed buff, so the
   * renderer floats notes in the Bard's colour (not the buffed unit's). Empty
   * when unbuffed.
   */
  attackSpeedBuffColor: string;
  /**
   * Attack-speed buff from this champion's OWN activated ability (the Bow's
   * Quickdraw), kept in a *separate* slot from the Bard's tune above so the two
   * **stack multiplicatively** rather than overwriting each other. 1 = none;
   * folded into the firing cadence while `abilitySpeedBuffTimer` runs, and shown
   * by its own flaring foot-outline (not the Bard's floating notes).
   */
  abilitySpeedBuffMult: number;
  /** Seconds of ability attack-speed buff left (0 = none). */
  abilitySpeedBuffTimer: number;
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
  /**
   * Channelled beam (the Mage's Mana Ray): seconds of channel left (0 = not
   * firing a beam). While > 0 the champion fires *only* the beam — its normal
   * attacks (and orb charge) are suppressed — and the renderer draws the beam.
   */
  beamTimer: number;
  /**
   * Locked aim direction of the beam in radians, captured the instant it is cast.
   * The beam does not re-aim — it sears a fixed line, hitting whatever walks
   * through it. Meaningful only while `beamTimer > 0`.
   */
  beamAngle: number;
  /** Reach of the beam in pixels (the champion's range captured at cast). */
  beamRange: number;
  /** Countdown to the beam's next damage tick, in seconds (see `tickInterval`). */
  beamTickTimer: number;
  /**
   * A pending second strike (the Blade adventurer's off-hand cut): lands on
   * `targetUid` for `damage` (crit rolled when it lands) once `timer` runs out.
   * `cross` marks a Cross Slash, which strikes the nearest foe in reach if its
   * target has fallen meanwhile. null when nothing is pending.
   */
  followUp: { timer: number; targetUid: number; damage: number; cross?: boolean } | null;
  /** Every Nth attack is a Cross Slash (0 = never; the Blade's mastery node). */
  crossSlashEvery: number;
  /** Damage multiplier of a Cross Slash. */
  crossSlashMult: number;
  /**
   * Piercing arrows still nocked from the Longbow's Piercing Shot (0 = none):
   * each of the next attacks spends one to loose a piercing arrow instead.
   */
  pierceShots: number;
  /**
   * Signature-move animation timer (seconds, counting down to 0): a Cross Slash,
   * an Earthsplitter slam or a Greater Orb throw-down. While > 0 the renderer plays that move's own pose
   * instead of the normal swing (see `specialAnimTime`).
   */
  specialAnim: number;
  /**
   * A pending Earthsplitter (the Claymore's ability), locked to its aim and reach
   * at cast; the fissure strikes when `timer` runs out, as the slammed blade meets
   * the ground. The hero makes no normal attacks while one is pending or its
   * slam is still playing. null when none is pending.
   */
  slam: {
    timer: number;
    angle: number;
    reach: number;
    halfWidth: number;
    damage: number;
    crit: boolean;
    knockback: number;
  } | null;
  /**
   * A channelling Mana Storm (the Arcane Staff's ability): the staff held high
   * overhead, it looses a steady stream of mana bolts skyward that rain down on
   * random foes in range. `timer` counts down from `duration`; `next` is the
   * countdown to the next bolt and `every` the current gap between bolts (the
   * renderer flashes the crystal on each). No normal attacks while it runs. null
   * when not channelling.
   */
  storm: { timer: number; duration: number; next: number; every: number } | null;
  /**
   * Player-activated ability this tower has unlocked (the Blade's Cyclone Slash),
   * or null. Set from the unit's upgrade tiers (see `effectiveAbility`) on deploy
   * and refolded on every tier bump, so a hero auto-levelling into the ability's
   * tier gains it mid-battle. Its presence is what makes the HUD show an ability
   * icon for this tower.
   */
  ability: AbilityDef | null;
  /** Seconds until the ability may be triggered again (0 = ready). */
  abilityCooldown: number;
  /** Full cooldown duration, for the icon's radial countdown. */
  abilityCooldownMax: number;
  /**
   * Current mana pool for a hero champion (0 for units without one). Abilities
   * are paid for in mana; casting drains it, and killing enemies (plus any
   * `manaRegen`) refills it, up to
   * `maxMana`. Shown as the mana bar in the in-stage champion panel.
   */
  mana: number;
  /** Mana capacity (from `UnitDef.maxMana`; 0 for units with no mana pool). */
  maxMana: number;
  /** Mana regained per second regardless of kills (from `UnitDef.manaRegen`). */
  manaRegen: number;
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
 * The Blade adventurer's Cyclone Slash — a whirling ring of steel centred on the
 * champion that fills its whole attack radius. Purely cosmetic (the damage is
 * dealt instantly on cast in the engine): the renderer spins expanding blade-arcs
 * out to `radius` and fades them over `ttl`.
 */
export interface Cyclone {
  /** Centre of the whirlwind (the champion's position). */
  pos: Vec2;
  /** Reach of the whirlwind in pixels (the tower's range at cast time). */
  radius: number;
  /** Whirl tint (the champion's colour). */
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
  /**
   * A piercing arrow (the Longbow's Piercing Shot): it doesn't home, but flies
   * straight along `dir` for `travelLeft` more pixels (to the end of the archer's
   * range), striking every foe it passes once (`hit` holds their uids). Undefined
   * for an ordinary shot.
   */
  pierce?: { dir: Vec2; travelLeft: number; hit: number[] };
  /**
   * A seeking mana bolt (the Magic adventurer's Staff): it flies along its own
   * heading (`dir`, a unit vector) instead of straight at the target, launched
   * out wide and turning ever harder toward the foe as it ages (`age`, seconds),
   * accelerating as it goes — so it arcs out before homing in. `delay` holds it
   * unseen at the crystal for that many seconds first, so a volley's bolts fly
   * out one after another. Undefined for an ordinary shot.
   */
  seek?: { dir: Vec2; age: number; delay: number };
  /**
   * A raining mana bolt (the Staff's Mana Storm): it flies a high arc over `time`
   * seconds — straight up from `from` to `lift` px above the higher of its two
   * ends, nudged sideways by `spread`, then straight down onto its foe (a cubic
   * curve whose far end follows the target). `age` is the seconds flown and `dir`
   * the current heading (for drawing). Undefined for an ordinary shot.
   */
  rain?: { from: Vec2; lift: number; spread: number; age: number; time: number; dir: Vec2 };
}

/** How a projectile is drawn in flight. */
export type ProjectileStyle = 'arrow' | 'wind' | 'magic' | 'orb' | 'pierce' | 'mana';

/**
 * Elemental family of an attack, for VFX only (sparks vs. gusts vs. arcane
 * motes). Derived from the attacking champion; never read by combat.
 */
export type FxElement = 'steel' | 'wind' | 'arcane' | 'fire' | 'frost' | 'holy' | 'dark';

/**
 * Cosmetic battle events the engine emits for the renderer's VFX layer, the
 * visual twin of `sfx`. Pure notifications — nothing in the simulation reads
 * them back — so effects can react to hits/kills without the renderer
 * re-deriving combat. The renderer drains the queue every frame; a headless
 * engine caps it (see `GameEngine.emitFx`).
 */
export type FxEvent =
  | {
      kind: 'hit';
      /** Where the blow landed (the enemy's position). */
      x: number;
      y: number;
      /** Where it came from (attacker), for directional sparks / recoil. */
      fromX: number;
      fromY: number;
      enemyUid: number;
      color: string;
      element: FxElement;
      crit: boolean;
      /** A close-quarters blow (sword/spear) — gets a slash crescent. */
      melee: boolean;
      /** Damage actually dealt (after resists), for scaling the impact. */
      amount: number;
      /** Fraction of the enemy's max health this blow took (0..1). */
      weight: number;
      /** Caster colour that replaces the element's ramp (see `fxTintFor`). */
      tint?: string;
    }
  | {
      kind: 'kill';
      enemy: Enemy;
      fromX: number;
      fromY: number;
      element: FxElement;
      tint?: string;
    }
  | {
      kind: 'blast';
      x: number;
      y: number;
      radius: number;
      color: string;
      element: FxElement;
      crit: boolean;
      tint?: string;
      /** A Greater Orb crashing down: a heavier blast with shake and dust. */
      heavy?: boolean;
    }
  | {
      kind: 'cast';
      /**
       * Which ability / flourish: drives the bespoke flash + light. `leap` /
       * `land` are the Greater Orb caster's take-off and touchdown (dust at the
       * feet); `greaterOrb` is its orb leaving the raised hands.
       */
      ability:
        | 'cyclone'
        | 'quickdraw'
        | 'piercingShot'
        | 'manaRay'
        | 'bard'
        | 'harvest'
        | 'throw'
        | 'levelUp'
        | 'greaterOrb'
        | 'manaStorm'
        | 'leap'
        | 'land';
      x: number;
      y: number;
      color: string;
      radius: number;
    }
  | {
      /** The Blade's Cross Slash landing: an X of two crossing cuts at the foe. */
      kind: 'crossSlash';
      x: number;
      y: number;
      /** Direction of the blow (attacker → foe), radians. */
      angle: number;
      color: string;
      crit: boolean;
    }
  | {
      /** A Claymore swing: a heavy crescent sweeping the arc it cleaves. */
      kind: 'cleave';
      /** The swinger's position (the arc's centre). */
      x: number;
      y: number;
      /** Aim of the arc's middle, radians. */
      angle: number;
      /** Half the arc's opening, radians. */
      halfAngle: number;
      radius: number;
      color: string;
    }
  | {
      /** The Claymore's Earthsplitter: a crack torn through the ground. */
      kind: 'fissure';
      /** Where the blade struck the ground (the crack's root). */
      x: number;
      y: number;
      angle: number;
      length: number;
    }
  | { kind: 'dodge'; x: number; y: number }
  | {
      /** A shielded foe turned a hit aside; `broke` when that was its last shield point. */
      kind: 'block';
      x: number;
      y: number;
      fromX: number;
      fromY: number;
      broke: boolean;
    }
  | {
      /**
       * A rally's call (`granted: false`, as the standard goes up) or its
       * blessing (`granted: true`): `targets` are the foes that just gained shield.
       */
      kind: 'rally';
      x: number;
      y: number;
      granted: boolean;
      targets: { x: number; y: number }[];
    }
  | { kind: 'breach'; x: number; y: number; boss: boolean }
  | { kind: 'deploy'; x: number; y: number; color: string }
  | {
      /** A summoner's call answered: `spawns` are where the new foes burst out. */
      kind: 'summon';
      x: number;
      y: number;
      spawns: { x: number; y: number }[];
    }
  | {
      /** A light-shy foe skidding as it loses the scent; `dx`,`dy` its heading. */
      kind: 'skid';
      x: number;
      y: number;
      dx: number;
      dy: number;
    }
  | {
      /** A lantern post lit: `x`,`y` its glass, `radius` the mist it clears around its cell's centre (`cx`,`cy`). */
      kind: 'lantern';
      x: number;
      y: number;
      cx: number;
      cy: number;
      radius: number;
    }
  | { kind: 'bossSpawn'; x: number; y: number; color: string }
  /** A foe breaking the surface of a pool it climbs out of (`x`,`y` its feet). */
  | { kind: 'emerge'; x: number; y: number; radius: number }
  /** A mass of sludge striking or bursting (the Sludge Father's cutscene); `shake` jolts the board. */
  | { kind: 'sludgeSplash'; x: number; y: number; radius: number; shake?: number };

export type Outcome = 'playing' | 'won' | 'lost';

export type Phase = 'prep' | 'wave' | 'ended';

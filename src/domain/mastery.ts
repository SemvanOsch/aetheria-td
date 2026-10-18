/**
 * Champion mastery — permanent, per-champion progression.
 *
 * A champion earns mastery EXP for every enemy it kills during a stage. Unlike
 * the in-stage gold upgrades (which live on the deployed tower and reset each
 * level), mastery EXP is banked to the *collection* and persists forever, win
 * or lose.
 *
 * Banked EXP is spent on a permanent, per-champion *skill tree* (see
 * MASTERY_TREES below): one-time upgrades that improve the champion in every
 * future stage. Trees are pure data — adding a node is a data edit here, and
 * the engine reads the aggregated effect generically.
 */

import type { EnemyDef } from './enemies';
import type { HeroWeaponForm } from './playerChampion';
import {
  DEFAULT_BURST_RADIUS,
  effectiveBard,
  effectiveGenerate,
  effectiveShatter,
  effectiveStats,
  withUpgradeChoice,
  type BardDef,
  type ShatterDef,
  type UnitDef,
  type UpgradeEffect,
  type VialMastery,
} from './units';

/** EXP a champion earns for slaying an ordinary enemy (grunt / runner). */
export const EXP_PER_KILL = 1;
/** EXP for slaying a tanky brute — worth more than a regular foe. */
export const EXP_PER_BRUTE = 2;
/** EXP for slaying a level boss — a major prize. */
export const EXP_PER_BOSS = 15;
/**
 * Gold a generator champion (Farmer) must produce to earn 1 mastery EXP.
 * Farmers don't kill, so they earn mastery from the wealth they generate.
 */
export const GOLD_PER_EXP = 5;
/** EXP every team champion earns per wave of a stage they win (deployed or not). */
export const STAGE_CLEAR_EXP_PER_WAVE = 5;

/** Mastery EXP each team champion earns for winning a stage of `waves` waves. */
export function stageClearExp(waves: number): number {
  return waves * STAGE_CLEAR_EXP_PER_WAVE;
}

/**
 * Mastery EXP a champion earns for killing a given enemy. Bosses are worth the
 * most, then brutes; every other enemy grants the base amount.
 *
 * Brutes are recognised by the catalog's `*_brute` id convention (see
 * domain/enemies) — the tanky archetype in each section.
 */
export function expForKill(enemy: EnemyDef): number {
  if (enemy.boss) return EXP_PER_BOSS;
  if (enemy.id.endsWith('_brute')) return EXP_PER_BRUTE;
  return EXP_PER_KILL;
}

// --- Skill tree -------------------------------------------------------------

/**
 * A permanent mastery upgrade, bought once with a champion's EXP and applied
 * in every future stage. Effects are multiplicative modifiers (1.1 = +10%).
 * New effect fields are added here and read by the engine as they arrive.
 */
export interface MasteryUpgradeDef {
  id: string;
  name: string;
  description: string;
  /** EXP cost to learn this node. */
  cost: number;
  /**
   * Id of a node that must be learned first. Omit for a node that branches
   * straight from the champion. Chaining `requires` makes a linear tree. A list
   * means any one of them will do (the Plague Doctor's three Potency paths all
   * lead to The Grand Formula); read it through `masteryRequires`.
   */
  requires?: string | string[];
  /**
   * Marks a standout "major" node — a capstone or defining effect rather than a
   * small stat bump. Purely cosmetic: the tree renders it with a golden outline
   * so it feels special.
   */
  major?: boolean;
  /**
   * Marks this node as one of a mutually-exclusive set: nodes sharing an
   * `exclusiveGroup` id may all be *learned*, but only one may be *active* at a
   * time. Learning a second member does not disable the first — the player
   * chooses which is active from the skill-tree menu, and only the active one's
   * effects apply. Omit for an ordinary always-on node.
   */
  exclusiveGroup?: string;
  /** Multiplier on gold generated per harvest (generator champions). */
  generateMult?: number;
  /**
   * Extra gold the stage starts with. A passive team bonus: it applies while
   * the champion is on the team, without needing to be deployed.
   */
  startingGoldBonus?: number;
  /** Additive critical-hit chance (0–1) for this champion's attacks. */
  critChanceBonus?: number;
  /** Overrides the champion's crit damage multiplier (e.g. 2 = 2× on crit). */
  critMultiplier?: number;
  /**
   * Additive crit chance (0–1) on hits against a bleeding foe (the Bandit's
   * Blood in the Water). Read through `masteryCritChanceVsBleeding`.
   */
  critChanceVsBleeding?: number;
  /** Multiplier on the champion's damage (e.g. 1.1 = +10%). */
  damageMult?: number;
  /** Multiplier on the champion's attack speed (e.g. 1.1 = +10%). */
  attackSpeedMult?: number;
  /** Multiplier on the champion's attack range (e.g. 1.05 = +5%). */
  rangeMult?: number;
  /**
   * Bonus damage per adjacent allied champion of the same type on the board
   * (e.g. 0.15 = +15% damage for each neighbour in one of the 8 surrounding
   * tiles). A dynamic, position-based aura recomputed as towers are placed and
   * sold — not a fixed deploy-time multiplier.
   */
  adjacentDamageMult?: number;
  /**
   * Range aura: multiplier granted to the attack range of every *ranged* allied
   * champion standing within this champion's own attack range (e.g. 1.1 = +10%
   * reach). A dynamic, position-based aura recomputed as towers are placed and
   * sold — not a fixed deploy-time multiplier. The emitter never buffs itself,
   * and the buff does not stack when several emitters overlap. See the Wizard's
   * Guiding Gale.
   */
  rangeAuraMult?: number;
  /**
   * Flat gold discount on one specific in-stage upgrade's cost. `tier` is
   * 1-based (its position in the unit's `upgrades`); `amount` is subtracted from
   * that tier's gold price. Read through `masteryUpgradeCost` so the engine's
   * charge and every price display stay in agreement. See the Wizard's Magical
   * Bargaining.
   */
  upgradeDiscount?: { tier: number; amount: number };
  /**
   * Distance in pixels each hit shoves an enemy back along its path (0 / omitted
   * = none). Applied by the engine in `damageEnemy`, so it fires for every one
   * of the champion's attack shapes. See the Wizard's Gale Force.
   */
  knockback?: number;
  /** If set, every Nth attack is a "throw" with `throwRangeMult` reach. */
  throwEvery?: number;
  /** Range multiplier applied to the throw attack (see `throwEvery`). */
  throwRangeMult?: number;
  /**
   * Max spare shots the champion may crank up while idle (no target in range),
   * one per attack interval, then loose in quick succession when a foe arrives
   * (e.g. the Crossbow's Quick Loader). Omit for no preloading.
   */
  preloadShots?: number;
  /**
   * Overrides the damage fraction each of a bouncing projectile's leaps deals
   * (the Elf's magic arrow) — e.g. 0.5 makes every bounce hit for 50% of the
   * original instead of the default. Applied to the normal leaps; highest wins if
   * several nodes set it. Omit for a node that doesn't touch bounce damage.
   */
  bounceDamageMult?: number;
  /**
   * Appends one extra leap to the end of a bouncing projectile's chain (the Elf's
   * magic arrow), always struck last and dealing this fraction of the original
   * hit — independent of `bounceDamageMult`, which governs the normal leaps.
   * Highest wins if several nodes set it. Omit for a node that adds no final leap.
   */
  finalBounceDamageMult?: number;
  /**
   * Additive bonus to a Bard's attack-speed buff multiplier (e.g. 0.05 turns a
   * 1.2× tune into 1.25×). Read through `masteryBard`.
   */
  bardSpeedBonus?: number;
  /** Extra seconds a Bard's tune lasts on each ally. Read through `masteryBard`. */
  bardDurationBonus?: number;
  /**
   * Multiplier on the wave-clear EXP a Hero pools to auto-level in a stage (e.g.
   * 1.1 = +10%). Read through `masteryHeroExpMult`.
   */
  heroExpMult?: number;
  /**
   * Unlocks the armor system (domain/armor) for the player’s adventurer:
   * until a node with this flag is learned, armor neither drops nor applies and
   * the journal shows the slots locked. Read through `masteryUnlocksArmor`.
   */
  unlocksArmor?: boolean;
  /**
   * Every Nth attack is a Cross Slash (the Blade adventurer): both short swords
   * cross in a single X cut for `crossSlashMult`× damage instead of the usual two
   * half-damage cuts. Read through `masteryCrossSlash`.
   */
  crossSlashEvery?: number;
  /** Damage multiplier of the Cross Slash (see `crossSlashEvery`). */
  crossSlashMult?: number;
  /**
   * Overrides how many arrows a burst shooter (the Bow adventurer's shortbow)
   * looses per volley — e.g. 5 for Fivefold Volley. Has no effect on a champion
   * that doesn't fire in bursts. Read through `masteryBurst`.
   */
  burstShots?: number;
  /**
   * Multiplier on the blast radius of a champion's circle attack (the Magic
   * adventurer's orb) — e.g. 1.3 = a 30% wider blast. Read through
   * `masteryBurstRadius`.
   */
  burstRadiusMult?: number;
  /**
   * Turns the Magic adventurer's orb into the Greater Orb: the hero leaps up,
   * gathers a huge orb above their head and hurls it down. Changes only the cast
   * (its longer wind-up, the leap and throw-down animation, the bigger orb); the
   * node's stat trade-off rides on its own `damageMult` / `attackSpeedMult` /
   * `burstRadiusMult`. Read through `masteryGreaterOrb`.
   */
  greaterOrb?: boolean;
  /**
   * Re-arms the player champion with a different weapon (the Blade adventurer's
   * Claymore, the Bow adventurer's Longbow, the Magic adventurer's Staff). The champion's whole def is rebuilt for the form — its attack,
   * stats, in-stage levels, ability and sprite — by `syncPlayerChampions`, so
   * every surface picks it up through `getUnit`. Read through `masteryWeaponForm`.
   */
  weaponForm?: HeroWeaponForm;
  /**
   * Overrides the slow fraction of an ice champion's chill (`UnitDef.special`;
   * the Frost Witch's Deep Freeze, 0.45 = 45% slower). Highest wins. Read
   * through `masteryChill`.
   */
  chillSlow?: number;
  /** Extra seconds an ice champion's chill lasts (Lingering Rime). Read through `masteryChill`. */
  chillDurationBonus?: number;
  /**
   * Her hits no longer chill at all (the Frost Witch's Shatterfrost). Ice Storm,
   * an in-stage upgrade, still slows. Read through `masteryChill`.
   */
  noChill?: boolean;
  /**
   * Icebreak: the champion's hit on a foe that is already slowed (or already
   * Brittle) makes it Brittle for `brittleDuration` s, taking `brittleMult`×
   * damage from every source meanwhile. Read through `masteryBrittle`.
   */
  brittleMult?: number;
  /** Seconds Brittle lasts (see `brittleMult`). */
  brittleDuration?: number;
  /**
   * Overrides the damage fraction each ice shard deals of the missile's hit
   * (the Frost Witch's Splintering Cold). Highest wins. Read through
   * `masteryShatter`.
   */
  shardDamageMult?: number;
  /**
   * Shatter Storm: a shard that kills bursts again from the fallen foe into a
   * ring of smaller splinters (as many as the missile's shards), each dealing
   * this fraction of the killing shard's damage. Splinters never burst again.
   * Highest wins. Read through `masteryShardSplit`.
   */
  shardSplitMult?: number;
  /**
   * Gold off every level of every vial (the Plague Doctor's Careful Measure).
   * Read through `masteryVialDiscount`; prices through `vialLevelCost`.
   */
  vialDiscount?: number;
  /**
   * Makes a vial's signature effect this much more potent (1.25 = +25%): its
   * poison, else its bleed, else its impact damage (see `potentVial`). Applies to
   * the vial numbered `vialPotencyVial` (1-based), or to every vial when that is
   * omitted. Highest wins per vial, so a 1.5 path replaces a general 1.25.
   * Read through `masteryVialPotency`.
   */
  vialPotency?: number;
  /** Which vial (1-based) `vialPotency` applies to; omitted = every vial. */
  vialPotencyVial?: number;
  /**
   * The Grand Formula: after a full round of his vials the thrower adds one more
   * that carries all of their effects at once (see `grandFormulaEffect`). Read
   * through `masteryGrandFormula`.
   */
  grandFormula?: boolean;
  /**
   * Immune to every disabling effect a foe lays on champions (see
   * `CHAMPION_DEBUFFS`; the Plague Doctor's Self Inoculation). Read through
   * `masteryDisableImmune`.
   */
  disableImmune?: boolean;
  /**
   * Chance (0–1) allied champions within this champion's range resist a
   * disabling effect (the Plague Doctor's Warding Fumes). The emitter itself is
   * not covered, and overlapping fields don't stack: the highest wins. Read
   * through `masteryDisableResistAura`.
   */
  disableResistAura?: number;
  /**
   * Each disabling effect this champion resists hastens it: attack speed ×this
   * for `resistHasteDuration` s (the Plague Doctor's Toxic Resilience). A fresh
   * resist restarts the clock. Read through `masteryResistHaste`.
   */
  resistHasteMult?: number;
  /** Seconds the haste lasts (see `resistHasteMult`). */
  resistHasteDuration?: number;
}

/**
 * Per-champion skill trees, keyed by unit id. A champion with no entry simply
 * has no tree yet. Nodes are listed in the order they should appear.
 */
export const MASTERY_TREES: Record<string, MasteryUpgradeDef[]> = {
  archer: [
    {
      id: 'keen_eye_1',
      name: 'Keen Eye I',
      description: 'A steadier aim finds the gaps - +7.5% critical hit chance.',
      cost: 100,
      critChanceBonus: 0.075,
    },
    {
      id: 'keen_eye_2',
      name: 'Keen Eye II',
      description: 'Years at the range sharpen the eye further - +7.5% critical hit chance.',
      cost: 100,
      requires: 'keen_eye_1',
      critChanceBonus: 0.075,
    },
    {
      id: 'deadly_precision',
      name: 'Deadly Precision',
      description:
        'Every arrow seeks a weak point - critical hits now strike for 2× damage instead of 1.5×.',
      cost: 250,
      requires: 'keen_eye_2',
      major: true,
      critMultiplier: 2,
    },
  ],
  crossbow: [
    {
      id: 'hardened_bolts',
      name: 'Hardened Bolts',
      description: 'Case-hardened bolt tips punch a little deeper - +5% damage.',
      cost: 100,
      damageMult: 1.05,
    },
    {
      id: 'extended_prod',
      name: 'Extended Prod',
      description: 'A longer, stiffer prod flings each bolt farther - +10% attack range.',
      cost: 100,
      requires: 'hardened_bolts',
      rangeMult: 1.1,
    },
    {
      id: 'quick_loader',
      name: 'Quick Loader',
      description:
        'Idle hands crank a spare bolt onto the string - while no foe is in reach, the crossbow preloads one extra shot and looses it in quick succession the moment a target arrives.',
      cost: 250,
      requires: 'extended_prod',
      major: true,
      preloadShots: 1,
    },
  ],
  spearman: [
    {
      id: 'long_reach',
      name: 'Long Reach',
      description: 'A lengthened haft extends the thrust - +5% attack range.',
      cost: 100,
      rangeMult: 1.05,
    },
    {
      id: 'honed_tips',
      name: 'Honed Tips',
      description: 'A sharpened point bites deeper - +10% damage.',
      cost: 100,
      requires: 'long_reach',
      damageMult: 1.1,
    },
    {
      id: 'javelin_toss',
      name: 'Javelin Toss',
      description:
        'Every fourth strike he hurls his spear like a javelin - this attack reaches 2× as far.',
      cost: 250,
      requires: 'honed_tips',
      major: true,
      throwEvery: 4,
      throwRangeMult: 2,
    },
  ],
  swordsman: [
    {
      id: 'swift_strikes',
      name: 'Swift Strikes',
      description: 'A lighter blade and a looser wrist quicken every cut - +10% attack speed.',
      cost: 100,
      attackSpeedMult: 1.1,
    },
    {
      id: 'longer_swords',
      name: 'Longer Swords',
      description: 'Newly forged swords have slightly more reach - +10% attack range.',
      cost: 100,
      requires: 'swift_strikes',
      rangeMult: 1.1,
    },
    {
      id: 'better_morale',
      name: 'Better Morale',
      description:
        'Emboldened by comrades at his side - +15% damage for every allied swordsman standing in an adjacent tile.',
      cost: 250,
      requires: 'longer_swords',
      major: true,
      adjacentDamageMult: 0.15,
    },
  ],
  wizard: [
    {
      id: 'sensory_magic',
      name: 'Sensory Magic',
      description: 'Attuned senses stretch his reach - +5% attack range.',
      cost: 125,
      rangeMult: 1.05,
    },
    {
      id: 'condensed_mana',
      name: 'Condensed Mana',
      description: 'Denser mana packs a harder punch - +5% damage.',
      cost: 125,
      requires: 'sensory_magic',
      damageMult: 1.05,
    },
    {
      id: 'guiding_gale',
      name: 'Guiding Gale',
      description:
        'He calls up a following wind that carries projectiles farther - ranged allies within the Wizard’s range gain +10% attack range.',
      cost: 300,
      requires: 'condensed_mana',
      major: true,
      rangeAuraMult: 1.1,
    },
    {
      id: 'magical_bargaining',
      name: 'Magical Bargaining',
      description:
        'A silver tongue and a whisper of enchantment - the Tome of Secrets upgrade costs 🪙20 less gold.',
      cost: 250,
      requires: 'guiding_gale',
      upgradeDiscount: { tier: 2, amount: 20 },
    },
    {
      id: 'gale_force',
      name: 'Gale Force',
      description:
        'His gusts hit like a battering wind - every strike shoves the enemy a short step back down the path.',
      cost: 500,
      requires: 'magical_bargaining',
      major: true,
      knockback: 14,
    },
  ],
  elf: [
    {
      id: 'keen_instinct',
      name: 'Keen Instinct',
      description: 'A wild, woodland eye for the weak spot - +7.5% critical hit chance.',
      cost: 125,
      critChanceBonus: 0.075,
    },
    {
      id: 'greenwood_might',
      name: 'Greenwood Might',
      description: 'The greenwood lends its strength to every draw - +5% damage.',
      cost: 125,
      requires: 'keen_instinct',
      damageMult: 1.05,
    },
    {
      id: 'resonant_enchantment',
      name: 'Resonant Enchantment',
      description:
        'The bounce enchantment rings truer - each arrow’s leap now strikes for 50%.',
      cost: 300,
      requires: 'greenwood_might',
      major: true,
      bounceDamageMult: 0.5,
    },
    {
      id: 'keen_instinct_2',
      name: 'Keen Instinct II',
      description: 'Her wild eye grows keener still - +7.5% critical hit chance.',
      cost: 250,
      requires: 'resonant_enchantment',
      critChanceBonus: 0.075,
    },
    {
      id: 'parting_shot',
      name: 'Parting Shot',
      description:
        'The spell holds one last spark - after all other leaps, the arrow ricochets a final time to one more nearby foe, striking for 25% of the original hit.',
      cost: 500,
      requires: 'keen_instinct_2',
      major: true,
      finalBounceDamageMult: 0.25,
    },
  ],
  farmer: [
    {
      id: 'better_soil',
      name: 'Better Soil',
      description:
        'Richer earth yields 20% more gold from every harvest.',
      cost: 250,
      major: true,
      exclusiveGroup: 'farming',
      generateMult: 1.2,
    },
    {
      id: 'fresh_food',
      name: 'Fresh Food',
      description:
        'Well-fed troops march sooner - start every stage with 🪙50 more gold while this champion is on your team.',
      cost: 250,
      major: true,
      exclusiveGroup: 'farming',
      startingGoldBonus: 50,
    },
  ],
  bard: [
    {
      id: 'lively_tempo',
      name: 'Lively Tempo',
      description: 'A brisker beat stirs the blood - his tune grants +5% more attack speed.',
      cost: 100,
      bardSpeedBonus: 0.05,
    },
    {
      id: 'carrying_voice',
      name: 'Carrying Voice',
      description: 'He sings out from the chest, reaching allies further afield - +10% range.',
      cost: 100,
      requires: 'lively_tempo',
      rangeMult: 1.1,
    },
    {
      id: 'lingering_melody',
      name: 'Lingering Melody',
      description: 'The refrain echoes long after the last chord - his tune lasts 2 seconds longer.',
      cost: 250,
      requires: 'carrying_voice',
      major: true,
      bardDurationBonus: 2,
    },
  ],
  // The player's Blade adventurer. Keyed by the stable path id (not the player's
  // name), so mastery survives a name / portrait change like any champion's.
  'player-blade': [
    {
      id: 'dual_discipline',
      name: 'Honed will',
      description: 'Strengthen your resolve, increasing damage dealt - +10% damage.',
      cost: 100,
      damageMult: 1.1,
    },
    {
      id: 'battle_lessons',
      name: 'Hero’s instinct',
      description: 'Grow stronger from every encounter - +10% instage Exp Earned.',
      cost: 100,
      requires: 'dual_discipline',
      heroExpMult: 1.1,
    },
    {
      id: 'perfect_balance',
      name: 'Ironclad',
      description:
        'Unlocks armor - won from endless bosses.',
      cost: 250,
      requires: 'battle_lessons',
      major: true,
      unlocksArmor: true,
    },
    // Two rival fighting styles after Ironclad: both may be learned, but only
    // the chosen one is active.
    {
      id: 'cross_slash',
      name: 'Cross Slash',
      description:
        'Your two blades learn to strike as one, unleashing a devastating X-shaped slash every third attack.',
      cost: 500,
      requires: 'perfect_balance',
      major: true,
      exclusiveGroup: 'blade_style',
      crossSlashEvery: 3,
      crossSlashMult: 2.2,
    },
    {
      id: 'claymore',
      name: 'Claymore',
      description:
        'Abandon speed for raw power. Wield a massive claymore capable of crushing multiple foes with a single strike.',
      cost: 500,
      requires: 'perfect_balance',
      major: true,
      exclusiveGroup: 'blade_style',
      weaponForm: 'claymore',
    },
  ],
  // The player's Bow adventurer. Keyed by the stable path id like the Blade tree.
  'player-bow': [
    {
      id: 'keen_sight',
      name: 'Honed will',
      description: 'Strengthen your resolve, increasing damage dealt. - +10% damage.',
      cost: 100,
      damageMult: 1.1,
    },
    {
      id: 'hunters_instinct',
      name: 'Hero’s Instinct',
      description: 'Grow stronger from every encounter. - +10% instage Exp Earned.',
      cost: 100,
      requires: 'keen_sight',
      heroExpMult: 1.1,
    },
    {
      id: 'eagle_eye',
      name: 'Ironclad',
      description:
        'Unlocks armor - won from endless bosses.',
      cost: 250,
      requires: 'hunters_instinct',
      major: true,
      unlocksArmor: true,
    },
    // Two rival archery styles after Ironclad: both may be learned, but only
    // the chosen one is active.
    {
      id: 'fivefold_volley',
      name: 'Fourfold Volley',
      description:
        'Add another arrow to each burst, raining down four shots instead of three.',
      cost: 500,
      requires: 'eagle_eye',
      major: true,
      exclusiveGroup: 'bow_style',
      burstShots: 4,
    },
    {
      id: 'longbow',
      name: 'Longbow',
      description:
        'Abandon rapid volleys for a powerful longbow, gaining exceptional range and striking foes from afar.',
      cost: 500,
      requires: 'eagle_eye',
      major: true,
      exclusiveGroup: 'bow_style',
      weaponForm: 'longbow',
    },
  ],
  // The player's Magic adventurer. Keyed by the stable path id like the others.
  'player-magic': [
    {
      id: 'focused_will',
      name: 'Honed will',
      description: 'Strengthen your resolve, increasing damage dealt. - +10% damage.',
      cost: 100,
      damageMult: 1.1,
    },
    {
      id: 'arcane_study',
      name: 'Hero’s instinct',
      description: 'Grow stronger from every encounter. - +10% instage Exp Earned.',
      cost: 100,
      requires: 'focused_will',
      heroExpMult: 1.1,
    },
    {
      id: 'arcane_mastery',
      name: 'Ironclad',
      description:
        'Unlocks armor - won from endless bosses.',
      cost: 250,
      requires: 'arcane_study',
      major: true,
      unlocksArmor: true,
    },
    // Two rival casting styles after Ironclad: both may be learned, but only the
    // chosen one is active.
    {
      id: 'greater_orb',
      name: 'Greater Orb',
      description:
        'Embrace the raw power of your mana, creating larger and more devastating blasts.',
      cost: 500,
      requires: 'arcane_mastery',
      major: true,
      exclusiveGroup: 'magic_style',
      greaterOrb: true,
      damageMult: 1.7,
      attackSpeedMult: 0.6,
      burstRadiusMult: 1.3,
    },
    {
      id: 'arcane_staff',
      name: 'Arcane Staff',
      description:
        'Take up the staff and transform your magic into precise, guided projectiles seeking up to three enemies.',
      cost: 500,
      requires: 'arcane_mastery',
      major: true,
      exclusiveGroup: 'magic_style',
      weaponForm: 'staff',
    },
  ],
  frostWitch: [
    {
      id: 'permafrost',
      name: 'Permafrost',
      description: 'The cold settles deeper into every needle making them deal 10% more damage.',
      cost: 150,
      damageMult: 1.1,
    },
    {
      id: 'glacial_sight',
      name: 'Glacial Sight',
      description: 'Her gaze finds enemies through frost and distance, extending her range by 10%.',
      cost: 150,
      requires: 'permafrost',
      rangeMult: 1.1,
    },
    {
      id: 'deep_freeze',
      name: 'Deep Freeze',
      description: 'Her magic draws out the bitter heart of the winter, slowing enemies by 45%.',
      cost: 400,
      requires: 'glacial_sight',
      major: true,
      exclusiveGroup: 'frost_witch_mode',
      chillSlow: 0.45,
    },
    {
      id: 'shatterfrost',
      name: 'Shatterfrost',
      description: "Forsaking winter's lingering grip, her needles form into brutal shards that deal 80% more damage, but no longer slow their victims.",
      cost: 400,
      requires: 'glacial_sight',
      major: true,
      exclusiveGroup: 'frost_witch_mode',
      damageMult: 1.8,
      noChill: true,
    },
    {
      id: 'lingering_rime',
      name: 'Lingering Rime',
      description: 'The frost clings a little longer to every victim, making the slow last 0.5s longer.',
      cost: 250,
      requires: 'deep_freeze',
      chillDurationBonus: 0.5,
    },
    {
      id: 'icebreak',
      name: 'Icebreak',
      description: 'Striking an already-slowed enemy cracks its frozen guard, making it Brittle. Her hits on a Brittle enemy reset its Brittle timer.',
      cost: 750,
      requires: 'lingering_rime',
      major: true,
      brittleMult: 1.25,
      brittleDuration: 3,
    },
    {
      id: 'splintering_cold',
      name: 'Splintering Cold',
      description: "The shattering needles carry more force making each shard deal 50% of the needle's damage instead of 40%.",
      cost: 250,
      requires: 'shatterfrost',
      shardDamageMult: 0.5,
    },
    {
      id: 'shatter_storm',
      name: 'Shatter Storm',
      description: 'Each shard that kills an enemy fractures again, bursting from the fallen foe into a ring of smaller splinters that deal 75% of its damage.',
      cost: 750,
      requires: 'splintering_cold',
      major: true,
      shardSplitMult: 0.75,
    },
  ],
  bandit: [
    {
      id: 'exploit_weakness_1',
      name: 'Exploit Weakness I',
      description: 'Critical strikes find the softest spot, dealing 50% more Critical Damage.',
      cost: 100,
      critMultiplier: 2,
    },
    {
      id: 'exploit_weakness_2',
      name: 'Exploit Weakness II',
      description: 'Years of ruthless instinct turn every opening into a devastating blow dealing 50% more Critical Damage.',
      cost: 100,
      requires: 'exploit_weakness_1',
      critMultiplier: 2.5,
    },
    {
      id: 'blood_in_the_water',
      name: 'Blood in the Water',
      description: 'The scent of blood reveals every weakness. Gain +15% Critical Chance against bleeding enemies.',
      cost: 250,
      requires: 'exploit_weakness_2',
      major: true,
      critChanceVsBleeding: 0.15,
    },
  ],
  plague_doctor: [
    {
      id: 'extended_delivery',
      name: 'Extended Delivery',
      description: 'A practised throw carries each vial 10% farther.',
      cost: 150,
      rangeMult: 1.1,
    },
    {
      id: 'careful_measure',
      name: 'Careful Measure',
      description: 'Careful measurements reduce the gold cost of each Verdant Venom, Ruin Tonic, and Sanguine Solvent upgrade from 20 to 18.',
      cost: 150,
      requires: 'extended_delivery',
      vialDiscount: 2,
    },
    {
      id: 'refined_reagents',
      name: 'Refined Reagents',
      description: 'Refined reagents strengthen your concoctions making each effect 25% more potent.',
      cost: 400,
      requires: 'careful_measure',
      major: true,
      exclusiveGroup: 'plague_doctor_mode',
      vialPotency: 1.25,
    },
    {
      id: 'self_inoculation',
      name: 'Self Inoculation',
      description: 'Years of controlled exposure have rendered the Plague Doctor immune to all disabling effects.',
      cost: 400,
      requires: 'careful_measure',
      major: true,
      exclusiveGroup: 'plague_doctor_mode',
      disableImmune: true,
    },
    {
      id: 'verdant_distillation',
      name: 'Verdant Distillation',
      description: 'A more concentrated venom makes the poison of Verdant Venom 50% more potent instead of 25%.',
      cost: 150,
      requires: 'refined_reagents',
      exclusiveGroup: 'plague_doctor_potency',
      vialPotency: 1.5,
      vialPotencyVial: 1,
    },
    {
      id: 'ruinous_refinement',
      name: 'Ruinous Refinement',
      description: 'A harsher tonic makes the striking pain of Ruin Tonic 50% more potent instead of 25%.',
      cost: 150,
      requires: 'refined_reagents',
      exclusiveGroup: 'plague_doctor_potency',
      vialPotency: 1.5,
      vialPotencyVial: 2,
    },
    {
      id: 'sanguine_extraction',
      name: 'Sanguine Extraction',
      description: 'A more vicious solvent opens bigger wounds, making the bleed of Sanguine Solvent 50% more potent instead of 25%.',
      cost: 150,
      requires: 'refined_reagents',
      exclusiveGroup: 'plague_doctor_potency',
      vialPotency: 1.5,
      vialPotencyVial: 3,
    },
    {
      id: 'warding_fumes',
      name: 'Warding Fumes',
      description: 'Protective fumes give nearby allies a 25% chance to resist disabling effects.',
      cost: 250,
      requires: 'self_inoculation',
      disableResistAura: 0.25,
    },
    {
      id: 'the_grand_formula',
      name: 'The Grand Formula',
      description: 'After throwing each of his three remedies, the Plague Doctor prepares a fourth vial containing all of their effects.',
      cost: 750,
      requires: ['verdant_distillation', 'ruinous_refinement', 'sanguine_extraction'],
      major: true,
      grandFormula: true,
    },
    {
      id: 'toxic_resilience',
      name: 'Toxic Resilience',
      description: 'Each resisted disabling effect invigorates the Doctor, granting 100% attack speed for 6 seconds.',
      cost: 750,
      requires: 'warding_fumes',
      major: true,
      resistHasteMult: 2,
      resistHasteDuration: 6,
    },
  ],
};

/** The skill tree for a champion (empty if it has none). */
export function masteryTree(unitId: string): MasteryUpgradeDef[] {
  return MASTERY_TREES[unitId] ?? [];
}

/** Whether a champion’s learned nodes include one that unlocks armor. */
export function masteryUnlocksArmor(unitId: string, purchased: readonly string[]): boolean {
  return masteryTree(unitId).some((n) => n.unlocksArmor && purchased.includes(n.id));
}

/** The node that unlocks armor in a champion’s tree, if it has one. */
export function armorUnlockNode(unitId: string): MasteryUpgradeDef | undefined {
  return masteryTree(unitId).find((n) => n.unlocksArmor);
}

/** Look up a single skill-tree node by champion + upgrade id. */
export function getMasteryUpgrade(
  unitId: string,
  upgradeId: string,
): MasteryUpgradeDef | undefined {
  return masteryTree(unitId).find((u) => u.id === upgradeId);
}

/** A node's prerequisites as a list (any one of them unlocks it; empty for a root node). */
export function masteryRequires(node: Pick<MasteryUpgradeDef, 'requires'>): string[] {
  const r = node.requires;
  return r == null ? [] : typeof r === 'string' ? [r] : r;
}

/**
 * Whether a node's prerequisite (if any) has been purchased, so it is eligible
 * to buy. A node with no `requires` is always unlocked; one with several needs
 * any one of them.
 */
export function isMasteryUpgradeUnlocked(
  unitId: string,
  upgradeId: string,
  purchased: readonly string[],
): boolean {
  const def = getMasteryUpgrade(unitId, upgradeId);
  if (!def) return false;
  const req = masteryRequires(def);
  return req.length === 0 || req.some((id) => purchased.includes(id));
}

/**
 * The subset of a champion's *learned* nodes whose effects are actually live.
 * A node outside any exclusive group is always live; for each exclusive group,
 * only one learned member is live — the one named in `active`, falling back to
 * the first learned member of the group when `active` names none. A node is
 * only live while its prerequisite is, so everything learned after a
 * swapped-out member goes dark with it. Feed the result to the engine and every
 * stat display so a swapped-out path stops contributing (see `exclusiveGroup`).
 */
export function activeMasteryUpgrades(
  unitId: string,
  purchased: readonly string[],
  active: readonly string[],
): string[] {
  // group id -> the learned member currently chosen as live
  const chosen = new Map<string, string>();
  for (const node of masteryTree(unitId)) {
    if (!node.exclusiveGroup || !purchased.includes(node.id)) continue;
    if (active.includes(node.id)) {
      chosen.set(node.exclusiveGroup, node.id); // explicit choice always wins
    } else if (!chosen.has(node.exclusiveGroup)) {
      chosen.set(node.exclusiveGroup, node.id); // fallback: first learned member
    }
  }
  const live = (id: string, depth = 0): boolean => {
    const def = getMasteryUpgrade(unitId, id);
    if (!def) return true;
    if (def.exclusiveGroup && chosen.get(def.exclusiveGroup) !== id) return false;
    const req = masteryRequires(def);
    // Guard against a malformed `requires` loop. With several prerequisites,
    // any one learned and live keeps it lit.
    return (
      req.length === 0 ||
      depth > 32 ||
      req.some((r) => (req.length === 1 || purchased.includes(r)) && live(r, depth + 1))
    );
  };
  return purchased.filter((id) => live(id));
}

/** Total EXP already committed to the given purchased upgrade ids. */
export function masterySpent(
  unitId: string,
  purchased: readonly string[],
): number {
  return masteryTree(unitId)
    .filter((u) => purchased.includes(u.id))
    .reduce((sum, u) => sum + u.cost, 0);
}

/**
 * Effective gold cost of an in-stage upgrade after any permanent mastery
 * discounts (e.g. the Wizard's Magical Bargaining). `tier` is 1-based (the
 * upgrade's position in `unit.upgrades`). The engine's charge, the in-stage
 * upgrade button, and the champion sheet all read this so the shown and charged
 * prices agree. Never drops below 0. For a fork tier, `choice` picks which of
 * its `choices` to price.
 */
export function masteryUpgradeCost(
  unit: UnitDef,
  tier: number,
  purchased: readonly string[],
  choice?: number,
): number {
  const fork = unit.upgrades[tier - 1];
  const up = choice != null && fork?.choices ? fork.choices[choice] : fork;
  if (!up) return 0;
  let discount = 0;
  for (const u of masteryTree(unit.id)) {
    if (u.upgradeDiscount?.tier === tier && purchased.includes(u.id)) {
      discount += u.upgradeDiscount.amount;
    }
  }
  return Math.max(0, up.cost - discount);
}

/**
 * Combined multiplier on gold generation from all purchased skill-tree nodes
 * for a champion (1 = no bonus). Multipliers stack multiplicatively.
 */
export function masteryGenerateMult(
  unitId: string,
  purchased: readonly string[],
): number {
  let mult = 1;
  for (const u of masteryTree(unitId)) {
    if (u.generateMult && purchased.includes(u.id)) mult *= u.generateMult;
  }
  return mult;
}

/**
 * Gold produced per harvest after a generator's purchased mastery bonuses,
 * rounded to a whole coin. `baseAmount` is the harvest before mastery (e.g.
 * from `effectiveGenerate`). The engine and every yield display share this so
 * the numbers always match. Returns 0 for non-generators (baseAmount 0).
 */
export function masteryHarvest(
  baseAmount: number,
  unitId: string,
  purchased: readonly string[],
): number {
  if (baseAmount === 0) return 0;
  return Math.round(baseAmount * masteryGenerateMult(unitId, purchased));
}

/**
 * Extra gold-per-harvest an in-stage upgrade actually adds once mastery bonuses
 * are applied — the difference between the harvested amounts before and after
 * the tier. `tier` is 1-based (the upgrade's position in `unit.upgrades`). This
 * keeps the "+N gold/harvest" label consistent with the boosted harvest total.
 */
export function masteryGenerateDelta(
  unit: UnitDef,
  tier: number,
  purchased: readonly string[],
): number {
  return (
    masteryHarvest(effectiveGenerate(unit, tier), unit.id, purchased) -
    masteryHarvest(effectiveGenerate(unit, tier - 1), unit.id, purchased)
  );
}

/**
 * Total bonus starting gold a stage begins with, from `startingGoldBonus`
 * skill-tree nodes. This is a passive *team* bonus: only champions currently on
 * `team` contribute, and only for upgrades they have purchased. Champions do
 * not need to be deployed for it to apply.
 */
export function masteryStartingGoldBonus(
  team: readonly string[],
  masteryUpgrades: Record<string, string[]>,
): number {
  let bonus = 0;
  for (const unitId of team) {
    const purchased = masteryUpgrades[unitId] ?? [];
    for (const u of masteryTree(unitId)) {
      if (u.startingGoldBonus && purchased.includes(u.id)) {
        bonus += u.startingGoldBonus;
      }
    }
  }
  return bonus;
}

/** Combined additive crit-chance bonus from a champion's purchased nodes. */
export function masteryCritChanceBonus(
  unitId: string,
  purchased: readonly string[],
): number {
  let bonus = 0;
  for (const u of masteryTree(unitId)) {
    if (u.critChanceBonus && purchased.includes(u.id)) bonus += u.critChanceBonus;
  }
  return bonus;
}

/**
 * Extra crit chance a champion's purchased nodes grant on hits against a
 * bleeding foe (Blood in the Water), added on top of `critChanceFor`.
 */
export function masteryCritChanceVsBleeding(
  unitId: string,
  purchased: readonly string[],
): number {
  let bonus = 0;
  for (const u of masteryTree(unitId)) {
    if (u.critChanceVsBleeding && purchased.includes(u.id)) bonus += u.critChanceVsBleeding;
  }
  return bonus;
}

/**
 * The crit damage multiplier a champion's purchased nodes grant, or undefined
 * if none override it (so the caller falls back to the global default). If
 * several override it, the largest wins.
 */
export function masteryCritMultiplier(
  unitId: string,
  purchased: readonly string[],
): number | undefined {
  let mult: number | undefined;
  for (const u of masteryTree(unitId)) {
    if (u.critMultiplier && purchased.includes(u.id)) {
      mult = mult === undefined ? u.critMultiplier : Math.max(mult, u.critMultiplier);
    }
  }
  return mult;
}

/** Combined multiplier on a Hero's in-stage level-up EXP from purchased nodes (1 = none). */
export function masteryHeroExpMult(
  unitId: string,
  purchased: readonly string[],
): number {
  let mult = 1;
  for (const u of masteryTree(unitId)) {
    if (u.heroExpMult && purchased.includes(u.id)) mult *= u.heroExpMult;
  }
  return mult;
}

/** Combined multiplier on a champion's damage from purchased nodes (1 = none). */
export function masteryDamageMult(
  unitId: string,
  purchased: readonly string[],
): number {
  let mult = 1;
  for (const u of masteryTree(unitId)) {
    if (u.damageMult && purchased.includes(u.id)) mult *= u.damageMult;
  }
  return mult;
}

/** Combined multiplier on a champion's attack speed from purchased nodes (1 = none). */
export function masteryAttackSpeedMult(
  unitId: string,
  purchased: readonly string[],
): number {
  let mult = 1;
  for (const u of masteryTree(unitId)) {
    if (u.attackSpeedMult && purchased.includes(u.id)) mult *= u.attackSpeedMult;
  }
  return mult;
}

/**
 * Bonus damage granted per adjacent allied champion of the same type, from
 * purchased nodes (0 = none). Highest wins if several apply. The engine folds
 * this into a tower's damage based on how many allies sit in the 8 surrounding
 * tiles (see `adjacentDamageMult`).
 */
export function masteryAdjacentDamageMult(
  unitId: string,
  purchased: readonly string[],
): number {
  let bonus = 0;
  for (const u of masteryTree(unitId)) {
    if (u.adjacentDamageMult && purchased.includes(u.id)) {
      bonus = Math.max(bonus, u.adjacentDamageMult);
    }
  }
  return bonus;
}

/**
 * The range-aura multiplier a champion emits to nearby ranged allies, from
 * purchased nodes (1 = no aura). Highest wins if several apply. The engine
 * projects this over allied towers within the emitter's range (see
 * `rangeAuraMult`); like the adjacency aura it lives only in the engine because
 * it depends on live board positions, not deploy-time stats.
 */
export function masteryRangeAura(
  unitId: string,
  purchased: readonly string[],
): number {
  let mult = 1;
  for (const u of masteryTree(unitId)) {
    if (u.rangeAuraMult && purchased.includes(u.id)) {
      mult = Math.max(mult, u.rangeAuraMult);
    }
  }
  return mult;
}

/** Combined multiplier on a champion's attack range from purchased nodes. */
export function masteryRangeMult(
  unitId: string,
  purchased: readonly string[],
): number {
  let mult = 1;
  for (const u of masteryTree(unitId)) {
    if (u.rangeMult && purchased.includes(u.id)) mult *= u.rangeMult;
  }
  return mult;
}

export interface MasteryStats {
  damage: number;
  attackSpeed: number;
  range: number;
}

/**
 * Effective combat stats at in-stage upgrade `tier`, with permanent mastery
 * multipliers applied and rounded to whole numbers. This is the single source
 * of truth the engine (deployed tower stats) and the UI (stat rows, upgrade
 * deltas, placement preview) both read, so every surface agrees.
 */
export function masteryStats(
  unit: UnitDef,
  tier: number,
  purchased: readonly string[],
): MasteryStats {
  const s = effectiveStats(unit, tier);
  // Worn equipment (the player's armor) multiplies on top of mastery.
  const gear = unit.gearBonus;
  return {
    damage: Math.round(s.damage * masteryDamageMult(unit.id, purchased) * (gear?.damageMult ?? 1)),
    attackSpeed: s.attackSpeed * masteryAttackSpeedMult(unit.id, purchased) * (gear?.attackSpeedMult ?? 1),
    range: Math.round(s.range * masteryRangeMult(unit.id, purchased) * (gear?.rangeMult ?? 1)),
  };
}

/**
 * The stat gains an in-stage upgrade actually adds once mastery is applied —
 * the difference between the mastery-adjusted stats before and after the tier
 * (`tier` is 1-based). Feed the result to `upgradeEffectLabel` so displayed
 * "+N DMG / +M Range / +K gold" reflect the champion's permanent bonuses.
 * Generic across all stats, so new champions never re-hit this problem.
 */
export function masteryUpgradeDeltas(
  unit: UnitDef,
  tier: number,
  purchased: readonly string[],
): UpgradeEffect {
  const cur = masteryStats(unit, tier, purchased);
  const prev = masteryStats(unit, tier - 1, purchased);
  return {
    damage: cur.damage - prev.damage,
    attackSpeed: cur.attackSpeed - prev.attackSpeed,
    range: cur.range - prev.range,
    generate: masteryGenerateDelta(unit, tier, purchased),
    // Bounces aren't mastery-scaled, so pass this tier's own delta straight through.
    bounces: unit.upgrades[tier - 1]?.bounces,
  };
}

/**
 * Everything an in-stage upgrade adds, ready for `upgradeEffectLabel`: the
 * mastery-adjusted stat deltas plus the tier's own non-scaled effects (Bard
 * tune, magic pen, shatter, Ice Storm, ability). For a fork tier, `choice`
 * picks which option to describe. The champion sheet and the in-stage panel
 * both read this so their labels agree.
 */
export function masteryUpgradeEffect(
  unit: UnitDef,
  tier: number,
  purchased: readonly string[],
  choice?: number,
): UpgradeEffect {
  const resolved = choice != null ? withUpgradeChoice(unit, tier, choice) : unit;
  const up = resolved.upgrades[tier - 1];
  return {
    ...masteryUpgradeDeltas(resolved, tier, purchased),
    setAoe: up?.setAoe,
    coneAngle: resolved.coneAngle,
    bardTargets: up?.bardTargets,
    bardSpeedBonus: up?.bardSpeedBonus,
    magicPen: up?.magicPen,
    shatterCount: up?.shatterCount,
    shatterReach: up?.shatterReach,
    iceStorm: up?.iceStorm,
    ability: up?.ability?.name,
  };
}

/**
 * A Bard's performance at in-stage upgrade `tier` with permanent mastery bonuses
 * (tempo, duration) folded in — the single source the engine and every Bard
 * stat display read. Null for a non-Bard unit.
 */
export function masteryBard(
  unit: UnitDef,
  tier: number,
  purchased: readonly string[],
): BardDef | null {
  const b = effectiveBard(unit, tier);
  if (!b) return null;
  for (const u of masteryTree(unit.id)) {
    if (!purchased.includes(u.id)) continue;
    b.attackSpeedMult += u.bardSpeedBonus ?? 0;
    b.duration += u.bardDurationBonus ?? 0;
  }
  // Round away float drift (1.2 + 0.15 + 0.05) so buff comparisons stay exact.
  b.attackSpeedMult = Math.round(b.attackSpeedMult * 1000) / 1000;
  return b;
}

/**
 * The champion's "throw" attack from purchased nodes — every `every` attacks
 * reaches `rangeMult`× as far — or undefined if none is purchased.
 */
export function masteryThrow(
  unitId: string,
  purchased: readonly string[],
): { every: number; rangeMult: number } | undefined {
  for (const u of masteryTree(unitId)) {
    if (u.throwEvery && purchased.includes(u.id)) {
      return { every: u.throwEvery, rangeMult: u.throwRangeMult ?? 1 };
    }
  }
  return undefined;
}

/**
 * The champion's Cross Slash from purchased nodes — every `every` attacks is one
 * X cut for `damageMult`× damage — or undefined if none is purchased.
 */
export function masteryCrossSlash(
  unitId: string,
  purchased: readonly string[],
): { every: number; damageMult: number } | undefined {
  for (const u of masteryTree(unitId)) {
    if (u.crossSlashEvery && purchased.includes(u.id)) {
      return { every: u.crossSlashEvery, damageMult: u.crossSlashMult ?? 1 };
    }
  }
  return undefined;
}

/**
 * Arrows a champion looses per burst volley, with any purchased override (the
 * Bow's Fivefold Volley) applied — 1 for a champion that doesn't fire in bursts.
 * The engine and every DPS / volley display read this.
 */
export function masteryBurst(unit: UnitDef, purchased: readonly string[]): number {
  const base = Math.max(1, unit.burst ?? 1);
  if (base <= 1) return 1;
  return Math.max(base, masteryBurstShots(unit.id, purchased) ?? base);
}

/**
 * The volley size a champion's purchased nodes set (the Bow's Fourfold Volley),
 * or undefined when none do. Highest wins. Prefer `masteryBurst`, which applies
 * it to the unit's own burst; this unit-free form lets the player champion's
 * def builder word its description before the def exists.
 */
export function masteryBurstShots(unitId: string, purchased: readonly string[]): number | undefined {
  let shots: number | undefined;
  for (const u of masteryTree(unitId)) {
    if (u.burstShots && purchased.includes(u.id)) shots = Math.max(shots ?? 0, u.burstShots);
  }
  return shots;
}

/**
 * Blast radius (px) of a champion's circle attack (the Magic adventurer's orb)
 * with any purchased widening applied (the Greater Orb), rounded to a whole
 * pixel. The engine's detonation, the on-board blast preview and every radius
 * display read this.
 */
export function masteryBurstRadius(unit: UnitDef, purchased: readonly string[]): number {
  let mult = 1;
  for (const u of masteryTree(unit.id)) {
    if (u.burstRadiusMult && purchased.includes(u.id)) mult *= u.burstRadiusMult;
  }
  return Math.round((unit.burstRadius ?? DEFAULT_BURST_RADIUS) * mult);
}

/** Whether a champion's purchased nodes turn its orb into the Greater Orb. */
export function masteryGreaterOrb(unitId: string, purchased: readonly string[]): boolean {
  return masteryTree(unitId).some((u) => u.greaterOrb && purchased.includes(u.id));
}

/** The weapon form a champion's purchased nodes re-arm it with, if any. */
export function masteryWeaponForm(
  unitId: string,
  purchased: readonly string[],
): HeroWeaponForm | undefined {
  return masteryTree(unitId).find((u) => u.weaponForm && purchased.includes(u.id))?.weaponForm;
}

/**
 * Max spare shots a champion can preload while idle, from purchased nodes
 * (0 = none). Highest wins if several apply.
 */
export function masteryPreload(
  unitId: string,
  purchased: readonly string[],
): number {
  let max = 0;
  for (const u of masteryTree(unitId)) {
    if (u.preloadShots && purchased.includes(u.id)) {
      max = Math.max(max, u.preloadShots);
    }
  }
  return max;
}

/**
 * Pixels each of a champion's hits knocks an enemy back along its path, from
 * purchased nodes (0 = none). Highest wins if several apply. See the Wizard's
 * Gale Force.
 */
export function masteryKnockback(
  unitId: string,
  purchased: readonly string[],
): number {
  let max = 0;
  for (const u of masteryTree(unitId)) {
    if (u.knockback && purchased.includes(u.id)) {
      max = Math.max(max, u.knockback);
    }
  }
  return max;
}

/**
 * The damage fraction each leap of a bouncing projectile deals, overridden by a
 * champion's purchased nodes (the Elf's Resonant Enchantment), or 0 when none
 * apply — in which case the engine falls back to its default per-leap fractions.
 * Highest override wins if several apply.
 */
export function masteryBounceDamageMult(
  unitId: string,
  purchased: readonly string[],
): number {
  let mult = 0;
  for (const u of masteryTree(unitId)) {
    if (u.bounceDamageMult && purchased.includes(u.id)) {
      mult = Math.max(mult, u.bounceDamageMult);
    }
  }
  return mult;
}

/**
 * The damage fraction of the extra final leap a champion's purchased nodes append
 * to a bouncing chain (the Elf's Parting Shot), or 0 when none apply. A value > 0
 * means one additional leap is struck last for that fraction of the original hit.
 * Highest wins if several apply.
 */
export function masteryFinalBounceDamageMult(
  unitId: string,
  purchased: readonly string[],
): number {
  let mult = 0;
  for (const u of masteryTree(unitId)) {
    if (u.finalBounceDamageMult && purchased.includes(u.id)) {
      mult = Math.max(mult, u.finalBounceDamageMult);
    }
  }
  return mult;
}

/**
 * The chill an ice champion's hits lay (the Frost Witch's slow: speed ×
 * (1 − `slow`) for `duration` s), with purchased nodes applied — Deep Freeze's
 * stronger slow, Lingering Rime's longer one — or null when it doesn't chill
 * (no `special.slow`, or Shatterfrost). The engine and every slow display read this.
 */
export function masteryChill(
  unit: UnitDef,
  purchased: readonly string[],
): { slow: number; duration: number } | null {
  let slow = unit.special?.slow ?? 0;
  let duration = unit.special?.slowDuration ?? 0;
  for (const u of masteryTree(unit.id)) {
    if (!purchased.includes(u.id)) continue;
    if (u.noChill) return null;
    if (u.chillSlow) slow = Math.max(slow, u.chillSlow);
    duration += u.chillDurationBonus ?? 0;
  }
  return slow > 0 && duration > 0 ? { slow: Math.min(1, slow), duration } : null;
}

/**
 * A shattering champion's shatter after the first `tier` in-stage upgrades
 * (`effectiveShatter`), with a purchased shard-damage override (Splintering
 * Cold) applied. Null if it doesn't shatter. The engine and every shatter
 * display read this.
 */
export function masteryShatter(
  unit: UnitDef,
  tier: number,
  purchased: readonly string[],
): ShatterDef | null {
  const s = effectiveShatter(unit, tier);
  if (!s) return null;
  for (const u of masteryTree(unit.id)) {
    if (u.shardDamageMult && purchased.includes(u.id)) s.damageMult = Math.max(s.damageMult, u.shardDamageMult);
  }
  return s;
}

/**
 * The Brittle a champion's purchased nodes let its hits inflict (Icebreak):
 * `mult`× damage taken for `duration` s. Undefined when none do.
 */
export function masteryBrittle(
  unitId: string,
  purchased: readonly string[],
): { mult: number; duration: number } | undefined {
  for (const u of masteryTree(unitId)) {
    if (u.brittleMult && u.brittleDuration && purchased.includes(u.id)) {
      return { mult: u.brittleMult, duration: u.brittleDuration };
    }
  }
  return undefined;
}

/**
 * The damage fraction of the splinters a killing shard bursts into (Shatter
 * Storm), or 0 when no purchased node grants them. Highest wins.
 */
export function masteryShardSplit(unitId: string, purchased: readonly string[]): number {
  let mult = 0;
  for (const u of masteryTree(unitId)) {
    if (u.shardSplitMult && purchased.includes(u.id)) mult = Math.max(mult, u.shardSplitMult);
  }
  return mult;
}

/** Gold off every vial level from a champion's purchased nodes (Careful Measure); 0 = none. */
export function masteryVialDiscount(unitId: string, purchased: readonly string[]): number {
  let discount = 0;
  for (const u of masteryTree(unitId)) {
    if (u.vialDiscount && purchased.includes(u.id)) discount += u.vialDiscount;
  }
  return discount;
}

/**
 * Potency multiplier per vial (index-matched to `unit.vials`) from purchased
 * nodes: the highest `vialPotency` covering each vial (Refined Reagents covers
 * every vial, a Potency path its own one). 1 = base.
 */
export function masteryVialPotency(unit: UnitDef, purchased: readonly string[]): number[] {
  const potency = (unit.vials ?? []).map(() => 1);
  for (const u of masteryTree(unit.id)) {
    if (!u.vialPotency || !purchased.includes(u.id)) continue;
    potency.forEach((p, i) => {
      if (u.vialPotencyVial == null || u.vialPotencyVial === i + 1) potency[i] = Math.max(p, u.vialPotency!);
    });
  }
  return potency;
}

/** Whether a champion's purchased nodes add The Grand Formula to its vial cycle. */
export function masteryGrandFormula(unitId: string, purchased: readonly string[]): boolean {
  return masteryTree(unitId).some((u) => u.grandFormula && purchased.includes(u.id));
}

/**
 * A vial thrower's whole mastery tuning (potency, The Grand Formula, level
 * discount) in one go — what the engine stores on the tower and every vial
 * display passes to `vialCycle` / `vialDamageFactor` / `vialLevelCost`.
 */
export function masteryVials(unit: UnitDef, purchased: readonly string[]): VialMastery {
  return {
    potency: masteryVialPotency(unit, purchased),
    formula: masteryGrandFormula(unit.id, purchased),
    discount: masteryVialDiscount(unit.id, purchased),
  };
}

/** Whether a champion's purchased nodes make it immune to disabling effects (Self Inoculation). */
export function masteryDisableImmune(unitId: string, purchased: readonly string[]): boolean {
  return masteryTree(unitId).some((u) => u.disableImmune && purchased.includes(u.id));
}

/**
 * The resist chance a champion's purchased nodes grant allies within its range
 * against disabling effects (Warding Fumes); 0 = none. Highest wins.
 */
export function masteryDisableResistAura(unitId: string, purchased: readonly string[]): number {
  let chance = 0;
  for (const u of masteryTree(unitId)) {
    if (u.disableResistAura && purchased.includes(u.id)) chance = Math.max(chance, u.disableResistAura);
  }
  return Math.min(1, chance);
}

/**
 * The haste a champion gains each time it resists a disabling effect (Toxic
 * Resilience): attack speed ×`mult` for `duration` s. Undefined when none.
 */
export function masteryResistHaste(
  unitId: string,
  purchased: readonly string[],
): { mult: number; duration: number } | undefined {
  for (const u of masteryTree(unitId)) {
    if (u.resistHasteMult && u.resistHasteDuration && purchased.includes(u.id)) {
      return { mult: u.resistHasteMult, duration: u.resistHasteDuration };
    }
  }
  return undefined;
}

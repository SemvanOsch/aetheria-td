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
import {
  effectiveGenerate,
  effectiveStats,
  type UnitDef,
  type UpgradeEffect,
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
export const GOLD_PER_EXP = 10;

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
   * straight from the champion. Chaining `requires` makes a linear tree.
   */
  requires?: string;
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
      description: 'A steadier aim finds the gaps — +7.5% critical hit chance.',
      cost: 100,
      critChanceBonus: 0.075,
    },
    {
      id: 'keen_eye_2',
      name: 'Keen Eye II',
      description: 'Years at the range sharpen the eye further — +7.5% critical hit chance.',
      cost: 100,
      requires: 'keen_eye_1',
      critChanceBonus: 0.075,
    },
    {
      id: 'deadly_precision',
      name: 'Deadly Precision',
      description:
        'Every arrow seeks a weak point — critical hits now strike for 2× damage instead of 1.5×.',
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
      description: 'Case-hardened bolt tips punch a little deeper — +5% damage.',
      cost: 100,
      damageMult: 1.05,
    },
    {
      id: 'extended_prod',
      name: 'Extended Prod',
      description: 'A longer, stiffer prod flings each bolt farther — +10% attack range.',
      cost: 100,
      requires: 'hardened_bolts',
      rangeMult: 1.1,
    },
    {
      id: 'quick_loader',
      name: 'Quick Loader',
      description:
        'Idle hands crank a spare bolt onto the string — while no foe is in reach, the crossbow preloads one extra shot and looses it in quick succession the moment a target arrives.',
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
      description: 'A lengthened haft extends the thrust — +5% attack range.',
      cost: 100,
      rangeMult: 1.05,
    },
    {
      id: 'honed_tips',
      name: 'Honed Tips',
      description: 'A cruelly sharpened point bites deeper — +10% damage.',
      cost: 100,
      requires: 'long_reach',
      damageMult: 1.1,
    },
    {
      id: 'javelin_toss',
      name: 'Javelin Toss',
      description:
        'Every fourth strike he hurls his spear like a javelin — this attack reaches 2× as far.',
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
      description: 'A lighter blade and a looser wrist quicken every cut — +10% attack speed.',
      cost: 100,
      attackSpeedMult: 1.1,
    },
    {
      id: 'longer_swords',
      name: 'Longer Swords',
      description: 'Newly forged swords have slightly more reach — +10% attack range.',
      cost: 100,
      requires: 'swift_strikes',
      rangeMult: 1.1,
    },
    {
      id: 'better_morale',
      name: 'Better Morale',
      description:
        'Emboldened by comrades at his side — +15% damage for every allied swordsman standing in an adjacent tile.',
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
      description: 'Attuned senses stretch his reach — +5% attack range.',
      cost: 125,
      rangeMult: 1.05,
    },
    {
      id: 'condensed_mana',
      name: 'Condensed Mana',
      description: 'Denser mana packs a harder punch — +5% damage.',
      cost: 125,
      requires: 'sensory_magic',
      damageMult: 1.05,
    },
    {
      id: 'guiding_gale',
      name: 'Guiding Gale',
      description:
        'He calls up a following wind that carries every arrow and bolt farther — ranged allies within the Wizard’s range gain +10% attack range.',
      cost: 300,
      requires: 'condensed_mana',
      major: true,
      rangeAuraMult: 1.1,
    },
    {
      id: 'magical_bargaining',
      name: 'Magical Bargaining',
      description:
        'A silver tongue and a whisper of enchantment — the Tome of Secrets upgrade costs 🪙20 less gold.',
      cost: 250,
      requires: 'guiding_gale',
      upgradeDiscount: { tier: 2, amount: 20 },
    },
    {
      id: 'gale_force',
      name: 'Gale Force',
      description:
        'His gusts hit like a battering wind — every strike shoves the enemy a short step back down the path.',
      cost: 500,
      requires: 'magical_bargaining',
      major: true,
      knockback: 14,
    },
  ],
  farmer: [
    {
      id: 'better_soil',
      name: 'Better Soil',
      description:
        'Richer earth yields 10% more gold from every harvest. Only one farming path can be active at a time — swap freely once both are learned.',
      cost: 100,
      major: true,
      exclusiveGroup: 'farming',
      generateMult: 1.1,
    },
    {
      id: 'fresh_food',
      name: 'Fresh Food',
      description:
        'Well-fed troops march sooner — start every stage with 🪙50 more gold while this champion is on your team. Only one farming path can be active at a time — swap freely once both are learned.',
      cost: 100,
      major: true,
      exclusiveGroup: 'farming',
      startingGoldBonus: 50,
    },
  ],
};

/** The skill tree for a champion (empty if it has none). */
export function masteryTree(unitId: string): MasteryUpgradeDef[] {
  return MASTERY_TREES[unitId] ?? [];
}

/** Look up a single skill-tree node by champion + upgrade id. */
export function getMasteryUpgrade(
  unitId: string,
  upgradeId: string,
): MasteryUpgradeDef | undefined {
  return masteryTree(unitId).find((u) => u.id === upgradeId);
}

/**
 * Whether a node's prerequisite (if any) has been purchased, so it is eligible
 * to buy. A node with no `requires` is always unlocked.
 */
export function isMasteryUpgradeUnlocked(
  unitId: string,
  upgradeId: string,
  purchased: readonly string[],
): boolean {
  const def = getMasteryUpgrade(unitId, upgradeId);
  if (!def) return false;
  return !def.requires || purchased.includes(def.requires);
}

/**
 * The subset of a champion's *learned* nodes whose effects are actually live.
 * A node outside any exclusive group is always live; for each exclusive group,
 * only one learned member is live — the one named in `active`, falling back to
 * the first learned member of the group when `active` names none. Feed the
 * result to the engine and every stat display so a swapped-out path stops
 * contributing (see `exclusiveGroup`).
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
  return purchased.filter((id) => {
    const def = getMasteryUpgrade(unitId, id);
    if (!def?.exclusiveGroup) return true;
    return chosen.get(def.exclusiveGroup) === id;
  });
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
 * prices agree. Never drops below 0.
 */
export function masteryUpgradeCost(
  unit: UnitDef,
  tier: number,
  purchased: readonly string[],
): number {
  const up = unit.upgrades[tier - 1];
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
  return {
    damage: Math.round(s.damage * masteryDamageMult(unit.id, purchased)),
    attackSpeed: s.attackSpeed * masteryAttackSpeedMult(unit.id, purchased),
    range: Math.round(s.range * masteryRangeMult(unit.id, purchased)),
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
  };
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

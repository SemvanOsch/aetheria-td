import {
  attackShapeLabel,
  damageTypeLabel,
  formatAttackSpeed,
  BLEED_DURATION,
  POISON_DURATION,
  rangeLabel,
  effectiveVial,
  potentVial,
  vialEffectLabel,
  type UnitDef,
  type VialDef,
} from '../domain/units';
import {
  masteryBounceDamageMult,
  masteryBurst,
  masteryCrossSlash,
  masteryFinalBounceDamageMult,
  masteryGenerateMult,
  masteryHarvest,
  masteryBard,
  masteryChill,
  masteryCritChanceVsBleeding,
  masteryShardSplit,
  masteryShatter,
  masteryStats,
  masteryVials,
} from '../domain/mastery';
import { critChanceFor, critMultiplierFor } from '../domain/combat';
import { CHAMPION_DEBUFFS } from '../domain/championDebuffs';
import { BOUNCE_DAMAGE_MULTS } from '../engine/GameEngine';
import type { IconName } from './components/Icon';

/** A hover explanation for a stat tile or keyword (see `Hint`). */
export interface StatHint {
  text: string;
  title: string;
  icon: IconName;
  accent: string;
}

/** One labelled figure of a champion's battle profile. */
export interface StatTile {
  label: string;
  value: string;
  sub?: string;
  /** Shown on hover where the tile is drawn with a `Hint`. */
  hint?: StatHint;
}

/** Bleed's red, shared by its tile, its keyword and its tip. */
export const BLEED_ACCENT = '#e0455a';

/**
 * What a bleeding champion's wounds do, in one line: the one text both its
 * Bleed tile and the highlighted "bleed" in its description show on hover.
 * Null for a champion whose hits don't bleed.
 */
export function bleedHint(unit: UnitDef): StatHint | null {
  // A vial thrower bleeds through its vial (the Plague Doctor's Sanguine Solvent).
  const mult = unit.bleed?.damageMult ?? unit.vials?.find((v) => v.bleed)?.bleed;
  if (!mult) return null;
  return {
    title: 'Bleed',
    icon: 'blood',
    accent: BLEED_ACCENT,
    text: `Deals ${pct(mult)} of this champion's damage over ${BLEED_DURATION} seconds.`,
  };
}

/** Poison's venom green, shared by its tile, its keyword and its tip. */
export const POISON_ACCENT = '#8fd14f';

/**
 * What a poisoning champion's hits do, in one line: the text both its Poison
 * tile and the highlighted "poison" in its description show on hover. Null
 * for a champion whose hits don't poison.
 */
export function poisonHint(unit: UnitDef): StatHint | null {
  // A vial thrower poisons through its vial (the Plague Doctor's Verdant Venom).
  const vial = unit.poison ? undefined : unit.vials?.find((v) => v.poison);
  const fraction = unit.poison?.maxHealthFraction ?? vial?.poison;
  if (!fraction) return null;
  return {
    title: 'Poison',
    icon: 'poison',
    accent: POISON_ACCENT,
    text: `Deals ${pct(fraction)} of the enemy's max health over ${POISON_DURATION} seconds.`,
  };
}

/** "5%", "12.5%", "20%" — trims trailing zeros. */
const pct = (f: number) => `${+(f * 100).toFixed(2)}%`;

/** The Frost Witch's ice blue, shared by her slow and Brittle tips. */
export const ICE_ACCENT = '#7cc4ff';

/**
 * What an ice champion's chill does, for the highlighted "slow" in its
 * description. Null when its hits don't slow (no chill, or Shatterfrost).
 */
export function slowHint(unit: UnitDef, purchased: readonly string[]): StatHint | null {
  const chill = masteryChill(unit, purchased);
  if (!chill) return null;
  return {
    title: 'Slow',
    icon: 'snowflake',
    accent: ICE_ACCENT,
    text: `Enemies hit move ${pct(chill.slow)} slower for ${chill.duration} seconds.`,
  };
}

/** What Brittle does, for the highlighted "Brittle" in Icebreak's description. */
export function brittleHint(brittle: { mult: number; duration: number }): StatHint {
  return {
    title: 'Brittle',
    icon: 'crack',
    accent: ICE_ACCENT,
    text: `Takes ${pct(brittle.mult - 1)} more damage from every source for ${brittle.duration} seconds.`,
  };
}

/**
 * What counts as a disabling effect (the debuffs foes lay on champions, see
 * `CHAMPION_DEBUFFS`), for the highlighted words in a resisting node's text.
 */
export function disableHint(): StatHint {
  return {
    title: 'Disabling effects',
    icon: 'shield',
    accent: CHAMPION_DEBUFFS.sludged.color,
    text: `Debuffs foes lay on champions.`,
  };
}

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th". */
export const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** A champion's role word: Economy, Support, or its attack shape. */
export function championRole(unit: UnitDef): string {
  return unit.generator ? 'Economy' : unit.bard ? 'Support' : attackShapeLabel(unit);
}

/**
 * One vial of a thrower's cycle as a stat tile: its headline value at base
 * level (poison, else bleed, else impact damage), with what it does and how far
 * its in-stage levels take it on hover, with any mastery `potency`.
 */
function vialTile(v: VialDef, potency = 1): StatTile {
  const base = potentVial(effectiveVial(v, 0), potency);
  const [value, sub] = base.poison
    ? [pct(base.poison), 'max HP poison']
    : base.bleed
      ? [pct(base.bleed), 'of damage as bleed']
      : [pct(base.damageMult), base.ignoreResist ? 'damage, ignores resist' : 'damage'];
  return {
    label: v.name,
    value,
    sub,
    hint: {
      title: v.name,
      icon: base.poison ? 'poison' : base.bleed ? 'blood' : 'crack',
      accent: v.color,
      text: `${v.description} ${vialEffectLabel(base)}.`,
    },
  };
}

/**
 * A champion's battle profile with its permanent mastery bonuses applied — the
 * one list both the champion detail sheet and the journal's Champions pages
 * show, so the two never disagree.
 */
export function championStatTiles(unit: UnitDef, purchased: string[]): StatTile[] {
  // Combat stats with permanent mastery multipliers and worn armor applied.
  const { damage, attackSpeed, range } = masteryStats(unit, 0, purchased);
  // Per-arrow DPS; a burst shooter (the Bow adventurer) shows the volley size as
  // an "×N" beside it rather than folding it into the number (with any mastery
  // override, e.g. Fivefold Volley).
  const burst = masteryBurst(unit, purchased);
  const dps = damage * attackSpeed;
  const vialMastery = masteryVials(unit, purchased);
  // Generator yields with permanent mastery bonuses (e.g. Better Soil) applied.
  const harvest = unit.generator ? masteryHarvest(unit.generator.amount, unit.id, purchased) : 0;
  const genBoosted = unit.generator != null && masteryGenerateMult(unit.id, purchased) > 1;
  // Bouncing-projectile champions (the Elf): the damage fraction each leap deals,
  // reflecting any mastery override (Resonant Enchantment) or the engine default.
  const bounces = unit.bounces ?? 0;
  const bounceFraction = masteryBounceDamageMult(unit.id, purchased) || BOUNCE_DAMAGE_MULTS[0];
  // An extra, weaker final leap from mastery (the Elf's Parting Shot), if learned.
  const finalBounceFraction = masteryFinalBounceDamageMult(unit.id, purchased);
  // The Blade's periodic X cut, if its Cross Slash node is active (dual blades only).
  const crossSlash = unit.visual.shape === 'player-blade' ? masteryCrossSlash(unit.id, purchased) : undefined;
  // The Frost Witch's needle: shards, chill and the Icebreak / Shatter Storm nodes.
  const shatter = masteryShatter(unit, 0, purchased);
  const chill = masteryChill(unit, purchased);
  const split = shatter ? masteryShardSplit(unit.id, purchased) : 0;
  // The Bandit's Blood in the Water: extra crit on foes his wounds are bleeding.
  const vsBleeding = masteryCritChanceVsBleeding(unit.id, purchased);

  const cost: StatTile = {
    label: 'Cost · Limit',
    value: `${unit.cost > 0 ? unit.cost : 'Free'} · ${unit.deployLimit}`,
    sub: unit.cost > 0 ? 'gold · per stage' : 'per stage',
  };
  if (unit.generator) {
    return [
      { label: 'Harvest', value: `${harvest}`, sub: genBoosted ? 'gold · mastery boosted' : 'gold' },
      { label: 'Harvests', value: `${unit.generator.timesPerWave}×`, sub: 'per wave' },
      { label: 'Gold / wave', value: `${harvest * unit.generator.timesPerWave}` },
      cost,
    ];
  }
  const bard = masteryBard(unit, 0, purchased);
  if (bard) {
    return [
      { label: 'Tempo buff', value: `+${Math.round((bard.attackSpeedMult - 1) * 100)}%`, sub: 'attack speed' },
      { label: 'Allies', value: `${bard.targets}`, sub: 'in range' },
      { label: 'Duration', value: `${bard.duration}s`, sub: `plays every ${bard.every}s` },
      { label: 'Range', value: `${range}`, sub: rangeLabel(range) },
      cost,
    ];
  }
  return [
    { label: 'Damage', value: `${damage}`, sub: unit.damageType ? damageTypeLabel(unit.damageType).toLowerCase() : 'per hit' },
    { label: 'Attack speed', value: `${formatAttackSpeed(attackSpeed)}/s` },
    { label: 'Range', value: `${range}`, sub: rangeLabel(range) },
    // A vial thrower shows its vials instead of one DPS figure (each does something different).
    ...(unit.vials?.length
      ? []
      : [
        {
          label: 'DPS',
          value: `${dps.toFixed(0)}${burst > 1 ? ` ×${burst}` : ''}`,
          sub:
            unit.aoe === 'line'
              ? 'per enemy in line'
              : unit.aoe === 'circle'
                ? 'per enemy in blast'
                : unit.aoe === 'cone'
                  ? 'per enemy in arc'
                  : unit.shatter
                    ? 'missile, before shards'
                    : burst > 1
                      ? unit.visual.shape === 'player-staff'
                        ? `${burst} mana bolts`
                        : `${burst}-arrow burst`
                      : 'per target',
        },
      ]),
    { label: 'Crit rate', value: pct(critChanceFor(unit, purchased)), sub: 'chance per hit' },
    { label: 'Crit damage', value: `+${Math.round((critMultiplierFor(unit, purchased) - 1) * 100)}%`, sub: 'bonus damage' },
    ...(unit.bleed
      ? [{ label: 'Bleed', value: pct(unit.bleed.damageMult), sub: `of each hit, over ${BLEED_DURATION}s`, hint: bleedHint(unit) ?? undefined }]
      : []),
    ...(unit.poison
      ? [{ label: 'Poison', value: pct(unit.poison.maxHealthFraction), sub: `of max health, over ${POISON_DURATION}s`, hint: poisonHint(unit) ?? undefined }]
      : []),
    ...(unit.vials ?? []).map((v, i) => vialTile(v, vialMastery.potency[i] ?? 1)),
    ...(vsBleeding > 0
      ? [{ label: 'Crit vs bleeding', value: `+${pct(vsBleeding)}`, sub: 'chance on bleeding foes' }]
      : []),
    ...(crossSlash
      ? [{ label: 'Cross Slash', value: `${crossSlash.damageMult}×`, sub: `every ${ordinal(crossSlash.every)} attack` }]
      : []),
    ...(bounces > 0
      ? [
        {
          label: 'Bounces',
          value: `${bounces} × ${+(bounceFraction * 100).toFixed(1)}%`,
          sub: finalBounceFraction > 0 ? `final leap ${+(finalBounceFraction * 100).toFixed(1)}%` : 'damage per leap',
        },
      ]
      : []),
    ...(shatter
      ? [{ label: 'Shatter', value: `${shatter.count} × ${pct(shatter.damageMult)}`, sub: 'ice shards per impact' }]
      : []),
    ...(split > 0
      ? [{ label: 'Shatter Storm', value: `${shatter!.count} × ${pct(split)}`, sub: 'splinters per shard kill' }]
      : []),
    ...(chill
      ? [{ label: 'Slow', value: `-${pct(chill.slow)}`, sub: `speed for ${chill.duration}s`, hint: slowHint(unit, purchased) ?? undefined }]
      : []),
    ...(unit.maxMana
      ? [
        {
          label: 'Mana',
          value: `${unit.maxMana}`,
          sub: unit.manaRegen ? `+${+unit.manaRegen.toFixed(2)}/s · refilled by kills` : 'refilled by kills',
        },
      ]
      : []),
    cost,
  ];
}

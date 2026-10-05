import {
  aoeLabel,
  damageTypeLabel,
  formatAttackSpeed,
  rangeLabel,
  type UnitDef,
} from '../domain/units';
import {
  masteryAttackSpeedMult,
  masteryBounceDamageMult,
  masteryFinalBounceDamageMult,
  masteryDamageMult,
  masteryGenerateMult,
  masteryHarvest,
  masteryRangeMult,
  masteryBard,
} from '../domain/mastery';
import { critChanceFor, critMultiplierFor } from '../domain/combat';
import { BOUNCE_DAMAGE_MULTS } from '../engine/GameEngine';

/** One labelled figure of a champion's battle profile. */
export interface StatTile {
  label: string;
  value: string;
  sub?: string;
}

/** "5%", "12.5%", "20%" — trims trailing zeros. */
const pct = (f: number) => `${+(f * 100).toFixed(2)}%`;

/** A champion's role word: Economy, Support, or its attack shape. */
export function championRole(unit: UnitDef): string {
  return unit.generator ? 'Economy' : unit.bard ? 'Support' : aoeLabel(unit.aoe);
}

/**
 * A champion's battle profile with its permanent mastery bonuses applied — the
 * one list both the champion detail sheet and the journal's Champions pages
 * show, so the two never disagree.
 */
export function championStatTiles(unit: UnitDef, purchased: string[]): StatTile[] {
  // Combat stats with permanent mastery multipliers (damage / speed / range).
  const damage = Math.round(unit.damage * masteryDamageMult(unit.id, purchased));
  const attackSpeed = unit.attackSpeed * masteryAttackSpeedMult(unit.id, purchased);
  const range = Math.round(unit.range * masteryRangeMult(unit.id, purchased));
  // Per-arrow DPS; a burst shooter (the Bow adventurer) shows the volley size as
  // an "×N" beside it rather than folding it into the number.
  const burst = unit.burst ?? 1;
  const dps = damage * attackSpeed;
  // Generator yields with permanent mastery bonuses (e.g. Better Soil) applied.
  const harvest = unit.generator ? masteryHarvest(unit.generator.amount, unit.id, purchased) : 0;
  const genBoosted = unit.generator != null && masteryGenerateMult(unit.id, purchased) > 1;
  // Bouncing-projectile champions (the Elf): the damage fraction each leap deals,
  // reflecting any mastery override (Resonant Enchantment) or the engine default.
  const bounces = unit.bounces ?? 0;
  const bounceFraction = masteryBounceDamageMult(unit.id, purchased) || BOUNCE_DAMAGE_MULTS[0];
  // An extra, weaker final leap from mastery (the Elf's Parting Shot), if learned.
  const finalBounceFraction = masteryFinalBounceDamageMult(unit.id, purchased);

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
    {
      label: 'DPS',
      value: `${dps.toFixed(0)}${burst > 1 ? ` ×${burst}` : ''}`,
      sub:
        unit.aoe === 'line'
          ? 'per enemy in line'
          : unit.aoe === 'circle'
            ? 'per enemy in blast'
            : burst > 1
              ? `${burst}-arrow burst`
              : 'per target',
    },
    { label: 'Crit', value: pct(critChanceFor(unit, purchased)), sub: `×${critMultiplierFor(unit, purchased)} damage` },
    ...(bounces > 0
      ? [
        {
          label: 'Bounces',
          value: `${bounces} × ${+(bounceFraction * 100).toFixed(1)}%`,
          sub: finalBounceFraction > 0 ? `final leap ${+(finalBounceFraction * 100).toFixed(1)}%` : 'damage per leap',
        },
      ]
      : []),
    ...(unit.maxMana ? [{ label: 'Mana', value: `${unit.maxMana}`, sub: 'refilled by kills' }] : []),
    cost,
  ];
}

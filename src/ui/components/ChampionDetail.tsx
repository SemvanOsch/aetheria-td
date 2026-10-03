import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  aoeLabel,
  attackTypeLabel,
  damageTypeLabel,
  formatAttackSpeed,
  rangeLabel,
  upgradeEffectLabel,
  type UnitDef,
} from '../../domain/units';
import {
  masteryAttackSpeedMult,
  masteryBounceDamageMult,
  masteryFinalBounceDamageMult,
  masteryDamageMult,
  masteryGenerateMult,
  masteryHarvest,
  masteryRangeMult,
  masteryThrow,
  masteryUpgradeCost,
  masteryUpgradeDeltas,
} from '../../domain/mastery';
import { critChanceFor, critMultiplierFor } from '../../domain/combat';
import { playerChampionPath } from '../../domain/playerChampion';
import { proficiencyDef } from '../../domain/proficiency';
import { BOUNCE_DAMAGE_MULTS } from '../../engine/GameEngine';
import { RARITIES } from '../../domain/rarity';
import { UnitSprite } from './UnitSprite';
import { Icon } from './Icon';

/** "5%", "12.5%", "20%" — trims trailing zeros. */
function critChanceLabel(chance: number): string {
  return `${+(chance * 100).toFixed(2)}%`;
}

const pct = (f: number) => `${+(f * 100).toFixed(1)}%`;

interface Props {
  unit: UnitDef;
  owned: boolean;
  /** EXP still available to spend (earned minus skill-tree purchases). */
  availableExp: number;
  /** Purchased mastery upgrades, so generator yields reflect skill-tree bonuses. */
  purchased: string[];
  /** Open this champion's mastery skill-tree menu. */
  onOpenMastery: () => void;
  onClose: () => void;
}

interface StatTile {
  label: string;
  value: string;
  sub?: string;
}

/**
 * Detailed champion sheet. The left column is the champion itself: a large
 * portrait in its rarity's light, name, tags, lore and the way into its
 * mastery skill tree. The right column is its battle profile as stat tiles,
 * then its in-stage levels, with an ability-granting tier picked out in gold.
 */
export function ChampionDetail({
  unit,
  owned,
  availableExp,
  purchased,
  onOpenMastery,
  onClose,
}: Props) {
  const rarity = RARITIES[unit.rarity];
  const style = { '--rarity': rarity.color } as CSSProperties;
  // Hero champions level up in-stage with wave-clear EXP (auto), not gold.
  const isHero = unit.rarity === 'hero';
  const path = playerChampionPath(unit.id);
  // Combat stats with permanent mastery multipliers (damage / speed / range).
  const damage = Math.round(unit.damage * masteryDamageMult(unit.id, purchased));
  const attackSpeed = unit.attackSpeed * masteryAttackSpeedMult(unit.id, purchased);
  const range = Math.round(unit.range * masteryRangeMult(unit.id, purchased));
  // Per-arrow DPS; a burst shooter (the Bow adventurer) shows the volley size as
  // an "×N" beside it rather than folding it into the number.
  const burst = unit.burst ?? 1;
  const dps = damage * attackSpeed;
  const thrown = masteryThrow(unit.id, purchased);
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
  const tiles: StatTile[] = unit.generator
    ? [
        { label: 'Harvest', value: `${harvest}`, sub: genBoosted ? 'gold · mastery boosted' : 'gold' },
        { label: 'Harvests', value: `${unit.generator.timesPerWave}×`, sub: 'per wave' },
        { label: 'Gold / wave', value: `${harvest * unit.generator.timesPerWave}` },
        cost,
      ]
    : unit.bard
      ? [
          { label: 'Tempo buff', value: `+${Math.round((unit.bard.attackSpeedMult - 1) * 100)}%`, sub: 'attack speed' },
          { label: 'Allies', value: `${unit.bard.targets}`, sub: 'in range' },
          { label: 'Duration', value: `${unit.bard.duration}s`, sub: `plays every ${unit.bard.every}s` },
          { label: 'Range', value: `${range}`, sub: rangeLabel(range) },
          cost,
        ]
      : [
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
          { label: 'Crit', value: critChanceLabel(critChanceFor(unit, purchased)), sub: `×${critMultiplierFor(unit, purchased)} damage` },
          ...(bounces > 0
            ? [
                {
                  label: 'Bounces',
                  value: `${bounces} × ${pct(bounceFraction)}`,
                  sub: finalBounceFraction > 0 ? `final leap ${pct(finalBounceFraction)}` : 'damage per leap',
                },
              ]
            : []),
          ...(unit.maxMana ? [{ label: 'Mana', value: `${unit.maxMana}`, sub: 'refilled by kills' }] : []),
          cost,
        ];

  const role = unit.generator ? 'Economy' : unit.bard ? 'Support' : aoeLabel(unit.aoe);
  const attackLine = [unit.attackType && attackTypeLabel(unit.attackType), role, unit.damageType && damageTypeLabel(unit.damageType)]
    .filter(Boolean)
    .join(' · ');

  const notes: ReactNode[] = [];
  if (unit.aoe === 'line')
    notes.push('Pierces in a straight line to the end of its range, striking every enemy along the way.');
  if (unit.aoe === 'circle') notes.push('A slow-charging orb bursts on impact, striking every enemy in the blast.');
  if (thrown) notes.push(`Every ${thrown.every}th attack is thrown for ${thrown.rangeMult}× range.`);

  const expSource = unit.generator
    ? '1 EXP per 20 gold generated, win or lose.'
    : unit.bard
      ? 'Earned from duplicate summons.'
      : 'Earned from every enemy slain, win or lose.';

  // Portalled to <body> so an ancestor screen's transform can't shrink this
  // fixed overlay below the viewport (which would break scrolling on small screens).
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel ornate modal champion-modal" style={style} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>

        <div className="cd-layout">
          <aside className="cd-id">
            <div className="cd-portrait">
              <UnitSprite unit={unit} size={190} />
            </div>
            <h2 className="cd-name">{unit.name}</h2>
            {path && <div className="cd-title">Hero of the {proficiencyDef(path).label}</div>}
            <div className="rarity-row cd-tags">
              <span className="rarity-tag">{rarity.name}</span>
              <span className={`aoe-tag ${unit.generator || unit.bard ? 'economy' : unit.aoe}`}>{role}</span>
              {unit.attackType && <span className={`aoe-tag ${unit.attackType}`}>{attackTypeLabel(unit.attackType)}</span>}
              {unit.damageType && <span className={`aoe-tag ${unit.damageType}`}>{damageTypeLabel(unit.damageType)}</span>}
            </div>
            <p className="cd-desc">{unit.description}</p>

            {owned ? (
              <button type="button" className="cd-mastery" onClick={onOpenMastery}>
                <span className="cd-mastery-main">
                  <Icon name="tree" /> Skill tree
                  <span className="cd-mastery-exp">
                    <Icon name="sparkle" /> {availableExp.toLocaleString()} EXP
                  </span>
                </span>
                <span className="cd-mastery-sub">{expSource}</span>
              </button>
            ) : (
              <div className="cd-mastery locked">
                <span className="cd-mastery-main">
                  <Icon name="lock" /> Not yet summoned
                </span>
                <span className="cd-mastery-sub">Recruit this champion to start earning mastery EXP.</span>
              </div>
            )}
          </aside>

          <div className="cd-profile">
            <div className="cd-label">Battle profile</div>
            <div className="cd-tiles">
              {tiles.map((t) => (
                <div key={t.label} className="cd-tile">
                  <div className="cd-tile-label">{t.label}</div>
                  <div className="cd-tile-value">{t.value}</div>
                  {t.sub && <div className="cd-tile-sub">{t.sub}</div>}
                </div>
              ))}
            </div>
            <p className="cd-attack">
              <b>Attack:</b> {attackLine}
            </p>
            {notes.map((n, i) => (
              <p key={i} className="cd-note">
                <Icon name="info" /> {n}
              </p>
            ))}

            <div className="cd-label cd-levels-head">
              Levels <span>{isHero ? 'earned with EXP each wave · reset every stage' : 'bought with gold · reset every stage'}</span>
            </div>
            <div className="cd-levels">
              {unit.upgrades.map((u, i) => {
                const effect = upgradeEffectLabel({
                  ...masteryUpgradeDeltas(unit, i + 1, purchased),
                  setAoe: u.setAoe,
                  coneAngle: unit.coneAngle,
                  // Bard tune deltas aren't stat-scaled — pass them straight through.
                  bardTargets: u.bardTargets,
                  bardSpeedBonus: u.bardSpeedBonus,
                });
                return (
                  <div key={i} className={`cd-level${u.ability ? ' ability' : ''}`}>
                    <span className="cd-level-num">{i + 1}</span>
                    <div className="cd-level-body">
                      <div className="cd-level-head">
                        <span className="cd-level-name">{u.name}</span>
                        <span className="cd-level-cost">
                          {isHero ? `${u.cost} EXP` : `${masteryUpgradeCost(unit, i + 1, purchased)} gold`}
                        </span>
                      </div>
                      <div className="cd-level-eff">
                        {effect && <b>{effect}</b>}
                        {effect && u.description ? ' — ' : ''}
                        {u.description}
                      </div>
                      {u.ability && (
                        <div className="cd-ability">
                          <Icon name="sparkle" /> <b>{u.ability.name}:</b> {u.ability.description}
                          <span>
                            {u.ability.manaCost ? ` ${u.ability.manaCost} mana ·` : ''} {u.ability.cooldown}s cooldown
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

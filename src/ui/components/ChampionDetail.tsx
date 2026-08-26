import type { CSSProperties } from 'react';
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
import { BOUNCE_DAMAGE_MULTS } from '../../engine/GameEngine';
import { RARITIES } from '../../domain/rarity';
import { UnitSprite } from './UnitSprite';

/** "5%", "12.5%", "20%" — trims trailing zeros. */
function critChanceLabel(chance: number): string {
  return `${+(chance * 100).toFixed(2)}%`;
}

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

/** Detailed champion sheet: full stats, AoE type, DPS and a mastery entry. */
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
  // Combat stats with permanent mastery multipliers (damage / speed / range).
  const damage = Math.round(unit.damage * masteryDamageMult(unit.id, purchased));
  const attackSpeed = unit.attackSpeed * masteryAttackSpeedMult(unit.id, purchased);
  const range = Math.round(unit.range * masteryRangeMult(unit.id, purchased));
  // Per-arrow DPS; a burst shooter (the Bow adventurer) shows the volley size as
  // an "×N" multiplier beside it rather than folding it into the number.
  const burst = unit.burst ?? 1;
  const dps = damage * attackSpeed;
  const thrown = masteryThrow(unit.id, purchased);
  // Generator yields with permanent mastery bonuses (e.g. Better Soil) applied.
  const harvest = unit.generator
    ? masteryHarvest(unit.generator.amount, unit.id, purchased)
    : 0;
  const genBoosted = unit.generator != null && masteryGenerateMult(unit.id, purchased) > 1;
  // Bouncing-projectile champions (the Elf): the damage fraction each leap deals,
  // reflecting any mastery override (Resonant Enchantment) or the engine default.
  const bounces = unit.bounces ?? 0;
  const bounceFraction =
    masteryBounceDamageMult(unit.id, purchased) || BOUNCE_DAMAGE_MULTS[0];
  // An extra, weaker final leap from mastery (the Elf's Parting Shot), if learned.
  const finalBounceFraction = masteryFinalBounceDamageMult(unit.id, purchased);
  const bounceDamageValue =
    finalBounceFraction > 0
      ? `${+(bounceFraction * 100).toFixed(1)}% (final leap ${+(finalBounceFraction * 100).toFixed(1)}%)`
      : `${+(bounceFraction * 100).toFixed(1)}%`;

  type DetailItem = { divider: true } | { label: string; value: string };
  const rows: DetailItem[] = unit.generator
    ? [
        { label: 'Deploy cost', value: unit.cost > 0 ? `🪙 ${unit.cost}` : 'Free' },
        { label: 'Per-stage limit', value: `${unit.deployLimit}` },
        { divider: true },
        { label: 'Harvest', value: `🪙 ${harvest} gold` },
        { label: 'Harvests per wave', value: `${unit.generator.timesPerWave}×` },
        { label: 'Gold per wave', value: `🪙 ${harvest * unit.generator.timesPerWave}` },
      ]
    : [
        { label: 'Deploy cost', value: unit.cost > 0 ? `🪙 ${unit.cost}` : 'Free' },
        { label: 'Per-stage limit', value: `${unit.deployLimit}` },
        { divider: true },
        { label: 'Damage', value: `${damage} / hit` },
        { label: 'Attack speed', value: `${formatAttackSpeed(attackSpeed)} / s` },
        {
          label: 'DPS',
          value: `${dps.toFixed(0)}${
            burst > 1 ? ` x${burst}` : ''
          }${unit.aoe === 'line' ? ' per enemy in line' : ''}${
            unit.aoe === 'circle' ? ' per enemy in blast' : ''
          }`,
        },
        { label: 'Range', value: `${range}px (${rangeLabel(range)})` },
        { divider: true },
        { label: 'Crit chance', value: critChanceLabel(critChanceFor(unit, purchased)) },
        { label: 'Crit damage', value: `${critMultiplierFor(unit, purchased)}×` },
        ...(bounces > 0
          ? [{ label: 'Bounce damage', value: bounceDamageValue }]
          : []),
      ];

  // Portalled to <body> so an ancestor screen's transform can't shrink this
  // fixed overlay below the viewport (which would break scrolling on small screens).
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="panel modal champion-modal"
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="champion-head">
          <div className="unit-portrait champion-portrait"><UnitSprite unit={unit} size={64} /></div>
          <div>
            <h2 style={{ textAlign: 'left', color: 'var(--text)' }}>{unit.name}</h2>
            <div className="rarity-row" style={{ textAlign: 'left', marginTop: 4 }}>
              <span className="rarity-tag">{rarity.name}</span>
              <span className={`aoe-tag ${unit.generator ? 'economy' : unit.aoe}`}>
                {unit.generator ? 'Economy' : aoeLabel(unit.aoe)}
              </span>
              {unit.attackType && (
                <span className={`aoe-tag ${unit.attackType}`}>
                  {attackTypeLabel(unit.attackType)}
                </span>
              )}
              {unit.damageType && (
                <span className={`aoe-tag ${unit.damageType}`}>
                  {damageTypeLabel(unit.damageType)}
                </span>
              )}
              {owned ? (
                <span className="chip done">✓ Owned</span>
              ) : (
                <span className="chip">Not yet summoned</span>
              )}
            </div>
          </div>
        </div>

        <p className="unit-desc" style={{ minHeight: 0, margin: '4px 0 14px' }}>
          {unit.description}
        </p>

        {owned ? (
          <button
            type="button"
            className="mastery-box as-button"
            onClick={onOpenMastery}
          >
            <div className="mastery-head">
              <span className="mastery-title">⭐ Champion Mastery</span>
              <span className="mastery-exp">{availableExp.toLocaleString()} EXP</span>
            </div>
            <div className="mastery-sub">
              {unit.generator
                ? 'Earned permanently — 1 EXP per 20 gold generated, win or lose.'
                : 'Earned permanently — from every enemy slain, win or lose.'}
            </div>
            <div className="mastery-cta">Open skill tree →</div>
          </button>
        ) : (
          <div className="mastery-box">
            <div className="mastery-head">
              <span className="mastery-title">⭐ Champion Mastery</span>
              <span className="mastery-exp">0 EXP</span>
            </div>
            <div className="mastery-sub">
              {unit.generator
                ? 'Recruit this champion to start earning mastery EXP from the gold it generates.'
                : 'Recruit this champion to start earning mastery EXP from its kills.'}
            </div>
          </div>
        )}

        <div className="detail-grid">
          {rows.map((r, i) =>
            'divider' in r ? (
              <div key={`div-${i}`} className="detail-divider" />
            ) : (
              <div key={r.label} className="detail-row">
                <span>{r.label}</span>
                <b>{r.value}</b>
              </div>
            ),
          )}
        </div>

        {genBoosted && (
          <p className="hint" style={{ marginTop: 10 }}>
            ⭐ Yields shown include this champion's mastery bonuses.
          </p>
        )}

        {thrown && (
          <p className="hint" style={{ marginTop: 10 }}>
            🎯 Every {thrown.every}th attack is thrown for {thrown.rangeMult}× range.
          </p>
        )}

        <div className="upgrade-list">
          <div className="upgrade-list-title">
            In-stage levels{' '}
            <span>
              {isHero
                ? 'earned with EXP each wave, auto-levels, reset each level'
                : 'bought with gold, reset each level'}
            </span>
          </div>
          {unit.upgrades.map((u, i) => (
            <div key={i} className="upgrade-list-row">
              <div className="ul-num">Lv {i + 1}</div>
              <div className="ul-body">
                <div className="ul-name">
                  {u.name}{' '}
                  <span className="ul-cost">
                    {isHero ? `${u.cost} EXP` : `🪙${masteryUpgradeCost(unit, i + 1, purchased)}`}
                  </span>
                </div>
                <div className="ul-eff">
                  {upgradeEffectLabel({
                    ...masteryUpgradeDeltas(unit, i + 1, purchased),
                    setAoe: u.setAoe,
                    coneAngle: unit.coneAngle,
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {unit.aoe === 'line' && (
          <p className="hint" style={{ marginTop: 12 }}>
            🔱 Line AoE — the attack pierces in a straight line to the end of its
            range, striking every enemy caught along the way.
          </p>
        )}

        {unit.aoe === 'circle' && (
          <p className="hint" style={{ marginTop: 12 }}>
            🔮 Circle AoE — a slow-charging orb bursts on impact, striking every
            enemy caught in the blast.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

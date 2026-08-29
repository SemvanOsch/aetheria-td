import type { CSSProperties } from 'react';
import { aoeLabel, formatAttackSpeed, rangeLabel, type UnitDef } from '../../domain/units';
import { masteryHarvest } from '../../domain/mastery';
import { RARITIES } from '../../domain/rarity';
import { UnitSprite } from './UnitSprite';

interface Props {
  unit: UnitDef;
  owned?: boolean;
  selected?: boolean;
  onClick?: () => void;
  showStats?: boolean;
  /** Purchased mastery upgrades, so generator yields reflect skill-tree bonuses. */
  masteryPurchased?: string[];
}

/** Presentational card for a unit. Reads only from the unit definition. */
export function UnitCard({
  unit,
  owned,
  selected,
  onClick,
  showStats = true,
  masteryPurchased = [],
}: Props) {
  const rarity = RARITIES[unit.rarity];
  const style = { '--rarity': rarity.color } as CSSProperties;
  const harvest = unit.generator
    ? masteryHarvest(unit.generator.amount, unit.id, masteryPurchased)
    : 0;

  return (
    <div
      className={[
        'unit-card',
        onClick ? 'selectable' : '',
        selected ? 'selected' : '',
      ].join(' ')}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {owned && <div className="count-badge owned" title="In your collection">✓</div>}
      <div className="unit-portrait"><UnitSprite unit={unit} size={56} /></div>
      <div className="unit-name">{unit.name}</div>
      <div className="rarity-row">
        <span className="rarity-tag">{rarity.name}</span>
        <span className={`aoe-tag ${unit.generator || unit.bard ? 'economy' : unit.aoe}`}>
          {unit.generator ? 'Economy' : unit.bard ? 'Support' : aoeLabel(unit.aoe)}
        </span>
      </div>
      <p className="unit-desc">{unit.description}</p>
      {showStats && (
        <div className="stat-row">
          {unit.generator ? (
            <>
              <div className="s">
                Gold <b>🪙{harvest}</b>
              </div>
              <div className="s">
                Per wave <b>{unit.generator.timesPerWave}×</b>
              </div>
              <div className="s">
                Yield <b>🪙{harvest * unit.generator.timesPerWave}</b>
              </div>
              <div className="s">
                Cost <b>🪙{unit.cost}</b>
              </div>
            </>
          ) : unit.bard ? (
            <>
              <div className="s">
                Buff <b>+{Math.round((unit.bard.attackSpeedMult - 1) * 100)}% SPD</b>
              </div>
              <div className="s">
                Targets <b>{unit.bard.targets}</b>
              </div>
              <div className="s">
                Range <b>{rangeLabel(unit.range)}</b>
              </div>
              <div className="s">
                Cost <b>🪙{unit.cost}</b>
              </div>
            </>
          ) : (
            <>
              <div className="s">
                DMG <b>{unit.damage}</b>
              </div>
              <div className="s">
                SPD <b>{formatAttackSpeed(unit.attackSpeed)}/s</b>
              </div>
              <div className="s">
                Range <b>{rangeLabel(unit.range)}</b>
              </div>
              <div className="s">
                Cost <b>🪙{unit.cost}</b>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

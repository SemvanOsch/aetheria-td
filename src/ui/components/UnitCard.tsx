import type { CSSProperties } from 'react';
import { aoeLabel, formatAttackSpeed, rangeLabel, type UnitDef } from '../../domain/units';
import { masteryBard, masteryHarvest } from '../../domain/mastery';
import { RARITIES } from '../../domain/rarity';
import { UnitSprite } from './UnitSprite';
import { Icon } from './Icon';

const Coin = () => <Icon name="coin" className="stat-coin" />;

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
  const bard = masteryBard(unit, 0, masteryPurchased);
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
      data-rarity={unit.rarity}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {owned && <div className="count-badge owned" title="In your collection"><Icon name="check" /></div>}
      <div className="unit-portrait"><UnitSprite unit={unit} size={84} /></div>
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
                Gold <b><Coin />{harvest}</b>
              </div>
              <div className="s">
                Per wave <b>{unit.generator.timesPerWave}×</b>
              </div>
              <div className="s">
                Yield <b><Coin />{harvest * unit.generator.timesPerWave}</b>
              </div>
              <div className="s">
                Cost <b><Coin />{unit.cost}</b>
              </div>
            </>
          ) : bard ? (
            <>
              <div className="s">
                Buff <b>+{Math.round((bard.attackSpeedMult - 1) * 100)}% SPD</b>
              </div>
              <div className="s">
                Targets <b>{bard.targets}</b>
              </div>
              <div className="s">
                Range <b>{rangeLabel(unit.range)}</b>
              </div>
              <div className="s">
                Cost <b><Coin />{unit.cost}</b>
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
                Cost <b><Coin />{unit.cost}</b>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

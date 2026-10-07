import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { attackTypeLabel, coneAngleDeg, damageTypeLabel, upgradeEffectLabel, type UnitDef } from '../../domain/units';
import {
  masteryBurstRadius,
  masteryGreaterOrb,
  masteryThrow,
  masteryUpgradeCost,
  masteryUpgradeDeltas,
} from '../../domain/mastery';
import { playerChampionPath } from '../../domain/playerChampion';
import { proficiencyDef } from '../../domain/proficiency';
import { RARITIES } from '../../domain/rarity';
import { championRole, championStatTiles } from '../championStats';
import { UnitSprite } from './UnitSprite';
import { Icon } from './Icon';
import { BardSoundToggle } from './BardSoundToggle';

interface Props {
  unit: UnitDef;
  owned: boolean;
  /** EXP still available to spend (earned minus skill-tree purchases). */
  availableExp: number;
  /** Purchased mastery upgrades, so generator yields reflect skill-tree bonuses. */
  purchased: string[];
  /** Open this champion's mastery skill-tree menu. */
  onOpenMastery: () => void;
  /** Open the armory (the player's own adventurer only). */
  onOpenArmory?: () => void;
  onClose: () => void;
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
  onOpenArmory,
  onClose,
}: Props) {
  const rarity = RARITIES[unit.rarity];
  const style = { '--rarity': rarity.color } as CSSProperties;
  // Hero champions level up in-stage with wave-clear EXP (auto), not gold.
  const isHero = unit.rarity === 'hero';
  const path = playerChampionPath(unit.id);
  const thrown = masteryThrow(unit.id, purchased);
  const tiles = championStatTiles(unit, purchased);
  const role = championRole(unit);

  const notes: ReactNode[] = [];
  if (unit.aoe === 'line')
    notes.push('Pierces in a straight line to the end of its range, striking every enemy along the way.');
  if (unit.aoe === 'circle') {
    notes.push(
      masteryGreaterOrb(unit.id, purchased)
        ? `Greater Orb: leaps up, gathers a huge orb overhead and hurls it down, striking every enemy in a ${masteryBurstRadius(unit, purchased)}px blast.`
        : 'A slow-charging orb bursts on impact, striking every enemy in the blast.',
    );
  }
  if (unit.aoe === 'cone' && unit.visual.shape === 'player-claymore')
    notes.push(`Each heavy swing cleaves a ${coneAngleDeg(unit)}° arc, striking every enemy in front at once.`);
  if (unit.visual.shape === 'player-longbow')
    notes.push('Each shot is a slow, full draw that looses one heavy arrow from an enormous range.');
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
            ) : null}
            {owned && onOpenArmory && (
              <button type="button" className="cd-mastery cd-armory" onClick={onOpenArmory}>
                <span className="cd-mastery-main">
                  <Icon name="shield" /> Armory
                </span>
                <span className="cd-mastery-sub">Helmet, chestplate, leg piece and boots. Found on bosses.</span>
              </button>
            )}
            {unit.bard && <BardSoundToggle className="cd-bard-sound" />}
            {!owned && (
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
                        {effect && u.description ? ' - ' : ''}
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

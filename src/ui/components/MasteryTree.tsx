import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { masteryTree, type MasteryUpgradeDef } from '../../domain/mastery';
import type { UnitDef } from '../../domain/units';
import { RARITIES } from '../../domain/rarity';
import { UnitSprite } from './UnitSprite';

interface Props {
  unit: UnitDef;
  /** Lifetime mastery EXP earned. */
  exp: number;
  /** EXP still available to spend. */
  availableExp: number;
  /** Skill-tree upgrade ids already learned. */
  purchased: string[];
  /**
   * Learned nodes whose effects are currently live — the active-resolved list.
   * For an exclusive group only one learned member appears here.
   */
  active: string[];
  /** Whether this champion's whole mastery is switched off. */
  disabled: boolean;
  /** Spend EXP to learn a node. */
  onBuy: (upgradeId: string) => void;
  /** Switch which learned member of an exclusive group is active. */
  onSetActive: (upgradeId: string) => void;
  /** Turn this champion's whole mastery on (false) or off (true). */
  onToggleDisabled: (disabled: boolean) => void;
  onClose: () => void;
}

/**
 * A champion's mastery skill tree — its own menu, opened from the champion
 * detail sheet. The champion sits at the root; learnable nodes branch down from
 * it. Buying a node spends the champion's earned EXP permanently.
 */
export function MasteryTree({
  unit,
  exp,
  availableExp,
  purchased,
  active,
  disabled,
  onBuy,
  onSetActive,
  onToggleDisabled,
  onClose,
}: Props) {
  const rarity = RARITIES[unit.rarity];
  const style = { '--rarity': rarity.color } as CSSProperties;
  const tree = masteryTree(unit.id);
  const spent = exp - availableExp;

  // Lay the tree out in rows by prerequisite depth: nodes with no `requires`
  // sit on row 0, a node requiring one of those on row 1, and so on. Parallel
  // trees (all depth 0) render as a single row; sequential trees as a chain.
  const byId = new Map(tree.map((n) => [n.id, n]));
  const depthOf = (node: MasteryUpgradeDef): number => {
    let depth = 0;
    let cur: MasteryUpgradeDef | undefined = node;
    while (cur?.requires && byId.has(cur.requires)) {
      depth++;
      cur = byId.get(cur.requires);
    }
    return depth;
  };
  const rows: MasteryUpgradeDef[][] = [];
  for (const node of tree) {
    const d = depthOf(node);
    (rows[d] ??= []).push(node);
  }

  // Portalled to <body> so an ancestor screen's transform can't shrink this
  // fixed overlay below the viewport (which would break scrolling on small screens).
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="panel modal mastery-tree-modal"
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="mt-head">
          <div className="unit-portrait champion-portrait"><UnitSprite unit={unit} size={64} /></div>
          <div className="mt-head-text">
            <h2>{unit.name}</h2>
            <div className="mt-sub">Mastery Skill Tree</div>
          </div>
          <div className="mt-exp">
            <span className="mt-exp-val">{availableExp.toLocaleString()}</span>
            <span className="mt-exp-lbl">EXP to spend</span>
          </div>
        </div>

        {tree.length > 0 && (
          <button
            type="button"
            className={`mt-switch ${disabled ? 'off' : 'on'}`}
            role="switch"
            aria-checked={!disabled}
            onClick={() => onToggleDisabled(!disabled)}
          >
            <span className="mt-switch-text">
              <span className="mt-switch-title">
                Mastery {disabled ? 'Off' : 'On'}
              </span>
              <span className="mt-switch-sub">
                {disabled
                  ? 'All bonuses are paused — learned nodes are kept.'
                  : 'This champion’s learned bonuses are applied.'}
              </span>
            </span>
            <span className="mt-switch-track" aria-hidden="true">
              <span className="mt-switch-knob" />
            </span>
          </button>
        )}

        {tree.length === 0 ? (
          <div className="mt-empty">
            No mastery upgrades for this champion yet — more are on the way.
          </div>
        ) : (
          <div className={`skilltree${disabled ? ' mt-disabled' : ''}`}>
            <div className="st-node st-root">
              <div className="st-icon"><UnitSprite unit={unit} size={30} /></div>
              <div className="st-label">{unit.name}</div>
            </div>

            <div className="st-trunk" />

            {rows.map((row, rowIdx) => (
              <div
                className={`st-children${row.length > 1 ? ' multi' : ''}`}
                key={rowIdx}
              >
                {row.map((up) => {
                  const learned = purchased.includes(up.id);
                  const prereqMet = !up.requires || purchased.includes(up.requires);
                  const affordable = availableExp >= up.cost;
                  const exclusive = !!up.exclusiveGroup;
                  const isActive = active.includes(up.id);
                  // A learned member of an exclusive group that isn't the active
                  // one can be switched on (deactivating its sibling).
                  const canActivate = learned && exclusive && !isActive;
                  const state = learned
                    ? exclusive && !isActive
                      ? 'available inactive'
                      : 'learned'
                    : !prereqMet
                      ? 'locked'
                      : affordable
                        ? 'available'
                        : 'locked';
                  const icon = isActive
                    ? '✓'
                    : canActivate
                      ? '🔄'
                      : learned
                        ? '✓'
                        : prereqMet
                          ? '🌱'
                          : '🔒';
                  const title = isActive
                    ? 'Active path'
                    : canActivate
                      ? 'Activate this path'
                      : learned
                        ? 'Learned'
                        : !prereqMet
                          ? 'Unlock the previous node first'
                          : affordable
                            ? `Spend ${up.cost} EXP`
                            : `Needs ${up.cost} EXP`;
                  const footer = isActive
                    ? '✓ Active'
                    : canActivate
                      ? 'Tap to activate'
                      : learned
                        ? 'Learned'
                        : prereqMet
                          ? `⭐ ${up.cost} EXP`
                          : '🔒 Locked';
                  const disabled = learned
                    ? !canActivate
                    : !prereqMet || !affordable;
                  return (
                    <div key={up.id} className="st-branch">
                      <div className="st-edge" />
                      <button
                        type="button"
                        className={`st-node st-upgrade ${state}${up.major ? ' major' : ''}${isActive ? ' active' : ''}`}
                        disabled={disabled}
                        title={title}
                        onClick={() =>
                          canActivate ? onSetActive(up.id) : onBuy(up.id)
                        }
                      >
                        <div className="st-icon">{icon}</div>
                        <div className="st-label">{up.name}</div>
                        <div className="st-eff">{up.description}</div>
                        <div className="st-cost">{footer}</div>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {spent > 0 && (
          <p className="hint mt-foot">
            {exp.toLocaleString()} EXP earned in total · {spent.toLocaleString()} spent
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

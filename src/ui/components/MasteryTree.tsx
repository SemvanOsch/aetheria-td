import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { masteryTree, type MasteryUpgradeDef } from '../../domain/mastery';
import type { UnitDef } from '../../domain/units';
import { RARITIES } from '../../domain/rarity';
import { UnitSprite } from './UnitSprite';
import { Icon, type IconName } from './Icon';

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

/** Board grid: one column per leaf, one row per prerequisite depth. */
const COL = 150;
const ROW = 116;
const PAD_Y = 52;

/** A glyph for a node, picked from the first effect it carries. */
function nodeIcon(up: MasteryUpgradeDef): IconName {
  if (up.unlocksArmor) return 'shield';
  if (up.critChanceBonus || up.critMultiplier) return 'target';
  if (up.generateMult) return 'wheat';
  if (up.startingGoldBonus || up.upgradeDiscount) return 'coin';
  if (up.rangeAuraMult) return 'sparkle';
  if (up.adjacentDamageMult) return 'shield';
  if (up.throwEvery) return 'swords';
  if (up.knockback) return 'turn';
  if (up.attackSpeedMult || up.preloadShots) return 'fast';
  if (up.rangeMult) return 'bow';
  if (up.damageMult || up.bounceDamageMult || up.finalBounceDamageMult) return 'sword';
  return 'star';
}

type NodeState = 'locked' | 'open' | 'short' | 'learned' | 'inactive';

/**
 * A champion's mastery skill tree — its own menu, opened from the champion
 * detail sheet. The champion crowns a board of connected nodes laid out by
 * prerequisite; selecting a node opens it in the side panel, where it is
 * learned (spending the champion's earned EXP permanently) or, for an
 * exclusive path, made the active one.
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
  const byId = new Map(tree.map((n) => [n.id, n]));

  const stateOf = (up: MasteryUpgradeDef): NodeState => {
    if (purchased.includes(up.id)) return up.exclusiveGroup && !active.includes(up.id) ? 'inactive' : 'learned';
    if (up.requires && byId.has(up.requires) && !purchased.includes(up.requires)) return 'locked';
    return availableExp >= up.cost ? 'open' : 'short';
  };

  // Default selection: something the player can act on, else the next step.
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () =>
      (tree.find((n) => stateOf(n) === 'open') ??
        tree.find((n) => stateOf(n) === 'short') ??
        tree[0])?.id,
  );
  const selected = selectedId ? byId.get(selectedId) : undefined;

  // Lay out: each node spans as many columns as it has leaves beneath it and
  // sits centred over them; rows follow prerequisite depth (the champion is row 0).
  const kids = new Map<string | undefined, MasteryUpgradeDef[]>();
  for (const n of tree) {
    const parent = n.requires && byId.has(n.requires) ? n.requires : undefined;
    kids.set(parent, [...(kids.get(parent) ?? []), n]);
  }
  const span = (id: string): number =>
    Math.max(1, (kids.get(id) ?? []).reduce((s, k) => s + span(k.id), 0));
  const pos = new Map<string, { x: number; y: number }>();
  let maxDepth = 0;
  const place = (list: MasteryUpgradeDef[], left: number, depth: number) => {
    let cursor = left;
    for (const n of list) {
      const w = span(n.id);
      pos.set(n.id, { x: (cursor + w / 2) * COL, y: PAD_Y + depth * ROW });
      maxDepth = Math.max(maxDepth, depth);
      place(kids.get(n.id) ?? [], cursor, depth + 1);
      cursor += w;
    }
  };
  const roots = kids.get(undefined) ?? [];
  const cols = Math.max(1, roots.reduce((s, r) => s + span(r.id), 0));
  place(roots, 0, 1);
  const boardW = cols * COL;
  const boardH = PAD_Y * 2 + maxDepth * ROW + 20;
  const rootPos = { x: boardW / 2, y: PAD_Y };

  const edges = tree.map((n) => {
    const to = pos.get(n.id)!;
    const from = n.requires && pos.has(n.requires) ? pos.get(n.requires)! : rootPos;
    const st = stateOf(n);
    const lit = st === 'learned' || st === 'inactive';
    const ready = st === 'open' || st === 'short';
    const midY = (from.y + to.y) / 2;
    const d =
      from.x === to.x
        ? `M${from.x} ${from.y}L${to.x} ${to.y}`
        : `M${from.x} ${from.y}C${from.x} ${midY} ${to.x} ${midY} ${to.x} ${to.y}`;
    return <path key={n.id} d={d} className={`mt-edge${lit ? ' lit' : ready ? ' ready' : ''}`} />;
  });

  const learnedActive = tree.filter((n) => active.includes(n.id));

  const detail = selected && (() => {
    const st = stateOf(selected);
    const prereq = selected.requires ? byId.get(selected.requires) : undefined;
    let action;
    if (st === 'learned') {
      action = (
        <button className="btn mt-action done" disabled>
          <Icon name="check" /> {selected.exclusiveGroup ? 'Active path' : 'Learned'}
        </button>
      );
    } else if (st === 'inactive') {
      action = (
        <button className="btn primary mt-action" onClick={() => onSetActive(selected.id)}>
          <Icon name="forward" /> Make this the active path
        </button>
      );
    } else if (st === 'locked') {
      action = (
        <button className="btn mt-action" disabled>
          <Icon name="lock" /> Learn {prereq?.name ?? 'the previous node'} first
        </button>
      );
    } else if (st === 'short') {
      action = (
        <button className="btn mt-action" disabled>
          Needs {selected.cost} EXP · {selected.cost - availableExp} more
        </button>
      );
    } else {
      action = (
        <button className="btn primary mt-action" onClick={() => onBuy(selected.id)}>
          <Icon name="sparkle" /> Learn · {selected.cost} EXP
        </button>
      );
    }
    return (
      <div className={`mt-detail ${st}${selected.major ? ' major' : ''}`} key={selected.id}>
        <div className="mt-detail-head">
          <span className="mt-detail-icon">
            <Icon name={nodeIcon(selected)} />
          </span>
          <div>
            <div className="mt-detail-name">{selected.name}</div>
            <div className="mt-detail-tags">
              {selected.major && <span className="mt-tag gold">Capstone</span>}
              {selected.exclusiveGroup && <span className="mt-tag">Choose one path</span>}
              <span className="mt-tag faint">{selected.cost} EXP</span>
            </div>
          </div>
        </div>
        <p className="mt-detail-desc">{selected.description}</p>
        {action}
      </div>
    );
  })();

  // Portalled to <body> so an ancestor screen's transform can't shrink this
  // fixed overlay below the viewport (which would break scrolling on small screens).
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel ornate modal mastery-tree-modal" style={style} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>

        <div className="mt-head">
          <div className="unit-portrait champion-portrait">
            <UnitSprite unit={unit} size={64} />
          </div>
          <div className="mt-head-text">
            <div className="mt-sub">Mastery Skill Tree</div>
            <h2>{unit.name}</h2>
          </div>
          <div className="mt-exp" title={`${exp.toLocaleString()} EXP earned in total`}>
            <Icon name="sparkle" />
            <span className="mt-exp-val">{availableExp.toLocaleString()}</span>
            <span className="mt-exp-lbl">
              EXP to spend
              <br />
              {exp.toLocaleString()} earned
            </span>
          </div>
          {tree.length > 0 && (
            <button
              type="button"
              className={`mt-switch ${disabled ? 'off' : 'on'}`}
              role="switch"
              aria-checked={!disabled}
              title={disabled ? 'All bonuses are paused — learned nodes are kept.' : 'This champion’s learned bonuses are applied.'}
              onClick={() => onToggleDisabled(!disabled)}
            >
              <span className="mt-switch-track" aria-hidden="true">
                <span className="mt-switch-knob" />
              </span>
              <span className="mt-switch-title">Mastery {disabled ? 'off' : 'on'}</span>
            </button>
          )}
        </div>

        {tree.length === 0 ? (
          <div className="mt-empty">No mastery upgrades for this champion yet — more are on the way.</div>
        ) : (
          <div className="mt-body">
            <div className={`mt-board${disabled ? ' mt-disabled' : ''}`}>
              <div className="mt-canvas" style={{ width: boardW, height: boardH }}>
                <svg className="mt-edges" width={boardW} height={boardH} aria-hidden="true">
                  {edges}
                </svg>
                <div className="mt-root" style={{ left: rootPos.x, top: rootPos.y }}>
                  <UnitSprite unit={unit} size={44} />
                </div>
                {tree.map((up) => {
                  const p = pos.get(up.id)!;
                  const st = stateOf(up);
                  return (
                    <button
                      key={up.id}
                      type="button"
                      className={`mt-node ${st}${up.major ? ' major' : ''}${up.id === selectedId ? ' selected' : ''}`}
                      style={{ left: p.x, top: p.y }}
                      onClick={() => setSelectedId(up.id)}
                      aria-pressed={up.id === selectedId}
                    >
                      <span className="mt-node-gem">
                        <span className="mt-node-glyph">
                          <Icon name={st === 'locked' ? 'lock' : nodeIcon(up)} />
                        </span>
                        {(st === 'learned' || st === 'inactive') && (
                          <span className="mt-node-badge">
                            <Icon name="check" />
                          </span>
                        )}
                      </span>
                      <span className="mt-node-name">{up.name}</span>
                      <span className="mt-node-cost">
                        {st === 'learned'
                          ? up.exclusiveGroup
                            ? 'Active'
                            : 'Learned'
                          : st === 'inactive'
                            ? 'Inactive'
                            : `${up.cost} EXP`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="mt-side">
              {detail}
              <div className="mt-totals">
                <div className="mt-totals-title">
                  Total bonuses{disabled && <span> · paused</span>}
                </div>
                {learnedActive.length === 0 ? (
                  <p className="mt-totals-empty">
                    Nothing learned yet. Champions earn EXP in battle and from duplicate summons.
                  </p>
                ) : (
                  <ul className={disabled ? 'paused' : undefined}>
                    {learnedActive.map((n) => (
                      <li key={n.id}>
                        <Icon name={nodeIcon(n)} />
                        <span>
                          <b>{n.name}</b> {n.description}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
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
/** Pointer travel (px) before a press on the board becomes a drag, not a click. */
const DRAG_SLOP = 4;

interface Pan {
  x: number;
  y: number;
}

/**
 * Offset of a `size`-long canvas inside a `view`-long window: centred when it
 * fits, else kept from showing empty space past either edge.
 */
function clampAxis(offset: number, size: number, view: number): number {
  if (size <= view) return (view - size) / 2;
  return Math.min(0, Math.max(view - size, offset));
}

/** A glyph for a node, picked from the first effect it carries. */
function nodeIcon(up: MasteryUpgradeDef): IconName {
  if (up.unlocksArmor) return 'shield';
  if (up.weaponForm === 'claymore') return 'claymore';
  if (up.weaponForm === 'longbow') return 'longbow';
  if (up.weaponForm === 'staff') return 'staff';
  if (up.crossSlashEvery) return 'swords';
  if (up.burstShots) return 'volley';
  if (up.greaterOrb) return 'orb';
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
    // Learned but not live: a swapped-out exclusive member, or a node after one.
    if (purchased.includes(up.id)) return active.includes(up.id) ? 'learned' : 'inactive';
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

  // The board is a fixed window (sized for a common champion's tree) that the
  // player drags around to look over bigger trees.
  const boardRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ w: number; h: number } | null>(null);
  const [pan, setPan] = useState<Pan | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; sx: number; sy: number; from: Pan; moved: boolean } | null>(null);
  const swallowClick = useRef(false);

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => setView({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tree.length > 0]);

  const clampPan = (p: Pan): Pan =>
    view ? { x: clampAxis(p.x, boardW, view.w), y: clampAxis(p.y, boardH, view.h) } : p;
  // Open centred on the selected node (the one to act on), clamped to the board.
  const shown: Pan = clampPan(
    pan ??
      (() => {
        const focus = (selectedId && pos.get(selectedId)) || rootPos;
        return view ? { x: view.w / 2 - focus.x, y: view.h / 2 - focus.y } : { x: 0, y: 0 };
      })(),
  );
  const pannable = !!view && (boardW > view.w || boardH > view.h);

  // Wheel / trackpad scrolling pans too; it only claims the wheel while the
  // tree can still move that way, so the page scrolls otherwise.
  const panRef = useRef(shown);
  panRef.current = shown;
  const clampRef = useRef(clampPan);
  clampRef.current = clampPan;
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const swap = e.shiftKey && !e.deltaX;
      const dx = swap ? e.deltaY : e.deltaX;
      const dy = swap ? 0 : e.deltaY;
      const cur = panRef.current;
      const next = clampRef.current({ x: cur.x - dx, y: cur.y - dy });
      if (next.x === cur.x && next.y === cur.y) return;
      e.preventDefault();
      setPan(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [tree.length > 0]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !pannable) return;
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, from: shown, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      d.moved = true;
      setDragging(true);
      // Keep the drag going if the pointer leaves the board (best-effort: it
      // throws for a pointer the browser no longer considers pressed).
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* drag still works while over the board */
      }
    }
    setPan(clampPan({ x: d.from.x + dx, y: d.from.y + dy }));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // A drag that ends over a node must not also select it.
    if (d.moved) swallowClick.current = true;
    drag.current = null;
    setDragging(false);
  };

  // Whether a node sits on a learned-but-switched-off exclusive path (it, or a
  // node above it, is an inactive member of its group).
  const onInactivePath = (n: MasteryUpgradeDef | undefined): boolean =>
    !!n && (stateOf(n) === 'inactive' || onInactivePath(n.requires ? byId.get(n.requires) : undefined));

  const edges = tree.map((n) => {
    const to = pos.get(n.id)!;
    const from = n.requires && pos.has(n.requires) ? pos.get(n.requires)! : rootPos;
    const st = stateOf(n);
    const learned = st === 'learned' || st === 'inactive';
    // A learned path that isn't the active one is darkened rather than gilded.
    const cls = learned
      ? onInactivePath(n) ? ' inactive' : ' lit'
      : st === 'open' || st === 'short' ? ' ready' : '';
    const midY = (from.y + to.y) / 2;
    const d =
      from.x === to.x
        ? `M${from.x} ${from.y}L${to.x} ${to.y}`
        : `M${from.x} ${from.y}C${from.x} ${midY} ${to.x} ${midY} ${to.x} ${to.y}`;
    return <path key={n.id} d={d} className={`mt-edge${cls}`} />;
  });

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
      // Activating a node after a swapped-out member activates that member.
      let rival: MasteryUpgradeDef | undefined = selected;
      while (rival && !(rival.exclusiveGroup && !active.includes(rival.id))) {
        rival = rival.requires ? byId.get(rival.requires) : undefined;
      }
      const target = rival ?? selected;
      action = (
        <button className="btn primary mt-action" onClick={() => onSetActive(target.id)}>
          <Icon name="forward" /> Activate path
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
            <div
              ref={boardRef}
              className={`mt-board${disabled ? ' mt-disabled' : ''}${pannable ? ' pannable' : ''}${dragging ? ' dragging' : ''}`}
              style={{ '--pan-x': `${shown.x}px`, '--pan-y': `${shown.y}px` } as CSSProperties}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onClickCapture={(e) => {
                if (!swallowClick.current) return;
                swallowClick.current = false;
                e.stopPropagation();
              }}
            >
              <div
                className="mt-canvas"
                style={{ width: boardW, height: boardH, transform: `translate(${shown.x}px, ${shown.y}px)` }}
              >
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
                      {/* Learned nodes speak for themselves (gold fill / dimmed path). */}
                      {st !== 'learned' && st !== 'inactive' && (
                        <span className="mt-node-cost">{up.cost} EXP</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {pannable && (
                <div className="mt-pan-hint" aria-hidden="true">
                  Drag to look around
                </div>
              )}
            </div>

            <aside className="mt-side">
              {detail}
            </aside>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { BOARD_HEIGHT, BOARD_WIDTH, COLS, ROWS, TILE, cellKey, expandPathCells, type Cell } from '../../domain/grid';
import {
  DEFAULT_BANNER_COLOR,
  DEFAULT_PATH_LAYERS,
  DEFAULT_THEME,
  FLOOR_KINDS,
  PATH_KINDS,
  PROP_CATEGORIES,
  PROP_PALETTE,
  propCells,
  propFootprint,
  type BoardTheme,
  type DecorProp,
  type FloorKind,
  type PathKind,
  type PropCategory,
  type PropKind,
} from '../../domain/decor';
import { SECTION_MOODS, STAGE_MOODS, type Atmosphere } from '../../domain/atmosphere';
import { LEVELS, SECTIONS, getLevel, type LevelDef, type SectionId } from '../../domain/levels';
import { GameEngine } from '../../engine/GameEngine';
import { drawBoard, drawProp } from '../../engine/renderer';
import { Icon, type IconName } from '../components/Icon';

interface Props {
  onClose: () => void;
}

/** The board plus a one-cell off-board ring (where spawns and exits live). */
const VIEW_W = (COLS + 2) * TILE;
const VIEW_H = (ROWS + 2) * TILE;

/** The left-hand panel's sections. */
type Panel = 'path' | 'props' | 'ground' | 'mood';
const PANELS: { id: Panel; label: string; icon: IconName }[] = [
  { id: 'path', label: 'Path', icon: 'turn' },
  { id: 'props', label: 'Props', icon: 'castle' },
  { id: 'ground', label: 'Ground', icon: 'tree' },
  { id: 'mood', label: 'Mood', icon: 'sparkle' },
];

const NO_UI = { hoverCol: -1, hoverRow: -1, selectedUnitId: null, selectedTowerUid: null };

/** Mood presets: every authored stage mood, then each chapter's default. */
const MOODS: { key: string; label: string; mood: Atmosphere }[] = [
  ...Object.entries(STAGE_MOODS).map(([id, mood]) => {
    const lvl = getLevel(Number(id));
    return { key: `stage-${id}`, label: lvl ? `Stage ${id} · ${lvl.name}` : `Stage ${id}`, mood };
  }),
  ...SECTIONS.map((s) => ({ key: `section-${s.id}`, label: `${s.name} (chapter default)`, mood: SECTION_MOODS[s.id] })),
];

const isOffBoard = (col: number, row: number) => col < 0 || col >= COLS || row < 0 || row >= ROWS;
/** Centre of a cell in view pixels (accounting for the off-board ring). */
const viewCenter = (c: Cell) => ({ x: (c.col + 1) * TILE + TILE / 2, y: (c.row + 1) * TILE + TILE / 2 });
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A tiny canvas that draws a single prop, for the palette buttons. */
function PropIcon({ kind, color }: { kind: PropKind; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (kind === 'battlements') {
      // The band spans the whole wall in-game; show a representative strip here.
      ctx.fillStyle = '#3a4048';
      ctx.fillRect(6, 30, 60, 16);
      ctx.fillStyle = '#4a515a';
      for (let x = 6; x < 66; x += 16) ctx.fillRect(x, 18, 10, 16);
      return;
    }
    // Multi-cell props draw offset by their footprint centroid (so the anchor
    // stays a cell corner in-game); centre + shrink them to fit the icon.
    const fp = propFootprint(kind);
    let minC = 0, maxC = 0, minR = 0, maxR = 0;
    for (const [dc, dr] of fp) {
      minC = Math.min(minC, dc); maxC = Math.max(maxC, dc);
      minR = Math.min(minR, dr); maxR = Math.max(maxR, dr);
    }
    const span = Math.max(maxC - minC + 1, maxR - minR + 1);
    ctx.save();
    ctx.translate(cv.width / 2, cv.height / 2 + 12);
    ctx.scale(1.05 / span, 1.05 / span);
    ctx.translate(-((minC + maxC) / 2) * TILE, -((minR + maxR) / 2) * TILE);
    drawProp(ctx, kind, 0, 0, color);
    ctx.restore();
  }, [kind, color]);
  return <canvas ref={ref} width={72} height={76} className="ld-prop-icon" />;
}

/**
 * A colour selector: the native swatch picker plus a text field for typing or
 * pasting a hex code. The text is edited freely and committed on Enter/blur;
 * `#` is optional and 3-digit shorthand (`#6b5`) expands to full form. An
 * invalid entry snaps back to the current colour.
 */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  // Reflect external changes (e.g. resets) back into the text field.
  useEffect(() => setText(value), [value]);

  const commit = (raw: string) => {
    let v = raw.trim().toLowerCase();
    if (v && !v.startsWith('#')) v = `#${v}`;
    const short = /^#([0-9a-f]{3})$/.exec(v);
    if (short) v = `#${short[1].split('').map((c) => c + c).join('')}`;
    if (/^#[0-9a-f]{6}$/.test(v)) onChange(v);
    else setText(value); // revert invalid input
  };

  return (
    <label className="ld-color">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
      />
      <input
        type="text"
        className="ld-hex"
        value={text}
        spellCheck={false}
        maxLength={7}
        aria-label={`${label} hex value`}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

/** A row of toggle chips choosing one value. */
function Choice<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="ld-choice">
      {options.map((o) => (
        <button key={o} type="button" className={o === value ? 'active' : undefined} onClick={() => onChange(o)}>
          {title(o)}
        </button>
      ))}
    </div>
  );
}

/**
 * Interactive level designer, drawn by the real battle renderer: terrain
 * materials, props with their lights and flames, the stage's lighting mood and
 * weather all preview live. Draw the enemy path as a chain of turn points
 * (moves snap horizontal/vertical), stamp props, pick the floor and path
 * materials and a mood to preview under — or start from an existing stage —
 * then Export copies a ready `path:` / `theme:` / `decor:` block to paste into
 * a level spec in `domain/levels.ts`.
 */
export function LevelDesigner({ onClose }: Props) {
  const [panel, setPanel] = useState<Panel>('path');
  const [turns, setTurns] = useState<Cell[]>([]);
  const [props, setProps] = useState<DecorProp[]>([]);
  // The prop stamped by clicks while the Props panel is open.
  const [propKind, setPropKind] = useState<PropKind>('pillar');
  const [propTab, setPropTab] = useState<PropCategory>('castle');
  const [bannerColor, setBannerColor] = useState(DEFAULT_BANNER_COLOR);
  const [hover, setHover] = useState<Cell | null>(null);
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState('blank');
  const [section, setSection] = useState<SectionId>('castle');
  const [extraLanes, setExtraLanes] = useState(0);

  // Board skin. Off by default so a plain level exports no theme.
  const [themeOn, setThemeOn] = useState(false);
  const [groundEven, setGroundEven] = useState(DEFAULT_THEME.groundEven);
  const [groundOdd, setGroundOdd] = useState(DEFAULT_THEME.groundOdd);
  const [floor, setFloor] = useState<FloorKind>('stone');
  const [pathKind, setPathKind] = useState<PathKind>('dirt');
  const [customPath, setCustomPath] = useState(false);
  const [pathOuter, setPathOuter] = useState(DEFAULT_PATH_LAYERS[0][0]);
  const [pathFill, setPathFill] = useState(DEFAULT_PATH_LAYERS[1][0]);
  const [pathCenter, setPathCenter] = useState(DEFAULT_PATH_LAYERS[2][0]);
  const [moodKey, setMoodKey] = useState('section-castle');

  const viewRef = useRef<HTMLCanvasElement>(null);

  const pathCells = useMemo(() => {
    const set = new Set<string>();
    if (turns.length >= 1) for (const c of expandPathCells(turns)) set.add(cellKey(c.col, c.row));
    return set;
  }, [turns]);

  const theme = useMemo<BoardTheme | undefined>(() => {
    if (!themeOn) return undefined;
    const t: BoardTheme = { groundEven, groundOdd, floor, pathKind };
    if (customPath) t.path = [[pathOuter, TILE - 4], [pathFill, TILE - 12], [pathCenter, TILE - 26]];
    return t;
  }, [themeOn, groundEven, groundOdd, floor, pathKind, customPath, pathOuter, pathFill, pathCenter]);

  const mood = (MOODS.find((m) => m.key === moodKey) ?? MOODS[0]).mood;

  // A throwaway engine for the live preview, rebuilt whenever the design
  // changes (id -1: no built-in theme, legacy decor or mood is keyed to it).
  const engine = useMemo(() => {
    const base = LEVELS[0];
    const level: LevelDef = {
      ...base,
      id: -1,
      section,
      lanes: turns.length >= 2 ? [{ pathTurns: turns, waves: [] }] : [],
      theme: theme ?? { ...DEFAULT_THEME },
      decor: props,
      atmosphere: mood,
    };
    return new GameEngine(level, 0);
  }, [turns, props, theme, mood, section]);

  // Paint loop: the real board (so flames flicker and weather drifts), framed
  // by the off-board ring, with the path markers and the hover ghost on top.
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const drawState = useRef({ panel, turns, props, propKind, bannerColor, pathCells });
  drawState.current = { panel, turns, props, propKind, bannerColor, pathCells };
  useEffect(() => {
    const view = viewRef.current?.getContext('2d');
    if (!view) return;
    const board = document.createElement('canvas');
    board.width = BOARD_WIDTH;
    board.height = BOARD_HEIGHT;
    const bctx = board.getContext('2d')!;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      drawBoard(bctx, engine, NO_UI);
      const s = drawState.current;
      const h = hoverRef.current;

      view.fillStyle = '#06070d';
      view.fillRect(0, 0, VIEW_W, VIEW_H);
      view.strokeStyle = 'rgba(232, 191, 94, 0.08)';
      view.lineWidth = 1;
      view.beginPath();
      for (let c = 0; c <= COLS + 2; c++) {
        view.moveTo(c * TILE + 0.5, 0);
        view.lineTo(c * TILE + 0.5, VIEW_H);
      }
      for (let r = 0; r <= ROWS + 2; r++) {
        view.moveTo(0, r * TILE + 0.5);
        view.lineTo(VIEW_W, r * TILE + 0.5);
      }
      view.stroke();
      // The path's off-board stubs (the board render clips at its edge).
      for (const key of s.pathCells) {
        const [c, r] = key.split(',').map(Number);
        if (!isOffBoard(c, r)) continue;
        view.fillStyle = 'rgba(232, 191, 94, 0.16)';
        view.fillRect((c + 1) * TILE, (r + 1) * TILE, TILE, TILE);
      }
      view.drawImage(board, TILE, TILE);
      view.strokeStyle = 'rgba(232, 191, 94, 0.45)';
      view.strokeRect(TILE + 0.5, TILE + 0.5, BOARD_WIDTH - 1, BOARD_HEIGHT - 1);

      // Hover: the stamped prop's ghost + footprint, or the path's next leg.
      if (h) {
        if (s.panel === 'props') {
          const p: DecorProp = { kind: s.propKind, col: h.col, row: h.row };
          const cells = s.propKind === 'battlements' ? [] : propCells(p);
          const bad = isOffBoard(h.col, h.row) || cells.some((c) => isOffBoard(c.col, c.row) || s.pathCells.has(cellKey(c.col, c.row)));
          for (const c of cells) {
            view.fillStyle = bad ? 'rgba(255, 90, 80, 0.3)' : 'rgba(127, 211, 138, 0.25)';
            view.fillRect((c.col + 1) * TILE, (c.row + 1) * TILE, TILE, TILE);
          }
          view.save();
          view.globalAlpha = 0.65;
          if (s.propKind === 'battlements') {
            view.translate(TILE, TILE);
            drawProp(view, 'battlements', 0, 0);
          } else {
            const at = viewCenter(h);
            drawProp(view, s.propKind, at.x, at.y, s.propKind === 'banner' ? s.bannerColor : undefined);
          }
          view.restore();
        } else if (s.panel === 'path') {
          const last = s.turns[s.turns.length - 1];
          let next = h;
          if (last) {
            next = Math.abs(h.col - last.col) >= Math.abs(h.row - last.row) ? { col: h.col, row: last.row } : { col: last.col, row: h.row };
            const a = viewCenter(last);
            const b = viewCenter(next);
            view.save();
            view.setLineDash([6, 6]);
            view.strokeStyle = 'rgba(255, 240, 191, 0.75)';
            view.lineWidth = 3;
            view.beginPath();
            view.moveTo(a.x, a.y);
            view.lineTo(b.x, b.y);
            view.stroke();
            view.restore();
          }
          view.strokeStyle = 'rgba(255, 240, 191, 0.9)';
          view.lineWidth = 2;
          view.strokeRect((next.col + 1) * TILE + 2, (next.row + 1) * TILE + 2, TILE - 4, TILE - 4);
        }
      }

      // Turn markers (bold while editing the path, faint otherwise).
      const strong = s.panel === 'path';
      if (s.turns.length >= 2) {
        view.save();
        view.globalAlpha = strong ? 0.9 : 0.35;
        view.strokeStyle = '#e8bf5e';
        view.lineWidth = 3;
        view.lineJoin = 'round';
        view.beginPath();
        s.turns.forEach((t, i) => {
          const p = viewCenter(t);
          if (i === 0) view.moveTo(p.x, p.y);
          else view.lineTo(p.x, p.y);
        });
        view.stroke();
        view.restore();
      }
      s.turns.forEach((t, i) => {
        const p = viewCenter(t);
        const last = i === s.turns.length - 1;
        view.save();
        view.globalAlpha = strong ? 1 : 0.45;
        view.fillStyle = i === 0 ? '#7fd38a' : last ? '#6fb6ff' : '#e8bf5e';
        view.strokeStyle = '#0c0e1c';
        view.lineWidth = 2.5;
        view.beginPath();
        view.arc(p.x, p.y, 11, 0, Math.PI * 2);
        view.fill();
        view.stroke();
        view.fillStyle = '#0c0e1c';
        view.font = '800 12px Inter, system-ui, sans-serif';
        view.textAlign = 'center';
        view.textBaseline = 'middle';
        view.fillText(String(i + 1), p.x, p.y + 0.5);
        view.restore();
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  const cellAt = (e: MouseEvent<HTMLCanvasElement>): Cell => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    return { col: Math.floor(x / TILE) - 1, row: Math.floor(y / TILE) - 1 };
  };

  const touch = () => setCopied(false);

  /** Extend the path toward a clicked cell, snapping to a horizontal/vertical move. */
  const addPoint = ({ col, row }: Cell) => {
    touch();
    setTurns((prev) => {
      if (prev.length === 0) return [{ col, row }];
      const last = prev[prev.length - 1];
      const next: Cell = Math.abs(col - last.col) >= Math.abs(row - last.row) ? { col, row: last.row } : { col: last.col, row };
      if (next.col === last.col && next.row === last.row) return prev;
      return [...prev, next];
    });
  };

  /** The prop covering a cell (any cell of its footprint), if one does. */
  const propAt = (list: DecorProp[], c: Cell) =>
    list.find((p) => p.kind !== 'battlements' && propCells(p).some((q) => q.col === c.col && q.row === c.row)) ??
    list.find((p) => p.col === c.col && p.row === c.row);

  /** Stamp the active prop; clicking the same prop's anchor again removes it. */
  const placeProp = (c: Cell) => {
    if (isOffBoard(c.col, c.row)) return; // props live on the board, not the ring
    touch();
    setProps((prev) => {
      const here = prev.find((p) => p.col === c.col && p.row === c.row && p.kind === propKind);
      if (here) return prev.filter((p) => p !== here);
      const np: DecorProp = { kind: propKind, col: c.col, row: c.row };
      if (propKind === 'banner') np.color = bannerColor;
      // A new prop replaces whatever its footprint lands on.
      const cells = propKind === 'battlements' ? [] : propCells(np).map((q) => cellKey(q.col, q.row));
      const rest = prev.filter((p) => {
        if (propKind === 'battlements') return p.kind !== 'battlements';
        if (p.kind === 'battlements') return true;
        return !propCells(p).some((q) => cells.includes(cellKey(q.col, q.row)));
      });
      return [...rest, np];
    });
  };

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const c = cellAt(e);
    if (panel === 'path') addPoint(c);
    else if (panel === 'props') placeProp(c);
  };

  /** Right-click removes the prop under the cursor, whatever the panel. */
  const onContext = (e: MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const c = cellAt(e);
    setProps((prev) => {
      const hit = propAt(prev, c);
      if (!hit) return prev;
      touch();
      return prev.filter((p) => p !== hit);
    });
  };

  /** Load an existing stage's first lane, dressing, materials and mood. */
  const loadSource = (key: string) => {
    setSource(key);
    touch();
    if (key === 'blank') {
      setTurns([]);
      setProps([]);
      setThemeOn(false);
      setExtraLanes(0);
      setGroundEven(DEFAULT_THEME.groundEven);
      setGroundOdd(DEFAULT_THEME.groundOdd);
      setFloor('stone');
      setPathKind('dirt');
      setCustomPath(false);
      setSection('castle');
      setMoodKey('section-castle');
      return;
    }
    const lvl = getLevel(Number(key));
    if (!lvl) return;
    setTurns(lvl.lanes[0]?.pathTurns.map((t) => ({ ...t })) ?? []);
    setExtraLanes(Math.max(0, lvl.lanes.length - 1));
    setProps((lvl.decor ?? []).map((p) => ({ ...p })));
    setSection(lvl.section);
    setMoodKey(STAGE_MOODS[lvl.id] ? `stage-${lvl.id}` : `section-${lvl.section}`);
    const t = lvl.theme;
    setThemeOn(!!t);
    if (t) {
      setGroundEven(t.groundEven);
      setGroundOdd(t.groundOdd);
      setFloor(t.floor ?? 'stone');
      setPathKind(t.pathKind ?? 'dirt');
      setCustomPath(!!t.path);
      if (t.path) {
        setPathOuter(t.path[0]?.[0] ?? DEFAULT_PATH_LAYERS[0][0]);
        setPathFill(t.path[1]?.[0] ?? DEFAULT_PATH_LAYERS[1][0]);
        setPathCenter(t.path[2]?.[0] ?? DEFAULT_PATH_LAYERS[2][0]);
      }
    }
  };

  const code = useMemo(() => {
    const lines: string[] = [];
    if (turns.length >= 2) lines.push(`path: [${turns.map((t) => `{ col: ${t.col}, row: ${t.row} }`).join(', ')}],`);
    if (theme) {
      const parts = [`groundEven: '${theme.groundEven}'`, `groundOdd: '${theme.groundOdd}'`, `floor: '${theme.floor}'`];
      if (theme.path) parts.push(`path: [${theme.path.map(([c, w]) => `['${c}', ${w}]`).join(', ')}]`);
      parts.push(`pathKind: '${theme.pathKind}'`);
      lines.push(`theme: { ${parts.join(', ')} },`);
    }
    if (props.length > 0) {
      const items = props
        .map((p) => `  { kind: '${p.kind}', col: ${p.col}, row: ${p.row}${p.color ? `, color: '${p.color}'` : ''} },`)
        .join('\n');
      lines.push(`decor: [\n${items}\n],`);
    }
    return lines.join('\n');
  }, [turns, props, theme]);

  const hasContent = turns.length >= 2 || props.length > 0 || themeOn;

  const exportCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the code box below lets the user copy manually.
      setCopied(false);
    }
  };

  const startCell = turns[0];
  const endCell = turns[turns.length - 1];
  const startOk = startCell ? isOffBoard(startCell.col, startCell.row) : true;
  // Ending on the board is fine when a castle or gate prop stands there as the base.
  const endProp = endCell ? propAt(props, endCell) : undefined;
  const endOk = endCell ? isOffBoard(endCell.col, endCell.row) || endProp?.kind === 'castle' || endProp?.kind === 'gate' : true;
  // A castle or gate at the path's end is the base itself, not an obstruction.
  const blocked = props.filter(
    (p) =>
      p.kind !== 'battlements' &&
      p.kind !== 'castle' &&
      p.kind !== 'gate' &&
      propCells(p).some((c) => pathCells.has(cellKey(c.col, c.row))),
  ).length;

  // Portalled to <body>: the TopBar (which renders Settings → this designer)
  // has a backdrop-filter, which would otherwise trap this fixed overlay.
  return createPortal(
    <div className="modal-backdrop ld-backdrop" onClick={onClose}>
      <div className="panel ornate modal level-designer-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>

        <div className="ld-head">
          <div>
            <div className="ld-eyebrow">Developer</div>
            <h2 className="ld-title">Level Designer</h2>
          </div>
          <label className="ld-source">
            <span>Start from</span>
            <select value={source} onChange={(e) => loadSource(e.target.value)}>
              <option value="blank">Blank board</option>
              {LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {`Stage ${l.id} · ${l.name}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="ld-body">
          <aside className="ld-side">
            <div className="ld-panels" role="tablist">
              {PANELS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={panel === p.id}
                  className={panel === p.id ? 'active' : undefined}
                  onClick={() => setPanel(p.id)}
                >
                  <Icon name={p.icon} /> {p.label}
                </button>
              ))}
            </div>

            {panel === 'path' && (
              <div className="ld-panel">
                <p className="ld-help">
                  Click cells to lay the enemy route — each move snaps straight across or down. Start and end on the
                  dark off-board ring.
                </p>
                <div className="ld-row">
                  <button className="btn ghost ld-small" onClick={() => (touch(), setTurns((t) => t.slice(0, -1)))} disabled={turns.length === 0}>
                    <Icon name="undo" /> Undo point
                  </button>
                  <button className="btn ghost ld-small" onClick={() => (touch(), setTurns([]))} disabled={turns.length === 0}>
                    <Icon name="close" /> Clear
                  </button>
                </div>
                <div className="ld-legend">
                  <span><i className="dot start" /> Spawn</span>
                  <span><i className="dot turn" /> Turn</span>
                  <span><i className="dot end" /> Castle</span>
                </div>
                {extraLanes > 0 && (
                  <p className="ld-note">
                    This stage has {extraLanes} more lane{extraLanes === 1 ? '' : 's'}; only the first is loaded for
                    editing.
                  </p>
                )}
              </div>
            )}

            {panel === 'props' && (
              <div className="ld-panel">
                <div className="ld-subtabs">
                  {PROP_CATEGORIES.map((cat) => (
                    <button key={cat.id} type="button" className={propTab === cat.id ? 'active' : undefined} onClick={() => setPropTab(cat.id)}>
                      <Icon name={cat.id === 'castle' ? 'castle' : 'houses'} /> {cat.label}
                    </button>
                  ))}
                </div>
                <div className="ld-props">
                  {PROP_PALETTE.filter((p) => p.category === propTab).map((p) => (
                    <button
                      key={p.kind}
                      type="button"
                      className={`ld-prop${propKind === p.kind ? ' active' : ''}`}
                      onClick={() => setPropKind(p.kind)}
                      title={`Place ${p.label}`}
                    >
                      <PropIcon kind={p.kind} color={p.kind === 'banner' ? bannerColor : p.color} />
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
                {propKind === 'banner' && <ColorField label="Banner" value={bannerColor} onChange={setBannerColor} />}
                <p className="ld-help">Click to stamp · click the same prop again or right-click to remove.</p>
                <button className="btn ghost ld-small" onClick={() => (touch(), setProps([]))} disabled={props.length === 0}>
                  <Icon name="close" /> Clear all props
                </button>
              </div>
            )}

            {panel === 'ground' && (
              <div className="ld-panel">
                <label className="ld-check">
                  <input type="checkbox" checked={themeOn} onChange={(e) => (touch(), setThemeOn(e.target.checked))} />
                  Custom floor &amp; path
                </label>
                {themeOn ? (
                  <>
                    <div className="ld-field-label">Floor material</div>
                    <Choice value={floor} options={FLOOR_KINDS} onChange={setFloor} />
                    <ColorField label="Floor tone" value={groundEven} onChange={setGroundEven} />
                    <ColorField label="Variation" value={groundOdd} onChange={setGroundOdd} />
                    <div className="ld-field-label">Path material</div>
                    <Choice value={pathKind} options={PATH_KINDS} onChange={setPathKind} />
                    <label className="ld-check">
                      <input type="checkbox" checked={customPath} onChange={(e) => setCustomPath(e.target.checked)} />
                      Custom path colours
                    </label>
                    {customPath && (
                      <>
                        <ColorField label="Border" value={pathOuter} onChange={setPathOuter} />
                        <ColorField label="Fill" value={pathFill} onChange={setPathFill} />
                        <ColorField label="Centre" value={pathCenter} onChange={setPathCenter} />
                      </>
                    )}
                  </>
                ) : (
                  <p className="ld-help">Off: the stage uses the plain default floor and a dirt track.</p>
                )}
              </div>
            )}

            {panel === 'mood' && (
              <div className="ld-panel">
                <p className="ld-help">
                  Preview the board under any stage&apos;s lighting, weather and colour grade. Moods live in{' '}
                  <code>domain/atmosphere.ts</code>, keyed by level id — this choice isn&apos;t exported.
                </p>
                <div className="ld-moods">
                  {MOODS.map((m) => (
                    <button key={m.key} type="button" className={moodKey === m.key ? 'active' : undefined} onClick={() => setMoodKey(m.key)}>
                      <span className="ld-mood-swatch" style={{ background: `linear-gradient(135deg, ${m.mood.grade ?? m.mood.ambient}, ${m.mood.ambient})`, opacity: 0.5 + m.mood.darkness }} />
                      <span>
                        {m.label}
                        <small>
                          {title(m.mood.light)} light · {m.mood.weather === 'none' ? 'still air' : m.mood.weather}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <div className="ld-stage">
            <canvas
              ref={viewRef}
              className={`ld-view ${panel}`}
              width={VIEW_W}
              height={VIEW_H}
              onClick={onClick}
              onContextMenu={onContext}
              onMouseMove={(e) => {
                const c = cellAt(e);
                setHover((h) => (h && h.col === c.col && h.row === c.row ? h : c));
              }}
              onMouseLeave={() => setHover(null)}
            />
            <div className="ld-status">
              <span>
                {hover ? `col ${hover.col}, row ${hover.row}${isOffBoard(hover.col, hover.row) ? ' · off-board' : ''}` : 'Hover the board'}
              </span>
              <span>
                {turns.length} point{turns.length === 1 ? '' : 's'} · {props.length} prop{props.length === 1 ? '' : 's'}
              </span>
            </div>
            {turns.length > 0 && (!startOk || !endOk) && (
              <p className="ld-warn">
                <Icon name="info" /> {!startOk && 'The spawn (point 1) is on the board, not the off-board ring. '}
                {!endOk && 'The castle (last point) is on the board with no castle or gate prop there. '}
                Enemies normally enter and exit off-board.
              </p>
            )}
            {blocked > 0 && (
              <p className="ld-warn">
                <Icon name="info" /> {blocked} prop{blocked === 1 ? ' sits' : 's sit'} on the enemy path.
              </p>
            )}
          </div>
        </div>

        <div className="ld-export">
          <div className="ld-export-head">
            <span>
              Level code — paste the <code>path:</code> / <code>theme:</code> / <code>decor:</code> lines into a level
              spec in <code>domain/levels.ts</code>
            </span>
            <button className="btn primary ld-small" onClick={exportCode} disabled={!hasContent}>
              <Icon name={copied ? 'check' : 'scroll'} /> {copied ? 'Copied!' : 'Copy code'}
            </button>
          </div>
          <textarea
            className="ld-code"
            readOnly
            rows={Math.min(10, Math.max(3, code.split('\n').length))}
            value={hasContent ? code : 'Draw a path, place props, or set a floor to generate the level code…'}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

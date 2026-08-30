import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { COLS, ROWS, TILE, cellKey, expandPathCells, type Cell } from '../../domain/grid';
import {
  DEFAULT_BANNER_COLOR,
  DEFAULT_PATH_LAYERS,
  DEFAULT_THEME,
  PROP_CATEGORIES,
  PROP_PALETTE,
  propFootprint,
  type DecorProp,
  type PropCategory,
  type PropKind,
} from '../../domain/decor';
import { drawProp } from '../../engine/renderer';

interface Props {
  onClose: () => void;
}

/** Pixel size of a designer cell. */
const CELL = 30;
/** Scale from game tile space (TILE px) down to a designer cell — props are
 * authored at TILE size, so we shrink them to match the smaller grid. */
const PROP_SCALE = CELL / TILE;
/** Columns/rows include a one-cell off-board ring (spawn/exit lives there). */
const COL_RANGE: number[] = [];
for (let c = -1; c <= COLS; c++) COL_RANGE.push(c);
const ROW_RANGE: number[] = [];
for (let r = -1; r <= ROWS; r++) ROW_RANGE.push(r);

const GRID_W = COL_RANGE.length * CELL;
const GRID_H = ROW_RANGE.length * CELL;

/** The active designer tool: draw the path, or stamp a decorative prop. */
type Tool = 'path' | PropKind;

/** Centre of a cell in overlay pixels (accounting for the off-board ring). */
function center(col: number, row: number) {
  return { x: (col + 1) * CELL + CELL / 2, y: (row + 1) * CELL + CELL / 2 };
}

function isOffBoard(col: number, row: number): boolean {
  return col < 0 || col >= COLS || row < 0 || row >= ROWS;
}

/** A tiny canvas that draws a single prop, for the tool palette buttons. */
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
      ctx.fillRect(3, 15, 30, 8);
      ctx.fillStyle = '#4a515a';
      for (let x = 3; x < 33; x += 8) ctx.fillRect(x, 9, 5, 8);
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
    const cx = ((minC + maxC) / 2) * TILE;
    const cy = ((minR + maxR) / 2) * TILE;
    ctx.save();
    ctx.translate(cv.width / 2, cv.height / 2 + 7);
    ctx.scale(0.52 / span, 0.52 / span);
    ctx.translate(-cx, -cy);
    drawProp(ctx, kind, 0, 0, color);
    ctx.restore();
  }, [kind, color]);
  return <canvas ref={ref} width={36} height={40} className="ld-prop-icon" />;
}

/**
 * A colour selector: the native swatch picker plus a text field for typing or
 * pasting a hex code. The text is edited freely and committed on Enter/blur;
 * `#` is optional and 3-digit shorthand (`#6b5`) expands to full form. An
 * invalid entry snaps back to the current colour.
 */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
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
    <label className="ld-inline-color">
      {label}
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

/**
 * Interactive level designer. Draw the enemy path as a chain of turn points
 * (each move snaps horizontal/vertical), stamp cosmetic props onto off-path
 * cells, and pick the stage's floor/path colours — then Export copies a ready
 * `path:` / `theme:` / `decor:` block to paste into a level spec in
 * `domain/levels.ts`.
 */
export function LevelDesigner({ onClose }: Props) {
  const [turns, setTurns] = useState<Cell[]>([]);
  const [props, setProps] = useState<DecorProp[]>([]);
  const [tool, setTool] = useState<Tool>('path');
  // Which prop palette tab is showing (Castle interior vs. Capital townscape).
  const [propTab, setPropTab] = useState<PropCategory>('castle');
  const [bannerColor, setBannerColor] = useState(DEFAULT_BANNER_COLOR);
  const [copied, setCopied] = useState(false);

  // Board skin (colours). Off by default so a plain level exports no theme.
  const [themeOn, setThemeOn] = useState(false);
  const [groundEven, setGroundEven] = useState(DEFAULT_THEME.groundEven);
  const [groundOdd, setGroundOdd] = useState(DEFAULT_THEME.groundOdd);
  const [customPath, setCustomPath] = useState(false);
  const [pathOuter, setPathOuter] = useState(DEFAULT_PATH_LAYERS[0][0]);
  const [pathFill, setPathFill] = useState(DEFAULT_PATH_LAYERS[1][0]);
  const [pathCenter, setPathCenter] = useState(DEFAULT_PATH_LAYERS[2][0]);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Full corridor of cells the path occupies (for highlighting).
  const pathCells = useMemo(() => {
    const set = new Set<string>();
    if (turns.length >= 1) {
      for (const c of expandPathCells(turns)) set.add(cellKey(c.col, c.row));
    }
    return set;
  }, [turns]);

  // Repaint the prop-preview canvas whenever the props change.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, GRID_W, GRID_H);
    for (const p of props) {
      ctx.save();
      if (p.kind === 'battlements') {
        // The band ignores its cell and hugs the top wall of the board area.
        ctx.translate(CELL, CELL);
      } else {
        const c = center(p.col, p.row);
        ctx.translate(c.x, c.y);
      }
      ctx.scale(PROP_SCALE, PROP_SCALE);
      drawProp(ctx, p.kind, 0, 0, p.color);
      ctx.restore();
    }
  }, [props]);

  const code = useMemo(() => {
    const lines: string[] = [];
    if (turns.length >= 2) {
      const body = turns.map((t) => `{ col: ${t.col}, row: ${t.row} }`).join(', ');
      lines.push(`path: [${body}],`);
    }
    if (themeOn) {
      const parts = [`groundEven: '${groundEven}'`, `groundOdd: '${groundOdd}'`];
      if (customPath) {
        parts.push(
          `path: [['${pathOuter}', ${TILE - 4}], ['${pathFill}', ${TILE - 12}], ['${pathCenter}', ${TILE - 26}]]`,
        );
      }
      lines.push(`theme: { ${parts.join(', ')} },`);
    }
    if (props.length > 0) {
      const items = props
        .map((p) => {
          const extra = p.color ? `, color: '${p.color}'` : '';
          return `  { kind: '${p.kind}', col: ${p.col}, row: ${p.row}${extra} },`;
        })
        .join('\n');
      lines.push(`decor: [\n${items}\n],`);
    }
    return lines.join('\n');
  }, [turns, props, themeOn, groundEven, groundOdd, customPath, pathOuter, pathFill, pathCenter]);

  const hasContent = turns.length >= 2 || props.length > 0 || themeOn;

  /** Extend the path toward a clicked cell, snapping to a horizontal/vertical move. */
  const addPoint = (col: number, row: number) => {
    setCopied(false);
    setTurns((prev) => {
      if (prev.length === 0) return [{ col, row }];
      const last = prev[prev.length - 1];
      if (last.col === col && last.row === row) return prev;
      const dCol = col - last.col;
      const dRow = row - last.row;
      // Snap to the dominant axis so every segment stays axis-aligned.
      const next: Cell =
        Math.abs(dCol) >= Math.abs(dRow)
          ? { col, row: last.row }
          : { col: last.col, row };
      if (next.col === last.col && next.row === last.row) return prev;
      return [...prev, next];
    });
  };

  /** Stamp / toggle a prop of the active kind onto a board cell. */
  const placeProp = (col: number, row: number, kind: PropKind) => {
    if (isOffBoard(col, row)) return; // props live on the board, not the ring
    setCopied(false);
    setProps((prev) => {
      const here = prev.find((p) => p.col === col && p.row === row);
      // Clicking the same kind again clears the cell; otherwise (re)place it.
      if (here && here.kind === kind) {
        return prev.filter((p) => !(p.col === col && p.row === row));
      }
      const rest = prev.filter((p) => !(p.col === col && p.row === row));
      const np: DecorProp = { kind, col, row };
      if (kind === 'banner') np.color = bannerColor;
      return [...rest, np];
    });
  };

  const onCellClick = (col: number, row: number) => {
    if (tool === 'path') addPoint(col, row);
    else placeProp(col, row, tool);
  };

  /** Right-click always clears any prop on the cell, whatever the tool. */
  const onCellContext = (e: MouseEvent, col: number, row: number) => {
    e.preventDefault();
    setProps((prev) => {
      if (!prev.some((p) => p.col === col && p.row === row)) return prev;
      setCopied(false);
      return prev.filter((p) => !(p.col === col && p.row === row));
    });
  };

  const undo = () => {
    setCopied(false);
    setTurns((t) => t.slice(0, -1));
  };
  const clearPath = () => {
    setCopied(false);
    setTurns([]);
  };
  const clearProps = () => {
    setCopied(false);
    setProps([]);
  };

  const exportCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the preview box below lets the user copy manually.
      setCopied(false);
    }
  };

  const startCell = turns[0];
  const endCell = turns[turns.length - 1];
  const startOk = startCell ? isOffBoard(startCell.col, startCell.row) : true;
  const endOk = endCell ? isOffBoard(endCell.col, endCell.row) : true;

  // Portalled to <body>: the TopBar (which renders Settings → this designer)
  // has a backdrop-filter, which would otherwise trap this fixed overlay inside
  // the 62px header instead of covering the viewport.
  return createPortal(
    <div className="modal-backdrop ld-backdrop" onClick={onClose}>
      <div
        className="panel modal level-designer-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2>🗺️ Level Designer</h2>
        <p className="hint" style={{ marginTop: -4 }}>
          Pick the <b>Path</b> tool and click cells to draw the enemy route
          (moves snap horizontally/vertically; start and end on the shaded
          off-board ring). Pick a <b>prop</b> to stamp decorations on the board —
          click again or right-click to remove one. Then Export the snippet.
        </p>

        {/* The Path tool sits above the prop tabs — it isn't a decoration. */}
        <div className="ld-tools">
          <button
            type="button"
            className={`ld-tool${tool === 'path' ? ' active' : ''}`}
            onClick={() => setTool('path')}
            title="Draw the enemy path"
          >
            <span className="ld-tool-glyph">🛣️</span>
            <span className="ld-tool-label">Path</span>
          </button>
        </div>

        {/* Prop palette, split into Castle / Capital tabs. */}
        <div className="ld-prop-tabs" role="tablist">
          {PROP_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={propTab === cat.id}
              className={`ld-prop-tab${propTab === cat.id ? ' active' : ''}`}
              onClick={() => setPropTab(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="ld-tools">
          {PROP_PALETTE.filter((p) => p.category === propTab).map((p) => (
            <button
              key={p.kind}
              type="button"
              className={`ld-tool${tool === p.kind ? ' active' : ''}`}
              onClick={() => setTool(p.kind)}
              title={`Place ${p.label}`}
            >
              <PropIcon kind={p.kind} color={p.kind === 'banner' ? bannerColor : p.color} />
              <span className="ld-tool-label">{p.label}</span>
            </button>
          ))}
        </div>

        {tool === 'banner' && (
          <ColorField label="Banner colour" value={bannerColor} onChange={setBannerColor} />
        )}

        <div
          className="ld-grid"
          style={{
            width: GRID_W,
            height: GRID_H,
            gridTemplateColumns: `repeat(${COL_RANGE.length}, ${CELL}px)`,
            gridTemplateRows: `repeat(${ROW_RANGE.length}, ${CELL}px)`,
          }}
        >
          {ROW_RANGE.map((r) =>
            COL_RANGE.map((c) => {
              const key = cellKey(c, r);
              const off = isOffBoard(c, r);
              const isPath = pathCells.has(key);
              const classes = ['ld-cell'];
              if (off) classes.push('off');
              if (isPath) classes.push('path');
              // Live preview of the chosen floor / path colours.
              const style: CSSProperties = {};
              if (themeOn && !off) {
                style.background = isPath
                  ? customPath
                    ? pathFill
                    : DEFAULT_PATH_LAYERS[1][0]
                  : (c + r) % 2 === 0
                    ? groundEven
                    : groundOdd;
              }
              return (
                <button
                  key={key}
                  type="button"
                  className={classes.join(' ')}
                  style={style}
                  title={`col ${c}, row ${r}`}
                  onClick={() => onCellClick(c, r)}
                  onContextMenu={(e) => onCellContext(e, c, r)}
                />
              );
            }),
          )}

          {/* Prop preview, under the path markers so turns stay legible. */}
          <canvas ref={canvasRef} className="ld-overlay" width={GRID_W} height={GRID_H} />

          <svg className="ld-overlay" width={GRID_W} height={GRID_H}>
            {turns.length >= 2 && (
              <polyline
                points={turns.map((t) => {
                  const p = center(t.col, t.row);
                  return `${p.x},${p.y}`;
                }).join(' ')}
                fill="none"
                stroke="#f2b23c"
                strokeWidth={4}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.9}
              />
            )}
            {turns.map((t, i) => {
              const p = center(t.col, t.row);
              const isStart = i === 0;
              const isEnd = i === turns.length - 1;
              const fill = isStart ? '#5fd38a' : isEnd ? '#6fd6ff' : '#f2b23c';
              return (
                <g key={`${t.col},${t.row},${i}`}>
                  <circle cx={p.x} cy={p.y} r={9} fill={fill} stroke="#0d1526" strokeWidth={2} />
                  <text
                    x={p.x}
                    y={p.y + 3.5}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={800}
                    fill="#0d1526"
                  >
                    {i + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="ld-legend">
          <span><i className="dot start" /> Spawn</span>
          <span><i className="dot end" /> Base</span>
          <span><i className="dot turn" /> Turn</span>
          <span className="ld-count">
            {turns.length} point{turns.length === 1 ? '' : 's'} · {props.length} prop
            {props.length === 1 ? '' : 's'}
          </span>
        </div>

        {turns.length > 0 && (!startOk || !endOk) && (
          <p className="hint ld-warn">
            ⚠ {!startOk && 'The spawn (point 1) is on the board, not the off-board ring. '}
            {!endOk && 'The base (last point) is on the board, not the off-board ring. '}
            Enemies normally enter and exit off-board.
          </p>
        )}

        {/* Background colours. */}
        <div className="ld-theme">
          <label className="ld-check">
            <input
              type="checkbox"
              checked={themeOn}
              onChange={(e) => setThemeOn(e.target.checked)}
            />
            Customize background colours
          </label>
          {themeOn && (
            <div className="ld-theme-body">
              <ColorField label="Floor A" value={groundEven} onChange={setGroundEven} />
              <ColorField label="Floor B" value={groundOdd} onChange={setGroundOdd} />
              <label className="ld-check">
                <input
                  type="checkbox"
                  checked={customPath}
                  onChange={(e) => setCustomPath(e.target.checked)}
                />
                Custom path colours
              </label>
              {customPath && (
                <div className="ld-theme-body">
                  <ColorField label="Border" value={pathOuter} onChange={setPathOuter} />
                  <ColorField label="Fill" value={pathFill} onChange={setPathFill} />
                  <ColorField label="Centre" value={pathCenter} onChange={setPathCenter} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ld-controls">
          <button className="btn ghost" onClick={undo} disabled={turns.length === 0}>
            ↶ Undo path
          </button>
          <button className="btn ghost" onClick={clearPath} disabled={turns.length === 0}>
            🗑 Clear path
          </button>
          <button className="btn ghost" onClick={clearProps} disabled={props.length === 0}>
            🗑 Clear props
          </button>
          <button
            className="btn primary"
            onClick={exportCode}
            disabled={!hasContent}
            style={{ marginLeft: 'auto' }}
          >
            {copied ? '✓ Copied!' : '⧉ Export to clipboard'}
          </button>
        </div>

        <label className="ld-code-label">
          Level code (paste the <code>path:</code>/<code>theme:</code>/<code>decor:</code>{' '}
          lines into a level spec in <code>domain/levels.ts</code>)
        </label>
        <textarea
          className="ld-code"
          readOnly
          rows={Math.min(10, Math.max(2, code.split('\n').length))}
          value={hasContent ? code : 'Draw a path, place props, or pick colours to generate the level code…'}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
    </div>,
    document.body,
  );
}

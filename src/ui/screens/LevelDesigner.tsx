import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { BOARD_HEIGHT, BOARD_WIDTH, COLS, ROWS, TILE, cellKey, expandPathCells, type Cell } from '../../domain/grid';
import {
  BASE_PROP_KINDS,
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
import { MOODS as MOOD_PRESETS, SECTION_MOODS, type Atmosphere, type MoodId } from '../../domain/atmosphere';
import { LEVELS, SECTIONS, type LevelDef, type SectionId } from '../../domain/levels';
import { ENDLESS_LEVELS, getBattleLevel } from '../../domain/endless';
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

/** Mood tabs: one per chapter, plus "Other" for presets no stage uses yet. */
type MoodTab = SectionId | 'other';
const MOOD_TABS: { id: MoodTab; label: string }[] = [
  ...SECTIONS.map((s) => ({ id: s.id as MoodTab, label: s.name })),
  { id: 'other', label: 'Other' },
];

/**
 * Mood choices: every named preset (exported as `mood: '<name>'`), then each
 * chapter's default (exported as nothing — a stage without `mood` gets it).
 * `tabs` is derived from the chapters of the stages using a preset, so the
 * sorting never needs maintaining; an unused preset lands in "Other".
 */
const MOODS: { key: string; label: string; mood: Atmosphere; preset?: MoodId; tabs: MoodTab[] }[] = [
  ...SECTIONS.map((s) => ({
    key: `section-${s.id}`,
    label: `${s.name} (chapter default)`,
    mood: SECTION_MOODS[s.id],
    tabs: [s.id as MoodTab],
  })),
  ...(Object.keys(MOOD_PRESETS) as MoodId[]).map((id) => {
    const users = LEVELS.filter((l) => l.mood === id);
    const tabs = [...new Set(users.map((l) => l.section as MoodTab))];
    return {
      key: id,
      label: users.length ? `${id} · ${users.map((l) => l.name).join(', ')}` : id,
      mood: MOOD_PRESETS[id],
      preset: id,
      tabs: tabs.length ? tabs : (['other'] as MoodTab[]),
    };
  }),
];

const isOffBoard = (col: number, row: number) => col < 0 || col >= COLS || row < 0 || row >= ROWS;
/** Centre of a cell in view pixels (accounting for the off-board ring). */
const viewCenter = (c: Cell) => ({ x: (c.col + 1) * TILE + TILE / 2, y: (c.row + 1) * TILE + TILE / 2 });
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Each path's colour on the designer canvas and in its tab. */
const LANE_COLORS = ['#e8bf5e', '#6fd6ff', '#ff8a7a', '#c39bff', '#7fd38a', '#f2a65a'];
const laneColor = (i: number) => LANE_COLORS[i % LANE_COLORS.length];

/** Snap a clicked cell to a straight (horizontal or vertical) move from `last`. */
const snapFrom = (last: Cell | undefined, c: Cell): Cell =>
  !last ? c : Math.abs(c.col - last.col) >= Math.abs(c.row - last.row) ? { col: c.col, row: last.row } : { col: last.col, row: c.row };

/** Where cell `c` lies on a path: the index of the turn ending the segment it's on, or -1. */
function segmentEndAt(path: Cell[], c: Cell): number {
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const onRow = a.row === b.row && c.row === a.row && c.col >= Math.min(a.col, b.col) && c.col <= Math.max(a.col, b.col);
    const onCol = a.col === b.col && c.col === a.col && c.row >= Math.min(a.row, b.row) && c.row <= Math.max(a.row, b.row);
    if (onRow || onCol) return i + 1;
  }
  return -1;
}

/** Another path that cell `c` lies on (for merging the active one into it). */
function findJoin(lanes: Cell[][], active: number, c: Cell): { lane: number; from: number } | null {
  for (let i = 0; i < lanes.length; i++) {
    if (i === active || lanes[i].length < 2) continue;
    const from = segmentEndAt(lanes[i], c);
    if (from >= 0) return { lane: i, from };
  }
  return null;
}

const cellList = (path: Cell[]) => `[${path.map((t) => `{ col: ${t.col}, row: ${t.row} }`).join(', ')}]`;

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
  // Every enemy path (lane), as turn points; clicks extend the active one.
  const [lanes, setLanes] = useState<Cell[][]>([[]]);
  const [active, setActive] = useState(0);
  // Earlier `lanes` snapshots, for Undo (a merge undoes in one step).
  const [history, setHistory] = useState<Cell[][][]>([]);
  // Clicking onto another path merges into it (copies the rest of its route).
  const [joinPaths, setJoinPaths] = useState(true);
  // Which spec the exported path code is shaped for.
  const [exportFor, setExportFor] = useState<'stage' | 'endless'>('stage');
  const turns = lanes[active] ?? [];
  const [props, setProps] = useState<DecorProp[]>([]);
  // The prop stamped by clicks while the Props panel is open.
  const [propKind, setPropKind] = useState<PropKind>('pillar');
  const [propTab, setPropTab] = useState<PropCategory>('castle');
  const [bannerColor, setBannerColor] = useState(DEFAULT_BANNER_COLOR);
  const [hover, setHover] = useState<Cell | null>(null);
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState('blank');
  const [section, setSection] = useState<SectionId>('castle');

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
  const [moodTab, setMoodTab] = useState<MoodTab>('castle');

  const viewRef = useRef<HTMLCanvasElement>(null);

  const pathCells = useMemo(() => {
    const set = new Set<string>();
    for (const lane of lanes) {
      if (lane.length >= 1) for (const c of expandPathCells(lane)) set.add(cellKey(c.col, c.row));
    }
    return set;
  }, [lanes]);
  // Paths long enough to walk (two or more points).
  const drawnLanes = useMemo(() => lanes.filter((l) => l.length >= 2), [lanes]);

  const theme = useMemo<BoardTheme | undefined>(() => {
    if (!themeOn) return undefined;
    const t: BoardTheme = { groundEven, groundOdd, floor, pathKind };
    if (customPath) t.path = [[pathOuter, TILE - 4], [pathFill, TILE - 12], [pathCenter, TILE - 26]];
    return t;
  }, [themeOn, groundEven, groundOdd, floor, pathKind, customPath, pathOuter, pathFill, pathCenter]);

  const moodChoice = MOODS.find((m) => m.key === moodKey) ?? MOODS[0];
  const mood = moodChoice.mood;

  // A throwaway engine for the live preview, rebuilt whenever the design
  // changes (id -1: no built-in theme, legacy decor or mood is keyed to it).
  const engine = useMemo(() => {
    const base = LEVELS[0];
    const level: LevelDef = {
      ...base,
      id: -1,
      section,
      lanes: drawnLanes.map((pathTurns) => ({ pathTurns, waves: [] })),
      theme: theme ?? { ...DEFAULT_THEME },
      decor: props,
      atmosphere: mood,
    };
    return new GameEngine(level, 0);
  }, [drawnLanes, props, theme, mood, section]);

  // Paint loop: the real board (so flames flicker and weather drifts), framed
  // by the off-board ring, with the path markers and the hover ghost on top.
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const drawState = useRef({ panel, lanes, active, joinPaths, props, propKind, bannerColor, pathCells });
  drawState.current = { panel, lanes, active, joinPaths, props, propKind, bannerColor, pathCells };
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
          const cur = s.lanes[s.active] ?? [];
          const last = cur[cur.length - 1];
          const next = snapFrom(last, h);
          const color = laneColor(s.active);
          if (last) {
            const a = viewCenter(last);
            const b = viewCenter(next);
            view.save();
            view.setLineDash([6, 6]);
            view.strokeStyle = color;
            view.globalAlpha = 0.8;
            view.lineWidth = 3;
            view.beginPath();
            view.moveTo(a.x, a.y);
            view.lineTo(b.x, b.y);
            view.stroke();
            view.restore();
          }
          // Landing on another path: show the merge (its remaining route is
          // copied onto this one, so both reach the same castle).
          const join = last && s.joinPaths ? findJoin(s.lanes, s.active, next) : null;
          if (join) {
            const target = s.lanes[join.lane];
            view.save();
            view.setLineDash([4, 6]);
            view.strokeStyle = laneColor(join.lane);
            view.lineWidth = 5;
            view.globalAlpha = 0.7;
            view.beginPath();
            const n = viewCenter(next);
            view.moveTo(n.x, n.y);
            for (const t of target.slice(join.from)) {
              const p = viewCenter(t);
              view.lineTo(p.x, p.y);
            }
            view.stroke();
            view.setLineDash([]);
            view.globalAlpha = 1;
            view.lineWidth = 3;
            view.beginPath();
            view.arc(n.x, n.y, 17, 0, Math.PI * 2);
            view.stroke();
            view.font = '800 12px Inter, system-ui, sans-serif';
            view.textAlign = 'center';
            view.fillStyle = '#fff6dc';
            view.strokeStyle = '#0c0e1c';
            view.lineWidth = 3;
            const label = `Merge into path ${join.lane + 1}`;
            view.strokeText(label, n.x, n.y - 24);
            view.fillText(label, n.x, n.y - 24);
            view.restore();
          }
          view.strokeStyle = color;
          view.lineWidth = 2;
          view.strokeRect((next.col + 1) * TILE + 2, (next.row + 1) * TILE + 2, TILE - 4, TILE - 4);
        }
      }

      // Every path's route and turn markers, each in its own colour: the one
      // being edited bold, the others (and all of them outside the Path
      // panel) faint. The active path draws last so it sits on top.
      const order = s.lanes.map((_, i) => i).filter((i) => i !== s.active).concat(s.active < s.lanes.length ? [s.active] : []);
      for (const li of order) {
        const lane = s.lanes[li];
        const editing = s.panel === 'path';
        const strong = editing && li === s.active;
        const color = laneColor(li);
        if (lane.length >= 2) {
          view.save();
          view.globalAlpha = strong ? 0.9 : editing ? 0.5 : 0.35;
          view.strokeStyle = color;
          view.lineWidth = 3;
          view.lineJoin = 'round';
          view.beginPath();
          lane.forEach((t, i) => {
            const p = viewCenter(t);
            if (i === 0) view.moveTo(p.x, p.y);
            else view.lineTo(p.x, p.y);
          });
          view.stroke();
          view.restore();
        }
        lane.forEach((t, i) => {
          const p = viewCenter(t);
          const last = i === lane.length - 1;
          view.save();
          view.globalAlpha = strong ? 1 : editing ? 0.6 : 0.45;
          view.fillStyle = i === 0 ? '#7fd38a' : last ? '#6fb6ff' : color;
          view.strokeStyle = i === 0 || last ? color : '#0c0e1c';
          view.lineWidth = 2.5;
          view.beginPath();
          view.arc(p.x, p.y, strong ? 11 : 9, 0, Math.PI * 2);
          view.fill();
          view.stroke();
          view.fillStyle = '#0c0e1c';
          view.font = `800 ${strong ? 12 : 10}px Inter, system-ui, sans-serif`;
          view.textAlign = 'center';
          view.textBaseline = 'middle';
          // Spawns are labelled with their path letter, turns with their order.
          view.fillText(i === 0 ? `P${li + 1}` : String(i + 1), p.x, p.y + 0.5);
          view.restore();
        });
      }
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

  /** Apply a path edit, remembering the previous paths for Undo. */
  const editLanes = (fn: (prev: Cell[][]) => Cell[][]) => {
    const next = fn(lanes);
    if (next === lanes) return;
    touch();
    setHistory((h) => [...h.slice(-99), lanes]);
    setLanes(next);
  };

  /**
   * Extend the active path toward a clicked cell, snapping to a horizontal/
   * vertical move. Landing on another path (with merging on) copies the rest of
   * that path's route, so the two converge and share its castle.
   */
  const addPoint = (c: Cell) =>
    editLanes((prev) => {
      const cur = prev[active] ?? [];
      const last = cur[cur.length - 1];
      const next = snapFrom(last, c);
      if (last && next.col === last.col && next.row === last.row) return prev;
      let path = [...cur, next];
      const join = last && joinPaths ? findJoin(prev, active, next) : null;
      if (join) {
        const tail = prev[join.lane].slice(join.from).filter((t, k) => !(k === 0 && t.col === next.col && t.row === next.row));
        path = [...path, ...tail.map((t) => ({ ...t }))];
      }
      return prev.map((l, i) => (i === active ? path : l));
    });

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    touch();
    setHistory((h) => h.slice(0, -1));
    setLanes(prev);
    setActive((a) => Math.min(a, prev.length - 1));
  };

  const clearLane = () => editLanes((prev) => prev.map((l, i) => (i === active ? [] : l)));

  const addLane = () => {
    editLanes((prev) => [...prev, []]);
    setActive(lanes.length);
  };

  const removeLane = () => {
    if (lanes.length <= 1) return clearLane();
    editLanes((prev) => prev.filter((_, i) => i !== active));
    setActive((a) => Math.max(0, a - 1));
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
    setHistory([]);
    setActive(0);
    if (key === 'blank') {
      setLanes([[]]);
      setProps([]);
      setThemeOn(false);
      setExportFor('stage');
      setGroundEven(DEFAULT_THEME.groundEven);
      setGroundOdd(DEFAULT_THEME.groundOdd);
      setFloor('stone');
      setPathKind('dirt');
      setCustomPath(false);
      setSection('castle');
      setMoodKey('section-castle');
      setMoodTab('castle');
      return;
    }
    const lvl = getBattleLevel(Number(key));
    if (!lvl) return;
    const loaded = lvl.lanes.map((l) => l.pathTurns.map((t) => ({ ...t })));
    setLanes(loaded.length > 0 ? loaded : [[]]);
    setExportFor(lvl.endless ? 'endless' : 'stage');
    setProps((lvl.decor ?? []).map((p) => ({ ...p })));
    setSection(lvl.section);
    setMoodKey(lvl.mood ?? `section-${lvl.section}`);
    setMoodTab(lvl.section);
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
    // Stage specs take `path` (one lane) or `lanes` (several, each with its own
    // waves); endless specs take `paths` and roll the waves themselves.
    if (exportFor === 'endless' && drawnLanes.length > 0) {
      lines.push(`paths: [\n${drawnLanes.map((l) => `  ${cellList(l)},`).join('\n')}\n],`);
    } else if (drawnLanes.length === 1) {
      lines.push(`path: ${cellList(drawnLanes[0])},`);
    } else if (drawnLanes.length > 1) {
      lines.push(`lanes: [\n${drawnLanes.map((l) => `  { path: ${cellList(l)}, waves: [] },`).join('\n')}\n],`);
    }
    if (theme) {
      const parts = [`groundEven: '${theme.groundEven}'`, `groundOdd: '${theme.groundOdd}'`, `floor: '${theme.floor}'`];
      if (theme.path) parts.push(`path: [${theme.path.map(([c, w]) => `['${c}', ${w}]`).join(', ')}]`);
      parts.push(`pathKind: '${theme.pathKind}'`);
      lines.push(`theme: { ${parts.join(', ')} },`);
    }
    if (props.length > 0) {
      const items = props
        .map((p) => `  { kind: '${p.kind}', col: ${p.col}, row: ${p.row}${p.color ? `, color: '${p.color}'` : ''}${p.lit ? ', lit: true' : ''} },`)
        .join('\n');
      lines.push(`decor: [\n${items}\n],`);
    }
    if (moodChoice.preset) lines.push(`mood: '${moodChoice.preset}',`);
    return lines.join('\n');
  }, [drawnLanes, exportFor, props, theme, moodChoice]);

  const hasContent = drawnLanes.length > 0 || props.length > 0 || themeOn || !!moodChoice.preset;

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

  // Per-path sanity: spawns belong on the off-board ring, and so do castles —
  // unless a base prop (castle, gate, sewer mouth) stands at the path's end.
  const laneIssues = lanes.flatMap((lane, i) => {
    if (lane.length === 0) return [];
    const start = lane[0];
    const end = lane[lane.length - 1];
    const endProp = propAt(props, end);
    const startOk = isOffBoard(start.col, start.row);
    const endOk = isOffBoard(end.col, end.row) || (endProp != null && BASE_PROP_KINDS.has(endProp.kind));
    const issues: string[] = [];
    if (!startOk) issues.push('its spawn (first point) is on the board');
    if (!endOk) issues.push('its castle (last point) is on the board with no castle, gate or sewer entrance there');
    return issues.length ? [`Path ${i + 1}: ${issues.join(', and ')}.`] : [];
  });
  const totalPoints = lanes.reduce((n, l) => n + l.length, 0);
  // A base prop at the path's end is the base itself, not an obstruction.
  const blocked = props.filter(
    (p) =>
      p.kind !== 'battlements' &&
      !BASE_PROP_KINDS.has(p.kind) &&
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
              {ENDLESS_LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {`Endless · ${l.name}`}
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
                <div className="ld-choice ld-lanes" role="tablist" aria-label="Paths">
                  {lanes.map((l, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={i === active}
                      className={i === active ? 'active' : undefined}
                      style={{ '--lane': laneColor(i) } as CSSProperties}
                      onClick={() => setActive(i)}
                    >
                      <i className="ld-lane-dot" /> Path {i + 1}
                      <small>{l.length}</small>
                    </button>
                  ))}
                  <button type="button" onClick={addLane} title="Start another enemy path">
                    <Icon name="plus" /> Add path
                  </button>
                </div>
                <label className="ld-check">
                  <input type="checkbox" checked={joinPaths} onChange={(e) => setJoinPaths(e.target.checked)} />
                  Merge when clicking onto another path
                </label>
                <div className="ld-row">
                  <button className="btn ghost ld-small" onClick={undo} disabled={history.length === 0}>
                    <Icon name="undo" /> Undo
                  </button>
                  <button className="btn ghost ld-small" onClick={clearLane} disabled={turns.length === 0}>
                    <Icon name="close" /> Clear path
                  </button>
                  {lanes.length > 1 && (
                    <button className="btn ghost ld-small" onClick={removeLane}>
                      <Icon name="close" /> Remove path
                    </button>
                  )}
                </div>
                <div className="ld-legend">
                  <span><i className="dot start" /> Spawn</span>
                  <span><i className="dot turn" /> Turn</span>
                  <span><i className="dot end" /> Castle</span>
                </div>
              </div>
            )}

            {panel === 'props' && (
              <div className="ld-panel">
                <label className="ld-source ld-category">
                  <span>Category</span>
                  <select value={propTab} onChange={(e) => setPropTab(e.target.value as PropCategory)}>
                    {PROP_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </label>
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
                <label className="ld-source ld-category">
                  <span>Category</span>
                  <select value={moodTab} onChange={(e) => setMoodTab(e.target.value as MoodTab)}>
                    {MOOD_TABS.map((tab) => (
                      <option key={tab.id} value={tab.id}>{tab.label}</option>
                    ))}
                  </select>
                </label>
                <div className="ld-moods">
                  {MOODS.filter((m) => m.tabs.includes(moodTab)).map((m) => (
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
                {moodTab === 'other' && !MOODS.some((m) => m.tabs.includes('other')) && (
                  <p className="ld-help">Every preset is in use. New presets added to <code>MOODS</code> show up here until a stage picks them.</p>
                )}
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
                {lanes.length} path{lanes.length === 1 ? '' : 's'} · {totalPoints} point{totalPoints === 1 ? '' : 's'} ·{' '}
                {props.length} prop{props.length === 1 ? '' : 's'}
              </span>
            </div>
            {laneIssues.length > 0 && (
              <p className="ld-warn">
                <Icon name="info" /> {laneIssues.join(' ')} Enemies normally enter and exit off-board.
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
              {exportFor === 'endless' ? (
                <>
                  Level code — paste the <code>paths:</code> / <code>theme:</code> / <code>decor:</code> / <code>mood:</code> lines into an
                  endless spec in <code>domain/endless.ts</code>
                </>
              ) : (
                <>
                  Level code — paste the <code>{drawnLanes.length > 1 ? 'lanes:' : 'path:'}</code> / <code>theme:</code> /{' '}
                  <code>decor:</code> / <code>mood:</code> lines into a level spec in <code>domain/levels.ts</code>
                  {drawnLanes.length > 1 && ' (then fill in each lane’s waves)'}
                </>
              )}
            </span>
            <Choice value={exportFor} options={['stage', 'endless'] as const} onChange={(v) => (touch(), setExportFor(v))} />
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

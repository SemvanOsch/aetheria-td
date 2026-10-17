/**
 * The visual board editor, drawn by the game's own renderer (`drawBoard`) on a
 * throwaway `GameEngine` — terrain, props with their lights, and the stage's
 * mood preview live. Builds on the Level Designer's tools: draw lane paths as
 * turn points (legs snap straight; clicking onto another lane merges into it),
 * stamp/move/remove props, pick floor and path materials and the mood. Every
 * change is an undoable project edit. Overlays show path cells, prop
 * footprints, buildable cells and validation problems.
 *
 * Keyboard: focus the board, move the cursor with the arrow keys, Enter acts
 * like a click and Delete like a right-click.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { BOARD_HEIGHT, BOARD_WIDTH, COLS, ROWS, TILE, cellKey, expandPathCells, type Cell } from '@game/domain/grid';
import { BASE_PROP_KINDS, DEFAULT_BANNER_COLOR, DEFAULT_PATH_LAYERS, DEFAULT_THEME, PROP_CATEGORIES, PROP_PALETTE, propCells, propFootprint, type DecorProp, type PropCategory, type PropKind } from '@game/domain/decor';
import { GameEngine } from '@game/engine/GameEngine';
import { drawBoard, drawProp } from '@game/engine/renderer';
import { useEditor } from '../../store/projectStore';
import { edit, setOpt } from '../../store/edits';
import { levelToDef } from '../../model/convert';
import { FLOOR_KINDS, LIGHTABLE_PROPS, MOOD_IDS, MOODS, PATH_KINDS, SECTION_MOODS, SECTIONS, propLabel, sectionName } from '../../model/catalog';
import type { EditorLevel } from '../../model/types';
import { issuesAt, validateProject } from '../../validation/validate';
import { levelKey } from '../../model/entities';
import { Button, ColorInput, Field, IssueList, NumberInput, Segmented, Toggle } from '../kit';
import { useConfirm } from '../kitHooks';
import { Icon } from '../Icon';
import { laneColor } from './laneColors';

const VIEW_W = (COLS + 2) * TILE;
const VIEW_H = (ROWS + 2) * TILE;
const NO_UI = { hoverCol: -1, hoverRow: -1, selectedUnitId: null, selectedTowerUid: null };

type Mode = 'path' | 'props' | 'ground' | 'mood' | 'inspect';
type PropTool = 'stamp' | 'select';

const isOffBoard = (c: Cell) => c.col < 0 || c.col >= COLS || c.row < 0 || c.row >= ROWS;
const inRing = (c: Cell) => c.col >= -1 && c.col <= COLS && c.row >= -1 && c.row <= ROWS;
const viewCenter = (c: Cell) => ({ x: (c.col + 1) * TILE + TILE / 2, y: (c.row + 1) * TILE + TILE / 2 });
const same = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;
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

function findJoin(paths: Cell[][], active: number, c: Cell): { lane: number; from: number } | null {
  for (let i = 0; i < paths.length; i++) {
    if (i === active || paths[i].length < 2) continue;
    const from = segmentEndAt(paths[i], c);
    if (from >= 0) return { lane: i, from };
  }
  return null;
}

const propAt = (list: readonly DecorProp[], c: Cell) =>
  list.findIndex((p) => p.kind !== 'battlements' && propCells(p).some((q) => same(q, c)));

/** A tiny canvas drawing one prop, for the palette. */
function PropIcon({ kind, color }: { kind: PropKind; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (kind === 'battlements') {
      ctx.fillStyle = '#3a4048';
      ctx.fillRect(6, 30, 60, 16);
      ctx.fillStyle = '#4a515a';
      for (let x = 6; x < 66; x += 16) ctx.fillRect(x, 18, 10, 16);
      return;
    }
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
    try {
      drawProp(ctx, kind, 0, 0, color);
    } catch {
      // A prop that can't draw out of context keeps an empty tile.
    }
    ctx.restore();
  }, [kind, color]);
  return <canvas ref={ref} width={72} height={76} className="ed-prop-icon" aria-hidden="true" />;
}

export function BoardEditor({ level }: { level: EditorLevel }) {
  const { working } = useEditor();
  const confirm = useConfirm();
  const [mode, setMode] = useState<Mode>('path');
  const [active, setActive] = useState(0);
  const [joinPaths, setJoinPaths] = useState(true);
  const [propKind, setPropKind] = useState<PropKind>('pillar');
  const [propTab, setPropTab] = useState<PropCategory>('castle');
  const [propTool, setPropTool] = useState<PropTool>('stamp');
  const [bannerColor, setBannerColor] = useState(DEFAULT_BANNER_COLOR);
  const [selectedProp, setSelectedProp] = useState<number | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [cursor, setCursor] = useState<Cell>({ col: 0, row: 0 });
  const [overlays, setOverlays] = useState({ cells: false, footprints: false, build: false, issues: true });
  const drag = useRef<{ kind: 'point' | 'prop'; index: number; from: Cell; moved: boolean } | null>(null);
  const [dragAt, setDragAt] = useState<Cell | null>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);

  const lane = Math.min(active, Math.max(0, level.lanes.length - 1));
  const decor = useMemo(() => level.decor ?? [], [level.decor]);
  const paths = useMemo(() => level.lanes.map((l) => l.path), [level.lanes]);
  const set = (label: string, fn: (d: EditorLevel) => void, key?: string) => edit.level(level.id, label, fn, key);
  const issues = issuesAt(validateProject(working), levelKey(level.id));
  const boardIssues = issues.filter((i) => /^(decor|theme|mood)/.test(i.field ?? '') || /\.path$/.test(i.field ?? ''));

  // A preview engine for the board's look: every lane drawn (hidden reveal
  // lanes too), no waves (so no foe lookups), rebuilt when the board changes.
  const boardKey = JSON.stringify([paths, decor, level.theme, level.mood, level.mist, level.section]);
  const engine = useMemo(() => {
    try {
      const def = levelToDef({ ...level, id: -1, lanes: level.lanes.filter((l) => l.path.length >= 2).map((l) => ({ path: l.path, waves: [] })) });
      return new GameEngine(def, 0);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey]);

  const pathCells = useMemo(() => {
    const s = new Set<string>();
    for (const p of paths) if (p.length >= 2) for (const c of expandPathCells(p)) s.add(cellKey(c.col, c.row));
    return s;
  }, [paths]);

  // Cells with a validation problem (path legs, props) for the issues overlay.
  const issueCells = useMemo(() => {
    const out: { cell: Cell; severity: string }[] = [];
    level.lanes.forEach((l) => {
      l.path.forEach((c, i) => {
        const prev = l.path[i - 1];
        if (!inRing(c) || (prev && (same(prev, c) || (prev.col !== c.col && prev.row !== c.row)))) out.push({ cell: c, severity: 'error' });
      });
    });
    boardIssues.forEach((iss) => {
      const m = /^decor\.(\d+)/.exec(iss.field ?? '');
      const p = m ? decor[Number(m[1])] : undefined;
      if (p) out.push({ cell: { col: p.col, row: p.row }, severity: iss.severity });
    });
    return out;
  }, [level.lanes, boardIssues, decor]);

  // Paint loop.
  const live = useRef({ mode, lane, joinPaths, propKind, bannerColor, paths, decor, pathCells, overlays, issueCells, selectedProp, cursor, focused: false, dragAt, level });
  live.current = { mode, lane, joinPaths, propKind, bannerColor, paths, decor, pathCells, overlays, issueCells, selectedProp, cursor, focused: live.current.focused, dragAt, level };
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const paintRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const view = viewRef.current?.getContext('2d');
    if (!view) return;
    const board = document.createElement('canvas');
    board.width = BOARD_WIDTH;
    board.height = BOARD_HEIGHT;
    const bctx = board.getContext('2d')!;
    let raf = 0;
    const paint = () => {
      const s = live.current;
      const h = hoverRef.current ?? (s.focused ? s.cursor : null);
      view.fillStyle = '#06070d';
      view.fillRect(0, 0, VIEW_W, VIEW_H);
      if (engine) {
        try {
          drawBoard(bctx, engine, NO_UI);
        } catch {
          // A broken draft board just shows the grid.
        }
      }
      // Grid.
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
      for (const key of s.pathCells) {
        const [c, r] = key.split(',').map(Number);
        if (!isOffBoard({ col: c, row: r })) continue;
        view.fillStyle = 'rgba(232, 191, 94, 0.16)';
        view.fillRect((c + 1) * TILE, (r + 1) * TILE, TILE, TILE);
      }
      if (engine) view.drawImage(board, TILE, TILE);
      view.strokeStyle = 'rgba(232, 191, 94, 0.5)';
      view.strokeRect(TILE + 0.5, TILE + 0.5, BOARD_WIDTH - 1, BOARD_HEIGHT - 1);

      // Overlays.
      if (s.overlays.build) {
        const blocked = new Set([...s.pathCells]);
        for (const p of s.decor) for (const c of propCells(p)) blocked.add(cellKey(c.col, c.row));
        for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < ROWS; r++) {
            const ok = !blocked.has(cellKey(c, r));
            view.fillStyle = ok ? 'rgba(127, 211, 138, 0.16)' : 'rgba(255, 90, 80, 0.14)';
            view.fillRect((c + 1) * TILE + 3, (r + 1) * TILE + 3, TILE - 6, TILE - 6);
          }
        }
      }
      if (s.overlays.cells) {
        s.paths.forEach((p, li) => {
          if (p.length < 2) return;
          view.fillStyle = `${laneColor(li)}33`;
          for (const c of expandPathCells(p)) view.fillRect((c.col + 1) * TILE + 6, (c.row + 1) * TILE + 6, TILE - 12, TILE - 12);
        });
      }
      if (s.overlays.footprints || s.mode === 'props') {
        s.decor.forEach((p, i) => {
          const cells = propCells(p);
          view.strokeStyle = i === s.selectedProp ? '#e8bf5e' : BASE_PROP_KINDS.has(p.kind) ? 'rgba(111, 182, 255, 0.7)' : 'rgba(255, 255, 255, 0.28)';
          view.lineWidth = i === s.selectedProp ? 2.5 : 1.2;
          for (const c of cells) view.strokeRect((c.col + 1) * TILE + 2.5, (c.row + 1) * TILE + 2.5, TILE - 5, TILE - 5);
          if (cells.length === 0) {
            view.setLineDash([3, 4]);
            view.strokeRect((p.col + 1) * TILE + 8.5, (p.row + 1) * TILE + 8.5, TILE - 17, TILE - 17);
            view.setLineDash([]);
          }
        });
      }

      // Lane routes and turn markers (the active lane bold on top).
      const order = s.paths.map((_, i) => i).filter((i) => i !== s.lane).concat(s.lane < s.paths.length ? [s.lane] : []);
      for (const li of order) {
        const p = s.paths[li];
        const editing = s.mode === 'path';
        const strong = editing && li === s.lane;
        const color = laneColor(li);
        const hidden = s.level.lanes[li]?.revealAtWave !== undefined;
        if (p.length >= 2) {
          view.save();
          view.globalAlpha = strong ? 0.95 : editing ? 0.5 : 0.4;
          view.strokeStyle = color;
          view.lineWidth = 3;
          view.lineJoin = 'round';
          if (hidden) view.setLineDash([8, 6]);
          view.beginPath();
          p.forEach((t, i) => {
            const v = viewCenter(t);
            if (i === 0) view.moveTo(v.x, v.y);
            else view.lineTo(v.x, v.y);
          });
          view.stroke();
          view.restore();
        }
        p.forEach((t, i) => {
          const v = viewCenter(s.dragAt && drag.current?.kind === 'point' && strong && drag.current.index === i ? s.dragAt : t);
          const last = i === p.length - 1;
          view.save();
          view.globalAlpha = strong ? 1 : editing ? 0.6 : 0.45;
          view.fillStyle = i === 0 ? '#7fd38a' : last ? '#6fb6ff' : color;
          view.strokeStyle = i === 0 || last ? color : '#0c0e1c';
          view.lineWidth = 2.5;
          view.beginPath();
          view.arc(v.x, v.y, strong ? 11 : 9, 0, Math.PI * 2);
          view.fill();
          view.stroke();
          view.fillStyle = '#0c0e1c';
          view.font = `800 ${strong ? 12 : 10}px Inter, system-ui, sans-serif`;
          view.textAlign = 'center';
          view.textBaseline = 'middle';
          view.fillText(i === 0 ? `L${li + 1}` : String(i + 1), v.x, v.y + 0.5);
          view.restore();
        });
      }

      // Boss halt flag.
      const halt = s.level.bossHaltAt;
      if (halt) {
        const v = viewCenter(halt);
        view.save();
        view.strokeStyle = '#ff6b6b';
        view.fillStyle = '#ff6b6b';
        view.lineWidth = 2.5;
        view.beginPath();
        view.moveTo(v.x - 8, v.y + 14);
        view.lineTo(v.x - 8, v.y - 16);
        view.stroke();
        view.beginPath();
        view.moveTo(v.x - 8, v.y - 16);
        view.lineTo(v.x + 10, v.y - 10);
        view.lineTo(v.x - 8, v.y - 4);
        view.fill();
        view.restore();
      }

      if (s.overlays.issues) {
        for (const iss of s.issueCells) {
          const v = viewCenter(iss.cell);
          view.save();
          view.strokeStyle = iss.severity === 'error' ? '#ff6b6b' : '#f2b23c';
          view.lineWidth = 3;
          view.setLineDash([5, 4]);
          view.strokeRect(v.x - TILE / 2 + 2, v.y - TILE / 2 + 2, TILE - 4, TILE - 4);
          view.restore();
        }
      }

      // Hover / cursor ghost.
      if (h) {
        if (s.mode === 'props' && propTool === 'stamp' && !drag.current) {
          const np: DecorProp = { kind: s.propKind, col: h.col, row: h.row };
          const cells = s.propKind === 'battlements' ? [] : propCells(np);
          const bad = isOffBoard(h) || cells.some((c) => isOffBoard(c) || s.pathCells.has(cellKey(c.col, c.row)));
          for (const c of cells) {
            view.fillStyle = bad ? 'rgba(255, 90, 80, 0.3)' : 'rgba(127, 211, 138, 0.25)';
            view.fillRect((c.col + 1) * TILE, (c.row + 1) * TILE, TILE, TILE);
          }
          view.save();
          view.globalAlpha = 0.65;
          try {
            if (s.propKind === 'battlements') {
              view.translate(TILE, TILE);
              drawProp(view, 'battlements', 0, 0);
            } else {
              const at = viewCenter(h);
              drawProp(view, s.propKind, at.x, at.y, s.propKind === 'banner' ? s.bannerColor : undefined);
            }
          } catch {
            // ignore
          }
          view.restore();
        } else if (s.mode === 'path' && !drag.current) {
          const cur = s.paths[s.lane] ?? [];
          const last = cur[cur.length - 1];
          const next = snapFrom(last, h);
          const color = laneColor(s.lane);
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
          const join = last && s.joinPaths ? findJoin(s.paths, s.lane, next) : null;
          if (join) {
            const target = s.paths[join.lane];
            const n = viewCenter(next);
            view.save();
            view.setLineDash([4, 6]);
            view.strokeStyle = laneColor(join.lane);
            view.lineWidth = 5;
            view.globalAlpha = 0.7;
            view.beginPath();
            view.moveTo(n.x, n.y);
            for (const t of target.slice(join.from)) {
              const p = viewCenter(t);
              view.lineTo(p.x, p.y);
            }
            view.stroke();
            view.setLineDash([]);
            view.font = '800 12px Inter, system-ui, sans-serif';
            view.textAlign = 'center';
            view.fillStyle = '#fff6dc';
            view.strokeStyle = '#0c0e1c';
            view.lineWidth = 3;
            const label = `Merge into lane ${join.lane + 1}`;
            view.strokeText(label, n.x, n.y - 24);
            view.fillText(label, n.x, n.y - 24);
            view.restore();
          }
          view.strokeStyle = color;
          view.lineWidth = 2;
          view.strokeRect((next.col + 1) * TILE + 2, (next.row + 1) * TILE + 2, TILE - 4, TILE - 4);
        }
        if (s.dragAt && drag.current?.kind === 'prop') {
          const p = s.decor[drag.current.index];
          if (p) {
            const dc = s.dragAt.col - drag.current.from.col;
            const dr = s.dragAt.row - drag.current.from.row;
            for (const c of propCells({ ...p, col: p.col + dc, row: p.row + dr })) {
              view.fillStyle = 'rgba(232, 191, 94, 0.3)';
              view.fillRect((c.col + 1) * TILE, (c.row + 1) * TILE, TILE, TILE);
            }
          }
        }
      }
      if (s.focused) {
        view.save();
        view.strokeStyle = '#ffffff';
        view.lineWidth = 2;
        view.setLineDash([4, 3]);
        view.strokeRect((s.cursor.col + 1) * TILE + 1, (s.cursor.row + 1) * TILE + 1, TILE - 2, TILE - 2);
        view.restore();
      }
    };
    const frame = () => {
      raf = requestAnimationFrame(frame);
      paint();
    };
    // Paint now as well: a hidden tab pauses requestAnimationFrame.
    paint();
    paintRef.current = paint;
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      paintRef.current = null;
    };
  }, [engine, propTool]);
  // Repaint after every render too (hover, edits), for the same reason.
  useEffect(() => paintRef.current?.());

  const cellAt = (e: MouseEvent<HTMLCanvasElement>): Cell => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    return { col: Math.floor(x / TILE) - 1, row: Math.floor(y / TILE) - 1 };
  };

  // ------------------------------------------------------------ path tools
  const addPoint = (c: Cell) => {
    if (!inRing(c)) return;
    set(`Add point to lane ${lane + 1}`, (d) => {
      if (d.lanes.length === 0) d.lanes.push({ path: [], waves: [] });
      const cur = d.lanes[lane].path;
      const last = cur[cur.length - 1];
      const next = snapFrom(last, c);
      if (last && same(last, next)) return;
      cur.push(next);
      const join = last && joinPaths ? findJoin(d.lanes.map((l) => l.path), lane, next) : null;
      if (join) {
        const tail = d.lanes[join.lane].path.slice(join.from).filter((t, k) => !(k === 0 && same(t, next)));
        cur.push(...tail.map((t) => ({ ...t })));
      }
    });
  };
  const pointAt = (c: Cell) => (paths[lane] ?? []).findIndex((t) => same(t, c));
  const removePoint = (i: number) => set(`Remove point ${i + 1} of lane ${lane + 1}`, (d) => d.lanes[lane].path.splice(i, 1));
  const movePoint = (i: number, c: Cell) => set(`Move point ${i + 1} of lane ${lane + 1}`, (d) => (d.lanes[lane].path[i] = { ...c }));

  // ------------------------------------------------------------ prop tools
  const stamp = (c: Cell) => {
    if (isOffBoard(c)) return;
    set(`Place ${propLabel(propKind)}`, (d) => {
      const list = d.decor ?? [];
      const here = list.findIndex((p) => same(p, c) && p.kind === propKind);
      if (here >= 0) {
        list.splice(here, 1);
      } else {
        const np: DecorProp = { kind: propKind, col: c.col, row: c.row };
        if (propKind === 'banner') np.color = bannerColor;
        const cells = propKind === 'battlements' ? [] : propCells(np).map((q) => cellKey(q.col, q.row));
        const rest = list.filter((p) => {
          if (propKind === 'battlements') return p.kind !== 'battlements';
          if (p.kind === 'battlements' || propFootprint(p.kind).length === 0 || propFootprint(propKind).length === 0) return true;
          return !propCells(p).some((q) => cells.includes(cellKey(q.col, q.row)));
        });
        rest.push(np);
        d.decor = rest;
        return;
      }
      d.decor = list;
    });
    setSelectedProp(null);
  };
  const removeProp = (i: number) => {
    set(`Remove ${propLabel(decor[i]?.kind)}`, (d) => d.decor?.splice(i, 1));
    setSelectedProp(null);
  };
  const moveProp = (i: number, dc: number, dr: number) => {
    if (!dc && !dr) return;
    set(`Move ${propLabel(decor[i]?.kind)}`, (d) => {
      const p = d.decor![i];
      p.col += dc;
      p.row += dr;
    });
  };

  // ------------------------------------------------------------- pointer
  const onDown = (e: MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const c = cellAt(e);
    if (mode === 'path') {
      const i = pointAt(c);
      if (i >= 0) drag.current = { kind: 'point', index: i, from: c, moved: false };
    } else if (mode === 'props' && propTool === 'select') {
      const i = propAt(decor, c);
      const anchor = i >= 0 ? i : decor.findIndex((p) => same(p, c));
      if (anchor >= 0) {
        setSelectedProp(anchor);
        drag.current = { kind: 'prop', index: anchor, from: c, moved: false };
      } else setSelectedProp(null);
    }
  };
  const onMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const c = cellAt(e);
    setHover((h) => (h && same(h, c) ? h : c));
    if (drag.current && !same(drag.current.from, c)) {
      drag.current.moved = true;
      setDragAt((d) => (d && same(d, c) ? d : c));
    }
  };
  const onUp = (e: MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const c = cellAt(e);
    const dg = drag.current;
    drag.current = null;
    setDragAt(null);
    if (dg?.moved) {
      if (dg.kind === 'point' && inRing(c)) movePoint(dg.index, c);
      if (dg.kind === 'prop') moveProp(dg.index, c.col - dg.from.col, c.row - dg.from.row);
      return;
    }
    if (dg?.kind === 'prop') return; // a plain click selects (handled on down)
    if (dg?.kind === 'point') return; // clicking a point doesn't add another
    if (mode === 'path') addPoint(c);
    else if (mode === 'props' && propTool === 'stamp') stamp(c);
  };
  const onContext = (e: MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    secondary(cellAt(e));
  };
  const secondary = (c: Cell) => {
    if (mode === 'path') {
      const i = pointAt(c);
      if (i >= 0) removePoint(i);
      return;
    }
    const i = propAt(decor, c);
    const anchor = i >= 0 ? i : decor.findIndex((p) => same(p, c));
    if (anchor >= 0) removeProp(anchor);
  };
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      setCursor((c) => ({ col: Math.max(-1, Math.min(COLS, c.col + m[0])), row: Math.max(-1, Math.min(ROWS, c.row + m[1])) }));
      setHover(null);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (mode === 'path') addPoint(cursor);
      else if (mode === 'props') {
        if (propTool === 'stamp') stamp(cursor);
        else {
          const i = propAt(decor, cursor);
          setSelectedProp(i >= 0 ? i : null);
        }
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      secondary(cursor);
    }
  };

  // --------------------------------------------------------------- lanes
  const addLane = () => {
    set('Add lane', (d) => d.lanes.push({ path: [], waves: d.lanes[0] ? d.lanes[0].waves.map(() => ({ groups: [] })) : [] }));
    setActive(level.lanes.length);
  };
  const clearLane = async () => {
    if (!(paths[lane]?.length)) return;
    if (await confirm({ title: `Clear lane ${lane + 1}'s path?`, body: 'All of its turn points are removed (its waves stay). You can undo this.', confirmLabel: 'Clear path' })) {
      set(`Clear lane ${lane + 1} path`, (d) => (d.lanes[lane].path = []));
    }
  };

  const theme = level.theme;
  const setTheme = (label: string, fn: (t: NonNullable<EditorLevel['theme']>) => void, key?: string) =>
    set(label, (d) => {
      d.theme = d.theme ?? { ...DEFAULT_THEME };
      fn(d.theme);
    }, key);

  const moods = [
    ...SECTIONS.map((s) => ({ key: '', label: `${s.name} (chapter default)`, mood: SECTION_MOODS[s.id], section: s.id })),
    ...MOOD_IDS.map((id) => ({ key: id, label: id, mood: MOODS[id], section: undefined })),
  ].filter((m) => m.section === undefined || m.section === level.section);
  const moodUsers = (id: string) => working.levels.filter((l) => l.mood === id).map((l) => l.name);

  const selected = selectedProp != null ? decor[selectedProp] : undefined;

  return (
    <div className="ed-board">
      <div className="ed-board-side">
        <Segmented<Mode>
          ariaLabel="Board tool"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'path', label: <><Icon name="path" /> Path</> },
            { value: 'props', label: <><Icon name="prop" /> Props</> },
            { value: 'ground', label: <><Icon name="ground" /> Ground</> },
            { value: 'mood', label: <><Icon name="mood" /> Mood</> },
            { value: 'inspect', label: <><Icon name="eye" /> Inspect</> },
          ]}
        />

        {mode === 'path' && (
          <div className="ed-board-panel">
            <div className="ed-lane-tabs" role="tablist" aria-label="Lanes">
              {level.lanes.map((l, i) => (
                <button key={i} type="button" role="tab" aria-selected={i === lane} className={i === lane ? 'on' : undefined} style={{ '--lane': laneColor(i) } as CSSProperties} onClick={() => setActive(i)}>
                  <i className="dot" /> Lane {i + 1} <small>{l.path.length}</small>
                </button>
              ))}
              <Button icon="plus" size="sm" onClick={addLane}>Lane</Button>
            </div>
            <Toggle label="Merge when clicking onto another lane" help="Landing on another lane copies the rest of its route, so both reach the same castle (lanes converge)." checked={joinPaths} onChange={setJoinPaths} />
            <p className="ed-help-text">Click to add a turn point (legs snap straight). Drag a point to move it, right-click it to delete. Spawns and castles normally sit on the off-board ring.</p>
            <div className="ed-row-actions">
              <Button size="sm" icon="undo" onClick={() => paths[lane]?.length && removePoint(paths[lane].length - 1)} disabled={!paths[lane]?.length}>Remove last</Button>
              <Button size="sm" icon="restore" onClick={() => set(`Reverse lane ${lane + 1}`, (d) => d.lanes[lane].path.reverse())} disabled={(paths[lane]?.length ?? 0) < 2}>Reverse</Button>
              <Button size="sm" icon="close" onClick={clearLane} disabled={!paths[lane]?.length}>Clear</Button>
            </div>
            <PointList level={level} lane={lane} />
          </div>
        )}

        {mode === 'props' && (
          <div className="ed-board-panel">
            <Segmented<PropTool> ariaLabel="Prop tool" size="sm" value={propTool} onChange={setPropTool} options={[{ value: 'stamp', label: 'Stamp' }, { value: 'select', label: 'Select & move' }]} />
            {propTool === 'stamp' ? (
              <>
                <label className="ed-sort">
                  Category
                  <select value={propTab} onChange={(e) => setPropTab(e.target.value as PropCategory)}>
                    {PROP_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </label>
                <div className="ed-palette" role="listbox" aria-label="Props">
                  {PROP_PALETTE.filter((p) => p.category === propTab).map((p) => (
                    <button key={p.kind} type="button" role="option" aria-selected={propKind === p.kind} className={propKind === p.kind ? 'on' : undefined} onClick={() => setPropKind(p.kind)} title={`Place ${p.label}${BASE_PROP_KINDS.has(p.kind) ? ' (base prop: a path may end on it)' : ''}${LIGHTABLE_PROPS[p.kind] ? ' (lightable)' : ''}`}>
                      <PropIcon kind={p.kind} color={p.kind === 'banner' ? bannerColor : p.color} />
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
                {propKind === 'banner' && (
                  <Field label="Banner colour">{(id) => <ColorInput id={id} value={bannerColor} onChange={setBannerColor} />}</Field>
                )}
                <p className="ed-help-text">Click to stamp (replaces what it covers); click the same prop again or right-click to remove.</p>
              </>
            ) : (
              <>
                <p className="ed-help-text">Click a prop to select it; drag to move it.</p>
                {selected ? (
                  <PropProps level={level} index={selectedProp!} onRemove={() => removeProp(selectedProp!)} />
                ) : (
                  <p className="ed-muted small">No prop selected.</p>
                )}
              </>
            )}
            <details className="ed-props-list">
              <summary>All props ({decor.length})</summary>
              <ul>
                {decor.map((p, i) => (
                  <li key={i}>
                    <button type="button" className={i === selectedProp ? 'on' : undefined} onClick={() => (setPropTool('select'), setSelectedProp(i))}>
                      {propLabel(p.kind)} <small>({p.col}, {p.row})</small>
                    </button>
                    <Button size="sm" tone="plain" icon="trash" title={`Remove ${propLabel(p.kind)}`} onClick={() => removeProp(i)} />
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}

        {mode === 'ground' && (
          <div className="ed-board-panel">
            <Toggle
              label="Custom floor & path"
              help="Off: the plain default floor and a dirt track."
              checked={!!theme}
              onChange={(v) => set(v ? 'Add board theme' : 'Remove board theme', (d) => setOpt(d, 'theme', v ? { ...DEFAULT_THEME, floor: 'stone', pathKind: 'dirt' } : undefined))}
            />
            {theme && (
              <>
                <Field label="Floor material" path="theme.floor">
                  {() => <Segmented ariaLabel="Floor material" size="sm" value={theme.floor ?? 'stone'} options={FLOOR_KINDS.map((k) => ({ value: k, label: k }))} onChange={(v) => setTheme('Change floor', (t) => (t.floor = v))} />}
                </Field>
                <Field label="Floor tone" path="theme.groundEven">{(id) => <ColorInput id={id} value={theme.groundEven} onChange={(v) => setTheme('Change floor tone', (t) => (t.groundEven = v), 'ge')} />}</Field>
                <Field label="Variation" path="theme.groundOdd">{(id) => <ColorInput id={id} value={theme.groundOdd} onChange={(v) => setTheme('Change floor variation', (t) => (t.groundOdd = v), 'go')} />}</Field>
                <Field label="Path material" path="theme.pathKind">
                  {() => <Segmented ariaLabel="Path material" size="sm" value={theme.pathKind ?? 'dirt'} options={PATH_KINDS.map((k) => ({ value: k, label: k }))} onChange={(v) => setTheme('Change path material', (t) => (t.pathKind = v))} />}
                </Field>
                <Toggle
                  label="Custom path colours"
                  checked={!!theme.path}
                  onChange={(v) => setTheme(v ? 'Add path colours' : 'Remove path colours', (t) => setOpt(t, 'path', v ? DEFAULT_PATH_LAYERS.map(([c, w]) => [c, w] as [string, number]) : undefined))}
                />
                {theme.path?.map(([c], i) => (
                  <Field key={i} label={['Border', 'Fill', 'Centre'][i] ?? `Layer ${i + 1}`} path={`theme.path.${i}`}>
                    {(id) => <ColorInput id={id} value={c} onChange={(v) => setTheme('Change path colour', (t) => (t.path![i][0] = v), `p${i}`)} />}
                  </Field>
                ))}
              </>
            )}
          </div>
        )}

        {mode === 'mood' && (
          <div className="ed-board-panel">
            <p className="ed-help-text">The stage's lighting mood: darkness, light colour, weather, grade and vignette. Previewed live on the board.</p>
            <div className="ed-moods" role="radiogroup" aria-label="Mood">
              {moods.map((m) => {
                const on = (level.mood ?? '') === m.key;
                const users = m.key ? moodUsers(m.key).filter((n) => n !== level.name) : [];
                return (
                  <button key={m.key || 'default'} type="button" role="radio" aria-checked={on} className={on ? 'on' : undefined} onClick={() => set('Change mood', (d) => setOpt(d, 'mood', (m.key || undefined) as EditorLevel['mood']))}>
                    <span className="sw" style={{ background: `linear-gradient(135deg, ${m.mood.grade ?? m.mood.ambient}, ${m.mood.ambient})`, opacity: 0.5 + m.mood.darkness }} />
                    <span>
                      {m.label}
                      <small>
                        {m.mood.light} light · {m.mood.weather === 'none' ? 'still air' : m.mood.weather}
                        {users.length ? ` · also ${users.join(', ')}` : ''}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="ed-muted small">New presets are authored in MOODS in src/domain/atmosphere.ts.</p>
          </div>
        )}

        {mode === 'inspect' && (
          <div className="ed-board-panel">
            <Toggle label="Path cells" checked={overlays.cells} onChange={(v) => setOverlays({ ...overlays, cells: v })} help="Every cell each lane occupies (build-forbidden)." />
            <Toggle label="Prop footprints" checked={overlays.footprints} onChange={(v) => setOverlays({ ...overlays, footprints: v })} help="Cells each prop covers; blue = base props, dashed = floor dressing." />
            <Toggle label="Buildable cells" checked={overlays.build} onChange={(v) => setOverlays({ ...overlays, build: v })} help="Green: champions can deploy here. Red: path or prop." />
            <Toggle label="Problem markers" checked={overlays.issues} onChange={(v) => setOverlays({ ...overlays, issues: v })} />
            <h4 className="ed-subhead">Board problems</h4>
            {boardIssues.length ? <IssueList issues={boardIssues} /> : <p className="ed-muted small">No path, prop or ground problems.</p>}
          </div>
        )}
      </div>

      <div className="ed-board-stage">
        <canvas
          ref={viewRef}
          className={`ed-board-canvas ${mode}`}
          width={VIEW_W}
          height={VIEW_H}
          tabIndex={0}
          aria-label={`Board for ${level.name}, ${sectionName(level.section)}. Arrow keys move the cursor, Enter places, Delete removes.`}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={() => {
            setHover(null);
            drag.current = null;
            setDragAt(null);
          }}
          onContextMenu={onContext}
          onKeyDown={onKey}
          onFocus={() => (live.current.focused = true)}
          onBlur={() => (live.current.focused = false)}
        />
        <div className="ed-board-status">
          <span>{hover ? `col ${hover.col}, row ${hover.row}${isOffBoard(hover) ? ' · off-board ring' : ''}${propAt(decor, hover) >= 0 ? ` · ${propLabel(decor[propAt(decor, hover)].kind)}` : ''}` : 'Hover or focus the board'}</span>
          <span>
            {level.lanes.length} lane{level.lanes.length === 1 ? '' : 's'} · {decor.length} prop{decor.length === 1 ? '' : 's'} · {level.mood ?? 'chapter mood'}
            {level.mist ? ' · misty' : ''}
          </span>
        </div>
        {!engine && <p className="ed-warn">The board preview couldn't be built from this draft; fix the path problems listed in Inspect.</p>}
      </div>
    </div>
  );
}

/** The active lane's turn points as editable numbers (keyboard-friendly path editing). */
function PointList({ level, lane }: { level: EditorLevel; lane: number }) {
  const path = level.lanes[lane]?.path ?? [];
  const set = (label: string, fn: (d: EditorLevel) => void, key?: string) => edit.level(level.id, label, fn, key);
  if (path.length === 0) return <p className="ed-muted small">No points yet: click the board (or the ring around it) to place this lane's spawn.</p>;
  return (
    <ol className="ed-points" aria-label={`Lane ${lane + 1} turn points`}>
      {path.map((c, i) => (
        <li key={i}>
          <span className="n">{i === 0 ? 'Spawn' : i === path.length - 1 ? 'Castle' : `Turn ${i}`}</span>
          <NumberInput ariaLabel={`Point ${i + 1} column`} width={56} value={c.col} spec={{ kind: 'int', min: -1, max: COLS }} onChange={(v) => set('Edit point', (d) => (d.lanes[lane].path[i].col = v ?? 0), `pt${lane}.${i}c`)} />
          <NumberInput ariaLabel={`Point ${i + 1} row`} width={56} value={c.row} spec={{ kind: 'int', min: -1, max: ROWS }} onChange={(v) => set('Edit point', (d) => (d.lanes[lane].path[i].row = v ?? 0), `pt${lane}.${i}r`)} />
          <Button size="sm" tone="plain" icon="plus" title="Insert a point after this one" onClick={() => set('Insert point', (d) => d.lanes[lane].path.splice(i + 1, 0, { ...c }))} />
          <Button size="sm" tone="plain" icon="trash" title="Delete this point" onClick={() => set('Delete point', (d) => d.lanes[lane].path.splice(i, 1))} />
        </li>
      ))}
    </ol>
  );
}

function PropProps({ level, index, onRemove }: { level: EditorLevel; index: number; onRemove: () => void }) {
  const p = level.decor![index];
  const set = (label: string, fn: (d: DecorProp) => void, key?: string) => edit.level(level.id, label, (d) => fn(d.decor![index]), key && `prop${index}${key}`);
  return (
    <div className="ed-prop-props" data-field={`decor.${index}`}>
      <h4>
        {propLabel(p.kind)}
        {BASE_PROP_KINDS.has(p.kind) && <span className="ed-tag">Base</span>}
      </h4>
      <div className="ed-inline-fields">
        <label>
          Col
          <NumberInput ariaLabel="Prop column" width={60} value={p.col} spec={{ kind: 'int', min: 0, max: COLS - 1 }} onChange={(v) => set('Move prop', (d) => (d.col = v ?? 0), 'c')} />
        </label>
        <label>
          Row
          <NumberInput ariaLabel="Prop row" width={60} value={p.row} spec={{ kind: 'int', min: 0, max: ROWS - 1 }} onChange={(v) => set('Move prop', (d) => (d.row = v ?? 0), 'r')} />
        </label>
      </div>
      {p.kind === 'banner' && <Field label="Tint">{(id) => <ColorInput id={id} value={p.color ?? DEFAULT_BANNER_COLOR} onChange={(v) => set('Tint prop', (d) => (d.color = v), 't')} />}</Field>}
      {LIGHTABLE_PROPS[p.kind] && (
        <Toggle
          label="Starts lit"
          help={`Players pay ${LIGHTABLE_PROPS[p.kind]!.cost} gold to light it otherwise; it clears mist within ${Math.round(LIGHTABLE_PROPS[p.kind]!.radius)}px.`}
          checked={!!p.lit}
          onChange={(v) => set(v ? 'Light lantern' : 'Unlight lantern', (d) => setOpt(d, 'lit', v || undefined))}
        />
      )}
      <Button size="sm" tone="danger" icon="trash" onClick={onRemove}>Remove prop</Button>
    </div>
  );
}

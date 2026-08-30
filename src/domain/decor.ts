/**
 * Cosmetic level dressing — the data types shared by the renderer (which draws
 * the props + skin), the level catalog (which carries them per stage as data),
 * and the Level Designer (which authors them). Purely decorative: the engine
 * never reads any of this, so adding a decorated stage is a data edit.
 */

import { TILE, cellKey } from './grid';

/**
 * Optional per-level board skin: the two alternating checker colours of the
 * buildable floor plus an optional replacement for the enemy path's stroke
 * layers. Omit `path` to keep the default dirt track.
 */
export interface BoardTheme {
  groundEven: string;
  groundOdd: string;
  /** Path stroke layers painted outer→inner as [colour, inset-from-TILE]. */
  path?: [string, number][];
}

/** Every decorative prop the renderer can draw (see `drawProp`). */
export type PropKind =
  | 'pillar'
  | 'torch'
  | 'throne'
  | 'chandelier'
  | 'banner'
  | 'diningTable'
  | 'bed'
  | 'chest'
  | 'gate'
  | 'battlements'
  | 'barrel'
  | 'crate'
  | 'weaponRack'
  | 'bookshelf'
  | 'statue'
  | 'fountain'
  | 'house'
  | 'castle'
  // Capital props: the townscape that surrounds the castle.
  | 'well'
  | 'marketStall'
  | 'lamppost'
  | 'tree'
  | 'hedge'
  | 'townhouse'
  | 'cart'
  | 'signpost';

/**
 * Which Level Designer palette tab a prop lives under: `castle` for the keep's
 * interior fittings and fortifications, `capital` for the town that surrounds
 * it. Purely an authoring grouping — the renderer treats all kinds alike.
 */
export type PropCategory = 'castle' | 'capital';

/**
 * A single placed prop. `col`/`row` is the board cell it sits on; it must be a
 * cell the level's path never occupies (props are decoration, not obstacles).
 * `color` tints the kinds that take one (currently the banner).
 */
export interface DecorProp {
  kind: PropKind;
  col: number;
  row: number;
  color?: string;
}

/** Designer palette entry: an ordered kind with a label + optional default tint. */
export interface PropInfo {
  kind: PropKind;
  label: string;
  /** Which palette tab the prop belongs to (castle interior vs. capital town). */
  category: PropCategory;
  /** Default colour for kinds that take one (banner). */
  color?: string;
}

/** Human labels + display order for the Level Designer's prop tabs. */
export const PROP_CATEGORIES: { id: PropCategory; label: string }[] = [
  { id: 'castle', label: '🏰 Castle' },
  { id: 'capital', label: '🏙️ Capital' },
];

/** The ordered prop palette the Level Designer offers. */
export const PROP_PALETTE: PropInfo[] = [
  // --- Castle: interior fittings & fortifications ---
  { kind: 'pillar', label: 'Pillar', category: 'castle' },
  { kind: 'torch', label: 'Torch', category: 'castle' },
  { kind: 'throne', label: 'Throne', category: 'castle' },
  { kind: 'chandelier', label: 'Chandelier', category: 'castle' },
  { kind: 'banner', label: 'Banner', category: 'castle', color: '#8e1f2d' },
  { kind: 'diningTable', label: 'Table', category: 'castle' },
  { kind: 'bed', label: 'Bed', category: 'castle' },
  { kind: 'chest', label: 'Chest', category: 'castle' },
  { kind: 'gate', label: 'Gate', category: 'castle' },
  { kind: 'battlements', label: 'Battlements', category: 'castle' },
  { kind: 'barrel', label: 'Barrel', category: 'castle' },
  { kind: 'crate', label: 'Crate', category: 'castle' },
  { kind: 'weaponRack', label: 'Weapon Rack', category: 'castle' },
  { kind: 'bookshelf', label: 'Bookshelf', category: 'castle' },
  // --- Capital: the town surrounding the castle ---
  { kind: 'well', label: 'Well', category: 'capital' },
  { kind: 'marketStall', label: 'Market Stall', category: 'capital' },
  { kind: 'lamppost', label: 'Lamppost', category: 'capital' },
  { kind: 'tree', label: 'Tree', category: 'capital' },
  { kind: 'hedge', label: 'Hedge', category: 'capital' },
  { kind: 'cart', label: 'Cart', category: 'capital' },
  { kind: 'signpost', label: 'Signpost', category: 'capital' },
  { kind: 'statue', label: 'Statue', category: 'capital' },
  { kind: 'fountain', label: 'Fountain', category: 'capital' },
  { kind: 'townhouse', label: 'Townhouse', category: 'capital' },
  { kind: 'house', label: 'House', category: 'capital' },
  { kind: 'castle', label: 'Castle', category: 'capital' },
];

/**
 * Cells a prop covers relative to its anchor (`col`,`row`), as `[dCol, dRow]`
 * offsets. Most props sit on a single cell; the larger furnishings span a
 * bigger footprint. Two things read this: (1) the engine, to forbid placing a
 * champion on any cell a prop occupies, and (2) each multi-cell prop's drawer,
 * which offsets its own visual centre to match these cells. Anything omitted
 * defaults to a single anchor cell; `battlements` covers none (it's a thin band
 * on the top wall, above the play floor).
 */
export const PROP_FOOTPRINTS: Partial<
  Record<PropKind, ReadonlyArray<readonly [number, number]>>
> = {
  battlements: [],
  diningTable: [[-1, 0], [0, 0], [1, 0]],
  // Throne on its raised dais — a 3-wide, 2-tall monument (anchor = top-left).
  throne: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  bed: [[0, 0], [1, 0], [0, 1], [1, 1]],
  bookshelf: [[0, 0], [1, 0]],
  statue: [[0, 0], [0, 1]],
  fountain: [[0, 0], [1, 0], [0, 1], [1, 1]],
  // Very large buildings: a 3×2 house and a 3×3 castle (anchor = top-left cell).
  house: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  castle: [
    [0, 0], [1, 0], [2, 0],
    [0, 1], [1, 1], [2, 1],
    [0, 2], [1, 2], [2, 2],
  ],
  // Capital props with a wider-than-one footprint (anchor = top-left cell).
  marketStall: [[0, 0], [1, 0]],
  cart: [[0, 0], [1, 0]],
  townhouse: [[0, 0], [1, 0], [0, 1], [1, 1]],
};

const SINGLE_CELL: ReadonlyArray<readonly [number, number]> = [[0, 0]];

/** The cell offsets a prop of `kind` occupies (see `PROP_FOOTPRINTS`). */
export function propFootprint(kind: PropKind): ReadonlyArray<readonly [number, number]> {
  return PROP_FOOTPRINTS[kind] ?? SINGLE_CELL;
}

/** The board cells a placed prop covers (its anchor plus footprint). */
export function propCells(prop: DecorProp): { col: number; row: number }[] {
  return propFootprint(prop.kind).map(([dc, dr]) => ({ col: prop.col + dc, row: prop.row + dr }));
}

/** "col,row" keys of every cell a decor list occupies (champion placement block). */
export function decorCellKeys(decor: readonly DecorProp[] | undefined): Set<string> {
  const set = new Set<string>();
  for (const p of decor ?? []) {
    for (const c of propCells(p)) set.add(cellKey(c.col, c.row));
  }
  return set;
}

/**
 * Ground cells the hand-authored castle-stage furnishings occupy (the bespoke
 * `drawXDecor` functions in `renderer.ts`). Those stages carry no `decor` data,
 * so this table is the placement-blocking mirror of that drawing — keep the two
 * in sync when a stage's furniture moves. Wall/ceiling props (torches, banners,
 * chandeliers, battlements) sit off the play floor and are omitted. Keyed by
 * level **id**. A stage that instead ships `decor` data (e.g. stage 1) blocks
 * from that data and ignores this table.
 */
export const CASTLE_DECOR_CELLS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  2: [[8, 8], [9, 8], [10, 8], [13, 2], [14, 2], [15, 2]], // two banquet tables
  3: [[5, 1], [9, 1], [13, 1], [5, 9], [9, 9], [13, 9]], // colonnade
  4: [[5, 0], [6, 0], [5, 1], [6, 1], [2, 4], [4, 4], [14, 4]], // 2×2 bed, chests, side throne
  5: [[1, 1], [14, 1], [1, 8], [14, 8], // corner pillars
      [7, 1], [8, 1], [9, 1], [7, 2], [8, 2], [9, 2]], // throne + dais monument
};

/** Default banner tint when a banner is placed without an explicit colour. */
export const DEFAULT_BANNER_COLOR = '#8e1f2d';

/** Default checker colours when a stage declares no theme. */
export const DEFAULT_THEME: BoardTheme = {
  groundEven: '#20304a',
  groundOdd: '#233752',
};

/** Default dirt-track path layers used when a theme sets no path override. */
export const DEFAULT_PATH_LAYERS: [string, number][] = [
  ['#0d1526', TILE - 4], // outer border
  ['#3a2c22', TILE - 12], // dirt fill
  ['#4a382c', TILE - 26], // center track highlight
];

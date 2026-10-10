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
  /**
   * Floor material painted over the checker colours (seeded per stage). The two
   * ground colours become the material's base + variation tones. Omit for a
   * plain stone floor.
   */
  floor?: FloorKind;
  /** Material detail laid over the path's stroke layers (default `dirt`). */
  pathKind?: PathKind;
}

/** Buildable-floor materials the terrain baker knows how to paint. */
export type FloorKind = 'grass' | 'stone' | 'flagstone' | 'wood' | 'marble' | 'dirt' | 'cobble';

/**
 * Enemy-path materials (detail over the authored stroke colours). `sewer` is a
 * channel of murky water between stone curbs: the foes wade along it.
 */
export type PathKind = 'dirt' | 'carpet' | 'cobble' | 'stone' | 'sewer';

/** Designer pickers: every floor / path material, in display order. */
export const FLOOR_KINDS: FloorKind[] = ['grass', 'stone', 'flagstone', 'wood', 'marble', 'dirt', 'cobble'];
export const PATH_KINDS: PathKind[] = ['dirt', 'carpet', 'cobble', 'stone', 'sewer'];

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
  | 'burningCastle'
  // Capital props: the townscape that surrounds the castle.
  | 'well'
  | 'marketStall'
  | 'lamppost'
  | 'tree'
  | 'hedge'
  | 'townhouse'
  | 'cart'
  | 'signpost'
  // Town-square dressing (the Capital's market square).
  | 'guildhall'
  | 'bakery'
  | 'tavern'
  | 'bench'
  | 'planter'
  | 'noticeBoard'
  | 'pillory'
  | 'plazaMosaic'
  | 'pigeons'
  // Outskirts dressing (the Capital's edge, down to the sewers).
  | 'sewerEntrance'
  | 'wallTower'
  | 'shack'
  | 'fence'
  | 'laundryLine'
  | 'junkPile'
  | 'deadTree'
  | 'cropPatch'
  | 'drainGrate'
  | 'puddle'
  // A lantern post the player lights with gold (see `domain/mist.ts`).
  | 'lanternPost'
  // Sewer dressing (the tunnels under the Capital).
  | 'sewerWall'
  | 'sewerOutfall'
  | 'sewerArch'
  | 'cistern'
  | 'brickPillar'
  | 'manholeLadder'
  | 'pipes'
  | 'bonePile'
  | 'glowShrooms'
  | 'rats'
  // Riverside dressing (out of the sewers, to the escape wagon).
  | 'escapeWagon'
  | 'riverSegment'
  | 'riverCell'
  | 'rowboat'
  | 'campfire'
  | 'tent'
  | 'pineTree'
  | 'boulder'
  | 'stump'
  | 'wildflowers';

/**
 * Props that may stand at a path's end as the base the foes are heading for
 * (a castle's gate, the sewer mouth, the escape wagon). A path may end on the
 * board only on one of these, and they don't count as obstructing the path.
 */
export const BASE_PROP_KINDS: ReadonlySet<PropKind> = new Set<PropKind>([
  'castle',
  'burningCastle',
  'gate',
  'sewerEntrance',
  'escapeWagon',
]);

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
  /** A lightable prop (`domain/mist.ts`) that starts the stage already lit. */
  lit?: boolean;
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
  { id: 'castle', label: 'Castle' },
  { id: 'capital', label: 'Capital' },
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
  { kind: 'burningCastle', label: 'Burning Castle', category: 'capital' },
  { kind: 'guildhall', label: 'Guildhall', category: 'capital' },
  { kind: 'bakery', label: 'Bakery', category: 'capital' },
  { kind: 'tavern', label: 'Tavern', category: 'capital' },
  { kind: 'bench', label: 'Bench', category: 'capital' },
  { kind: 'planter', label: 'Planter', category: 'capital' },
  { kind: 'noticeBoard', label: 'Notice Board', category: 'capital' },
  { kind: 'pillory', label: 'Pillory', category: 'capital' },
  { kind: 'plazaMosaic', label: 'Plaza Mosaic', category: 'capital' },
  { kind: 'pigeons', label: 'Pigeons', category: 'capital' },
  { kind: 'sewerEntrance', label: 'Sewer Entrance', category: 'capital' },
  { kind: 'wallTower', label: 'Wall Tower', category: 'capital' },
  { kind: 'shack', label: 'Shack', category: 'capital' },
  { kind: 'fence', label: 'Fence', category: 'capital' },
  { kind: 'laundryLine', label: 'Laundry Line', category: 'capital' },
  { kind: 'junkPile', label: 'Junk Pile', category: 'capital' },
  { kind: 'deadTree', label: 'Dead Tree', category: 'capital' },
  { kind: 'cropPatch', label: 'Crop Patch', category: 'capital' },
  { kind: 'drainGrate', label: 'Drain Grate', category: 'capital' },
  { kind: 'puddle', label: 'Puddle', category: 'capital' },
  { kind: 'lanternPost', label: 'Lantern Post (lightable)', category: 'capital' },
  { kind: 'sewerWall', label: 'Sewer Wall', category: 'capital' },
  { kind: 'sewerOutfall', label: 'Sewer Outfall', category: 'capital' },
  { kind: 'sewerArch', label: 'Sewer Arch', category: 'capital' },
  { kind: 'cistern', label: 'Cistern', category: 'capital' },
  { kind: 'brickPillar', label: 'Brick Pillar', category: 'capital' },
  { kind: 'manholeLadder', label: 'Manhole Ladder', category: 'capital' },
  { kind: 'pipes', label: 'Pipes', category: 'capital' },
  { kind: 'bonePile', label: 'Bone Pile', category: 'capital' },
  { kind: 'glowShrooms', label: 'Glow Shrooms', category: 'capital' },
  { kind: 'rats', label: 'Rats', category: 'capital' },
  { kind: 'escapeWagon', label: 'Escape Wagon', category: 'capital' },
  { kind: 'riverSegment', label: 'River', category: 'capital' },
  { kind: 'riverCell', label: 'River (1 cell)', category: 'capital' },
  { kind: 'rowboat', label: 'Rowboat', category: 'capital' },
  { kind: 'campfire', label: 'Campfire', category: 'capital' },
  { kind: 'tent', label: 'Tent', category: 'capital' },
  { kind: 'pineTree', label: 'Pine Tree', category: 'capital' },
  { kind: 'boulder', label: 'Boulder', category: 'capital' },
  { kind: 'stump', label: 'Stump', category: 'capital' },
  { kind: 'wildflowers', label: 'Wildflowers', category: 'capital' },
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
  // The sacked castle keeps the castle's footprint.
  burningCastle: [
    [0, 0], [1, 0], [2, 0],
    [0, 1], [1, 1], [2, 1],
    [0, 2], [1, 2], [2, 2],
  ],
  // Capital props with a wider-than-one footprint (anchor = top-left cell).
  marketStall: [[0, 0], [1, 0]],
  cart: [[0, 0], [1, 0]],
  townhouse: [[0, 0], [1, 0], [0, 1], [1, 1]],
  // Town square: the clock-towered guildhall fills a 4×3 block (an even width,
  // so it centres on a 2×2 fountain) and the shops are 2×2 like the townhouse.
  // The mosaic and the pigeons are floor dressing a champion may stand on, so
  // they cover no cells.
  guildhall: [
    [0, 0], [1, 0], [2, 0], [3, 0],
    [0, 1], [1, 1], [2, 1], [3, 1],
    [0, 2], [1, 2], [2, 2], [3, 2],
  ],
  bakery: [[0, 0], [1, 0], [0, 1], [1, 1]],
  tavern: [[0, 0], [1, 0], [0, 1], [1, 1]],
  plazaMosaic: [],
  pigeons: [],
  // Outskirts. The sewer entrance is a 3×2 retaining wall whose bottom-centre
  // cell is the tunnel mouth a path ends in; the wall towers and shacks are
  // 2×2; the laundry line and crop patch 2×1. Grates and puddles are floor
  // dressing.
  sewerEntrance: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  wallTower: [[0, 0], [1, 0], [0, 1], [1, 1]],
  shack: [[0, 0], [1, 0], [0, 1], [1, 1]],
  laundryLine: [[0, 0], [1, 0]],
  cropPatch: [[0, 0], [1, 0]],
  drainGrate: [],
  puddle: [],
  // Sewers. Wall sections fill the top row; the arch covers only its two side
  // cells, leaving the middle one open for the channel to run through. The
  // shrooms and rats are floor dressing.
  sewerWall: [[0, 0], [1, 0]],
  sewerOutfall: [[0, 0], [1, 0]],
  sewerArch: [[0, 0], [2, 0]],
  cistern: [[0, 0], [1, 0], [0, 1], [1, 1]],
  glowShrooms: [],
  rats: [],
  // Riverside. The wagon (a base prop) is 3×2 with its tail on the bottom-left
  // cell; a river stretch is 4×1 (`riverCell` is 1×1, the default) and any mix
  // of them tiles seamlessly along a row; the tent is 2×2. The rowboat (on the
  // river) and the wildflowers are floor dressing.
  escapeWagon: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  riverSegment: [[0, 0], [1, 0], [2, 0], [3, 0]],
  tent: [[0, 0], [1, 0], [0, 1], [1, 1]],
  rowboat: [],
  wildflowers: [],
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

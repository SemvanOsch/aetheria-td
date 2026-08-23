/**
 * Board geometry shared by levels, the engine and the renderer.
 *
 * The board is a fixed tile grid. Levels describe their path as a sequence of
 * "turn" cells; helpers here expand that into the full set of path cells (used
 * to forbid building) and into pixel-space waypoints (used for movement).
 */

export const TILE = 48;
export const COLS = 16;
export const ROWS = 10;
export const BOARD_WIDTH = COLS * TILE; // 768
export const BOARD_HEIGHT = ROWS * TILE; // 480

export interface Cell {
  col: number;
  row: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** Pixel center of a grid cell. */
export function cellCenter(col: number, row: number): Vec2 {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

/** Convert a pixel position to the grid cell containing it. */
export function pointToCell(x: number, y: number): Cell {
  return { col: Math.floor(x / TILE), row: Math.floor(y / TILE) };
}

/**
 * Expand a list of turn cells into every cell the path passes through.
 * Consecutive turn cells must share a row or a column (axis-aligned segments).
 */
export function expandPathCells(turns: Cell[]): Cell[] {
  const cells: Cell[] = [];
  const push = (c: Cell) => {
    const last = cells[cells.length - 1];
    if (!last || last.col !== c.col || last.row !== c.row) cells.push(c);
  };

  for (let i = 0; i < turns.length - 1; i++) {
    const a = turns[i];
    const b = turns[i + 1];
    const dc = Math.sign(b.col - a.col);
    const dr = Math.sign(b.row - a.row);
    let { col, row } = a;
    push({ col, row });
    while (col !== b.col || row !== b.row) {
      col += dc;
      row += dr;
      push({ col, row });
    }
  }
  if (turns.length === 1) push(turns[0]);
  return cells;
}

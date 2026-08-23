/**
 * Data-driven story structure: sections, levels & waves.
 *
 * The campaign is organised into 3 themed sections (Castle / Forest / Inn),
 * each with 5 levels — 15 in total, globally numbered 1..15. Each level owns a
 * unique path, its own boss (boss<id>), a starting gold pool, a gem reward and
 * an ordered list of waves. The final wave of every level contains its boss.
 *
 * Adding a level = appending an entry here. Nothing else needs to change.
 */

import { type Cell, type Vec2, cellCenter, expandPathCells, cellKey } from './grid';
import { bossIdForLevel } from './enemies';
import type { BoardTheme, DecorProp } from './decor';

export type SectionId = 'castle' | 'forest' | 'inn';

export interface SectionDef {
  id: SectionId;
  name: string;
  subtitle: string;
  icon: string;
  color: string;
  /**
   * Work in progress: the chapter is authored but not ready to play, so the UI
   * shows it locked ("coming soon") and refuses to enter it, regardless of the
   * player's unlock progress. Flip off to release the chapter.
   */
  wip?: boolean;
}

export const SECTIONS: SectionDef[] = [
  { id: 'castle', name: 'The Castle', subtitle: 'Hold the halls against the usurpers.', icon: '🏰', color: '#8fa6c8' },
  { id: 'forest', name: 'The Forest', subtitle: 'Beasts and old growth stir in the deep wood.', icon: '🌲', color: '#5fd38a', wip: true },
  { id: 'inn', name: 'The Inn', subtitle: 'Something foul brews beneath the tavern.', icon: '🍺', color: '#f2b23c', wip: true },
];

export function getSection(id: SectionId): SectionDef {
  return SECTIONS.find((s) => s.id === id)!;
}

export interface EnemyGroup {
  enemyId: string;
  count: number;
  /** Seconds between spawns within this group. */
  spacing?: number;
  /** Seconds to wait before this group starts (after the previous one). */
  delay?: number;
}

export interface WaveDef {
  groups: EnemyGroup[];
}

/**
 * One enemy lane: an independent path with its own wave schedule. A level has
 * one or more. Lanes may be fully separate, or *converge* — simply give two
 * lanes paths that share a tail (the same turn cells near the base) and their
 * enemies will merge onto the shared corridor. Each lane's `waves[i]` spawns
 * when wave `i` starts, so enemies per lane are customised independently.
 */
export interface LaneDef {
  /** Turn cells describing this lane's enemy path from spawn to base. */
  pathTurns: Cell[];
  /** Waves of enemies that spawn on THIS lane. */
  waves: WaveDef[];
  /**
   * Optional dramatic reveal: a lane with `revealAtWave: N` stays hidden until
   * wave `N` (0-based) begins — it isn't drawn, doesn't block building, and its
   * enemies don't spawn before then. When wave `N` starts the path appears and
   * its cells become non-buildable. Omit for a normal lane present from wave 1.
   */
  revealAtWave?: number;
}

export interface LevelDef {
  id: number;
  section: SectionId;
  /** 1-based index within its section (1..5). */
  order: number;
  name: string;
  subtitle: string;
  /** One or more enemy lanes (each its own path + waves). */
  lanes: LaneDef[];
  baseHealth: number;
  /** Gold the player starts the stage with (gold is a per-stage resource). */
  startingGold: number;
  /** Gems awarded the first time the level is completed. */
  gemReward: number;
  /** This level's boss enemy id. */
  bossId: string;
  /** Accent color for the level card. */
  color: string;
  /** Optional cosmetic board skin (floor checker + path colours). */
  theme?: BoardTheme;
  /** Optional cosmetic props drawn beneath gameplay tokens. */
  decor?: DecorProp[];
}

const DEFAULT_SPACING = 0.85;

/** Every stage starts the player with this much gold (per-stage resource). */
const STARTING_GOLD = 200;

// Shorthand enemy ids per section.
const CAS = { g: 'cas_grunt', g2: 'cas_grunt2', r: 'cas_runner', b: 'cas_brute', m: 'cas_mage' };
const FOR = { g: 'for_grunt', r: 'for_runner', b: 'for_brute' };
const INN = { g: 'inn_grunt', r: 'inn_runner', b: 'inn_brute' };

/** A single lane in an authoring spec: a path and the waves that run on it. */
interface LaneSpec {
  path: Cell[];
  waves: WaveDef[];
  /** See `LaneDef.revealAtWave` — hide this lane until the given wave begins. */
  revealAtWave?: number;
}

interface LevelSpec {
  id: number;
  name: string;
  subtitle: string;
  baseHealth: number;
  gem: number;
  /**
   * Single-lane shorthand: one path + one wave list (the common case). For a
   * multi-lane stage, use `lanes` instead. Provide exactly one of the two.
   */
  path?: Cell[];
  waves?: WaveDef[];
  /** Multi-lane stages: each lane customises its own path and enemies. */
  lanes?: LaneSpec[];
  /** Optional cosmetic board skin (floor checker + path colours). */
  theme?: BoardTheme;
  /** Optional cosmetic props drawn beneath gameplay tokens. */
  decor?: DecorProp[];
}

/**
 * Build the final wave: the level boss escorted by some trash. `bossDelay`
 * offsets the boss's spawn from the start of the escort group (default 2s) —
 * raise it per stage to make that boss make a later, more dramatic entrance.
 */
function bossWave(id: number, escort: EnemyGroup[], bossDelay = 2): WaveDef {
  return { groups: [...escort, { enemyId: bossIdForLevel(id), count: 1, delay: bossDelay }] };
}

// ---------------------------------------------------------------- CASTLE (1-5)
const CASTLE_SPECS: LevelSpec[] = [
  {
    id: 1,
    name: 'Castle Door',
    subtitle: "Your way into the castle - Guarded by Company 7",
    baseHealth: 10, gem: 150,
    theme: {
      groundEven: '#568042',
      groundOdd: '#506c42',
      path: [['#0d1526', 44], ['#3a2c22', 36], ['#6b543c', 22]]
    },
    decor: [
      { kind: 'castle', col: 12, row: 0 },
      { kind: 'house', col: 7, row: 2 },
      { kind: 'house', col: 0, row: 7 },
      { kind: 'banner', col: 14, row: 1, color: '#8e1f2d' },
      { kind: 'banner', col: 12, row: 1, color: '#8e1f2d' },
    ],
    lanes: [
      {
        path: [{ col: -1, row: 2 }, { col: 5, row: 2 }, { col: 5, row: 8 }, { col: 13, row: 8 }, { col: 13, row: 2 }],
        waves: [
          { groups: [{ enemyId: CAS.g, count: 5 }] },
          { groups: [{ enemyId: CAS.g, count: 7 }] },
          { groups: [{ enemyId: CAS.g, count: 5, spacing: 0.5 }, { enemyId: CAS.g, count: 6, spacing: 0.5, delay: 5 }] },
          { groups: [{ enemyId: CAS.g, count: 7 }, { enemyId: CAS.r, count: 3, spacing: 0.4, delay: 2 }] },
          bossWave(1, [{ enemyId: CAS.g, count: 5 }], 3),
        ],
      },
    ],
  },
  {
    id: 2,
    name: 'Dining Room',
    subtitle: 'Guards scramble from the feast to stop you.',
    baseHealth: 10, gem: 150,
    theme: {
      groundEven: '#423a2e',
      groundOdd: '#4a4234',
      path: [['#b8912f', 44], ['#7d1f27', 36], ['#9a2a33', 22]],
    },
    decor: [
      { kind: 'diningTable', col: 10, row: 8 },
      { kind: 'diningTable', col: 13, row: 1 },
      { kind: 'diningTable', col: 1, row: 5 },
      { kind: 'barrel', col: 0, row: 1 },
      { kind: 'barrel', col: 15, row: 3 },
    ],
    lanes: [
      {
        path: [{ col: -1, row: 7 }, { col: 6, row: 7 }, { col: 6, row: 1 }, { col: 2, row: 1 }, { col: 2, row: 4 }, { col: 12, row: 4 }, { col: 12, row: 6 }, { col: 16, row: 6 }],
        waves: [
          { groups: [{ enemyId: CAS.g, count: 6, spacing: 0.6 }, { enemyId: CAS.g, count: 7, delay: 3 }] },
          { groups: [{ enemyId: CAS.g, count: 15, spacing: 0.5 }] },
          { groups: [{ enemyId: CAS.g, count: 8 }, { enemyId: CAS.r, count: 5, delay: 5 }] },
          { groups: [{ enemyId: CAS.g, count: 18 }, { enemyId: CAS.r, count: 9, spacing: 3, delay: 1 }] },
          bossWave(2, [{ enemyId: CAS.g, count: 6 }, { enemyId: CAS.r, count: 3, delay: 1 }], 3),
        ],
      },
    ],
  },
  {
    id: 3,
    name: 'The Grand Hall',
    subtitle: 'Loyalists flood the hall to turn you back.',
    baseHealth: 10, gem: 150,
    theme: {
      groundEven: '#2b3352',
      groundOdd: '#323a5c',
      path: [['#c9a24a', 44], ['#26386f', 36], ['#33498a', 22]],
    },
    decor: [
      { kind: 'bookshelf', col: 0, row: 0 },
      { kind: 'bookshelf', col: 3, row: 0 },
      { kind: 'bookshelf', col: 6, row: 0 },
      { kind: 'bookshelf', col: 9, row: 0 },
      { kind: 'bookshelf', col: 14, row: 0 },
      { kind: 'pillar', col: 2, row: 8 },
      { kind: 'pillar', col: 14, row: 8 },
      { kind: 'pillar', col: 8, row: 8 },
    ],
    lanes: [
      {
        path: [{ col: -1, row: 6 }, { col: 5, row: 6 }, { col: 5, row: 5 }, { col: 8, row: 5 }, { col: 8, row: 7 }, { col: 12, row: 7 }, { col: 12, row: -1 }],
        waves: [
          { groups: [{ enemyId: CAS.r, count: 8 }] },
          { groups: [{ enemyId: CAS.g, count: 9, spacing: 0.7 }, { enemyId: CAS.g2, count: 3, delay: 8 }] },
          { groups: [{ enemyId: CAS.r, count: 11, spacing: 0.55 }] },
          { groups: [{ enemyId: CAS.g2, count: 3 }, { enemyId: CAS.g, count: 10, delay: 1 }] },
          { groups: [{ enemyId: bossIdForLevel(3), count: 1 }, { enemyId: CAS.g2, count: 1, delay: 2 }, { enemyId: CAS.g, count: 3, delay: 2 }] },
        ],
      },
    ],
  },
  {
    id: 4,
    name: "The King's Chamber",
    subtitle: 'Corner the corrupt king where he hides.',
    baseHealth: 10, gem: 150,
    theme: {
      groundEven: '#2e2540',
      groundOdd: '#352b4a',
      path: [['#c9a24a', 44], ['#3d2a6b', 36], ['#523a8a', 22]],
    },
    decor: [
      { kind: 'bed', col: 7, row: 0 },
      { kind: 'chest', col: 6, row: 0 },
      { kind: 'chest', col: 9, row: 0 },
      { kind: 'torch', col: 12, row: 2 },
      { kind: 'torch', col: 4, row: 3 },
      { kind: 'bookshelf', col: 13, row: 0 },
      { kind: 'weaponRack', col: 1, row: 0 },
      { kind: 'crate', col: 2, row: 7 },
    ],
    lanes: [
      {
        path: [{ col: 12, row: 10 }, { col: 12, row: 5 }, { col: 3, row: 5 }, { col: 3, row: -1 }],
        waves: [
          { groups: [{ enemyId: CAS.g2, count: 3 }] },
          { groups: [{ enemyId: CAS.g, count: 20, spacing: 1 }] },
          { groups: [{ enemyId: CAS.g2, count: 3, spacing: 0.7 }, { enemyId: CAS.m, count: 3, delay: 3 }] },
          { groups: [{ enemyId: CAS.g, count: 9, spacing: 0.5 }, { enemyId: CAS.r, count: 4 }, { enemyId: CAS.m, count: 2, delay: 2 }] },
          bossWave(4, []),
        ],
      },
    ],
  },
  {
    id: 5,
    name: 'Throne Room',
    subtitle: 'His throne, ringed by loyal guards.',
    baseHealth: 10, gem: 150,
    theme: {
      groundEven: '#262230',
      groundOdd: '#2d2838',
      path: [['#c9a24a', 44], ['#7d1f27', 36], ['#9a2a33', 22]],
    },
    decor: [
      { kind: 'throne', col: 6, row: 1 },
      { kind: 'banner', col: 5, row: 0, color: '#8e1f2d' },
      { kind: 'banner', col: 9, row: 0, color: '#8e1f2d' },
      { kind: 'pillar', col: 2, row: 2 },
      { kind: 'pillar', col: 12, row: 2 },
      { kind: 'statue', col: 7, row: 7 },
    ],
    lanes: [
      {
        // Main lane — guards pour up from the entrance. Its final wave is just
        // the boss's escort; the boss itself arrives on the throne lane below.
        path: [{ col: 3, row: 10 }, { col: 3, row: 6 }, { col: 13, row: 6 }, { col: 13, row: 3 }, { col: 16, row: 3 }],
        waves: [
          { groups: [{ enemyId: CAS.g, count: 6 }, { enemyId: CAS.m, count: 3, delay: 4 }] },
          { groups: [{ enemyId: CAS.r, count: 8, spacing: 0.5 }] },
          { groups: [{ enemyId: CAS.m, count: 3 }, { enemyId: CAS.g2, count: 4, delay: 1 }] },
          { groups: [{ enemyId: CAS.g2, count: 12, spacing: 2 }] },
          { groups: [{ enemyId: CAS.g, count: 3 }, { enemyId: CAS.m, count: 2, delay: 3 }] },
        ],
      },
      {
        // Throne lane — hidden until the final wave. When wave 5 begins the path
        // rolls out from beneath the throne (col 7, row 2, directly under the
        // seated king) and merges into the main lane's exit tail on row 3. The
        // king rises and marches out once the carpet is laid — the boss's delay
        // (~1.4s) matches the path's roll-out time (LANE_REVEAL_TIME).
        revealAtWave: 4,
        path: [{ col: 7, row: 2 }, { col: 7, row: 3 }, { col: 16, row: 3 }],
        waves: [
          { groups: [] },
          { groups: [] },
          { groups: [] },
          { groups: [] },
          { groups: [{ enemyId: bossIdForLevel(5), count: 1, delay: 1.4 }] },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------- FOREST (6-10)
const FOREST_SPECS: LevelSpec[] = [
  {
    id: 6,
    name: 'Forest Edge',
    subtitle: 'The treeline comes alive.',
    path: [{ col: -1, row: 3 }, { col: 10, row: 3 }, { col: 10, row: 7 }, { col: 2, row: 7 }, { col: 2, row: 9 }, { col: 16, row: 9 }],
    baseHealth: 10, gem: 150,
    waves: [
      { groups: [{ enemyId: FOR.g, count: 8 }] },
      { groups: [{ enemyId: FOR.r, count: 8 }, { enemyId: FOR.g, count: 6, delay: 1 }] },
      { groups: [{ enemyId: FOR.b, count: 3 }, { enemyId: FOR.g, count: 8, delay: 1 }] },
      { groups: [{ enemyId: FOR.r, count: 12, spacing: 0.55 }] },
      bossWave(6, [{ enemyId: FOR.g, count: 8 }, { enemyId: FOR.r, count: 4, delay: 1 }]),
    ],
  },
  {
    id: 7,
    name: 'Tangled Paths',
    subtitle: 'The wood coils back on itself.',
    path: [{ col: -1, row: 6 }, { col: 6, row: 6 }, { col: 6, row: 1 }, { col: 12, row: 1 }, { col: 12, row: 8 }, { col: 16, row: 8 }],
    baseHealth: 10, gem: 150,
    waves: [
      { groups: [{ enemyId: FOR.r, count: 10 }, { enemyId: FOR.g, count: 6, delay: 1 }] },
      { groups: [{ enemyId: FOR.b, count: 4 }, { enemyId: FOR.g, count: 8, delay: 1 }] },
      { groups: [{ enemyId: FOR.r, count: 14, spacing: 0.5 }] },
      { groups: [{ enemyId: FOR.b, count: 5 }, { enemyId: FOR.r, count: 8, delay: 1 }] },
      bossWave(7, [{ enemyId: FOR.g, count: 10 }, { enemyId: FOR.b, count: 2, delay: 1 }]),
    ],
  },
  {
    id: 8,
    name: 'Spider Hollow',
    subtitle: 'Webs stretch across the ravine.',
    path: [{ col: -1, row: 9 }, { col: 4, row: 9 }, { col: 4, row: 2 }, { col: 9, row: 2 }, { col: 9, row: 9 }, { col: 13, row: 9 }, { col: 13, row: 4 }, { col: 16, row: 4 }],
    baseHealth: 10, gem: 150,
    waves: [
      { groups: [{ enemyId: FOR.g, count: 12 }, { enemyId: FOR.r, count: 6, delay: 1 }] },
      { groups: [{ enemyId: FOR.b, count: 5 }, { enemyId: FOR.g, count: 10, delay: 1 }] },
      { groups: [{ enemyId: FOR.r, count: 16, spacing: 0.5 }] },
      { groups: [{ enemyId: FOR.b, count: 6 }, { enemyId: FOR.r, count: 8, delay: 1 }] },
      { groups: [{ enemyId: FOR.g, count: 20, spacing: 0.45 }] },
      bossWave(8, [{ enemyId: FOR.b, count: 3 }, { enemyId: FOR.r, count: 8, delay: 1 }]),
    ],
  },
  {
    id: 9,
    name: 'The Deep Wood',
    subtitle: 'Light barely reaches the floor.',
    path: [{ col: -1, row: 1 }, { col: 14, row: 1 }, { col: 14, row: 4 }, { col: 3, row: 4 }, { col: 3, row: 7 }, { col: 14, row: 7 }, { col: 14, row: 9 }, { col: 16, row: 9 }],
    baseHealth: 10, gem: 150,
    waves: [
      { groups: [{ enemyId: FOR.r, count: 14 }, { enemyId: FOR.g, count: 8, delay: 1 }] },
      { groups: [{ enemyId: FOR.b, count: 6 }, { enemyId: FOR.g, count: 12, delay: 1 }] },
      { groups: [{ enemyId: FOR.r, count: 18, spacing: 0.45 }] },
      { groups: [{ enemyId: FOR.b, count: 7 }, { enemyId: FOR.r, count: 10, delay: 1 }] },
      { groups: [{ enemyId: FOR.b, count: 4 }, { enemyId: FOR.g, count: 16, delay: 1 }] },
      bossWave(9, [{ enemyId: FOR.b, count: 4 }, { enemyId: FOR.r, count: 8, delay: 1 }]),
    ],
  },
  {
    id: 10,
    name: 'Heart of the Grove',
    subtitle: 'Oakheart will not yield.',
    path: [{ col: -1, row: 4 }, { col: 3, row: 4 }, { col: 3, row: 8 }, { col: 7, row: 8 }, { col: 7, row: 2 }, { col: 11, row: 2 }, { col: 11, row: 8 }, { col: 15, row: 8 }, { col: 15, row: 2 }, { col: 16, row: 2 }],
    baseHealth: 10, gem: 150,
    waves: [
      { groups: [{ enemyId: FOR.b, count: 5 }, { enemyId: FOR.g, count: 12, delay: 1 }] },
      { groups: [{ enemyId: FOR.r, count: 18, spacing: 0.45 }] },
      { groups: [{ enemyId: FOR.b, count: 8 }, { enemyId: FOR.r, count: 10, delay: 1 }] },
      { groups: [{ enemyId: FOR.g, count: 22, spacing: 0.4 }] },
      { groups: [{ enemyId: FOR.b, count: 9 }, { enemyId: FOR.g, count: 12, delay: 1 }] },
      bossWave(10, [{ enemyId: FOR.b, count: 5 }, { enemyId: FOR.r, count: 10, delay: 1 }]),
    ],
  },
];

// ------------------------------------------------------------------- INN (11-15)
const INN_SPECS: LevelSpec[] = [
  {
    id: 11,
    name: 'The Common Room',
    subtitle: 'The brawl spills out of the tavern.',
    path: [{ col: -1, row: 2 }, { col: 13, row: 2 }, { col: 13, row: 8 }, { col: 3, row: 8 }, { col: 3, row: 5 }, { col: 16, row: 5 }],
    baseHealth: 10, gem: 150,
    waves: [
      { groups: [{ enemyId: INN.g, count: 10 }, { enemyId: INN.r, count: 6, delay: 1 }] },
      { groups: [{ enemyId: INN.b, count: 4 }, { enemyId: INN.g, count: 10, delay: 1 }] },
      { groups: [{ enemyId: INN.r, count: 14, spacing: 0.55 }] },
      { groups: [{ enemyId: INN.b, count: 5 }, { enemyId: INN.r, count: 8, delay: 1 }] },
      bossWave(11, [{ enemyId: INN.g, count: 8 }, { enemyId: INN.b, count: 2, delay: 1 }]),
    ],
  },
  {
    id: 12,
    name: 'The Cellars',
    subtitle: 'Down among the casks and cobwebs.',
    path: [{ col: -1, row: 7 }, { col: 5, row: 7 }, { col: 5, row: 2 }, { col: 10, row: 2 }, { col: 10, row: 7 }, { col: 15, row: 7 }, { col: 15, row: 2 }, { col: 16, row: 2 }],
    baseHealth: 10, gem: 150,
    waves: [
      { groups: [{ enemyId: INN.r, count: 12 }, { enemyId: INN.g, count: 8, delay: 1 }] },
      { groups: [{ enemyId: INN.b, count: 5 }, { enemyId: INN.g, count: 10, delay: 1 }] },
      { groups: [{ enemyId: INN.r, count: 16, spacing: 0.5 }] },
      { groups: [{ enemyId: INN.b, count: 6 }, { enemyId: INN.r, count: 8, delay: 1 }] },
      { groups: [{ enemyId: INN.g, count: 16, spacing: 0.45 }] },
      bossWave(12, [{ enemyId: INN.b, count: 3 }, { enemyId: INN.r, count: 8, delay: 1 }]),
    ],
  },
  {
    id: 13,
    name: "Witch's Nook",
    subtitle: 'Madame Hex stirs her brew.',
    path: [{ col: -1, row: 9 }, { col: 2, row: 9 }, { col: 2, row: 3 }, { col: 6, row: 3 }, { col: 6, row: 9 }, { col: 10, row: 9 }, { col: 10, row: 3 }, { col: 14, row: 3 }, { col: 14, row: 9 }, { col: 16, row: 9 }],
    baseHealth: 10, gem: 150,
    waves: [
      { groups: [{ enemyId: INN.b, count: 5 }, { enemyId: INN.g, count: 10, delay: 1 }] },
      { groups: [{ enemyId: INN.r, count: 16, spacing: 0.45 }] },
      { groups: [{ enemyId: INN.b, count: 6 }, { enemyId: INN.r, count: 10, delay: 1 }] },
      { groups: [{ enemyId: INN.g, count: 18, spacing: 0.42 }] },
      { groups: [{ enemyId: INN.b, count: 7 }, { enemyId: INN.g, count: 12, delay: 1 }] },
      bossWave(13, [{ enemyId: INN.b, count: 4 }, { enemyId: INN.r, count: 10, delay: 1 }]),
    ],
  },
  {
    id: 14,
    name: 'The Long Hall',
    subtitle: 'A wraith drifts the endless corridor.',
    path: [{ col: -1, row: 1 }, { col: 15, row: 1 }, { col: 15, row: 5 }, { col: 1, row: 5 }, { col: 1, row: 9 }, { col: 16, row: 9 }],
    baseHealth: 10, gem: 150,
    waves: [
      { groups: [{ enemyId: INN.r, count: 14 }, { enemyId: INN.g, count: 10, delay: 1 }] },
      { groups: [{ enemyId: INN.b, count: 6 }, { enemyId: INN.g, count: 12, delay: 1 }] },
      { groups: [{ enemyId: INN.r, count: 18, spacing: 0.42 }] },
      { groups: [{ enemyId: INN.b, count: 8 }, { enemyId: INN.r, count: 10, delay: 1 }] },
      { groups: [{ enemyId: INN.b, count: 5 }, { enemyId: INN.g, count: 16, delay: 1 }] },
      bossWave(14, [{ enemyId: INN.b, count: 4 }, { enemyId: INN.r, count: 10, delay: 1 }]),
    ],
  },
  {
    id: 15,
    name: "The Innkeeper's Bane",
    subtitle: 'The final horror rises from below.',
    path: [{ col: -1, row: 5 }, { col: 3, row: 5 }, { col: 3, row: 1 }, { col: 8, row: 1 }, { col: 8, row: 8 }, { col: 12, row: 8 }, { col: 12, row: 2 }, { col: 15, row: 2 }, { col: 15, row: 9 }, { col: 16, row: 9 }],
    baseHealth: 10, gem: 150,
    waves: [
      { groups: [{ enemyId: INN.b, count: 6 }, { enemyId: INN.g, count: 12, delay: 1 }] },
      { groups: [{ enemyId: INN.r, count: 18, spacing: 0.42 }] },
      { groups: [{ enemyId: INN.b, count: 7 }, { enemyId: INN.r, count: 12, delay: 1 }] },
      { groups: [{ enemyId: INN.g, count: 20, spacing: 0.4 }] },
      { groups: [{ enemyId: INN.b, count: 8 }, { enemyId: INN.g, count: 14, delay: 1 }] },
      { groups: [{ enemyId: INN.b, count: 5 }, { enemyId: INN.r, count: 12, delay: 1 }] },
      bossWave(15, [{ enemyId: INN.b, count: 4 }, { enemyId: INN.r, count: 12, delay: 1 }]),
    ],
  },
];

/** Normalise a spec's single-lane shorthand or explicit lanes into LaneDefs. */
function specLanes(s: LevelSpec): LaneDef[] {
  if (s.lanes && s.lanes.length > 0) {
    return s.lanes.map((l) => ({ pathTurns: l.path, waves: l.waves, revealAtWave: l.revealAtWave }));
  }
  if (s.path && s.waves) {
    return [{ pathTurns: s.path, waves: s.waves }];
  }
  throw new Error(`Level ${s.id} must define either { path, waves } or { lanes }`);
}

function buildLevels(specs: LevelSpec[], section: SectionId, color: string): LevelDef[] {
  return specs.map((s, i) => ({
    id: s.id,
    section,
    order: i + 1,
    name: s.name,
    subtitle: s.subtitle,
    lanes: specLanes(s),
    baseHealth: s.baseHealth,
    startingGold: STARTING_GOLD,
    gemReward: s.gem,
    bossId: bossIdForLevel(s.id),
    color,
    theme: s.theme,
    decor: s.decor,
  }));
}

export const LEVELS: LevelDef[] = [
  ...buildLevels(CASTLE_SPECS, 'castle', '#8fa6c8'),
  ...buildLevels(FOREST_SPECS, 'forest', '#5fd38a'),
  ...buildLevels(INN_SPECS, 'inn', '#f2b23c'),
];

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function levelsForSection(section: SectionId): LevelDef[] {
  return LEVELS.filter((l) => l.section === section);
}

export function groupSpacing(g: EnemyGroup): number {
  return g.spacing ?? DEFAULT_SPACING;
}

/** Pixel-space waypoints an enemy walks through for one lane. */
export function laneWaypoints(lane: LaneDef): Vec2[] {
  return lane.pathTurns.map((c) => cellCenter(c.col, c.row));
}

/** Set of "col,row" keys for every cell a single lane occupies. */
export function lanePathCells(lane: LaneDef): Set<string> {
  const set = new Set<string>();
  for (const c of expandPathCells(lane.pathTurns)) {
    set.add(cellKey(c.col, c.row));
  }
  return set;
}

/** Set of "col,row" keys for every cell any lane occupies (build-forbidden). */
export function levelPathCellSet(level: LevelDef): Set<string> {
  const set = new Set<string>();
  for (const lane of level.lanes) {
    for (const key of lanePathCells(lane)) set.add(key);
  }
  return set;
}

/** Number of waves in the stage — the longest lane's wave count. */
export function levelTotalWaves(level: LevelDef): number {
  return level.lanes.reduce((max, lane) => Math.max(max, lane.waves.length), 0);
}

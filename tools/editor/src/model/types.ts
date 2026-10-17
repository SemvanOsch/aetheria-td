/**
 * The editor's working content model — a *project*.
 *
 * Every shape mirrors how the game authors its content in `src/domain`, so a
 * project converts losslessly in both directions:
 *  - levels are `LevelSpec`s (the authoring form in `domain/levels.ts`), plus the
 *    section each one lives in and the defaults `buildLevels` fills in;
 *  - regular enemies are plain `EnemyDef`s (the `REGULAR` record);
 *  - bosses are `BossMeta`s (the `BOSS_META` list): stats they leave out come
 *    from the escalating curve (`bossDefFromMeta`), exactly as in the game;
 *  - champions are catalog `UnitDef`s (`UNITS`), mastery trees `MASTERY_TREES`.
 *
 * The hero champions (`player-*`) are built in code from the player's profile
 * (`domain/playerChampion.ts`), so they are not part of a project — only their
 * mastery trees are.
 */

import type { Cell } from '@game/domain/grid';
import type { SectionId, StageEnding, WaveDef } from '@game/domain/levels';
import type { BoardTheme, DecorProp } from '@game/domain/decor';
import type { MoodId } from '@game/domain/atmosphere';
import type { BossMeta, EnemyDef } from '@game/domain/enemies';
import type { UnitDef } from '@game/domain/units';
import type { MasteryUpgradeDef } from '@game/domain/mastery';

export type { SectionId };

/** One enemy lane: its path (turn cells, spawn → base) and its own waves. */
export interface EditorLane {
  path: Cell[];
  waves: WaveDef[];
  /** Hidden until this 0-based wave begins (see `LaneDef.revealAtWave`). */
  revealAtWave?: number;
  /** Foes surface out of water at the lane's start (see `LaneDef.emerge`). */
  emerge?: boolean;
}

/** A campaign stage, in authoring form. */
export interface EditorLevel {
  /** Global, stable stage id. Stage N unlocks when stage N-1 is cleared. */
  id: number;
  section: SectionId;
  name: string;
  subtitle: string;
  baseHealth: number;
  /** Gems for the first clear (`gemReward`). */
  gem: number;
  startingGold: number;
  /** Stage-card accent colour. */
  color: string;
  bossId: string;
  lanes: EditorLane[];
  theme?: BoardTheme;
  decor?: DecorProp[];
  mood?: MoodId;
  ending?: StageEnding;
  bossHaltAt?: Cell;
  victoryLine?: string;
  mist?: boolean;
  /** Pulled from the campaign (`DISABLED_LEVEL_IDS`) but kept authored. */
  archived?: boolean;
}

export interface ContentProject {
  /**
   * Campaign stages. Order matters: within a section, a stage's position is its
   * `order` (1-based) in that chapter.
   */
  levels: EditorLevel[];
  /** Regular (non-boss) foes, in catalog order. */
  enemies: EnemyDef[];
  /** Bosses, in `BOSS_META` order — their position feeds the default stat curve. */
  bosses: BossMeta[];
  /** Catalog champions (not the code-built heroes). */
  units: UnitDef[];
  /** Skill trees keyed by champion id (heroes included). */
  mastery: Record<string, MasteryUpgradeDef[]>;
}

/** Which collection an entity lives in. */
export type EntityKind = 'level' | 'enemy' | 'boss' | 'unit' | 'mastery';

/** The sidebar workspaces. */
export type Workspace = 'levels' | 'enemies' | 'champions' | 'mastery' | 'packs';

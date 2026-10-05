/**
 * Endless mode: one never-ending stage per campaign chapter.
 *
 * Clearing every stage of a chapter unlocks its endless run. The run fields only
 * the foes met in that chapter's stages, introduced over time (the tougher ones
 * — e.g. the Castle's Sergeant and Royal Wizard — hold back until later waves),
 * in waves rolled at random from a budget that grows every wave. Every
 * `ENDLESS_BOSS_EVERY`th wave brings a boss: the chapter's stage bosses in stage
 * order, looping forever with more health each lap. Clearing a boss wave pays
 * `ENDLESS_BOSS_GEMS` gems.
 *
 * Waves aren't authored — the engine asks `generateEndlessWave` for each one as
 * it starts. An endless stage is otherwise an ordinary `LevelDef` (its `endless`
 * rules mark it), so the board, theme, decor and mood work exactly like a
 * campaign stage's — paste a Level Designer export over a spec's map to restyle.
 *
 * Adding a chapter's endless run = appending an `EndlessSpec` here.
 */

import type { Cell } from './grid';
import type { BoardTheme, DecorProp } from './decor';
import type { MoodId } from './atmosphere';
import {
  getLevel,
  getSection,
  levelsForSection,
  type EnemyGroup,
  type LevelDef,
  type SectionId,
  type WaveDef,
} from './levels';

/** A boss arrives every this-many waves (waves 5, 10, 15…). */
export const ENDLESS_BOSS_EVERY = 5;
/** Gems paid each time a boss wave is cleared. */
export const ENDLESS_BOSS_GEMS = 50;
/** Boss health multiplier per completed lap of the boss rotation (lap 2 = ×1.6). */
const BOSS_LAP_HEALTH_MULT = 3.2;
/** Regular foes start gaining health after this wave… */
const FOE_SCALING_FROM_WAVE = 10;
/** …compounding by this much per wave past it. */
const FOE_HEALTH_GROWTH = 1.04;
/** Endless stage ids live far above the campaign's so id-keyed tables never match. */
const ENDLESS_ID_BASE = 1000;

/** One foe the endless run can roll, and when it joins the pool. */
export interface EndlessFoe {
  enemyId: string;
  /** First wave (1-based) it can appear in. */
  fromWave: number;
  /** Budget points one of them costs — tougher foes cost more, so fewer come. */
  cost: number;
  /** Relative pick weight when it first appears. */
  weight: number;
  /** Weight gained per wave after `fromWave`, so tougher foes grow more common. */
  weightGrowth?: number;
}

/** What makes a `LevelDef` endless: the foe pool and the boss rotation. */
export interface EndlessRules {
  section: SectionId;
  foes: EndlessFoe[];
  /** Boss enemy ids in rotation order (the chapter's stage bosses); loops forever. */
  bosses: string[];
}

/** Authoring spec for one chapter's endless run (map + foe pool). */
interface EndlessSpec {
  section: SectionId;
  name: string;
  subtitle: string;
  baseHealth: number;
  startingGold: number;
  /**
   * Turn cells of each lane, spawn → base (same format as a stage). Each wave's
   * groups are dealt out across the lanes, a whole group per lane.
   */
  paths: Cell[][];
  theme?: BoardTheme;
  decor?: DecorProp[];
  mood?: MoodId;
  foes: EndlessFoe[];
}

// ---------------------------------------------------------------- CASTLE
// Only foes met in the castle stages: Footmen and Outriders from the start,
// Sergeants and Royal Wizards held back until later.
const ENDLESS_SPECS: EndlessSpec[] = [
  {
    section: 'castle',
    name: 'The Endless Siege',
    subtitle: 'The castle sends wave after wave. Hold as long as you can.',
    baseHealth: 20,
    startingGold: 200,
    mood: 'moonlitNight',
    theme: {
      groundEven: '#2c2430',
      groundOdd: '#352a38',
      path: [['#c9a24a', 44], ['#7d1f27', 36], ['#9a2a33', 22]],
      floor: 'stone',
      pathKind: 'carpet',
    },
    decor: [
      { kind: 'statue', col: 7, row: 3 },
      { kind: 'torch', col: 13, row: 1 },
      { kind: 'torch', col: 3, row: 1 },
      { kind: 'torch', col: 3, row: 8 },
      { kind: 'torch', col: 13, row: 8 },
      { kind: 'bookshelf', col: 5, row: 0 },
      { kind: 'bookshelf', col: 8, row: 0 },
      { kind: 'barrel', col: 0, row: 8 },
      { kind: 'barrel', col: 10, row: 9 },
      { kind: 'crate', col: 14, row: 3 },
    ],
    paths: [
      [{ col: 1, row: 10 }, { col: 1, row: 4 }, { col: 5, row: 4 }, { col: 5, row: 6 }, { col: 9, row: 6 }, { col: 9, row: 4 }, { col: 16, row: 4 }],
      [{ col: 1, row: 10 }, { col: 1, row: 4 }, { col: 5, row: 4 }, { col: 5, row: 2 }, { col: 9, row: 2 }, { col: 9, row: 4 }, { col: 16, row: 4 }],
      [{ col: 1, row: -1 }, { col: 1, row: 4 }, { col: 5, row: 4 }, { col: 5, row: 2 }, { col: 9, row: 2 }, { col: 9, row: 4 }, { col: 16, row: 4 }],
      [{ col: 1, row: -1 }, { col: 1, row: 4 }, { col: 5, row: 4 }, { col: 5, row: 6 }, { col: 9, row: 6 }, { col: 9, row: 4 }, { col: 16, row: 4 }],
    ],
    foes: [
      { enemyId: 'cas_grunt', fromWave: 1, cost: 1, weight: 6 },
      { enemyId: 'cas_runner', fromWave: 3, cost: 1.4, weight: 2, weightGrowth: 0.1 },
      { enemyId: 'cas_grunt2', fromWave: 8, cost: 2.6, weight: 1.5, weightGrowth: 0.15 },
      { enemyId: 'cas_mage', fromWave: 12, cost: 2.2, weight: 1.5, weightGrowth: 0.15 },
    ],
  },
];

function buildEndless(spec: EndlessSpec, index: number): LevelDef {
  const stages = levelsForSection(spec.section);
  const bosses = stages.map((l) => l.bossId);
  return {
    id: ENDLESS_ID_BASE + index,
    section: spec.section,
    order: 0,
    name: spec.name,
    subtitle: spec.subtitle,
    lanes: spec.paths.map((pathTurns) => ({ pathTurns, waves: [] })),
    baseHealth: spec.baseHealth,
    startingGold: spec.startingGold,
    gemReward: ENDLESS_BOSS_GEMS,
    bossId: bosses[0],
    color: getSection(spec.section).color,
    theme: spec.theme,
    decor: spec.decor,
    mood: spec.mood,
    endless: { section: spec.section, foes: spec.foes, bosses },
  };
}

/** Every chapter's endless stage, in chapter order. */
export const ENDLESS_LEVELS: LevelDef[] = ENDLESS_SPECS.map(buildEndless);

/** The chapter's endless stage, if it has one. */
export function endlessLevelFor(section: SectionId): LevelDef | undefined {
  return ENDLESS_LEVELS.find((l) => l.section === section);
}

/** Any playable stage by id — a campaign stage or an endless one. */
export function getBattleLevel(id: number): LevelDef | undefined {
  return getLevel(id) ?? ENDLESS_LEVELS.find((l) => l.id === id);
}

/** Whether 1-based wave `waveNumber` brings a boss. */
export function isEndlessBossWave(waveNumber: number): boolean {
  return waveNumber > 0 && waveNumber % ENDLESS_BOSS_EVERY === 0;
}

/** The boss of boss-wave `waveNumber` and which lap of the rotation it's on (0 = first). */
export function endlessBossFor(rules: EndlessRules, waveNumber: number): { enemyId: string; lap: number } {
  const k = Math.max(0, Math.floor(waveNumber / ENDLESS_BOSS_EVERY) - 1);
  return { enemyId: rules.bosses[k % rules.bosses.length], lap: Math.floor(k / rules.bosses.length) };
}

/** Boss health multiplier on a given lap: unscaled the first time round, then ×1.6 per lap. */
export function endlessBossHealthMult(lap: number): number {
  return Math.pow(BOSS_LAP_HEALTH_MULT, lap);
}

/** Regular-foe health multiplier for 1-based wave `waveNumber`. */
export function endlessFoeHealthMult(waveNumber: number): number {
  return Math.pow(FOE_HEALTH_GROWTH, Math.max(0, waveNumber - FOE_SCALING_FROM_WAVE));
}

/** Budget points a wave spends on foes (see `EndlessFoe.cost`). */
function waveBudget(waveNumber: number): number {
  return 4 + 2 * waveNumber;
}

/** Wave number (1-based) at which a foe first joins the run. */
export function endlessFoeUnlockWave(rules: EndlessRules, enemyId: string): number | undefined {
  return rules.foes.find((f) => f.enemyId === enemyId)?.fromWave;
}

function pickFoe(pool: EndlessFoe[], waveNumber: number, rng: () => number): EndlessFoe {
  const weightOf = (f: EndlessFoe) => f.weight + (f.weightGrowth ?? 0) * (waveNumber - f.fromWave);
  let roll = rng() * pool.reduce((sum, f) => sum + weightOf(f), 0);
  for (const f of pool) {
    roll -= weightOf(f);
    if (roll <= 0) return f;
  }
  return pool[pool.length - 1];
}

/**
 * Roll 1-based wave `waveNumber` of an endless run: a few random groups drawn
 * from the foes unlocked so far, sized from a growing budget, overlapping in
 * time, with health scaled for the wave — and on every boss wave, the next boss
 * in the rotation after a lighter escort.
 */
export function generateEndlessWave(rules: EndlessRules, waveNumber: number, rng: () => number): WaveDef {
  const pool = rules.foes.filter((f) => f.fromWave <= waveNumber);
  const bossWave = isEndlessBossWave(waveNumber);
  const budget = waveBudget(waveNumber) * (bossWave ? 0.6 : 1);
  const foeHealth = endlessFoeHealthMult(waveNumber);
  // Later waves split into more groups, and pack them tighter.
  const maxGroups = Math.min(5, 1 + Math.floor(waveNumber / 4));
  const groupCount = 1 + Math.floor(rng() * maxGroups);
  const shares = Array.from({ length: groupCount }, () => 0.5 + rng());
  const shareTotal = shares.reduce((a, b) => a + b, 0);
  const tighten = Math.max(0.6, 1 - waveNumber * 0.01);

  const groups: EnemyGroup[] = [];
  let prevDuration = 0;
  for (const share of shares) {
    const foe = pickFoe(pool, waveNumber, rng);
    const count = Math.max(1, Math.round((budget * share) / shareTotal / foe.cost));
    const spacing = +((0.45 + rng() * 0.5) * tighten).toFixed(2);
    // Each group starts part-way through the previous one, so they overlap.
    const delay = groups.length === 0 ? 0 : +(prevDuration * (0.25 + rng() * 0.75)).toFixed(2);
    groups.push({ enemyId: foe.enemyId, count, spacing, delay, healthMult: foeHealth > 1 ? foeHealth : undefined });
    prevDuration = count * spacing;
  }

  if (bossWave) {
    const { enemyId, lap } = endlessBossFor(rules, waveNumber);
    const mult = endlessBossHealthMult(lap);
    groups.push({ enemyId, count: 1, delay: +(prevDuration * 0.5 + 2).toFixed(2), healthMult: mult > 1 ? mult : undefined });
  }
  return { groups };
}

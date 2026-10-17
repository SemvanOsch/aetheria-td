/**
 * Read-only questions about a project: what a stage spawns, where a foe is
 * used, and the numbers behind each wave (enemy count, total health, gold,
 * timing). All maths goes through the game's own helpers (`groupSpacing`,
 * `bossDefFromMeta`, `WAVE_CLEAR_GOLD`), so the summaries match the engine.
 */

import { TILE } from '@game/domain/grid';
import { bossIdForLevel, type EnemyDef } from '@game/domain/enemies';
import { DEFAULT_OWNED_UNIT_IDS } from '@game/domain/units';
import { ENDLESS_LEVELS } from '@game/domain/endless';
import { groupSpacing, type WaveDef } from '@game/domain/levels';
import { WAVE_CLEAR_GOLD, WAVE_CLEAR_GOLD_DEFAULT } from '@game/engine/GameEngine';
import type { ContentProject, EditorLane, EditorLevel } from './types';

/** Number of waves in a stage: its longest lane's wave count. */
export function levelTotalWaves(level: Pick<EditorLevel, 'lanes'>): number {
  return level.lanes.reduce((max, lane) => Math.max(max, lane.waves.length), 0);
}

/** Ids of every foe a stage's waves spawn. */
export function enemyIdsUsedBy(level: Pick<EditorLevel, 'lanes'>): Set<string> {
  const out = new Set<string>();
  for (const lane of level.lanes) for (const w of lane.waves) for (const g of w.groups ?? []) out.add(g.enemyId);
  return out;
}

export const bossEnemyIds = (p: ContentProject) => p.bosses.map((b) => bossIdForLevel(b.level));

/** Where the game's own code (not data) refers to a foe or champion by id. */
export const CODE_REFERENCES: Record<string, string> = {
  cap_grunt: 'The Getaway ending cutscene (the army storming the field)',
  cap_brute2: 'The Getaway ending cutscene (the army storming the field)',
  ...Object.fromEntries(DEFAULT_OWNED_UNIT_IDS.map((id) => [id, 'the champions every new player starts with'])),
};

/** Endless-mode pools (read-only in the editor) that field a foe. */
export function endlessUsesOf(enemyId: string): string[] {
  return ENDLESS_LEVELS.filter((l) => l.endless?.foes.some((f) => f.enemyId === enemyId)).map((l) => l.name);
}

export interface Usage {
  levelId: number;
  levelName: string;
  lane: number;
  wave: number;
  count: number;
}

/** Every wave group that spawns `enemyId`, plus other references to it. */
export function enemyUsage(p: ContentProject, enemyId: string) {
  const waves: Usage[] = [];
  const bossOf: { id: number; name: string }[] = [];
  for (const l of p.levels) {
    if (l.bossId === enemyId) bossOf.push({ id: l.id, name: l.name });
    l.lanes.forEach((lane, li) =>
      lane.waves.forEach((w, wi) =>
        (w.groups ?? []).forEach((g) => {
          if (g.enemyId === enemyId) waves.push({ levelId: l.id, levelName: l.name, lane: li, wave: wi, count: g.count });
        }),
      ),
    );
  }
  const summoners = [
    ...p.enemies.filter((e) => e.summon?.enemyId === enemyId).map((e) => e.name),
    ...p.bosses.filter((b) => b.summon?.enemyId === enemyId).map((b) => b.name),
  ];
  return { waves, bossOf, summoners, endless: endlessUsesOf(enemyId), code: CODE_REFERENCES[enemyId] };
}

/** A lane's walking length in px (turn cell centre to turn cell centre). */
export function laneLength(lane: EditorLane): number {
  let len = 0;
  for (let i = 1; i < lane.path.length; i++) {
    len += (Math.abs(lane.path[i].col - lane.path[i - 1].col) + Math.abs(lane.path[i].row - lane.path[i - 1].row)) * TILE;
  }
  return len;
}

export interface WaveStats {
  enemies: number;
  health: number;
  gold: number;
  mana: number;
  /** Seconds from wave start to its last spawn (lanes run in parallel). */
  spawnTime: number;
  /** Rough seconds until the last foe would reach the castle unhindered. */
  arriveTime: number;
  /** Gold paid for clearing the wave. */
  clearGold: number;
  bosses: string[];
  /** Ids that don't resolve (shown as problems). */
  unknown: string[];
}

/** Timing and totals of one lane's wave, replaying `GameEngine.queueGroups`. */
function laneWaveStats(wave: WaveDef | undefined, lane: EditorLane, catalog: Record<string, EnemyDef>, s: WaveStats) {
  if (!wave) return;
  const len = laneLength(lane);
  let groupStart = 0;
  for (const g of wave.groups ?? []) {
    const def = catalog[g.enemyId];
    const start = groupStart + (g.delay ?? 0);
    const count = Math.max(0, g.count || 0);
    const last = start + Math.max(0, count - 1) * groupSpacing(g);
    groupStart = start;
    if (!def) {
      s.unknown.push(g.enemyId);
      continue;
    }
    s.enemies += count;
    s.health += count * Math.round(def.health * (g.healthMult ?? 1));
    s.gold += count * def.reward;
    s.mana += count * (def.mana ?? 0);
    s.spawnTime = Math.max(s.spawnTime, last);
    if (def.speed > 0) s.arriveTime = Math.max(s.arriveTime, last + len / def.speed);
    if (def.boss && !s.bosses.includes(def.name)) s.bosses.push(def.name);
  }
}

/** Totals for wave `index` (0-based) across all of a stage's lanes. */
export function waveStats(level: EditorLevel, index: number, catalog: Record<string, EnemyDef>): WaveStats {
  const s: WaveStats = {
    enemies: 0, health: 0, gold: 0, mana: 0, spawnTime: 0, arriveTime: 0,
    clearGold: WAVE_CLEAR_GOLD[index] ?? WAVE_CLEAR_GOLD_DEFAULT,
    bosses: [], unknown: [],
  };
  level.lanes.forEach((lane) => {
    if (lane.revealAtWave !== undefined && index < lane.revealAtWave) return; // hidden lanes don't spawn
    laneWaveStats(lane.waves[index], lane, catalog, s);
  });
  return s;
}

/** Stats for a single lane's wave (for the per-lane breakdown). */
export function laneWaveSummary(level: EditorLevel, laneIndex: number, index: number, catalog: Record<string, EnemyDef>): WaveStats {
  const s = waveStats({ ...level, lanes: [] }, index, catalog);
  const lane = level.lanes[laneIndex];
  if (lane && !(lane.revealAtWave !== undefined && index < lane.revealAtWave)) laneWaveStats(lane.waves[index], lane, catalog, s);
  return s;
}

/** Whole-stage totals. */
export function levelStats(level: EditorLevel, catalog: Record<string, EnemyDef>) {
  const waves = Array.from({ length: levelTotalWaves(level) }, (_, i) => waveStats(level, i, catalog));
  return {
    waves,
    enemies: waves.reduce((n, w) => n + w.enemies, 0),
    health: waves.reduce((n, w) => n + w.health, 0),
    gold: waves.reduce((n, w) => n + w.gold + w.clearGold, 0) + level.startingGold,
  };
}

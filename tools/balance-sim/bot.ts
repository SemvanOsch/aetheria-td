/**
 * The balance bot: plays one stage headlessly on the real `GameEngine` and
 * reports how it went. Placement maximises path coverage, spending is greedy on
 * estimated damage per gold, lanterns are lit when they give placed champions
 * their range back, and hero abilities are cast the moment they are ready.
 *
 * Bundled with esbuild and run in Node by `run.mjs` (see `npm run balance`).
 */
import { GameEngine } from '../../src/engine/GameEngine';
import { getLevel, lanePathCells } from '../../src/domain/levels';
import { ALL_UNITS, getUnit, effectiveAoe, effectiveBounces, nextUpgrade, withUpgradeChoice, type UnitDef } from '../../src/domain/units';
import {
  MASTERY_TREES,
  masteryStats,
  masteryBurst,
  masteryUpgradeCost,
  masteryStartingGoldBonus,
  masteryWeaponForm,
} from '../../src/domain/mastery';
import { critChanceFor, critMultiplierFor } from '../../src/domain/combat';
import { syncPlayerChampions } from '../../src/domain/playerChampion';
import { defaultPlayerSprite } from '../../src/domain/playerSprite';
import { lightableProp } from '../../src/domain/mist';
import { COLS, ROWS, TILE, cellCenter, cellKey } from '../../src/domain/grid';

export type Mastery = 'none' | 'full';

export interface HeroVariant {
  key: string;
  id: string;
  prof: 'sword' | 'bow' | 'magic';
  mastery: Mastery;
  /** The exclusive capstone node to pick for a full-mastery build. */
  variant?: string;
}

/** Base heroes play with no mastery; each capstone build plays the full tree. */
export const HEROES: HeroVariant[] = [
  { key: 'Blade', id: 'player-blade', prof: 'sword', mastery: 'none' },
  { key: 'Bow', id: 'player-bow', prof: 'bow', mastery: 'none' },
  { key: 'Magic', id: 'player-magic', prof: 'magic', mastery: 'none' },
  { key: 'Blade+CrossSlash', id: 'player-blade', prof: 'sword', mastery: 'full', variant: 'cross_slash' },
  { key: 'Claymore', id: 'player-blade', prof: 'sword', mastery: 'full', variant: 'claymore' },
  { key: 'Bow+Fivefold', id: 'player-bow', prof: 'bow', mastery: 'full', variant: 'fivefold_volley' },
  { key: 'Longbow', id: 'player-bow', prof: 'bow', mastery: 'full', variant: 'longbow' },
  { key: 'Magic+GreaterOrb', id: 'player-magic', prof: 'magic', mastery: 'full', variant: 'greater_orb' },
  { key: 'Staff', id: 'player-magic', prof: 'magic', mastery: 'full', variant: 'arcane_staff' },
];

/**
 * Teams fielded beside the hero. Mastery level follows the hero's. Every
 * fighting champion in the catalog also gets an "only X" team of its own, so a
 * new unit is tested the moment it is added to `UNITS`.
 */
export const TEAMS: Record<string, string[]> = {
  'hero only': [],
  starter: ['swordsman', 'archer'],
  commons: ['farmer', 'archer', 'crossbow', 'swordsman', 'spearman'],
  'commons no farmer': ['archer', 'crossbow', 'swordsman', 'spearman'],
  rares: ['wizard', 'elf', 'archer', 'crossbow', 'bard'],
  ...Object.fromEntries(ALL_UNITS.filter((u) => !u.generator && !u.bard).map((u) => [`mono ${u.id}`, [u.id]])),
};

/** Which node of the Farmer's exclusive pair a full-mastery Farmer runs. */
const FARMER_CHOICE = 'better_soil';

export interface RunResult {
  level: number;
  section: string;
  stageName: string;
  hero: string;
  team: string;
  mastery: Mastery;
  seed: number;
  outcome: string;
  wavesCleared: number;
  totalWaves: number;
  baseHp: number;
  /** Furthest any foe got along its lane, 0-1 (1 = reached the base). */
  closestCall: number;
  time: number;
  dmgByUnit: Record<string, number>;
  goldByUnit: Record<string, number>;
  countByUnit: Record<string, number>;
  tiers: Record<string, number[]>;
  /** Base HP lost in each wave. */
  leakByWave: number[];
  goldLeft: number;
  bossKilled: boolean;
  lanterns: number;
  abilityCasts: number;
  /** Lowest starting gold (step 10, up to 600) that wins with seed 1; 999 = never. */
  minGold?: number;
}

/** Every node of a champion's tree, keeping one member of each exclusive group. */
function fullTree(unitId: string, variant?: string): string[] {
  const tree = MASTERY_TREES[unitId] ?? [];
  const chosen: Record<string, string> = {};
  for (const n of tree) if (n.exclusiveGroup && !chosen[n.exclusiveGroup]) chosen[n.exclusiveGroup] = n.id;
  if (variant) {
    const n = tree.find((x) => x.id === variant);
    if (n?.exclusiveGroup) chosen[n.exclusiveGroup] = variant;
  }
  if (unitId === 'farmer') chosen.farming = FARMER_CHOICE;
  return tree.filter((n) => !n.exclusiveGroup || chosen[n.exclusiveGroup] === n.id).map((n) => n.id);
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rough multiplier for how many foes an attack shape tends to hit. */
const AOE_FACTOR: Record<string, number> = { single: 1, line: 1.8, cone: 2.2, circle: 2 };

/** The bot's damage-per-second estimate for a champion at an in-stage tier. */
function estDps(def: UnitDef, tier: number, purchased: string[]): { dps: number; range: number } {
  const s = masteryStats(def, tier, purchased);
  const burst = masteryBurst(def, purchased) || 1;
  const aoe = AOE_FACTOR[effectiveAoe(def, tier)] ?? 1;
  const bounces = effectiveBounces(def, tier);
  const cc = critChanceFor(def, purchased);
  const cm = critMultiplierFor(def, purchased);
  return { dps: s.damage * s.attackSpeed * burst * aoe * (1 + 0.4 * bounces) * (1 + cc * (cm - 1)), range: s.range };
}

type Cell = { col: number; row: number };

/** Play one stage to the end. `goldOverride` replaces the stage's starting gold. */
export function runOne(levelId: number, hero: HeroVariant, teamKey: string, seed: number, goldOverride?: number): RunResult {
  const level = getLevel(levelId);
  if (!level) throw new Error(`Unknown stage ${levelId}`);
  const teamUnits = TEAMS[teamKey];
  if (!teamUnits) throw new Error(`Unknown team "${teamKey}"`);
  const upgrades: Record<string, string[]> = {};
  if (hero.mastery === 'full') {
    upgrades[hero.id] = fullTree(hero.id, hero.variant);
    for (const u of teamUnits) upgrades[u] = fullTree(u);
  }
  const form = masteryWeaponForm(hero.id, upgrades[hero.id] ?? []);
  syncPlayerChampions({ name: 'Sim', sprite: defaultPlayerSprite(), proficiency: hero.prof }, [hero.id], [], { [hero.id]: form });

  const team = [hero.id, ...teamUnits];
  const startGold = (goldOverride ?? level.startingGold) + masteryStartingGoldBonus(team, upgrades);
  const engine = new GameEngine(level, startGold, upgrades, mulberry32(seed * 7919 + levelId));
  engine.armorUnlocked = false;
  const purchased = (id: string) => upgrades[id] ?? [];

  // Path samples on every lane (hidden ones included) score placements; the bot
  // never builds on any lane's cells, so a lane revealed later can't strand a tower.
  const samples: { x: number; y: number }[] = [];
  const forbidden = new Set<string>();
  level.lanes.forEach((lane, i) => {
    for (const k of lanePathCells(lane)) forbidden.add(k);
    const length = engine.lanes[i].totalPathLength;
    for (let d = 0; d <= length; d += 6) {
      const pt = engine.pointOnLane(i, d);
      if (pt.x >= 0 && pt.x <= COLS * TILE && pt.y >= 0 && pt.y <= ROWS * TILE) samples.push(pt);
    }
  });
  const coverage = (col: number, row: number, range: number) => {
    const c = cellCenter(col, row);
    let n = 0;
    for (const s of samples) if ((s.x - c.x) ** 2 + (s.y - c.y) ** 2 <= range * range) n++;
    return n;
  };
  const freeCells = () => {
    const out: Cell[] = [];
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      if (!forbidden.has(cellKey(c, r)) && engine.canPlaceAt(c, r)) out.push({ col: c, row: r });
    }
    return out;
  };
  const bestCell = (range: number) => {
    let cell: Cell | null = null;
    let cov = -1;
    for (const c of freeCells()) {
      const v = coverage(c.col, c.row, range * engine.mistRangeMult(c.col, c.row));
      if (v > cov) { cov = v; cell = c; }
    }
    return { cell, cov };
  };
  const farmCell = () => {
    let cell: Cell | null = null;
    let cov = Infinity;
    for (const c of freeCells()) {
      const v = coverage(c.col, c.row, 70);
      if (v < cov) { cov = v; cell = c; }
    }
    return cell;
  };
  const combatTowers = () => engine.towers.filter((t) => !t.def.bard && !t.def.generator);
  const bardCell = (range: number) => {
    let cell: Cell | null = null;
    let best = -1;
    const ts = combatTowers();
    for (const c of freeCells()) {
      const at = cellCenter(c.col, c.row);
      const v = ts.filter((t) => (t.pos.x - at.x) ** 2 + (t.pos.y - at.y) ** 2 <= range * range).length;
      if (v > best) { best = v; cell = c; }
    }
    return best >= 2 ? cell : null;
  };
  const avgCombatDps = () => {
    const ts = combatTowers();
    if (!ts.length) return 0;
    return ts.reduce((a, t) => a + (estDps(t.def, t.upgradeTier, purchased(t.def.id)).dps * coverage(t.col, t.row, t.range)) / 100, 0) / ts.length;
  };

  // Credit damage to the tower that dealt it.
  const dmgByUid: Record<number, number> = {};
  const eng = engine as unknown as { damageEnemy: (e: { health: number }, amount: number, source?: { uid: number }) => boolean };
  const damageEnemy = eng.damageEnemy.bind(engine);
  eng.damageEnemy = (enemy, amount, source) => {
    const before = Math.max(0, enemy.health);
    const landed = damageEnemy(enemy, amount, source);
    const dealt = before - Math.max(0, enemy.health);
    if (source && dealt > 0) dmgByUid[source.uid] = (dmgByUid[source.uid] ?? 0) + dealt;
    return landed;
  };
  const waveIndex = () => (engine as unknown as { waveIndex: number }).waveIndex;

  // Greedy spender: take the best value-per-gold action; save up if it isn't affordable yet.
  const spend = () => {
    for (let guard = 0; guard < 40; guard++) {
      const wavesLeft = engine.totalWaves - waveIndex();
      const acts: { cost: number; value: number; run: () => boolean }[] = [];
      for (const id of team) {
        const def = getUnit(id);
        if (!def || !engine.canDeployMore(id)) continue;
        if (def.generator) {
          if (wavesLeft >= 3) acts.push({ cost: def.cost, value: 1e9, run: () => { const c = farmCell(); return !!c && engine.placeUnit(id, c.col, c.row); } });
          continue;
        }
        if (def.bard) {
          if (combatTowers().length < 3) continue;
          const c = bardCell(def.range);
          if (c) acts.push({ cost: def.cost, value: (0.12 * 2 * avgCombatDps()) / def.cost, run: () => engine.placeUnit(id, c.col, c.row) });
          continue;
        }
        const e = estDps(def, 0, purchased(id));
        const { cell, cov } = bestCell(e.range);
        if (!cell) continue;
        // Heroes are free; repeats of one unit are worth a little less each, so teams stay mixed.
        const value = def.cost === 0 ? 1e12 : ((e.dps * cov) / 100 / def.cost) * Math.pow(0.7, engine.deployedCount(id));
        acts.push({ cost: def.cost, value, run: () => engine.placeUnit(id, cell.col, cell.row) });
      }
      for (const t of engine.towers) {
        const up = t.def.id.startsWith('player-') ? null : nextUpgrade(t.def, t.upgradeTier);
        if (!up) continue;
        // A fork is weighed as one buy per option, each on the def with it chosen.
        const options = up.choices ? up.choices.map((_, ci) => ci) : [undefined];
        for (const choice of options) {
          const next = choice == null ? t.def : withUpgradeChoice(t.def, t.upgradeTier + 1, choice);
          const cost = masteryUpgradeCost(t.def, t.upgradeTier + 1, purchased(t.def.id), choice);
          let value: number;
          if (t.def.generator) {
            if (wavesLeft < 6) continue;
            value = 0.5;
          } else if (t.def.bard) {
            value = (0.08 * 2 * avgCombatDps()) / cost;
          } else {
            const a = estDps(t.def, t.upgradeTier, purchased(t.def.id));
            const b = estDps(next, t.upgradeTier + 1, purchased(t.def.id));
            const scale = t.range / Math.max(1, a.range);
            value = ((b.dps * coverage(t.col, t.row, b.range * scale)) / 100 - (a.dps * coverage(t.col, t.row, a.range * scale)) / 100) / cost;
          }
          const uid = t.uid;
          acts.push({ cost, value, run: () => engine.upgradeTower(uid, choice) });
        }
      }
      (level.decor ?? []).forEach((prop, i) => {
        const cost = engine.lanternCost(i);
        const light = lightableProp(prop.kind);
        if (cost == null || !light || engine.isLanternLit(i)) return;
        const at = cellCenter(prop.col, prop.row);
        let gain = 0;
        for (const t of combatTowers()) {
          if (t.mistMult >= 1 || Math.hypot(t.pos.x - at.x, t.pos.y - at.y) > light.radius) continue;
          const e = estDps(t.def, t.upgradeTier, purchased(t.def.id));
          gain += (e.dps * (coverage(t.col, t.row, t.range / t.mistMult) - coverage(t.col, t.row, t.range))) / 100;
        }
        if (gain > 0) acts.push({ cost, value: gain / cost, run: () => engine.lightLantern(i) });
      });
      if (!acts.length) return;
      acts.sort((a, b) => b.value - a.value);
      const best = acts[0];
      if (best.cost > engine.currency || !best.run()) return;
    }
  };

  let casts = 0;
  const castAbilities = () => {
    for (const t of engine.towers) {
      if (!t.ability || t.abilityCooldown > 0 || t.mana < (t.ability.manaCost ?? 0)) continue;
      const near = engine.enemies.some((e) => !e.dead && (e.pos.x - t.pos.x) ** 2 + (e.pos.y - t.pos.y) ** 2 <= t.range * t.range);
      if (near && engine.activateAbility(t.uid)) casts++;
    }
  };

  // Fixed 60 Hz steps (like the game's fast-forward sub-steps); decisions every 0.2s.
  const dt = 1 / 60;
  let time = 0;
  let decide = 0;
  let closest = 0;
  let lastHp = engine.baseHealth;
  const leakByWave: number[] = [];
  while (engine.outcome === 'playing' && time < 2400) {
    if (engine.phase === 'prep') {
      leakByWave.push(lastHp - engine.baseHealth);
      lastHp = engine.baseHealth;
      spend();
      engine.startWave();
    }
    engine.update(dt);
    time += dt;
    decide += dt;
    for (const e of engine.enemies) {
      if (e.dead) continue;
      closest = Math.max(closest, e.dist / engine.lanes[e.laneIndex].totalPathLength);
    }
    if (decide >= 0.2) {
      decide = 0;
      spend();
      castAbilities();
    }
  }
  leakByWave.push(lastHp - engine.baseHealth);
  leakByWave.shift();

  const dmgByUnit: Record<string, number> = {};
  const goldByUnit: Record<string, number> = {};
  const countByUnit: Record<string, number> = {};
  const tiers: Record<string, number[]> = {};
  for (const t of engine.towers) {
    const k = t.def.id;
    dmgByUnit[k] = (dmgByUnit[k] ?? 0) + (dmgByUid[t.uid] ?? 0);
    goldByUnit[k] = (goldByUnit[k] ?? 0) + t.invested;
    countByUnit[k] = (countByUnit[k] ?? 0) + 1;
    (tiers[k] ??= []).push(t.upgradeTier);
  }
  return {
    level: levelId,
    section: level.section,
    stageName: level.name,
    hero: hero.key,
    team: teamKey,
    mastery: hero.mastery,
    seed,
    outcome: engine.outcome,
    wavesCleared: waveIndex(),
    totalWaves: engine.totalWaves,
    baseHp: Math.max(0, engine.baseHealth),
    closestCall: Math.min(1, closest),
    time: Math.round(time),
    dmgByUnit,
    goldByUnit,
    countByUnit,
    tiers,
    leakByWave,
    goldLeft: Math.round(engine.currency),
    bossKilled: (engine.enemyKills[level.bossId] ?? 0) > 0,
    lanterns: engine.litLanterns.size,
    abilityCasts: casts,
  };
}

/** Lowest starting gold (steps of 10, up to 600) that still wins with seed 1; 999 if none. */
export function minGoldToWin(levelId: number, hero: HeroVariant, teamKey: string): number {
  const wins = (gold: number) => runOne(levelId, hero, teamKey, 1, gold).outcome === 'won';
  if (!wins(600)) return 999;
  if (wins(0)) return 0;
  let lo = 0;
  let hi = 600;
  while (hi - lo > 10) {
    const mid = Math.round((lo + hi) / 20) * 10;
    if (mid <= lo || mid >= hi) break;
    if (wins(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

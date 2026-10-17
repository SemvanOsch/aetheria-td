/**
 * One worker process: plays every hero × team × seed on a single stage and
 * writes the results as JSON. Started by `run.mjs`, one per stage.
 *
 *   node worker.mjs <stage> <out.json> <seeds> <heroes|all> <teams|all>
 */
import { writeFileSync } from 'fs';
import { HEROES, TEAMS, minGoldToWin, runOne, type RunResult } from './bot';

const [stageArg, out, seedsArg, heroesArg, teamsArg] = process.argv.slice(2);
const stage = Number(stageArg);
const seeds = Array.from({ length: Number(seedsArg) || 3 }, (_, i) => i + 1);
const pick = <T>(arg: string | undefined, all: T[], key: (x: T) => string): T[] => {
  if (!arg || arg === 'all') return all;
  const want = arg.split(',').map((s) => s.trim().toLowerCase());
  return all.filter((x) => want.includes(key(x).toLowerCase()));
};
const heroes = pick(heroesArg, HEROES, (h) => h.key);
const teams = pick(teamsArg, Object.keys(TEAMS), (t) => t);

const results: RunResult[] = [];
let done = 0;
const total = heroes.length * teams.length;
for (const hero of heroes) {
  for (const team of teams) {
    const minGold = minGoldToWin(stage, hero, team);
    for (const seed of seeds) results.push({ ...runOne(stage, hero, team, seed), minGold });
    done++;
    if (done % 10 === 0 || done === total) process.stdout.write(`progress ${stage} ${done}/${total}\n`);
  }
}
writeFileSync(out, JSON.stringify(results));

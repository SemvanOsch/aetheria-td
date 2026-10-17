/**
 * Builds the balance report page from saved worker results: one tab per
 * chapter, with charts, tables and findings computed from the numbers.
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const CHAPTER_NAMES = { castle: 'The Castle', capital: 'The Capital', inn: 'The Inn', forest: 'The Forest' };
const MASTERY = ['none', 'full'];
const UNITS = ['archer', 'crossbow', 'swordsman', 'spearman', 'wizard', 'elf'];
/** Units that never deal damage, left out of the damage-per-gold chart. */
const NON_FIGHTERS = ['farmer', 'bard'];
const TEAM_ORDER = ['starter', 'commons', 'commons no farmer', 'rares'];

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const heroKey = (r) => Object.keys(r.dmgByUnit).find((k) => k.startsWith('player-'));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function chapterData(R) {
  const L = [...new Set(R.map((r) => r.level))].sort((a, b) => a - b);
  const fielded = R.filter((r) => r.team !== 'hero only');
  const s1 = fielded.filter((r) => r.seed === 1);

  const stages = L.map((lv) => {
    const any = R.find((r) => r.level === lv);
    const o = { lv, name: any.stageName };
    for (const m of MASTERY) {
      const x = fielded.filter((r) => r.level === lv && r.mastery === m);
      const g = s1.filter((r) => r.level === lv && r.mastery === m);
      const ok = g.filter((r) => r.minGold < 999);
      o[m] = {
        win: x.length ? Math.round((100 * x.filter((r) => r.outcome === 'won').length) / x.length) : null,
        hp: r1(avg(x.map((r) => r.baseHp))),
        minGold: ok.length ? Math.round(avg(ok.map((r) => r.minGold))) : null,
        fails: g.length - ok.length,
        setups: g.length,
      };
    }
    const x = fielded.filter((r) => r.level === lv && r.mastery === 'none');
    const n = any.totalWaves;
    o.leaks = Array.from({ length: n }, (_, i) => r1(avg(x.map((r) => r.leakByWave[i] ?? 0))));
    o.reached = Array.from({ length: n }, (_, i) => (x.length ? Math.round((100 * x.filter((r) => r.wavesCleared >= i).length) / x.length) : 0));
    return o;
  });

  const heroes = [...new Set(R.map((r) => r.hero))].map((h) => {
    const rs = fielded.filter((r) => r.hero === h);
    const gold = s1.filter((r) => r.hero === h && r.minGold < 999).map((r) => r.minGold);
    return {
      h,
      mastery: R.find((r) => r.hero === h).mastery,
      minGold: gold.length ? Math.round(avg(gold)) : null,
      fails: s1.filter((r) => r.hero === h && r.minGold >= 999).length,
      dmg: Math.round(avg(rs.map((r) => r.dmgByUnit[heroKey(r)] ?? 0)) ?? 0),
      share: Math.round(100 * (avg(rs.map((r) => { const t = Object.values(r.dmgByUnit).reduce((a, b) => a + b, 0); return t ? (r.dmgByUnit[heroKey(r)] ?? 0) / t : 0; })) ?? 0)),
      casts: r1(avg(rs.map((r) => r.abilityCasts ?? 0))),
    };
  });

  const fighters = [...new Set(R.flatMap((r) => Object.keys(r.dmgByUnit)))].filter((u) => !u.startsWith('player-') && !NON_FIGHTERS.includes(u));
  const units = [...UNITS.filter((u) => fighters.includes(u)), ...fighters.filter((u) => !UNITS.includes(u))].map((u) => {
    const o = { u };
    for (const m of MASTERY) {
      const x = R.filter((r) => r.mastery === m && r.goldByUnit[u]);
      o[m] = r1(avg(x.map((r) => r.dmgByUnit[u] / r.goldByUnit[u])));
    }
    return o;
  }).filter((u) => u.none != null || u.full != null);

  const teamNames = [...new Set(R.map((r) => r.team))].filter((t) => t !== 'hero only');
  const ordered = [...TEAM_ORDER.filter((t) => teamNames.includes(t)), ...teamNames.filter((t) => !TEAM_ORDER.includes(t)).sort()];
  const teams = ordered.map((t) => {
    const o = { t };
    for (const m of MASTERY) {
      o[m] = L.map((lv) => {
        const x = s1.filter((r) => r.team === t && r.level === lv && r.mastery === m).map((r) => r.minGold);
        const ok = x.filter((g) => g < 999);
        return { g: ok.length ? Math.round(avg(ok)) : null, fail: x.length - ok.length, n: x.length };
      });
      const w = R.filter((r) => r.team === t && r.mastery === m);
      o[m + 'Win'] = w.length ? Math.round((100 * w.filter((r) => r.outcome === 'won').length) / w.length) : null;
    }
    return o;
  });

  return { stages, heroes, units, teams, runs: R.length, findings: findings({ stages, heroes, units, teams }) };
}

/** Plain-language findings, each a [headline, detail] pair, grouped by page section. */
function findings({ stages, heroes, units, teams }) {
  const f = { curve: [], leaks: [], heroes: [], units: [] };
  const known = (m) => stages.filter((s) => s[m].minGold != null);

  const none = known('none');
  if (none.length) {
    const hardest = none.reduce((a, b) => (b.none.minGold > a.none.minGold ? b : a));
    const easiest = none.reduce((a, b) => (b.none.minGold < a.none.minGold ? b : a));
    f.curve.push([`${hardest.name} is the hardest stage.`, `Without mastery it needs about ${hardest.none.minGold} starting gold; ${easiest.name} needs ${easiest.none.minGold}.`]);
    const over = none.filter((s) => s.none.minGold > 200);
    if (over.length) f.curve.push([`${over.length} of ${stages.length} stages need more than the 200 starting gold without mastery.`, over.map((s) => `${s.name} (${s.none.minGold})`).join(', ') + '.']);
    else f.curve.push(['Every stage can be won on 200 starting gold without mastery.', '']);
  }
  const fullOver = known('full').filter((s) => s.full.minGold > 200);
  if (fullOver.length) f.curve.push([`${fullOver.length} stage${fullOver.length > 1 ? 's need' : ' needs'} more than 200 gold even with full mastery.`, fullOver.map((s) => `${s.name} (${s.full.minGold})`).join(', ') + '.']);
  const both = stages.filter((s) => s.none.minGold != null && s.full.minGold != null);
  if (both.length) f.curve.push([`Full mastery is worth about ${Math.round(avg(both.map((s) => s.none.minGold - s.full.minGold)))} starting gold per stage.`, `The ${stages.length > 1 ? 'stage win rates' : 'win rate'} at 200 gold go from ${stages.map((s) => s.none.win + '%').join(', ')} to ${stages.map((s) => s.full.win + '%').join(', ')}.`]);
  const order = [...none].sort((a, b) => a.none.minGold - b.none.minGold).map((s) => s.lv);
  if (order.some((lv, i) => i > 0 && lv < order[i - 1])) f.curve.push(['Difficulty does not rise in stage order.', 'Easiest to hardest: ' + [...none].sort((a, b) => a.none.minGold - b.none.minGold).map((s) => s.name).join(', ') + '.']);
  const fails = stages.filter((s) => s.none.fails + s.full.fails > 0);
  if (fails.length) f.curve.push(['Averages only count setups that can win at all.', fails.map((s) => `${s.name}: ${s.none.fails + s.full.fails} of ${s.none.setups + s.full.setups} setups lose even with 600 gold`).join('; ') + '.']);

  for (const s of stages) {
    const i = s.leaks.reduce((b, v, k) => (v > s.leaks[b] ? k : b), 0);
    if (s.leaks[i] >= 1.5) f.leaks.push([`${s.name} loses the most on wave ${i + 1}${i === s.leaks.length - 1 ? ' (the boss)' : ''}.`, `${s.leaks[i]} base HP on average without mastery; ${s.reached[i]}% of runs reach that wave.`]);
  }
  if (!f.leaks.length) f.leaks.push(['No single wave costs more than 1.5 base HP on average.', '']);

  const capstones = heroes.filter((h) => h.mastery === 'full' && h.minGold != null).sort((a, b) => a.minGold - b.minGold);
  const bases = heroes.filter((h) => h.mastery === 'none' && h.minGold != null).sort((a, b) => a.minGold - b.minGold);
  if (capstones.length) {
    const spread = capstones.at(-1).minGold - capstones[0].minGold;
    f.heroes.push([`Capstones span ${capstones[0].minGold}–${capstones.at(-1).minGold} gold${spread <= 12 ? ', a tight spread' : ''}.`, `Strongest: ${capstones[0].h}. Weakest: ${capstones.at(-1).h}.`]);
    const topDmg = capstones.reduce((a, b) => (b.dmg > a.dmg ? b : a));
    f.heroes.push([`${topDmg.h} deals the most damage per run (${topDmg.dmg.toLocaleString()}).`, '']);
  }
  if (bases.length && capstones.length) f.heroes.push([`Base heroes need ${bases[0].minGold}–${bases.at(-1).minGold}.`, `That's about ${Math.round(avg(bases.map((h) => h.minGold)) - avg(capstones.map((h) => h.minGold)))} gold more than a capstone build.`]);
  const casting = heroes.filter((h) => h.casts >= 0.1);
  f.heroes.push(casting.length
    ? ['Some heroes reach their tier-3 ability.', casting.map((h) => `${h.h}: ${h.casts} casts per run`).join(', ') + '. Every other hero casts close to none.']
    : ['No hero cast its tier-3 ability.', 'Heroes never bank enough wave EXP to reach tier 3 before the stage ends.']);

  for (const m of MASTERY) {
    const xs = units.filter((u) => u[m] != null).sort((a, b) => b[m] - a[m]);
    if (xs.length < 2) continue;
    f.units.push([`${m === 'none' ? 'Without' : 'With full'} mastery, the ${cap(xs[0].u)} is the most efficient and the ${cap(xs.at(-1).u)} the least.`, `${xs[0][m]} vs ${xs.at(-1)[m]} damage per gold.`]);
  }
  const gain = units.filter((u) => u.none != null && u.full != null).map((u) => ({ u: u.u, g: u.full / u.none }));
  if (gain.length) { const top = gain.reduce((a, b) => (b.g > a.g ? b : a)); f.units.push([`The ${cap(top.u)} gains the most from mastery.`, `+${Math.round((top.g - 1) * 100)}% damage per gold.`]); }
  for (const m of MASTERY) {
    const never = teams.filter((t) => t.t.startsWith('mono') && t[m + 'Win'] === 0).map((t) => cap(t.t.replace('mono ', '')));
    if (never.length) f.units.push([`${never.join(', ')}-only teams never win at 200 gold ${m === 'none' ? 'without' : 'with full'} mastery.`, '']);
  }
  const farm = teams.find((t) => t.t === 'commons');
  const noFarm = teams.find((t) => t.t === 'commons no farmer');
  if (farm && noFarm) {
    for (const m of MASTERY) {
      const pairs = farm[m].map((c, i) => [c.g, noFarm[m][i].g]).filter(([a, b]) => a != null && b != null);
      if (!pairs.length) continue;
      const d = Math.round(avg(pairs.map(([a, b]) => a - b)));
      f.units.push([`${m === 'none' ? 'Without' : 'With full'} mastery the Farmer ${Math.abs(d) <= 10 ? 'roughly breaks even' : d > 0 ? 'costs more than it earns' : 'pays for itself'}.`, `The commons team needs ${Math.abs(d)} gold ${d > 0 ? 'more' : 'less'} on average with a Farmer than without one.`]);
    }
  }
  return f;
}

export function buildReport(runsDir, templatePath, outPath) {
  const files = readdirSync(runsDir).filter((f) => /^stage-\d+\.json$/.test(f));
  const all = files.flatMap((f) => JSON.parse(readFileSync(join(runsDir, f), 'utf8')));
  if (!all.length) throw new Error('No results to report on.');
  const sections = [...new Set(all.sort((a, b) => a.level - b.level).map((r) => r.section))];
  const chapters = sections.map((id) => {
    const R = all.filter((r) => r.section === id);
    const lv = [...new Set(R.map((r) => r.level))];
    return { id, name: CHAPTER_NAMES[id] ?? cap(id), range: `${Math.min(...lv)}–${Math.max(...lv)}`, ...chapterData(R) };
  });
  const data = { generated: new Date().toISOString().slice(0, 16).replace('T', ' '), chapters };
  writeFileSync(outPath, readFileSync(templatePath, 'utf8').replace('/*DATA*/null', JSON.stringify(data)));
  return outPath;
}

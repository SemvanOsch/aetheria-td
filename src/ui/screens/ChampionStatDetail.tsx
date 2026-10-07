import { useMemo, useState, type ReactNode } from 'react';
import {
  aoeLabel,
  attackTypeLabel,
  coneAngleDeg,
  damageTypeLabel,
  effectiveAoe,
  effectiveBounces,
  effectiveGenerate,
  maxUpgradeTier,
  upgradeEffectLabel,
  type AbilityDef,
  type UnitDef,
} from '../../domain/units';
import {
  masteryBard,
  masteryBounceDamageMult,
  masteryBurst,
  masteryBurstRadius,
  masteryCrossSlash,
  masteryFinalBounceDamageMult,
  masteryGreaterOrb,
  masteryHarvest,
  masteryKnockback,
  masteryPreload,
  masteryRangeAura,
  masteryAdjacentDamageMult,
  masteryStats,
  masteryThrow,
  masteryTree,
  masteryUpgradeCost,
  masteryUpgradeDeltas,
  type MasteryUpgradeDef,
} from '../../domain/mastery';
import { critChanceFor, critMultiplierFor } from '../../domain/combat';
import { RARITIES } from '../../domain/rarity';
import { BOUNCE_DAMAGE_MULTS } from '../../engine/GameEngine';
import { UnitSprite } from '../components/UnitSprite';
import { ordinal } from '../championStats';

/**
 * Developer-only deep dive into one champion (`#champions/<key>`, reached by
 * clicking a row of the `#champions` sheet): every in-stage tier with and
 * without a chosen set of mastery nodes, DPS and DPS per gold (cumulative and
 * per upgrade), abilities and the skill tree. All numbers come from the same
 * shared helpers the engine reads (`masteryStats`, `critChanceFor`, …).
 */

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? (Number.isInteger(n) ? `${n}` : n.toFixed(d)) : '—');
const pct = (f: number) => `${+(f * 100).toFixed(1)}%`;

/** Heroes level up in-stage from pooled EXP, so their tier "costs" are EXP thresholds, not gold. */
const isHero = (u: UnitDef) => u.rarity === 'hero';

/** The damage fractions of each extra leap of a bouncing shot (mirrors the engine's chain). */
function bounceFractions(u: UnitDef, tier: number, purchased: string[]): number[] {
  const n = effectiveBounces(u, tier);
  const override = masteryBounceDamageMult(u.id, purchased);
  const out: number[] = [];
  for (let i = 1; i <= n; i++) {
    out.push(override || BOUNCE_DAMAGE_MULTS[Math.min(i, BOUNCE_DAMAGE_MULTS.length) - 1] || 0);
  }
  const final = masteryFinalBounceDamageMult(u.id, purchased);
  if (n > 0 && final > 0) out.push(final);
  return out;
}

interface CombatRow {
  tier: number;
  damage: number;
  attackSpeed: number;
  range: number;
  /** Raw damage × attack speed × volley — no crit. */
  rawDps: number;
  /** Raw DPS with average crit and Cross Slash folded in, on one target. */
  dps: number;
  /** `dps` including every bounce leap's damage (= dps when the shot doesn't bounce). */
  chainDps: number;
  /** Gold (EXP for a hero) spent to reach this tier (deploy cost + upgrade prices). */
  invested: number;
  /** Price of this tier's upgrade (0 for tier 0). */
  tierCost: number;
}

function combatRows(u: UnitDef, purchased: string[]): CombatRow[] {
  const burst = masteryBurst(u, purchased);
  const cc = critChanceFor(u, purchased);
  const cm = critMultiplierFor(u, purchased);
  const critFactor = 1 + cc * (cm - 1);
  const cross = u.visual.shape === 'player-blade' ? masteryCrossSlash(u.id, purchased) : undefined;
  const crossFactor = cross ? (cross.every - 1 + cross.damageMult) / cross.every : 1;
  const rows: CombatRow[] = [];
  let invested = u.cost;
  for (let t = 0; t <= maxUpgradeTier(u); t++) {
    const tierCost = t === 0 ? 0 : masteryUpgradeCost(u, t, purchased);
    invested += tierCost;
    const s = masteryStats(u, t, purchased);
    const rawDps = s.damage * s.attackSpeed * burst;
    const dps = rawDps * critFactor * crossFactor;
    const chain = 1 + bounceFractions(u, t, purchased).reduce((a, b) => a + b, 0);
    rows.push({ tier: t, ...s, rawDps, dps, chainDps: dps * chain, invested, tierCost });
  }
  return rows;
}

/** A value with the no-mastery figure underneath when they differ. */
function Cmp({ v, base, digits = 1, suffix = '' }: { v: number; base: number; digits?: number; suffix?: string }) {
  const diff = Math.abs(v - base) > 1e-9;
  const delta = base !== 0 ? (v / base - 1) * 100 : 0;
  return (
    <>
      <span className={diff ? 'cd-up' : undefined}>
        {fmt(v, digits)}
        {suffix}
      </span>
      {diff && (
        <div className="es-id">
          {fmt(base, digits)}
          {suffix}
          {base !== 0 && ` · ${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%`}
        </div>
      )}
    </>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="cd-bar">
      <div style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

function CombatTable({ u, purchased }: { u: UnitDef; purchased: string[] }) {
  const rows = combatRows(u, purchased);
  const base = combatRows(u, []);
  const hero = isHero(u);
  const cur = hero ? 'EXP' : 'Gold';
  /** Price per point of DPS — '—' when there's no price or no DPS gained. */
  const per = (cost: number, dps: number, costB: number, dpsB: number) =>
    cost > 0 && dps > 1e-9 ? <Cmp v={cost / dps} base={dpsB > 1e-9 ? costB / dpsB : cost / dps} digits={1} /> : '—';
  const bounces = rows.some((r) => r.chainDps !== r.dps);
  const maxDps = Math.max(...rows.map((r) => r.chainDps), ...base.map((r) => r.chainDps));
  return (
    <div className="es-scroll">
      <table className="es-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th className="num">{hero ? 'EXP' : 'Cost'}</th>
            <th className="num">Dmg</th>
            <th className="num">Atk/s</th>
            <th className="num">Range</th>
            <th className="num">Raw DPS</th>
            <th className="num">DPS (crit)</th>
            {bounces && <th className="num">DPS w/ bounces</th>}
            <th className="num">{hero ? 'EXP so far' : 'Invested'}</th>
            <th className="num" title={`Total ${cur.toLowerCase()} spent to reach this tier, per point of DPS — lower is better`}>{cur} / DPS</th>
            <th className="num">Δ DPS</th>
            <th className="num" title={`This upgrade's price per point of DPS it adds — lower is better`}>{cur} / Δ DPS</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const b = base[i];
            const prev = rows[i - 1];
            const prevB = base[i - 1];
            const up = r.tier > 0 ? u.upgrades[r.tier - 1] : null;
            const total = bounces ? r.chainDps : r.dps;
            const totalB = bounces ? b.chainDps : b.dps;
            const dDps = prev ? total - (bounces ? prev.chainDps : prev.dps) : total;
            const dDpsB = prevB ? totalB - (bounces ? prevB.chainDps : prevB.dps) : totalB;
            const costNow = r.tier === 0 ? u.cost : r.tierCost;
            const costBase = r.tier === 0 ? u.cost : b.tierCost;
            return (
              <tr key={r.tier}>
                <td>
                  <div className="es-name">{r.tier === 0 ? 'Deploy' : `T${r.tier} · ${up!.name}`}</div>
                  <div className="es-id">
                    {r.tier === 0
                      ? 'base'
                      : upgradeEffectLabel({
                        ...masteryUpgradeDeltas(u, r.tier, purchased),
                        setAoe: up!.setAoe,
                        coneAngle: up!.setAoe === 'cone' ? coneAngleDeg(u) : undefined,
                        ability: up!.ability?.name,
                      }) || up!.description}
                  </div>
                </td>
                <td className="num">
                  {hero && r.tier === 0 ? 'Free' : <Cmp v={r.tier === 0 ? u.cost : r.tierCost} base={r.tier === 0 ? u.cost : b.tierCost} digits={0} />}
                </td>
                <td className="num"><Cmp v={r.damage} base={b.damage} digits={0} /></td>
                <td className="num"><Cmp v={r.attackSpeed} base={b.attackSpeed} digits={2} /></td>
                <td className="num"><Cmp v={r.range} base={b.range} digits={0} /></td>
                <td className="num"><Cmp v={r.rawDps} base={b.rawDps} /></td>
                <td className="num"><Cmp v={r.dps} base={b.dps} /></td>
                {bounces && <td className="num"><Cmp v={r.chainDps} base={b.chainDps} /></td>}
                <td className="num"><Cmp v={r.invested} base={b.invested} digits={0} /></td>
                <td className="num">{per(r.invested, total, b.invested, totalB)}</td>
                <td className="num"><Cmp v={dDps} base={dDpsB} /></td>
                <td className="num">{per(costNow, dDps, costBase, dDpsB)}</td>
                <td style={{ minWidth: 90 }}>
                  <Bar value={total} max={maxDps} />
                  <div className="cd-bar cd-bar-base"><div style={{ width: `${maxDps > 0 ? (totalB / maxDps) * 100 : 0}%` }} /></div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GeneratorTable({ u, purchased }: { u: UnitDef; purchased: string[] }) {
  const times = u.generator!.timesPerWave;
  const build = (p: string[]) => {
    let invested = u.cost;
    return Array.from({ length: maxUpgradeTier(u) + 1 }, (_, t) => {
      const tierCost = t === 0 ? 0 : masteryUpgradeCost(u, t, p);
      invested += tierCost;
      const harvest = masteryHarvest(effectiveGenerate(u, t), u.id, p);
      return { t, tierCost, invested, harvest, perWave: harvest * times };
    });
  };
  const rows = build(purchased);
  const base = build([]);
  return (
    <div className="es-scroll">
      <table className="es-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th className="num">Cost</th>
            <th className="num">Harvest</th>
            <th className="num">Gold / wave</th>
            <th className="num">Invested</th>
            <th className="num">Payback (waves)</th>
            <th className="num">Δ gold / wave</th>
            <th className="num">Upgrade payback</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const b = base[i];
            const dW = r.perWave - (rows[i - 1]?.perWave ?? 0);
            const dWB = b.perWave - (base[i - 1]?.perWave ?? 0);
            const cost = r.t === 0 ? u.cost : r.tierCost;
            const costB = r.t === 0 ? u.cost : b.tierCost;
            return (
              <tr key={r.t}>
                <td className="es-name">{r.t === 0 ? 'Deploy' : `T${r.t} · ${u.upgrades[r.t - 1].name}`}</td>
                <td className="num"><Cmp v={cost} base={costB} digits={0} /></td>
                <td className="num"><Cmp v={r.harvest} base={b.harvest} digits={0} /></td>
                <td className="num"><Cmp v={r.perWave} base={b.perWave} digits={0} /></td>
                <td className="num"><Cmp v={r.invested} base={b.invested} digits={0} /></td>
                <td className="num"><Cmp v={r.invested / r.perWave} base={b.invested / b.perWave} digits={2} /></td>
                <td className="num"><Cmp v={dW} base={dWB} digits={0} /></td>
                <td className="num">{dW > 0 ? <Cmp v={cost / dW} base={costB / dWB} digits={2} /> : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BardTable({ u, purchased }: { u: UnitDef; purchased: string[] }) {
  const build = (p: string[]) => {
    let invested = u.cost;
    return Array.from({ length: maxUpgradeTier(u) + 1 }, (_, t) => {
      const tierCost = t === 0 ? 0 : masteryUpgradeCost(u, t, p);
      invested += tierCost;
      const b = masteryBard(u, t, p)!;
      const uptime = Math.min(1, b.duration / b.every);
      // Average extra ally attack speed: allies buffed × bonus × time covered.
      const value = b.targets * (b.attackSpeedMult - 1) * uptime;
      return { t, tierCost, invested, b, uptime, value, range: masteryStats(u, t, p).range };
    });
  };
  const rows = build(purchased);
  const base = build([]);
  return (
    <div className="es-scroll">
      <table className="es-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th className="num">Cost</th>
            <th className="num">Tempo</th>
            <th className="num">Allies</th>
            <th className="num">Duration</th>
            <th className="num">Every</th>
            <th className="num">Uptime</th>
            <th className="num">Range</th>
            <th className="num" title="allies × bonus × uptime — average extra attack speed handed out, in 'whole champions' worth">Buff value</th>
            <th className="num">Gold / value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const b = base[i];
            return (
              <tr key={r.t}>
                <td className="es-name">{r.t === 0 ? 'Deploy' : `T${r.t} · ${u.upgrades[r.t - 1].name}`}</td>
                <td className="num"><Cmp v={r.t === 0 ? u.cost : r.tierCost} base={r.t === 0 ? u.cost : b.tierCost} digits={0} /></td>
                <td className="num"><Cmp v={(r.b.attackSpeedMult - 1) * 100} base={(b.b.attackSpeedMult - 1) * 100} digits={0} suffix="%" /></td>
                <td className="num"><Cmp v={r.b.targets} base={b.b.targets} digits={0} /></td>
                <td className="num"><Cmp v={r.b.duration} base={b.b.duration} suffix="s" /></td>
                <td className="num"><Cmp v={r.b.every} base={b.b.every} suffix="s" /></td>
                <td className="num"><Cmp v={r.uptime * 100} base={b.uptime * 100} digits={0} suffix="%" /></td>
                <td className="num"><Cmp v={r.range} base={b.range} digits={0} /></td>
                <td className="num"><Cmp v={r.value} base={b.value} digits={2} /></td>
                <td className="num"><Cmp v={r.invested / r.value} base={b.invested / b.value} digits={0} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Derived numbers for one ability at the tier it unlocks, with the chosen mastery. */
function abilityFacts(u: UnitDef, a: AbilityDef, tier: number, purchased: string[]): [string, ReactNode][] {
  const s = masteryStats(u, tier, purchased);
  const base = masteryStats(u, tier, []);
  const cc = critChanceFor(u, purchased);
  const cm = critMultiplierFor(u, purchased);
  const crit = 1 + cc * (cm - 1);
  const out: [string, ReactNode][] = [
    ['Cooldown', `${a.cooldown}s`],
    ['Mana', a.manaCost ? `${a.manaCost} / ${u.maxMana ?? '—'} (${u.maxMana ? Math.floor(u.maxMana / a.manaCost) : 0} from a full pool)` : 'free'],
  ];
  if (a.damageMult) {
    const hit = s.damage * a.damageMult;
    out.push(['Damage mult', `${a.damageMult}× champion damage`]);
    out.push(['Hit (per foe)', <Cmp v={hit} base={base.damage * a.damageMult} />]);
    out.push(['Avg hit w/ crit', fmt(hit * crit)]);
    if (a.tickInterval && a.duration) {
      const ticks = Math.floor(a.duration / a.tickInterval + 1e-9);
      out.push(['Ticks', `${ticks} (every ${a.tickInterval}s over ${a.duration}s)`]);
      out.push(['Total per foe', <Cmp v={hit * ticks} base={base.damage * a.damageMult * ticks} />]);
      out.push(['Channel DPS per foe', fmt(hit / a.tickInterval)]);
      out.push(['Avg DPS over cooldown', fmt((hit * ticks * crit) / a.cooldown)]);
    } else {
      out.push(['Avg DPS over cooldown (per foe)', fmt((hit * crit) / a.cooldown)]);
    }
  }
  if (a.speedMult && a.duration) {
    const burst = masteryBurst(u, purchased);
    const dps = s.damage * s.attackSpeed * burst * crit;
    out.push(['Speed buff', `×${a.speedMult} for ${a.duration}s`]);
    out.push(['DPS while active', `${fmt(dps * a.speedMult)} (from ${fmt(dps)})`]);
    out.push(['Extra damage per cast', fmt(dps * (a.speedMult - 1) * a.duration)]);
    out.push(['Avg DPS gain over cooldown', fmt((dps * (a.speedMult - 1) * a.duration) / a.cooldown)]);
  }
  if (a.reachMult) out.push(['Reach', `${a.reachMult}× range = ${fmt(s.range * a.reachMult, 0)}px`]);
  if (a.charges) {
    out.push(['Empowered shots', `next ${a.charges} attacks pierce to ${fmt(s.range, 0)}px`]);
    out.push(['Hit (per foe pierced)', <Cmp v={s.damage} base={base.damage} />]);
  }
  if (a.aoeWidth) out.push(['Width', `${a.aoeWidth * 2}px corridor`]);
  if (a.knockback) out.push(['Knockback', `${a.knockback}px (bosses half)`]);
  return out;
}

function Abilities({ u, purchased }: { u: UnitDef; purchased: string[] }) {
  const list = u.upgrades.map((up, i) => ({ a: up.ability, tier: i + 1 })).filter((x): x is { a: AbilityDef; tier: number } => !!x.a);
  if (list.length === 0) return null;
  return (
    <section className="es-section">
      <h2>Abilities</h2>
      <div className="cd-cards">
        {list.map(({ a, tier }) => (
          <div key={a.id} className="cd-card">
            <div className="cd-ability-head">
              {a.image ? <img src={a.image} alt="" width={48} height={48} /> : <span className="cd-emoji">{a.icon}</span>}
              <div>
                <div className="es-name">{a.name}</div>
                <div className="es-id">unlocks at T{tier} · {a.id}</div>
              </div>
            </div>
            <p className="es-mech">{a.description}</p>
            <dl className="cd-facts">
              {abilityFacts(u, a, tier, purchased).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Every set effect field of a mastery node, as short labels. */
function nodeEffects(n: MasteryUpgradeDef): string[] {
  const e: string[] = [];
  const mult = (label: string, m?: number) => m && e.push(`${label} ${m >= 1 ? '+' : ''}${+((m - 1) * 100).toFixed(1)}%`);
  mult('Damage', n.damageMult);
  mult('Attack speed', n.attackSpeedMult);
  mult('Range', n.rangeMult);
  mult('Gold', n.generateMult);
  mult('Hero EXP', n.heroExpMult);
  if (n.critChanceBonus) e.push(`Crit +${pct(n.critChanceBonus)}`);
  if (n.critMultiplier) e.push(`Crit dmg ${n.critMultiplier}×`);
  if (n.startingGoldBonus) e.push(`+${n.startingGoldBonus} starting gold`);
  if (n.adjacentDamageMult) e.push(`+${pct(n.adjacentDamageMult)} dmg per adjacent ally`);
  if (n.rangeAuraMult) e.push(`Range aura ×${n.rangeAuraMult}`);
  if (n.upgradeDiscount) e.push(`T${n.upgradeDiscount.tier} −${n.upgradeDiscount.amount}g`);
  if (n.knockback) e.push(`Knockback ${n.knockback}px`);
  if (n.throwEvery) e.push(`Every ${ordinal(n.throwEvery)}: ×${n.throwRangeMult ?? 1} reach`);
  if (n.preloadShots) e.push(`Preload ${n.preloadShots}`);
  if (n.bounceDamageMult) e.push(`Bounces ${pct(n.bounceDamageMult)}`);
  if (n.finalBounceDamageMult) e.push(`Final leap ${pct(n.finalBounceDamageMult)}`);
  if (n.bardSpeedBonus) e.push(`Tempo +${pct(n.bardSpeedBonus)}`);
  if (n.bardDurationBonus) e.push(`Tune +${n.bardDurationBonus}s`);
  if (n.crossSlashEvery) e.push(`Every ${ordinal(n.crossSlashEvery)}: ${n.crossSlashMult ?? 1}× X cut`);
  if (n.weaponForm) e.push(`Weapon: ${n.weaponForm}`);
  if (n.unlocksArmor) e.push('Unlocks armor');
  return e;
}

/** Engine-only mastery effects (board-position auras etc.) the tables can't fold in. */
function dynamicNotes(u: UnitDef, purchased: string[]): string[] {
  const out: string[] = [];
  const adj = masteryAdjacentDamageMult(u.id, purchased);
  if (adj) out.push(`+${pct(adj)} damage per adjacent ${u.name} (up to 8) — not in the tables.`);
  const aura = masteryRangeAura(u.id, purchased);
  if (aura > 1) out.push(`Gives ranged allies in range ×${aura} range.`);
  const kb = masteryKnockback(u.id, purchased);
  if (kb) out.push(`Each hit knocks foes back ${kb}px.`);
  const pre = masteryPreload(u.id, purchased);
  if (pre) out.push(`Preloads up to ${pre} spare shots while idle.`);
  const th = masteryThrow(u.id, purchased);
  if (th) out.push(`Every ${ordinal(th.every)} attack is a throw with ×${th.rangeMult} reach.`);
  return out;
}

/** Whether the weapon-form node is pinned by which page we're on (dual blades vs Claymore). */
function forcedState(u: UnitDef, n: MasteryUpgradeDef): boolean | undefined {
  if (!n.weaponForm) return undefined;
  return u.visual.shape === `player-${n.weaponForm}`;
}

function MasteryPicker({
  u,
  selected,
  setSelected,
}: {
  u: UnitDef;
  selected: string[];
  setSelected: (s: string[]) => void;
}) {
  const tree = masteryTree(u.id);
  if (tree.length === 0) return <p className="es-faint">No skill tree.</p>;
  const toggle = (n: MasteryUpgradeDef) => {
    if (forcedState(u, n) !== undefined) return;
    if (selected.includes(n.id)) {
      setSelected(selected.filter((id) => id !== n.id));
    } else {
      // Exclusive groups behave like radios: only one member is ever active.
      const rivals = tree.filter((m) => n.exclusiveGroup && m.exclusiveGroup === n.exclusiveGroup).map((m) => m.id);
      setSelected([...selected.filter((id) => !rivals.includes(id)), n.id]);
    }
  };
  const exp = tree.filter((n) => selected.includes(n.id)).reduce((s, n) => s + n.cost, 0);
  return (
    <>
      <div className="cd-picker-bar">
        <button onClick={() => setSelected(defaultSelection(u, false))}>None</button>
        <button onClick={() => setSelected(defaultSelection(u, true))}>All</button>
        <span className="es-faint">{exp} / {tree.reduce((s, n) => s + n.cost, 0)} EXP selected</span>
      </div>
      <ul className="cd-nodes">
        {tree.map((n) => {
          const forced = forcedState(u, n);
          const blocked = forced === undefined && tree.some(
            (m) => m.id !== n.id && m.exclusiveGroup && m.exclusiveGroup === n.exclusiveGroup && forcedState(u, m) === true,
          );
          const locked = forced !== undefined || blocked;
          return (
            // The whole card toggles the node; the checkbox is just its indicator.
            <li
              key={n.id}
              className={`${selected.includes(n.id) ? 'on' : ''}${locked ? ' locked' : ''}`}
              role="checkbox"
              aria-checked={selected.includes(n.id)}
              aria-disabled={locked}
              tabIndex={locked ? -1 : 0}
              onClick={() => !locked && toggle(n)}
              onKeyDown={(e) => {
                if (!locked && (e.key === ' ' || e.key === 'Enter')) {
                  e.preventDefault();
                  toggle(n);
                }
              }}
            >
              <div className="cd-node-head">
                <input type="checkbox" checked={selected.includes(n.id)} disabled={locked} readOnly tabIndex={-1} aria-hidden />
                <span className={`es-name${n.major ? ' cd-major' : ''}`}>{n.name}</span>
                <span className="es-faint"> · {n.cost} EXP{n.requires ? ` · after ${masteryTree(u.id).find((m) => m.id === n.requires)?.name ?? n.requires}` : ''}{n.exclusiveGroup ? ` · pick one (${n.exclusiveGroup})` : ''}</span>
              </div>
              <div className="es-mech">{n.description}</div>
              <div className="cd-tags">{nodeEffects(n).map((t) => <span key={t}>{t}</span>)}</div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** All nodes (first of each exclusive group, honouring the page's weapon form), or none. */
function defaultSelection(u: UnitDef, all: boolean): string[] {
  const tree = masteryTree(u.id);
  const forcedOn = tree.filter((n) => forcedState(u, n) === true);
  if (!all) return forcedOn.map((n) => n.id);
  const groups = new Set(forcedOn.map((n) => n.exclusiveGroup).filter(Boolean));
  const out = forcedOn.map((n) => n.id);
  for (const n of tree) {
    if (forcedState(u, n) !== undefined || out.includes(n.id)) continue;
    if (n.exclusiveGroup) {
      if (groups.has(n.exclusiveGroup)) continue;
      groups.add(n.exclusiveGroup);
    }
    out.push(n.id);
  }
  return out;
}

export function ChampionStatDetail({ unit: u }: { unit: UnitDef }) {
  const [selected, setSelected] = useState(() => defaultSelection(u, true));
  // Keep tree order so helpers that take "first wins" stay deterministic.
  const purchased = useMemo(() => masteryTree(u.id).map((n) => n.id).filter((id) => selected.includes(id)), [u, selected]);
  const combat = !u.generator && !u.bard;
  const max = maxUpgradeTier(u);
  const notes = dynamicNotes(u, purchased);
  const cross = u.visual.shape === 'player-blade' ? masteryCrossSlash(u.id, purchased) : undefined;
  const fractions = bounceFractions(u, max, purchased);

  const summary: [string, ReactNode][] = [
    ['Rarity', <span style={{ color: RARITIES[u.rarity].color }}>{RARITIES[u.rarity].name}</span>],
    ['Cost · Limit', `${u.cost > 0 ? `${u.cost}g` : 'Free'} · ${u.deployLimit} per stage`],
    ['Type', [u.attackType && attackTypeLabel(u.attackType), u.damageType && damageTypeLabel(u.damageType)].filter(Boolean).join(' · ') || '—'],
    ['Default targeting', combat ? u.targeting : '—'],
  ];
  if (combat) {
    const aoeMax = effectiveAoe(u, max);
    summary.push(['Attack shape', aoeMax !== u.aoe ? `${aoeLabel(u.aoe)} → ${aoeLabel(aoeMax)}` : aoeLabel(u.aoe)]);
    if (masteryBurst(u, purchased) > 1) summary.push(['Volley', `${masteryBurst(u, purchased)} shots per attack`]);
    if (aoeMax === 'cone') summary.push(['Cone', `${coneAngleDeg(u)}°`]);
    if (u.aoe === 'line' && u.aoeWidth) summary.push(['Line width', `${u.aoeWidth * 2}px`]);
    if (u.aoe === 'circle') {
      summary.push(['Blast radius', `${masteryBurstRadius(u, purchased)}px${masteryGreaterOrb(u.id, purchased) ? ' · Greater Orb' : ''}`]);
    }
    if (fractions.length) summary.push(['Bounces (max tier)', fractions.map(pct).join(' → ')]);
    summary.push(['Crit', <Cmp v={critChanceFor(u, purchased) * 100} base={critChanceFor(u, []) * 100} suffix="%" />]);
    summary.push(['Crit damage', <Cmp v={critMultiplierFor(u, purchased)} base={critMultiplierFor(u, [])} digits={2} suffix="×" />]);
    if (cross) summary.push(['Cross Slash', `every ${ordinal(cross.every)} attack, ${cross.damageMult}×`]);
    if (u.special?.slow) summary.push(['Slow', `${pct(u.special.slow)} for ${u.special.slowDuration ?? 0}s`]);
  }
  if (u.maxMana) summary.push(['Mana', `${u.maxMana}${u.manaRegen ? ` (+${u.manaRegen}/s)` : ''} · refilled by kills`]);

  return (
    <div className="es-page">
      <header className="es-header">
        <h1>{u.name}</h1>
        <a href="#champions">← All champions</a>
      </header>

      <div className="cd-top">
        <div className="cd-portrait">
          <UnitSprite unit={u} size={140} />
        </div>
        <div>
          <p className="es-mech cd-desc">{u.description}</p>
          <dl className="cd-facts cd-summary">
            {summary.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <section className="es-section">
        <h2>Skill tree</h2>
        <MasteryPicker u={u} selected={selected} setSelected={setSelected} />
      </section>

      <div className="cd-main">
        <section className="es-section">
          <h2>
            In-stage tiers <span className="es-count">· selected mastery, no-mastery value underneath</span>
          </h2>
          {u.generator ? (
            <GeneratorTable u={u} purchased={purchased} />
          ) : u.bard ? (
            <BardTable u={u} purchased={purchased} />
          ) : (
            <CombatTable u={u} purchased={purchased} />
          )}
          <p className="es-faint">
            {combat &&
              'Raw DPS = damage × atk/s × volley. DPS (crit) adds average crit and Cross Slash, on one target — line, cone and blast shapes multiply it per foe struck. '}
            {isHero(u)
              ? 'Heroes deploy free and level up from EXP pooled in-stage, so costs are EXP thresholds. EXP / DPS = EXP pooled so far per point of DPS; EXP / Δ DPS = that level’s EXP per DPS it adds. Lower is better.'
              : 'Invested = deploy cost + upgrades so far. Gold / DPS = invested gold per point of DPS; Gold / Δ DPS = that upgrade’s price per DPS it adds. Lower is better.'}
          </p>
          {notes.length > 0 && (
            <ul className="cd-notes">
              {notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
        </section>
        <Abilities u={u} purchased={purchased} />
      </div>
    </div>
  );
}

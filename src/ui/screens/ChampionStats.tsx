import { useMemo, useState } from 'react';
import {
  ALL_UNITS,
  aoeLabel,
  attackTypeLabel,
  damageTypeLabel,
  effectiveAbility,
  effectiveAoe,
  effectiveBard,
  effectiveGenerate,
  effectiveStats,
  formatAttackSpeed,
  maxUpgradeTier,
  unitDps,
  type UnitDef,
} from '../../domain/units';
import { ALL_RARITIES, RARITIES, type Rarity } from '../../domain/rarity';
import { BASE_CRIT_CHANCE, CRIT_MULTIPLIER } from '../../domain/combat';
import { PLAYER_CHAMPION_IDS, buildPlayerChampionDef } from '../../domain/playerChampion';
import { defaultPlayerSprite } from '../../domain/playerSprite';
import { UnitSprite } from '../components/UnitSprite';

/**
 * Developer-only champion stat sheet: every champion's raw catalog numbers and
 * its in-stage upgrade tiers. Deliberately excludes mastery and armor — these
 * are the base defs. Not reachable from the game UI — open it with
 * `npm run champions`, the `#champions` URL hash, or `championStats()` in the
 * browser console (see `main.tsx`).
 */

/**
 * The hero champions, built from a default portrait with no armor applied, plus
 * the alternate weapon forms from their mastery nodes (the Blade's Claymore, the
 * Bow's Longbow).
 */
const HERO_LABELS: Record<string, string> = {
  'player-blade': 'Blade Adventurer',
  'player-bow': 'Bow Adventurer',
  'player-magic': 'Magic Adventurer',
};
const HEROES: UnitDef[] = Object.values(PLAYER_CHAMPION_IDS)
  .map((id) => buildPlayerChampionDef(id, HERO_LABELS[id] ?? id, defaultPlayerSprite()))
  .concat(buildPlayerChampionDef('player-blade', 'Blade Adventurer (Claymore)', defaultPlayerSprite(), 'claymore'))
  .concat(buildPlayerChampionDef('player-bow', 'Bow Adventurer (Longbow)', defaultPlayerSprite(), 'longbow'))
  .filter((u): u is UnitDef => u !== null);

const CHAMPIONS: UnitDef[] = [...ALL_UNITS, ...HEROES];

/** Shapes of the alternate weapon forms, which share their champion's id. */
const FORM_SHAPES = new Set(['player-claymore', 'player-longbow']);

/** URL key for a champion's detail page — the id, or the shape for a weapon form (shares its id). */
export const championKey = (u: UnitDef) => (FORM_SHAPES.has(u.visual.shape) ? u.visual.shape : u.id);
export const findChampion = (key: string) => CHAMPIONS.find((u) => championKey(u) === key);

type SortKey = 'name' | 'cost' | 'deployLimit' | 'damage' | 'attackSpeed' | 'range' | 'dps' | 'maxDps' | 'upgradeCost';

const upgradeCost = (u: UnitDef) => u.upgrades.reduce((sum, up) => sum + up.cost, 0);
const maxStats = (u: UnitDef) => effectiveStats(u, maxUpgradeTier(u));
const isCombat = (u: UnitDef) => !u.generator && !u.bard;
const dpsText = (n: number) => (Number.isInteger(n) ? n : n.toFixed(1));

function sortValue(u: UnitDef, key: SortKey): number | string {
  switch (key) {
    case 'name':
      return u.name;
    case 'dps':
      return isCombat(u) ? unitDps(u) : -1;
    case 'maxDps': {
      const m = maxStats(u);
      return isCombat(u) ? m.damage * m.attackSpeed : -1;
    }
    case 'upgradeCost':
      return upgradeCost(u);
    default:
      return u[key];
  }
}

/** Attack-shape notes: volley size, bounces, cone angle, burst radius, line width. */
function shapeText(u: UnitDef): string {
  const tier = maxUpgradeTier(u);
  const base = aoeLabel(u.aoe);
  const max = effectiveAoe(u, tier);
  const parts = [max !== u.aoe ? `${base} → ${aoeLabel(max)}` : base];
  if (u.burst && u.burst > 1) parts.push(`×${u.burst} volley`);
  if (u.bounces) parts.push(`${u.bounces} bounce${u.bounces > 1 ? 's' : ''}`);
  if (u.aoe === 'line' && u.aoeWidth) parts.push(`${u.aoeWidth}px wide`);
  if (u.aoe === 'circle' && u.burstRadius) parts.push(`${u.burstRadius}px radius`);
  return parts.join(' · ');
}

/** Support/economy/ability summary at max in-stage tier. */
function specialText(u: UnitDef): string {
  const tier = maxUpgradeTier(u);
  const out: string[] = [];
  if (u.generator) {
    out.push(`Gold: ${u.generator.amount} ×${u.generator.timesPerWave}/wave (max tier ${effectiveGenerate(u, tier)})`);
  }
  const bard = effectiveBard(u, tier);
  if (bard) {
    out.push(
      `Song: +${Math.round((bard.attackSpeedMult - 1) * 100)}% attack speed to ${bard.targets} allies for ${bard.duration}s, every ${bard.every}s (max tier)`,
    );
  }
  if (u.special?.slow) out.push(`Slow ${Math.round(u.special.slow * 100)}% for ${u.special.slowDuration ?? 0}s`);
  const ability = effectiveAbility(u, tier);
  if (ability) {
    out.push(`${ability.name}: ${ability.manaCost ?? 0} mana, ${ability.cooldown}s cooldown`);
  }
  return out.join(' · ');
}

function ChampionTable({ rows }: { rows: UnitDef[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, sort]);

  const th = (key: SortKey, label: string) => (
    <th
      className={`num sortable${sort?.key === key ? ' sorted' : ''}`}
      onClick={() => setSort((s) => (s?.key === key ? (s.dir === -1 ? null : { key, dir: -1 }) : { key, dir: key === 'name' ? 1 : -1 }))}
    >
      {label}
      {sort?.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <section className="es-section">
      <div className="es-scroll">
        <table className="es-table">
          <thead>
            <tr>
              <th />
              {th('name', 'Name')}
              <th>Rarity</th>
              {th('cost', 'Cost')}
              {th('deployLimit', 'Limit')}
              {th('damage', 'Dmg')}
              {th('attackSpeed', 'Atk/s')}
              {th('range', 'Range')}
              {th('dps', 'DPS')}
              <th>Type</th>
              <th>Shape</th>
              <th>Target</th>
              <th className="num">Mana</th>
              {th('upgradeCost', 'Upg. gold')}
              {th('maxDps', 'Max tier')}
              <th>Special</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((u) => {
              const m = maxStats(u);
              const combat = isCombat(u);
              return (
                <tr
                  key={`${u.id}|${u.visual.shape}`}
                  className="es-link"
                  onClick={() => { location.hash = `champions/${championKey(u)}`; }}
                >
                  <td className="es-sprite">
                    <UnitSprite unit={u} size={40} animate={false} />
                  </td>
                  <td>
                    <div className="es-name">{u.name}</div>
                    <div className="es-id">{u.id}</div>
                  </td>
                  <td style={{ color: RARITIES[u.rarity].color }}>{RARITIES[u.rarity].name}</td>
                  <td className="num">{u.cost}</td>
                  <td className="num">{u.deployLimit}</td>
                  <td className="num">{combat ? u.damage : '—'}</td>
                  <td className="num">{combat ? formatAttackSpeed(u.attackSpeed) : '—'}</td>
                  <td className="num">{u.range}</td>
                  <td className="num">{combat ? dpsText(unitDps(u)) : '—'}</td>
                  <td>
                    {[u.attackType && attackTypeLabel(u.attackType), u.damageType && damageTypeLabel(u.damageType)]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                  <td className="es-mech">{combat ? shapeText(u) : '—'}</td>
                  <td>{combat ? u.targeting : '—'}</td>
                  <td className="num">{u.maxMana ?? '—'}</td>
                  <td className="num">
                    {upgradeCost(u)}
                    <div className="es-id">{u.upgrades.length} tiers</div>
                  </td>
                  <td className="num">
                    {combat ? (
                      <>
                        {dpsText(m.damage * m.attackSpeed)} DPS
                        <div className="es-id">
                          {m.damage} · {formatAttackSpeed(m.attackSpeed)}/s · {m.range}
                        </div>
                      </>
                    ) : (
                      <span className="es-faint">{m.range} range</span>
                    )}
                  </td>
                  <td className="es-mech">{specialText(u)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type Tab = Rarity | 'all';

export function ChampionStats() {
  const [tab, setTab] = useState<Tab>('all');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All' },
    ...ALL_RARITIES.filter((r) => CHAMPIONS.some((u) => u.rarity === r.id)).map((r) => ({ id: r.id as Tab, label: r.name })),
  ];
  const shown = tab === 'all' ? CHAMPIONS : CHAMPIONS.filter((u) => u.rarity === tab);
  return (
    <div className="es-page">
      <header className="es-header">
        <h1>Champion Stats</h1>
        <a href="#" onClick={() => { location.hash = ''; }}>← Back to game</a>
      </header>
      <nav className="es-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <ChampionTable key={tab} rows={shown} />
      <p className="es-faint">
        Base catalog values — no mastery or armor. Every champion crits {Math.round(BASE_CRIT_CHANCE * 100)}% of the time for ×{CRIT_MULTIPLIER}. Max tier = all in-stage gold upgrades bought. Click a champion for its full breakdown.
      </p>
    </div>
  );
}

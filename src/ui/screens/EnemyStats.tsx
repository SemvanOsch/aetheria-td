import { useMemo, useState } from 'react';
import { BOSS_ENEMIES, REGULAR_ENEMIES, type EnemyDef } from '../../domain/enemies';
import { LEVELS, SECTIONS, getLevel, type SectionId } from '../../domain/levels';
import { EnemySprite } from '../components/EnemySprite';

/**
 * Developer-only enemy stat sheet: every enemy in the catalog with its raw
 * numbers, read straight from `domain/enemies.ts`. Not reachable from the game
 * UI — open it with `npm run enemies`, the `#enemies` URL hash, or
 * `enemyStats()` in the browser console (see `main.tsx`).
 */

type SortKey = 'name' | 'health' | 'speed' | 'reward' | 'mana' | 'damageToBase' | 'radius' | 'spawned';

interface Row {
  def: EnemyDef;
  /** Stage ids this enemy spawns in (bosses included via their waves). */
  stages: number[];
  /** Total spawns across every stage, lane and wave. */
  spawned: number;
}

function buildRows(defs: EnemyDef[]): Row[] {
  return defs.map((def) => {
    const stages: number[] = [];
    let spawned = 0;
    for (const level of LEVELS) {
      let here = 0;
      for (const lane of level.lanes)
        for (const wave of lane.waves)
          for (const g of wave.groups) if (g.enemyId === def.id) here += g.count;
      if (here > 0) stages.push(level.id);
      spawned += here;
    }
    return { def, stages, spawned };
  });
}

/** Catalog id prefixes for regular enemies that don't spawn in any stage yet. */
const PREFIX_SECTION: Record<string, SectionId> = { cas: 'castle', cap: 'capital', for: 'forest', inn: 'inn' };

/** Chapter an enemy belongs to: its boss stage, else the first stage it spawns in, else its id prefix. */
function sectionOf(r: Row): SectionId | undefined {
  const bossLevel = r.def.boss ? getLevel(Number(r.def.id.replace('boss', ''))) : undefined;
  if (bossLevel) return bossLevel.section;
  if (r.stages.length) return getLevel(r.stages[0])?.section;
  return PREFIX_SECTION[r.def.id.split('_')[0]];
}

const pct =(v?: number) => (v ? `${Math.round(v * 100)}%` : '—');

function sortValue(r: Row, key: SortKey): number | string {
  if (key === 'name') return r.def.name;
  if (key === 'spawned') return r.spawned;
  if (key === 'mana') return r.def.mana ?? 0;
  return r.def[key];
}

function EnemyTable({ title, rows }: { title: string; rows: Row[] }) {
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
      <h2>
        {title} <span className="es-count">{rows.length}</span>
      </h2>
      <div className="es-scroll">
        <table className="es-table">
          <thead>
            <tr>
              <th />
              {th('name', 'Name')}
              {th('health', 'HP')}
              {th('speed', 'Speed')}
              {th('reward', 'Gold')}
              {th('mana', 'Mana')}
              {th('damageToBase', 'Base dmg')}
              {th('radius', 'Radius')}
              <th className="num">Phys res</th>
              <th className="num">Magic res</th>
              <th className="num">Dodge</th>
              <th>Aura</th>
              <th>Stages</th>
              {th('spawned', 'Spawns')}
              <th>Mechanic</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ def, stages, spawned }) => (
              <tr key={def.id}>
                <td className="es-sprite">
                  <EnemySprite enemy={def} size={40} animate={false} />
                </td>
                <td>
                  <div className="es-name">{def.name}</div>
                  <div className="es-id">{def.id}</div>
                </td>
                <td className="num">{def.health}</td>
                <td className="num">{def.speed}</td>
                <td className="num">{def.reward}</td>
                <td className="num">{def.mana ?? '—'}</td>
                <td className="num">{def.damageToBase}</td>
                <td className="num">{def.radius}</td>
                <td className="num">{pct(def.physicalResist)}</td>
                <td className="num">{pct(def.magicResist)}</td>
                <td className="num">{pct(def.dodgeChance)}</td>
                <td>{def.damageAura ? `−${pct(def.damageAura.reduction)} · ${def.damageAura.radius}px` : '—'}</td>
                <td>{stages.length ? stages.join(', ') : <span className="es-faint">unused</span>}</td>
                <td className="num">{spawned || '—'}</td>
                <td className="es-mech">{def.mechanic ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type Tab = SectionId | 'all';

export function EnemyStats() {
  const regular = useMemo(() => buildRows(REGULAR_ENEMIES), []);
  const bosses = useMemo(() => buildRows(BOSS_ENEMIES), []);
  const [tab, setTab] = useState<Tab>('castle');
  const inTab = (rows: Row[]) => (tab === 'all' ? rows : rows.filter((r) => sectionOf(r) === tab));
  const tabs: { id: Tab; label: string }[] = [
    ...SECTIONS.map((s) => ({ id: s.id as Tab, label: s.name.replace(/^The /, '') })),
    { id: 'all', label: 'All' },
  ];
  const shownRegular = inTab(regular);
  const shownBosses = inTab(bosses);
  return (
    <div className="es-page">
      <header className="es-header">
        <h1>Enemy Stats</h1>
        <a href="#" onClick={() => { location.hash = ''; }}>← Back to game</a>
      </header>
      <nav className="es-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {shownRegular.length > 0 && <EnemyTable key={`r-${tab}`} title="Enemies" rows={shownRegular} />}
      {shownBosses.length > 0 && <EnemyTable key={`b-${tab}`} title="Bosses" rows={shownBosses} />}
      {shownRegular.length + shownBosses.length === 0 && <p className="es-faint">No enemies in this chapter yet.</p>}
    </div>
  );
}

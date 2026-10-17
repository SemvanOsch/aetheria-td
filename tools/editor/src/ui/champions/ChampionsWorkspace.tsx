/** Champions: the catalog champions, their kit and in-stage upgrades; heroes for reference. */

import { useMemo, useState } from 'react';
import {
  attackShapeLabel,
  effectiveAoe,
  effectiveBard,
  effectiveBounces,
  effectiveGenerate,
  formatAttackSpeed,
  upgradePaths,
  type AoeType,
  type UnitDef,
} from '@game/domain/units';
import { activeMasteryUpgrades, masteryBurst, masteryHarvest, masteryStats, masteryUpgradeCost } from '@game/domain/mastery';
import { critChanceFor, critMultiplierFor } from '@game/domain/combat';
import { RARITIES } from '@game/domain/rarity';
import { hasSprite } from '@game/engine/sprites';
import { useEditor, editor } from '../../store/projectStore';
import { edit, renameUnit, setOpt } from '../../store/edits';
import {
  AOE_CHOICES,
  BARD_FIELDS,
  CHAMPION_SHAPES,
  GENERATOR_FIELDS,
  RARITY_CHOICES,
  SHATTER_FIELDS,
  SLOW_FIELDS,
  TARGETING_CHOICES,
  UNIT_COMBAT_FIELDS,
  UNIT_COST_FIELDS,
  UNIT_SHAPE_FIELDS,
  shapeInfo,
} from '../../model/catalog';
import { heroChampions, type HeroInfo } from '../../model/shipped';
import { installProject } from '../../content/runtime';
import { clone, fmt, moveItem, plural, uniqueId } from '../../model/util';
import { unitKey } from '../../model/entities';
import { countIssues, issuesAt, validateProject } from '../../validation/validate';
import type { ContentProject } from '../../model/types';
import { Button, ColorInput, EmptyState, Field, InlineIssues, IssueScopeProvider, NumField, Section, Segmented, Select, Stat, TextArea, TextInput, Toggle } from '../kit';
import { useConfirm } from '../kitHooks';
import { Chip, ListPane, type ListRow } from '../ListPane';
import { UnitPreview } from '../SpritePreview';
import { UpgradeEditor } from './UpgradeEditor';
import { useNav } from '../nav';

type Role = 'all' | 'combat' | 'generator' | 'bard';
type Sort = 'catalog' | 'name' | 'cost' | 'dps' | 'range';
const roleOf = (u: UnitDef): Exclude<Role, 'all'> => (u.generator ? 'generator' : u.bard ? 'bard' : 'combat');
const HERO_PREFIX = 'hero:';

export function ChampionsWorkspace() {
  const { working } = useEditor();
  const { nav, go } = useNav();
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<string>('all');
  const [role, setRole] = useState<Role>('all');
  const [sort, setSort] = useState<Sort>('catalog');
  const issues = validateProject(working);
  const heroes = heroChampions();

  const rows = useMemo<ListRow[]>(() => {
    const q = query.trim().toLowerCase();
    let list = working.units.filter(
      (u) => (rarity === 'all' || u.rarity === rarity) && (role === 'all' || roleOf(u) === role) && (!q || u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q)),
    );
    if (sort !== 'catalog') {
      list = [...list].sort((a, b) =>
        sort === 'name' ? a.name.localeCompare(b.name) : sort === 'cost' ? a.cost - b.cost : sort === 'range' ? b.range - a.range : b.damage * b.attackSpeed - a.damage * a.attackSpeed,
      );
    }
    const out: ListRow[] = list.map((u) => {
      const c = countIssues(issuesAt(issues, unitKey(u.id)));
      return {
        key: u.id,
        title: u.name || u.id,
        subtitle: `${RARITIES[u.rarity]?.name ?? u.rarity} · ${roleOf(u) === 'combat' ? `${fmt(u.damage * u.attackSpeed, 1)} DPS` : roleOf(u)} · ${u.cost}g`,
        lead: <span className="ed-icon-chip" style={{ background: u.visual.color }}>{u.visual.icon}</span>,
        errors: c.error,
        warnings: c.warning,
        group: 'Catalog champions',
      };
    });
    if (rarity === 'all' || rarity === 'hero') {
      for (const h of heroes.filter((h) => !h.form && (!q || h.id.includes(q) || h.def.name.toLowerCase().includes(q)))) {
        out.push({ key: HERO_PREFIX + h.id, title: h.id, subtitle: 'Hero · built in code', lead: <span className="ed-icon-chip" style={{ background: h.def.visual.color }}>{h.def.visual.icon}</span>, muted: true, tag: 'Read-only', group: 'Hero champions' });
      }
    }
    return out;
  }, [working.units, issues, query, rarity, role, sort, heroes]);

  const unit = working.units.find((u) => u.id === nav.unit) ?? null;
  const heroId = nav.unit?.startsWith(HERO_PREFIX) ? nav.unit.slice(HERO_PREFIX.length) : null;
  const taken = (id: string) => working.units.some((u) => u.id === id) || id.startsWith('player-');

  const create = () => {
    const id = uniqueId('new_champion', taken);
    const u: UnitDef = {
      id, name: 'New Champion', description: 'Describe the champion.', rarity: 'common', damage: 15, attackSpeed: 1, range: 100, targeting: 'first', aoe: 'single',
      attackType: 'ranged', damageType: 'physical', cost: 50, deployLimit: 3,
      upgrades: [{ name: 'Sharper Edge', description: 'Hits harder.', cost: 50, damage: 6 }],
      visual: { color: '#5fd38a', icon: '🗡️', shape: 'archer' },
    };
    edit.project('Create champion', (p) => ({ ...p, units: [...p.units, u] }));
    go({ unit: id });
  };
  const duplicate = () => {
    if (!unit) return;
    const id = uniqueId(`${unit.id}_copy`, taken);
    edit.project(`Duplicate ${unit.name}`, (p) => {
      const i = p.units.findIndex((u) => u.id === unit.id);
      const units = p.units.slice();
      units.splice(i + 1, 0, { ...clone(unit), id, name: `${unit.name} (copy)` });
      return { ...p, units };
    });
    go({ unit: id });
  };
  const move = (dir: -1 | 1) => {
    if (!unit) return;
    edit.project('Reorder champions', (p) => {
      const i = p.units.findIndex((u) => u.id === unit.id);
      return { ...p, units: moveItem(p.units, i, i + dir) };
    });
  };
  const remove = async () => {
    if (!unit) return;
    const tree = working.mastery[unit.id];
    const ok = await confirm({
      title: `Delete ${unit.name}?`,
      body: (
        <>
          <p>
            <strong>{unit.name}</strong> ({unit.id}) is removed{tree ? `, along with its skill tree (${plural(tree.length, 'node')})` : ''}.
          </p>
          <p className="ed-muted">Players who own it keep the id in their save; the game skips ids it can't resolve. You can undo this.</p>
        </>
      ),
      confirmLabel: 'Delete champion',
    });
    if (!ok) return;
    edit.project(`Delete ${unit.name}`, (p) => {
      const mastery = { ...p.mastery };
      delete mastery[unit.id];
      return { ...p, units: p.units.filter((u) => u.id !== unit.id), mastery };
    });
    go({ unit: null });
  };

  return (
    <div className="ed-split">
      <ListPane
        label="Champions"
        rows={rows}
        selected={nav.unit}
        onSelect={(k) => go({ unit: k })}
        query={query}
        onQuery={setQuery}
        filters={
          <>
            <div className="ed-chips" role="group" aria-label="Rarity">
              <Chip on={rarity === 'all'} onClick={() => setRarity('all')}>All</Chip>
              {[...RARITY_CHOICES, 'hero'].map((r) => (
                <Chip key={r} on={rarity === r} onClick={() => setRarity(r)}>{RARITIES[r as keyof typeof RARITIES].name}</Chip>
              ))}
            </div>
            <div className="ed-filter-row">
              <label className="ed-sort">
                Role
                <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="all">Any</option>
                  <option value="combat">Fighter</option>
                  <option value="generator">Gold harvest</option>
                  <option value="bard">Support tune</option>
                </select>
              </label>
              <label className="ed-sort">
                Sort
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="catalog">Catalog order</option>
                  <option value="name">Name</option>
                  <option value="cost">Cost</option>
                  <option value="dps">DPS</option>
                  <option value="range">Range</option>
                </select>
              </label>
            </div>
          </>
        }
        toolbar={
          <>
            <Button icon="plus" tone="primary" size="sm" onClick={create}>New champion</Button>
            <Button icon="copy" size="sm" onClick={duplicate} disabled={!unit} title="Duplicate" />
            <Button icon="up" size="sm" onClick={() => move(-1)} disabled={!unit || sort !== 'catalog'} title="Move up in catalog order" />
            <Button icon="down" size="sm" onClick={() => move(1)} disabled={!unit || sort !== 'catalog'} title="Move down in catalog order" />
          </>
        }
      />
      {unit ? (
        <IssueScopeProvider issues={issuesAt(issues, unitKey(unit.id))}>
          <ChampionDetail key={unit.id} unit={unit} project={working} onDelete={remove} />
        </IssueScopeProvider>
      ) : heroId ? (
        <HeroDetail id={heroId} />
      ) : (
        <div className="ed-detail">
          <EmptyState icon="champions" title="Pick a champion" action={<Button icon="plus" tone="primary" onClick={create}>New champion</Button>}>
            Catalog champions are pure data: stats, attack shape, a special role, and in-stage upgrade tiers. The three hero champions are built in code; edit their skill trees in Mastery.
          </EmptyState>
        </div>
      )}
    </div>
  );
}

function ChampionDetail({ unit, project, onDelete }: { unit: UnitDef; project: ContentProject; onDelete: () => void }) {
  const { go } = useNav();
  const set = (label: string, fn: (d: UnitDef) => void, key?: string) => edit.unit(unit.id, label, fn, key);
  const role = roleOf(unit);
  const shape = shapeInfo(unit.visual.shape);
  const rename = (v: string) => {
    if (!v || v === unit.id) return;
    editor.edit(`Rename ${unit.id} → ${v}`, renameUnit(unit.id, v));
    go({ unit: v });
  };
  const setRole = (r: Exclude<Role, 'all'>) =>
    set('Change role', (d) => {
      if (r !== 'generator') delete d.generator;
      if (r !== 'bard') delete d.bard;
      if (r === 'generator' && !d.generator) d.generator = { amount: 10, timesPerWave: 3 };
      if (r === 'bard' && !d.bard) d.bard = { every: 10, targets: 2, attackSpeedMult: 1.2, duration: 6 };
      if (r !== 'combat') d.attackType = 'support';
    });

  return (
    <div className="ed-detail">
      <header className="ed-detail-head">
        <div className="title">
          <UnitPreview unit={unit} size={72} />
          <div>
            <h1>
              {unit.name || unit.id}
              <span className="ed-tag" style={{ color: RARITIES[unit.rarity]?.color }}>{RARITIES[unit.rarity]?.name ?? unit.rarity}</span>
            </h1>
            <p>
              {unit.id} · {shape?.label ?? unit.visual.shape} · {role === 'combat' ? attackShapeLabel(unit) : role === 'generator' ? 'Gold harvest' : 'Support tune'} · {plural(unit.upgrades.length, 'upgrade tier')}
            </p>
          </div>
        </div>
        <div className="actions">
          <Button icon="mastery" onClick={() => go({ workspace: 'mastery', tree: unit.id, node: null })}>Skill tree{project.mastery[unit.id] ? ` (${project.mastery[unit.id].length})` : ''}</Button>
          <Button icon="trash" tone="danger" onClick={onDelete}>Delete</Button>
        </div>
      </header>
      <div className="ed-detail-body two-col">
        <div className="ed-form">
          <Section title="Identity">
            <div className="ed-grid">
              <Field label="Id" path="id" help="Stable id: saves store owned champions, team slots and mastery under it. Renaming carries its skill tree along.">
                {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={unit.id} onChange={rename} onBlurCommit mono />}
              </Field>
              <Field label="Name" path="name">
                {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={unit.name} onChange={(v) => set('Rename', (x) => (x.name = v), 'name')} />}
              </Field>
              <Field label="Rarity" path="rarity" help="Summon odds come from the rarity (domain/rarity.ts). Hero rarity is reserved for the player's adventurer.">
                {(id, d, inv) => <Select id={id} describedBy={d} invalid={inv} value={unit.rarity} options={RARITY_CHOICES.map((r) => ({ value: r, label: `${RARITIES[r].name}${RARITIES[r].available ? '' : ' (not summonable yet)'}` }))} onChange={(v) => set('Change rarity', (x) => (x.rarity = v))} />}
              </Field>
              <Field label="Description" path="description" wide>
                {(id, d, inv) => <TextArea id={id} describedBy={d} invalid={inv} rows={2} value={unit.description} onChange={(v) => set('Edit description', (x) => (x.description = v), 'desc')} />}
              </Field>
            </div>
          </Section>

          <Section title="Look" help="The shape picks the board sprite and its attack visuals (arrows, bolts, gusts, melee slashes). Only shapes the sprite set can draw are offered.">
            <div className="ed-grid">
              <Field label="Shape" path="visual.shape" hint={shape?.attack}>
                {(id, d, inv) => (
                  <Select id={id} describedBy={d} invalid={inv} value={unit.visual.shape} options={CHAMPION_SHAPES.filter((s) => hasSprite(s.shape)).map((s) => ({ value: s.shape, label: s.label }))} onChange={(v) => set('Change shape', (x) => (x.visual.shape = v))} />
                )}
              </Field>
              <Field label="Colour" path="visual.color">{(id) => <ColorInput id={id} value={unit.visual.color} onChange={(v) => set('Change colour', (x) => (x.visual.color = v), 'color')} />}</Field>
              <Field label="Icon" path="visual.icon" help="An emoji for compact lists and cards without a sprite.">
                {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={unit.visual.icon} maxLength={8} onChange={(v) => set('Change icon', (x) => (x.visual.icon = v), 'icon')} />}
              </Field>
            </div>
          </Section>

          <Section title="Combat">
            <div className="ed-grid">
              {UNIT_COMBAT_FIELDS.map((f) => (
                <NumField key={f.key} spec={f} value={unit[f.key as 'damage']} onChange={(v) => set(`Edit ${f.label.toLowerCase()}`, (x) => ((x[f.key as 'damage'] as number) = v ?? 0), f.key)} />
              ))}
              <Field label="Targeting" path="targeting" help="Default target choice; the player can change it per champion in a stage.">
                {(id, d, inv) => <Select id={id} describedBy={d} invalid={inv} value={unit.targeting} options={TARGETING_CHOICES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} onChange={(v) => set('Change targeting', (x) => (x.targeting = v))} />}
              </Field>
              <Field label="Attack type" path="attackType" help="Descriptive tag shown on cards; reach comes from range.">
                {(id, d, inv) => <Select id={id} describedBy={d} invalid={inv} value={(unit.attackType ?? '') as string} options={[{ value: '', label: 'None' }, { value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' }, { value: 'support', label: 'Support' }]} onChange={(v) => set('Change attack type', (x) => setOpt(x, 'attackType', (v || undefined) as UnitDef['attackType']))} />}
              </Field>
              <Field label="Damage type" path="damageType" help="Physical or magic: which resistance foes apply. None is never resisted.">
                {(id, d, inv) => <Select id={id} describedBy={d} invalid={inv} value={(unit.damageType ?? '') as string} options={[{ value: '', label: 'None' }, { value: 'physical', label: 'Physical' }, { value: 'magic', label: 'Magic' }]} onChange={(v) => set('Change damage type', (x) => setOpt(x, 'damageType', (v || undefined) as UnitDef['damageType']))} />}
              </Field>
            </div>
          </Section>

          <Section title="Attack shape">
            <Field label="Shape of the attack" path="aoe">
              {() => <Segmented ariaLabel="Attack shape" value={unit.aoe} options={AOE_CHOICES.map((a) => ({ value: a.id, label: a.label }))} onChange={(v) => set('Change attack shape', (x) => (x.aoe = v as AoeType))} />}
            </Field>
            <div className="ed-grid">
              {UNIT_SHAPE_FIELDS.filter((f) => (f.key === 'aoeWidth' ? unit.aoe === 'line' : f.key === 'burstRadius' ? unit.aoe === 'circle' : f.key === 'coneAngle' ? unit.aoe === 'cone' || unit.upgrades.some((u) => u.setAoe === 'cone' || u.choices?.some((c) => c.setAoe === 'cone')) : true)).map((f) => (
                <NumField key={f.key} spec={f} optional value={unit[f.key as keyof UnitDef] as number | undefined} placeholder="default" onChange={(v) => set(`Edit ${f.label.toLowerCase()}`, (x) => setOpt(x, f.key as keyof UnitDef, v as never), f.key)} />
              ))}
            </div>
            <div className="ed-sub-block" data-field="shatter">
              <Toggle label="Shatter (ice missile)" help="Single-target shots burst into shards on impact (the Frost Witch)." checked={!!unit.shatter} onChange={(v) => set(v ? 'Add shatter' : 'Remove shatter', (x) => setOpt(x, 'shatter', v ? { count: 5, damageMult: 0.4, reach: 44 } : undefined))} />
              {unit.shatter && (
                <div className="ed-grid tight">
                  {SHATTER_FIELDS.map((f) => (
                    <NumField key={f.key} spec={f} path={`shatter.${f.key}`} value={unit.shatter![f.key as 'count']} onChange={(v) => set(`Edit shatter ${f.label.toLowerCase()}`, (x) => ((x.shatter![f.key as 'count'] as number) = v ?? 0), `sh${f.key}`)} />
                  ))}
                </div>
              )}
              <InlineIssues path="shatter" />
            </div>
            <div className="ed-sub-block" data-field="special">
              <Toggle label="Slow on hit" help="Hit foes are slowed for a while." checked={!!unit.special} onChange={(v) => set(v ? 'Add slow' : 'Remove slow', (x) => setOpt(x, 'special', v ? { slow: 0.3, slowDuration: 2 } : undefined))} />
              {unit.special && (
                <div className="ed-grid tight">
                  {SLOW_FIELDS.map((f) => (
                    <NumField key={f.key} spec={f} path={`special.${f.key}`} value={unit.special![f.key as 'slow']} onChange={(v) => set(`Edit ${f.label.toLowerCase()}`, (x) => ((x.special![f.key as 'slow'] as number) = v ?? 0), `sp${f.key}`)} />
                  ))}
                </div>
              )}
            </div>
          </Section>

          <Section title="Special role" help="A gold harvester or a performing support doesn't attack.">
            <Segmented ariaLabel="Special role" value={role} onChange={setRole} options={[{ value: 'combat', label: 'Fighter' }, { value: 'generator', label: 'Gold harvest' }, { value: 'bard', label: 'Support tune' }]} />
            {unit.generator && (
              <div className="ed-grid tight">
                {GENERATOR_FIELDS.map((f) => (
                  <NumField key={f.key} spec={f} path={`generator.${f.key}`} value={unit.generator![f.key as 'amount']} onChange={(v) => set(`Edit ${f.label.toLowerCase()}`, (x) => ((x.generator![f.key as 'amount'] as number) = v ?? 0), `g${f.key}`)} />
                ))}
              </div>
            )}
            {unit.bard && (
              <div className="ed-grid tight">
                {BARD_FIELDS.map((f) => (
                  <NumField key={f.key} spec={f} path={`bard.${f.key}`} value={unit.bard![f.key as 'every']} onChange={(v) => set(`Edit ${f.label.toLowerCase()}`, (x) => ((x.bard![f.key as 'every'] as number) = v ?? 0), `b${f.key}`)} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Cost & limits">
            <div className="ed-grid">
              {UNIT_COST_FIELDS.map((f) => (
                <NumField
                  key={f.key}
                  spec={f}
                  optional={f.key === 'maxMana' || f.key === 'manaRegen'}
                  value={unit[f.key as keyof UnitDef] as number | undefined}
                  onChange={(v) => set(`Edit ${f.label.toLowerCase()}`, (x) => (f.key === 'maxMana' || f.key === 'manaRegen' ? setOpt(x, f.key as keyof UnitDef, v as never) : ((x[f.key as 'cost'] as number) = v ?? 0)), f.key)}
                />
              ))}
            </div>
          </Section>

          <UpgradeEditor unit={unit} />
        </div>
        <aside className="ed-aside">
          <DerivedStats unit={unit} project={project} />
        </aside>
      </div>
    </div>
  );
}

/** Per-tier numbers for every fork path, from the game's own stat helpers. */
function DerivedStats({ unit, project }: { unit: UnitDef; project: ContentProject }) {
  const [withMastery, setWithMastery] = useState(false);
  const role = roleOf(unit);
  const paths = upgradePaths(unit);
  const [pathIndex, setPathIndex] = useState(0);
  const p = paths[Math.min(pathIndex, paths.length - 1)];
  // The mastery helpers read the installed skill trees: install the draft first.
  installProject(project);
  const tree = project.mastery[unit.id] ?? [];
  const purchased = withMastery ? activeMasteryUpgrades(unit.id, tree.map((n) => n.id), []) : [];
  const rows = Array.from({ length: p.def.upgrades.length + 1 }, (_, tier) => {
    const s = masteryStats(p.def, tier, purchased);
    let spent = p.def.cost;
    for (let t = 1; t <= tier; t++) spent += masteryUpgradeCost(p.def, t, purchased);
    const bard = effectiveBard(p.def, tier);
    return {
      tier,
      ...s,
      dps: s.damage * s.attackSpeed * masteryBurst(p.def, purchased),
      shape: attackShapeLabel(p.def, effectiveAoe(p.def, tier)),
      bounces: effectiveBounces(p.def, tier),
      harvest: masteryHarvest(effectiveGenerate(p.def, tier), unit.id, purchased),
      bard,
      spent,
    };
  });
  const max = rows[rows.length - 1];
  return (
    <Section title="Derived stats" help="Computed with the game's own helpers (masteryStats, effectiveAoe, masteryUpgradeCost…), exactly as the engine and stat panels compute them.">
      {paths.length > 1 && (
        <label className="ed-sort">
          Fork path
          <select value={pathIndex} onChange={(e) => setPathIndex(Number(e.target.value))}>
            {paths.map((x, i) => (
              <option key={i} value={i}>{x.picks.join(' → ')}</option>
            ))}
          </select>
        </label>
      )}
      <Toggle label="With the full skill tree" checked={withMastery} onChange={setWithMastery} help="Learn every node (first member of each exclusive group active)." />
      <div className="ed-stats">
        {role === 'combat' && <Stat label="Max DPS" value={fmt(max.dps, 1)} tone="gold" />}
        {role === 'generator' && <Stat label="Max harvest" value={`${max.harvest} × ${unit.generator?.timesPerWave}`} tone="gold" />}
        {role === 'bard' && max.bard && <Stat label="Max tune" value={`${fmt(max.bard.attackSpeedMult, 2)}× · ${max.bard.targets}`} tone="gold" />}
        <Stat label="Max range" value={max.range} />
        <Stat label="Crit" value={`${fmt(critChanceFor(unit, purchased) * 100, 1)}% · ${critMultiplierFor(unit, purchased)}×`} />
        <Stat label="Gold to max" value={max.spent} />
      </div>
      <table className="ed-table compact">
        <thead>
          <tr>
            <th scope="col">Tier</th>
            {role === 'combat' && <th scope="col">Dmg</th>}
            {role === 'combat' && <th scope="col">Spd</th>}
            <th scope="col">Range</th>
            {role === 'combat' && <th scope="col">DPS</th>}
            {role === 'generator' && <th scope="col">Harvest</th>}
            {role === 'bard' && <th scope="col">Tune</th>}
            <th scope="col">Gold in</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tier} title={`${r.shape}${r.bounces ? ` · ${r.bounces} bounce(s)` : ''}`}>
              <th scope="row">{r.tier}</th>
              {role === 'combat' && <td>{r.damage}</td>}
              {role === 'combat' && <td>{formatAttackSpeed(r.attackSpeed)}</td>}
              <td>{r.range}</td>
              {role === 'combat' && <td>{fmt(r.dps, 1)}</td>}
              {role === 'generator' && <td>{r.harvest}</td>}
              {role === 'bard' && <td>{r.bard ? `${fmt(r.bard.attackSpeedMult, 2)}× · ${r.bard.targets}` : '—'}</td>}
              <td>{r.spent}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ed-muted small">Shape at max: {max.shape}{max.bounces ? ` · ${max.bounces} bounce(s)` : ''}. DPS includes burst volleys; crits, auras and abilities are left out.</p>
    </Section>
  );
}

function HeroDetail({ id }: { id: string }) {
  const { go } = useNav();
  const forms: HeroInfo[] = heroChampions().filter((h) => h.id === id);
  const [form, setForm] = useState(0);
  const h = forms[Math.min(form, forms.length - 1)];
  if (!h) return null;
  const u = h.def;
  return (
    <div className="ed-detail">
      <header className="ed-detail-head">
        <div className="title">
          <UnitPreview unit={u} size={72} />
          <div>
            <h1>
              {id}
              <span className="ed-tag">Read-only</span>
            </h1>
            <p>Hero champion · built from the player's profile in src/domain/playerChampion.ts</p>
          </div>
        </div>
        <div className="actions">
          <Button icon="mastery" tone="primary" onClick={() => go({ workspace: 'mastery', tree: id, node: null })}>Edit skill tree</Button>
        </div>
      </header>
      <div className="ed-detail-body">
        <div className="ed-form">
          <p className="ed-callout">
            Hero kits (attacks, weapon forms, abilities and their auto-levelling tiers) are code, not catalog data, so they aren't edited here. Their skill trees are content: edit them in Mastery. Test play can deploy them with a default portrait.
          </p>
          {forms.length > 1 && <Segmented ariaLabel="Weapon form" value={String(form)} onChange={(v) => setForm(Number(v))} options={forms.map((f, i) => ({ value: String(i), label: f.form ? f.form[0].toUpperCase() + f.form.slice(1) : 'Base weapon' }))} />}
          <Section title={u.name}>
            <p>{u.description}</p>
            <div className="ed-stats">
              <Stat label="Damage" value={u.damage} />
              <Stat label="Speed" value={formatAttackSpeed(u.attackSpeed)} />
              <Stat label="Range" value={u.range} />
              <Stat label="Cost" value={u.cost} />
              <Stat label="Mana" value={u.maxMana ?? 0} />
              <Stat label="Shape" value={attackShapeLabel(u)} />
            </div>
            <table className="ed-table compact">
              <thead>
                <tr><th>Level</th><th>Name</th><th>EXP</th><th>Effect</th></tr>
              </thead>
              <tbody>
                {u.upgrades.map((t, i) => (
                  <tr key={i}>
                    <th scope="row">{i + 1}</th>
                    <td>{t.name}</td>
                    <td>{t.cost}</td>
                    <td>{t.ability ? `Unlocks ${t.ability.name}` : [t.damage && `+${t.damage} dmg`, t.attackSpeed && `+${t.attackSpeed} spd`, t.range && `+${t.range} range`].filter(Boolean).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      </div>
    </div>
  );
}

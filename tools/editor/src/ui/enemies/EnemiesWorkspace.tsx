/** Enemies: regular foes and bosses, their stats, defences, mechanics and usage. */

import { useMemo, useState } from 'react';
import type { BossMeta, EnemyDef } from '@game/domain/enemies';
import { expForKill } from '@game/domain/mastery';
import { hasEnemySprite } from '@game/engine/sprites';
import { useEditor, editor } from '../../store/projectStore';
import { edit, renameEnemy, renumberBoss, setOpt } from '../../store/edits';
import { ENEMY_DEFENCE_FIELDS, ENEMY_STAT_FIELDS, MECHANICS, SECTIONS, sectionName, type MechanicSpec } from '../../model/catalog';
import { bossCurve, bossDef, enemyCatalog } from '../../model/convert';
import { enemyUsage } from '../../model/queries';
import { clone, fmt, moveItem, plural, uniqueId } from '../../model/util';
import { bossKey, enemyKey } from '../../model/entities';
import { countIssues, issuesAt, validateProject } from '../../validation/validate';
import type { ContentProject } from '../../model/types';
import { Button, ColorInput, EmptyState, Field, InlineIssues, IssueScopeProvider, NumField, Section, Select, Stat, TextArea, TextInput, Toggle } from '../kit';
import { useConfirm } from '../kitHooks';
import { Chip, ListPane, type ListRow } from '../ListPane';
import { EnemyPreview } from '../SpritePreview';
import { useNav } from '../nav';

type Kind = 'all' | 'regular' | 'boss';
type Sort = 'catalog' | 'name' | 'health' | 'speed' | 'reward';

const MECHANIC_FILTERS: { id: string; label: string; test: (e: EnemyDef) => boolean }[] = [
  { id: 'shield', label: 'Shield', test: (e) => !!e.shieldHits },
  { id: 'regen', label: 'Regeneration', test: (e) => !!e.regen },
  { id: 'resist', label: 'Resistances', test: (e) => !!e.physicalResist || !!e.magicResist },
  { id: 'dodge', label: 'Dodge', test: (e) => !!e.dodgeChance },
  { id: 'aura', label: 'Damage aura', test: (e) => !!e.damageAura },
  { id: 'rally', label: 'Rally', test: (e) => !!e.rally },
  { id: 'summon', label: 'Summon', test: (e) => !!e.summon },
  { id: 'spit', label: 'Spit', test: (e) => !!e.spit },
  { id: 'heal', label: 'Heal', test: (e) => !!e.heal },
  { id: 'light', label: 'Light-shy', test: (e) => e.lightSlow !== undefined },
  { id: 'set', label: 'Set piece', test: (e) => !!e.unkillable || !!e.entrance || !!e.spawnLines?.length || !!e.deathAnimation },
];

const PREFIX: Record<string, string> = { cas: 'castle', cap: 'capital', for: 'forest', inn: 'inn' };

function chapterOf(p: ContentProject, def: EnemyDef): string {
  if (def.boss) return p.levels.find((l) => `boss${l.id}` === def.id)?.section ?? 'other';
  const pre = PREFIX[def.id.split('_')[0]];
  if (pre) return pre;
  return p.levels.find((l) => l.lanes.some((ln) => ln.waves.some((w) => w.groups.some((g) => g.enemyId === def.id))))?.section ?? 'other';
}

export function EnemiesWorkspace() {
  const { working } = useEditor();
  const { nav, go } = useNav();
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [chapter, setChapter] = useState('all');
  const [mechanic, setMechanic] = useState('any');
  const [sort, setSort] = useState<Sort>('catalog');
  const issues = validateProject(working);
  const catalog = useMemo(() => enemyCatalog(working), [working]);

  const all = useMemo(
    () => [
      ...working.enemies.map((e) => ({ key: enemyKey(e.id), def: catalog[e.id] ?? e, boss: false as const })),
      ...working.bosses.map((b, i) => ({ key: bossKey(b.level), def: bossDef(b, i), boss: true as const })),
    ],
    [working, catalog],
  );

  const rows = useMemo<ListRow[]>(() => {
    const q = query.trim().toLowerCase();
    let list = all.filter(
      (x) =>
        (kind === 'all' || (kind === 'boss') === x.boss) &&
        (chapter === 'all' || chapterOf(working, x.def) === chapter) &&
        (mechanic === 'any' || MECHANIC_FILTERS.find((m) => m.id === mechanic)?.test(x.def)) &&
        (!q || x.def.name.toLowerCase().includes(q) || x.def.id.toLowerCase().includes(q)),
    );
    if (sort !== 'catalog') {
      list = [...list].sort((a, b) => (sort === 'name' ? a.def.name.localeCompare(b.def.name) : (b.def[sort] as number) - (a.def[sort] as number)));
    }
    return list.map((x) => {
      const c = countIssues(issuesAt(issues, x.key as never));
      return {
        key: x.key,
        title: x.def.name || x.def.id,
        subtitle: `${x.def.id} · ${fmt(x.def.health, 0)} HP · ${x.def.speed} px/s`,
        lead: <span className="ed-icon-chip" style={{ background: x.def.visual.color }}>{x.def.visual.icon}</span>,
        errors: c.error,
        warnings: c.warning,
        group: sort === 'catalog' ? (x.boss ? 'Bosses' : 'Regular foes') : undefined,
      };
    });
  }, [all, issues, query, kind, chapter, mechanic, sort, working]);

  const selected = all.find((x) => x.key === nav.enemy) ?? null;

  const createFoe = () => {
    const id = uniqueId('new_foe', (k) => !!catalog[k]);
    const def: EnemyDef = { id, name: 'New Foe', health: 100, speed: 46, reward: 3, mana: 1, damageToBase: 1, visual: { color: '#b3bccb', icon: '👤' }, boss: false, radius: 13 };
    edit.project('Create foe', (p) => ({ ...p, enemies: [...p.enemies, def] }));
    go({ enemy: enemyKey(id) });
  };
  const createBoss = () => {
    let level = Math.max(0, ...working.bosses.map((b) => b.level), ...working.levels.map((l) => l.id)) + 1;
    const free = working.levels.find((l) => !working.bosses.some((b) => b.level === l.id));
    if (free) level = free.id;
    const meta: BossMeta = { level, name: 'New Boss', icon: '👑', color: '#c9a24a' };
    edit.project(`Create boss${level}`, (p) => ({ ...p, bosses: [...p.bosses, meta] }));
    go({ enemy: bossKey(level) });
  };
  const duplicate = () => {
    if (!selected) return;
    if (selected.boss) {
      const src = working.bosses.find((b) => bossKey(b.level) === selected.key)!;
      let level = src.level + 1;
      while (working.bosses.some((b) => b.level === level)) level++;
      edit.project(`Duplicate ${src.name}`, (p) => {
        const i = p.bosses.indexOf(src);
        const bosses = p.bosses.slice();
        bosses.splice(i + 1, 0, { ...clone(src), level, name: `${src.name} (copy)` });
        return { ...p, bosses };
      });
      go({ enemy: bossKey(level) });
    } else {
      const src = working.enemies.find((e) => enemyKey(e.id) === selected.key)!;
      const id = uniqueId(`${src.id}_copy`, (k) => !!catalog[k]);
      edit.project(`Duplicate ${src.name}`, (p) => {
        const i = p.enemies.indexOf(src);
        const enemies = p.enemies.slice();
        enemies.splice(i + 1, 0, { ...clone(src), id, name: `${src.name} (copy)` });
        return { ...p, enemies };
      });
      go({ enemy: enemyKey(id) });
    }
  };
  const move = (dir: -1 | 1) => {
    if (!selected) return;
    edit.project('Reorder foes', (p) => {
      if (selected.boss) {
        const i = p.bosses.findIndex((b) => bossKey(b.level) === selected.key);
        return { ...p, bosses: moveItem(p.bosses, i, i + dir) };
      }
      const i = p.enemies.findIndex((e) => enemyKey(e.id) === selected.key);
      return { ...p, enemies: moveItem(p.enemies, i, i + dir) };
    });
  };
  const remove = async () => {
    if (!selected) return;
    const use = enemyUsage(working, selected.def.id);
    const refs = use.waves.length + use.bossOf.length + use.summoners.length + use.endless.length + (use.code ? 1 : 0);
    const ok = await confirm({
      title: `Delete ${selected.def.name}?`,
      body: (
        <>
          <p>
            <strong>{selected.def.name}</strong> ({selected.def.id}) is removed from the project.
          </p>
          {refs > 0 ? (
            <p className="ed-warn">
              It is still used: {[
                use.waves.length && plural(use.waves.length, 'wave group'),
                use.bossOf.length && `boss of ${use.bossOf.map((l) => l.name).join(', ')}`,
                use.summoners.length && `summoned by ${use.summoners.join(', ')}`,
                use.endless.length && `endless mode (${use.endless.join(', ')})`,
                use.code && use.code,
              ].filter(Boolean).join('; ')}. Those references become errors until you fix them.
            </p>
          ) : (
            <p className="ed-muted">Nothing uses it.</p>
          )}
          {selected.boss && <p className="ed-muted">Later bosses keep their curve position only if their order is unchanged; deleting shifts the stat curve of every boss after it.</p>}
        </>
      ),
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    const i = rows.findIndex((r) => r.key === selected.key);
    edit.project(`Delete ${selected.def.name}`, (p) =>
      selected.boss ? { ...p, bosses: p.bosses.filter((b) => bossKey(b.level) !== selected.key) } : { ...p, enemies: p.enemies.filter((e) => enemyKey(e.id) !== selected.key) },
    );
    go({ enemy: rows[i + 1]?.key ?? rows[i - 1]?.key ?? null });
  };

  return (
    <div className="ed-split">
      <ListPane
        label="Enemies"
        rows={rows}
        selected={selected?.key ?? null}
        onSelect={(k) => go({ enemy: k })}
        query={query}
        onQuery={setQuery}
        filters={
          <>
            <div className="ed-chips" role="group" aria-label="Kind">
              {(['all', 'regular', 'boss'] as Kind[]).map((k) => (
                <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : k === 'regular' ? 'Regular' : 'Bosses'}</Chip>
              ))}
            </div>
            <div className="ed-filter-row">
              <label className="ed-sort">
                Chapter
                <select value={chapter} onChange={(e) => setChapter(e.target.value)}>
                  <option value="all">Any</option>
                  {SECTIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                  <option value="other">Other / unused</option>
                </select>
              </label>
              <label className="ed-sort">
                Mechanic
                <select value={mechanic} onChange={(e) => setMechanic(e.target.value)}>
                  <option value="any">Any</option>
                  {MECHANIC_FILTERS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </label>
              <label className="ed-sort">
                Sort
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="catalog">Catalog order</option>
                  <option value="name">Name</option>
                  <option value="health">Health</option>
                  <option value="speed">Speed</option>
                  <option value="reward">Reward</option>
                </select>
              </label>
            </div>
          </>
        }
        toolbar={
          <>
            <Button icon="plus" tone="primary" size="sm" onClick={createFoe}>New foe</Button>
            <Button icon="plus" size="sm" onClick={createBoss}>New boss</Button>
            <Button icon="copy" size="sm" onClick={duplicate} disabled={!selected} title="Duplicate" />
            <Button icon="up" size="sm" onClick={() => move(-1)} disabled={!selected || sort !== 'catalog'} title="Move up in catalog order" />
            <Button icon="down" size="sm" onClick={() => move(1)} disabled={!selected || sort !== 'catalog'} title="Move down in catalog order" />
          </>
        }
        empty={<EmptyState icon="enemies" title="No foes match">Clear the search or filters.</EmptyState>}
      />
      {!selected ? (
        <div className="ed-detail">
          <EmptyState icon="enemies" title="Pick a foe or boss" action={<Button icon="plus" tone="primary" onClick={createFoe}>New foe</Button>}>
            Regular foes are plain stat blocks. Bosses follow an escalating stat curve by their position in the boss list; set any stat to override it.
          </EmptyState>
        </div>
      ) : (
        <IssueScopeProvider issues={issuesAt(issues, selected.key as never)}>
          <EnemyDetail key={selected.key} entryKey={selected.key} def={selected.def} boss={selected.boss} onDelete={remove} />
        </IssueScopeProvider>
      )}
    </div>
  );
}

function EnemyDetail({ entryKey, def, boss, onDelete }: { entryKey: string; def: EnemyDef; boss: boolean; onDelete: () => void }) {
  const { working } = useEditor();
  const { go } = useNav();
  const bossIndex = boss ? working.bosses.findIndex((b) => bossKey(b.level) === entryKey) : -1;
  const meta = boss ? working.bosses[bossIndex] : undefined;
  const raw = boss ? undefined : working.enemies.find((e) => enemyKey(e.id) === entryKey);
  const curve = boss ? bossCurve(bossIndex) : undefined;
  const usage = enemyUsage(working, def.id);
  const sprite = hasEnemySprite(def.id);

  // One setter for both shapes: a regular EnemyDef, or a boss's meta.
  type Target = EnemyDef & BossMeta;
  const set = (label: string, fn: (d: Target) => void, key?: string) =>
    boss ? edit.boss(meta!.level, label, fn as (d: BossMeta) => void, key) : edit.enemy(raw!.id, label, fn as (d: EnemyDef) => void, key);
  const src = (boss ? meta : raw) as Partial<Target>;

  const rename = (v: string) => {
    if (boss) {
      const n = Number(v);
      if (!Number.isInteger(n) || n === meta!.level) return;
      editor.edit(`Renumber boss${meta!.level} → boss${n}`, renumberBoss(meta!.level, n));
      go({ enemy: bossKey(n) });
    } else {
      if (!v || v === raw!.id) return;
      editor.edit(`Rename ${raw!.id} → ${v}`, (p) => renameEnemy(raw!.id, v)({ ...p, enemies: p.enemies.map((e) => (e.id === raw!.id ? { ...e, id: v } : e)) }));
      go({ enemy: enemyKey(v) });
    }
  };

  const ehp = (resist?: number) => def.health / Math.max(0.01, 1 - (resist ?? 0)) / Math.max(0.01, 1 - (def.dodgeChance ?? 0));

  return (
    <div className="ed-detail">
      <header className="ed-detail-head">
        <div className="title">
          <EnemyPreview def={def} size={72} />
          <div>
            <h1>
              {def.name || def.id}
              {boss && <span className="ed-tag gold">Boss</span>}
            </h1>
            <p>
              {def.id} · {chapterOf(working, def) === 'other' ? 'No chapter' : sectionName(chapterOf(working, def) as never)} · {plural(usage.waves.length, 'wave group')}
            </p>
          </div>
        </div>
        <div className="actions">
          <Button icon="trash" tone="danger" onClick={onDelete}>Delete</Button>
        </div>
      </header>
      <div className="ed-detail-body two-col">
        <div className="ed-form">
          <Section title="Identity">
            <div className="ed-grid">
              {boss ? (
                <Field label="Boss of stage" path="level" help="A boss's id is boss<stage>. Changing it re-keys the boss and updates stages and waves that use it.">
                  {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={String(meta!.level)} onChange={rename} onBlurCommit mono />}
                </Field>
              ) : (
                <Field label="Id" path="id" help="Stable id used by waves, saves (bestiary kills) and sprites. Renaming updates every wave and summon in this project.">
                  {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={raw!.id} onChange={rename} onBlurCommit mono />}
                </Field>
              )}
              <Field label="Name" path="name">
                {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={src.name ?? ''} onChange={(v) => set('Rename', (x) => (x.name = v), 'name')} />}
              </Field>
              <Field label="Mechanic text" path="mechanic" wide help="Shown in the bestiary: a short description of what makes it special.">
                {(id, d, inv) => <TextArea id={id} describedBy={d} invalid={inv} rows={2} value={src.mechanic ?? ''} onChange={(v) => set('Edit mechanic text', (x) => setOpt(x, 'mechanic', v || undefined), 'mechanic')} />}
              </Field>
              <Field label="Lore" path="lore" wide help="Flavour text for the bestiary.">
                {(id, d, inv) => <TextArea id={id} describedBy={d} invalid={inv} rows={2} value={src.lore ?? ''} onChange={(v) => set('Edit lore', (x) => setOpt(x, 'lore', v || undefined), 'lore')} />}
              </Field>
            </div>
          </Section>

          <Section title="Look" help={sprite ? 'This id has a hand-drawn sprite; the colour tints it.' : 'This id has no sprite (sprites are code, keyed by enemy id): the board draws a tinted disc with the icon.'}>
            <div className="ed-grid">
              <Field label="Colour" path={boss ? 'color' : 'visual.color'}>
                {(id) => <ColorInput id={id} value={def.visual.color} onChange={(v) => set('Change colour', (x) => (boss ? (x.color = v) : (x.visual.color = v)), 'color')} />}
              </Field>
              <Field label="Icon" path={boss ? 'icon' : 'visual.icon'} help="An emoji, used for its token when there's no sprite and in compact lists.">
                {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={def.visual.icon} maxLength={8} onChange={(v) => set('Change icon', (x) => (boss ? (x.icon = v) : (x.visual.icon = v)), 'icon')} />}
              </Field>
            </div>
          </Section>

          <Section title="Stats" help={boss ? 'Leave a stat empty to use the boss curve (shown greyed); enter a value to override it.' : undefined}>
            <div className="ed-grid">
              {ENEMY_STAT_FIELDS.map((f) => {
                const key = f.key as keyof Target;
                const auto = curve?.[f.key as keyof typeof curve];
                return (
                  <NumField
                    key={f.key}
                    spec={f}
                    value={src[key] as number | undefined}
                    optional={boss || f.key === 'mana'}
                    placeholder={auto !== undefined ? `curve: ${auto}` : undefined}
                    hint={boss ? (src[key] === undefined ? `From the curve (${auto})` : `Override · curve ${auto}`) : undefined}
                    onChange={(v) => set(`Edit ${f.label.toLowerCase()}`, (x) => (boss || f.key === 'mana' ? setOpt(x, key, v as never) : ((x[key] as number) = v ?? 0)), f.key)}
                  />
                );
              })}
            </div>
          </Section>

          <Section title="Defences">
            <div className="ed-grid">
              {ENEMY_DEFENCE_FIELDS.map((f) => (
                <NumField key={f.key} spec={f} value={src[f.key as keyof Target] as number | undefined} optional placeholder="none" onChange={(v) => set(`Edit ${f.label.toLowerCase()}`, (x) => setOpt(x, f.key as keyof Target, v as never), f.key)} />
              ))}
            </div>
          </Section>

          <Section title="Mechanics" help="Structured behaviours the engine runs on timers. Held mechanics stop the foe in place while they play.">
            {MECHANICS.map((m) => (
              <MechanicEditor key={m.key} spec={m} value={src[m.key] as Record<string, number | string> | undefined} enemyOptions={[...working.enemies.map((e) => ({ value: e.id, label: `${e.name} (${e.id})` })), ...working.bosses.map((b) => ({ value: `boss${b.level}`, label: `★ ${b.name} (boss${b.level})` }))]} onSet={(label, fn, key) => set(label, fn as unknown as (d: Target) => void, key)} />
            ))}
          </Section>

          <Section title="Set piece & story">
            <div className="ed-grid">
              <div className="ed-field wide" data-field="unkillable">
                <Toggle label="Unkillable" help="Hits land, but its health never drops below 1 — end it with a stage's boss halt cell." checked={!!src.unkillable} onChange={(v) => set(v ? 'Make unkillable' : 'Make mortal', (x) => setOpt(x, 'unkillable', v || undefined))} />
                <InlineIssues path="unkillable" />
              </div>
              <Field label="Entrance" path="entrance" help="Sewer burst: spawning on a lane that starts in a Sewer Entrance's mouth, it bursts out as a giant and shrinks in the daylight (the Sludge Father).">
                {(id, d, inv) => (
                  <Select id={id} describedBy={d} invalid={inv} value={(src.entrance ?? '') as string} options={[{ value: '', label: 'Plain spawn' }, { value: 'sewerBurst', label: 'Sewer burst' }]} onChange={(v) => set('Change entrance', (x) => setOpt(x, 'entrance', (v || undefined) as never))} />
                )}
              </Field>
              <Field label="Death animation" path="deathAnimation" help="Shadow swallow: it slumps and sinks into its shadow; victory waits for it (Gowzer).">
                {(id, d, inv) => (
                  <Select id={id} describedBy={d} invalid={inv} value={(src.deathAnimation ?? '') as string} options={[{ value: '', label: 'Instant' }, { value: 'shadowSwallow', label: 'Shadow swallow' }]} onChange={(v) => set('Change death animation', (x) => setOpt(x, 'deathAnimation', (v || undefined) as never))} />
                )}
              </Field>
              <Field label="Death line" path="deathLine" wide help="Spoken during the death animation.">
                {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={src.deathLine ?? ''} onChange={(v) => set('Edit death line', (x) => setOpt(x, 'deathLine', v || undefined), 'deathLine')} />}
              </Field>
              <div className="ed-field wide" data-field="spawnLines">
                <span className="ed-label">Spawn lines</span>
                <p className="ed-muted small">Lines it delivers one after another on spawn, frozen and untargetable while speaking.</p>
                {(src.spawnLines ?? []).map((line, i) => (
                  <div key={i} className="ed-line-row">
                    <TextInput ariaLabel={`Spawn line ${i + 1}`} value={line} onChange={(v) => set('Edit spawn line', (x) => (x.spawnLines![i] = v), `line${i}`)} />
                    <Button size="sm" tone="plain" icon="trash" title="Remove line" onClick={() => set('Remove spawn line', (x) => { x.spawnLines!.splice(i, 1); if (!x.spawnLines!.length) delete x.spawnLines; })} />
                  </div>
                ))}
                <Button size="sm" icon="plus" tone="subtle" onClick={() => set('Add spawn line', (x) => (x.spawnLines = [...(x.spawnLines ?? []), 'A new line.']))}>Add line</Button>
              </div>
            </div>
          </Section>
        </div>

        <aside className="ed-aside">
          <Section title="At a glance">
            <div className="ed-stats">
              <Stat label="Health" value={fmt(def.health, 0)} />
              <Stat label="vs physical" value={fmt(ehp(def.physicalResist), 0)} />
              <Stat label="vs magic" value={fmt(ehp(def.magicResist), 0)} />
              <Stat label="Tiles / s" value={fmt(def.speed / 48, 2)} />
              <Stat label="Gold" value={def.reward} tone="gold" />
              <Stat label="Mastery EXP" value={expForKill(def)} />
            </div>
            <p className="ed-muted small">
              Effective health divides by (1 − resist) and (1 − dodge){def.shieldHits ? `, plus ${def.shieldHits} shielded hits` : ''}. Crossing a 20-tile lane takes ~{fmt((20 * 48) / Math.max(1, def.speed), 0)}s.
              {!boss && !def.id.endsWith('_brute') && ' Ids ending in _brute grant 2 EXP per kill.'}
            </p>
          </Section>
          <Section title="Used in">
            {usage.code && <p className="ed-warn small">Referenced by code: {usage.code}.</p>}
            {usage.bossOf.length > 0 && (
              <p>
                Boss of{' '}
                {usage.bossOf.map((l, i) => (
                  <span key={l.id}>
                    {i > 0 && ', '}
                    <button type="button" className="ed-link" onClick={() => go({ workspace: 'levels', level: l.id, levelTab: 'general' })}>{l.name}</button>
                  </span>
                ))}
              </p>
            )}
            {usage.waves.length > 0 ? (
              <ul className="ed-usage">
                {usage.waves.map((u, i) => (
                  <li key={i}>
                    <button type="button" className="ed-link" onClick={() => go({ workspace: 'levels', level: u.levelId, levelTab: 'waves', focusField: `waves.${u.wave}` })}>
                      {u.levelName}
                    </button>{' '}
                    · wave {u.wave + 1}
                    {u.lane > 0 ? ` · lane ${u.lane + 1}` : ''} · ×{u.count}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ed-muted small">No stage waves spawn it.</p>
            )}
            {usage.summoners.length > 0 && <p className="small">Summoned by {usage.summoners.join(', ')}.</p>}
            {usage.endless.length > 0 && <p className="small">Endless pools: {usage.endless.join(', ')}.</p>}
          </Section>
        </aside>
      </div>
    </div>
  );
}

function MechanicEditor({
  spec,
  value,
  enemyOptions,
  onSet,
}: {
  spec: MechanicSpec;
  value: Record<string, number | string> | undefined;
  enemyOptions: { value: string; label: string }[];
  onSet: (label: string, fn: (d: Record<string, unknown>) => void, key?: string) => void;
}) {
  if (!value) {
    return (
      <div className="ed-mech off" data-field={spec.key}>
        <div>
          <strong>{spec.label}</strong>
          <p className="ed-muted small">{spec.help}</p>
        </div>
        <Button size="sm" icon="plus" onClick={() => onSet(`Add ${spec.label.toLowerCase()}`, (d) => (d[spec.key] = { ...spec.defaults }))}>Add</Button>
      </div>
    );
  }
  return (
    <div className="ed-mech on" data-field={spec.key}>
      <header>
        <strong>{spec.label}</strong>
        <span className="ed-muted small">{spec.help}</span>
        <span className="grow" />
        <Button size="sm" tone="plain" icon="trash" title={`Remove ${spec.label}`} onClick={() => onSet(`Remove ${spec.label.toLowerCase()}`, (d) => delete d[spec.key])} />
      </header>
      <div className="ed-grid tight">
        {spec.enemyRef && (
          <Field label="Summons" path={`${spec.key}.${spec.enemyRef}`}>
            {(id, d, inv) => <Select id={id} describedBy={d} invalid={inv} value={String(value[spec.enemyRef!] ?? '')} options={enemyOptions} onChange={(v) => onSet('Change summoned foe', (x) => ((x[spec.key] as Record<string, unknown>)[spec.enemyRef!] = v))} />}
          </Field>
        )}
        {spec.fields.map((f) => (
          <NumField key={f.key} spec={f} path={`${spec.key}.${f.key}`} value={value[f.key] as number | undefined} onChange={(v) => onSet(`Edit ${spec.label.toLowerCase()} ${f.label.toLowerCase()}`, (x) => ((x[spec.key] as Record<string, unknown>)[f.key] = v ?? 0), `${spec.key}.${f.key}`)} />
        ))}
      </div>
      <InlineIssues path={spec.key} />
    </div>
  );
}

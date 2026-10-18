/** Mastery: each champion's permanent skill tree, as a prerequisite graph plus a node editor. */

import { useMemo, useState, type CSSProperties } from 'react';
import type { MasteryUpgradeDef } from '@game/domain/mastery';
import type { HeroWeaponForm } from '@game/domain/playerChampion';
import { useEditor } from '../../store/projectStore';
import { edit, setOpt } from '../../store/edits';
import { EFFECT_FIELDS, EFFECT_GROUPS, FORM_OWNER, type EffectField } from '../../model/catalog';
import { heroBaseDefs } from '../../model/shipped';
import { masteryKey } from '../../model/entities';
import { clone, plural, uniqueId } from '../../model/util';
import { countIssues, issuesAt, validateProject, type Issue } from '../../validation/validate';
import { Button, EmptyState, Field, InlineIssues, IssueList, IssueScopeProvider, NumField, NumberInput, Section, Select, TextArea, TextInput, Toggle } from '../kit';
import { useConfirm } from '../kitHooks';
import { ListPane, type ListRow } from '../ListPane';
import { useNav } from '../nav';

const NODE_W = 188;
const NODE_H = 70;
const GAP_X = 22;
const GAP_Y = 46;
const GROUP_HUES = [42, 200, 330, 140, 270, 15, 90];

/** A node's prerequisites as a list (any one unlocks it). */
const reqs = (n: MasteryUpgradeDef): string[] => (n.requires == null ? [] : typeof n.requires === 'string' ? [n.requires] : n.requires);

/** Write a prerequisite list back: none, one id, or several (any one will do). */
function setReqs(n: MasteryUpgradeDef, list: string[]) {
  setOpt(n, 'requires', list.length === 0 ? undefined : list.length === 1 ? list[0] : list);
}

export function MasteryWorkspace() {
  const { working } = useEditor();
  const { nav, go } = useNav();
  const [query, setQuery] = useState('');
  const issues = validateProject(working);
  const heroes = heroBaseDefs();

  const rows = useMemo<ListRow[]>(() => {
    const q = query.trim().toLowerCase();
    const owners = [
      ...working.units.map((u) => ({ id: u.id, name: u.name, group: 'Catalog champions', icon: u.visual.icon, color: u.visual.color })),
      ...heroes.map((u) => ({ id: u.id, name: u.id, group: 'Hero champions', icon: u.visual.icon, color: u.visual.color })),
    ];
    const orphans = Object.keys(working.mastery).filter((id) => !owners.some((o) => o.id === id)).map((id) => ({ id, name: id, group: 'Orphaned trees', icon: '?', color: '#555' }));
    return [...owners, ...orphans]
      .filter((o) => !q || o.id.toLowerCase().includes(q) || o.name.toLowerCase().includes(q))
      .map((o) => {
        const tree = working.mastery[o.id];
        const c = countIssues(issuesAt(issues, masteryKey(o.id)));
        return {
          key: o.id,
          title: o.name,
          subtitle: tree ? `${plural(tree.length, 'node')} · ${tree.reduce((n, x) => n + (x.cost || 0), 0)} EXP` : 'No skill tree',
          lead: <span className="ed-icon-chip" style={{ background: o.color }}>{o.icon}</span>,
          errors: c.error,
          warnings: c.warning,
          muted: !tree,
          group: o.group,
        };
      });
  }, [working, heroes, issues, query]);

  const unitId = nav.tree;
  const tree = unitId ? working.mastery[unitId] : undefined;
  const ownerName = unitId ? (working.units.find((u) => u.id === unitId)?.name ?? unitId) : '';

  return (
    <div className="ed-split">
      <ListPane label="Skill trees" rows={rows} selected={unitId} onSelect={(k) => go({ tree: k, node: null })} query={query} onQuery={setQuery} />
      {!unitId ? (
        <div className="ed-detail">
          <EmptyState icon="mastery" title="Pick a champion">
            Skill trees are bought with permanent EXP and apply in every stage. Nodes chain through prerequisites; exclusive groups let a player learn rivals but keep only one active.
          </EmptyState>
        </div>
      ) : !tree ? (
        <div className="ed-detail">
          <EmptyState icon="mastery" title={`${ownerName} has no skill tree`} action={<Button icon="plus" tone="primary" onClick={() => edit.tree(unitId, `Create ${unitId} skill tree`, (d) => d.push({ id: 'first_node', name: 'First Node', description: '+5% damage.', cost: 100, damageMult: 1.05 }))}>Create skill tree</Button>}>
            A champion with no tree simply has nothing to learn.
          </EmptyState>
        </div>
      ) : (
        <TreeEditor key={unitId} unitId={unitId} ownerName={ownerName} tree={tree} issues={issuesAt(issues, masteryKey(unitId))} />
      )}
    </div>
  );
}

function depthOf(tree: MasteryUpgradeDef[]): Map<string, number> {
  const byId = new Map(tree.map((n) => [n.id, n]));
  const memo = new Map<string, number>();
  const visit = (n: MasteryUpgradeDef, seen: Set<string>): number => {
    if (memo.has(n.id)) return memo.get(n.id)!;
    // Below the deepest of its prerequisites.
    const parents = reqs(n).map((id) => byId.get(id)).filter((p): p is MasteryUpgradeDef => !!p && !seen.has(p.id));
    const d = parents.length === 0 ? 0 : Math.max(...parents.map((p) => visit(p, new Set([...seen, n.id])))) + 1;
    memo.set(n.id, d);
    return d;
  };
  for (const n of tree) visit(n, new Set([n.id]));
  return memo;
}

/** EXP to learn a node including its whole prerequisite chain (through its first prerequisite). */
function chainCost(tree: MasteryUpgradeDef[], n: MasteryUpgradeDef): number {
  const byId = new Map(tree.map((x) => [x.id, x]));
  let sum = 0;
  const seen = new Set<string>();
  let cur: MasteryUpgradeDef | undefined = n;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    sum += cur.cost || 0;
    const up: string | undefined = reqs(cur)[0];
    cur = up ? byId.get(up) : undefined;
  }
  return sum;
}

function TreeEditor({ unitId, ownerName, tree, issues }: { unitId: string; ownerName: string; tree: MasteryUpgradeDef[]; issues: Issue[] }) {
  const { nav, go } = useNav();
  const confirm = useConfirm();
  const selIndex = Math.max(-1, tree.findIndex((n) => n.id === nav.node));
  const sel = selIndex >= 0 ? tree[selIndex] : null;
  const set = (label: string, fn: (d: MasteryUpgradeDef[]) => void, key?: string) => edit.tree(unitId, label, fn, key);

  const groups = [...new Set(tree.map((n) => n.exclusiveGroup).filter((g): g is string => !!g))];
  const hue = (g?: string) => (g ? GROUP_HUES[groups.indexOf(g) % GROUP_HUES.length] : undefined);

  // Layout: one row per prerequisite depth.
  const depth = depthOf(tree);
  const levels: MasteryUpgradeDef[][] = [];
  for (const n of tree) (levels[depth.get(n.id) ?? 0] ??= []).push(n);
  const width = Math.max(1, ...levels.map((l) => l?.length ?? 0)) * (NODE_W + GAP_X) + GAP_X;
  const pos = new Map<string, { x: number; y: number }>();
  levels.forEach((row, d) => {
    const rowW = row.length * (NODE_W + GAP_X) - GAP_X;
    row.forEach((n, i) => pos.set(n.id, { x: (width - rowW) / 2 + i * (NODE_W + GAP_X), y: GAP_Y / 2 + d * (NODE_H + GAP_Y) }));
  });
  const height = Math.max(1, levels.length) * (NODE_H + GAP_Y);

  const nodeIssueCount = (i: number) => countIssues(issues.filter((x) => x.field === `nodes.${i}` || x.field?.startsWith(`nodes.${i}.`)));
  const freshId = (base: string) => uniqueId(base, (id) => tree.some((n) => n.id === id));

  const addNode = (requires?: string) => {
    const id = freshId('new_node');
    set('Add node', (d) => d.push({ id, name: 'New Node', description: 'Describe the effect.', cost: 100, ...(requires ? { requires } : {}), damageMult: 1.05 }));
    go({ node: id });
  };
  const duplicate = () => {
    if (!sel) return;
    const id = freshId(`${sel.id}_copy`);
    set('Duplicate node', (d) => d.splice(selIndex + 1, 0, { ...clone(sel), id, name: `${sel.name} (copy)` }));
    go({ node: id });
  };
  const move = (dir: -1 | 1) =>
    sel &&
    set('Reorder nodes', (d) => {
      const j = selIndex + dir;
      if (j >= 0 && j < d.length) [d[selIndex], d[j]] = [d[j], d[selIndex]];
    });
  const remove = async () => {
    if (!sel) return;
    const dependents = tree.filter((n) => reqs(n).includes(sel.id));
    const ok = await confirm({
      title: `Delete "${sel.name}"?`,
      body: (
        <>
          <p>The node is removed from {ownerName}'s tree. Players who learned it lose its effect (their EXP isn't refunded).</p>
          {dependents.length > 0 && <p className="ed-warn">{plural(dependents.length, 'node')} require it ({dependents.map((d) => d.name).join(', ')}); they will require {reqs(sel).length ? reqs(sel).map((r) => `"${r}"`).join(' or ') : 'nothing'} in its place.</p>}
        </>
      ),
      confirmLabel: 'Delete node',
    });
    if (!ok) return;
    set('Delete node', (d) => {
      for (const n of d) {
        const r = reqs(n);
        if (r.includes(sel.id)) setReqs(n, [...new Set(r.flatMap((id) => (id === sel.id ? reqs(sel) : [id])))]);
      }
      d.splice(selIndex, 1);
    });
    go({ node: null });
  };
  const removeTree = async () => {
    if (await confirm({ title: `Delete ${ownerName}'s skill tree?`, body: `All ${plural(tree.length, 'node')} are removed. You can undo this.`, confirmLabel: 'Delete tree' })) {
      edit.project(`Delete ${unitId} skill tree`, (p) => {
        const mastery = { ...p.mastery };
        delete mastery[unitId];
        return { ...p, mastery };
      });
    }
  };

  const nodeIssues = sel ? issues.filter((i) => i.field === `nodes.${selIndex}` || i.field?.startsWith(`nodes.${selIndex}.`)).map((i) => ({ ...i, field: i.field === `nodes.${selIndex}` ? '' : i.field!.slice(`nodes.${selIndex}.`.length) })) : [];
  const treeIssues = issues.filter((i) => !i.field?.startsWith('nodes.'));

  return (
    <div className="ed-detail">
      <header className="ed-detail-head">
        <div className="title">
          <div>
            <h1>{ownerName}'s skill tree</h1>
            <p>
              {plural(tree.length, 'node')} · {tree.reduce((n, x) => n + (x.cost || 0), 0)} EXP to learn everything · {plural(groups.length, 'exclusive group')}
            </p>
          </div>
        </div>
        <div className="actions">
          <Button icon="plus" tone="primary" onClick={() => addNode()}>Add node</Button>
          <Button icon="split" onClick={() => sel && addNode(sel.id)} disabled={!sel} title="Add a node that requires the selected one">Add child</Button>
          <Button icon="copy" onClick={duplicate} disabled={!sel} title="Duplicate node" />
          <Button icon="up" onClick={() => move(-1)} disabled={!sel || selIndex === 0} title="Move earlier in the tree's list order" />
          <Button icon="down" onClick={() => move(1)} disabled={!sel || selIndex === tree.length - 1} title="Move later in the tree's list order" />
          <Button icon="trash" tone="danger" onClick={remove} disabled={!sel} title="Delete node" />
          <Button icon="trash" tone="subtle" onClick={removeTree} title="Delete the whole tree">Tree</Button>
        </div>
      </header>
      <div className="ed-detail-body two-col wide-left">
        <div className="ed-form">
          {groups.length > 0 && (
            <p className="ed-callout">
              <strong>Exclusive groups.</strong> A player may <em>learn</em> several nodes of the same group, but only <em>one</em> of them is <em>active</em> at a time — they pick which in the skill-tree menu (the first learned is active by default). Only the active node's effects apply. Groups here:{' '}
              {groups.map((g) => (
                <span key={g} className="ed-group-badge" style={{ '--hue': hue(g) } as CSSProperties}>⇄ {g}</span>
              ))}
            </p>
          )}
          <IssueList issues={treeIssues} />
          <div className="ed-tree-scroll">
            <div className="ed-tree" style={{ width, height }} role="list" aria-label={`${ownerName} skill tree`}>
              <svg width={width} height={height} aria-hidden="true">
                {tree.flatMap((n) => reqs(n).map((r) => {
                  const a = pos.get(r);
                  const b = pos.get(n.id);
                  if (!a || !b) return null;
                  const x1 = a.x + NODE_W / 2;
                  const y1 = a.y + NODE_H;
                  const x2 = b.x + NODE_W / 2;
                  const y2 = b.y;
                  const my = (y1 + y2) / 2;
                  const on = sel && (sel.id === n.id || sel.id === r);
                  return <path key={`${n.id}<${r}`} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} className={`edge${on ? ' on' : ''}`} />;
                }))}
              </svg>
              {tree.map((n, i) => {
                const p = pos.get(n.id)!;
                const c = nodeIssueCount(i);
                const missing = reqs(n).some((r) => !tree.some((x) => x.id === r));
                return (
                  <button
                    key={`${n.id}-${i}`}
                    type="button"
                    role="listitem"
                    className={`ed-node${sel === n ? ' on' : ''}${n.major ? ' major' : ''}${n.exclusiveGroup ? ' excl' : ''}`}
                    style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H, '--hue': hue(n.exclusiveGroup) } as CSSProperties}
                    aria-pressed={sel === n}
                    aria-label={`${n.name}, ${n.cost} EXP${reqs(n).length ? `, requires ${reqs(n).join(' or ')}` : ''}${n.exclusiveGroup ? `, exclusive group ${n.exclusiveGroup}` : ''}`}
                    onClick={() => go({ node: n.id })}
                  >
                    <span className="nm">{n.name || n.id}</span>
                    <span className="meta">
                      {n.cost} EXP{chainCost(tree, n) !== n.cost ? ` · ${chainCost(tree, n)} total` : ''}
                    </span>
                    <span className="badges">
                      {n.exclusiveGroup && <span className="excl-badge">⇄ {n.exclusiveGroup}</span>}
                      {missing && <span className="ed-count error">!</span>}
                      {c.error > 0 ? <span className="ed-count error">{c.error}</span> : c.warning > 0 ? <span className="ed-count warning">{c.warning}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="ed-muted small">Rows are prerequisite depth (roots on top); lines run from a prerequisite to the nodes that require it. Gold outline = major node.</p>
        </div>
        <aside className="ed-aside">
          {sel ? (
            <IssueScopeProvider issues={nodeIssues}>
              <NodeForm unitId={unitId} tree={tree} index={selIndex} groups={groups} />
            </IssueScopeProvider>
          ) : (
            <EmptyState icon="mastery" title="Select a node">Click a node in the tree to edit it.</EmptyState>
          )}
        </aside>
      </div>
    </div>
  );
}

function NodeForm({ unitId, tree, index, groups }: { unitId: string; tree: MasteryUpgradeDef[]; index: number; groups: string[] }) {
  const { go } = useNav();
  const n = tree[index];
  const set = (label: string, fn: (d: MasteryUpgradeDef) => void, key?: string) => edit.tree(unitId, label, (d) => fn(d[index]), key && `n${index}.${key}`);
  const rename = (v: string) => {
    if (!v || v === n.id) return;
    edit.tree(unitId, `Rename node ${n.id} → ${v}`, (d) => {
      for (const x of d) if (reqs(x).includes(n.id)) setReqs(x, reqs(x).map((r) => (r === n.id ? v : r)));
      d[index].id = v;
    });
    go({ node: v });
  };
  const present = EFFECT_FIELDS.filter((f) => n[f.key as keyof MasteryUpgradeDef] !== undefined);
  const absent = EFFECT_FIELDS.filter((f) => n[f.key as keyof MasteryUpgradeDef] === undefined);
  const addEffect = (f: EffectField) =>
    set(`Add ${f.label}`, (d) => {
      const rec = d as unknown as Record<string, unknown>;
      if (f.kind === 'bool') rec[f.key] = true;
      else if (f.kind === 'form') rec[f.key] = Object.keys(FORM_OWNER).find((k) => FORM_OWNER[k] === unitId) ?? 'claymore';
      else if (f.kind === 'discount') rec[f.key] = { tier: 1, amount: 20 };
      else rec[f.key] = f.kind === 'multiplier' ? Math.max(f.min ?? 1, 1.1) : f.kind === 'int' ? Math.max(1, f.min ?? 1) : 0.1;
    });

  return (
    <div className="ed-form">
      <Section title="Node">
        <div className="ed-grid one">
          <Field label="Id" path="id" help="Saves store learned nodes by id; renaming updates prerequisites in this tree.">
            {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={n.id} onChange={rename} onBlurCommit mono />}
          </Field>
          <Field label="Name" path="name">
            {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={n.name} onChange={(v) => set('Rename node', (x) => (x.name = v), 'name')} />}
          </Field>
          <Field label="Description" path="description">
            {(id, d, inv) => <TextArea id={id} describedBy={d} invalid={inv} rows={3} value={n.description} onChange={(v) => set('Edit node description', (x) => (x.description = v), 'desc')} />}
          </Field>
          <Field label="EXP cost" path="cost">
            {(id, d, inv) => <NumberInput id={id} describedBy={d} invalid={inv} value={n.cost} spec={{ kind: 'int', min: 0, step: 25 }} onChange={(v) => set('Edit node cost', (x) => (x.cost = v ?? 0), 'cost')} />}
          </Field>
          <Field label="Requires" path="requires" help="The node that must be learned first. None = it branches straight from the champion. Add alternatives when any one of several nodes should unlock it.">
            {(id, d, inv) => {
              const list = reqs(n);
              const opts = (keep?: string) => tree.filter((x) => x !== n && (x.id === keep || !list.includes(x.id))).map((x) => ({ value: x.id, label: `${x.name} (${x.id})` }));
              return (
                <>
                  <Select id={id} describedBy={d} invalid={inv} value={list[0] ?? ''} options={[{ value: '', label: 'Nothing (a root node)' }, ...opts(list[0])]} onChange={(v) => set('Change prerequisite', (x) => setReqs(x, v ? [v, ...list.slice(1)] : []))} />
                  {list.slice(1).map((r, i) => (
                    <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <span className="ed-muted small">or</span>
                      <Select ariaLabel={`Alternative prerequisite ${i + 1}`} value={r} options={opts(r)} onChange={(v) => set('Change prerequisite', (x) => setReqs(x, list.map((o, j) => (j === i + 1 ? v : o))))} />
                      <Button size="sm" tone="plain" icon="trash" title="Remove this alternative" onClick={() => set('Remove prerequisite', (x) => setReqs(x, list.filter((_, j) => j !== i + 1)))} />
                    </div>
                  ))}
                  {list.length > 0 && opts().length > 0 && (
                    <Button size="sm" icon="plus" onClick={() => set('Add prerequisite', (x) => setReqs(x, [...list, opts()[0].value]))}>Or also…</Button>
                  )}
                </>
              );
            }}
          </Field>
          <Toggle label="Major node" help="Purely cosmetic: a golden outline for capstones and defining effects." checked={!!n.major} onChange={(v) => set(v ? 'Mark major' : 'Unmark major', (x) => setOpt(x, 'major', v || undefined))} />
          <Field label="Exclusive group" path="exclusiveGroup" help="Nodes sharing a group can all be learned, but only one is active at a time. Leave empty for an always-on node." hint={n.exclusiveGroup ? `${tree.filter((x) => x.exclusiveGroup === n.exclusiveGroup).length} node(s) in this group` : undefined}>
            {(id, d, inv) => (
              <>
                <input
                  id={id}
                  className="ed-input mono"
                  list={`${id}-groups`}
                  value={n.exclusiveGroup ?? ''}
                  placeholder="none"
                  aria-describedby={d}
                  aria-invalid={inv || undefined}
                  onChange={(e) => set('Change exclusive group', (x) => setOpt(x, 'exclusiveGroup', e.target.value || undefined), 'group')}
                />
                <datalist id={`${id}-groups`}>
                  {groups.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </div>
      </Section>
      <Section title="Effects" help="Effects multiply or add to the champion's stats in every stage. Grouped by what they touch.">
        {present.length === 0 && <p className="ed-muted small">No effects yet.</p>}
        {EFFECT_GROUPS.map((g) => {
          const fields = present.filter((f) => f.group === g.id);
          if (fields.length === 0) return null;
          return (
            <div key={g.id} className="ed-effect-group">
              <h4 className="ed-subhead" title={g.help}>{g.label}</h4>
              {fields.map((f) => (
                <div key={f.key} className="ed-removable">
                  <EffectControl field={f} node={n} unitId={unitId} onSet={set} />
                  <Button size="sm" tone="plain" icon="close" title={`Remove ${f.label}`} onClick={() => set(`Remove ${f.label}`, (x) => delete (x as unknown as Record<string, unknown>)[f.key])} />
                </div>
              ))}
            </div>
          );
        })}
        <label className="ed-add-effect">
          <span>Add effect</span>
          <select
            value=""
            aria-label="Add an effect"
            onChange={(e) => {
              const f = EFFECT_FIELDS.find((x) => x.key === e.target.value);
              if (f) addEffect(f);
            }}
          >
            <option value="">Choose…</option>
            {EFFECT_GROUPS.map((g) => (
              <optgroup key={g.id} label={g.label}>
                {absent.filter((f) => f.group === g.id).map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <InlineIssues path="" />
      </Section>
    </div>
  );
}

function EffectControl({ field, node, unitId, onSet }: { field: EffectField; node: MasteryUpgradeDef; unitId: string; onSet: (label: string, fn: (d: MasteryUpgradeDef) => void, key?: string) => void }) {
  const rec = node as unknown as Record<string, unknown>;
  const v = rec[field.key];
  const put = (value: unknown) => onSet(`Edit ${field.label}`, (d) => ((d as unknown as Record<string, unknown>)[field.key] = value), field.key);
  if (field.kind === 'bool') {
    return (
      <div className="ed-field" data-field={field.key}>
        <Toggle label={field.label} help={field.help} checked={!!v} onChange={put} />
        <InlineIssues path={field.key} />
      </div>
    );
  }
  if (field.kind === 'form') {
    return (
      <Field label={field.label} path={field.key} help={field.help}>
        {(id, d, inv) => <Select id={id} describedBy={d} invalid={inv} value={String(v)} options={Object.keys(FORM_OWNER).map((k) => ({ value: k, label: `${k} (${FORM_OWNER[k]})`, disabled: FORM_OWNER[k] !== unitId }))} onChange={(x) => put(x as HeroWeaponForm)} />}
      </Field>
    );
  }
  if (field.kind === 'discount') {
    const dsc = (v as { tier: number; amount: number }) ?? { tier: 1, amount: 0 };
    return (
      <div className="ed-field" data-field={field.key}>
        <span className="ed-label">{field.label}</span>
        <div className="ed-inline-fields">
          <label>
            Tier
            <NumberInput ariaLabel="Discounted tier" width={60} value={dsc.tier} spec={{ kind: 'int', min: 1 }} onChange={(x) => put({ ...dsc, tier: x ?? 1 })} />
          </label>
          <label>
            Gold off
            <NumberInput ariaLabel="Discount amount" width={70} value={dsc.amount} spec={{ kind: 'int', min: 0, step: 5 }} onChange={(x) => put({ ...dsc, amount: x ?? 0 })} />
          </label>
        </div>
        <InlineIssues path={field.key} />
      </div>
    );
  }
  const pct = field.kind === 'multiplier' && typeof v === 'number' ? `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 1000) / 10}%` : undefined;
  return <NumField spec={{ ...field, kind: field.kind }} path={field.key} value={v as number} onChange={put} hint={pct} />;
}

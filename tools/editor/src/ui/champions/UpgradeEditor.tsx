/**
 * In-stage upgrades: sequential gold tiers on a deployed champion. A tier can
 * be a fork (`choices`): the player buys one option and the others lock out.
 * Deltas are additive on top of the previous tier.
 */

import type { AoeType, UnitDef, UpgradeDef } from '@game/domain/units';
import { edit, setOpt } from '../../store/edits';
import { AOE_CHOICES, UPGRADE_FIELDS } from '../../model/catalog';
import { clone } from '../../model/util';
import { Button, Field, InlineIssues, NumField, NumberInput, Section, Select, TextInput, Toggle } from '../kit';
import { useConfirm } from '../kitHooks';

type Path = (number | 'c')[];

/** Walk to the upgrade at `path` (tier index, then optionally 'c', option index). */
function at(unit: UnitDef, path: Path): UpgradeDef {
  let u = unit.upgrades[path[0] as number];
  if (path.length === 3) u = u.choices![path[2] as number];
  return u;
}
const fieldPath = (path: Path) => (path.length === 3 ? `upgrades.${path[0]}.choices.${path[2]}` : `upgrades.${path[0]}`);

export function UpgradeEditor({ unit }: { unit: UnitDef }) {
  const confirm = useConfirm();
  const set = (label: string, fn: (d: UnitDef) => void, key?: string) => edit.unit(unit.id, label, fn, key);
  const blank = (n: number): UpgradeDef => ({ name: `Tier ${n}`, description: 'Describe the upgrade.', cost: 50 });

  const addTier = () => set('Add upgrade tier', (d) => d.upgrades.push(blank(d.upgrades.length + 1)));
  const moveTier = (i: number, dir: -1 | 1) =>
    set('Reorder upgrade tiers', (d) => {
      const j = i + dir;
      if (j < 0 || j >= d.upgrades.length) return;
      [d.upgrades[i], d.upgrades[j]] = [d.upgrades[j], d.upgrades[i]];
    });
  const removeTier = async (i: number) => {
    if (await confirm({ title: `Delete tier ${i + 1}?`, body: `"${unit.upgrades[i].name}" is removed; later tiers move up. Mastery discounts point at tiers by number, so check them. You can undo this.`, confirmLabel: 'Delete tier' })) {
      set('Delete upgrade tier', (d) => d.upgrades.splice(i, 1));
    }
  };
  const toggleFork = async (i: number, on: boolean) => {
    if (on) {
      set('Make tier a fork', (d) => {
        const t = d.upgrades[i];
        const a: UpgradeDef = clone(t);
        delete a.choices;
        const b: UpgradeDef = { name: 'Option B', description: 'The other path.', cost: t.cost };
        d.upgrades[i] = { name: t.name, description: t.description, cost: t.cost, choices: [a, b] };
      });
    } else {
      if (!(await confirm({ title: 'Remove the fork?', body: 'The tier keeps its first option; the other options are deleted. You can undo this.', confirmLabel: 'Remove fork' }))) return;
      set('Remove fork', (d) => {
        const t = d.upgrades[i];
        d.upgrades[i] = { ...clone(t.choices![0]), name: t.choices![0].name };
      });
    }
  };

  return (
    <Section
      title={`In-stage upgrades (${unit.upgrades.length})`}
      help="Bought with gold on a deployed champion and reset every stage. Each tier's numbers add to the previous tier's. A fork lets the player pick one option."
      actions={<Button size="sm" icon="plus" tone="primary" onClick={addTier}>Add tier</Button>}
    >
      {unit.upgrades.length === 0 && <p className="ed-muted">No upgrades: this champion can't be upgraded in a stage.</p>}
      <InlineIssues path="upgrades" />
      <ol className="ed-tiers">
        {unit.upgrades.map((t, i) => (
          <li key={i} className="ed-tier" data-field={`upgrades.${i}`}>
            <header>
              <span className="n">Tier {i + 1}</span>
              <strong>{t.name}</strong>
              {t.choices && <span className="ed-tag">Fork · {t.choices.length} options</span>}
              <span className="grow" />
              <Toggle label="Fork" checked={!!t.choices} onChange={(v) => toggleFork(i, v)} help="Make this tier a choice between options; buying one locks the others out." />
              <Button size="sm" tone="plain" icon="up" title="Move tier up" disabled={i === 0} onClick={() => moveTier(i, -1)} />
              <Button size="sm" tone="plain" icon="down" title="Move tier down" disabled={i === unit.upgrades.length - 1} onClick={() => moveTier(i, 1)} />
              <Button size="sm" tone="plain" icon="copy" title="Duplicate tier" onClick={() => set('Duplicate tier', (d) => d.upgrades.splice(i + 1, 0, clone(d.upgrades[i])))} />
              <Button size="sm" tone="plain" icon="trash" title="Delete tier" onClick={() => removeTier(i)} />
            </header>
            {t.choices ? (
              <>
                <UpgradeFields unit={unit} path={[i]} labelsOnly />
                <div className="ed-choices">
                  {t.choices.map((_, ci) => (
                    <div key={ci} className="ed-choice" data-field={`upgrades.${i}.choices.${ci}`}>
                      <header>
                        <span className="n">Option {String.fromCharCode(65 + ci)}</span>
                        <span className="grow" />
                        <Button size="sm" tone="plain" icon="up" title="Move option up" disabled={ci === 0} onClick={() => set('Reorder fork options', (d) => { const c = d.upgrades[i].choices!; [c[ci - 1], c[ci]] = [c[ci], c[ci - 1]]; })} />
                        <Button size="sm" tone="plain" icon="copy" title="Duplicate option" onClick={() => set('Duplicate fork option', (d) => d.upgrades[i].choices!.splice(ci + 1, 0, clone(d.upgrades[i].choices![ci])))} />
                        <Button size="sm" tone="plain" icon="trash" title="Delete option" disabled={t.choices!.length <= 2} onClick={() => set('Delete fork option', (d) => d.upgrades[i].choices!.splice(ci, 1))} />
                      </header>
                      <UpgradeFields unit={unit} path={[i, 'c', ci]} />
                    </div>
                  ))}
                  <Button size="sm" icon="plus" tone="subtle" onClick={() => set('Add fork option', (d) => d.upgrades[i].choices!.push({ name: `Option ${String.fromCharCode(65 + d.upgrades[i].choices!.length)}`, description: '', cost: t.cost }))}>Add option</Button>
                </div>
              </>
            ) : (
              <UpgradeFields unit={unit} path={[i]} />
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function UpgradeFields({ unit, path, labelsOnly = false }: { unit: UnitDef; path: Path; labelsOnly?: boolean }) {
  const up = at(unit, path);
  const fp = fieldPath(path);
  const set = (label: string, fn: (u: UpgradeDef) => void, key?: string) => edit.unit(unit.id, label, (d) => fn(at(d, path)), key && `${fp}.${key}`);
  const unset = UPGRADE_FIELDS.filter((f) => up[f.key as keyof UpgradeDef] === undefined);
  return (
    <div className="ed-upgrade-fields">
      <div className="ed-grid">
        <Field label="Name" path={`${fp}.name`}>
          {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={up.name} onChange={(v) => set('Rename upgrade', (u) => (u.name = v), 'name')} />}
        </Field>
        <Field label="Gold cost" path={`${fp}.cost`} help={labelsOnly ? "A fork's own cost only labels it on overview tables; each option has its own price." : 'Gold to buy this tier (mastery discounts apply in-game).'}>
          {(id, d, inv) => <NumberInput id={id} describedBy={d} invalid={inv} value={up.cost} spec={{ kind: 'int', min: 0, step: 5, unit: 'gold' }} onChange={(v) => set('Edit upgrade cost', (u) => (u.cost = v ?? 0), 'cost')} />}
        </Field>
        <Field label="Description" path={`${fp}.description`} wide>
          {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={up.description} onChange={(v) => set('Edit upgrade description', (u) => (u.description = v), 'desc')} />}
        </Field>
      </div>
      {labelsOnly ? (
        <InlineIssues path={fp} />
      ) : (
        <>
          <div className="ed-grid tight">
            {UPGRADE_FIELDS.filter((f) => up[f.key as keyof UpgradeDef] !== undefined).map((f) => (
              <div key={f.key} className="ed-removable">
                <NumField spec={f} path={`${fp}.${f.key}`} value={up[f.key as keyof UpgradeDef] as number} onChange={(v) => set(`Edit ${f.label}`, (u) => setOpt(u, f.key as keyof UpgradeDef, v as never), f.key)} optional />
                <Button size="sm" tone="plain" icon="close" title={`Remove ${f.label}`} onClick={() => set(`Remove ${f.label}`, (u) => delete u[f.key as keyof UpgradeDef])} />
              </div>
            ))}
            <Field label="Changes attack shape to" path={`${fp}.setAoe`} help="Transforms the attack from this tier on (the Wizard's Wind Slice turns his gust into a cone).">
              {(id, d, inv) => (
                <Select
                  id={id}
                  describedBy={d}
                  invalid={inv}
                  value={(up.setAoe ?? '') as string}
                  options={[{ value: '', label: 'No change' }, ...AOE_CHOICES.map((a) => ({ value: a.id, label: a.label }))]}
                  onChange={(v) => set('Change attack shape transform', (u) => setOpt(u, 'setAoe', (v || undefined) as AoeType | undefined))}
                />
              )}
            </Field>
          </div>
          {unset.length > 0 && (
            <label className="ed-add-effect">
              <span>Add effect</span>
              <select
                value=""
                aria-label="Add an upgrade effect"
                onChange={(e) => {
                  const f = UPGRADE_FIELDS.find((x) => x.key === e.target.value);
                  if (f) set(`Add ${f.label}`, (u) => ((u as unknown as Record<string, number>)[f.key] = f.kind === 'fraction' ? 0.1 : 1));
                }}
              >
                <option value="">Choose…</option>
                {unset.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </label>
          )}
          {up.ability && (
            <div className="ed-ability">
              <strong>Unlocks ability: {up.ability.name}</strong> <span className="ed-muted small">({up.ability.id}, {up.ability.cooldown}s cooldown, {up.ability.manaCost ?? 0} mana)</span>
              <p className="ed-muted small">Abilities are cast by hero champions and defined in code; catalog champions rarely carry one.</p>
              <Button size="sm" tone="danger" icon="trash" onClick={() => set('Remove ability', (u) => delete u.ability)}>Remove ability</Button>
            </div>
          )}
          <InlineIssues path={fp} />
        </>
      )}
    </div>
  );
}

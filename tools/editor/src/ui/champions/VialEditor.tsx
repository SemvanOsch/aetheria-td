/**
 * A vial cycle (the Plague Doctor): the vials thrown one per attack, in order,
 * each with its own effect and its own repeatable in-stage levels. A level sets
 * new values (blank = unchanged), so 3% → 5% → 7% poison reads as written.
 */

import { effectiveVial, vialEffectLabel, vialLevelLabel, type UnitDef, type VialDef, type VialLevelDef } from '@game/domain/units';
import { edit, setOpt } from '../../store/edits';
import { VIAL_EFFECT_FIELDS } from '../../model/catalog';
import { clone } from '../../model/util';
import { Button, ColorInput, Field, InlineIssues, NumField, NumberInput, Section, TextInput, Toggle } from '../kit';
import { useConfirm } from '../kitHooks';

type EffectKey = 'damageMult' | 'poison' | 'bleed';

const pct = (f: number | undefined) => `${+((f ?? 0) * 100).toFixed(2)}%`;

/** A fresh vial: a plain hit with no levels yet. */
export const blankVial = (n: number): VialDef => ({ name: `Vial ${n}`, description: 'Describe the vial.', color: '#b4d43a', damageMult: 1, levels: [] });

/** The vial cycle's own section; only shown once the cycle is switched on (Attack shape › Vial cycle). */
export function VialEditor({ unit }: { unit: UnitDef }) {
  const confirm = useConfirm();
  const set = (label: string, fn: (d: UnitDef) => void, key?: string) => edit.unit(unit.id, label, fn, key);
  const vials = unit.vials;
  if (!vials) return null;

  const removeCycle = async () => {
    if (await confirm({ title: 'Remove the vial cycle?', body: 'Every vial and its levels are deleted; the champion goes back to plain hits. You can undo this.', confirmLabel: 'Remove vials' })) {
      set('Remove vial cycle', (d) => delete d.vials);
    }
  };
  const removeVial = async (i: number) => {
    if (await confirm({ title: `Delete ${vials![i].name || `vial ${i + 1}`}?`, body: 'The vial and its levels are removed; later vials move up in the cycle. You can undo this.', confirmLabel: 'Delete vial' })) {
      set('Delete vial', (d) => d.vials!.splice(i, 1));
    }
  };
  const moveVial = (i: number, dir: -1 | 1) =>
    set('Reorder vials', (d) => {
      const j = i + dir;
      if (j < 0 || j >= d.vials!.length) return;
      [d.vials![i], d.vials![j]] = [d.vials![j], d.vials![i]];
    });

  return (
    <Section
      title={`Vial cycle (${vials.length})`}
      help="Thrown one per attack, in this order, wrapping around (single-target champions only). Each vial decides that throw's damage, poison and bleed. Its levels open in-stage once every upgrade tier is bought, and the vials level independently of each other."
      actions={
        <>
          <Button size="sm" icon="plus" tone="primary" onClick={() => set('Add vial', (d) => d.vials!.push(blankVial(d.vials!.length + 1)))}>Add vial</Button>
          <Button size="sm" tone="danger" icon="trash" onClick={removeCycle}>Remove</Button>
        </>
      }
    >
      <InlineIssues path="vials" />
      <ol className="ed-tiers">
        {vials.map((v, i) => (
          <li key={i} className="ed-tier" data-field={`vials.${i}`}>
            <header>
              <span className="n">Vial {i + 1}</span>
              <span className="ed-vial-swatch" style={{ background: v.color }} aria-hidden />
              <strong>{v.name}</strong>
              <span className="ed-muted small">{vialEffectLabel(effectiveVial(v, 0))}</span>
              <span className="grow" />
              <Button size="sm" tone="plain" icon="up" title="Throw earlier" disabled={i === 0} onClick={() => moveVial(i, -1)} />
              <Button size="sm" tone="plain" icon="down" title="Throw later" disabled={i === vials.length - 1} onClick={() => moveVial(i, 1)} />
              <Button size="sm" tone="plain" icon="copy" title="Duplicate vial" onClick={() => set('Duplicate vial', (d) => d.vials!.splice(i + 1, 0, clone(d.vials![i])))} />
              <Button size="sm" tone="plain" icon="trash" title="Delete vial" onClick={() => removeVial(i)} />
            </header>
            <VialFields unit={unit} index={i} />
          </li>
        ))}
      </ol>
    </Section>
  );
}

function VialFields({ unit, index }: { unit: UnitDef; index: number }) {
  const v = unit.vials![index];
  const fp = `vials.${index}`;
  const set = (label: string, fn: (v: VialDef) => void, key?: string) => edit.unit(unit.id, label, (d) => fn(d.vials![index]), key && `${fp}.${key}`);
  const setLevel = (li: number, label: string, fn: (l: VialLevelDef) => void, key?: string) => set(label, (x) => fn(x.levels[li]), key && `l${li}.${key}`);
  const addLevel = () =>
    set('Add vial level', (x) => {
      const last = x.levels[x.levels.length - 1];
      x.levels.push(last ? clone(last) : { cost: 40 });
    });

  return (
    <div className="ed-upgrade-fields">
      <div className="ed-grid">
        <Field label="Name" path={`${fp}.name`}>
          {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={v.name} onChange={(val) => set('Rename vial', (x) => (x.name = val), 'name')} />}
        </Field>
        <Field label="Liquid colour" path={`${fp}.color`} help="The flask in flight, its splash and its row in the champion panel.">
          {(id) => <ColorInput id={id} value={v.color} onChange={(val) => set('Change vial colour', (x) => (x.color = val), 'color')} />}
        </Field>
        <Field label="Description" path={`${fp}.description`} wide>
          {(id, d, inv) => <TextInput id={id} describedBy={d} invalid={inv} value={v.description} onChange={(val) => set('Edit vial description', (x) => (x.description = val), 'desc')} />}
        </Field>
      </div>
      <div className="ed-grid tight">
        {VIAL_EFFECT_FIELDS.map((f) => (
          <NumField
            key={f.key}
            spec={f}
            path={`${fp}.${f.key}`}
            optional={f.key !== 'damageMult'}
            placeholder="none"
            value={v[f.key as EffectKey]}
            onChange={(val) => set(`Edit vial ${f.label.toLowerCase()}`, (x) => (f.key === 'damageMult' ? (x.damageMult = val ?? 0) : setOpt(x, f.key as EffectKey, val)), f.key)}
          />
        ))}
        <Toggle label="Ignores resistance" help="Its impact damage ignores the foe's physical and magic resistance (the Ruin Tonic)." checked={!!v.ignoreResist} onChange={(on) => set(on ? 'Make vial ignore resistance' : 'Make vial respect resistance', (x) => setOpt(x, 'ignoreResist', on || undefined))} />
      </div>

      <div className="ed-vial-levels" data-field={`${fp}.levels`}>
        <div className="ed-vial-levels-head">
          <strong>Levels ({v.levels.length})</strong>
          <span className="ed-muted small">Each level sets the value it raises; blank keeps the one before.</span>
          <span className="grow" />
          <Button size="sm" icon="plus" tone="subtle" onClick={addLevel}>Add level</Button>
        </div>
        {v.levels.length === 0 && <p className="ed-muted small">No levels: this vial can't be upgraded in a stage.</p>}
        {v.levels.map((l, li) => {
          const prev = effectiveVial(v, li);
          return (
            <div key={li} className="ed-choice ed-vial-level" data-field={`${fp}.levels.${li}`}>
              <header>
                <span className="n">Level {li + 1}</span>
                <span className="ed-muted small">{vialLevelLabel(v, li + 1)}</span>
                <span className="grow" />
                <Button size="sm" tone="plain" icon="copy" title="Duplicate level" onClick={() => set('Duplicate vial level', (x) => x.levels.splice(li + 1, 0, clone(x.levels[li])))} />
                <Button size="sm" tone="plain" icon="trash" title="Delete level" onClick={() => set('Delete vial level', (x) => x.levels.splice(li, 1))} />
              </header>
              <div className="ed-grid tight ed-vial-level-fields">
                <Field label="Gold cost" path={`${fp}.levels.${li}.cost`}>
                  {(id, d, inv) => <NumberInput id={id} describedBy={d} invalid={inv} value={l.cost} spec={{ kind: 'int', min: 0, step: 5, unit: 'gold' }} onChange={(val) => setLevel(li, 'Edit vial level cost', (x) => (x.cost = val ?? 0), 'cost')} />}
                </Field>
                {VIAL_EFFECT_FIELDS.map((f) => (
                  <NumField
                    key={f.key}
                    spec={f}
                    path={`${fp}.levels.${li}.${f.key}`}
                    optional
                    placeholder={`unchanged (${f.kind === 'fraction' ? pct(prev[f.key as EffectKey] as number | undefined) : `${prev[f.key as EffectKey] ?? 0}×`})`}
                    value={l[f.key as EffectKey]}
                    onChange={(val) => setLevel(li, `Edit vial level ${f.label.toLowerCase()}`, (x) => setOpt(x, f.key as EffectKey, val), f.key)}
                  />
                ))}
              </div>
              <InlineIssues path={`${fp}.levels.${li}`} />
            </div>
          );
        })}
      </div>
      <InlineIssues path={fp} />
    </div>
  );
}

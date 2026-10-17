/** A stage's general settings: identity, economy, boss and set pieces. */

import { useEditor } from '../../store/projectStore';
import { edit, renumberLevel, setOpt } from '../../store/edits';
import { editor } from '../../store/projectStore';
import { LEVEL_FIELDS, SECTIONS, STAGE_ENDINGS, sectionColor } from '../../model/catalog';
import { STARTING_GOLD, enemyCatalog, levelDefaults } from '../../model/convert';
import type { EditorLevel } from '../../model/types';
import type { StageEnding } from '@game/domain/levels';
import { Button, ColorInput, Field, InlineIssues, NumField, NumberInput, Section, Select, TextInput, Toggle } from '../kit';
import { useNav } from '../nav';

export function LevelGeneral({ level }: { level: EditorLevel }) {
  const { working } = useEditor();
  const { go } = useNav();
  const set = (label: string, fn: (d: EditorLevel) => void, key?: string) => edit.level(level.id, label, fn, key);
  const catalog = enemyCatalog(working);
  const defaults = levelDefaults(level);
  const bossOptions = [
    ...working.bosses.map((b) => ({ value: `boss${b.level}`, label: `boss${b.level} · ${b.name}` })),
    ...working.enemies.map((e) => ({ value: e.id, label: `${e.id} · ${e.name} (not a boss)` })),
  ];
  const ownBossMissing = !catalog[defaults.bossId];

  const renumber = (raw: string) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n === level.id) return;
    editor.edit(`Renumber stage ${level.id} → ${n}`, renumberLevel(level.id, n));
    go({ level: n });
  };

  const createBoss = () => {
    editor.edit(`Create boss for stage ${level.id}`, (p) => ({
      ...p,
      bosses: [...p.bosses, { level: level.id, name: `${level.name} Boss`, icon: '👑', color: '#c9a24a' }],
      levels: p.levels.map((l) => (l.id === level.id ? { ...l, bossId: defaults.bossId } : l)),
    }));
  };

  return (
    <div className="ed-form">
      <Section title="Identity" help="How the stage is identified and listed. The id is global and stable: the game unlocks stage N once stage N-1 is cleared, and saves record cleared stages by id.">
        <div className="ed-grid">
          <Field label="Stage id" path="id" help="Changing it re-keys the stage. Keyed game tables (castle decor mirrors, legacy props, the boss list) use this id.">
            {(id, d, invalid) => <TextInput id={id} describedBy={d} invalid={invalid} value={String(level.id)} onChange={renumber} onBlurCommit mono />}
          </Field>
          <Field label="Chapter" path="section" help="The section (chapter) the stage belongs to. Its position in the chapter is its order in the list; move it with the arrows.">
            {(id, d, invalid) => (
              <Select
                id={id}
                describedBy={d}
                invalid={invalid}
                value={level.section}
                options={SECTIONS.map((s) => ({ value: s.id, label: `${s.icon} ${s.name}${s.wip ? ' (WIP chapter)' : ''}` }))}
                onChange={(v) => set('Change chapter', (dd) => (dd.section = v))}
              />
            )}
          </Field>
          <Field label="Name" path="name" wide>
            {(id, d, invalid) => <TextInput id={id} describedBy={d} invalid={invalid} value={level.name} onChange={(v) => set('Rename stage', (dd) => (dd.name = v), 'name')} />}
          </Field>
          <Field label="Subtitle" path="subtitle" wide help="One line under the name on the stage card.">
            {(id, d, invalid) => <TextInput id={id} describedBy={d} invalid={invalid} value={level.subtitle} onChange={(v) => set('Edit subtitle', (dd) => (dd.subtitle = v), 'subtitle')} />}
          </Field>
          <Field label="Card colour" path="color" help="Accent colour of the stage card. Defaults to the chapter's colour." hint={level.color !== sectionColor(level.section) ? <button type="button" className="ed-link" onClick={() => set('Reset card colour', (dd) => (dd.color = sectionColor(level.section)))}>Use chapter colour</button> : 'Chapter colour'}>
            {(id) => <ColorInput id={id} ariaLabel="Card colour" value={level.color} onChange={(v) => set('Change card colour', (dd) => (dd.color = v), 'color')} />}
          </Field>
        </div>
      </Section>

      <Section title="Economy & lives" help="The stage's starting resources and its reward.">
        <div className="ed-grid">
          <NumField spec={LEVEL_FIELDS.baseHealth} value={level.baseHealth} onChange={(v) => set('Edit base health', (d) => (d.baseHealth = v ?? 0), 'baseHealth')} />
          <NumField
            spec={LEVEL_FIELDS.startingGold}
            value={level.startingGold}
            onChange={(v) => set('Edit starting gold', (d) => (d.startingGold = v ?? STARTING_GOLD), 'startingGold')}
            hint={level.startingGold === STARTING_GOLD ? 'Game default' : `Default is ${STARTING_GOLD}`}
          />
          <NumField spec={LEVEL_FIELDS.gem} value={level.gem} onChange={(v) => set('Edit gem reward', (d) => (d.gem = v ?? 0), 'gem')} />
        </div>
      </Section>

      <Section title="Boss" help="The stage's boss heads the boss bar and the stage card. Put it in a wave (usually the last) so it actually spawns.">
        <div className="ed-grid">
          <Field label="Boss" path="bossId" wide hint={level.bossId !== defaults.bossId ? `This stage's own boss id would be ${defaults.bossId}.` : undefined}>
            {(id, d, invalid) => <Select id={id} describedBy={d} invalid={invalid} value={level.bossId} options={bossOptions} onChange={(v) => set('Change boss', (dd) => (dd.bossId = v))} />}
          </Field>
          <div className="ed-field-actions">
            {ownBossMissing ? (
              <Button icon="plus" size="sm" onClick={createBoss} title={`Create ${defaults.bossId} and use it here`}>
                Create {defaults.bossId}
              </Button>
            ) : (
              level.bossId !== defaults.bossId && (
                <Button size="sm" onClick={() => set('Use own boss', (dd) => (dd.bossId = defaults.bossId))}>
                  Use {defaults.bossId}
                </Button>
              )
            )}
            {catalog[level.bossId]?.boss && (
              <Button icon="link" size="sm" tone="subtle" onClick={() => go({ workspace: 'enemies', enemy: `boss:${level.bossId.slice(4)}` })}>
                Open boss
              </Button>
            )}
          </div>
        </div>
      </Section>

      <Section title="Set pieces" help="Stage-wide rules and cinematic endings. Lane reveals and water emergence are set per lane under Lanes & Waves.">
        <div className="ed-grid">
          <div className="ed-field wide" data-field="mist">
            <Toggle
              label="Mist"
              help="Champions lose 30% range unless they stand in a lit lantern's light. Place Lantern Post props for the player to light."
              checked={!!level.mist}
              onChange={(v) => set(v ? 'Add mist' : 'Remove mist', (d) => setOpt(d, 'mist', v || undefined))}
            />
            <InlineIssues path="mist" />
          </div>
          <Field label="Ending cutscene" path="ending" help="A cutscene played when the stage is won, before the result card.">
            {(id, d, invalid) => (
              <Select
                id={id}
                describedBy={d}
                invalid={invalid}
                value={(level.ending ?? '') as string}
                options={[{ value: '', label: 'None' }, ...STAGE_ENDINGS.map((e) => ({ value: e.id, label: e.label }))]}
                onChange={(v) => set('Change ending', (dd) => setOpt(dd, 'ending', (v || undefined) as StageEnding | undefined))}
              />
            )}
          </Field>
          <Field label="Victory line" path="victoryLine" help='The line under "Victory" on the result card. Leave empty for the usual line.'>
            {(id, d, invalid) => (
              <TextInput id={id} describedBy={d} invalid={invalid} value={level.victoryLine ?? ''} placeholder="The realm is saved. The boss lies vanquished!" onChange={(v) => set('Edit victory line', (dd) => setOpt(dd, 'victoryLine', v || undefined), 'victoryLine')} />
            )}
          </Field>
          <div className="ed-field wide" data-field="bossHaltAt">
            <Toggle
              label="Boss halts at a cell (wins the stage)"
              help="The stage is won the moment a boss reaches this path cell — for a boss the player is never meant to fell (The Sewers)."
              checked={!!level.bossHaltAt}
              onChange={(v) => set(v ? 'Set boss halt cell' : 'Clear boss halt cell', (d) => setOpt(d, 'bossHaltAt', v ? { ...(d.lanes[0]?.path[Math.floor(d.lanes[0].path.length / 2)] ?? { col: 8, row: 4 }) } : undefined))}
            />
            {level.bossHaltAt && (
              <div className="ed-inline-fields">
                <label>
                  Col
                  <NumberInput ariaLabel="Halt column" width={70} value={level.bossHaltAt.col} spec={{ min: -1, max: 16, kind: 'int' }} onChange={(v) => set('Move halt cell', (d) => (d.bossHaltAt!.col = v ?? 0), 'halt')} />
                </label>
                <label>
                  Row
                  <NumberInput ariaLabel="Halt row" width={70} value={level.bossHaltAt.row} spec={{ min: -1, max: 10, kind: 'int' }} onChange={(v) => set('Move halt cell', (d) => (d.bossHaltAt!.row = v ?? 0), 'halt')} />
                </label>
                <span className="ed-muted small">Shown as a flag on the Board tab.</span>
              </div>
            )}
            <InlineIssues path="bossHaltAt" />
          </div>
        </div>
      </Section>
    </div>
  );
}

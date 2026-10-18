/**
 * Centralised content validation. Every rule the editor enforces lives here:
 * forms show the issues inline (matched by entity + field path), the Problems
 * panel lists them all, and the exporters refuse to produce game content while
 * any *error* remains. Warnings flag likely mistakes but never block.
 */

import { COLS, ROWS, cellKey, expandPathCells, type Cell } from '@game/domain/grid';
import { BASE_PROP_KINDS, propCells, propFootprint, type DecorProp } from '@game/domain/decor';
import { bossIdForLevel, type BossMeta, type EnemyDef } from '@game/domain/enemies';
import type { UnitDef, UpgradeDef } from '@game/domain/units';
import type { MasteryUpgradeDef } from '@game/domain/mastery';
import type { ContentProject, EditorLevel } from '../model/types';
import {
  AOE_CHOICES,
  BARD_FIELDS,
  BOSS_KEYS,
  CHAMPION_SHAPES,
  EFFECT_FIELDS,
  ENEMY_DEFENCE_FIELDS,
  ENEMY_KEYS,
  ENEMY_STAT_FIELDS,
  FLOOR_KINDS,
  FORM_OWNER,
  GENERATOR_FIELDS,
  GROUP_FIELDS,
  GROUP_KEYS,
  HEX_COLOR,
  ID_PATTERN,
  KNOWN_ABILITY_IDS,
  LANE_KEYS,
  LEVEL_FIELDS,
  LEVEL_KEYS,
  LIGHTABLE_PROPS,
  MASTERY_KEYS,
  MECHANICS,
  MOOD_IDS,
  PATH_KINDS,
  PROP_KINDS,
  RARITY_CHOICES,
  SECTION_IDS,
  BLEED_FIELDS,
  POISON_FIELDS,
  SHATTER_FIELDS,
  SLOW_FIELDS,
  TARGETING_CHOICES,
  UNIT_COMBAT_FIELDS,
  UNIT_COST_FIELDS,
  UNIT_KEYS,
  UNIT_SHAPE_FIELDS,
  UPGRADE_FIELDS,
  UPGRADE_KEYS,
  VIAL_EFFECT_FIELDS,
  VIAL_KEYS,
  VIAL_LEVEL_KEYS,
  inRange,
  rangeText,
  type NumField,
} from '../model/catalog';
import { CODE_REFERENCES, bossEnemyIds, enemyIdsUsedBy, levelTotalWaves } from '../model/queries';
import { ENDLESS_LEVELS } from '@game/domain/endless';
import { bossKey, enemyKey, levelKey, masteryKey, unitKey, type EntityKey } from '../model/entities';
import { heroBaseDefs, isHeroId } from '../model/shipped';
import { enemyCatalog as catalogFor } from '../model/convert';

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  severity: Severity;
  /** The entity the issue belongs to. */
  entity: EntityKey | 'project';
  /** Readable location inside it, e.g. "Lane 2 › Wave 3 › Group 1". */
  where: string;
  /** Dotted field path inside the entity, for inline display. */
  field?: string;
  /** What is wrong. */
  message: string;
  /** How to fix it. */
  fix: string;
}

type Push = (severity: Severity, field: string | undefined, where: string, message: string, fix: string) => void;

const isOffBoard = (c: Cell) => c.col < 0 || c.col >= COLS || c.row < 0 || c.row >= ROWS;
const inRing = (c: Cell) => c.col >= -1 && c.col <= COLS && c.row >= -1 && c.row <= ROWS;

/** Check a numeric field against its descriptor (`required`: must be present). */
function checkNum(push: Push, f: NumField, value: unknown, field: string, where: string, required: boolean) {
  if (value === undefined || value === null) {
    if (required) push('error', field, where, `${f.label} is missing.`, `Enter ${rangeText(f)}.`);
    return;
  }
  if (typeof value !== 'number' || !inRange(f, value)) {
    push('error', field, where, `${f.label} is ${JSON.stringify(value)}, which isn't valid.`, `Use ${rangeText(f)}${f.unit ? ` (${f.unit})` : ''}.`);
  }
}

function checkKeys(push: Push, obj: object, allowed: Set<string>, fieldPrefix: string, where: string) {
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) {
      push('error', `${fieldPrefix}${k}`, where, `Unsupported field "${k}" — the game doesn't read it.`, "Remove it; importing a pack with “Remove fields the game doesn't support” ticked does this for you.");
    }
  }
}

function checkColor(push: Push, value: unknown, field: string, where: string, label: string) {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
    push('error', field, where, `${label} "${String(value ?? '')}" isn't a colour.`, 'Use a 6-digit hex colour like #8fa6c8.');
  }
}

// ------------------------------------------------------------------ levels

function propAtCell(decor: readonly DecorProp[], c: Cell): DecorProp | undefined {
  return decor.find((p) => propCells(p).some((q) => q.col === c.col && q.row === c.row));
}

/** Whether a cell lies within the bounding box of some prop (an arch, a tunnel mouth). */
function underProp(decor: readonly DecorProp[], c: Cell): boolean {
  return decor.some((p) => {
    const cells = propCells(p);
    if (cells.length === 0) return false;
    const cols = cells.map((q) => q.col);
    const rows = cells.map((q) => q.row);
    return c.col >= Math.min(...cols) && c.col <= Math.max(...cols) && c.row >= Math.min(...rows) && c.row <= Math.max(...rows);
  });
}

function validateLevel(level: EditorLevel, enemies: Map<string, EnemyDef>, push: Push) {
  checkKeys(push, level, LEVEL_KEYS, '', 'Stage');
  if (!Number.isInteger(level.id) || level.id < 1 || level.id >= 1000) {
    push('error', 'id', 'General', `Stage id ${level.id} is out of range.`, 'Use a whole number from 1 to 999 (endless maps use 1000 and up).');
  }
  if (!SECTION_IDS.includes(level.section)) push('error', 'section', 'General', `Unknown chapter "${level.section}".`, `Pick one of: ${SECTION_IDS.join(', ')}.`);
  if (!level.name?.trim()) push('error', 'name', 'General', 'The stage has no name.', 'Give it a name; it shows on the stage card and the battle screen.');
  if (!level.subtitle?.trim()) push('warning', 'subtitle', 'General', 'The stage has no subtitle.', 'Add a one-line subtitle for the stage card.');
  checkNum(push, LEVEL_FIELDS.baseHealth, level.baseHealth, 'baseHealth', 'General', true);
  checkNum(push, LEVEL_FIELDS.startingGold, level.startingGold, 'startingGold', 'General', true);
  checkNum(push, LEVEL_FIELDS.gem, level.gem, 'gem', 'General', true);
  checkColor(push, level.color, 'color', 'General', 'Card colour');
  if (level.mood !== undefined && !MOOD_IDS.includes(level.mood)) {
    push('error', 'mood', 'Board › Mood', `Unknown mood "${level.mood}".`, 'Pick a mood preset, or "Chapter default".');
  }

  // Boss.
  const boss = enemies.get(level.bossId);
  if (!level.bossId) push('error', 'bossId', 'General', 'No boss is set.', 'Pick the stage\'s boss (it heads the boss bar and the stage card).');
  else if (!boss) push('error', 'bossId', 'General', `Boss "${level.bossId}" doesn't exist.`, `Create boss ${level.bossId} in Enemies, or pick an existing boss.`);
  else if (!boss.boss) push('warning', 'bossId', 'General', `"${boss.name}" isn't a boss.`, 'Pick an enemy from the boss list.');

  // Theme.
  const t = level.theme;
  if (t) {
    checkColor(push, t.groundEven, 'theme.groundEven', 'Board › Ground', 'Floor tone');
    checkColor(push, t.groundOdd, 'theme.groundOdd', 'Board › Ground', 'Floor variation');
    if (t.floor && !FLOOR_KINDS.includes(t.floor)) push('error', 'theme.floor', 'Board › Ground', `Unknown floor "${t.floor}".`, `Pick one of: ${FLOOR_KINDS.join(', ')}.`);
    if (t.pathKind && !PATH_KINDS.includes(t.pathKind)) push('error', 'theme.pathKind', 'Board › Ground', `Unknown path material "${t.pathKind}".`, `Pick one of: ${PATH_KINDS.join(', ')}.`);
    t.path?.forEach(([c, w], i) => {
      checkColor(push, c, `theme.path.${i}`, 'Board › Ground', `Path layer ${i + 1}`);
      if (typeof w !== 'number' || w < 0 || w > 48) push('error', `theme.path.${i}`, 'Board › Ground', `Path layer ${i + 1} inset ${w} is invalid.`, 'Use 0–48 px.');
    });
  }

  const decor = level.decor ?? [];
  const totalWaves = levelTotalWaves(level);

  // Lanes and paths.
  if (level.lanes.length === 0) push('error', 'lanes', 'Lanes', 'The stage has no lanes.', 'Add a lane and draw its path on the board.');
  const visibleCells = new Set<string>();
  const spawnCells = new Set<string>();
  level.lanes.forEach((lane, li) => {
    const L = `Lane ${li + 1}`;
    checkKeys(push, lane, LANE_KEYS, `lanes.${li}.`, L);
    const path = lane.path ?? [];
    if (path.length < 2) {
      push('error', `lanes.${li}.path`, `${L} › Path`, `Lane ${li + 1}'s path has ${path.length} point${path.length === 1 ? '' : 's'}.`, 'Draw at least a spawn and a castle point (click the board in Path mode).');
    }
    let pathOk = path.length >= 2;
    path.forEach((c, pi) => {
      if (!Number.isInteger(c.col) || !Number.isInteger(c.row) || !inRing(c)) {
        pathOk = false;
        push('error', `lanes.${li}.path`, `${L} › Path`, `Point ${pi + 1} (${c.col}, ${c.row}) is outside the board.`, `Keep points within columns -1…${COLS} and rows -1…${ROWS} (the ring just off the board is where foes enter and leave).`);
      }
      const prev = path[pi - 1];
      if (prev) {
        if (prev.col === c.col && prev.row === c.row) {
          pathOk = false;
          push('error', `lanes.${li}.path`, `${L} › Path`, `Points ${pi} and ${pi + 1} are the same cell.`, 'Remove the duplicate point.');
        } else if (prev.col !== c.col && prev.row !== c.row) {
          pathOk = false;
          push('error', `lanes.${li}.path`, `${L} › Path`, `The leg from point ${pi} to ${pi + 1} is diagonal.`, 'Paths run in straight horizontal/vertical legs: add a turn point in between.');
        }
      }
    });
    if (pathOk) {
      const start = path[0];
      const end = path[path.length - 1];
      spawnCells.add(cellKey(start.col, start.row));
      if (!isOffBoard(start) && !lane.emerge && lane.revealAtWave === undefined && !propAtCell(decor, start)) {
        push('warning', `lanes.${li}.path`, `${L} › Path`, `Lane ${li + 1} spawns on the board at (${start.col}, ${start.row}).`, 'Foes normally enter from the off-board ring; start it there, or under a prop (a throne, a sewer mouth) or mark it as emerging from water.');
      }
      const endProp = propAtCell(decor, end);
      if (!isOffBoard(end) && !(endProp && BASE_PROP_KINDS.has(endProp.kind)) && !underProp(decor, end)) {
        push('warning', `lanes.${li}.path`, `${L} › Path`, `Lane ${li + 1} ends on the board at (${end.col}, ${end.row}) with no base there.`, 'End it off the board, or on a base prop: a Castle, Burning Castle, Gate, Sewer Entrance or Escape Wagon.');
      }
      if (lane.revealAtWave === undefined) for (const c of expandPathCells(path)) visibleCells.add(cellKey(c.col, c.row));
    }

    if (lane.revealAtWave !== undefined) {
      if (!Number.isInteger(lane.revealAtWave) || lane.revealAtWave < 0 || lane.revealAtWave >= Math.max(1, totalWaves)) {
        push('error', `lanes.${li}.revealAtWave`, `${L} › Reveal`, `Reveal wave ${lane.revealAtWave + 1} doesn't exist.`, `Pick a wave from 1 to ${Math.max(1, totalWaves)}.`);
      } else {
        const early = lane.waves.slice(0, lane.revealAtWave).findIndex((w) => w.groups.length > 0);
        if (early >= 0) {
          push('warning', `lanes.${li}.waves.${early}`, `${L} › Wave ${early + 1}`, `Lane ${li + 1} is hidden until wave ${lane.revealAtWave + 1}, so its wave ${early + 1} foes never spawn.`, 'Move those groups to a later wave or reveal the lane earlier.');
        }
      }
    }

    if (lane.waves.length === 0) {
      push('warning', `lanes.${li}.waves`, `${L} › Waves`, `Lane ${li + 1} has no waves, so nothing ever walks it.`, 'Add waves to it, or remove the lane.');
    }
    lane.waves.forEach((wave, wi) => {
      const WW = `${L} › Wave ${wi + 1}`;
      if (!Array.isArray(wave.groups)) {
        push('error', `lanes.${li}.waves.${wi}`, WW, 'The wave is malformed (no groups list).', 'Delete and re-add the wave.');
        return;
      }
      checkKeys(push, wave, new Set(['groups']), `lanes.${li}.waves.${wi}.`, WW);
      wave.groups.forEach((g, gi) => {
        const G = `${WW} › Group ${gi + 1}`;
        const f = `lanes.${li}.waves.${wi}.groups.${gi}`;
        checkKeys(push, g, GROUP_KEYS, `${f}.`, G);
        const def = enemies.get(g.enemyId);
        if (!g.enemyId) push('error', `${f}.enemyId`, G, 'The group has no foe.', 'Pick which foe it spawns.');
        else if (!def) push('error', `${f}.enemyId`, G, `Foe "${g.enemyId}" doesn't exist.`, 'Pick an existing foe, or create it in Enemies.');
        checkNum(push, GROUP_FIELDS.count, g.count, `${f}.count`, G, true);
        checkNum(push, GROUP_FIELDS.spacing, g.spacing, `${f}.spacing`, G, false);
        checkNum(push, GROUP_FIELDS.delay, g.delay, `${f}.delay`, G, false);
        checkNum(push, GROUP_FIELDS.healthMult, g.healthMult, `${f}.healthMult`, G, false);
        if (def?.boss && g.count > 1) push('warning', `${f}.count`, G, `${g.count} copies of the boss ${def.name} spawn.`, 'Bosses normally come alone (count 1).');
        if (def?.entrance === 'sewerBurst' && !sewerMouthLane(lane, decor)) {
          push('warning', `${f}.enemyId`, G, `${def.name}'s sewer-burst entrance only plays on a lane that starts in a Sewer Entrance's mouth.`, 'Start this lane inside a Sewer Entrance prop, or expect a plain spawn.');
        }
      });
    });
  });

  if (totalWaves === 0 && level.lanes.length > 0) push('error', 'lanes', 'Waves', 'No lane has any waves.', 'Add at least one wave with a group of foes.');
  for (let wi = 0; wi < totalWaves; wi++) {
    const spawns = level.lanes.some((l) => (l.waves[wi]?.groups.length ?? 0) > 0 && (l.revealAtWave === undefined || l.revealAtWave <= wi));
    if (!spawns) push('warning', `waves.${wi}`, `Wave ${wi + 1}`, `Wave ${wi + 1} spawns nothing on any lane.`, 'Add a group to it, or remove the empty wave from every lane.');
  }

  // Decor.
  const occupied = new Map<string, number>();
  decor.forEach((p, i) => {
    const D = `Board › Prop ${i + 1}`;
    checkKeys(push, p, new Set(['kind', 'col', 'row', 'color', 'lit']), `decor.${i}.`, D);
    if (!PROP_KINDS.includes(p.kind)) {
      push('error', `decor.${i}`, D, `Unknown prop "${p.kind}".`, 'Remove it; the renderer can\'t draw it.');
      return;
    }
    if (!Number.isInteger(p.col) || !Number.isInteger(p.row) || isOffBoard({ col: p.col, row: p.row })) {
      push('error', `decor.${i}`, D, `${p.kind} sits off the board at (${p.col}, ${p.row}).`, `Move it onto the board (columns 0–${COLS - 1}, rows 0–${ROWS - 1}).`);
      return;
    }
    if (p.color !== undefined) checkColor(push, p.color, `decor.${i}`, D, 'Prop tint');
    if (p.lit && !LIGHTABLE_PROPS[p.kind]) push('warning', `decor.${i}`, D, `"Starts lit" does nothing on a ${p.kind}.`, 'Only lantern posts can be lit.');
    const cells = propFootprint(p.kind).map(([dc, dr]) => ({ col: p.col + dc, row: p.row + dr }));
    if (cells.some(isOffBoard)) push('warning', `decor.${i}`, D, `Part of the ${p.kind} hangs off the board.`, 'Move it so its whole footprint fits.');
    for (const c of cells) {
      const k = cellKey(c.col, c.row);
      const other = occupied.get(k);
      if (other !== undefined && other !== i) {
        push('warning', `decor.${i}`, D, `${p.kind} overlaps prop ${other + 1} (${decor[other].kind}) at (${c.col}, ${c.row}).`, 'Move one of them; overlapping props draw on top of each other.');
        break;
      }
      occupied.set(k, i);
    }
    if (!BASE_PROP_KINDS.has(p.kind)) {
      const onPath = cells.find((c) => visibleCells.has(cellKey(c.col, c.row)) && !spawnCells.has(cellKey(c.col, c.row)));
      if (onPath) push('warning', `decor.${i}`, D, `${p.kind} sits on the enemy path at (${onPath.col}, ${onPath.row}).`, 'Move it off the path; only base props (castle, gate, sewer, wagon) belong at a path\'s end.');
    }
  });

  // Set pieces.
  const waveFoes = enemyIdsUsedBy(level);
  if (level.bossHaltAt) {
    const k = cellKey(level.bossHaltAt.col, level.bossHaltAt.row);
    const onLane = level.lanes.some((l) => l.path.length >= 2 && expandPathCells(l.path).some((c) => cellKey(c.col, c.row) === k));
    if (!onLane) push('error', 'bossHaltAt', 'Set pieces', `The boss halt cell (${level.bossHaltAt.col}, ${level.bossHaltAt.row}) isn't on any lane.`, 'Pick a cell the boss\'s lane passes through.');
  }
  const unkillable = [...waveFoes].map((id) => enemies.get(id)).find((e) => e?.unkillable);
  if (unkillable && !level.bossHaltAt) {
    push('warning', 'bossHaltAt', 'Set pieces', `${unkillable.name} can't be killed, and nothing halts it.`, 'Set "Boss halts at" so the stage ends when it arrives, or the player can only lose lives to it.');
  }
  if (level.ending === 'getaway' && !decor.some((p) => p.kind === 'escapeWagon')) {
    push('warning', 'ending', 'Set pieces', 'The getaway ending rides off in the Escape Wagon, but the board has none.', 'Place an Escape Wagon prop (at a path\'s end).');
  }
  if (level.ending === 'sludgeFather') {
    if (!decor.some((p) => p.kind === 'cistern')) push('warning', 'ending', 'Set pieces', 'The Sludge Father ending rises from a cistern, but the board has none.', 'Place a Cistern prop.');
    if (!level.bossHaltAt) push('warning', 'ending', 'Set pieces', 'The Sludge Father ending plays when the boss halts, but no halt cell is set.', 'Set "Boss halts at".');
  }
  if (level.mist && !decor.some((p) => LIGHTABLE_PROPS[p.kind])) {
    push('warning', 'mist', 'Set pieces', 'The stage is misty but has no lantern posts to light.', 'Place Lantern Post props, or every champion fights at 70% range all stage.');
  }
  if (boss && !waveFoes.has(level.bossId) && !level.archived) {
    push('warning', 'bossId', 'General', `The boss ${boss.name} never spawns in any wave.`, 'Add it to a wave (usually the last), or the boss bar and card point at a foe that never comes.');
  }
}

function sewerMouthLane(lane: { path: Cell[] }, decor: readonly DecorProp[]): boolean {
  const s = lane.path[0];
  return !!s && decor.some((p) => p.kind === 'sewerEntrance' && propCells(p).some((c) => c.col === s.col && c.row === s.row));
}

// ----------------------------------------------------------------- enemies

function validateMechanics(e: Partial<EnemyDef & BossMeta>, enemies: Map<string, EnemyDef>, selfId: string, push: Push) {
  for (const m of MECHANICS) {
    const v = e[m.key] as Record<string, unknown> | undefined;
    if (v === undefined) continue;
    const where = `Mechanics › ${m.label}`;
    if (typeof v !== 'object' || v === null) {
      push('error', m.key, where, `${m.label} is malformed.`, 'Remove it and add it again.');
      continue;
    }
    checkKeys(push, v, new Set([...m.fields.map((f) => f.key), ...(m.enemyRef ? [m.enemyRef] : [])]), `${m.key}.`, where);
    for (const f of m.fields) checkNum(push, f, v[f.key], `${m.key}.${f.key}`, where, true);
    if (m.enemyRef) {
      const id = v[m.enemyRef] as string;
      const target = enemies.get(id);
      if (!target) push('error', `${m.key}.${m.enemyRef}`, where, `It summons "${id}", which doesn't exist.`, 'Pick an existing foe to summon.');
      else if (id === selfId) push('warning', `${m.key}.${m.enemyRef}`, where, 'It summons copies of itself, which summon more in turn.', 'Pick a different foe unless the runaway is the point.');
      else if (target.boss) push('warning', `${m.key}.${m.enemyRef}`, where, `It summons the boss ${target.name}.`, 'Summon a regular foe; extra bosses also raise boss bars.');
    }
    if (m.holds && typeof v.every === 'number' && typeof v.duration === 'number' && v.duration >= v.every) {
      push('warning', `${m.key}.duration`, where, `It holds for ${v.duration}s every ${v.every}s, so it never walks.`, 'Make the hold shorter than the interval.');
    }
  }
  const holds = MECHANICS.filter((m) => m.holds && e[m.key] !== undefined);
  if (holds.length > 1) {
    push('warning', holds[1].key, 'Mechanics', `It has ${holds.map((m) => m.label).join(' and ')}: each runs on its own timer and their holds can overlap.`, 'Keep one held mechanic per foe unless you have test-played the mix.');
  }
  if (e.deathLine && !e.deathAnimation) push('warning', 'deathLine', 'Story', 'The death line only shows during a death animation.', 'Pick a death animation or remove the line.');
}

function validateEnemyStats(e: Partial<EnemyDef & BossMeta>, push: Push, required: boolean) {
  for (const f of ENEMY_STAT_FIELDS) checkNum(push, f, e[f.key as keyof EnemyDef], f.key, 'Stats', required && f.key !== 'mana');
  for (const f of ENEMY_DEFENCE_FIELDS) checkNum(push, f, e[f.key as keyof EnemyDef], f.key, 'Defences', false);
  if (e.speed === 0) push('warning', 'speed', 'Stats', 'Speed is 0: it never moves.', 'Give it a walking speed (a Footman walks 46 px/s).');
  if (e.dodgeChance === 1) push('warning', 'dodgeChance', 'Defences', 'It dodges every hit and can never be harmed.', 'Lower the dodge chance below 1.');
  if (e.physicalResist === 1 && e.magicResist === 1) push('warning', 'physicalResist', 'Defences', 'It resists all physical and magic damage.', 'Lower one of the resistances.');
  if (e.entrance !== undefined && e.entrance !== 'sewerBurst') push('error', 'entrance', 'Set piece', `Unknown entrance "${e.entrance}".`, 'Use "Sewer burst" or none.');
  if (e.deathAnimation !== undefined && e.deathAnimation !== 'shadowSwallow') push('error', 'deathAnimation', 'Story', `Unknown death animation "${e.deathAnimation}".`, 'Use "Shadow swallow" or none.');
}

function validateEnemy(e: EnemyDef, enemies: Map<string, EnemyDef>, push: Push) {
  checkKeys(push, e, ENEMY_KEYS, '', 'Foe');
  if (!e.id || !ID_PATTERN.test(e.id)) push('error', 'id', 'Identity', `Id "${e.id}" isn't valid.`, 'Use letters, digits, "_" or "-", starting with a letter (e.g. cas_grunt).');
  else if (/^boss\d+$/.test(e.id)) push('error', 'id', 'Identity', `"${e.id}" is reserved for bosses.`, 'Pick another id; bosses live in the boss list as boss<stage>.');
  if (!e.name?.trim()) push('error', 'name', 'Identity', 'The foe has no name.', 'Give it a name for the bestiary and tooltips.');
  if (e.boss) push('error', 'boss', 'Identity', 'A regular foe is flagged as a boss.', 'Bosses are authored in the boss list (they follow the boss stat curve).');
  checkColor(push, e.visual?.color, 'visual.color', 'Look', 'Colour');
  if (!e.visual?.icon) push('error', 'visual.icon', 'Look', 'The foe has no icon.', 'Pick an emoji; foes without a sprite are drawn as a tinted disc with it.');
  validateEnemyStats(e, push, true);
  if (e.unkillable) push('warning', 'unkillable', 'Set piece', 'A regular foe that can\'t die only leaves by reaching the castle.', 'Reserve "unkillable" for set-piece bosses with a halt cell.');
  validateMechanics(e, enemies, e.id, push);
}

function validateBoss(m: BossMeta, enemies: Map<string, EnemyDef>, push: Push) {
  checkKeys(push, m, BOSS_KEYS, '', 'Boss');
  if (!Number.isInteger(m.level) || m.level < 1 || m.level >= 1000) {
    push('error', 'level', 'Identity', `Stage number ${m.level} isn't valid.`, 'Use the whole-number id of the stage this boss belongs to (its id becomes boss<stage>).');
  }
  if (!m.name?.trim()) push('error', 'name', 'Identity', 'The boss has no name.', 'Give it a name for the boss bar and bestiary.');
  if (!m.icon) push('error', 'icon', 'Look', 'The boss has no icon.', 'Pick an emoji.');
  checkColor(push, m.color, 'color', 'Look', 'Colour');
  validateEnemyStats(m, push, false);
  validateMechanics(m, enemies, bossIdForLevel(m.level), push);
}

// -------------------------------------------------------------- champions

const roleOf = (u: UnitDef) => (u.generator ? 'generator' : u.bard ? 'bard' : 'combat');

function validateUpgrade(u: UnitDef, up: UpgradeDef, f: string, where: string, push: Push, nested: boolean) {
  checkKeys(push, up, UPGRADE_KEYS, `${f}.`, where);
  if (!up.name?.trim()) push('error', `${f}.name`, where, 'The upgrade has no name.', 'Name it; the name shows on the upgrade button.');
  if (typeof up.cost !== 'number' || !Number.isInteger(up.cost) || up.cost < 0) {
    push('error', `${f}.cost`, where, `Cost ${JSON.stringify(up.cost)} isn't valid.`, 'Use a whole number of gold, 0 or more.');
  }
  for (const fld of UPGRADE_FIELDS) checkNum(push, fld, up[fld.key as keyof UpgradeDef], `${f}.${fld.key}`, where, false);
  if (up.setAoe !== undefined && !AOE_CHOICES.some((a) => a.id === up.setAoe)) push('error', `${f}.setAoe`, where, `Unknown attack shape "${up.setAoe}".`, 'Pick single, line, cone or circle.');
  if (up.ability && !KNOWN_ABILITY_IDS.has(up.ability.id)) {
    push('error', `${f}.ability`, where, `Ability "${up.ability.id}" isn't one the engine can cast.`, `Use one of: ${[...KNOWN_ABILITY_IDS].join(', ')}.`);
  }
  const role = roleOf(u);
  if (up.generate && role !== 'generator') push('warning', `${f}.generate`, where, '+Gold/harvest does nothing: this champion doesn\'t harvest.', 'Remove it, or give the champion a harvest.');
  if ((up.bardTargets || up.bardSpeedBonus) && role !== 'bard') push('warning', `${f}.bardTargets`, where, 'Bard tune bonuses do nothing: this champion doesn\'t perform.', 'Remove them, or give the champion a tune.');
  if ((up.shatterCount || up.shatterReach) && !u.shatter) push('warning', `${f}.shatterCount`, where, 'Shatter bonuses do nothing: this champion\'s shots don\'t shatter.', 'Remove them, or give it Shatter.');
  if (up.bounces && u.visual.shape !== 'elf') push('warning', `${f}.bounces`, where, '+Bounces does nothing: only the Elf shape\'s shots bounce.', 'Use the Elf shape, or remove the bounce bonus.');
  if (up.choices) {
    if (nested) push('error', `${f}.choices`, where, 'A fork option can\'t be a fork itself.', 'Flatten it: forks are one level deep.');
    if (up.choices.length < 2) push('error', `${f}.choices`, where, `The fork has ${up.choices.length} option${up.choices.length === 1 ? '' : 's'}.`, 'A fork needs at least two options to choose between, or make it a plain tier.');
    const own = UPGRADE_FIELDS.some((fld) => up[fld.key as keyof UpgradeDef] !== undefined) || up.setAoe || up.ability;
    if (own) push('warning', `${f}`, where, 'This fork carries its own stat changes, which are ignored.', 'Move them into the options; only the chosen option applies.');
    up.choices.forEach((c, ci) => validateUpgrade(u, c, `${f}.choices.${ci}`, `${where} › Option ${ci + 1}`, push, true));
  }
}

/** A vial cycle (the Plague Doctor): each vial's look, effect and levels. */
function validateVials(u: UnitDef, push: Push) {
  const vials = u.vials!;
  if (!Array.isArray(vials)) {
    push('error', 'vials', 'Vials', 'The vial list isn\'t a list.', 'Remove it, or add vials with the editor.');
    return;
  }
  if (vials.length === 0) push('warning', 'vials', 'Vials', 'The vial cycle is empty, so it does nothing.', 'Add a vial, or turn the vial cycle off.');
  if (u.aoe !== 'single') push('warning', 'vials', 'Vials', 'Vials are only thrown by single-target champions; this attack shape ignores them.', 'Set the attack shape to single target.');
  if (u.shatter) push('warning', 'vials', 'Vials', 'A shattering ice missile is fired instead of the vials.', 'Remove Shatter, or the vials.');
  if (u.bleed || u.poison) push('warning', u.bleed ? 'bleed' : 'poison', 'Vials', 'Bleed / Poison on hit are ignored: each vial decides its own.', 'Remove them and set bleed or poison on a vial.');
  vials.forEach((v, vi) => {
    const f = `vials.${vi}`;
    const where = `Vials › ${v.name || `Vial ${vi + 1}`}`;
    checkKeys(push, v, VIAL_KEYS, `${f}.`, where);
    if (!v.name?.trim()) push('error', `${f}.name`, where, 'The vial has no name.', 'Name it; the name shows in the champion panel.');
    checkColor(push, v.color, `${f}.color`, where, 'Liquid colour');
    for (const fld of VIAL_EFFECT_FIELDS) checkNum(push, fld, v[fld.key as 'damageMult'], `${f}.${fld.key}`, where, fld.key === 'damageMult');
    if (v.ignoreResist !== undefined && typeof v.ignoreResist !== 'boolean') push('error', `${f}.ignoreResist`, where, 'Ignores resistance must be on or off.', 'Toggle it.');
    if (!Array.isArray(v.levels)) {
      push('error', `${f}.levels`, where, 'The level list is missing.', 'Add an empty level list.');
      return;
    }
    v.levels.forEach((l, li) => {
      const lf = `${f}.levels.${li}`;
      const lw = `${where} › Level ${li + 1}`;
      checkKeys(push, l, VIAL_LEVEL_KEYS, `${lf}.`, lw);
      if (typeof l.cost !== 'number' || !Number.isInteger(l.cost) || l.cost < 0) push('error', `${lf}.cost`, lw, `Cost ${JSON.stringify(l.cost)} isn't valid.`, 'Use a whole number of gold, 0 or more.');
      for (const fld of VIAL_EFFECT_FIELDS) checkNum(push, fld, l[fld.key as 'damageMult'], `${lf}.${fld.key}`, lw, false);
      if (VIAL_EFFECT_FIELDS.every((fld) => l[fld.key as 'damageMult'] === undefined)) push('warning', lf, lw, 'This level changes nothing.', 'Set the value it raises, or delete the level.');
    });
  });
}

function validateUnit(u: UnitDef, push: Push) {
  checkKeys(push, u, UNIT_KEYS, '', 'Champion');
  if (!u.id || !ID_PATTERN.test(u.id)) push('error', 'id', 'Identity', `Id "${u.id}" isn't valid.`, 'Use letters, digits, "_" or "-", starting with a letter.');
  else if (isHeroId(u.id) || u.id.startsWith('player-')) push('error', 'id', 'Identity', `"${u.id}" is reserved for the hero champions.`, 'Pick another id.');
  if (!u.name?.trim()) push('error', 'name', 'Identity', 'The champion has no name.', 'Give it a name.');
  if (!u.description?.trim()) push('warning', 'description', 'Identity', 'The champion has no description.', 'Describe it for cards and the journal.');
  if (!(RARITY_CHOICES as readonly string[]).includes(u.rarity)) {
    push('error', 'rarity', 'Identity', u.rarity === 'hero' ? 'Hero rarity is reserved for the player\'s adventurer (it levels from EXP and can\'t buy gold upgrades).' : `Unknown rarity "${u.rarity}".`, 'Pick common, rare, epic or legendary.');
  }
  if (!CHAMPION_SHAPES.some((s) => s.shape === u.visual?.shape)) {
    push('error', 'visual.shape', 'Look', `Shape "${u.visual?.shape}" can't be drawn for a catalog champion.`, `Pick one of: ${CHAMPION_SHAPES.map((s) => s.label).join(', ')}.`);
  }
  checkColor(push, u.visual?.color, 'visual.color', 'Look', 'Colour');
  if (!u.visual?.icon) push('error', 'visual.icon', 'Look', 'The champion has no icon.', 'Pick an emoji (used where no sprite fits).');
  for (const f of UNIT_COMBAT_FIELDS) checkNum(push, f, u[f.key as keyof UnitDef], f.key, 'Combat', true);
  for (const f of UNIT_COST_FIELDS) checkNum(push, f, u[f.key as keyof UnitDef], f.key, 'Cost & limits', f.key === 'cost' || f.key === 'deployLimit');
  for (const f of UNIT_SHAPE_FIELDS) checkNum(push, f, u[f.key as keyof UnitDef], f.key, 'Attack shape', false);
  if (!(TARGETING_CHOICES as readonly string[]).includes(u.targeting)) push('error', 'targeting', 'Combat', `Unknown targeting "${u.targeting}".`, 'Pick first, last, closest or strongest.');
  if (!AOE_CHOICES.some((a) => a.id === u.aoe)) push('error', 'aoe', 'Attack shape', `Unknown attack shape "${u.aoe}".`, 'Pick single, line, cone or circle.');
  if (u.attackType !== undefined && !['melee', 'ranged', 'support'].includes(u.attackType)) push('error', 'attackType', 'Combat', `Unknown attack type "${u.attackType}".`, 'Pick melee, ranged or support.');
  if (u.damageType !== undefined && !['physical', 'magic'].includes(u.damageType)) push('error', 'damageType', 'Combat', `Unknown damage type "${u.damageType}".`, 'Pick physical or magic.');
  const role = roleOf(u);
  if (u.generator) for (const f of GENERATOR_FIELDS) checkNum(push, f, u.generator[f.key as keyof typeof u.generator], `generator.${f.key}`, 'Special role', true);
  if (u.bard) for (const f of BARD_FIELDS) checkNum(push, f, u.bard[f.key as keyof typeof u.bard], `bard.${f.key}`, 'Special role', true);
  if (u.bleed) for (const f of BLEED_FIELDS) checkNum(push, f, u.bleed[f.key as keyof typeof u.bleed], `bleed.${f.key}`, 'Attack shape', true);
  if (u.poison) for (const f of POISON_FIELDS) checkNum(push, f, u.poison[f.key as keyof typeof u.poison], `poison.${f.key}`, 'Attack shape', true);
  if (u.shatter) for (const f of SHATTER_FIELDS) checkNum(push, f, u.shatter[f.key as keyof typeof u.shatter], `shatter.${f.key}`, 'Attack shape', true);
  if (u.vials !== undefined) validateVials(u, push);
  if (u.special) for (const f of SLOW_FIELDS) checkNum(push, f, u.special[f.key as keyof typeof u.special], `special.${f.key}`, 'Attack shape', true);
  if (u.generator && u.bard) push('warning', 'bard', 'Special role', 'It both harvests and performs.', 'Pick one special role; the engine runs both but cards describe one.');
  if (role === 'combat' && (u.damage <= 0 || u.attackSpeed <= 0 || u.range <= 0)) {
    push('error', 'damage', 'Combat', 'A fighting champion needs damage, attack speed and range above 0, or it never attacks.', 'Raise them, or give it a special role (harvest or tune).');
  }
  if (role === 'combat' && !u.damageType) push('warning', 'damageType', 'Combat', 'It has no damage type, so foe resistances never apply to it.', 'Pick physical or magic.');
  if ((u.bounces ?? 0) > 0 && u.visual?.shape !== 'elf') push('warning', 'bounces', 'Attack shape', 'Only the Elf shape\'s shots bounce.', 'Use the Elf shape, or set bounces to 0.');
  if (u.shatter && u.aoe !== 'single') push('warning', 'shatter', 'Attack shape', 'Shatter only applies to single-target shots.', 'Set the attack shape to single target.');
  if (u.aoe === 'circle' && !['archer', 'crossbow', 'wizard', 'elf'].includes(u.visual?.shape)) {
    push('info', 'aoe', 'Attack shape', 'Circle blasts are thrown as orbs; this shape has no throwing animation of its own.', 'Test-play to check how it reads.');
  }

  // Upgrades.
  if (!Array.isArray(u.upgrades)) {
    push('error', 'upgrades', 'Upgrades', 'The upgrade list is missing.', 'Add an empty upgrade list.');
    return;
  }
  u.upgrades.forEach((up, i) => validateUpgrade(u, up, `upgrades.${i}`, `Upgrades › Tier ${i + 1}`, push, false));
  // Every path through the forks must keep a fighting champion attacking.
  if (role === 'combat') {
    let speed = u.attackSpeed;
    u.upgrades.forEach((up, i) => {
      const options = up.choices ?? [up];
      const worst = Math.min(...options.map((o) => o.attackSpeed ?? 0));
      speed += worst;
      if (speed <= 0) push('error', `upgrades.${i}.attackSpeed`, `Upgrades › Tier ${i + 1}`, `By tier ${i + 1} attack speed falls to ${Math.round(speed * 100) / 100}.`, 'Keep attack speed above 0 at every tier.');
    });
  }
}

// ---------------------------------------------------------------- mastery

function validateTree(unitId: string, nodes: MasteryUpgradeDef[], unit: UnitDef | undefined, push: Push) {
  if (!unit) {
    push('error', undefined, 'Tree', `This tree belongs to "${unitId}", which isn't a champion.`, 'Delete the tree, or create the champion.');
  }
  const ids = new Map<string, number>();
  nodes.forEach((n, i) => {
    const N = `Node ${i + 1}${n.name ? ` · ${n.name}` : ''}`;
    const f = `nodes.${i}`;
    checkKeys(push, n, MASTERY_KEYS, `${f}.`, N);
    if (!n.id || !ID_PATTERN.test(n.id)) push('error', `${f}.id`, N, `Node id "${n.id}" isn't valid.`, 'Use letters, digits, "_" or "-", starting with a letter.');
    else if (ids.has(n.id)) push('error', `${f}.id`, N, `Node id "${n.id}" is used twice in this tree.`, 'Give every node its own id: saves store learned nodes by id.');
    ids.set(n.id, i);
    if (!n.name?.trim()) push('error', `${f}.name`, N, 'The node has no name.', 'Name it.');
    if (!n.description?.trim()) push('warning', `${f}.description`, N, 'The node has no description.', 'Describe what it does.');
    if (typeof n.cost !== 'number' || !Number.isInteger(n.cost) || n.cost < 0) push('error', `${f}.cost`, N, `EXP cost ${JSON.stringify(n.cost)} isn't valid.`, 'Use a whole number, 0 or more.');
    let effects = 0;
    for (const e of EFFECT_FIELDS) {
      const v = n[e.key as keyof MasteryUpgradeDef];
      if (v === undefined) continue;
      effects++;
      const where = `${N} › ${e.label}`;
      if (e.kind === 'bool') {
        if (typeof v !== 'boolean') push('error', `${f}.${e.key}`, where, `${e.label} must be on or off.`, 'Toggle it.');
      } else if (e.kind === 'form') {
        const owner = FORM_OWNER[v as string];
        if (!owner) push('error', `${f}.${e.key}`, where, `Unknown weapon form "${String(v)}".`, 'Pick claymore, longbow or staff.');
        else if (owner !== unitId) push('error', `${f}.${e.key}`, where, `The ${String(v)} form belongs to ${owner}, not ${unitId}.`, `Move the node to ${owner}'s tree, or pick that hero's own form.`);
      } else if (e.kind === 'discount') {
        const d = v as { tier: number; amount: number };
        const tiers = unit?.upgrades.length ?? 0;
        if (!Number.isInteger(d?.tier) || d.tier < 1 || d.tier > tiers) push('error', `${f}.${e.key}`, where, `Discount tier ${d?.tier} doesn't exist.`, `Pick an in-stage upgrade tier from 1 to ${tiers}.`);
        if (!Number.isInteger(d?.amount) || d.amount < 0) push('error', `${f}.${e.key}`, where, `Discount amount ${d?.amount} isn't valid.`, 'Use a whole number of gold, 0 or more.');
      } else {
        checkNum(push, { ...e, kind: e.kind }, v, `${f}.${e.key}`, where, true);
      }
      if (unit && e.appliesTo && !effectApplies(e.appliesTo, unit, unitId)) {
        push('warning', `${f}.${e.key}`, where, `${e.label} does nothing for ${unit.name}.`, appliesHint(e.appliesTo));
      }
    }
    if (n.throwRangeMult !== undefined && n.throwEvery === undefined) push('warning', `${f}.throwRangeMult`, N, 'Throw range is set but no throw cadence.', 'Set "Throw every" too.');
    if (n.crossSlashMult !== undefined && n.crossSlashEvery === undefined) push('warning', `${f}.crossSlashMult`, N, 'Cross Slash damage is set but no cadence.', 'Set "Cross Slash every" too.');
    if ((n.brittleMult === undefined) !== (n.brittleDuration === undefined)) push('warning', `${f}.brittleMult`, N, 'Brittle needs both a damage multiplier and a duration.', 'Set both, or clear both.');
    if (n.vialPotencyVial !== undefined && n.vialPotency === undefined) push('warning', `${f}.vialPotencyVial`, N, 'A potency vial is picked but no potency.', 'Set "Vial potency" too.');
    if (n.vialPotencyVial !== undefined && unit?.vials && n.vialPotencyVial > unit.vials.length) push('error', `${f}.vialPotencyVial`, N, `Vial ${n.vialPotencyVial} doesn't exist.`, `Pick a vial from 1 to ${unit.vials.length}.`);
    if ((n.resistHasteMult === undefined) !== (n.resistHasteDuration === undefined)) push('warning', `${f}.resistHasteMult`, N, 'Resist haste needs both a multiplier and a duration.', 'Set both, or clear both.');
    if (effects === 0) push('warning', `${f}`, N, 'The node has no effect.', 'Add an effect in its Effects section, or remove the node.');
  });

  // Prerequisites: they must exist, and must not loop.
  const reqsOf = (n: MasteryUpgradeDef): string[] => (n.requires == null ? [] : typeof n.requires === 'string' ? [n.requires] : n.requires);
  nodes.forEach((n, i) => {
    if (n.requires === undefined) return;
    const N = `Node ${i + 1}${n.name ? ` · ${n.name}` : ''}`;
    if (Array.isArray(n.requires)) {
      if (n.requires.length < 2 || n.requires.some((r) => typeof r !== 'string')) push('error', `nodes.${i}.requires`, N, 'A list of prerequisites needs two or more node ids.', 'Use a single id for one prerequisite.');
      if (new Set(n.requires).size !== n.requires.length) push('warning', `nodes.${i}.requires`, N, 'A prerequisite is listed twice.', 'Remove the duplicate.');
    } else if (typeof n.requires !== 'string') {
      push('error', `nodes.${i}.requires`, N, `Prerequisite ${JSON.stringify(n.requires)} isn't a node id.`, 'Pick a node from this tree, or none.');
      return;
    }
    for (const r of reqsOf(n)) {
      if (r === n.id) push('error', `nodes.${i}.requires`, N, 'The node requires itself.', 'Pick another prerequisite, or none.');
      else if (!ids.has(r)) push('error', `nodes.${i}.requires`, N, `Prerequisite "${r}" isn't in this tree.`, 'Pick a node from this tree, or none.');
    }
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // A loop only traps a node when every route up from it loops back.
  const reachesRoot = new Map<string, boolean>();
  const grounded = (n: MasteryUpgradeDef, seen: Set<string>): boolean => {
    if (reachesRoot.has(n.id)) return reachesRoot.get(n.id)!;
    const ps = reqsOf(n);
    const ok = ps.length === 0 || ps.some((r) => {
      const p = byId.get(r);
      return !p || (!seen.has(p.id) && grounded(p, new Set([...seen, p.id])));
    });
    if (seen.size === 1) reachesRoot.set(n.id, ok);
    return ok;
  };
  nodes.forEach((n, i) => {
    if (!grounded(n, new Set([n.id]))) {
      push('error', `nodes.${i}.requires`, `Node ${i + 1}${n.name ? ` · ${n.name}` : ''}`, 'Its prerequisites loop back on themselves, so it can never be learned.', 'Break the loop: one node in the chain must have no prerequisite or point outside it.');
    }
  });

  // Exclusive groups.
  const groups = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    if (n.exclusiveGroup === undefined) return;
    if (!n.exclusiveGroup.trim()) push('error', `nodes.${i}.exclusiveGroup`, `Node ${i + 1}`, 'The exclusive group name is blank.', 'Name the group, or clear it.');
    groups.set(n.exclusiveGroup, [...(groups.get(n.exclusiveGroup) ?? []), i]);
  });
  for (const [g, members] of groups) {
    if (members.length < 2) {
      push('warning', `nodes.${members[0]}.exclusiveGroup`, `Node ${members[0] + 1}`, `Exclusive group "${g}" has only one node, so it excludes nothing.`, 'Add a rival node to the group, or clear the group.');
    }
    for (const i of members) {
      if (reqsOf(nodes[i]).some((req) => nodes[ids.get(req) ?? -1]?.exclusiveGroup === g)) {
        push('warning', `nodes.${i}.requires`, `Node ${i + 1}`, `It requires a rival in its own exclusive group "${g}": the two can't be active together.`, 'Require a node outside the group (usually the shared parent).');
      }
    }
  }
}

function effectApplies(kind: NonNullable<(typeof EFFECT_FIELDS)[number]['appliesTo']>, u: UnitDef, unitId: string): boolean {
  switch (kind) {
    case 'generator':
      return !!u.generator;
    case 'bard':
      return !!u.bard;
    case 'bounce':
      return u.visual.shape === 'elf';
    case 'burst':
      return (u.burst ?? 1) > 1;
    case 'circle':
      return u.aoe === 'circle';
    case 'hero':
      return isHeroId(unitId);
    case 'blade':
      return unitId === 'player-blade';
    case 'combat':
      return !u.generator && !u.bard;
    case 'chill':
      return !!u.special?.slow;
    case 'shatter':
      return !!u.shatter;
    case 'bleed':
      return !!u.bleed;
    case 'vials':
      return !!u.vials?.length;
  }
}

function appliesHint(kind: string): string {
  const hints: Record<string, string> = {
    generator: 'Only gold-harvesting champions (like the Farmer) use it.',
    bard: 'Only performing champions (like the Bard) use it.',
    bounce: 'Only the Elf shape\'s bouncing shots use it.',
    burst: 'Only burst shooters (volleys of several shots) use it.',
    circle: 'Only circle-blast attacks (the Magic hero\'s orb) use it.',
    hero: 'Only the player\'s hero champions use it.',
    blade: 'Only the Blade hero uses it.',
    combat: 'Support and economy champions don\'t attack.',
    chill: 'Only champions whose hits slow (like the Frost Witch) use it.',
    shatter: 'Only shattering ice missiles (the Frost Witch) use it.',
    bleed: 'Only champions whose hits bleed (like the Bandit) use it.',
    vials: 'Only vial throwers (the Plague Doctor) use it.',
  };
  return `${hints[kind] ?? ''} Remove it, or move the node to a champion that uses it.`.trim();
}

// ---------------------------------------------------------------- project

/** Validate a whole project. Pure; memoised per project object. */
export function validateProject(project: ContentProject): Issue[] {
  const cached = memo.get(project);
  if (cached) return cached;
  const issues: Issue[] = [];
  const pusher =
    (entity: EntityKey | 'project'): Push =>
    (severity, field, where, message, fix) =>
      issues.push({ severity, entity, field, where, message, fix });

  const enemies = new Map<string, EnemyDef>();
  // Same lookup the game builds (regulars + curve-built bosses).
  for (const [id, def] of Object.entries(catalogFor(project))) enemies.set(id, def);

  // Duplicate ids across collections.
  dupes(project.levels.map((l) => l.id), (id) => pusher(levelKey(id))('error', 'id', 'General', `Stage id ${id} is used by more than one stage.`, 'Give each stage its own id; progress, bosses and keyed tables use it.'));
  const enemyIds = [...project.enemies.map((e) => e.id), ...bossEnemyIds(project)];
  dupes(enemyIds, (id) => {
    const boss = /^boss(\d+)$/.exec(id);
    const key = boss && project.bosses.some((b) => b.level === Number(boss[1])) ? bossKey(Number(boss[1])) : enemyKey(id);
    pusher(key)('error', boss ? 'level' : 'id', 'Identity', `Enemy id "${id}" is used more than once.`, 'Give each foe and boss its own id.');
  });
  dupes(project.units.map((u) => u.id), (id) => pusher(unitKey(id))('error', 'id', 'Identity', `Champion id "${id}" is used more than once.`, 'Give each champion its own id.'));

  for (const l of project.levels) validateLevel(l, enemies, pusher(levelKey(l.id)));
  for (const e of project.enemies) validateEnemy(e, enemies, pusher(enemyKey(e.id)));
  for (const b of project.bosses) validateBoss(b, enemies, pusher(bossKey(b.level)));
  for (const u of project.units) validateUnit(u, pusher(unitKey(u.id)));
  const units = new Map<string, UnitDef>([...heroBaseDefs().map((u) => [u.id, u] as const), ...project.units.map((u) => [u.id, u] as const)]);
  for (const [unitId, nodes] of Object.entries(project.mastery)) validateTree(unitId, nodes, units.get(unitId), pusher(masteryKey(unitId)));

  // Campaign order: stage N opens once stage N-1 is cleared.
  const active = project.levels.filter((l) => !l.archived);
  const activeIds = new Set(active.map((l) => l.id));
  for (const l of active) {
    if (l.id > 1 && !activeIds.has(l.id - 1)) {
      pusher(levelKey(l.id))('error', 'id', 'Campaign order', `Stage ${l.id} can never unlock: the game opens stage N when stage N-1 is cleared, and there is no active stage ${l.id - 1}.`, `Renumber it to follow an active stage, or restore stage ${l.id - 1}.`);
    }
  }
  for (const s of SECTION_IDS) {
    const inSection = active.filter((l) => l.section === s);
    for (let i = 1; i < inSection.length; i++) {
      if (inSection[i].id < inSection[i - 1].id) {
        pusher(levelKey(inSection[i].id))('warning', 'order', 'Campaign order', `Stage ${inSection[i].id} is listed after stage ${inSection[i - 1].id} in its chapter but unlocks before it.`, 'Reorder the chapter so ids increase, or renumber the stages.');
      }
    }
  }

  // Ids the game's code or the (read-only) endless pools depend on.
  const unitIds = new Set(project.units.map((u) => u.id));
  for (const [id, place] of Object.entries(CODE_REFERENCES)) {
    if (!enemies.has(id) && !unitIds.has(id)) {
      pusher('project')('error', undefined, 'Required content', `"${id}" is missing, but ${place} uses it by id.`, `Restore it (reset it to shipped, or re-create "${id}").`);
    }
  }
  for (const l of ENDLESS_LEVELS) {
    for (const f of l.endless?.foes ?? []) {
      if (!enemies.has(f.enemyId)) {
        pusher('project')('error', undefined, 'Required content', `Endless mode "${l.name}" fields "${f.enemyId}", which is missing.`, `Restore "${f.enemyId}" — endless pools live in domain/endless.ts and aren't edited here.`);
      }
    }
  }

  // Unused content (informational).
  const used = new Set<string>();
  for (const l of project.levels) {
    used.add(l.bossId);
    for (const id of enemyIdsUsedBy(l)) used.add(id);
  }
  for (const e of [...project.enemies]) if (e.summon) used.add(e.summon.enemyId);
  for (const b of project.bosses) if (b.summon) used.add(b.summon.enemyId);
  for (const l of ENDLESS_LEVELS) for (const f of l.endless?.foes ?? []) used.add(f.enemyId);
  for (const e of project.enemies) {
    if (!used.has(e.id)) pusher(enemyKey(e.id))('info', undefined, 'Usage', `${e.name || e.id} isn't used by any stage.`, 'Add it to a wave, or leave it for endless mode / later.');
  }

  memo.set(project, issues);
  return issues;
}

const memo = new WeakMap<ContentProject, Issue[]>();

function dupes<T>(values: T[], report: (v: T) => void) {
  const seen = new Map<T, number>();
  for (const v of values) seen.set(v, (seen.get(v) ?? 0) + 1);
  for (const [v, n] of seen) if (n > 1) report(v);
}

/** Counts of each severity. */
export function countIssues(issues: readonly Issue[]) {
  let error = 0;
  let warning = 0;
  let info = 0;
  for (const i of issues) {
    if (i.severity === 'error') error++;
    else if (i.severity === 'warning') warning++;
    else info++;
  }
  return { error, warning, info };
}

/** Issues of one entity, optionally under a field path prefix. */
export function issuesAt(issues: readonly Issue[], entity: EntityKey, field?: string): Issue[] {
  return issues.filter(
    (i) => i.entity === entity && (field === undefined || i.field === field || (i.field?.startsWith(`${field}.`) ?? false)),
  );
}

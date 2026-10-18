/**
 * Self-checks run by `npm run editor:check` (bundled for Node by
 * `scripts/check.mjs`). They prove the editor's model and source export
 * against the real catalogs:
 *  1. the shipped content loads and validates with no errors;
 *  2. exporting the untouched content reproduces every catalog file byte for byte;
 *  3. a scripted set of edits exports to files that, compiled back, load as
 *     exactly the edited project (the runner does the compile-and-reload).
 */

import { loadShippedProject } from '../model/shipped';
import { canonicalJson, clone } from '../model/util';
import { countIssues, validateProject } from '../validation/validate';
import { buildSourceExport, type SourceFile } from '../export/sourceExport';
import { SHIPPED_SOURCES } from '../export/sources';
import { CHAMPION_SHAPES } from '../model/catalog';
import { buildPack, parsePack, applyPack } from '../content/pack';
import type { ContentProject } from '../model/types';

export function shippedReport() {
  const shipped = loadShippedProject();
  const issues = validateProject(shipped);
  const counts = countIssues(issues);
  // Force every file through the patcher (a no-op edit) to prove identity.
  const files = buildSourceExport(shipped, shipped, SHIPPED_SOURCES, true);
  return {
    counts,
    errors: issues.filter((i) => i.severity === 'error').map((i) => `${i.entity} › ${i.where}: ${i.message}`),
    warnings: issues.filter((i) => i.severity === 'warning').map((i) => `${i.entity} › ${i.where}: ${i.message}`),
    unchanged: files.every((f) => !f.changed),
    shapes: CHAMPION_SHAPES.map((s) => s.shape),
  };
}

/** A deterministic batch of edits touching every catalog and edit kind. */
export function scriptedEdits(base: ContentProject): ContentProject {
  const p = clone(base);
  // Levels: tweak a group, add a wave and a lane prop, add a new stage, reorder a chapter.
  const l1 = p.levels.find((l) => l.id === 1)!;
  l1.lanes[0].waves[0].groups[0].count = 9;
  l1.lanes[0].waves.splice(2, 0, { groups: [{ enemyId: 'cas_runner', count: 4, spacing: 0.4 }] });
  l1.startingGold = 650;
  l1.decor!.push({ kind: 'barrel', col: 0, row: 4 });
  const l7 = p.levels.find((l) => l.id === 7)!;
  l7.lanes[0].waves[6].groups[1].delay = 4;
  l7.mist = true;
  const newLevel = clone(p.levels.find((l) => l.id === 10)!);
  newLevel.id = 11;
  newLevel.name = 'The Long Road';
  newLevel.subtitle = 'A check stage — "quotes" and an apostrophe\'s test.';
  newLevel.bossId = 'boss11';
  newLevel.ending = undefined;
  delete newLevel.ending;
  newLevel.lanes = [newLevel.lanes[0]];
  newLevel.lanes[0].waves[6] = { groups: [{ enemyId: 'boss11', count: 1, delay: 2 }] };
  p.levels.push(newLevel);
  // Enemies: edit a stat, add a mechanic, add a foe, edit and add bosses.
  const grunt = p.enemies.find((e) => e.id === 'cas_grunt')!;
  grunt.health = 75;
  grunt.dodgeChance = 0.05;
  p.enemies.push({ id: 'cap_scout', name: 'Scout', health: 90, speed: 70, reward: 3, mana: 1, damageToBase: 1, visual: { color: '#a0b0c0', icon: '🏃' }, boss: false, radius: 12 });
  const b1 = p.bosses.find((b) => b.level === 1)!;
  b1.health = 450;
  delete b1.radius;
  p.bosses.push({ level: 11, name: 'The Road Warden', icon: '🛡️', color: '#8a7a6a', health: 3000, heal: { every: 8, duration: 1.5, at: 0.5, radius: 120, amount: 0.2 } });
  // Champions: edit an upgrade, add a tier, add a champion.
  const archer = p.units.find((u) => u.id === 'archer')!;
  archer.upgrades[0].damage = 9;
  archer.upgrades.push({ name: 'Volley Drill', description: 'Faster hands.', cost: 120, attackSpeed: 0.2 });
  const witch = p.units.find((u) => u.id === 'frostWitch')!;
  witch.upgrades[2].choices![1].iceStorm = 0.2;
  // Vials: retune a level, add a level, add an effect to a vial.
  const doctor = p.units.find((u) => u.id === 'plague_doctor')!;
  doctor.vials![0].levels[0].poison = 0.06;
  doctor.vials![1].levels.push({ cost: 120, damageMult: 4 });
  doctor.vials![2].poison = 0.01;
  const knight = clone(p.units.find((u) => u.id === 'swordsman')!);
  knight.id = 'knight';
  knight.name = 'Knight';
  knight.rarity = 'rare';
  knight.damage = 26;
  p.units.splice(3, 0, knight);
  // Mastery: edit a node, add a node, give the new champion a tree, reorder a tree.
  p.mastery.archer[0].cost = 120;
  p.mastery.archer.push({ id: 'steady_hands', name: 'Steady Hands', description: '+5% attack speed.', cost: 150, requires: 'deadly_precision', attackSpeedMult: 1.05 });
  p.mastery.knight = [{ id: 'oath', name: 'Oath', description: '+10% damage.', cost: 100, damageMult: 1.1 }];
  const crossbow = p.mastery.crossbow;
  p.mastery.crossbow = [crossbow[1], crossbow[0], crossbow[2]];
  // Remove a foe nothing uses.
  p.enemies = p.enemies.filter((e) => e.id !== 'inn_brute');
  return p;
}

export function exportFor(project: ContentProject): SourceFile[] {
  return buildSourceExport(loadShippedProject(), project, SHIPPED_SOURCES);
}

export const projectJson = (p: ContentProject) => canonicalJson(p);
export const shippedProject = () => loadShippedProject();
export const loadedProjectJson = () => canonicalJson(loadShippedProject());

/** Content-pack round trip: full and changes-only packs restore the project. */
export function packRoundTrip(project: ContentProject): boolean {
  const shipped = loadShippedProject();
  const full = applyPack(parsePack(JSON.stringify(buildPack(project, shipped, 'backup', 'full'))).pack, shipped);
  const delta = applyPack(parsePack(JSON.stringify(buildPack(project, shipped, 'backup', 'changes'))).pack, shipped);
  return canonicalJson(full) === canonicalJson(project) && canonicalJson(delta) === canonicalJson(project);
}

export function validationCounts(p: ContentProject) {
  const issues = validateProject(p);
  return { ...countIssues(issues), errors: issues.filter((i) => i.severity === 'error').map((i) => `${i.entity} › ${i.where}: ${i.message}`) };
}

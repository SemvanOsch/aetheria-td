import { hasResistance, REGULAR_ENEMIES, type EnemyDef } from '../domain/enemies';
import { getLevel } from '../domain/levels';

/**
 * A foe's written-up entry text, shared by the journal's Bestiary and the
 * in-battle field note so the two never drift.
 */

/** Coarse speed descriptor for an entry. */
function speedLabel(speed: number): string {
  if (speed >= 85) return 'fast';
  if (speed >= 40) return 'medium';
  return 'slow';
}

/** The stage a boss guards, from its `boss<levelId>` id. */
function bossLair(def: EnemyDef): string | null {
  const id = Number(def.id.replace(/^boss/, ''));
  return Number.isFinite(id) ? getLevel(id)?.name ?? null : null;
}

/** A foe's entry heading: its specimen number, or the stage a boss guards. */
export function foeKicker(def: EnemyDef): string {
  if (def.boss) {
    const lair = bossLair(def);
    return lair ? `Boss of ${lair}` : 'Boss';
  }
  return `Specimen No. ${String(REGULAR_ENEMIES.findIndex((e) => e.id === def.id) + 1).padStart(2, '0')}`;
}

/** The italic line under a foe's name. */
export function foeTraits(def: EnemyDef): string {
  return `${def.boss ? 'Boss' : 'Foe'}${hasResistance(def) ? ' · Resistant' : ' · Takes full damage'}`;
}

/** A foe's ledger of numbers, shared by the bestiary and the in-battle field note. */
export function foeLedgerRows(def: EnemyDef, kills: number): { label: string; value: string }[] {
  return [
    { label: 'Health', value: `${def.health.toLocaleString()} HP` },
    { label: 'Speed', value: `${def.speed} · ${speedLabel(def.speed)}` },
    // Bosses omit castle damage (breaking through is an instant loss).
    ...(def.boss ? [] : [{ label: 'Castle damage', value: `${def.damageToBase}` }]),
    // Mana a hero recovers for the killing blow.
    ...(def.mana ? [{ label: 'Mana granted', value: `${def.mana}` }] : []),
    ...(def.shieldHits ? [{ label: 'Shield', value: `blocks ${def.shieldHits} hits` }] : []),
    ...(def.unkillable ? [{ label: 'Unkillable', value: 'never falls below 1 HP' }] : []),
    ...(def.regen ?[{ label: 'Regeneration', value: `${+(def.regen * 100).toFixed(1)}% HP/s` }] : []),
    ...(def.dodgeChance ?[{ label: 'Evasion', value: `${Math.round(def.dodgeChance * 100)}% dodge` }] : []),
    ...((def.physicalResist ?? 0) > 0
      ? [{ label: 'Physical resist', value: `−${Math.round((def.physicalResist ?? 0) * 100)}%` }]
      : []),
    ...((def.magicResist ?? 0) > 0 ? [{ label: 'Magic resist', value: `−${Math.round((def.magicResist ?? 0) * 100)}%` }] : []),
    ...(def.boss ? [] : [{ label: 'Slain', value: kills.toLocaleString() }]),
  ];
}

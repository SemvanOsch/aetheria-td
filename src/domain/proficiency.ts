// ============================================================================
//  Adventurer proficiency
// ----------------------------------------------------------------------------
//  The martial discipline the player picks during character creation. Purely
//  identity for now (stored on the PlayerProfile); add mechanical effects later
//  by reading `state.player.proficiency`.
// ============================================================================

export type Proficiency = 'sword' | 'bow' | 'magic';

export interface ProficiencyDef {
  id: Proficiency;
  /** Short display name. */
  label: string;
  /** Emblem shown on the crest. */
  icon: string;
  /** One-line flavour shown under the choice. */
  blurb: string;
}

export const PROFICIENCIES: ProficiencyDef[] = [
  { id: 'sword', label: 'Blade', icon: '⚔️', blurb: 'Steel and steadfast courage.' },
  { id: 'bow', label: 'Bow', icon: '🏹', blurb: 'Swift arrows from afar.' },
  { id: 'magic', label: 'Magic', icon: '✨', blurb: 'The arcane arts unbound.' },
];

export const DEFAULT_PROFICIENCY: Proficiency = 'sword';

/** Coerce any stored value into a valid proficiency, defaulting when unknown. */
export function normalizeProficiency(raw: unknown): Proficiency {
  return PROFICIENCIES.some((p) => p.id === raw) ? (raw as Proficiency) : DEFAULT_PROFICIENCY;
}

export function proficiencyDef(id: Proficiency): ProficiencyDef {
  return PROFICIENCIES.find((p) => p.id === id) ?? PROFICIENCIES[0];
}

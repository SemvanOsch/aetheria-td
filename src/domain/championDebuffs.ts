/**
 * Debuffs foes lay on champions. Every one is a *disabling effect*, and every
 * one reaches a champion through the engine's single choke point
 * (`GameEngine.disableTower`), where the resistances apply: immunity
 * (`MasteryUpgradeDef.disableImmune`, the Plague Doctor's Self Inoculation),
 * the resist chance an ally's aura grants (`disableResistAura`, Warding Fumes)
 * and the haste a resist brings (`resistHasteMult`, Toxic Resilience). A new
 * champion debuff is listed here and applied through that choke point, and all
 * of them cover it from the start.
 */

export type ChampionDebuffId = 'sludged';

export interface ChampionDebuffDef {
  id: ChampionDebuffId;
  name: string;
  description: string;
  /** Accent for its floaters and tells. */
  color: string;
}

export const CHAMPION_DEBUFFS: Record<ChampionDebuffId, ChampionDebuffDef> = {
  sludged: {
    id: 'sludged',
    name: 'Sludged',
    description: "Stuck fast in the Sludge Father's spit: it can't attack, harvest, play or cast until it wears off.",
    color: '#b8e05a',
  },
};

/**
 * Rarity system.
 *
 * The full ladder is defined up front so new rarities can be added later by
 * simply flipping `available` to true and authoring units for them — no engine
 * or UI changes required. For the MVP only `common` is available.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface RarityDef {
  id: Rarity;
  name: string;
  /** Summon drop weight (probability = weight / sum of available weights). */
  weight: number;
  /** Whether units of this rarity currently exist / can drop. */
  available: boolean;
  /** Accent color used across cards, borders and glows. */
  color: string;
  /** Ordering used for sorting collections (higher = rarer). */
  order: number;
  /** Mastery EXP granted to the champion when a summon is a duplicate. */
  duplicateExp: number;
}

export const RARITIES: Record<Rarity, RarityDef> = {
  common: {
    id: 'common',
    name: 'Common',
    weight: 80,
    available: true,
    color: '#9fb2c8',
    order: 0,
    duplicateExp: 20,
  },
  rare: {
    id: 'rare',
    name: 'Rare',
    weight: 20,
    available: true,
    color: '#4aa3ff',
    order: 1,
    duplicateExp: 30,
  },
  epic: {
    id: 'epic',
    name: 'Epic',
    weight: 4,
    available: false,
    color: '#b455ff',
    order: 2,
    duplicateExp: 45,
  },
  legendary: {
    id: 'legendary',
    name: 'Legendary',
    weight: 1,
    available: false,
    color: '#ffb020',
    order: 3,
    duplicateExp: 60,
  },
};

export const ALL_RARITIES: RarityDef[] = Object.values(RARITIES).sort(
  (a, b) => a.order - b.order,
);

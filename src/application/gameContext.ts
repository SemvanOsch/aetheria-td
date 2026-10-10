/**
 * Game store context + hook.
 *
 * Kept in its own module (no React components) so React Fast Refresh keeps a
 * stable context identity across hot reloads of the provider — otherwise
 * editing the provider mid-session breaks `useGame` with a
 * "must be used within a GameProvider" error.
 */

import { createContext, useContext } from 'react';
import type { AudioSettings, GameState, UiPrefs } from './gameState';
import type { PlayerSpriteConfig } from '../domain/playerSprite';
import type { Proficiency } from '../domain/proficiency';
import type { SectionId } from '../domain/levels';
import type { ArmorRoll, ArmorSlot } from '../domain/armor';
import type { SummonOutcome } from './summon';

export interface GameStore {
  state: GameState;
  /** Grant a summoned unit if enough gems; returns the outcome or null. */
  summon: () => SummonOutcome | null;
  /** Mark a level complete and pay its gem reward (first time only). */
  completeLevel: (levelId: number, gemReward: number) => void;
  /** Record a finished endless run's waves cleared (keeps the chapter's best). */
  recordEndlessRun: (section: SectionId, wavesCleared: number) => void;
  /** Bank mastery EXP earned in a stage (unit id → EXP), win or lose. */
  awardMastery: (gains: Record<string, number>) => void;
  /** Bank enemy kills earned in a stage (enemy id → count), for the Enemy Index. */
  awardEnemyKills: (gains: Record<string, number>) => void;
  /** Developer tool: wipe all enemy kills (relocks the Enemy Index, re-arms field notes). */
  resetEnemyKills: () => void;
  /** Spend a champion's EXP to learn a permanent skill-tree upgrade. */
  buyMasteryUpgrade: (unitId: string, upgradeId: string) => void;
  /** Choose which learned member of an exclusive skill-tree group is active. */
  setActiveMasteryUpgrade: (unitId: string, upgradeId: string) => void;
  /** Toggle a champion's whole mastery on or off (purchases are kept). */
  setMasteryDisabled: (unitId: string, disabled: boolean) => void;
  /** Add/remove an owned champion from the deployable team (capped at 6). */
  toggleTeamMember: (unitId: string) => void;
  /** Reorder the team by moving the member at `from` to index `to`. */
  reorderTeam: (from: number, to: number) => void;
  /** Drop a roster champion into team slot `index` (replacing that member, or joining an empty slot). */
  placeInTeam: (unitId: string, index: number) => void;
  /** Merge a patch into the persisted UI preferences. */
  setPrefs: (patch: Partial<UiPrefs>) => void;
  /** Merge a patch into the persisted volume settings. */
  setAudioSettings: (patch: Partial<AudioSettings>) => void;
  /**
   * Save the player's adventurer (name + sprite + proficiency), completing the
   * first-launch journal introduction. No-op on an invalid/empty name.
   */
  setPlayerProfile: (name: string, sprite: PlayerSpriteConfig, proficiency: Proficiency) => void;
  /** Developer tool: switch the player champion to another class (path). */
  setPlayerChampionClass: (proficiency: Proficiency) => void;
  /** Mark a journal chapter's lore as read, so its reveal only plays once ever. */
  markChapterRead: (index: number) => void;
  /** Bank rolled armor pieces (endless-boss drops, the developer forge). */
  awardArmor: (rolls: ArmorRoll[]) => void;
  /** Wear an owned armor piece (by id) in its slot. */
  equipArmor: (id: string) => void;
  /** Take off the armor piece in a slot. */
  unequipArmor: (slot: ArmorSlot) => void;
  /** Break down armor pieces (by id) for gems; worn pieces are skipped. */
  salvageArmor: (ids: string[]) => void;
  /** Wipe all progression back to a fresh account. */
  resetAccount: () => void;
  /** Add gems (the settings grant button; endless boss-wave payouts). */
  grantGems: (amount: number) => void;
  summonCost: number;
}

export const GameContext = createContext<GameStore | null>(null);

export function useGame(): GameStore {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a GameProvider');
  return ctx;
}

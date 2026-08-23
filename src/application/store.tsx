/**
 * React binding for the game state.
 *
 * Holds the single `GameState` in React state, persists every change, and
 * exposes intent-style actions to the UI. Components read state and call
 * actions — they never touch storage or domain rules directly.
 *
 * The context object + `useGame` hook live in `./gameContext` so this file
 * exports only the provider component (keeps Fast Refresh stable).
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  addEnemyKills,
  addGems,
  addMastery,
  addUnit,
  buyMasteryUpgrade as buyMasteryUpgradeTx,
  createInitialState,
  loadState,
  markLevelComplete,
  saveState,
  setActiveMasteryUpgrade as setActiveMasteryUpgradeTx,
  setMasteryDisabled as setMasteryDisabledTx,
  toggleTeamMember as toggleTeamMemberTx,
  type GameState,
} from './gameState';
import {
  canAffordSummon,
  DUPLICATE_REFUND,
  rollSummon,
  SUMMON_COST,
  type SummonOutcome,
} from './summon';
import { GameContext, type GameStore } from './gameContext';

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(() => loadState());
  // Keep a ref in sync so actions can read the latest state without stale
  // closures, and persist on every update in one place.
  const stateRef = useRef(state);

  const commit = useCallback((next: GameState) => {
    stateRef.current = next;
    saveState(next);
    setState(next);
  }, []);

  const summon = useCallback((): SummonOutcome | null => {
    const current = stateRef.current;
    if (!canAffordSummon(current.gems)) return null;
    const outcome = rollSummon(current.ownedUnits);
    // Pay the cost; refund a portion if it's a duplicate the player owns.
    let next = addGems(current, -SUMMON_COST);
    if (outcome.duplicate) {
      next = addGems(next, Math.round(SUMMON_COST * DUPLICATE_REFUND));
    }
    next = addUnit(next, outcome.unit.id);
    commit(next);
    return outcome;
  }, [commit]);

  const completeLevel = useCallback(
    (levelId: number, gemReward: number) => {
      commit(markLevelComplete(stateRef.current, levelId, gemReward));
    },
    [commit],
  );

  const awardMastery = useCallback(
    (gains: Record<string, number>) => {
      commit(addMastery(stateRef.current, gains));
    },
    [commit],
  );

  const awardEnemyKills = useCallback(
    (gains: Record<string, number>) => {
      commit(addEnemyKills(stateRef.current, gains));
    },
    [commit],
  );

  const buyMasteryUpgrade = useCallback(
    (unitId: string, upgradeId: string) => {
      commit(buyMasteryUpgradeTx(stateRef.current, unitId, upgradeId));
    },
    [commit],
  );

  const setActiveMasteryUpgrade = useCallback(
    (unitId: string, upgradeId: string) => {
      commit(setActiveMasteryUpgradeTx(stateRef.current, unitId, upgradeId));
    },
    [commit],
  );

  const setMasteryDisabled = useCallback(
    (unitId: string, disabled: boolean) => {
      commit(setMasteryDisabledTx(stateRef.current, unitId, disabled));
    },
    [commit],
  );

  const toggleTeamMember = useCallback(
    (unitId: string) => {
      commit(toggleTeamMemberTx(stateRef.current, unitId));
    },
    [commit],
  );

  const resetAccount = useCallback(() => {
    commit(createInitialState());
  }, [commit]);

  const grantGems = useCallback(
    (amount: number) => {
      commit(addGems(stateRef.current, amount));
    },
    [commit],
  );

  const value = useMemo<GameStore>(
    () => ({
      state,
      summon,
      completeLevel,
      awardMastery,
      awardEnemyKills,
      buyMasteryUpgrade,
      setActiveMasteryUpgrade,
      setMasteryDisabled,
      toggleTeamMember,
      resetAccount,
      grantGems,
      summonCost: SUMMON_COST,
    }),
    [state, summon, completeLevel, awardMastery, awardEnemyKills, buyMasteryUpgrade, setActiveMasteryUpgrade, setMasteryDisabled, toggleTeamMember, resetAccount, grantGems],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

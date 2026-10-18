import { createContext, useContext } from 'react';
import { ENDLESS_LEVELS } from '../domain/endless';
import { LEVELS, SECTIONS, type LevelDef } from '../domain/levels';

/**
 * Starts a sandbox battle on a map (Settings → Developer → Sandbox). `App`
 * provides it, since the Developer menu sits deep inside the TopBar; null where
 * no battle can be started from.
 */
export const SandboxLauncher = createContext<((levelId: number) => void) | null>(null);

export function useSandboxLauncher(): ((levelId: number) => void) | null {
  return useContext(SandboxLauncher);
}

/** The maps a sandbox can be played on: every chapter's stages, then its endless map. */
export function sandboxMaps(): { label: string; levels: LevelDef[] }[] {
  return SECTIONS.map((s) => ({
    label: s.name,
    levels: [...LEVELS.filter((l) => l.section === s.id), ...ENDLESS_LEVELS.filter((l) => l.section === s.id)],
  })).filter((g) => g.levels.length > 0);
}

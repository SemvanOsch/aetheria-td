import type * as BallSceneModule from './three/ballScene';
import type * as JournalSceneModule from './three/journalScene';
import type * as MapSceneModule from './three/mapScene';

/**
 * The home desk's 3D objects, preloaded behind the loading screen
 * (`DeskLoading`) so the desk never shows with an object missing or popping
 * in. Each asset loads in parallel and reports its own 0–1 progress; the
 * screen shows their average and the label of the one furthest behind.
 *
 * To make another desk object 3D, add its entry to `DESK_ASSETS`: a `load`
 * that dynamic-imports its three.js module (keeping three.js out of the main
 * bundle) and resolves once its scene is warm.
 */

export type DeskAssetId = 'journal' | 'map' | 'ball';

interface DeskAsset {
  id: DeskAssetId;
  /** What the loading screen says while this one is the furthest behind. */
  label: string;
  load(onProgress: (f: number) => void): Promise<void>;
}

let journalModule: typeof JournalSceneModule | null = null;
let mapModule: typeof MapSceneModule | null = null;
let ballModule: typeof BallSceneModule | null = null;

const DESK_ASSETS: DeskAsset[] = [
  {
    id: 'journal',
    label: 'Binding the journal',
    load: (onProgress) =>
      import('./three/journalScene').then((m) => {
        journalModule = m;
        onProgress(0.08);
        return m.preloadJournal((f) => onProgress(0.08 + 0.92 * f));
      }),
  },
  {
    id: 'map',
    label: 'Unrolling the map',
    load: (onProgress) =>
      import('./three/mapScene').then((m) => {
        mapModule = m;
        onProgress(0.08);
        return m.preloadMap((f) => onProgress(0.08 + 0.92 * f));
      }),
  },
  {
    id: 'ball',
    label: 'Waking the orb',
    load: (onProgress) =>
      import('./three/ballScene').then((m) => {
        ballModule = m;
        onProgress(0.08);
        return m.preloadBall((f) => onProgress(0.08 + 0.92 * f));
      }),
  },
];

/** Shown once everything is in, while the screen fades away. */
const DONE_LABEL = 'Lighting the candles';

export interface DeskLoadState {
  /** 0–1 across every asset. */
  progress: number;
  label: string;
  done: boolean;
  /** Assets that failed (no WebGL, a network error); the desk goes on without them. */
  failed: DeskAssetId[];
}

let state: DeskLoadState = { progress: 0, label: DESK_ASSETS[0].label, done: false, failed: [] };
const listeners = new Set<() => void>();

function update(patch: Partial<DeskLoadState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribeDeskLoad(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDeskLoad(): DeskLoadState {
  return state;
}

let started: Promise<void> | null = null;

/** Start (once) loading every desk asset; resolves when all are in or failed. */
export function preloadDesk(): Promise<void> {
  if (started) return started;
  const fractions = DESK_ASSETS.map(() => 0);
  const report = () => {
    const behind = DESK_ASSETS.reduce((a, _, i) => (fractions[i] < fractions[a] ? i : a), 0);
    update({
      progress: fractions.reduce((a, b) => a + b, 0) / DESK_ASSETS.length,
      label: DESK_ASSETS[behind].label,
    });
  };
  started = Promise.all(
    DESK_ASSETS.map((asset, i) =>
      asset
        .load((f) => {
          fractions[i] = Math.max(fractions[i], Math.min(1, f));
          report();
        })
        .catch((err) => {
          console.warn(`Desk asset "${asset.id}" failed to load; the desk goes on without it.`, err);
          fractions[i] = 1;
          update({ failed: [...state.failed, asset.id] });
          report();
        }),
    ),
  ).then(() => update({ done: true, progress: 1, label: DONE_LABEL }));
  return started;
}

/** The journal's scene module, once `preloadDesk` has loaded it. */
export function loadedJournalModule() {
  return journalModule;
}

/** The map's scene module, once `preloadDesk` has loaded it. */
export function loadedMapModule() {
  return mapModule;
}

/** The crystal ball's scene module, once `preloadDesk` has loaded it. */
export function loadedBallModule() {
  return ballModule;
}

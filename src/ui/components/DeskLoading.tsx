import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { getDeskLoad, subscribeDeskLoad } from '../deskAssets';
import { CandleArt } from './DeskArt';

/** How long the screen takes to fade off the desk (matches `.desk-loading`). */
const FADE_MS = 900;

/**
 * The loading screen over the home desk while its 3D objects load and warm
 * (`deskAssets`): a single candle burning in the dark, the game's name, a thin
 * brass line filling as they come in and a note of what is being readied. It
 * fades away onto the finished desk. Once the desk has loaded it never shows
 * again (later visits mount it already done, and it renders nothing).
 */
export function DeskLoading() {
  const load = useSyncExternalStore(subscribeDeskLoad, getDeskLoad);
  const [gone, setGone] = useState(load.done);

  useEffect(() => {
    if (!load.done || gone) return;
    const t = window.setTimeout(() => setGone(true), FADE_MS);
    return () => window.clearTimeout(t);
  }, [load.done, gone]);

  if (gone) return null;
  const pct = Math.round(load.progress * 100);
  return createPortal(
    <div
      className={`desk-loading${load.done ? ' done' : ''}`}
      role="progressbar"
      aria-label="Loading"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="desk-loading-inner">
        <div className="desk-loading-candle" aria-hidden="true">
          <CandleArt />
        </div>
        <h1 className="desk-loading-title">Aetheria</h1>
        <div className="desk-loading-bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </div>
        <p className="desk-loading-label">{load.label}…</p>
      </div>
    </div>,
    document.body,
  );
}

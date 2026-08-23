/**
 * Thin, typed wrapper around localStorage.
 *
 * This is the ONLY place the app touches the browser storage API. Everything
 * else goes through the game-state repository so persistence can be swapped
 * (e.g. for a backend) without touching UI or domain code.
 */

const PREFIX = 'aetheria-td:';

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable / quota exceeded — fail silently; the game still
    // runs for the session, it just won't persist.
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

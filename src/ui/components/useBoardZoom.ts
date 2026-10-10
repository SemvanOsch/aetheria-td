import { useLayoutEffect, type RefObject } from 'react';

/**
 * Opens an ending cutscene by zooming its frame out from where the battle board
 * sits on screen (`from`) to fill the stage, the backdrop fading to black around
 * it, so the battle board seems to become the cutscene. Skipped under reduced
 * motion. Runs once, on mount.
 */
export function useBoardZoom(frameRef: RefObject<HTMLElement | null>, from: DOMRect | null | undefined, seconds: number): void {
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || !from || from.width <= 0) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const to = frame.getBoundingClientRect();
    if (to.width <= 0) return;
    frame.style.transformOrigin = '0 0';
    frame.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;
    void frame.offsetWidth; // commit the start pose before transitioning
    frame.style.transition = `transform ${seconds}s cubic-bezier(0.65, 0, 0.35, 1)`;
    frame.style.transform = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

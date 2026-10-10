import { useLayoutEffect, useRef } from 'react';

/**
 * Shrinks a single-line label's font until it fits its box, so a long name
 * steps down a size instead of being cut off. Starts from the stylesheet's
 * size each time, never goes below `min` px, and refits when the box resizes
 * or the web fonts finish loading. The element should be `white-space: nowrap`.
 */
export function useFitText<T extends HTMLElement>(text: string, min = 11) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 0.5 && size > min) {
        size = Math.max(min, size - 1);
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    let alive = true;
    document.fonts?.ready.then(() => alive && fit());
    const ro = new ResizeObserver(fit);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [text, min]);
  return ref;
}

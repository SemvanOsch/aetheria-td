import { useEffect, useRef } from 'react';
import type { PlayerSpriteConfig } from '../../domain/playerSprite';
import { drawPlayerSprite } from '../../engine/sprites';

interface Props {
  config: PlayerSpriteConfig;
  /** Rendered box in CSS pixels (square). */
  size?: number;
  /** Face left instead of the default (right), matching the champion sprites. */
  faceLeft?: boolean;
  /** Gentle idle bob — used for the live creator preview; off elsewhere. */
  idle?: boolean;
  /** Accessible label (defaults to "Your adventurer"). */
  label?: string;
}

/**
 * The player's custom adventurer, drawn with the same procedural pipeline as the
 * champions (`engine/sprites` → `drawPlayerSprite`). This is the single place any
 * other system should render the avatar from a `PlayerSpriteConfig` — the journal
 * portrait, and later party screens / dialogue portraits — so it always matches
 * the board art. Sized in CSS px, rendered at device DPR like `UnitSprite`.
 */
export function PlayerSprite({ config, size = 96, faceLeft = false, idle = false, label = 'Your adventurer' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);

    let raf = 0;
    const render = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      // The figure spans ~26px tall (head y=-15, feet y=+11) and ~±11 wide with a
      // cape; fit it into the box centred with a little breathing room.
      const s = size / 34;
      // A slow, small vertical bob so the live preview feels alive.
      const bob = idle ? Math.sin(t / 650) * 0.6 : 0;
      ctx.translate(size * 0.5, size * 0.64 + bob);
      ctx.scale(s, s);
      drawPlayerSprite(ctx, config, faceLeft, 0);
      if (idle) raf = requestAnimationFrame(render);
    };
    render(idle ? performance.now() : 0);
    return () => cancelAnimationFrame(raf);
  }, [config, size, faceLeft, idle]);

  return (
    <canvas
      ref={ref}
      className="unit-sprite"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    />
  );
}

import { useEffect, useRef } from 'react';
import type { PlayerSpriteConfig } from '../../domain/playerSprite';
import { drawPlayerSprite, type PlayerWeapon } from '../../engine/sprites';
import { onPortraitTick, paintPortrait, portraitStyle } from '../portrait';

interface Props {
  config: PlayerSpriteConfig;
  /** Rendered box in CSS pixels (square). */
  size?: number;
  /** Face left instead of the default (right), matching the champion sprites. */
  faceLeft?: boolean;
  /** Gentle idle breath — used for the live creator preview; off elsewhere. */
  idle?: boolean;
  /**
   * `full` fits the whole figure with room for a cape or weapon; `snug` fits it
   * edge to edge (small option tiles); `bust` zooms to head and shoulders (the
   * creator's face / hair / headwear tiles, where full-figure detail is too small).
   */
  framing?: 'full' | 'snug' | 'bust';
  /** A champion weapon to hold (the creator's "with gear" preview). */
  weapon?: PlayerWeapon;
  /** Accessible label (defaults to "Your adventurer"). */
  label?: string;
}

/**
 * The player's custom adventurer, drawn with the same procedural pipeline as the
 * champions (`engine/sprites` → `drawPlayerSprite`, finished by the shared figure
 * compositor). This is the single place any other system should render the
 * avatar from a `PlayerSpriteConfig` — the journal portrait, and later party
 * screens / dialogue portraits — so it always matches the board art. Sized in
 * CSS px, rendered at device DPR like `UnitSprite`.
 */
export function PlayerSprite({
  config,
  size = 96,
  faceLeft = false,
  idle = false,
  framing = 'full',
  weapon = 'none',
  label = 'Your adventurer',
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    // A much fainter rim light and head lift than the champion cards: at these
    // large sizes the cream crescent read as a grey cap on dark hair.
    const style = { ...portraitStyle(config.outfitColor), rimAlpha: 0.07, shading: 0.5 };
    const key = `pp|${JSON.stringify(config)}|${faceLeft ? 1 : 0}|${weapon}`;

    const render = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      if (framing === 'bust') {
        // Head and shoulders: the head sits just above centre, with room over
        // it for tall hats, crests and topknots.
        const s = size / 14;
        ctx.translate(size * 0.5, size * 0.5 + 12 * s);
        ctx.scale(s, s);
      } else if (framing === 'snug') {
        const s = size / 29;
        ctx.translate(size * 0.5, size * 0.6);
        ctx.scale(s, s);
      } else {
        // The figure spans ~26px tall (head y=-15, feet y=+11) and ~±11 wide with a
        // cape; fit it into the box centred with a little breathing room. A drawn
        // bow reaches further forward, so a weapon pose sits a touch left.
        const s = size / (weapon === 'none' ? 34 : 38);
        ctx.translate(size * (weapon === 'none' ? 0.5 : 0.44), size * 0.64);
        ctx.scale(s, s);
      }
      paintPortrait(ctx, (g) => drawPlayerSprite(g, config, faceLeft, 0, weapon), style, key, t);
    };
    render(0);
    return idle ? onPortraitTick(render) : undefined;
  }, [config, size, faceLeft, idle, framing, weapon]);

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

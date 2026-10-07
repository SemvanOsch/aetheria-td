import { useEffect, useRef } from 'react';
import type { UnitDef } from '../../domain/units';
import { drawUnitSprite, hasSprite } from '../../engine/sprites';
import { onPortraitTick, paintPortrait, portraitStyle } from '../portrait';

interface Props {
  unit: UnitDef;
  /** Rendered box in CSS pixels (square). */
  size?: number;
  /** Breathe gently on the shared portrait ticker (default on). */
  animate?: boolean;
}

/**
 * A champion's icon for menus and cards. Draws the same procedural silhouette
 * used on the battle board (via `engine/sprites`, finished by the shared figure
 * compositor) for units that have one, and falls back to the emoji token for
 * the rest — so a champion looks identical in the collection, the deploy list,
 * and in-stage. Sprites face right in a ready pose; the box is sized in CSS px
 * and rendered at device DPR.
 */
export function UnitSprite({ unit, size = 48, animate = true }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shape = unit.visual.shape;
  const sprite = hasSprite(shape);
  const color = unit.visual.color;
  // The player's own adventurer(s) are drawn from a portrait config rather than a
  // flat colour, and sit roughly centred (blades reach both sides) — so they use
  // their own framing below.
  const playerConfig = unit.visual.playerConfig;
  const isPlayer = shape.startsWith('player-');

  useEffect(() => {
    if (!sprite) return;
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    const accent = playerConfig?.outfitColor ?? color;
    // The player's adventurer gets the journal portrait's faint rim and head
    // lift: the full champion light reads as a grey cap on dark, bare hair.
    const style = isPlayer ? { ...portraitStyle(accent), rimAlpha: 0.07, shading: 0.5 } : portraitStyle(accent);
    const key = `p|${shape}|${color}|${playerConfig ? JSON.stringify(playerConfig) : ''}`;
    const phase = (shape.length * 1.7) % 6.28;

    const render = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      if (isPlayer) {
        // Composed avatar, a hair smaller so held weapons stay in frame. The Bow
        // adventurer reaches forward with its shortbow, so it's anchored a little
        // left to keep the whole pose centred; the others sit centred.
        const s = size / 38;
        const anchorX = shape === 'player-bow' ? 0.42 : shape === 'player-longbow' ? 0.45 : 0.5;
        ctx.translate(size * anchorX, size * 0.62);
        ctx.scale(s, s);
        paintPortrait(ctx, (g) => drawUnitSprite(g, shape, color, false, 0, false, false, playerConfig), style, key, t, phase);
        return;
      }
      // The figure spans roughly 30px tall (feet y=+11, head y=-16) and reaches to
      // ~x=+18 with the bow; centre it in the box with a little breathing room.
      // Most champions lean right (bow/staff reaches forward), so the origin sits a
      // touch left of centre; the Bard instead carries a lute out to his left, so
      // his silhouette centres with the origin nudged right.
      const s = size / 40;
      const anchorX = shape === 'bard' ? 0.56 : 0.44;
      ctx.translate(size * anchorX, size * 0.6);
      ctx.scale(s, s);
      paintPortrait(ctx, (g) => drawUnitSprite(g, shape, color, false, 0), style, key, t, phase);
    };
    render(0);
    return animate ? onPortraitTick(render) : undefined;
  }, [sprite, shape, color, size, isPlayer, playerConfig, animate]);

  if (!sprite) return <>{unit.visual.icon}</>;
  return (
    <canvas
      ref={ref}
      className="unit-sprite"
      style={{ width: size, height: size }}
      role="img"
      aria-label={unit.name}
    />
  );
}

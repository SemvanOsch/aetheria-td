import { useEffect, useRef } from 'react';
import type { UnitDef } from '../../domain/units';
import { drawUnitSprite, hasSprite } from '../../engine/sprites';

interface Props {
  unit: UnitDef;
  /** Rendered box in CSS pixels (square). */
  size?: number;
}

/**
 * A champion's icon for menus and cards. Draws the same procedural silhouette
 * used on the battle board (via `engine/sprites`) for units that have one, and
 * falls back to the emoji token for the rest — so a champion looks identical in
 * the collection, the deploy list, and in-stage. Sprites face right in a ready
 * (fully-drawn) pose; the box is sized in CSS px and rendered at device DPR.
 */
export function UnitSprite({ unit, size = 48 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shape = unit.visual.shape;
  const sprite = hasSprite(shape);
  const color = unit.visual.color;

  useEffect(() => {
    if (!sprite) return;
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // The figure spans roughly 30px tall (feet y=+11, head y=-16) and reaches to
    // ~x=+18 with the bow; centre it in the box with a little breathing room.
    const s = size / 40;
    ctx.translate(size * 0.44, size * 0.6);
    ctx.scale(s, s);
    drawUnitSprite(ctx, shape, color, false, 0);
  }, [sprite, shape, color, size]);

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

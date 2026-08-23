import { useEffect, useRef } from 'react';
import type { EnemyDef } from '../../domain/enemies';
import { drawEnemySprite, hasEnemySprite } from '../../engine/sprites';

interface Props {
  enemy: EnemyDef;
  /** Rendered box in CSS pixels (square). */
  size?: number;
}

/** Bosses are drawn 20% smaller than normal enemies so they fit the index token. */
const BOSS_SCALE = 0.8;

/**
 * An enemy's icon for the Enemy Index. Draws the same procedural walk-figure
 * used on the battle board (via `engine/sprites`) for enemies that have one, and
 * falls back to the emoji token for the rest. Shown in a side profile at rest,
 * facing right (like `UnitSprite`); the box is sized in CSS px, rendered at DPR.
 */
export function EnemySprite({ enemy, size = 48 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sprite = hasEnemySprite(enemy.id);
  const id = enemy.id;
  const color = enemy.visual.color;
  const boss = enemy.boss;

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
    // Enemy figures span ~30px tall (feet ~+11, head ~-16) centred on the origin;
    // fit that into the box with a little breathing room, matching UnitSprite.
    // Bosses are drawn larger than normal foes, so shrink them a flat 20% to fit.
    const s = (size / 44) * (boss ? BOSS_SCALE : 1);
    ctx.translate(size * 0.5, size * 0.62);
    ctx.scale(s, s);
    // Side view, at rest (dist 0), facing right; sit=0 so the seated king walks.
    drawEnemySprite(ctx, id, color, 'side', false, 0, 0);
  }, [sprite, id, color, size, boss]);

  if (!sprite) return <>{enemy.visual.icon}</>;
  return (
    <canvas
      ref={ref}
      className="unit-sprite"
      style={{ width: size, height: size }}
      role="img"
      aria-label={enemy.name}
    />
  );
}

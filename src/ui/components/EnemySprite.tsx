import { useEffect, useRef } from 'react';
import type { EnemyDef } from '../../domain/enemies';
import { drawEnemySprite, hasEnemySprite } from '../../engine/sprites';
import { onPortraitTick, paintPortrait, portraitStyle } from '../portrait';
import { Icon } from './Icon';

interface Props {
  enemy: EnemyDef;
  /** Rendered box in CSS pixels (square). */
  size?: number;
  /** Breathe gently on the shared portrait ticker (default on). */
  animate?: boolean;
  /** Draw as an unidentified silhouette (Bestiary entries not yet unlocked). */
  silhouette?: boolean;
}

/** Bosses are drawn 20% smaller than normal enemies so they fit the index token. */
const BOSS_SCALE = 0.8;

/**
 * An enemy's icon for the Enemy Index. Draws the same procedural walk-figure
 * used on the battle board (via `engine/sprites`, through the shared figure
 * compositor) for enemies that have one, and falls back to the emoji token for
 * the rest. Shown in a side profile at rest, facing right (like `UnitSprite`);
 * the box is sized in CSS px, rendered at DPR.
 */
export function EnemySprite({ enemy, size = 48, animate = true, silhouette = false }: Props) {
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
    const style = portraitStyle(color, boss);
    if (silhouette) {
      style.tint = '#0c0812';
      style.tintAmount = 0.7;
      style.rimAlpha = 0.25;
    }
    const key = `pe|${id}|${color}|${silhouette ? 1 : 0}`;
    const phase = (id.length * 2.3) % 6.28;

    const render = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      // Enemy figures span ~30px tall (feet ~+11, head ~-16) centred on the
      // origin; bosses are drawn larger than normal foes, so shrink them a flat
      // 20% to fit.
      const s = (size / 44) * (boss ? BOSS_SCALE : 1);
      ctx.translate(size * 0.5, size * 0.62);
      ctx.scale(s, s);
      // Side view, at rest (dist 0), facing right; sit=0 so the seated king walks.
      paintPortrait(ctx, (g) => drawEnemySprite(g, id, color, 'side', false, 0, 0), style, key, silhouette ? 0 : t, phase);
    };
    render(0);
    return animate && !silhouette ? onPortraitTick(render) : undefined;
  }, [sprite, id, color, size, boss, animate, silhouette]);

  if (!sprite) {
    // An undiscovered foe never leaks its token: a muted mark stands in.
    return silhouette ? <Icon name="skull" style={{ opacity: 0.35 }} /> : <>{enemy.visual.icon}</>;
  }
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

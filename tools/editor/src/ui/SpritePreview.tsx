/**
 * Live sprite previews for the champion and enemy editors, drawn by the game's
 * own procedural sprites through its figure compositor (`engine/figure.ts`),
 * so a recoloured or reshaped entry looks exactly as it will on the board.
 */

import { useEffect, useRef } from 'react';
import { paintFigure, BOSS_BOX, DEFAULT_BOX, type FigureStyle } from '@game/engine/figure';
import { drawEnemySprite, drawUnitSprite, hasEnemySprite, hasSprite } from '@game/engine/sprites';
import type { EnemyDef } from '@game/domain/enemies';
import type { UnitDef } from '@game/domain/units';

function style(accent: string, boss: boolean): FigureStyle {
  return {
    accent,
    outline: 0.8,
    rim: '#fff1d6',
    rimAlpha: 0.45,
    shading: 0.85,
    headY: boss ? -40 : -20,
    feetY: 12,
    box: boss ? BOSS_BOX : DEFAULT_BOX,
  };
}

function useCanvasLoop(size: number, draw: (ctx: CanvasRenderingContext2D, t: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    let raf = 0;
    const t0 = performance.now();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const paint = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      draw(ctx, reduced ? 0 : (now - t0) / 1000);
    };
    const frame = (now: number) => {
      paint(now);
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    // First frame now: a hidden tab pauses requestAnimationFrame.
    paint(t0);
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, ...deps]);
  return ref;
}

/** A champion's board sprite (idle, with a periodic attack swing). */
export function UnitPreview({ unit, size = 96 }: { unit: UnitDef; size?: number }) {
  const { shape, color, playerConfig, icon } = unit.visual;
  const drawable = hasSprite(shape) && (!shape.startsWith('player-') || !!playerConfig);
  const ref = useCanvasLoop(
    size,
    (ctx, t) => {
      const s = size / 46;
      ctx.translate(size / 2, size * 0.6);
      ctx.scale(s, s);
      const cycle = t % 2.4;
      const anim = cycle > 1.9 ? 1 - (cycle - 1.9) / 0.5 : 0;
      paintFigure(ctx, (g) => drawUnitSprite(g, shape, color, false, anim, false, false, playerConfig), style(color, false));
    },
    [shape, color, playerConfig],
  );
  if (!drawable) return <span className="ed-sprite-fallback" style={{ width: size, height: size, fontSize: size * 0.45 }}>{icon}</span>;
  return <canvas ref={ref} className="ed-sprite" style={{ width: size, height: size }} role="img" aria-label={`${unit.name} sprite`} />;
}

/** A foe walking in place (bosses scaled down to fit), or its board token if it has no sprite. */
export function EnemyPreview({ def, size = 96 }: { def: EnemyDef; size?: number }) {
  const sprite = hasEnemySprite(def.id);
  const ref = useCanvasLoop(
    size,
    (ctx, t) => {
      const s = (size / 46) * (def.boss ? 0.75 : 1);
      ctx.translate(size / 2, size * 0.62);
      ctx.scale(s, s);
      paintFigure(ctx, (g) => drawEnemySprite(g, def.id, def.visual.color, 'side', false, t * Math.max(20, def.speed), 0), style(def.visual.color, def.boss));
    },
    [def.id, def.visual.color, def.speed, def.boss],
  );
  if (!sprite) {
    // The board's fallback token: a tinted disc carrying the icon.
    return (
      <span
        className="ed-sprite-token"
        style={{ width: size, height: size }}
        title="No sprite for this id: the board draws this tinted disc with its icon."
      >
        <span style={{ background: def.visual.color, width: Math.min(size, def.radius * 2.6), height: Math.min(size, def.radius * 2.6), fontSize: Math.min(size, def.radius * 2.6) * 0.5 }}>
          {def.visual.icon}
        </span>
      </span>
    );
  }
  return <canvas ref={ref} className="ed-sprite" style={{ width: size, height: size }} role="img" aria-label={`${def.name} sprite`} />;
}

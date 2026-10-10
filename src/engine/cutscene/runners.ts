/**
 * Champions hopping off the board in an ending cutscene — shared by the
 * Getaway (into the wagon) and the Sewers (out through the far tunnel): the
 * route along the road and the bounding figure itself. Cosmetic only.
 */

import type { GameEngine } from '../GameEngine';
import type { Tower } from '../types';
import type { Vec2 } from '../../domain/grid';
import { paintFigure } from '../figure';
import { drawUnitSprite, hasSprite } from '../sprites';
import { FIGURE_SCALE, cfgKey, championFigureStyle } from '../renderer';

/** How a running champion is drawn this frame. */
export interface RunnerPose {
  /** Where its feet are on the floor. */
  pos: Vec2;
  /** Height off the floor (px). */
  lift: number;
  /** Squash (+) / stretch (−) about the feet. */
  squash: number;
  /** Lean into the run (radians). */
  lean: number;
  alpha: number;
  scale: number;
  faceLeft: boolean;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * A champion's way off the board: straight onto the nearest stretch of road
 * (any of `roads`, each a polyline), then along it to its end, stopping
 * `stopBack` px short of it (a negative value carries on past the end, along
 * the last stretch).
 */
export function routeAlongRoad(from: Vec2, roads: Vec2[][], stopBack: number): Vec2[] {
  let best: { d: number; q: Vec2; road: Vec2[]; seg: number } | null = null;
  for (const road of roads) {
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i];
      const b = road[i + 1];
      const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
      const u = Math.max(0, Math.min(1, ((from.x - a.x) * (b.x - a.x) + (from.y - a.y) * (b.y - a.y)) / len2));
      const q = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      const d = dist(from, q);
      if (!best || d < best.d) best = { d, q, road, seg: i };
    }
  }
  if (!best) return [{ ...from }];
  const route = [{ ...from }, best.q, ...best.road.slice(best.seg + 1).map((p) => ({ ...p }))];
  if (stopBack < 0 && route.length >= 2) {
    // Carry on past the end, along the last stretch.
    const end = route[route.length - 1];
    const prev = route[route.length - 2];
    const len = dist(prev, end) || 1;
    route.push({ x: end.x + ((end.x - prev.x) / len) * -stopBack, y: end.y + ((end.y - prev.y) / len) * -stopBack });
    return route;
  }
  // Pull the last point back along the final stretch to the stopping spot.
  let back = stopBack;
  while (route.length > 2 && back > 0) {
    const end = route[route.length - 1];
    const prev = route[route.length - 2];
    const len = dist(prev, end);
    if (len > back) {
      const k = (len - back) / len;
      route[route.length - 1] = { x: prev.x + (end.x - prev.x) * k, y: prev.y + (end.y - prev.y) * k };
      back = 0;
    } else {
      route.pop();
      back -= len;
    }
  }
  return route;
}

/** Cumulative length at each point of a route. */
export function routeLengths(route: Vec2[]): number[] {
  const cum = [0];
  for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + dist(route[i - 1], route[i]));
  return cum;
}

/** The point `s` px along a route (`cum` from `routeLengths`), and the direction of travel there. */
export function alongRoute(route: Vec2[], cum: number[], s: number): { p: Vec2; dir: Vec2 } {
  for (let i = 1; i < route.length; i++) {
    if (s <= cum[i] || i === route.length - 1) {
      const a = route[i - 1];
      const b = route[i];
      const len = cum[i] - cum[i - 1] || 1;
      const k = Math.max(0, Math.min(1, (s - cum[i - 1]) / len));
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } };
    }
  }
  return { p: { ...route[0] }, dir: { x: 1, y: 0 } };
}

/**
 * A deployed champion as a cutscene figure: a contact shadow that stays on the
 * floor (shrinking as it leaves it), then the champion lifted, leaned and
 * squashed about its feet, finished like the board's champions.
 */
export function drawRunner(ctx: CanvasRenderingContext2D, engine: GameEngine, def: Tower['def'], r: RunnerPose): void {
  const shape = def.visual.shape;
  ctx.save();
  ctx.globalAlpha *= r.alpha;
  ctx.translate(r.pos.x, r.pos.y);
  const k = 1 - Math.min(1, r.lift / 40) * 0.55;
  const g = ctx.createRadialGradient(0, 10.5, 0, 0, 10.5, 15 * k);
  g.addColorStop(0, `rgba(8,5,14,${0.55 * k})`);
  g.addColorStop(1, 'rgba(8,5,14,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 10.5, 15 * k, 6 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, 11 - r.lift);
  ctx.rotate(r.lean);
  const s = FIGURE_SCALE * r.scale;
  ctx.scale(s * (1 + r.squash * 0.6), s * (1 - r.squash));
  ctx.translate(0, -11);
  if (hasSprite(shape)) {
    const style = championFigureStyle(engine, def);
    // Airborne figures cast no sheared sun shadow (the floor shadow stands in).
    if (r.lift > 1) style.cast = undefined;
    const cfg = def.visual.playerConfig;
    paintFigure(
      ctx,
      (gg) => drawUnitSprite(gg, shape, def.visual.color, r.faceLeft, 0, false, false, cfg, 0),
      style,
      `cut|${shape}|${def.visual.color}|${r.faceLeft ? 1 : 0}|${r.lift > 1 ? 1 : 0}|${cfgKey(cfg)}`,
    );
  } else {
    ctx.fillStyle = def.visual.color;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '17px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.visual.icon, 0, 1);
  }
  ctx.restore();
}

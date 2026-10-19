import type { SectionId } from '../domain/levels';

/**
 * The desk map's geography that the game drives: where each chapter sits (the
 * pin's point, the route's stops) and the road between them, in story order,
 * in the map drawing's 640×440 viewBox units. Shared by the SVG drawing
 * (`MapArt`) and the 3D map (`three/mapScene`), whose sheet maps those units
 * onto its paper.
 */
export const MAP_PLACES: Record<SectionId, [number, number]> = {
  castle: [196, 202],
  capital: [234, 210],
  inn: [392, 212],
  forest: [470, 194],
};
export const MAP_ORDER: SectionId[] = ['castle', 'capital', 'inn', 'forest'];
/** The road between consecutive places (castle→capital, capital→inn, inn→forest). */
export const MAP_ROADS = [
  'M196 202 C206 214 222 214 234 210',
  'M234 210 C258 216 270 234 296 226 C330 218 352 206 392 212',
  'M392 212 C420 214 448 202 470 194',
];

/** How many stretches of road the party has travelled to reach `here`. */
export function roadsTravelled(here: SectionId): number {
  return Math.max(0, MAP_ORDER.indexOf(here));
}

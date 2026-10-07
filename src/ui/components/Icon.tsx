import type { CSSProperties, ReactNode } from 'react';

/**
 * Aetheria's icon set — hand-drawn inline SVG, no icon font, no emoji.
 *
 * One drawing language for every glyph: a 24-unit grid, a 1.7-unit round
 * stroke in `currentColor`, slightly irregular hand-inked curves, and a soft
 * duotone body (`.ic-fill`, the same colour at low opacity) so icons have weight
 * at small sizes without turning into blobs. Because everything is
 * `currentColor`, an icon takes its colour — and its hover / active / disabled
 * / selected state — from the button or label it sits in (see `.icon` rules in
 * styles.css).
 */

export type IconName =
  | 'keep'
  | 'swords'
  | 'orb'
  | 'helm'
  | 'bestiary'
  | 'journal'
  | 'gem'
  | 'coin'
  | 'heart'
  | 'star'
  | 'sword'
  | 'claymore'
  | 'bow'
  | 'longbow'
  | 'volley'
  | 'staff'
  | 'shield'
  | 'mana'
  | 'gear'
  | 'scroll'
  | 'close'
  | 'lock'
  | 'check'
  | 'back'
  | 'forward'
  | 'crown'
  | 'skull'
  | 'castle'
  | 'tree'
  | 'tankard'
  | 'houses'
  | 'endless'
  | 'trophy'
  | 'sound'
  | 'mute'
  | 'play'
  | 'pause'
  | 'fast'
  | 'flag'
  | 'sparkle'
  | 'hammer'
  | 'book'
  | 'target'
  | 'music'
  | 'wheat'
  | 'info'
  | 'plus'
  | 'dice'
  | 'turn'
  | 'undo'
  | 'quill';

const F = 'ic-fill';

/** Glyph bodies, 24×24. `F` marks the duotone fill shapes. */
const GLYPHS: Record<IconName, ReactNode> = {
  keep: (
    <>
      <path className={F} d="M5 21V9h14v12z" />
      <path d="M4 21h16M5 21V9.2M19 21V9.2M5 9h2V6.4h2.4V9h1.5V6.4h2.3V9h1.5V6.4h2.4V9H19" />
      <path d="M10 21v-4.2a2 2 0 0 1 4 0V21M8 12.4h.01M16 12.4h.01" />
    </>
  ),
  swords: (
    <>
      <path d="M4.2 4.4l9.6 9.8M19.8 4.4l-9.6 9.8" />
      <path className={F} d="M3.6 3.8l3.2.4-.3 2.6zM20.4 3.8l-3.2.4.3 2.6z" />
      <path d="M11.9 12.6l-3.3 3.2M12.1 12.6l3.3 3.2M7 14.4l2.6 2.6M17 14.4l-2.6 2.6M6.3 17.7l-2 2M17.7 17.7l2 2" />
    </>
  ),
  orb: (
    <>
      <circle className={F} cx="12" cy="10.4" r="6.6" />
      <circle cx="12" cy="10.4" r="6.6" />
      <path d="M9 8.2c.6-1.2 1.6-1.8 2.8-1.9M7 20.2h10M8.6 20.2l1.1-3.6M15.4 20.2l-1.1-3.6" />
      <path d="M13.6 11.6l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" />
    </>
  ),
  helm: (
    <>
      <path className={F} d="M5.4 14.6V11a6.6 6.6 0 0 1 13.2 0v3.6l-2.4 4.6H7.8z" />
      <path d="M5.4 14.6V11a6.6 6.6 0 0 1 13.2 0v3.6l-2.4 4.6H7.8z" />
      <path d="M12 4.4V2.6M8.2 12.2h7.6M12 12.2v5" />
    </>
  ),
  bestiary: (
    <>
      <path className={F} d="M4 5.4c2.6-.9 5.4-.6 8 1.2 2.6-1.8 5.4-2.1 8-1.2v13.4c-2.6-.9-5.4-.6-8 1.2-2.6-1.8-5.4-2.1-8-1.2z" />
      <path d="M4 5.4c2.6-.9 5.4-.6 8 1.2 2.6-1.8 5.4-2.1 8-1.2v13.4c-2.6-.9-5.4-.6-8 1.2-2.6-1.8-5.4-2.1-8-1.2zM12 6.6v13.4" />
      <path d="M14.6 9.4l1.2 2.6M16.4 8.8l1.2 2.6M18.2 8.6l.9 2.4M6.4 10.6c.8.6 2.2.6 3 0" />
    </>
  ),
  journal: (
    <>
      <path className={F} d="M5.4 3.6h10.2a2 2 0 0 1 2 2v14.8H7.4a2 2 0 0 1-2-2z" />
      <path d="M5.4 18.4V3.6h10.2a2 2 0 0 1 2 2v14.8H7.4a2 2 0 0 1-2-2 2 2 0 0 1 2-2h10.2" />
      <path d="M21 3.2l-6.4 9.4-1 2.2 2-1.2L21.8 4z" />
    </>
  ),
  gem: (
    <>
      <path className={F} d="M6.4 4.6h11.2l3.4 4.8L12 20.4 3 9.4z" />
      <path d="M6.4 4.6h11.2l3.4 4.8L12 20.4 3 9.4z" />
      <path d="M3 9.4h18M9.2 4.6L8 9.4l4 11 4-11-1.2-4.8" />
    </>
  ),
  coin: (
    <>
      <ellipse className={F} cx="12" cy="12" rx="8.2" ry="8.2" />
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="5.4" />
      <path d="M12 9.2v5.6M10.4 10.2h2.8a1.2 1.2 0 0 1 0 2.4h-2.4a1.2 1.2 0 0 0 0 2.4h2.8" />
    </>
  ),
  heart: (
    <>
      <path className={F} d="M12 20s-7.6-4.6-7.6-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.6 2.4C19.6 15.4 12 20 12 20z" />
      <path d="M12 20s-7.6-4.6-7.6-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.6 2.4C19.6 15.4 12 20 12 20z" />
    </>
  ),
  star: (
    <>
      <path className={F} d="M12 3.4l2.6 5.4 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
      <path d="M12 3.4l2.6 5.4 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
    </>
  ),
  sword: (
    <>
      <path className={F} d="M18.8 3.4l1.8 1.8-9.6 9.8-2-2z" />
      <path d="M18.8 3.4h1.8v1.8l-9.6 9.8-2-2z" />
      <path d="M7.2 11.4l5.4 5.4M9.6 14.4l-4.8 4.8M3.8 18.6l1.6 1.6" />
    </>
  ),
  claymore: (
    <>
      <path className={F} d="M20.8 3.2l-.4 3.2-8.8 8.8-2.8-2.8 8.8-8.8z" />
      <path d="M20.8 3.2l-.4 3.2-8.8 8.8-2.8-2.8 8.8-8.8z" />
      <path d="M18.4 5.6l-7.6 7.6M6.2 10.4l7.4 7.4M9.9 14.1l-4.6 4.6" />
      <circle cx="4.3" cy="19.7" r="1.4" />
    </>
  ),
  bow: (
    <>
      <path d="M6 3.6c8.4 1 12.4 5 14.4 14.4M6 3.6l14.4 14.4" />
      <path className={F} d="M6 3.6c8.4 1 12.4 5 14.4 14.4L6 3.6z" />
      <path d="M3.4 20.6L15 9M3.4 20.6l.4-3.2M3.4 20.6l3.2-.4M15 9l-.6-2.2M15 9l2.2.6" />
    </>
  ),
  longbow: (
    <>
      <path className={F} d="M7 2.6c7.6 2.4 11 5.6 11 9.4s-3.4 7-11 9.4z" />
      <path d="M7 2.6c7.6 2.4 11 5.6 11 9.4s-3.4 7-11 9.4M7 2.6v18.8" />
      <path d="M2.6 12h18.8M21.4 12l-2.6-1.8M21.4 12l-2.6 1.8M2.6 12l-1-1.6M2.6 12l-1 1.6" />
    </>
  ),
  volley: (
    <>
      <path d="M3 13L13 3M13 3l-3.2.4M13 3l-.4 3.2" />
      <path d="M7 17L17 7M17 7l-3.2.4M17 7l-.4 3.2" />
      <path d="M11 21L21 11M21 11l-3.2.4M21 11l-.4 3.2" />
    </>
  ),
  staff: (
    <>
      <path d="M6 21l9.4-11.6" />
      <circle className={F} cx="16.8" cy="7.4" r="3.4" />
      <circle cx="16.8" cy="7.4" r="3.4" />
      <path d="M16.8 2.4v1.2M21.8 7.4h-1.2M20.4 3.8l-.8.8" />
    </>
  ),
  shield: (
    <>
      <path className={F} d="M12 3.2l7.6 2.8v5.6c0 4.8-3.2 7.8-7.6 9.4-4.4-1.6-7.6-4.6-7.6-9.4V6z" />
      <path d="M12 3.2l7.6 2.8v5.6c0 4.8-3.2 7.8-7.6 9.4-4.4-1.6-7.6-4.6-7.6-9.4V6z" />
      <path d="M12 7v10.2M8.2 11h7.6" />
    </>
  ),
  mana: (
    <>
      <path className={F} d="M12 3.4c3.6 4.6 6 7.8 6 10.6a6 6 0 0 1-12 0c0-2.8 2.4-6 6-10.6z" />
      <path d="M12 3.4c3.6 4.6 6 7.8 6 10.6a6 6 0 0 1-12 0c0-2.8 2.4-6 6-10.6z" />
      <path d="M9.4 14.6a2.8 2.8 0 0 0 2.4 2.6" />
    </>
  ),
  gear: (
    <>
      <circle className={F} cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5" />
      <circle cx="12" cy="12" r="6.6" />
    </>
  ),
  scroll: (
    <>
      <path className={F} d="M7 4.4h11a2 2 0 0 1 0 4h-1V18a2 2 0 0 1-2 2H5a2 2 0 0 1 0-4h1V6.4a2 2 0 0 1 1-2z" />
      <path d="M7 4.4h11a2 2 0 0 1 0 4h-1V18a2 2 0 0 1-2 2H5a2 2 0 0 1 0-4h10M7 4.4a2 2 0 0 0-1 2V16M16 8.4H9M14.4 11.6H9" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  lock: (
    <>
      <rect className={F} x="5" y="10.4" width="14" height="10" rx="2" />
      <rect x="5" y="10.4" width="14" height="10" rx="2" />
      <path d="M8 10.4V7.6a4 4 0 0 1 8 0v2.8M12 14.4v2.4" />
    </>
  ),
  check: <path d="M4.6 12.6l4.6 4.6 10.2-10.4" />,
  back: <path d="M14.6 5.4L8 12l6.6 6.6M8.4 12H20" />,
  forward: <path d="M9.4 5.4L16 12l-6.6 6.6M15.6 12H4" />,
  crown: (
    <>
      <path className={F} d="M4 17.4L3.2 7.6l5 4 3.8-6.2 3.8 6.2 5-4-.8 9.8z" />
      <path d="M4 17.4L3.2 7.6l5 4 3.8-6.2 3.8 6.2 5-4-.8 9.8zM4.4 20.4h15.2" />
    </>
  ),
  skull: (
    <>
      <path className={F} d="M12 3.4a7.4 7.4 0 0 0-7.4 7.4c0 2.6 1.2 4.2 2.6 5.2v3.6h9.6V16c1.4-1 2.6-2.6 2.6-5.2A7.4 7.4 0 0 0 12 3.4z" />
      <path d="M12 3.4a7.4 7.4 0 0 0-7.4 7.4c0 2.6 1.2 4.2 2.6 5.2v3.6h9.6V16c1.4-1 2.6-2.6 2.6-5.2A7.4 7.4 0 0 0 12 3.4zM10 19.6v-2M14 19.6v-2" />
      <circle cx="9" cy="11.4" r="1.6" />
      <circle cx="15" cy="11.4" r="1.6" />
    </>
  ),
  castle: (
    <>
      <path className={F} d="M3.4 20.6V9.4h4V12h3V7.4h3V12h3V9.4h4v11.2z" />
      <path d="M2.4 20.6h19.2M3.4 20.6V9.4h4V12h3V7.4h3V12h3V9.4h4v11.2M12 7.4V3.4l3 1.2-3 1.2" />
      <path d="M10 20.6v-3.4a2 2 0 0 1 4 0v3.4" />
    </>
  ),
  tree: (
    <>
      <path className={F} d="M12 2.8l5.6 7.4h-2.8l4.4 6H4.8l4.4-6H6.4z" />
      <path d="M12 2.8l5.6 7.4h-2.8l4.4 6H4.8l4.4-6H6.4zM12 16.2v5" />
    </>
  ),
  tankard: (
    <>
      <path className={F} d="M5 7.4h10.4V19a1.6 1.6 0 0 1-1.6 1.6H6.6A1.6 1.6 0 0 1 5 19z" />
      <path d="M5 7.4h10.4V19a1.6 1.6 0 0 1-1.6 1.6H6.6A1.6 1.6 0 0 1 5 19zM15.4 9.6h2.2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2.2" />
      <path d="M4.4 7.4c-.4-2.4 1.4-3.8 3-3 .8-1.4 3.2-1.6 4.2 0 1.6-.6 3.6.6 3.2 3M8.4 11v6.4M12 11v6.4" />
    </>
  ),
  houses: (
    <>
      <path className={F} d="M3 20.4v-8.2L8 7.6l5 4.6v8.2zM13 20.4v-6.6l4-3.8 4 3.8v6.6z" />
      <path d="M2 20.4h20M3 20.4v-8.2L8 7.6l5 4.6v8.2M13 13.8l4-3.8 4 3.8v6.6M7 20.4v-3.6h2v3.6M16 15.4h2" />
    </>
  ),
  endless: (
    <path d="M12 12c-2-2.6-3.6-4-5.6-4a4 4 0 0 0 0 8c2 0 3.6-1.4 5.6-4zm0 0c2 2.6 3.6 4 5.6 4a4 4 0 0 0 0-8c-2 0-3.6 1.4-5.6 4z" />
  ),
  trophy: (
    <>
      <path className={F} d="M7 3.6h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 3.6h10v5a5 5 0 0 1-10 0zM7 5.4H4.4a3 3 0 0 0 3.2 4.6M17 5.4h2.6a3 3 0 0 1-3.2 4.6M12 13.6v3.6M8 20.4h8M9.4 17.2h5.2v3.2H9.4z" />
    </>
  ),
  sound: (
    <>
      <path className={F} d="M4 9.4h3.4L12 5.4v13.2l-4.6-4H4z" />
      <path d="M4 9.4h3.4L12 5.4v13.2l-4.6-4H4zM15.4 9a4 4 0 0 1 0 6M18 6.6a7.4 7.4 0 0 1 0 10.8" />
    </>
  ),
  mute: (
    <>
      <path className={F} d="M4 9.4h3.4L12 5.4v13.2l-4.6-4H4z" />
      <path d="M4 9.4h3.4L12 5.4v13.2l-4.6-4H4zM15.6 9.4l5 5.2M20.6 9.4l-5 5.2" />
    </>
  ),
  play: (
    <>
      <path className={F} d="M7.4 4.8l11.4 7.2-11.4 7.2z" />
      <path d="M7.4 4.8l11.4 7.2-11.4 7.2z" />
    </>
  ),
  pause: (
    <>
      <path className={F} d="M6.6 5h3.6v14H6.6zM13.8 5h3.6v14h-3.6z" />
      <path d="M6.6 5h3.6v14H6.6zM13.8 5h3.6v14h-3.6z" />
    </>
  ),
  fast: (
    <>
      <path className={F} d="M3.4 6l8 6-8 6zM12.4 6l8 6-8 6z" />
      <path d="M3.4 6l8 6-8 6zM12.4 6l8 6-8 6z" />
    </>
  ),
  flag: (
    <>
      <path className={F} d="M6 4.4c4-2 6.4 2 11.6 0v8.2c-5.2 2-7.6-2-11.6 0z" />
      <path d="M6 21V4.4c4-2 6.4 2 11.6 0v8.2c-5.2 2-7.6-2-11.6 0" />
    </>
  ),
  sparkle: (
    <>
      <path className={F} d="M12 3l1.8 5.4L19.4 10l-5.6 1.8L12 17.4l-1.8-5.6L4.6 10l5.6-1.6z" />
      <path d="M12 3l1.8 5.4L19.4 10l-5.6 1.8L12 17.4l-1.8-5.6L4.6 10l5.6-1.6zM18.4 16.4l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z" />
    </>
  ),
  hammer: (
    <>
      <path className={F} d="M12.4 3.6l7 5.2-2.4 3-7-5.2z" />
      <path d="M12.4 3.6l7 5.2-2.4 3-7-5.2zM12.8 8.4L4 19.6l1.6 1.2 8.8-11.2" />
    </>
  ),
  book: (
    <>
      <path className={F} d="M4.4 4.4h6a2 2 0 0 1 1.6 1.2 2 2 0 0 1 1.6-1.2h6v14.2h-6a2 2 0 0 0-1.6 1.2 2 2 0 0 0-1.6-1.2h-6z" />
      <path d="M4.4 4.4h6a2 2 0 0 1 1.6 1.2 2 2 0 0 1 1.6-1.2h6v14.2h-6a2 2 0 0 0-1.6 1.2 2 2 0 0 0-1.6-1.2h-6zM12 5.6v14.2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle className={F} cx="12" cy="12" r="4.4" />
      <circle cx="12" cy="12" r="4.4" />
      <path d="M12 2v3.4M12 18.6V22M2 12h3.4M18.6 12H22" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5.4l10-1.8v12" />
      <ellipse className={F} cx="6.6" cy="18" rx="2.6" ry="2.2" />
      <ellipse cx="6.6" cy="18" rx="2.6" ry="2.2" />
      <ellipse className={F} cx="16.6" cy="15.6" rx="2.6" ry="2.2" />
      <ellipse cx="16.6" cy="15.6" rx="2.6" ry="2.2" />
    </>
  ),
  wheat: (
    <>
      <path d="M12 21V7" />
      <path className={F} d="M12 7c-1.6-1-1.6-3 0-4 1.6 1 1.6 3 0 4zM12 11c-2.4 0-3.6-1.6-3.4-3.4 2 0 3.4 1.4 3.4 3.4zM12 11c2.4 0 3.6-1.6 3.4-3.4-2 0-3.4 1.4-3.4 3.4zM12 15c-2.4 0-3.6-1.6-3.4-3.4 2 0 3.4 1.4 3.4 3.4zM12 15c2.4 0 3.6-1.6 3.4-3.4-2 0-3.4 1.4-3.4 3.4z" />
      <path d="M12 7c-1.6-1-1.6-3 0-4 1.6 1 1.6 3 0 4zM12 11c-2.4 0-3.6-1.6-3.4-3.4 2 0 3.4 1.4 3.4 3.4zM12 11c2.4 0 3.6-1.6 3.4-3.4-2 0-3.4 1.4-3.4 3.4zM12 15c-2.4 0-3.6-1.6-3.4-3.4 2 0 3.4 1.4 3.4 3.4zM12 15c2.4 0 3.6-1.6 3.4-3.4-2 0-3.4 1.4-3.4 3.4z" />
    </>
  ),
  info: (
    <>
      <circle className={F} cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.4M12 7.6v.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  dice: (
    <>
      <rect className={F} x="4.4" y="4.4" width="15.2" height="15.2" rx="3.4" />
      <rect x="4.4" y="4.4" width="15.2" height="15.2" rx="3.4" />
      <path d="M8.8 8.8h.01M15.2 8.8h.01M12 12h.01M8.8 15.2h.01M15.2 15.2h.01" strokeWidth={2.6} />
    </>
  ),
  turn: <path d="M4.4 9h14.2l-3.6-3.6M19.6 15H5.4l3.6 3.6" />,
  undo: <path d="M8.6 5.4L4.6 9.4l4 4M4.8 9.4h9.6a5 5 0 0 1 0 10H9.4" />,
  quill: (
    <>
      <path className={F} d="M19.8 4.2c-6.2.6-10.6 4.8-12.2 11.6l2.4.2c3.2-1.2 6.6-4.2 9.8-11.8z" />
      <path d="M19.8 4.2c-6.2.6-10.6 4.8-12.2 11.6l2.4.2c3.2-1.2 6.6-4.2 9.8-11.8zM7.6 15.8l-3.2 4M11.2 11.2l-1.8 3.2" />
    </>
  ),
};

interface Props {
  name: IconName;
  /** Rendered size in CSS px (default 1em → follows the font size). */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; omit for decorative icons next to visible text. */
  title?: string;
}

export function Icon({ name, size = '1em', className, style, title }: Props) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {GLYPHS[name]}
    </svg>
  );
}

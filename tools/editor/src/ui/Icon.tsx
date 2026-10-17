/** The editor's inline SVG icon set (stroke icons on a 24px grid). */

const PATHS: Record<string, string> = {
  levels: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  enemies: 'M12 3c-4.4 0-8 3.1-8 7.3 0 2.4 1.2 4.5 3 5.8V20h2.5v-2h1.5v2h2v-2h1.5v2H17v-3.9c1.8-1.3 3-3.4 3-5.8C20 6.1 16.4 3 12 3zM9 12.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
  champions: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z',
  mastery: 'M12 3v6M12 9l-5 4M12 9l5 4M7 13v4M17 13v4M5 21h4M15 21h4M10 3h4',
  packs: 'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h3',
  discard: 'M4 4l16 16M20 4L4 20',
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  error: 'M12 3l9.5 17h-19zM12 10v4M12 17v.5',
  warning: 'M12 3l9.5 17h-19zM12 10v4M12 17v.5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5',
  check: 'M5 12l5 5 9-10',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  restore: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  code: 'M9 7l-5 5 5 5M15 7l5 5-5 5',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5M12 17v.5',
  path: 'M5 19V9h6V5h8M5 19a2 2 0 1 0 0-.01M19 5a2 2 0 1 0 0-.01',
  prop: 'M5 21V9l7-6 7 6v12zM9 21v-6h6v6',
  ground: 'M3 17l5-6 4 4 3-3 6 5M3 21h18',
  mood: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  grid: 'M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  wave: 'M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0M3 18c2-3 4-3 6 0s4 3 6 0 4-3 6 0',
  lane: 'M6 3v18M18 3v18M12 4v3M12 10v4M12 17v3',
  speed: 'M5 5l7 7-7 7M12 5l7 7-7 7',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  gold: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  sword: 'M14 4h6v6L9 21l-3-3zM5 15l4 4M3 21l3-3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  split: 'M6 3v6a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v4M6 21v-8M18 3v4',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, title }: { name: IconName | string; size?: number; title?: string }) {
  const filled = name === 'enemies' || name === 'play';
  return (
    <svg
      className="ed-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}

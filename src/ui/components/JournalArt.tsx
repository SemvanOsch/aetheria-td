/**
 * Inline-SVG ornaments for the Adventurer's Journal — the printer's flourishes,
 * compass rose, page filigree, wax seal and brass cover corners. Ink pieces use
 * `currentColor` so the page's ink tone (and its hover/locked states) drives
 * them; the seal and the brass carry their own materials. No assets, no emoji.
 */

interface ArtProps {
  className?: string;
}

/** A horizontal scroll-work divider with a lozenge at its heart. */
export function Flourish({ className }: ArtProps) {
  return (
    <svg className={`j-flourish ${className ?? ''}`} viewBox="0 0 240 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <path d="M108 12H62c-10 0-14-8-8-11 5-2.5 9 3 5 6" />
        <path d="M132 12h46c10 0 14 8 8 11-5 2.5-9-3-5-6" />
        <path d="M58 12H14" opacity="0.55" />
        <path d="M182 12h44" opacity="0.55" />
        <path d="M100 12c-6-6-16-6-20 0 4 6 14 6 20 0z" opacity="0.7" />
        <path d="M140 12c6-6 16-6 20 0-4 6-14 6-20 0z" opacity="0.7" />
      </g>
      <path d="M120 4l7 8-7 8-7-8z" fill="currentColor" />
      <circle cx="10" cy="12" r="1.8" fill="currentColor" opacity="0.55" />
      <circle cx="230" cy="12" r="1.8" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

/** An eight-pointed compass rose, engraved in ink. */
export function CompassRose({ className }: ArtProps) {
  const long = 'M50 6L56 44 50 50 44 44Z';
  const short = 'M50 22L53.5 46.5 50 50 46.5 46.5Z';
  return (
    <svg className={`j-rose ${className ?? ''}`} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="1.5 3" opacity="0.6" />
      {[45, 135, 225, 315].map((a) => (
        <path key={a} d={short} transform={`rotate(${a} 50 50)`} fill="currentColor" opacity="0.45" />
      ))}
      {[0, 90, 180, 270].map((a) => (
        <g key={a} transform={`rotate(${a} 50 50)`}>
          <path d={long} fill="currentColor" opacity="0.85" />
          <path d="M50 6L50 50 44 44Z" fill="currentColor" opacity="0.35" />
        </g>
      ))}
      <circle cx="50" cy="50" r="4" fill="currentColor" />
      <text x="50" y="4.5" textAnchor="middle" fontSize="7" fill="currentColor" fontFamily="Cinzel, serif">
        N
      </text>
    </svg>
  );
}

/** Filigree for one page corner (top-left; rotate the element for the others). */
export function PageCorner({ className }: ArtProps) {
  return (
    <svg className={`j-corner ${className ?? ''}`} viewBox="0 0 60 60" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
        <path d="M4 56V14C4 8 8 4 14 4h42" />
        <path d="M10 50V18c0-4 4-8 8-8h32" opacity="0.6" />
        <path d="M18 18c8 0 12 5 9 9-2.5 3-7 1-6-2.5" />
        <path d="M10 30c4 0 6 3 4 5" opacity="0.7" />
        <path d="M30 10c0 4 3 6 5 4" opacity="0.7" />
      </g>
      <circle cx="4" cy="4" r="2.4" fill="currentColor" />
    </svg>
  );
}

/** The four corner filigrees of a page. */
export function PageCorners() {
  return (
    <>
      <PageCorner className="tl" />
      <PageCorner className="tr" />
      <PageCorner className="bl" />
      <PageCorner className="br" />
    </>
  );
}

/** A pressed red-wax seal bearing the guild star. */
export function WaxSeal({ className }: ArtProps) {
  return (
    <svg className={`j-seal ${className ?? ''}`} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="jseal-wax" cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#e2685a" />
          <stop offset="0.55" stopColor="#a8322a" />
          <stop offset="1" stopColor="#5e1612" />
        </radialGradient>
      </defs>
      {/* Irregular spilled-wax rim. */}
      <path
        d="M32 2c5 0 6 3 10 3s7 4 8 7 6 5 6 9-1 6 1 9-1 7-3 10-1 7-5 9-6 3-9 5-6 3-9 3-5-3-9-3-8-3-10-6-6-5-6-9 2-6 0-9 0-7 3-10 2-7 6-9 6-3 9-4 4-4 8-4z"
        fill="url(#jseal-wax)"
      />
      <circle cx="32" cy="32" r="19" fill="none" stroke="#5e1612" strokeWidth="2" opacity="0.7" />
      <circle cx="32" cy="32" r="16.5" fill="none" stroke="#f19a8a" strokeWidth="0.8" opacity="0.45" />
      <path
        d="M32 18l2.6 10.8L45 32l-10.4 3.2L32 46l-2.6-10.8L19 32l10.4-3.2z"
        fill="#7a1e18"
        stroke="#f2a596"
        strokeWidth="0.7"
        strokeOpacity="0.6"
      />
      <ellipse cx="24" cy="20" rx="7" ry="3.5" fill="#fff" opacity="0.18" transform="rotate(-30 24 20)" />
    </svg>
  );
}

/** A brass corner protector for the leather cover (top-left; rotate for others). */
export function CoverCorner({ className }: ArtProps) {
  return (
    <svg className={`j-cover-corner ${className ?? ''}`} viewBox="0 0 70 70" aria-hidden="true">
      <defs>
        <linearGradient id="jcorner-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0bf" />
          <stop offset="0.35" stopColor="#e1b35a" />
          <stop offset="1" stopColor="#7a5418" />
        </linearGradient>
      </defs>
      <path d="M0 0h70L58 12H28C18 12 12 18 12 28v30L0 70z" fill="url(#jcorner-brass)" stroke="#3a2408" strokeWidth="1.2" />
      <path d="M8 8h44M8 8v44" stroke="#fff4cf" strokeWidth="1" opacity="0.55" />
      <path d="M30 20c-6 0-10 4-10 10" fill="none" stroke="#5a3a0e" strokeWidth="1.4" />
      <circle cx="6.5" cy="6.5" r="2.6" fill="#5a3a0e" />
      <circle cx="6" cy="6" r="1.2" fill="#fff0bf" />
    </svg>
  );
}

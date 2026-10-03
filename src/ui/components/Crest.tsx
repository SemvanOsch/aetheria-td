/**
 * Aetheria's crest: a heater shield in night-blue enamel, rimmed in hammered
 * gold, charged with a four-pointed star over a crown of three peaks. Inline
 * SVG so it stays crisp at any size and needs no asset.
 */
export function Crest({ className, size }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="crest-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff0bf" />
          <stop offset="0.4" stopColor="#e8bf5e" />
          <stop offset="1" stopColor="#8a6420" />
        </linearGradient>
        <linearGradient id="crest-field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a3470" />
          <stop offset="1" stopColor="#0e1230" />
        </linearGradient>
        <radialGradient id="crest-star" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#fff0bf" />
          <stop offset="1" stopColor="#e8bf5e" />
        </radialGradient>
      </defs>
      <path d="M32 3 L56 11 V30 C56 45 45 55 32 61 C19 55 8 45 8 30 V11 Z" fill="url(#crest-gold)" stroke="#2a1a06" strokeWidth="1.5" />
      <path d="M32 8 L51 14.4 V30 C51 42 42.6 50.4 32 55.6 C21.4 50.4 13 42 13 30 V14.4 Z" fill="url(#crest-field)" />
      <path d="M32 8 L51 14.4 V30 C51 42 42.6 50.4 32 55.6" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      {/* Mountain-crown of three peaks. */}
      <path d="M17 43 L24 33 L28 38 L32 29 L36 38 L40 33 L47 43 Z" fill="#141a3e" stroke="url(#crest-gold)" strokeWidth="1.4" strokeLinejoin="round" />
      {/* Guiding star. */}
      <path d="M32 12.5 L34.2 21.8 L42 24 L34.2 26.2 L32 35.5 L29.8 26.2 L22 24 L29.8 21.8 Z" fill="url(#crest-star)" stroke="#8a6420" strokeWidth="0.6" />
      <circle cx="32" cy="24" r="9" fill="none" stroke="rgba(255,240,190,0.35)" strokeWidth="0.8" />
    </svg>
  );
}

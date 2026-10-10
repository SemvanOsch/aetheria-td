/**
 * Inline-SVG illustrations for the home screen's adventurer's desk: the
 * crystal ball, the scroll map, the strapped journal and quill, candlesticks,
 * a lantern on a stack of books, an inkwell, a few coins, and the moonlit
 * view through the window. Pure vector, no assets. Every SVG prefixes its own
 * gradient ids (a hidden SVG's defs don't resolve for the others). Ambient
 * motion is CSS (`.desk-*`, `.wv-*`, `.cb-*`, `.cd-*` in styles.css), so it all
 * stops under `prefers-reduced-motion`.
 */

/** Deterministic pseudo-random sequence (same drawing every render). */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** A torn parchment edge from x0 to x1 along y. */
function jagged(x0: number, x1: number, y: number, amp: number, seed: number): string {
  const rnd = seeded(seed);
  const pts: string[] = [];
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    pts.push(`${x.toFixed(1)} ${(y + (rnd() - 0.5) * amp).toFixed(1)}`);
  }
  return pts.join(' L');
}

/* ------------------------------------------------------------ candles */

/** Wax, brass and flame-glow gradients for the candles in one SVG. */
function CandleDefs({ p }: { p: string }) {
  return (
    <>
      <radialGradient id={`${p}-glow`}>
        <stop offset="0" stopColor="#ffe2a0" stopOpacity="0.85" />
        <stop offset="0.35" stopColor="#ffa648" stopOpacity="0.28" />
        <stop offset="1" stopColor="#ff9a3a" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${p}-wax`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#cdb98f" />
        <stop offset="0.4" stopColor="#fdf3de" />
        <stop offset="0.7" stopColor="#efe0bd" />
        <stop offset="1" stopColor="#b8a07a" />
      </linearGradient>
      <linearGradient id={`${p}-brass`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#5a3a0e" />
        <stop offset="0.3" stopColor="#f2cf7e" />
        <stop offset="0.55" stopColor="#c08a33" />
        <stop offset="1" stopColor="#3f2808" />
      </linearGradient>
      <radialGradient id={`${p}-pool`}>
        <stop offset="0" stopColor="#ffb860" stopOpacity="0.55" />
        <stop offset="1" stopColor="#ffb860" stopOpacity="0" />
      </radialGradient>
    </>
  );
}

/** A dripping candle standing on `base`, its flame flickering via CSS. */
function Candle({ p, x, base, h, w = 20, delay = 0 }: { p: string; x: number; base: number; h: number; w?: number; delay?: number }) {
  const top = base - h;
  const l = x - w / 2;
  const r = x + w / 2;
  return (
    <g>
      <circle className="cd-halo" cx={x} cy={top - 14} r={w * 2.1} fill={`url(#${p}-glow)`} style={{ animationDelay: `${delay}s` }} />
      <rect x={l} y={top} width={w} height={h} rx="2" fill={`url(#${p}-wax)`} />
      <path
        d={`M${l + 1.5} ${top + 2} q2.5 ${h * 0.22} 0.5 ${h * 0.34} q-0.5 3.5 2 5.5 M${r - 1.5} ${top + 2} q2 ${h * 0.14} 0 ${h * 0.26} q-1 3 1.5 4 M${x + 2} ${top + 1} q2 5 0 9`}
        fill="none"
        stroke="#fff7e6"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <ellipse cx={x} cy={top} rx={w / 2} ry="2.6" fill="#f8ecd0" stroke="#d8c39a" strokeWidth="0.6" />
      <path d={`M${x} ${top} q-0.6 -2.5 0.4 -5`} stroke="#2a1a0a" strokeWidth="1.3" fill="none" />
      <g className="cd-flame" style={{ transformOrigin: `${x}px ${top - 4}px`, animationDelay: `${delay}s` }}>
        <path d={`M${x} ${top - 27} C${x + 7} ${top - 16} ${x + 7} ${top - 6} ${x} ${top - 3} C${x - 7} ${top - 6} ${x - 7} ${top - 16} ${x} ${top - 27} Z`} fill="#ffb24a" />
        <path d={`M${x} ${top - 20} C${x + 4} ${top - 13} ${x + 4} ${top - 7} ${x} ${top - 5} C${x - 4} ${top - 7} ${x - 4} ${top - 13} ${x} ${top - 20} Z`} fill="#fff6d6" />
        <ellipse cx={x} cy={top - 6} rx="1.8" ry="2.6" fill="#7fa8ff" opacity="0.55" />
      </g>
    </g>
  );
}

/** A turned brass candlestick (foot, knopped stem, drip tray) with its candle. */
function Candlestick({ p, x, base, stem, candle, delay = 0 }: { p: string; x: number; base: number; stem: number; candle: number; delay?: number }) {
  const tray = base - stem;
  return (
    <g>
      <ellipse cx={x} cy={base} rx="24" ry="6" fill={`url(#${p}-brass)`} stroke="#2e1c05" strokeWidth="1" />
      <path d={`M${x - 20} ${base - 1} C${x - 16} ${base - 12} ${x - 6} ${base - 12} ${x - 5} ${base - 18} L${x + 5} ${base - 18} C${x + 6} ${base - 12} ${x + 16} ${base - 12} ${x + 20} ${base - 1} Z`} fill={`url(#${p}-brass)`} stroke="#2e1c05" strokeWidth="1" />
      <rect x={x - 4} y={tray + 6} width="8" height={stem - 24} fill={`url(#${p}-brass)`} stroke="#2e1c05" strokeWidth="0.8" />
      {[0.32, 0.62].map((f) => (
        <ellipse key={f} cx={x} cy={tray + 6 + (stem - 24) * f} rx="7" ry="3.4" fill={`url(#${p}-brass)`} stroke="#2e1c05" strokeWidth="0.8" />
      ))}
      <ellipse cx={x} cy={tray + 4} rx="18" ry="4.5" fill={`url(#${p}-brass)`} stroke="#2e1c05" strokeWidth="1" />
      <ellipse cx={x} cy={tray + 2.5} rx="14" ry="2.8" fill="#e8c27a" opacity="0.7" />
      <path d={`M${x + 8} ${tray + 3} q3 3 1 7`} stroke="#f6ead0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <Candle p={p} x={x} base={tray + 2} h={candle} delay={delay} />
    </g>
  );
}

/** The candle at the desk's front-left corner, in a brass dish. */
export function CandleArt() {
  const p = 'fc';
  return (
    <svg className="desk-art candle-art" viewBox="0 0 80 170" aria-hidden="true">
      <defs>
        <CandleDefs p={p} />
      </defs>
      <ellipse cx="40" cy="160" rx="38" ry="9" fill={`url(#${p}-pool)`} />
      <ellipse cx="42" cy="161" rx="28" ry="6" fill="#000" opacity="0.5" />
      <ellipse cx="40" cy="155" rx="28" ry="7.5" fill={`url(#${p}-brass)`} stroke="#2e1c05" strokeWidth="1" />
      <ellipse cx="40" cy="152.5" rx="22" ry="4.5" fill="#e0b25a" />
      <path d="M64 153 q12 -2 10 -10 q-1 -6 -7 -4" fill="none" stroke={`url(#${p}-brass)`} strokeWidth="3" />
      <Candle p={p} x={40} base={152} h={64} w={24} delay={-0.7} />
    </svg>
  );
}

/** Back-right: a tall candlestick on two stacked books, a shorter one beside. */
export function CandleClusterArt() {
  const p = 'cc';
  return (
    <svg className="desk-art cluster-art" viewBox="0 0 220 290" aria-hidden="true">
      <defs>
        <CandleDefs p={p} />
        <filter id="cc-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {/* Warm reflections on the polished desk, then contact shadows. */}
      <ellipse cx="128" cy="282" rx="80" ry="9" fill={`url(#${p}-pool)`} />
      <ellipse cx="52" cy="282" rx="40" ry="7" fill={`url(#${p}-pool)`} />
      <ellipse cx="132" cy="283" rx="78" ry="7" fill="#000" opacity="0.55" filter="url(#cc-soft)" />
      <ellipse cx="52" cy="283" rx="26" ry="5" fill="#000" opacity="0.55" filter="url(#cc-soft)" />

      {/* Two books lying flat. */}
      <g>
        <rect x="64" y="254" width="146" height="28" rx="3" fill="#4a1e1c" stroke="#160806" strokeWidth="1.2" />
        <rect x="64" y="257" width="146" height="4" fill="#fff" opacity="0.07" />
        <rect x="200" y="256" width="8" height="24" fill="#efdfba" />
        {[262, 270].map((y) => (
          <path key={y} d={`M201 ${y} h6`} stroke="#b89a64" strokeWidth="0.6" />
        ))}
        <rect x="84" y="254" width="5" height="28" fill="#c9944a" opacity="0.8" />
        <rect x="186" y="254" width="5" height="28" fill="#c9944a" opacity="0.8" />
        <rect x="74" y="230" width="128" height="24" rx="3" fill="#1f3a4a" stroke="#081218" strokeWidth="1.2" />
        <rect x="74" y="233" width="128" height="3" fill="#fff" opacity="0.08" />
        <rect x="193" y="232" width="7" height="20" fill="#efdfba" />
        <rect x="92" y="230" width="4" height="24" fill="#c9944a" opacity="0.75" />
        <path d="M120 242 h44" stroke="#e2b862" strokeWidth="1.2" opacity="0.6" />
      </g>

      <Candlestick p={p} x={136} base={232} stem={70} candle={78} />
      <Candlestick p={p} x={46} base={281} stem={52} candle={46} delay={-0.9} />
    </svg>
  );
}

/** Back-left: a brass lantern with a candle inside, beside a stack of books. */
export function LanternBooksArt() {
  const p = 'ln';
  const books = [
    { y: 210, x: 6, w: 150, c: '#4a1e1c' },
    { y: 186, x: 14, w: 138, c: '#2a3a24' },
    { y: 162, x: 4, w: 146, c: '#3a2a14' },
    { y: 140, x: 18, w: 122, c: '#1f3a4a' },
  ];
  return (
    <svg className="desk-art lantern-art" viewBox="0 0 250 250" aria-hidden="true">
      <defs>
        <CandleDefs p={p} />
        <linearGradient id="ln-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd890" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ff9a3a" stopOpacity="0.55" />
        </linearGradient>
        <filter id="ln-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <ellipse cx="200" cy="240" rx="56" ry="9" fill={`url(#${p}-pool)`} />
      <ellipse cx="86" cy="241" rx="86" ry="7" fill="#000" opacity="0.55" filter="url(#ln-soft)" />
      <ellipse cx="200" cy="241" rx="30" ry="6" fill="#000" opacity="0.55" filter="url(#ln-soft)" />

      {/* Books, gilt-banded spines toward us. */}
      {books.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height="24" rx="3" fill={b.c} stroke="#100804" strokeWidth="1.2" />
          <rect x={b.x} y={b.y + 3} width={b.w} height="3" fill="#fff" opacity="0.07" />
          <rect x={b.x + 18} y={b.y} width="5" height="24" fill="#c9944a" opacity="0.75" />
          <rect x={b.x + b.w - 24} y={b.y} width="5" height="24" fill="#c9944a" opacity="0.75" />
          <path d={`M${b.x + b.w / 2 - 14} ${b.y + 12} h28`} stroke="#e2b862" strokeWidth="1.3" opacity="0.65" />
        </g>
      ))}

      {/* The lantern. */}
      <g transform="translate(200 0)">
        <circle className="cd-halo" cx="0" cy="150" r="52" fill={`url(#${p}-glow)`} />
        <ellipse cx="0" cy="234" rx="26" ry="6" fill={`url(#${p}-brass)`} stroke="#2e1c05" strokeWidth="1" />
        <rect x="-22" y="222" width="44" height="12" rx="2" fill={`url(#${p}-brass)`} stroke="#2e1c05" strokeWidth="1" />
        <rect x="-20" y="138" width="40" height="84" fill="url(#ln-glass)" />
        <Candle p={p} x={0} base={220} h={40} w={14} delay={-0.4} />
        {[-20, -7, 7, 20].map((x) => (
          <rect key={x} x={x - 1.6} y="136" width="3.2" height="88" fill={`url(#${p}-brass)`} stroke="#2e1c05" strokeWidth="0.6" />
        ))}
        <path d="M-17 142 L-12 216 M13 142 L17 214" stroke="#fff" strokeWidth="2" opacity="0.18" />
        <path d="M-26 138 L0 112 L26 138 Z" fill={`url(#${p}-brass)`} stroke="#2e1c05" strokeWidth="1" />
        <rect x="-24" y="134" width="48" height="6" rx="1.5" fill={`url(#${p}-brass)`} stroke="#2e1c05" strokeWidth="0.8" />
        <circle cx="0" cy="104" r="9" fill="none" stroke={`url(#${p}-brass)`} strokeWidth="3" />
        <circle cx="0" cy="112" r="3" fill={`url(#${p}-brass)`} />
      </g>
    </svg>
  );
}

/** An open inkwell, a little ink shining at its mouth. */
export function InkwellArt() {
  return (
    <svg className="desk-art inkwell-art" viewBox="0 0 90 80" aria-hidden="true">
      <defs>
        <radialGradient id="iw-glass" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#4a5a7a" />
          <stop offset="0.5" stopColor="#1a2238" />
          <stop offset="1" stopColor="#080b14" />
        </radialGradient>
        <linearGradient id="iw-brass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5a3a0e" />
          <stop offset="0.35" stopColor="#f2cf7e" />
          <stop offset="1" stopColor="#4a300c" />
        </linearGradient>
      </defs>
      <ellipse cx="47" cy="67.5" rx="35" ry="5.5" fill="#000" opacity="0.5" />
      <path d="M14 66 C10 46 22 30 45 30 C68 30 80 46 76 66 Z" fill="url(#iw-glass)" stroke="#05070c" strokeWidth="1.2" />
      <ellipse cx="45" cy="66" rx="31" ry="5" fill="#0c1220" />
      <rect x="35" y="20" width="20" height="12" rx="2" fill="url(#iw-brass)" stroke="#2e1c05" strokeWidth="0.8" />
      <ellipse cx="45" cy="20" rx="10" ry="3" fill="#06080e" stroke="#2e1c05" strokeWidth="0.8" />
      <ellipse cx="42" cy="19.5" rx="4" ry="1" fill="#6a7aa8" opacity="0.6" />
      <path d="M24 46 C26 38 32 34 38 33" stroke="#fff" strokeWidth="2.5" fill="none" opacity="0.3" strokeLinecap="round" />
    </svg>
  );
}

/** A few gold coins scattered on the desk. */
export function CoinsArt() {
  return (
    <svg className="desk-art coins-art" viewBox="0 0 100 50" aria-hidden="true">
      <defs>
        <radialGradient id="cn-gold" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="0.5" stopColor="#d1a03e" />
          <stop offset="1" stopColor="#7a5216" />
        </radialGradient>
      </defs>
      {[
        [22, 32, 0],
        [48, 24, 0],
        [70, 36, 0],
        [52, 34, 1],
      ].map(([x, y, stacked], i) => (
        <g key={i} transform={`translate(${x} ${y - (stacked ? 4 : 0)})`}>
          {!stacked && <ellipse cx="2" cy="4" rx="14" ry="5.5" fill="#000" opacity="0.45" />}
          <ellipse cy="2" rx="13" ry="6" fill="#7a5216" />
          <ellipse rx="13" ry="6" fill="url(#cn-gold)" stroke="#4a300c" strokeWidth="0.8" />
          <ellipse rx="9" ry="3.8" fill="none" stroke="#fff0bf" strokeWidth="0.8" opacity="0.7" />
          <path d="M-3 0 L0 -2 L3 0 L0 2 Z" fill="#fff0bf" opacity="0.75" />
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------ crystal ball */

/** The scrying orb on its ornate brass stand. */
export function CrystalBallArt() {
  return (
    <svg className="desk-art ball-art" viewBox="0 0 260 320" aria-hidden="true">
      <defs>
        <radialGradient id="cb-orb" cx="0.42" cy="0.36" r="0.72">
          <stop offset="0" stopColor="#efe4ff" />
          <stop offset="0.16" stopColor="#ae91ff" />
          <stop offset="0.48" stopColor="#5a34cc" />
          <stop offset="0.82" stopColor="#24125f" />
          <stop offset="1" stopColor="#140a38" />
        </radialGradient>
        <radialGradient id="cb-core">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#c8adff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8a5cff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cb-rim" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.8" stopColor="#c8b6ff" stopOpacity="0" />
          <stop offset="0.97" stopColor="#d8ccff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.2" />
        </radialGradient>
        <linearGradient id="cb-swirl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fd6ff" />
          <stop offset="0.5" stopColor="#c47dff" />
          <stop offset="1" stopColor="#ff8ad8" />
        </linearGradient>
        <linearGradient id="cb-brass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff0bf" />
          <stop offset="0.3" stopColor="#dcae52" />
          <stop offset="0.7" stopColor="#8a5d1c" />
          <stop offset="1" stopColor="#3f2808" />
        </linearGradient>
        <linearGradient id="cb-brass-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5a3a0e" />
          <stop offset="0.35" stopColor="#f2cf7e" />
          <stop offset="0.55" stopColor="#c08a33" />
          <stop offset="1" stopColor="#4a300c" />
        </linearGradient>
        <clipPath id="cb-clip">
          <circle cx="130" cy="122" r="102" />
        </clipPath>
        <filter id="cb-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <filter id="cb-haze" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      {/* Violet light spilling onto the desk, and the stand's shadow. */}
      <ellipse className="cb-pool" cx="130" cy="289" rx="130" ry="22" fill="#8a5cff" opacity="0.26" filter="url(#cb-haze)" />
      <ellipse cx="133" cy="289" rx="104" ry="8" fill="#000" opacity="0.6" filter="url(#cb-soft)" />

      {/* Stand: a stepped plinth, a waisted column, and a petal cup. */}
      <path d="M34 290 L226 290 L208 266 L52 266 Z" fill="url(#cb-brass)" stroke="#2e1c05" strokeWidth="1.5" />
      <path d="M40 286 L220 286" stroke="#fff0bf" strokeWidth="1" opacity="0.35" />
      <ellipse cx="130" cy="266" rx="78" ry="12" fill="url(#cb-brass-h)" stroke="#2e1c05" strokeWidth="1.2" />
      <path d="M100 262 C104 246 110 240 108 228 L152 228 C150 240 156 246 160 262 Z" fill="url(#cb-brass-h)" stroke="#2e1c05" strokeWidth="1.2" />
      <ellipse cx="130" cy="228" rx="46" ry="9" fill="url(#cb-brass)" stroke="#2e1c05" strokeWidth="1.2" />
      {[72, 130, 188].map((x) => (
        <g key={x} transform={`translate(${x} ${x === 130 ? 280 : 278})`}>
          <path d="M0 -7 L5 0 L0 7 L-5 0 Z" fill="#9a6bff" stroke="#2e1c05" strokeWidth="1" />
          <path d="M0 -7 L5 0 L0 0 Z" fill="#e4d5ff" opacity="0.7" />
        </g>
      ))}

      {/* The orb. */}
      <circle cx="130" cy="122" r="102" fill="url(#cb-orb)" />
      <g clipPath="url(#cb-clip)">
        {/* The vortex wrapper spins up when the orb is chosen (see .to-summon). */}
        <g className="cb-vortex">
        <g className="cb-swirl">
          <path
            d="M130 122 m-74 4 a74 40 -24 1 1 148 -8 a58 30 -24 1 1 -114 6 a40 20 -24 1 1 78 -4 a22 11 -24 1 1 -42 2"
            fill="none"
            stroke="url(#cb-swirl)"
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.75"
            filter="url(#cb-soft)"
          />
          <path d="M130 122 m-90 -10 a90 46 -24 0 1 170 -14" fill="none" stroke="#9fd8ff" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
        </g>
        <g className="cb-swirl rev">
          <path d="M130 122 m66 22 a68 34 18 1 1 -132 -10 a50 24 18 1 1 98 6" fill="none" stroke="url(#cb-swirl)" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
        </g>
        </g>
        <circle className="cb-core" cx="130" cy="122" r="46" fill="url(#cb-core)" />
        {[
          [82, 88, 1.6],
          [168, 72, 1.2],
          [184, 140, 1.8],
          [96, 160, 1.3],
          [140, 52, 1.1],
          [62, 132, 1],
          [150, 182, 1.4],
          [114, 106, 0.9],
          [196, 104, 1],
          [72, 108, 1.1],
        ].map(([x, y, r], i) => (
          <circle key={i} className="cb-star" cx={x} cy={y} r={r} fill="#fff" style={{ animationDelay: `${i * 0.37}s` }} />
        ))}
        {[96, 124, 150, 172, 110].map((x, i) => (
          <circle key={x} className="cb-mote" cx={x} cy={196} r={1.6} fill="#e4d5ff" style={{ animationDelay: `${i * 0.9}s` }} />
        ))}
        {/* The window, reflected small and curved on the glass. */}
        <g opacity="0.22" transform="translate(150 46) rotate(12)">
          <path d="M0 0 Q20 -4 38 2 L36 26 Q18 22 2 24 Z" fill="#cfe0ff" />
          <path d="M19 -1 L18 24 M1 12 Q19 9 37 14" stroke="#2a1a4a" strokeWidth="2" fill="none" />
        </g>
      </g>
      <circle cx="130" cy="122" r="102" fill="url(#cb-rim)" />
      <circle cx="130" cy="122" r="102" fill="none" stroke="rgba(214,228,255,0.5)" strokeWidth="1.6" />
      <ellipse cx="88" cy="70" rx="34" ry="18" transform="rotate(-32 88 70)" fill="#fff" opacity="0.3" filter="url(#cb-soft)" />
      <ellipse cx="78" cy="64" rx="10" ry="5" transform="rotate(-32 78 64)" fill="#fff" opacity="0.7" />
      <ellipse cx="176" cy="186" rx="24" ry="7" transform="rotate(-38 176 186)" fill="#fff" opacity="0.12" />

      {/* The petal cup cradling the orb's base. */}
      <path
        d="M58 198 Q62 176 74 172 Q84 190 92 200 Q100 182 112 184 Q120 198 130 202 Q140 198 148 184 Q160 182 168 200 Q176 190 186 172 Q198 176 202 198 C198 224 168 238 130 238 C92 238 62 224 58 198 Z"
        fill="url(#cb-brass)"
        stroke="#2e1c05"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M66 210 C90 226 170 226 194 210" fill="none" stroke="#fff0bf" strokeWidth="1.2" opacity="0.55" />
      <path d="M72 218 C96 232 164 232 188 218" fill="none" stroke="#3f2808" strokeWidth="1" opacity="0.5" />
      {[
        [74, 176],
        [186, 176],
        [112, 188],
        [148, 188],
      ].map(([x, y]) => (
        <g key={x} transform={`translate(${x} ${y})`}>
          <path d="M0 -6 L4 0 L0 6 L-4 0 Z" fill="#a77dff" stroke="#2e1c05" strokeWidth="0.8" />
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------ map */

/** Islands of Aetheria: land shapes for the map (viewBox units). */
const ISLANDS = [
  'M150 96 C180 70 250 74 282 92 C306 106 300 132 276 142 C258 150 268 172 244 180 C214 190 178 176 166 156 C150 138 128 116 150 96 Z',
  'M330 82 C362 62 430 66 452 90 C470 110 456 134 432 140 C404 148 392 130 366 136 C338 142 314 108 330 82 Z',
  'M170 214 C196 196 246 204 262 228 C276 250 262 282 232 290 C204 298 170 286 160 262 C152 244 154 226 170 214 Z',
  'M320 190 C352 168 434 172 476 196 C508 214 506 258 474 276 C444 294 402 290 372 300 C340 310 304 286 300 256 C296 228 300 204 320 190 Z',
  'M254 312 C270 302 300 304 310 318 C318 332 302 346 280 346 C260 346 242 326 254 312 Z',
];

/** Scale a path about its own centre (for the coastline ripples). */
const ripple = (s: number) => ({ transformBox: 'fill-box', transformOrigin: 'center', transform: `scale(${s})` }) as const;

/** The scroll map of Aetheria, with pins, a route, a rose and a brass compass. */
export function MapArt() {
  const top = jagged(64, 576, 46, 7, 11);
  const bottom = jagged(576, 64, 398, 8, 29);
  const sheet = `M${top} L${bottom} Z`;
  const ink = '#4a3418';
  return (
    <svg className="desk-art map-art" viewBox="0 0 640 440" aria-hidden="true">
      <defs>
        <linearGradient id="mp-sheet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#efd9a8" />
          <stop offset="0.55" stopColor="#e0c28a" />
          <stop offset="1" stopColor="#c8a268" />
        </linearGradient>
        <radialGradient id="mp-burn" cx="0.5" cy="0.5" r="0.72">
          <stop offset="0.6" stopColor="#7a4a1a" stopOpacity="0" />
          <stop offset="1" stopColor="#5a3410" stopOpacity="0.55" />
        </radialGradient>
        <linearGradient id="mp-roll" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7a5328" />
          <stop offset="0.3" stopColor="#f0dbac" />
          <stop offset="0.62" stopColor="#d2ae72" />
          <stop offset="1" stopColor="#6a4520" />
        </linearGradient>
        <linearGradient id="mp-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0bf" />
          <stop offset="0.4" stopColor="#d6a64c" />
          <stop offset="1" stopColor="#6e4812" />
        </linearGradient>
        <filter id="mp-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.26  0 0 0 0 0.09  0 0 0 0.5 -0.12" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id="mp-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <clipPath id="mp-inner">
          <rect x="90" y="68" width="460" height="306" />
        </clipPath>
      </defs>

      <path d={sheet} transform="translate(4 9)" fill="#000" opacity="0.55" filter="url(#mp-shadow)" />

      {/* The sheet, its stains and its darkened edges. */}
      <path d={sheet} fill="url(#mp-sheet)" stroke="#8a5a2a" strokeWidth="1.5" />
      <path d={sheet} fill="url(#mp-burn)" />
      <path d={sheet} fill="#fff" filter="url(#mp-grain)" />

      <g>
        <rect x="84" y="62" width="472" height="318" fill="none" stroke="#5a3c1c" strokeWidth="1.6" opacity="0.75" />
        <rect x="90" y="68" width="460" height="306" fill="none" stroke="#5a3c1c" strokeWidth="0.7" opacity="0.6" />

        {/* Rhumb lines fanning out from the compass rose. */}
        <g clipPath="url(#mp-inner)" stroke="#5a3c1c" strokeWidth="0.6" opacity="0.22">
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i * Math.PI) / 8;
            return <path key={i} d={`M142 330 L${(142 + Math.cos(a) * 700).toFixed(0)} ${(330 + Math.sin(a) * 700).toFixed(0)}`} />;
          })}
        </g>

        {/* Sea swells. */}
        {[
          [118, 300],
          [522, 230],
          [480, 350],
          [120, 186],
          [298, 72],
          [500, 72],
        ].map(([x, y]) => (
          <path key={`${x}${y}`} d={`M${x} ${y} q5 -4 10 0 t10 0 M${x + 5} ${y + 7} q5 -4 10 0`} fill="none" stroke="#5a4a32" strokeWidth="0.9" opacity="0.55" />
        ))}

        {/* Land: coastline ripples, the fields, the inked coast. */}
        {ISLANDS.map((d, i) => (
          <g key={i}>
            <path d={d} fill="none" stroke="#5a4a32" strokeWidth="0.7" opacity="0.35" style={ripple(1.1)} />
            <path d={d} fill="none" stroke="#5a4a32" strokeWidth="0.7" opacity="0.22" style={ripple(1.2)} />
            <path d={d} fill={i === 1 ? '#c0b28a' : '#b6b37a'} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
            <path d={d} fill="#93a65e" opacity="0.32" style={ripple(0.86)} />
          </g>
        ))}

        {/* Mountains on the northern isle. */}
        {[
          [362, 100, 1],
          [384, 90, 1.3],
          [408, 100, 1.05],
          [430, 114, 0.85],
          [452, 222, 0.85],
        ].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <path d="M-12 8 L0 -10 L12 8 Z" fill="#cdb88e" stroke={ink} strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M0 -10 L4 8 L12 8 Z" fill="#8a7650" opacity="0.6" />
            <path d="M-3 -5 L0 -10 L3 -5" fill="none" stroke="#fff8e8" strokeWidth="1" opacity="0.7" />
          </g>
        ))}
        {/* The fire mountain. */}
        <g transform="translate(408 248)">
          <path d="M-20 14 L-5 -14 L5 -14 L20 14 Z" fill="#a8664a" stroke="#4a2414" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M-5 -14 Q0 -6 5 -14 L2 -2 Q0 4 -2 -2 Z" fill="#d84c28" />
          <path d="M-2 -18 q3 -6 0 -10 M4 -18 q3 -5 1 -9" fill="none" stroke="#6a5a4a" strokeWidth="1" opacity="0.6" />
        </g>
        {/* Forests. */}
        {[
          [176, 112],
          [190, 104],
          [204, 116],
          [244, 106],
          [258, 118],
          [270, 130],
          [184, 132],
          [228, 150],
          [242, 162],
          [196, 236],
          [208, 252],
          [350, 220],
          [364, 232],
          [466, 240],
          [478, 256],
          [334, 268],
        ].map(([x, y], i) => (
          <g key={i}>
            <path d={`M${x} ${y - 9} L${x + 6} ${y + 3} L${x - 6} ${y + 3} Z`} fill="#4f7a3a" stroke="#2f4a20" strokeWidth="0.8" />
            <path d={`M${x} ${y + 3} v3`} stroke="#3a2a14" strokeWidth="1" />
          </g>
        ))}
        {/* A lake in the forest. */}
        <ellipse cx="218" cy="134" rx="14" ry="7" fill="#86b0b4" stroke={ink} strokeWidth="1" />
        {/* The castle. */}
        <g transform="translate(232 266)" fill="#7a6a58" stroke="#3a2a18" strokeWidth="1">
          <rect x="-12" y="-6" width="24" height="12" />
          <rect x="-15" y="-14" width="7" height="20" />
          <rect x="8" y="-14" width="7" height="20" />
          <path d="M-15 -14 l3.5 -6 l3.5 6 M8 -14 l3.5 -6 l3.5 6" fill="#a24a3a" />
          <path d="M-3 6 v-6 h6 v6" fill="#3a2a18" />
        </g>
        {/* The capital: a cluster of roofs on the northern isle. */}
        <g transform="translate(388 124)" stroke="#3a2a18" strokeWidth="0.9">
          {[
            [-12, 0],
            [-2, -3],
            [8, 1],
          ].map(([x, y]) => (
            <g key={x} transform={`translate(${x} ${y})`}>
              <rect x="-4" y="-4" width="8" height="7" fill="#9a8a70" />
              <path d="M-5 -4 L0 -9 L5 -4 Z" fill="#a24a3a" />
            </g>
          ))}
          <path d="M-2 -12 v-6 l4 2 l-4 2" fill="#a24a3a" />
        </g>
        {/* The inn, its chimney smoking. */}
        <g transform="translate(372 210)" stroke="#3a2a18" strokeWidth="0.9">
          <rect x="-8" y="-5" width="16" height="10" fill="#9a8a70" />
          <path d="M-10 -5 L0 -13 L10 -5 Z" fill="#7a4a2a" />
          <rect x="4" y="-14" width="3" height="6" fill="#6a5a4a" />
          <path d="M5.5 -16 q3 -3 0 -6 q-3 -3 1 -6" fill="none" stroke="#6a5a4a" opacity="0.6" />
          <path d="M-2 5 v-5 h4 v5" fill="#3a2a18" />
        </g>

        {/* The road between the pins. */}
        <path d="M232 266 C262 222 300 206 340 196 S392 156 388 128" fill="none" stroke="#8a2a22" strokeWidth="2" strokeDasharray="5 5" opacity="0.8" />

        {/* Chapter names in a cartographer's italic. */}
        <g className="mp-label" fill="#3b2a17">
          <text x="212" y="90" textAnchor="middle">The Forest</text>
          <text x="390" y="74" textAnchor="middle">The Capital</text>
          <text x="214" y="310" textAnchor="middle">The Castle</text>
          <text x="410" y="300" textAnchor="middle">The Inn</text>
        </g>

        {/* A sea serpent in the eastern waters. */}
        <g transform="translate(508 152)" fill="none" stroke={ink} strokeWidth="1.3" strokeLinecap="round">
          <path d="M-22 6 q5 -12 10 0 M-8 6 q5 -12 10 0 M6 6 q5 -12 10 0" />
          <path d="M16 6 q4 -16 10 -12 q4 3 -1 6" />
          <path d="M-26 9 h50" stroke="#5a4a32" strokeWidth="0.8" opacity="0.5" />
        </g>

        {/* Compass rose. */}
        <g transform="translate(142 330)">
          <circle r="30" fill="#ead2a0" stroke={ink} strokeWidth="1" opacity="0.9" />
          <circle r="24" fill="none" stroke={ink} strokeWidth="0.6" strokeDasharray="1.5 3" opacity="0.7" />
          {[45, 135, 225, 315].map((a) => (
            <path key={a} d="M0 -19 L3 -3 L0 0 L-3 -3 Z" transform={`rotate(${a})`} fill={ink} opacity="0.6" />
          ))}
          {[0, 90, 180, 270].map((a) => (
            <g key={a} transform={`rotate(${a})`}>
              <path d="M0 -30 L5 -5 L0 0 L-5 -5 Z" fill={ink} />
              <path d="M0 -30 L0 0 L-5 -5 Z" fill="#d8b878" />
            </g>
          ))}
          <circle r="2.4" fill="#8a2a22" />
          <text y="-34" textAnchor="middle" fontSize="10" fill={ink} fontFamily="Cinzel, serif">
            N
          </text>
        </g>

        {/* A sailing ship. */}
        <g transform="translate(506 304)" fill="none" stroke={ink} strokeWidth="1.2" strokeLinejoin="round">
          <path d="M-20 6 L20 6 L14 14 L-14 14 Z" fill="#8a6a44" />
          <path d="M0 6 L0 -22 M0 -20 L14 0 L0 0 M0 -16 L-12 2 L0 2" fill="#ead6aa" />
          <path d="M0 -22 l6 2 l-6 2" fill="#8a2a22" />
        </g>

        {/* Title cartouche. */}
        <g transform="translate(320 362)">
          <path d="M-74 -14 L74 -14 L84 0 L74 14 L-74 14 L-84 0 Z" fill="#ecd6a6" stroke="#5a3c1c" strokeWidth="1.2" />
          <path d="M-70 -10 L70 -10 L78 0 L70 10 L-70 10 L-78 0 Z" fill="none" stroke="#5a3c1c" strokeWidth="0.5" />
          <text y="6" textAnchor="middle" fontSize="17" letterSpacing="3" fill="#3b2a17" fontFamily="Cinzel, serif" fontWeight="700">
            AETHERIA
          </text>
        </g>
      </g>

      {/* Pins pushed into the map. */}
      {[
        [232, 254, '#c8352d'],
        [340, 186, '#2f6fd0'],
        [388, 116, '#3a9a4a'],
      ].map(([x, y, c]) => (
        <g key={String(c)} transform={`translate(${x} ${y})`}>
          <ellipse cx="4" cy="6" rx="6" ry="2.4" fill="#000" opacity="0.35" />
          <circle r="6" fill={String(c)} stroke="#2a1a0a" strokeWidth="1" />
          <circle cx="-2" cy="-2" r="2" fill="#fff" opacity="0.65" />
        </g>
      ))}

      {/* The rolled ends of the scroll, with the curl's shadow on the sheet. */}
      {[44, 572].map((x) => (
        <g key={x}>
          <rect x={x === 44 ? 70 : 556} y="44" width="14" height="356" fill="#5a3410" opacity="0.18" />
          <rect x={x} y="40" width="26" height="366" rx="4" fill="url(#mp-roll)" stroke="#6a4520" strokeWidth="1.2" />
          <path d={`M${x + 8} 46 V400`} stroke="#fff8e0" strokeWidth="1.4" opacity="0.4" />
          <ellipse cx={x + 13} cy="40" rx="13" ry="5" fill="#e9cf98" stroke="#6a4520" strokeWidth="1.2" />
          <path d={`M${x + 13} 40 m-6 0 a6 2.4 0 1 0 12 0 a4 1.6 0 1 0 -8 0`} fill="none" stroke="#8a6232" strokeWidth="0.9" />
          <ellipse cx={x + 13} cy="406" rx="13" ry="5" fill="#c9a46a" stroke="#6a4520" strokeWidth="1.2" />
        </g>
      ))}

      {/* A brass pocket compass resting on the map. */}
      <g transform="translate(514 96)">
        <ellipse cx="5" cy="7" rx="36" ry="34" fill="#000" opacity="0.4" filter="url(#mp-shadow)" />
        <circle cx="0" cy="-38" r="7" fill="none" stroke="url(#mp-brass)" strokeWidth="3" />
        <circle r="36" fill="url(#mp-brass)" stroke="#3a2408" strokeWidth="1.4" />
        <circle r="31" fill="none" stroke="#6e4812" strokeWidth="1" />
        <circle r="28" fill="#efe2c2" stroke="#6e4812" strokeWidth="1.2" />
        {Array.from({ length: 16 }, (_, i) => (
          <path key={i} d="M0 -27 L0 -23" transform={`rotate(${i * 22.5})`} stroke="#5a3c1c" strokeWidth={i % 4 === 0 ? 1.6 : 0.8} />
        ))}
        <g className="mp-needle">
          <path d="M0 -22 L4 0 L0 3 L-4 0 Z" fill="#c0392b" />
          <path d="M0 22 L4 0 L0 -3 L-4 0 Z" fill="#2c3e60" />
        </g>
        <circle r="2.5" fill="url(#mp-brass)" stroke="#3a2408" strokeWidth="0.8" />
        <ellipse cx="-12" cy="-14" rx="11" ry="5" transform="rotate(-35 -12 -14)" fill="#fff" opacity="0.32" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------ journal */

/** The adventurer's journal: strapped leather, wax seal, ribbon and quill. */
export function JournalArt() {
  return (
    <svg className="desk-art journal-art" viewBox="0 0 320 384" aria-hidden="true">
      <defs>
        <radialGradient id="jb-leather" cx="0.4" cy="0.35" r="0.85">
          <stop offset="0" stopColor="#82522e" />
          <stop offset="0.55" stopColor="#5a3420" />
          <stop offset="1" stopColor="#2e180c" />
        </radialGradient>
        <linearGradient id="jb-pages" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d9c08c" />
          <stop offset="1" stopColor="#f2e2bb" />
        </linearGradient>
        <linearGradient id="jb-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0bf" />
          <stop offset="0.4" stopColor="#d6a64c" />
          <stop offset="1" stopColor="#6e4812" />
        </linearGradient>
        <radialGradient id="jb-wax" cx="0.38" cy="0.32" r="0.7">
          <stop offset="0" stopColor="#e0525a" />
          <stop offset="0.6" stopColor="#a3202c" />
          <stop offset="1" stopColor="#5e0e16" />
        </radialGradient>
        <linearGradient id="jb-vane" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1e2a44" />
          <stop offset="0.5" stopColor="#4a6188" />
          <stop offset="1" stopColor="#24324f" />
        </linearGradient>
        <linearGradient id="jb-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#3a2410" stopOpacity="0.35" />
        </linearGradient>
        <filter id="jb-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 -0.1" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id="jb-shadow" x="-10%" y="-10%" width="130%" height="130%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <rect x="30" y="40" width="254" height="326" rx="12" fill="#000" opacity="0.6" filter="url(#jb-shadow)" transform="translate(6 8)" />

      {/* A loose, written-on page tucked beneath. */}
      <g transform="rotate(7 230 180)">
        <rect x="150" y="34" width="150" height="250" fill="#ead6a8" stroke="#a88a5a" strokeWidth="1" />
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d={`M216 ${62 + i * 17} q20 -3 40 0 t30 0`} stroke="#5a3c1c" strokeWidth="1" fill="none" opacity="0.45" />
        ))}
        <path d="M226 270 q16 -8 30 0" stroke="#8a2a22" strokeWidth="1.2" fill="none" opacity="0.5" />
      </g>

      <g transform="rotate(-4 160 190)">
        {/* The book's depth: the back board, then the page block along the
            front and right edges. */}
        <rect x="32" y="40" width="250" height="318" rx="10" fill="#2a1508" stroke="#140904" strokeWidth="1.5" />
        <path d="M266 34 L278 42 L278 348 L40 348 L32 324 L266 324 Z" fill="url(#jb-pages)" stroke="#8a6a3a" strokeWidth="1" />
        <path d="M32 324 L278 324 L278 348 L40 348 Z" fill="url(#jb-edge)" />
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M${267 + i * 1.2} ${40 + i} L${267 + i * 1.2} ${324 + i * 2.6}`} stroke="#b89a64" strokeWidth="0.6" opacity="0.55" />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <path key={`b${i}`} d={`M${36 + i * 0.6} ${326.5 + i * 2.5} L${277} ${326.5 + i * 2.5}`} stroke="#a88a58" strokeWidth="0.6" opacity="0.5" />
        ))}
        {/* Cover. */}
        <rect x="30" y="30" width="236" height="294" rx="10" fill="url(#jb-leather)" stroke="#1e0f06" strokeWidth="2" />
        <rect x="30" y="30" width="236" height="294" rx="10" fill="#fff" filter="url(#jb-grain)" />
        <rect x="30" y="30" width="26" height="294" rx="8" fill="#2e180c" opacity="0.55" />
        {[70, 150, 230, 290].map((y) => (
          <rect key={y} x="30" y={y} width="26" height="6" rx="2" fill="#1e0f06" opacity="0.6" />
        ))}
        <path d="M58 34 V320" stroke="#c9944a" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
        <rect x="68" y="46" width="182" height="262" rx="6" fill="none" stroke="#c9944a" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.55" />
        <rect x="76" y="54" width="166" height="246" rx="4" fill="none" stroke="#1e0f06" strokeWidth="1.2" opacity="0.55" />

        {/* Embossed star emblem. */}
        <g transform="translate(159 140)">
          <circle r="44" fill="none" stroke="#1e0f06" strokeWidth="2" opacity="0.5" />
          <circle r="44" fill="none" stroke="#a87a44" strokeWidth="1" opacity="0.45" transform="translate(-1 -1)" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <path
              key={a}
              d={a % 90 === 0 ? 'M0 -40 L7 -7 L0 0 L-7 -7 Z' : 'M0 -26 L5 -5 L0 0 L-5 -5 Z'}
              transform={`rotate(${a})`}
              fill="#2e180c"
              stroke="#a87a44"
              strokeWidth="0.8"
              opacity="0.85"
            />
          ))}
          <circle r="5" fill="#a87a44" />
        </g>

        {/* Brass corners. */}
        {[
          [266, 30, 90],
          [266, 324, 180],
          [56, 324, 270],
          [56, 30, 0],
        ].map(([x, y, r]) => (
          <path key={`${x}${y}`} d="M0 0 L26 0 L26 7 L7 7 L7 26 L0 26 Z" transform={`translate(${x} ${y}) rotate(${r})`} fill="url(#jb-brass)" stroke="#3a2408" strokeWidth="1" />
        ))}

        {/* The strap wrapping round to the seal. */}
        <path d="M166 214 L276 210 L276 240 L166 244 Z" fill="#3a1f10" stroke="#1e0f06" strokeWidth="1.4" />
        <path d="M170 220 L272 216 M170 238 L272 234" stroke="#c9944a" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
        <rect x="150" y="208" width="26" height="40" rx="4" fill="none" stroke="url(#jb-brass)" strokeWidth="4" />
        <g transform="translate(214 228)">
          <path d="M-22 2 C-24 -14 -10 -24 4 -22 C18 -20 26 -8 22 6 C18 20 2 26 -10 20 C-20 16 -21 10 -22 2 Z" fill="url(#jb-wax)" stroke="#4a0a10" strokeWidth="1" />
          <circle r="12" fill="none" stroke="#4a0a10" strokeWidth="1.2" opacity="0.6" />
          <path d="M0 -8 L2.4 -2.4 L8 0 L2.4 2.4 L0 8 L-2.4 2.4 L-8 0 L-2.4 -2.4 Z" fill="#6e0e18" opacity="0.8" />
          <ellipse cx="-8" cy="-10" rx="6" ry="3" transform="rotate(-30 -8 -10)" fill="#fff" opacity="0.35" />
        </g>

        {/* Ribbon bookmark. */}
        <path d="M118 324 L118 374 L126 366 L134 374 L134 324 Z" fill="#2d4f86" stroke="#14264a" strokeWidth="1" />
      </g>

      {/* The quill, laid across the book, with its shadow. */}
      <g transform="rotate(16 260 180)">
        <path d="M268 22 C288 64 290 144 274 240 L268 240 C258 154 254 74 268 22 Z" fill="#000" opacity="0.35" filter="url(#jb-shadow)" />
        <path d="M262 18 C282 60 284 140 268 236 L262 236 C252 150 248 70 262 18 Z" fill="url(#jb-vane)" stroke="#0e1424" strokeWidth="1" />
        {Array.from({ length: 13 }, (_, i) => (
          <path key={i} d={`M265 ${46 + i * 14} L${276 - (i > 9 ? 4 : 0)} ${40 + i * 14} M265 ${46 + i * 14} L${254 + (i > 9 ? 3 : 0)} ${40 + i * 14}`} stroke="#8aa2c8" strokeWidth="0.7" opacity="0.6" />
        ))}
        <path d="M265 24 L265 290" stroke="#e8e0cc" strokeWidth="1.6" />
        <path d="M262 286 L268 286 L266 318 L264 318 Z" fill="url(#jb-brass)" stroke="#3a2408" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------ the window */

const STARS = (() => {
  const rnd = seeded(5);
  return Array.from({ length: 34 }, () => [rnd() * 600, rnd() * 120, rnd() < 0.25 ? 1.4 : 0.8] as const);
})();

/** One soft cloud: overlapping puffs, lit on top by the moon. */
function Cloud({ x, y, s }: { x: number; y: number; s: number }) {
  const puffs = [
    [0, 0, 34, 12],
    [26, -8, 26, 13],
    [52, 0, 32, 11],
    [-26, 4, 22, 8],
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#wv-blur)">
      {puffs.map(([dx, dy, rx, ry], i) => (
        <ellipse key={i} cx={dx} cy={dy} rx={rx} ry={ry} fill="#22346a" opacity="0.85" />
      ))}
      {puffs.map(([dx, dy, rx, ry], i) => (
        <ellipse key={`l${i}`} cx={dx - 2} cy={dy - ry * 0.45} rx={rx * 0.8} ry={ry * 0.45} fill="#6a84c4" opacity="0.4" />
      ))}
    </g>
  );
}

/** A dark pine, swaying gently from its base. */
function Pine({ x, base, h, delay }: { x: number; base: number; h: number; delay: number }) {
  const w = h * 0.36;
  return (
    <g className="wv-tree" style={{ animationDelay: `${delay}s` }}>
      <path
        d={`M${x} ${base - h} L${x + w * 0.45} ${base - h * 0.62} L${x + w * 0.25} ${base - h * 0.62} L${x + w * 0.7} ${base - h * 0.3} L${x + w * 0.4} ${base - h * 0.3} L${x + w} ${base} L${x - w} ${base} L${x - w * 0.4} ${base - h * 0.3} L${x - w * 0.7} ${base - h * 0.3} L${x - w * 0.25} ${base - h * 0.62} L${x - w * 0.45} ${base - h * 0.62} Z`}
        fill="#060b1a"
      />
    </g>
  );
}

/** The castle silhouette, used once upright and once as its lake reflection. */
function Castle() {
  return (
    <g>
      <path
        d="M372 186 L372 132 L380 132 L380 118 L376 118 L384 98 L392 118 L388 118 L388 132 L404 132 L404 112 L398 112 L410 84 L422 112 L416 112 L416 140 L436 140 L436 124 L432 124 L440 104 L448 124 L444 124 L444 140 L462 140 L462 120 L458 120 L466 102 L474 120 L470 120 L470 186 Z"
        fill="#0b1330"
      />
      {/* Moonlit faces on the towers' left sides (the moon is to the left). */}
      <path d="M380 118 L384 118 L384 132 L380 132 Z M404 112 L410 112 L410 132 L404 132 Z M436 124 L440 124 L440 140 L436 140 Z M462 120 L466 120 L466 140 L462 140 Z" fill="#1d2b58" />
      <path d="M376 118 L384 98 M398 112 L410 84 M432 124 L440 104 M458 120 L466 102" stroke="#3a4f8a" strokeWidth="1" />
      {/* Curtain walls with crenellations down to the cliff. */}
      <path d="M350 186 L350 158 L354 158 L354 154 L358 154 L358 158 L362 158 L362 154 L366 154 L366 158 L372 158 L372 186 Z" fill="#0b1330" />
      <path d="M470 186 L470 160 L476 160 L476 156 L480 156 L480 160 L486 160 L486 156 L490 156 L490 160 L494 160 L494 186 Z" fill="#0b1330" />
    </g>
  );
}

const LIT = [
  [382, 140],
  [409, 120],
  [409, 134],
  [439, 146],
  [466, 128],
  [424, 160],
  [396, 166],
  [452, 168],
];

/** Where the castle burns once its chapter is won: [x, y (the flame's foot), scale]. */
const BLAZES: [number, number, number][] = [
  [467, 119, 1],
  [410.5, 139, 0.7],
  [360, 154, 0.5],
];

/** A small fire with its glow, a rising wisp of smoke and a few embers, its
 *  foot at the origin. */
function Blaze({ x, y, s, delay }: { x: number; y: number; s: number; delay: number }) {
  const d = (k: number) => ({ animationDelay: `${delay + k}s` });
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 1, 2].map((i) => (
        <circle key={i} className="wv-smoke" cx="1" cy="-16" r="5" fill="#4a4658" filter="url(#wv-blur)" style={d(i * -1.6)} />
      ))}
      <circle className="wv-fire-glow" cy="-6" r="20" fill="url(#wv-fire-glow)" style={d(0)} />
      <g className="wv-flame" style={d(-0.4)}>
        <path d="M0 0 C-5 0 -6 -4 -4 -8 C-3 -11 -1 -12 0 -17 C1 -12 4.5 -10 4.5 -6 C5 -2.5 3.5 0 0 0 Z" fill="#d9481f" />
        <path d="M0 0 C-3 0 -3.5 -3 -2 -6 C-1 -8 0 -9 0.4 -11.5 C1.6 -8.5 2.8 -6 2.5 -3.5 C2.4 -1 1.5 0 0 0 Z" fill="#ffa63d" />
        <path d="M0 0 C-1.4 0 -1.6 -1.8 -0.6 -3.6 L0.3 -5.6 C1 -3.8 1.4 -2.4 1.2 -1.2 C1 -0.2 0.6 0 0 0 Z" fill="#ffe7a0" />
      </g>
      <g className="wv-flame" style={d(-1.1)}>
        <path d="M-3 0 C-6 -1 -6.5 -4 -5 -7 L-4.4 -10 C-3 -7 -1.5 -5 -1.6 -2.5 C-1.7 -1 -2 0 -3 0 Z" fill="#e8642a" />
      </g>
      {[-2, 1.5, 3].map((ex, i) => (
        <circle key={i} className="wv-ember" cx={ex} cy="-8" r="0.7" fill="#ffc46a" style={d(i * -0.9)} />
      ))}
    </g>
  );
}

/** The moonlit view through the window: drifting clouds, a lit castle on its
 *  cliff, a bridge, a lake that glitters, birds, fireflies, a shooting star.
 *  Once the Castle chapter is won (`burning`), the castle smoulders: a few
 *  small fires on its roofs and walls. */
export function WindowView({ burning = false }: { burning?: boolean }) {
  return (
    <svg className="desk-window-view" viewBox="0 0 600 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="wv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#081028" />
          <stop offset="0.55" stopColor="#1c3266" />
          <stop offset="1" stopColor="#3c5894" />
        </linearGradient>
        <radialGradient id="wv-moon" cx="0.42" cy="0.4">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#e8eeff" />
          <stop offset="1" stopColor="#b8c8ef" />
        </radialGradient>
        <radialGradient id="wv-halo">
          <stop offset="0" stopColor="#c8d8ff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#c8d8ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wv-lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e3264" />
          <stop offset="1" stopColor="#0a1430" />
        </linearGradient>
        <linearGradient id="wv-meteor" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.95" />
        </linearGradient>
        <filter id="wv-blur" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <radialGradient id="wv-fire-glow">
          <stop offset="0" stopColor="#ff8a3a" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#ff6a2a" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ff6a2a" stopOpacity="0" />
        </radialGradient>
        <filter id="wv-haze" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      <rect width="600" height="260" fill="url(#wv-sky)" />
      {/* A faint band of the galaxy. */}
      <path d="M-20 120 Q200 30 620 10" stroke="#8aa0e0" strokeWidth="38" opacity="0.07" fill="none" filter="url(#wv-haze)" />
      {STARS.map(([x, y, r], i) => (
        <circle key={i} className="wv-star" cx={x} cy={y} r={r} fill="#fff" style={{ animationDelay: `${(i * 0.53) % 5}s` }} />
      ))}
      <g className="wv-meteor">
        <path d="M120 30 L178 12" stroke="url(#wv-meteor)" strokeWidth="1.6" strokeLinecap="round" />
      </g>

      <circle className="wv-halo" cx="250" cy="66" r="78" fill="url(#wv-halo)" />
      <circle cx="250" cy="66" r="24" fill="url(#wv-moon)" />
      <circle cx="242" cy="60" r="4" fill="#9fb0d8" opacity="0.25" />
      <circle cx="257" cy="72" r="5.5" fill="#9fb0d8" opacity="0.2" />
      <circle cx="252" cy="56" r="2.4" fill="#9fb0d8" opacity="0.25" />

      <g className="wv-cloud c1">
        <Cloud x={120} y={58} s={1.1} />
      </g>
      <g className="wv-cloud c2">
        <Cloud x={380} y={36} s={0.8} />
      </g>
      <g className="wv-cloud c3">
        <Cloud x={40} y={100} s={0.7} />
      </g>

      {/* Ranges fading into the distance. */}
      <path d="M0 150 L50 124 L84 136 L130 104 L176 132 L214 116 L262 140 L320 108 L352 124 L400 100 L452 130 L510 106 L560 128 L600 116 L600 260 L0 260 Z" fill="#26386a" />
      <path d="M130 104 L124 112 L136 114 Z M320 108 L314 116 L326 118 Z M400 100 L394 108 L406 110 Z" fill="#4a5f98" opacity="0.6" />

      <g className="wv-birds">
        {[
          [0, 0],
          [14, 6],
          [-10, 9],
        ].map(([dx, dy], i) => (
          <path key={i} className="wv-wing" d={`M${dx - 5} ${dy} q5 -4 5 0 q0 -4 5 0`} stroke="#0a1024" strokeWidth="1.3" fill="none" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </g>

      <path d="M0 176 L70 156 L120 166 L180 150 L240 168 L300 160 L330 170 L330 260 L0 260 Z" fill="#17254c" />
      {/* The cliff and its castle. */}
      <path d="M330 260 L330 190 L346 184 L500 182 L520 196 L560 192 L600 200 L600 260 Z" fill="#0d1634" />
      <Castle />
      {LIT.map(([x, y], i) => (
        <rect key={i} className="wv-lit" x={x} y={y} width="3" height="5" rx="1" fill="#ffc46a" style={{ animationDelay: `${i * 0.7}s` }} />
      ))}
      <g transform="translate(410 84)">
        <path d="M0 0 L0 -12" stroke="#0b1330" strokeWidth="1.2" />
        <path className="wv-flag" d="M0 -12 L11 -9 L0 -6 Z" fill="#a83a3a" />
      </g>
      {burning && BLAZES.map(([x, y, s], i) => <Blaze key={i} x={x} y={y} s={s} delay={i * -0.7} />)}

      {/* The bridge from the far shore to the cliff, its lanterns lit. */}
      <path d="M150 192 L340 186 L340 196 L150 202 Z" fill="#0f1a3a" />
      {[170, 210, 250, 290].map((x) => (
        <path key={x} d={`M${x} 200 L${x} 214 M${x + 6} 200 Q${x + 20} 188 ${x + 34} 198 L${x + 34} 214`} stroke="#0f1a3a" strokeWidth="5" fill="none" />
      ))}
      {[176, 236, 296].map((x, i) => (
        <circle key={x} className="wv-lit" cx={x} cy="186" r="1.6" fill="#ffcf80" style={{ animationDelay: `${i * 1.3}s` }} />
      ))}

      {/* The lake: castle reflection, moon glitter, drifting mist. */}
      <rect x="0" y="204" width="600" height="56" fill="url(#wv-lake)" />
      <g transform="translate(0 404) scale(1 -1)" opacity="0.28" filter="url(#wv-blur)">
        <Castle />
      </g>
      {LIT.slice(0, 5).map(([x], i) => (
        <rect key={i} className="wv-glint" x={x - 2} y={214 + i * 3} width="7" height="1.4" fill="#ffc46a" opacity="0.5" style={{ animationDelay: `${i * 0.6}s` }} />
      ))}
      {burning &&
        BLAZES.map(([x, , s], i) => (
          <rect key={i} className="wv-glint" x={x - 5 * s} y={208 + i * 2} width={10 * s} height="1.6" rx="0.8" fill="#ff8a3a" opacity="0.6" style={{ animationDelay: `${i * -0.8}s` }} />
        ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} className="wv-glint" x={238 - i * 3} y={212 + i * 8} width={22 + i * 7} height="1.6" rx="0.8" fill="#dfe8ff" opacity="0.55" style={{ animationDelay: `${i * 0.45}s` }} />
      ))}
      <rect className="wv-mist" x="-60" y="198" width="460" height="14" rx="7" fill="#9fb4e8" opacity="0.12" filter="url(#wv-haze)" />

      {/* Near shore pines, swaying. */}
      <path d="M0 236 L80 222 L150 238 L210 228 L240 260 L0 260 Z" fill="#070d1f" />
      <path d="M600 232 L540 220 L480 236 L440 230 L410 260 L600 260 Z" fill="#070d1f" />
      <Pine x={22} base={244} h={62} delay={0} />
      <Pine x={52} base={240} h={46} delay={-1.5} />
      <Pine x={96} base={236} h={38} delay={-3} />
      <Pine x={580} base={240} h={64} delay={-2} />
      <Pine x={548} base={236} h={44} delay={-0.7} />
      <Pine x={506} base={238} h={34} delay={-2.4} />
      {[
        [130, 228],
        [168, 222],
        [460, 226],
        [210, 232],
        [500, 222],
      ].map(([x, y], i) => (
        <circle key={i} className="wv-fly" cx={x} cy={y} r="1.3" fill="#e8ff9a" style={{ animationDelay: `${i * 1.1}s` }} />
      ))}
    </svg>
  );
}

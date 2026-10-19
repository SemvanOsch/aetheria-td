/**
 * Inline-SVG illustrations for the home screen once the Capital has fallen:
 * the desk becomes a table in an upstairs room of the inn at the forest's
 * edge (where the Getaway's ride ends). The window looks out over the inn
 * yard (the wagon parked, the stable roof, the inn's own sign swinging) to
 * the road into the old forest, with the Capital still burning on the far
 * horizon. The table carries tavern clutter instead of the desk's: an ale jug
 * and a tankard, a candle in a wine bottle, a tallow stub in a clay saucer,
 * the room key, bread and cheese; dried herbs and a plate shelf hang on the
 * timbered wall. Same conventions as `DeskArt` (ids prefixed per SVG, motion
 * in CSS so reduced motion stills it).
 */
import { rng as seeded } from '../../engine/palette';
import { Candle, CandleDefs } from './DeskArt';

/** A treeline silhouette from x0 to x1: the rounded crowns of old oaks with
 *  the odd pine spire, its valleys along `y`, filled down to the bottom. */
function treeline(x0: number, x1: number, y: number, size: number, seed: number, pines: number): string {
  const rnd = seeded(seed);
  let d = `M${x0} 260 L${x0} ${y}`;
  let x = x0;
  while (x1 - x > 4) {
    const w = Math.min(size * (0.6 + rnd() * 0.8), x1 - x);
    const base = (y + (rnd() - 0.5) * size * 0.25).toFixed(1);
    if (rnd() < pines) {
      const h = size * (0.9 + rnd() * 0.6);
      d += ` L${(x + w * 0.2).toFixed(1)} ${base} L${(x + w * 0.5).toFixed(1)} ${(y - h).toFixed(1)} L${(x + w * 0.8).toFixed(1)} ${base}`;
    } else {
      const top = (y - size * (0.35 + rnd() * 0.5)).toFixed(1);
      d += ` Q${x.toFixed(1)} ${top} ${(x + w / 2).toFixed(1)} ${top} Q${(x + w).toFixed(1)} ${top} ${(x + w).toFixed(1)} ${base}`;
    }
    x += w;
  }
  return `${d} L${x.toFixed(1)} 260 Z`;
}

const STARS = (() => {
  const rnd = seeded(11);
  return Array.from({ length: 40 }, () => [rnd() * 600, rnd() * 128, rnd() < 0.2 ? 1.4 : 0.8] as const);
})();

/** A thin wisp of night cloud. */
function Wisp({ x, y, s }: { x: number; y: number; s: number }) {
  const puffs = [
    [0, 0, 40, 7],
    [34, -4, 26, 7],
    [-30, 3, 24, 5],
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#iv-blur)">
      {puffs.map(([dx, dy, rx, ry], i) => (
        <ellipse key={i} cx={dx} cy={dy} rx={rx} ry={ry} fill="#262b5a" opacity="0.8" />
      ))}
      {puffs.map(([dx, dy, rx, ry], i) => (
        <ellipse key={`l${i}`} cx={dx + 3} cy={dy - ry * 0.4} rx={rx * 0.75} ry={ry * 0.4} fill="#7078b4" opacity="0.32" />
      ))}
    </g>
  );
}

/** The covered wagon parked in the yard, its tail lantern still lit. */
function Wagon() {
  return (
    <g transform="translate(150 234)">
      <ellipse cx="4" cy="1" rx="58" ry="4" fill="#000" opacity="0.4" />
      {/* The shafts resting on the ground, the team stabled for the night. */}
      <path d="M36 -12 L84 0 M36 -8 L80 2" stroke="#0c0a14" strokeWidth="2.4" strokeLinecap="round" />
      {/* The canvas hood, moonlit from the right, over its hoops. */}
      <path d="M-42 -24 C-46 -60 38 -62 38 -24 Z" fill="#363a5a" />
      <path d="M-8 -50 C14 -54 34 -46 38 -24 L10 -24 C10 -36 4 -46 -8 -50 Z" fill="#4a5078" />
      {[-30, -14, 4, 22].map((x) => (
        <path key={x} d={`M${x} -24 C${x - 2} -40 ${x + 1} -52 ${x + 3} -54`} stroke="#22253e" strokeWidth="1.2" fill="none" />
      ))}
      <path d="M-34 -40 C-24 -56 22 -58 34 -38" stroke="#8a90bc" strokeWidth="1.2" fill="none" opacity="0.45" />
      <ellipse cx="37" cy="-30" rx="3" ry="8" fill="#0a0812" />
      {/* The bed and its wheels. */}
      <rect x="-46" y="-26" width="86" height="14" rx="1.5" fill="#1c1626" />
      <path d="M-46 -24 H40" stroke="#3a3048" strokeWidth="1" />
      {[-28, 24].map((x) => (
        <g key={x} transform={`translate(${x} -7)`}>
          <circle r="11" fill="none" stroke="#0c0a14" strokeWidth="2.6" />
          {[0, 45, 90, 135].map((a) => (
            <path key={a} d="M-10 0 H10" stroke="#0c0a14" strokeWidth="1.3" transform={`rotate(${a})`} />
          ))}
          <circle r="2.4" fill="#0c0a14" />
          <path d="M3 -10 A10.5 10.5 0 0 1 10 -3" stroke="#4a4e70" strokeWidth="1" fill="none" />
        </g>
      ))}
      {/* The tail lantern on its hook. */}
      <circle className="cd-halo" cx="-50" cy="-30" r="30" fill="url(#iv-lamp)" />
      <path d="M-46 -24 L-46 -40 L-50 -40 L-50 -37" stroke="#0c0a14" strokeWidth="1.4" fill="none" />
      <rect x="-53" y="-36" width="6" height="9" rx="1" fill="#ffd27a" stroke="#1a1218" strokeWidth="1" />
    </g>
  );
}

/** The inn's own sign, a gilt tankard on green, swinging on its bracket. */
function InnSign() {
  return (
    <g>
      <path d="M612 30 H500 M600 30 C584 30 578 44 590 52" stroke="#0e0c14" strokeWidth="2.4" fill="none" />
      <circle cx="500" cy="30" r="2" fill="#0e0c14" />
      <g className="iv-sign" style={{ transformOrigin: '526px 30px' }}>
        <path d="M510 30 L508 42 M542 30 L544 42" stroke="#0e0c14" strokeWidth="1.2" />
        <rect x="504" y="42" width="44" height="32" rx="2" fill="#1d3226" stroke="#0a120c" strokeWidth="1.5" />
        <rect x="507" y="45" width="38" height="26" rx="1" fill="none" stroke="#a8843a" strokeWidth="1.2" />
        <rect x="520" y="51" width="11" height="14" rx="1" fill="#b8923e" />
        <ellipse cx="525.5" cy="51" rx="6.5" ry="2.4" fill="#e8dcbc" />
        <path d="M531 54 C537 54 537 62 531 62" stroke="#b8923e" strokeWidth="1.8" fill="none" />
        {/* Warm light from the windows below catching its lower edge. */}
        <path d="M505 73.5 H547" stroke="#ffb860" strokeWidth="1.2" opacity="0.45" />
      </g>
    </g>
  );
}

/** The night view from the inn's upstairs window: stars and a crescent moon,
 *  the Capital burning on the far horizon, the old forest in layers with mist
 *  between them, the road running off into the trees, the yard below with the
 *  wagon and the stable roof, the inn's sign, an owl's eyes, bats, fireflies. */
export function InnWindowView() {
  return (
    <svg className="desk-window-view" viewBox="0 0 600 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="iv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#080a20" />
          <stop offset="0.55" stopColor="#1a2050" />
          <stop offset="1" stopColor="#36366a" />
        </linearGradient>
        <radialGradient id="iv-moon" cx="0.6" cy="0.4">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#f2eedc" />
          <stop offset="1" stopColor="#c8c4ae" />
        </radialGradient>
        <radialGradient id="iv-halo">
          <stop offset="0" stopColor="#e8e2c8" stopOpacity="0.4" />
          <stop offset="1" stopColor="#e8e2c8" stopOpacity="0" />
        </radialGradient>
        <mask id="iv-crescent">
          <circle cx="470" cy="60" r="17" fill="#fff" />
          <circle cx="462" cy="55" r="15" fill="#000" />
        </mask>
        <radialGradient id="iv-burn">
          <stop offset="0" stopColor="#ff7a34" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#d8482a" stopOpacity="0.18" />
          <stop offset="1" stopColor="#d8482a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="iv-lamp">
          <stop offset="0" stopColor="#ffd890" stopOpacity="0.6" />
          <stop offset="0.4" stopColor="#ff9e48" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ff9e48" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="iv-spill">
          <stop offset="0" stopColor="#ffb25a" stopOpacity="0.3" />
          <stop offset="1" stopColor="#ffb25a" stopOpacity="0" />
        </radialGradient>
        <filter id="iv-blur" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <filter id="iv-haze" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      <rect width="600" height="260" fill="url(#iv-sky)" />
      {STARS.map(([x, y, r], i) => (
        <circle key={i} className="wv-star" cx={x} cy={y} r={r} fill="#fff" style={{ animationDelay: `${(i * 0.61) % 5}s` }} />
      ))}

      {/* A waning crescent, lit from the right. */}
      <circle className="wv-halo" cx="470" cy="60" r="62" fill="url(#iv-halo)" />
      <circle cx="470" cy="60" r="17" fill="url(#iv-moon)" mask="url(#iv-crescent)" />

      <g className="wv-cloud c1">
        <Wisp x={160} y={48} s={1} />
      </g>
      <g className="wv-cloud c2">
        <Wisp x={420} y={92} s={0.8} />
      </g>

      {/* The far ridge, and on it the Capital, still burning a day's ride behind. */}
      <ellipse className="wv-fire-glow" cx="78" cy="150" rx="110" ry="40" fill="url(#iv-burn)" />
      <path d="M0 158 L36 150 L80 152 L130 144 L190 152 L250 146 L320 154 L380 146 L450 152 L520 144 L600 150 L600 260 L0 260 Z" fill="#1c2250" />
      <path
        d="M44 152 L44 144 L48 144 L50 136 L52 144 L58 144 L58 140 L64 140 L66 128 L68 140 L74 140 L74 134 L80 134 L82 124 L84 134 L90 134 L90 142 L98 142 L100 136 L102 142 L110 142 L110 152 Z"
        fill="#161838"
      />
      {[
        [66, 136],
        [82, 131],
        [96, 145],
        [52, 146],
      ].map(([x, y], i) => (
        <circle key={i} className="wv-lit" cx={x} cy={y} r="1.2" fill="#ff9a4a" style={{ animationDelay: `${i * -0.8}s` }} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} className="wv-smoke" cx={70 + (i % 2) * 14} cy="126" r="7" fill="#3a3048" filter="url(#iv-blur)" style={{ animationDelay: `${i * -1.2}s` }} />
      ))}

      <g className="wv-birds">
        {[
          [0, 0],
          [16, 7],
          [-12, 10],
        ].map(([dx, dy], i) => (
          <path
            key={i}
            className="wv-wing"
            d={`M${dx} ${dy} l-3 -2 l-2 1 l-2 -2 l0.6 3 l3 1.4 Z M${dx} ${dy} l3 -2 l2 1 l2 -2 l-0.6 3 l-3 1.4 Z`}
            fill="#0a0c1e"
            style={{ animationDelay: `${i * 0.1}s` }}
          />
        ))}
      </g>

      {/* The old forest: a far line, mist, then the near wood split by the road. */}
      <path d={treeline(-10, 610, 174, 18, 3, 0.2)} fill="#121a3c" />
      <rect className="wv-mist" x="-80" y="168" width="520" height="16" rx="8" fill="#8a96d0" opacity="0.12" filter="url(#iv-haze)" />
      <path d={treeline(-10, 362, 196, 30, 7, 0.35)} fill="#0a1028" />
      <path d={treeline(392, 610, 196, 30, 9, 0.35)} fill="#0a1028" />
      {/* An owl in the dark of the trees, blinking. */}
      <g className="iv-owl">
        <circle cx="520" cy="184" r="1.3" fill="#ffd75a" />
        <circle cx="525" cy="184" r="1.3" fill="#ffd75a" />
      </g>

      {/* The yard, and the road leaving it into the trees. */}
      <path d="M0 202 Q150 194 300 200 T600 198 L600 260 L0 260 Z" fill="#0b1128" />
      <path d="M262 260 C290 236 352 222 371 198 L381 198 C378 222 338 240 354 260 Z" fill="#2a2a44" />
      <path d="M296 260 C312 238 356 222 375 199" stroke="#3c3c5c" strokeWidth="5" fill="none" opacity="0.7" />
      <path d="M280 260 C304 236 354 222 373 199 M338 260 C334 236 368 222 379 199" stroke="#1c1c32" strokeWidth="1" fill="none" />
      {[
        [300, 214],
        [420, 214],
        [250, 206],
        [458, 204],
        [340, 210],
      ].map(([x, y], i) => (
        <circle key={i} className="wv-fly" cx={x} cy={y} r="1.3" fill="#e8ff9a" style={{ animationDelay: `${i * 1.3}s` }} />
      ))}

      {/* A split-rail fence along the yard. */}
      {[8, 44, 80, 116].map((x) => (
        <rect key={x} x={x} y="208" width="3" height="20" fill="#0a0d1e" />
      ))}
      <path d="M0 212 L120 210 M0 220 L120 218" stroke="#0a0d1e" strokeWidth="2.4" />

      <Wagon />

      {/* Light from the downstairs windows spilling across the yard. */}
      <g filter="url(#iv-haze)">
        <ellipse className="iv-spill" cx="100" cy="270" rx="110" ry="26" fill="url(#iv-spill)" />
        <ellipse className="iv-spill" cx="330" cy="270" rx="80" ry="20" fill="url(#iv-spill)" style={{ animationDelay: '-2s' }} />
      </g>

      {/* The stable's thatched roof below the window. */}
      <path d="M408 262 Q440 236 470 222 L612 204 L612 262 Z" fill="#1a1520" />
      {Array.from({ length: 26 }, (_, i) => {
        const x = 440 + i * 6.4;
        const y = 228 - i * 0.9;
        return <path key={i} d={`M${x} ${y} l2 9`} stroke="#2e2630" strokeWidth="1.2" />;
      })}
      <path d="M470 222 L612 204" stroke="#6a6250" strokeWidth="1.6" opacity="0.7" />
      <path d="M408 262 Q440 236 470 222" stroke="#3a3238" strokeWidth="1.4" fill="none" />

      <InnSign />
    </svg>
  );
}

/* ------------------------------------------------------------ the wall */

/** Bunches of herbs and a garlic braid drying from a peg rail. */
export function HerbsArt() {
  const lavender = Array.from({ length: 9 }, (_, i) => -14 + i * 3.5);
  const sage = Array.from({ length: 7 }, (_, i) => -12 + i * 4);
  return (
    <svg className="inn-art herbs-art" viewBox="0 0 160 220" aria-hidden="true">
      <rect x="0" y="4" width="160" height="10" rx="1.5" fill="#2e1a0c" />
      <rect x="0" y="5" width="160" height="2" fill="#5a3a20" opacity="0.6" />
      {[30, 80, 128].map((x) => (
        <rect key={x} x={x - 3} y="10" width="6" height="7" rx="2" fill="#1c0f06" />
      ))}

      {/* Lavender, heads down. */}
      <g className="ih-sway" style={{ transformOrigin: '30px 14px' }}>
        <path d="M30 16 V40" stroke="#8a7650" strokeWidth="1" />
        {lavender.map((dx, i) => (
          <g key={i}>
            <path d={`M30 42 L${30 + dx} ${96 + (i % 3) * 6}`} stroke="#4e5a34" strokeWidth="1.1" />
            <ellipse cx={30 + dx * 1.04} cy={104 + (i % 3) * 6} rx="2.2" ry="7" fill={i % 2 ? '#6e5290' : '#8a6aa8'} />
          </g>
        ))}
        <rect x="25" y="38" width="10" height="6" rx="1" fill="#a88a58" />
      </g>

      {/* Sage, long and grey-green. */}
      <g className="ih-sway" style={{ transformOrigin: '80px 14px', animationDelay: '-2.6s' }}>
        <path d="M80 16 V36" stroke="#8a7650" strokeWidth="1" />
        {sage.map((dx, i) => {
          const ex = 80 + dx * 1.4;
          const ey = 128 + (i % 2) * 12;
          return (
            <g key={i}>
              <path d={`M80 38 L${ex} ${ey}`} stroke="#4a5038" strokeWidth="1.2" />
              {[0.35, 0.55, 0.75, 0.95].map((f) => (
                <ellipse
                  key={f}
                  cx={80 + (ex - 80) * f}
                  cy={38 + (ey - 38) * f}
                  rx="2.6"
                  ry="6"
                  fill={f > 0.6 ? '#6e7a5c' : '#5a6648'}
                  transform={`rotate(${dx * 2} ${80 + (ex - 80) * f} ${38 + (ey - 38) * f})`}
                />
              ))}
            </g>
          );
        })}
        <rect x="75" y="34" width="10" height="6" rx="1" fill="#a88a58" />
      </g>

      {/* A garlic braid. */}
      <g className="ih-sway" style={{ transformOrigin: '128px 14px', animationDelay: '-4.1s' }}>
        <path d="M128 16 C122 60 134 110 128 190" stroke="#9a8458" strokeWidth="5" fill="none" />
        {Array.from({ length: 9 }, (_, i) => {
          const y = 40 + i * 17;
          const x = 128 + (i % 2 ? 7 : -7);
          return (
            <g key={i}>
              <path d={`M${x} ${y - 9} q-1 -6 ${i % 2 ? -5 : 5} -9`} stroke="#9a8458" strokeWidth="2" fill="none" />
              <path d={`M${x} ${y - 9} C${x + 9} ${y - 7} ${x + 10} ${y + 6} ${x} ${y + 8} C${x - 10} ${y + 6} ${x - 9} ${y - 7} ${x} ${y - 9} Z`} fill="#d8ccac" />
              <path d={`M${x - 3} ${y - 5} Q${x - 4} ${y + 2} ${x - 1} ${y + 7} M${x + 3} ${y - 5} Q${x + 4} ${y + 2} ${x + 1} ${y + 7}`} stroke="#9a7a9a" strokeWidth="0.8" fill="none" opacity="0.7" />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** A plank shelf of pewter plates and a crock, tankards hanging beneath. */
export function PlateShelfArt() {
  return (
    <svg className="inn-art shelf-art" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="ps-pewter" cx="0.38" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#b8bcc2" />
          <stop offset="0.6" stopColor="#6e727a" />
          <stop offset="1" stopColor="#3a3d44" />
        </radialGradient>
        <linearGradient id="ps-mug" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3a3d44" />
          <stop offset="0.35" stopColor="#a4a8ae" />
          <stop offset="0.7" stopColor="#5e626a" />
          <stop offset="1" stopColor="#2a2d33" />
        </linearGradient>
        <linearGradient id="ps-crock" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3a2412" />
          <stop offset="0.4" stopColor="#8a5a2e" />
          <stop offset="1" stopColor="#2e1a0c" />
        </linearGradient>
      </defs>
      {/* Plates standing on edge against the wall. */}
      {[44, 78].map((x) => (
        <g key={x}>
          <circle cx={x} cy="94" r="27" fill="url(#ps-pewter)" stroke="#22242a" strokeWidth="1" />
          <circle cx={x} cy="94" r="17" fill="none" stroke="#2e3036" strokeWidth="1" opacity="0.6" />
          <path d={`M${x - 18} ${80} A22 22 0 0 1 ${x - 4} ${70}`} stroke="#e4e8ee" strokeWidth="1.6" fill="none" opacity="0.45" />
        </g>
      ))}
      {/* A lidded crock. */}
      <path d="M116 120 C110 104 112 86 120 80 L148 80 C156 86 158 104 152 120 Z" fill="url(#ps-crock)" stroke="#1a0e06" strokeWidth="1" />
      <ellipse cx="134" cy="80" rx="15" ry="4" fill="#5a3a1c" stroke="#1a0e06" strokeWidth="1" />
      <circle cx="134" cy="75" r="3.5" fill="#5a3a1c" stroke="#1a0e06" strokeWidth="1" />
      <path d="M114 96 H154" stroke="#d8c8a0" strokeWidth="2" opacity="0.4" />
      {/* Two bowls, stacked. */}
      <path d="M164 120 Q166 108 184 108 Q194 108 196 120 Z" fill="#6a4426" stroke="#1a0e06" strokeWidth="1" />
      <path d="M166 110 Q170 100 182 100 Q192 100 194 110" fill="#7a5030" stroke="#1a0e06" strokeWidth="1" />

      {/* The shelf on its iron brackets. */}
      <rect x="0" y="120" width="200" height="10" rx="1.5" fill="#3e2412" stroke="#1a0e06" strokeWidth="1" />
      <rect x="0" y="121" width="200" height="2" fill="#7a5030" opacity="0.6" />
      {[26, 174].map((x) => (
        <path key={x} d={`M${x} 130 V156 M${x} 131 Q${x + 2} 150 ${x + 18} 131`} stroke="#1a1a20" strokeWidth="2.6" fill="none" />
      ))}

      {/* Tankards hanging by their handles from hooks under it. */}
      {[64, 100, 136].map((x, i) => (
        <g key={x} className="ih-sway" style={{ transformOrigin: `${x}px 132px`, animationDelay: `${i * -1.7}s` }}>
          <path d={`M${x} 130 v4`} stroke="#1a1a20" strokeWidth="1.6" />
          <path d={`M${x} 134 C${x + 10} 134 ${x + 10} 146 ${x + 4} 148`} stroke="url(#ps-mug)" strokeWidth="3.2" fill="none" />
          <path d={`M${x - 14} 142 L${x - 12} 168 L${x + 6} 168 L${x + 8} 142 Z`} fill="url(#ps-mug)" stroke="#1e2026" strokeWidth="1" transform={`rotate(-8 ${x} 134)`} />
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------ the table */

/** Back-left: a salt-glazed ale jug and a pewter tankard with its head of foam. */
export function AleArt() {
  return (
    <svg className="desk-art ale-art" viewBox="0 0 250 250" aria-hidden="true">
      <defs>
        <CandleDefs p="al" />
        <linearGradient id="al-jug" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3e3226" />
          <stop offset="0.3" stopColor="#a8967a" />
          <stop offset="0.6" stopColor="#7a6a52" />
          <stop offset="1" stopColor="#2e261c" />
        </linearGradient>
        <linearGradient id="al-pewter" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3e424a" />
          <stop offset="0.3" stopColor="#c8ccd2" />
          <stop offset="0.6" stopColor="#7a7e86" />
          <stop offset="1" stopColor="#2a2d33" />
        </linearGradient>
        <filter id="al-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <ellipse cx="130" cy="240" rx="110" ry="9" fill="url(#al-pool)" />
      <ellipse cx="82" cy="241" rx="44" ry="6" fill="#000" opacity="0.55" filter="url(#al-soft)" />
      <ellipse cx="178" cy="241" rx="32" ry="5" fill="#000" opacity="0.55" filter="url(#al-soft)" />

      {/* The jug. */}
      <path d="M118 132 C150 132 156 182 120 196" stroke="url(#al-jug)" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M50 238 C36 212 38 172 58 152 C62 142 62 130 60 120 L104 120 C102 130 102 142 106 152 C126 172 128 212 114 238 Z" fill="url(#al-jug)" stroke="#1c140c" strokeWidth="1.2" />
      <path d="M46 176 Q82 186 118 176 M45 184 Q82 194 119 184" stroke="#2c4a8a" strokeWidth="2.6" fill="none" opacity="0.85" />
      <path d="M70 196 q6 -8 12 0 q6 8 12 0" stroke="#2c4a8a" strokeWidth="2" fill="none" opacity="0.7" />
      <ellipse cx="82" cy="120" rx="23" ry="5" fill="#4a3e30" stroke="#1c140c" strokeWidth="1" />
      <ellipse cx="82" cy="120" rx="18" ry="3.4" fill="#140e08" />
      <path d="M60 118 L50 112 L62 124 Z" fill="#6a5a46" stroke="#1c140c" strokeWidth="0.8" />
      <path d="M56 162 C50 182 52 210 60 228" stroke="#fff" strokeWidth="3" fill="none" opacity="0.22" strokeLinecap="round" />

      {/* The tankard, foam spilling over its rim. */}
      <path d="M198 186 C224 186 226 224 198 228" stroke="url(#al-pewter)" strokeWidth="7" fill="none" />
      <path d="M152 238 L156 176 L198 176 L202 238 Z" fill="url(#al-pewter)" stroke="#1e2026" strokeWidth="1.2" />
      <path d="M155 188 H199 M153 226 H201" stroke="#2a2d33" strokeWidth="2" />
      <path d="M154 178 C148 168 158 158 168 163 C172 152 188 154 190 163 C200 158 208 170 200 179 Z" fill="#efe4c8" />
      <path d="M158 172 C164 168 172 170 176 168 M182 166 C188 166 194 170 198 172" stroke="#c8b488" strokeWidth="1.4" fill="none" />
      <path d="M160 178 C160 188 156 192 158 198" stroke="#efe4c8" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="158" cy="199" r="2.6" fill="#efe4c8" />
      <path d="M163 192 L162 232" stroke="#fff" strokeWidth="2.4" opacity="0.2" strokeLinecap="round" />
    </svg>
  );
}

/** Back-right: a candle stuck in a wine bottle, years of wax run down it. */
export function BottleCandleArt() {
  const p = 'bc';
  return (
    <svg className="desk-art bottle-art" viewBox="0 0 220 290" aria-hidden="true">
      <defs>
        <CandleDefs p={p} />
        <linearGradient id="bc-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#081a10" />
          <stop offset="0.3" stopColor="#2a6a44" />
          <stop offset="0.55" stopColor="#184a2e" />
          <stop offset="1" stopColor="#06140c" />
        </linearGradient>
        <filter id="bc-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <ellipse cx="136" cy="282" rx="64" ry="9" fill={`url(#${p}-pool)`} />
      <ellipse cx="138" cy="283" rx="34" ry="6" fill="#000" opacity="0.55" filter="url(#bc-soft)" />

      {/* The bottle. */}
      <path d="M112 280 L112 206 Q112 188 128 180 L130 150 L142 150 L144 180 Q160 188 160 206 L160 280 Q136 286 112 280 Z" fill="url(#bc-glass)" stroke="#04100a" strokeWidth="1.2" />
      <rect x="128" y="142" width="16" height="9" rx="2" fill="url(#bc-glass)" stroke="#04100a" strokeWidth="1" />
      <path d="M118 210 Q118 196 128 188 M119 220 L119 268" stroke="#9ae0b4" strokeWidth="2.2" fill="none" opacity="0.4" strokeLinecap="round" />
      <path d="M150 196 Q154 204 154 214" stroke="#ffcf80" strokeWidth="2" fill="none" opacity="0.35" strokeLinecap="round" />
      {/* Wax run down the neck and shoulder in rivulets. */}
      {[
        'M130 146 L129 168 Q128 178 124 188 L120 206',
        'M136 148 L136 172',
        'M142 146 L143 164 Q146 178 152 186 L156 200 L156 236',
        'M133 150 L132 160',
      ].map((d, i) => (
        <path key={i} d={d} stroke="#ebdcb6" strokeWidth={i === 2 ? 4.5 : 3.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {[
        [120, 207, 3],
        [136, 173, 2.6],
        [156, 238, 3.4],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#ebdcb6" />
      ))}
      <ellipse cx="136" cy="143" rx="11" ry="3.5" fill="#f2e6c6" />
      <Candle p={p} x={136} base={143} h={52} w={14} delay={-0.3} />
    </svg>
  );
}

/** The table's front-left corner: a tallow stub in a clay saucer, its wax
 *  pooled round it. */
export function TallowCandleArt() {
  const p = 'tc';
  return (
    <svg className="desk-art candle-art" viewBox="0 0 80 170" aria-hidden="true">
      <defs>
        <CandleDefs p={p} />
        <linearGradient id="tc-clay" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5a2c18" />
          <stop offset="0.4" stopColor="#b0643a" />
          <stop offset="1" stopColor="#4a2414" />
        </linearGradient>
      </defs>
      <ellipse cx="40" cy="160" rx="38" ry="9" fill={`url(#${p}-pool)`} />
      <ellipse cx="42" cy="161" rx="30" ry="6" fill="#000" opacity="0.5" />
      <path d="M8 152 Q12 162 40 162 Q68 162 72 152 Z" fill="url(#tc-clay)" stroke="#2a1208" strokeWidth="1" />
      <ellipse cx="40" cy="152" rx="32" ry="7" fill="#8a4a2a" stroke="#2a1208" strokeWidth="1" />
      <ellipse cx="40" cy="151" rx="26" ry="5" fill="#5a2e18" />
      <path d="M22 151 Q26 146 40 147 Q56 146 60 152 Q50 156 40 155 Q28 156 22 151 Z" fill="#efe2bf" />
      <Candle p={p} x={40} base={149} h={40} w={26} delay={-0.7} />
    </svg>
  );
}

/** The room key on its carved wooden fob, and a couple of copper pennies. */
export function RoomKeyArt() {
  return (
    <svg className="desk-art key-art" viewBox="0 0 100 50" aria-hidden="true">
      <defs>
        <radialGradient id="rk-copper" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#f0b080" />
          <stop offset="0.55" stopColor="#b0603a" />
          <stop offset="1" stopColor="#5a2a14" />
        </radialGradient>
      </defs>
      {[
        [82, 38],
        [70, 42],
      ].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <ellipse cx="1.5" cy="3" rx="10" ry="4" fill="#000" opacity="0.45" />
          <ellipse cy="1.5" rx="9.5" ry="4.4" fill="#5a2a14" />
          <ellipse rx="9.5" ry="4.4" fill="url(#rk-copper)" stroke="#3a180a" strokeWidth="0.7" />
          <ellipse rx="6.4" ry="2.7" fill="none" stroke="#ffd2a8" strokeWidth="0.6" opacity="0.6" />
        </g>
      ))}
      <g transform="rotate(-10 50 26)">
        <path d="M24 30 L80 26" stroke="#000" strokeWidth="5" opacity="0.35" transform="translate(1.5 3)" />
        {/* Fob and cord. */}
        <path d="M18 30 Q14 34 12 36" stroke="#8a6a3a" strokeWidth="1.2" fill="none" />
        <rect x="-2" y="32" width="24" height="13" rx="4" fill="#7a4e2c" stroke="#2e1a0a" strokeWidth="1" />
        <path d="M5 35.5 v6 M10 35.5 v6 M15 35.5 v6" stroke="#2e1a0a" strokeWidth="1.4" />
        <circle cx="19" cy="38.5" r="1.3" fill="#2e1a0a" />
        {/* The key. */}
        <circle cx="24" cy="28" r="7" fill="none" stroke="#3a3a42" strokeWidth="3.4" />
        <path d="M31 27.5 L80 25" stroke="#3a3a42" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M72 25.4 V33 H76 V30 H80 V25" fill="#3a3a42" stroke="#3a3a42" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M20 23 A6 6 0 0 1 28 22.5 M34 26.2 L70 24.4" stroke="#9a9aa6" strokeWidth="1" fill="none" opacity="0.8" />
      </g>
    </svg>
  );
}

/** A heel of bread and a wedge of cheese on a board, the knife beside. */
export function BreadCheeseArt() {
  return (
    <svg className="desk-art bread-art" viewBox="0 0 130 80" aria-hidden="true">
      <defs>
        <linearGradient id="bd-crust" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c47a36" />
          <stop offset="1" stopColor="#6a3814" />
        </linearGradient>
      </defs>
      <ellipse cx="66" cy="70" rx="60" ry="9" fill="#000" opacity="0.5" />
      <ellipse cx="65" cy="64" rx="58" ry="12" fill="#3e2410" />
      <ellipse cx="65" cy="60" rx="58" ry="12" fill="#7a5030" stroke="#2e1a0a" strokeWidth="1" />
      <path d="M18 58 Q65 52 112 58" stroke="#a87a50" strokeWidth="1" fill="none" opacity="0.5" />
      {/* The bread. */}
      <path d="M12 60 C10 34 40 26 60 36 C64 42 64 52 62 60 Z" fill="url(#bd-crust)" stroke="#3a1c08" strokeWidth="1" />
      <path d="M22 44 l8 -6 M32 40 l8 -6 M44 38 l7 -5" stroke="#e0a868" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="61" cy="48" rx="5" ry="12" fill="#ead6a4" stroke="#b0884a" strokeWidth="1" />
      {[
        [60, 42],
        [62, 50],
        [60, 55],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.9" fill="#b89a60" />
      ))}
      {/* The cheese. */}
      <path d="M74 60 L116 60 L116 50 L84 40 Z" fill="#d6a63e" stroke="#7a5a18" strokeWidth="1" />
      <path d="M74 60 L84 40 L116 50 L116 52 L86 44 Z" fill="#f0cc68" />
      {[
        [92, 53, 2.4],
        [104, 56, 1.8],
        [98, 48, 1.4],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#a87a24" />
      ))}
      {/* The knife. */}
      <path d="M40 70 L92 64 L96 66 L42 73 Z" fill="#b4b8c0" stroke="#4a4e56" strokeWidth="0.7" />
      <rect x="94" y="62" width="24" height="5.5" rx="2.5" fill="#4a2a14" transform="rotate(-7 106 65)" />
    </svg>
  );
}

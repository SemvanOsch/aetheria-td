import { useEffect, useRef } from 'react';

export type SummonPhase = 'idle' | 'charging' | 'flash' | 'silhouette' | 'revealed';

interface Props {
  phase: SummonPhase;
  /** Rarity accent colour of the result (unknown while idle). */
  color: string;
  /** Rarity order 0..4 — scales particle counts and burst force. */
  tier: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hue: string;
  /** Peak opacity (1 when omitted). */
  alpha?: number;
}

/**
 * The summoning altar's particle layer, drawn on a canvas behind the orb:
 *  - idle      — a few slow motes rising around the pedestal;
 *  - charging  — energy streams spiralling *in* toward the orb, quickening;
 *  - flash     — a radial burst outward, bigger and denser per rarity tier;
 *  - revealed  — a light drift of rarity-coloured embers, kept sparse and dim
 *                so they don't crowd the caption under the figure.
 * Self-contained: one rAF loop while mounted, pooled motes, DPR-aware.
 */
export function SummonFx({ phase, color, tier }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const colorRef = useRef(color);
  const tierRef = useRef(tier);
  phaseRef.current = phase;
  colorRef.current = color;
  tierRef.current = tier;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const motes: Mote[] = [];
    let raf = 0;
    let last = performance.now();
    let lastPhase: SummonPhase = phaseRef.current;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.46;
      const ph = phaseRef.current;
      const col = colorRef.current;
      const t = tierRef.current;

      // Phase-entry bursts.
      if (ph !== lastPhase) {
        if (ph === 'flash' && !reduced) {
          const n = 40 + t * 40;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 120 + Math.random() * (220 + t * 120);
            motes.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.8 + Math.random() * 0.8, size: 1.2 + Math.random() * (1.6 + t * 0.4), hue: Math.random() < 0.3 ? '#ffffff' : col });
          }
        }
        lastPhase = ph;
      }
      // Continuous emitters.
      if (!reduced) {
        if (ph === 'idle' && Math.random() < dt * 6) {
          motes.push({ x: cx + (Math.random() - 0.5) * 140, y: cy + 90, vx: (Math.random() - 0.5) * 8, vy: -20 - Math.random() * 20, life: 0, max: 3, size: 1 + Math.random(), hue: '#a9b8ff' });
        }
        if (ph === 'charging') {
          const rate = 90;
          for (let i = 0; i < rate * dt; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.max(w, h) * (0.45 + Math.random() * 0.2);
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            // Spiral in: velocity toward the centre plus a tangential twist.
            const s = 260 + Math.random() * 160;
            motes.push({ x, y, vx: (-Math.cos(a) + -Math.sin(a) * 0.5) * s, vy: (-Math.sin(a) + Math.cos(a) * 0.5) * s, life: 0, max: r / s, size: 1 + Math.random() * 1.4, hue: Math.random() < 0.5 ? '#c9d4ff' : '#ffe6a8' });
          }
        }
        if ((ph === 'revealed' || ph === 'silhouette') && Math.random() < dt * (3 + t * 3)) {
          motes.push({ x: cx + (Math.random() - 0.5) * 220, y: h * 0.9, vx: (Math.random() - 0.5) * 10, vy: -22 - Math.random() * 24, life: 0, max: 3 + Math.random() * 2, size: 0.8 + Math.random() * 1, hue: col, alpha: 0.55 });
        }
      }
      // Integrate + draw (additive).
      ctx.globalCompositeOperation = 'lighter';
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        m.life += dt;
        if (m.life >= m.max) {
          motes.splice(i, 1);
          continue;
        }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (ph !== 'charging') {
          m.vx *= 1 - dt * 1.4;
          m.vy *= 1 - dt * 1.4;
        }
        const k = 1 - m.life / m.max;
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.size * 4);
        g.addColorStop(0, m.hue);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = Math.min(1, k * 2) * Math.min(1, m.life * 6) * (m.alpha ?? 1);
        ctx.fillStyle = g;
        ctx.fillRect(m.x - m.size * 4, m.y - m.size * 4, m.size * 8, m.size * 8);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (motes.length > 600) motes.splice(0, motes.length - 600);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="summon-fx" aria-hidden="true" />;
}

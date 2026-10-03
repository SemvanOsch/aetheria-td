import { useEffect, useRef } from 'react';

/**
 * The menus' living backdrop: a painted fantasy night behind every screen.
 *
 * Depth layers, back to front — sky gradient → stars → a slow aurora → drifting
 * clouds → distant ridges → the castle on its crag (windows lit, a beacon on
 * the keep) → mid hills with valley fog → a dark foreground ridge of pines →
 * fireflies. Each layer drifts at its own parallax rate against the pointer, so
 * the scene has depth without ever competing with the UI on top of it.
 *
 * Drawn at half resolution (it is soft by nature) at ~30 fps, paused while the
 * tab is hidden, and frozen to a single frame for reduced-motion users. All
 * shapes are seeded, so the skyline is the same every visit.
 */

const HALF = 0.5;
const FRAME_MS = 1000 / 30;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Scene {
  stars: { x: number; y: number; r: number; p: number }[];
  ridges: { pts: number[]; color: string; depth: number; base: number }[];
  pines: { x: number; h: number }[];
  flies: { x: number; y: number; p: number; s: number }[];
  clouds: { x: number; y: number; w: number; s: number }[];
}

function buildScene(): Scene {
  const r = mulberry(1907);
  const stars = Array.from({ length: 170 }, () => ({ x: r(), y: r() * 0.62, r: 0.3 + r() * 1.1, p: r() * 6.28 }));
  const ridge = (n: number, amp: number, rough: number) => {
    const pts: number[] = [];
    let v = r();
    for (let i = 0; i <= n; i++) {
      v += (r() - 0.5) * rough;
      v = Math.max(0, Math.min(1, v));
      pts.push(v * amp);
    }
    return pts;
  };
  const ridges = [
    { pts: ridge(40, 0.16, 0.5), color: '#1c2244', depth: 0.15, base: 0.66 },
    { pts: ridge(30, 0.12, 0.45), color: '#151a36', depth: 0.3, base: 0.74 },
    { pts: ridge(24, 0.09, 0.4), color: '#0f1328', depth: 0.55, base: 0.84 },
  ];
  const pines = Array.from({ length: 60 }, () => ({ x: r(), h: 0.04 + r() * 0.06 }));
  const flies = Array.from({ length: 26 }, () => ({ x: r(), y: 0.62 + r() * 0.34, p: r() * 6.28, s: 0.5 + r() }));
  const clouds = Array.from({ length: 7 }, () => ({ x: r(), y: 0.08 + r() * 0.3, w: 0.18 + r() * 0.22, s: 0.004 + r() * 0.006 }));
  return { stars, ridges, pines, flies, clouds };
}

export function Backdrop({ mood = 'night' }: { mood?: 'night' | 'dawn' }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const scene = buildScene();
    let W = 0;
    let Hh = 0;
    const resize = () => {
      W = Math.ceil(window.innerWidth * HALF);
      Hh = Math.ceil(window.innerHeight * HALF);
      cv.width = W;
      cv.height = Hh;
    };
    resize();
    window.addEventListener('resize', resize);
    // Pointer parallax target, eased toward each frame.
    let px = 0;
    let py = 0;
    let tx = 0;
    let ty = 0;
    const onMove = (e: PointerEvent) => {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener('pointermove', onMove);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dawn = mood === 'dawn';

    const draw = (time: number) => {
      const t = time / 1000;
      px += (tx - px) * 0.04;
      py += (ty - py) * 0.04;
      // Sky.
      const sky = ctx.createLinearGradient(0, 0, 0, Hh);
      if (dawn) {
        sky.addColorStop(0, '#16163a');
        sky.addColorStop(0.45, '#4a2a5a');
        sky.addColorStop(0.7, '#c86a5a');
        sky.addColorStop(0.85, '#f2b46a');
      } else {
        sky.addColorStop(0, '#05060f');
        sky.addColorStop(0.45, '#111735');
        sky.addColorStop(0.72, '#2a2046');
        sky.addColorStop(0.86, '#4a2a3a');
      }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, Hh);

      // Stars (fewer at dawn), gently twinkling.
      for (const s of scene.stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * 1.3 + s.p);
        ctx.globalAlpha = tw * (dawn ? 0.35 : 0.9) * (1 - s.y);
        ctx.fillStyle = '#e8ecff';
        ctx.beginPath();
        ctx.arc((s.x - px * 0.01) * W, (s.y - py * 0.01) * Hh, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Aurora: two soft ribbons breathing across the upper sky.
      if (!dawn) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let band = 0; band < 2; band++) {
          const hue = band === 0 ? '90,220,180' : '140,120,255';
          ctx.beginPath();
          const y0 = Hh * (0.18 + band * 0.08);
          ctx.moveTo(0, y0);
          for (let x = 0; x <= W; x += 12) {
            const y = y0 + Math.sin(x * 0.006 + t * 0.12 + band * 2) * Hh * 0.05 + Math.sin(x * 0.017 - t * 0.2) * Hh * 0.015;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(W, y0 + Hh * 0.2);
          ctx.lineTo(0, y0 + Hh * 0.2);
          ctx.closePath();
          const ag = ctx.createLinearGradient(0, y0 - Hh * 0.05, 0, y0 + Hh * 0.2);
          const a = 0.07 + 0.03 * Math.sin(t * 0.3 + band);
          ag.addColorStop(0, `rgba(${hue},${a})`);
          ag.addColorStop(1, `rgba(${hue},0)`);
          ctx.fillStyle = ag;
          ctx.fill();
        }
        ctx.restore();
      }

      // Moon / low sun glow.
      const mx = W * 0.78 - px * W * 0.01;
      const my = Hh * (dawn ? 0.66 : 0.2);
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, Hh * 0.35);
      mg.addColorStop(0, dawn ? 'rgba(255,210,140,0.55)' : 'rgba(220,226,255,0.35)');
      mg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(0, 0, W, Hh);
      if (!dawn) {
        ctx.fillStyle = '#e9ecfa';
        ctx.beginPath();
        ctx.arc(mx, my, Hh * 0.035, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(17,23,53,0.9)';
        ctx.beginPath();
        ctx.arc(mx + Hh * 0.012, my - Hh * 0.006, Hh * 0.032, 0, Math.PI * 2);
        ctx.fill();
      }

      // Clouds drifting slowly.
      for (const c of scene.clouds) {
        const x = (((c.x + t * c.s) % 1.4) - 0.2) * W - px * W * 0.02;
        const y = c.y * Hh - py * Hh * 0.01;
        const cw = c.w * W;
        const cg = ctx.createRadialGradient(x, y, 0, x, y, cw * 0.5);
        cg.addColorStop(0, dawn ? 'rgba(255,190,160,0.12)' : 'rgba(150,140,200,0.07)');
        cg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = cg;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, 0.28);
        ctx.translate(-x, -y);
        ctx.fillRect(x - cw / 2, y - cw / 2, cw, cw);
        ctx.restore();
      }

      // Ridges, far to near, each with its own parallax.
      scene.ridges.forEach((rg, i) => {
        const ox = -px * W * rg.depth * 0.06;
        const oy = -py * Hh * rg.depth * 0.03;
        ctx.fillStyle = rg.color;
        ctx.beginPath();
        ctx.moveTo(-20, Hh);
        const n = rg.pts.length - 1;
        for (let k = 0; k <= n; k++) {
          ctx.lineTo((k / n) * (W + 40) - 20 + ox, (rg.base - rg.pts[k]) * Hh + oy);
        }
        ctx.lineTo(W + 20, Hh);
        ctx.closePath();
        ctx.fill();
        // Atmospheric haze at each ridge's foot.
        const hz = ctx.createLinearGradient(0, (rg.base - 0.08) * Hh, 0, (rg.base + 0.06) * Hh);
        hz.addColorStop(0, 'rgba(0,0,0,0)');
        hz.addColorStop(1, dawn ? 'rgba(200,120,120,0.12)' : 'rgba(80,90,150,0.1)');
        ctx.fillStyle = hz;
        ctx.fillRect(0, (rg.base - 0.08) * Hh, W, Hh * 0.14);
        // The castle stands on the middle ridge.
        if (i === 1) drawCastle(ctx, W * 0.3 + ox, (rg.base - 0.1) * Hh + oy, Hh * 0.22, t);
      });

      // Valley fog drifting.
      for (let k = 0; k < 3; k++) {
        const fy = Hh * (0.78 + k * 0.05);
        const fx = ((t * 6 * (k + 1)) % (W * 1.5)) - W * 0.25;
        const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, W * 0.45);
        fg.addColorStop(0, dawn ? 'rgba(255,200,180,0.08)' : 'rgba(140,150,210,0.07)');
        fg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(0, fy - W * 0.45, W, W * 0.9);
      }

      // Foreground ridge of pines.
      const fox = -px * W * 0.05;
      ctx.fillStyle = '#070912';
      ctx.beginPath();
      ctx.moveTo(-20, Hh);
      ctx.lineTo(-20, Hh * 0.92);
      for (let k = 0; k <= 20; k++) ctx.lineTo((k / 20) * (W + 40) - 20 + fox, Hh * (0.9 + 0.03 * Math.sin(k * 1.7)));
      ctx.lineTo(W + 20, Hh);
      ctx.closePath();
      ctx.fill();
      for (const p of scene.pines) {
        const x = p.x * (W + 40) - 20 + fox;
        const base = Hh * (0.9 + 0.03 * Math.sin(p.x * 20 * 1.7));
        const h = p.h * Hh;
        ctx.beginPath();
        ctx.moveTo(x, base - h);
        ctx.lineTo(x - h * 0.28, base);
        ctx.lineTo(x + h * 0.28, base);
        ctx.closePath();
        ctx.fill();
      }

      // Fireflies.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const f of scene.flies) {
        const x = (f.x + Math.sin(t * 0.2 * f.s + f.p) * 0.03) * W - px * W * 0.08;
        const y = (f.y + Math.cos(t * 0.27 * f.s + f.p) * 0.02) * Hh;
        const blink = Math.max(0, Math.sin(t * 1.4 * f.s + f.p));
        const fg = ctx.createRadialGradient(x, y, 0, x, y, 5);
        fg.addColorStop(0, `rgba(230,255,150,${0.8 * blink})`);
        fg.addColorStop(1, 'rgba(230,255,150,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(x - 5, y - 5, 10, 10);
      }
      // An occasional bird crossing the sky.
      const bt = (t % 38) / 38;
      if (bt < 0.4) {
        const bx = W * (bt / 0.4) * 1.2 - W * 0.1;
        const by = Hh * 0.3 + Math.sin(bt * 20) * 6;
        const flap = Math.sin(t * 9) * 2.4;
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(10,10,20,0.7)';
        ctx.lineWidth = 1;
        for (const [ox2, oy2] of [[0, 0], [9, 4], [-7, 5]] as const) {
          ctx.beginPath();
          ctx.moveTo(bx + ox2 - 4, by + oy2 - flap);
          ctx.quadraticCurveTo(bx + ox2 - 1.5, by + oy2, bx + ox2, by + oy2);
          ctx.quadraticCurveTo(bx + ox2 + 1.5, by + oy2, bx + ox2 + 4, by + oy2 - flap);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Vignette to settle the edges behind the UI.
      const vg = ctx.createRadialGradient(W / 2, Hh * 0.45, Hh * 0.3, W / 2, Hh * 0.5, Math.hypot(W, Hh) * 0.62);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(2,2,8,0.6)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, Hh);
    };

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < FRAME_MS) return;
      last = now;
      draw(now);
    };
    if (reduced) draw(0);
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
    };
  }, [mood]);

  return <canvas ref={ref} className="backdrop" aria-hidden="true" />;
}

/** The castle on its crag: keep, towers, lit windows and a beacon. */
function drawCastle(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, t: number): void {
  ctx.save();
  ctx.fillStyle = '#0b0e20';
  const w = h * 1.3;
  // Crag.
  ctx.beginPath();
  ctx.moveTo(x - w * 0.8, base + h * 0.25);
  ctx.quadraticCurveTo(x - w * 0.4, base - h * 0.05, x - w * 0.35, base);
  ctx.lineTo(x + w * 0.35, base);
  ctx.quadraticCurveTo(x + w * 0.5, base + h * 0.05, x + w * 0.9, base + h * 0.25);
  ctx.closePath();
  ctx.fill();
  const block = (bx: number, bw: number, bh: number) => {
    ctx.fillRect(x + bx * w, base - bh * h, bw * w, bh * h);
    // Crenellations.
    const n = Math.max(2, Math.round(bw * 10));
    for (let i = 0; i < n; i += 2) ctx.fillRect(x + bx * w + (i / n) * bw * w, base - bh * h - h * 0.04, (bw * w) / n, h * 0.04);
  };
  block(-0.35, 0.7, 0.35);
  block(-0.14, 0.28, 0.7);
  for (const tx of [-0.42, 0.3]) {
    block(tx, 0.12, 0.55);
    ctx.beginPath();
    ctx.moveTo(x + tx * w - w * 0.01, base - 0.59 * h);
    ctx.lineTo(x + (tx + 0.06) * w, base - 0.8 * h);
    ctx.lineTo(x + (tx + 0.13) * w, base - 0.59 * h);
    ctx.closePath();
    ctx.fill();
  }
  // Lit windows (a few flicker).
  const wins: [number, number][] = [[-0.04, 0.55], [0.04, 0.55], [0, 0.4], [-0.25, 0.2], [0.18, 0.22], [-0.38, 0.4], [0.34, 0.38]];
  wins.forEach(([wx, wy], i) => {
    const f = 0.75 + 0.25 * Math.sin(t * (2 + i * 0.7) + i);
    const cx = x + wx * w;
    const cy = base - wy * h;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.07);
    g.addColorStop(0, `rgba(255,200,110,${0.7 * f})`);
    g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - h * 0.07, cy - h * 0.07, h * 0.14, h * 0.14);
    ctx.fillStyle = `rgba(255,220,150,${f})`;
    ctx.fillRect(cx - h * 0.008, cy - h * 0.016, h * 0.016, h * 0.03);
  });
  // Beacon atop the keep.
  const bx = x;
  const by = base - 0.76 * h;
  const pulse = 0.7 + 0.3 * Math.sin(t * 3);
  const bg = ctx.createRadialGradient(bx, by, 0, bx, by, h * 0.22);
  bg.addColorStop(0, `rgba(255,190,90,${0.55 * pulse})`);
  bg.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = bg;
  ctx.fillRect(bx - h * 0.22, by - h * 0.22, h * 0.44, h * 0.44);
  ctx.restore();
}

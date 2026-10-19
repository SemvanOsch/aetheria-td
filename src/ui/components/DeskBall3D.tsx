import { useEffect, useLayoutEffect, useRef } from 'react';
import { loadedBallModule, preloadDesk } from '../deskAssets';
import type { BallScene, VortexMode } from '../three/ballScene';

/**
 * The home desk's crystal ball: a 3D model (three.js, `ui/three/ballScene`),
 * preloaded and warmed behind the loading screen (`deskAssets`), borrowed here
 * the same way `DeskMap3D` borrows the map. Hover and keyboard focus on the
 * desk object lift it and brighten the orb. The stage's classes drive the
 * vortex: `leaving to-summon` spins it up while the stage zooms in (CSS),
 * `settling-summon` winds it back down, and behind the Summoning Altar (the
 * frozen backdrop, `.desk-backdrop-scene`) it whirls on while everything else
 * is still. Reduced motion stills it all. The canvas overflows the layout box,
 * so the lift and the glow are never clipped; the box stays the drawing's, so
 * the zoom still centres on the orb.
 */
export function DeskBall3D({ inn }: { inn: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BallScene | null>(null);
  const innRef = useRef(inn);
  innRef.current = inn;

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let cancelled = false;
    let detach: (() => void) | null = null;

    const attach = () => {
      // Check before borrowing: a cancelled mount must never take the scene.
      if (cancelled) return;
      const mod = loadedBallModule();
      const scene = mod?.acquireBallScene();
      if (!mod || !scene) return;
      sceneRef.current = scene;
      wrap.appendChild(scene.canvas);
      const frozen = wrap.closest('.desk-backdrop-scene') != null;
      const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
      scene.setInn(innRef.current);

      const resize = () => {
        const c = scene.canvas.getBoundingClientRect();
        const b = wrap.getBoundingClientRect();
        // Measured on screen, so undo the stage's zoom (a CSS transform).
        const k = wrap.offsetWidth > 0 ? b.width / wrap.offsetWidth : 1;
        if (k <= 0) return;
        scene.resize(c.width / k, c.height / k, {
          x: (b.left - c.left) / k,
          y: (b.top - c.top) / k,
          w: b.width / k,
          h: b.height / k,
        });
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(wrap);

      // The stage's classes say what the vortex is doing.
      const stage = wrap.closest('.desk-stage');
      const sync = () => {
        const cls = stage?.classList;
        const has = (c: string) => !!cls?.contains(c);
        let mode: VortexMode = 'rest';
        if (reduced()) mode = 'rest';
        else if (frozen) mode = has('to-summon') ? 'whirl' : 'rest';
        else if (has('settling-summon')) mode = has('instant') ? 'held' : 'spinDown';
        else if (has('leaving') && has('to-summon') && !has('instant')) mode = 'spinUp';
        scene.setVortex(mode);
      };
      sync();
      const mo = stage ? new MutationObserver(sync) : null;
      if (stage) mo!.observe(stage, { attributes: true, attributeFilter: ['class'] });
      scene.setAmbient(!frozen && !reduced());

      // The hover target is the whole desk object (ball and plaque).
      const obj = wrap.closest('.desk-obj') ?? wrap;
      const on = () => scene.setHover(true);
      const off = () => {
        if (!obj.matches(':hover') && !obj.matches(':focus-visible')) scene.setHover(false);
      };
      obj.addEventListener('pointerenter', on);
      obj.addEventListener('pointerleave', off);
      obj.addEventListener('focus', on);
      obj.addEventListener('blur', off);
      detach = () => {
        ro.disconnect();
        mo?.disconnect();
        obj.removeEventListener('pointerenter', on);
        obj.removeEventListener('pointerleave', off);
        obj.removeEventListener('focus', on);
        obj.removeEventListener('blur', off);
        scene.canvas.remove();
        sceneRef.current = null;
        mod.releaseBallScene(scene);
      };
    };

    if (loadedBallModule()) attach();
    else void preloadDesk().then(attach);

    return () => {
      cancelled = true;
      detach?.();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setInn(inn);
  }, [inn]);

  return <div ref={wrapRef} className="desk-ball-3d" />;
}

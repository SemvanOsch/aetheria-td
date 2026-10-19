import { useEffect, useLayoutEffect, useRef } from 'react';
import type { SectionId } from '../../domain/levels';
import { loadedMapModule, preloadDesk } from '../deskAssets';
import type { MapScene } from '../three/mapScene';

/** The desk map's rise, in step with the stage's own CSS zoom (Home.tsx, styles.css). */
const RISE_MS = 1800;
const SETTLE_MS = 1200;
const DROP_MS = 300;

/**
 * The home desk's scroll map: a 3D model (three.js, `ui/three/mapScene`),
 * preloaded and warmed behind the loading screen (`deskAssets`), borrowed here
 * the same way `DeskJournal3D` borrows the journal. The pin and the red road
 * follow `here`. Hover and keyboard focus on the desk object lift the map. The
 * stage's classes drive its rise: `leaving to-play` raises it to face you (the
 * stage pans and zooms in CSS meanwhile), `settling-play` lowers it slowly,
 * and `instant`, the frozen backdrop (`.desk-backdrop-scene`) and reduced
 * motion snap it. The canvas overflows the layout box, so the rising map is
 * never clipped.
 */
export function DeskMap3D({ here, inn }: { here: SectionId; inn: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MapScene | null>(null);
  const hereRef = useRef(here);
  hereRef.current = here;
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
      const mod = loadedMapModule();
      const scene = mod?.acquireMapScene();
      if (!mod || !scene) return;
      sceneRef.current = scene;
      wrap.appendChild(scene.canvas);
      const frozen = wrap.closest('.desk-backdrop-scene') != null;
      const still = () => frozen || matchMedia('(prefers-reduced-motion: reduce)').matches;
      scene.setHere(hereRef.current);
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

      // The stage's classes say whether the map is being leaned over.
      const stage = wrap.closest('.desk-stage');
      const sync = () => {
        const cls = stage?.classList;
        const up = !!cls?.contains('leaving') && cls.contains('to-play');
        const ease = mod.EASE;
        if (still() || cls?.contains('instant')) scene.riseTo(up ? 1 : 0, 0, ease.out);
        else if (up) scene.riseTo(1, RISE_MS, ease.rise);
        else if (cls?.contains('settling-play')) scene.riseTo(0, SETTLE_MS, ease.settle);
        else scene.riseTo(0, DROP_MS, ease.out);
      };
      sync();
      const mo = stage ? new MutationObserver(sync) : null;
      if (stage) mo!.observe(stage, { attributes: true, attributeFilter: ['class'] });
      scene.setAmbient(!still());

      // The hover target is the whole desk object (map and plaque).
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
        mod.releaseMapScene(scene);
      };
    };

    if (loadedMapModule()) attach();
    else void preloadDesk().then(attach);

    return () => {
      cancelled = true;
      detach?.();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setHere(here);
  }, [here]);
  useEffect(() => {
    sceneRef.current?.setInn(inn);
  }, [inn]);

  return <div ref={wrapRef} className="desk-map-3d" />;
}

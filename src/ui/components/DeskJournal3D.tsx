import { useEffect, useLayoutEffect, useRef } from 'react';
import { loadedJournalModule, preloadDesk } from '../deskAssets';
import type { JournalScene } from '../three/journalScene';

/**
 * The home desk's journal: a 3D model (three.js, `ui/three/journalScene`),
 * preloaded and warmed behind the loading screen (`deskAssets`), so this just
 * borrows the ready scene and puts its canvas in place. If the model could not
 * load (no WebGL), the spot stays empty and the plaque still opens the journal.
 *
 * Hover and keyboard focus on the surrounding desk object lift the book in 3D;
 * the desk's zoom into the journal is the stage's own CSS transform, which
 * carries this canvas with it.
 */
export function DeskJournal3D({ inn }: { inn: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<JournalScene | null>(null);
  const innRef = useRef(inn);
  innRef.current = inn;

  // Layout effect: the canvas is in place before the desk's first paint.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let cancelled = false;
    let detach: (() => void) | null = null;

    const attach = () => {
      // Check before borrowing: a cancelled mount must never take the scene.
      if (cancelled) return;
      const mod = loadedJournalModule();
      const scene = mod?.acquireJournalScene();
      if (!mod || !scene) return;
      sceneRef.current = scene;
      wrap.appendChild(scene.canvas);
      scene.setInn(innRef.current);
      scene.resize(wrap.clientWidth, wrap.clientHeight);
      const ro = new ResizeObserver(() => scene.resize(wrap.clientWidth, wrap.clientHeight));
      ro.observe(wrap);
      // The hover target is the whole desk object (book and plaque).
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
        obj.removeEventListener('pointerenter', on);
        obj.removeEventListener('pointerleave', off);
        obj.removeEventListener('focus', on);
        obj.removeEventListener('blur', off);
        scene.canvas.remove();
        sceneRef.current = null;
        mod.releaseJournalScene(scene);
      };
    };

    if (loadedJournalModule()) attach();
    else void preloadDesk().then(attach);

    return () => {
      cancelled = true;
      detach?.();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setInn(inn);
  }, [inn]);

  return <div ref={wrapRef} className="desk-journal-3d" />;
}

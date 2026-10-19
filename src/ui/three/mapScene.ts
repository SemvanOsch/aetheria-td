import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { SectionId } from '../../domain/levels';
import { MAP_PLACES, MAP_ROADS, roadsTravelled } from '../mapRoute';
import {
  HEARTH_INTENSITY,
  KEY_INTENSITY,
  addDeskLights,
  contactShadeTexture,
  createDeskRenderer,
  loadDeskModel,
} from './deskThree';

/**
 * The home desk's scroll map as a real 3D model (`public/models/adventurers_map.glb`,
 * built and baked in `Blender/adventurers_map.blend`), set up like the journal
 * (`journalScene`): loaded only through a dynamic import, one shared scene
 * warmed behind the loading screen, borrowed by `DeskMap3D` and handed back on
 * unmount, lit by the same candlelit desk lights.
 *
 * The model is the parchment sheet (`Map_Sheet`, its art baked in), its two
 * rolled ends, the brass pocket compass (`Compass`, with a separate
 * `Compass_Needle` that drifts) and the red pushpin (`Map_Pin`). The game
 * drives the rest: the pin moves to where the party is (`setHere`), the road
 * travelled so far is inked in red dashes on a canvas laid over the sheet, and
 * the map lifts on hover and rises to face you when Play is chosen (`riseTo`).
 *
 * The sheet's second UV set (`uv1`) is the drawing's 640×440 viewBox window
 * x 52–590, y 34–410, so `MAP_PLACES`/`MAP_ROADS` land on the paper as drawn.
 */

const MODEL_URL = `${import.meta.env.BASE_URL}models/adventurers_map.glb`;
const EXPECTED_BYTES = 1_400_000;

/** viewBox → model metres: the sheet is centred on (321, 222) at 1.2 mm a unit. */
const UNIT = 0.0012;
const CENTRE: [number, number] = [321, 222];
/** The art window the sheet's `uv1` spans. */
const ART = { x: 52, y: 34, w: 538, h: 376 };

/** Camera height above the desk, as an angle from its surface (the drawing's 38° tilt). */
const ELEVATION = THREE.MathUtils.degToRad(52);
const FOV = 26;
/** Hover: lift (m) and a few degrees more toward you, as the drawing eased 38° → 34°. */
const HOVER_LIFT = 0.012;
const HOVER_TILT = THREE.MathUtils.degToRad(4);
/** Choosing Play: the map rises on its near edge to face you. */
const RISE_TILT = THREE.MathUtils.degToRad(28);
const RISE_LIFT = 0.014;
const RISE_SCALE = 0.03;
const HOVER_RATE = 9;
const CONTACT_OPACITY = 0.65;
const CONTACT_MARGIN = 0.016;
/** Ambient motion (needle drift, the pin's ink ring) redraws at most this often. */
const AMBIENT_FRAME_MS = 1000 / 30;
/** The pin's ring of ink: radius (m) at full size, pulse period (s). */
const RING_R = 0.0108;
const RING_PERIOD = 2.6;
/** The needle's drift: [time fraction, degrees] over `NEEDLE_PERIOD` seconds. */
const NEEDLE_KEYS: [number, number][] = [
  [0, -9],
  [0.4, 7],
  [0.7, -3],
  [1, -9],
];
const NEEDLE_PERIOD = 7;

/** CSS-style cubic-bezier easing. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const bez = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t * t + t ** 3;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 24; i++) {
      t = (lo + hi) / 2;
      if (bez(x1, x2, t) < x) lo = t;
      else hi = t;
    }
    return bez(y1, y2, t);
  };
}
export const EASE = {
  /** The stage's lean down onto the map (`.desk-stage.leaving.to-play`). */
  rise: cubicBezier(0.45, 0, 0.25, 1),
  /** Settling back onto the desk (`.settling-play`). */
  settle: cubicBezier(0.2, 0.7, 0.2, 1),
  out: cubicBezier(0, 0, 0.58, 1),
  inOut: cubicBezier(0.42, 0, 0.58, 1),
};

export interface MapScene {
  readonly canvas: HTMLCanvasElement;
  setHover(on: boolean): void;
  /** Rise toward facing you (1) or lie back down (0) over `ms`, eased; 0 ms snaps. */
  riseTo(target: number, ms: number, ease: (t: number) => number): void;
  /** Where the party is: moves the pin and inks the road travelled to it. */
  setHere(here: SectionId): void;
  setInn(inn: boolean): void;
  /** The needle's drift and the pin's pulsing ring (off when frozen or reduced motion). */
  setAmbient(on: boolean): void;
  /** The canvas's size, and where the object's layout box sits in it (CSS px):
   *  the map is framed to the box and may overflow it into the canvas's margins. */
  resize(width: number, height: number, box: { x: number; y: number; w: number; h: number }): void;
  dispose(): void;
}

let gltf: GLTF | null = null;
let gltfPromise: Promise<GLTF> | null = null;
let shared: MapScene | null = null;
let sharedInUse = false;

function loadMap(onProgress: (f: number) => void): Promise<GLTF> {
  if (!gltfPromise) {
    gltfPromise = loadDeskModel(MODEL_URL, EXPECTED_BYTES, onProgress).then((g) => (gltf = g));
    gltfPromise.catch(() => {
      gltfPromise = null;
    });
  }
  return gltfPromise;
}

/** Behind the loading screen: download and decode the model, then build and warm the shared scene. */
export async function preloadMap(onProgress: (f: number) => void): Promise<void> {
  await loadMap((f) => onProgress(0.85 * f));
  if (!shared) shared = buildScene(gltf!);
  onProgress(1);
}

/** Borrow a ready scene: the warm shared one, or a fresh one if that's taken. */
export function acquireMapScene(): MapScene | null {
  if (!gltf) return null;
  if (shared && !sharedInUse) {
    sharedInUse = true;
    return shared;
  }
  return buildScene(gltf);
}

/** Hand a scene back; the shared one stays warm (lying flat, still) for the next desk. */
export function releaseMapScene(scene: MapScene) {
  if (scene === shared) {
    sharedInUse = false;
    scene.setAmbient(false);
    scene.setHover(false);
    scene.riseTo(0, 0, EASE.out);
  } else {
    scene.dispose();
  }
}

/** viewBox point → model-space (x, z) on the desk. */
const toModel = (x: number, y: number) => [(x - CENTRE[0]) * UNIT, (y - CENTRE[1]) * UNIT] as const;

function buildScene(model: GLTF): MapScene {
  const canvas = document.createElement('canvas');
  canvas.className = 'desk-map-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const { renderer, envMap } = createDeskRenderer(canvas, 1.55);
  const scene = new THREE.Scene();
  scene.environment = envMap;
  scene.environmentIntensity = 0.35;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const map = model.scene.clone(true);
  let sheet: THREE.Mesh | null = null;
  let needle: THREE.Object3D | null = null;
  let pin: THREE.Object3D | null = null;
  map.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (o.name === 'Compass_Needle') needle = o;
    if (o.name === 'Map_Pin') pin = o;
    if (!mesh.isMesh) return;
    if (o.name === 'Map_Sheet') sheet = mesh;
    const glass = o.name === 'Compass_Glass';
    mesh.castShadow = !glass;
    mesh.receiveShadow = !glass;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    for (const tex of [mat.map, mat.normalMap, mat.roughnessMap]) if (tex) tex.anisotropy = maxAniso;
    if (glass) {
      mat.depthWrite = false;
      mat.envMapIntensity = 2.2;
    }
  });
  if (!sheet || !needle || !pin) throw new Error('adventurers_map.glb is missing an object');
  const sheetMesh: THREE.Mesh = sheet;
  const needleObj: THREE.Object3D = needle;
  const pinObj: THREE.Object3D = pin;
  // The needle points north whatever way the compass lies.
  const needleBase = -(needleObj.parent?.rotation.y ?? 0);

  map.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(map);

  // Where each place lies on the (gently waved) paper, found once by dropping
  // a ray onto the sheet (the map still at the origin, so world = map space).
  const raycaster = new THREE.Raycaster();
  const spots = new Map<SectionId, { point: THREE.Vector3; normal: THREE.Vector3 }>();
  for (const [id, [x, y]] of Object.entries(MAP_PLACES) as [SectionId, [number, number]][]) {
    const [mx, mz] = toModel(x, y);
    raycaster.set(new THREE.Vector3(mx, 1, mz), new THREE.Vector3(0, -1, 0));
    const hit = raycaster.intersectObject(sheetMesh, false)[0];
    const point = hit ? hit.point.clone() : new THREE.Vector3(mx, 0.0015, mz);
    const normal = hit?.face ? hit.face.normal.clone().transformDirection(sheetMesh.matrixWorld) : new THREE.Vector3(0, 1, 0);
    spots.set(id, { point, normal });
  }

  // The map sits in a pivot on its near edge, so it rises toward you.
  const nearZ = box.max.z;
  const pivot = new THREE.Group();
  pivot.position.z = nearZ;
  map.position.z = -nearZ;
  pivot.add(map);
  scene.add(pivot);

  // The road travelled, inked at runtime over the sheet through its viewBox UVs.
  const inkCanvas = document.createElement('canvas');
  inkCanvas.width = 2048;
  inkCanvas.height = Math.round((2048 * ART.h) / ART.w);
  const inkTex = new THREE.CanvasTexture(inkCanvas);
  inkTex.colorSpace = THREE.SRGBColorSpace;
  inkTex.flipY = false;
  inkTex.channel = 1;
  inkTex.anisotropy = maxAniso;
  const inkMat = new THREE.MeshStandardMaterial({
    map: inkTex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    roughness: 0.78,
    metalness: 0,
  });
  const ink = new THREE.Mesh(sheetMesh.geometry, inkMat);
  ink.receiveShadow = true;
  ink.renderOrder = 1;
  sheetMesh.add(ink);

  // The ring of ink pulsing round the pin.
  const ringGeo = new THREE.RingGeometry(RING_R - 0.0009, RING_R + 0.0009, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x8a2a22,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    roughness: 0.8,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.renderOrder = 2;
  map.add(ring);

  // The cast shadow, on an invisible desk.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShadowMaterial({ opacity: 0.42 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = box.min.y - 0.0004;
  floor.receiveShadow = true;
  scene.add(floor);

  // Contact shade under the sheet and its rolls.
  const fw = box.max.x - box.min.x;
  const fd = box.max.z - box.min.z;
  const contactTex = contactShadeTexture(fw, fd, CONTACT_MARGIN);
  const contactMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    depthWrite: false,
    alphaMap: contactTex,
    opacity: CONTACT_OPACITY,
  });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(fw + 2 * CONTACT_MARGIN, fd + 2 * CONTACT_MARGIN), contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.set((box.min.x + box.max.x) / 2, box.min.y + 0.0002, (box.min.z + box.max.z) / 2);
  scene.add(contact);

  const { key, hearth } = addDeskLights(scene, 0.42);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 10);
  const centre = box.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));

  /** Back the camera off until the map, lifted on hover, fits the layout box. */
  const frame = () => {
    camera.clearViewOffset();
    const fit = box.clone();
    fit.max.y += HOVER_LIFT * 1.2 + (box.max.z - box.min.z) * Math.sin(HOVER_TILT);
    const corners: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) {
      corners.push(
        new THREE.Vector3(i & 1 ? fit.max.x : fit.min.x, i & 2 ? fit.max.y : fit.min.y, i & 4 ? fit.max.z : fit.min.z),
      );
    }
    const fits = (d: number) => {
      camera.position.copy(centre).addScaledVector(dir, d);
      camera.lookAt(centre);
      camera.updateMatrixWorld();
      return corners.every((c) => {
        const p = c.clone().project(camera);
        return Math.abs(p.x) < 0.98 && Math.abs(p.y) < 0.97;
      });
    };
    let lo = 0.05;
    let hi = 4;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    fits(hi);
  };

  let hover = 0;
  let hoverTarget = 0;
  let rise = 0;
  let tween: { from: number; to: number; start: number; ms: number; ease: (t: number) => number } | null = null;
  let ambient = false;
  let raf = 0;
  let last = 0;
  let lastDraw = 0;
  let disposed = false;
  let here: SectionId | null = null;

  const needleAngle = (t: number) => {
    const f = (t / NEEDLE_PERIOD) % 1;
    for (let i = 0; i < NEEDLE_KEYS.length - 1; i++) {
      const [f0, a0] = NEEDLE_KEYS[i];
      const [f1, a1] = NEEDLE_KEYS[i + 1];
      if (f <= f1) return THREE.MathUtils.degToRad(a0 + (a1 - a0) * EASE.inOut((f - f0) / (f1 - f0)));
    }
    return 0;
  };
  const pose = (now: number) => {
    const settled = 1 - rise;
    pivot.rotation.x = HOVER_TILT * hover * settled + RISE_TILT * rise;
    pivot.position.y = HOVER_LIFT * hover * settled + RISE_LIFT * rise;
    pivot.scale.setScalar(1 + RISE_SCALE * rise);
    key.intensity = KEY_INTENSITY * (1 + 0.12 * Math.max(hover, rise));
    contactMat.opacity = CONTACT_OPACITY * (1 - 0.6 * hover) * (1 - rise);
    contact.scale.setScalar(1 + 0.04 * hover);
    const t = now / 1000;
    needleObj.rotation.y = needleBase + (ambient ? needleAngle(t) : THREE.MathUtils.degToRad(NEEDLE_KEYS[0][1]));
    if (ambient) {
      const p = EASE.out((t % RING_PERIOD) / RING_PERIOD);
      ring.scale.setScalar(0.4 + 1.3 * p);
      ringMat.opacity = 0.9 * (1 - p);
    } else {
      ring.scale.setScalar(1);
      ringMat.opacity = 0.55;
    }
  };
  const render = (now = performance.now()) => {
    pose(now);
    renderer.render(scene, camera);
    lastDraw = now;
  };
  const busy = () => hover !== hoverTarget || tween !== null;
  const tick = (now: number) => {
    raf = 0;
    if (disposed || !canvas.isConnected) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = busy();
    hover += (hoverTarget - hover) * (1 - Math.exp(-HOVER_RATE * dt));
    if (Math.abs(hoverTarget - hover) < 0.002) hover = hoverTarget;
    if (tween) {
      const f = Math.min(1, (now - tween.start) / tween.ms);
      rise = tween.from + (tween.to - tween.from) * tween.ease(f);
      if (f >= 1) tween = null;
    }
    if (moving || now - lastDraw >= AMBIENT_FRAME_MS - 1) render(now);
    if (busy() || ambient) raf = requestAnimationFrame(tick);
    else last = 0;
  };
  const wake = () => {
    if (!raf && !disposed && canvas.isConnected) raf = requestAnimationFrame(tick);
    else if (!canvas.isConnected) render();
  };

  const inkRoads = (reached: number) => {
    const ctx = inkCanvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
    const sx = inkCanvas.width / ART.w;
    const sy = inkCanvas.height / ART.h;
    ctx.setTransform(sx, 0, 0, sy, -ART.x * sx, -ART.y * sy);
    ctx.strokeStyle = '#8a2a22';
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    for (const d of MAP_ROADS.slice(0, reached)) ctx.stroke(new Path2D(d));
    inkTex.needsUpdate = true;
  };

  const api: MapScene = {
    canvas,
    setHover(on) {
      hoverTarget = on ? 1 : 0;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || !canvas.isConnected) {
        hover = hoverTarget;
        render();
      } else wake();
    },
    riseTo(target, ms, ease) {
      if (ms <= 0 || !canvas.isConnected) {
        tween = null;
        rise = target;
        render();
        return;
      }
      if (rise === target && !tween) return;
      tween = { from: rise, to: target, start: performance.now(), ms, ease };
      wake();
    },
    setHere(next) {
      if (next === here) return;
      here = next;
      const spot = spots.get(next)!;
      pinObj.position.copy(spot.point);
      ring.position.copy(spot.point).addScaledVector(spot.normal, 0.0003);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spot.normal);
      inkRoads(roadsTravelled(next));
      render();
    },
    setInn(inn) {
      const target = inn ? HEARTH_INTENSITY : 0;
      if (hearth.intensity === target) return;
      hearth.intensity = target;
      render();
    },
    setAmbient(on) {
      ambient = on;
      if (on) wake();
      else render();
    },
    resize(width, height, b) {
      if (width <= 0 || height <= 0 || b.w <= 0 || b.h <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      // Extra resolution for the desk's zoom, within a pixel budget.
      const ratio = Math.min(2.5, dpr * 1.5, Math.sqrt(7_000_000 / (width * height)));
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      camera.aspect = b.w / b.h;
      frame();
      camera.setViewOffset(b.w, b.h, -b.x, -b.y, width, height);
      camera.updateProjectionMatrix();
      render();
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      contact.geometry.dispose();
      contactMat.dispose();
      contactTex.dispose();
      inkMat.dispose();
      inkTex.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      envMap.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };

  // Warm up: compile every shader and upload the textures now, behind the
  // loading screen, rather than on the desk's first frame.
  renderer.setSize(64, 64, false);
  frame();
  api.setHere('castle');
  renderer.compile(scene, camera);
  render();
  return api;
}

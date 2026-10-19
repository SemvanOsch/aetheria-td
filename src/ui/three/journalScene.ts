import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * The home desk's journal as a real 3D model (`public/models/adventurers_journal.glb`,
 * built and baked in `Blender/adventurers_journal.blend`). This module pulls in
 * three.js, so it is only ever loaded through a dynamic import (`deskAssets`),
 * keeping three.js out of the main bundle.
 *
 * `preloadJournal` (run behind the loading screen) fetches the model and warms
 * one shared scene: its own canvas, shaders compiled and textures uploaded, so
 * the desk shows the book on its very first frame. `DeskJournal3D` borrows
 * that scene (`acquireJournalScene`) and hands it back on unmount, so the desk
 * remounting (back from Summon or Play) is instant too.
 *
 * The book lies flat on the desk (glTF is Y-up: front cover up, spine to the
 * left, head away from the viewer) under the desk's light: warm candles from
 * the back right, a cool wash from the window behind, and in the inn the
 * hearth's orange from the left. It renders on demand only, while the hover
 * lift eases in or out and when the canvas resizes.
 */

const MODEL_URL = `${import.meta.env.BASE_URL}models/adventurers_journal.glb`;
/** Self-hosted decoder: DRACOLoader's own default URL breaks under Vite's dev pre-bundling. */
const DRACO_URL = `${import.meta.env.BASE_URL}draco/`;
/** Rough download size, for progress when the server sends no length. */
const EXPECTED_BYTES = 3_100_000;

/** Camera height above the desk, as an angle from the desk's surface. */
const ELEVATION = THREE.MathUtils.degToRad(56);
const FOV = 28;
/** The book lies turned a little on the desk, as the drawing did. */
const YAW = 0.07;
/** Hover: how far the whole book lifts off the desk (m), staying level. */
const LIFT = 0.024;
/** Fraction of the remaining hover distance covered per second. */
const HOVER_RATE = 9;
const KEY_INTENSITY = 2.6;
const HEARTH_INTENSITY = 1.5;
/** The contact shade under the book: its darkness, and how far (m) it fades out past the book's edge. */
const CONTACT_OPACITY = 0.7;
const CONTACT_MARGIN = 0.012;

/** Alpha map for the contact shade: the book's footprint, softly blurred out to
 *  nothing at the plane's edge (`CONTACT_MARGIN` past the book). */
function contactShadeTexture(width: number, depth: number): THREE.CanvasTexture {
  const w = width + 2 * CONTACT_MARGIN;
  const d = depth + 2 * CONTACT_MARGIN;
  const px = 256;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = Math.round((px * d) / w);
  const ctx = canvas.getContext('2d')!;
  const s = px / w;
  const inset = CONTACT_MARGIN * s;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.filter = `blur(${inset * 0.45}px)`;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(inset * 0.7, inset * 0.7, canvas.width - inset * 1.4, canvas.height - inset * 1.4, inset * 0.8);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export interface JournalScene {
  /** The scene's own canvas; the borrower places it in the page. */
  readonly canvas: HTMLCanvasElement;
  setHover(on: boolean): void;
  /** The inn room: the hearth's glow comes in from the left. */
  setInn(inn: boolean): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

let gltf: GLTF | null = null;
let gltfPromise: Promise<GLTF> | null = null;
let shared: JournalScene | null = null;
let sharedInUse = false;

/** The model is fetched and decoded once; every scene shares it. */
function loadJournal(onProgress: (f: number) => void): Promise<GLTF> {
  if (!gltfPromise) {
    const draco = new DRACOLoader().setDecoderPath(DRACO_URL);
    gltfPromise = new GLTFLoader()
      .setDRACOLoader(draco)
      .loadAsync(MODEL_URL, (e) => {
        onProgress(e.total ? e.loaded / e.total : 1 - Math.exp(-e.loaded / EXPECTED_BYTES));
      })
      .then((g) => (gltf = g));
    gltfPromise.catch(() => {
      gltfPromise = null;
    });
  }
  return gltfPromise;
}

/**
 * Behind the loading screen: download and decode the model (most of the
 * progress), then build and warm the shared scene.
 */
export async function preloadJournal(onProgress: (f: number) => void): Promise<void> {
  await loadJournal((f) => onProgress(0.85 * f));
  if (!shared) shared = buildScene(gltf!);
  onProgress(1);
}

/** Borrow a ready scene: the warm shared one, or a fresh one if that's taken. */
export function acquireJournalScene(): JournalScene | null {
  if (!gltf) return null;
  if (shared && !sharedInUse) {
    sharedInUse = true;
    return shared;
  }
  return buildScene(gltf);
}

/** Hand a scene back; the shared one stays warm for the next desk. */
export function releaseJournalScene(scene: JournalScene) {
  if (scene === shared) {
    sharedInUse = false;
    scene.setHover(false);
  } else {
    scene.dispose();
  }
}

function buildScene(model: GLTF): JournalScene {
  const canvas = document.createElement('canvas');
  canvas.className = 'desk-journal-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = envMap;
  scene.environmentIntensity = 0.3;

  // The book, in a holder that carries the hover lift.
  const book = model.scene.clone(true);
  book.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  const holder = new THREE.Group();
  holder.add(book);
  holder.rotation.y = YAW;
  scene.add(holder);

  const box = new THREE.Box3().setFromObject(book);

  // The cast shadow, on an invisible desk.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.ShadowMaterial({ opacity: 0.42 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = box.min.y - 0.0004;
  floor.receiveShadow = true;
  scene.add(floor);

  // Contact shade: a soft dark patch right under the book that seats it on the
  // desk. It thins out and spreads as the book lifts on hover.
  const footprint = { x0: box.min.x, x1: box.max.x, z0: -0.112, z1: 0.112 };
  const contactTex = contactShadeTexture(footprint.x1 - footprint.x0, footprint.z1 - footprint.z0);
  const contactMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    depthWrite: false,
    alphaMap: contactTex,
    opacity: CONTACT_OPACITY,
  });
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(footprint.x1 - footprint.x0 + 2 * CONTACT_MARGIN, footprint.z1 - footprint.z0 + 2 * CONTACT_MARGIN),
    contactMat,
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set((footprint.x0 + footprint.x1) / 2, box.min.y + 0.0002, (footprint.z0 + footprint.z1) / 2);
  const contactPivot = new THREE.Group();
  contactPivot.rotation.y = YAW;
  contactPivot.add(contact);
  scene.add(contactPivot);

  // Candles at the back right: the key light, and the one that casts. High
  // enough that the shadow stays close under the book.
  const key = new THREE.DirectionalLight(0xffc98e, KEY_INTENSITY);
  key.position.set(0.4, 1.25, -0.25);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 10;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.002;
  const sc = key.shadow.camera;
  sc.left = -0.22;
  sc.right = 0.22;
  sc.top = 0.22;
  sc.bottom = -0.22;
  sc.near = 0.1;
  sc.far = 2.5;
  scene.add(key);
  // Moonlight through the window behind the desk.
  const moon = new THREE.DirectionalLight(0x9db2ff, 0.55);
  moon.position.set(-0.3, 0.8, -1.2);
  scene.add(moon);
  // The room's warm dark.
  scene.add(new THREE.HemisphereLight(0x5a4030, 0x140b06, 1.2));
  // A soft warm fill from the front so the cover never goes flat black.
  const fill = new THREE.DirectionalLight(0xffd9b0, 0.8);
  fill.position.set(-0.2, 0.6, 0.9);
  scene.add(fill);
  // The inn's hearth. Always in the scene (dark outside the inn) so switching
  // rooms never recompiles the shaders.
  const hearth = new THREE.DirectionalLight(0xff7a2e, 0);
  hearth.position.set(-1.2, 0.35, 0.15);
  scene.add(hearth);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 10);
  const centre = box.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));

  /** Back the camera off until the whole book, lifted, fits the canvas. */
  const frame = () => {
    const fitBox = box.clone();
    fitBox.max.y += LIFT * 1.2;
    fitBox.applyMatrix4(new THREE.Matrix4().makeRotationY(YAW));
    const corners: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) {
      corners.push(
        new THREE.Vector3(
          i & 1 ? fitBox.max.x : fitBox.min.x,
          i & 2 ? fitBox.max.y : fitBox.min.y,
          i & 4 ? fitBox.max.z : fitBox.min.z,
        ),
      );
    }
    const fits = (d: number) => {
      camera.position.copy(centre).addScaledVector(dir, d);
      camera.lookAt(centre);
      camera.updateMatrixWorld();
      return corners.every((c) => {
        const p = c.clone().project(camera);
        return Math.abs(p.x) < 0.97 && Math.abs(p.y) < 0.97;
      });
    };
    let lo = 0.05;
    let hi = 3;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    fits(hi);
  };

  let hover = 0;
  let hoverTarget = 0;
  let raf = 0;
  let last = 0;
  let disposed = false;

  const render = () => {
    holder.position.y = LIFT * hover;
    key.intensity = KEY_INTENSITY * (1 + 0.12 * hover);
    contactMat.opacity = CONTACT_OPACITY * (1 - 0.6 * hover);
    contact.scale.setScalar(1 + 0.06 * hover);
    renderer.render(scene, camera);
  };
  const tick = (now: number) => {
    raf = 0;
    if (disposed) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    hover += (hoverTarget - hover) * (1 - Math.exp(-HOVER_RATE * dt));
    if (Math.abs(hoverTarget - hover) < 0.002) hover = hoverTarget;
    render();
    if (hover !== hoverTarget) raf = requestAnimationFrame(tick);
    else last = 0;
  };

  // Warm up: compile every shader and upload the textures now, behind the
  // loading screen, rather than on the desk's first frame.
  renderer.setSize(64, 64, false);
  frame();
  renderer.compile(scene, camera);
  render();

  return {
    canvas,
    setHover(on) {
      hoverTarget = on ? 1 : 0;
      if (reducedMotion || !canvas.isConnected) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        hover = hoverTarget;
        render();
      } else if (!raf) raf = requestAnimationFrame(tick);
    },
    setInn(inn) {
      const target = inn ? HEARTH_INTENSITY : 0;
      if (hearth.intensity === target) return;
      hearth.intensity = target;
      render();
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      // Extra resolution so the book stays crisp through the desk's zoom.
      renderer.setPixelRatio(Math.min(3, (window.devicePixelRatio || 1) * 1.6));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      frame();
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
      envMap.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * What the home desk's 3D objects (`journalScene`, `mapScene`) share: loading
 * a Draco model, the renderer setup, the candlelit desk lighting and the soft
 * contact shade that seats an object on the desk. Only ever reached through a
 * dynamic import, like the scenes themselves.
 */

/** Self-hosted decoder: DRACOLoader's own default URL breaks under Vite's dev pre-bundling. */
const DRACO_URL = `${import.meta.env.BASE_URL}draco/`;

export const KEY_INTENSITY = 2.6;
export const HEARTH_INTENSITY = 1.5;

/** Fetch and decode a Draco-compressed model, reporting 0–1 progress
 *  (`expectedBytes` stands in when the server sends no length). */
export function loadDeskModel(url: string, expectedBytes: number, onProgress: (f: number) => void): Promise<GLTF> {
  const draco = new DRACOLoader().setDecoderPath(DRACO_URL);
  return new GLTFLoader()
    .setDRACOLoader(draco)
    .loadAsync(url, (e) => {
      onProgress(e.total ? e.loaded / e.total : 1 - Math.exp(-e.loaded / expectedBytes));
    })
    .finally(() => draco.dispose());
}

/** Alpha map for a contact shade: a `width` × `depth` footprint, softly blurred
 *  out to nothing at the plane's edge (`margin` past the footprint). */
export function contactShadeTexture(width: number, depth: number, margin: number): THREE.CanvasTexture {
  const w = width + 2 * margin;
  const d = depth + 2 * margin;
  const px = 256;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = Math.round((px * d) / w);
  const ctx = canvas.getContext('2d')!;
  const s = px / w;
  const inset = margin * s;
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

/** A transparent, tone-mapped, shadow-casting renderer on `canvas`, with a dim
 *  room reflection for metals and sheen. */
export function createDeskRenderer(canvas: HTMLCanvasElement, exposure: number) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  return { renderer, envMap };
}

export interface DeskLights {
  /** Candles at the back right: the key light, and the one that casts. */
  key: THREE.DirectionalLight;
  /** The inn's hearth, from the left: dark (0) outside the inn. */
  hearth: THREE.DirectionalLight;
}

/**
 * The desk's light: warm candles from the back right (high enough that the
 * shadow stays close under the object), moonlight through the window behind,
 * the room's warm dark, a soft warm fill from the front, and the inn's hearth.
 * The hearth is always in the scene (at 0 outside the inn) so switching rooms
 * never recompiles the shaders. `shadowExtent` is the half-size (m) of the
 * key's shadow camera, wide enough for the object.
 */
export function addDeskLights(scene: THREE.Scene, shadowExtent: number): DeskLights {
  const key = new THREE.DirectionalLight(0xffc98e, KEY_INTENSITY);
  key.position.set(0.4, 1.25, -0.25);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 10;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.002;
  const sc = key.shadow.camera;
  sc.left = -shadowExtent;
  sc.right = shadowExtent;
  sc.top = shadowExtent;
  sc.bottom = -shadowExtent;
  sc.near = 0.1;
  sc.far = 2.5;
  scene.add(key);
  const moon = new THREE.DirectionalLight(0x9db2ff, 0.55);
  moon.position.set(-0.3, 0.8, -1.2);
  scene.add(moon);
  scene.add(new THREE.HemisphereLight(0x5a4030, 0x140b06, 1.2));
  const fill = new THREE.DirectionalLight(0xffd9b0, 0.8);
  fill.position.set(-0.2, 0.6, 0.9);
  scene.add(fill);
  const hearth = new THREE.DirectionalLight(0xff7a2e, 0);
  hearth.position.set(-1.2, 0.35, 0.15);
  scene.add(hearth);
  return { key, hearth };
}

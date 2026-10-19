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

/** CSS-style cubic-bezier easing, so a scene's motion keeps step with the stage's CSS. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
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

/** Layer for things the ink pass must not outline (shadow catchers, glass, decals). */
export const NO_INK_LAYER = 1;

/** Keep `obj` out of the ink outline (it still renders). */
export function skipInk(obj: THREE.Object3D) {
  obj.layers.set(NO_INK_LAYER);
}

/**
 * The desk's finishing pass, the 3D twin of the figure compositor's ink: the
 * scene renders into a buffer, a second pass renders view normals and depth
 * (only layer 0, so shadows, glass and decals are left out), and a full-screen
 * pass draws a warm ink line wherever the silhouette, the depth or the surface
 * direction breaks, then tone-maps onto the canvas. The ink takes a darkened
 * shade of the colour under it (as `inkFor` does for figures), so it reads
 * brown on paper and bronze on brass rather than a flat black.
 */
export function createInkPass(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  camera.layers.enable(NO_INK_LAYER);
  const color = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
  const depth = new THREE.DepthTexture(1, 1);
  // Multisampled too, so silhouettes and creases resolve to soft values the
  // ink can grade across, rather than stair-stepped hard edges.
  const normals = new THREE.WebGLRenderTarget(1, 1, { depthTexture: depth, samples: 4 });
  const normalMat = new THREE.MeshNormalMaterial();
  const cam = camera as THREE.PerspectiveCamera;
  const quadMat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: color.texture },
      tNormal: { value: normals.texture },
      tDepth: { value: depth },
      texel: { value: new THREE.Vector2() },
      width: { value: 1.5 },
      ink: { value: new THREE.Color(0x24140c) },
      cameraNear: { value: 0.01 },
      cameraFar: { value: 10 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform sampler2D tColor;
      uniform sampler2D tNormal;
      uniform sampler2D tDepth;
      uniform vec2 texel;
      uniform float width;
      uniform vec3 ink;
      uniform float cameraNear;
      uniform float cameraFar;
      varying vec2 vUv;
      float viewZ(vec2 uv) {
        return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar);
      }
      /** How strongly the surface at uv breaks from the one at the centre (0–1). */
      float breakAt(vec2 uv, vec4 n0, float z0) {
        vec4 n = texture2D(tNormal, uv);
        // Silhouette: one side covered, the other not.
        float e = abs(n.a - n0.a);
        if (n.a > 0.5 && n0.a > 0.5) {
          // Creases: the surface turns sharply.
          float turn = 1.0 - dot(normalize(n.rgb * 2.0 - 1.0), normalize(n0.rgb * 2.0 - 1.0));
          e = max(e, smoothstep(0.25, 0.55, turn));
          // Steps: one surface lying over another.
          float z = viewZ(uv);
          e = max(e, smoothstep(0.004, 0.012, abs(z - z0) / min(z, z0)));
        }
        return e;
      }
      void main() {
        vec4 c = texture2D(tColor, vUv);
        vec4 n0 = texture2D(tNormal, vUv);
        float z0 = viewZ(vUv);
        // Average the break over two rings of taps: a pixel right on an edge
        // sees it from about half of them, one near the line's rim from only a
        // few, so the line comes out graded (anti-aliased) instead of hard.
        float sum = 0.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 0.5235988;
          sum += breakAt(vUv + vec2(cos(a), sin(a)) * texel * width, n0, z0);
        }
        for (int i = 0; i < 6; i++) {
          float a = float(i) * 1.0471976 + 0.5235988;
          sum += breakAt(vUv + vec2(cos(a), sin(a)) * texel * width * 0.5, n0, z0);
        }
        float edge = smoothstep(0.04, 0.4, sum / 18.0);
        vec3 base = c.a > 0.001 ? c.rgb / c.a : vec3(0.0);
        // The ink: a deep shade of the colour beneath, pulled toward warm brown.
        vec3 local = n0.a > 0.5 ? base : ink;
        vec3 inkCol = mix(ink, local * 0.22, 0.45);
        // Ink laid over what's there (premultiplied "over").
        float k = edge * 0.9;
        float alpha = k + c.a * (1.0 - k);
        vec3 rgb = (inkCol * k + base * c.a * (1.0 - k)) / max(alpha, 1e-4);
        gl_FragColor = vec4(rgb, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;
      }`,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const size = new THREE.Vector2();
  const clear = new THREE.Color();

  let widthCss = 1.2;
  return {
    /** Ink line width in CSS pixels. */
    setWidth(px: number) {
      widthCss = px;
      quadMat.uniforms.width.value = widthCss * renderer.getPixelRatio();
    },
    /** Follow the renderer's drawing-buffer size (call after `setSize`/`setPixelRatio`). */
    resize() {
      renderer.getDrawingBufferSize(size);
      color.setSize(size.x, size.y);
      normals.setSize(size.x, size.y);
      quadMat.uniforms.texel.value.set(1 / size.x, 1 / size.y);
      quadMat.uniforms.width.value = widthCss * renderer.getPixelRatio();
    },
    render() {
      quadMat.uniforms.cameraNear.value = cam.near;
      quadMat.uniforms.cameraFar.value = cam.far;
      const alpha = renderer.getClearAlpha();
      renderer.getClearColor(clear);
      renderer.setRenderTarget(color);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      // Normals and depth of the inked objects only.
      scene.overrideMaterial = normalMat;
      camera.layers.disable(NO_INK_LAYER);
      renderer.setRenderTarget(normals);
      renderer.clear();
      const shadows = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.render(scene, camera);
      renderer.shadowMap.autoUpdate = shadows;
      camera.layers.enable(NO_INK_LAYER);
      scene.overrideMaterial = null;
      renderer.setRenderTarget(null);
      renderer.setClearColor(clear, alpha);
      renderer.render(quadScene, quadCam);
    },
    /** Compile the finishing shaders too, behind the loading screen. */
    compile() {
      renderer.compile(quadScene, quadCam);
    },
    dispose() {
      color.dispose();
      normals.dispose();
      depth.dispose();
      normalMat.dispose();
      quad.geometry.dispose();
      quadMat.dispose();
    },
  };
}

export type InkPass = ReturnType<typeof createInkPass>;

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

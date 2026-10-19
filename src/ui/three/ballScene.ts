import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import {
  HEARTH_INTENSITY,
  KEY_INTENSITY,
  addDeskLights,
  createDeskRenderer,
  createInkPass,
  cubicBezier,
  skipInk,
  loadDeskModel,
} from './deskThree';

/**
 * The home desk's crystal ball (Summon) as a real 3D model
 * (`public/models/adventurers_crystal_ball.glb`, built and baked in
 * `Blender/adventurers_crystal_ball.blend`), set up like the journal and the
 * map: loaded only through a dynamic import, one shared scene warmed behind the
 * loading screen, borrowed by `DeskBall3D` and handed back on unmount, lit by
 * the same candlelit desk lights.
 *
 * The model is the brass stand (`Ball_Stand`: the stepped plinth, the waisted
 * column and the gem settings), the petal cup (`Ball_Cup`), the violet gems
 * (`Ball_Gems`) and the orb (`Ball_Orb`). The stand, cup and gems share one
 * baked atlas. The orb is not baked: it is drawn by `ORB_FRAGMENT`, the SVG
 * drawing (`CrystalBallArt`) painted on the glass facing the viewer, with the
 * vortex, core, stars and motes animated from uniforms. It is unlit and stays
 * on the inked layer, so its silhouette is outlined while its smooth normals
 * never ink a crease. A dim violet point light at its centre lights the cup and
 * plinth, and a violet pool of light lies on the desk beneath it.
 *
 * The orb's colours (and the pool's and halo's) are the drawing's sRGB colours
 * run back through the ink pass's ACES tone map (`untonemap`), so they land on
 * the canvas as drawn while the brass around them stays tone-mapped.
 */

const MODEL_URL = `${import.meta.env.BASE_URL}models/adventurers_crystal_ball.glb`;
const EXPECTED_BYTES = 520_000;

const EXPOSURE = 1.5;
/** Camera height above the desk: nearly level, as the drawing stands the orb upright. */
const ELEVATION = THREE.MathUtils.degToRad(10);
const FOV = 22;
/** Where the drawing puts the orb's top and the plinth's front foot, as fractions of the box's height. */
const TOP_AT = 20 / 320;
const FOOT_AT = 290 / 320;
/** Hover: lift (m), grow, and how quickly it eases. */
const HOVER_LIFT = 0.0055;
const HOVER_SCALE = 0.03;
const HOVER_RATE = 9;
const CONTACT_OPACITY = 0.7;
/** The violet light inside the orb (cd), and how much hover brightens it. */
const ORB_LIGHT = 0.0042;
const ORB_LIGHT_HOVER = 0.65;
/** Ambient motion redraws at most this often; the spin-up and wind-down run at full rate. */
const AMBIENT_FRAME_MS = 1000 / 30;

/** The orb's ambient periods (s), as the drawing's CSS animates them. */
const SWIRL_PERIOD = 22;
const COUNTER_PERIOD = 31;
const BREATHE_PERIOD = 4.5;
const STAR_PERIOD = 3.2;
const MOTE_PERIOD = 4.5;
/** Choosing Summon: the vortex turns twice, faster and faster, and grows. */
const SPIN_UP_MS = 1400;
const SPIN_UP_TURNS = 2;
/** Coming back: it winds down a full turn from its whirl to rest. */
const SPIN_DOWN_MS = 1500;
const WHIRL_SCALE = 1.15;
/** Behind the Summoning Altar it keeps whirling at this period (s). */
const WHIRL_PERIOD = 0.9;

export const EASE = {
  /** `.desk-stage.leaving.to-summon` (cb-vortex). */
  spinUp: cubicBezier(0.6, 0, 0.9, 0.4),
  /** `.settling-summon` (cb-spin-down). */
  spinDown: cubicBezier(0.3, 0.5, 0.4, 1),
};

/**
 * The vortex's state, from the desk stage: at `rest`, spinning up as Summon
 * is chosen, `held` at its whirl's size (the frame the desk is drawn already
 * zoomed in, coming back), winding down to rest, or whirling on forever (the
 * frozen backdrop behind the altar).
 */
export type VortexMode = 'rest' | 'spinUp' | 'held' | 'spinDown' | 'whirl';

export interface BallScene {
  readonly canvas: HTMLCanvasElement;
  setHover(on: boolean): void;
  setInn(inn: boolean): void;
  /** The swirl turning, the core and pool breathing, the stars twinkling, the motes rising. */
  setAmbient(on: boolean): void;
  setVortex(mode: VortexMode): void;
  /** The canvas's size, and where the object's layout box sits in it (CSS px):
   *  the ball is framed to the box as the drawing was, and its glow may spill
   *  into the canvas's margins. */
  resize(width: number, height: number, box: { x: number; y: number; w: number; h: number }): void;
  dispose(): void;
}

let gltf: GLTF | null = null;
let gltfPromise: Promise<GLTF> | null = null;
let shared: BallScene | null = null;
let sharedInUse = false;

function loadBall(onProgress: (f: number) => void): Promise<GLTF> {
  if (!gltfPromise) {
    gltfPromise = loadDeskModel(MODEL_URL, EXPECTED_BYTES, onProgress).then((g) => (gltf = g));
    gltfPromise.catch(() => {
      gltfPromise = null;
    });
  }
  return gltfPromise;
}

/** Behind the loading screen: download and decode the model, then build and warm the shared scene. */
export async function preloadBall(onProgress: (f: number) => void): Promise<void> {
  await loadBall((f) => onProgress(0.85 * f));
  if (!shared) shared = buildScene(gltf!);
  onProgress(1);
}

/** Borrow a ready scene: the warm shared one, or a fresh one if that's taken. */
export function acquireBallScene(): BallScene | null {
  if (!gltf) return null;
  if (shared && !sharedInUse) {
    sharedInUse = true;
    return shared;
  }
  return buildScene(gltf);
}

/** Hand a scene back; the shared one stays warm (at rest, still) for the next desk. */
export function releaseBallScene(scene: BallScene) {
  if (scene === shared) {
    sharedInUse = false;
    scene.setAmbient(false);
    scene.setHover(false);
    scene.setVortex('rest');
  } else {
    scene.dispose();
  }
}

/**
 * The inverse of the ink pass's ACES Filmic tone map (three's fit, at the
 * scene's exposure): which linear colour comes out as `target` (linear) on
 * the canvas.
 */
const UNTONEMAP_GLSL = /* glsl */ `
  uniform mat3 uAcesInInv;
  uniform mat3 uAcesOutInv;
  uniform float uExposure;
  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  float rrtInverse(float y) {
    y = clamp(y, 0.0, 0.985);
    float a = 1.0 - 0.983729 * y;
    float b = 0.0245786 - 0.432951 * y;
    float c = -(0.000090537 + 0.238081 * y);
    return (-b + sqrt(b * b - 4.0 * a * c)) / (2.0 * a);
  }
  vec3 untonemap(vec3 srgb) {
    vec3 y = uAcesOutInv * srgbToLinear(clamp(srgb, 0.0, 1.0));
    vec3 v = vec3(rrtInverse(y.r), rrtInverse(y.g), rrtInverse(y.b));
    return max(uAcesInInv * v, 0.0) * 0.6 / uExposure;
  }
`;

function untonemapUniforms() {
  const acesIn = new THREE.Matrix3().set(
    0.59719, 0.35458, 0.04823,
    0.076, 0.90834, 0.01566,
    0.0284, 0.13383, 0.83777,
  );
  const acesOut = new THREE.Matrix3().set(
    1.60475, -0.53108, -0.07367,
    -0.10208, 1.10813, -0.00605,
    -0.00327, -0.07276, 1.07602,
  );
  return {
    uAcesInInv: { value: acesIn.invert() },
    uAcesOutInv: { value: acesOut.invert() },
    uExposure: { value: EXPOSURE },
  };
}

const ORB_VERTEX = /* glsl */ `
  uniform vec3 uCentre;
  uniform float uRadius;
  varying vec3 vViewPos;
  varying vec3 vCentre;
  varying float vRadius;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vCentre = (modelViewMatrix * vec4(uCentre, 1.0)).xyz;
    vRadius = length((modelViewMatrix * vec4(uRadius, 0.0, 0.0, 0.0)).xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * The orb, painted as `CrystalBallArt` draws it, in the drawing's own units:
 * each fragment finds where it lies on the disc the glass shows the viewer
 * and maps that onto the 260×320 viewBox (orb centre 130,122, radius 102,
 * y down), then lays the drawing's layers over each other there: the violet
 * radial body, the vortex (a tilted two-turn spiral and an arc, turning
 * together, plus a fainter counter-swirl), the breathing core, the stars, the
 * rising motes, the window's reflection, the pale rim and the highlights.
 */
const ORB_FRAGMENT = /* glsl */ `
  ${UNTONEMAP_GLSL}
  uniform float uSwirlA;
  uniform float uCounterA;
  uniform float uVortexA;
  uniform float uVortexS;
  uniform float uCore;
  uniform float uStarT;
  uniform float uMoteT;
  varying vec3 vViewPos;
  varying vec3 vCentre;
  varying float vRadius;

  const vec2 C = vec2(130.0, 122.0);
  const float PI = 3.14159265;
  const float TAU = 6.2831853;

  // A screen point into a frame rotated by \`deg\` (SVG rotate(), y down).
  vec2 toLocal(vec2 v, float deg) {
    float a = radians(deg);
    float c = cos(a), s = sin(a);
    return vec2(v.x * c + v.y * s, -v.x * s + v.y * c);
  }
  vec3 over(vec3 under, vec3 col, float a) {
    return mix(under, col, clamp(a, 0.0, 1.0));
  }
  // Distance to a spiral in an ellipse's frame (rx 1, ry \`sy\`), its radius
  // falling from r0 to r1 over \`turns\` turns, starting at angle a0 and
  // running clockwise on screen.
  float spiralDist(vec2 p, float sy, float r0, float r1, float turns, float a0) {
    vec2 e = vec2(p.x, p.y / sy);
    float rho = length(e);
    float a = atan(e.y, e.x);
    float span = turns * TAU;
    float base = mod(a - a0, TAU);
    float scale = length(vec2(cos(a), sy * sin(a)));
    float d = 1e4;
    for (int k = 0; k < 3; k++) {
      float phi = base + float(k) * TAU;
      if (phi > span) break;
      float r = r0 + (r1 - r0) * phi / span;
      // Ease the stroke in at its start and out at its end (round caps).
      float cap = smoothstep(0.0, 0.25, phi) * smoothstep(span, span - 0.35, phi);
      d = min(d, abs(rho - r) * scale + (1.0 - cap) * 6.0);
    }
    return d;
  }
  vec3 swirlColour(vec2 p) {
    float t = clamp(0.5 + (p.x + p.y) / 300.0, 0.0, 1.0);
    vec3 a = vec3(0.498, 0.839, 1.0);   // #7fd6ff
    vec3 b = vec3(0.769, 0.490, 1.0);   // #c47dff
    vec3 c = vec3(1.0, 0.541, 0.847);   // #ff8ad8
    return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, t * 2.0 - 1.0);
  }
  float ellipse(vec2 s, vec2 c, vec2 r, float deg) {
    return length(toLocal(s - c, deg) / r);
  }
  float dot2(vec2 s, vec2 c, float r) {
    return 1.0 - smoothstep(r - 0.45, r + 0.75, length(s - c));
  }
  float easeInOut(float x) { return x * x * (3.0 - 2.0 * x); }
  float easeIn(float x) { return pow(clamp(x, 0.0, 1.0), 1.7); }

  void main() {
    // Where this fragment lies on the disc the glass shows the viewer.
    vec3 n = normalize(vViewPos - vCentre);
    vec3 d = normalize(-vCentre);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), d));
    vec3 up = cross(d, right);
    float rim = sqrt(max(1e-4, 1.0 - pow(vRadius / length(vCentre), 2.0)));
    vec2 q = vec2(dot(n, right), dot(n, up)) / rim;
    float qr = min(length(q), 1.0);
    vec2 s = C + vec2(q.x, -q.y) * 102.0;
    vec2 v = s - C;

    // The glass: a deep violet radial, lit from high on the left.
    float t = length(s - vec2(113.7, 93.4)) / 146.9;
    vec3 col =
      t < 0.16 ? mix(vec3(0.937, 0.894, 1.0), vec3(0.682, 0.569, 1.0), t / 0.16) :
      t < 0.48 ? mix(vec3(0.682, 0.569, 1.0), vec3(0.353, 0.204, 0.8), (t - 0.16) / 0.32) :
      t < 0.82 ? mix(vec3(0.353, 0.204, 0.8), vec3(0.141, 0.071, 0.373), (t - 0.48) / 0.34) :
                 mix(vec3(0.141, 0.071, 0.373), vec3(0.078, 0.039, 0.220), clamp((t - 0.82) / 0.18, 0.0, 1.0));

    // The vortex: the swirl and its arc, turned by the ambient spin plus the
    // vortex's own (spin-up, wind-down, whirl), and grown with it.
    vec2 pv = toLocal(v, degrees(uVortexA)) / uVortexS;
    vec2 ps = toLocal(pv, degrees(uSwirlA));
    vec2 pe = toLocal(ps, -24.0);
    float dm = spiralDist(pe, 0.54, 76.0, 14.0, 2.0, PI);
    col = over(col, swirlColour(ps), 0.75 * (1.0 - smoothstep(1.2, 6.2, dm)));
    vec2 ea = vec2(pe.x, pe.y / 0.51);
    float da = abs(length(ea) - 90.0) * length(vec2(cos(atan(ea.y, ea.x)), 0.51 * sin(atan(ea.y, ea.x))));
    float arcMask = smoothstep(0.0, 18.0, -pe.y);
    col = over(col, vec3(0.624, 0.847, 1.0), 0.6 * arcMask * (1.0 - smoothstep(0.7, 1.9, da)));
    // The counter-swirl, fainter, turning the other way.
    vec2 pc = toLocal(pv, degrees(uCounterA));
    vec2 pce = toLocal(pc, 18.0);
    float dc = spiralDist(pce, 0.5, 69.0, 34.0, 1.05, 0.32);
    col = over(col, swirlColour(pc), 0.55 * (1.0 - smoothstep(0.9, 2.3, dc)));

    // The breathing core.
    float tc = length(v) / 46.0;
    vec3 coreCol = tc < 0.35 ? mix(vec3(1.0), vec3(0.784, 0.678, 1.0), tc / 0.35)
                             : mix(vec3(0.784, 0.678, 1.0), vec3(0.541, 0.361, 1.0), (tc - 0.35) / 0.65);
    float coreA = tc < 0.35 ? mix(0.95, 0.55, tc / 0.35) : mix(0.55, 0.0, clamp((tc - 0.35) / 0.65, 0.0, 1.0));
    col = over(col, coreCol, coreA * uCore);

    // Stars, twinkling out of step (or all bright when still).
    vec3 stars[10];
    stars[0] = vec3(82.0, 88.0, 1.6);  stars[1] = vec3(168.0, 72.0, 1.2);
    stars[2] = vec3(184.0, 140.0, 1.8); stars[3] = vec3(96.0, 160.0, 1.3);
    stars[4] = vec3(140.0, 52.0, 1.1); stars[5] = vec3(62.0, 132.0, 1.0);
    stars[6] = vec3(150.0, 182.0, 1.4); stars[7] = vec3(114.0, 106.0, 0.9);
    stars[8] = vec3(196.0, 104.0, 1.0); stars[9] = vec3(72.0, 108.0, 1.1);
    for (int i = 0; i < 10; i++) {
      float tw = 1.0;
      if (uStarT >= 0.0) {
        float f = fract((uStarT - float(i) * 0.37) / ${STAR_PERIOD.toFixed(1)});
        tw = 0.25 + 0.75 * easeInOut(f < 0.5 ? f * 2.0 : 2.0 - f * 2.0);
      }
      float r = stars[i].z * 1.25;
      float glow = exp(-pow(length(s - stars[i].xy) / (r * 2.6), 2.0)) * 0.35;
      col = over(col, vec3(1.0), tw * max(dot2(s, stars[i].xy, r), glow));
    }

    // Motes rising from the bottom of the glass.
    if (uMoteT >= 0.0) {
      float xs[5];
      xs[0] = 96.0; xs[1] = 124.0; xs[2] = 150.0; xs[3] = 172.0; xs[4] = 110.0;
      for (int i = 0; i < 5; i++) {
        float f = fract((uMoteT - float(i) * 0.9) / ${MOTE_PERIOD.toFixed(1)});
        float a = f < 0.25 ? 0.9 * easeIn(f / 0.25) : 0.9 * (1.0 - easeIn((f - 0.25) / 0.75));
        vec2 at = vec2(xs[i], 196.0 - 150.0 * easeIn(f));
        col = over(col, vec3(0.894, 0.835, 1.0), a * dot2(s, at, 1.9));
      }
    }

    // The window, reflected small and curved on the glass.
    vec2 w = toLocal(s - vec2(150.0, 46.0), 12.0);
    float wx = w.x / 38.0;
    float top = -4.0 * 4.0 * wx * (1.0 - wx) * 0.5 + 2.0 * wx;
    float bottom = 24.0 - 2.0 * 4.0 * wx * (1.0 - wx) + 2.0 * wx;
    float inside = step(0.0, w.x) * step(w.x, 37.0) * smoothstep(top - 0.6, top + 0.6, w.y) * (1.0 - smoothstep(bottom - 0.6, bottom + 0.6, w.y));
    float bars = max(1.0 - smoothstep(0.6, 1.4, abs(w.x - 18.5)), 1.0 - smoothstep(0.6, 1.4, abs(w.y - (12.0 - 3.0 * 4.0 * wx * (1.0 - wx) + 2.0 * wx))));
    col = over(col, mix(vec3(0.812, 0.878, 1.0), vec3(0.165, 0.102, 0.29), bars), 0.22 * inside);

    // The pale rim, the glass's edge, and the painted highlights.
    vec3 rimCol = qr < 0.97 ? vec3(0.847, 0.8, 1.0) : mix(vec3(0.847, 0.8, 1.0), vec3(1.0), (qr - 0.97) / 0.03);
    float rimA = qr < 0.8 ? 0.0 : qr < 0.97 ? 0.45 * (qr - 0.8) / 0.17 : mix(0.45, 0.2, (qr - 0.97) / 0.03);
    col = over(col, rimCol, rimA);
    col = over(col, vec3(0.839, 0.894, 1.0), 0.5 * smoothstep(1.0 - 2.2 / 102.0, 1.0 - 0.4 / 102.0, qr));
    col = over(col, vec3(1.0), 0.3 * (1.0 - smoothstep(0.55, 1.25, ellipse(s, vec2(88.0, 70.0), vec2(34.0, 18.0), -32.0))));
    col = over(col, vec3(1.0), 0.7 * (1.0 - smoothstep(0.8, 1.05, ellipse(s, vec2(78.0, 64.0), vec2(10.0, 5.0), -32.0))));
    col = over(col, vec3(1.0), 0.12 * (1.0 - smoothstep(0.8, 1.05, ellipse(s, vec2(176.0, 186.0), vec2(24.0, 7.0), -38.0))));

    gl_FragColor = vec4(untonemap(col), 1.0);
  }
`;

/**
 * A soft violet glow (the pool on the desk, the halo behind the orb on hover).
 * Unlike the glass it is not un-tone-mapped: a saturated violet run back
 * through ACES is an extreme blue, which blended over the shadow before the
 * tone map turns a muddy navy. A plain linear violet blends cleanly.
 */
function glowMaterial(colour: string, falloff: [number, number]) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColour: { value: new THREE.Color(colour) },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = uOpacity * (1.0 - smoothstep(${falloff[0].toFixed(2)}, ${falloff[1].toFixed(2)}, r));
        gl_FragColor = vec4(uColour, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
}

/** Alpha map for the plinth's round contact shade, fading out past its foot. */
function roundShadeTexture(inner: number) {
  const px = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  g.addColorStop(0, '#fff');
  g.addColorStop(inner, '#fff');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function buildScene(model: GLTF): BallScene {
  const canvas = document.createElement('canvas');
  canvas.className = 'desk-ball-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const { renderer, envMap } = createDeskRenderer(canvas, EXPOSURE);
  const scene = new THREE.Scene();
  scene.environment = envMap;
  scene.environmentIntensity = 0.35;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const ball = model.scene.clone(true);
  let orb: THREE.Mesh | null = null;
  let gems: THREE.Mesh | null = null;
  ball.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (o.name === 'Ball_Orb') orb = mesh;
    if (o.name === 'Ball_Gems') gems = mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    for (const tex of [mat.map, mat.normalMap, mat.roughnessMap]) if (tex) tex.anisotropy = maxAniso;
  });
  if (!orb || !gems) throw new Error('adventurers_crystal_ball.glb is missing an object');
  const orbMesh: THREE.Mesh = orb;
  const gemMesh: THREE.Mesh = gems;
  orbMesh.receiveShadow = false;

  // The gems glow faintly with the orb's light (their own copy of the atlas material).
  const gemMat = (gemMesh.material as THREE.MeshStandardMaterial).clone();
  gemMat.emissive = new THREE.Color(0x7a52ff);
  gemMat.emissiveMap = gemMat.map;
  gemMat.emissiveIntensity = 0.18;
  gemMesh.material = gemMat;

  // The orb's glass, painted by the shader.
  orbMesh.geometry.computeBoundingSphere();
  const sphere = orbMesh.geometry.boundingSphere!;
  const orbMat = new THREE.ShaderMaterial({
    uniforms: {
      ...untonemapUniforms(),
      uCentre: { value: sphere.center.clone() },
      uRadius: { value: sphere.radius },
      uSwirlA: { value: 0 },
      uCounterA: { value: 0 },
      uVortexA: { value: 0 },
      uVortexS: { value: 1 },
      uCore: { value: 1 },
      uStarT: { value: -1 },
      uMoteT: { value: -1 },
    },
    vertexShader: ORB_VERTEX,
    fragmentShader: ORB_FRAGMENT,
  });
  (orbMesh.material as THREE.Material).dispose();
  orbMesh.material = orbMat;
  const u = orbMat.uniforms;

  // The ball in a holder that carries the hover lift.
  const holder = new THREE.Group();
  holder.add(ball);
  scene.add(holder);
  ball.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(ball);
  const orbCentre = sphere.center.clone().applyMatrix4(orbMesh.matrixWorld);
  const orbRadius = sphere.radius;
  const footR = Math.max(box.max.x, box.max.z);

  // The violet light inside the glass, lighting the cup and plinth.
  const orbLight = new THREE.PointLight(0x8a5cff, ORB_LIGHT, 0.3, 2);
  orbLight.position.copy(orbCentre);
  holder.add(orbLight);

  // The cast shadow, on an invisible desk.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.42 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = box.min.y - 0.0004;
  floor.receiveShadow = true;
  skipInk(floor);
  scene.add(floor);

  // Contact shade under the plinth.
  const contactTex = roundShadeTexture(0.78);
  const contactMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    depthWrite: false,
    alphaMap: contactTex,
    opacity: CONTACT_OPACITY,
  });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(footR * 2.3, footR * 2.3), contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = box.min.y + 0.0002;
  skipInk(contact);
  scene.add(contact);

  // The violet pool the orb casts on the desk (the drawing's .cb-pool).
  const poolMat = glowMaterial('#a98cff', [0.2, 1]);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(footR * 3.4, footR * 3.4), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = box.min.y + 0.0004;
  pool.renderOrder = 1;
  skipInk(pool);
  scene.add(pool);

  // The glow round the glass on hover, behind it, facing the viewer.
  const haloMat = glowMaterial('#9470ff', [0.4, 1]);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(orbRadius * 3.4, orbRadius * 3.4), haloMat);
  halo.renderOrder = 2;
  skipInk(halo);
  holder.add(halo);

  const { key, hearth } = addDeskLights(scene, 0.2);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 10);
  const inkPass = createInkPass(renderer, scene, camera);
  inkPass.setWidth(1.1);
  const dir = new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
  const orbTop = orbCentre.clone().add(new THREE.Vector3(0, orbRadius, 0));
  const foot = new THREE.Vector3(0, box.min.y, box.max.z);

  /** Place the camera so the orb's top and the plinth's foot land where the drawing put them. */
  const frame = () => {
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const target = new THREE.Vector3(0, (orbTop.y + foot.y) / 2, 0);
    let dist = 0.6;
    const wantSpan = 2 * (FOOT_AT - TOP_AT);
    const wantMid = 1 - (TOP_AT + FOOT_AT);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    for (let i = 0; i < 40; i++) {
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      // The glass's silhouette top, seen from here: its centre plus the radius across the view.
      const view = camera.position.clone().sub(orbCentre).normalize();
      const across = new THREE.Vector3(0, 1, 0).sub(view.clone().multiplyScalar(view.y)).normalize();
      const top = orbCentre.clone().addScaledVector(across, orbRadius).project(camera).y;
      const bottom = foot.clone().project(camera).y;
      dist *= (top - bottom) / wantSpan;
      target.y += ((top + bottom) / 2 - wantMid) * dist * tanHalf;
    }
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    // The halo faces the viewer from just behind the glass.
    const back = camera.position.clone().sub(orbCentre).normalize();
    halo.position.copy(orbCentre).addScaledVector(back, -orbRadius * 1.02);
    halo.quaternion.copy(camera.quaternion);
  };

  let hover = 0;
  let hoverTarget = 0;
  let ambient = false;
  let ambientStart = performance.now();
  let vortex: VortexMode = 'rest';
  let vortexStart = 0;
  let raf = 0;
  let last = 0;
  let lastDraw = 0;
  let disposed = false;

  const vortexPose = (now: number): [number, number, boolean] => {
    const f = (ms: number) => Math.min(1, (now - vortexStart) / ms);
    switch (vortex) {
      case 'spinUp': {
        const k = f(SPIN_UP_MS);
        return [SPIN_UP_TURNS * Math.PI * 2 * EASE.spinUp(k), 1 + (WHIRL_SCALE - 1) * k, k < 1];
      }
      case 'spinDown': {
        const k = f(SPIN_DOWN_MS);
        const e = EASE.spinDown(k);
        if (k >= 1) vortex = 'rest';
        return [Math.PI * 2 * e, WHIRL_SCALE + (1 - WHIRL_SCALE) * e, k < 1];
      }
      case 'whirl':
        return [((((now - vortexStart) / 1000) % WHIRL_PERIOD) / WHIRL_PERIOD) * Math.PI * 2, WHIRL_SCALE, false];
      case 'held':
        return [0, WHIRL_SCALE, false];
      default:
        return [0, 1, false];
    }
  };

  const pose = (now: number) => {
    const t = (now - ambientStart) / 1000;
    const breathe = ambient ? 0.85 - 0.15 * Math.cos((t / BREATHE_PERIOD) * Math.PI * 2) : 1;
    holder.position.y = HOVER_LIFT * hover;
    holder.scale.setScalar(1 + HOVER_SCALE * hover);
    key.intensity = KEY_INTENSITY * (1 + 0.1 * hover);
    contactMat.opacity = CONTACT_OPACITY * (1 - 0.5 * hover);
    contact.scale.setScalar(1 + 0.05 * hover);
    u.uSwirlA.value = ambient ? ((t / SWIRL_PERIOD) % 1) * Math.PI * 2 : 0;
    u.uCounterA.value = ambient ? -((t / COUNTER_PERIOD) % 1) * Math.PI * 2 : 0;
    const [va, vs] = vortexPose(now);
    u.uVortexA.value = va;
    u.uVortexS.value = vs;
    u.uCore.value = breathe * (1 + 0.3 * hover);
    u.uStarT.value = ambient ? t : -1;
    u.uMoteT.value = ambient ? t : -1;
    orbLight.intensity = ORB_LIGHT * breathe * (1 + ORB_LIGHT_HOVER * hover);
    poolMat.uniforms.uOpacity.value = 0.42 * breathe * (1 + 0.35 * hover);
    haloMat.uniforms.uOpacity.value = 0.5 * hover;
  };
  const render = (now = performance.now()) => {
    pose(now);
    inkPass.render();
    lastDraw = now;
  };
  /** Fast motion, drawn every frame: hover easing, the spin-up (it then holds its last pose), the wind-down. */
  const fast = (now: number) =>
    hover !== hoverTarget ||
    (vortex === 'spinUp' && now - vortexStart < SPIN_UP_MS + 50) ||
    vortex === 'spinDown';
  /** Slow, endless motion, drawn at the ambient cadence. */
  const endless = () => ambient || vortex === 'whirl';
  const tick = (now: number) => {
    raf = 0;
    if (disposed || !canvas.isConnected) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = fast(now);
    hover += (hoverTarget - hover) * (1 - Math.exp(-HOVER_RATE * dt));
    if (Math.abs(hoverTarget - hover) < 0.002) hover = hoverTarget;
    if (moving || now - lastDraw >= AMBIENT_FRAME_MS - 1) render(now);
    if (fast(now) || endless()) raf = requestAnimationFrame(tick);
    else last = 0;
  };
  const wake = () => {
    if (!raf && !disposed && canvas.isConnected) raf = requestAnimationFrame(tick);
    else if (!canvas.isConnected) render();
  };

  const api: BallScene = {
    canvas,
    setHover(on) {
      hoverTarget = on ? 1 : 0;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || !canvas.isConnected) {
        hover = hoverTarget;
        render();
      } else wake();
    },
    setInn(inn) {
      const target = inn ? HEARTH_INTENSITY : 0;
      if (hearth.intensity === target) return;
      hearth.intensity = target;
      render();
    },
    setAmbient(on) {
      if (on === ambient) return;
      ambient = on;
      if (on) {
        ambientStart = performance.now();
        wake();
      } else render();
    },
    setVortex(mode) {
      if (mode === vortex) return;
      vortex = mode;
      vortexStart = performance.now();
      if (canvas.isConnected) wake();
      render();
    },
    resize(width, height, b) {
      if (width <= 0 || height <= 0 || b.w <= 0 || b.h <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      // Extra resolution for the desk's zoom into the orb, within a pixel budget.
      const ratio = Math.min(3, dpr * 1.8, Math.sqrt(5_000_000 / (width * height)));
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      inkPass.resize();
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
      pool.geometry.dispose();
      poolMat.dispose();
      halo.geometry.dispose();
      haloMat.dispose();
      orbMat.dispose();
      gemMat.dispose();
      envMap.dispose();
      inkPass.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };

  // Warm up: compile every shader and upload the textures now, behind the
  // loading screen, rather than on the desk's first frame.
  renderer.setSize(64, 80, false);
  inkPass.resize();
  camera.aspect = 0.8125;
  frame();
  camera.updateProjectionMatrix();
  renderer.compile(scene, camera);
  inkPass.compile();
  render();
  return api;
}

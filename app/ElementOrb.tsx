"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Element = "fire" | "earth" | "air" | "water";
type ElementTally = Record<Element, number>;

// Distinct from all five shape-family colors on purpose -- this is a
// deliberately separate system, and reusing a shape-family color here
// would blur the two together visually.
const ELEMENT_COLORS: Record<Element, number> = {
  fire: 0xe2632b,
  earth: 0x6b8f5c,
  air: 0xb8c4d9,
  water: 0x4a7ba6,
};

const ELEMENT_POLES: Record<Element, [number, number, number]> = {
  fire: [1, 1, 1],
  earth: [-1, -1, 1],
  air: [1, -1, -1],
  water: [-1, 1, -1],
};

// A fullscreen procedural nebula, rendered directly in the fragment shader
// (fractal value noise, several octaves) rather than blurred CSS circles --
// genuine wispy cloud structure instead of a handful of soft blobs, which
// is what actually reads as "a picture of deep space" rather than a
// gradient effect. Vertex shader ignores the camera entirely (clip-space
// quad) so it always fills the viewport regardless of camera movement.
const NEBULA_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const NEBULA_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uColorFire;
  uniform vec3 uColorWater;
  uniform vec3 uColorEarth;
  uniform vec3 uColorAir;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      v += amp * noise(p);
      p *= 2.02;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 p = (vUv - 0.5) * aspect * 2.6;
    vec2 drift = vec2(uTime * 0.009, uTime * 0.005);

    float n1 = fbm(p * 1.3 + drift);
    float n2 = fbm(p * 1.1 - drift * 1.3 + 8.0);
    float n3 = fbm(p * 1.7 + drift * 0.6 + 20.0);

    vec3 col = mix(uColorFire, uColorWater, n1);
    col = mix(col, uColorEarth, n2 * 0.55);
    col = mix(col, uColorAir, n3 * 0.35);

    float dist = length(vUv - 0.5) * 2.0;
    float vignette = smoothstep(1.5, 0.15, dist);
    float density = fbm(p * 1.4 + drift * 0.8) * vignette;
    float alpha = clamp(density * 0.4 - 0.06, 0.0, 0.4);

    gl_FragColor = vec4(col, alpha);
  }
`;

const ELEMENT_KEYS: Element[] = ["fire", "earth", "air", "water"];
// Full-screen now, not a small corner accent, but a full-viewport canvas
// updating this many points' positions on the CPU every frame is real
// work -- 2200 caused visible stutter on ordinary hardware. Trading some
// density for smoothness; still much denser than the original 1200.
const COUNT = 1500;
// Distant, static backdrop stars -- cheap even at this count since they
// never get per-vertex position updates (see animate() below), just a
// single whole-group rotation each frame. Gives the element cloud
// somewhere to float, instead of it being the entire visible universe.
const STAR_COUNT = 900;

// A live, ambient particle cloud that pulls toward whichever element(s)
// are actually being tagged this session -- same mechanics as the
// reference demo (weighted pull toward per-element "poles"), restyled to
// this app's own palette and stretched to fill the viewport behind the
// conversation. Purely driven by the `tally` prop; nothing in here decides
// what gets tagged.
export default function ElementOrb({ tally }: { tally: ElementTally }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tallyRef = useRef(tally);
  tallyRef.current = tally;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    // Particles further from camera fade into the same dark as the page
    // background -- depth instead of a flat, evenly-lit cloud.
    scene.fog = new THREE.Fog(0x14120f, 2.4, 6.6);
    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 5.4);

    // No antialiasing -- these are small square points, not geometry with
    // edges that benefit from it, and MSAA on a full-screen canvas is
    // expensive for little visible gain here. Pixel ratio capped lower
    // than the usual 2 for the same reason: a full-viewport canvas at full
    // Retina density is a lot of fill-rate for a continuously animating
    // scene.
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    function handleResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      nebulaMaterial.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", handleResize);

    const nebulaMaterial = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERTEX_SHADER,
      fragmentShader: NEBULA_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uColorFire: { value: new THREE.Color(ELEMENT_COLORS.fire) },
        uColorWater: { value: new THREE.Color(ELEMENT_COLORS.water) },
        uColorEarth: { value: new THREE.Color(ELEMENT_COLORS.earth) },
        uColorAir: { value: new THREE.Color(ELEMENT_COLORS.air) },
      },
    });
    const nebulaMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), nebulaMaterial);
    nebulaMesh.frustumCulled = false;
    nebulaMesh.renderOrder = -1;
    scene.add(nebulaMesh);

    const basePositions = new Float32Array(COUNT * 3);
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const baseColors = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    const twinkleSpeeds = new Float32Array(COUNT);
    const assignedEl: Element[] = [];

    for (let i = 0; i < COUNT; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(2.7 + Math.random() * 0.25);
      basePositions[i * 3] = v.x;
      basePositions[i * 3 + 1] = v.y;
      basePositions[i * 3 + 2] = v.z;
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;

      let best: Element = ELEMENT_KEYS[0];
      let bestD = -Infinity;
      for (const k of ELEMENT_KEYS) {
        const pole = new THREE.Vector3(...ELEMENT_POLES[k]).normalize();
        const d = v.clone().normalize().dot(pole);
        if (d > bestD) {
          bestD = d;
          best = k;
        }
      }
      assignedEl[i] = best;
      const c = new THREE.Color(ELEMENT_COLORS[best]);
      baseColors[i * 3] = c.r;
      baseColors[i * 3 + 1] = c.g;
      baseColors[i * 3 + 2] = c.b;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      seeds[i] = Math.random() * Math.PI * 2;
      // Each particle drifts in and out of visibility at its own slow,
      // uneven pace -- like something glimpsed in fog, not a uniformly lit
      // cloud rotating in place.
      twinkleSpeeds[i] = 0.25 + Math.random() * 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // Dimmer than the earlier "more vivid" pass -- full brightness read as
    // distracting while actually reading/typing during a conversation.
    // Movement stays (see animate() below); it's the brightness that's
    // toned down so it recedes behind the text instead of competing with it.
    const material = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // The backdrop starfield -- scattered through a much bigger volume than
    // the element cloud, static (no per-frame CPU work), excluded from fog
    // so it reads as depth stretching away rather than getting swallowed by
    // it. Purely decorative: never touches `tally`.
    const starPositions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(3.2 + Math.random() * 6.5);
      starPositions[i * 3] = v.x;
      starPositions[i * 3 + 1] = v.y;
      starPositions[i * 3 + 2] = v.z;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xa39b8c,
      size: 0.028,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      fog: false,
    });
    const starPoints = new THREE.Points(starGeometry, starMaterial);
    scene.add(starPoints);

    let t = 0;
    let raf = 0;

    function animate() {
      raf = requestAnimationFrame(animate);
      t += 0.006;
      nebulaMaterial.uniforms.uTime.value = t;
      points.rotation.y += 0.001;
      points.rotation.x = Math.sin(t * 0.15) * 0.04;
      starPoints.rotation.y += 0.00025;

      const tallyNow = tallyRef.current;
      const allZero = ELEMENT_KEYS.every((k) => tallyNow[k] === 0);
      // Neutral, balanced sphere until anything's actually been tagged --
      // "something is forming," not a meter that starts at zero.
      const scores: Record<Element, number> = allZero
        ? { fire: 1, earth: 1, air: 1, water: 1 }
        : {
            fire: tallyNow.fire + 0.15,
            earth: tallyNow.earth + 0.15,
            air: tallyNow.air + 0.15,
            water: tallyNow.water + 0.15,
          };
      const scoreTotal = ELEMENT_KEYS.reduce((sum, k) => sum + scores[k], 0);
      const pull = 0.35;

      const pos = geometry.attributes.position.array as Float32Array;
      const col = geometry.attributes.color.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        const el = assignedEl[i];
        const weight = scores[el] / scoreTotal;
        const pole = ELEMENT_POLES[el];
        const bx = basePositions[i * 3];
        const by = basePositions[i * 3 + 1];
        const bz = basePositions[i * 3 + 2];
        const wob = Math.sin(t * 1.3 + seeds[i]) * 0.05;
        const targetScale = 1 + weight * pull * 1.4;
        const tx = bx * targetScale + pole[0] * weight * pull * 0.5;
        const ty = by * targetScale + pole[1] * weight * pull * 0.5;
        const tz = bz * targetScale + pole[2] * weight * pull * 0.5;
        pos[i * 3] += (tx - pos[i * 3]) * 0.024 + wob * 0.02;
        pos[i * 3 + 1] += (ty - pos[i * 3 + 1]) * 0.024 + wob * 0.02;
        pos[i * 3 + 2] += (tz - pos[i * 3 + 2]) * 0.024 + wob * 0.02;

        // Twinkle: each particle's own brightness drifts between faint and
        // full over its own slow cycle, never fully off.
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * twinkleSpeeds[i] + seeds[i]));
        col[i * 3] = baseColors[i * 3] * twinkle;
        col[i * 3 + 1] = baseColors[i * 3 + 1] * twinkle;
        col[i * 3 + 2] = baseColors[i * 3 + 2] * twinkle;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;

      renderer.render(scene, camera);
    }
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(raf);
      geometry.dispose();
      material.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      nebulaMesh.geometry.dispose();
      nebulaMaterial.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className="element-orb-canvas" aria-hidden="true" />;
}

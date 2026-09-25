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

const ELEMENT_KEYS: Element[] = ["fire", "earth", "air", "water"];
// A dense, mostly-static backdrop -- like real astrophotography, not a
// sparse network. Cheap even at this count: no per-vertex position
// updates, just a whole-group rotation each frame (see animate()).
const STAR_COUNT = 1700;
// The small set of element-colored, tally-reactive nodes -- the actual
// "something is forming" mechanic, now a quiet foreground layer over the
// photographic backdrop rather than the whole visual by itself.
const NODE_COUNT = 55;

// A backdrop modeled on a real Milky Way photo (dense stars + a warm,
// textured band of light) with a small foreground of element-colored nodes
// that drift toward whichever element(s) are actually being tagged this
// session. The band and starfield are purely atmospheric; only the nodes
// respond to `tally`.
export default function ElementOrb({ tally }: { tally: ElementTally }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tallyRef = useRef(tally);
  tallyRef.current = tally;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x14120f, 3.2, 7.5);
    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 5.4);

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // --- The Milky Way band: a fullscreen shader, rendered first as a
    // clip-space quad (vertex shader ignores the camera), fbm noise
    // masked into a soft diagonal band with a warm core fading to cool
    // purple-blue at its edges -- modeled on a real night-sky photo
    // rather than a diffuse wash across the whole screen.
    const bandMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.9999, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec2 uResolution;
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
          vec2 p = (vUv - 0.5) * aspect;

          float ang = 0.26;
          float ca = cos(ang);
          float sa = sin(ang);
          vec2 rp = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);

          float bandWidth = mix(0.16, 0.34, smoothstep(-0.9, 1.1, rp.y));
          float core = 1.0 - smoothstep(0.0, bandWidth, abs(rp.x));

          float drift = uTime * 0.004;
          float tex1 = fbm(rp * vec2(2.4, 1.1) + vec2(drift, drift * 0.5));
          float tex2 = fbm(rp * vec2(3.6, 1.8) + vec2(-drift * 0.7, 10.0));
          float wisp = tex1 * 0.6 + tex2 * 0.4;

          float intensity = clamp(core * (0.3 + 0.7 * wisp), 0.0, 1.0);

          vec3 colorCore = vec3(0.878, 0.659, 0.471);
          vec3 colorMid = vec3(0.686, 0.482, 0.545);
          vec3 colorEdge = vec3(0.353, 0.322, 0.475);

          vec3 col = mix(colorEdge, colorMid, intensity);
          col = mix(col, colorCore, intensity * intensity);

          float alpha = intensity * 0.5;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const bandMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bandMaterial);
    bandMesh.frustumCulled = false;
    bandMesh.renderOrder = -1;
    scene.add(bandMesh);

    function handleResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      bandMaterial.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", handleResize);

    // --- Dense static starfield.
    const starPositions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(2.6 + Math.random() * 6.5);
      starPositions[i * 3] = v.x;
      starPositions[i * 3 + 1] = v.y;
      starPositions[i * 3 + 2] = v.z;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xd8d0c2,
      size: 0.022,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      fog: false,
    });
    const starPoints = new THREE.Points(starGeometry, starMaterial);
    scene.add(starPoints);

    // A second, sparser layer of slightly bigger/brighter "near" stars for
    // depth variation, matching how a real photo has stars of visibly
    // different sizes, not one uniform dot size.
    const BRIGHT_STAR_COUNT = 140;
    const brightPositions = new Float32Array(BRIGHT_STAR_COUNT * 3);
    for (let i = 0; i < BRIGHT_STAR_COUNT; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(2.6 + Math.random() * 6.5);
      brightPositions[i * 3] = v.x;
      brightPositions[i * 3 + 1] = v.y;
      brightPositions[i * 3 + 2] = v.z;
    }
    const brightGeometry = new THREE.BufferGeometry();
    brightGeometry.setAttribute("position", new THREE.BufferAttribute(brightPositions, 3));
    const brightMaterial = new THREE.PointsMaterial({
      color: 0xf0e8d8,
      size: 0.045,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      fog: false,
    });
    const brightPoints = new THREE.Points(brightGeometry, brightMaterial);
    scene.add(brightPoints);

    // --- The tally-reactive element nodes -- a quiet foreground layer.
    const basePositions = new Float32Array(NODE_COUNT * 3);
    const positions = new Float32Array(NODE_COUNT * 3);
    const colors = new Float32Array(NODE_COUNT * 3);
    const baseColors = new Float32Array(NODE_COUNT * 3);
    const seeds = new Float32Array(NODE_COUNT);
    const twinkleSpeeds = new Float32Array(NODE_COUNT);
    const assignedEl: Element[] = [];

    for (let i = 0; i < NODE_COUNT; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(2.3 + Math.random() * 0.9);
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
      twinkleSpeeds[i] = 0.25 + Math.random() * 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    let t = 0;
    let raf = 0;

    function animate() {
      raf = requestAnimationFrame(animate);
      t += 0.006;
      bandMaterial.uniforms.uTime.value = t;
      starPoints.rotation.y += 0.00025;
      brightPoints.rotation.y += 0.00025;
      points.rotation.y += 0.00025;

      const tallyNow = tallyRef.current;
      const allZero = ELEMENT_KEYS.every((k) => tallyNow[k] === 0);
      const scores: Record<Element, number> = allZero
        ? { fire: 1, earth: 1, air: 1, water: 1 }
        : {
            fire: tallyNow.fire + 0.15,
            earth: tallyNow.earth + 0.15,
            air: tallyNow.air + 0.15,
            water: tallyNow.water + 0.15,
          };
      const scoreTotal = ELEMENT_KEYS.reduce((sum, k) => sum + scores[k], 0);
      const pull = 0.4;

      const pos = geometry.attributes.position.array as Float32Array;
      const col = geometry.attributes.color.array as Float32Array;
      for (let i = 0; i < NODE_COUNT; i++) {
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
        pos[i * 3] += (tx - pos[i * 3]) * 0.022 + wob * 0.02;
        pos[i * 3 + 1] += (ty - pos[i * 3 + 1]) * 0.022 + wob * 0.02;
        pos[i * 3 + 2] += (tz - pos[i * 3 + 2]) * 0.022 + wob * 0.02;

        const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * twinkleSpeeds[i] + seeds[i]));
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
      brightGeometry.dispose();
      brightMaterial.dispose();
      bandMesh.geometry.dispose();
      bandMaterial.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className="element-orb-canvas" aria-hidden="true" />;
}

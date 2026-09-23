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
// Lighter than the reference demo's 2200-2400 -- this runs continuously
// in the background of an active conversation, not a dedicated full-
// screen moment, so it needs to stay cheap.
const COUNT = 1200;

// A live, ambient particle cloud that pulls toward whichever element(s)
// are actually being tagged this session -- same mechanics as the
// reference demo (weighted pull toward per-element "poles"), restyled to
// this app's own palette. Purely driven by the `tally` prop; nothing in
// here decides what gets tagged.
export default function ElementOrb({ tally, size = 320 }: { tally: ElementTally; size?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tallyRef = useRef(tally);
  tallyRef.current = tally;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size);
    container.appendChild(renderer.domElement);

    const basePositions = new Float32Array(COUNT * 3);
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    const assignedEl: Element[] = [];

    for (let i = 0; i < COUNT; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(2.0 + Math.random() * 0.15);
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
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      seeds[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    let t = 0;
    let raf = 0;

    function animate() {
      raf = requestAnimationFrame(animate);
      t += 0.008;
      points.rotation.y += 0.0015;
      points.rotation.x = Math.sin(t * 0.15) * 0.05;

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
        pos[i * 3] += (tx - pos[i * 3]) * 0.03 + wob * 0.02;
        pos[i * 3 + 1] += (ty - pos[i * 3 + 1]) * 0.03 + wob * 0.02;
        pos[i * 3 + 2] += (tz - pos[i * 3 + 2]) * 0.03 + wob * 0.02;
      }
      geometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  return <div ref={containerRef} style={{ width: size, height: size }} aria-hidden="true" />;
}

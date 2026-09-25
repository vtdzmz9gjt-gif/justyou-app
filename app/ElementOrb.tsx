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
// A constellation, not a dense cloud -- far fewer nodes than earlier
// attempts, each one meant to read individually, connected by lines that
// form and break as they drift. Also keeps the per-frame line-distance
// check (O(n^2) over these nodes) cheap.
const COUNT = 80;
const CONNECT_DISTANCE = 1.15;
const MAX_LINES = 220;

const ACCENT_COLOR = new THREE.Color(0xc99a5b);

// A sparse network of nodes pulling toward whichever element(s) are
// actually being tagged this session -- same underlying mechanic as
// earlier attempts (weighted pull toward per-element "poles"), now drawn
// as a constellation (points + the lines connecting nearby ones) instead
// of a dense particle field. Purely driven by the `tally` prop; nothing in
// here decides what gets tagged.
export default function ElementOrb({ tally }: { tally: ElementTally }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tallyRef = useRef(tally);
  tallyRef.current = tally;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x14120f, 3, 7.5);
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

    function handleResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", handleResize);

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
        .multiplyScalar(2.4 + Math.random() * 1.1);
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
      size: 0.095,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // The connecting lines -- a fixed-capacity buffer, only the first
    // `lineCount * 2` vertices actually drawn each frame (drawRange),
    // since which nodes are close enough to connect changes constantly.
    const linePositions = new Float32Array(MAX_LINES * 2 * 3);
    const lineColors = new Float32Array(MAX_LINES * 2 * 3);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));
    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    let t = 0;
    let raf = 0;

    function animate() {
      raf = requestAnimationFrame(animate);
      t += 0.006;
      points.rotation.y += 0.001;
      points.rotation.x = Math.sin(t * 0.15) * 0.04;
      lines.rotation.y = points.rotation.y;
      lines.rotation.x = points.rotation.x;

      const tallyNow = tallyRef.current;
      const allZero = ELEMENT_KEYS.every((k) => tallyNow[k] === 0);
      // Neutral, balanced network until anything's actually been tagged --
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
      const pull = 0.4;

      const pos = geometry.attributes.position.array as Float32Array;
      const col = geometry.attributes.color.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        const el = assignedEl[i];
        const weight = scores[el] / scoreTotal;
        const pole = ELEMENT_POLES[el];
        const bx = basePositions[i * 3];
        const by = basePositions[i * 3 + 1];
        const bz = basePositions[i * 3 + 2];
        const wob = Math.sin(t * 1.3 + seeds[i]) * 0.06;
        const targetScale = 1 + weight * pull * 1.4;
        const tx = bx * targetScale + pole[0] * weight * pull * 0.5;
        const ty = by * targetScale + pole[1] * weight * pull * 0.5;
        const tz = bz * targetScale + pole[2] * weight * pull * 0.5;
        pos[i * 3] += (tx - pos[i * 3]) * 0.02 + wob * 0.02;
        pos[i * 3 + 1] += (ty - pos[i * 3 + 1]) * 0.02 + wob * 0.02;
        pos[i * 3 + 2] += (tz - pos[i * 3 + 2]) * 0.02 + wob * 0.02;

        const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * twinkleSpeeds[i] + seeds[i]));
        col[i * 3] = baseColors[i * 3] * twinkle;
        col[i * 3 + 1] = baseColors[i * 3 + 1] * twinkle;
        col[i * 3 + 2] = baseColors[i * 3 + 2] * twinkle;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;

      // Rebuild the connecting lines from scratch each frame -- O(n^2)
      // over just 80 nodes (~3200 pairs) is cheap.
      const linePos = lineGeometry.attributes.position.array as Float32Array;
      const lineCol = lineGeometry.attributes.color.array as Float32Array;
      let lineCount = 0;
      for (let i = 0; i < COUNT && lineCount < MAX_LINES; i++) {
        for (let j = i + 1; j < COUNT && lineCount < MAX_LINES; j++) {
          const dx = pos[i * 3] - pos[j * 3];
          const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
          const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < CONNECT_DISTANCE) {
            const fade = 1 - dist / CONNECT_DISTANCE;
            const o = lineCount * 6;
            linePos[o] = pos[i * 3];
            linePos[o + 1] = pos[i * 3 + 1];
            linePos[o + 2] = pos[i * 3 + 2];
            linePos[o + 3] = pos[j * 3];
            linePos[o + 4] = pos[j * 3 + 1];
            linePos[o + 5] = pos[j * 3 + 2];
            lineCol[o] = ACCENT_COLOR.r * fade;
            lineCol[o + 1] = ACCENT_COLOR.g * fade;
            lineCol[o + 2] = ACCENT_COLOR.b * fade;
            lineCol[o + 3] = ACCENT_COLOR.r * fade;
            lineCol[o + 4] = ACCENT_COLOR.g * fade;
            lineCol[o + 5] = ACCENT_COLOR.b * fade;
            lineCount++;
          }
        }
      }
      lineGeometry.attributes.position.needsUpdate = true;
      lineGeometry.attributes.color.needsUpdate = true;
      lineGeometry.setDrawRange(0, lineCount * 2);

      renderer.render(scene, camera);
    }
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(raf);
      geometry.dispose();
      material.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className="element-orb-canvas" aria-hidden="true" />;
}

"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Element = "fire" | "earth" | "air" | "water";
type ElementTally = Record<Element, number>;

const ELEMENT_COLORS: Record<Element, number> = {
  fire: 0xe2632b,
  earth: 0x6b8f5c,
  air: 0xb8c4d9,
  water: 0x4a7ba6,
};

const ELEMENT_KEYS: Element[] = ["fire", "earth", "air", "water"];
const COUNT = 1400;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function sampleCapsule(a: [number, number, number], b: [number, number, number], radius: number) {
  const t = Math.random();
  const cx = lerp(a[0], b[0], t);
  const cy = lerp(a[1], b[1], t);
  const cz = lerp(a[2], b[2], t);
  const theta = Math.random() * Math.PI * 2;
  const r = radius * Math.sqrt(Math.random());
  return [cx + Math.cos(theta) * r, cy, cz + Math.sin(theta) * r * 0.6];
}
function sampleSphere(c: [number, number, number], radius: number) {
  const u = Math.random();
  const v = Math.random();
  const theta = u * Math.PI * 2;
  const phi = Math.acos(2 * v - 1);
  const r = radius * Math.cbrt(Math.random());
  return [
    c[0] + r * Math.sin(phi) * Math.cos(theta),
    c[1] + r * Math.cos(phi) * 0.9,
    c[2] + r * Math.sin(phi) * Math.sin(theta) * 0.7,
  ];
}

const FEET_Y = -1.7;
const HEAD_Y = 1.75;

// A soft pad swelling open, like the light itself brightening as the
// avatar resolves -- synthesized rather than a loaded file. Silently
// no-ops if the browser blocks audio this far from a user gesture.
function playRevealShimmer() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.3, now + 3.6);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 9);
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(200, now);
    filter.frequency.exponentialRampToValueAtTime(2600, now + 5.2);
    filter.Q.value = 0.7;
    filter.connect(master);

    const freqs = [130.81, 196.0, 261.63, 329.63];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      osc.detune.value = (i % 2 === 0 ? -1 : 1) * (6 + i * 2);
      const g = ctx.createGain();
      g.gain.value = 0.5 / freqs.length;
      osc.connect(g).connect(filter);
      osc.start(now);
      osc.stop(now + 9.1);
    });

    window.setTimeout(() => ctx.close().catch(() => {}), 9600);
  } catch {
    /* audio blocked or unavailable -- the reveal still works visually */
  }
}

// The elemental orb's live particle cloud resolving into a standing
// figure at the genuine close of a session -- body colored bottom-up by
// this session's elemental mix, largest share at the feet. Same
// mechanics as the reference demo; this app's own palette and card
// styling for everything around it.
export default function AvatarReveal({
  tally,
  eyebrowLabel,
  headline,
  reflection,
  closeLabel,
  onClose,
}: {
  tally: ElementTally;
  eyebrowLabel: string;
  headline: string;
  reflection: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showCard, setShowCard] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const size = 260;

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
    const avatarPositions = new Float32Array(COUNT * 3);
    const avatarNormY = new Float32Array(COUNT);

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
      seeds[i] = Math.random() * Math.PI * 2;

      const f = i / COUNT;
      let p: number[];
      if (f < 0.11) p = sampleSphere([0, 1.42, 0], 0.3);
      else if (f < 0.5) p = sampleCapsule([0, 0.25, 0], [0, 1.05, 0], 0.4);
      else if (f < 0.6) p = sampleCapsule([-0.5, 1.15, 0], [-0.68, 0.15, 0.08], 0.115);
      else if (f < 0.7) p = sampleCapsule([0.5, 1.15, 0], [0.68, 0.15, 0.08], 0.115);
      else if (f < 0.85) p = sampleCapsule([-0.17, 0.25, 0], [-0.2, -1.65, 0.05], 0.165);
      else p = sampleCapsule([0.17, 0.25, 0], [0.2, -1.65, 0.05], 0.165);
      avatarPositions[i * 3] = p[0];
      avatarPositions[i * 3 + 1] = p[1];
      avatarPositions[i * 3 + 2] = p[2];
      avatarNormY[i] = Math.min(1, Math.max(0, (p[1] - FEET_Y) / (HEAD_Y - FEET_Y)));
    }

    // Bands stacked bottom-up, largest share at the feet.
    const total = ELEMENT_KEYS.reduce((sum, k) => sum + tally[k], 0) || 1;
    const sorted = [...ELEMENT_KEYS].sort((a, b) => tally[b] - tally[a]);
    let cum = 0;
    const bands = sorted.map((key) => {
      const pct = tally[key] / total;
      const band = { key, start: cum, end: cum + pct };
      cum += pct;
      return band;
    });
    const resolvedColors = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const h = avatarNormY[i];
      let band = bands[bands.length - 1];
      for (const b of bands) {
        if (h >= b.start && h < b.end) {
          band = b;
          break;
        }
      }
      const c = new THREE.Color(ELEMENT_COLORS[band.key]);
      resolvedColors[i * 3] = c.r;
      resolvedColors[i * 3 + 1] = c.g;
      resolvedColors[i * 3 + 2] = c.b;
      // Start each particle already near its assigned element's color so
      // the morph reads as "settling into place," not a color-cycling mess.
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
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
      points.rotation.y += 0.004;

      const pos = geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        const tx = avatarPositions[i * 3];
        const ty = avatarPositions[i * 3 + 1];
        const tz = avatarPositions[i * 3 + 2];
        const wob = Math.sin(t * 1.1 + seeds[i]) * 0.012;
        pos[i * 3] += (tx - pos[i * 3]) * 0.045 + wob;
        pos[i * 3 + 1] += (ty - pos[i * 3 + 1]) * 0.045;
        pos[i * 3 + 2] += (tz - pos[i * 3 + 2]) * 0.045 + wob * 0.6;
      }
      geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
    }
    animate();
    playRevealShimmer();

    const cardTimer = setTimeout(() => setShowCard(true), 2600);

    return () => {
      clearTimeout(cardTimer);
      cancelAnimationFrame(raf);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const legendTotal = ELEMENT_KEYS.reduce((sum, k) => sum + tally[k], 0) || 1;
  const legend = [...ELEMENT_KEYS]
    .sort((a, b) => tally[b] - tally[a])
    .map((key) => ({ key, pct: Math.round((tally[key] / legendTotal) * 100) }));

  return (
    <div className="avatar-reveal-overlay">
      <div className="avatar-reveal-eyebrow">{eyebrowLabel}</div>
      <div ref={containerRef} className="avatar-reveal-canvas" />
      {showCard && (
        <div className="avatar-reveal-card">
          <h2 className="avatar-reveal-headline">{headline}</h2>
          <ul className="avatar-reveal-legend">
            {legend.map((item) => (
              <li key={item.key} className="avatar-reveal-legend-item">
                <span
                  className="avatar-reveal-legend-dot"
                  style={{ background: `#${ELEMENT_COLORS[item.key].toString(16).padStart(6, "0")}` }}
                />
                <span className="avatar-reveal-legend-label">{item.key}</span>
                <span className="avatar-reveal-legend-pct">{item.pct}%</span>
              </li>
            ))}
          </ul>
          <p className="avatar-reveal-reflection">{reflection}</p>
          <button type="button" className="avatar-reveal-close" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      )}
    </div>
  );
}

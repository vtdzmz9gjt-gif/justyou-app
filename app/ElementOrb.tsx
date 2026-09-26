"use client";

import { useEffect, useRef } from "react";

type Element = "fire" | "earth" | "air" | "water";
type ElementTally = Record<Element, number>;

// Distinct from all five shape-family colors on purpose -- this is a
// deliberately separate system, and reusing a shape-family color here
// would blur the two together visually.
const ELEMENT_COLORS: Record<Element, string> = {
  fire: "#e2632b",
  earth: "#6b8f5c",
  air: "#b8c4d9",
  water: "#4a7ba6",
};

// Screen-space anchor points (fractions of width/height) that the
// tally-reactive nodes drift toward. Kept in the sky/treeline band so
// they never compete with the water reflection below.
const ELEMENT_POLES: Record<Element, [number, number]> = {
  fire: [0.84, 0.16],
  earth: [0.14, 0.5],
  air: [0.5, 0.06],
  water: [0.84, 0.5],
};

const ELEMENT_KEYS: Element[] = ["fire", "earth", "air", "water"];
const NODE_COUNT = 55;

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function lerpColor(c1: number[], c2: number[], t: number) {
  return [0, 1, 2].map((i) => Math.round(lerp(c1[i], c2[i], t)));
}

type SceneLayout = {
  treeBaseY: number;
  waterTop: number;
  bandTop: { x: number; y: number };
  bandBottom: { x: number; y: number };
};

// Draws the whole static scene (sky, Milky Way band, stars, constellations,
// pine treeline, water + reflections) into the given context. Modeled on a
// real Milky Way astrophotography reference: dense stars, a vertical band
// that runs cool blue at the top to warm amber near the horizon, and a
// black pine treeline reflected in still water below.
function drawScene(ctx: CanvasRenderingContext2D, W: number, H: number): SceneLayout {
  const treeBaseY = H * 0.78;
  const bandTop = { x: W * 0.56, y: -H * 0.04 };
  const bandBottom = { x: W * 0.475, y: treeBaseY + 30 };

  const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.75);
  skyGrad.addColorStop(0, "#05070f");
  skyGrad.addColorStop(0.4, "#070a16");
  skyGrad.addColorStop(0.75, "#0a0c1a");
  skyGrad.addColorStop(1, "#0e0e1c");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H * 0.75);

  const bandSteps = 130;
  const coolColor = [90, 130, 190];
  const midColor = [150, 110, 190];
  const warmColor = [230, 150, 110];

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < bandSteps; i++) {
    const t = i / bandSteps;
    const wobble = Math.sin(t * Math.PI * 2.2) * (W * 0.034) + Math.sin(t * 7) * (W * 0.0075);
    const x = lerp(bandTop.x, bandBottom.x, t) + wobble;
    const y = lerp(bandTop.y, bandBottom.y, t);
    const widthT = 1 - Math.pow(1 - t, 1.6);
    const r = lerp(H * 0.065, H * 0.24, widthT) * rand(0.75, 1.15);

    let col;
    if (t < 0.55) col = lerpColor(coolColor, midColor, t / 0.55);
    else col = lerpColor(midColor, warmColor, (t - 0.55) / 0.45);

    const alpha = lerp(0.04, 0.085, Math.pow(t, 1.3));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${alpha})`);
    g.addColorStop(0.55, `rgba(${col[0]},${col[1]},${col[2]},${alpha * 0.4})`);
    g.addColorStop(1, "rgba(10,8,20,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < 16; i++) {
    const t = rand(0.15, 0.85);
    const wobble = Math.sin(t * Math.PI * 2.2) * (W * 0.034) + Math.sin(t * 7) * (W * 0.0075);
    const x = lerp(bandTop.x, bandBottom.x, t) + wobble + rand(-W * 0.019, W * 0.019);
    const y = lerp(bandTop.y, bandBottom.y, t) + rand(-H * 0.025, H * 0.025);
    const rx = rand(H * 0.012, H * 0.024);
    const ry = rand(H * 0.035, H * 0.07);
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, "rgba(10,9,16,0.035)");
    g.addColorStop(0.7, "rgba(10,9,16,0.012)");
    g.addColorStop(1, "rgba(10,9,16,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rand(-0.3, 0.3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const domeG = ctx.createRadialGradient(bandBottom.x, treeBaseY, 0, bandBottom.x, treeBaseY, H * 0.42);
  domeG.addColorStop(0, "rgba(210,140,105,0.06)");
  domeG.addColorStop(0.4, "rgba(180,100,100,0.03)");
  domeG.addColorStop(1, "rgba(20,15,30,0)");
  ctx.fillStyle = domeG;
  ctx.fillRect(0, treeBaseY - H * 0.42, W, H * 0.42);
  ctx.restore();

  function distToBand(x: number, y: number) {
    let best = Infinity;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const wobble = Math.sin(t * Math.PI * 2.2) * (W * 0.034) + Math.sin(t * 7) * (W * 0.0075);
      const bx = lerp(bandTop.x, bandBottom.x, t) + wobble;
      const by = lerp(bandTop.y, bandBottom.y, t);
      const d = Math.hypot(x - bx, y - by);
      if (d < best) best = d;
    }
    return best;
  }

  const brightStars: { x: number; y: number }[] = [];
  const starDensity = (W * H) / (1600 * 1000);
  for (let i = 0; i < 1400 * starDensity; i++) {
    const x = rand(0, W);
    const y = rand(0, H * 0.76);
    const d = distToBand(x, y);
    const nearBand = d < H * 0.17;
    const density = nearBand ? 1 : 0.45;
    if (Math.random() > density) continue;
    const r = nearBand ? rand(0.3, 1.6) : rand(0.25, 1.1);
    const brightness = nearBand ? rand(0.4, 1) : rand(0.2, 0.85);
    const warmth = Math.random();
    const color =
      warmth < 0.12
        ? `rgba(255,225,195,${brightness})`
        : warmth < 0.24
          ? `rgba(195,210,255,${brightness})`
          : `rgba(235,235,245,${brightness})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (r > 1.2 && Math.random() < 0.35) brightStars.push({ x, y });
  }

  for (let i = 0; i < 20; i++) {
    const x = rand(30, W - 30);
    const y = rand(20, H * 0.6);
    const r = rand(1.4, 2.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 8);
    g.addColorStop(0, "rgba(255,250,240,0.85)");
    g.addColorStop(0.3, "rgba(230,225,255,0.2)");
    g.addColorStop(1, "rgba(230,225,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#fffaf0";
    ctx.fill();
    brightStars.push({ x, y });
  }

  function drawConstellation(points: { x: number; y: number }[]) {
    ctx.strokeStyle = "rgba(210,220,255,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < points.length - 1; i++) {
      ctx.moveTo(points[i].x, points[i].y);
      ctx.lineTo(points[i + 1].x, points[i + 1].y);
    }
    ctx.stroke();
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#fdfaf2";
      ctx.fill();
    });
  }
  const cx = (fx: number, fy: number) => ({ x: fx * W, y: fy * H });
  drawConstellation([cx(0.12, 0.13), cx(0.16, 0.09), cx(0.2, 0.12), cx(0.23, 0.08), cx(0.19, 0.18)]);
  drawConstellation([cx(0.81, 0.1), cx(0.85, 0.16), cx(0.89, 0.13), cx(0.92, 0.19)]);
  drawConstellation([cx(0.7, 0.25), cx(0.73, 0.3), cx(0.77, 0.28), cx(0.75, 0.34)]);

  // A hazy human silhouette, front-facing (head, shoulders, arms at the
  // sides, torso tapering to the waist), only from the waist up, rising out
  // of the treeline into the light band like a genie forming from a lamp --
  // soft-edged, low-contrast, dissolving into mist toward the bottom rather
  // than showing full legs planted in the sky.
  {
    // Torso+head half-width by t (0 = crown, 1 = full conceptual body
    // height), in units of figWidth. Female-presenting proportions: fuller
    // head/hair volume, narrower shoulders, a distinctly narrower waist,
    // then a hip flare -- an hourglass taper rather than the straighter
    // male silhouette.
    const TORSO_PROFILE: [number, number][] = [
      [0.0, 0.09], [0.025, 0.4], [0.06, 0.48], [0.1, 0.36], [0.14, 0.26],
      [0.19, 0.3], [0.25, 0.68], [0.32, 0.58], [0.42, 0.4],
      [0.5, 0.62], [0.58, 0.66],
    ];
    function smoothstep(t: number): number {
      return t * t * (3 - 2 * t);
    }
    function sample(profile: [number, number][], t: number): number {
      for (let i = 0; i < profile.length - 1; i++) {
        const [t0, v0] = profile[i];
        const [t1, v1] = profile[i + 1];
        if (t >= t0 && t <= t1) return lerp(v0, v1, smoothstep((t - t0) / (t1 - t0 || 1)));
      }
      return profile[profile.length - 1][1];
    }
    const bandTNear = 0.88;
    const wobbleNear = Math.sin(bandTNear * Math.PI * 2.2) * (W * 0.034) + Math.sin(bandTNear * 7) * (W * 0.0075);
    const figCx = lerp(bandTop.x, bandBottom.x, bandTNear) + wobbleNear;
    const figHeight = H * 0.19;
    const figWidth = H * 0.04;
    // Only draw head-through-hip (t=0..bodyCutoffT); the rest dissolves
    // into the treeline rather than showing legs standing in open sky.
    const bodyCutoffT = 0.58;
    const bottomY = treeBaseY - H * 0.13;
    const topY = bottomY - figHeight * bodyCutoffT;
    const steps = 90;
    const yAt = (t: number) => topY + figHeight * t;

    function buildTorso(scale: number) {
      const left: { x: number; y: number }[] = [];
      const right: { x: number; y: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * bodyCutoffT;
        const y = yAt(t);
        const jag = rand(-0.006, 0.006) * figWidth;
        const w = sample(TORSO_PROFILE, t) * figWidth * scale;
        left.push({ x: figCx - w + jag, y });
        right.push({ x: figCx + w + jag, y });
      }
      return [...left, ...right.reverse()];
    }
    // One arm, hanging from the shoulder down alongside the torso to just
    // above the elbow -- a short tapered capsule, not a full limb, since
    // the figure is only visible waist-up.
    function buildArm(side: 1 | -1, scale: number) {
      const shoulderT = 0.21;
      const wristT = 0.5;
      const shoulderInner = sample(TORSO_PROFILE, shoulderT) * figWidth * 0.82;
      const shoulderOuter = shoulderInner + figWidth * 0.3 * scale;
      const wristInner = sample(TORSO_PROFILE, shoulderT) * figWidth * 0.62;
      const wristOuter = wristInner + figWidth * 0.16 * scale;
      const steps2 = 20;
      const inner: { x: number; y: number }[] = [];
      const outer: { x: number; y: number }[] = [];
      for (let i = 0; i <= steps2; i++) {
        const t = shoulderT + (wristT - shoulderT) * (i / steps2);
        const y = yAt(t);
        const localT = i / steps2;
        const innerX = lerp(shoulderInner, wristInner, localT);
        const outerX = lerp(shoulderOuter, wristOuter, smoothstep(localT));
        const jag = rand(-0.005, 0.005) * figWidth;
        inner.push({ x: figCx + side * (innerX + jag), y });
        outer.push({ x: figCx + side * (outerX + jag), y });
      }
      return [...inner, ...outer.reverse()];
    }
    function fadeGradient(rgb: string, maxAlpha: number) {
      const g = ctx.createLinearGradient(figCx, topY, figCx, bottomY);
      g.addColorStop(0, `rgba(${rgb},${maxAlpha})`);
      g.addColorStop(0.6, `rgba(${rgb},${maxAlpha})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      return g;
    }
    // Traces the point loop through the midpoint of each edge with a
    // quadraticCurveTo, rounding every corner instead of leaving the
    // faceted, low-poly look straight lineTo segments give.
    function fillSmooth(pts: { x: number; y: number }[]) {
      const n = pts.length;
      ctx.beginPath();
      ctx.moveTo((pts[0].x + pts[n - 1].x) / 2, (pts[0].y + pts[n - 1].y) / 2);
      for (let i = 0; i < n; i++) {
        const cur = pts[i];
        const next = pts[(i + 1) % n];
        ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) / 2, (cur.y + next.y) / 2);
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    // A wider, fainter outer pass first, so the edge fades into the light
    // rather than cutting a hard line -- then a smaller, slightly stronger
    // core so the figure still reads, just softly.
    ctx.fillStyle = fadeGradient("20,16,28", 0.11);
    fillSmooth(buildTorso(1.35));
    fillSmooth(buildArm(1, 1.3));
    fillSmooth(buildArm(-1, 1.3));

    ctx.fillStyle = fadeGradient("18,14,26", 0.22);
    fillSmooth(buildTorso(1));
    fillSmooth(buildArm(1, 1));
    fillSmooth(buildArm(-1, 1));
    ctx.restore();
  }

  function pineSilhouette(x: number, baseY: number, height: number, width: number, jag: number) {
    const pts: { x: number; y: number }[] = [];
    const sideSteps = 16;
    for (let i = 0; i <= sideSteps; i++) {
      const t = i / sideSteps;
      const y = baseY - height * t;
      const envelope = Math.pow(1 - t, 0.85);
      const branchBump = i % 3 === 0 ? rand(0.15, 0.32) : rand(0, 0.08);
      const w = width * 0.5 * envelope * (1 + branchBump) * (1 - t * 0.15);
      pts.push({ x: x - w - rand(0, jag), y });
    }
    for (let i = sideSteps; i >= 0; i--) {
      const t = i / sideSteps;
      const y = baseY - height * t;
      const envelope = Math.pow(1 - t, 0.85);
      const branchBump = i % 3 === 1 ? rand(0.15, 0.32) : rand(0, 0.08);
      const w = width * 0.5 * envelope * (1 + branchBump) * (1 - t * 0.15);
      pts.push({ x: x + w + rand(0, jag), y });
    }
    return pts;
  }

  function drawPine(x: number, baseY: number, height: number, width: number, shade: "back" | "front") {
    const pts = pineSilhouette(x, baseY, height, width, shade === "back" ? 2 : 4);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = shade === "back" ? "rgba(8,9,16,0.75)" : "rgb(5,5,9)";
    ctx.fill();
  }

  type TreeDef = { x: number; baseY: number; height: number; width: number; shade: "back" | "front" };
  const backTrees: TreeDef[] = [];
  const frontTrees: TreeDef[] = [];
  ctx.save();
  ctx.globalAlpha = 0.8;
  for (let x = -30; x < W + 30; x += rand(30, 44)) {
    const t: TreeDef = { x, baseY: treeBaseY - rand(0, 10), height: rand(50, 85), width: rand(18, 27), shade: "back" };
    backTrees.push(t);
    drawPine(t.x, t.baseY, t.height, t.width, t.shade);
  }
  ctx.restore();
  for (let x = -40; x < W + 40; x += rand(38, 58)) {
    const t: TreeDef = { x, baseY: treeBaseY + rand(8, 30), height: rand(95, 155), width: rand(30, 46), shade: "front" };
    frontTrees.push(t);
    drawPine(t.x, t.baseY, t.height, t.width, t.shade);
  }

  const waterTop = treeBaseY + 36;
  const waterGrad = ctx.createLinearGradient(0, waterTop, 0, H);
  waterGrad.addColorStop(0, "#241d22");
  waterGrad.addColorStop(0.15, "#140f18");
  waterGrad.addColorStop(0.6, "#0a0710");
  waterGrad.addColorStop(1, "#040308");
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, waterTop, W, H - waterTop);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, waterTop, W, H - waterTop);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  const waterGlowG = ctx.createRadialGradient(bandBottom.x, waterTop, 0, bandBottom.x, waterTop, H * 0.42);
  waterGlowG.addColorStop(0, "rgba(220,150,120,0.14)");
  waterGlowG.addColorStop(1, "rgba(20,15,30,0)");
  ctx.fillStyle = waterGlowG;
  ctx.fillRect(0, waterTop, W, H * 0.3);
  for (let i = 0; i < 12; i++) {
    const x = rand(-W * 0.06, W * 1.06);
    const y = waterTop + rand(0, H * 0.05);
    const r = rand(H * 0.12, H * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(120,110,180,0.1)");
    g.addColorStop(1, "rgba(20,15,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, waterTop, W, H - waterTop);
  ctx.clip();
  ctx.translate(0, 2 * treeBaseY);
  ctx.scale(1, -0.78);
  ctx.globalAlpha = 0.32;
  backTrees.forEach((t) => drawPine(t.x, t.baseY, t.height, t.width, t.shade));
  frontTrees.forEach((t) => drawPine(t.x, t.baseY, t.height, t.width, t.shade));
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, waterTop, W, H - waterTop);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  brightStars
    .filter(() => Math.random() < 0.35)
    .forEach((s) => {
      const depth = rand(H * 0.06, H * 0.17);
      const g = ctx.createLinearGradient(s.x, waterTop, s.x, waterTop + depth);
      g.addColorStop(0, "rgba(230,225,255,0.16)");
      g.addColorStop(1, "rgba(230,225,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(s.x - rand(1, 2.5), waterTop, rand(2, 5), depth);
    });
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, waterTop, W, H - waterTop);
  ctx.clip();
  for (let i = 0; i < 70; i++) {
    const y = rand(waterTop, H);
    const depthT = (y - waterTop) / (H - waterTop);
    const x0 = rand(0, W);
    const len = rand(30, 140);
    ctx.strokeStyle = `rgba(190,175,200,${rand(0.03, 0.08) * (1 - depthT * 0.6)})`;
    ctx.lineWidth = rand(0.6, 1.6);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + len, y + rand(-1.5, 1.5));
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  const shoreGrad = ctx.createLinearGradient(0, waterTop - 4, 0, waterTop + 10);
  shoreGrad.addColorStop(0, "rgba(200,160,150,0.2)");
  shoreGrad.addColorStop(1, "rgba(200,160,150,0)");
  ctx.fillStyle = shoreGrad;
  ctx.fillRect(0, waterTop - 4, W, 14);
  ctx.restore();

  const vign = ctx.createRadialGradient(W / 2, H * 0.4, H * 0.15, W / 2, H * 0.4, H * 0.9);
  vign.addColorStop(0, "rgba(0,0,0,0)");
  vign.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, W, H);

  return { treeBaseY, waterTop, bandTop, bandBottom };
}

// A winter night scene -- pine treeline, a vertical Milky Way band running
// cool-to-warm, dense stars, and a still lake reflecting it all -- with a
// small foreground of element-colored nodes that drift toward whichever
// element(s) are actually being tagged this session. The scene itself is
// static (redrawn only on resize); only the nodes and falling snow animate.
export default function ElementOrb({ tally }: { tally: ElementTally }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tallyRef = useRef(tally);
  tallyRef.current = tally;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement("canvas");
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sceneCanvas = document.createElement("canvas");
    const sceneCtx = sceneCanvas.getContext("2d");
    if (!sceneCtx) return;

    let layout: SceneLayout = { treeBaseY: 0, waterTop: 0, bandTop: { x: 0, y: 0 }, bandBottom: { x: 0, y: 0 } };
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    function renderStaticScene() {
      const W = window.innerWidth;
      const H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      sceneCanvas.width = W * dpr;
      sceneCanvas.height = H * dpr;
      sceneCtx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout = drawScene(sceneCtx!, W, H);
    }
    renderStaticScene();

    function handleResize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderStaticScene();
    }
    window.addEventListener("resize", handleResize);

    // Falling snow, drawn fresh each frame over the static scene.
    const SNOW_COUNT = 90;
    const snow = Array.from({ length: SNOW_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: rand(0.6, 2),
      speed: rand(6, 18),
      drift: rand(-4, 4),
      alpha: rand(0.1, 0.4),
    }));

    // Tally-reactive element nodes, in 2D screen space over the sky.
    const basePositions = new Float32Array(NODE_COUNT * 2);
    const positions = new Float32Array(NODE_COUNT * 2);
    const seeds = new Float32Array(NODE_COUNT);
    const twinkleSpeeds = new Float32Array(NODE_COUNT);
    const assignedEl: Element[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const fx = rand(0.04, 0.96);
      const fy = rand(0.03, 0.68);
      basePositions[i * 2] = fx;
      basePositions[i * 2 + 1] = fy;
      positions[i * 2] = fx;
      positions[i * 2 + 1] = fy;

      let best: Element = ELEMENT_KEYS[0];
      let bestD = Infinity;
      for (const k of ELEMENT_KEYS) {
        const pole = ELEMENT_POLES[k];
        const d = Math.hypot(fx - pole[0], fy - pole[1]);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      assignedEl[i] = best;
      seeds[i] = Math.random() * Math.PI * 2;
      twinkleSpeeds[i] = 0.25 + Math.random() * 0.5;
    }

    let t = 0;
    let raf = 0;
    let last = performance.now();

    function animate(now: number) {
      raf = requestAnimationFrame(animate);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;

      const W = window.innerWidth;
      const H = window.innerHeight;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, W, H);
      ctx!.drawImage(sceneCanvas, 0, 0, sceneCanvas.width, sceneCanvas.height, 0, 0, W, H);

      // snow
      ctx!.save();
      ctx!.beginPath();
      ctx!.rect(0, 0, W, layout.waterTop);
      ctx!.clip();
      for (const s of snow) {
        s.y += s.speed * dt;
        s.x += s.drift * dt;
        if (s.y > layout.waterTop) {
          s.y = -5;
          s.x = Math.random() * W;
        }
        if (s.x < 0) s.x = W;
        if (s.x > W) s.x = 0;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255,255,255,${s.alpha})`;
        ctx!.fill();
      }
      ctx!.restore();

      // tally-reactive nodes
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
      const pull = 0.16;

      ctx!.save();
      ctx!.globalCompositeOperation = "lighter";
      for (let i = 0; i < NODE_COUNT; i++) {
        const el = assignedEl[i];
        const weight = scores[el] / scoreTotal;
        const pole = ELEMENT_POLES[el];
        const bx = basePositions[i * 2];
        const by = basePositions[i * 2 + 1];
        const wob = Math.sin(t * 1.3 + seeds[i]) * 0.006;
        const tx = lerp(bx, pole[0], weight * pull) + wob;
        const ty = lerp(by, pole[1], weight * pull) + wob;
        positions[i * 2] += (tx - positions[i * 2]) * 0.03;
        positions[i * 2 + 1] += (ty - positions[i * 2 + 1]) * 0.03;

        const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * twinkleSpeeds[i] + seeds[i]));
        const px = positions[i * 2] * W;
        const py = positions[i * 2 + 1] * H;
        const r = 2.1 * (0.85 + weight * 0.6);
        const g = ctx!.createRadialGradient(px, py, 0, px, py, r * 4);
        const c = ELEMENT_COLORS[el];
        g.addColorStop(0, c);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.globalAlpha = 0.55 * twinkle;
        ctx!.fillStyle = g;
        ctx!.beginPath();
        ctx!.arc(px, py, r * 4, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.restore();
    }
    raf = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(raf);
      if (container.contains(canvas)) {
        container.removeChild(canvas);
      }
    };
  }, []);

  return <div ref={containerRef} className="element-orb-canvas" aria-hidden="true" />;
}

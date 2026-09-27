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
// tally-reactive nodes drift toward. Kept in the upper portion of the
// screen, away from the composer at the bottom.
const ELEMENT_POLES: Record<Element, [number, number]> = {
  fire: [0.84, 0.16],
  earth: [0.14, 0.5],
  air: [0.5, 0.06],
  water: [0.84, 0.5],
};

const ELEMENT_KEYS: Element[] = ["fire", "earth", "air", "water"];
const NODE_COUNT = 55;
const BG_IMAGE_SRC = "/backgrounds/milkyway-treeline.jpg";

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

type SceneLayout = {
  treeBaseY: number;
  waterTop: number;
};

// Draws the Milky Way/treeline photo into the given context, cover-fit
// (same behavior as CSS object-fit: cover), plus the same vignette the
// procedural scene used to have. treeBaseY/waterTop are kept as a rough
// fraction of height matching where the photo's own horizon sits, purely
// so the falling-snow layer still has a sensible boundary to clip to.
function drawBackgroundPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number
): SceneLayout {
  const imgRatio = img.width / img.height;
  const boxRatio = W / H;
  let drawW: number, drawH: number, dx: number, dy: number;
  if (imgRatio > boxRatio) {
    drawH = H;
    drawW = H * imgRatio;
    dx = (W - drawW) / 2;
    dy = 0;
  } else {
    drawW = W;
    drawH = W / imgRatio;
    dx = 0;
    dy = (H - drawH) / 2;
  }
  ctx.drawImage(img, dx, dy, drawW, drawH);

  const vign = ctx.createRadialGradient(W / 2, H * 0.4, H * 0.15, W / 2, H * 0.4, H * 0.9);
  vign.addColorStop(0, "rgba(0,0,0,0)");
  vign.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, W, H);

  return { treeBaseY: H * 0.78, waterTop: H * 0.78 };
}

// The Milky Way/treeline photo as a background, with a small foreground of
// element-colored nodes that drift toward whichever element(s) are
// actually being tagged this session, plus falling snow -- both drawn
// fresh every frame over the (otherwise static) photo.
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

    let layout: SceneLayout = { treeBaseY: 0, waterTop: 0 };
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const bgImage = new Image();
    let bgLoaded = false;
    bgImage.src = BG_IMAGE_SRC;
    bgImage.onload = () => {
      bgLoaded = true;
      renderStaticScene();
    };

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
      if (bgLoaded) {
        layout = drawBackgroundPhoto(sceneCtx!, bgImage, W, H);
      } else {
        // Before the photo loads, fall back to a plain dark fill rather
        // than leaving the canvas blank/transparent.
        sceneCtx!.fillStyle = "#0e0e1c";
        sceneCtx!.fillRect(0, 0, W, H);
        layout = { treeBaseY: H * 0.78, waterTop: H * 0.78 };
      }
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

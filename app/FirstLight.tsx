"use client";

import { useEffect, useRef } from "react";
import { SPARSE_SKY, seededRandom } from "@/lib/sparseSky";

// The very first moment of every fresh open -- deliberately light, never
// mandatory. Built directly on SPARSE_SKY's own config/seed so the star
// field here is pixel-identical to SparseSky's static one: once this
// component unmounts in favor of <SparseSky />, nothing visibly jumps.
//
// Mechanics (matched to the reference demo at the user's request): up to
// three taps place a point of light, each ripples nearby background stars
// outward and plays a short rising chime, and taps after the first draw a
// faint connecting line back to the previous point. Unlike the demo, this
// never REQUIRES three taps -- that was a prototyping shortcut to keep the
// mechanic visible for review, not something meant to ship as mandatory
// friction. Here: advance ~1.5s after the most recent tap (so even one tap
// is enough), capped at three, and advance on its own after ~5s even with
// zero taps, so someone who doesn't engage at all is never stuck.
const MAX_TAPS = 3;
const ADVANCE_AFTER_TAP_MS = 1500;
const ADVANCE_WITH_NO_TAPS_MS = 5000;
const RIPPLE_RADIUS = 220;

const INVITE_STEPS = ["touch the sky, a few times if you like", "again, if you like", "once more"];

export default function FirstLight({ onDone }: { onDone: () => void }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const inviteRef = useRef<HTMLParagraphElement | null>(null);
  const tapCountRef = useRef(0);
  const lastPointRef = useRef<{ x: string; y: string } | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const doneRef = useRef(false);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    onDone();
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    advanceTimerRef.current = setTimeout(finish, ADVANCE_WITH_NO_TAPS_MS);
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chime(freq: number) {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
      osc.start(start);
      osc.stop(start + 1.2);
    } catch {
      /* audio unsupported/blocked -- the tap still works visually */
    }
  }

  function rippleNearbyStars(x: number, y: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const stars = svg.querySelectorAll<SVGCircleElement>("circle[data-bg]");
    stars.forEach((star) => {
      const sx = parseFloat(star.getAttribute("cx") || "0");
      const sy = parseFloat(star.getAttribute("cy") || "0");
      const dist = Math.hypot(sx - x, sy - y);
      if (dist >= RIPPLE_RADIUS) return;
      const delay = (dist / RIPPLE_RADIUS) * 260;
      const baseOp = parseFloat(star.dataset.baseOp || "0");
      const baseR = parseFloat(star.dataset.baseR || "0");
      setTimeout(() => {
        star.style.transition = "opacity 0.35s ease, r 0.35s ease";
        star.setAttribute("opacity", String(Math.min(1, baseOp + 0.55)));
        star.setAttribute("r", (baseR * 1.8).toFixed(2));
        setTimeout(() => {
          star.setAttribute("opacity", String(baseOp));
          star.setAttribute("r", String(baseR));
        }, 500);
      }, delay);
    });
  }

  function placeLight(evt: React.PointerEvent<SVGSVGElement>) {
    if (doneRef.current || tapCountRef.current >= MAX_TAPS) return;
    const svg = svgRef.current;
    if (!svg) return;

    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());
    const x = svgPt.x;
    const y = svgPt.y;

    tapCountRef.current += 1;
    const tapIndex = tapCountRef.current;

    if (inviteRef.current) inviteRef.current.classList.add("hide");
    rippleNearbyStars(x, y);
    chime([392, 494, 587][tapIndex - 1] || 587);

    const NS = "http://www.w3.org/2000/svg";
    const glow = document.createElementNS(NS, "circle");
    glow.setAttribute("cx", x.toFixed(1));
    glow.setAttribute("cy", y.toFixed(1));
    glow.setAttribute("r", "0");
    glow.setAttribute("fill", "url(#first-light-glow)");
    glow.setAttribute("opacity", "0");
    svg.appendChild(glow);

    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", x.toFixed(1));
    dot.setAttribute("cy", y.toFixed(1));
    dot.setAttribute("r", "0");
    dot.setAttribute("fill", "#f4e4bd");
    dot.setAttribute("opacity", "0");
    svg.appendChild(dot);

    if (lastPointRef.current) {
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", lastPointRef.current.x);
      line.setAttribute("y1", lastPointRef.current.y);
      line.setAttribute("x2", x.toFixed(1));
      line.setAttribute("y2", y.toFixed(1));
      line.setAttribute("stroke", "#d8b46a");
      line.setAttribute("stroke-width", "0");
      line.setAttribute("opacity", "0");
      svg.insertBefore(line, dot);
      requestAnimationFrame(() => {
        line.style.transition = "opacity 1s ease, stroke-width 1s ease";
        line.setAttribute("opacity", "0.4");
        line.setAttribute("stroke-width", "0.8");
      });
    }
    lastPointRef.current = { x: x.toFixed(1), y: y.toFixed(1) };

    requestAnimationFrame(() => {
      glow.style.transition = "r 1.1s ease, opacity 1.1s ease";
      dot.style.transition = "r 0.7s cubic-bezier(.2,1.4,.4,1), opacity 0.7s ease";
      glow.setAttribute("r", "28");
      glow.setAttribute("opacity", "0.4");
      dot.setAttribute("r", "2.6");
      dot.setAttribute("opacity", "1");
    });

    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (tapIndex < MAX_TAPS && inviteRef.current) {
      inviteRef.current.textContent = INVITE_STEPS[tapIndex] || INVITE_STEPS[INVITE_STEPS.length - 1];
      inviteRef.current.classList.remove("hide");
    }
    advanceTimerRef.current = setTimeout(finish, ADVANCE_AFTER_TAP_MS);
  }

  const rnd = seededRandom(7);
  const { viewW, viewH } = SPARSE_SKY;
  const faintStars = Array.from({ length: SPARSE_SKY.faintStarCount }, () => ({
    x: rnd() * viewW,
    y: rnd() * viewH,
    r:
      SPARSE_SKY.faintStarMinRadius +
      rnd() * (SPARSE_SKY.faintStarMaxRadius - SPARSE_SKY.faintStarMinRadius),
    opacity:
      SPARSE_SKY.faintStarMinOpacity +
      rnd() * (SPARSE_SKY.faintStarMaxOpacity - SPARSE_SKY.faintStarMinOpacity),
  }));
  const brightStars = Array.from({ length: SPARSE_SKY.brightStarCount }, () => ({
    x: rnd() * viewW,
    y: rnd() * viewH * 0.9,
  }));

  return (
    <div className="first-light">
      <svg
        ref={svgRef}
        className="first-light-sky"
        viewBox={`0 0 ${viewW} ${viewH}`}
        preserveAspectRatio="xMidYMid slice"
        onPointerDown={placeLight}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="first-light-bg" cx="50%" cy="35%" r="80%">
            <stop offset="0%" stopColor={SPARSE_SKY.bgCenter} />
            <stop offset="60%" stopColor={SPARSE_SKY.bgMid} />
            <stop offset="100%" stopColor={SPARSE_SKY.bgEdge} />
          </radialGradient>
          <radialGradient id="first-light-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f4e4bd" stopOpacity="1" />
            <stop offset="100%" stopColor="#f4e4bd" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={viewW} height={viewH} fill="url(#first-light-bg)" />
        {faintStars.map((s, i) => (
          <circle
            key={`f${i}`}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="#ffffff"
            opacity={s.opacity}
            data-bg="1"
            data-base-op={s.opacity.toFixed(2)}
            data-base-r={s.r.toFixed(2)}
          />
        ))}
        {brightStars.map((s, i) => (
          <circle
            key={`b${i}`}
            cx={s.x}
            cy={s.y}
            r={SPARSE_SKY.brightStarRadius}
            fill="#ffffff"
            opacity={SPARSE_SKY.brightStarOpacity}
            data-bg="1"
            data-base-op={SPARSE_SKY.brightStarOpacity.toFixed(2)}
            data-base-r={SPARSE_SKY.brightStarRadius.toFixed(2)}
          />
        ))}
      </svg>
      <p ref={inviteRef} className="first-light-invite">
        {INVITE_STEPS[0]}
      </p>
    </div>
  );
}

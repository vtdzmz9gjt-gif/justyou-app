import { SPARSE_SKY, seededRandom } from "@/lib/sparseSky";

// A deliberately sparse, near-empty night sky for the opening screen --
// deep near-black with a faint scattering of dim stars, no galactic band,
// no nebula color, no horizon glow. Static (no animation, not wired to any
// tagging event): stillness is the point, so the elemental orb remains the
// only thing that visibly reacts once a conversation starts. Seeded, not
// Math.random(), so this renders identically on the server and after
// client hydration.
export default function SparseSky() {
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
    <svg
      className="sparse-sky"
      viewBox={`0 0 ${viewW} ${viewH}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="sparse-sky-bg" cx="50%" cy="35%" r="80%">
          <stop offset="0%" stopColor={SPARSE_SKY.bgCenter} />
          <stop offset="60%" stopColor={SPARSE_SKY.bgMid} />
          <stop offset="100%" stopColor={SPARSE_SKY.bgEdge} />
        </radialGradient>
      </defs>
      <rect width={viewW} height={viewH} fill="url(#sparse-sky-bg)" />
      {faintStars.map((s, i) => (
        <circle key={`f${i}`} cx={s.x} cy={s.y} r={s.r} fill="#ffffff" opacity={s.opacity} />
      ))}
      {brightStars.map((s, i) => (
        <circle
          key={`b${i}`}
          cx={s.x}
          cy={s.y}
          r={SPARSE_SKY.brightStarRadius}
          fill="#ffffff"
          opacity={SPARSE_SKY.brightStarOpacity}
        />
      ))}
    </svg>
  );
}

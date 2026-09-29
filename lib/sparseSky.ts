// Shared tuning for the sparse, near-empty night-sky background used on
// both the opening screen (SparseSky.tsx, static SVG) and the live
// conversation screen (ElementOrb.tsx, canvas) -- kept in one place so the
// two stay visually consistent even though they're drawn with different
// technologies. Deliberately sparse and dim: this is a still backdrop for
// the elemental orb's own reactive nodes, not a second thing competing for
// attention.
export const SPARSE_SKY = {
  viewW: 800,
  viewH: 1400,
  bgCenter: "#0a0a0d",
  bgMid: "#050506",
  bgEdge: "#020203",
  faintStarCount: 90,
  faintStarMinRadius: 0.4,
  faintStarMaxRadius: 1.2,
  faintStarMinOpacity: 0.12,
  faintStarMaxOpacity: 0.47,
  brightStarCount: 6,
  brightStarRadius: 1.3,
  brightStarOpacity: 0.55,
};

// A tiny deterministic PRNG (not Math.random()) so the same seed always
// produces the same field -- lets the SVG version render identically on
// the server and after client hydration with no mismatch.
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// A converging (or diverging) beam: the rays of a cone of half-angle α around the nominal direction θ₀ (in the incident
// medium), the pupil filled uniformly (rays uniform in sin²α′ and in azimuth ψ). A ray's angle of incidence:
// cos θ = cos θ₀ cos α′ + sin θ₀ sin α′ cos ψ. The spectra of an isotropic stack depend only on θ, so the cone average is
// a weighted mean over a few representative angles: the distribution of θ (sampled densely) cut into K parts of equal
// weight, each represented by its mean angle. s and p are taken in each ray's own plane of incidence (exact for
// unpolarized light; for s or p alone an approximation that neglects the rotation of the plane).

export type ConeRay = { theta: number; w: number }; // degrees, weight (the weights sum to 1)

const cache = new Map<string, ConeRay[]>();

export function coneRays(theta0: number, half: number, K = 8): ConeRay[] {
  if (!(half > 0)) return [{ theta: theta0, w: 1 }];
  const key = `${theta0}|${half}|${K}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = Math.PI / 180;
  const [c0, s0] = [Math.cos(theta0 * r), Math.sin(theta0 * r)];
  const u1 = Math.sin(half * r) ** 2;
  const NR = 64;
  const NP = theta0 === 0 ? 1 : 64;
  const th: number[] = [];
  for (let i = 0; i < NR; i++) {
    const sa = Math.sqrt(((i + 0.5) / NR) * u1);
    const ca = Math.sqrt(1 - sa * sa);
    for (let k = 0; k < NP; k++) {
      const psi = (Math.PI * (k + 0.5)) / NP; // ψ and −ψ give the same θ
      th.push(Math.acos(Math.min(1, Math.max(-1, c0 * ca + s0 * sa * Math.cos(psi)))) / r);
    }
  }
  th.sort((a, b) => a - b);
  const out: ConeRay[] = [];
  for (let q = 0; q < K; q++) {
    const part = th.slice(Math.round((q * th.length) / K), Math.round(((q + 1) * th.length) / K));
    if (part.length) out.push({ theta: part.reduce((a, b) => a + b, 0) / part.length, w: part.length / th.length });
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, out);
  return out;
}

// The half-angle of a beam focused at f-number N (in air): sin α = 1 / (2N).
export const halfAngleOfF = (N: number) => (N > 0.5 ? (Math.asin(1 / (2 * N)) * 180) / Math.PI : 90);

// Penetration depth of the field into a region of the structure, as for surface plasmons: the distance from the
// region's edge at which |E| has fallen to 1/e of its value at that edge, measured on the computed profile (so it works
// in any layer, for any profile). For an evanescent wave in a semi-infinite medium it equals 1/Im(k_z).

export type DepthEdge = 'auto' | 'top' | 'bottom';
export type DepthResult = {
  delta: number; // nm; NaN when |E| does not fall to 1/e
  edge: number; // z of the edge it is measured from (nm)
  dir: 1 | -1; // into the region: +1 = towards larger z (down), −1 = towards the incident side
  e0: number; // |E| at the edge (relative to the incident field)
  monotonic: boolean; // |E| decreases all the way from the edge to the 1/e point
  note?: string;
};

// absE(zs): |E| at the depths zs (inside the region); lo / hi: the region (−Infinity for the incident medium, +Infinity
// for the exit medium).
export function penetrationDepth(absE: (zs: number[]) => Float64Array, lo: number, hi: number, edge: DepthEdge): DepthResult {
  const EPS = 1e-6;
  let dir: 1 | -1;
  if (!Number.isFinite(lo)) dir = -1; // incident medium: from its interface (z = 0) upwards
  else if (!Number.isFinite(hi)) dir = 1; // exit medium: from its interface downwards
  else if (edge === 'top') dir = 1;
  else if (edge === 'bottom') dir = -1;
  else {
    const [a, b] = absE([lo + EPS, hi - EPS]);
    dir = a >= b ? 1 : -1; // from the side where the field is larger
  }
  const z0 = dir === 1 ? lo : hi;
  const len = Number.isFinite(lo) && Number.isFinite(hi) ? hi - lo : Infinity;
  const e0 = absE([z0 + dir * EPS])[0];
  const out = (delta: number, monotonic: boolean, note?: string): DepthResult => ({ delta, edge: z0, dir, e0, monotonic, note });
  if (!(e0 > 0)) return out(NaN, false, 'no field at the edge');
  const level = e0 / Math.E;
  // samples from the edge over a length L: the first fall below the level, interpolated (linearly in ln|E|)
  const scan = (L: number, n: number): { at: number; monotonic: boolean } | null => {
    const s = Array.from({ length: n }, (_, i) => EPS + ((L - 2 * EPS) * i) / (n - 1));
    const v = absE(s.map((t) => z0 + dir * t));
    let monotonic = true;
    for (let i = 1; i < n; i++) {
      if (v[i] > v[i - 1] * (1 + 1e-9)) monotonic = false;
      if (v[i] <= level) {
        const [a, b] = [Math.log(Math.max(v[i - 1], 1e-300)), Math.log(Math.max(v[i], 1e-300))];
        const t = a === b ? 0 : (a - Math.log(level)) / (a - b);
        return { at: s[i - 1] + t * (s[i] - s[i - 1]), monotonic };
      }
    }
    return null;
  };
  if (Number.isFinite(len)) {
    const r = scan(len, 1200);
    if (!r) return out(NaN, false, '|E| does not fall to 1/e inside the region (it propagates, or the region is thinner than the depth)');
    // refine around the crossing
    const f = scan(Math.min(len, r.at * 1.02 + len / 1000), 1200) ?? r;
    return out(f.at, r.monotonic, r.monotonic ? undefined : '|E| is not a monotonic decay here: the value is where it first falls to 1/e');
  }
  // semi-infinite: lengthen the window until the fall is inside it
  for (let L = 50; L <= 2e5; L *= 4) {
    const r = scan(L, 400);
    if (!r) continue;
    const f = scan(r.at * 1.05, 1500) ?? r;
    return out(f.at, r.monotonic, r.monotonic ? undefined : '|E| is not a monotonic decay here: the value is where it first falls to 1/e');
  }
  return out(NaN, false, 'the wave propagates in this medium (no decay)');
}

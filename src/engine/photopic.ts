// Photopic weighting of a band average: the luminous reflectance / transmittance (e.g. Rv of ISO 13666 for ophthalmic
// coatings) = Σ R(λ) V(λ) S(λ) Δλ / Σ V(λ) S(λ) Δλ, with V(λ) the CIE 1924 photopic luminous efficiency (= ȳ of the CIE
// 1931 2° observer) and S(λ) the CIE standard illuminant D65; 380–780 nm every 10 nm, linear in between.

const L0 = 380;
const STEP = 10;
// CIE 1924 V(λ), 380 … 780 nm
const V = [
  0.00004, 0.00012, 0.0004, 0.0012, 0.004, 0.0116, 0.023, 0.038, 0.06, 0.09098, 0.13902, 0.20802, 0.323, 0.503, 0.71, 0.862, 0.954, 0.99495, 0.995,
  0.952, 0.87, 0.757, 0.631, 0.503, 0.381, 0.265, 0.175, 0.107, 0.061, 0.032, 0.017, 0.00821, 0.004102, 0.002091, 0.001047, 0.00052, 0.000249, 0.00012,
  0.00006, 0.00003, 0.000015,
];
// CIE D65, relative spectral power (100 at 560 nm), 380 … 780 nm
const D65 = [
  49.9755, 54.6482, 82.7549, 91.486, 93.4318, 86.6823, 104.865, 117.008, 117.812, 114.861, 115.923, 108.811, 109.354, 107.802, 104.79, 107.689, 104.405,
  104.046, 100, 96.3342, 95.788, 88.6856, 90.0062, 89.5991, 87.6987, 83.2886, 83.6992, 80.0268, 80.2146, 82.2778, 78.2842, 69.7213, 71.6091, 74.349, 61.604,
  69.8856, 75.087, 63.5927, 46.4182, 66.8054, 63.3828,
];

const at = (t: number[], lam: number) => {
  const x = (lam - L0) / STEP;
  if (!(x >= 0 && x <= t.length - 1)) return 0;
  const i = Math.min(t.length - 2, Math.floor(x));
  const f = x - i;
  return t[i] * (1 - f) + t[i + 1] * f;
};
// The photopic weight V(λ)·D65(λ) (0 outside 380–780 nm).
export const photopicWeight = (lam: number) => at(V, lam) * at(D65, lam);
export const PHOTOPIC_TABLES = { L0, STEP, V, D65 };

// Weights of a band average over the wavelengths xs (ascending): trapezoid Δλ, times V·D65 for a photopic mean;
// normalized to a sum of 1 (null when they vanish: a photopic band outside the visible).
export function bandWeights(xs: number[], photopic: boolean): number[] | null {
  const n = xs.length;
  const w = xs.map((x, i) => {
    const dx = n === 1 ? 1 : ((i < n - 1 ? xs[i + 1] : x) - (i > 0 ? xs[i - 1] : x)) / 2;
    return dx * (photopic ? photopicWeight(x) : 1);
  });
  const sum = w.reduce((a, b) => a + b, 0);
  return sum > 0 ? w.map((v) => v / sum) : null;
}

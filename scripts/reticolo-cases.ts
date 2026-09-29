// Cross-validation cases against RETICOLO (J.P. Hugonin & P. Lalanne, arXiv:2101.00901): the same structures are
// computed by Reticolo (scripts/bench-reticolo.ts, Octave) and by our RCWA (scripts/check-tmm.ts reads the stored
// reference, scripts/reference/reticolo.json). Lengths in any unit (the same for λ, period and thicknesses).
// Segments: x in units of the period, [from, to) covering [0, 1).
export type Cx = [number, number]; // re, im
// eps: a homogeneous anisotropic layer, the 3×3 tensor row-major (our axes: z down into the structure)
export type RetLayer = { d: number; n?: Cx; segs?: { from: number; to: number; n: Cx }[]; eps?: Cx[] };
export type RetCase = {
  id: string;
  source: string;
  lam: number;
  period: number;
  top: Cx;
  bottom: Cx;
  layers: RetLayer[]; // top → bottom
  theta: number; // degrees, in the top medium
  pol: 's' | 'p';
  N: number; // orders −N … N
  phi?: number; // conical incidence: azimuth (Reticolo delta0) in degrees; the TE / TM parts of each order are compared too
};

const lamellar = (fill: number, ridge: Cx, groove: Cx, d: number, from = 0): RetLayer => ({
  d,
  segs:
    from === 0
      ? [
          { from: 0, to: fill, n: ridge },
          { from: fill, to: 1, n: groove },
        ]
      : [
          { from: 0, to: from, n: groove },
          { from, to: from + fill, n: ridge },
          { from: from + fill, to: 1, n: groove },
        ],
});

// ε = (0.22 + 6.71 i)² = −44.9757 + 2.9524 i: the classic metallic lamellar benchmark (Li 1996, Granet 1999)
const nLi: Cx = [0.22, 6.71];

export const RETICOLO_CASES: RetCase[] = [
  // Li / Granet metallic lamellar grating: Λ = λ = 1, depth 1, fill 0.5, 30°
  ...(['s', 'p'] as const).flatMap((pol) =>
    [10, 20, 40].map((N): RetCase => ({ id: `li-${pol}-${N}`, source: 'Li, JOSA A 13, 1870 (1996); Granet, JOSA A 16, 2510 (1999)', lam: 1, period: 1, top: [1, 0], bottom: nLi, layers: [lamellar(0.5, nLi, [1, 0], 1)], theta: 30, pol, N })),
  ),
  // Reticolo exemple1_1D: dielectric grating (ridge 1.5, width 2 of 10), λ = 6, h = 20, normal incidence
  ...(['s', 'p'] as const).flatMap((pol) =>
    [5, 20, 40].map((N): RetCase => ({ id: `ex1-${pol}-${N}`, source: 'Reticolo exemple1_1D', lam: 6, period: 10, top: [1, 0], bottom: [1.5, 0], layers: [lamellar(0.2, [1.5, 0], [1, 0], 20, 0.4)], theta: 0, pol, N })),
  ),
  // Reticolo exemple6_1D: the same grating vs the incidence angle (TM)
  ...[-60, -25, 15, 45, 80].map((th): RetCase => ({ id: `ex6-${th}`, source: 'Reticolo exemple6_1D', lam: 6, period: 10, top: [1, 0], bottom: [1.5, 0], layers: [lamellar(0.2, [1.5, 0], [1, 0], 20, 0.4)], theta: th, pol: 'p', N: 10 })),
  // Reticolo exemple5_1D: vs the wavelength, around the Rayleigh anomaly λ = Λ (TM)
  ...[9.2, 9.9, 10.05, 10.8].map((lam): RetCase => ({ id: `ex5-${lam}`, source: 'Reticolo exemple5_1D', lam, period: 10, top: [1, 0], bottom: [1.5, 0], layers: [lamellar(0.2, [1.5, 0], [1, 0], 20, 0.4)], theta: 0, pol: 'p', N: 10 })),
  // Reticolo exemple_1D_pertes (case 1): lossy (0.1 + 5i) grating with slits, incident medium 1.2, 10°
  ...(['s', 'p'] as const).map((pol): RetCase => ({ id: `loss-${pol}`, source: 'Reticolo exemple_1D_pertes', lam: 8, period: 10, top: [1.2, 0], bottom: [1.5, 0], layers: [lamellar(0.8, [0.1, 5], [1, 0], 0.3, 0.1)], theta: 10, pol, N: 50 })),
  // Reticolo exemple11_1D: extraordinary transmission through a metallic slit array (TM, normal incidence)
  ...[0.5, 1.5, 2.7].map((h): RetCase => ({ id: `eot-${h}`, source: 'Reticolo exemple11_1D', lam: 6, period: 5, top: [1, 0], bottom: [1, 0], layers: [lamellar(0.6, [0.030465, 3.2792], [1, 0], h, 0.2)], theta: 0, pol: 'p', N: 10 })),
  // Reticolo exemple10_1D: echelette approximated by 12 steps (λ = 13, Λ = 30), two angles, TE and TM
  ...(['s', 'p'] as const).flatMap((pol) =>
    [5, 40].map((th): RetCase => ({
      id: `ech-${pol}-${th}`,
      source: 'Reticolo exemple10_1D',
      lam: 13,
      period: 30,
      top: [1, 0],
      bottom: [1.5, 0],
      layers: Array.from({ length: 12 }, (_, i) => ({ d: 30 / 13, segs: [{ from: 0, to: 1 - (i + 1) / 13, n: [1, 0] as Cx }, { from: 1 - (i + 1) / 13, to: 1, n: [1.5, 0] as Cx }] })),
      theta: th,
      pol,
      N: 10,
    })),
  ),
  // stack mixing two gratings of different periods-fractions and uniform (lossy) films, oblique incidence
  ...(['s', 'p'] as const).map((pol): RetCase => ({
    id: `mixed-${pol}`,
    source: 'SPR Forge (two gratings + films)',
    lam: 633,
    period: 500,
    top: [1, 0],
    bottom: [1.52, 0],
    layers: [lamellar(0.4, [0.18, 3.4], [1, 0], 40, 0.1), { d: 30, n: [2.3, 0.01] }, lamellar(0.6, [1.46, 0], [2.3, 0], 80, 0.25), { d: 50, n: [1.46, 0] }],
    theta: 20,
    pol,
    N: 15,
  })),
  // uniform stack (one Fourier harmonic): a TMM check with absorbing layers at oblique incidence
  ...(['s', 'p'] as const).map((pol): RetCase => ({
    id: `film-${pol}`,
    source: 'thin-film stack (Reticolo with nn = 0)',
    lam: 633,
    period: 500,
    top: [1.515, 0],
    bottom: [1.33, 0],
    layers: [{ d: 2, n: [3.1, 3.3] }, { d: 48, n: [0.056, 4.28] }, { d: 10, n: [2.1, 0] }],
    theta: 70,
    pol,
    N: 0,
  })),
  // ---- conical incidence (φ ≠ 0): Reticolo res1(…, ro, delta0) — its 2D solver with one harmonic along y ----
  // the Li / Granet metallic grating, TM strongly coupled to TE
  ...(['s', 'p'] as const).flatMap((pol) =>
    [30, 60].map((phi): RetCase => ({ id: `con-li-${pol}-${phi}`, source: 'Li / Granet grating, conical', lam: 1, period: 1, top: [1, 0], bottom: nLi, layers: [lamellar(0.5, nLi, [1, 0], 1)], theta: 30, pol, N: 20, phi })),
  ),
  // Reticolo exemple1_conique: λ = 6, Λ = 10, ridge 1.5 of width 5, h = 20, θ = 30°, δ₀ = 20°, nn = 5
  ...(['s', 'p'] as const).map((pol): RetCase => ({ id: `con-ex1-${pol}`, source: 'Reticolo exemple1_conique', lam: 6, period: 10, top: [1, 0], bottom: [1.5, 0], layers: [lamellar(0.5, [1.5, 0], [1, 0], 20)], theta: 30, pol, N: 5, phi: 20 })),
  // dielectric grating at large azimuths, and negative θ, φ
  ...(['s', 'p'] as const).flatMap((pol) =>
    [
      [50, 45],
      [50, 89],
      [-20, -70],
    ].map(([theta, phi]): RetCase => ({ id: `con-diel-${pol}-${theta}-${phi}`, source: 'dielectric grating, conical', lam: 6, period: 10, top: [1, 0], bottom: [1.5, 0], layers: [lamellar(0.2, [1.5, 0], [1, 0], 20, 0.4)], theta, pol, N: 10, phi })),
  ),
  // lossy grating with slits (exemple_1D_pertes), incident medium 1.2
  ...(['s', 'p'] as const).map((pol): RetCase => ({ id: `con-loss-${pol}`, source: 'Reticolo exemple_1D_pertes, conical', lam: 8, period: 10, top: [1.2, 0], bottom: [1.5, 0], layers: [lamellar(0.8, [0.1, 5], [1, 0], 0.3, 0.1)], theta: 10, pol, N: 30, phi: 35 })),
  // two gratings and lossy films
  ...(['s', 'p'] as const).map((pol): RetCase => ({
    id: `con-mixed-${pol}`,
    source: 'SPR Forge (two gratings + films), conical',
    lam: 633,
    period: 500,
    top: [1, 0],
    bottom: [1.52, 0],
    layers: [lamellar(0.4, [0.18, 3.4], [1, 0], 40, 0.1), { d: 30, n: [2.3, 0.01] }, lamellar(0.6, [1.46, 0], [2.3, 0], 80, 0.25), { d: 50, n: [1.46, 0] }],
    theta: 20,
    pol,
    N: 12,
    phi: 40,
  })),
  // uniform stack (no grating) at φ = 50°: TE and TM must not mix
  ...(['s', 'p'] as const).map((pol): RetCase => ({ id: `con-film-${pol}`, source: 'thin-film stack, conical', lam: 633, period: 500, top: [1.515, 0], bottom: [1.33, 0], layers: [{ d: 2, n: [3.1, 3.3] }, { d: 48, n: [0.056, 4.28] }, { d: 10, n: [2.1, 0] }], theta: 70, pol, N: 0, phi: 50 })),
  // echelette in 12 steps (exemple10_1D), conical
  {
    id: 'con-ech-s',
    source: 'Reticolo exemple10_1D, conical',
    lam: 13,
    period: 30,
    top: [1, 0],
    bottom: [1.5, 0],
    layers: Array.from({ length: 12 }, (_, i) => ({ d: 30 / 13, segs: [{ from: 0, to: 1 - (i + 1) / 13, n: [1, 0] as Cx }, { from: 1 - (i + 1) / 13, to: 1, n: [1.5, 0] as Cx }] })),
    theta: 5,
    pol: 's',
    N: 10,
    phi: 25,
  },
];

// ---- anisotropic homogeneous layers (Berreman 4×4 in our solver; Reticolo: textures {epsilon}), conical mount ----
// uniaxial tensor ε = no² I + (ne² − no²) â âᵀ, â at `tilt` from the layer plane and `az` from x (degrees)
const uni = (no: number, ne: number, tilt: number, az: number, k = 0): Cx[] => {
  const [t, a] = [(tilt * Math.PI) / 180, (az * Math.PI) / 180];
  const ax = [Math.cos(t) * Math.cos(a), Math.cos(t) * Math.sin(a), Math.sin(t)];
  const out: Cx[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out.push([(i === j ? no * no : 0) + (ne * ne - no * no) * ax[i] * ax[j], i === j ? k : 0]);
  return out;
};
RETICOLO_CASES.push(
  // Reticolo exemple_V9_0D_anisotrope: ε given in Reticolo's axes (z up): ours has εxz, εzx of the opposite sign
  ...(['s', 'p'] as const).map((pol): RetCase => ({
    id: `aniso-ex-${pol}`,
    source: 'Reticolo exemple_V9_0D_anisotrope',
    lam: 0.5,
    period: 1.5,
    top: [1.9, 0],
    bottom: [1.433, 0],
    layers: [{ d: 0.5, eps: [[2.116, 0], [0, 0], [-0.7165, 0], [0, 0], [1.3995, 0], [0, 0], [-0.7165, 0], [0, 0], [2.116, 0]] }],
    theta: 30,
    pol,
    N: 0,
    phi: 0,
  })),
  // tilted uniaxial layers (a nematic, n_o 1.53, n_e 1.71), conical, with an isotropic film between
  ...(['s', 'p'] as const).flatMap((pol) =>
    [
      [35, 20, 40],
      [70, -50, 110],
    ].map(([tilt, az, phi]): RetCase => ({
      id: `aniso-lc-${pol}-${phi}`,
      source: 'uniaxial layers, conical',
      lam: 633,
      period: 500,
      top: [1.52, 0],
      bottom: [1.52, 0],
      layers: [{ d: 20, n: [1.9, 0.01] }, { d: 1200, eps: uni(1.53, 1.71, tilt, az) }, { d: 90, n: [2.1, 0] }, { d: 300, eps: uni(1.6, 1.9, -25, az + 60) }],
      theta: 30,
      pol,
      N: 0,
      phi,
    })),
  ),
  // absorbing biaxial-like tensor (a lossy uniaxial with an off-axis tensor), oblique
  ...(['s', 'p'] as const).map((pol): RetCase => ({ id: `aniso-lossy-${pol}`, source: 'absorbing anisotropic layer', lam: 633, period: 500, top: [1, 0], bottom: [1.45, 0], layers: [{ d: 150, eps: uni(1.8, 2.3, 50, 30, 0.2) }], theta: 45, pol, N: 0, phi: 25 })),
  // Liu et al., Opt. Express 31, 8384 (2023): prism 1.52 / (TiO₂ 94 nm, SiO₂ 145 nm) × 10 / uniaxial 2.75 µm (n_o = 1.52 +
  // 0.001i, n_e = 1.72 + 0.001i, axis in the layer plane at ϕ from x) / air, at Brewster's angle of the PhC; on the TE-mode
  // resonances (sharp: a stringent test) — the FW-BIC (ϕ 37.1°), a coupled mode (10°), the SP-BIC (0°), 45°, off resonance
  ...[
    [37.1, 544.062],
    [10, 547.92],
    [0, 549.89],
    [45, 552.32],
    [20, 560],
  ].flatMap(([az, lam]) =>
    (['s', 'p'] as const).map((pol): RetCase => {
      const eo: Cx = [1.52 * 1.52 - 1e-6, 2 * 1.52 * 0.001];
      const ee: Cx = [1.72 * 1.72 - 1e-6, 2 * 1.72 * 0.001];
      const ax = [Math.cos((az * Math.PI) / 180), Math.sin((az * Math.PI) / 180), 0];
      const eps: Cx[] = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) eps.push([(i === j ? eo[0] : 0) + (ee[0] - eo[0]) * ax[i] * ax[j], (i === j ? eo[1] : 0) + (ee[1] - eo[1]) * ax[i] * ax[j]]);
      const pc: RetLayer[] = Array.from({ length: 10 }, () => [{ d: 94, n: [2.16, 0] as Cx }, { d: 145, n: [1.47, 0] as Cx }]).flat();
      return { id: `liu2023-${az}-${pol}`, source: 'Liu et al. 2023, PhC + anisotropic layer', lam, period: 500, top: [1.52, 0], bottom: [1, 0], layers: [...pc, { d: 2750, eps }], theta: 53.084, pol, N: 0, phi: 0 };
    }),
  ),
  // (an anisotropic layer under a grating is not compared: Reticolo's result oscillates with the orders — T₋₁ TM 0.0496 /
  // 0.0455 / 0.0466 at nn = 8 / 16 / 30 — while ours is stable, 0.04632 / 0.04635 at N = 8 / 16; checked instead by the
  // convergence, the energy balance and the reciprocity in check-tmm)
);

// Conical cases whose fields (res3, all six components) are compared point by point: the x positions (units of the
// case), the margin drawn above and below the layers, and the points per region (npts, ends included).
export const RETICOLO_FIELD_CASES: { case: string; xs: number[]; margin: number; npts: number }[] = [
  { case: 'con-ex1-s', xs: [1.3, 3.7, 6.1, 8.8], margin: 4, npts: 5 },
  { case: 'con-ex1-p', xs: [1.3, 3.7, 6.1, 8.8], margin: 4, npts: 5 },
  { case: 'con-mixed-s', xs: [37, 180, 310, 444], margin: 150, npts: 4 },
  { case: 'con-mixed-p', xs: [37, 180, 310, 444], margin: 150, npts: 4 },
  { case: 'con-li-p-30', xs: [0.13, 0.37, 0.61, 0.88], margin: 0.4, npts: 5 },
  { case: 'con-film-p', xs: [0, 123], margin: 60, npts: 5 },
];

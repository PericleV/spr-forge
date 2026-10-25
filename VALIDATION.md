# Validation

SPR Forge, 2026-10-25: **every check of `npm run check:tmm` passes** (the full run: 13 min on a laptop).

Every computation is checked by [`scripts/check-tmm.ts`](scripts/check-tmm.ts). Each block computes something, compares
it and stops the run with an error when a value leaves its tolerance; the numbers below are the ones that run printed.
The checks are of three kinds:

- **Published results** (section 1): a structure of a paper computed through the nodes, as a user would, against the
  values the paper reports. The example of the app that reproduces it is named beside it.
- **Reference codes** (section 2): RETICOLO V10 (RCWA), the TMM of S. Byrnes, the official merit functions of the OIC
  2025 contest, the tables of a book.
- **Exact checks** (section 3): a known answer, a formula, an identity (energy conservation, reciprocity, a limit that
  must give the simpler model), the same result by two routes (through the graph and by a direct call), or the behaviour
  of the app (a project file opened, a job started only after Run).

## How to reproduce

```bash
npm install
npm run check:tmm
```

`npm run check:tmm -- --quick` leaves out the slow blocks (about 1 min instead of 13).

The RETICOLO values are stored in [`scripts/reference`](scripts/reference), so the checks run without it. To compute
them again: GNU Octave and RETICOLO V10 (J. P. Hugonin and P. Lalanne, arXiv:2101.00901), the folder in the `RETICOLO`
environment variable, then `npm run bench:reticolo` (efficiencies) and `npm run bench:reticolo-fields` (fields). The
cases are in [`scripts/reticolo-cases.ts`](scripts/reticolo-cases.ts).

## 1. Published results

The published value in parentheses. Where they differ, the reason is given; the material data are those of the app's
library (refractiveindex.info, cited in each material), which a paper may not have used.

| Reference | What is compared | SPR Forge (published) | Example |
|---|---|---|---|
| H. Lu et al., Opt. Express 27, 5383 (2019) | Tamm plasmon induced reflection | TPP dip 0.7970 eV (0.796); analytic ω_T 0.7914 eV (0.79); induced peak 1555.70 nm (1556); coupled oscillators M = 8: κ 7.95, κ_T 1.05 (7.97, 1.06) ×10¹² rad/s; M = 12: κ 1.61 (≈ 1.6, Fig. 8b) | Tamm plasmon induced reflection |
| Jena et al., arXiv:2105.01888 | Rabi-like splitting, Tamm plasmon + cavity | hybrid modes at d_s = 141 nm 2.4150 / 2.5393 eV (2.416 / 2.541); Ω 123.6 meV (125); zero detuning at d_s = 141.6 nm (141) | Rabi-like splitting, Tamm plasmon + cavity |
| M. V. Pyatnov et al., Photonics 5, 30 (2018) | chiral optical Tamm states of a cholesteric between anisotropic mirrors | σ−, d = 1 µm: 636.3 / 664.8 nm (636 / 665); d = 4 µm: 650.0 nm (650); σ+ Fabry–Pérot peaks 625.8 / 639.0 nm (625 / 639) | Chiral optical Tamm states and a quasi-BIC |
| I. V. Timofeev et al., Crystals 7, 113 (2017) | quasi-BIC of the same structure | σ− → σ+ conversion 0.9973 at the crossover (3.4 µm); width decay 1.680 µm⁻¹ against 4π\|n_f\|/λ₀ = 1.641 µm⁻¹ | Chiral optical Tamm states and a quasi-BIC |
| P. S. Pankin et al., J. Opt. Soc. Am. B 39, 968 (2022) | BIC of an anisotropic defect in a photonic crystal | Fano line at L = 960 / 980 nm: width 0.5431 / 0.1338 nm, ratio 4.06 (the (L − L_BIC)² law gives 4); at the full-wave plate R independent of φ (3.7·10⁻¹⁷) | Bound state in the continuum, anisotropic defect |
| Z. Liu et al., Opt. Express 31, 8384 (2023) | Friedrich–Wintgen BIC of a photonic crystal + 2.75 µm uniaxial layer | Fano dip depth 0.5491 / 0.1724 / 0.0011 / 0.1522 / 0.5562 at ϕ = 30 / 34 / 37.2 / 40 / 44°: it vanishes at 37.2° (38.34° in the paper, computed by FEM). The same structure agrees with RETICOLO to 6·10⁻¹² on its sharp resonances (section 2): the difference is between the paper's method and the transfer / RCWA solvers, not between our two solvers | BICs in an asymmetric photonic crystal + anisotropic layer |
| H. Pan et al., Opt. Express 32, 47154 (2024) | narrowband thermal emitter | the published optimum: A 0.8273 at 5.319 µm, Q 179 (0.8261, 5.34 µm, 175); simulated annealing from a poor start: A 0.855 at 5.340 µm, Q 233 | Narrowband thermal emitter by simulated annealing |
| M. He et al., Nat. Mater. 20, 1663 (2021) | inverse design of a Tamm emitter (CdO, Adam) | the CdO carrier model = the authors' code (9.8·10⁻⁴; they use 3.14 for π); the two-stage Adam schedule (rate 0.05 → 0.0063); shortened example: merit 0.252 → 0.0176, R 0.184 / 0.117 at 4237 / 3500 nm, 0.999 at 5000 nm | Inverse design of a Tamm emitter by gradient descent |
| M. Sebek et al., ACS Omega 8, 20792 (2023) | SPR sensors built layer by layer (2D materials) | the published sensors with the library data: 633 nm S 450.2 deg/RIU, 83.98° → 86.23° (578, 85.0° → 87.9°); dual mode: jump 81.37° → 88.45°, Δθ 7.08°, S 1416 (6.78°, 1364); 785 nm with MoS₂ (Fig. 5D): S 588 with 13 hBN layers (676.4). Computed with the indices of the app's library, not necessarily the paper's; the genetic algorithm finds S 528 with the same data (above the published structure's 450) | SPR sensor by a genetic algorithm; Dual-mode SPR sensor |
| T. Tene et al., Front. Bioeng. Biotechnol. 13, 1580344 (2025) | graphene SPR biosensor for malaria | dip angles of Sys0–4 within 0.051° of 68.6 / 78.2 / 84.2 / 85.3 / 86.2°; optimized, through the nodes: dip angles within 0.0036°, S within 0.021 % (Sys3: 353.07 / 291.16 / 263.27 against 353.143 / 291.143 / 263.258 deg/RIU). Their widths follow a definition the paper does not state: ours are half-depth widths, so FWHM, QF and FoM differ by up to ~10 %; the detection limit depends only on Δθ and agrees | Graphene SPR biosensor for malaria, Sys3 and Sys4 |
| C. Hu, Optik 122, 1881 (2011) | grating-coupled SPR with the −1st order, Al–Au | resonance angles (N = 20): Au 40 nm 60.54° / 51.79° for n = 1.32 / 1.37 (60.55° / 51.87°); Au 30 nm 63.10° / 54.40° (63.02° / 54.37°); Al 30 nm 67.96° / 58.56° (68.21° / 58.7°); Al + 3 nm Au: shift 9.27° (9.39°) | Grating SPR sensor with the −1st order, Al–Au |
| L. S. Jung et al., Langmuir 14, 5636 (1998) | the response to an adsorbed layer (Cr 1 / Au 50 nm, 825 nm) | R(d) = A[1 − exp(−2d/l_d)] fits with l_d = 377.5 nm (368; 320–370) to 0.06 %; m = 107.1°/RIU (107) | Sensorgram examples |
| M. Wasilewska et al., Int. J. Environ. Res. Public Health 18, 4944 (2021) | myoglobin on silica, random sequential adsorption | jamming coverage Γ∞ 0.595 / 1.307 mg/m² at 10 / 150 mM (0.60 ± 0.1 / 1.3 ± 0.1); albumin 1.37 mg/m² at 150 mM (1.3–1.4, the authors' 2019 work) | Protein adsorption: random packing and ionic strength |
| Biacore convention | the SPR response unit | 1 ng/mm² at 760 nm → 0.1314° (1000 RU = 0.1°) | Sensorgram examples |
| J. Zhang et al., Appl. Opt. 52, 5788 (2013) | notch filter start (1.92H 2.08L)^100 | centre 532.07 nm, width 8.56 nm (weak-coupling estimate 8.34); deep search then meets the specification: width 10.00 nm at 532.00 nm, OD ≥ 4.00, pass T ≥ 0.900 (202 layers) | Narrow notch filter, ≤ 10 nm at 532 nm |
| Analytic plasmon dispersion | grating SPR angle against the analytic plasmon index | dips 12.71° / 12.76° at depth 5 / 2 nm against 12.78° (shallow-grating limit); under conical incidence n_eff 1.04590 ± 2.7·10⁻⁵ for every φ against Re √(ε/(ε+1)) = 1.04487 | SPR by grating coupling; under conical incidence |

## 2. Reference codes

| Reference | Cases | Largest difference |
|---|---|---|
| RETICOLO V10 (2025), planar diffraction (Li / Granet metal grating, RETICOLO's exemple1/5/6/10/11/pertes, two gratings + films, thin-film stack) | 38 cases, 215 diffraction efficiencies | 2.8·10⁻¹² |
| RETICOLO V10, conical diffraction (res1 with delta0): metal at φ 30 / 60°, exemple1_conique, dielectric at φ 45 / 89 / −70°, lossy, echelette, anisotropic films (exemple_V9_0D_anisotrope, tilted nematic layers, absorbing tensor), the structure of Liu et al. 2023 on its sharp resonances | 37 cases, 396 values (efficiencies and their TE / TM parts) | 6.0·10⁻¹² |
| RETICOLO V10, fields (res3): Ex … Hz at points of every region, relative to the largest component | 6 cases, 278 points | 1.4·10⁻¹² |
| S. Byrnes, TMM (arXiv:1603.02720): the admittance TMM of the filter designer | s, p; 0 / 35 / 62°; absorbing layers | 7.8·10⁻¹⁶ |
| OIC 2025 (Kruschwitz, Trubetskov, Keck, Appl. Opt. 65, A12 (2026)): the committee designs, merit functions built from the nodes | Problem A, Problem B | A: MF 7.0067629 (official 7.006763); B: 1.8540762059025635 (official 1.8540762059025715, 8.0·10⁻¹⁵) |
| E. Popov (ed.), Gratings: Theory and Numeric Applications (2014): aluminium sinusoidal grating, Λ 500 nm, depth 200 nm, Littrow −1, TM | smooth profile (FFF) | η₋₁ 0.8926 / 0.8782 / 0.8783 at N = 10 / 20 / 25 (book 0.878); the staircase of 20 slices gives 0.7421 |
| C. H. Gooch and H. A. Tarry, J. Phys. D 8, 1575 (1975): 90° twisted nematic between crossed polarizers | u = 0.8, √3, 3, √15 | 0.4981 / 0.0000 / 0.0938 / 0.0000 against 0.4988 / 0.0000 / 0.0936 / 0.0000 |

## 3. Exact checks

### Thin films (TMM) and fields

- Fresnel at normal incidence 0.04194 = 0.04194; R_p at Brewster 5·10⁻¹⁸; a lossless stack absorbs nothing (1·10⁻¹⁶);
  quarter-wave mirror R(λ₀) = the analytic formula (0.972013).
- The real-arithmetic TMM = the earlier complex implementation on 800 random stacks (metals, total reflection, thick
  layers): \|ΔR\|, \|ΔT\| ≤ 4.3·10⁻¹⁵, phases ≤ 8.0·10⁻¹⁵ rad.
- A sweep grid = the points computed one by one (0); DBR periods × cavity position = separate structures (0).
- SPR sensitivity through the nodes 115.0 °/RIU against the semi-infinite-metal estimate 116.1 °/RIU.
- Fields: R from the field profile = TMM; R + T + ΣA = 1 (to 10⁻⁹); tangential E and H continuous (≤ 7.5·10⁻¹⁵); the
  absorption of each layer from the flux = the integral of the absorbed density; the evanescent decay in water
  1/Im k_z = 230.00 nm.
- Complex r, t: \|r\|² = R, arg r = φr, T_s = \|t\|² Re q_exit / q₀ (5.6·10⁻¹⁷); group delay of a 5 µm BK7 plate = n_g d / c
  (9.1·10⁻⁹), its GDD (4.6·10⁻⁵).
- Thick incoherent substrate: the formula = the coherent average over a fringe (1.4·10⁻¹⁵); through Combine and Compute TMM
  = the formula (0).
- Cone of light: 8 angles = 40 000 rays (9.5·10⁻⁶).
- Effective media: Bruggeman, Maxwell-Garnett, Looyenga at p = 0 and 1 = the pure materials.

### Analysis and fits

- A Lorentzian: centre 50.12299 (50.123), FWHM 2.50050 (2.5); FWHM of coupled oscillators Γ = 5 / 20 / 60 nm measured exactly.
- Fits of synthetic spectra recover their parameters: Lorentz, Gauss, Fano (q 1.5001 for 1.5), coupled oscillators, the
  polariton dispersion (x₁ 649.990, Ω 24.998 for 650, 25), in angle (to 10⁻¹⁴).
- Dip of a noisy Lorentzian (σ 0.002): position spread 7.8·10⁻³ (parabola), 4.7·10⁻⁴ (polynomial), 5.4·10⁻⁴ (centroid).
- Instrument: a Gaussian blur of σ 0.5 on x² adds 0.2498 (σ² = 0.25); detector noise 0.00200 (0.002), 4 scans 0.00100
  (0.001), shot noise √(R/N).
- Penetration depth, Extract / Merge / Custom data, formulas (complex, trigonometric identities to 3.6·10⁻¹⁵), materials
  in Custom data (n, k, ε) = the library.

### Gratings (RCWA)

- Uniform layers = TMM (1.2·10⁻¹⁵); a lossless grating conserves energy (2.8·10⁻¹⁴); convergence with N; Li's rules
  converge where Laurent's do not (metal TM, R₀ 0.6234 → 0.6289 against 0.6098 → 0.4902 → 0.6089).
- Subwavelength limit: TE → the mean ε, TM → the uniaxial effective medium (errors fall as Λ², Λ).
- Profiles: trapezoid with equal fills and pixel map = lamellar; flip mirrors; sinus and blazed converge with Nz.
- Fast paths = the dense solve (60 structures, 3.2·10⁻¹⁵; conical 1.0·10⁻¹⁴); the compute pool splits jobs and joins
  them exactly.
- Field maps: uniform stack = TMM profile (2.7·10⁻¹⁵), continuity at the grating interfaces, plasmon enhancement 133.9
  at the dip; Gibbs smoothing (Lanczos): field error 12.9 % → 1.5 %.
- Conical incidence: φ = 0 = planar (1.4·10⁻¹²); films = TMM at any φ (4.2·10⁻¹⁵); reciprocity φ ↔ φ + 180° with TE ↔ TM
  conversion (3.2·10⁻¹⁴); Jones incidence: ψ = 0 / 90° = TM / TE, orthogonal pairs average to unpolarized (1.1·10⁻¹⁶).
- Adaptive spatial resolution (Granet): η → 0 = plain RCWA (1.4·10⁻¹⁰), one material = TMM (1.4·10⁻¹⁴); gold TM at N = 40
  \|ΔR\| 1.7·10⁻⁴ against 8.7·10⁻⁴ without it.
- Smooth profiles (FFF, the differential method of Popov and Nevière): lamellar integrated = eigenmodes (second order in
  the step), film = TMM (5.8·10⁻⁸), lossless sinus R + T = 1, TE gold sinus = 400 staircase slices (7.9·10⁻⁷).
- Thick substrate under a grating: no grating = TMM (7.8·10⁻¹⁶), lossless R + T = 1, index-matched back = semi-infinite.

### Anisotropic media (Berreman 4×4)

- Isotropic tensor = TMM, also under a grating (1.1·10⁻¹⁵); axis along x at normal incidence = TMM with n_e / n_o; wave
  plates = Jones calculus (2.7·10⁻¹⁵); R + T = 1; reciprocity.
- Cholesteric: Bragg band edges 581.0 / 650.2 nm against n_o p / n_e p 581.4 / 649.8 nm; the exact helix at normal incidence
  (rotating frame): slices converge as 1/S² (ratio 3.99–4.03 per doubling); handedness: a right-handed helix reflects σ−.
- Semi-infinite anisotropic exit medium: isotropic = isotropic (5.6·10⁻¹⁶), uniaxial half-space = Fresnel along / across
  the axis; field profiles: flux = T everywhere (1.1·10⁻¹⁴), R + T + Σ absorbed = 1 (4.1·10⁻¹²).
- The liquid-crystal cavity: T for ψ = 45° = the mean of the x and y TMM (2.0·10⁻¹³).

### Rough interfaces

- RMS and peak-to-peak exact; mean correlation length over 20 seeds 19.98 nm (20); thickness kept; seeds averaged = runs.
- Ensemble statistics = Φ(z/σ) (3·10⁻⁴); the shape medium at L = 0 / 1 / ⅓ = Wiener / Bruggeman (1.4·10⁻¹⁶); against RCWA of
  the smooth profile: Au dip within 0.11° (RMS 3 nm); tensor slices in plain TMM = Berreman (1.1·10⁻¹⁴).

### Filter design

- Analytic ∂/∂d and needle derivatives = finite differences (5.7·10⁻¹¹, 1.4·10⁻⁹; five materials incl. Ag: 9.0·10⁻⁶).
- Designs: AR 4.23 % → 0.166 %; long-pass; AR on both faces of a plate with four materials 0.165 % against 0.341 % with two;
  band-pass with three cavities (FWHM 2.00 nm, OD ≥ 4.19); gradual evolution from no layers (R 0.615 %, 5 layers).
- The designed stack through Compute TMM = the designer's spectrum (1.0·10⁻¹⁴); the merit functions (RMS, OD, ≥ / ≤,
  tolerances, p-norms) = the definitions, their derivatives = finite differences (2·10⁻¹⁰).
- The Peleș castle filter: designer merit 4.1751 = Compute TMM + Curve match 4.1751.

### Optimization

- Test functions: Rosenbrock (Nelder–Mead 6.5·10⁻¹⁵), Rastrigin (DE 6.8·10⁻⁸, GA 2.0·10⁻⁵), quadratic (Adam 8·10⁻⁸),
  ZDT1 front (NSGA-II 2.6·10⁻²), Levenberg–Marquardt exact in 42 evaluations; every DE strategy, GA and PSO variant.
- Simulated annealing: acceptance 100 % at T₀ = 10⁹, 0 % at the minimum as T₀ → 0.
- Metrology fit: d = 57.97 / 305.02 nm (58 / 305); SPR sensor design: Ag 35 → 56.24 nm, R at the dip 0.525 → 0.0018.
- The Optimization Engine's outputs = Compute TMM + Sensitivity (450.219 / 450.217 deg/RIU).

### Tolerances and robust design

- σ = 0 → samples = nominal (3.6·10⁻¹⁷); a sample rebuilt from its error table = TMM (0); same seed → same samples.
- Small errors: Monte Carlo spread / analytic-gradient prediction = 0.981 … 1.020 (3000 samples).
- Yield = the direct count; criteria from Min / max and Sensitivity recomputed per sample (0).
- Robust design: the Tolerance yield as an objective; differential evolution raises it (64 % → 77 %); Adam stays on the
  stepped yield and moves on the smooth one.

### Binding kinetics and sensorgrams

- 1:1 binding = the analytic solution (1.2·10⁻¹⁵); infinite transport = 1:1; the transport-limited start = k_t·C; two-state and
  bivalent limits = 1:1; swelling = analytic (1.4·10⁻¹¹).
- Sensorgram: bare chip = exact dip (1.9·10⁻⁸°); bulk Δn = water + Δn; de Feijter n = n_b + (dn/dc)Γ/d (2.2·10⁻¹⁶); dip tracking
  against a 0.0005° grid (5·10⁻⁸°).
- Random sequential adsorption: blocking 1 − 4θ, Feder's t^(−1/2) approach (gap ratio 2.004).

### Project files and the app

- The 27 project files of the published version open intact (19 evaluated without an error, 8 RCWA / Berreman ones in the
  slow block); a damaged file is repaired with a message; newer / older formats are refused with their messages.
- Share links round-trip exactly; NaN / Infinity survive a save.
- Compute RCWA starts only after Run, Stop cancels it, changed inputs keep the previous result.
- Formatted notes: the markup, the 42 example notes unchanged, the exports.
- Reroute points leave every result as it was; a Python script gives nothing outside the app, and the Optimization Engine
  refuses an objective that depends on one.
- The material library: 99 built-in materials, those of the examples as in their articles; anisotropic pairs within
  0.0008 of handbook values.

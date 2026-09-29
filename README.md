# SPR Forge

**Live app:** https://periclev.github.io/spr-forge/

A free, node-based simulator for thin films and 1D gratings that runs entirely in the browser. Structures, computations,
analyses and optimizations are nodes connected into a graph; every result updates when a parameter changes.

- **Thin films (TMM)**: reflectance, transmittance, absorptance and phases over wavelength, angle and any number of sweeps;
  thick incoherent substrates with coatings on both faces; fields and absorption inside the stack.
- **1D gratings (RCWA)**: lamellar, trapezoid, sinusoidal, blazed and pixel profiles, diffraction orders, adaptive spatial
  resolution (ASR), field maps in the x–z plane, convergence check; conical incidence (azimuth φ) and any incident
  polarization (Jones ψ, δ).
- **Anisotropic layers (Berreman 4×4)**: uniaxial and biaxial media with any orientation of their axes, liquid crystals
  with a twisted / tilting director (cholesterics solved exactly at normal incidence), anisotropic exit media (a semi-infinite
  crystal), fields inside the stack; Compute TMM switches to the 4×4 method by itself and splits R and T into TE / TM and
  circular (σ±) parts; circularly polarized light.
- **Analysis**: resonance minima / maxima, FWHM and Q, sensitivity and FOM of sensors, fits (Lorentz, Fano, coupled
  oscillators, anticrossing dispersion / Rabi splitting), Monte Carlo tolerance analysis with yield.
- **Optimization**: Adam (two stages, decaying rate), differential evolution, Nelder-Mead, genetic algorithm, particle
  swarm, simulated annealing, Levenberg-Marquardt, NSGA-II (Pareto fronts); objectives from bands, target curves, measured
  data or any expression.
- **SPR sensor design**: in the Optimization Engine, a genetic algorithm over layer sequences (after Sebek et al., ACS Omega
  2023) builds sensors from the materials you tick for each role — prisms, plasmonic metals, other metals, dielectrics, 2D
  materials in monolayers — with the limits of each role, and maximizes the angular sensitivity or S / FWHM.
- **Filter design**: needle optimization, deep search, gradual evolution, design cleaner, random perturbations; N coating
  materials, targets with =, ≥, ≤, tolerances and optical density (OD), polarization and angle; one or both faces of a plate;
  start designs from formulas such as `(HL)^8 2H (LH)^8`; deep search refines its candidates in parallel on several cores.
- **Materials**: a built-in library (refractiveindex.info data, including the 2D materials graphene, hBN, MoS₂, WS₂) and your own materials (constant, tabulated CSV,
  dispersion formulas, Drude-Lorentz, porous effective media, doped semiconductors with the carrier density as a
  parameter).

Notes on the canvas can be combined into one document exported as Markdown or plain text.

Projects are saved as JSON files or kept in the browser (several, by name); nothing is uploaded anywhere. The *Help*
button explains every node; each node also has its own `?`.

## Examples

The *Examples…* menu opens complete graphs, each with a note: surface plasmon resonance (Kretschmann, sensor design, grating
coupling), Bragg mirrors and microcavities, strong coupling (polaritons, dispersion vs angle), a dual-band absorber, thin-film
metrology (fitting a measurement), filter design (long-pass, narrow notch ≤ 10 nm, three-cavity band-pass, AR on both faces,
a castle-contour filter), tolerance analysis, a guided-mode resonance filter, Tamm plasmons, SPR sensors with 2D materials
designed by a genetic algorithm (and a dual-mode plasmon–waveguide sensor), a liquid-crystal microcavity tuned by the director
tilt, bound states in the continuum of photonic crystals with anisotropic layers (Pankin et al. 2022, Liu et al. 2023), chiral
optical Tamm states of a cholesteric between anisotropic mirrors as a quasi-BIC (Pyatnov et al. 2018, Timofeev et al. 2017), and optimization benchmarks after
published papers (simulated annealing, gradient inverse design).

## Validation

The physics is checked at every change of the code (`npm run check:tmm`), among others:

| Check | Result |
|---|---|
| TMM vs analytic formulas (Fresnel, Brewster, quarter-wave mirror) | exact |
| Design TMM (with analytic gradients) vs Byrnes' TMM | 4·10⁻¹⁶ |
| RCWA vs RETICOLO V10 (34 cases, 197 diffraction efficiencies) | max \|Δη\| 2.8·10⁻¹² |
| RCWA, conical incidence and anisotropic layers (Berreman 4×4) vs RETICOLO V10 (37 cases, 396 efficiencies and TE / TM parts) | max \|Δη\| 6·10⁻¹² |
| Berreman 4×4: cholesteric band edges vs n_o p … n_e p; 90° twisted nematic vs Gooch–Tarry | 0.07 %; 7·10⁻⁴ |
| Chiral optical Tamm states, Pyatnov et al., Photonics 5, 30 (2018) | peaks 636.3 / 664.8 / 650.0 nm, Fabry–Pérot 625.8 / 639.0 nm (636 / 665 / 650, 625 / 639) |
| Quasi-BIC and Kopp–Genack crossover vs coupled-mode theory (Timofeev et al., Crystals 7, 113 (2017)) | full σ− → σ+ conversion; width = 2 × floor at the crossover; decay rate within 3 % |
| BIC with an anisotropic defect, Pankin et al., J. Opt. Soc. Am. B 39, 968 (2022) | the line vanishes at (n_e − n_o)L = λ; width ∝ (L − L_BIC)² (ratio 4.06 for 4) |
| Tamm plasmon induced reflection, Lu et al., Opt. Express 27, 5383 (2019) | dip 0.797 eV (0.796), κ 7.95 (7.97)·10¹² rad/s |
| Rabi-like splitting, Jena et al., arXiv:2105.01888 | Ω 123.6 meV (125) |
| Narrow notch at 532 nm (Zhang et al., Appl. Opt. 52, 5788 (2013) start) | ≤ 10 nm, OD ≥ 4, T ≥ 90 % met |
| Thermal emitter, Pan et al., Opt. Express 32, 47154 (2024) | A 0.827 at 5.32 µm, Q 179 (0.826, 5.34 µm, 175) |
| Dual-mode SPR sensor, Sebek et al., ACS Omega 8, 20792 (2023) | S 1416 deg/RIU, jump 7.1° (1364, 6.78°) |

## Running it

Requirements: Node.js 22.18 or newer (24 recommended; the checks run TypeScript directly).

```bash
npm install
npm run dev          # development server on http://localhost:5173
npm run build        # static site in dist/ (works from any folder of any static host)
npm run check:tmm    # the physics checks and benchmarks
npx tsc -b && npx oxlint
```

`npm run bench:reticolo` recomputes the RETICOLO reference values (needs GNU Octave and RETICOLO; the stored values are in
`scripts/reference/reticolo.json`).

## Structure

- `src/physics/` — TMM, fields, RCWA (with ASR, conical incidence and thick substrates), Berreman 4×4, materials, complex
  matrices.
- `src/engine/` — the graph evaluator (pure, also used by the scripts), workers, analyses, fits, optimizers, filter design,
  target specifications.
- `src/nodes/`, `src/plot/` — the node views and the charts.
- `scripts/check-tmm.ts` — the checks; `scripts/gen-builtins.ts` — regenerates the built-in materials.

## Privacy

Everything runs in your browser; there is no server, no account and no tracking. Projects stay in your files and in the
browser's storage.

## License

[MIT](LICENSE).

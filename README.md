# SPR Forge

**Live app:** https://periclev.github.io/spr-forge/

SPR Forge is a free simulator for thin films and 1D gratings that runs in the browser. You build a structure, its
computations, analyses and optimizations as nodes connected into a graph, and every result updates when you change a
parameter.

- **Thin films (TMM)**: reflectance, transmittance, absorptance and phases over wavelength, angle and any number of sweeps,
  thick incoherent substrates with coatings on both faces, and the fields and absorption inside the stack.
- **1D gratings (RCWA)**: lamellar, trapezoid, sinusoidal, blazed and pixel profiles, diffraction orders, adaptive spatial
  resolution (ASR), field maps in the x–z plane and a convergence check. Conical incidence (azimuth φ) and any incident
  polarization (Jones ψ, δ) are supported.
- **Anisotropic layers (Berreman 4×4)**: uniaxial and biaxial media with any orientation of their axes, liquid crystals
  with a twisted or tilting director (cholesterics are solved exactly at normal incidence), anisotropic exit media (a
  semi-infinite crystal) and the fields inside the stack. Compute TMM switches to the 4×4 method on its own, works with
  circularly polarized light, and splits R and T into TE / TM and circular (σ±) parts.
- **Analysis**: resonance minima and maxima, FWHM and Q, sensor sensitivity and FOM, fits (Lorentz, Fano, coupled
  oscillators, anticrossing dispersion and Rabi splitting), and Monte Carlo tolerance analysis with yield.
- **Optimization**: Adam (two stages, decaying rate), differential evolution, Nelder-Mead, genetic algorithm, particle
  swarm, simulated annealing, Levenberg-Marquardt and NSGA-II (Pareto fronts), with objectives built from bands, target
  curves, measured data or any expression.
- **SPR sensor design**: a genetic algorithm over layer sequences in the Optimization Engine (after Sebek et al., ACS Omega
  2023). You tick the candidate materials for each role (prisms, plasmonic metals, other metals, dielectrics, 2D materials
  in monolayers) and set its limits, and it builds sensors that maximize the angular sensitivity or S / FWHM.
- **Filter design**: needle optimization, deep search, gradual evolution, a design cleaner and random perturbations, with
  N coating materials, targets with =, ≥, ≤, tolerances, optical density (OD), polarization and angle, and one or both faces
  of a plate. Designs can start from formulas such as `(HL)^8 2H (LH)^8`, and deep search refines its candidates in parallel
  on several cores.
- **Materials**: a built-in library (refractiveindex.info data, including the 2D materials graphene, hBN, MoS₂ and WS₂)
  plus your own materials: constant, tabulated CSV, dispersion formulas, Drude-Lorentz, porous effective media, and doped
  semiconductors with the carrier density as a parameter.

Notes on the canvas can be combined into one document and exported as Markdown or plain text.

Projects are saved as JSON files or kept in the browser under their names, and nothing is uploaded anywhere. A saved file
dropped onto the canvas opens, or joins the current project as a group. The *Help* button explains every node, and each
node also has its own `?`.

## Examples

The *Examples* menu opens complete graphs, each with a note that explains it. They are grouped by subject and can be
searched. They cover surface plasmon resonance (Kretschmann, sensor design, grating coupling, binding kinetics and
sensorgrams, rough gold), Bragg mirrors and microcavities, strong coupling (polaritons, dispersion against angle), a
dual-band absorber, thin-film metrology (fitting a measurement), filter design (long-pass, a notch of 10 nm or less,
three-cavity band-pass, AR on both faces, a castle-contour filter and the OIC 2025 problems), tolerance analysis, a
guided-mode resonance filter and Tamm plasmons. There are also SPR sensors with 2D materials designed by a genetic
algorithm, a dual-mode plasmon–waveguide sensor, a liquid-crystal microcavity tuned by the director tilt, bound states in
the continuum of photonic crystals with anisotropic layers (Pankin et al. 2022, Liu et al. 2023), chiral optical Tamm
states of a cholesteric between anisotropic mirrors as a quasi-BIC (Pyatnov et al. 2018, Timofeev et al. 2017), and
optimization benchmarks from published papers (simulated annealing, gradient inverse design).

## Validation

The physics is checked after every change to the code (`npm run check:tmm`). A few of the checks are below; the full
list, with each reference and the values compared, is in [VALIDATION.md](VALIDATION.md).

| Check | Result |
|---|---|
| TMM vs analytic formulas (Fresnel, Brewster, quarter-wave mirror) | exact |
| Design TMM (with analytic gradients) vs Byrnes' TMM | 8·10⁻¹⁶ |
| RCWA vs RETICOLO V10 (38 cases, 215 diffraction efficiencies; fields at 278 points) | max \|Δη\| 2.8·10⁻¹² (fields 1.4·10⁻¹²) |
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

You need Node.js 22.18 or newer (24 is recommended, since the checks run TypeScript directly).

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

- `src/physics/`: TMM, fields, RCWA (with ASR, conical incidence and thick substrates), Berreman 4×4, materials and complex
  matrices.
- `src/engine/`: the graph evaluator (pure, so the scripts use it too), workers, analyses, fits, optimizers, filter design
  and target specifications.
- `src/nodes/`, `src/plot/`: the node views and the charts.
- `scripts/check-tmm.ts` holds the checks, and `scripts/gen-builtins.ts` regenerates the built-in materials.

## Privacy

Everything runs in your browser. There is no server, no account and no tracking, and your projects stay in your files and
in the browser's storage.

## Data

- **Optical constants**: the built-in materials come from the
  [refractiveindex.info database](https://github.com/polyanskiy/refractiveindex.info-database) (CC0 1.0), by
  M. N. Polyanskiy, Sci. Data 11, 94 (2024). Each material names its source dataset and the original paper (Materials
  panel); please cite those papers when you use the data.
- **OIC 2025 examples**: the target of Problem A and the committee's example designs of Problems A and B are the data
  files of J. D. T. Kruschwitz, M. Trubetskov and J. Keck, Appl. Opt. 65, A12 (2026), published on figshare under CC BY
  4.0 ([Data File 1](https://doi.org/10.6084/m9.figshare.29664845),
  [Data File 2](https://doi.org/10.6084/m9.figshare.29664914),
  [Data File 3](https://doi.org/10.6084/m9.figshare.29664917)); they are used unchanged, converted to the app's format.
- **Materials of the examples** (Drude and Lorentz parameters, constant indices) are taken from the papers each example
  reproduces, cited in the material and in the example's note.

## License

[MIT](LICENSE).

## Third-party software

The app's JavaScript files contain code of open-source packages: React and React Flow (`@xyflow/react`, with parts of d3),
Mantine (`@mantine/core`, `@mantine/hooks`), CodeMirror 6 (`@codemirror/*`, `@lezer/*`) and Lucide icons
(`lucide-react`), among others, under the MIT, ISC, BSD-3-Clause and 0BSD licences. Every build writes the full list,
with each package's version and licence text, to
[`third-party-licenses.txt`](https://periclev.github.io/spr-forge/third-party-licenses.txt) next to the page (also linked
from Help).

Loaded only when a Python script runs: Pyodide (MPL-2.0) with CPython (PSF License), downloaded by the browser from the
jsDelivr CDN (`cdn.jsdelivr.net/pyodide/`) the first time and kept in its cache, and the packages the code imports:
numpy, scipy, pandas, scikit-learn, statsmodels, scikit-image, sympy (BSD-3-Clause), matplotlib (Matplotlib License,
PSF-based), OpenCV (Apache-2.0), micropip (MPL-2.0); lmfit (BSD-3-Clause), seaborn (BSD-3-Clause), pingouin (GPL-3.0),
pybaselines (BSD-3-Clause), emcee (MIT), pint (BSD-3-Clause), tifffile (BSD-3-Clause) and openpyxl (MIT) from PyPI.
They are not part of the app's files, and the code and the data stay in the browser.

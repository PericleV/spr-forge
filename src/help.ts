// Short descriptions of the nodes (the "?" of every node, the tooltips of the Nodes panel and the Help panel).
import type { AppNode } from './types.ts';

export const NODE_HELP: Record<AppNode['type'], string> = {
  material: 'A material from the library (Materials panel): the only way materials enter the graph. Choose its colour for the drawings; sweep its index (sets n / adds Δn), or its model parameter (pore fraction, carrier density) from a Sweep or a Design variable.',
  matsweep: 'Several Material nodes into one material port: the output steps through them (a categorical sweep).',
  aniso: 'An anisotropic material for a Layer, a DBR layer (thickness in nm) or the exit medium (a semi-infinite crystal; the incident medium stays isotropic): uniaxial (n_o, n_e) or biaxial (n₁, n₂, n₃) from Material nodes, with the orientation of its axes — uniaxial: tilt of the optic axis from the layer plane and its azimuth from x; biaxial: Euler angles α, β, γ — each sweepable. Computed by the Berreman 4×4 method (Compute TMM switches to it; Compute RCWA uses its conical solver). In a Layer: a twist and a tilt profile of the director for liquid crystals.',
  layer: 'A homogeneous film: material (port) and thickness in nm (or a number of monolayers for 2D materials). Connect a Sweep or a Design variable to the thickness port. With an anisotropic material: a liquid-crystal director profile — pitch (cholesteric, > 0 right-handed) or twist, tilt at the bottom; a pure helix is solved exactly at normal incidence.',
  grating: '1D grating layer for RCWA: ridge / groove materials, period, depth, fill factor and profile (lamellar, trapezoid, sinus, blazed, pixel map). Goes into Combine like a layer; needs Compute RCWA.',
  combine: 'Builds a stack from layers and stacks (top to bottom), between an incident and an exit medium. “Thick substrate”: an incoherent plate with an optional back coating.',
  reverse: 'Reverses the order of the layers (light from the other side: the sample turned by 180° about y — gratings flip, anisotropic layers and helices turn with it); optionally swaps the incident and exit media.',
  rough: 'Makes the top or bottom interface of the connected layer rough (after Treebupachatsakul et al., Sensors 21, 6164 (2021)): a random profile of a given RMS or peak-to-peak height and correlation length cl (Gaussian autocorrelation) over a periodic cell, its mean plane at the nominal interface. The rough zone is cut into slices: Compute RCWA takes their pixels (the cell is the grating period when the stack has a grating), Compute TMM an effective medium of each slice (Bruggeman, Maxwell-Garnett, Looyenga: only the height distribution counts, not cl). Rough interfaces that overlap (a thin film) are cut together; a film thinner than the sum of the RMS heights of its two interfaces follows its first interface (conformal). Height, cl and seed are sweepable: sweep the seed and average the results (Extract data, mean) for the statistics.',
  dbr: 'Bragg mirror / microcavity generator: a period of N layers (quarter-wave or nm), N periods, cavities; sweep λ₀, periods, cavity thickness and positions.',
  filter: 'Thin-film filter designer: targets (bands with R / T / A / OD, =, ≥, ≤, tolerance, or connected Target curves), N coating materials, one or both faces of a plate. Methods: needle, deep search, gradual evolution, random, refine, design cleaner; start from a formula such as (HL)^8. Output: the designed stack.',
  param: 'Angle of incidence θ or wavelength λ: a constant or a range (the axes of a computation).',
  sweep: 'A list or range of numbers for any sweep port (thickness, index, DBR, grating…), or both polarizations (p and s) for the polarization port of Compute.',
  compute: 'Transfer-matrix computation (TMM) of a stack over λ, θ and the sweeps: R, T, A and the phases; with 3 or more wavelengths also the group delay GD and its dispersion GDD of r and t (fs, fs²; sample λ finely enough that the phase moves less than π per step). Runs automatically, in a worker. With anisotropic layers or a Jones polarization (ψ, δ) it uses the Berreman 4×4 method: the azimuth φ of the plane of incidence then matters, and R, T are split into their TE / TM parts and their circular parts σ± (helicity ±1). Polarization: TM, TE, σ+ / σ− circular or any Jones state.',
  rcwa: 'RCWA computation for stacks with 1D gratings (diffraction orders with their efficiency and, in planar incidence, their phase; convergence check). Polarization TE, TM, σ± circular or a Jones state (ψ, δ). Azimuth φ ≠ 0: conical incidence, TE and TM coupled — the outputs add the TE / TM parts of every order and the circular σ± parts of R and T. Expensive: press Run (Stop to cancel).',
  extremum: 'Minimum or maximum of a curve in an interval, with parabolic refinement (e.g. the SPR dip). The interval can follow another swept axis (a zone through points, dragged on a 2D map).',
  fwhm: 'Width at half maximum (or another level) of peaks / dips in intervals; position, value at the extremum and Q. An interval can follow another swept axis (a zone through points, e.g. a resonance moving with θ; drag its points on a 2D map).',
  sensitivity: 'Sensitivity of a resonance to an index change (S, FOM): the structure is recomputed with Δn on a material or a layer. The interval can follow another swept axis (a zone).',
  fit: 'Fits models to a curve (Lorentz, Fano, coupled oscillators, baseline) or a two-branch dispersion (anticrossing, Rabi splitting); parameters with uncertainties.',
  field: 'Electric / magnetic field and absorption inside the stack at one point (λ, θ), or a profile cut of an RCWA field map; maps vs z and λ / θ. Anisotropic layers (Berreman 4×4) too, with the azimuth and polarization of the computation.',
  tolerance: 'Monte Carlo tolerance analysis: random thickness / index / angle / grating errors; statistics, yield against a specification, most critical errors. The limits follow one axis (“limits along”; automatic: the target curve’s axis, else λ, else θ); with more axes (θ and λ both ranges, sweeps) a sample passes only when all of its curves do.',
  extract: 'Takes quantities out of a result (analysis metrics, a computation…): all its curves, or single values at fixed steps of some axes (e.g. the FWHM and the resonance angle vs the gold thickness), or the mean and standard deviation over an axis (e.g. over the seeds of a rough interface); a table of the values. For Plot, Merge data, Custom data, objectives.',
  merge: 'Several results side by side (Extract data, analyses…), each with its own points, as one data set: a curve per source in Plot, a quantity as x, or three quantities as a map.',
  custom: 'New quantities from formulas of the quantities and axes of its inputs (one port, several connections; each input has a short name, a, b, c… by default), point by point (e.g. a_FOM / b_FWHM · 1000): for Plot, an Objective, or further nodes.',
  rcwafield: 'Field map in the x–z plane of a grating structure (RCWA) at one point; press Run. A window (x and z, or one layer) puts all the points in a part of the structure, for finer detail. A map needs more orders than a spectrum: set its own N (only this point is recomputed); Gibbs smoothing (Lanczos σ) removes the ripples of the truncated Fourier sums (Ex, Ez of TM are derivatives of Hy and ripple most) — the field then is averaged in x over about Λ/(N+1).',
  variable: 'A design variable for the Optimization Engine: a value in [min, max] fed to any sweep port (thickness, index, carrier density…).',
  objective: 'A simple objective: a statistic (mean, min, max, RMS) of one quantity, to minimize, maximize, reach a target or keep ≤ / ≥ a bound.',
  zones: 'Step target over bands: in each zone a quantity (optionally one polarization / angle) is maximized, minimized, targeted or kept ≥ / ≤; band means or worst points.',
  formula: 'Custom objective: an expression of terms taken from connected results (FWHM, sensitivity, fits, spectra at a wavelength, fractions of points above a level…).',
  import: 'Measured (or any tabulated) data from a CSV / text file: x in the first column, values in the next ones; λ in nm / µm / eV or θ.',
  target: 'A target curve with its specification: bands, a model (baseline, Lorentzian, Gaussian, Fano, coupled oscillators) or data; quantity (R, T, A, OD), polarization, angle, =, ≥, ≤ and tolerance per band; a λ grid in nm or in cm⁻¹. For Curve match and the Filter designer.',
  match: 'Compares a simulation with a target (Target curve or Measured data): RMS, mean |e|, max, p-norm or MSE + λ·max e²; in an interval, optionally only where the target is below / above a level (e.g. its resonances). Residuals for Levenberg-Marquardt.',
  optimizer: 'Optimization Engine: varies the Design variables to minimize the sum of the connected objectives. Adam (two stages, decaying rate), differential evolution, Nelder-Mead, GA, PSO, simulated annealing, Levenberg-Marquardt, NSGA-II (Pareto front). The algorithm “layer sequences” (Sebek et al. 2023) builds SPR sensors from the materials you tick for each role (prism, plasmonic metals, other metals, dielectrics, 2D materials) with the limits of each role, and maximizes the angular sensitivity. Runs in workers.',
  plot: 'Curves (families over sweeps), 2D maps or histograms of any data, with the marks of the analyses; limits, colour maps, export SVG / PNG / CSV.',
  compare: 'Several data sources on one chart, each with its own style and label.',
  draw: 'Drawing of a stack (View Stack): proportional / log / equal scale, labels, compressed periods, thick substrate; rough interfaces drawn as a wavy edge.',
  drawgrating: 'Drawing of the grating profiles of a stack (a few periods), with the slices actually computed; pixel editor. Rough interfaces: the pixels of their rough zone (slices × points of the profile) as the RCWA computes them.',
  notes: 'Combines the notes of its slots (Info nodes or other Combine notes, top → bottom) into one document: each title a section. Preview (resize the node by its corner when selected), export as Markdown (.md, the titles as headings) or plain text (.txt), the texts as written.',
  info: 'A free note on the canvas (resize it by its corner when selected). Its output goes to Combine notes, which follows every change of the text.',
  frame: 'A group frame: moves its nodes together; name and colour.',
};

export const GETTING_STARTED: string[] = [
  'Open an example (the gallery of the welcome window, or Examples…, grouped by subject): each one is a complete graph with a note explaining it. The page starts with the welcome window (or, when it is turned off, an empty project); the project open when the page was left is the last session (welcome window, Projects…).',
  'Add nodes from the Nodes panel on the left (drag one onto the canvas, or click it) or by right-clicking the canvas; connect an output (right) to an input of the same colour (left). Square inputs accept several connections.',
  'Materials come only from Material nodes; the Materials panel holds the library, in sections with a search: media and glasses, dielectrics, metals, semiconductors, 2D materials, anisotropic crystals and liquid crystals (n_o and n_e with their dispersion, a pair for the Anisotropic material node), the materials of the articles of the examples, and your own (constant, tabulated CSV, formulas, Drude-Lorentz, porous, doped semiconductor).',
  'Compute TMM calculates by itself; Compute RCWA, the RCWA field map, the Filter designer and the Optimization Engine wait for Run / Start.',
  'Anisotropic layers and liquid crystals: an Anisotropic material node (from two or three Material nodes) into a Layer; Compute TMM then uses the Berreman 4×4 method, with the azimuth φ and circular (σ±) or any Jones polarization.',
  'Notes: Info nodes on the canvas; Combine notes gathers them into one document exported as .md or .txt.',
  'Save a project as a file (Save, Open…) or keep several in this browser (Projects…).',
];

export const SHORTCUTS: [string, string][] = [
  ['Right click on the canvas', 'add a node (with search)'],
  ['Right click on a node / a selection', 'duplicate, disconnect, collapse, group, remove'],
  ['Shift / Ctrl + click', 'select several nodes'],
  ['Delete / Backspace', 'remove the selection'],
  ['Ctrl + Z, Ctrl + Y (Ctrl + Shift + Z)', 'undo, redo'],
  ['Double click on a node title', 'label above the node'],
  ['Ctrl + F (or ⌕ in the canvas controls)', 'find a node by its type, label or name; it is centred and selected'],
  ['▣ in the canvas controls', 'minimap on / off'],
];

// Cross-checks of the physics and the literature benchmarks (npm run check:tmm).
export const VALIDATION: [string, string][] = [
  ['TMM', 'Fresnel, Brewster, quarter-wave mirror = analytic; energy conservation; the design TMM = Byrnes (4·10⁻¹⁶); fields continuous.'],
  ['RCWA', 'RETICOLO V10: 34 cases, 197 diffraction efficiencies, max |Δη| 2.8·10⁻¹²; uniform layers = TMM (10⁻¹⁵).'],
  ['RCWA, conical incidence (φ ≠ 0), anisotropic layers', 'RETICOLO V10 (res1 with delta0): 37 cases, 396 values (efficiencies and their TE / TM parts, incl. anisotropic films and the structure of Liu et al. 2023 on its sharp resonances), max |Δη| 6·10⁻¹²; φ = 0 = planar solver (10⁻¹²); films = TMM at any φ; reciprocity φ ↔ φ + 180° with TE ↔ TM conversion (10⁻¹⁴); plasmon index from grating coupling independent of φ (±3·10⁻⁵).'],
  ['Berreman 4×4', 'Isotropic tensor = TMM; axis along x = TMM with n_e / n_o; λ-plates = Jones calculus; R + T = 1; reciprocity; cholesteric band n_o p … n_e p (0.07 %), solved exactly at normal incidence (slices converge as 1/S²); twisted nematic = Gooch–Tarry; anisotropic exit medium = Fresnel; field profiles = TMM for isotropic layers, flux conserved (10⁻¹⁴).'],
  ['Liquid crystals, BICs', 'Chiral optical Tamm states, Pyatnov et al., Photonics 5, 30 (2018): 636.3 / 664.8, 650.0, 625.8 / 639.0 nm (636 / 665, 650, 625 / 639); quasi-BIC and Kopp–Genack crossover vs coupled-mode theory (Timofeev et al. 2017): full σ− → σ+ conversion, width 2 × its floor, decay within 3 %; anisotropic-defect BIC (Pankin et al. 2022): line gone at (n_e − n_o) L = λ, width ∝ (L − L_BIC)².'],
  ['Tamm plasmons', 'Lu et al., Opt. Express 27, 5383 (2019): dip 0.797 eV (0.796), coupling κ 7.95 (7.97)·10¹² rad/s.'],
  ['Rabi splitting', 'Jena et al., arXiv:2105.01888: hybrid modes 2.415 / 2.539 eV (2.416 / 2.541), Ω 123.6 meV (125).'],
  ['Filter design', 'Notch ≤ 10 nm at 532 nm with OD ≥ 4 met (Zhang et al. 2013 start); 3-cavity band-pass; AR on both faces; derivatives and needle function vs finite differences.'],
  ['Optimization', 'Simulated annealing: thermal emitter of Pan et al., Opt. Express 32, 47154 (2024), A 0.827 at 5.32 µm, Q 179 (0.826, 5.34 µm, 175); gradient design after He et al., Nat. Mater. 20, 1663 (2021).'],
  ['SPR sensors', 'Genetic algorithm of Sebek et al., ACS Omega 8, 20792 (2023): their dual-mode sensor S = 1416 deg/RIU, jump 7.1° (1364, 6.78°); their 633 nm sensor 450 deg/RIU with the library data (578 with theirs); the algorithm reaches 528 (single mode) and finds mode jumps without conditions.'],
];

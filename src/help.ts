// Short descriptions of the nodes (the "?" of every node, the tooltips of the Nodes panel and the Help panel).
import type { AppNode } from './types.ts';

export const NODE_HELP: Record<AppNode['type'], string> = {
  material: 'A material from the library (Materials panel): the only way materials enter the graph. Choose its colour for the drawings; sweep its index (sets n / adds Δn), or its model parameter (pore fraction, carrier density) from a Sweep or a Design variable.',
  matsweep: 'Several Material nodes into one material port: the output steps through them (a categorical sweep).',
  aniso: 'An anisotropic material for a Layer, a DBR layer (thickness in nm) or the exit medium (a semi-infinite crystal; the incident medium stays isotropic): uniaxial (n_o, n_e) or biaxial (n₁, n₂, n₃) from Material nodes, with the orientation of its axes; uniaxial: tilt of the optic axis from the layer plane and its azimuth from x; biaxial: Euler angles α, β, γ; each sweepable. Computed by the Berreman 4×4 method (Compute TMM switches to it; Compute RCWA uses its conical solver). In a Layer: a twist and a tilt profile of the director for liquid crystals.',
  layer: 'A homogeneous film: material (port) and thickness in nm (or a number of monolayers for 2D materials). Connect a Sweep or a Design variable to the thickness port. With an anisotropic material: a liquid-crystal director profile: pitch (cholesteric, > 0 right-handed) or twist, tilt at the bottom; a pure helix is solved exactly at normal incidence.',
  grating: '1D grating layer for RCWA: ridge / groove materials, period, depth, fill factor and profile (lamellar, trapezoid, sinus, blazed, pixel map). Trapezoid, sinus and blazed profiles are cut into Nz staircase slices or, with Compute RCWA “profiles: smooth (FFF)”, computed through their true profile. Goes into Combine like a layer; needs Compute RCWA.',
  combine: 'Builds a stack from layers and stacks (top to bottom), between an incident and an exit medium. “Thick substrate”: an incoherent plate with an optional back coating.',
  reverse: 'Reverses the order of the layers (light from the other side: the sample turned by 180° about y; gratings flip, anisotropic layers and helices turn with it); optionally swaps the incident and exit media.',
  rough: 'Makes the top or bottom interface of the connected layer rough (after Treebupachatsakul et al., Sensors 21, 6164 (2021)): a random profile of a given RMS or peak-to-peak height and correlation length cl (Gaussian autocorrelation) over a periodic cell, its mean plane at the nominal interface. The rough zone is cut into slices: Compute RCWA takes their pixels (the cell is the grating period when the stack has a grating), Compute TMM an effective medium of each slice: by default a Bruggeman medium shaped by the features (σ high, cl wide; ridges of a 1D profile or bumps of a 2D surface), which lies between the two Wiener bounds (horizontal laminae: a very gentle surface; vertical walls: columnar roughness) and follows RCWA of the smooth profile (rough gold: the SPR dip within ~0.1°, the dip too shallow; a rough TiO₂ film within 2·10⁻³ in R); also isotropic Bruggeman, Maxwell-Garnett, Looyenga, linear in n, or either Wiener bound (the tensor media through Berreman). For TMM the zone is the profile of the seed, or its statistics: “ensemble” (Gaussian heights, no seed: the limit of a large illuminated area, smooth for optimizers) or a linear ramp. Both faces of a layer: two Roughness nodes in a row (top and bottom). Rough interfaces that overlap (a thin film) are cut together; a film thinner than the sum of the RMS heights of its two interfaces follows its first interface (conformal), or set how much an interface follows the one before it (0 … 1). Height, cl and seed are sweepable: sweep the seed and average the results (Extract data, mean) for the statistics of RCWA. On metals the isotropic media overstate gentle roughness (height below cl) many times.',
  dbr: 'Bragg mirror / microcavity generator: a period of N layers (quarter-wave or nm), N periods, cavities; sweep λ₀, periods, cavity thickness and positions.',
  filter: 'Thin-film filter designer: targets (bands with R / T / A / OD, =, ≥, ≤, tolerance, at every λ or as a band mean / photopic mean such as Rv, or connected Target curves), an optional cone of light, locked / tied layers and per-material thickness limits, the layer sensitivity, N coating materials, one or both faces of a plate. Methods: needle, deep search, gradual evolution, random, refine, design cleaner; start from a formula such as (HL)^8. Output: the designed stack.',
  param: 'Angle of incidence θ or wavelength λ: a constant or a range (the axes of a computation).',
  sweep: 'A list or range of numbers for any sweep port (thickness, index, DBR, grating…), or both polarizations (p and s) for the polarization port of Compute.',
  compute: 'Transfer-matrix computation (TMM) of a stack over λ, θ and the sweeps (optionally averaged over a cone of light): R, T, A, the phases and the complex amplitude coefficients r and t (Re, Im; exp(−iωt), arg r = φr, |r|² = R; TM: r of the tangential H (r_p = −r_s at normal incidence) and t of E); with 3 or more wavelengths also the group delay GD and its dispersion GDD of r and t (fs, fs²; sample λ finely enough that the phase moves less than π per step). Runs automatically, in a worker. With anisotropic layers or a Jones polarization (ψ, δ) it uses the Berreman 4×4 method: the azimuth φ of the plane of incidence then matters, and R, T are split into their TE / TM parts and their circular parts σ± (helicity ±1). Polarization: TM, TE, σ+ / σ− circular or any Jones state.',
  rcwa: 'RCWA computation for stacks with 1D gratings (diffraction orders with their efficiency and, in planar incidence, their phase; r and t of the zeroth orders as in Compute TMM; convergence check; a Sweep on the orders port computes every step at its own N: an axis “orders N” for convergence figures). Polarization TE, TM, σ± circular or a Jones state (ψ, δ). Azimuth φ ≠ 0: conical incidence, TE and TM coupled; the outputs add the TE / TM parts of every order and the circular σ± parts of R and T. Profiles: trapezoid, sinus and blazed gratings as staircase slices (as RETICOLO), or smooth; the differential method with fast Fourier factorization (normal-vector field of the true profile, Popov & Nevière, JOSA A 17, 1773 (2000)): for metals in TM it converges with far fewer orders (planar incidence for now). Expensive: press Run (Stop to cancel).',
  extremum: 'Minimum or maximum of a curve in an interval (e.g. the SPR dip): refined by a 3-point parabola, or for noisy curves a polynomial fit or the centroid of the dip. The interval can follow another swept axis (a zone through points, dragged on a 2D map).',
  fwhm: 'Width at half maximum (or another level) of peaks / dips in intervals; position (3-point parabola, polynomial fit or centroid), value at the extremum and Q. An interval can follow another swept axis (a zone through points, e.g. a resonance moving with θ; drag its points on a 2D map).',
  sensitivity: 'Sensitivity of a resonance to an index change (S, FOM): the structure is recomputed with Δn on a material or a layer; the dip found by a 3-point parabola, a polynomial fit or the centroid (noisy curves). The interval can follow another swept axis (a zone).',
  fit: 'Fits models to a curve (Lorentz, Fano, coupled oscillators, baseline) or a two-branch dispersion (anticrossing, Rabi splitting); parameters with uncertainties; the components on a plot of their own.',
  field: 'Electric / magnetic field and absorption inside the stack at one point (λ, θ), or a profile cut of an RCWA field map; maps vs z and λ / θ. Anisotropic layers (Berreman 4×4) too, with the azimuth and polarization of the computation.',
  tolerance: 'Monte Carlo tolerance analysis: thickness / index / grating errors (per layer and material, or global) and the instrument (angle error, beam angular spread, source bandwidth, detector noise: thermal, shot, source, averaging, ADC) with a preview of the measured signal; statistics, yield against a specification, most critical errors. The limits follow one axis (“limits along”; automatic: the target curve’s axis, else λ, else θ); with more axes (θ and λ both ranges, sweeps) a sample passes only when all of its curves do. Robust design: the robust output (yield, smooth yield, the deviation and every criterion’s mean, σ, percentiles and pass rate) goes into an Objective, and the Optimization Engine then computes all the samples for every candidate, with the same errors (same seed). The yield moves in steps of 1/N (methods without gradients); the smooth yield is continuous (any method).',
  extract: 'Takes quantities out of a result (analysis metrics, a computation…): all its curves, or single values at fixed steps of some axes (e.g. the FWHM and the resonance angle vs the gold thickness), the values at any value of an axis (interpolated between its two neighbouring steps, e.g. R at θ = 10.5°), or the mean and standard deviation over an axis (e.g. over the seeds of a rough interface); a table of the values. For Plot, Custom data, objectives.',
  merge: 'Several results side by side (Extract data, analyses…), each with its own points, as one data set: a curve per source in Plot, a quantity as x, or three quantities as a map.',
  custom: 'New quantities from formulas of the quantities and axes of its inputs (one port, several connections; each input has a short name, a, b, c… by default), point by point (e.g. a_FOM / b_FWHM · 1000): for Plot, an Objective, or further nodes. The formulas are complex: r and t of a computation are complex variables (a_r, a_t), i is the imaginary unit, real(), imag(), abs(), arg(), conj(), exp, log, sqrt, sin, cos, tan, cot, asin, acos, atan, sinh, cosh, tanh work on complex numbers (angles in radians; deg() and rad() convert, e.g. sin(rad(a_theta)); atan2(y, x) and step(x): 1 for x ≥ 0, else 0; its mean over an axis in Extract data is the fraction of points: for real values) (e.g. real(a_r), abs(a_t)^2, arg(a_r · conj(b_r))). A formula with a complex result gives its real and imaginary parts, which another Custom data reads again as one complex quantity. Material nodes connect here too: their n, k, the complex index nc = n + ik and ε = nc² at the λ of every point (a_n, a_k, a_nc, a_eps; a Material sweep follows its axis in the data); without data, a λ Parameter gives the wavelengths.',
  rcwafield: 'Field map in the x–z plane of a grating structure (RCWA) at one point; press Run. A window (x and z, or one layer) puts all the points in a part of the structure, for finer detail. A map needs more orders than a spectrum: set its own N (only this point is recomputed); Gibbs smoothing (Lanczos σ) removes the ripples of the truncated Fourier sums (Ex, Ez of TM are derivatives of Hy and ripple most); the field then is averaged in x over about Λ/(N+1).',
  kinetics: 'Binding kinetics at the sensor surface: 1:1 Langmuir, mass transport (kt), bivalent analyte, heterogeneous ligand, two-state (conformational change) or polymer swelling, along a protocol of steps (baseline, injections at a concentration, dissociation, regeneration) that you build. The response in RU (1000 RU ≈ 1 ng/mm² of protein). The analyte (IgG, BSA, myoglobin, DNA… or your own values: MW, dn/dc, density, dimensions) lies or stands on the surface: its height and footprint. Surface: the 1:1 models bind to ligand sites (Rmax typed) or to a free surface (random sequential adsorption: the molecules cannot overlap, Rmax = the jamming capacity of a random monolayer); the ionic strength and the ζ potential of the analyte set the repulsion between bound molecules (an effective, larger diameter). A Sweep varies one constant (e.g. the concentration: a series of injections; or the ionic strength). Steady state: the response at the end of every injection vs its concentration, a Langmuir isotherm fitted (KD, Rmax), and how close each injection came to its equilibrium (second output). Feed it into Sensorgram.',
  sensorgram: 'The SPR signal of a binding experiment: the structure of a Compute TMM (isotropic) recomputed at every time of the Binding kinetics, with a binding layer on the sensing medium: a monolayer as high as the molecule while it fits (the bound mass fills it), thicker beyond (multilayer), or compact (d = Γ/ρ); its index by de Feijter or an effective medium; the bulk index of the flowing solution and a baseline drift; or a target layer that takes up the analyte or swells. Read out: the dip position (refined exactly between the grid points, or by a polynomial fit / centroid on noisy curves) or R at a point, vs time; the instrument (angular spread, bandwidth, detector noise) as in Tolerance, the seed of the noise sweepable (one noisy run per seed). Outputs: R(t, θ or λ) as measured (and R exact), and the sensorgram with the layer (height, index, volume fraction), the bound mass, the coverage of the surface, molecules per µm² and their spacing. The node also gives the calibration (the read-out per ng/mm² and per RIU) and, with detector noise and an analyte-free first step, the detection limit (3σ) in RIU, ng/mm², RU and nM. Draw the outputs with Plot or Compare.',
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
  info: 'A free note on the canvas (resize it by its corner when selected).',
  python: 'Python in the browser (numpy, scipy, pandas, matplotlib, scikit-learn, lmfit …): the inputs A, B, … are variables (a computation’s data as a Data with N-D arrays over its axes, a material as a Material, a number, a sweep); the variables the code makes are its outputs (numbers and arrays as data, Data for Plot / Extract / an Objective, Material for a Layer). Figures appear in the node. Help ▸ Python script has the details and examples.',
  reroute: 'A point on a connection, to route long connections around other nodes: double-click a connection to add one, then drag the dot. It passes on what reaches it and takes the colour of that type; several in a row are fine.',
  frame: 'A group frame: moves its nodes together; name and colour.',
};

export const GETTING_STARTED: string[] = [
  'Open an example (the gallery of the welcome window, or Examples, grouped by subject): each one is a complete graph with a note explaining it. The page starts with the welcome window (or, when it is turned off, an empty project); the project open when the page was left is the last session (welcome window, Projects).',
  'Add nodes from the Nodes panel on the left (drag one onto the canvas, or click it) or by right-clicking the canvas; connect an output (right) to an input of the same colour (left). Square inputs accept several connections.',
  'Materials come only from Material nodes; the Materials panel holds the library, in sections with a search: media and glasses, dielectrics, metals, semiconductors, 2D materials, anisotropic crystals and liquid crystals (n_o and n_e with their dispersion, a pair for the Anisotropic material node), the materials of the articles of the examples, and your own (constant, tabulated CSV, formulas, Drude-Lorentz, porous, doped semiconductor).',
  'Compute TMM calculates by itself; Compute RCWA, the RCWA field map, the Filter designer and the Optimization Engine wait for Run / Start.',
  'Anisotropic layers and liquid crystals: an Anisotropic material node (from two or three Material nodes) into a Layer; Compute TMM then uses the Berreman 4×4 method, with the azimuth φ and circular (σ±) or any Jones polarization.',
  'Notes: Info nodes on the canvas; Combine notes gathers them into one document exported as .md or .txt.',
  'Save a project as a file (Save, Open) or keep several in this browser (Projects).',
];

// Words of SPR and binding experiments, for readers without the theory.
export const GLOSSARY: [string, string][] = [
  ['Surface plasmon (SPR)', 'A wave of the free electrons of a metal (gold, silver) bound to its surface, with a field that reaches ~100–200 nm into the medium next to it. Light excites it only at one angle (or wavelength), where the reflection drops.'],
  ['Kretschmann configuration', 'The usual SPR set-up: a glass prism, a thin metal film (~50 nm gold) on it, the sample (buffer) on the other side; the light comes through the prism.'],
  ['Dip', 'The minimum of the reflectance R vs angle (or wavelength): the plasmon resonance. Its position is the read-out of an SPR sensor.'],
  ['TM / TE (p / s) polarization', 'The electric field in the plane of incidence (TM, p) or perpendicular to it (TE, s). Only TM light excites a surface plasmon.'],
  ['Evanescent field, decay length', 'The field of the plasmon decays away from the metal (roughly e⁻¹ in 100–200 nm in water): only what is close to the surface is seen.'],
  ['RIU, bulk sensitivity', 'Refractive index unit. Bulk sensitivity: how far the dip moves when the index of the whole buffer changes by 1 (° per RIU or nm per RIU).'],
  ['RU (response unit)', 'The Biacore unit of a sensorgram: 1000 RU ≈ 1 ng of protein per mm² of surface.'],
  ['Sensorgram', 'The read-out (the dip position, or R at a fixed angle) vs time during an experiment.'],
  ['Association, dissociation, regeneration', 'The analyte flows over the surface and binds (association); buffer flows and the complex falls apart (dissociation); a harsh solution strips the bound analyte (regeneration).'],
  ['ka, kd, KD', 'The association rate (M⁻¹s⁻¹), the dissociation rate (s⁻¹) and their ratio KD = kd/ka (M): the concentration at which half of the sites are taken at equilibrium. Smaller KD = stronger binding.'],
  ['Rmax', 'The response when every site (or the whole surface) is taken.'],
  ['Steady state, equilibrium', 'When binding and unbinding balance and the response stops changing; from the equilibrium responses at several concentrations one gets KD (Langmuir isotherm).'],
  ['Mass transport (kt)', 'When binding is fast, the molecules are used up near the surface faster than the flow brings them: the rate is limited by their transport.'],
  ['Bulk effect, drift', 'The injected solution has a slightly higher index than the buffer: a step in the signal that is not binding. Drift: a slow change of the baseline (e.g. temperature).'],
  ['dn/dc, de Feijter', 'How much a dissolved molecule raises the index per concentration (~0.19 mL/g for proteins). de Feijter: the bound mass from the index and thickness of the layer, Γ = d (n − n_buffer) / (dn/dc).'],
  ['Effective medium (Bruggeman, Maxwell-Garnett)', 'The index of a mixture (molecules and water in a layer, a porous film) from those of its parts and their fractions.'],
  ['Random sequential adsorption, jamming', 'Molecules land at random places and cannot overlap: the surface fills up before it is covered (about 55 % of the area for discs, the jamming limit).'],
  ['Debye length, ζ potential', 'The thickness of the cloud of ions around a charged molecule (0.8 nm in physiological buffer, 3 nm at 10 mM salt), and the charge of the molecule as a potential. Charged molecules keep a distance: fewer fit on the surface at low salt.'],
  ['Detection limit (3σ)', 'The smallest signal that stands out of the noise: three times the standard deviation of the baseline, given in RIU, ng/mm², RU or concentration.'],
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
  ['A connection let go on the empty canvas', 'a menu of the nodes that fit it: the one chosen is added there and connected'],
  ['A node (connected to nothing) dropped on a connection', 'it goes into it: source → node → target (the connection glows while it fits)'],
  ['Double click on a connection', 'a Reroute point on it, to route the connection around other nodes'],
  ['Hover over a button, a port, a field', 'its hint (a moment later)'],
];

// The Python script, in detail (Help ▸ Python script): what goes in, what comes out, the code, safety.
export const PYTHON_HELP: [string, string, string?][] = [
  [
    'What it is',
    'Python 3.14 running in this browser (Pyodide): numpy, scipy, pandas, matplotlib, statsmodels, scikit-learn, scikit-image, OpenCV (cv2) and sympy, plus lmfit, seaborn, pingouin, pybaselines, emcee, pint, tifffile and openpyxl installed from PyPI when first imported. Nothing is installed on the computer and the data do not leave it. The first run downloads Python (about 10 MB) and each library the code imports; the browser keeps them for the next time.',
  ],
  [
    'Running',
    'Run (or Ctrl+Enter in the editor) runs the code once; Stop ends a run that does not finish. With Auto run ticked (Options and examples) the code runs again at every change of the code or of its inputs. The outputs of the last run stay while a new run is under way, so the nodes after it keep their data. The ⤢ button opens a larger editor.',
  ],
  [
    'The inputs: A, B, C, …',
    'Connect anything to the ports on the left; each is a variable named by its letter (or the name given in Options and examples). The data of a computation (Compute TMM, RCWA, an analysis, Extract data, Custom data) is a Data; a Material node is a Material; a Design variable or a Sweep a number or an array; a Parameter θ / λ its values.',
  ],
  [
    'Data',
    'A.R, A.T, A["phiR"]: a quantity as an N-D numpy array, one dimension per axis, in the order of A.dims (the last axis varies fastest). A.axes["theta"]: the values of an axis. A.units and A.labels: the unit and the name of each axis and quantity. A.df: a long pandas table, one column per axis and per quantity, one row per point (for groupby, seaborn, statistics). A constant λ or θ is an axis of length 1: np.squeeze(A.R) drops it.',
    'theta = A.axes["theta"]\nR = np.squeeze(A.R)\nprint(A)            # Data: R, T, A over lambda (1), theta (161)',
  ],
  [
    'Material',
    'A.lam, A.n, A.k: the material tabulated over its range (λ in nm); A.nk(lam) its complex index at any wavelength, A.eps(lam) its permittivity.',
    'eps = A.eps(633)\nprint(A.name, A.nk(633))',
  ],
  [
    'The outputs',
    'Every variable the code makes becomes a port on the right (untick the ones you do not want in Options and examples): a number (one-point data, for an Objective, Extract data or a Plot), a real 1D array (data over its index), a Data (for Plot, Compare plot, Extract data, an analysis or an Objective), a pandas table (its first column the axis, the other numeric columns the quantities) and a Material (for a Layer, a Combine stack medium, a DBR or a filter). Functions, modules, figures and complex arrays are not given out.',
  ],
  [
    'Making data for a Plot',
    'Data({"lambda": lam}, R=R, T=T) makes data over one axis; Data({"theta": th, "lambda": lam}, R=R2) over two (R2 shaped (len(th), len(lam)), or flat in that order). units={"lambda": "nm"} gives the units.',
    'lam = np.linspace(500, 900, 401)\nfit = Data({"lambda": lam}, units={"lambda": "nm"}, R=R, R_fit=model(lam, *p))',
  ],
  [
    'Making a material for a Layer',
    'Material(lam, n, k, name="...") or Material(lam, n_complex): a table of the complex index over λ in nm (any order; outside it the index stays at the values of its ends). Connect its port to the material port of a Layer like a Material node: a dispersion model of your own (Drude, Lorentz, Tauc–Lorentz, Cauchy), a mixture of two Material nodes, or measured data written in the code.',
    'lam = np.linspace(400, 1600, 1201)\nE = 1239.84 / lam\neps = 9.8 - 9.0**2 / (E**2 + 1j * 0.067 * E)\nmetal = Material(lam, np.sqrt(eps), name="Drude metal")',
  ],
  [
    'Printed text, tables, figures, files',
    'What the code prints appears under the editor; the last line, when it is an expression, is shown as Jupyter does (a pandas table as a table). Every matplotlib figure is drawn in the node. Files the code saves (fig.savefig("map.png", dpi=300), df.to_csv("table.csv")) appear as Download buttons.',
  ],
  [
    'Errors',
    'An error is shown with its line, which is marked in the editor. Tabs and spaces mixed in the indentation are reported: select all, Shift+Tab, then Tab.',
  ],
  [
    'Safety',
    'Python in this page can read the projects kept in this browser. Code that came with a project from a file, a link or another session does not run until you press Allow and run (or Run) on one of its scripts; code you write here, examples and code allowed before run directly.',
  ],
  [
    'Limits',
    'The Optimization Engine refuses an objective that depends on a Python script: its workers evaluate thousands of candidates without the page, where Python does not run; use Custom data or a Custom objective there. Python runs one script at a time; a long computation blocks only the scripts, not the rest of the app.',
  ],
];

// Cross-checks of the physics and the literature benchmarks (npm run check:tmm).
export const VALIDATION: [string, string][] = [
  ['TMM', 'Fresnel, Brewster, quarter-wave mirror = analytic; energy conservation; the design TMM = Byrnes (8·10⁻¹⁶); fields continuous.'],
  ['RCWA', 'RETICOLO V10: 38 cases, 215 diffraction efficiencies, max |Δη| 2.8·10⁻¹²; fields at 278 points, 1.4·10⁻¹²; uniform layers = TMM (10⁻¹⁵).'],
  ['RCWA, conical incidence (φ ≠ 0), anisotropic layers', 'RETICOLO V10 (res1 with delta0): 37 cases, 396 values (efficiencies and their TE / TM parts, incl. anisotropic films and the structure of Liu et al. 2023 on its sharp resonances), max |Δη| 6·10⁻¹²; φ = 0 = planar solver (10⁻¹²); films = TMM at any φ; reciprocity φ ↔ φ + 180° with TE ↔ TM conversion (10⁻¹⁴); plasmon index from grating coupling independent of φ (±3·10⁻⁵).'],
  ['Berreman 4×4', 'Isotropic tensor = TMM; axis along x = TMM with n_e / n_o; λ-plates = Jones calculus; R + T = 1; reciprocity; cholesteric band n_o p … n_e p (0.07 %), solved exactly at normal incidence (slices converge as 1/S²); twisted nematic = Gooch–Tarry; anisotropic exit medium = Fresnel; field profiles = TMM for isotropic layers, flux conserved (10⁻¹⁴).'],
  ['Liquid crystals, BICs', 'Chiral optical Tamm states, Pyatnov et al., Photonics 5, 30 (2018): 636.3 / 664.8, 650.0, 625.8 / 639.0 nm (636 / 665, 650, 625 / 639); quasi-BIC and Kopp–Genack crossover vs coupled-mode theory (Timofeev et al. 2017): full σ− → σ+ conversion, width 2 × its floor, decay within 3 %; anisotropic-defect BIC (Pankin et al. 2022): line gone at (n_e − n_o) L = λ, width ∝ (L − L_BIC)².'],
  ['Tamm plasmons', 'Lu et al., Opt. Express 27, 5383 (2019): dip 0.797 eV (0.796), coupling κ 7.95 (7.97)·10¹² rad/s.'],
  ['Rabi splitting', 'Jena et al., arXiv:2105.01888: hybrid modes 2.415 / 2.539 eV (2.416 / 2.541), Ω 123.6 meV (125).'],
  ['Filter design', 'Notch ≤ 10 nm at 532 nm with OD ≥ 4 met (Zhang et al. 2013 start); 3-cavity band-pass; AR on both faces; derivatives and needle function vs finite differences.'],
  ['Optimization', 'Simulated annealing: thermal emitter of Pan et al., Opt. Express 32, 47154 (2024), A 0.827 at 5.32 µm, Q 179 (0.826, 5.34 µm, 175); gradient design after He et al., Nat. Mater. 20, 1663 (2021).'],
  ['Sensorgrams', 'Bound layer vs Jung et al., Langmuir 14, 5636 (1998): decay length 377.5 nm (368), 107.1 °/RIU (107); Biacore 760 nm: 0.13° per ng/mm² (0.1° calibration); de Feijter exact. Random adsorption: myoglobin on silica (Wasilewska et al. 2021) 0.595 / 1.31 mg/m² at 10 / 150 mM NaCl (0.60 ± 0.1 / 1.3 ± 0.1), albumin 1.37 (1.3–1.4); steady state gives back KD; kinetics vs analytic solutions.'],
  ['SPR sensors', 'Genetic algorithm of Sebek et al., ACS Omega 8, 20792 (2023): their dual-mode sensor S = 1416 deg/RIU, jump 7.1° (1364, 6.78°); their 633 nm sensor 450 deg/RIU with the library data (578 with theirs); the algorithm reaches 528 (single mode) and finds mode jumps without conditions.'],
];

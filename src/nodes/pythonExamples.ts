// Starts for a Python script (Options and examples ▸ Examples): each one replaces the code.
export const PY_EXAMPLES: [string, string][] = [
  [
    'The dip of an SPR curve: a Lorentzian fit (scipy)',
    `from scipy.optimize import curve_fit

# A: the data of a Compute TMM, R over θ (one curve)
theta = A.axes["theta"]
R = np.squeeze(A.R)

def dip(t, t0, w, depth, base):
    return base - depth / (1 + ((t - t0) / (w / 2)) ** 2)

i = np.argmin(R)
p, cov = curve_fit(dip, theta, R, p0=[theta[i], 1.0, R.max() - R[i], R.max()])
theta0, fwhm = p[0], abs(p[1])
print(f"dip at {theta0:.4f}°, FWHM {fwhm:.3f}°")
# the data and the fit, for a Plot
fit = Data({"theta": theta}, units={"theta": "°"}, R=R, R_fit=dip(theta, *p))
`,
  ],
  [
    'A material from a model: a Drude metal (a Material for a Layer)',
    `# ε(E) = ε∞ − ωp² / (E² + iγE), E in eV; the index ñ = √ε
lam = np.linspace(400, 1600, 1201)      # nm
E = 1239.84 / lam                        # eV
eps_inf, wp, gamma = 9.8, 9.0, 0.067
eps = eps_inf - wp**2 / (E**2 + 1j * gamma * E)
metal = Material(lam, np.sqrt(eps), name="Drude metal")
metal
`,
  ],
  [
    'A material from a formula: a Cauchy dielectric',
    `# n(λ) = a + b/λ² + c/λ⁴ (λ in µm), no absorption
lam = np.linspace(400, 1000, 601)       # nm
um = lam / 1000
a, b, c = 1.45, 0.0036, 0.0
glass = Material(lam, a + b / um**2 + c / um**4, name="Cauchy glass")
glass
`,
  ],
  [
    'A mixture of two materials: Bruggeman (A and B, Material nodes)',
    `# A, B: two Material nodes; a fraction f of B in A (spherical inclusions)
f = 0.3
lam = A.lam[(A.lam >= B.lam.min()) & (A.lam <= B.lam.max())]
e1, e2 = A.eps(lam), B.eps(lam)
# f (e2 − e)/(e2 + 2e) + (1 − f)(e1 − e)/(e1 + 2e) = 0: a quadratic in e
bb = (3 * f - 1) * e2 + (2 - 3 * f) * e1
root = np.sqrt(bb**2 + 8 * e1 * e2)
r1, r2 = (bb + root) / 4, (bb - root) / 4
# the physical root: the larger imaginary part (no loss: the positive one)
take1 = (r1.imag > r2.imag + 1e-12) | ((abs(r1.imag - r2.imag) <= 1e-12) & (r1.real >= r2.real))
e = np.where(take1, r1, r2)
mix = Material(lam, np.sqrt(e), name=f"{A.name} + {round(f * 100)} % {B.name}")
mix
`,
  ],
  [
    'A map with matplotlib: R over two axes (saved as PNG)',
    `import matplotlib.pyplot as plt

# A: data over two axes, e.g. R(λ, θ) of a Compute TMM with λ and θ both swept
y, x = A.dims            # the last axis varies fastest
fig, ax = plt.subplots(figsize=(4.5, 3.2))
m = ax.pcolormesh(A.axes[x], A.axes[y], A.R, shading="auto", cmap="viridis")
fig.colorbar(m, ax=ax, label="R")
ax.set_xlabel(f"{A.labels.get(x, x)} ({A.units.get(x, '')})")
ax.set_ylabel(f"{A.labels.get(y, y)} ({A.units.get(y, '')})")
fig.tight_layout()
fig.savefig("map.png", dpi=300)
`,
  ],
  [
    'A table with pandas: the minimum of R for every value of an axis',
    `# A: data over two or more axes; A.df is a long table (a column per axis and quantity)
df = A.df
first = A.dims[0]
best = df.loc[df.groupby(first)["R"].idxmin()]
best
`,
  ],
  [
    'A number for an Objective: the sensitivity from two curves',
    `# A, B: R(θ) of the same sensor at two analyte indices (two Compute TMM)
n1, n2 = 1.330, 1.335

def dip_angle(d):
    th, R = d.axes["theta"], np.squeeze(d.R)
    i = int(np.clip(np.argmin(R), 1, len(R) - 2))
    # a parabola through the lowest point and its two neighbours
    p2, p1, _p0 = np.polyfit(th[i - 1:i + 2], R[i - 1:i + 2], 2)
    return -p1 / (2 * p2)

S = (dip_angle(B) - dip_angle(A)) / (n2 - n1)   # °/RIU
print(f"S = {S:.1f} °/RIU")
`,
  ],
];

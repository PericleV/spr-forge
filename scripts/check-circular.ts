// Checks of circular light, exact cholesterics, the Berreman field profile, Reverse stack with anisotropic layers and the
// chiral optical Tamm states (run by check-tmm.ts).
import { c } from '../src/physics/complex.ts';
import { conicalSMatrix, rcwaConical } from '../src/physics/rcwaConical.ts';
import { rotateZ, uniaxial } from '../src/physics/berreman.ts';
import { berremanProfile } from '../src/physics/berremanField.ts';
import { fieldProfile, layerOfZ, profileGrid } from '../src/physics/field.ts';
import type { RcwaLayer } from '../src/physics/rcwa.ts';
import { makeLibrary } from '../src/physics/library.ts';
import { evaluateHeadless } from '../src/engine/headless.ts';
import { rcwaLayersAt } from '../src/engine/runRcwa.ts';
import { COTS2018, cotsExample, materialData, REVERSE_DEFAULTS } from '../src/examples.ts';
import type { AppNode } from '../src/types.ts';

// Circular (helicity) parts of R and T: they add up to R, T; an isotropic mirror flips the helicity at normal incidence and
// keeps it in transmission; at the Brewster angle the reflected wave is TE (linear: half and half); a right-handed helix
// (positive twist) Bragg-reflects σ− and keeps its helicity; a polarization-preserving anisotropic mirror (layers with
// orthogonal axes) keeps it too; a half-wave plate turns σ+ into σ− in transmission, a quarter-wave plate into a linear state
{
  const sp = { psi: 45, delta: 90 };
  const sm = { psi: 45, delta: -90 };
  const run = (L: RcwaLayer[], lam: number, th: number, inc: { psi: number; delta: number } | 's' | 'p', phi = 0) => rcwaConical(L, 1000, lam, th, phi, inc, 0);
  let eSum = 0;
  const film: RcwaLayer[] = [{ n: c(1), d: 0 }, { n: c(2.1, 0.03), d: 140 }, { n: c(0.2, 3.4), d: 25 }, { n: c(1.5), d: 0 }];
  for (const [th, phi] of [
    [0, 0],
    [35, 20],
    [70, -40],
  ])
    for (const inc of [sp, sm, 's', 'p', { psi: 20, delta: 55 }] as const) {
      const r = run(film, 600, th, inc, phi);
      eSum = Math.max(eSum, Math.abs(r.RCP[0] + r.RCM[0] - r.R[0]), Math.abs(r.TCP[0] + r.TCM[0] - r.T[0]));
    }
  const iso = run(film, 600, 0, sp);
  const eIso = Math.max(iso.RCP[0], iso.TCM[0], Math.abs(iso.RCM[0] - iso.R[0]), Math.abs(iso.TCP[0] - iso.T[0]));
  const brew = run([{ n: c(1), d: 0 }, { n: c(1.5), d: 0 }], 600, (Math.atan(1.5) * 180) / Math.PI, sp);
  const eBrew = Math.abs(brew.RCP[0] - brew.RCM[0]);
  const no = c(1.54);
  const ne = c(1.71);
  const nm = c(1.625);
  const helix: RcwaLayer[] = [{ n: nm, d: 0 }, { eps: uniaxial(no, ne, 0, 0), d: 8000, helix: { twist: 7200, slices: 1600 } }, { n: nm, d: 0 }];
  const [hm, hp] = [run(helix, 650, 0, sm), run(helix, 650, 0, sp)];
  const ppam: RcwaLayer[] = [{ n: nm, d: 0 }, ...Array.from({ length: 40 }, (_, i) => ({ eps: uniaxial(no, ne, 0, (i % 2) * 90), d: 100 })), { n: nm, d: 0 }];
  const pp = run(ppam, 650, 0, sp);
  const plate = (frac: number): RcwaLayer[] => [{ n: c(1.6), d: 0 }, { eps: uniaxial(c(1.55), c(1.65), 0, 30), d: (frac * 600) / 0.1 }, { n: c(1.6), d: 0 }];
  const [hw, qw] = [run(plate(0.5), 600, 0, sp), run(plate(0.25), 600, 0, sp)];
  const ok =
    eSum < 1e-14 &&
    eIso < 1e-14 &&
    eBrew < 1e-14 &&
    hm.R[0] > 0.99 &&
    hm.RCM[0] / hm.R[0] > 0.999 &&
    hp.R[0] < 0.01 &&
    pp.R[0] > 0.9 &&
    pp.RCP[0] / pp.R[0] > 0.99 &&
    hw.TCM[0] / hw.T[0] > 0.999 &&
    Math.abs(qw.TCP[0] / qw.T[0] - 0.5) < 2e-3;
  if (!ok)
    throw new Error(
      `circular parts: sums ${eSum}, isotropic ${eIso}, Brewster ${eBrew}, helix σ− R ${hm.R[0]} (σ− part ${hm.RCM[0] / hm.R[0]}), σ+ R ${hp.R[0]}, PPAM R ${pp.R[0]} (σ+ part ${pp.RCP[0] / pp.R[0]}), λ/2 ${hw.TCM[0] / hw.T[0]}, λ/4 ${qw.TCP[0] / qw.T[0]}`,
    );
  console.log(
    `circular parts (helicity σ±): R_σ+ + R_σ− = R, T likewise (${eSum.toExponential(1)}); isotropic stack at normal incidence: reflection flips, transmission keeps σ+ (${eIso.toExponential(1)}); Brewster: reflected TE = half and half (${eBrew.toExponential(1)}); ` +
      `right-handed helix (twist > 0): reflects σ− (R ${hm.R[0].toFixed(4)}, ${((100 * hm.RCM[0]) / hm.R[0]).toFixed(2)} % σ−), passes σ+ (R ${hp.R[0].toExponential(1)}); PPAM keeps σ+ (R ${pp.R[0].toFixed(4)}, ${((100 * pp.RCP[0]) / pp.R[0]).toFixed(2)} % σ+); ` +
      `λ/2 plate: σ+ → ${((100 * hw.TCM[0]) / hw.T[0]).toFixed(3)} % σ−; λ/4 plate: σ+ part ${(qw.TCP[0] / qw.T[0]).toFixed(4)}`,
  );
}

// Field profile with anisotropic layers (Berreman): isotropic layers = the TMM profile (fields, |E|², |H|², absorption, R,
// T, per layer); lossless anisotropic stack (tilted axis, conical, a helix, an anisotropic exit): the flux along z is
// constant = T; the field carried back up to z = 0 = incident + reflected of the S-matrix solve; lossy: R + T + Σ absorbed
// = 1 and each layer's absorption = the integral of the density; the exact helix = its slices (converging)
{
  const fe = (a: number, b: number) => Math.abs(a - b);
  const iso = [
    { n: c(1.2), d: 0 },
    { n: c(2.1, 0.02), d: 140 },
    { n: c(0.2, 3.4), d: 30 },
    { n: c(1.46), d: 220 },
    { n: c(1.5), d: 0 },
  ];
  let ea = 0;
  for (const [th, pol] of [
    [0, 's'],
    [35, 's'],
    [35, 'p'],
    [70, 'p'],
  ] as const) {
    const g = profileGrid(
      iso.map((L) => L.d),
      150,
      150,
      600,
    );
    const t = fieldProfile(iso, 600, th, pol, g.z, g.layer);
    const b = berremanProfile(iso, 600, th, 0, pol, g.z, g.layer);
    for (let i = 0; i < g.z.length; i++) {
      ea = Math.max(ea, fe(t.E2[i], b.E2[i]), fe(t.H2[i], b.H2[i]), fe(t.absorption[i], b.absorption[i]) * 100);
      for (const k of ['Ex', 'Ey', 'Ez', 'Hx', 'Hy', 'Hz'] as const) ea = Math.max(ea, fe(Math.hypot(t.fields[k].re[i], t.fields[k].im[i]), Math.hypot(b.fields[k].re[i], b.fields[k].im[i])));
    }
    ea = Math.max(ea, fe(t.R, b.R), fe(t.T, b.T), ...t.layerAbs.map((v, j) => fe(v, b.layerAbs[j])));
  }
  const no = c(1.54);
  const ne = c(1.71);
  const aniso: RcwaLayer[] = [
    { n: c(1.4), d: 0 },
    { eps: uniaxial(c(1.5), c(1.8), 25, 40), d: 300 },
    { n: c(2.1), d: 90 },
    { eps: uniaxial(no, ne, 0, 45), d: 1200, helix: { twist: 1080, slices: 240 } },
    { eps: uniaxial(no, ne, 60, -30), d: 0 },
  ];
  let eb = 0;
  let ec = 0;
  for (const [th, phi, inc] of [
    [0, 0, { psi: 45, delta: -90 }],
    [30, 25, 's'],
    [50, -60, { psi: 20, delta: 40 }],
  ] as const) {
    const g = profileGrid(
      aniso.map((L) => L.d),
      200,
      200,
      800,
    );
    const b = berremanProfile(aniso, 650, th, phi, inc, g.z, g.layer);
    const kt = 1.4 * Math.sin((th * Math.PI) / 180);
    const cos0 = Math.sqrt(1 - (kt / 1.4) ** 2);
    for (let i = 0; i < g.z.length; i++) {
      if (g.layer[i] === 0) continue;
      const f = b.fields;
      const Sz = f.Ex.re[i] * f.Hy.re[i] + f.Ex.im[i] * f.Hy.im[i] - (f.Ey.re[i] * f.Hx.re[i] + f.Ey.im[i] * f.Hx.im[i]);
      eb = Math.max(eb, fe(Sz / (1.4 * cos0), b.T));
    }
    // at z = 0⁻ and 0⁺ (the backward pass reaches the top from below)
    const two = berremanProfile(aniso, 650, th, phi, inc, Float64Array.from([-1e-9, 1e-9]), Int32Array.from([0, 1]));
    for (const k of ['Ex', 'Ey', 'Hx', 'Hy'] as const) ec = Math.max(ec, Math.hypot(two.fields[k].re[0] - two.fields[k].re[1], two.fields[k].im[0] - two.fields[k].im[1]));
    ec = Math.max(ec, fe(b.R + b.T, 1));
  }
  const lossy: RcwaLayer[] = [{ n: c(1.3), d: 0 }, { eps: uniaxial(c(1.6, 0.03), c(1.9, 0.05), 20, 30), d: 400 }, { n: c(2.2, 0.1), d: 60 }, { n: c(1.5), d: 0 }];
  const gl = profileGrid(
    lossy.map((L) => L.d),
    0,
    0,
    20000,
  );
  const pl = berremanProfile(lossy, 600, 40, 30, { psi: 30, delta: 60 }, gl.z, gl.layer);
  const ed1 = fe(pl.R + pl.T + pl.layerAbs.slice(1, -1).reduce((a, v) => a + v, 0), 1);
  const integ = [0, 0];
  for (let i = 1; i < gl.z.length; i++) if (gl.layer[i] === gl.layer[i - 1] && gl.layer[i] >= 1 && gl.layer[i] <= 2) integ[gl.layer[i] - 1] += ((pl.absorption[i] + pl.absorption[i - 1]) / 2) * (gl.z[i] - gl.z[i - 1]);
  const ed2 = Math.max(fe(integ[0], pl.layerAbs[1]), fe(integ[1], pl.layerAbs[2]));
  const hx = (S: number): RcwaLayer[] =>
    S
      ? [{ n: c(1.625), d: 0 }, ...Array.from({ length: S }, (_, j) => ({ eps: uniaxial(no, ne, 0, (720 * (j + 0.5)) / S), d: 800 / S })), { n: c(1.625), d: 0 }]
      : [{ n: c(1.625), d: 0 }, { eps: uniaxial(no, ne, 0, 0), d: 800, helix: { twist: 720, slices: 100 } }, { n: c(1.625), d: 0 }];
  const zz = Float64Array.from([-100, 0, 100, 400, 700, 800, 900]);
  const E2of = (S: number) => {
    const L = hx(S);
    const lay = layerOfZ(
      L.map((q) => q.d),
      zz,
    );
    return berremanProfile(L, 650, 0, 0, { psi: 45, delta: -90 }, zz, lay).E2;
  };
  const ex = E2of(0);
  const errs = [200, 400, 800].map((S) => Math.max(...Array.from(E2of(S), (v, i) => fe(v, ex[i]))));
  const ok = ea < 1e-10 && eb < 1e-9 && ec < 1e-9 && ed1 < 1e-10 && ed2 < 1e-5 && errs[2] < errs[1] && errs[1] < errs[0] && errs[1] / errs[2] > 3.5 && errs[2] < 1e-3;
  if (!ok) throw new Error(`Berreman profile: vs TMM ${ea}, flux ${eb}, top ${ec}, balance ${ed1}, integral ${ed2}, helix ${errs}`);
  console.log(
    `field profile, anisotropic layers: isotropic = TMM profile incl. components, absorption, R, T (${ea.toExponential(1)}); lossless tilted / helix / anisotropic exit, conical, Jones: flux = T everywhere (${eb.toExponential(1)}); ` +
      `carried back to z = 0 = incident + reflected (${ec.toExponential(1)}); lossy: R + T + Σ absorbed = 1 (${ed1.toExponential(1)}), absorbed = ∫ density (${ed2.toExponential(1)}); exact helix vs 200 / 400 / 800 slices: ${errs.map((e) => e.toExponential(1)).join(' / ')}`,
  );
}

// A cholesteric solved exactly at normal incidence (constant Δ in the frame turning with the director): uniform slices
// converge to it as 1/S²; lossless R + T = 1; off normal incidence the helix layer = its slices (exactly); a right-handed
// helix (twist > 0) Bragg-reflects σ− (helicity −1), the analytic band n_o p … n_e p
{
  const no = c(1.54);
  const ne = c(1.71);
  const nm = c(1.625);
  const eps = uniaxial(no, ne, 0, 20);
  const [d, twist] = [2000, 1800];
  const exact = (l: number, delta: number) => rcwaConical([{ n: nm, d: 0 }, { eps, d, helix: { twist, slices: 400 } }, { n: c(1.5), d: 0 }], 1000, l, 0, 0, { psi: 45, delta }, 0);
  const sliced = (S: number, l: number, delta: number) =>
    rcwaConical([{ n: nm, d: 0 }, ...Array.from({ length: S }, (_, j) => ({ eps: rotateZ(eps, (twist * (j + 0.5)) / S), d: d / S })), { n: c(1.5), d: 0 }], 1000, l, 0, 0, { psi: 45, delta }, 0);
  let bal = 0;
  let ratioMin = Infinity;
  let ratioMax = 0;
  let err800 = 0;
  for (const l of [600, 650, 690])
    for (const delta of [90, -90]) {
      const e = exact(l, delta);
      bal = Math.max(bal, Math.abs(e.Rtot + e.Ttot - 1));
      const errs = [200, 400, 800].map((S) => Math.abs(sliced(S, l, delta).Rtot - e.Rtot));
      ratioMin = Math.min(ratioMin, errs[0] / errs[1], errs[1] / errs[2]);
      ratioMax = Math.max(ratioMax, errs[0] / errs[1], errs[1] / errs[2]);
      err800 = Math.max(err800, errs[2]);
    }
  const obl = (L: RcwaLayer[]) => rcwaConical([{ n: nm, d: 0 }, ...L, { n: c(1.5), d: 0 }], 1000, 650, 30, 20, 's', 0).Rtot;
  const eObl = Math.abs(obl([{ eps, d, helix: { twist, slices: 300 } }]) - obl(Array.from({ length: 300 }, (_, j) => ({ eps: rotateZ(eps, (twist * (j + 0.5)) / 300), d: d / 300 }))));
  const clc = (sense: number, l: number, delta: number) => rcwaConical([{ n: nm, d: 0 }, { eps: uniaxial(no, ne, 0, 0), d: 16000, helix: { twist: sense * 14400, slices: 3200 } }, { n: nm, d: 0 }], 1000, l, 0, 0, { psi: 45, delta }, 0).Rtot;
  const hand = [clc(1, 650, -90), clc(1, 650, 90), clc(-1, 650, 90), clc(-1, 650, -90)];
  const inBand = [clc(1, 400 * 1.54 + 3, -90), clc(1, 400 * 1.71 - 3, -90)];
  // the band edges: from the centre outwards, where R first falls below 1/2 (outside, a finite helix has high side lobes)
  const edge = (dir: number) => {
    let l = 650;
    while (clc(1, l, -90) > 0.5) l += dir * 0.5;
    return l - (dir * 0.5) / 2;
  };
  const edges = [edge(-1), edge(1)];
  const edgeErr = Math.max(Math.abs(edges[0] / (400 * 1.54) - 1), Math.abs(edges[1] / (400 * 1.71) - 1));
  const ok = bal < 1e-12 && ratioMin > 3.8 && ratioMax < 4.2 && err800 < 5e-4 && eObl < 1e-13 && hand[0] > 0.999 && hand[1] < 0.01 && hand[2] > 0.999 && hand[3] < 0.01 && Math.min(...inBand) > 0.99 && edgeErr < 0.01;
  if (!ok) throw new Error(`exact helix: balance ${bal}, slice error ratios ${ratioMin}–${ratioMax}, 800 slices ${err800}, oblique ${eObl}, handedness ${hand}, band ${inBand}, edges ${edges} (${edgeErr})`);
  console.log(
    `cholesteric solved exactly at normal incidence (rotating frame): slices converge as 1/S² (error ratio ${ratioMin.toFixed(2)}–${ratioMax.toFixed(2)} per doubling, ${err800.toExponential(1)} at 800), R + T = 1 (${bal.toExponential(1)}), oblique = its slices (${eObl.toExponential(1)}); ` +
      `a right-handed helix reflects σ− (${hand[0].toFixed(4)}) not σ+ (${hand[1].toExponential(1)}), a left-handed one the reverse; band inside n_o p … n_e p (R ${inBand.map((v) => v.toFixed(3)).join(' / ')}), edges ${edges.map((v) => v.toFixed(1)).join(' / ')} nm vs ${400 * 1.54} / ${400 * 1.71} (${(100 * edgeErr).toFixed(2)} %)`,
  );
}

// Reverse stack with anisotropic layers: light from the other side = the sample turned by π about y. Through the graph, the
// reversed stack (media swapped) at normal incidence = the original lit from below (S22 of its S-matrix), for a tilted
// layer, a cholesteric (exact helix) and a twisted-tilting layer (sublayers); reversing twice = the original
{
  const rlib = makeLibrary([{ id: 'user-glass', name: 'glass 1.5', color: '#cfe3f2', model: { type: 'constant', n: 1.5, k: 0 }, source: 'test' }]);
  const E = (s: string, t: string, h: string) => ({ id: `${s}-${t}-${h}`, source: s, sourceHandle: 'out', target: t, targetHandle: h });
  const P = { x: 0, y: 0 };
  const nodes = [
    { id: 'air', type: 'material', position: P, data: materialData('Air') },
    // a lossless glass: the reversed stack has it as the incident medium, which the solver takes lossless (BK7's k ~ 1e-8
    // would differ by that much from lighting the original from below)
    { id: 'bk7', type: 'material', position: P, data: materialData('user-glass') },
    { id: 'sio2', type: 'material', position: P, data: materialData('SiO2') },
    { id: 'tio2', type: 'material', position: P, data: materialData('TiO2') },
    { id: 'tilted', type: 'aniso', position: P, data: { name: 't', kind: 'uniaxial', color: '#999', angles: [35, 20, 0] } },
    { id: 'lc', type: 'aniso', position: P, data: { name: 'lc', kind: 'uniaxial', color: '#999', angles: [0, 30, 0] } },
    { id: 'l1', type: 'layer', position: P, data: { label: '', thickness: 300, layers2D: 1 } },
    { id: 'l2', type: 'layer', position: P, data: { label: '', thickness: 1300, layers2D: 1, pitch: 420 } },
    { id: 'l3', type: 'layer', position: P, data: { label: '', thickness: 500, layers2D: 1, twist: 70, tiltEnd: 50, slices: 40 } },
    { id: 'st', type: 'combine', position: P, data: { name: '', count: 3 } },
    { id: 'rev', type: 'reverse', position: P, data: { ...REVERSE_DEFAULTS, swapMedia: true } },
    { id: 'rev2', type: 'reverse', position: P, data: { ...REVERSE_DEFAULTS, swapMedia: true } },
    { id: 'wl', type: 'param', position: P, data: { quantity: 'lambda', mode: 'range', value: 550, min: 450, max: 750, step: 50 } },
    { id: 'th', type: 'param', position: P, data: { quantity: 'theta', mode: 'constant', value: 0, min: 0, max: 60, step: 30 } },
    ...(['p', 's'] as const).flatMap((pol) => [
      { id: `o${pol}`, type: 'compute', position: P, data: { name: 'o', polarization: pol, phi: 0 } },
      { id: `r${pol}`, type: 'compute', position: P, data: { name: 'r', polarization: pol, phi: 0 } },
      { id: `rr${pol}`, type: 'compute', position: P, data: { name: 'rr', polarization: pol, phi: 0 } },
    ]),
  ] as unknown as AppNode[];
  const edges = [
    E('sio2', 'tilted', 'o'),
    E('tio2', 'tilted', 'e'),
    E('sio2', 'lc', 'o'),
    E('tio2', 'lc', 'e'),
    E('tilted', 'l1', 'mat'),
    E('lc', 'l2', 'mat'),
    E('tilted', 'l3', 'mat'),
    E('l1', 'st', 'item-0'),
    E('l2', 'st', 'item-1'),
    E('l3', 'st', 'item-2'),
    E('air', 'st', 'incident'),
    E('bk7', 'st', 'exit'),
    E('st', 'rev', 'in'),
    E('rev', 'rev2', 'in'),
    ...(['p', 's'] as const).flatMap((pol) => [E('st', `o${pol}`, 'stack'), E('rev', `r${pol}`, 'stack'), E('rev2', `rr${pol}`, 'stack'), ...['o', 'r', 'rr'].flatMap((x) => [E('wl', `${x}${pol}`, 'lambda'), E('th', `${x}${pol}`, 'theta')])]),
  ];
  const ev = evaluateHeadless(nodes, edges, rlib);
  const dsOf = (id: string) => {
    const o = ev.results.get(id)!.outs.out;
    if (o?.type !== 'data' || !o.dataset) throw new Error(`reverse test ${id}: ${ev.results.get(id)!.errors}`);
    return o.dataset;
  };
  const [op, rp, rs, rrp, rrs, os] = ['op', 'rp', 'rs', 'rrp', 'rrs', 'os'].map(dsOf);
  let e = 0;
  [450, 500, 550, 600, 650, 700, 750].forEach((l, i) => {
    const st = rcwaLayersAt(op.spec!, [], l);
    const S = conicalSMatrix(st.layers, Float64Array.from([0]), 0, l);
    // incoming from the glass: x (TM) and y (TE) polarized; S22 in the tangential-E basis of the exit medium
    const R = (col: number) => S.S22.re[col] ** 2 + S.S22.im[col] ** 2 + S.S22.re[2 + col] ** 2 + S.S22.im[2 + col] ** 2;
    e = Math.max(e, Math.abs(R(0) - rp.fields.R[i]), Math.abs(R(1) - rs.fields.R[i]), Math.abs(rrp.fields.R[i] - op.fields.R[i]), Math.abs(rrs.fields.R[i] - os.fields.R[i]));
  });
  if (!(e < 1e-12)) throw new Error(`Reverse stack with anisotropic layers: ${e}`);
  console.log(`Reverse stack with anisotropic layers (tilted, cholesteric, twisted + tilting): = the original lit from below, S22 of its S-matrix (${e.toExponential(1)}); twice = the original`);
}

// Chiral optical Tamm states (Pyatnov et al., Photonics 5, 30 (2018)) through the example: σ− (the helix's own circular
// light) excites the states — 636 / 665 nm for d = 1 µm, 650 nm for 4 µm; σ+: Fabry–Pérot peaks 625 nm (1 µm), 639 nm
// (4 µm) — all as in the article; the field is localized at the CLC boundaries. The quasi-BIC (Timofeev et al., Crystals 7,
// 113 (2017), temporal coupled-mode theory): lit through the CLC onto a thick mirror, σ− → σ+ conversion is complete at the
// crossover (the example's map, 3.4 µm); there the linewidth is twice its floor (the two leaks equal); below it the width
// falls as exp(−4π|n_f|L/λ₀), |n_f| = √ε̄ δ/2 at the band centre
{
  const p = cotsExample();
  const clib = makeLibrary(p.materials);
  const ev = evaluateHeadless(p.nodes, p.edges, clib);
  const errs = [...ev.results].filter(([, r]) => r.errors.length);
  if (errs.length) throw new Error(`COTS example: ${errs.map(([id, r]) => `${id}: ${r.errors}`)}`);
  const dsOf = (id: string) => {
    const o = ev.results.get(id)!.outs.out;
    if (o?.type !== 'data' || !o.dataset) throw new Error(`COTS example: no data from ${id}`);
    return o.dataset;
  };
  const peaksOf = (id: string, s: number) => {
    const d = dsOf(id);
    const lam = d.axes[1].values as number[];
    const T = d.fields.T.slice(s * lam.length, (s + 1) * lam.length);
    const out: number[] = [];
    for (let i = 1; i < lam.length - 1; i++) if (T[i] > T[i - 1] && T[i] >= T[i + 1] && T[i] > 0.3 && lam[i] > 610 && lam[i] < 690) out.push(lam[i]);
    return out;
  };
  // the article's values are integer labels of its figures: within 1 nm
  const near = (list: number[], v: number) => list.some((x) => Math.abs(x - v) <= 1);
  const closest = (list: number[], v: number) => list.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), list[0] ?? NaN);
  const co1 = peaksOf('tco', 0);
  const co4 = peaksOf('tco', 3);
  const x1 = peaksOf('tx', 0);
  const x4 = peaksOf('tx', 3);
  const paper = near(co1, 636) && near(co1, 665) && co1.length === 2 && near(co4, 650) && co4.length === 1 && near(x1, 625) && near(x4, 639);
  // the field profile at 650 nm, d = 4 µm: |E|² largest at a CLC boundary, small in the middle of the CLC
  const fo = ev.results.get('fp')!.outs.out;
  if (fo?.type !== 'data' || !fo.dataset) throw new Error('COTS example: no field profile');
  const z = fo.dataset.axes[0].values as number[];
  const E2 = fo.dataset.fields.E2;
  const [b0, b1] = [2000, 6000]; // the CLC between the mirrors (20 × 100 nm each side)
  const at = (zz: number) => E2[z.reduce((k, v, i) => (Math.abs(v - zz) < Math.abs(z[k] - zz) ? i : k), 0)];
  const edgeMax = Math.max(...z.map((v, i) => (Math.abs(v - b0) < 150 || Math.abs(v - b1) < 150 ? E2[i] : 0)));
  const localized = Math.max(at(b0), at(b1)) > 20 * at((b0 + b1) / 2) && Math.max(...Array.from(E2)) < 1.2 * edgeMax;
  // the quasi-BIC map: conversion ≥ 0.99 at the crossover grid point, small at 1 and 8 µm
  const kg = dsOf('tkg');
  const Ls = kg.axes[0].values as number[];
  const nl = kg.axes[1].values.length;
  const conv = (L: number) => Math.max(...Array.from(kg.fields.R_cp.slice(Ls.indexOf(L) * nl, (Ls.indexOf(L) + 1) * nl)));
  const cross = conv(3400) > 0.99 && conv(1000) < 0.1 && conv(8000) < 0.05;
  // coupled-mode relations, by the direct solver (the CLC ending at 45° next to a 60-period mirror): the σ− → σ+ line
  const { no, ne, nm, pitch, a } = COTS2018;
  const mirror: RcwaLayer[] = Array.from({ length: 120 }, (_, i) => ({ eps: uniaxial(c(no), c(ne), 0, (i % 2) * 90), d: a }));
  const one = (L: number): RcwaLayer[] => [{ n: c(nm), d: 0 }, { eps: uniaxial(c(no), c(ne), 0, 45 - (360 * L) / pitch), d: L, helix: { twist: (360 * L) / pitch, slices: 200 } }, ...mirror, { n: c(nm), d: 0 }];
  const line = (L: number) => {
    const f = (l: number) => rcwaConical(one(L), 1000, l, 0, 0, { psi: 45, delta: -90 }, 0).RCP[0];
    let [lo, hi] = [649.5, 650.6];
    for (let k = 0; k < 50; k++) {
      const m1 = hi - (hi - lo) * 0.618;
      const m2 = lo + (hi - lo) * 0.618;
      if (f(m1) > f(m2)) hi = m2;
      else lo = m1;
    }
    const lr = (lo + hi) / 2;
    const pk = f(lr);
    const side = (dir: number) => {
      let [x0, x1] = [lr, lr + dir * 0.02];
      while (f(x1) > pk / 2) x1 += dir * 0.02;
      for (let k = 0; k < 40; k++) {
        const mm = (x0 + x1) / 2;
        if (f(mm) > pk / 2) x0 = mm;
        else x1 = mm;
      }
      return x0;
    };
    return { pk, w: side(1) - side(-1) };
  };
  const [w1, w25, wc, wf] = [line(1000), line(2500), line(3300), line(6000)];
  const epsBar = (no * no + ne * ne) / 2;
  const nf = (Math.sqrt(epsBar) * ((ne * ne - no * no) / (ne * ne + no * no))) / 2;
  const rate = Math.log((w1.w - wf.w) / (w25.w - wf.w)) / 1.5; // per µm
  const want = (4 * Math.PI * nf) / 0.65;
  const tcmt = wc.pk > 0.99 && Math.abs(wc.w / (2 * wf.w) - 1) < 0.05 && Math.abs(rate / want - 1) < 0.05;
  if (!(paper && localized && cross && tcmt))
    throw new Error(`COTS: peaks σ− ${co1} / ${co4}, σ+ ${x1} / ${x4}; localized ${localized}; map ${conv(1000)} ${conv(3400)} ${conv(8000)}; TCMT conversion ${wc.pk}, width ${wc.w} vs 2 × ${wf.w}, rate ${rate} vs ${want}`);
  console.log(
    `chiral optical Tamm states (Pyatnov et al. 2018) through the example: σ− d = 1 µm ${co1.map((v) => v.toFixed(1)).join(' / ')} nm (article 636 / 665), d = 4 µm ${co4[0].toFixed(1)} (650); σ+ Fabry–Pérot peaks ${closest(x1, 625).toFixed(1)} / ${closest(x4, 639).toFixed(1)} nm (article 625 / 639); the field localized at the CLC boundaries; ` +
      `quasi-BIC (Timofeev et al. 2017): σ− → σ+ conversion ${conv(3400).toFixed(4)} at the crossover (3.4 µm), ${wc.pk.toFixed(4)} at 3.3 µm with width ${wc.w.toFixed(3)} nm = 2 × the floor ${wf.w.toFixed(3)} nm (${(wc.w / (2 * wf.w)).toFixed(3)}); width decay ${rate.toFixed(3)} / µm vs 4π|n_f|/λ₀ = ${want.toFixed(3)} / µm`,
  );
}

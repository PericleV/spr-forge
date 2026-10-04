// Dense complex matrices (row-major, separate real / imaginary arrays) for the RCWA: products, inverse, eigen
// decomposition of general (non-Hermitian) matrices.
export type CMat = { n: number; re: Float64Array; im: Float64Array };

export const cmat = (n: number): CMat => ({ n, re: new Float64Array(n * n), im: new Float64Array(n * n) });

export function eye(n: number): CMat {
  const m = cmat(n);
  for (let i = 0; i < n; i++) m.re[i * n + i] = 1;
  return m;
}

export const clone = (a: CMat): CMat => ({ n: a.n, re: a.re.slice(), im: a.im.slice() });

// Diagonal matrix from real / imaginary vectors.
export function diag(re: ArrayLike<number>, im?: ArrayLike<number>): CMat {
  const n = re.length;
  const m = cmat(n);
  for (let i = 0; i < n; i++) {
    m.re[i * n + i] = re[i];
    if (im) m.im[i * n + i] = im[i];
  }
  return m;
}

export function mul(a: CMat, b: CMat): CMat {
  const n = a.n;
  const c = cmat(n);
  const [ar, ai, br, bi, cr, ci] = [a.re, a.im, b.re, b.im, c.re, c.im];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      const xr = ar[i * n + k];
      const xi = ai[i * n + k];
      if (xr === 0 && xi === 0) continue;
      const bo = k * n;
      const co = i * n;
      for (let j = 0; j < n; j++) {
        const yr = br[bo + j];
        const yi = bi[bo + j];
        cr[co + j] += xr * yr - xi * yi;
        ci[co + j] += xr * yi + xi * yr;
      }
    }
  return c;
}

// a + s·b (s real)
export function add(a: CMat, b: CMat, s = 1): CMat {
  const c = cmat(a.n);
  for (let i = 0; i < a.re.length; i++) {
    c.re[i] = a.re[i] + s * b.re[i];
    c.im[i] = a.im[i] + s * b.im[i];
  }
  return c;
}

export function scale(a: CMat, sr: number, si = 0): CMat {
  const c = cmat(a.n);
  for (let i = 0; i < a.re.length; i++) {
    c.re[i] = a.re[i] * sr - a.im[i] * si;
    c.im[i] = a.re[i] * si + a.im[i] * sr;
  }
  return c;
}

// diag(d)·a (d complex vectors)
export function diagMulLeft(dr: ArrayLike<number>, di: ArrayLike<number>, a: CMat): CMat {
  const n = a.n;
  const c = cmat(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const k = i * n + j;
      c.re[k] = dr[i] * a.re[k] - di[i] * a.im[k];
      c.im[k] = dr[i] * a.im[k] + di[i] * a.re[k];
    }
  return c;
}

// a·diag(d)
export function diagMulRight(a: CMat, dr: ArrayLike<number>, di: ArrayLike<number>): CMat {
  const n = a.n;
  const c = cmat(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const k = i * n + j;
      c.re[k] = a.re[k] * dr[j] - a.im[k] * di[j];
      c.im[k] = a.re[k] * di[j] + a.im[k] * dr[j];
    }
  return c;
}

// Inverse by Gauss–Jordan elimination with partial pivoting (augmented [A | I], plain loops for speed).
export function inv(a: CMat): CMat {
  const n = a.n;
  const w = 2 * n;
  const R = new Float64Array(n * w);
  const I = new Float64Array(n * w);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      R[i * w + j] = a.re[i * n + j];
      I[i * w + j] = a.im[i * n + j];
    }
    R[i * w + n + i] = 1;
  }
  for (let c = 0; c < n; c++) {
    let p = c;
    let best = -1;
    for (let i = c; i < n; i++) {
      const v = R[i * w + c] ** 2 + I[i * w + c] ** 2;
      if (v > best) [best, p] = [v, i];
    }
    if (!(best > 0)) throw new Error('singular matrix');
    if (p !== c)
      for (let j = 0; j < w; j++) {
        const kc = c * w + j;
        const kp = p * w + j;
        let t = R[kc];
        R[kc] = R[kp];
        R[kp] = t;
        t = I[kc];
        I[kc] = I[kp];
        I[kp] = t;
      }
    const pr = R[c * w + c];
    const pi = I[c * w + c];
    const d = pr * pr + pi * pi;
    const ir = pr / d;
    const ii = -pi / d;
    for (let j = c; j < w; j++) {
      const k = c * w + j;
      const xr = R[k];
      const xi = I[k];
      R[k] = xr * ir - xi * ii;
      I[k] = xr * ii + xi * ir;
    }
    for (let i = 0; i < n; i++) {
      if (i === c) continue;
      const fr = R[i * w + c];
      const fi = I[i * w + c];
      if (fr === 0 && fi === 0) continue;
      const oi = i * w;
      const oc = c * w;
      for (let j = c; j < w; j++) {
        const yr = R[oc + j];
        const yi = I[oc + j];
        R[oi + j] -= fr * yr - fi * yi;
        I[oi + j] -= fr * yi + fi * yr;
      }
    }
  }
  const out = cmat(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      out.re[i * n + j] = R[i * w + n + j];
      out.im[i * n + j] = I[i * w + n + j];
    }
  return out;
}

// Solution of A x = b (Gaussian elimination with partial pivoting; A is not modified).
export function solve(a: CMat, br: ArrayLike<number>, bi: ArrayLike<number>): [Float64Array, Float64Array] {
  const n = a.n;
  const R = a.re.slice();
  const I = a.im.slice();
  const xr = Float64Array.from(br);
  const xi = Float64Array.from(bi);
  for (let c = 0; c < n; c++) {
    let p = c;
    let best = -1;
    for (let i = c; i < n; i++) {
      const v = R[i * n + c] ** 2 + I[i * n + c] ** 2;
      if (v > best) [best, p] = [v, i];
    }
    if (!(best > 0)) throw new Error('singular matrix');
    if (p !== c) {
      for (let j = c; j < n; j++) {
        const kc = c * n + j;
        const kp = p * n + j;
        let t = R[kc];
        R[kc] = R[kp];
        R[kp] = t;
        t = I[kc];
        I[kc] = I[kp];
        I[kp] = t;
      }
      let t = xr[c];
      xr[c] = xr[p];
      xr[p] = t;
      t = xi[c];
      xi[c] = xi[p];
      xi[p] = t;
    }
    const pr = R[c * n + c];
    const pi = I[c * n + c];
    const d = pr * pr + pi * pi;
    for (let i = c + 1; i < n; i++) {
      const ar = R[i * n + c];
      const ai = I[i * n + c];
      if (ar === 0 && ai === 0) continue;
      // f = a / pivot
      const fr = (ar * pr + ai * pi) / d;
      const fi = (ai * pr - ar * pi) / d;
      for (let j = c + 1; j < n; j++) {
        const yr = R[c * n + j];
        const yi = I[c * n + j];
        R[i * n + j] -= fr * yr - fi * yi;
        I[i * n + j] -= fr * yi + fi * yr;
      }
      xr[i] -= fr * xr[c] - fi * xi[c];
      xi[i] -= fr * xi[c] + fi * xr[c];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let sr = xr[i];
    let si = xi[i];
    for (let j = i + 1; j < n; j++) {
      const k = i * n + j;
      sr -= R[k] * xr[j] - I[k] * xi[j];
      si -= R[k] * xi[j] + I[k] * xr[j];
    }
    const pr = R[i * n + i];
    const pi = I[i * n + i];
    const d = pr * pr + pi * pi;
    xr[i] = (sr * pr + si * pi) / d;
    xi[i] = (si * pr - sr * pi) / d;
  }
  return [xr, xi];
}

// Solution of A X = B for a matrix B (Gaussian elimination with partial pivoting): A⁻¹B in about half the work of
// inv(A) then a product. A and B are not modified.
export function solveMat(a: CMat, b: CMat): CMat {
  const n = a.n;
  const R = a.re.slice();
  const I = a.im.slice();
  const XR = b.re.slice();
  const XI = b.im.slice();
  for (let c = 0; c < n; c++) {
    let p = c;
    let best = -1;
    for (let i = c; i < n; i++) {
      const v = R[i * n + c] ** 2 + I[i * n + c] ** 2;
      if (v > best) [best, p] = [v, i];
    }
    if (!(best > 0)) throw new Error('singular matrix');
    if (p !== c) {
      for (let j = c; j < n; j++) {
        const kc = c * n + j;
        const kp = p * n + j;
        let t = R[kc];
        R[kc] = R[kp];
        R[kp] = t;
        t = I[kc];
        I[kc] = I[kp];
        I[kp] = t;
      }
      for (let j = 0; j < n; j++) {
        const kc = c * n + j;
        const kp = p * n + j;
        let t = XR[kc];
        XR[kc] = XR[kp];
        XR[kp] = t;
        t = XI[kc];
        XI[kc] = XI[kp];
        XI[kp] = t;
      }
    }
    const pr = R[c * n + c];
    const pi = I[c * n + c];
    const d = pr * pr + pi * pi;
    const oc = c * n;
    for (let i = c + 1; i < n; i++) {
      const ar = R[i * n + c];
      const ai = I[i * n + c];
      if (ar === 0 && ai === 0) continue;
      const fr = (ar * pr + ai * pi) / d;
      const fi = (ai * pr - ar * pi) / d;
      const oi = i * n;
      for (let j = c + 1; j < n; j++) {
        const yr = R[oc + j];
        const yi = I[oc + j];
        R[oi + j] -= fr * yr - fi * yi;
        I[oi + j] -= fr * yi + fi * yr;
      }
      for (let j = 0; j < n; j++) {
        const yr = XR[oc + j];
        const yi = XI[oc + j];
        XR[oi + j] -= fr * yr - fi * yi;
        XI[oi + j] -= fr * yi + fi * yr;
      }
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    const oi = i * n;
    for (let k = i + 1; k < n; k++) {
      const rr = R[oi + k];
      const ri = I[oi + k];
      if (rr === 0 && ri === 0) continue;
      const ok = k * n;
      for (let j = 0; j < n; j++) {
        const yr = XR[ok + j];
        const yi = XI[ok + j];
        XR[oi + j] -= rr * yr - ri * yi;
        XI[oi + j] -= rr * yi + ri * yr;
      }
    }
    const pr = R[oi + i];
    const pi = I[oi + i];
    const d = pr * pr + pi * pi;
    for (let j = 0; j < n; j++) {
      const sr = XR[oi + j];
      const si = XI[oi + j];
      XR[oi + j] = (sr * pr + si * pi) / d;
      XI[oi + j] = (si * pr - sr * pi) / d;
    }
  }
  return { n, re: XR, im: XI };
}

// Matrix × complex vector.
export function mulVec(a: CMat, xr: ArrayLike<number>, xi: ArrayLike<number>): [Float64Array, Float64Array] {
  const n = a.n;
  const yr = new Float64Array(n);
  const yi = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sr = 0;
    let si = 0;
    for (let j = 0; j < n; j++) {
      const k = i * n + j;
      sr += a.re[k] * xr[j] - a.im[k] * xi[j];
      si += a.re[k] * xi[j] + a.im[k] * xr[j];
    }
    yr[i] = sr;
    yi[i] = si;
  }
  return [yr, yi];
}

// ---- Eigen decomposition of a general complex matrix: Householder reduction to Hessenberg form, shifted QR
// iterations (Wilkinson shift, deflation) to the Schur form T = Qᴴ A Q, eigenvectors of T by back-substitution. ----

export type Eigen = { valRe: Float64Array; valIm: Float64Array; vec: CMat }; // columns of vec: eigenvectors (unit norm)

export function eig(a: CMat): Eigen {
  const n = a.n;
  const H = clone(a);
  const Q = eye(n);
  const [hr, hi, qr, qi] = [H.re, H.im, Q.re, Q.im];
  const at = (i: number, j: number) => i * n + j;

  // Householder reduction to upper Hessenberg form
  for (let k = 0; k < n - 2; k++) {
    let alpha = 0;
    for (let i = k + 1; i < n; i++) alpha += hr[at(i, k)] ** 2 + hi[at(i, k)] ** 2;
    alpha = Math.sqrt(alpha);
    if (alpha < 1e-300) continue;
    const x0r = hr[at(k + 1, k)];
    const x0i = hi[at(k + 1, k)];
    const x0a = Math.hypot(x0r, x0i);
    // v = x + e^{i arg x0} ‖x‖ e1
    const [pr, pi] = x0a > 0 ? [x0r / x0a, x0i / x0a] : [1, 0];
    const vr = new Float64Array(n);
    const vi = new Float64Array(n);
    for (let i = k + 1; i < n; i++) {
      vr[i] = hr[at(i, k)];
      vi[i] = hi[at(i, k)];
    }
    vr[k + 1] += pr * alpha;
    vi[k + 1] += pi * alpha;
    let vn = 0;
    for (let i = k + 1; i < n; i++) vn += vr[i] ** 2 + vi[i] ** 2;
    if (vn < 1e-300) continue;
    // H ← (I − 2vvᴴ/vᴴv) H (I − 2vvᴴ/vᴴv), Q ← Q (I − 2vvᴴ/vᴴv)
    for (let j = 0; j < n; j++) {
      let sr = 0;
      let si = 0;
      for (let i = k + 1; i < n; i++) {
        // conj(v_i) · H_ij
        sr += vr[i] * hr[at(i, j)] + vi[i] * hi[at(i, j)];
        si += vr[i] * hi[at(i, j)] - vi[i] * hr[at(i, j)];
      }
      const fr = (2 * sr) / vn;
      const fi = (2 * si) / vn;
      for (let i = k + 1; i < n; i++) {
        hr[at(i, j)] -= vr[i] * fr - vi[i] * fi;
        hi[at(i, j)] -= vr[i] * fi + vi[i] * fr;
      }
    }
    for (const [Mr, Mi] of [[hr, hi], [qr, qi]] as const)
      for (let i = 0; i < n; i++) {
        let sr = 0;
        let si = 0;
        for (let j = k + 1; j < n; j++) {
          // M_ij · v_j
          sr += Mr[at(i, j)] * vr[j] - Mi[at(i, j)] * vi[j];
          si += Mr[at(i, j)] * vi[j] + Mi[at(i, j)] * vr[j];
        }
        const fr = (2 * sr) / vn;
        const fi = (2 * si) / vn;
        for (let j = k + 1; j < n; j++) {
          // − f · conj(v_j)
          Mr[at(i, j)] -= fr * vr[j] + fi * vi[j];
          Mi[at(i, j)] -= fi * vr[j] - fr * vi[j];
        }
      }
    for (let i = k + 2; i < n; i++) hr[at(i, k)] = hi[at(i, k)] = 0;
  }

  // Shifted QR on the Hessenberg matrix with Givens rotations
  let hiIdx = n - 1;
  let iter = 0;
  let total = 0;
  const norm = Math.sqrt(hr.reduce((s, v, i) => s + v * v + hi[i] * hi[i], 0)) || 1;
  while (hiIdx > 0) {
    // find a negligible subdiagonal element
    let l = hiIdx;
    while (l > 0) {
      const s = Math.hypot(hr[at(l, l - 1)], hi[at(l, l - 1)]);
      const d = Math.hypot(hr[at(l, l)], hi[at(l, l)]) + Math.hypot(hr[at(l - 1, l - 1)], hi[at(l - 1, l - 1)]);
      if (s <= 1e-15 * (d || norm)) {
        hr[at(l, l - 1)] = hi[at(l, l - 1)] = 0;
        break;
      }
      l--;
    }
    if (l === hiIdx) {
      hiIdx--;
      iter = 0;
      continue;
    }
    iter++;
    total++;
    if (total > 100 * n) throw new Error('eigenvalues did not converge');
    // Wilkinson shift from the trailing 2x2 block
    const m = hiIdx;
    const [ar, ai] = [hr[at(m - 1, m - 1)], hi[at(m - 1, m - 1)]];
    const [br, bi] = [hr[at(m - 1, m)], hi[at(m - 1, m)]];
    const [cr, ci] = [hr[at(m, m - 1)], hi[at(m, m - 1)]];
    const [dr, di] = [hr[at(m, m)], hi[at(m, m)]];
    let sr: number;
    let si: number;
    if (iter % 11 === 10) {
      // exceptional shift
      sr = dr + Math.abs(hr[at(m, m - 1)]);
      si = di;
    } else {
      // eigenvalue of [[a b][c d]] closest to d: (a+d)/2 ± sqrt(((a−d)/2)² + bc)
      const hr2 = (ar - dr) / 2;
      const hi2 = (ai - di) / 2;
      const qr0 = hr2 * hr2 - hi2 * hi2 + (br * cr - bi * ci);
      const qi0 = 2 * hr2 * hi2 + (br * ci + bi * cr);
      const rad = Math.hypot(qr0, qi0);
      let rr = Math.sqrt((rad + qr0) / 2);
      let ri = Math.sqrt(Math.max(0, (rad - qr0) / 2)) * (qi0 < 0 ? -1 : 1);
      const mr = (ar + dr) / 2;
      const mi = (ai + di) / 2;
      // choose the root closer to d
      const d1 = Math.hypot(mr + rr - dr, mi + ri - di);
      const d2 = Math.hypot(mr - rr - dr, mi - ri - di);
      if (d2 < d1) [rr, ri] = [-rr, -ri];
      sr = mr + rr;
      si = mi + ri;
    }
    // QR step on rows/cols l..m of (H − σI) via Givens rotations, then RQ + σI
    for (let k = l; k <= m; k++) {
      hr[at(k, k)] -= sr;
      hi[at(k, k)] -= si;
    }
    const rots: [number, number, number][] = []; // c (real), s (complex)
    for (let k = l; k < m; k++) {
      const [xr, xi] = [hr[at(k, k)], hi[at(k, k)]];
      const [yr, yi] = [hr[at(k + 1, k)], hi[at(k + 1, k)]];
      const xa = Math.hypot(xr, xi);
      const r = Math.hypot(xa, Math.hypot(yr, yi));
      let c: number;
      let s1r: number;
      let s1i: number;
      if (r === 0) {
        c = 1;
        s1r = 0;
        s1i = 0;
      } else if (xa === 0) {
        c = 0;
        // s = conj(y)/|y|
        const ya = Math.hypot(yr, yi);
        s1r = yr / ya;
        s1i = -yi / ya;
      } else {
        c = xa / r;
        // s = (x/|x|) conj(y) / r
        const ur = xr / xa;
        const ui = xi / xa;
        s1r = (ur * yr + ui * yi) / r;
        s1i = (ui * yr - ur * yi) / r;
      }
      rots.push([c, s1r, s1i]);
      // rows k, k+1: [c s; −conj(s) c]
      const ok = k * n;
      const ok1 = ok + n;
      for (let j = k; j < n; j++) {
        const ar2 = hr[ok + j];
        const ai2 = hi[ok + j];
        const br2 = hr[ok1 + j];
        const bi2 = hi[ok1 + j];
        hr[ok + j] = c * ar2 + (s1r * br2 - s1i * bi2);
        hi[ok + j] = c * ai2 + (s1r * bi2 + s1i * br2);
        hr[ok1 + j] = -(s1r * ar2 + s1i * ai2) + c * br2;
        hi[ok1 + j] = -(s1r * ai2 - s1i * ar2) + c * bi2;
      }
    }
    // columns: H ← H Gᴴ, Q ← Q Gᴴ
    rots.forEach(([c, s1r, s1i], idx) => {
      const k = l + idx;
      const rows = Math.min(k + 2, m) + 1;
      for (let pass = 0; pass < 2; pass++) {
        const Mr = pass === 0 ? hr : qr;
        const Mi = pass === 0 ? hi : qi;
        const top = pass === 0 ? rows : n;
        for (let i = 0, o = k; i < top; i++, o += n) {
          const ar2 = Mr[o];
          const ai2 = Mi[o];
          const br2 = Mr[o + 1];
          const bi2 = Mi[o + 1];
          // [a b] · [[c, −s], [conj(s), c]]
          Mr[o] = c * ar2 + (s1r * br2 + s1i * bi2);
          Mi[o] = c * ai2 + (s1r * bi2 - s1i * br2);
          Mr[o + 1] = -(s1r * ar2 - s1i * ai2) + c * br2;
          Mi[o + 1] = -(s1r * ai2 + s1i * ar2) + c * bi2;
        }
      }
    });
    for (let k = l; k <= m; k++) {
      hr[at(k, k)] += sr;
      hi[at(k, k)] += si;
    }
  }
  // (the row rotations run to the last column and the column rotations from the first row: T is the full Schur form)

  // eigenvalues and eigenvectors of the upper-triangular T, back to A through Q
  const valRe = new Float64Array(n);
  const valIm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    valRe[i] = hr[at(i, i)];
    valIm[i] = hi[at(i, i)];
  }
  const Y = cmat(n);
  const eps = 1e-14 * norm;
  for (let k = 0; k < n; k++) {
    // solve (T − λ_k I) y = 0 with y_k = 1, y_j = 0 for j > k
    const yr = new Float64Array(n);
    const yi = new Float64Array(n);
    yr[k] = 1;
    for (let i = k - 1; i >= 0; i--) {
      let sr = 0;
      let si = 0;
      for (let j = i + 1; j <= k; j++) {
        sr += hr[at(i, j)] * yr[j] - hi[at(i, j)] * yi[j];
        si += hr[at(i, j)] * yi[j] + hi[at(i, j)] * yr[j];
      }
      let dr = hr[at(i, i)] - valRe[k];
      let di = hi[at(i, i)] - valIm[k];
      if (Math.hypot(dr, di) < eps) dr = eps; // repeated eigenvalue: perturb
      const dd = dr * dr + di * di;
      yr[i] = -(sr * dr + si * di) / dd;
      yi[i] = -(si * dr - sr * di) / dd;
    }
    for (let i = 0; i < n; i++) {
      Y.re[at(i, k)] = yr[i];
      Y.im[at(i, k)] = yi[i];
    }
  }
  const V = mul(Q, Y);
  // unit columns
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += V.re[at(i, k)] ** 2 + V.im[at(i, k)] ** 2;
    s = Math.sqrt(s) || 1;
    for (let i = 0; i < n; i++) {
      V.re[at(i, k)] /= s;
      V.im[at(i, k)] /= s;
    }
  }
  return { valRe, valIm, vec: V };
}

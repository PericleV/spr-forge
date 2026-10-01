// Small arithmetic expression compiler (no eval): numbers, variables, + − * / ^, parentheses, unary minus and the
// functions below. One parser, two evaluators: real numbers (custom objectives) and complex numbers (Custom data, where
// r and t are complex and `i` is the imaginary unit).
import type { C } from '../physics/complex.ts';

export type Compiled = { fn: (vars: Record<string, number>) => number; names: string[] };
export type CompiledC = { fn: (vars: Record<string, C>) => C; names: string[] };

const FUNCS: Record<string, (...a: number[]) => number> = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  exp: Math.exp,
  log: Math.log,
  log10: Math.log10,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  // trigonometric (radians), hyperbolic, and the conversions between degrees and radians
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  cot: (x) => 1 / Math.tan(x),
  ctan: (x) => 1 / Math.tan(x),
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  deg: (x) => (x * 180) / Math.PI,
  rad: (x) => (x * Math.PI) / 180,
  // Heaviside step: 1 for x ≥ 0, else 0 (its mean along an axis is the fraction of points where x ≥ 0)
  step: (x) => (x >= 0 ? 1 : Number.isNaN(x) ? NaN : 0),
};
export const FUNCTION_NAMES = Object.keys(FUNCS);

type Tok = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) i++;
    else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i))!;
      if (!m) throw new Error(`Bad number at ${i + 1}`);
      out.push({ k: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(src.slice(i))!;
      out.push({ k: 'id', v: m[0] });
      i += m[0].length;
    } else if ('+-*/^(),·×−'.includes(c)) {
      out.push({ k: 'op', v: c === '·' || c === '×' ? '*' : c === '−' ? '-' : c });
      i++;
    } else throw new Error(`Unexpected “${c}” at ${i + 1}`);
  }
  return out;
}

type Ast =
  | { k: 'num'; v: number }
  | { k: 'var'; v: string }
  | { k: 'const'; v: 'pi' | 'i' }
  | { k: 'neg'; a: Ast }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Ast; b: Ast }
  | { k: 'call'; f: string; args: Ast[] };

// sum := term (('+'|'-') term)*; term := unary (('*'|'/') unary)*; unary := '-' unary | power; power := atom ('^' unary)?
// `consts`: the names read as constants (pi; also i in complex formulas), `funcs`: the known functions.
function parse(src: string, consts: string[], funcs: string[]): { ast: Ast; names: string[] } | string {
  let toks: Tok[];
  try {
    toks = tokenize(src);
  } catch (e) {
    return (e as Error).message;
  }
  if (!toks.length) return 'Enter an expression, e.g. 0.5*a + 0.25*b';
  let p = 0;
  const names = new Set<string>();
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.k === 'op' && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected “${v}”`);
    p++;
  };
  const sum = (): Ast => {
    let f = term();
    while (isOp('+') || isOp('-')) f = { k: 'bin', op: toks[p++].v as '+' | '-', a: f, b: term() };
    return f;
  };
  const term = (): Ast => {
    let f = unary();
    while (isOp('*') || isOp('/')) f = { k: 'bin', op: toks[p++].v as '*' | '/', a: f, b: unary() };
    return f;
  };
  const unary = (): Ast => {
    if (isOp('-')) {
      p++;
      return { k: 'neg', a: unary() };
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return power();
  };
  const power = (): Ast => {
    const a = atom();
    if (isOp('^')) {
      p++;
      return { k: 'bin', op: '^', a, b: unary() };
    }
    return a;
  };
  const atom = (): Ast => {
    const t = toks[p++];
    if (!t) throw new Error('Unexpected end of the expression');
    if (t.k === 'num') return { k: 'num', v: t.v };
    if (t.k === 'op' && t.v === '(') {
      const f = sum();
      expect(')');
      return f;
    }
    if (t.k === 'id') {
      if (isOp('(')) {
        if (!funcs.includes(t.v)) throw new Error(`Unknown function “${t.v}”`);
        p++;
        const args: Ast[] = [];
        if (!isOp(')')) {
          args.push(sum());
          while (isOp(',')) {
            p++;
            args.push(sum());
          }
        }
        expect(')');
        return { k: 'call', f: t.v, args };
      }
      if (consts.includes(t.v)) return { k: 'const', v: t.v as 'pi' | 'i' };
      names.add(t.v);
      return { k: 'var', v: t.v };
    }
    throw new Error(`Unexpected “${t.v}”`);
  };
  try {
    const ast = sum();
    if (p < toks.length) throw new Error(`Unexpected “${toks[p].v}”`);
    return { ast, names: [...names] };
  } catch (e) {
    return (e as Error).message;
  }
}

type F = (v: Record<string, number>) => number;

export function compile(src: string): Compiled | string {
  const r = parse(src, ['pi'], FUNCTION_NAMES);
  if (typeof r === 'string') return r;
  const build = (n: Ast): F => {
    switch (n.k) {
      case 'num':
        return () => n.v;
      case 'const':
        return () => Math.PI;
      case 'var':
        return (v) => (n.v in v ? v[n.v] : NaN);
      case 'neg': {
        const a = build(n.a);
        return (v) => -a(v);
      }
      case 'bin': {
        const [a, b] = [build(n.a), build(n.b)];
        if (n.op === '+') return (v) => a(v) + b(v);
        if (n.op === '-') return (v) => a(v) - b(v);
        if (n.op === '*') return (v) => a(v) * b(v);
        if (n.op === '/') return (v) => a(v) / b(v);
        return (v) => a(v) ** b(v);
      }
      case 'call': {
        const fn = FUNCS[n.f];
        const args = n.args.map(build);
        return (v) => fn(...args.map((a) => a(v)));
      }
    }
  };
  return { fn: build(r.ast), names: r.names };
}

// ---- complex formulas ----

const cx = (re: number, im = 0): C => ({ re, im });
const cmul = (a: C, b: C) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cadd = (a: C, b: C) => cx(a.re + b.re, a.im + b.im);
const csub = (a: C, b: C) => cx(a.re - b.re, a.im - b.im);
const cdiv = (a: C, b: C) => {
  // real divisor: plain division (1/0 = Infinity as for real formulas, not NaN)
  if (b.im === 0) return cx(a.re / b.re, a.im / b.re);
  const d = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
// the argument in (−π, π]: a zero imaginary part counts as +0 (a real −8 from −(8) or (−1)·8 carries Im = −0, which would
// put it on the other side of the branch cut)
const carg = (a: C) => Math.atan2(a.im === 0 ? 0 : a.im, a.re);
const clog = (a: C) => cx(Math.log(Math.hypot(a.re, a.im)), carg(a));
const cexp = (a: C) => {
  const m = Math.exp(a.re);
  return a.im === 0 ? cx(m) : cx(m * Math.cos(a.im), m * Math.sin(a.im));
};
// principal root (the smaller part from the larger, as physics/complex.ts); √(−1) = i
const csqrt = (a: C): C => {
  if (a.im === 0 && a.re >= 0) return cx(Math.sqrt(a.re));
  const r = Math.hypot(a.re, a.im);
  if (r === 0) return cx(0);
  if (a.re >= 0) {
    const re = Math.sqrt((r + a.re) / 2);
    return cx(re, a.im / (2 * re));
  }
  const im = Math.sqrt((r - a.re) / 2);
  return cx(Math.abs(a.im) / (2 * im), a.im < 0 ? -im : im);
};
// a^b: real when it can be (a ≥ 0, or an integer power: exact products, no rounding into Im), else exp(b log a)
const cpow = (a: C, b: C): C => {
  if (b.im === 0 && Number.isInteger(b.re) && Math.abs(b.re) <= 64) {
    if (a.im === 0) return cx(a.re ** b.re);
    let out = cx(1);
    for (let k = 0; k < Math.abs(b.re); k++) out = cmul(out, a);
    return b.re < 0 ? cdiv(cx(1), out) : out;
  }
  if (a.im === 0 && b.im === 0 && a.re >= 0) return cx(a.re ** b.re);
  if (a.re === 0 && a.im === 0) return cx(b.re > 0 ? 0 : NaN);
  return cexp(cmul(b, clog(a)));
};
// sin, cos (and sinh, cosh) of x + iy from the real functions; tan, cot, tanh as ratios
const csin = (a: C) => (a.im === 0 ? cx(Math.sin(a.re)) : cx(Math.sin(a.re) * Math.cosh(a.im), Math.cos(a.re) * Math.sinh(a.im)));
const ccos = (a: C) => (a.im === 0 ? cx(Math.cos(a.re)) : cx(Math.cos(a.re) * Math.cosh(a.im), -Math.sin(a.re) * Math.sinh(a.im)));
const csinh = (a: C) => (a.im === 0 ? cx(Math.sinh(a.re)) : cx(Math.sinh(a.re) * Math.cos(a.im), Math.cosh(a.re) * Math.sin(a.im)));
const ccosh = (a: C) => (a.im === 0 ? cx(Math.cosh(a.re)) : cx(Math.cosh(a.re) * Math.cos(a.im), Math.sinh(a.re) * Math.sin(a.im)));
const I = cx(0, 1);
// principal branches: asin z = −i log(iz + √(1 − z²)), acos z = π/2 − asin z, atan z = (i/2) log((1 − iz)/(1 + iz)); the
// real functions where the result is real (|x| ≤ 1 for asin, acos; any real x for atan)
const casin = (a: C): C => {
  if (a.im === 0 && Math.abs(a.re) <= 1) return cx(Math.asin(a.re));
  const w = clog(cadd(cmul(I, a), csqrt(csub(cx(1), cmul(a, a)))));
  return cx(w.im, -w.re);
};
const cacos = (a: C): C => {
  if (a.im === 0 && Math.abs(a.re) <= 1) return cx(Math.acos(a.re));
  const s = casin(a);
  return cx(Math.PI / 2 - s.re, 0 - s.im);
};
const catan = (a: C): C => {
  if (a.im === 0) return cx(Math.atan(a.re));
  const iz = cmul(I, a);
  const w = clog(cdiv(csub(cx(1), iz), cadd(cx(1), iz)));
  return cx(-w.im / 2, w.re / 2);
};
const realOnly = (f: (...x: number[]) => number) => (...a: C[]) => {
  if (a.some((z) => z.im !== 0)) return cx(NaN);
  return cx(f(...a.map((z) => z.re)));
};

const CFUNCS: Record<string, (...a: C[]) => C> = {
  real: (a) => cx(a.re),
  imag: (a) => cx(a.im),
  abs: (a) => cx(Math.hypot(a.re, a.im)),
  arg: (a) => cx(carg(a)),
  conj: (a) => cx(a.re, -a.im),
  sqrt: csqrt,
  exp: cexp,
  log: (a) => (a.im === 0 && a.re >= 0 ? cx(Math.log(a.re)) : clog(a)),
  log10: (a) => (a.im === 0 && a.re >= 0 ? cx(Math.log10(a.re)) : cdiv(clog(a), cx(Math.LN10))),
  pow: cpow,
  min: realOnly(Math.min),
  max: realOnly(Math.max),
  sin: csin,
  cos: ccos,
  tan: (a) => cdiv(csin(a), ccos(a)),
  cot: (a) => cdiv(ccos(a), csin(a)),
  ctan: (a) => cdiv(ccos(a), csin(a)),
  asin: casin,
  acos: cacos,
  atan: catan,
  atan2: realOnly(Math.atan2),
  sinh: csinh,
  cosh: ccosh,
  tanh: (a) => cdiv(csinh(a), ccosh(a)),
  deg: (a) => cx((a.re * 180) / Math.PI, (a.im * 180) / Math.PI),
  rad: (a) => cx((a.re * Math.PI) / 180, (a.im * Math.PI) / 180),
  step: realOnly((x) => (x >= 0 ? 1 : Number.isNaN(x) ? NaN : 0)),
};
export const COMPLEX_FUNCTION_NAMES = Object.keys(CFUNCS);

type FC = (v: Record<string, C>) => C;

// Complex formula: variables are complex (real quantities have Im = 0), `i` is the imaginary unit. Angles in radians
// (arg, the trigonometric functions; deg() and rad() convert); min(), max() and atan2() take real arguments (NaN otherwise).
export function compileComplex(src: string): CompiledC | string {
  const r = parse(src, ['pi', 'i'], COMPLEX_FUNCTION_NAMES);
  if (typeof r === 'string') return r;
  const NAN = cx(NaN);
  const build = (n: Ast): FC => {
    switch (n.k) {
      case 'num': {
        const z = cx(n.v);
        return () => z;
      }
      case 'const': {
        const z = n.v === 'i' ? cx(0, 1) : cx(Math.PI);
        return () => z;
      }
      case 'var':
        return (v) => v[n.v] ?? NAN;
      case 'neg': {
        const a = build(n.a);
        return (v) => {
          const z = a(v);
          return cx(-z.re, -z.im);
        };
      }
      case 'bin': {
        const [a, b] = [build(n.a), build(n.b)];
        if (n.op === '+')
          return (v) => {
            const [x, y] = [a(v), b(v)];
            return cx(x.re + y.re, x.im + y.im);
          };
        if (n.op === '-')
          return (v) => {
            const [x, y] = [a(v), b(v)];
            return cx(x.re - y.re, x.im - y.im);
          };
        if (n.op === '*') return (v) => cmul(a(v), b(v));
        if (n.op === '/') return (v) => cdiv(a(v), b(v));
        return (v) => cpow(a(v), b(v));
      }
      case 'call': {
        const fn = CFUNCS[n.f];
        const args = n.args.map(build);
        if (args.length === 1) {
          const [a] = args;
          return (v) => fn(a(v));
        }
        return (v) => fn(...args.map((a) => a(v)));
      }
    }
  };
  return { fn: build(r.ast), names: r.names };
}

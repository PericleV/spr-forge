// The Python side of a Python script, loaded once into Pyodide: the inputs made into variables (the data of a computation a
// Data: its quantities as N-D numpy arrays over its axes, .df a long pandas table; a material a Material: ñ(λ) tabulated;
// a number a float; a sweep an array), the code run (print kept; the last expression shown as Jupyter does), the
// variables it made given out by their kind (a number, an array, a Data, a Material, a pandas table), the figures of
// matplotlib drawn as SVG, the files it saved (savefig …), an error with its line.
export const RUNTIME = String.raw`
import sys, io, os, ast, traceback, time, math, shutil
# matplotlib's own drawing (Agg), as on a desktop: the files saved are those matplotlib makes everywhere
os.environ['MPLBACKEND'] = 'agg'
import warnings
warnings.filterwarnings('ignore', message=r'The \w+ parameter as float was deprecated')
import numpy as np


class Data:
    """Data of SPR Forge: quantities on a grid of axes.

    d.R, d['R']      a quantity as an N-D array, one dimension per axis (in the order of d.dims)
    d.axes['theta']  the values of an axis (d.dims: their ids, in order)
    d.units, d.labels  the unit and the name of every axis and quantity
    d.df             a long pandas table: a column per axis and per quantity, a row per point
    Data({'lambda': lam}, R=R, T=T) makes one (the arrays shaped as the axes, or flat in their order)."""

    def __init__(self, axes, name='', units=None, labels=None, **fields):
        if isinstance(axes, dict):
            items = list(axes.items())
        else:
            items = list(axes)
        object.__setattr__(self, 'axes', {str(k): np.asarray(v, dtype=float).ravel() for k, v in items})
        object.__setattr__(self, 'dims', [str(k) for k, _v in items])
        object.__setattr__(self, 'name', str(name))
        object.__setattr__(self, 'units', dict(units or {}))
        object.__setattr__(self, 'labels', dict(labels or {}))
        shape = self.shape
        size = int(np.prod(shape)) if shape else 1
        fs = {}
        for k, v in fields.items():
            a = np.asarray(v)
            if np.iscomplexobj(a):
                raise ValueError('%s is complex: give its real and imaginary parts as two quantities (np.real, np.imag)' % k)
            a = a.astype(float)
            if a.size != size:
                raise ValueError('%s has %d values; the axes %s make %d points' % (k, a.size, ' × '.join('%s (%d)' % (d, len(self.axes[d])) for d in self.dims), size))
            fs[str(k)] = a.reshape(shape) if shape else a.reshape(())
        object.__setattr__(self, 'fields', fs)

    @property
    def shape(self):
        return tuple(len(self.axes[d]) for d in self.dims)

    def __getattr__(self, k):
        f = self.__dict__.get('fields', {})
        if k in f:
            return f[k]
        raise AttributeError("no quantity '%s' (the quantities: %s)" % (k, ', '.join(f) or 'none'))

    def __getitem__(self, k):
        if k in self.fields:
            return self.fields[k]
        if k in self.axes:
            return self.axes[k]
        raise KeyError(k)

    def __contains__(self, k):
        return k in self.fields or k in self.axes

    def keys(self):
        return list(self.fields)

    @property
    def df(self):
        import pandas as pd
        cols = {}
        if self.dims:
            grids = np.meshgrid(*[self.axes[d] for d in self.dims], indexing='ij')
            for d, g in zip(self.dims, grids):
                cols[d] = g.ravel()
        for k, v in self.fields.items():
            cols[k] = np.asarray(v).ravel()
        return pd.DataFrame(cols)

    def __repr__(self):
        ax = ', '.join('%s (%d%s)' % (d, len(self.axes[d]), ', ' + self.units[d] if self.units.get(d) else '') for d in self.dims)
        return 'Data %r: %s over %s' % (self.name, ', '.join(self.fields) or 'no quantity', ax or 'one point')


class Material:
    """A material for the Layers of SPR Forge: its complex index ñ = n + ik tabulated over λ in nm.

    m.lam, m.n, m.k  the table (n complex: m.n_complex)
    m.nk(lam)        ñ at any λ (nm), interpolated
    m.eps(lam)       the permittivity ε = ñ²
    Material(lam, n, k, name='...') or Material(lam, n_complex) makes one (λ ascending or not)."""

    def __init__(self, lam, n, k=None, name=''):
        lam = np.atleast_1d(np.asarray(lam, dtype=float)).ravel()
        nn = np.atleast_1d(np.asarray(n)).ravel()
        if np.iscomplexobj(nn):
            kk = nn.imag.astype(float)
            nn = nn.real.astype(float)
        else:
            nn = nn.astype(float)
            kk = np.zeros_like(nn) if k is None else np.atleast_1d(np.asarray(k, dtype=float)).ravel()
        if len(nn) == 1 and len(lam) > 1:
            nn = np.full(len(lam), nn[0])
        if len(kk) == 1 and len(lam) > 1:
            kk = np.full(len(lam), kk[0])
        if not (len(lam) == len(nn) == len(kk)) or len(lam) == 0:
            raise ValueError('a material needs λ, n and k of the same length (here %d, %d, %d)' % (len(lam), len(nn), len(kk)))
        if not np.all(np.isfinite(lam)) or not np.all(np.isfinite(nn)) or not np.all(np.isfinite(kk)):
            raise ValueError('a material needs finite λ, n and k')
        order = np.argsort(lam)
        self.lam, self.n, self.k = lam[order], nn[order], kk[order]
        self.name = str(name)

    @property
    def n_complex(self):
        return self.n + 1j * self.k

    def nk(self, lam):
        lam = np.asarray(lam, dtype=float)
        return np.interp(lam, self.lam, self.n) + 1j * np.interp(lam, self.lam, self.k)

    def eps(self, lam):
        return self.nk(lam) ** 2

    def __repr__(self):
        return 'Material %r: %d wavelengths, %g to %g nm' % (self.name, len(self.lam), self.lam[0], self.lam[-1])


def _f(b):
    return np.frombuffer(bytes(b), dtype='<f8').copy()

def _var_in(v):
    k = v['kind']
    if k == 'value':
        return float(v['value'])
    if k == 'array':
        a = _f(v['values'])
        return float(a[0]) if len(a) == 1 else a
    if k == 'material':
        return Material(_f(v['lam']), _f(v['n']), _f(v['k']), v['name'])
    axes = [(a['id'], _f(a['values'])) for a in v['axes']]
    units = {a['id']: a['unit'] for a in v['axes'] if a.get('unit')}
    labels = {a['id']: a['label'] for a in v['axes']}
    shape = tuple(len(x) for _k, x in axes)
    fields = {}
    for f in v['fields']:
        fields[f['key']] = _f(f['values'])
        if f.get('unit'):
            units[f['key']] = f['unit']
        labels[f['key']] = f['label']
    d = Data(axes, name=v['name'], units=units, labels=labels, **fields)
    return d

def _b(a):
    return np.ascontiguousarray(np.asarray(a, dtype=float).ravel(), dtype='<f8').tobytes()

def _data_out(name, d):
    return {'name': name, 'kind': 'data',
            'axes': [{'id': k, 'label': str(d.labels.get(k, k)), 'unit': str(d.units.get(k, '')), 'values': _b(d.axes[k])} for k in d.dims],
            'fields': [{'key': k, 'label': str(d.labels.get(k, k)), 'unit': str(d.units.get(k, '')), 'values': _b(v)} for k, v in d.fields.items()]}

def _numeric(a):
    return a.dtype.kind in 'biuf'

def _frame_data(name, f):
    import pandas as pd
    if not isinstance(f.index, pd.RangeIndex) or f.index.name is not None:
        f = f.reset_index()
    cols = [c for c in f.columns if _numeric(f[c].to_numpy())]
    if not cols:
        return None
    if len(cols) == 1:
        return Data({'index': np.arange(len(f))}, name=name, **{str(cols[0]): f[cols[0]].to_numpy()})
    x = cols[0]
    return Data({str(x): f[x].to_numpy()}, name=name, **{str(c): f[c].to_numpy() for c in cols[1:]})

def _out(name, v):
    """The variable as an output, or None (and its type) when it is none of them."""
    if isinstance(v, bool) or isinstance(v, (int, float, np.integer, np.floating)):
        return {'name': name, 'kind': 'value', 'value': float(v)}
    if isinstance(v, Data):
        return _data_out(name, v)
    if isinstance(v, Material):
        return {'name': name, 'kind': 'material', 'lam': _b(v.lam), 'n': _b(v.n), 'k': _b(v.k), 'title': v.name}
    pd = sys.modules.get('pandas')
    if pd is not None and isinstance(v, pd.DataFrame):
        d = _frame_data(name, v)
        return _data_out(name, d) if d is not None else None
    if pd is not None and isinstance(v, pd.Series):
        return _out(name, v.to_frame(name=v.name if v.name is not None else name))
    if isinstance(v, np.ndarray):
        if not _numeric(v):
            return None
        if v.ndim == 0:
            return {'name': name, 'kind': 'value', 'value': float(v)}
        if v.ndim == 1:
            return {'name': name, 'kind': 'array', 'values': _b(v)}
        return _data_out(name, Data([('i%d' % k, np.arange(n)) for k, n in enumerate(v.shape)], name=name, **{name: v}))
    if isinstance(v, (list, tuple)) and v and all(isinstance(x, (int, float, np.integer, np.floating)) and not isinstance(x, bool) for x in v):
        return {'name': name, 'kind': 'array', 'values': _b(np.asarray(v, dtype=float))}
    return None

def _display(v):
    if v is None:
        return None
    pd = sys.modules.get('pandas')
    if pd is not None and isinstance(v, pd.Series):
        v = v.to_frame()
    if pd is not None and isinstance(v, pd.DataFrame):
        head = v.head(30)
        show = head if isinstance(head.index, pd.RangeIndex) and head.index.name is None else head.reset_index()
        cols = [str(c) for c in show.columns]
        rows = [[_cell(x) for x in r] for r in show.itertuples(index=False)]
        return {'table': {'columns': cols, 'rows': rows, 'total': int(len(v))}}
    return {'text': repr(v)[:20000]}

def _cell(x):
    if isinstance(x, float):
        return '' if math.isnan(x) else ('%.6g' % x)
    return str(x)

_RUN = [0]

def _run(code, inputs):
    """Runs the code with the inputs: the outputs, the printed text, the last expression, the figures, the files, an error."""
    _RUN[0] += 1
    g = {'__name__': '__main__', 'np': np, 'Data': Data, 'Material': Material}
    for item in inputs:
        g[item['name']] = _var_in(item['value'])
    before = set(g)
    given = {k: g[k] for k in before}
    out, err = io.StringIO(), io.StringIO()
    old = sys.stdout, sys.stderr, os.getcwd()
    work = '/home/pyodide/run%d' % _RUN[0]
    os.makedirs(work, exist_ok=True)
    plt = sys.modules.get('matplotlib.pyplot')
    if plt is not None:
        plt.close('all')
    shown, error = None, None
    t0 = time.time()
    try:
        sys.stdout, sys.stderr = out, err
        os.chdir(work)
        tree = ast.parse(code, '<script>')
        last = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = ast.Expression(tree.body.pop().value)
        exec(compile(tree, '<script>', 'exec'), g)
        if last is not None:
            shown = eval(compile(last, '<script>', 'eval'), g)
    except BaseException as e:
        line = None
        if isinstance(e, SyntaxError) and e.filename == '<script>':
            line = e.lineno
        for fr in traceback.extract_tb(e.__traceback__):
            if fr.filename == '<script>':
                line = fr.lineno
        msg = ''.join(traceback.format_exception_only(type(e), e)).strip()
        error = {'message': msg}
        if line:
            error['line'] = line
    finally:
        sys.stdout, sys.stderr = old[0], old[1]
        os.chdir(old[2])
    ms = int((time.time() - t0) * 1000)
    outputs, skipped = [], []
    if error is None:
        for k, v in list(g.items()):
            # (the inputs given out only when the code made them anew)
            if (k in before and given.get(k) is v) or k.startswith('_') or isinstance(v, type(sys)) or (callable(v) and not isinstance(v, np.ndarray)):
                continue
            mpl = sys.modules.get('matplotlib.figure')
            if mpl is not None and isinstance(v, (mpl.Figure,)):
                continue
            axmod = sys.modules.get('matplotlib.axes')
            if axmod is not None and isinstance(v, axmod.Axes):
                continue
            try:
                o = _out(k, v)
            except Exception as e:
                err.write('%s could not be given out: %s\n' % (k, e))
                o = None
            if o is None:
                skipped.append({'name': k, 'type': type(v).__name__})
            else:
                outputs.append(o)
    figures = []
    plt = sys.modules.get('matplotlib.pyplot')
    if plt is not None:
        for num in plt.get_fignums():
            fig = plt.figure(num)
            buf = io.StringIO()
            try:
                fig.savefig(buf, format='svg')
                figures.append({'num': int(num), 'svg': buf.getvalue()})
            except Exception as e:
                err.write('The figure %d could not be drawn: %s\n' % (num, e))
        plt.close('all')
    files = []
    for root, _dirs, names in os.walk(work):
        for nm in sorted(names):
            p = os.path.join(root, nm)
            with open(p, 'rb') as f:
                files.append({'name': os.path.relpath(p, work).replace(os.sep, '/'), 'bytes': f.read()})
    shutil.rmtree(work, ignore_errors=True)
    text = out.getvalue() + err.getvalue()
    if len(text) > 200000:
        text = '(the start left out)\n' + text[-200000:]
    try:
        disp = _display(shown) if error is None else None
    except Exception as e:
        disp = {'text': '(could not be shown: %s)' % e}
    res = {'outputs': outputs, 'skipped': skipped, 'console': text, 'figures': figures, 'files': files, 'ms': ms}
    if disp is not None:
        res['display'] = disp
    if error is not None:
        res['error'] = error
    return res
`;

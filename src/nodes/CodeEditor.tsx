// The code editor of a Python script: CodeMirror 6 (MIT; https://codemirror.net) with Python — line numbers, the
// indentation kept with care (4 spaces; Tab / Shift+Tab indent and unindent, also several lines; Enter after “:” indents,
// after return / pass … goes back; Backspace takes an indent away; tabs pasted become spaces), brackets closed and matched,
// Ctrl+/ comments, Ctrl+F finds, Ctrl+Enter runs, completion of the inputs' names and of numpy, scipy, pandas,
// matplotlib names, the line of an error marked. Loaded only when a Python script is on the canvas.
import { useEffect, useRef } from 'react';
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, drawSelection, type DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentLess, indentMore, insertNewlineAndIndent } from '@codemirror/commands';
import { bracketMatching, foldGutter, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completeFromList, completionKeymap, type Completion } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { python, pythonLanguage } from '@codemirror/lang-python';
import { tags as t } from '@lezer/highlight';

// names offered as the code is typed (besides the inputs and the words of Python itself)
const NAMES: [string, string][] = [
  ['np', 'numpy'],
  ['pd', 'pandas'],
  ['plt', 'matplotlib.pyplot'],
  ...'array asarray linspace arange zeros ones full mean median std var sum cumsum min max argmin argmax abs sqrt exp log log10 sin cos tan pi interp polyfit polyval gradient diff where isnan nanmean nanstd concatenate column_stack vstack hstack reshape sort argsort unique percentile histogram trapezoid'
    .split(' ')
    .map((n): [string, string] => [`np.${n}`, 'numpy']),
  ...'curve_fit minimize least_squares root_scalar differential_evolution'.split(' ').map((n): [string, string] => [n, 'scipy.optimize']),
  ...'ttest_ind ttest_rel ttest_1samp mannwhitneyu wilcoxon kruskal f_oneway pearsonr spearmanr shapiro levene linregress norm t chi2 dunnett tukey_hsd'.split(' ').map((n): [string, string] => [n, 'scipy.stats']),
  ...'savgol_filter find_peaks butter sosfiltfilt welch'.split(' ').map((n): [string, string] => [n, 'scipy.signal']),
  ...'DataFrame read_csv concat merge to_numeric'.split(' ').map((n): [string, string] => [`pd.${n}`, 'pandas']),
  ...'subplots figure plot scatter errorbar fill_between xlabel ylabel title legend xlim ylim xscale yscale savefig tight_layout show'.split(' ').map((n): [string, string] => [`plt.${n}`, 'matplotlib']),
  ['from scipy.optimize import curve_fit', 'import'],
  ['from scipy import stats', 'import'],
  ['import pandas as pd', 'import'],
  ['import matplotlib.pyplot as plt', 'import'],
  ['Data', 'SPR Forge: Data({"lambda": lam}, R=R): quantities on a grid of axes (.axes, .dims, .df)'],
  ['Material', 'SPR Forge: Material(lam_nm, n, k, name=""): a material for a Layer (.nk(lam), .eps(lam))'],
];

// the line of an error: marked
const setError = StateEffect.define<number | null>();
const errorLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects)
      if (e.is(setError)) {
        const n = e.value;
        deco = n && n >= 1 && n <= tr.state.doc.lines ? Decoration.set([Decoration.line({ class: 'cm-error-line' }).range(tr.state.doc.line(n).from)]) : Decoration.none;
      }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// colours readable on the light and the dark theme
const highlight = HighlightStyle.define([
  { tag: t.keyword, color: '#c678dd' },
  { tag: [t.string, t.special(t.string)], color: '#4e9a06' },
  { tag: t.comment, color: '#8a8f98', fontStyle: 'italic' },
  { tag: [t.number, t.bool, t.null], color: '#d08770' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#3b8eea' },
  { tag: t.definition(t.variableName), color: '#2aa198' },
  { tag: t.className, color: '#b58900' },
  { tag: t.operator, color: '#7f8c98' },
]);

// Enter: a new line indented as Python wants it — after “:” one level more (the language does it), after return, pass,
// break, continue or raise one level less (that block ends)
const newline = (v: EditorView) => {
  const line = v.state.doc.lineAt(v.state.selection.main.head);
  const ends = /^\s*(return|pass|break|continue|raise)\b/.test(line.text) && v.state.selection.main.empty;
  insertNewlineAndIndent(v);
  if (!ends) return true;
  const now = v.state.doc.lineAt(v.state.selection.main.head);
  const indent = /^ */.exec(now.text)![0].length;
  if (indent >= 4 && now.text.trim() === '') v.dispatch({ changes: { from: now.from, to: now.from + 4 } });
  return true;
};

// tabs pasted (a notebook, a file): spaces, 4 a level
const tabsToSpaces = EditorState.transactionFilter.of((tr) => {
  if (!tr.isUserEvent('input.paste') || !tr.docChanged) return tr;
  let has = false;
  tr.changes.iterChanges((_a, _b, _c, _d, ins) => (has ||= ins.toString().includes('\t')));
  if (!has) return tr;
  const changes: { from: number; to: number; insert: string }[] = [];
  tr.changes.iterChanges((fromA, toA, _fb, _tb, ins) => changes.push({ from: fromA, to: toA, insert: ins.toString().replace(/\t/g, '    ') }));
  return { changes, selection: tr.selection, userEvent: 'input.paste' };
});

export function CodeEditor({ value, onChange, onRun, names, error, height = 220 }: { value: string; onChange: (v: string) => void; onRun: () => void; names: string[]; error?: number; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onRun, names });
  useEffect(() => {
    cb.current = { onChange, onRun, names };
  });
  useEffect(() => {
    if (!host.current) return;
    const words: Extension = pythonLanguage.data.of({
      autocomplete: (ctx: Parameters<ReturnType<typeof completeFromList>>[0]) =>
        completeFromList([...cb.current.names.map((n): Completion => ({ label: n, type: 'variable', detail: 'input' })), ...NAMES.map(([label, detail]): Completion => ({ label, detail, type: label.includes('import') ? 'keyword' : 'function' }))])(ctx),
    });
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          foldGutter(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          python(),
          words,
          indentUnit.of('    '),
          EditorState.tabSize.of(4),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          highlightSelectionMatches(),
          syntaxHighlighting(highlight),
          errorLine,
          tabsToSpaces,
          keymap.of([
            { key: 'Mod-Enter', run: () => (cb.current.onRun(), true) },
            { key: 'Tab', run: indentMore, shift: indentLess },
            { key: 'Enter', run: newline },
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
          }),
          EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { overflow: 'auto' } }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // the editor is made once; its text follows `value` below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // a change from outside (undo of the app, an example chosen): the editor's text replaced
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({ effects: setError.of(error ?? null) });
  }, [error, value]);
  return <div className="code-editor nodrag nowheel nokey" ref={host} style={{ height }} />;
}

export default CodeEditor;

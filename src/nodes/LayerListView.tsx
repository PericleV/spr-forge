// The layer list of a structure as a table that opens on demand, with Copy (tab-separated, pastes into a spreadsheet)
// and CSV export — View Stack and View Grating.
import { useMemo, useState } from 'react';
import { layerList, layerListCsv, layerListTsv } from '../engine/layerList.ts';
import type { StackValue } from '../engine/types.ts';
import { download } from '../plot/export.ts';

const fmt = (d: number | null) => (d === null ? '—' : String(+d.toFixed(2)));

export function LayerListView({ stack, name }: { stack: StackValue; name: string }) {
  const list = useMemo(() => layerList(stack), [stack]);
  const [copied, setCopied] = useState<'' | 'ok' | 'failed'>('');
  const copy = () =>
    navigator.clipboard.writeText(layerListTsv(list)).then(
      () => setCopied('ok'),
      () => setCopied('failed'),
    );
  const file = `${name.replace(/[^\w.-]+/g, '_') || 'structure'}-layers.csv`;
  return (
    <details className="nodrag layer-list" onToggle={() => setCopied('')}>
      <summary>
        Layer list ({list.count} layer{list.count === 1 ? '' : 's'} · {fmt(list.total)} nm)
      </summary>
      <div className="row">
        <button className="nodrag" title="Copy the table (tab-separated: pasted into a spreadsheet it fills the columns)" onClick={copy}>
          Copy
        </button>
        <button className="nodrag" title="Export the table as a CSV file" onClick={() => download(layerListCsv(list), file, 'text/csv')}>
          CSV
        </button>
        {copied === 'ok' && <span className="muted">copied</span>}
        {copied === 'failed' && <span className="muted">the browser refused the clipboard: select the table and copy it</span>}
      </div>
      <div className="layer-table nowheel">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>layer</th>
              <th>material</th>
              <th className="num">d [nm]</th>
              <th>details</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((r, k) => (
              <tr key={k} className={r.sub ? 'sub' : r.d === null || r.no === 'sub' ? 'medium' : ''}>
                <td>{r.no}</td>
                <td>{r.layer}</td>
                <td>{r.material}</td>
                <td className="num">{fmt(r.d)}</td>
                <td>{r.details}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>total (films)</td>
              <td />
              <td className="num">{fmt(list.total)}</td>
              <td>{list.count} layer{list.count === 1 ? '' : 's'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </details>
  );
}

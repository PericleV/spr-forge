// The examples menu of the top bar: the subjects on the left, the examples of the one chosen on the right (by their
// headings, each with its line), a search over all of them; the arrows and Enter choose without the mouse.
import { Popover } from '@mantine/core';
import { BookOpen, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { matches, sectionsOf, type ExampleInfo } from './exampleSections.ts';
import { IC } from './ui/iconProps.ts';

export function ExamplesMenu({ examples, onPick }: { examples: ExampleInfo[]; onPick: (index: number) => void }) {
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [pointed, setActive] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const all = useMemo(() => sectionsOf(examples), [examples]);
  const shownGroup = group || all[0]?.group || '';
  const searching = query.trim() !== '';
  // shown: the subject chosen, or (a search) the matches of all subjects
  const shown = useMemo(() => (searching ? sectionsOf(examples, matches(query)) : all.filter((s) => s.group === shownGroup)), [searching, examples, query, all, shownGroup]);
  const order = useMemo(() => shown.flatMap((s) => s.subs.flatMap((b) => b.items.map((it) => it.i))), [shown]);
  // the example the arrows and Enter act on: the one pointed at, else the first shown
  const active = order.includes(pointed) ? pointed : (order[0] ?? -1);
  useEffect(() => {
    listRef.current?.querySelector(`[data-ex="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  // a press anywhere else closes it (caught before the canvas, which keeps its presses from the page)
  useEffect(() => {
    if (!opened) return;
    const down = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('.examples-pop, .examples-btn')) setOpened(false);
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [opened]);

  const pick = (i: number) => {
    setOpened(false);
    onPick(i);
  };
  const onKey = (e: KeyboardEvent) => {
    const k = order.indexOf(active);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!order.length) return;
      const next = e.key === 'ArrowDown' ? (k + 1) % order.length : (k - 1 + order.length) % order.length;
      setActive(order[next]);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(active);
    }
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" offset={6} trapFocus returnFocus>
      <Popover.Target>
        <button className={`examples-btn${opened ? ' active' : ''}`} onClick={() => setOpened((o) => !o)} title="Open a complete example" aria-haspopup="dialog" aria-expanded={opened}>
          <BookOpen {...IC} /> <span className="tb-label">Examples</span> <ChevronDown {...IC} className="icon chevron" />
        </button>
      </Popover.Target>
      <Popover.Dropdown className="examples-pop" onKeyDown={onKey}>
        <div className="examples-search">
          <Search {...IC} />
          <input
            autoFocus
            // (the last search kept, selected: typing starts a new one)
            onFocus={(e) => e.currentTarget.select()}
            value={query}
            placeholder={`Search ${examples.length} examples (name, method, author)`}
            aria-label="Search the examples"
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && (
            <button className="examples-clear" onClick={() => setQuery('')} aria-label="Clear the search" title="Clear the search">
              <X {...IC} />
            </button>
          )}
        </div>
        <div className="examples-body">
          <nav className="examples-nav" aria-label="Subjects">
            {all.map((s) => (
              <button
                key={s.group}
                className={!searching && s.group === shownGroup ? 'on' : ''}
                onClick={() => {
                  setQuery('');
                  setGroup(s.group);
                }}
              >
                <span>{s.group}</span>
                <small>{s.count}</small>
              </button>
            ))}
          </nav>
          <div className="examples-list" ref={listRef} role="listbox" aria-label="Examples">
            {!examples.length && <div className="hint">Loading the examples</div>}
            {examples.length > 0 && !order.length && <div className="hint">No example matches “{query.trim()}”.</div>}
            {shown.map((s) => (
              <section key={s.group}>
                {searching && <h4>{s.group}</h4>}
                {s.subs.map((b) => (
                  <div key={b.sub} className="examples-sub">
                    {b.sub && <h5>{b.sub}</h5>}
                    {b.items.map(({ ex, i }) => (
                      <button
                        key={i}
                        data-ex={i}
                        role="option"
                        aria-selected={i === active}
                        className={`examples-item${i === active ? ' on' : ''}`}
                        onMouseMove={() => i !== active && setActive(i)}
                        onClick={() => pick(i)}
                      >
                        <b>{ex.name}</b>
                        <span>{ex.desc}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
        <div className="examples-foot muted">↑ ↓ to move · Enter to open · Esc to close</div>
      </Popover.Dropdown>
    </Popover>
  );
}

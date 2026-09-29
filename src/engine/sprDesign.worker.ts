// Worker of the Optimization Engine's layer-sequence genetic algorithm: runs it off the UI thread. The fitness of every
// population is sent (for the scatter of the whole population), the rest at most ~7 times per second.
import { runSprGa, type SprProblem, type SprProgress, type SprSettings } from './sprDesign.ts';

export type SprMsg = { type: 'start'; problem: SprProblem; settings: SprSettings } | { type: 'stop' };
export type SprPopulation = { generation: number; fitness: number[] };
export type SprOut = { type: 'progress'; progress: SprProgress; populations: SprPopulation[] } | { type: 'done'; progress?: SprProgress; populations: SprPopulation[]; error?: string };

let stop = false;

self.onmessage = async (e: MessageEvent<SprMsg>) => {
  const m = e.data;
  if (m.type === 'stop') {
    stop = true;
    return;
  }
  stop = false;
  let last = 0;
  let populations: SprPopulation[] = [];
  try {
    const result = await runSprGa(
      m.problem,
      m.settings,
      (p) => {
        if (p.phase === 'evolve') populations.push({ generation: p.generation, fitness: p.population });
        const now = Date.now();
        if (now - last < 150) return;
        last = now;
        self.postMessage({ type: 'progress', progress: p, populations } satisfies SprOut);
        populations = [];
      },
      // yielding lets the 'stop' message in
      { stopped: () => stop, tick: () => new Promise((r) => setTimeout(r, 0)) },
    );
    self.postMessage({ type: 'done', progress: result, populations } satisfies SprOut);
  } catch (err) {
    self.postMessage({ type: 'done', populations, error: err instanceof Error ? err.message : String(err) } satisfies SprOut);
  }
};

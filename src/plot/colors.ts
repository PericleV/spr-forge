// Viridis (sequential, for maps and long curve families) and Tableau 10 (few categorical curves).
const VIRIDIS = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
const TABLEAU = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const STOPS = VIRIDIS.map(hex);

export function viridis(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const [a, b] = [STOPS[i], STOPS[i + 1]];
  return [0, 1, 2].map((k) => Math.round(a[k] + f * (b[k] - a[k]))) as [number, number, number];
}

export const VIRIDIS_LUT: Uint8Array = (() => {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) lut.set(viridis(i / 255), i * 3);
  return lut;
})();

export const VIRIDIS_STOPS = VIRIDIS;

export function seriesColor(i: number, n: number): string {
  if (n === 1) return 'var(--line)';
  if (n <= TABLEAU.length) return TABLEAU[i];
  const [r, g, b] = viridis((0.9 * i) / (n - 1));
  return `rgb(${r} ${g} ${b})`;
}

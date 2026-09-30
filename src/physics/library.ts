import builtins from './builtins.json' with { type: 'json' };
import articles from './articles.json' with { type: 'json' };
import type { MaterialDef } from './materials.ts';

// Sections of the library, in order; the user's own materials come after them.
export const ARTICLES_GROUP = 'From articles (examples)';
export const MATERIAL_GROUPS = ['Media and glasses', 'Dielectrics', 'Metals', 'Semiconductors', '2D materials', 'Anisotropic (n_o, n_e)', ARTICLES_GROUP];
export const USER_GROUP = 'Your materials';

// refractiveindex.info data (scripts/gen-builtins.ts) and the values of the articles the examples reproduce
// (scripts/gen-articles.ts): all of them in every project.
export const BUILTINS = [...(builtins as MaterialDef[]), ...(articles as MaterialDef[])];

export type Library = Map<string, MaterialDef>;

export const makeLibrary = (user: MaterialDef[]): Library => new Map([...BUILTINS, ...user].map((m) => [m.id, m]));

export const groupOf = (m: MaterialDef) => (m.builtin ? (m.group ?? 'Dielectrics') : USER_GROUP);

// The materials of a set of projects as built-in article materials (first definition of each id; the same id must have
// the same model everywhere).
// Their names carry the article (“H (n = 1.96) · Jena 2021”): several have the same short name.
const articleTag = (source = '') => {
  const a = /([A-Z][a-zé]+) et al\.[^()]*\((\d{4})\)/.exec(source);
  if (a) return `${a[1]} ${a[2]}`;
  const oic = /OIC (\d{4})/.exec(source);
  return oic ? `OIC ${oic[1]}` : '';
};
export function articleMaterials(projects: { materials: MaterialDef[] }[]): MaterialDef[] {
  const out = new Map<string, MaterialDef>();
  for (const p of projects)
    for (const m of p.materials) {
      const prev = out.get(m.id);
      const tag = articleTag(m.source);
      const def: MaterialDef = { ...m, name: tag && !m.name.includes(tag) ? `${m.name} · ${tag}` : m.name, builtin: true, group: ARTICLES_GROUP };
      if (prev && JSON.stringify(prev.model) !== JSON.stringify(def.model)) throw new Error(`material ${m.id}: two different models in the examples`);
      if (!prev) out.set(m.id, def);
    }
  return [...out.values()];
}

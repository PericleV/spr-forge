// Regenerates src/physics/articles.json: the materials of the example projects (values from the articles they reproduce),
// built into the library under “From articles (examples)”, so that they are available in every project.
// Usage: node scripts/gen-articles.ts   (check:tmm verifies that the file matches the examples)
import { writeFileSync } from 'node:fs';
import { EXAMPLES } from '../src/examples.ts';
import { articleMaterials } from '../src/physics/library.ts';

const out = articleMaterials(EXAMPLES.map((e) => e.make()));
writeFileSync('src/physics/articles.json', JSON.stringify(out, null, 1) + '\n');
console.log(`${out.length} materials: ${out.map((m) => m.id).join(', ')}`);

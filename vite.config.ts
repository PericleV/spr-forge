import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The npm packages whose code is in the build, the page's and every worker's (workers are built on their own, before the
// page's files are written): their licences go with the copy, as MIT, ISC and BSD ask.
const used = new Set<string>()
const packageOf = (id: string) => {
  const all = [...id.replace(/\\/g, '/').matchAll(/node_modules\/((?:@[^/]+\/)?[^/?]+)/g)]
  return all.length ? all[all.length - 1][1] : null
}
const collectPackages = (): Plugin => ({
  name: 'collect-packages',
  generateBundle(_, bundle) {
    for (const out of Object.values(bundle))
      if (out.type === 'chunk')
        for (const id of Object.keys(out.modules)) {
          const p = packageOf(id)
          if (p) used.add(p)
        }
  },
})

// third-party-licenses.txt next to index.html: name, version, licence and home of every package, then its licence file
function thirdPartyLicenses(): Plugin {
  const collect = collectPackages()
  return {
    name: 'third-party-licenses',
    apply: 'build',
    generateBundle(options, bundle, isWrite) {
      ;(collect.generateBundle as (this: unknown, ...a: unknown[]) => void).call(this, options, bundle, isWrite)
      const parts = [...used].sort().map((name) => {
        const dir = join('node_modules', name)
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version?: string; license?: string; homepage?: string; repository?: string | { url?: string }; author?: string | { name?: string } }
        const home = pkg.homepage ?? (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url)?.replace(/^git\+|\.git$/g, '')
        const file = existsSync(dir) ? readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f)) : undefined
        const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name
        const text = file ? readFileSync(join(dir, file), 'utf8').trim() : `(The package ships no licence file; package.json gives the licence ${pkg.license ?? '?'}${author ? `, author ${author}` : ''}.)`
        return [`${name} ${pkg.version ?? ''} (${pkg.license ?? '?'})`, home ?? '', '', text].join('\n')
      })
      const head = [
        'Third-party software in SPR Forge',
        '=================================',
        '',
        'SPR Forge itself is under the MIT licence (LICENSE in https://github.com/PericleV/spr-forge).',
        `Its JavaScript files contain code of the ${parts.length} packages below; each one's licence follows.`,
        'Python (Pyodide) and its packages are not part of these files: the browser downloads them from their own',
        'servers when a Python script first runs (see the README).',
      ].join('\n')
      this.emitFile({ type: 'asset', fileName: 'third-party-licenses.txt', source: [head, ...parts].join(`\n\n${'-'.repeat(79)}\n`) + '\n' })
    },
  }
}

// https://vite.dev/config/
// base './': relative asset paths, so the build works from any folder of any static host (no server needed);
// ES-module workers (the filter design worker starts sub-workers of its own)
export default defineConfig({
  base: './',
  plugins: [react(), thirdPartyLicenses()],
  worker: { format: 'es', plugins: () => [collectPackages()] },
})

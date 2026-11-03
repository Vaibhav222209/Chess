import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const stockfishRoot = dirname(require.resolve('stockfish/package.json'))
const sourceRoot = join(stockfishRoot, 'src')
const outputRoot = join(projectRoot, 'public', 'engine')
const assets = await readdir(sourceRoot)
const worker = assets.find((name) => /^stockfish-17\.1-lite-single(?:-[a-f0-9]+)?\.js$/.test(name))

if (!worker || !assets.includes(worker.replace(/\.js$/, '.wasm'))) {
  throw new Error('Stockfish 17.1 single-threaded lite worker and WASM assets were not found. Run npm ci.')
}

await mkdir(outputRoot, { recursive: true })
await Promise.all([
  copyFile(join(sourceRoot, worker), join(outputRoot, 'stockfish-17.1-lite-single.js')),
  copyFile(join(sourceRoot, worker.replace(/\.js$/, '.wasm')), join(outputRoot, 'stockfish-17.1-lite-single.wasm')),
  copyFile(join(stockfishRoot, 'Copying.txt'), join(outputRoot, 'Copying.txt')),
  copyFile(join(stockfishRoot, 'AUTHORS'), join(outputRoot, 'AUTHORS')),
  writeFile(join(outputRoot, 'SOURCE.md'), `# Stockfish.js 17.1\n\nStockfish.js is distributed under GPLv3. See Copying.txt and AUTHORS.\n\nCorresponding source and build instructions: https://github.com/nmrugg/stockfish.js/tree/v17.1.0\nSource archive: https://github.com/nmrugg/stockfish.js/archive/refs/tags/v17.1.0.tar.gz\nUpstream Stockfish: https://github.com/official-stockfish/Stockfish\nPackage: https://www.npmjs.com/package/stockfish/v/17.1.0\n\nThe single-threaded lite JavaScript loader and its WebAssembly binary are copied, unmodified, from stockfish@17.1.0; the asset pair is renamed for a stable public URL.\n`),
])
console.log('Prepared Stockfish 17.1 single-threaded lite browser engine (GPLv3).')

#!/usr/bin/env node
/**
 * Convert an SVG source into a multi-resolution ICO file.
 *
 * This is the SVG -> ICO half of the local launcher toolchain. It keeps the
 * icon as a real source: the launcher points at this script's output, so
 * editing generate-icon.svg and re-running is all a rebuild needs.
 *
 * ICO entries use PNG-compressed payloads (256x256 and below), which Windows
 * Vista and later renders natively. The format writer here emits ICONDIR +
 * one ICONDIRENTRY per size, each followed by its PNG bytes; zero width/height
 * fields encode the 256 decode size.
 *
 * Depends on `sharp` for rasterizing. Sharp is not a repository dependency:
 * callers pass its module path on `SHARP_MODULE` (absolute path to a
 * `sharp/package.json` include dir, that is, the installed `sharp` directory),
 * e.g.:
 *
 *   SHARP_MODULE="$DSH_profile\node_modules\sharp" node convert-svg-to-ico.mjs \
 *     --svg favicon.svg --out dsh-icon.ico
 *
 * @param {NodeJS.ProcessEnv} process.env - read `SHARP_MODULE`; also `NODE_ENV`.
 * @returns {void}
 */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

/** ICO entry layout header sizes (bytes). */
const ICONDIR_SIZE = 6
const ICONDIR_ENTRY_SIZE = 16

/**
 * Ordered icon resolutions to embed, largest-friendly for Explorer scaling.
 * 256 uses the reserved encoded size 0 in an ICO entry header.
 * @type {ReadonlyArray<number>}
 */
const SIZES = [256, 128, 64, 48, 32, 24, 16]

/**
 * Resolve a `sharp` module loader from `SHARP_MODULE` or the caller's own
 * resolution. Returns a require-able module object.
 * @param {string|undefined} sharpModule - absolute installed sharp dir from
 *   `SHARP_MODULE`
 * @returns {object} sharp module (with a default `create`/`convert` / png gate)
 */
function loadSharp(sharpModule) {
  const req = createRequire(import.meta.url)
  if (sharpModule !== undefined && sharpModule !== '') {
    // Sharp ships a CJS runtime; require of the directory resolves its `main`.
    return req(sharpModule)
  }
  return req('sharp')
}

/**
 * Render the SVG to one PNG at `size` via sharp.
 * @param {object} sharp - sharp module (see {@link loadSharp})
 * @param {string} svgPath - absolute path of the source SVG
 * @param {number} size - square edge length in px
 * @returns {Promise<Buffer>} PNG bytes
 */
async function renderPng(sharp, svgPath, size) {
  // density 96 renders the SVG's width/height at 1 CSS px = 1 image px; resize
  // then upscales to the requested icon size. The favicon viewBox is square.
  const img = sharp(svgPath, { density: 96 })
  return img.resize(size, size).png().toBuffer()
}

/**
 * Parse `--key value` and `--key=value` arguments from an argv.
 * @param {string[]} argv - argv minus the node/script entries
 * @returns {Object<string,string>}
 */
function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      if (eq !== -1) {
        out[arg.slice(2, eq)] = arg.slice(eq + 1)
      } else {
        const value = argv[i + 1]
        out[arg.slice(2)] = value === undefined ? 'true' : value
        if (value !== undefined) i += 1
      }
    }
  }
  return out
}

/**
 * Build a .ico from PNG buffers per size.
 * @param {Array<{size:number, data:Buffer}>} pngs
 * @returns {Buffer} ICO bytes
 */
function buildIco(pngs) {
  const header = Buffer.alloc(ICONDIR_SIZE)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(2, 2) // type = icon
  header.writeUInt16LE(pngs.length, 4)
  const entries = Buffer.alloc(pngs.length * ICONDIR_ENTRY_SIZE)
  let offset = ICONDIR_SIZE + entries.length
  pngs.forEach(({ size, data }, i) => {
    const e = i * ICONDIR_ENTRY_SIZE
    entries[e] = size >= 256 ? 0 : size // width (0 == 256)
    entries[e + 1] = size >= 256 ? 0 : size // height
    entries[e + 2] = 0 // colors
    entries[e + 3] = 0 // reserved
    entries[e + 4] = 1 // planes
    entries[e + 6] = 32 // bpp
    entries.writeUInt16LE(data.length, e + 8)
    entries.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([header, entries, ...pngs.map(p => p.data)])
}

const args = parseArgs(process.argv.slice(2))
const svgArg = args.svg
const outArg = args.out ?? 'dsh-icon.ico'
if (svgArg === undefined) {
  console.error('usage: convert-svg-to-ico.mjs --svg <file.svg> [--out <icon.ico>]')
  process.exit(2)
}

const svgFile = resolve(process.cwd(), svgArg)
const outFile = resolve(process.cwd(), outArg)
const sharp = loadSharp(process.env.SHARP_MODULE)
const pngs = []
for (const size of SIZES) {
  const data = await renderPng(sharp, svgFile, size)
  pngs.push({ size, data })
  console.error(`rendered ${size}x${size}: ${data.length} bytes`)
}
const ico = buildIco(pngs)
await writeFile(outFile, ico)
console.log(`wrote ${outFile} (${ico.length} bytes, ${pngs.length} sizes)`)
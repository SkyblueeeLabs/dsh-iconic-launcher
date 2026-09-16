#!/usr/bin/env node
/**
 * Batch-convert a folder of square PNGs into multi-resolution ICO files.
 *
 * The PNG half of the local launcher toolchain: `convert-svg-to-ico.mjs` turns
 * one SVG into one icon, this turns N bitmaps into N icons (the launcher's
 * `data/<group>/` source folders).
 *
 * ICO entries use PNG-compressed payloads (256x256 and below), which Windows
 * Vista and later renders natively. Layout is ICONDIR + one ICONDIRENTRY per
 * size, each followed by its PNG bytes; zero width/height encodes the 256
 * decode size — identical to `convert-svg-to-ico.mjs`, and to `plugin/ico.js`.
 *
 * Depends on `sharp` for rasterizing. Sharp is not a repository dependency:
 * callers pass its module path on `SHARP_MODULE` (absolute path to an installed
 * `sharp` directory), e.g.:
 *
 *   SHARP_MODULE="$DSH_HOME/profiles/node_modules/sharp" node \
 *     scripts/convert-png-to-ico.mjs --src data/1 --out plugin/presets/assets/group-1
 *
 * @param {NodeJS.ProcessEnv} process.env - reads `SHARP_MODULE`.
 * @returns {void}
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'

/** ICO entry layout header sizes (bytes). */
const ICONDIR_SIZE = 6
const ICONDIR_ENTRY_SIZE = 16

/**
 * Ordered icon resolutions to embed. 256 uses the reserved encoded size 0 in an
 * ICO entry header. Sources here are ~300px, so every entry is a downsample.
 * @type {ReadonlyArray<number>}
 */
const SIZES = [256, 128, 64, 48, 32, 24, 16]

/**
 * Resolve a `sharp` module from `SHARP_MODULE` or the caller's own resolution.
 * @param {string|undefined} sharpModule - absolute installed sharp dir
 * @returns {object} sharp module (CJS runtime)
 */
function loadSharp(sharpModule) {
  const req = createRequire(import.meta.url)
  if (sharpModule !== undefined && sharpModule !== '') return req(sharpModule)
  return req('sharp')
}

/**
 * Build a .ico from PNG buffers, one per size.
 *
 * The payload length field is 32-bit, not 16-bit: a 256px PNG routinely
 * exceeds 64 KiB, and a 16-bit write would silently corrupt the directory.
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
    entries[e + 2] = 0 // palette colors
    entries[e + 3] = 0 // reserved
    entries[e + 4] = 1 // planes
    entries[e + 6] = 32 // bpp
    entries.writeUInt32LE(data.length, e + 8)
    entries.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([header, entries, ...pngs.map(p => p.data)])
}

/**
 * Parse `--key value` / `--key=value` arguments.
 * @param {string[]} argv - argv minus the node/script entries
 * @returns {Object<string,string>}
 */
function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const eq = arg.indexOf('=')
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1)
    } else {
      const value = argv[i + 1]
      out[arg.slice(2)] = value === undefined ? 'true' : value
      if (value !== undefined) i += 1
    }
  }
  return out
}

/**
 * File-name slug: lowercase ASCII words joined by single hyphens, so the
 * shipped asset name is a stable identifier the preset table can predict.
 * @param {string} name - file name without its extension
 * @returns {string}
 */
function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * Knock out a flat white backdrop, spreading inward from the frame's edges.
 *
 * The source bitmaps are opaque white plates (corner pixels read 254,254,254
 * with alpha 255 and the whole image measures 0% transparent), so a faithful
 * resize keeps the plate and the icon shows a white square on the desktop.
 *
 * A global "white becomes transparent" rule is NOT safe here — it would punch
 * holes through legitimately white artwork. The flood fill therefore starts
 * only at the four borders and may only advance through near-white pixels, so
 * an enclosed white area (an eye, a highlight, a white belly) is never reached.
 *
 * The one-pixel rim that borders the backdrop is re-alpha'd by its own
 * whiteness; without that the silhouette keeps a stair-stepped white fringe at
 * small sizes, because the source's anti-aliased edge pixels are light grey.
 *
 * @param {Buffer} data - RGBA bytes, modified in place
 * @param {number} width
 * @param {number} height
 * @param {number} tolerance - how far below 255 a channel may sit and still
 *   count as backdrop (also the ramp width for the feather)
 * @returns {Buffer} the same buffer, mutated
 */
function knockOutWhiteBackdrop(data, width, height, tolerance) {
  const total = width * height
  const backdrop = new Uint8Array(total)
  const channelMin = i => {
    const o = i * 4
    return Math.min(data[o], data[o + 1], data[o + 2])
  }
  const stack = []
  const push = (i) => {
    if (backdrop[i] === 1) return
    if (data[i * 4 + 3] === 0) return
    if (channelMin(i) < 255 - tolerance) return
    backdrop[i] = 1
    stack.push(i)
  }

  for (let x = 0; x < width; x += 1) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width)
    push(y * width + width - 1)
  }

  while (stack.length > 0) {
    const i = stack.pop()
    const x = i % width
    const y = (i - x) / width
    if (x > 0) push(i - 1)
    if (x < width - 1) push(i + 1)
    if (y > 0) push(i - width)
    if (y < height - 1) push(i + width)
  }

  for (let i = 0; i < total; i += 1) {
    if (backdrop[i] === 1) data[i * 4 + 3] = 0
  }

  const FEATHER_STEPS = 2
  for (let i = 0; i < total; i += 1) {
    if (backdrop[i] === 1) continue
    if (data[i * 4 + 3] === 0) continue
    const x = i % width
    const y = (i - x) / width
    let near = 0
    for (let step = 1; step <= FEATHER_STEPS && near === 0; step += 1) {
      if (x >= step && backdrop[i - step] === 1) near = step
      else if (x < width - step && backdrop[i + step] === 1) near = step
      else if (y >= step && backdrop[i - step * width] === 1) near = step
      else if (y < height - step && backdrop[i + step * width] === 1) near = step
    }
    if (near === 0) continue
    const whiteness = Math.max(0, Math.min(1, (255 - channelMin(i)) / tolerance))
    const ramp = 1 - (near - 1) / FEATHER_STEPS
    data[i * 4 + 3] = Math.round(255 * whiteness * ramp)
  }
  return data
}

const args = parseArgs(process.argv.slice(2))
if (args.src === undefined || args.out === undefined) {
  console.error('usage: convert-png-to-ico.mjs --src <png-dir> --out <ico-dir>')
  process.exit(2)
}

const srcDir = resolve(process.cwd(), args.src)
const outDir = resolve(process.cwd(), args.out)
await mkdir(outDir, { recursive: true })

const sharp = loadSharp(process.env.SHARP_MODULE)
const files = (await readdir(srcDir)).filter(f => f.toLowerCase().endsWith('.png')).sort()
if (files.length === 0) {
  console.error(`no .png files in ${srcDir}`)
  process.exit(1)
}

let written = 0
let totalBytes = 0
/** Channels may sit this far below 255 and still count as the white plate. */
const BACKDROP_TOLERANCE = 24
const keepBackdrop = args['keep-background'] === 'true'

for (const file of files) {
  const source = join(srcDir, file)
  // Knock the white plate out at full resolution, before any resampling, so
  // the alpha ramp is computed from the original edge pixels.
  let pipeline = sharp(source).ensureAlpha()
  if (!keepBackdrop) {
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    knockOutWhiteBackdrop(data, info.width, info.height, BACKDROP_TOLERANCE)
    pipeline = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  }

  const pngs = []
  for (const size of SIZES) {
    // `cover` crops the source to a square first: sources here are 299x300 /
    // 300x299, and stretching them would visibly squash the artwork.
    const data = await pipeline.clone()
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .png({ compressionLevel: 9 })
      .toBuffer()
    pngs.push({ size, data })
  }
  const ico = buildIco(pngs)
  const outName = `${slug(basename(file, extname(file)))}.ico`
  await writeFile(join(outDir, outName), ico)
  written += 1
  totalBytes += ico.length
  console.log(`${file} -> ${outName} (${(ico.length / 1024).toFixed(1)} KB)`)
}

console.log(`\n${written} icons, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total -> ${outDir}`)

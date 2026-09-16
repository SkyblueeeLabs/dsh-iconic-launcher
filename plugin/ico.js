/**
 * ICO construction for the launcher plugin.
 *
 * Windows Vista and later render PNG-compressed ICO entries natively, so an
 * uploaded PNG can be embedded as-is. This module builds ICONDIR + one
 * ICONDIRENTRY per provided PNG (zero width/height encodes the 256 decode
 * size) — the same layout the launcher's `convert-svg-to-ico.mjs` produces.
 *
 * Only the upload path passes through here. Preset icons ship as finished
 * multi-size .ico produced offline by `scripts/convert-svg-to-ico.mjs`; the
 * host serves those bytes without touching this module.
 */

/** ICO file header size and one entry size in bytes. */
const ICONDIR_SIZE = 6
const ICONDIR_ENTRY_SIZE = 16

/**
 * Wrap one or more PNG buffers into a single multi-resolution .ico.
 *
 * @param {ReadonlyArray<{ size: number; data: Buffer }>} pngs - one per desired
 *   resolution, `size === 256` encoding as icon entry bytes 0/0.
 * @returns {Buffer} complete .ico bytes.
 */
export function buildIco(pngs) {
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
    // payload byte count: 4-byte field — a 256px PNG routinely exceeds 64 KiB.
    entries.writeUInt32LE(data.length, e + 8)
    entries.writeUInt32LE(offset, e + 12) // payload offset
    offset += data.length
  })
  return Buffer.concat([header, entries, ...pngs.map(p => p.data)])
}

/**
 * Assert that `bytes` really starts with a PNG signature (8-byte magic), used
 * to reject non-PNG uploads at the wire before building an ICO.
 *
 * @param {Buffer} bytes - candidate image payload.
 * @returns {boolean} true when the payload is a PNG.
 */
export function isPng(bytes) {
  return bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
    bytes[6] === 0x1a && bytes[7] === 0x0a
}

/**
 * Build a single-entry (256px) .ico from one PNG buffer.
 *
 * @param {Buffer} png - validated PNG payload.
 * @returns {Buffer} .ico bytes embedding that PNG at 256 px.
 */
export function icoFromPng(png) {
  return buildIco([{ size: 256, data: png }])
}
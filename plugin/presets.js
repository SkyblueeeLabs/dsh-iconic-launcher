/**
 * Built-in preset icon catalog for the launcher plugin (host-side).
 *
 * Each preset is a finished multi-size .ico shipped in `presets/assets/` and
 * generated offline by `scripts/convert-svg-to-ico.mjs` from an SVG. The host
 * serves these bytes on the icon route and installs the chosen one onto the
 * desktop shortcut. Presets require no runtime rasterizer.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
/** Shipping `presets/assets/` holds the multi-size .ico files. */
const ASSETS_DIR = join(HERE, 'presets', 'assets')

/**
 * Selectable presets, in menu order. Every `id` has a matching
 * `assets/<id>.ico` file in the shipped bundle.
 * @type {ReadonlyArray<{ id: string; name: string }>}
 */
export const PRESETS = Object.freeze([
  { id: 'dsh-brand', name: 'DeepSeek Harness (brand)' },
  { id: 'terminal', name: 'Terminal' },
  { id: 'rocket', name: 'Rocket' },
  { id: 'gear', name: 'Gear' },
  { id: 'whalechan-brand', name: 'Whalechan (brand)' },
  { id: 'whalechan-purple', name: 'Whalechan (purple)' },
])

/** preset id -> entry index, built once at load. */
const INDEX = new Map(PRESETS.map((p, i) => [p.id, i]))

/** Whether a preset id is selectable. */
export function isPreset(id) {
  return INDEX.has(id)
}

/** Load a preset's shipped multi-size .ico bytes. */
export async function loadPresetIco(id) {
  if (!INDEX.has(id)) throw new Error(`unknown preset: ${id}`)
  return readFile(join(ASSETS_DIR, `${id}.ico`))
}

/** Selectable preset ids, in menu order. */
export function presetIds() {
  return PRESETS.map(p => p.id)
}
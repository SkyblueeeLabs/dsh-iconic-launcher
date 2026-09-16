/**
 * Built-in preset icon catalog for the launcher plugin (host-side).
 *
 * Presets are grouped so the settings picker renders one labelled section per
 * source batch: the shipped `dsh-brand` default first, then the two graded
 * batches converted from `data/1` and `data/2`.
 *
 * Every icon is a finished multi-size `.ico` produced offline by
 * `scripts/convert-png-to-ico.mjs` (batch) or `scripts/convert-svg-to-ico.mjs`
 * (single SVG), so the host serves bytes and needs no runtime rasterizer.
 */
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
/** Shipping `presets/assets/` holds the multi-size .ico files. */
const ASSETS_DIR = join(HERE, 'presets', 'assets')

/**
 * One selectable preset.
 * @typedef {object} Preset
 * @property {string} id preset id, unique within its group
 * @property {string} name display label
 * @property {string} file path under `presets/assets/`
 */

/**
 * Build one preset row. `file` mirrors the shipped layout: the default lives at
 * the assets root, batch icons under their group folder.
 * @param {string} folder group folder ('' for the assets root)
 * @param {string} id preset id == file base name
 * @param {string} name display label
 * @returns {Preset}
 */
function row(folder, id, name) {
  return Object.freeze({ id, name, file: folder === '' ? `${id}.ico` : `${folder}/${id}.ico` })
}

/** Trailing number of a slug, kept as-is so gaps in the source batch survive. */
const tail = slug => slug.slice(slug.lastIndexOf('-') + 1)

/** Batch 1 — `data/1`, a single style. */
const GROUP_1 = [
  'whalechan-icon-01', 'whalechan-icon-02', 'whalechan-icon-03', 'whalechan-icon-04',
  'whalechan-icon-05', 'whalechan-icon-06', 'whalechan-icon-07', 'whalechan-icon-08',
  'whalechan-icon-09', 'whalechan-icon-10', 'whalechan-icon-11', 'whalechan-icon-12',
  'whalechan-icon-13', 'whalechan-icon-14', 'whalechan-icon-15', 'whalechan-icon-16',
]

/** Batch 2 — `data/2`, two styles sharing one group. */
const GROUP_2_PURPLE = [
  'whalechan-deep-purple-01', 'whalechan-deep-purple-02', 'whalechan-deep-purple-03',
  'whalechan-deep-purple-04', 'whalechan-deep-purple-05', 'whalechan-deep-purple-06',
  'whalechan-deep-purple-07', 'whalechan-deep-purple-08', 'whalechan-deep-purple-09',
  'whalechan-deep-purple-10', 'whalechan-deep-purple-11', 'whalechan-deep-purple-12',
  'whalechan-deep-purple-14', 'whalechan-deep-purple-15', 'whalechan-deep-purple-16',
]
const GROUP_2_VARIED = [
  'whalechan-varied-01', 'whalechan-varied-02', 'whalechan-varied-03', 'whalechan-varied-04',
  'whalechan-varied-05', 'whalechan-varied-06', 'whalechan-varied-08', 'whalechan-varied-09',
  'whalechan-varied-10', 'whalechan-varied-11', 'whalechan-varied-12', 'whalechan-varied-15',
]

/**
 * Preset groups in menu order. The default group keeps the shipped DeepSeek
 * Harness mark; the other two mirror `data/1` and `data/2`.
 * @type {ReadonlyArray<{ id: string; name: string; presets: ReadonlyArray<Preset> }>}
 */
export const PRESET_GROUPS = Object.freeze([
  Object.freeze({
    id: 'default',
    name: '默认',
    presets: Object.freeze([row('', 'dsh-brand', 'DeepSeek Harness')]),
  }),
  Object.freeze({
    id: 'lightblue',
    name: '浅蓝',
    presets: Object.freeze(GROUP_1.map(id => row('lightblue', id, `Whalechan ${tail(id)}`))),
  }),
  Object.freeze({
    id: 'deepblue',
    name: '深蓝',
    presets: Object.freeze([
      ...GROUP_2_PURPLE.map(id => row('deepblue', id, `深紫 ${tail(id)}`)),
      ...GROUP_2_VARIED.map(id => row('deepblue', id, `混搭 ${tail(id)}`)),
    ]),
  }),
])

/** id -> preset, over every group. */
const INDEX = new Map(PRESET_GROUPS.flatMap(g => g.presets.map(p => [`${g.id}/${p.id}`, p])))

/** Total number of selectable presets. */
export const PRESET_COUNT = INDEX.size

/**
 * Look one preset up across all groups.
 * @param {string} groupId group key
 * @param {string} presetId preset key
 * @returns {Preset|undefined}
 */
export function findPreset(groupId, presetId) {
  return INDEX.get(`${groupId}/${presetId}`)
}

/** Whether a (group, preset) pair is selectable. */
export function isPreset(groupId, presetId) {
  return INDEX.has(`${groupId}/${presetId}`)
}

/**
 * Load one preset's shipped multi-size .ico bytes.
 * @param {string} file path under `presets/assets/`
 * @returns {Promise<Buffer>}
 */
export async function loadPresetIco(file) {
  return readFile(join(ASSETS_DIR, file))
}

/**
 * Read any absolute .ico path — used for user-uploaded customs, which live
 * outside the shipped assets tree.
 * @param {string} absolutePath
 * @returns {Promise<Buffer>}
 */
export async function loadIconFile(absolutePath) {
  return readFile(absolutePath)
}

/**
 * Scan a custom-icons directory and return it as one selectable group.
 * File names carry a creation timestamp (`<slug>-<timestamp>.ico`), so sorting
 * them descending puts the most recent upload first — where the picker wants it.
 * The group is returned even when empty: the 自定义 tab always exists, showing
 * the add-placeholder until the first upload lands.
 *
 * @param {string} dir absolute custom-icons directory (may not exist yet)
 * @returns {Promise<{ id: string; name: string; presets: Preset[] }>}
 */
export async function listCustomPresets(dir) {
  let entries
  try {
    entries = await readdir(dir)
  } catch {
    entries = []
  }
  const icons = entries.filter(name => name.endsWith('.ico')).sort().reverse()
  return {
    id: 'custom',
    name: '自定义',
    presets: icons.map(name => {
      const id = name.slice(0, -4)
      return { id, name: id.replace(/^custom-/, '').replace(/-\d+$/, ''), file: join(dir, name) }
    }),
  }
}

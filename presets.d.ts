/**
 * Built-in preset icon catalog for the launcher plugin (host-side).
 *
 * Presets are grouped so the settings picker renders one labelled section per
 * source batch: the shipped `dsh-brand` default, then the three graded batches
 * (lightblue / deepblue / mixed). Every icon is a finished multi-size `.ico`
 * under `presets/assets/`; the host serves bytes and needs no rasterizer.
 *
 * The fifth `自定义` group is NOT in `PRESET_GROUPS`: it is generated per
 * request by `listCustomPresets()`.
 */
import type { Buffer } from 'node:buffer'

/** One selectable preset. */
export interface Preset {
  /** Preset id, unique within its group. */
  id: string
  /** Display label. */
  name: string
  /**
   * Path to the `.ico`: relative to `presets/assets/` for shipped presets,
   * absolute for custom ones returned by `listCustomPresets()`.
   */
  file: string
}

/** The four shipped group keys, in menu order. */
export type ShippedGroupId = 'default' | 'lightblue' | 'deepblue' | 'mixed'

/** One labelled section of the picker. */
export interface PresetGroup {
  /** Group key; `'custom'` only appears on the request-time scan result. */
  id: ShippedGroupId | 'custom'
  /** Display label, e.g. `默认`. */
  name: string
  /** Selectable presets in menu order. */
  presets: ReadonlyArray<Preset>
}

/** A group that ships in the package (never the generated `custom` one). */
export interface ShippedPresetGroup extends PresetGroup {
  id: ShippedGroupId
}

/**
 * Preset groups in menu order: default(1) / lightblue(16) / deepblue(15) /
 * mixed(12), each object and preset list frozen.
 */
export const PRESET_GROUPS: ReadonlyArray<ShippedPresetGroup>

/** Total number of selectable shipped presets (44). */
export const PRESET_COUNT: number

/**
 * Look one preset up across all groups.
 * @param groupId - group key.
 * @param presetId - preset key.
 * @returns the preset, or `undefined` when the pair is not shipped.
 */
export function findPreset(groupId: string, presetId: string): Preset | undefined

/**
 * Whether a (group, preset) pair is selectable.
 * @param groupId - group key.
 * @param presetId - preset key.
 */
export function isPreset(groupId: string, presetId: string): boolean

/**
 * Load one preset's shipped multi-size `.ico` bytes.
 * @param file - path under `presets/assets/`.
 */
export function loadPresetIco(file: string): Promise<Buffer>

/**
 * Read any absolute `.ico` path — used for user-uploaded customs, which live
 * outside the shipped assets tree.
 * @param absolutePath - absolute path to an `.ico` file.
 */
export function loadIconFile(absolutePath: string): Promise<Buffer>

/**
 * Scan a custom-icons directory and return it as the `自定义` group.
 * File names carry a creation timestamp, so a descending sort puts the most
 * recent upload first. A missing directory yields an empty group rather than
 * throwing — the tab always exists, showing its add-placeholder until the
 * first upload lands.
 *
 * @param dir - absolute custom-icons directory (may not exist yet).
 * @returns the `custom` group; `presets[].file` are absolute paths inside `dir`.
 */
export function listCustomPresets(dir: string): Promise<{
  /** Always the literal `'custom'`. */
  id: 'custom'
  /** Display label, `自定义`. */
  name: string
  /** `.ico` entries, newest first; a mutable array, unlike the frozen shipped groups. */
  presets: Preset[]
}>

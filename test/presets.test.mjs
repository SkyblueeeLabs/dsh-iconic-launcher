/**
 * Preset catalog contract.
 *
 * Pins the shipped count and group layout the settings picker renders, the
 * lookup helpers the install route relies on, and the custom-directory scan
 * that backs the 自定义 tab. The existsSync sweep over every `file` is an
 * anti-404 regression test: when `mixed/` was split out of `deepblue/`, the
 * assets were not moved with it and every mixed-tab thumbnail 404'd.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PRESET_GROUPS,
  PRESET_COUNT,
  findPreset,
  isPreset,
  listCustomPresets,
} from '../presets.js'

/** `presets/assets/`, resolved from this file so the check is cwd-independent. */
const HERE = dirname(fileURLToPath(import.meta.url))
const ASSETS_DIR = resolve(HERE, '..', 'presets', 'assets')

test('the catalog ships 44 presets in four request-time groups', () => {
  assert.equal(PRESET_COUNT, 44)
  assert.deepEqual(PRESET_GROUPS.map(g => g.id), ['default', 'lightblue', 'deepblue', 'mixed'])
  // The 自定义 group is generated per request by listCustomPresets, never here.
  assert.equal(PRESET_GROUPS.some(g => g.id === 'custom'), false)

  assert.deepEqual(
    Object.fromEntries(PRESET_GROUPS.map(g => [g.id, g.presets.length])),
    { default: 1, lightblue: 16, deepblue: 15, mixed: 12 },
  )
})

test('every preset id is unique and every file exists on disk', () => {
  const seen = new Set()
  const missing = []

  for (const group of PRESET_GROUPS) {
    for (const preset of group.presets) {
      const key = `${group.id}/${preset.id}`
      assert.equal(seen.has(key), false, `duplicate preset ${key}`)
      seen.add(key)

      assert.equal(preset.id, preset.file.slice(preset.file.lastIndexOf('/') + 1, -'.ico'.length),
        `${key}: file base name must equal the preset id`)
      // The default group sits at the assets root; batch groups in a folder.
      if (group.id === 'default') assert.equal(preset.file.includes('/'), false, `${key}: no folder prefix`)
      else assert.equal(preset.file.startsWith(`${group.id}/`), true, `${key}: lives under its group folder`)

      if (!existsSync(join(ASSETS_DIR, preset.file))) missing.push(preset.file)
    }
  }

  assert.equal(seen.size, PRESET_COUNT)
  assert.deepEqual(missing, [], 'every preset file must exist under presets/assets')
})

test('findPreset resolves shipped presets and misses nothing silently', () => {
  assert.deepEqual(findPreset('lightblue', 'whalechan-icon-01'), {
    id: 'whalechan-icon-01',
    name: 'Whalechan 01',
    file: 'lightblue/whalechan-icon-01.ico',
  })
  // The default group's icon lives at the assets root, not in a folder.
  assert.equal(findPreset('default', 'dsh-brand')?.file, 'dsh-brand.ico')
  assert.equal(findPreset('nope', 'x'), undefined)
  assert.equal(findPreset('lightblue', 'dsh-brand'), undefined, 'a preset is not addressable from another group')
})

test('isPreset agrees with findPreset', () => {
  for (const [groupId, presetId, expected] of [
    ['lightblue', 'whalechan-icon-01', true],
    ['nope', 'x', false],
  ]) {
    assert.equal(isPreset(groupId, presetId), expected)
    assert.equal(isPreset(groupId, presetId), findPreset(groupId, presetId) !== undefined)
  }
})

test('listCustomPresets returns an empty custom group for a missing directory', async () => {
  const missing = join(tmpdir(), `dsh-iconic-missing-${process.pid}-${Date.now()}`)
  const group = await listCustomPresets(missing)

  assert.equal(group.id, 'custom')
  assert.deepEqual(group.presets, [], 'no throw, just an empty tab')
})

test('listCustomPresets returns .ico files newest-first with absolute paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-iconic-custom-'))
  try {
    // Names carry a creation timestamp, so descending name order is newest-first.
    await writeFile(join(dir, 'custom-alice-1000.ico'), Buffer.from('older'))
    await writeFile(join(dir, 'custom-alice-2000.ico'), Buffer.from('newer'))
    await writeFile(join(dir, 'notes.txt'), 'not an icon')

    const group = await listCustomPresets(dir)

    assert.equal(group.id, 'custom')
    assert.deepEqual(group.presets.map(p => p.id), ['custom-alice-2000', 'custom-alice-1000'],
      'newest first, non-.ico files filtered out')
    assert.deepEqual(group.presets.map(p => p.file), [
      join(dir, 'custom-alice-2000.ico'),
      join(dir, 'custom-alice-1000.ico'),
    ])
    for (const preset of group.presets) {
      assert.equal(resolve(preset.file).startsWith(resolve(dir)), true, 'file stays inside the custom dir')
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

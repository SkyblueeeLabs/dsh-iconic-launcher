/**
 * The desktop edition is the only supported host, and the shortcut's target is
 * resolved from what the host can observe rather than configured per machine.
 * These cases pin that decision, including the failure it must refuse to write
 * a shortcut for.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveDesktopLauncher } from '../launcher.js'

const EXE = 'D:\\deepseekharness\\DeepSeek Harness.exe'

test('the desktop shell names its executable, and that wins', () => {
  assert.equal(
    resolveDesktopLauncher({ DSH_DESKTOP_NODE_EXECUTABLE: EXE }, 'C:\\node\\node.exe', false),
    EXE,
  )
  // Even alongside the Electron-mode signal, the named fact is preferred.
  assert.equal(
    resolveDesktopLauncher({ DSH_DESKTOP_NODE_EXECUTABLE: EXE, ELECTRON_RUN_AS_NODE: '1' }, EXE, true),
    EXE,
  )
})

test('inside the Electron host, process.execPath is the application', () => {
  assert.equal(resolveDesktopLauncher({}, EXE, true), EXE)
})

test('a blank named value falls through to the Electron signal', () => {
  assert.equal(resolveDesktopLauncher({ DSH_DESKTOP_NODE_EXECUTABLE: '   ' }, EXE, true), EXE)
})

test('a non-Electron host resolves to nothing', () => {
  // `dsh web` runs on plain node; a shortcut to node.exe would launch nothing.
  assert.equal(resolveDesktopLauncher({}, 'C:\\Program Files\\nodejs\\node.exe', false), '')
  assert.equal(resolveDesktopLauncher({}, EXE, false), '')
})

test('an Electron host that is not a Windows executable resolves to nothing', () => {
  assert.equal(resolveDesktopLauncher({}, '/usr/local/bin/electron', true), '')
  assert.equal(resolveDesktopLauncher({}, '', true), '')
})

test('the environment may be absent entirely', () => {
  assert.equal(resolveDesktopLauncher(undefined, EXE, true), EXE)
  assert.equal(resolveDesktopLauncher(undefined, EXE, false), '')
})

/**
 * Regression guard for the `.lnk` write argv contract.
 *
 * PowerShell's `-File` binder reads a bare argument that begins with `-` as a
 * parameter NAME, not a positional value. `targetArguments` starts with
 * `-NoProfile` in the shipped config, so passing it positionally made every
 * install fail with `A parameter cannot be found that matches parameter name
 * 'NoProfile …'` (exit 1) and no shortcut was ever written. Every value must
 * therefore travel as a named parameter.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { writeShortcut } from '../desktop.js'

const skip = process.platform !== 'win32'
const ARGS = '-NoProfile -NonInteractive -Command "dsh web"'

function capture() {
  const argv = []
  const ctx = {
    subprocess: {
      async resolveExecutable() { return 'powershell.exe' },
      spawn(req) {
        argv.push(...req.argv)
        return { done: Promise.resolve({ exitCode: 0 }), collected: {} }
      },
    },
  }
  return { argv, ctx }
}

const spec = {
  lnkPath: 'C:\\tmp\\x.lnk',
  targetExecutable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  arguments: ARGS,
  workingDirectory: 'C:\\tmp',
  iconPath: 'C:\\tmp\\x.ico',
}

test('every value is bound by name, never positionally', { skip }, async () => {
  const { argv, ctx } = capture()
  await writeShortcut(ctx, spec)

  const scriptAt = argv.indexOf('-File') + 1
  assert.match(argv[scriptAt], /shortcut\.ps1$/, 'runs the shipped script via -File')
  assert.equal(argv[scriptAt + 1], '-LnkPath', 'the first value after the script must be a parameter name')

  for (const name of ['-LnkPath', '-TargetExecutable', '-WorkingDirectory', '-IconPath', '-ExtraArguments']) {
    assert.ok(argv.includes(name), `${name} is passed by name`)
  }
  assert.equal(argv[argv.indexOf('-ExtraArguments') + 1], ARGS, 'leading-dash arguments survive as that value')
  assert.equal(argv[argv.indexOf('-LnkPath') + 1], spec.lnkPath)
  assert.equal(argv[argv.indexOf('-IconPath') + 1], spec.iconPath)
})

test('an empty arguments string is still bound explicitly', { skip }, async () => {
  const { argv, ctx } = capture()
  await writeShortcut(ctx, { ...spec, arguments: '' })
  assert.equal(argv[argv.indexOf('-ExtraArguments') + 1], '')
})

/**
 * Desktop .lnk writing for the launcher plugin.
 *
 * Creation is delegated to `powershell`'s WScript.Shell through the
 * composition's `ctx.subprocess` service, so the spawned process keeps the
 * harness's scrubbed environment and managed range. Only Windows is supported;
 * on other platforms the install route answers `unsupported-platform`.
 */
import { fileURLToPath } from 'node:url'

/** The literal program the child runs; every caller value travels as argv. */
const SCRIPT_PATH = fileURLToPath(new URL('./shortcut.ps1', import.meta.url))

/**
 * Write a Windows desktop shortcut by invoking the shipped `shortcut.ps1`.
 *
 * Uses `-File`, never `-Command`: Windows PowerShell 5.1 does not bind a
 * `-Command` script's trailing arguments to `$args` — it splices them into the
 * command text, so every value arrived empty and the write failed with exit 1.
 * `-File` binds them positionally, so the values stay argv and never become
 * code (no escaping question at all).
 *
 * @param {object} deps
 * @param {import('@deepseek-ai/cordis').Context} deps.ctx - plugin context with
 *   a `subprocess` service.
 * @param {object} spec
 * @param {string} spec.lnkPath - absolute .lnk path to create/refresh.
 * @param {string} spec.targetExecutable - absolute exe/command the shortcut runs.
 * @param {string} spec.arguments - command-line arguments placed on the target
 *   (empty string to omit).
 * @param {string} spec.workingDirectory - shortcut working folder (absolute).
 * @param {string} spec.iconPath - absolute .ico path shown on the shortcut.
 * @returns {Promise<{ lnkPath: string }>} the written link.
 */
export async function writeShortcut(ctx, {
  lnkPath,
  targetExecutable,
  arguments: args,
  workingDirectory,
  iconPath,
}) {
  if (process.platform !== 'win32') {
    throw new Error(`unsupported-platform: desktop shortcuts are unavailable on ${process.platform}`)
  }

  const executable = await ctx.subprocess.resolveExecutable('powershell.exe')
  const handle = ctx.subprocess.spawn({
    argv: [
      executable, '-NoProfile', '-NonInteractive', '-File', SCRIPT_PATH,
      lnkPath, targetExecutable, workingDirectory, iconPath, args,
    ],
    cwd: process.cwd(),
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: 64 * 1024 },
      stderr: { maxBytes: 64 * 1024 },
    },
    graceMs: 30_000,
  })
  const outcome = await handle.done
  if (outcome.exitCode !== 0) {
    // Collected streams stay readable after exit, so the child's own diagnostic
    // reaches the caller instead of a bare exit code.
    const stderr = handle.collected.stderr?.readFrom(0).text.trim() ?? ''
    throw new Error(`shortcut write failed (exit ${outcome.exitCode})${stderr === '' ? '' : `: ${stderr}`}`)
  }
  return { lnkPath }
}
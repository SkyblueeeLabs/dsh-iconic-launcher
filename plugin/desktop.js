/**
 * Desktop .lnk writing for the launcher plugin.
 *
 * Creation is delegated to `powershell`'s WScript.Shell through the
 * composition's `ctx.subprocess` service, so the spawned process keeps the
 * harness's scrubbed environment and managed range. Only Windows is supported;
 * on other platforms the install route answers `unsupported-platform`.
 */

/**
 * Write a Windows desktop shortcut via an explicitly-argv'd PowerShell call.
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
  // The script is the literal program; every value travels as argv, so
  // shortcut names or paths cannot inject PowerShell code.
  const script = [
    '$target = [System.IO.Path]::GetFullPath($args[0])',
    '$work  = [System.IO.Path]::GetFullPath($args[1])',
    '$icon  = [System.IO.Path]::GetFullPath($args[2])',
    '$lnk   = [System.IO.Path]::GetFullPath($args[3])',
    '$extra = $args[4]',
    '$sh = New-Object -ComObject WScript.Shell',
    '$s = $sh.CreateShortcut($lnk)',
    '$s.TargetPath = $target',
    '$s.WorkingDirectory = $work',
    '$s.IconLocation = "$icon,0"',
    '$s.Description = "Launcher"',
    '$s.WindowStyle = 1',
    'if ($extra -ne "") { $s.Arguments = $extra }',
    '$s.Save()',
  ].join('; ')

  const executable = await ctx.subprocess.resolveExecutable('powershell.exe')
  const handle = ctx.subprocess.spawn({
    argv: [executable, '-NoProfile', '-NonInteractive', '-Command', script, '--', lnkPath, targetExecutable, workingDirectory, iconPath, args],
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
    throw new Error(`shortcut write failed (exit ${outcome.exitCode})`)
  }
  return { lnkPath }
}
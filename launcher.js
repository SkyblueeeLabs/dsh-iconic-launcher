/**
 * Which executable a produced desktop shortcut should launch.
 *
 * The desktop edition is the only supported host: the Electron shell starts the
 * DeepSeek Harness host as a Node-mode child of the application's own
 * executable, so inside that host `process.execPath` IS the launcher the
 * shortcut must point at. This module is deliberately dependency-free so the
 * decision can be unit-tested without the harness's own packages installed.
 *
 * Windows only, because only Windows shortcuts carry a target path.
 */

/**
 * Decide a launcher path from the three observable facts.
 *
 * Precedence:
 * 1. `DSH_DESKTOP_NODE_EXECUTABLE` — the desktop shell states this by name on
 *    the launch paths that set it (the package-manager child), so it is the
 *    most explicit statement of "this is the desktop application".
 * 2. `process.execPath` — but only under Electron in Node mode, and only when
 *    it names a real `.exe`; under `dsh web` this is the `node` binary, and a
 *    shortcut to `node.exe` would be useless, so that case resolves to '' and
 *    the caller reports a configuration error instead of writing a dead link.
 *
 * @param {Record<string, string|undefined>} env - environment to read
 * @param {string} execPath - `process.execPath` of this host
 * @param {boolean} electronNode - whether this host runs as an Electron Node-mode child
 * @returns {string} absolute launcher path, or '' when this host is not the desktop app
 */
export function resolveDesktopLauncher(env, execPath, electronNode) {
  const named = env?.DSH_DESKTOP_NODE_EXECUTABLE
  if (typeof named === 'string' && named.trim() !== '') return named
  if (electronNode !== true) return ''
  return typeof execPath === 'string' && /\.exe$/i.test(execPath) ? execPath : ''
}

/**
 * `resolveDesktopLauncher` against this process.
 * @returns {string} absolute launcher path, or '' when this host is not the desktop app
 */
export function desktopLauncher() {
  return resolveDesktopLauncher(
    process.env,
    process.execPath,
    process.env.ELECTRON_RUN_AS_NODE === '1' || process.versions.electron !== undefined,
  )
}

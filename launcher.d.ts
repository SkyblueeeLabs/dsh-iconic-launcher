/**
 * Which executable a produced desktop shortcut should launch.
 *
 * The desktop edition is the only supported host: the Electron shell starts
 * the DeepSeek Harness host as a Node-mode child of the application's own
 * executable, so inside that host `process.execPath` IS the launcher. This
 * module is dependency-free so the decision is unit-testable.
 */

/**
 * Decide a launcher path from the three observable facts.
 *
 * Precedence: `DSH_DESKTOP_NODE_EXECUTABLE` when non-blank; otherwise
 * `execPath` when this host really is an Electron Node-mode child and the path
 * names a `.exe`; otherwise '' (the caller then reports a configuration error
 * instead of writing a shortcut to `node.exe`).
 *
 * @param env - environment to read; may be absent entirely.
 * @param execPath - `process.execPath` of this host.
 * @param electronNode - whether this host runs as an Electron Node-mode child.
 * @returns absolute launcher path, or '' when this host is not the desktop app.
 */
export function resolveDesktopLauncher(
  env: Record<string, string | undefined> | undefined,
  execPath: string,
  electronNode: boolean,
): string

/**
 * `resolveDesktopLauncher` against this process.
 * @returns absolute launcher path, or '' when this host is not the desktop app.
 */
export function desktopLauncher(): string

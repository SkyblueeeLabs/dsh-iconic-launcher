/**
 * Desktop `.lnk` writing for the launcher plugin.
 *
 * Creation is delegated to PowerShell's WScript.Shell through the
 * composition's `ctx.subprocess` service, so the child keeps the harness's
 * scrubbed environment. Windows only: on other platforms the call throws.
 */

/**
 * Write a Windows desktop shortcut by invoking the shipped `shortcut.ps1`.
 *
 * Values travel as named parameters (`-LnkPath …`, `-ExtraArguments …`), never
 * positionally: PowerShell's `-File` binder reads a bare argument that begins
 * with `-` as a parameter NAME, which silently broke every install whose
 * `arguments` started with a dash.
 *
 * @param ctx - plugin context exposing a `subprocess` service.
 * @param spec - everything the shortcut needs; all paths absolute.
 * @returns the written link.
 * @throws when not running on Windows, or when `shortcut.ps1` exits non-zero.
 */
export function writeShortcut(
  ctx: unknown,
  spec: {
    /** Absolute `.lnk` path to create or refresh. */
    lnkPath: string
    /** Absolute exe/command the shortcut runs. */
    targetExecutable: string
    /** Command-line arguments placed on the target (empty string to omit). */
    arguments: string
    /** Shortcut working folder (absolute). */
    workingDirectory: string
    /** Absolute `.ico` path shown on the shortcut. */
    iconPath: string
  },
): Promise<{ lnkPath: string }>

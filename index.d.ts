/**
 * Host half of the custom desktop icon launcher ("万图皆 icon").
 *
 * A Cordis function plugin: registers `webServer` routes that serve the
 * preset-icon catalog and let the settings card choose a preset or upload an
 * image, then write (or refresh) a desktop shortcut whose icon is the chosen
 * one. Every route first asks the composition's `connection` service for a
 * rejection (`requestRejection`) before touching anything.
 */

/** Cordis function-plugin name. */
export const name: 'dsh-iconic-launcher'

/** Services this plugin requires: route carrier, trust fence, and command spawns. */
export const inject: ['webServer', 'connection', 'subprocess']

/**
 * Configuration for the custom desktop icon launcher — the normalized output
 * of the `Config` schema. Every field declares a schema default, so all are
 * present after validation.
 */
export interface Config {
  /** Base name (no extension) of the produced `.lnk`. Default `'DeepSeek Launcher'`. */
  shortcutName: string
  /**
   * Absolute executable the shortcut launches. Default `''`, meaning "whatever
   * desktop application hosts this plugin" — resolved at apply time, because
   * that answer only exists at runtime.
   */
  targetExecutable: string
  /** Command-line arguments placed on the shortcut target. Default `''`. */
  targetArguments: string
  /**
   * Working directory the shortcut starts in. Default `''`, meaning
   * "the target's directory, else `desktopDir`".
   */
  workingDirectory: string
  /** Absolute directory where chosen icons are written. Default `~/.dsh-launcher/icons`. */
  iconDir: string
  /**
   * Absolute directory for user-uploaded icons. Default `''`, meaning
   * `<iconDir>/custom`.
   */
  customDir: string
  /** Absolute desktop directory for the `.lnk`. Default `~/Desktop`. */
  desktopDir: string
  /** Whether arbitrary image uploads are accepted. Default `true`. */
  allowUpload: boolean
}

/**
 * The schemastery schema built by `z.object({...})`: callable to validate and
 * normalize a (possibly partial) config into {@link Config}.
 *
 * Declared structurally on purpose, so this package needs no type dependency on
 * `@deepseek-ai/schemastery`; a real schema instance is assignable to it.
 */
export interface ConfigSchema {
  (data?: Partial<Config> | null, options?: unknown): Config
  /** Schema node kind (`'object'` here). */
  readonly type: string
  /** UI/validation metadata attached to the schema node. */
  readonly meta: Record<string, unknown>
}

/** Self-describing configuration schema for the launcher plugin. */
export const Config: ConfigSchema

/**
 * Function-plugin body: registers the presets, icon, install, and
 * custom-delete routes, plus the plugin's settings namespace.
 * @param ctx - cordis plugin context.
 * @param config - normalized plugin configuration.
 */
export function apply(ctx: unknown, config: Config): void

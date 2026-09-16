/**
 * Browser half of `dsh-iconic-launcher`: a settings card that picks or
 * uploads an icon and writes a desktop shortcut through the host routes.
 */

/** Browser-function plugin name. */
export const name: 'dsh-iconic-launcher-client'

/** Services this browser half requires. */
export const inject: ['slots']

/**
 * Cordis function-plugin body for the browser half: registers the settings
 * card into `settings.plugin.item` keyed by the namespace this bundle serves.
 * @param ctx - browser plugin context.
 * @param config - unused configuration for the browser half.
 */
export function apply(ctx: unknown, config?: unknown): void
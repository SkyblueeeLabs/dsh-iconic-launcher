/**
 * Route paths, limits, and the settings namespace shared verbatim by the host
 * half (`index.js`) and the browser half (`client.js`). Published as the
 * `./shared` subpath so either side can import the wire facts without pulling
 * in the other's runtime.
 */

/** Settings namespace this plugin serves — the key the browser card reacts to. */
export const ICONIC_NS: 'dsh-launcher-icon'

/** GET route serving the available preset icon ids and host install targets. */
export const ICONIC_PRESETS_ROUTE: '/dsh-launcher-ic/presets'

/**
 * GET prefix serving one preset's shipped `.ico` bytes, for on-screen preview.
 * No trailing slash: the web server's `prefix` route matches `p` or
 * `p/<anything>`, so a trailing slash would 404 every request.
 */
export const ICONIC_ICON_ROUTE_PREFIX: '/dsh-launcher-ic/icon'

/** POST route creating (or replacing) a desktop shortcut for one icon choice. */
export const ICONIC_INSTALL_ROUTE: '/dsh-launcher-ic/install'

/**
 * POST route removing one user-uploaded custom icon file from the 自定义 tab.
 * Only ever deletes a `<id>.ico` living inside the host's custom-icons
 * directory; shipped presets are not addressable here.
 */
export const ICONIC_CUSTOM_DELETE_ROUTE: '/dsh-launcher-ic/custom-delete'

/** Maximum accepted uploaded-image base64 length (1 MiB). */
export const MAX_UPLOAD_BASE64: number

/**
 * Lowercase ASCII words joined by single hyphens — the same slug rule the
 * offline converter uses for shipped asset names, so a custom upload keeps a
 * stable, filesystem-safe identity derived from its original file name.
 * @param name - source name (any value; it is stringified first).
 * @returns the slug, possibly empty.
 */
export function slugify(name: string): string

/**
 * Resolutions an icon carries, largest first. An upload sends one PNG per
 * entry here, and the host rejects any size outside this list.
 */
export const ICON_SIZES: ReadonlyArray<number>

/**
 * Route paths, constants, and the settings namespace shared verbatim by the
 * host half (`index.js`) and the browser half (`client.js`, the settings
 * card). Published as the `./shared` subpath so either side can import the wire
 * facts without pulling in the other's runtime. Plain JS, no build step.
 */

/** Settings namespace this plugin serves — the key the browser card reacts to. */
export const ICONIC_NS = 'dsh-launcher-icon'

/** GET route serving the available preset icon ids and host install targets. */
export const ICONIC_PRESETS_ROUTE = '/dsh-launcher-ic/presets'

/**
 * GET prefix serving one preset's shipped `.ico` bytes, for on-screen preview.
 * No trailing slash: the web server's `prefix` route matches `p` or `p/<anything>`,
 * so a trailing slash would only ever match `p//<anything>` and 404 every request.
 */
export const ICONIC_ICON_ROUTE_PREFIX = '/dsh-launcher-ic/icon'

/** POST route creating (or replacing) a desktop shortcut for one icon choice. */
export const ICONIC_INSTALL_ROUTE = '/dsh-launcher-ic/install'

/**
 * POST route removing one user-uploaded custom icon file from the 自定义 tab.
 * Only ever deletes a `<id>.ico` living inside the host's custom-icons
 * directory; shipped presets are not addressable here.
 */
export const ICONIC_CUSTOM_DELETE_ROUTE = '/dsh-launcher-ic/custom-delete'

/** Maximum accepted uploaded-image base64 length (1 MiB). */
export const MAX_UPLOAD_BASE64 = 1024 * 1024

/**
 * Lowercase ASCII words joined by single hyphens — the same slug rule the
 * offline converter uses for shipped asset names, so a custom upload keeps a
 * stable, filesystem-safe identity derived from its original file name.
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * Resolutions an icon carries, largest first. Shared so the browser can render
 * exactly the set the host will pack into the .ico: an upload sends one PNG per
 * entry here, and the host rejects any size outside this list.
 */
export const ICON_SIZES = Object.freeze([256, 128, 64, 48, 32, 24, 16])

/** Version of this shared wire contract. */
export const ICONIC_VERSION = '0.1.1'
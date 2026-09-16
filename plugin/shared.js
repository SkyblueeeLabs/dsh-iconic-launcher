/**
 * Route paths and wire payloads shared verbatim by the host routes and a future
 * browser package, published as the `./shared` subpath. Plain JS so it can be
 * loaded directly, no build step, just like the rest of this bundle.
 */

/** GET route serving the available preset icon ids and host install targets. */
export const ICONIC_PRESETS_ROUTE = '/dsh-launcher-ic/presets'

/** POST route creating (or refreshing) a desktop shortcut for one icon choice. */
export const ICONIC_INSTALL_ROUTE = '/dsh-launcher-ic/install'

/** Maximum accepted uploaded-image base64 length (1 MiB). */
export const MAX_UPLOAD_BASE64 = 1024 * 1024

/** Version of this shared wire contract. */
export const ICONIC_VERSION = '0.1.0'
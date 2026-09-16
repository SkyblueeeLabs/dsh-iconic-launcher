/**
 * Host half of the custom desktop icon launcher ("万图皆 icon").
 *
 * Two routes on the composition's `webServer` serve the preset-icon catalog and
 * let the settings card choose a preset or upload arbitrary PNG, then write (or
 * refresh) a desktop shortcut whose icon is the chosen one. Plain JS, no build
 * step, so the bundle installs straight from a git checkout via `dsh plugin
 * --profile <name> add <pkg>`.
 *
 * Security has one home, here. Every route asks the composition's
 * `connection` service for a rejection first (`requestRejection`), exactly like
 * `@deepseek-ai/dsh-host-open-in-app`: its Host/Origin fence guards DNS
 * rebinding and cross-site calls, and its browser authentication gates every
 * caller. The install route then validates its body at the wire: an
 * `application/json` media type, a bounded body, a sanitized shortcut name, and
 * either a preset id or a bounded PNG payload with a real PNG signature — so no
 * unsafe name and no arbitrary content reaches the disk.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import z from '@deepseek-ai/schemastery'
import {
  ICONIC_PRESETS_ROUTE, ICONIC_INSTALL_ROUTE, MAX_UPLOAD_BASE64,
} from './shared.js'
import { PRESETS, isPreset, loadPresetIco } from './presets.js'
import { icoFromPng, isPng } from './ico.js'
import { writeShortcut } from './desktop.js'

/** Cordis function-plugin name. */
export const name = 'iconic-launcher'
/** Route carrier, the trust fence guarding every route, and command spawns. */
export const inject = ['webServer', 'connection', 'subprocess']

const nonEmpty = () => z.string().min(1)

/**
 * Configuration for the custom desktop icon launcher.
 * @typedef {object} Config
 * @property {string} shortcutName base name (no extension) of the produced .lnk
 * @property {string} targetExecutable absolute target executable the shortcut launches
 * @property {string} [targetArguments] command-line arguments on the shortcut target
 * @property {string} [workingDirectory] working directory the shortcut starts in
 * @property {string} iconDir absolute directory where chosen icons are written
 * @property {string} desktopDir absolute desktop directory for the .lnk
 * @property {boolean} [allowUpload] whether arbitrary image uploads are accepted
 */
export const Config = z.object({
  shortcutName: nonEmpty().default('DeepSeek Launcher'),
  targetExecutable: nonEmpty(),
  targetArguments: z.string().default(''),
  workingDirectory: z.string().default(''),
  iconDir: nonEmpty().default(() => join(homedir(), '.dsh-launcher', 'icons')),
  desktopDir: nonEmpty().default(() => join(homedir(), 'Desktop')),
  allowUpload: z.boolean().default(true),
})

/**
 * The bed-side trust fence consumed here; the browser connection package owns
 * the full surface.
 * @param {object} ctx cordis context
 * @returns {{ requestRejection(r: {headers: import('node:http').IncomingMessage['headers']}): 401|403|undefined }}
 */
function connectionOf(ctx) {
  return Reflect.get(ctx, 'connection')
}

/** Install bodies are tiny JSON; upload payloads are capped separately. */
const MAX_JSON_BODY = 2 * 1024
/** A single written icon payload cap (also bounds the upload base64). */
const MAX_ICON_BYTES = 4 * 1024 * 1024

/** @param {import('node:http').ServerResponse} res */
/** @param {import('node:http').ServerResponse} res */
/** @param {import('node:http').ServerResponse} res */
function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** @param {import('node:http').ServerResponse} res */
function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.end()
}

/**
 * Collect a bounded request body as UTF-8 text; null past the ceiling.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} ceiling maximum accepted bytes
 * @returns {Promise<string|null>}
 */
async function readBoundedBody(req, ceiling) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.byteLength
    if (size > ceiling) {
      req.resume()
      return null
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size).toString('utf8')
}

/**
 * @param {string} text JSON body text
 * @returns {{ shortcutName?: unknown; preset?: unknown; pngBase64?: unknown }|null}
 */
function parseInstallBody(text) {
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  return typeof body === 'object' && body !== null ? body : null
}

/**
 * Sanitize a shortcut base name: reject empty, overlength, Windows device
 * names, and anything outside a small safe alphabet. Returns null when unsafe.
 * @param {unknown} raw candidate name
 * @returns {string|null}
 */
function sanitizeBaseName(raw) {
  if (typeof raw !== 'string') return null
  const nm = raw.trim()
  if (nm === '' || nm.length > 60) return null
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:[. ]|$)/i.test(nm)) return null
  if (!/^[A-Za-z0-9 _()[\].-]+$/.test(nm)) return null
  return nm
}

/** @param {string} dir absolute icon-output directory */
async function ensureDir(dir) {
  if (!isAbsolute(dir)) throw new Error('iconDir must be an absolute path')
  await mkdir(dir, { recursive: true })
}

/**
 * Resolve icon bytes + file base for one install (preset or uploaded PNG).
 * @param {{ preset?: unknown; pngBase64?: unknown; shortcutName?: unknown }} body
 * @param {string} baseName sanitized safe base name
 * @param {boolean} allowUpload whether uploads are allowed
 * @returns {Promise<{ bytes: Buffer; path: string }|null>}
 */
async function resolveIcon(body, baseName, allowUpload) {
  if (typeof body === 'object' && body !== null && typeof body.preset === 'string' && isPreset(body.preset)) {
    return { bytes: await loadPresetIco(body.preset), path: `${baseName}.ico` }
  }
  if (allowUpload && typeof body === 'object' && body !== null && typeof body.pngBase64 === 'string') {
    if (body.pngBase64.length > MAX_UPLOAD_BASE64) return null
    let bytes
    try {
      bytes = Buffer.from(body.pngBase64, 'base64')
    } catch {
      return null
    }
    if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES || !isPng(bytes)) return null
    return { bytes: icoFromPng(bytes), path: `${baseName}.ico` }
  }
  return null
}

/**
 * Function-plugin apply: registers the presets and install routes.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Config} config
 */
export function apply(ctx, config) {
  const rejected = (req, res) => {
    const rejection = connectionOf(ctx).requestRejection({ headers: req.headers })
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }
  const workingDirectory = config.workingDirectory || config.desktopDir

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: ICONIC_PRESETS_ROUTE,
      handler: async (req, res) => {
        if (rejected(req, res)) return
        if (req.method !== 'GET') {
          sendMethodNotAllowed(res, 'GET')
          return
        }
        sendJson(res, 200, { presets: PRESETS, iconDir: config.iconDir })
      },
    }),
  `iconic: GET ${ICONIC_PRESETS_ROUTE}`)

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: ICONIC_INSTALL_ROUTE,
      handler: async (req, res) => {
        if (rejected(req, res)) return
        if (req.method !== 'POST') {
          sendMethodNotAllowed(res, 'POST')
          return
        }
        const essence = String(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase()
        if (essence !== 'application/json') {
          sendJson(res, 415, { code: 'unsupported-media-type', message: 'content-type must be application/json' })
          return
        }
        let text
        try {
          text = await readBoundedBody(req, MAX_JSON_BODY)
        } catch {
          sendJson(res, 400, { code: 'bad-request', message: 'request body unreadable' })
          return
        }
        if (text === null) {
          sendJson(res, 413, { code: 'payload-too-large', message: 'request body is too large' })
          return
        }
        const body = parseInstallBody(text)
        if (body === null) {
          sendJson(res, 400, { code: 'bad-request', message: 'request body must be JSON' })
          return
        }
        const base = sanitizeBaseName(body.shortcutName ?? config.shortcutName)
        if (base === null) {
          sendJson(res, 400, { code: 'bad-request', message: 'shortcutName is invalid or unsafe' })
          return
        }
        try {
          await ensureDir(config.iconDir)
        } catch {
          sendJson(res, 500, { code: 'icon-dir', message: 'icon directory unavailable' })
          return
        }
        let icon = null
        try {
          icon = await resolveIcon(body, base, config.allowUpload)
        } catch {
          icon = null
        }
        if (icon === null) {
          sendJson(res, 400, { code: 'bad-request', message: 'no valid preset or upload provided' })
          return
        }
        const iconPath = join(config.iconDir, icon.path)
        const lnkPath = join(config.desktopDir, `${base}.lnk`)
        try {
          await writeFile(iconPath, icon.bytes)
        } catch {
          sendJson(res, 500, { code: 'icon-write', message: 'could not write icon file' })
          return
        }
        try {
          await writeShortcut(ctx, {
            lnkPath,
            targetExecutable: config.targetExecutable,
            arguments: config.targetArguments,
            workingDirectory,
            iconPath,
          })
        } catch (cause) {
          sendJson(res, 502, { code: 'shortcut-failed', message: `failed to write shortcut: ${cause.message}` })
          return
        }
        sendJson(res, 200, { ok: true, lnkPath, iconPath })
      },
    }),
  `iconic: POST ${ICONIC_INSTALL_ROUTE}`)
}
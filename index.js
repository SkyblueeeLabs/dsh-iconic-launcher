import fs from 'node:fs'
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
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, isAbsolute, dirname } from 'node:path'
import { homedir } from 'node:os'
import z from '@deepseek-ai/schemastery'
import {
  ICONIC_PRESETS_ROUTE, ICONIC_INSTALL_ROUTE, ICONIC_ICON_ROUTE_PREFIX,
  ICON_SIZES, slugify,
} from './shared.js'
import { PRESET_GROUPS, findPreset, loadPresetIco, listCustomPresets, loadIconFile } from './presets.js'
import { buildIco, isPng } from './ico.js'
import { writeShortcut } from './desktop.js'
import { ICONIC_NS } from './shared.js'

/** Cordis function-plugin name. */
export const name = 'dsh-iconic-launcher'
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
  iconDir: nonEmpty().default(join(homedir(), '.dsh-launcher', 'icons')),
  customDir: z.string().default(''),
  desktopDir: nonEmpty().default(join(homedir(), 'Desktop')),
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

/**
 * Per-frame PNG ceiling after base64 decoding. A 256px entry is a few hundred
 * KB at worst; anything larger means the caller is not sending icon frames.
 */
const MAX_FRAME_BYTES = 512 * 1024
/**
 * Install request-body ceiling. A preset install is a few dozen bytes, but an
 * upload carries one base64 PNG per `ICON_SIZES` entry, so this single read cap
 * has to cover the whole set (base64 costs ~4/3, plus JSON scaffolding).
 * The previous 2 KiB cap made every real upload fail with 413.
 */
const MAX_INSTALL_BODY = ICON_SIZES.length * MAX_FRAME_BYTES * 1.4 + 8 * 1024

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
 * Remove icon files an earlier install of the same shortcut base left behind,
 * keeping only the one just written. Best-effort: pruning is cosmetic, so it
 * must never fail an install that already succeeded.
 * @param {string} dir absolute icon-output directory
 * @param {string} base sanitized shortcut base name
 * @param {string} keepName file name to retain
 */
async function pruneSupersededIcons(dir, base, keepName) {
  try {
    const entries = await readdir(dir)
    const prefix = `${base}.`
    await Promise.all(entries
      .filter(name => name !== keepName && name.startsWith(prefix) && name.endsWith('.ico'))
      .map(name => rm(join(dir, name), { force: true })))
  } catch {
    // Ignored on purpose — see above.
  }
}

/**
 * Resolve the icon bytes for one install (a shipped preset, a kept custom
 * icon, or an uploaded PNG that becomes a new custom entry).
 * @param {{ group?: unknown; preset?: unknown; name?: unknown; frames?: unknown; shortcutName?: unknown }} body
 * @param {boolean} allowUpload whether uploads are allowed
 * @param {string} customDir absolute custom-icons directory
 * @returns {Promise<{ bytes: Buffer; customId: string|null }|null>}
 */
async function resolveIcon(body, allowUpload, customDir) {
  if (typeof body === 'object' && body !== null
    && typeof body.group === 'string' && typeof body.preset === 'string') {
    if (body.group === 'custom') {
      const custom = await listCustomPresets(customDir)
      const preset = custom?.presets.find(p => p.id === body.preset)
      if (preset !== undefined) {
        return { bytes: await loadIconFile(preset.file), customId: null }
      }
      return null
    }
    const preset = findPreset(body.group, body.preset)
    if (preset !== undefined) {
      return { bytes: await loadPresetIco(preset.file), customId: null }
    }
    return null
  }

  // Upload path: the browser has already knocked out the backdrop, resampled
  // the artwork and encoded one PNG per ICON_SIZES entry — it owns a canvas,
  // this process owns no rasterizer. We validate the frames, pack the .ico,
  // and KEEP it: the packed bytes land in the custom directory so the upload
  // shows up under the `自定义` tab on every later load.
  if (allowUpload && typeof body === 'object' && body !== null && Array.isArray(body.frames)) {
    const rank = new Map(ICON_SIZES.map((size, index) => [size, index]))
    const seen = new Set()
    const frames = []
    for (const frame of body.frames) {
      if (typeof frame !== 'object' || frame === null) return null
      const { size, data } = frame
      if (!rank.has(size) || seen.has(size) || typeof data !== 'string') return null
      if (data.length > MAX_FRAME_BYTES * 1.4) return null
      let bytes
      try {
        bytes = Buffer.from(data, 'base64')
      } catch {
        return null
      }
      if (bytes.length === 0 || bytes.length > MAX_FRAME_BYTES || !isPng(bytes)) return null
      seen.add(size)
      frames.push({ size, data: bytes })
    }
    if (frames.length === 0) return null
    // The ICO directory reads largest-first; never trust the caller's order.
    frames.sort((a, b) => rank.get(a.size) - rank.get(b.size))
    const packed = buildIco(frames)
    const label = typeof body.name === 'string' && body.name.trim() !== '' ? slugify(body.name).slice(0, 40) : 'icon'
    const customId = `custom-${label || 'icon'}-${Date.now()}`
    await ensureDir(customDir)
    await writeFile(join(customDir, `${customId}.ico`), packed)
    return { bytes: packed, customId }
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
  // Uploaded icons persist here as full multi-size .ico files; the catalog
  // serves them under the `自定义` tab on every subsequent load.
  const customDir = config.customDir || join(config.iconDir, 'custom')

  // Serve the settings namespace so the Plugins settings page (which only
  // dispatches a card for namespace the Host serves) reacts to this bundle.
  // No UI ever needs to edit the host's own config through this card — the
  // card's "state" is the icon choice and the last .lnk/icon paths written —
  // so the schema is deliberately a passthrough the card can contribute to
  // without owning any real preference.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(ICONIC_NS, z.object({
      iconDir: z.string(),
      desktopDir: z.string(),
      lastPreset: z.string(),
      lastShortcut: z.string(),
    }))
  })

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
        // The custom tab is directory-backed and always present: whatever the
        // user uploaded shows up newest-first, and an empty directory just
        // leaves the tab with its add-placeholder.
        const custom = await listCustomPresets(customDir)
        sendJson(res, 200, { groups: [...PRESET_GROUPS, custom], iconDir: config.iconDir })
      },
    }),
  `iconic: GET ${ICONIC_PRESETS_ROUTE}`)

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: ICONIC_ICON_ROUTE_PREFIX,
      handler: async (req, res) => {
        if (rejected(req, res)) return
        if (req.method !== 'GET') {
          sendMethodNotAllowed(res, 'GET')
          return
        }
        const rest = String(req.url ?? '').slice(ICONIC_ICON_ROUTE_PREFIX.length)
        const [group, presetId] = decodeURIComponent((rest.split('?')[0] ?? '').replace(/^\/+/, '')).split('/')
        let iconBytes = null
        if (group === 'custom' && presetId !== undefined && /^[A-Za-z0-9._-]+$/.test(presetId)) {
          // Custom entries live as loose .ico files; the id IS the file name.
          try {
            iconBytes = await loadIconFile(join(customDir, `${presetId}.ico`))
          } catch { iconBytes = null }
        } else if (group !== undefined && presetId !== undefined) {
          const preset = findPreset(group, presetId)
          if (preset !== undefined) iconBytes = await loadPresetIco(preset.file)
        }
        if (iconBytes === null) {
          res.statusCode = 404
          res.end()
          return
        }
        try {
          res.statusCode = 200
          res.setHeader('content-type', 'image/x-icon')
          res.setHeader('cache-control', 'public, max-age=86400')
          res.end(iconBytes)
        } catch {
          res.statusCode = 500
          res.end()
        }
      },
    }),
  `iconic: GET ${ICONIC_ICON_ROUTE_PREFIX}<preset>`)

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
          text = await readBoundedBody(req, MAX_INSTALL_BODY)
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
          icon = await resolveIcon(body, config.allowUpload, customDir)
        } catch {
          icon = null
        }
        if (icon === null) {
          sendJson(res, 400, { code: 'bad-request', message: 'no valid preset or upload provided' })
          return
        }
        // Content-addressed icon file name. Windows' icon cache is keyed by
        // PATH: overwriting `<name>.ico` in place keeps the OLD bitmap on the
        // desktop even though the shortcut's IconLocation already points at the
        // new bytes (Explorer's properties dialog reads the file directly, which
        // is why it shows the new icon immediately). A fresh path per content
        // makes the cache miss; superseded files are pruned right after.
        const stamp = createHash('sha256').update(icon.bytes).digest('hex').slice(0, 10)
        const iconName = `${base}.${stamp}.ico`
        const iconPath = join(config.iconDir, iconName)
        const lnkPath = join(config.desktopDir, `${base}.lnk`)
        try {
          await writeFile(iconPath, icon.bytes)
        } catch {
          sendJson(res, 500, { code: 'icon-write', message: 'could not write icon file' })
          return
        }
        await pruneSupersededIcons(config.iconDir, base, iconName)
        // `WScript.Shell.CreateShortcut` creates a missing .lnk on Save, but it
        // cannot create the *directory* — a redirected or renamed Desktop
        // (OneDrive, localized profiles) would fail the write with a bare
        // "shortcut write failed". Make sure the folder exists first.
        try {
          await ensureDir(dirname(lnkPath))
        } catch {
          sendJson(res, 500, { code: 'desktop-dir', message: 'desktop directory unavailable' })
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
        // `customId` echoes back on uploads so the picker can select the fresh
        // entry right after its catalog refresh.
        sendJson(res, 200, { ok: true, lnkPath, iconPath, customId: icon.customId })
      },
    }),
  `iconic: POST ${ICONIC_INSTALL_ROUTE}`)
}
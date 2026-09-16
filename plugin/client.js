/**
 * Browser half of the custom desktop icon launcher ("万图皆 icon").
 *
 * Mounts one settings card into the DeepSeek Harness Plugins settings page
 * (`settings.plugin.item`, keyed by the namespace this plugin serves host-side).
 * The card lists the host's preset icons, lets the user pick one — or upload a
 * PNG of their own — and calls the host's install route to write or refresh a
 * desktop shortcut with that icon.
 *
 * FORM — this file is deliberately NOT an ES module. The harness concatenates
 * every plugin registered under `dsh.client` into ONE classic `<script src>`
 * application batch (`/plugins/??<id>/client.js,...`), so a single top-level
 * `import`/`export` here is a SyntaxError that kills the whole batch and every
 * client plugin fails to activate with "import failed". Official bundles are
 * tsdown output already in this exact `window.__ModuleLoader__.load({ id,
 * factory })` form; a no-build plugin must hand-write the same form. Two
 * consequences: `./shared.js` cannot be imported from here (its wire constants
 * are inlined below, and it keeps serving the Node-side host half), and nothing
 * may be exported at file scope.
 */
window.__ModuleLoader__.load({
  id: 'dsh-iconic-launcher',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    /* Platform seed word, exactly as the official bundles obtain it. */
    const React = require('react')

    /* Wire constants shared with the host half, inlined from `shared.js`. */
    const ICONIC_NS = 'dsh-launcher-icon'
    const ICONIC_PRESETS_ROUTE = '/dsh-launcher-ic/presets'
    const ICONIC_INSTALL_ROUTE = '/dsh-launcher-ic/install'
    const ICONIC_ICON_ROUTE_PREFIX = '/dsh-launcher-ic/icon'
    const MAX_UPLOAD_BASE64 = 1024 * 1024

    /** A PNG File as base64 with any data-URL prefix stripped. */
    /** Resolutions every icon carries, matching the host's ICO packing order. */
    const ICON_SIZES = [256, 128, 64, 48, 32, 24, 16]
    /** Channels may sit this far below 255 and still count as the white plate. */
    const BACKDROP_TOLERANCE = 24

    /**
     * The browser twin of `convert-png-to-ico.mjs`'s `knockOutWhiteBackdrop`:
     * flood the flat white backdrop from the frame's four borders inward, then
     * re-alpha the bordering rim by its own whiteness. A global white-to-alpha
     * rule is not usable — it would punch holes through white artwork.
     */
    function knockOutWhiteBackdrop(data, width, height, tolerance) {
      const total = width * height
      const backdrop = new Uint8Array(total)
      const channelMin = (i) => {
        const o = i * 4
        return Math.min(data[o], data[o + 1], data[o + 2])
      }
      const stack = []
      const push = (i) => {
        if (backdrop[i] === 1) return
        if (data[i * 4 + 3] === 0) return
        if (channelMin(i) < 255 - tolerance) return
        backdrop[i] = 1
        stack.push(i)
      }

      for (let x = 0; x < width; x += 1) {
        push(x)
        push((height - 1) * width + x)
      }
      for (let y = 0; y < height; y += 1) {
        push(y * width)
        push(y * width + width - 1)
      }

      while (stack.length > 0) {
        const i = stack.pop()
        const x = i % width
        const y = (i - x) / width
        if (x > 0) push(i - 1)
        if (x < width - 1) push(i + 1)
        if (y > 0) push(i - width)
        if (y < height - 1) push(i + width)
      }

      for (let i = 0; i < total; i += 1) {
        if (backdrop[i] === 1) data[i * 4 + 3] = 0
      }

      const FEATHER_STEPS = 2
      for (let i = 0; i < total; i += 1) {
        if (backdrop[i] === 1) continue
        if (data[i * 4 + 3] === 0) continue
        const x = i % width
        const y = (i - x) / width
        let near = 0
        for (let step = 1; step <= FEATHER_STEPS && near === 0; step += 1) {
          if (x >= step && backdrop[i - step] === 1) near = step
          else if (x < width - step && backdrop[i + step] === 1) near = step
          else if (y >= step && backdrop[i - step * width] === 1) near = step
          else if (y < height - step && backdrop[i + step * width] === 1) near = step
        }
        if (near === 0) continue
        const whiteness = Math.max(0, Math.min(1, (255 - channelMin(i)) / tolerance))
        const ramp = 1 - (near - 1) / FEATHER_STEPS
        data[i * 4 + 3] = Math.round(255 * whiteness * ramp)
      }
      return data
    }

    /**
     * Turn an uploaded PNG into the same shape a preset ships: the white
     * backdrop knocked out from the border inward, then one PNG per
     * ICON_SIZES entry. Everything runs on a canvas in the browser because the
     * host process owns no rasterizer.
     * @param {File} file
     * @returns {Promise<Array<{ size: number; data: string }>>} base64 PNG frames
     */
    async function pngToFrames(file) {
      const bitmap = await createImageBitmap(file)
      // Square letterbox canvas — transparent padding, never white.
      const side = Math.max(bitmap.width, bitmap.height)
      const square = document.createElement('canvas')
      square.width = side
      square.height = side
      const sctx = square.getContext('2d', { willReadFrequently: true })
      sctx.drawImage(bitmap, (side - bitmap.width) / 2, (side - bitmap.height) / 2)
      bitmap.close?.()

      const image = sctx.getImageData(0, 0, side, side)
      knockOutWhiteBackdrop(image.data, side, side, BACKDROP_TOLERANCE)
      sctx.putImageData(image, 0, 0)

      const frames = []
      for (const size of ICON_SIZES) {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(square, 0, 0, size, size)
        const url = canvas.toDataURL('image/png')
        frames.push({ size, data: url.slice(url.indexOf(',') + 1) })
      }
      return frames
    }

    /** The card's own CSS, inserted once per mounted half under `.ic-*` scope. */
    const CARD_CSS = `
.ic-card{display:flex;flex-direction:column;gap:14px;padding:2px 0;max-width:660px}
.ic-section-title{font-size:13px;font-weight:600;margin:0}
.ic-tabs{display:flex;gap:6px;flex-wrap:wrap}
.ic-tab{border:1px solid var(--dsh-border, rgba(128,128,128,.4));border-radius:8px;
  padding:6px 12px;cursor:pointer;font-size:12px;font:inherit;background:transparent;color:inherit;
  transition:border-color .12s ease, background .12s ease}
.ic-tab:hover:not(:disabled):not(.ic-tab-active){border-color:var(--dsh-accent, #4a90d2)}
.ic-tab.ic-tab-active{background:var(--dsh-accent, #4d90d2);border-color:var(--dsh-accent, #4d90d2);color:#fff}
.ic-tab:disabled{opacity:.5;cursor:default}
.ic-group-count{font-size:11px;opacity:.7;margin-left:3px}
.ic-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:1fr;
  gap:8px}
.ic-tile{display:flex !important;flex-direction:column !important;align-items:center;justify-content:flex-start;
  gap:6px;padding:10px 6px;min-height:78px;text-align:center;
  border:1px solid var(--dsh-border, rgba(128,128,128,.4));border-radius:10px;
  cursor:pointer;background:transparent;color:inherit;font:inherit;
  transition:border-color .12s ease, background .12s ease}
.ic-tile:hover:not(.ic-tile-disabled){border-color:var(--dsh-accent, #4a90d2)}
.ic-tile.ic-selected{border-color:var(--dsh-accent, #4a90d2);background:rgba(74,144,210,.12)}
.ic-tile-disabled{opacity:.5;cursor:default}
.ic-thumb{width:36px;height:36px;display:block;flex:0 0 auto}
.ic-name{font-size:11px;line-height:1.25;word-break:break-word}
.ic-hint{opacity:.6;font-size:12px;margin:0}
.ic-add{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:3px;min-height:78px;padding:10px 6px;text-align:center;
  border:1px dashed var(--dsh-border, rgba(128,128,128,.45));border-radius:10px;
  cursor:pointer;color:inherit;
  transition:border-color .12s ease, background .12s ease}
.ic-add:hover{border-color:var(--dsh-accent, #4a90d2);background:rgba(74,144,210,.06)}
.ic-add input[type=file]{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.ic-add-plus{font-size:18px;line-height:1;opacity:.7}
.ic-add-text{font-size:12px;font-weight:500}
.ic-add-req{font-size:11px;opacity:.6}
.ic-add-hint{font-size:10px;opacity:.45}
.ic-confirm{display:flex;align-items:center;gap:10px;padding:9px 10px 9px 12px;
  border:1px solid var(--dsh-border, rgba(128,128,128,.4));border-radius:10px}
.ic-confirm-thumb{width:32px;height:32px;display:block;flex:0 0 auto}
.ic-confirm-name{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ic-confirm-none{flex:1;min-width:0;font-size:12px;opacity:.6}
.ic-actions{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
.ic-install{border:0;border-radius:8px;padding:7px 16px;cursor:pointer;font-size:12px;font-weight:500;
  background:var(--dsh-accent, #4d90d2);color:#fff;flex:0 0 auto}
.ic-install:disabled{opacity:.45;cursor:default}
.ic-error{color:var(--dsh-danger, #d43545);font-size:12px;margin:0;word-break:break-all}
.ic-ok{color:var(--dsh-success, #2f9e44);font-size:12px;margin:0;word-break:break-all}
`

    /**
     * The settings card. Uses React.createElement (no JSX).
     *
     * Groups render as a single row of tabs — one click flips the panel — with
     * the four catalogs: 默认 / 浅蓝 / 深蓝 / 自定义 (directory-backed uploads).
     * @param {object} p - catalog + handlers from the live controller state.
     */
    function IconicCard(p) {
      const { groups, tab, selectedKey, uploadedName, error, result, busy } = p

      /** One icon cell; `selectedKey` is `group/id`. */
      const tile = (groupId, preset) => {
        const key = `${groupId}/${preset.id}`
        const selected = selectedKey === key
        return React.createElement('div', {
          key,
          role: 'button',
          tabIndex: busy ? -1 : 0,
          title: preset.name,
          'aria-disabled': busy ? 'true' : undefined,
          'aria-pressed': selected ? 'true' : 'false',
          className: 'ic-tile'
            + (selected ? ' ic-selected' : '')
            + (busy ? ' ic-tile-disabled' : ''),
          onClick: () => { if (!busy) p.onPick(key) },
          onKeyDown: (event) => {
            if (busy || (event.key !== 'Enter' && event.key !== ' ')) return
            event.preventDefault()
            p.onPick(key)
          },
        },
        React.createElement('img', {
          className: 'ic-thumb',
          src: `${ICONIC_ICON_ROUTE_PREFIX}/${encodeURIComponent(groupId)}/${encodeURIComponent(preset.id)}`,
          alt: preset.name,
          width: 36,
          height: 36,
        }),
        React.createElement('span', { className: 'ic-name' }, preset.name))
      }

      const tabs = Array.isArray(groups) && groups.length > 0
        ? React.createElement('div', { className: 'ic-tabs', role: 'tablist' }, groups.map(group =>
          React.createElement('button', {
            key: group.id,
            type: 'button',
            role: 'tab',
            'aria-selected': tab === group.id ? 'true' : 'false',
            className: 'ic-tab' + (tab === group.id ? ' ic-tab-active' : ''),
            disabled: busy,
            onClick: () => { if (!busy) p.onTab(group.id) },
          },
          group.name,
          React.createElement('span', { className: 'ic-group-count' }, group.presets.length))))
        : null

      const active = Array.isArray(groups) ? groups.find(g => g.id === tab) ?? groups[0] : null
      const panel = active
        ? React.createElement('div', { className: 'ic-grid' },
          // The 自定义 tab opens with an add-placeholder cell (same footprint as
          // an icon tile): upload from here and the fresh icon lands right next
          // to it, newest-first. A transparent full-bleed file input keeps the
          // native control invisible while remaining focusable.
          active.id === 'custom'
            ? React.createElement('label', {
              className: 'ic-add' + (busy ? ' ic-tile-disabled' : ''),
            },
            React.createElement('input', {
              type: 'file',
              accept: 'image/png',
              disabled: busy,
              onChange: (event) => p.onChooseFile(event.target.files && event.target.files[0]),
            }),
            React.createElement('span', { className: 'ic-add-plus' }, '＋'),
            React.createElement('span', { className: 'ic-add-text' }, '添加图片'),
            React.createElement('span', { className: 'ic-add-req' }, 'PNG · ≤ 1 MiB'),
            React.createElement('span', { className: 'ic-add-hint' }, '自动去白底，生成多尺寸'))
            : null,
          active.presets.map(preset => tile(active.id, preset)))
        : React.createElement('p', { className: 'ic-hint' }, '正在加载图标…')

      const status = error
        ? React.createElement('p', { className: 'ic-error', role: 'status' }, error)
        : result
          ? React.createElement('p', { className: 'ic-ok', role: 'status' }, result)
          : null

      // The confirm bar: whatever tile is selected shows up here with its live
      // thumbnail, so "write to desktop" always names exactly what it writes.
      const selInfo = (() => {
        if (!selectedKey || !Array.isArray(groups)) return null
        const slash = selectedKey.indexOf('/')
        const gid = selectedKey.slice(0, slash)
        const pid = selectedKey.slice(slash + 1)
        const group = groups.find(g => g.id === gid)
        const preset = group?.presets.find(x => x.id === pid)
        return group && preset ? { group, preset } : null
      })()

      return React.createElement('div', { className: 'ic-card' },
        React.createElement('p', { className: 'ic-section-title' }, '选择一个图标，然后写入桌面快捷方式'),
        tabs,
        panel,
        React.createElement('div', { className: 'ic-confirm' + (selInfo ? '' : ' ic-confirm-empty') },
          selInfo
            ? React.createElement('img', {
              className: 'ic-confirm-thumb',
              src: `${ICONIC_ICON_ROUTE_PREFIX}/${encodeURIComponent(selInfo.group.id)}/${encodeURIComponent(selInfo.preset.id)}`,
              alt: '',
              width: 32,
              height: 32,
            })
            : null,
          selInfo
            ? React.createElement('span', { className: 'ic-confirm-name' },
              `${selInfo.group.name} · ${selInfo.preset.name}`)
            : React.createElement('span', { className: 'ic-confirm-none' },
              p.frames !== null
                ? `已处理：${uploadedName ?? '图片'}，点写入保存到自定义并写桌面`
                : '从上方选一个图标'),
          React.createElement('button', {
            type: 'button',
            className: 'ic-install',
            disabled: busy || (!selInfo && p.frames === null),
            onClick: p.onInstall,
          }, busy ? '处理中…' : '写入桌面'),
          status))
    }

    /**
     * Live card state, driving the component through `useState` (a single object
     * replaced on every change is cheap for this small card). The catalog loads
     * once per mount; install posts the staged choice to the host route.
     */
    function useIconicCard() {
      const [state, setState] = React.useState({
        groups: null,
        tab: null,
        selectedKey: null,
        uploadedName: null,
        error: null,
        result: null,
        busy: false,
      })
      const [frames, setFrames] = React.useState(null) // staged [{ size, data }] payload

      // Catalog (re)load: runs on mount and again after a successful upload,
      // so the new entry shows up under the 自定义 tab immediately.
      const loadCatalog = React.useCallback(() => {
        fetch(ICONIC_PRESETS_ROUTE)
          .then(readJson, () => { throw new Error('网络错误') })
          .then((data) => {
            const list = Array.isArray(data && data.groups) ? data.groups : []
            setState(prev => ({
              ...prev,
              groups: list,
              tab: prev.tab === null && list.length > 0 ? list[0].id : prev.tab,
            }))
          })
          .catch((cause) => {
            setState(prev => ({ ...prev, error: `无法加载图标列表：${cause.message}` }))
          })
      }, [])

      React.useEffect(() => { loadCatalog() }, [loadCatalog])

      const onTab = (id) => setState(prev => ({ ...prev, tab: id }))

      const onPick = (key) => setState(prev => ({
        ...prev, selectedKey: key, uploadedName: null, error: null, result: null,
      }))
      const onChooseFile = (file) => {
        if (!file) return
        if (file.size > MAX_UPLOAD_BASE64) {
          setState(prev => ({ ...prev, error: '图片过大（上限 1 MiB）' }))
          return
        }
        setState(prev => ({ ...prev, error: '处理中…', uploadedName: null, result: null }))
        pngToFrames(file).then((encoded) => {
          setFrames(encoded)
          setState(prev => ({
            ...prev, uploadedName: file.name, selectedKey: null, error: null, result: null,
          }))
        }).catch((cause) => setState(prev => ({ ...prev, error: cause.message })))
      }
      const onInstall = () => {
        const key = state.selectedKey
        const slash = key === null ? -1 : key.indexOf('/')
        const chosen = slash === -1
          ? null
          : { group: key.slice(0, slash), preset: key.slice(slash + 1) }
        const payload = chosen ?? (frames ? { frames, name: state.uploadedName } : null)
        if (payload === null) return
        setState(prev => ({ ...prev, busy: true, error: null, result: null }))
        fetch(ICONIC_INSTALL_ROUTE, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(readJson, () => { throw new Error('网络错误') })
          .then((resp) => {
            const where = resp && typeof resp.lnkPath === 'string'
              ? `已写入：${resp.lnkPath}` : '快捷方式已写入'
            // An upload just became a new custom entry: refresh the catalog, land
            // on that tab and select the fresh icon (the host echoes its id).
            if (frames !== null) {
              const customId = resp && typeof resp.customId === 'string' ? resp.customId : null
              setFrames(null)
              setState(prev => ({
                ...prev,
                busy: false,
                result: where,
                uploadedName: null,
                tab: 'custom',
                selectedKey: customId ? `custom/${customId}` : null,
              }))
              loadCatalog()
            } else {
              setState(prev => ({ ...prev, busy: false, result: where }))
            }
          })
          .catch((cause) => {
            setState(prev => ({ ...prev, busy: false, error: `写入失败：${cause.message}` }))
          })
      }

      return {
        ...state,
        frames,
        onPick,
        onTab,
        onChooseFile,
        onInstall,
      }
    }

    /** Shared fetch JSON reader: rejects on non-ok, tolerates non-JSON error bodies. */
    async function readJson(response) {
      if (!response.ok) {
        let detail = String(response.status)
        try {
          const body = await response.json()
          if (body && typeof body.message === 'string') detail = body.message
        } catch { /* non-JSON error body */ }
        throw new Error(detail)
      }
      return response.json()
    }

    /**
     * The mounted surface: install the panel's stylesheet once, then render the
     * picker. A no-build plugin owns its own injection — there is no global
     * `styles` object in the client (official bundles get their CSS injected by
     * the build step). Tagging the element `data-plugin` /
     * `data-plugin-css` is what the client's style bookkeeping expects.
     */
    function IconicPanel() {
      React.useEffect(() => {
        const el = document.createElement('style')
        el.setAttribute('data-plugin', 'dsh-iconic-launcher')
        el.setAttribute('data-plugin-css', 'iconic-panel')
        el.textContent = CARD_CSS
        document.head.append(el)
        return () => { el.remove() }
      }, [])
      const card = useIconicCard()
      return IconicCard(card)
    }

    /**
     * Function-plugin body. The same widget is published on two surfaces:
     *   - `settings.section` — a first-class entry in the settings navigation,
     *     a sibling of General / Models / Plugins / Plugin market;
     *   - `settings.plugin.item` — the plugin's own card on the Plugins page,
     *     so the control is also reachable where users look for plugins.
     */
    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () => slots.register({
        name: 'settings.section',
        id: 'iconic',
        order: 50,
        label: () => 'dsh-iconic-launcher',
      }, IconicPanel))
      slots.inject('settings.plugin.item', () => slots.register(
        { name: 'settings.plugin.item', key: ICONIC_NS },
        IconicPanel,
      ))
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})

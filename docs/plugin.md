# `dsh-iconic-launcher` — custom desktop shortcut icons

Choose a built-in preset icon or upload an arbitrary image (PNG / JPEG / WebP),
and the plugin writes (or refreshes) a **desktop shortcut** with that icon.

Naming, used consistently here: 「万图皆 iConic」 is the project's concept motto
(a play on DSH's 「万物皆插件」 — any picture becomes an icon); 「万图皆 icon」 is
the display name the settings card itself renders; 「桌面图标」 is the label of
the plugin's entry in the settings navigation.

- **Host half** (`index.js`, milestone 1): four `webServer` routes — catalog,
  icon bytes, install, custom-delete. The install route writes the `.lnk` +
  icon; the rest serve the card.
- **Browser half** (`client.js`, milestone 2): the same widget mounted on two
  surfaces — a top-level settings section (`settings.section`, id `iconic`,
  label `桌面图标`, rendered fully expanded) and the plugin's own card on the
  Plugins page (`settings.plugin.item`, keyed by the namespace
  `dsh-launcher-icon`, a collapsed-by-default summary row that mounts the
  picker on first expand). It carries the preset picker + PNG upload form and
  calls those routes with `fetch`.

## Why a plugin (not a one-off script)

The original `scripts/*` helper drove the `dsh web` workflow by hand and is now
legacy: it stays in the repo for the record but is **not** part of the npm
package, so it brings nothing to anyone installing the plugin. As a **Cordis
bundle** shipped from this repo it is:

- **installable** — from GitHub (`dsh plugin --profile <name> add github:SkyblueeeLabs/dsh-iconic-launcher`)
  or from a tarball; inside the desktop application it is installed through the
  client's own plugin manager (see [Install](#install));
- **declarative** — no injection of local paths; everything is validated `Config`
  in `cordis.patch.yml`;
- **reversible** — every registration is a `ctx.effect()`, so reload and teardown
  unwind it.

It deliberately stays **out of the official `deepseek-harness` tree**: pulling it
in would pollute the upstream repo, which is why the whole `dsh-iconic-launcher` project
holds it here.

## Layout

Every file is at the **repo root** (the repo root is the package root) — there is
no `plugin/` directory.

| File | Role |
|------|------|
| `index.js` | Host half: the four `webServer` routes + the settings-namespace registration that lets the card be dispatched |
| `client.js` | Browser half: the settings card (preset picker + PNG upload) calling the routes via `fetch` |
| `client.d.ts` | Browser-half type surface (published as the `./client` subpath) |
| `shared.js` | Browser/host-shared route paths + wire contract (`./shared` subpath) |
| `presets.js` | Built-in preset catalog (`PRESET_GROUPS`) + shipped `presets/assets/*.ico` loaders + custom-directory scan |
| `ico.js` | PNG→`Ico` construction: `ICONDIR` + one `ICONDIRENTRY` per size (validated upload → multi-entry `.ico`) |
| `desktop.js` | `.lnk` writer via `ctx.subprocess` → PowerShell `WScript.Shell` (named parameters only) |
| `launcher.js` | Resolves what the shortcut launches: the desktop app itself, or `''` outside it (pure function, unit-tested) |
| `shortcut.ps1` | The PowerShell script that actually writes the `.lnk` and notifies Explorer |
| `presets/assets/*.svg\|*.ico` | **44 shipped icons**: `dsh-brand` (`dsh-brand.ico`, `dsh-brand.svg`) at the assets root, then `lightblue/` (16), `deepblue/` (15), `mixed/` (12). Every `.ico` carries 7 entries: 256, 128, 64, 48, 32, 24, 16 |
| `cordis.patch.yml` | The config layer the bundle applies on install |
| `package.json` | `dsh.bundle.patch` + `dsh.client` declaration + `./client`,`./shared` subpaths |
| `scripts/`, `data/`, `deploy.ps1`, `install.ps1` | **Legacy toolchain**, kept in the repo but excluded from the npm package (`files`): the original `dsh web` starter bat, PNG/SVG→ICO converters, icon generator, desktop-shortcut script, `SETUP-SHORTCUT.md`, and the PNG source batches (`data/1`, `data/2`, `data/3`). Not maintained for new setups |

`client.d.ts` is currently the **only** type declaration on disk: `package.json`'s
`files` list and the `exports` map also name `index.d.ts`, `shared.d.ts`,
`ico.d.ts`, `desktop.d.ts`, `presets.d.ts` and `presets/*.d.ts`, but those files
do not exist yet.

## Routes (all behind the `connection` trust fence)

| Method | Kind | Path | Purpose |
|--------|------|------|---------|
| `GET` | exact | `/dsh-launcher-ic/presets` | List preset groups (including the runtime-scanned `自定义` group), the resolved install target, `shortcutName`, `desktopDir`, `iconDir`, and the host's own `{name,version,homepage}` `meta` |
| `GET` | prefix | `/dsh-launcher-ic/icon` | Serve one icon's `.ico` bytes for preview: `<group>/<preset>`, e.g. `/dsh-launcher-ic/icon/lightblue/whalechan-icon-01`; 404 when the group/preset is unknown |
| `POST` | exact | `/dsh-launcher-ic/install` | Write/refresh a desktop shortcut for one icon choice (a `{group,preset}` pair, or PNG `frames` for an upload) |
| `POST` | exact | `/dsh-launcher-ic/custom-delete` | Delete one user-uploaded custom icon file |

The icon route is registered as a **prefix** route (`kind: 'prefix'`) and
deliberately has no trailing slash: the web server matches `p` or `p/<anything>`,
so `p/` would only ever match `p//<anything>` and 404 every request.

## The browser settings card (milestone 2)

Mounted **twice** from the same `client.js` widget:

- as the top-level settings section `桌面图标` (`settings.section`, id `iconic`,
  order 50), rendered fully expanded;
- as the plugin's card in the Plugins settings page (`settings.plugin.item`,
  key `dsh-launcher-icon`), rendered as a collapsed-by-default summary row that
  mounts the full picker (and its catalog fetch) on first expand.

Either surface:

- lists the host's preset icons in tabs and highlights the selected one,
- lets the user upload an image (PNG / JPEG / WebP, browser-side file cap 1 MiB,
  `accept="image/png,image/jpeg,image/webp"`; the host re-checks the PNG
  signature on every emitted frame),
- posts the choice to `/dsh-launcher-ic/install` and reports where the `.lnk`/
  icon were written,
- on the `自定义` tab only, offers an inline two-tap `×` delete that calls
  `/dsh-launcher-ic/custom-delete`.

For the card to be **dispatched**, the Host must serve the namespace it is keyed
on — the Plugins tab only renders cards for namespaces the Host describes.
`index.js` registers it via `ctx.settings.register('dsh-launcher-icon', …)`
inside `apply`, so a composition with a settings service serves it.

## Upload pipeline

The browser owns the pixel work; the host process owns no rasterizer.
`client.js` `imageToFrames()` does `createImageBitmap` (which decodes **any**
format the engine supports — PNG, JPEG and WebP in practice) → a square
letterbox canvas (transparent padding, never white) → `knockOutWhiteBackdrop(data,
w, h, tolerance = 24)`, which flood-fills the flat white plate from all four
borders inward and then re-alphas the bordering rim with a 2-step feather (a
global white-to-alpha rule would punch holes through white artwork) → one PNG
per `ICON_SIZES` entry (256, 128, 64, 48, 32, 24, 16).

Two details that make non-PNG input safe:

- **Every emitted frame is re-encoded as PNG** (`toDataURL('image/png')`), so the
  host's signature check validates what this function produces, not the file the
  user picked. That is why accepting JPEG/WebP needs no host-side change and no
  rasterizer dependency.
- **The worked canvas is capped at 1024 px on its longest side**, and oversized
  images are downscaled rather than rejected. Everything downstream is
  O(pixels) — the backdrop flood fill allocates a visited array the size of the
  frame — so an uncapped 8000×8000 source would freeze the tab (measured: 4M px
  ≈ 0.1 s, 36M px ≈ 2 s plus hundreds of MB transient). 1024 is 4× the largest
  emitted icon, so the artwork stays sharp.

The host then validates: per-frame cap 512 KiB, a real PNG signature
(`ico.js` `isPng`), size must be in `ICON_SIZES`, no duplicate sizes, and a body
ceiling of `ICON_SIZES.length * 512 KiB * 1.4 + 8 KiB`. Accepted frames are
packed into one `.ico`, persisted as a new custom icon, and then written as the
shortcut icon.

## Desktop edition

The plugin targets the **DeepSeek Harness desktop application** and nothing
else. The Electron shell starts this host as a Node-mode child of the
application's own executable, so the host resolves its own launcher at runtime
and the shortcut launches the application directly — `cordis.patch.yml` carries
no machine-specific executable path.

`launcher.js` `resolveDesktopLauncher(env, execPath, electronNode)` applies this
precedence:

1. `DSH_DESKTOP_NODE_EXECUTABLE`, when the shell names the launcher explicitly;
2. otherwise `process.execPath`, but only when the host runs as an Electron
   Node-mode child **and** that path ends in `.exe` (under `dsh web` it would be
   `node.exe`, which resolves to `''` — a shortcut to `node` is useless).

Outside the desktop application the host resolves to no launcher, and the
install route answers HTTP 500 `{ code: 'no-target' }` rather than writing a
link to nowhere; nothing is written.

`shortcutName` deliberately matches the application's own desktop shortcut, so
installing an icon customises that shortcut instead of leaving two competing
"DeepSeek Harness" entries. An application update reinstates the stock shortcut
(the installer recreates it) — re-run the install to put the icon back.

## Config (`cordis.patch.yml`)

| Field | Schema default (`index.js`) | Meaning |
|-------|---------------------------|---------|
| `shortcutName` | `DeepSeek Launcher` | base name (no extension) of the `.lnk`. The **shipped `cordis.patch.yml` overrides it to `DeepSeek Harness`** to match the app's own shortcut |
| `targetExecutable` | `''` | absolute exe the shortcut launches. **Empty means "the hosting desktop application, resolved at runtime"**; set a literal only to override. A literal value still wins |
| `targetArguments` | `''` | args placed on the shortcut target |
| `workingDirectory` | `''` | shortcut working folder; empty means the target executable's own directory (or `desktopDir` when no target resolved — moot in the desktop edition, where a missing target is refused with `no-target`) |
| `iconDir` | `%USERPROFILE%\.dsh-launcher\icons` | where chosen icons are written |
| `customDir` | `''` | where uploaded icons are kept; empty means `iconDir/custom` (the effective default) |
| `desktopDir` | `%USERPROFILE%\Desktop` | where the `.lnk` is created |
| `allowUpload` | `true` | allow uploads, or presets only |

What one install writes:

- the icon, content-addressed as
  `%USERPROFILE%\.dsh-launcher\icons\<shortcutBase>.<sha256(bytes)[:10]>.ico`;
  a fresh name per content is what makes Explorer redraw (its icon cache is
  keyed by path), and superseded files with the same base are pruned;
- an upload is first persisted as a custom icon at
  `…\.dsh-launcher\icons\custom\custom-<slug>-<epoch-ms>.ico`, then packed;
- the shortcut at `%USERPROFILE%\Desktop\<shortcutBase>.lnk`, after which
  `shortcut.ps1` calls `SHChangeNotify(SHCNE_UPDATEITEM, SHCNF_PATHW, lnk)`.

Every value reaches `shortcut.ps1` as a **named** parameter. PowerShell's `-File`
binder reads a bare argument starting with `-` as a parameter *name*, so a
positional `-NoProfile …` value fails with
`A parameter cannot be found that matches parameter name …` and exit 1 before
anything is written.

## Install

**Desktop edition — through the client's plugin manager.** `dsh plugin
--profile desktop …` is refused by the CLI (`profile "desktop" is managed
exclusively by the Electron application`), so the desktop profile is installed
from the DeepSeek Harness application's own plugin management UI, not from a
shell.

For any other profile, or a git checkout:

```sh
dsh plugin --profile <name> add github:SkyblueeeLabs/dsh-iconic-launcher
```

A tarball works too (`npm pack` in the repo root, then add the resulting `.tgz`).
Since `v0.1.2` the published Release asset matches `main`; `v0.1.1` predates the
desktop-only switch (tag `55a5694`, no `launcher.js`, legacy
`powershell -Command "dsh web"` target) and should not be used. Installing from
GitHub resolves `main` and is current by construction.

Plain-JS bundle — **no build step** — so a `git` install loads it directly.
The `dsh.client` declaration in `package.json` plus the `./client` export let the
harness's client-modules roster discover the browser half; **both halves attach
to the single `dsh-iconic-launcher` row**. The host half requires a composition
that mounts `webServer`, `connection`, and `subprocess`, and injects `settings`
optionally (without it the routes still work, but the Plugins card is not
dispatched); the browser card needs `slots` and `ui-settings-plugins` (all
present in the default Web profile).

## Security

- Every route — all four — calls `connection.requestRejection(...)` first
  (Host/Origin fence + browser login cookie) — the same fence
  `@deepseek-ai/dsh-host-open-in-app` uses.
- Install validates the body at the wire: `application/json` media type
  (415 otherwise), bounded body (413), sanitized shortcut name, and — on upload
  — bounded frames each carrying a real PNG signature.
- Shortcut names are restricted to a safe alphabet; empty, overlength (> 60
  chars), and Windows device names (`con`, `prn`, `aux`, `nul`, `com1`…`lpt9`)
  are rejected.
- The icon prefix route only serves ids that resolve: a shipped preset from the
  catalog, or a `custom` id matching `/^[A-Za-z0-9._-]+$/` whose `.ico` exists
  in `customDir`; anything else is a 404.
- Custom-delete is the only destructive path: `application/json` and a 4 KiB
  body cap, the id must match `/^[A-Za-z0-9._-]+$/` and not be all dots, and
  the resolved target must sit strictly inside `customDir`; shipped presets are
  not addressable there (they live under the read-only assets tree).

## Status / next

- ✅ Host: four routes + settings namespace + preset catalog + upload→`Ico` +
  `.lnk` write.
- ✅ Browser card: preset picker (44 shipped icons across 默认/浅蓝/深紫/混搭 plus
  the runtime 自定义 group) + image upload form (PNG / JPEG / WebP), mounted on
  both `settings.section` and `settings.plugin.item`.
- ✅ Desktop edition: the shortcut launches the hosting desktop application,
  resolved at runtime, with the chosen icon.
- ✅ Screenshots: five, one per tab — `assets/screenshots/1-default.png`,
  `2-lightblue.png`, `3-deep-purple.png`, `4-mixed.png`, `5-custom.png`, all
  listed in `screenshots.json`.
- ✅ Tests: `node --test --test-isolation=none test/*.test.mjs` — 19 tests
  passing (launcher resolution, named-argument binding for `shortcut.ps1`, the
  ICO directory layout, and preset catalog integrity).
- ✅ Uploads accept PNG / JPEG / WebP (v0.1.2); every frame is re-encoded to PNG
  browser-side, so no host-side rasterizer is needed. The worked canvas is
  capped at 1024 px on its longest side and oversized images are downscaled.
- ⏭ "Remember the last choice" is not implemented: `index.js` registers the
  settings schema with `lastPreset`/`lastShortcut`, but `client.js` never reads
  or writes them, so the selection does not survive a reload.

## License

MIT.

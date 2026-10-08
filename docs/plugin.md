# `dsh-iconic-launcher` (`dsh-iconic-launcher`) — custom desktop shortcut icons

Both halves of the "**万图皆 icon**" launcher: choose a built-in preset icon or
upload an arbitrary PNG, and the plugin writes (or refreshes) a **desktop
shortcut** with that icon.

- **Host half** (`index.js`, milestone 1): two `webServer` routes serve the
  preset catalog and write the `.lnk` + icon.
- **Browser half** (`client.js`, milestone 2): a settings card in the DeepSeek
  Harness **Plugins** page (`settings.plugin.item`) with a preset picker + PNG
  upload form that calls those routes.

It works today over the `ctx.webServer` routes the host half mounts; the browser
card mounts into the Plugins/`settings.plugin.item` slot and drives the same
routes with `fetch`.

## Why a plugin (not a one-off script)

The original `scripts/*` launcher is machine-local and untracked — it dies on a
re-clone. As a **Cordis bundle** shipped from this repo it is:

- **installable** — `dsh plugin --profile <name> add github:SkyblueeeLabs/dsh-iconic-launcher` (or a tarball);
- **declarative** — no injection of local paths; everything is validated `Config`
  in `cordis.patch.yml`;
- **reversible** — every registration is a `ctx.effect()`, so reload and teardown
  unwind it.

It deliberately stays **out of the official `deepseek-harness` tree**: pulling it
in would pollute the upstream repo, which is why the whole `dsh-iconic-launcher` project
holds it here.

## Layout

| File | Role |
|------|------|
| `plugin/index.js` | Host half: the two `webServer` routes + the settings-namespace registration that serves the card |
| `plugin/client.js` | Browser half: the `settings.plugin.item` settings card (picker + upload) calling the routes via `fetch` |
| `plugin/client.d.ts` | Browser-half type surface (published as the `./client` subpath) |
| `plugin/shared.js` | Browser/host-shared route paths + wire contract (`./shared` subpath) |
| `plugin/presets.js` | Built-in preset catalog + shipped `presets/assets/*.ico` loaders |
| `plugin/ico.js` | PNG→`Ico` construction (validated upload → single-entry multi-size `.ico`) |
| `plugin/desktop.js` | `.lnk` writer via `ctx.subprocess` → PowerShell `WScript.Shell` |
| `plugin/presets/assets/*.svg\|*.ico` | The 6 preset icons (brand, terminal, rocket, gear, whalechan-brand, whalechan-purple) |
| `plugin/cordis.patch.yml` | The config layer the bundle applies on install |
| `plugin/package.json` | `dsh.bundle.patch` + `dsh.client` declaration + `./client`,`./shared` subpaths |

## Routes (all behind the `connection` trust fence)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/dsh-launcher-ic/presets` | List preset icons + host install targets |
| `POST` | `/dsh-launcher-ic/install` | Write/refresh a desktop shortcut for one icon choice |

## The browser settings card (milestone 2)

Mounts into the **Plugins** settings section (`settings.plugin.item`), keyed by
the namespace `dsh-launcher-icon`. It:

- lists the host's preset icons and highlights the selected one,
- lets the user upload a PNG (capped at 1 MiB, PNG signature checked client-side),
- posts the choice to `/dsh-launcher-ic/install` and reports where the `.lnk`/
  icon were written.

For the card to be **dispatched**, the Host must serve the namespace it is keyed
on — the Plugins tab only renders cards for namespaces the Host describes.
`index.js` registers it via `ctx.settings.register('dsh-launcher-icon', …)`
inside `apply`, so a composition with a settings service serves it.

## Desktop edition

The plugin targets the **DeepSeek Harness desktop application** and nothing
else. The Electron shell starts this host as a Node-mode child of the
application's own executable, so the host resolves its own launcher at runtime
(`process.execPath`, or `DSH_DESKTOP_NODE_EXECUTABLE` where the shell names it)
and the shortcut launches the application directly — `cordis.patch.yml` carries
no machine-specific executable path. Outside the desktop application the host
resolves to no launcher, and the install route refuses with `no-target` rather
than writing a link to nowhere.

`shortcutName` deliberately matches the application's own desktop shortcut, so
installing an icon customises that shortcut instead of leaving two competing
"DeepSeek Harness" entries. An application update reinstates the stock shortcut
(the installer recreates it) — re-run the install to put the icon back.

## Config (`cordis.patch.yml`)

| Field | Default | Meaning |
|-------|---------|---------|
| `shortcutName` | `DeepSeek Launcher` | base name (no extension) of the `.lnk` |
| `targetExecutable` | *(the hosting desktop app)* | absolute exe the shortcut launches; set only to override |
| `targetArguments` | `''` | args placed on the shortcut target |
| `workingDirectory` | *(the target's own directory)* | shortcut working folder |
| `iconDir` | `%USERPROFILE%\.dsh-launcher\icons` | where chosen icons are written |
| `desktopDir` | `%USERPROFILE%\Desktop` | where the `.lnk` is created |
| `allowUpload` | `true` | allow uploads, or presets only |

Every value reaches `shortcut.ps1` as a **named** parameter. PowerShell's `-File`
binder reads a bare argument starting with `-` as a parameter *name*, so a
positional `-NoProfile …` value fails with
`A parameter cannot be found that matches parameter name …` and exit 1 before
anything is written.

## Install

```sh
dsh plugin --profile <name> add github:SkyblueeeLabs/dsh-iconic-launcher
```

Plain-JS bundle — **no build step** — so a `git` install loads it directly.
The `dsh.client` declaration in `package.json` plus the `./client` export let the
harness's client-modules roster discover the browser half; **both halves attach
to the single `dsh-iconic-launcher` row**. The host half requires a composition
that mounts `webServer`, `connection`, `subprocess`, and `settings`; the browser
card needs `slots` and `ui-settings-plugins` (all present in the default Web
profile).

## Security

- Every route calls `connection.requestRejection(...)` first (Host/Origin fence +
  browser login cookie) — the same fence `@deepseek-ai/dsh-host-open-in-app` uses.
- Install validates the body at the wire: `application/json` media type, bounded
  body, sanitized shortcut name, and a real PNG signature on uploads.
- Shortcut names are restricted to a safe alphabet; Windows device names and
  overlength names are rejected.

## Status / next

- ✅ Host routes + settings namespace + preset catalog + upload→`Ico` + `.lnk` write.
- ✅ Browser settings card (milestone 2): preset picker + PNG upload form calling
  the two routes via `fetch`, mounted in `settings.plugin.item`.
- ✅ Desktop edition: the shortcut launches the hosting desktop application,
  resolved at runtime, with the chosen icon.
- ⏭ Non-PNG uploads (JPEG/WebP) need a rasterizer (`sharp`) at the host runtime.
- ⏭ A live render of the card inside the desktop application has not been
  screenshotted yet; the `.lnk` write itself is verified on Windows.

## License

MIT.
# `@dsh-launcher/iconic` — custom desktop shortcut icons

Host half of the "**万图皆 icon**" launcher: choose a built-in preset icon or
upload an arbitrary image, and the plugin writes (or refreshes) a **desktop
shortcut** with that icon.

This is the **host-side core** (milestone 1) of the larger plan to put a
settings card in the DeepSeek Harness web UI. It works today over the
`ctx.webServer` routes; the browser settings card mounts on those routes in a
later milestone.

## Why a plugin (not a one-off script)

The original `scripts/*` launcher is machine-local and untracked — it dies on a
re-clone. As a **Cordis bundle** shipped from this repo it is:

- **installable** — `dsh plugin --profile <name> add github:SkyblueeeLabs/dsh-launcher` (or a tarball);
- **declarative** — no injection of local paths; everything is validated `Config`
  in `cordis.patch.yml`;
- **reversible** — every registration is a `ctx.effect()`, so reload and teardown
  unwind it.

It deliberately stays **out of the official `deepseek-harness` tree**: pulling it
in would pollute the upstream repo, which is why the whole `dsh-launcher` project
holds it here.

## Layout

| File | Role |
|------|------|
| `plugin/index.js` | Function plugin (`name`/`inject`/`Config`/`apply`) wiring the two routes |
| `plugin/shared.js` | Browser-safe route constants + wire-contract version (`./shared` subpath) |
| `plugin/ico.js` | PNG→`Ico` construction (validated upload → single-entry multi-size `.ico`) |
| `plugin/desktop.js` | `.lnk` writer via `ctx.subprocess` → PowerShell `WScript.Shell` |
| `plugin/presets.js` | Built-in preset catalog + shipped `presets/assets/*.ico` loaders |
| `plugin/presets/assets/*.svg|*.ico` | The 4 preset icons (brand, terminal, rocket, gear) |
| `plugin/cordis.patch.yml` | The config layer the bundle applies on install |
| `plugin/package.json` | `dsh.bundle.patch` declaration + `./shared` subpath |

## Routes (all behind the `connection` trust fence)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/dsh-launcher-ic/presets` | List preset icons + host install targets |
| `POST` | `/dsh-launcher-ic/install` | Write/refresh a desktop shortcut for one icon choice |

## Config (`cordis.patch.yml`)

| Field | Default | Meaning |
|-------|---------|---------|
| `shortcutName` | `DeepSeek Launcher` | base name (no extension) of the `.lnk` |
| `targetExecutable` | *(required)* | absolute exe/command the shortcut launches |
| `targetArguments` | `''` | args placed on the shortcut target |
| `workingDirectory` | *(desktop dir)* | shortcut working folder |
| `iconDir` | `%USERPROFILE%\.dsh-launcher\icons` | where chosen icons are written |
| `desktopDir` | `%USERPROFILE%\Desktop` | where the `.lnk` is created |
| `allowUpload` | `true` | allow uploads, or presets only |

## Install

```sh
dsh plugin --profile <name> add github:SkyblueeeLabs/dsh-launcher
```

Plain-JS bundle — **no build step** — so a `git` install loads it directly.
Requires a composition that mounts `webServer`, `connection`, and `subprocess`
(the default Web app profile already does).

## Security

- Every route calls `connection.requestRejection(...)` first (Host/Origin fence +
  browser login cookie) — the same fence `@deepseek-ai/dsh-host-open-in-app` uses.
- Install validates the body at the wire: `application/json` media type, bounded
  body, sanitized shortcut name, and a real PNG signature on uploads.
- Shortcut names are restricted to a safe alphabet; Windows device names and
  overlength names are rejected.

## Status / next

- ✅ Host routes + preset catalog + upload→`Ico` + `.lnk` write implemented and
  verified to parse/load in Node.
- ⏭ Milestone 2: browser settings card mounting `settings.plugin.item`, with the
  icon picker + upload form calling these routes.
- ⏭ Non-PNG uploads (JPEG/WebP) need a rasterizer (sharp) at the host runtime.

## License

MIT.
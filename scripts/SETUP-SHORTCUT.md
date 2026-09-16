# Desktop Shortcut + Launcher Icon Setup

DeepSeek Harness is launched from a desktop shortcut that runs
`scripts/start-dsh-web.bat` and shows a custom `.ico`. This page documents the
three-file toolchain and how to rebuild it after a clean checkout or an upgrade
that wipes local (untracked) files.

## Files

| File | Purpose |
|------|---------|
| `scripts/start-dsh-web.bat` | Node-based launcher (runs `dsh web` directly). |
| `scripts/create-desktop-shortcut.ps1` | Creates/refreshes the desktop `.lnk`. |
| `scripts/generate-icon.ps1` | Regenerates `scripts/dsh-icon.ico` from the SVG favicon. |
| `scripts/convert-svg-to-ico.mjs` | SVG → multi-resolution ICO writer used by the generator. |
| `scripts/dsh-icon.ico` | The icon shown on the desktop shortcut. |

These files are local-only: they are **not** tracked by git (none of the
`scripts/` launcher files are committed). Deleting the checkout or running
`git reset --hard` removes them, so keep this recipe handy.

## First-time / after an upgrade

```powershell
# 1. (Only after a fresh checkout/upgrade) regenerate the icon.
#    Needs an installed sharp module; the generator probes the dsh web profile.

# 2. Put the launcher and icon in place, then create the shortcut:
powershell -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1
```

The shortcut targets:

- **Target** `%COMSPEC%`
- **Args** `/c "<repo>\scripts\start-dsh-web.bat"`
- **Icon** `<repo>\scripts\dsh-icon.ico,0`

## Rebuilding just the icon

```powershell
# uses apps/web/public/favicon.svg as the source artwork
powershell -ExecutionPolicy Bypass -File .\scripts\generate-icon.ps1
# refresh the shortcut so it re-reads the icon path
powershell -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1
```

The icon factory `convert-svg-to-ico.mjs` accepts any SVG and writes a
multi-size `.ico` (16–256). If you prefer different artwork, save it as
`scripts/favicon.svg` (square) and re-run `generate-icon.ps1`.

## Troubleshooting

- **Shortcut shows generic/blank icon** — `scripts\dsh-icon.ico` is missing.
  Re-run `generate-icon.ps1` then `create-desktop-shortcut.ps1`.
- **`sharp module not found`** — point `generate-icon.ps1` at an install with
  `$env:SHARP_MODULE="C:\path\to\sharp"` before running it.
- **Launcher window flashes and closes** — read `scripts/launcher.log`; the
  launcher logs every step there.
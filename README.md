# dsh-launcher

Portable launcher toolchain for **DeepSeek Harness** (`deepseek-harness`) on
Windows. It lets you launch the Web UI from a desktop shortcut that shows a real
icon, and it lives in its **own repository** so it survives a clean re-clone of
the upstream repo.

## Why this exists

The upstream repo (github.com/deepseek-ai/deepseek-harness) does **not** contain
any of this tooling. Launch helpers you drop into `scripts/` are your own local
files: the moment you wipe the checkout and re-clone, they are gone unless you
keep them somewhere else. This repo is that "somewhere else" — everything here
is **path-sanitized** and usable on any machine.

## Layout

| Path | Purpose |
|------|---------|
| `scripts/start-dsh-web.bat` | Portable launcher. Locates `node` on PATH (or `DSH_NODE_DIR`) and runs `dsh web` via the tsx/esm entry (`node --import tsx/esm .../apps/cli/src/bin.ts web`). Logs every step to `scripts/launcher.log`. |
| `scripts/dsh-icon.ico` | Multi-resolution icon shown on the desktop shortcut. |
| `scripts/convert-svg-to-ico.mjs` | SVG → multi-size `.ico` writer (16–256), no build deps beyond `sharp`. |
| `scripts/generate-icon.ps1` | Rebuilds `dsh-icon.ico` from an SVG (probes a `sharp` install). |
| `scripts/create-desktop-shortcut.ps1` | Creates/refreshes the desktop `.lnk` pointing at `start-dsh-web.bat` with `dsh-icon.ico`. |
| `scripts/SETUP-SHORTCUT.md` | Full setup / troubleshooting notes. |
| `deploy.ps1` | One-shot restore: copies `scripts/` back into a DeepSeek Harness checkout and refreshes the shortcut. |
| `install.ps1` | One-shot install for a new user: build a fresh `deepseek-harness` checkout, generate the icon, create the shortcut. |

## Quick use

### Restore after re-cloning the upstream repo

```powershell
# from anywhere, point at your harness checkout (auto-detected or -RepoRoot)
./deploy.ps1 -RepoRoot "C:\where\you\cloned\deepseek-harness"
```

### First-time setup (new machine)

```powershell
./install.ps1            # clone upstream + install icon + create shortcut
```

### Rebuild just the icon

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/generate-icon.ps1
powershell -ExecutionPolicy Bypass -File ./scripts/create-desktop-shortcut.ps1
```

## Requirements

- Windows 10/11, PowerShell 5.1+ (or PowerShell 7).
- Node.js on PATH (the launcher also probes `%ProgramFiles%\nodejs` and
  `%LOCALAPPDATA%\Programs\nodejs`; override with `DSH_NODE_DIR`).
- `sharp` only if you need to rebuild the icon (optional).

## License

MIT. The icon is derived from DeepSeek Harness's own favicon (MIT).

## Notes / caveats

- These files are intentionally **not** part of the upstream repository. Do not
  commit them there; keep them here and push to your own fork instead.
- The desktop shortcut references the icon and the launcher by **absolute
  path** under your checkout; after re-cloning, re-run `deploy.ps1` so the
  shortcut re-points correctly.
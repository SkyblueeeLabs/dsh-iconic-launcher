# Regenerate scripts/dsh-icon.ico from the repository favicon.
#
# Usage (PowerShell, from the repo root or anywhere):
#   powershell -ExecutionPolicy Bypass -File .\scripts\generate-icon.ps1
#
# Renders apps/web/public/favicon.svg into a multi-resolution
# scripts/dsh-icon.ico via scripts/convert-svg-to-ico.mjs. Sharp is loaded from
# the first available of: $env:SHARP_MODULE, the dsh web profile install, or
# the repository root. The icon is a faithful copy of the browser favicon, so
# editing the favicon.svg and re-running keeps the launcher icon
# in lockstep.

param(
  # Absolute path to an installed `sharp` module directory. When empty, the
  # script probes the web profile and the repository root.
  [string]$SharpModule = $env:SHARP_MODULE
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

if (-not $SharpModule) {
  $profileSharp = Join-Path $env:USERPROFILE '.dsh\profiles\node_modules\sharp'
  $rootSharp = Join-Path $repoRoot 'node_modules\sharp'
  if (Test-Path $profileSharp) { $SharpModule = $profileSharp }
  elseif (Test-Path $rootSharp) { $SharpModule = $rootSharp }
}

if (-not $SharpModule) {
  throw 'sharp module not found; set $env:SHARP_MODULE to a sharp install'
}

$env:SHARP_MODULE = $SharpModule
& node "$scriptDir\convert-svg-to-ico.mjs" `
  --svg (Join-Path $repoRoot 'apps\web\public\favicon.svg') `
  --out (Join-Path $scriptDir 'dsh-icon.ico')
if ($LASTEXITCODE -ne 0) { throw "convert-svg-to-ico.mjs failed with exit $LASTEXITCODE" }

Write-Host "OK: $(Join-Path $scriptDir 'dsh-icon.ico') regenerated."
# One-shot install for a new machine / new user.
#
# Clones the upstream DeepSeek Harness repo (if not already present), copies the
# launcher toolchain into its scripts/, and creates the desktop shortcut.
#
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -CloneDir C:\src\deepseek-harness
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -SkipClone

param(
  # Where to clone deepseek-harness. Defaults to a sibling of this launcher.
  [string]$CloneDir,

  # Set to reuse an existing checkout in -CloneDir without cloning.
  [switch]$SkipClone,

  # Upstream remote used when cloning. Overridable for mirrors.
  [string]$Remote = 'https://github.com/deepseek-ai/deepseek-harness.git'
)

$ErrorActionPreference = 'Stop'
$launcherDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $CloneDir) { $CloneDir = Join-Path (Split-Path $launcherDir -Parent) 'deepseek-harness' }

if (-not (Test-Path (Join-Path $CloneDir 'apps'))) {
    if ($SkipClone) { throw "no checkout at $CloneDir and -SkipClone given" }
    Write-Host "cloning $Remote into $CloneDir ..."
    git clone --depth 1 $Remote $CloneDir
    if ($LASTEXITCODE -ne 0) { throw "git clone failed ($LASTEXITCODE)" }
}

# Deploy our launcher scripts.
$srcScripts = Join-Path $launcherDir 'scripts'
$dstScripts = Join-Path $CloneDir 'scripts'
New-Item -ItemType Directory -Force -Path $dstScripts | Out-Null
Copy-Item -LiteralPath (Join-Path $srcScripts 'start-dsh-web.bat') `
          -Destination (Join-Path $dstScripts 'start-dsh-web.bat') -Force
Copy-Item -LiteralPath (Join-Path $srcScripts 'convert-svg-to-ico.mjs') `
          -Destination (Join-Path $dstScripts 'convert-svg-to-ico.mjs') -Force
Copy-Item -LiteralPath (Join-Path $srcScripts 'create-desktop-shortcut.ps1') `
          -Destination (Join-Path $dstScripts 'create-desktop-shortcut.ps1') -Force
Copy-Item -LiteralPath (Join-Path $srcScripts 'generate-icon.ps1') `
          -Destination (Join-Path $dstScripts 'generate-icon.ps1') -Force
if (Test-Path (Join-Path $srcScripts 'dsh-icon.ico')) {
    Copy-Item -LiteralPath (Join-Path $srcScripts 'dsh-icon.ico') `
              -Destination (Join-Path $dstScripts 'dsh-icon.ico') -Force
}

# Always finish with the shortcut; if the icon is missing we generate it first.
$shortcut = Join-Path $dstScripts 'create-desktop-shortcut.ps1'
if (Test-Path (Join-Path $dstScripts 'dsh-icon.ico')) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $shortcut
} else {
    Write-Host 'no icon present; run scripts/generate-icon.ps1 then the shortcut script.'
}
Write-Host "OK. Launch with the desktop shortcut or: cd $CloneDir; scripts\\start-dsh-web.bat"
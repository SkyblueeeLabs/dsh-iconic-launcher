# One-shot restore: copy the launcher toolchain back into a DeepSeek Harness
# checkout and refresh the desktop shortcut.
#
# Use this after you re-clone (or git reset --hard) the upstream repo, which
# wipes local scripts/ additions. Auto-detects the repo when -RepoRoot is
# omitted (sibling "deepseek-harness" of this launcher directory, or its parent
# when the launcher sits inside a repo-style layout).
#
#   powershell -ExecutionPolicy Bypass -File .\deploy.ps1
#   powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -RepoRoot C:\src\deepseek-harness

param(
  # Absolute path to a deepseek-harness checkout root (contains apps/web).
  [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'

function Resolve-HarnessRepo([string]$hint) {
    if ($hint) {
        if (-not (Test-Path (Join-Path $hint 'apps'))) { throw "not a harness checkout: $hint" }
        return (Get-Item $hint).FullName
    }
    $launcherDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    foreach ($candidate in @(
        (Join-Path $launcherDir 'deepseek-harness'),
        (Join-Path (Split-Path $launcherDir -Parent) 'deepseek-harness')
    )) {
        if (Test-Path (Join-Path $candidate 'apps')) { return $candidate }
    }
    throw "repo not found; pass -RepoRoot <path>"
}

$launcherDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-HarnessRepo $RepoRoot
$srcScripts = Join-Path $launcherDir 'scripts'
$dstScripts = Join-Path $repo 'scripts'

New-Item -ItemType Directory -Force -Path $dstScripts | Out-Null
Get-ChildItem -LiteralPath $srcScripts -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dstScripts $_.Name) -Force
}
Write-Host "deployed launcher scripts -> $dstScripts"

# Refresh the desktop shortcut with the regenerated icon.
$shortcut = Join-Path $dstScripts 'create-desktop-shortcut.ps1'
if (Test-Path $shortcut) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $shortcut
    if ($LASTEXITCODE -ne 0) { throw "create-desktop-shortcut.ps1 failed ($LASTEXITCODE)" }
}
Write-Host 'OK: launcher restored and shortcut refreshed.'
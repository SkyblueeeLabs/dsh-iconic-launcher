#Requires -Version 5.1
<#
  dsh-iconic-launcher -- release script.

  Usage:
    powershell -ExecutionPolicy Bypass -File .\scripts\release.ps1

  Deliberately pure ASCII: Windows PowerShell 5.1 reads a BOM-less script as
  ANSI, so non-ASCII text in this file would be mojibake on a default console.
  Human-facing Chinese prose therefore lives in a separate UTF-8 markdown file
  (docs/marketplace/RELEASE-NOTES-<version>.md), read back with an explicit
  UTF-8 decoder.

  Principles:
    * Stop at the first failure; never leave a half-finished release state.
    * Only ADD a tag. Never delete or rewrite an already-published tag/Release
      (v0.1.1 stays immutable).
    * Never force push, never rewrite history.
    * The version is read from package.json; this script carries no version
      constant of its own, so it cannot drift.

  Idempotency: safe to re-run after a failure. An already-pushed main/tag is
  tolerated; an already-created Release aborts with a manual-handling hint.
#>

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Repo   = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Remote = 'SkyblueeeLabs/dsh-iconic-launcher'
$Branch = 'main'

function Step($msg) { Write-Host ''; Write-Host "=== $msg ===" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  [ok] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Die($msg)  {
    Write-Host ''
    Write-Host "[ABORT] $msg" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------- 0. preflight
Step 'Preflight'

if (-not (Test-Path (Join-Path $Repo 'package.json'))) { Die "package.json not found; Repo=$Repo" }
Set-Location -LiteralPath $Repo

$pkgVer = (Get-Content package.json -Raw | ConvertFrom-Json).version
if ([string]::IsNullOrWhiteSpace($pkgVer)) { Die 'package.json has no version' }
$Ver = $pkgVer
$Tag = 'v' + $Ver
Ok "version (from package.json) = $Ver"

# The browser fallback constant must match, or the card header shows a stale
# version after install.
$fb = (Select-String -Path client.js -Pattern "PLUGIN_VERSION_FALLBACK = '([^']+)'").Matches
if ($fb.Count -ne 1) { Die 'cannot locate exactly one PLUGIN_VERSION_FALLBACK in client.js' }
if ($fb[0].Groups[1].Value -ne $Ver) { Die "client.js fallback is $($fb[0].Groups[1].Value) but package.json says $Ver" }
Ok "client.js fallback = $Ver (consistent)"

if (git tag --list $Tag) { Die "local tag $Tag already exists; this script never overwrites a published version" }
Ok "no local tag $Tag"

# NOTE: under $ErrorActionPreference = 'Stop', a native command writing to stderr
# raises NativeCommandError in Windows PowerShell 5.1. `gh release view` writes
# "release not found" to stderr precisely when the Release does NOT exist -- i.e.
# the success case here. Scope the preference down around this probe.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$releaseProbe = gh release view $Tag --repo $Remote 2>&1
$releaseProbeCode = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($releaseProbeCode -eq 0) { Die "remote Release $Tag already exists" }
Ok "no remote Release $Tag"

$cur = (git rev-parse --abbrev-ref HEAD).Trim()
if ($cur -ne $Branch) { Die "on branch $cur, expected $Branch" }
Ok "branch = $cur"

$notesPath = Join-Path $Repo "docs/marketplace/RELEASE-NOTES-$Tag.md"
if (-not (Test-Path $notesPath)) { Die "release notes not found: $notesPath" }
Ok "release notes: $notesPath"

$dirty = git status --porcelain
if ([string]::IsNullOrWhiteSpace($dirty)) { Warn 'working tree clean -- nothing to commit (already committed?)' }
else {
    Ok 'pending changes:'
    $dirty -split "`n" | Where-Object { $_ } | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
}

Step 'Run tests'
node --test --test-isolation=none test/*.test.mjs
if ($LASTEXITCODE -ne 0) { Die 'tests failed; refusing to release' }
Ok 'all tests passed'

# ---------------------------------------------------------------- 1. commit
Step 'Commit'
$dirty = git status --porcelain
if ([string]::IsNullOrWhiteSpace($dirty)) {
    Ok 'nothing to commit, skipping'
} else {
    git add -A
    if ($LASTEXITCODE -ne 0) { Die 'git add failed' }
    git diff --cached --name-status
    if ($LASTEXITCODE -ne 0) { Die 'git diff --cached failed' }

    $msg = @"
feat(v$Ver): accept PNG/JPEG/WebP uploads, cap source canvas, complete type declarations

- client.js: accept PNG/JPEG/WebP. createImageBitmap decodes any engine-supported
  format and every emitted frame is re-encoded to PNG, so the host's signature
  check and the no-rasterizer design both still hold. Rename pngToFrames to
  imageToFrames.
- client.js: cap the worked canvas at 1024px on its longest side. The backdrop
  flood fill is O(pixels) and previously had no dimension bound at all -- only
  the 1 MiB *file* size was checked, so a 1 MiB 8000x8000 decode (64M px, roughly
  300 MB transient) could lock the tab. Oversized images are downscaled, not
  rejected.
- Add the six .d.ts files package.json already declared but never shipped
  (index/shared/ico/desktop/launcher/presets); drop the presets/*.js and
  presets/*.d.ts globs that matched no files; add engines.node >= 20.
- Remove dead ICONIC_VERSION (nothing imported it) and sync the client version
  fallback constant, which still said 0.1.1.
- Tests: 19 passing (was 8), covering the ICO directory layout (including the
  >64 KiB 32-bit length regression) and preset catalog integrity.
- Docs: rewrite README around the project's premise; correct stale facts in
  docs/plugin.md and docs/HANDOFF.md; document the v0.1.1 release drift.
"@
    git commit -m $msg
    if ($LASTEXITCODE -ne 0) { Die 'git commit failed' }
    Ok "committed $(git rev-parse --short HEAD)"
}

# ---------------------------------------------------------------- 2. pack
Step 'Pack'
$tgz = Join-Path $Repo "dsh-iconic-launcher-$Ver.tgz"
if (Test-Path $tgz) { Remove-Item $tgz -Force }

npm pack
if ($LASTEXITCODE -ne 0) { Die 'npm pack failed' }
if (-not (Test-Path $tgz)) { Die "npm pack produced no expected file: $tgz" }
Ok "created $tgz ($([math]::Round((Get-Item $tgz).Length/1MB,2)) MB)"

# Inspect the tarball. A .tgz is gzip+tar, NOT zip: System.IO.Compression.ZipFile
# throws "End of Central Directory record could not be found". Use system tar.
$names = @(& tar -tzf $tgz)
if ($LASTEXITCODE -ne 0) { Die 'tar -tzf failed' }
if ($names.Count -eq 0) { Die 'tarball is empty' }

foreach ($need in @(
    'package/index.js', 'package/index.d.ts',
    'package/client.js', 'package/client.d.ts',
    'package/shared.js', 'package/shared.d.ts',
    'package/ico.js', 'package/ico.d.ts',
    'package/desktop.js', 'package/desktop.d.ts',
    'package/launcher.js', 'package/launcher.d.ts',
    'package/presets.js', 'package/presets.d.ts',
    'package/shortcut.ps1', 'package/cordis.patch.yml'
)) {
    if ($names -notcontains $need) { Die "tarball is missing $need" }
}
$icoCount = @($names | Where-Object { $_ -like 'package/presets/assets/*.ico' }).Count
if ($icoCount -ne 44) { Die "tarball has $icoCount preset icons, expected 44" }
if (@($names | Where-Object { $_ -like 'package/docs/*' }).Count -ne 0) { Die 'tarball must not contain docs/' }
if (@($names | Where-Object { $_ -like 'package/scripts/*' }).Count -ne 0) { Die 'tarball must not contain scripts/' }
Ok "tarball verified: $($names.Count) files, 44 preset icons, no docs/ or scripts/"

# ---------------------------------------------------------------- 3. tag
Step 'Tag'
git tag -a $Tag -m "dsh-iconic-launcher $Tag`: image formats, bounded upload work, desktop-only"
if ($LASTEXITCODE -ne 0) { Die 'git tag failed' }
Ok "created tag $Tag"

# ---------------------------------------------------------------- 4. push
Step 'Push to GitHub'
git push origin $Branch
if ($LASTEXITCODE -ne 0) { Die "push $Branch failed" }
git push origin $Tag
if ($LASTEXITCODE -ne 0) { Die "push tag $Tag failed. main is already pushed; retry: git push origin $Tag" }
Ok "main and $Tag pushed"

# ---------------------------------------------------------------- 5. release
Step 'Create GitHub Release'
# Read the Chinese release notes as UTF-8 explicitly (see the header note).
$notes = [System.IO.File]::ReadAllText($notesPath, [System.Text.UTF8Encoding]::new($false))
$notes = $notes.Replace('<version>', $Ver)
if ([string]::IsNullOrWhiteSpace($notes)) { Die "release notes file is empty: $notesPath" }

gh release create $Tag $tgz --repo $Remote --title "dsh-iconic-launcher $Tag" --notes $notes
if ($LASTEXITCODE -ne 0) { Die "gh release create failed. main and tag are pushed; retry the gh command manually" }
Ok 'Release created'

# ---------------------------------------------------------------- 6. done
Step 'Done'
Write-Host "  Release : https://github.com/$Remote/releases/tag/$Tag"
Write-Host "  tarball : $tgz" -ForegroundColor DarkGray
Write-Host ''
Write-Host "  Next: the README warning about the stale Release tarball no longer" -ForegroundColor Yellow
Write-Host "        applies -- rewrite it as fixed in $Tag (needs a follow-up commit)." -ForegroundColor Yellow

# Create (or refresh) the desktop shortcut "DeepSeek Harness.lnk".
#
# Usage (PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1
#
# The shortcut launches scripts/start-dsh-web.bat (the node-based launcher) and
# shows scripts/dsh-icon.ico as its icon. Because the icon is embedded into the
# .lnk by path, deleting dsh-icon.ico makes the shortcut draw a blank icon —
# regenerate it with generate-icon.ps1 and re-run this script.

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

$batPath = Join-Path $scriptDir 'start-dsh-web.bat'
$iconPath = Join-Path $scriptDir 'dsh-icon.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'DeepSeek Harness.lnk'

if (-not (Test-Path $batPath)) {
  throw "launcher not found: $batPath"
}
if (-not (Test-Path $iconPath)) {
  throw "icon not found: $iconPath (run .\scripts\generate-icon.ps1 first)"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = "$env:ComSpec"
$shortcut.Arguments = "/c `"$batPath`""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = 'DeepSeek Harness Web'
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Host "OK: $lnkPath"
Write-Host "    icon -> $iconPath"
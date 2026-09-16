<#
Writes (or refreshes) one Windows desktop shortcut.

Usage (always via -File, never -Command):

  powershell -NoProfile -NonInteractive -File shortcut.ps1 <lnkPath> <targetExecutable> [workingDirectory] [iconPath] [extraArguments]

Why this is a file and not an inline -Command script: Windows PowerShell 5.1's
`-Command` does NOT bind its trailing arguments to `$args` — it concatenates
them into the command text, so every parameter arrives empty (and the path
strings get executed as bare commands). `-File` binds positional parameters to
`$args`, which is what "every value travels as argv, never as code" requires.
#>
param(
  [Parameter(Mandatory = $true, Position = 0)][string]$LnkPath,
  [Parameter(Mandatory = $true, Position = 1)][string]$TargetExecutable,
  [Parameter(Mandatory = $false, Position = 2)][string]$WorkingDirectory = '',
  [Parameter(Mandatory = $false, Position = 3)][string]$IconPath = '',
  [Parameter(Mandatory = $false, Position = 4)][string]$ExtraArguments = ''
)

$ErrorActionPreference = 'Stop'

$target = [System.IO.Path]::GetFullPath($TargetExecutable)
$lnk = [System.IO.Path]::GetFullPath($LnkPath)
$work = if ([string]::IsNullOrEmpty($WorkingDirectory)) {
  [System.IO.Path]::GetDirectoryName($lnk)
} else {
  [System.IO.Path]::GetFullPath($WorkingDirectory)
}

$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = $target
$s.WorkingDirectory = $work
$s.Description = 'Launcher'
$s.WindowStyle = 1
if (-not [string]::IsNullOrEmpty($IconPath)) {
  $s.IconLocation = "$([System.IO.Path]::GetFullPath($IconPath)),0"
}
if (-not [string]::IsNullOrEmpty($ExtraArguments)) {
  $s.Arguments = $ExtraArguments
}
$s.Save()

# Tell the shell this link changed so Explorer redraws it at once instead of
# serving a stale IconCache entry for the path. Cosmetic: wrap it so a shell
# API problem can never fail an install whose shortcut is already written.
try {
  Add-Type -Namespace Iconic -Name Shell -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("shell32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern void SHChangeNotify(int wEventId, uint uFlags, System.IntPtr dwItem1, System.IntPtr dwItem2);
'@
  $item = [System.Runtime.InteropServices.Marshal]::StringToHGlobalUni($lnk)
  try {
    # SHCNE_UPDATEITEM | SHCNF_PATHW
    [Iconic.Shell]::SHChangeNotify(0x00002000, 0x0005, $item, [System.IntPtr]::Zero)
  } finally {
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($item)
  }
} catch {
  # Ignored on purpose — see above.
}

Write-Output $lnk

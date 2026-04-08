$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs    = Join-Path $appDir "AuraBudget.vbs"
$ico    = Join-Path $appDir "build\icon.ico"
$dest   = [Environment]::GetFolderPath("Desktop") + "\AuraBudget.lnk"

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($dest)
$sc.TargetPath       = "wscript.exe"
$sc.Arguments        = "`"$vbs`""
$sc.WorkingDirectory = $appDir
$sc.IconLocation     = $ico
$sc.Description      = "AuraBudget - AI Finance Tracker"
$sc.Save()

Write-Host "Shortcut created on Desktop: $dest"
Write-Host "Right-click it and choose 'Pin to Start' to add it to the Start menu."

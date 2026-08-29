# Cria um atalho na area de trabalho que inicia o Kash e abre o navegador.
$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot
$target  = Join-Path $root 'scripts\iniciar-kash.cmd'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Kash - Controle Financeiro.lnk'

$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath       = $target
$lnk.WorkingDirectory = $root
$lnk.IconLocation     = 'C:\Windows\System32\shell32.dll,167'
$lnk.Description       = 'Inicia o Kash e abre no navegador (localhost:5173)'
$lnk.Save()

Write-Host "Atalho criado em: $lnkPath"

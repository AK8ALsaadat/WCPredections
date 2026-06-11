# PredictLeague - quick start script (fixes npm PATH for this session)
$nodePath = "C:\Program Files\nodejs"
if (Test-Path $nodePath) {
    $env:Path = "$nodePath;" + $env:Path
}

Set-Location $PSScriptRoot

Write-Host "Node: $(node -v)" -ForegroundColor Green
Write-Host "npm:  $(npm -v)" -ForegroundColor Green
Write-Host ""
Write-Host "Starting dev server at http://localhost:3000 ..." -ForegroundColor Cyan
& "$nodePath\npm.cmd" run dev

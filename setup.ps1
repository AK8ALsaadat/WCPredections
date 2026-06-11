# PredictLeague - one-time setup script
$nodePath = "C:\Program Files\nodejs"
if (Test-Path $nodePath) {
    $env:Path = "$nodePath;" + $env:Path
}

Set-Location $PSScriptRoot

Write-Host "Node: $(node -v)" -ForegroundColor Green
Write-Host "npm:  $(npm -v)" -ForegroundColor Green
Write-Host ""

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env - edit it with your Supabase credentials before continuing!" -ForegroundColor Yellow
}

Write-Host "Installing dependencies..." -ForegroundColor Cyan
& "$nodePath\npm.cmd" install

Write-Host "Running database migration..." -ForegroundColor Cyan
& "$nodePath\npm.cmd" run db:migrate

Write-Host ""
Write-Host "Setup complete! Run: .\run-dev.ps1" -ForegroundColor Green

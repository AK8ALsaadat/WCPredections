# PredictLeague - interactive local setup (no secrets in repo)
$nodePath = "C:\Program Files\nodejs"
$env:Path = "$nodePath;" + $env:Path
Set-Location $PSScriptRoot

Write-Host "=== PredictLeague Setup ===" -ForegroundColor Cyan
Write-Host "Keys come from Supabase Dashboard only — never commit them to Git." -ForegroundColor Yellow
Write-Host ""

$projectRef = Read-Host "Supabase Project Ref (from dashboard URL, e.g. abcdefghijklmnop)"
if ([string]::IsNullOrWhiteSpace($projectRef)) {
    Write-Host "Project ref is required!" -ForegroundColor Red
    exit 1
}

$dbPassword = Read-Host "Supabase Database Password"
if ([string]::IsNullOrWhiteSpace($dbPassword)) {
    Write-Host "Password is required!" -ForegroundColor Red
    exit 1
}

$anonKey = Read-Host "Supabase Anon Key (Settings > API > anon public)"
$serviceKey = Read-Host "Supabase Service Role Key (optional — Enter to skip)"

$encodedPassword = [uri]::EscapeDataString($dbPassword)
$sessionSecret = [Convert]::ToBase64String(
    (1..32 | ForEach-Object { Get-Random -Maximum 256 })
)

$serviceLine = ""
if (-not [string]::IsNullOrWhiteSpace($serviceKey)) {
    $serviceLine = "SUPABASE_SERVICE_ROLE_KEY=`"$serviceKey`"`n"
}

$envContent = @"
DATABASE_URL="postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres"
DIRECT_URL="postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres"
SESSION_SECRET="$sessionSecret"
NEXT_PUBLIC_SUPABASE_URL="https://${projectRef}.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="$anonKey"
${serviceLine}ADMIN_USERNAMES="admin"
FOOTBALL_API_PROVIDER="football-data"
FOOTBALL_DATA_API_KEY="your-football-data-key"
FOOTBALL_DATA_BASE_URL="https://api.football-data.org/v4"
CRON_SECRET="change-me-cron-secret"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
"@

$envContent | Out-File -FilePath ".env" -Encoding utf8
Write-Host ".env created (edit API keys if needed)" -ForegroundColor Green

Write-Host "Running database migration..." -ForegroundColor Cyan
& "$nodePath\npm.cmd" run db:push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Migration failed. Check DATABASE_URL / password." -ForegroundColor Red
    exit 1
}

Write-Host "Setup complete! Starting server..." -ForegroundColor Green
& "$nodePath\npm.cmd" run dev

# إصلاح كاش Next.js التالف (مثل خطأ iron-webcrypto vendor-chunks)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host ">> إيقاف عمليات Node على المنفذ 3000..." -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Write-Host ">> حذف .next و node_modules/.cache..." -ForegroundColor Cyan
if (Test-Path .next) { Remove-Item -Recurse -Force .next }
if (Test-Path node_modules\.cache) { Remove-Item -Recurse -Force node_modules\.cache }

Write-Host ">> تثبيت iron-webcrypto كاعتماد مباشر..." -ForegroundColor Cyan
npm install iron-webcrypto

Write-Host ">> prisma generate..." -ForegroundColor Cyan
npx prisma generate

Write-Host ">> بناء المشروع للتحقق..." -ForegroundColor Cyan
npm run build

Write-Host ">> تم. شغّل السيرفر: npm run dev" -ForegroundColor Green

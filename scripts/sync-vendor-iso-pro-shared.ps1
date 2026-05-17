# Copia iso-pro-shared (pasta mestre) para vendor/ — usado antes de commit/release e pelo CI no GitHub.
$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$MonoShared = Join-Path (Split-Path $Root -Parent) 'iso-pro-shared'
$Vendor = Join-Path $Root 'vendor\iso-pro-shared'

if (-not (Test-Path (Join-Path $MonoShared 'package.json'))) {
  throw "Nao encontrei iso-pro-shared em: $MonoShared"
}

Push-Location $MonoShared
try {
  npm run build
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path $Vendor | Out-Null
Remove-Item -Recurse -Force (Join-Path $Vendor 'dist') -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force (Join-Path $MonoShared 'dist') (Join-Path $Vendor 'dist')

$pkg = Get-Content (Join-Path $MonoShared 'package.json') -Raw | ConvertFrom-Json
$pkg.PSObject.Properties.Remove('scripts')
$pkg.PSObject.Properties.Remove('devDependencies')
$pkg | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $Vendor 'package.json') -Encoding utf8NoBOM

Write-Host "vendor/iso-pro-shared atualizado (dist + package.json sem prepare)." -ForegroundColor Green

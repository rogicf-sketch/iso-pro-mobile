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

$srcPkg = Get-Content (Join-Path $MonoShared 'package.json') -Raw | ConvertFrom-Json
$zod = $srcPkg.dependencies.zod
if (-not $zod) { $zod = '^4.3.6' }
$bcryptjs = $srcPkg.dependencies.bcryptjs
if (-not $bcryptjs) { $bcryptjs = '^2.4.3' }

$vendorPkg = @{
  name        = 'iso-pro-shared'
  version     = $srcPkg.version
  private     = $true
  type        = 'module'
  description = 'Contrato TypeScript (vendored para CI/release mobile). Origem: ../iso-pro-shared — atualizar com scripts/sync-vendor-iso-pro-shared.ps1'
  license     = 'UNLICENSED'
  main        = './dist/index.js'
  types       = './dist/index.d.ts'
  exports     = @{
    '.'            = @{ types = './dist/index.d.ts'; default = './dist/index.js' }
    './validators' = @{ types = './dist/validators.d.ts'; default = './dist/validators.js' }
  }
  files        = @('dist')
  dependencies = @{ zod = $zod; bcryptjs = $bcryptjs }
}

$json = $vendorPkg | ConvertTo-Json -Depth 6
# PowerShell 5.x indenta com 2 espaços; normalizar para JSON legível
$json = $json -replace '":  ', '": '
$vendorPkgPath = Join-Path $Vendor 'package.json'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($vendorPkgPath, $json, $utf8NoBom)

Write-Host 'vendor/iso-pro-shared atualizado (dist + package.json).' -ForegroundColor Green

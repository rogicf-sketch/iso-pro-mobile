# Build APK off-path (C:\IPB\mob) e publica sempre com revisao no nome do ficheiro.
param(
  [switch]$SkipInstall,
  [switch]$SkipPublish,
  [switch]$ForcePrebuild,
  [string]$BuildRoot = ''
)

$ErrorActionPreference = 'Stop'

function Resolve-MasterRoot {
  $fromScript = Split-Path $PSScriptRoot -Parent
  if (Test-Path (Join-Path $fromScript 'app.config.ts')) { return $fromScript }
  $alt = Join-Path 'C:\Sistema I.S.O PRO GESTÃO DE MATERIAIS' 'iso_pro_mobile'
  if (Test-Path (Join-Path $alt 'app.config.ts')) { return $alt }
  return $fromScript
}

function Sync-ToBuildRoot {
  param([string]$Source, [string]$Dest)
  Write-Host "A copiar codigo para build off-path: $Dest" -ForegroundColor Gray
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  robocopy $Source $Dest /MIR /XD node_modules .git dist android\app\build android\build android\.gradle /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy falhou (codigo $LASTEXITCODE)." }
}

function Sync-DistBack {
  param([string]$FromBuild, [string]$ToMaster)
  $srcDist = Join-Path $FromBuild 'dist\android'
  if (-not (Test-Path $srcDist)) { return }
  $destDist = Join-Path $ToMaster 'dist\android'
  New-Item -ItemType Directory -Force -Path $destDist | Out-Null
  robocopy $srcDist $destDist /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy dist falhou (codigo $LASTEXITCODE)." }
  Write-Host "dist\android sincronizado para pasta mestre." -ForegroundColor DarkGray
}

$masterRoot = Resolve-MasterRoot
if (-not $BuildRoot) {
  if ($env:ISO_PRO_ANDROID_BUILD_ROOT) { $BuildRoot = $env:ISO_PRO_ANDROID_BUILD_ROOT } else { $BuildRoot = 'C:\IPB\mob' }
}

$masterNorm = (Resolve-Path $masterRoot).Path.TrimEnd('\')
$buildNorm = $BuildRoot.TrimEnd('\')

Write-Host '=== I.S.O PRO Campo — build APK ===' -ForegroundColor Cyan
Write-Host "Mestre: $masterNorm"
Write-Host "Build:  $buildNorm"

if ($masterNorm -ne $buildNorm) {
  Sync-ToBuildRoot -Source $masterNorm -Dest $buildNorm
}

Push-Location $buildNorm
try {
  if (-not $SkipInstall) {
    Write-Host ''
    Write-Host '[1/3] npm install...' -ForegroundColor Yellow
    npm install
  }

  if ($ForcePrebuild) {
    Write-Host ''
    Write-Host 'expo prebuild --platform android...' -ForegroundColor Yellow
    npx expo prebuild --platform android --clean
  }

  Write-Host ''
  Write-Host '[2/3] Gradle assembleRelease...' -ForegroundColor Yellow
  Push-Location (Join-Path $buildNorm 'android')
  try {
    .\gradlew.bat assembleRelease --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "Gradle falhou (codigo $LASTEXITCODE)." }
  } finally {
    Pop-Location
  }

  if (-not $SkipPublish) {
    Write-Host ''
    Write-Host '[3/3] Publicar APK com revisao no nome...' -ForegroundColor Yellow
    & (Join-Path $buildNorm 'scripts\publish-apk-dist.ps1') -ProjectRoot $buildNorm
  }
} finally {
  Pop-Location
}

if ($masterNorm -ne $buildNorm) {
  Sync-DistBack -FromBuild $buildNorm -ToMaster $masterNorm
}

Write-Host ''
Write-Host '=== BUILD SUCCESSFUL ===' -ForegroundColor Green
Write-Host 'Instale iso-pro-mobile-release-<versao>.apk (NAO app-release.apk generico).' -ForegroundColor Cyan

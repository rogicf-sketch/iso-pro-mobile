# Copia app-release.apk para nomes com revisao em dist\android (pasta do sistema).
# Nunca grava em Downloads por defeito — artefactos ficam so na pasta do projecto, organizados.
param(
  [string]$SourceApk = '',
  [string]$ProjectRoot = '',
  [switch]$AlsoCopyToDownloads,
  [switch]$ArchiveOnly
)

$ErrorActionPreference = 'Stop'

function Get-AppVersionInfo {
  param([string]$Root)
  $configPath = Join-Path $Root 'app.config.ts'
  $pkgPath = Join-Path $Root 'package.json'
  if (-not (Test-Path $configPath)) {
    throw "Nao encontrei app.config.ts em: $Root"
  }
  $config = Get-Content $configPath -Raw
  $version = $null
  $versionCode = $null
  if ($config -match "version:\s*'([^']+)'") { $version = $Matches[1].Trim() }
  if ($config -match 'versionCode:\s*(\d+)') { $versionCode = [int]$Matches[1] }
  if (-not $version -and (Test-Path $pkgPath)) {
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    $version = [string]$pkg.version
  }
  if (-not $version) { throw 'Nao foi possivel ler version em app.config.ts / package.json.' }
  if (-not $versionCode) { $versionCode = 0 }
  return @{ Version = $version; VersionCode = $versionCode }
}

function Move-ApkToArchive {
  param(
    [string]$FilePath,
    [string]$ArchiveDir
  )
  if (-not (Test-Path $FilePath)) { return $false }
  $name = Split-Path $FilePath -Leaf
  $dest = Join-Path $ArchiveDir $name
  if (Test-Path $dest) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($name)
    $ext = [System.IO.Path]::GetExtension($name)
    $dest = Join-Path $ArchiveDir ("{0}-dup{1}{2}" -f $base, (Get-Date -Format 'yyyyMMdd-HHmmss'), $ext)
  }
  Move-Item -LiteralPath $FilePath -Destination $dest -Force
  return $true
}

function Archive-OldDistApks {
  param(
    [string]$Root,
    [string]$CurrentVersion
  )

  $distDir = Join-Path $Root 'dist\android'
  $archiveDir = Join-Path $distDir 'versoes-anteriores'
  if (-not (Test-Path $distDir)) { return 0 }

  New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null

  $keepNames = @(
    "iso-pro-mobile-release-$CurrentVersion.apk",
    'iso-pro-mobile-release-LATEST.apk',
    'ULTIMO-BUILD.json'
  )

  $moved = 0
  Get-ChildItem -LiteralPath $distDir -File | ForEach-Object {
    if ($keepNames -contains $_.Name) { return }
    if ($_.Extension -ne '.apk') { return }
    if (Move-ApkToArchive -FilePath $_.FullName -ArchiveDir $archiveDir) {
      $moved++
      Write-Host "Arquivado: $($_.Name)" -ForegroundColor DarkGray
    }
  }

  return $moved
}

function Publish-VersionedApk {
  param(
    [string]$ApkSource,
    [string]$Root,
    [switch]$CopyToDownloads
  )

  if (-not (Test-Path $ApkSource)) {
    throw "APK nao encontrado: $ApkSource"
  }

  $info = Get-AppVersionInfo -Root $Root
  $version = $info.Version
  $versionCode = $info.VersionCode
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

  $distDir = Join-Path $Root 'dist\android'
  $archiveDir = Join-Path $distDir 'versoes-anteriores'
  New-Item -ItemType Directory -Force -Path $distDir, $archiveDir | Out-Null

  $archived = Archive-OldDistApks -Root $Root -CurrentVersion $version
  if ($archived -gt 0) {
    Write-Host "Versoes antigas movidas para versoes-anteriores: $archived" -ForegroundColor DarkYellow
  }

  $baseName = "iso-pro-mobile-release-$version"
  $primaryApk = Join-Path $distDir "$baseName.apk"
  $latestApk = Join-Path $distDir 'iso-pro-mobile-release-LATEST.apk'
  $stampArchiveApk = Join-Path $archiveDir "iso-pro-mobile-release-$stamp.apk"

  Copy-Item -LiteralPath $ApkSource -Destination $primaryApk -Force
  Copy-Item -LiteralPath $ApkSource -Destination $latestApk -Force
  Copy-Item -LiteralPath $ApkSource -Destination $stampArchiveApk -Force

  $manifest = @{
    version      = $version
    versionCode  = $versionCode
    builtAt      = (Get-Date).ToString('o')
    primaryApk   = "$baseName.apk"
    installHint  = "Instalar: dist\android\$baseName.apk (ou dist\android\iso-pro-mobile-release-LATEST.apk)"
    archiveDir   = 'dist\android\versoes-anteriores'
  } | ConvertTo-Json -Depth 3
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText((Join-Path $distDir 'ULTIMO-BUILD.json'), $manifest, $utf8NoBom)

  Write-Host ''
  Write-Host '=== APK publicado (pasta do sistema) ===' -ForegroundColor Green
  Write-Host "Versao: $version (versionCode $versionCode)" -ForegroundColor Cyan
  Write-Host "Principal: $primaryApk" -ForegroundColor Yellow
  Write-Host "LATEST:    $latestApk" -ForegroundColor Yellow
  Write-Host "Historico: $stampArchiveApk" -ForegroundColor Gray
  Write-Host "Manifesto: $(Join-Path $distDir 'ULTIMO-BUILD.json')" -ForegroundColor Gray

  if ($CopyToDownloads) {
    $downloadsPath = Join-Path $env:USERPROFILE "Downloads\$baseName.apk"
    Copy-Item -LiteralPath $ApkSource -Destination $downloadsPath -Force
    Write-Host "Copia opcional Downloads: $downloadsPath" -ForegroundColor DarkYellow
  }
}

if (-not $ProjectRoot) {
  $ProjectRoot = Split-Path $PSScriptRoot -Parent
}

if ($ArchiveOnly) {
  $info = Get-AppVersionInfo -Root $ProjectRoot
  $count = Archive-OldDistApks -Root $ProjectRoot -CurrentVersion $info.Version
  Write-Host "Arquivados: $count ficheiro(s) em dist\android\versoes-anteriores" -ForegroundColor Green
  return
}

if (-not $SourceApk) {
  $SourceApk = Join-Path $ProjectRoot 'android\app\build\outputs\apk\release\app-release.apk'
}

Publish-VersionedApk -ApkSource $SourceApk -Root $ProjectRoot -CopyToDownloads:$AlsoCopyToDownloads

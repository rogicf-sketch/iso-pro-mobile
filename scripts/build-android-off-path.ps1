<#
.SYNOPSIS
  Copia o monorepo para um caminho SEM acentos, gera o APK Android e devolve o artefacto para esta pasta do projeto.

.DESCRIPTION
  O Android NDK / ferramentas nativas no Windows falham com frequencia em caminhos com caracteres nao-ASCII
  (ex.: "GESTAO" com til). Por isso a compilacao nativa precisa de uma copia de trabalho numa pasta tipo
  C:\ISO-PRO-BUILD. O codigo-fonte continua a ser o da pasta mestre; o script so usa a copia como "oficina"
  e no fim coloca o APK em iso_pro_mobile\dist\android\ (ja esta no .gitignore).

.PARAMETER BuildRoot
  Pasta raiz da copia de compilacao. Por defeito: variavel de ambiente ISO_PRO_ANDROID_BUILD_ROOT ou C:\ISO-PRO-BUILD

.PARAMETER Configuration
  Release (APK autonomo, JavaScript embutido) ou Debug (precisa de Metro no PC).

.PARAMETER SkipInstall
  Nao corre npm install (mais rapido se ja instalaste na copia recentemente).

.PARAMETER ForcePrebuild
  Apaga android\ na copia e volta a correr expo prebuild (use apos mudar plugins nativos ou app.config).

.EXAMPLE
  .\scripts\build-android-off-path.ps1
  .\scripts\build-android-off-path.ps1 -BuildRoot D:\build\iso-pro
#>
[CmdletBinding()]
param(
  [string] $BuildRoot = $(if ($env:ISO_PRO_ANDROID_BUILD_ROOT) { $env:ISO_PRO_ANDROID_BUILD_ROOT } else { 'C:\ISO-PRO-BUILD' }),
  [ValidateSet('Release', 'Debug')]
  [string] $Configuration = 'Release',
  [switch] $SkipInstall,
  [switch] $ForcePrebuild
)

$ErrorActionPreference = 'Stop'

$MobileRoot = Split-Path $PSScriptRoot -Parent
$MonoRoot = Split-Path $MobileRoot -Parent
$SharedSrc = Join-Path $MonoRoot 'iso-pro-shared'
$MobileSrc = $MobileRoot
$SharedDst = Join-Path $BuildRoot 'iso-pro-shared'
$MobileDst = Join-Path $BuildRoot 'iso_pro_mobile'
$DistOut = Join-Path $MobileRoot 'dist\android'

function Test-RobocopySuccess {
  param([int] $Code)
  if ($Code -ge 8) { throw "robocopy falhou com codigo $Code" }
}

Write-Host "=== ISO PRO - build Android (copia off-path) ===" -ForegroundColor Cyan
Write-Host "Origem (mestre): $MonoRoot"
Write-Host "Copia (build):   $BuildRoot"
Write-Host ""

if (-not (Test-Path $SharedSrc)) { throw "Nao encontrei iso-pro-shared em: $SharedSrc" }
if (-not (Test-Path $MobileSrc)) { throw "Nao encontrei iso_pro_mobile em: $MobileSrc" }

New-Item -ItemType Directory -Force -Path $BuildRoot | Out-Null

# Mobile: nao copiar dist/ (APKs locais), android/ios gerados, etc.
$xdMobile = @('node_modules', '.git', 'android', 'ios', '.expo', 'dist', '.turbo')
# iso-pro-shared: copiar tambem dist/ (bundle Zod/TS compilado na pasta mestre — evita APK com validador antigo).
$xdShared = @('node_modules', '.git', '.turbo')

Write-Host "[0/7] iso-pro-shared (pasta mestre): npm run build..." -ForegroundColor Yellow
Push-Location $SharedSrc
try {
  if (-not $SkipInstall) {
    npm install
  }
  npm run build
}
finally { Pop-Location }

Write-Host "[1/7] A copiar ficheiros (robocopy)..." -ForegroundColor Yellow
Write-Host "      iso-pro-shared (com dist/)..." -ForegroundColor DarkGray
& robocopy $SharedSrc $SharedDst /E /NFL /NDL /NJH /NJS /XD @xdShared | Out-Null
Test-RobocopySuccess $LASTEXITCODE

Write-Host "      iso_pro_mobile..." -ForegroundColor DarkGray
& robocopy $MobileSrc $MobileDst /E /NFL /NDL /NJH /NJS /XD @xdMobile | Out-Null
Test-RobocopySuccess $LASTEXITCODE

$envSrc = Join-Path $MobileSrc '.env'
if (Test-Path $envSrc) {
  Copy-Item -Force $envSrc (Join-Path $MobileDst '.env')
  Write-Host "      .env copiado para a copia de build."
}

Push-Location $SharedDst
try {
  if (-not $SkipInstall) {
    Write-Host "[2/7] npm install (iso-pro-shared na copia)..." -ForegroundColor Yellow
    npm install
  } else {
    Write-Host "[2/7] SkipInstall - a saltar npm install na copia da shared." -ForegroundColor DarkYellow
  }
  if (Test-Path (Join-Path $SharedDst 'package.json')) {
    $pkg = Get-Content (Join-Path $SharedDst 'package.json') -Raw | ConvertFrom-Json
    if ($pkg.scripts.build) {
      Write-Host "[2/7] npm run build (iso-pro-shared na copia)..." -ForegroundColor Yellow
      npm run build
    }
  }
}
finally { Pop-Location }

Push-Location $MobileDst
try {
  if (-not $SkipInstall) {
    Write-Host "[3/7] npm install (iso_pro_mobile na copia)..." -ForegroundColor Yellow
    npm install
  } else {
    Write-Host "[3/7] SkipInstall - a saltar npm no mobile." -ForegroundColor DarkYellow
  }

  if ($ForcePrebuild -and (Test-Path (Join-Path $MobileDst 'android'))) {
    Write-Host "      ForcePrebuild: a remover android\ na copia..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force (Join-Path $MobileDst 'android')
  }

  if (-not (Test-Path (Join-Path $MobileDst 'android'))) {
    Write-Host "[4/7] expo prebuild --platform android..." -ForegroundColor Yellow
    npx expo prebuild --platform android --no-install
  } else {
    Write-Host "[4/7] Pasta android\ ja existe na copia - a saltar prebuild (use -ForcePrebuild se precisar)." -ForegroundColor DarkYellow
  }
}
finally { Pop-Location }

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) {
  $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}
if (-not (Test-Path $sdk)) {
  throw "SDK Android nao encontrado. Defina ANDROID_HOME ou instale o SDK em $sdk"
}
$props = Join-Path $MobileDst 'android\local.properties'
$sdkForward = $sdk -replace '\\', '/'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($props, "sdk.dir=$sdkForward`r`n", $utf8NoBom)
Write-Host "[5/7] local.properties -> sdk.dir=$sdkForward" -ForegroundColor Yellow

$gradleTask = if ($Configuration -eq 'Release') { 'assembleRelease' } else { 'assembleDebug' }
Write-Host "[6/7] gradlew.bat $gradleTask ..." -ForegroundColor Yellow
Push-Location (Join-Path $MobileDst 'android')
try {
  .\gradlew.bat $gradleTask --no-daemon
  if ($LASTEXITCODE -ne 0) { throw "Gradle terminou com codigo $LASTEXITCODE" }
}
finally { Pop-Location }

$apkName = if ($Configuration -eq 'Release') { 'app-release.apk' } else { 'app-debug.apk' }
$folder = if ($Configuration -eq 'Release') { 'release' } else { 'debug' }
$built = Join-Path $MobileDst "android\app\build\outputs\apk\$folder\$apkName"
if (-not (Test-Path $built)) { throw "APK nao encontrado: $built" }

Write-Host "[7/7] A copiar APK para dist\android\..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $DistOut | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$finalName = if ($Configuration -eq 'Release') { "iso-pro-mobile-release-$stamp.apk" } else { "iso-pro-mobile-debug-$stamp.apk" }
$dest = Join-Path $DistOut $finalName
Copy-Item -Force $built $dest
Copy-Item -Force $built (Join-Path $DistOut $(if ($Configuration -eq 'Release') { 'iso-pro-mobile-release-LATEST.apk' } else { 'iso-pro-mobile-debug-LATEST.apk' }))
if ($Configuration -eq 'Debug') {
  Copy-Item -Force $built (Join-Path $DistOut 'app-debug.apk')
}
if ($Configuration -eq 'Release') {
  Copy-Item -Force $built (Join-Path $DistOut 'app-release.apk')
}

Write-Host ""
Write-Host "Concluido." -ForegroundColor Green
Write-Host "  APK com timestamp: $dest"
Write-Host "  Ultima copia (sobrescrita): $(Join-Path $DistOut $(if ($Configuration -eq 'Release') { 'iso-pro-mobile-release-LATEST.apk' } else { 'iso-pro-mobile-debug-LATEST.apk' }))"
if ($Configuration -eq 'Debug') {
  Write-Host "  Nome fixo (copiar para o telemovel): $(Join-Path $DistOut 'app-debug.apk')" -ForegroundColor Green
}
if ($Configuration -eq 'Release') {
  Write-Host "  Nome fixo: $(Join-Path $DistOut 'app-release.apk')" -ForegroundColor Green
}
Write-Host ""
Write-Host "Nota: a pasta $BuildRoot e so oficina de compilacao; o codigo mestre continua em:" -ForegroundColor DarkGray
Write-Host "  $MonoRoot" -ForegroundColor DarkGray

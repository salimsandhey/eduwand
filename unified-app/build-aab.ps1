$ErrorActionPreference = "Stop"

$appDir = $PSScriptRoot
$androidDir = Join-Path $appDir "android"

# Set Android SDK if not configured
if (-not $env:ANDROID_HOME) {
    $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path $defaultSdk) {
        $env:ANDROID_HOME = $defaultSdk
    }
}

# Set Java Home if not configured
if (-not $env:JAVA_HOME) {
    $jbrPath = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path $jbrPath) {
        $env:JAVA_HOME = $jbrPath
    }
}
if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin") -and ($env:Path -notlike "*$env:JAVA_HOME\bin*")) {
    $env:Path = "$env:JAVA_HOME\bin;" + $env:Path
}

# Ensure local.properties exists
$localProps = Join-Path $androidDir "local.properties"
if (-not (Test-Path $localProps)) {
    $escapedSdk = $env:ANDROID_HOME -replace '\\', '\\'
    Set-Content -Path $localProps -Value "sdk.dir=$escapedSdk"
}

# Set Production Environment
if (-not $env:EXPO_PUBLIC_API_URL) {
    $env:EXPO_PUBLIC_API_URL = "https://eduwand.flipoo.in/api/v1"
}
$env:NODE_ENV = "production"

Write-Host "Building Production Android App Bundle (.aab) for EduWand..." -ForegroundColor Cyan
Write-Host "API URL: $env:EXPO_PUBLIC_API_URL" -ForegroundColor Yellow
Write-Host "Java Home: $env:JAVA_HOME" -ForegroundColor Gray
Write-Host "Android SDK: $env:ANDROID_HOME" -ForegroundColor Gray

Push-Location $androidDir
try {
    .\gradlew.bat bundleRelease
} finally {
    Pop-Location
}

$aabPath = Join-Path $androidDir "app\build\outputs\bundle\release\app-release.aab"
if (Test-Path $aabPath) {
    $aabItem = Get-Item $aabPath
    $sizeMb = [math]::Round($aabItem.Length / 1MB, 2)
    Write-Host "`nProduction AAB build SUCCESSFUL!" -ForegroundColor Green
    Write-Host "AAB Location: $($aabItem.FullName)" -ForegroundColor Green
    Write-Host "AAB Size: $sizeMb MB" -ForegroundColor Green
}

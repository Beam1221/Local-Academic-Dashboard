$ErrorActionPreference = 'Stop'
$desktopRoot = $PSScriptRoot
$projectRoot = Split-Path $desktopRoot -Parent
$cacheRoot = Join-Path $desktopRoot '.build-cache'
New-Item -ItemType Directory -Force $cacheRoot | Out-Null
$env:ELECTRON_CACHE = Join-Path $cacheRoot 'electron'
$env:electron_config_cache = $env:ELECTRON_CACHE
$env:ELECTRON_BUILDER_CACHE = Join-Path $cacheRoot 'builder'
$env:PYINSTALLER_CONFIG_DIR = Join-Path $cacheRoot 'pyinstaller'
$env:PYTHONUSERBASE = Join-Path $cacheRoot 'python-user'
$env:PYTHONNOUSERSITE = '1'
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Build command failed ($LASTEXITCODE)" } }
Push-Location $projectRoot
try {
    if (!(Test-Path backend/.venv/Scripts/python.exe)) {
        python -m venv backend/.venv
        Check-Exit
    }
    & backend/.venv/Scripts/python.exe -m pip install --no-cache-dir -r backend/requirements-lock.txt pyinstaller==6.22.3
    Check-Exit
    Push-Location frontend
    try {
        npm.cmd ci --cache (Join-Path $cacheRoot 'npm')
        Check-Exit
        npm.cmd run build -- --configLoader runner
        Check-Exit
    } finally { Pop-Location }
    Push-Location backend
    try {
        & .venv/Scripts/python.exe -m PyInstaller --noconfirm --onedir --console --name studyspace-backend --distpath ../desktop/backend-dist --workpath (Join-Path $cacheRoot 'python-build') --specpath ../desktop --collect-all tzdata --collect-submodules uvicorn desktop_entry.py
        Check-Exit
    } finally { Pop-Location }
    Push-Location desktop
    try {
        npm.cmd ci --cache (Join-Path $cacheRoot 'npm')
        Check-Exit
        node node_modules/electron/install.js
        Check-Exit
        npm.cmd run package
        Check-Exit
    } finally { Pop-Location }
} finally { Pop-Location }

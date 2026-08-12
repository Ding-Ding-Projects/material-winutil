param(
    [switch]$Installer,
    [switch]$Silent,
    [switch]$SkipLocalChecks
)

$ErrorActionPreference = 'Stop'
$stopwatch = [Diagnostics.Stopwatch]::StartNew()
$root = Split-Path -Parent $PSScriptRoot

function Write-Phase([string]$Message) {
    Write-Host "[$([DateTime]::Now.ToString('HH:mm:ss'))] $Message"
}

function Find-Node {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    Write-Phase 'Node.js LTS is missing; installing OpenJS.NodeJS.LTS from the Windows Package Manager.'
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw 'Missing dependency: Node.js LTS. Attempted source: Windows Package Manager (winget), but winget.exe is unavailable.'
    }
    & $winget.Source install --id OpenJS.NodeJS.LTS --exact --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "Node.js LTS installation failed with exit code $LASTEXITCODE." }

    $machineNode = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    $userNode = Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'
    foreach ($candidate in @($machineNode, $userNode)) { if (Test-Path -LiteralPath $candidate) { return $candidate } }
    throw 'Node.js LTS installation completed but node.exe was not found in the current or standard user/machine paths.'
}

function Install-LockedDependencies([string]$NpmPath) {
    $attempts = 3
    for ($attempt = 1; $attempt -le $attempts; $attempt++) {
        Write-Phase "Installing the exact locked dependency tree (attempt $attempt of $attempts)."
        & $NpmPath ci --no-audit --no-fund
        if ($LASTEXITCODE -eq 0) { return }
        if ($attempt -eq $attempts) {
            throw "npm ci failed with exit code $LASTEXITCODE after $attempts attempts."
        }
        $delaySeconds = 3 * $attempt
        Write-Phase "npm ci failed with exit code $LASTEXITCODE; retrying after $delaySeconds seconds because package downloads can be transient."
        Start-Sleep -Seconds $delaySeconds
    }
}

function Build-InstallerPackage([string]$NpmPath, [bool]$SkipChecks) {
    $attempts = 3
    for ($attempt = 1; $attempt -le $attempts; $attempt++) {
        Write-Phase "Packaging the unsigned Squirrel.Windows installer (attempt $attempt of $attempts)."
        if ($SkipChecks) { & $NpmPath run dist:package } else { & $NpmPath run dist }
        if ($LASTEXITCODE -eq 0) { return }
        $code = $LASTEXITCODE
        if ($attempt -eq $attempts) {
            throw "Installer build failed with exit code $code after $attempts packaging attempts."
        }
        $delaySeconds = 10 * $attempt
        Write-Phase "Installer packaging failed with exit code $code; retrying after $delaySeconds seconds because Squirrel downloads can be transient."
        Start-Sleep -Seconds $delaySeconds
    }
}

$node = Find-Node
$nodeDir = Split-Path -Parent $node
$npm = Join-Path $nodeDir 'npm.cmd'
if (-not (Test-Path -LiteralPath $npm)) { throw "Missing dependency: npm beside $node." }
$env:Path = "$nodeDir;$env:Path"
Write-Phase "Using $(& $node --version) from $node"

Push-Location $root
try {
    Install-LockedDependencies -NpmPath $npm

    Write-Phase 'Verifying the Electron binary and repairing it from the checksum-verified cache when necessary.'
    & $node (Join-Path $PSScriptRoot 'ensure-electron-binary.mjs')
    if ($LASTEXITCODE -ne 0) { throw "Electron binary verification failed with exit code $LASTEXITCODE." }

    if ($Installer) {
        Write-Phase 'Building and validating the unsigned Squirrel.Windows installer.'
        Build-InstallerPackage -NpmPath $npm -SkipChecks $SkipLocalChecks
        $version = (& $node -p "require('./package.json').version").Trim()
        $commit = (& git rev-parse HEAD).Trim()
        if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the source commit for installer provenance.' }
        $manifest = Join-Path $root 'release\release-assets.json'
        $provenance = Join-Path $root 'release\release-provenance.json'
        & (Join-Path $PSScriptRoot 'validate-squirrel.ps1') -ReleaseRoot (Join-Path $root 'release') -ManifestPath $manifest -ProvenancePath $provenance -ExpectedVersion $version -ExpectedCommit $commit
        if ($LASTEXITCODE -ne 0) { throw "Squirrel.Windows validation failed with exit code $LASTEXITCODE." }
        $assets = @(Get-Content -Raw -LiteralPath $manifest | ConvertFrom-Json)
        $setupAsset = @($assets | Where-Object { $_.name -like '*Setup.exe' })[0]
        Write-Phase "Unsigned installer: $(Join-Path $root ('release\squirrel-windows\' + $setupAsset.name))"
        Write-Phase "SHA-256: $($setupAsset.sha256)"
    } else {
        Write-Phase 'Building the runnable application.'
        if ($SkipLocalChecks) { & $npm run build } else { & $npm run check }
        if ($LASTEXITCODE -ne 0) { throw "Application build failed with exit code $LASTEXITCODE." }
    }
} finally {
    Pop-Location
    $stopwatch.Stop()
    Write-Phase "Finished in $($stopwatch.Elapsed.ToString('hh\:mm\:ss'))."
}

if (-not $Installer -and -not $Silent) {
    $answer = Read-Host 'Run Material System Utility now? [y/N]'
    if ($answer -match '^(y|yes)$') {
        Push-Location $root
        try { & $npm start } finally { Pop-Location }
    }
}

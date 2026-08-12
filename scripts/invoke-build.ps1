param(
    [switch]$Installer,
    [switch]$Silent
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

$node = Find-Node
$nodeDir = Split-Path -Parent $node
$npm = Join-Path $nodeDir 'npm.cmd'
if (-not (Test-Path -LiteralPath $npm)) { throw "Missing dependency: npm beside $node." }
$env:Path = "$nodeDir;$env:Path"
Write-Phase "Using $(& $node --version) from $node"

Push-Location $root
try {
    Write-Phase 'Installing the exact locked dependency tree.'
    & $npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE." }

    Write-Phase 'Verifying the Electron binary and repairing it from the checksum-verified cache when necessary.'
    & $node (Join-Path $PSScriptRoot 'ensure-electron-binary.mjs')
    if ($LASTEXITCODE -ne 0) { throw "Electron binary verification failed with exit code $LASTEXITCODE." }

    if ($Installer) {
        Write-Phase 'Building and validating the unsigned Squirrel.Windows installer.'
        & $npm run dist
        if ($LASTEXITCODE -ne 0) { throw "Installer build failed with exit code $LASTEXITCODE." }
        $setup = Get-ChildItem -LiteralPath (Join-Path $root 'release') -Recurse -File -Filter '*Setup.exe' | Select-Object -First 1
        $releases = Get-ChildItem -LiteralPath (Join-Path $root 'release') -Recurse -File -Filter 'RELEASES' | Select-Object -First 1
        $package = Get-ChildItem -LiteralPath (Join-Path $root 'release') -Recurse -File -Filter '*-full.nupkg' | Select-Object -First 1
        if (-not $setup -or -not $releases -or -not $package) { throw 'Squirrel.Windows output is incomplete: Setup.exe, RELEASES, or the full .nupkg is missing.' }
        $signature = Get-AuthenticodeSignature -LiteralPath $setup.FullName
        if ($signature.Status -ne 'NotSigned') { throw "Signing is prohibited, but $($setup.Name) reported signature status $($signature.Status)." }
        $hash = Get-FileHash -LiteralPath $setup.FullName -Algorithm SHA256
        Write-Phase "Unsigned installer: $($setup.FullName)"
        Write-Phase "SHA-256: $($hash.Hash)"
    } else {
        Write-Phase 'Building the runnable application.'
        & $npm run check
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

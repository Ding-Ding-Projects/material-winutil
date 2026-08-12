param(
    [Parameter(Mandatory = $true)][string]$ReleaseRoot,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][string]$ProvenancePath,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion,
    [Parameter(Mandatory = $true)][string]$ExpectedCommit
)

$ErrorActionPreference = 'Stop'
$releasePath = [IO.Path]::GetFullPath($ReleaseRoot)
if (-not (Test-Path -LiteralPath $releasePath -PathType Container)) {
    throw "Squirrel.Windows output directory does not exist: $releasePath"
}
if ($ExpectedVersion -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') {
    throw "Expected package version is not valid SemVer: $ExpectedVersion"
}
if ($ExpectedCommit -notmatch '^[0-9a-fA-F]{40}$') {
    throw "Expected commit is not a full Git object ID: $ExpectedCommit"
}

function Get-OneFile([string]$Filter, [string]$Description) {
    $matches = @(Get-ChildItem -LiteralPath $releasePath -Recurse -File -Filter $Filter)
    if ($matches.Count -ne 1) {
        throw "Expected exactly one $Description; found $($matches.Count)."
    }
    return $matches[0]
}

function Assert-Magic([IO.FileInfo]$File, [byte[]]$Expected, [string]$Description) {
    $stream = [IO.File]::OpenRead($File.FullName)
    try {
        foreach ($byte in $Expected) {
            $actual = $stream.ReadByte()
            if ($actual -ne $byte) {
                throw "$($File.Name) is not a valid $Description file."
            }
        }
    } finally {
        $stream.Dispose()
    }
}

$setup = Get-OneFile '*Setup.exe' 'Setup.exe'
$index = Get-OneFile 'RELEASES' 'RELEASES index'
$packages = @(Get-ChildItem -LiteralPath $releasePath -Recurse -File -Filter '*.nupkg')
$fullPackages = @($packages | Where-Object { $_.Name -like '*-full.nupkg' })
if ($fullPackages.Count -ne 1) {
    throw "Expected exactly one full Squirrel.Windows package; found $($fullPackages.Count)."
}
if ($setup.Length -lt 1MB) { throw "$($setup.Name) is implausibly small: $($setup.Length) bytes." }
if ($index.Length -le 0) { throw 'RELEASES is empty.' }
foreach ($package in $packages) {
    if ($package.Length -lt 1KB) { throw "$($package.Name) is implausibly small: $($package.Length) bytes." }
}
Assert-Magic $setup ([byte[]](0x4D, 0x5A)) 'PE executable'
foreach ($package in $packages) { Assert-Magic $package ([byte[]](0x50, 0x4B)) 'ZIP/NuGet package' }

$indexEntries = @()
foreach ($line in @(Get-Content -LiteralPath $index.FullName)) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $match = [regex]::Match($line.Trim(), '^(?<sha1>[0-9A-Fa-f]{40})\s+(?<name>\S+)\s+(?<size>\d+)$')
    if (-not $match.Success) { throw "Invalid RELEASES entry: $line" }
    $name = $match.Groups['name'].Value
    if ([IO.Path]::GetFileName($name) -ne $name) { throw "RELEASES contains a path instead of a file name: $name" }
    $indexEntries += [pscustomobject]@{
        sha1 = $match.Groups['sha1'].Value.ToUpperInvariant()
        name = $name
        size = [int64]$match.Groups['size'].Value
    }
}
if ($indexEntries.Count -ne $packages.Count) {
    throw "RELEASES indexes $($indexEntries.Count) packages, but $($packages.Count) .nupkg files exist."
}
if (@($indexEntries | Group-Object name | Where-Object Count -ne 1).Count -ne 0) {
    throw 'RELEASES contains a duplicate package name.'
}
foreach ($package in $packages) {
    $entry = @($indexEntries | Where-Object name -eq $package.Name)
    if ($entry.Count -ne 1) { throw "$($package.Name) is not indexed exactly once by RELEASES." }
    $sha1 = (Get-FileHash -LiteralPath $package.FullName -Algorithm SHA1).Hash.ToUpperInvariant()
    if ($entry[0].sha1 -ne $sha1) { throw "RELEASES SHA-1 does not match $($package.Name)." }
    if ($entry[0].size -ne $package.Length) { throw "RELEASES size does not match $($package.Name)." }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($fullPackages[0].FullName)
try {
    $nuspecs = @($archive.Entries | Where-Object { $_.FullName -like '*.nuspec' })
    if ($nuspecs.Count -ne 1) { throw "Expected one nuspec in $($fullPackages[0].Name); found $($nuspecs.Count)." }
    $reader = New-Object IO.StreamReader($nuspecs[0].Open())
    try { [xml]$nuspec = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $actualVersion = [string]$nuspec.package.metadata.version
    if ($actualVersion -ne $ExpectedVersion) {
        throw "NuGet package version $actualVersion does not equal expected version $ExpectedVersion."
    }
} finally {
    $archive.Dispose()
}

$signature = Get-AuthenticodeSignature -LiteralPath $setup.FullName
if ($signature.Status -ne 'NotSigned') {
    throw "Signing is prohibited, but $($setup.Name) reported signature status $($signature.Status)."
}

$assetFiles = @($setup, $index) + @($packages | Sort-Object Name)
$assets = @($assetFiles | ForEach-Object {
    [ordered]@{
        name = $_.Name
        size = $_.Length
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToUpperInvariant()
    }
})
$manifestParent = Split-Path -Parent ([IO.Path]::GetFullPath($ManifestPath))
$provenanceParent = Split-Path -Parent ([IO.Path]::GetFullPath($ProvenancePath))
New-Item -ItemType Directory -Force -Path $manifestParent | Out-Null
New-Item -ItemType Directory -Force -Path $provenanceParent | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText([IO.Path]::GetFullPath($ManifestPath), ($assets | ConvertTo-Json -Depth 4), $utf8)
$provenance = [ordered]@{
    commit = $ExpectedCommit.ToLowerInvariant()
    version = $ExpectedVersion
    signatureStatus = [string]$signature.Status
    setup = $setup.Name
    releases = $index.Name
    fullPackage = $fullPackages[0].Name
    packageCount = $packages.Count
}
[IO.File]::WriteAllText([IO.Path]::GetFullPath($ProvenancePath), ($provenance | ConvertTo-Json -Depth 4), $utf8)

Write-Output "Validated Squirrel.Windows version $ExpectedVersion from commit $ExpectedCommit."
Write-Output "Validated $($assets.Count) release assets; Setup.exe is NotSigned."

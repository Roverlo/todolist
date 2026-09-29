$ErrorActionPreference = 'Stop'
function Get-Sha256([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $sha.Dispose() }
}
$engineDir = Join-Path $PSScriptRoot '../src-tauri/vendor/aria2'
$binary = Join-Path $engineDir 'aria2c.exe'
$expectedBinary = 'B7EDEE5C43FF18B9E8B77983033BA7816FA220D810949D81FDB928E8B36D862F'
if ((Test-Path -LiteralPath $binary) -and (Get-Sha256 $binary) -eq $expectedBinary) {
    Write-Output 'aria2 1.37.0-motrix.16 verified'
    exit 0
}
New-Item -ItemType Directory -Path $engineDir -Force | Out-Null
$archive = Join-Path $engineDir 'engine.zip'
if (-not (Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest 'https://github.com/motrixapp/aria2/releases/download/v1.37.0-motrix.16/aria2c-1.37.0-motrix.16-win32-x64.zip' -OutFile $archive
}
if ((Get-Sha256 $archive) -ne '579F17351E81C9FE3ED11D9700F5983235FC362BEAF20F5F02820F7A1BFE49B0') { throw 'aria2 archive checksum mismatch; remove vendor/aria2/engine.zip and retry' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
    $entry = @($zip.Entries | Where-Object { $_.Name -eq 'aria2c.exe' })
    if ($entry.Count -ne 1) { throw 'Expected one aria2c.exe' }
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry[0], $binary, $true)
} finally { $zip.Dispose() }
if ((Get-Sha256 $binary) -ne $expectedBinary) { throw 'aria2 binary checksum mismatch' }
Write-Output 'aria2 1.37.0-motrix.16 prepared and verified'

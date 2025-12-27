# PowerShell script to create a portable version of ProjectTodo
param(
    [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"

# Paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$targetDir = Join-Path $rootDir "src-tauri\target\release"
$portableDir = Join-Path (Split-Path -Parent $rootDir) "portable\01_Offline_Portable"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputName = "ProjectTodo-Portable-$timestamp.exe"
$outputPath = Join-Path $portableDir $outputName

Write-Host "Creating portable version of ProjectTodo..." -ForegroundColor Green
Write-Host "Version: $Version" -ForegroundColor Cyan
Write-Host "Output: $outputPath" -ForegroundColor Cyan

# Create portable directory if it doesn't exist
if (!(Test-Path $portableDir)) {
    New-Item -ItemType Directory -Path $portableDir | Out-Null
    Write-Host "Created portable directory: $portableDir" -ForegroundColor Yellow
}

# Check if the exe exists
$exePath = Join-Path $targetDir "app.exe"
if (!(Test-Path $exePath)) {
    Write-Host "Error: app.exe not found at $exePath" -ForegroundColor Red
    Write-Host "Please run 'npm run tauri:build' first" -ForegroundColor Red
    exit 1
}

# Check if required DLLs exist
$requiredFiles = @(
    "WebView2Loader.dll"
)

$missingFiles = @()
foreach ($file in $requiredFiles) {
    $filePath = Join-Path $targetDir $file
    if (!(Test-Path $filePath)) {
        $missingFiles += $file
    }
}

# Copy the exe
Write-Host "Copying executable..." -ForegroundColor Yellow
Copy-Item $exePath $outputPath -Force

# Copy required DLLs
# Copy required DLLs
foreach ($file in $requiredFiles) {
    $filePath = Join-Path $targetDir $file
    
    # Try to find exactly in target dir
    if (Test-Path $filePath) {
        $dllDest = Join-Path $portableDir $file
        Copy-Item $filePath $dllDest -Force
        Write-Host "Included dependency: $file" -ForegroundColor Gray
    } else {
        # Try to search recursively in build dir if not found directly
        $found = Get-ChildItem -Path $targetDir -Filter $file -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            $dllDest = Join-Path $portableDir $file
            Copy-Item $found.FullName $dllDest -Force
            Write-Host "Included dependency: $file (found in build artifacts)" -ForegroundColor Gray
            # Remove from missing list as we found it
            $missingFiles = $missingFiles | Where-Object { $_ -ne $file }
        }
    }
}

# Check for Fixed Version Runtime
# Strategy: Look in the known location where the user has it: D:\task\portable\WebView2Runtime
$runtimeSearchPath = Join-Path (Split-Path -Parent $rootDir) "portable\WebView2Runtime"
$runtimeDestName = "Microsoft.WebView2.FixedVersionRuntime"
$runtimeDestPath = Join-Path $portableDir $runtimeDestName

# Find the specific version folder (e.g., Microsoft.WebView2.FixedVersionRuntime.143.0.3650.96.x64)
$foundRuntime = Get-ChildItem -Path $runtimeSearchPath -Directory -Filter "Microsoft.WebView2.FixedVersionRuntime*" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($foundRuntime) {
    Write-Host "Found Fixed Version Runtime at: $($foundRuntime.FullName)" -ForegroundColor Yellow
    Write-Host "Copying to portable package... (This will take a moment)" -ForegroundColor Yellow
    
    # Copy to the standard name strictly required by Tauri
    Copy-Item -Path $foundRuntime.FullName -Destination $runtimeDestPath -Recurse -Force
    
    Write-Host "Success! Included Offline Runtime: $runtimeDestName" -ForegroundColor Green
} else {
    # Fallback to checking root just in case
    $fallbackPath = Join-Path $rootDir $runtimeDestName
    if (Test-Path $fallbackPath) {
         Write-Host "Found runtime in project root." -ForegroundColor Yellow
         Copy-Item -Path $fallbackPath -Destination $portableDir -Recurse -Force
         Write-Host "Included Offline Runtime from root." -ForegroundColor Green
    } else {
        Write-Host "Warning: Could not find Fixed Version Runtime in $runtimeSearchPath" -ForegroundColor Red
        Write-Host "The generated EXE will still work on most PCs, but won't be strictly 'offline' capable for Win7/8." -ForegroundColor Gray
    }
}

# Get file info
$fileInfo = Get-Item $outputPath
$fileSizeMB = [math]::Round($fileInfo.Length / 1MB, 2)

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "Portable version created successfully!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "File: $outputName" -ForegroundColor Cyan
Write-Host "Location: $portableDir" -ForegroundColor Cyan
Write-Host "Size: $fileSizeMB MB" -ForegroundColor Cyan
Write-Host ""

if ($missingFiles.Count -gt 0) {
    Write-Host "Warning: Some DLL files were not found:" -ForegroundColor Yellow
    foreach ($file in $missingFiles) {
        Write-Host "  - $file" -ForegroundColor Yellow
    }
    Write-Host "The application may require WebView2 Runtime to be installed." -ForegroundColor Yellow
}

Write-Host "The portable version is ready to use!" -ForegroundColor Green
Write-Host "No installation required - just run the exe file." -ForegroundColor Green

# Return the output path for other scripts to use
return $outputPath

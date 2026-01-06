# PowerShell script to create a portable version of ProjectTodo
param(
    [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"

# Paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
# Support custom CARGO_TARGET_DIR
if ($env:CARGO_TARGET_DIR) {
    $targetDir = Join-Path $env:CARGO_TARGET_DIR "release"
}
else {
    $targetDir = Join-Path $rootDir "src-tauri\target\release"
}
$portableDir = Join-Path (Split-Path -Parent $rootDir) "portable\01_Offline_Portable"
$timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$outputName = "ProjectTodo_$timestamp.exe"
$outputPath = Join-Path $portableDir $outputName
$logName = "ProjectTodo_$timestamp.txt"
$logPath = Join-Path $portableDir $logName

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

# Copy the exe (Single File Requirement)
Write-Host "Copying executable..." -ForegroundColor Yellow
Copy-Item $exePath $outputPath -Force

# Create Changelog
Write-Host "Creating changelog..." -ForegroundColor Yellow
$changeLogContent = @"
版本: $Version
时间: $timestamp
更新内容:
- 【交互优化】重构笔记删除交互：替换原生弹窗为自定义粉色主题确认框，视觉风格更统一。
- 【核心修复】修复笔记“先斩后奏”问题：只有在点击确认后才会执行删除操作，杜绝误删风险。
- 【UI美化】统一全站弹窗设计语言，提升整体精致度。
"@
Set-Content -Path $logPath -Value $changeLogContent -Encoding UTF8

# Get file info
$fileInfo = Get-Item $outputPath
$fileSizeMB = [math]::Round($fileInfo.Length / 1MB, 2)

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "Portable version created successfully!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "EXE File: $outputName" -ForegroundColor Cyan
Write-Host "Log File: $logName" -ForegroundColor Cyan
Write-Host "Location: $portableDir" -ForegroundColor Cyan
Write-Host "Size: $fileSizeMB MB" -ForegroundColor Cyan
Write-Host ""
Write-Host "The portable version is ready to use!" -ForegroundColor Green

# Return the output path
return $outputPath

param([Parameter(Mandatory = $true)][string]$Executable, [switch]$EditorWorkflow)
$ErrorActionPreference = 'Stop'

$source = (Get-Item -LiteralPath $Executable).FullName
$stream = [IO.File]::OpenRead($source)
try {
    if ($stream.ReadByte() -ne 77 -or $stream.ReadByte() -ne 90) { throw 'Not a Windows executable' }
} finally { $stream.Dispose() }

$checkRoot = Join-Path (Split-Path -Parent $PSScriptRoot) ('ui-check.local\portable-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $checkRoot | Out-Null
$dataRoot = Join-Path $checkRoot 'data'
if ($EditorWorkflow) {
    # Keep native image writes inside the existing $HOME filesystem scope.
    $dataRoot = Join-Path ([IO.Path]::GetTempPath()) ('ProjectTodo-native-check-' + [guid]::NewGuid().ToString('N'))
}
New-Item -ItemType Directory -Path $dataRoot | Out-Null
$dataPath = Join-Path $dataRoot 'data.json'
$sample = @{ version = 12; state = @{ activeView = 'notes'; selectedNoteId = 'portable-check'; notes = @(@{
    id = 'portable-check'; title = 'Portable editor check'; content = '<p>Packaged editor</p>'; date = '2026-09-06'; tags = @(); createdAt = 1788624000000; updatedAt = 1788624000000
}) } } | ConvertTo-Json -Depth 8 -Compress
[IO.File]::WriteAllText($dataPath, $sample)
$sampleHash = (Get-FileHash -LiteralPath $dataPath -Algorithm SHA256).Hash

# Keep a verified backup and a manual restore command; never restore over live edits automatically.
$userRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'ProjectTodo'
$before = @{}
if (Test-Path -LiteralPath $userRoot) {
    $backupRoot = Join-Path $checkRoot 'user-data-before'
    Copy-Item -LiteralPath $userRoot -Destination $backupRoot -Recurse
    Get-ChildItem -LiteralPath $userRoot -File -Recurse | ForEach-Object {
        $relative = $_.FullName.Substring($userRoot.Length + 1)
        $before[$relative] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        if ((Get-FileHash -LiteralPath (Join-Path $backupRoot $relative) -Algorithm SHA256).Hash -ne $before[$relative]) { throw 'Backup verification failed' }
    }
    $restore = "Get-ChildItem -LiteralPath '" + $backupRoot.Replace("'", "''") + "' | Copy-Item -Destination '" + $userRoot.Replace("'", "''") + "' -Recurse -Force"
    [IO.File]::WriteAllText((Join-Path $checkRoot 'RESTORE.ps1'), $restore)
}

$testExe = Join-Path $checkRoot 'ProjectTodo-check.exe'
Copy-Item -LiteralPath $source -Destination $testExe
$oldData = $env:PROJECTTODO_TEST_DATA_DIR
$oldWebView = $env:WEBVIEW2_USER_DATA_FOLDER
$oldWebViewArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$started = $null
try {
    $env:PROJECTTODO_TEST_DATA_DIR = $dataRoot
    $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $checkRoot 'webview'
    if ($EditorWorkflow) {
        $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
        $probe.Start()
        $nativeDebugPort = $probe.LocalEndpoint.Port
        $probe.Stop()
        $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$nativeDebugPort"
    }
    $started = Start-Process -FilePath $testExe -WorkingDirectory $checkRoot -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 8
    $started.Refresh()
    if ($started.HasExited) { throw "Portable process exited: $($started.ExitCode)" }
    if (-not (Test-Path -LiteralPath $env:WEBVIEW2_USER_DATA_FOLDER)) { throw 'Isolated WebView profile was not created' }
    if ((Get-FileHash -LiteralPath $dataPath -Algorithm SHA256).Hash -eq $sampleHash) { throw 'Frontend did not persist the isolated test data' }
    $saved = Get-Content -LiteralPath $dataPath -Raw | ConvertFrom-Json
    if ($saved.state.notes.Count -ne 1 -or $saved.state.notes[0].id -ne 'portable-check') { throw 'Wrong data loaded in portable check' }
    if ($EditorWorkflow) {
        Push-Location (Split-Path -Parent $PSScriptRoot)
        try {
            & node (Join-Path $PSScriptRoot 'test-note-workflow.mjs') --cdp $nativeDebugPort --data $dataPath
            if ($LASTEXITCODE -ne 0) { throw 'Packaged note workflow failed' }
        } finally { Pop-Location }
    }
    foreach ($relative in $before.Keys) {
        if ((Get-FileHash -LiteralPath (Join-Path $userRoot $relative) -Algorithm SHA256).Hash -ne $before[$relative]) { throw 'Existing user data changed during the check; backup retained' }
    }
    [ordered]@{
        result = 'PASS'; runningSeconds = 8; editorWorkflow = [bool]$EditorWorkflow; isolatedData = $dataPath; existingDataUnchanged = $true
        executable = $source; bytes = (Get-Item -LiteralPath $source).Length
        sha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
    } | ConvertTo-Json | Tee-Object -FilePath (Join-Path $checkRoot 'result.json')
} finally {
    if ($started -and -not $started.HasExited) { Stop-Process -Id $started.Id }
    $env:PROJECTTODO_TEST_DATA_DIR = $oldData
    $env:WEBVIEW2_USER_DATA_FOLDER = $oldWebView
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $oldWebViewArguments
}

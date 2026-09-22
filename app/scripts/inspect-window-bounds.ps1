param([Parameter(Mandatory = $true)][int]$ProcessId)
$ErrorActionPreference = 'Stop'
# Read physical Windows rectangles, including the visible frame (not its shadow).
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowBoundsProbe {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left, top, right, bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public int size; public Rect monitor, work; public uint flags; }
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref Point point);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, uint attribute, out Rect rect, int size);
}
'@
$previousContext = [WindowBoundsProbe]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
try {
    $window = (Get-Process -Id $ProcessId).MainWindowHandle
    if ($window -eq [IntPtr]::Zero) { throw 'No native main window' }
    $outer = New-Object WindowBoundsProbe+Rect
    $visible = New-Object WindowBoundsProbe+Rect
    $client = New-Object WindowBoundsProbe+Rect
    $origin = New-Object WindowBoundsProbe+Point
    $monitor = New-Object WindowBoundsProbe+MonitorInfo
    $monitor.size = [Runtime.InteropServices.Marshal]::SizeOf($monitor)
    if (-not [WindowBoundsProbe]::GetWindowRect($window, [ref]$outer)) { throw 'GetWindowRect failed' }
    if ([WindowBoundsProbe]::DwmGetWindowAttribute($window, 9, [ref]$visible, 16) -ne 0) { throw 'DwmGetWindowAttribute failed' }
    if (-not [WindowBoundsProbe]::GetClientRect($window, [ref]$client)) { throw 'GetClientRect failed' }
    if (-not [WindowBoundsProbe]::ClientToScreen($window, [ref]$origin)) { throw 'ClientToScreen failed' }
    if (-not [WindowBoundsProbe]::GetMonitorInfo([WindowBoundsProbe]::MonitorFromWindow($window, 2), [ref]$monitor)) { throw 'GetMonitorInfo failed' }
    [ordered]@{ outer=$outer; visible=$visible; client=$client; clientOrigin=$origin; work=$monitor.work; screen=$monitor.monitor } | ConvertTo-Json -Compress
} finally { [void][WindowBoundsProbe]::SetThreadDpiAwarenessContext($previousContext) }

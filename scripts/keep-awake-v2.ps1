# keep-awake-v2.ps1 — 防息屏（不杀进程、不抢焦点、与当前 session 隔离）
#
# 机制：
#   1. 每 8 分钟循环一次（远小于 Windows 默认 10 分钟息屏 / 15 分钟锁屏）
#   2. 检查 Notepad++ 是否已运行 —— 未运行则静默启动打开一个 tmp 文件
#   3. 向 tmp 文件 append 一行时间戳（Notepad++ 会检测外部修改保持"活跃"感知）
#   4. 用 Windows API SetCursorPos 微移鼠标 1px（水平移 1、再移回来），重置系统 idle timer
#   5. 全程不使用 taskkill、不使用 SendKeys、不切换前台窗口
#
# 启动（在任意独立终端，不要在当前 Claude Code bash 里前台运行）：
#   Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-ExecutionPolicy Bypass -File "C:\ClaudeCodeProjects\K0\scripts\keep-awake-v2.ps1"'
#
# 停止：
#   Get-Content C:\ClaudeCodeProjects\K0\scripts\.keep-awake-v2.pid | ForEach-Object { Stop-Process -Id $_ -Force }

$ErrorActionPreference = 'SilentlyContinue'

$TmpFile     = 'C:\Windows\Temp\k0_keepawake.txt'
$NotepadPP   = 'C:\tools\Notepad++\notepad++.exe'
$IntervalSec = 480   # 8 分钟
$PidFile     = 'C:\ClaudeCodeProjects\K0\scripts\.keep-awake-v2.pid'
$LogFile     = 'C:\ClaudeCodeProjects\K0\scripts\.keep-awake-v2.log'

# 记录自己 PID
$PID | Out-File -Encoding ascii -FilePath $PidFile

# 初始化 tmp 文件
if (-not (Test-Path $TmpFile)) {
    "K0 keep-awake started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -Encoding utf8 $TmpFile
}

# 加载 Win32 API：SetCursorPos + GetCursorPos，用来微移鼠标
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseUtil {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    public struct POINT { public int X; public int Y; }
}
"@ -ErrorAction SilentlyContinue

function Write-Log($msg) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Out-File -Append -Encoding utf8 $LogFile
}

Write-Log "keep-awake-v2 started (pid=$PID, interval=${IntervalSec}s)"

while ($true) {
    try {
        # 1. 若 Notepad++ 未运行 → 静默打开（-WindowStyle Minimized 不抢焦点）
        $npp = Get-Process -Name 'notepad++' -ErrorAction SilentlyContinue
        if (-not $npp) {
            if (Test-Path $NotepadPP) {
                Start-Process -FilePath $NotepadPP -ArgumentList "`"$TmpFile`"" -WindowStyle Minimized
                Write-Log "Notepad++ 未运行，已静默启动（最小化）"
                Start-Sleep -Seconds 2
            } else {
                Write-Log "Notepad++ 不存在于 $NotepadPP，跳过启动"
            }
        }

        # 2. 向 tmp 文件 append 时间戳（Notepad++ 会感知到外部修改）
        "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') keep-awake tick" | Out-File -Append -Encoding utf8 $TmpFile

        # 3. 鼠标微移 1px 再移回（重置 Windows idle timer）
        $pt = New-Object MouseUtil+POINT
        [MouseUtil]::GetCursorPos([ref]$pt) | Out-Null
        [MouseUtil]::SetCursorPos($pt.X + 1, $pt.Y) | Out-Null
        Start-Sleep -Milliseconds 100
        [MouseUtil]::SetCursorPos($pt.X, $pt.Y) | Out-Null

        Write-Log "tick"
    } catch {
        Write-Log "ERROR: $_"
    }

    Start-Sleep -Seconds $IntervalSec
}

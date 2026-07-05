# keep-awake-v3.ps1 — Windows 真正防息屏（使用官方 SetThreadExecutionState API）
#
# 为什么 v2 失败：
#   v2 用 SetCursorPos 编程移动鼠标 + Out-File 写文件。
#   Windows 从 Win10 开始，只有真正的 hardware input event 才能重置 idle timer。
#   SetCursorPos 不算 hardware event（不通过 raw input 子系统）。
#   Out-File 写盘更不算。所以 v2 每 8 分钟"tick"正常，但显示器仍会息屏。
#
# v3 正确方案：
#   Win32 API SetThreadExecutionState(ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED)
#   这是 Windows 官方防息屏 API（PowerPoint 演示模式、视频播放器都用它）。
#   只要本进程持有该 flag，Windows 就不会息屏、不会睡眠。
#   进程退出时 flag 自动释放，无需清理。
#
#   同时用 SendInput 每 4 分钟发送一个 F15 键（无副作用功能键）作为双保险：
#   F15 是真正的 hardware input event，即使 SetThreadExecutionState 因某种原因失效
#   也能保证 Windows 认为有用户活动。F15 是苹果扩展键盘功能键，Windows 应用不响应它。
#
#   Notepad++ 部分：脚本会打开 tmp 文件，然后每 4 分钟"echo append"文件末尾。
#   Notepad++ 检测到外部文件修改会提示 reload——但用户睡觉时不会看到，无干扰。
#
# 启动（在任意独立终端，不要在当前 Claude Code bash 前台运行）：
#   Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-ExecutionPolicy Bypass -File "C:\ClaudeCodeProjects\K0\scripts\keep-awake-v3.ps1"'
#
# 停止：
#   $procId = Get-Content C:\ClaudeCodeProjects\K0\scripts\.keep-awake-v3.pid
#   Stop-Process -Id $procId -Force

$ErrorActionPreference = 'SilentlyContinue'

$TmpFile     = 'C:\Windows\Temp\k0_keepawake.txt'
$NotepadPP   = 'C:\tools\Notepad++\notepad++.exe'
$IntervalSec = 240   # 4 分钟（原来 8 分钟太长，某些电源计划 5 分钟就息屏）
$PidFile     = 'C:\ClaudeCodeProjects\K0\scripts\.keep-awake-v3.pid'
$LogFile     = 'C:\ClaudeCodeProjects\K0\scripts\.keep-awake-v3.log'

$PID | Out-File -Encoding ascii -FilePath $PidFile

if (-not (Test-Path $TmpFile)) {
    "K0 keep-awake v3 started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -Encoding utf8 $TmpFile
}

# ── 核心：Win32 API 声明 ──────────────────────────────────────────────────
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class PowerUtil {
    [FlagsAttribute]
    public enum EXECUTION_STATE : uint {
        ES_AWAYMODE_REQUIRED   = 0x00000040,
        ES_CONTINUOUS          = 0x80000000,
        ES_DISPLAY_REQUIRED    = 0x00000002,
        ES_SYSTEM_REQUIRED     = 0x00000001
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern EXECUTION_STATE SetThreadExecutionState(EXECUTION_STATE esFlags);
}

public class InputUtil {
    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public InputUnion U;
    }
    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion {
        [FieldOffset(0)] public KEYBDINPUT ki;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    public const uint INPUT_KEYBOARD = 1;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const ushort VK_F15 = 0x7E;

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    public static void PressF15() {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].U.ki.wVk = VK_F15;
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].U.ki.wVk = VK_F15;
        inputs[1].U.ki.dwFlags = KEYEVENTF_KEYUP;
        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }
}
"@ -ErrorAction SilentlyContinue

function Write-Log($msg) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Out-File -Append -Encoding utf8 $LogFile
}

# ── 步骤 1: 立刻设置 EXECUTION_STATE flag（最关键的一步）──────────
# ES_CONTINUOUS  = 持续生效直到本线程再次调用或退出
# ES_DISPLAY_REQUIRED = 阻止显示器息屏
# ES_SYSTEM_REQUIRED  = 阻止系统睡眠
$state = [PowerUtil+EXECUTION_STATE]::ES_CONTINUOUS -bor [PowerUtil+EXECUTION_STATE]::ES_DISPLAY_REQUIRED -bor [PowerUtil+EXECUTION_STATE]::ES_SYSTEM_REQUIRED
$result = [PowerUtil]::SetThreadExecutionState($state)
Write-Log "keep-awake v3 started (pid=$PID, interval=${IntervalSec}s). SetThreadExecutionState result=$result"

# ── 步骤 2: 打开 Notepad++（如未开），静默最小化 ──────────
$npp = Get-Process -Name 'notepad++' -ErrorAction SilentlyContinue
if (-not $npp) {
    if (Test-Path $NotepadPP) {
        Start-Process -FilePath $NotepadPP -ArgumentList "`"$TmpFile`"" -WindowStyle Minimized
        Write-Log "Notepad++ 未运行，已静默启动（最小化）"
        Start-Sleep -Seconds 2
    } else {
        Write-Log "Notepad++ 不存在于 $NotepadPP，跳过启动（不影响防息屏，SetThreadExecutionState 已生效）"
    }
}

# ── 步骤 3: 循环 —— 每 4 分钟 refresh 一次 ──────────
while ($true) {
    try {
        # 3a. 重新调用 SetThreadExecutionState —— 有些电源计划下 flag 可能过期
        [PowerUtil]::SetThreadExecutionState($state) | Out-Null

        # 3b. 发送 F15 键作为双保险（真正的 hardware input event）
        [InputUtil]::PressF15()

        # 3c. 向 tmp 文件 append 时间戳（触发 Notepad++ 外部修改感知）
        "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') keep-awake v3 tick (state refreshed + F15 sent)" | Out-File -Append -Encoding utf8 $TmpFile

        Write-Log "tick (state refresh + F15 sent + file append)"
    } catch {
        Write-Log "ERROR: $_"
    }

    Start-Sleep -Seconds $IntervalSec
}

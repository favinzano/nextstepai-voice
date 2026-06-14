using System.Runtime.InteropServices;
using System.Text.Json;

internal static class Program
{
    private const int HookKeyboardLowLevel = 13;
    private const int MessageKeyDown = 0x0100;
    private const int MessageKeyUp = 0x0101;
    private const int MessageSystemKeyDown = 0x0104;
    private const int MessageSystemKeyUp = 0x0105;
    private const uint InputKeyboard = 1;
    private const ushort KeyControl = 0x11;
    private const ushort KeyV = 0x56;
    private const uint KeyUp = 0x0002;
    private static KeyboardHook? keyboardHook;
    private static IntPtr keyboardHookHandle;
    private static ushort monitoredKey;
    private static bool requireControl;
    private static bool requireShift;
    private static bool requireAlt;
    private static bool shortcutPressed;

    private delegate IntPtr KeyboardHook(int code, IntPtr message, IntPtr data);

    [StructLayout(LayoutKind.Sequential)]
    private struct Message
    {
        public IntPtr window;
        public uint message;
        public UIntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int pointX;
        public int pointY;
        public uint privateValue;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LowLevelKeyboardInput
    {
        public uint virtualKey;
        public uint scanCode;
        public uint flags;
        public uint time;
        public IntPtr extraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public uint type;
        public InputUnion union;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public KeyboardInput keyboard;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardInput
    {
        public ushort virtualKey;
        public ushort scanCode;
        public uint flags;
        public uint time;
        public IntPtr extraInfo;
    }

    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint first, uint second, bool attach);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, Input[] inputs, int size);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int hook, KeyboardHook callback, IntPtr module, uint threadId);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int virtualKey);
    [DllImport("user32.dll")] private static extern int GetMessage(out Message message, IntPtr window, uint minimum, uint maximum);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string? moduleName);

    private static void Write(object value) => Console.WriteLine(JsonSerializer.Serialize(value));

    private static int Capture()
    {
        var handle = GetForegroundWindow();
        GetWindowThreadProcessId(handle, out var processId);
        Write(new { ok = handle != IntPtr.Zero && processId > 0, handle = handle.ToInt64(), processId });
        return handle != IntPtr.Zero && processId > 0 ? 0 : 2;
    }

    private static int Paste(string[] args)
    {
        var handleArgument = Array.IndexOf(args, "--handle");
        if (handleArgument < 0 || handleArgument + 1 >= args.Length || !long.TryParse(args[handleArgument + 1], out var handleValue))
        {
            Write(new { ok = false, error = "missing_handle" });
            return 2;
        }
        var handle = new IntPtr(handleValue);
        if (!IsWindow(handle))
        {
            Write(new { ok = false, error = "invalid_window" });
            return 3;
        }
        var processArgument = Array.IndexOf(args, "--process");
        if (processArgument < 0 || processArgument + 1 >= args.Length || !uint.TryParse(args[processArgument + 1], out var expectedProcessId))
        {
            Write(new { ok = false, error = "missing_process" });
            return 2;
        }
        GetWindowThreadProcessId(handle, out var actualProcessId);
        if (actualProcessId != expectedProcessId)
        {
            Write(new { ok = false, error = "window_owner_changed" });
            return 3;
        }

        ShowWindowAsync(handle, 9);
        var targetThread = GetWindowThreadProcessId(handle, out _);
        var currentThread = GetCurrentThreadId();
        var attached = targetThread != currentThread && AttachThreadInput(currentThread, targetThread, true);
        var focused = SetForegroundWindow(handle);
        if (attached) AttachThreadInput(currentThread, targetThread, false);
        if (!focused && GetForegroundWindow() != handle)
        {
            Write(new { ok = false, error = "focus_denied" });
            return 4;
        }
        Thread.Sleep(100);
        var inputs = new[]
        {
            Key(KeyControl, 0),
            Key(KeyV, 0),
            Key(KeyV, KeyUp),
            Key(KeyControl, KeyUp)
        };
        var sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<Input>());
        Write(new { ok = sent == (uint)inputs.Length, sent, expected = inputs.Length, error = sent == (uint)inputs.Length ? null : "send_input_denied" });
        return sent == (uint)inputs.Length ? 0 : 5;
    }

    private static bool IsDown(int virtualKey) => (GetAsyncKeyState(virtualKey) & 0x8000) != 0;

    private static ushort ResolveVirtualKey(string? keyName)
    {
        if (keyName?.Equals("Space", StringComparison.OrdinalIgnoreCase) == true) return 0x20;
        if (keyName?.Length == 1 && char.IsAsciiLetterOrDigit(keyName[0])) return char.ToUpperInvariant(keyName[0]);
        return 0;
    }

    private static IntPtr MonitorKeyboard(int code, IntPtr message, IntPtr data)
    {
        if (code >= 0)
        {
            var input = Marshal.PtrToStructure<LowLevelKeyboardInput>(data);
            if (input.virtualKey == monitoredKey)
            {
                var value = message.ToInt32();
                var isDown = value is MessageKeyDown or MessageSystemKeyDown;
                var isUp = value is MessageKeyUp or MessageSystemKeyUp;
                var modifiersMatch = IsDown(KeyControl) == requireControl
                    && IsDown(0x10) == requireShift
                    && IsDown(0x12) == requireAlt;

                if (isDown && modifiersMatch && !shortcutPressed)
                {
                    shortcutPressed = true;
                    Write(new { type = "pressed" });
                }
                else if (isUp && shortcutPressed)
                {
                    shortcutPressed = false;
                    Write(new { type = "released" });
                }
            }
        }
        return CallNextHookEx(keyboardHookHandle, code, message, data);
    }

    private static int Monitor(string[] args)
    {
        var acceleratorArgument = Array.IndexOf(args, "--accelerator");
        if (acceleratorArgument < 0 || acceleratorArgument + 1 >= args.Length) return 2;

        var parts = args[acceleratorArgument + 1].Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var modifiers = new[] { "Control", "Ctrl", "CommandOrControl", "Shift", "Alt" };
        requireControl = parts.Any(part => part.Equals("Control", StringComparison.OrdinalIgnoreCase)
            || part.Equals("Ctrl", StringComparison.OrdinalIgnoreCase)
            || part.Equals("CommandOrControl", StringComparison.OrdinalIgnoreCase));
        requireShift = parts.Any(part => part.Equals("Shift", StringComparison.OrdinalIgnoreCase));
        requireAlt = parts.Any(part => part.Equals("Alt", StringComparison.OrdinalIgnoreCase));
        var keyName = parts.LastOrDefault(part => !modifiers.Contains(part, StringComparer.OrdinalIgnoreCase));
        monitoredKey = ResolveVirtualKey(keyName);
        if (monitoredKey == 0) return 2;

        keyboardHook = MonitorKeyboard;
        keyboardHookHandle = SetWindowsHookEx(HookKeyboardLowLevel, keyboardHook, GetModuleHandle(null), 0);
        if (keyboardHookHandle == IntPtr.Zero)
        {
            Write(new { type = "error", error = Marshal.GetLastWin32Error() });
            return 3;
        }

        Write(new { type = "ready" });
        try
        {
            while (GetMessage(out _, IntPtr.Zero, 0, 0) > 0) { }
        }
        finally
        {
            UnhookWindowsHookEx(keyboardHookHandle);
        }
        return 0;
    }

    private static Input Key(ushort key, uint flags) => new()
    {
        type = InputKeyboard,
        union = new InputUnion { keyboard = new KeyboardInput { virtualKey = key, flags = flags } }
    };

    public static int Main(string[] args)
    {
        try
        {
            return args.FirstOrDefault() switch
            {
                "capture" => Capture(),
                "paste" => Paste(args),
                "monitor-shortcut" => Monitor(args),
                _ => 2
            };
        }
        catch (Exception error)
        {
            Write(new { ok = false, error = error.Message });
            return 1;
        }
    }
}

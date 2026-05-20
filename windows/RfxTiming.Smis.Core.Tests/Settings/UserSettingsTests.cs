using RfxTiming.Smis.Settings;
using Xunit;

namespace RfxTiming.Smis.Core.Tests.Settings;

public sealed class UserSettingsTests : IDisposable
{
    private readonly string _tmpDir = Path.Combine(Path.GetTempPath(), $"rfx-settings-{Guid.NewGuid():N}");

    public UserSettingsTests() => Directory.CreateDirectory(_tmpDir);

    [Fact]
    public void Load_returns_defaults_when_file_missing()
    {
        var s = UserSettings.Load(Path.Combine(_tmpDir, "missing.json"));
        Assert.Equal("127.0.0.1", s.Connection.Host);
        Assert.Equal(50000, s.Connection.Port);
        Assert.True(s.Connection.AutoReconnect);
        Assert.True(s.Display.ShowMessageCount);
        Assert.True(s.Logging.EnableRawLog);
    }

    [Fact]
    public void Save_and_Load_roundtrip()
    {
        string path = Path.Combine(_tmpDir, "settings.json");
        var s = new UserSettings
        {
            Connection = new ConnectionSettings
            {
                Host = "192.168.10.20",
                Port = 51234,
                AutoReconnect = false,
                AutoConnectOnStartup = true,
            },
            Display = new DisplaySettings
            {
                ShowParseErrors = false,
                ShowLogSize = false,
                ShowPipelineDiagram = false,
                ShowLastMessagePreview = true,
                AccentColorHex = "#FF8C00",
            },
            Logging = new LoggingSettings
            {
                EnableParsedLog = false,
                MaxFileSizeMb = 200,
                UsbMirrorPath = @"E:\backup",
            },
            WebSocket = new WebSocketSettings
            {
                Enabled = true,
                Port = 9001,
                BindAllInterfaces = true,
            },
        };

        s.Save(path);
        var loaded = UserSettings.Load(path);

        Assert.Equal("192.168.10.20", loaded.Connection.Host);
        Assert.Equal(51234, loaded.Connection.Port);
        Assert.False(loaded.Connection.AutoReconnect);
        Assert.True(loaded.Connection.AutoConnectOnStartup);
        Assert.False(loaded.Display.ShowParseErrors);
        Assert.False(loaded.Display.ShowLogSize);
        Assert.True(loaded.Display.ShowLastMessagePreview);
        Assert.Equal("#FF8C00", loaded.Display.AccentColorHex);
        Assert.False(loaded.Logging.EnableParsedLog);
        Assert.Equal(200, loaded.Logging.MaxFileSizeMb);
        Assert.Equal(@"E:\backup", loaded.Logging.UsbMirrorPath);
        Assert.True(loaded.WebSocket.Enabled);
        Assert.Equal(9001, loaded.WebSocket.Port);
    }

    [Fact]
    public void Load_returns_defaults_when_json_is_corrupted()
    {
        string path = Path.Combine(_tmpDir, "bad.json");
        File.WriteAllText(path, "{ this is not json }");
        var loaded = UserSettings.Load(path);
        Assert.Equal("127.0.0.1", loaded.Connection.Host);
    }

    [Fact]
    public void Save_creates_directory_if_missing()
    {
        string path = Path.Combine(_tmpDir, "a", "b", "settings.json");
        new UserSettings().Save(path);
        Assert.True(File.Exists(path));
    }

    public void Dispose()
    {
        if (Directory.Exists(_tmpDir))
        {
            try { Directory.Delete(_tmpDir, recursive: true); } catch { /* ignore */ }
        }
    }
}

using RfxTiming.Smis.Logging;
using RfxTiming.Smis.Protocol;
using Xunit;

namespace RfxTiming.Smis.Core.Tests.Logging;

public class RawSmisLogWriterTests : IDisposable
{
    private readonly string _tmpDir = Path.Combine(Path.GetTempPath(), $"rfx-rawlog-{Guid.NewGuid():N}");

    public RawSmisLogWriterTests() => Directory.CreateDirectory(_tmpDir);

    [Fact]
    public async Task WriteFrameAsync_emits_seiko_compatible_lines()
    {
        string path = Path.Combine(_tmpDir, "raw.log");
        DateTime ts1 = new(2026, 6, 13, 10, 0, 0, 204, DateTimeKind.Local);
        DateTime ts2 = new(2026, 6, 13, 10, 0, 1, 246, DateTimeKind.Local);
        var f1 = new SmisFrame(new DateTimeOffset(ts1), new byte[] { 0x3C }, "<Passing/>");
        var f2 = new SmisFrame(new DateTimeOffset(ts2), new byte[] { 0x3C },
            "<Standings SessionID=\"X\"><Standing Position=\"1\"/></Standings>");

        await using (var writer = new RawSmisLogWriter(path))
        {
            await writer.WriteFrameAsync(f1);
            await writer.WriteFrameAsync(f2);
            Assert.Equal(2, writer.WrittenCount);
        }

        string[] lines = await File.ReadAllLinesAsync(path);
        Assert.Equal(2, lines.Length);

        Assert.Equal("2026-06-13 10:00:00.204 <Passing/>", lines[0]);
        Assert.Equal("2026-06-13 10:00:01.246 <Standings SessionID=\"X\"><Standing Position=\"1\"/></Standings>", lines[1]);
    }

    [Fact]
    public async Task WriteFrameAsync_normalizes_inline_newlines_to_single_line()
    {
        string path = Path.Combine(_tmpDir, "raw.log");
        DateTime ts = new(2026, 6, 13, 10, 0, 0, 100, DateTimeKind.Local);
        // 仕様外だがフォーマッターが挟んだ改行を含む XML が来ても 1 行に詰めて出力できること
        string xmlWithBreaks = "<Standings>\n  <Standing Position=\"1\" />\n  <Standing Position=\"2\" />\n</Standings>";

        await using (var writer = new RawSmisLogWriter(path))
        {
            await writer.WriteFrameAsync(new SmisFrame(new DateTimeOffset(ts), new byte[] { 0x3C }, xmlWithBreaks));
        }

        string content = await File.ReadAllTextAsync(path);
        Assert.DoesNotContain('\r', content[..^1]); // 末尾改行除いて \r/\n 無し
        // 末尾以外の改行は無いはず
        Assert.Single(content.Split('\n', StringSplitOptions.RemoveEmptyEntries));
        Assert.Contains("<Standings> <Standing Position=\"1\" /> <Standing Position=\"2\" /> </Standings>", content);
    }

    [Fact]
    public async Task WriteAsync_with_explicit_timestamp_produces_same_format()
    {
        string path = Path.Combine(_tmpDir, "raw.log");
        DateTime ts = new(2026, 3, 27, 13, 32, 36, 204, DateTimeKind.Local);

        await using (var writer = new RawSmisLogWriter(path))
        {
            await writer.WriteAsync(ts, "<Competition ID=\"477\" />");
        }

        string content = await File.ReadAllTextAsync(path);
        Assert.Equal("2026-03-27 13:32:36.204 <Competition ID=\"477\" />\n", content);
    }

    [Fact]
    public async Task WriteFrameAsync_creates_directory_if_missing()
    {
        string nested = Path.Combine(_tmpDir, "a", "b", "raw.log");
        await using var writer = new RawSmisLogWriter(nested);
        await writer.WriteFrameAsync(new SmisFrame(DateTimeOffset.UtcNow, new byte[] { 0x3C }, "<x/>"));
        Assert.True(File.Exists(nested));
    }

    public void Dispose()
    {
        if (Directory.Exists(_tmpDir))
        {
            try { Directory.Delete(_tmpDir, recursive: true); }
            catch { /* tolerated */ }
        }
    }
}

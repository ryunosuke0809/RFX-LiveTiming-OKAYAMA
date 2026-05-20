using RfxTiming.Smis.Logging;
using RfxTiming.Smis.Protocol;
using Xunit;

namespace RfxTiming.Smis.Core.Tests.Logging;

public class RawSmisLogWriterTests : IDisposable
{
    private readonly string _tmpDir = Path.Combine(Path.GetTempPath(), $"rfx-rawlog-{Guid.NewGuid():N}");

    public RawSmisLogWriterTests() => Directory.CreateDirectory(_tmpDir);

    [Fact]
    public async Task WriteFrameAsync_appends_one_tab_separated_line_per_frame()
    {
        string path = Path.Combine(_tmpDir, "raw.txt");
        var ts1 = new DateTimeOffset(2026, 6, 13, 10, 0, 0, TimeSpan.Zero);
        var ts2 = new DateTimeOffset(2026, 6, 13, 10, 0, 1, TimeSpan.Zero);

        await using (var writer = new RawSmisLogWriter(path))
        {
            await writer.WriteFrameAsync(new SmisFrame(ts1, new byte[] { 0x3C }, "<Passing/>"));
            await writer.WriteFrameAsync(new SmisFrame(ts2, new byte[] { 0x3C, 0x44 }, "<Standings>\n<Standing/>\n</Standings>"));
            Assert.Equal(2, writer.WrittenCount);
        }

        string[] lines = await File.ReadAllLinesAsync(path);
        Assert.Equal(2, lines.Length);

        string[] cols1 = lines[0].Split('\t');
        Assert.Equal(3, cols1.Length);
        Assert.Equal("1", cols1[1]);
        Assert.Equal("<Passing/>", cols1[2]);

        string[] cols2 = lines[1].Split('\t');
        Assert.Equal(3, cols2.Length);
        Assert.Equal("2", cols2[1]);
        // 改行はエスケープされている
        Assert.DoesNotContain("\n", cols2[2]);
        Assert.Contains("\\n", cols2[2]);

        // Unescape で元の XML が復元できる
        string restored = RawSmisLogWriter.Unescape(cols2[2]);
        Assert.Equal("<Standings>\n<Standing/>\n</Standings>", restored);
    }

    [Fact]
    public async Task WriteFrameAsync_creates_directory_if_missing()
    {
        string nested = Path.Combine(_tmpDir, "a", "b", "raw.txt");
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

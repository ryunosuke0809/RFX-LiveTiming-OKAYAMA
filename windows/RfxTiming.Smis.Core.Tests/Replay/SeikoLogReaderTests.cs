using RfxTiming.Smis.Logging;
using RfxTiming.Smis.Protocol;
using RfxTiming.Smis.Replay;
using Xunit;

namespace RfxTiming.Smis.Core.Tests.Replay;

public class SeikoLogReaderTests : IDisposable
{
    private readonly string _tmpDir = Path.Combine(Path.GetTempPath(), $"rfx-seiko-{Guid.NewGuid():N}");

    public SeikoLogReaderTests() => Directory.CreateDirectory(_tmpDir);

    [Fact]
    public void TryParseLine_parses_real_seiko_format()
    {
        bool ok = SeikoLogReader.TryParseLine(
            "2026-03-27 13:32:36.204 <Competition ID=\"477\" NameJ=\"巌流塾\" NameE=\"\" />",
            out SeikoLogEntry entry);

        Assert.True(ok);
        Assert.Equal(new DateTime(2026, 3, 27, 13, 32, 36, 204, DateTimeKind.Local), entry.Timestamp);
        Assert.Equal("<Competition ID=\"477\" NameJ=\"巌流塾\" NameE=\"\" />", entry.Xml);
    }

    [Fact]
    public void TryParseLine_rejects_invalid_lines()
    {
        Assert.False(SeikoLogReader.TryParseLine("", out _));
        Assert.False(SeikoLogReader.TryParseLine("not a log line", out _));
        Assert.False(SeikoLogReader.TryParseLine("2026-03-27 13:32:36.204", out _)); // XML 部欠落
        Assert.False(SeikoLogReader.TryParseLine("2026-13-99 99:99:99.999 <X/>", out _)); // 無効日付
    }

    [Fact]
    public void TryParseLine_accepts_bom_at_start_of_first_line()
    {
        bool ok = SeikoLogReader.TryParseLine(
            "\uFEFF2026-03-27 13:32:36.204 <Competition ID=\"477\" />",
            out SeikoLogEntry entry);

        Assert.True(ok);
        Assert.Equal("<Competition ID=\"477\" />", entry.Xml);
    }

    [Fact]
    public async Task ReadAll_writer_to_reader_roundtrip()
    {
        string path = Path.Combine(_tmpDir, "seiko_roundtrip.log");

        DateTime[] timestamps = new[]
        {
            new DateTime(2026, 3, 27, 13, 32, 36, 204, DateTimeKind.Local),
            new DateTime(2026, 3, 27, 13, 32, 36, 246, DateTimeKind.Local),
            new DateTime(2026, 3, 27, 13, 32, 50, 0,   DateTimeKind.Local),
        };
        string[] xmls = new[]
        {
            "<Competition ID=\"477\" NameJ=\"テスト\" NameE=\"\" />",
            "<Category ID=\"477:1\" NameJ=\"クラス1\" NameE=\"\" CourseName=\"X\" CourseLength=\"100\" />",
            "<Passing ID=\"1\" SessionID=\"1:1:1:0:1\" LoopID=\"0\" Time=\"123456\" Order=\"1\" LastPassingTime=\"123456\" TeamID=\"477:1:1\" DriverNo=\"0\" LapTimeUse=\"1\" Type=\"N\" />",
        };

        await using (var writer = new RawSmisLogWriter(path))
        {
            for (int i = 0; i < timestamps.Length; i++)
            {
                await writer.WriteAsync(timestamps[i], xmls[i]);
            }
        }

        var entries = SeikoLogReader.ReadAll(path);

        Assert.Equal(3, entries.Count);
        for (int i = 0; i < entries.Count; i++)
        {
            Assert.Equal(timestamps[i], entries[i].Timestamp);
            Assert.Equal(xmls[i], entries[i].Xml);
        }
    }

    [Fact]
    public void ReadAll_parses_actual_sample_log_from_docs()
    {
        string repoRoot = FindRepoRoot();
        string sample = Path.Combine(repoRoot, "docs", "logs", "seiko_20260327.log");
        if (!File.Exists(sample))
        {
            // CI 等で docs が含まれない構成でもテストが落ちないようスキップ相当
            return;
        }

        var entries = SeikoLogReader.ReadAll(sample);
        Assert.NotEmpty(entries);
        // 仕様: 最初は Competition
        Assert.StartsWith("<Competition", entries[0].Xml);
        // 仕様: 全エントリで Xml は '<' で始まる
        Assert.All(entries, e => Assert.StartsWith("<", e.Xml));
    }

    private static string FindRepoRoot()
    {
        string? dir = AppContext.BaseDirectory;
        for (int i = 0; i < 10 && dir is not null; i++)
        {
            if (Directory.Exists(Path.Combine(dir, ".git")) ||
                File.Exists(Path.Combine(dir, "RFX-LiveTiming-OKAYAMA.code-workspace")))
            {
                return dir;
            }
            dir = Directory.GetParent(dir)?.FullName;
        }
        return AppContext.BaseDirectory;
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

using Microsoft.Extensions.Time.Testing;
using RfxTiming.Smis.Networking;
using RfxTiming.Smis.Services;
using RfxTiming.Smis.Settings;
using Xunit;

namespace RfxTiming.Smis.Core.Tests.Services;

/// <summary>
/// ReceiverService の日付ロールオーバーを <see cref="FakeTimeProvider"/> で検証する。
/// 本番サーバーへ実接続せず、TimeProvider を進めて
/// <see cref="ReceiverService.TryRolloverIfDateChangedAsync"/> を直接呼び出す。
/// </summary>
/// <remarks>
/// <see cref="FakeTimeProvider"/> のローカルタイムゾーンは既定で UTC なので、
/// テストでは UTC 上で日付が変わる時刻でセットする (例: 23:30Z 開始 → 1h 進める)。
/// 実機ではローカル時刻基準で日付が判定されるが、ロールオーバーロジック自体は
/// 「日付が変わったか」だけを見ているので、UTC でも JST でも同じテスト形になる。
/// </remarks>
public sealed class ReceiverServiceRolloverTests : IDisposable
{
    private readonly List<string> _filesToCleanUp = new();

    [Fact]
    public async Task TryRolloverIfDateChangedAsync_creates_new_file_when_date_changes()
    {
        // 2026-06-13 23:30 UTC から開始
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 13, 23, 30, 0, TimeSpan.Zero));

        var options = new SmisTcpClientOptions("127.0.0.1", 0, AutoReconnect: false);
        await using var service = new ReceiverService(
            options,
            new LoggingSettings { EnableRawLog = true, EnableParsedLog = true },
            clock);

        await service.StartAsync();
        await Task.Delay(50);

        string? day1RawPath = service.CurrentRawLogPath;
        string? day1ParsedPath = service.CurrentParsedLogPath;
        TrackForCleanup(day1RawPath);
        TrackForCleanup(day1ParsedPath);

        Assert.NotNull(day1RawPath);
        Assert.NotNull(day1ParsedPath);
        Assert.Contains("MOLA_INPUT_20260613", day1RawPath);
        Assert.Contains("MOLA_INPUT_20260613", day1ParsedPath);

        // 1 時間進めると日付跨ぎ (UTC)
        LogRotationEvent? captured = null;
        service.LogFileRotated += (_, e) => captured = e;

        clock.Advance(TimeSpan.FromHours(1));
        bool rotated = await service.TryRolloverIfDateChangedAsync(CancellationToken.None);

        TrackForCleanup(service.CurrentRawLogPath);
        TrackForCleanup(service.CurrentParsedLogPath);

        Assert.True(rotated);
        Assert.NotNull(captured);
        Assert.Equal(new DateOnly(2026, 6, 13), captured!.FromDate);
        Assert.Equal(new DateOnly(2026, 6, 14), captured.ToDate);
        Assert.Equal(1, service.LogRotationCount);
        Assert.Contains("MOLA_INPUT_20260614", service.CurrentRawLogPath!);
        Assert.Contains("MOLA_INPUT_20260614", service.CurrentParsedLogPath!);
        Assert.NotEqual(day1RawPath, service.CurrentRawLogPath);
        Assert.NotEqual(day1ParsedPath, service.CurrentParsedLogPath);

        await service.StopAsync();
    }

    [Fact]
    public async Task TryRolloverIfDateChangedAsync_is_noop_when_same_day()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 13, 10, 0, 0, TimeSpan.Zero));
        var options = new SmisTcpClientOptions("127.0.0.1", 0, AutoReconnect: false);
        await using var service = new ReceiverService(
            options,
            new LoggingSettings { EnableRawLog = true, EnableParsedLog = false },
            clock);

        await service.StartAsync();
        await Task.Delay(50);
        TrackForCleanup(service.CurrentRawLogPath);

        string? initialPath = service.CurrentRawLogPath;
        Assert.NotNull(initialPath);

        clock.Advance(TimeSpan.FromHours(1)); // 同日内
        bool rotated = await service.TryRolloverIfDateChangedAsync(CancellationToken.None);

        Assert.False(rotated);
        Assert.Equal(0, service.LogRotationCount);
        Assert.Equal(initialPath, service.CurrentRawLogPath);

        await service.StopAsync();
    }

    [Fact]
    public async Task Rollover_with_only_raw_log_enabled_keeps_parsed_disabled()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 13, 23, 59, 30, TimeSpan.Zero));
        var options = new SmisTcpClientOptions("127.0.0.1", 0, AutoReconnect: false);
        await using var service = new ReceiverService(
            options,
            new LoggingSettings { EnableRawLog = true, EnableParsedLog = false },
            clock);

        await service.StartAsync();
        await Task.Delay(50);
        TrackForCleanup(service.CurrentRawLogPath);

        Assert.NotNull(service.CurrentRawLogPath);
        Assert.Null(service.CurrentParsedLogPath);

        clock.Advance(TimeSpan.FromMinutes(1)); // 翌日 00:00:30
        bool rotated = await service.TryRolloverIfDateChangedAsync(CancellationToken.None);
        TrackForCleanup(service.CurrentRawLogPath);

        Assert.True(rotated);
        Assert.NotNull(service.CurrentRawLogPath);
        Assert.Contains("MOLA_INPUT_20260614", service.CurrentRawLogPath);
        Assert.Null(service.CurrentParsedLogPath);

        await service.StopAsync();
    }

    [Fact]
    public async Task Rollover_event_carries_previous_and_current_paths()
    {
        // 大晦日 23:50 UTC から開始 → 20 分進めて新年
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 12, 31, 23, 50, 0, TimeSpan.Zero));
        var options = new SmisTcpClientOptions("127.0.0.1", 0, AutoReconnect: false);
        await using var service = new ReceiverService(
            options,
            new LoggingSettings { EnableRawLog = true, EnableParsedLog = true },
            clock);

        await service.StartAsync();
        await Task.Delay(50);

        string? oldRaw = service.CurrentRawLogPath;
        string? oldParsed = service.CurrentParsedLogPath;
        TrackForCleanup(oldRaw);
        TrackForCleanup(oldParsed);

        LogRotationEvent? evt = null;
        service.LogFileRotated += (_, e) => evt = e;

        clock.Advance(TimeSpan.FromMinutes(20));
        bool rotated = await service.TryRolloverIfDateChangedAsync(CancellationToken.None);
        TrackForCleanup(service.CurrentRawLogPath);
        TrackForCleanup(service.CurrentParsedLogPath);

        Assert.True(rotated);
        Assert.NotNull(evt);
        Assert.Equal(new DateOnly(2026, 12, 31), evt!.FromDate);
        Assert.Equal(new DateOnly(2027, 1, 1), evt.ToDate);
        Assert.Equal(oldRaw, evt.PreviousRawPath);
        Assert.Equal(oldParsed, evt.PreviousParsedPath);
        Assert.NotEqual(oldRaw, evt.CurrentRawPath);
        Assert.NotEqual(oldParsed, evt.CurrentParsedPath);

        await service.StopAsync();
    }

    private void TrackForCleanup(string? path)
    {
        if (string.IsNullOrEmpty(path)) return;
        if (!_filesToCleanUp.Contains(path)) _filesToCleanUp.Add(path);
    }

    public void Dispose()
    {
        foreach (string p in _filesToCleanUp)
        {
            try { if (File.Exists(p)) File.Delete(p); } catch { /* ignore */ }
        }
    }
}

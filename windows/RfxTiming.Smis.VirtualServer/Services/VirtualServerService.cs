using System.Diagnostics;
using System.Net;
using RfxTiming.Smis.Networking;
using RfxTiming.Smis.Replay;

namespace RfxTiming.Smis.VirtualServer.Services;

/// <summary>
/// MOLA_Timing-VirtualServer の中核サービス。
/// SMIS TCP サーバーを立て、組み込みサンプル または ロードした SEIKO ログを順次配信する。
/// </summary>
public sealed class VirtualServerService : IAsyncDisposable
{
    private readonly SmisTcpServer _server;
    private readonly TimeProvider _timeProvider;
    private CancellationTokenSource? _runCts;
    private Task? _runTask;
    private List<SeikoLogEntry>? _loadedEntries;

    public VirtualServerService(SmisTcpServerOptions options, TimeProvider? timeProvider = null)
    {
        ArgumentNullException.ThrowIfNull(options);
        _server = new SmisTcpServer(options);
        _server.ClientConnected += (_, ep) => ClientConnected?.Invoke(this, ep);
        _server.ClientDisconnected += (_, ep) => ClientDisconnected?.Invoke(this, ep);
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    public event EventHandler<EndPoint>? ClientConnected;
    public event EventHandler<EndPoint>? ClientDisconnected;
    public event EventHandler<string>? FrameSent;
    public event EventHandler<Exception>? ErrorOccurred;
    public event EventHandler? PlaybackCompleted;
    public event EventHandler<ReplayProgress>? ProgressUpdated;

    public int ClientCount => _server.ClientCount;
    public long TotalSent { get; private set; }
    public bool IsPlaying { get; private set; }

    /// <summary>ロード済の SEIKO ログエントリ数 (まだロードされていない場合は 0)。</summary>
    public int LoadedEntryCount => _loadedEntries?.Count ?? 0;

    /// <summary>サーバーを起動する (バインドのみ、まだ配信しない)。</summary>
    public void Start()
    {
        _server.Start();
    }

    /// <summary>SEIKO ログファイル (<c>seiko_YYYYMMDD.log</c>) を読み込んで再生キューにセット。</summary>
    public Task<int> LoadLogFileAsync(string filePath, CancellationToken cancellationToken = default)
    {
        return Task.Run(() =>
        {
            cancellationToken.ThrowIfCancellationRequested();
            _loadedEntries = SeikoLogReader.ReadAll(filePath);
            return _loadedEntries.Count;
        }, cancellationToken);
    }

    /// <summary>ロード済のログをクリアし、組み込みサンプル再生に戻す。</summary>
    public void ClearLoadedLog() => _loadedEntries = null;

    /// <summary>
    /// 組み込みサンプル (ログ未ロード時) または ロード済 SEIKO ログを再生する。
    /// </summary>
    /// <param name="speedMultiplier">再生倍速。0.5 / 1 / 2 / 5 等。<see cref="double.PositiveInfinity"/> で待機なし。</param>
    /// <param name="loop">最後まで再生したら最初から繰り返す。</param>
    public Task StartPlaybackAsync(double speedMultiplier, bool loop, CancellationToken cancellationToken = default)
    {
        if (_runTask is not null && !_runTask.IsCompleted)
        {
            return Task.CompletedTask;
        }

        if (speedMultiplier <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(speedMultiplier), "倍速は正の値を指定してください。");
        }

        _runCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        IsPlaying = true;
        _runTask = (_loadedEntries is { Count: > 0 } entries)
            ? RunSeikoReplayAsync(entries, speedMultiplier, loop, _runCts.Token)
            : RunBuiltinSampleAsync(speedMultiplier, loop, _runCts.Token);
        return Task.CompletedTask;
    }

    /// <summary>SEIKO ログを原タイミングで再生する。</summary>
    private async Task RunSeikoReplayAsync(
        IReadOnlyList<SeikoLogEntry> entries,
        double speedMultiplier,
        bool loop,
        CancellationToken cancellationToken)
    {
        try
        {
            do
            {
                cancellationToken.ThrowIfCancellationRequested();
                DateTime baseTs = entries[0].Timestamp;
                var stopwatch = Stopwatch.StartNew();

                for (int i = 0; i < entries.Count; i++)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    SeikoLogEntry entry = entries[i];

                    if (!double.IsPositiveInfinity(speedMultiplier))
                    {
                        TimeSpan offset = entry.Timestamp - baseTs;
                        long adjustedTicks = (long)(offset.Ticks / speedMultiplier);
                        TimeSpan target = TimeSpan.FromTicks(adjustedTicks);
                        TimeSpan wait = target - stopwatch.Elapsed;
                        if (wait > TimeSpan.Zero)
                        {
                            await Task.Delay(wait, _timeProvider, cancellationToken).ConfigureAwait(false);
                        }
                    }

                    await _server.BroadcastAsync(entry.Xml, cancellationToken).ConfigureAwait(false);
                    TotalSent++;
                    FrameSent?.Invoke(this, entry.Xml);
                    ProgressUpdated?.Invoke(this, new ReplayProgress(i + 1, entries.Count));
                }
            } while (loop && !cancellationToken.IsCancellationRequested);

            PlaybackCompleted?.Invoke(this, EventArgs.Empty);
        }
        catch (OperationCanceledException)
        {
            // 正常停止
        }
        catch (Exception ex)
        {
            ErrorOccurred?.Invoke(this, ex);
        }
        finally
        {
            IsPlaying = false;
        }
    }

    /// <summary>組み込みサンプル (固定間隔) を再生する。</summary>
    private async Task RunBuiltinSampleAsync(double speedMultiplier, bool loop, CancellationToken cancellationToken)
    {
        TimeSpan baseInterval = TimeSpan.FromSeconds(1);
        TimeSpan interval = double.IsPositiveInfinity(speedMultiplier)
            ? TimeSpan.Zero
            : TimeSpan.FromTicks((long)(baseInterval.Ticks / speedMultiplier));

        try
        {
            do
            {
                cancellationToken.ThrowIfCancellationRequested();
                await SendAllAsync(SampleSmisData.Master, TimeSpan.Zero, cancellationToken).ConfigureAwait(false);
                await SendAllAsync(SampleSmisData.MeasuringPoints, TimeSpan.FromMilliseconds(50), cancellationToken).ConfigureAwait(false);
                await SendAllAsync(SampleSmisData.SessionStart, TimeSpan.FromMilliseconds(200), cancellationToken).ConfigureAwait(false);

                int total = SampleSmisData.RunningSampleCount;
                int sent = 0;
                foreach (string xml in SampleSmisData.EnumerateRunningSamples())
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    await _server.BroadcastAsync(xml, cancellationToken).ConfigureAwait(false);
                    TotalSent++;
                    sent++;
                    FrameSent?.Invoke(this, xml);
                    ProgressUpdated?.Invoke(this, new ReplayProgress(sent, total));
                    if (interval > TimeSpan.Zero)
                    {
                        await Task.Delay(interval, _timeProvider, cancellationToken).ConfigureAwait(false);
                    }
                }
            } while (loop && !cancellationToken.IsCancellationRequested);

            PlaybackCompleted?.Invoke(this, EventArgs.Empty);
        }
        catch (OperationCanceledException)
        {
            // 正常停止
        }
        catch (Exception ex)
        {
            ErrorOccurred?.Invoke(this, ex);
        }
        finally
        {
            IsPlaying = false;
        }
    }

    private async Task SendAllAsync(IEnumerable<string> xmls, TimeSpan interval, CancellationToken cancellationToken)
    {
        foreach (string xml in xmls)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await _server.BroadcastAsync(xml, cancellationToken).ConfigureAwait(false);
            TotalSent++;
            FrameSent?.Invoke(this, xml);
            if (interval > TimeSpan.Zero)
            {
                await Task.Delay(interval, _timeProvider, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    /// <summary>配信を停止 (サーバーは継続)。</summary>
    public async Task StopPlaybackAsync()
    {
        if (_runCts is null) return;
        await _runCts.CancelAsync().ConfigureAwait(false);
        if (_runTask is not null)
        {
            try { await _runTask.ConfigureAwait(false); }
            catch { /* ignore */ }
        }
        _runCts.Dispose();
        _runCts = null;
        _runTask = null;
        IsPlaying = false;
    }

    public async ValueTask DisposeAsync()
    {
        await StopPlaybackAsync().ConfigureAwait(false);
        await _server.DisposeAsync().ConfigureAwait(false);
    }
}

/// <summary>再生進捗。</summary>
public sealed record ReplayProgress(int CurrentIndex, int TotalCount);

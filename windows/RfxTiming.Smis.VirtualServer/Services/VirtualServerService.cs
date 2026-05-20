using System.Net;
using RfxTiming.Smis.Networking;
using RfxTiming.Smis.Replay;

namespace RfxTiming.Smis.VirtualServer.Services;

/// <summary>
/// MOLA_Timing-VirtualServer の中核サービス。
/// SMIS TCP サーバーを立て、組み込みサンプルを順次配信する。
/// </summary>
public sealed class VirtualServerService : IAsyncDisposable
{
    private readonly SmisTcpServer _server;
    private readonly TimeProvider _timeProvider;
    private CancellationTokenSource? _runCts;
    private Task? _runTask;

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

    public int ClientCount => _server.ClientCount;
    public long TotalSent { get; private set; }
    public bool IsPlaying { get; private set; }

    /// <summary>サーバーを起動する (バインドのみ、まだ配信しない)。</summary>
    public void Start()
    {
        _server.Start();
    }

    /// <summary>
    /// 組み込みサンプルを順次送信開始する。
    /// マスター/計測ポイント/Select+Start を即時送信したのち、Running サンプルを 1 秒間隔で送る。
    /// </summary>
    public Task StartPlaybackAsync(TimeSpan runningInterval, CancellationToken cancellationToken = default)
    {
        if (_runTask is not null && !_runTask.IsCompleted)
        {
            return Task.CompletedTask;
        }

        _runCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        IsPlaying = true;
        _runTask = PlaybackLoopAsync(runningInterval, _runCts.Token);
        return Task.CompletedTask;
    }

    private async Task PlaybackLoopAsync(TimeSpan runningInterval, CancellationToken cancellationToken)
    {
        try
        {
            // 1. マスターデータ (即時)
            await SendAllAsync(SampleSmisData.Master, TimeSpan.Zero, cancellationToken).ConfigureAwait(false);

            // 2. 計測ポイント (短間隔)
            await SendAllAsync(SampleSmisData.MeasuringPoints, TimeSpan.FromMilliseconds(50), cancellationToken).ConfigureAwait(false);

            // 3. Select + Start
            await SendAllAsync(SampleSmisData.SessionStart, TimeSpan.FromMilliseconds(200), cancellationToken).ConfigureAwait(false);

            // 4. 走行中ループ (1 秒間隔)
            foreach (string xml in SampleSmisData.EnumerateRunningSamples())
            {
                cancellationToken.ThrowIfCancellationRequested();
                await _server.BroadcastAsync(xml, cancellationToken).ConfigureAwait(false);
                TotalSent++;
                FrameSent?.Invoke(this, xml);
                await Task.Delay(runningInterval, _timeProvider, cancellationToken).ConfigureAwait(false);
            }

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

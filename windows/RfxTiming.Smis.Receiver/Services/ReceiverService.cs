using System.Diagnostics;
using RfxTiming.Smis.Logging;
using RfxTiming.Smis.Messages;
using RfxTiming.Smis.Networking;
using RfxTiming.Smis.Protocol;
using RfxTiming.Smis.Settings;
using RfxTiming.Smis.Xml;

namespace RfxTiming.Smis.Receiver.Services;

/// <summary>
/// MOLA_Timing-Receiver の中核サービス。
/// SMIS TCP クライアント、ログ Writer、メッセージカウンタを束ねる。
/// <para>
/// サーキット運用機向けに、3 つのパイプラインステージ
/// (受信 → パース → ログ書込) ごとの状態を <see cref="StageStatus"/> として公開する。
/// </para>
/// </summary>
public sealed class ReceiverService : IAsyncDisposable
{
    private readonly SmisTcpClient _client;
    private readonly LoggingSettings _loggingSettings;
    private readonly Stopwatch _rateWindow = Stopwatch.StartNew();
    private long _lastRateSnapshot;
    private CancellationTokenSource? _runCts;
    private Task? _runTask;
    private RawSmisLogWriter? _rawWriter;
    private JsonlSmisLogWriter? _parsedWriter;

    public ReceiverService(SmisTcpClientOptions options, LoggingSettings? loggingSettings = null)
    {
        ArgumentNullException.ThrowIfNull(options);
        _client = new SmisTcpClient(options);
        _client.StateChanged += OnTransportStateChanged;
        _client.ErrorOccurred += (_, ex) => ErrorOccurred?.Invoke(this, ex);
        _loggingSettings = loggingSettings ?? new LoggingSettings();
    }

    // ===== Events =====
    public event EventHandler<SmisTcpClient.ConnectionState>? StateChanged;
    public event EventHandler<Exception>? ErrorOccurred;
    public event EventHandler<SmisMessage>? MessageReceived;
    public event EventHandler<StageHealth>? StageHealthChanged;

    // ===== Properties (Stage Health) =====
    /// <summary>受信ステージ (TCP) の状態。</summary>
    public StageStatus ReceiveStatus { get; private set; } = StageStatus.Idle;

    /// <summary>パースステージの状態。</summary>
    public StageStatus ParseStatus { get; private set; } = StageStatus.Idle;

    /// <summary>ログ書込ステージの状態。</summary>
    public StageStatus LogStatus { get; private set; } = StageStatus.Idle;

    public long TotalMessages { get; private set; }
    public long ParseErrors { get; private set; }
    public long LogWriteErrors { get; private set; }

    /// <summary>直近 1 秒の受信レート (msg/sec)。</summary>
    public double MessagesPerSecond { get; private set; }

    /// <summary>最後にメッセージを受信した時刻 (ローカル)。</summary>
    public DateTime? LastReceivedAt { get; private set; }

    public string? CurrentRawLogPath => _rawWriter?.FilePath;
    public string? CurrentParsedLogPath => _parsedWriter?.FilePath;

    /// <summary>現時点のログファイルサイズ合計 (バイト)。</summary>
    public long CurrentLogBytes
    {
        get
        {
            long total = 0;
            try
            {
                if (CurrentRawLogPath is not null && File.Exists(CurrentRawLogPath))
                    total += new FileInfo(CurrentRawLogPath).Length;
                if (CurrentParsedLogPath is not null && File.Exists(CurrentParsedLogPath))
                    total += new FileInfo(CurrentParsedLogPath).Length;
            }
            catch { /* IO 競合は無視 */ }
            return total;
        }
    }

    /// <summary>接続を開始する。すでに開始済みなら何もしない。</summary>
    public Task StartAsync()
    {
        if (_runTask is not null && !_runTask.IsCompleted)
        {
            return Task.CompletedTask;
        }

        LogPaths.EnsureDirectoriesExist();
        DateOnly today = DateOnly.FromDateTime(DateTime.Now);

        try
        {
            if (_loggingSettings.EnableRawLog)
            {
                _rawWriter = new RawSmisLogWriter(LogPaths.RawLogFileFor(today));
            }
            if (_loggingSettings.EnableParsedLog)
            {
                _parsedWriter = new JsonlSmisLogWriter(LogPaths.ParsedLogFileFor(today));
            }
            UpdateStage(ref _logStatusBacking, _rawWriter is null && _parsedWriter is null
                ? StageStatus.Disabled
                : StageStatus.Idle, nameof(LogStatus));
        }
        catch (Exception ex)
        {
            UpdateStage(ref _logStatusBacking, StageStatus.Error, nameof(LogStatus));
            ErrorOccurred?.Invoke(this, ex);
        }

        _runCts = new CancellationTokenSource();
        _runTask = RunAsync(_runCts.Token);
        return Task.CompletedTask;
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (SmisFrame frame in _client.ReceiveFramesAsync(cancellationToken)
                .ConfigureAwait(false))
            {
                MarkReceived();

                // 1. 生 XML を即座に追記 (損失リスクを最小化)
                if (_rawWriter is not null)
                {
                    try
                    {
                        await _rawWriter.WriteFrameAsync(frame, cancellationToken).ConfigureAwait(false);
                        UpdateStage(ref _logStatusBacking, StageStatus.Active, nameof(LogStatus));
                    }
                    catch (Exception ex)
                    {
                        LogWriteErrors++;
                        UpdateStage(ref _logStatusBacking, StageStatus.Error, nameof(LogStatus));
                        ErrorOccurred?.Invoke(this, ex);
                    }
                }

                // 2. パース試行 (失敗してもログには残せている)
                SmisMessage? message = null;
                try
                {
                    message = SmisXmlParser.Parse(frame.Xml);
                    UpdateStage(ref _parseStatusBacking, StageStatus.Active, nameof(ParseStatus));
                }
                catch (SmisXmlParseException)
                {
                    ParseErrors++;
                    UpdateStage(ref _parseStatusBacking, StageStatus.Warning, nameof(ParseStatus));
                }

                // 3. 解析済 JSONL 書込
                if (message is not null && _parsedWriter is not null)
                {
                    try
                    {
                        await _parsedWriter.WriteMessageAsync(frame, message, cancellationToken).ConfigureAwait(false);
                    }
                    catch (Exception ex)
                    {
                        LogWriteErrors++;
                        UpdateStage(ref _logStatusBacking, StageStatus.Error, nameof(LogStatus));
                        ErrorOccurred?.Invoke(this, ex);
                    }
                }

                TotalMessages++;

                if (message is not null)
                {
                    MessageReceived?.Invoke(this, message);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // 正常停止
        }
        catch (Exception ex)
        {
            UpdateStage(ref _receiveStatusBacking, StageStatus.Error, nameof(ReceiveStatus));
            ErrorOccurred?.Invoke(this, ex);
        }
    }

    private void MarkReceived()
    {
        LastReceivedAt = DateTime.Now;

        if (_rateWindow.Elapsed >= TimeSpan.FromSeconds(1))
        {
            long delta = TotalMessages - _lastRateSnapshot + 1;
            MessagesPerSecond = delta / _rateWindow.Elapsed.TotalSeconds;
            _lastRateSnapshot = TotalMessages + 1;
            _rateWindow.Restart();
        }

        UpdateStage(ref _receiveStatusBacking, StageStatus.Active, nameof(ReceiveStatus));
    }

    /// <summary>接続を切断する。</summary>
    public async Task StopAsync()
    {
        if (_runCts is null)
        {
            return;
        }

        await _runCts.CancelAsync().ConfigureAwait(false);

        if (_runTask is not null)
        {
            try { await _runTask.ConfigureAwait(false); }
            catch { /* ignore */ }
        }

        _runCts.Dispose();
        _runCts = null;
        _runTask = null;

        if (_rawWriter is not null)
        {
            await _rawWriter.DisposeAsync().ConfigureAwait(false);
            _rawWriter = null;
        }
        if (_parsedWriter is not null)
        {
            await _parsedWriter.DisposeAsync().ConfigureAwait(false);
            _parsedWriter = null;
        }

        UpdateStage(ref _receiveStatusBacking, StageStatus.Idle, nameof(ReceiveStatus));
        UpdateStage(ref _parseStatusBacking, StageStatus.Idle, nameof(ParseStatus));
        UpdateStage(ref _logStatusBacking, StageStatus.Idle, nameof(LogStatus));
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync().ConfigureAwait(false);
    }

    private void OnTransportStateChanged(object? sender, SmisTcpClient.ConnectionState state)
    {
        StageStatus next = state switch
        {
            SmisTcpClient.ConnectionState.Connected => StageStatus.Active,
            SmisTcpClient.ConnectionState.Connecting => StageStatus.Warming,
            SmisTcpClient.ConnectionState.Reconnecting => StageStatus.Warning,
            SmisTcpClient.ConnectionState.Disconnected => StageStatus.Idle,
            _ => StageStatus.Idle,
        };
        UpdateStage(ref _receiveStatusBacking, next, nameof(ReceiveStatus));
        StateChanged?.Invoke(this, state);
    }

    // ===== Stage status backing fields =====
    private StageStatus _receiveStatusBacking;
    private StageStatus _parseStatusBacking;
    private StageStatus _logStatusBacking;

    private void UpdateStage(ref StageStatus backing, StageStatus next, string propertyName)
    {
        if (backing == next) return;
        backing = next;
        switch (propertyName)
        {
            case nameof(ReceiveStatus): ReceiveStatus = next; break;
            case nameof(ParseStatus): ParseStatus = next; break;
            case nameof(LogStatus): LogStatus = next; break;
        }
        StageHealthChanged?.Invoke(this, new StageHealth(ReceiveStatus, ParseStatus, LogStatus));
    }
}

/// <summary>3 ステージのライト表示用ステータス。</summary>
public enum StageStatus
{
    /// <summary>未稼働 (灰)。</summary>
    Idle,
    /// <summary>準備中 / 接続試行中 (黄)。</summary>
    Warming,
    /// <summary>正常稼働中 (緑)。</summary>
    Active,
    /// <summary>軽微な異常 (橙)。例: パース失敗が発生したが継続中。</summary>
    Warning,
    /// <summary>致命的な異常 (赤)。</summary>
    Error,
    /// <summary>無効化中。</summary>
    Disabled,
}

/// <summary>3 ステージの状態スナップショット。</summary>
public sealed record StageHealth(StageStatus Receive, StageStatus Parse, StageStatus Log);

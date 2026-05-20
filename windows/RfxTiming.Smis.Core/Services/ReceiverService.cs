using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using RfxTiming.Smis.Logging;
using RfxTiming.Smis.Messages;
using RfxTiming.Smis.Networking;
using RfxTiming.Smis.Protocol;
using RfxTiming.Smis.Settings;
using RfxTiming.Smis.Xml;

namespace RfxTiming.Smis.Services;

/// <summary>
/// MOLA_Timing-Receiver の中核サービス。
/// SMIS TCP クライアント、ログ Writer、メッセージカウンタを束ねる。
/// <para>
/// サーキット運用機向けに、3 つのパイプラインステージ
/// (受信 → パース → ログ書込) ごとの状態を <see cref="StageStatus"/> として公開する。
/// </para>
/// <para>
/// 日付が変わると自動的に新しい日付の <c>MOLA_INPUT_YYYYMMDD.log</c> ファイルへロールオーバーする
/// (1 メッセージ受信ごとにチェック + 60 秒 Timer によるアイドル時の保険)。
/// </para>
/// </summary>
public sealed class ReceiverService : IAsyncDisposable
{
    private readonly SmisTcpClient _client;
    private readonly LoggingSettings _loggingSettings;
    private readonly TimeProvider _timeProvider;
    private readonly Stopwatch _rateWindow = Stopwatch.StartNew();
    private readonly SemaphoreSlim _writerSwapLock = new(1, 1);
    private long _lastRateSnapshot;
    private CancellationTokenSource? _runCts;
    private Task? _runTask;
    private RawSmisLogWriter? _rawWriter;
    private JsonlSmisLogWriter? _parsedWriter;
    private DateOnly _currentLogDate;
    private ITimer? _rolloverTimer;

    public ReceiverService(
        SmisTcpClientOptions options,
        LoggingSettings? loggingSettings = null,
        TimeProvider? timeProvider = null)
    {
        ArgumentNullException.ThrowIfNull(options);
        _client = new SmisTcpClient(options);
        _client.StateChanged += OnTransportStateChanged;
        _client.ErrorOccurred += (_, ex) => ErrorOccurred?.Invoke(this, ex);
        _loggingSettings = loggingSettings ?? new LoggingSettings();
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    // ===== Events =====
    public event EventHandler<SmisTcpClient.ConnectionState>? StateChanged;
    public event EventHandler<Exception>? ErrorOccurred;
    public event EventHandler<SmisMessage>? MessageReceived;
    public event EventHandler<StageHealth>? StageHealthChanged;

    /// <summary>日付が変わって新しい日付のログファイルに切り替えた時に発火する。</summary>
    public event EventHandler<LogRotationEvent>? LogFileRotated;

    // ===== Properties (Stage Health) =====
    public StageStatus ReceiveStatus { get; private set; } = StageStatus.Idle;
    public StageStatus ParseStatus { get; private set; } = StageStatus.Idle;
    public StageStatus LogStatus { get; private set; } = StageStatus.Idle;

    public long TotalMessages { get; private set; }
    public long ParseErrors { get; private set; }
    public long LogWriteErrors { get; private set; }
    public long LogRotationCount { get; private set; }

    public double MessagesPerSecond { get; private set; }
    public DateTime? LastReceivedAt { get; private set; }

    public string? CurrentRawLogPath => _rawWriter?.FilePath;
    public string? CurrentParsedLogPath => _parsedWriter?.FilePath;

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
        _currentLogDate = DateOnly.FromDateTime(_timeProvider.GetLocalNow().DateTime);

        try
        {
            if (_loggingSettings.EnableRawLog)
            {
                _rawWriter = new RawSmisLogWriter(LogPaths.RawLogFileFor(_currentLogDate));
            }
            if (_loggingSettings.EnableParsedLog)
            {
                _parsedWriter = new JsonlSmisLogWriter(LogPaths.ParsedLogFileFor(_currentLogDate));
            }
            SetLogStatus(_rawWriter is null && _parsedWriter is null
                ? StageStatus.Disabled
                : StageStatus.Idle);
        }
        catch (Exception ex)
        {
            SetLogStatus(StageStatus.Error);
            ErrorOccurred?.Invoke(this, ex);
        }

        // メッセージが来ない時間帯 (深夜の小休止等) でも日付跨ぎを検出できるよう、
        // 60 秒ごとに独立した Timer でロールオーバーチェック。
        _rolloverTimer = _timeProvider.CreateTimer(
            OnRolloverTimerTick,
            state: null,
            dueTime: TimeSpan.FromSeconds(60),
            period: TimeSpan.FromSeconds(60));

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
                // 1. メッセージ毎に日付チェック (オーバーヘッドは比較のみで誤差レベル)
                await TryRolloverIfDateChangedAsync(cancellationToken).ConfigureAwait(false);

                MarkReceived();

                // 2. 生 XML を即座に追記 (損失リスクを最小化)
                if (_rawWriter is not null)
                {
                    try
                    {
                        await _rawWriter.WriteFrameAsync(frame, cancellationToken).ConfigureAwait(false);
                        SetLogStatus(StageStatus.Active);
                    }
                    catch (Exception ex)
                    {
                        LogWriteErrors++;
                        SetLogStatus(StageStatus.Error);
                        ErrorOccurred?.Invoke(this, ex);
                    }
                }

                // 3. パース試行 (失敗してもログには残せている)
                SmisMessage? message = null;
                try
                {
                    message = SmisXmlParser.Parse(frame.Xml);
                    SetParseStatus(StageStatus.Active);
                }
                catch (SmisXmlParseException)
                {
                    ParseErrors++;
                    SetParseStatus(StageStatus.Warning);
                }

                // 4. 解析済 JSONL 書込
                if (message is not null && _parsedWriter is not null)
                {
                    try
                    {
                        await _parsedWriter.WriteMessageAsync(frame, message, cancellationToken).ConfigureAwait(false);
                    }
                    catch (Exception ex)
                    {
                        LogWriteErrors++;
                        SetLogStatus(StageStatus.Error);
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
            SetReceiveStatus(StageStatus.Error);
            ErrorOccurred?.Invoke(this, ex);
        }
    }

    /// <summary>
    /// 現在の日付と前回のログファイル作成時の日付を比較し、変わっていれば
    /// Writer を Dispose して新しい日付のファイルに切り替える。
    /// <para>
    /// 通常はメッセージ受信ループと 60 秒 Timer から自動で呼ばれるが、
    /// 強制ロールオーバー (テストや手動切替) 用に public 公開している。
    /// </para>
    /// </summary>
    /// <returns>ロールオーバーが発生した場合は true。</returns>
    public async Task<bool> TryRolloverIfDateChangedAsync(CancellationToken cancellationToken = default)
    {
        DateOnly today = DateOnly.FromDateTime(_timeProvider.GetLocalNow().DateTime);
        if (today == _currentLogDate)
        {
            return false;
        }

        await _writerSwapLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            // 二重チェック (Timer と RunAsync の競合に備える)
            today = DateOnly.FromDateTime(_timeProvider.GetLocalNow().DateTime);
            if (today == _currentLogDate)
            {
                return false;
            }

            DateOnly previousDate = _currentLogDate;
            string? previousRawPath = _rawWriter?.FilePath;
            string? previousParsedPath = _parsedWriter?.FilePath;

            // 古い Writer をクローズ (flush 済みで安全に切替)
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

            _currentLogDate = today;

            // 新しい日付の Writer を作成
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
            }
            catch (Exception ex)
            {
                SetLogStatus(StageStatus.Error);
                ErrorOccurred?.Invoke(this, ex);
            }

            LogRotationCount++;
            LogFileRotated?.Invoke(this, new LogRotationEvent(
                FromDate: previousDate,
                ToDate: today,
                PreviousRawPath: previousRawPath,
                PreviousParsedPath: previousParsedPath,
                CurrentRawPath: _rawWriter?.FilePath,
                CurrentParsedPath: _parsedWriter?.FilePath));
            return true;
        }
        finally
        {
            _writerSwapLock.Release();
        }
    }

    private void MarkReceived()
    {
        LastReceivedAt = _timeProvider.GetLocalNow().DateTime;

        if (_rateWindow.Elapsed >= TimeSpan.FromSeconds(1))
        {
            long delta = TotalMessages - _lastRateSnapshot + 1;
            MessagesPerSecond = delta / _rateWindow.Elapsed.TotalSeconds;
            _lastRateSnapshot = TotalMessages + 1;
            _rateWindow.Restart();
        }

        SetReceiveStatus(StageStatus.Active);
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

        if (_rolloverTimer is not null)
        {
            await _rolloverTimer.DisposeAsync().ConfigureAwait(false);
            _rolloverTimer = null;
        }

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

        SetReceiveStatus(StageStatus.Idle);
        SetParseStatus(StageStatus.Idle);
        SetLogStatus(StageStatus.Idle);
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync().ConfigureAwait(false);
        _writerSwapLock.Dispose();
    }

    /// <summary>
    /// 60 秒 Timer から呼ばれる。async void だが try/catch で必ず捕捉する。
    /// </summary>
    private async void OnRolloverTimerTick(object? state)
    {
        try
        {
            await TryRolloverIfDateChangedAsync(CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            ErrorOccurred?.Invoke(this, ex);
        }
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
        SetReceiveStatus(next);
        StateChanged?.Invoke(this, state);
    }

    // ===== Stage status setters =====
    // 3 ステージごとに専用 setter を用意する。
    // 旧実装の「ref StageStatus backing + nameof(...) で振り分け」は
    // 一部 IDE で nameof のシンボル解決に失敗するケースがあったため、
    // 明示的に 3 メソッドに分けて安定させている。

    private void SetReceiveStatus(StageStatus next)
    {
        if (ReceiveStatus == next) return;
        ReceiveStatus = next;
        StageHealthChanged?.Invoke(this, new StageHealth(ReceiveStatus, ParseStatus, LogStatus));
    }

    private void SetParseStatus(StageStatus next)
    {
        if (ParseStatus == next) return;
        ParseStatus = next;
        StageHealthChanged?.Invoke(this, new StageHealth(ReceiveStatus, ParseStatus, LogStatus));
    }

    private void SetLogStatus(StageStatus next)
    {
        if (LogStatus == next) return;
        LogStatus = next;
        StageHealthChanged?.Invoke(this, new StageHealth(ReceiveStatus, ParseStatus, LogStatus));
    }
}

/// <summary>3 ステージのライト表示用ステータス。</summary>
public enum StageStatus
{
    Idle,
    Warming,
    Active,
    Warning,
    Error,
    Disabled,
}

/// <summary>3 ステージの状態スナップショット。</summary>
public sealed record StageHealth(StageStatus Receive, StageStatus Parse, StageStatus Log);

/// <summary>日付ロールオーバー発生時の情報。UI 表示やログ追跡に使う。</summary>
public sealed record LogRotationEvent(
    DateOnly FromDate,
    DateOnly ToDate,
    string? PreviousRawPath,
    string? PreviousParsedPath,
    string? CurrentRawPath,
    string? CurrentParsedPath);

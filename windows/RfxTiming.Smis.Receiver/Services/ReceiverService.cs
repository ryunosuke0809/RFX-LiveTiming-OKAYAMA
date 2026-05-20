using RfxTiming.Smis.Logging;
using RfxTiming.Smis.Messages;
using RfxTiming.Smis.Networking;
using RfxTiming.Smis.Protocol;
using RfxTiming.Smis.Xml;

namespace RfxTiming.Smis.Receiver.Services;

/// <summary>
/// MOLA_Timing-Receiver の中核サービス。
/// SMIS TCP クライアント、ログ Writer、メッセージカウンタを束ねる。
/// </summary>
public sealed class ReceiverService : IAsyncDisposable
{
    private readonly SmisTcpClient _client;
    private CancellationTokenSource? _runCts;
    private Task? _runTask;
    private RawSmisLogWriter? _rawWriter;
    private JsonlSmisLogWriter? _parsedWriter;

    public ReceiverService(SmisTcpClientOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        _client = new SmisTcpClient(options);
        _client.StateChanged += (_, state) => StateChanged?.Invoke(this, state);
        _client.ErrorOccurred += (_, ex) => ErrorOccurred?.Invoke(this, ex);
    }

    public event EventHandler<SmisTcpClient.ConnectionState>? StateChanged;
    public event EventHandler<Exception>? ErrorOccurred;
    public event EventHandler<SmisMessage>? MessageReceived;

    public long TotalMessages { get; private set; }
    public long ParseErrors { get; private set; }
    public string? CurrentRawLogPath => _rawWriter?.FilePath;

    /// <summary>接続を開始する。すでに開始済みなら何もしない。</summary>
    public Task StartAsync()
    {
        if (_runTask is not null && !_runTask.IsCompleted)
        {
            return Task.CompletedTask;
        }

        LogPaths.EnsureDirectoriesExist();
        DateOnly today = DateOnly.FromDateTime(DateTime.Now);
        _rawWriter = new RawSmisLogWriter(LogPaths.RawLogFileFor(today));
        _parsedWriter = new JsonlSmisLogWriter(LogPaths.ParsedLogFileFor(today));

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
                // 1. 生 XML を即座に追記 (最重要 - 損失リスクを最小化)
                if (_rawWriter is not null)
                {
                    await _rawWriter.WriteFrameAsync(frame, cancellationToken).ConfigureAwait(false);
                }

                // 2. パース試行 (失敗してもログには残せている)
                SmisMessage? message = null;
                try
                {
                    message = SmisXmlParser.Parse(frame.Xml);
                }
                catch (SmisXmlParseException)
                {
                    ParseErrors++;
                }

                if (message is not null && _parsedWriter is not null)
                {
                    await _parsedWriter.WriteMessageAsync(frame, message, cancellationToken)
                        .ConfigureAwait(false);
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
            ErrorOccurred?.Invoke(this, ex);
        }
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
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync().ConfigureAwait(false);
    }
}

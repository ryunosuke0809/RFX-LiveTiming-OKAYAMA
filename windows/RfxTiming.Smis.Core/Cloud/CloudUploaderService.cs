using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using RfxTiming.Smis.Messages;
using RfxTiming.Smis.Settings;

namespace RfxTiming.Smis.Cloud;

/// <summary>
/// 解析済 SMIS メッセージをクラウドサーバーへ転送する WebSocket クライアント。
///
/// <para>
/// 接続先は <see cref="CloudSettings.IngestUrl"/> (例 <c>wss://livetiming.example.com/ingest</c>)。
/// 認証は <c>Authorization: Bearer {Token}</c> ヘッダーで行う。
/// </para>
///
/// <para>
/// 通信エラー / クラウド側障害があっても Receiver 本体の動作を止めないため、
/// <see cref="EnqueueAsync"/> は常に成功する (内部チャネルが満杯なら古いものを破棄)。
/// 実送信は内部のバックグラウンドタスクが行う。
/// </para>
/// </summary>
public sealed class CloudUploaderService : IAsyncDisposable
{
    private static readonly JsonSerializerOptions PayloadJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        Converters = { new JsonStringEnumConverter() },
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly CloudSettings _settings;
    private readonly Channel<IngestEnvelope> _queue;
    private readonly TimeProvider _timeProvider;

    private CancellationTokenSource? _runCts;
    private Task? _runTask;

    private long _seq;
    private long _sentCount;
    private long _failedCount;
    private long _droppedCount;

    public CloudUploaderService(CloudSettings settings, TimeProvider? timeProvider = null)
    {
        ArgumentNullException.ThrowIfNull(settings);
        _settings = settings;
        _timeProvider = timeProvider ?? TimeProvider.System;

        int capacity = Math.Max(100, settings.OfflineQueueLimit);
        _queue = Channel.CreateBounded<IngestEnvelope>(
            new BoundedChannelOptions(capacity)
            {
                FullMode = BoundedChannelFullMode.DropOldest,
                SingleReader = true,
                SingleWriter = false,
            });
    }

    // ===== Events =====

    /// <summary>クラウドへの接続状態が変わった時に発火。</summary>
    public event EventHandler<CloudConnectionState>? StateChanged;

    /// <summary>転送中・転送関連で発生したエラー。</summary>
    public event EventHandler<Exception>? ErrorOccurred;

    // ===== Read-only metrics =====

    public CloudConnectionState State { get; private set; } = CloudConnectionState.Disabled;
    public long QueueDepth => _queue.Reader.Count;
    public long SentCount => Interlocked.Read(ref _sentCount);
    public long FailedCount => Interlocked.Read(ref _failedCount);
    public long DroppedCount => Interlocked.Read(ref _droppedCount);

    /// <summary>バックグラウンドの送信ループを開始する。</summary>
    public Task StartAsync()
    {
        if (!_settings.Enabled)
        {
            SetState(CloudConnectionState.Disabled);
            return Task.CompletedTask;
        }
        if (_runTask is not null && !_runTask.IsCompleted) return Task.CompletedTask;

        _runCts = new CancellationTokenSource();
        _runTask = RunLoopAsync(_runCts.Token);
        return Task.CompletedTask;
    }

    /// <summary>送信ループを停止する。</summary>
    public async Task StopAsync()
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

        SetState(CloudConnectionState.Disabled);
    }

    /// <summary>
    /// メッセージ 1 件を送信キューに積む。即座に返す (送信は別タスク)。
    /// 接続できていない / Disabled でも捨てずに溜める (上限超過で古いものから破棄)。
    /// </summary>
    public void Enqueue(SmisMessage message)
    {
        ArgumentNullException.ThrowIfNull(message);
        if (!_settings.Enabled) return;

        IngestEnvelope envelope = BuildEnvelope(message);
        if (!_queue.Writer.TryWrite(envelope))
        {
            // BoundedChannel + DropOldest なので普通はここに来ないが、念のため。
            Interlocked.Increment(ref _droppedCount);
        }
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync().ConfigureAwait(false);
    }

    // ============================================================
    // private
    // ============================================================

    private IngestEnvelope BuildEnvelope(SmisMessage message)
    {
        long seq = Interlocked.Increment(ref _seq);
        DateTimeOffset now = _timeProvider.GetLocalNow();
        return new IngestEnvelope(
            seq,
            _settings.CircuitId,
            now.ToString("yyyy-MM-ddTHH:mm:ss.fffzzz"),
            ResolveKind(message),
            JsonSerializer.SerializeToElement<object>(message, PayloadJsonOptions));
    }

    private static string ResolveKind(SmisMessage msg) => msg switch
    {
        Competition => "Competition",
        Category => "Category",
        Round => "Round",
        Group => "Group",
        Session => "Session",
        CarClass => "Class",
        Team => "Team",
        Transponder => "Transponder",
        Loop => "Loop",
        Select => "Select",
        Start => "Start",
        Passing => "Passing",
        Standings => "Standings",
        RaceControlMessage => "Message",
        _ => "Unknown",
    };

    private async Task RunLoopAsync(CancellationToken cancellationToken)
    {
        int delayMs = _settings.InitialReconnectDelayMs;

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                SetState(CloudConnectionState.Connecting);

                using ClientWebSocket ws = new();
                if (!string.IsNullOrEmpty(_settings.Token))
                {
                    ws.Options.SetRequestHeader("Authorization", $"Bearer {_settings.Token}");
                }
                ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);

                Uri uri = new(_settings.IngestUrl);
                await ws.ConnectAsync(uri, cancellationToken).ConfigureAwait(false);

                SetState(CloudConnectionState.Connected);
                delayMs = _settings.InitialReconnectDelayMs; // バックオフをリセット

                await PumpAsync(ws, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, ex);
                SetState(CloudConnectionState.Reconnecting);
            }

            try
            {
                await Task.Delay(TimeSpan.FromMilliseconds(delayMs), cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            delayMs = Math.Min(delayMs * 2, _settings.MaxReconnectDelayMs);
        }

        SetState(CloudConnectionState.Disabled);
    }

    private async Task PumpAsync(ClientWebSocket ws, CancellationToken cancellationToken)
    {
        // ACK 受信を別タスクで回す。
        Task readerTask = Task.Run(() => ReadServerFramesAsync(ws, cancellationToken), cancellationToken);

        try
        {
            await foreach (IngestEnvelope envelope in
                _queue.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (ws.State != WebSocketState.Open)
                {
                    // 受信ループ側で再接続が必要と判定したら抜ける。
                    // この envelope は次の接続で再送するため、キューに戻す。
                    _ = _queue.Writer.TryWrite(envelope);
                    break;
                }

                byte[] bytes = SerializeEnvelope(envelope);
                try
                {
                    await ws.SendAsync(
                        bytes,
                        WebSocketMessageType.Text,
                        endOfMessage: true,
                        cancellationToken).ConfigureAwait(false);
                    Interlocked.Increment(ref _sentCount);
                }
                catch (Exception)
                {
                    Interlocked.Increment(ref _failedCount);
                    _ = _queue.Writer.TryWrite(envelope);
                    throw;
                }
            }
        }
        finally
        {
            try
            {
                if (ws.State == WebSocketState.Open)
                {
                    await ws.CloseAsync(
                        WebSocketCloseStatus.NormalClosure,
                        "client_stop",
                        CancellationToken.None).ConfigureAwait(false);
                }
            }
            catch { /* ignore */ }

            try { await readerTask.ConfigureAwait(false); }
            catch { /* ignore */ }
        }
    }

    private static byte[] SerializeEnvelope(IngestEnvelope envelope)
    {
        // payload は既に JsonElement。System.Text.Json で envelope ごとシリアライズ。
        string json = JsonSerializer.Serialize(envelope, PayloadJsonOptions);
        return Encoding.UTF8.GetBytes(json);
    }

    private static async Task ReadServerFramesAsync(ClientWebSocket ws, CancellationToken cancellationToken)
    {
        byte[] buffer = new byte[8 * 1024];
        try
        {
            while (!cancellationToken.IsCancellationRequested && ws.State == WebSocketState.Open)
            {
                WebSocketReceiveResult res = await ws.ReceiveAsync(
                    new ArraySegment<byte>(buffer), cancellationToken).ConfigureAwait(false);
                if (res.MessageType == WebSocketMessageType.Close)
                {
                    return;
                }
                // 現状サーバー応答は ack/nack/welcome のみ。読み飛ばす。
            }
        }
        catch
        {
            // 接続切れは正常系として無視。
        }
    }

    private void SetState(CloudConnectionState next)
    {
        if (State == next) return;
        State = next;
        StateChanged?.Invoke(this, next);
    }
}

/// <summary>クラウド配信ソケットの接続状態。</summary>
public enum CloudConnectionState
{
    /// <summary>機能 OFF (設定で無効)。</summary>
    Disabled,
    /// <summary>接続試行中。</summary>
    Connecting,
    /// <summary>接続済 / 送信中。</summary>
    Connected,
    /// <summary>切断され、再接続待機中。</summary>
    Reconnecting,
}

/// <summary>
/// クラウド ingest プロトコルの 1 メッセージ (envelope)。
/// JSON 形は <c>server/src/types/ingest.ts</c> の <c>IngestEnvelope</c> と一致させる。
/// </summary>
public sealed record IngestEnvelope(
    [property: JsonPropertyName("seq")] long Seq,
    [property: JsonPropertyName("circuitId")] string CircuitId,
    [property: JsonPropertyName("ts")] string Ts,
    [property: JsonPropertyName("kind")] string Kind,
    [property: JsonPropertyName("payload")] JsonElement Payload);

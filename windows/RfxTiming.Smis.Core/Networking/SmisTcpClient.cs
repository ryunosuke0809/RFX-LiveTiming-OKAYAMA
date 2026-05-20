using System.Net.Sockets;
using System.Runtime.CompilerServices;
using RfxTiming.Smis.Protocol;

namespace RfxTiming.Smis.Networking;

/// <summary>SMIS サーバー接続オプション。</summary>
public sealed record SmisTcpClientOptions(
    string Host,
    int Port,
    bool AutoReconnect = true,
    int InitialReconnectDelayMs = 1000,
    int MaxReconnectDelayMs = 30_000,
    int MaxFrameBytes = SmisFrameReader.DefaultMaxFrameBytes);

/// <summary>SMIS TCP クライアント (自動再接続・指数バックオフ)。</summary>
/// <remarks>
/// <para>
/// 仕様書 1.1: 「TCP クライアントにて指定された IP アドレス、ポート番号にて配信サーバーへの接続を行う」。
/// データは配信サーバーから一方向のため、本クライアントは送信せず受信のみを行う。
/// </para>
/// <para>
/// 接続断検知時は <see cref="SmisTcpClientOptions.AutoReconnect"/> が true なら
/// 指数バックオフで再接続を試みる。再接続中もイベントを通じて状態を通知する。
/// </para>
/// </remarks>
public sealed class SmisTcpClient
{
    /// <summary>接続状態。</summary>
    public enum ConnectionState
    {
        Disconnected,
        Connecting,
        Connected,
        Reconnecting,
    }

    private readonly SmisTcpClientOptions _options;
    private readonly TimeProvider _timeProvider;

    public SmisTcpClient(SmisTcpClientOptions options, TimeProvider? timeProvider = null)
    {
        ArgumentNullException.ThrowIfNull(options);
        _options = options;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    /// <summary>状態遷移通知 (UI 更新用)。</summary>
    public event EventHandler<ConnectionState>? StateChanged;

    /// <summary>エラー発生通知 (再接続待ち中の例外、致命的エラー等)。</summary>
    public event EventHandler<Exception>? ErrorOccurred;

    /// <summary>
    /// 接続してフレームを読み続ける。キャンセルされるまで継続。
    /// <para>
    /// AutoReconnect=true の場合、内部で例外をハンドリングして再接続を試みる。
    /// AutoReconnect=false の場合は最初の切断で列挙終了。
    /// </para>
    /// </summary>
    public async IAsyncEnumerable<SmisFrame> ReceiveFramesAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        int currentDelay = _options.InitialReconnectDelayMs;

        while (!cancellationToken.IsCancellationRequested)
        {
            TcpClient? tcp = null;
            NetworkStream? stream = null;
            bool connectedFiredThisAttempt = false;

            try
            {
                RaiseState(ConnectionState.Connecting);
                tcp = new TcpClient { NoDelay = true };
                await tcp.ConnectAsync(_options.Host, _options.Port, cancellationToken)
                    .ConfigureAwait(false);
                stream = tcp.GetStream();
                RaiseState(ConnectionState.Connected);
                connectedFiredThisAttempt = true;
                currentDelay = _options.InitialReconnectDelayMs; // 成功したらバックオフをリセット
            }
            catch (OperationCanceledException)
            {
                tcp?.Dispose();
                yield break;
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, ex);
                tcp?.Dispose();
                if (!_options.AutoReconnect)
                {
                    RaiseState(ConnectionState.Disconnected);
                    yield break;
                }
                await BackoffAsync(currentDelay, cancellationToken).ConfigureAwait(false);
                currentDelay = NextDelay(currentDelay);
                RaiseState(ConnectionState.Reconnecting);
                continue;
            }

            await foreach (SmisFrame frame in EnumerateSafelyAsync(stream!, cancellationToken)
                .ConfigureAwait(false))
            {
                yield return frame;
            }

            tcp?.Dispose();

            if (!connectedFiredThisAttempt || !_options.AutoReconnect || cancellationToken.IsCancellationRequested)
            {
                RaiseState(ConnectionState.Disconnected);
                yield break;
            }

            // 切断検知 → 再接続
            await BackoffAsync(currentDelay, cancellationToken).ConfigureAwait(false);
            currentDelay = NextDelay(currentDelay);
            RaiseState(ConnectionState.Reconnecting);
        }

        RaiseState(ConnectionState.Disconnected);
    }

    private async IAsyncEnumerable<SmisFrame> EnumerateSafelyAsync(
        Stream stream,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        IAsyncEnumerator<SmisFrame> enumerator = SmisFrameReader
            .ReadFramesAsync(stream, _options.MaxFrameBytes, _timeProvider, cancellationToken)
            .GetAsyncEnumerator(cancellationToken);

        try
        {
            while (true)
            {
                SmisFrame? frame;
                try
                {
                    if (!await enumerator.MoveNextAsync().ConfigureAwait(false))
                    {
                        yield break;
                    }
                    frame = enumerator.Current;
                }
                catch (OperationCanceledException)
                {
                    yield break;
                }
                catch (Exception ex)
                {
                    ErrorOccurred?.Invoke(this, ex);
                    yield break;
                }

                yield return frame;
            }
        }
        finally
        {
            await enumerator.DisposeAsync().ConfigureAwait(false);
        }
    }

    private async Task BackoffAsync(int delayMs, CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(delayMs, _timeProvider, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // 上位で処理
        }
    }

    private int NextDelay(int currentMs) => Math.Min(currentMs * 2, _options.MaxReconnectDelayMs);

    private void RaiseState(ConnectionState state) => StateChanged?.Invoke(this, state);
}

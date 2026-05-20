using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;

namespace RfxTiming.Smis.Networking;

/// <summary>SMIS 互換 TCP サーバーオプション。</summary>
/// <param name="ListenAddress">バインドするローカル IP。<c>0.0.0.0</c> で全 NIC。</param>
/// <param name="Port">待ち受けポート。</param>
/// <param name="AllowMultipleClients">true: 複数クライアント同時接続を許可 (本来 SMIS は単方向だが開発便宜上)。</param>
public sealed record SmisTcpServerOptions(
    IPAddress ListenAddress,
    int Port,
    bool AllowMultipleClients = true);

/// <summary>
/// SMIS 互換の TCP 配信サーバー。MOLA_Timing-VirtualServer の中核として使う。
/// <para>
/// 配信は一方向 (サーバー → クライアント)、フレームは UTF-8 XML + NULL 終端。
/// </para>
/// </summary>
public sealed class SmisTcpServer : IAsyncDisposable
{
    private readonly SmisTcpServerOptions _options;
    private readonly TcpListener _listener;
    private readonly ConcurrentDictionary<Guid, TcpClient> _clients = new();
    private readonly CancellationTokenSource _stoppingCts = new();
    private Task? _acceptLoopTask;

    public SmisTcpServer(SmisTcpServerOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        _options = options;
        _listener = new TcpListener(options.ListenAddress, options.Port);
    }

    /// <summary>新規クライアントが接続したとき。</summary>
    public event EventHandler<EndPoint>? ClientConnected;

    /// <summary>クライアントが切断されたとき。</summary>
    public event EventHandler<EndPoint>? ClientDisconnected;

    /// <summary>現在接続中のクライアント数。</summary>
    public int ClientCount => _clients.Count;

    /// <summary>サーバーを開始する。</summary>
    public void Start()
    {
        _listener.Start();
        _acceptLoopTask = AcceptLoopAsync(_stoppingCts.Token);
    }

    private async Task AcceptLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            TcpClient client;
            try
            {
                client = await _listener.AcceptTcpClientAsync(cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (ObjectDisposedException)
            {
                return;
            }

            client.NoDelay = true;

            if (!_options.AllowMultipleClients && !_clients.IsEmpty)
            {
                client.Dispose();
                continue;
            }

            Guid id = Guid.NewGuid();
            _clients.TryAdd(id, client);
            EndPoint? remote = client.Client.RemoteEndPoint;
            if (remote is not null)
            {
                ClientConnected?.Invoke(this, remote);
            }

            // 切断検知はクライアントごとのバックグラウンドタスクで監視
            _ = MonitorClientAsync(id, client, remote, cancellationToken);
        }
    }

    private async Task MonitorClientAsync(
        Guid id,
        TcpClient client,
        EndPoint? remote,
        CancellationToken cancellationToken)
    {
        try
        {
            var buffer = new byte[64];
            while (!cancellationToken.IsCancellationRequested)
            {
                int read = await client.GetStream()
                    .ReadAsync(buffer.AsMemory(), cancellationToken)
                    .ConfigureAwait(false);
                if (read == 0)
                {
                    break;
                }
                // SMIS は単方向のため受信内容は無視。EOF 検出だけが目的。
            }
        }
        catch
        {
            // 無視 (切断・タイムアウト・キャンセル)
        }
        finally
        {
            _clients.TryRemove(id, out _);
            try { client.Dispose(); } catch { /* noop */ }
            if (remote is not null)
            {
                ClientDisconnected?.Invoke(this, remote);
            }
        }
    }

    /// <summary>
    /// 1 フレームを全クライアントへブロードキャストする。
    /// 切断済みクライアントは内部で除去される。
    /// </summary>
    public async Task BroadcastAsync(string xml, CancellationToken cancellationToken = default)
    {
        if (_clients.IsEmpty) return;

        var stale = new List<Guid>();
        foreach (var kv in _clients)
        {
            try
            {
                NetworkStream stream = kv.Value.GetStream();
                await SmisFrameWriter.WriteFrameAsync(stream, xml, cancellationToken).ConfigureAwait(false);
            }
            catch
            {
                stale.Add(kv.Key);
            }
        }

        foreach (Guid id in stale)
        {
            if (_clients.TryRemove(id, out TcpClient? c))
            {
                try { c.Dispose(); } catch { /* noop */ }
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _stoppingCts.CancelAsync().ConfigureAwait(false);
        try { _listener.Stop(); } catch { /* noop */ }

        if (_acceptLoopTask is not null)
        {
            try { await _acceptLoopTask.ConfigureAwait(false); } catch { /* noop */ }
        }

        foreach (var kv in _clients)
        {
            try { kv.Value.Dispose(); } catch { /* noop */ }
        }
        _clients.Clear();
        _stoppingCts.Dispose();
    }
}

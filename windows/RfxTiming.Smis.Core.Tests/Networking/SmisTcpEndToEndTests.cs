using System.Net;
using RfxTiming.Smis.Networking;
using RfxTiming.Smis.Protocol;
using Xunit;

namespace RfxTiming.Smis.Core.Tests.Networking;

/// <summary>
/// VirtualServer → Receiver の TCP エンドツーエンド通信を、ループバックで検証する。
/// 「実際にバーチャルサーバからレシーバで受信できるか」の自動テスト版。
/// </summary>
public class SmisTcpEndToEndTests
{
    [Fact]
    public async Task Server_broadcasts_then_client_reads_same_frames()
    {
        int port = GetFreePort();

        await using var server = new SmisTcpServer(new SmisTcpServerOptions(IPAddress.Loopback, port));
        server.Start();

        var client = new SmisTcpClient(new SmisTcpClientOptions(
            Host: "127.0.0.1",
            Port: port,
            AutoReconnect: false));

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var received = new List<string>();

        Task readerTask = Task.Run(async () =>
        {
            await foreach (SmisFrame frame in client.ReceiveFramesAsync(cts.Token))
            {
                received.Add(frame.Xml);
                if (received.Count >= 3)
                {
                    await cts.CancelAsync();
                    return;
                }
            }
        });

        // クライアントが Accept されるまで少し待つ
        for (int i = 0; i < 50 && server.ClientCount == 0; i++)
        {
            await Task.Delay(20);
        }

        Assert.Equal(1, server.ClientCount);

        await server.BroadcastAsync("<Competition ID=\"1\" NameJ=\"テスト\" NameE=\"Test\" StartDate=\"2026/06/13\" EndDate=\"2026/06/14\" />");
        await server.BroadcastAsync("<Loop ID=\"1\" Type=\"C\" Order=\"1\" Length=\"120000\" />");
        await server.BroadcastAsync("<Message Type=\"T\" Scope=\"A\" Text=\"hello\" />");

        await readerTask;

        Assert.Equal(3, received.Count);
        Assert.StartsWith("<Competition", received[0]);
        Assert.StartsWith("<Loop", received[1]);
        Assert.StartsWith("<Message", received[2]);
    }

    [Fact]
    public async Task Multiple_clients_can_receive_broadcast()
    {
        int port = GetFreePort();
        await using var server = new SmisTcpServer(new SmisTcpServerOptions(IPAddress.Loopback, port));
        server.Start();

        var clientA = new SmisTcpClient(new SmisTcpClientOptions("127.0.0.1", port, AutoReconnect: false));
        var clientB = new SmisTcpClient(new SmisTcpClientOptions("127.0.0.1", port, AutoReconnect: false));

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var receivedA = new List<string>();
        var receivedB = new List<string>();

        Task RunReader(SmisTcpClient c, List<string> sink) => Task.Run(async () =>
        {
            await foreach (var f in c.ReceiveFramesAsync(cts.Token))
            {
                sink.Add(f.Xml);
                if (sink.Count >= 1)
                {
                    return;
                }
            }
        });

        Task readerA = RunReader(clientA, receivedA);
        Task readerB = RunReader(clientB, receivedB);

        for (int i = 0; i < 100 && server.ClientCount < 2; i++)
        {
            await Task.Delay(20);
        }

        Assert.Equal(2, server.ClientCount);

        await server.BroadcastAsync("<Ping/>");

        await Task.WhenAll(readerA, readerB).WaitAsync(TimeSpan.FromSeconds(2));

        Assert.Single(receivedA);
        Assert.Single(receivedB);
    }

    private static int GetFreePort()
    {
        using var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }
}

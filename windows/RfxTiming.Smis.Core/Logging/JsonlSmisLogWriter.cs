using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using RfxTiming.Smis.Messages;
using RfxTiming.Smis.Protocol;

namespace RfxTiming.Smis.Logging;

/// <summary>
/// 解析済 SMIS メッセージを JSON Lines 形式で追記する Writer。
/// 1 行 = 1 メッセージ。各行は <c>{"ts":..., "type":"Passing", "payload":{...}}</c> の形式。
/// </summary>
public sealed class JsonlSmisLogWriter : IAsyncDisposable, IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        // 日本語 (ベルトラン・バゲット 等) を Unicode エスケープしない
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        WriteIndented = false,
    };

    private readonly StreamWriter _writer;
    private readonly Lock _gate = new();
    private bool _disposed;

    public JsonlSmisLogWriter(string filePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        string? dir = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        FilePath = filePath;
        _writer = new StreamWriter(
            new FileStream(filePath, FileMode.Append, FileAccess.Write, FileShare.Read),
            new UTF8Encoding(encoderShouldEmitUTF8Identifier: false))
        {
            AutoFlush = false,
        };
    }

    public string FilePath { get; }

    public long WrittenCount { get; private set; }

    /// <summary>1 メッセージを 1 行の JSON として追記する。</summary>
    public async Task WriteMessageAsync(
        SmisFrame frame,
        SmisMessage message,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(frame);
        ArgumentNullException.ThrowIfNull(message);
        ObjectDisposedException.ThrowIf(_disposed, this);

        var envelope = new
        {
            ts = frame.ReceivedAt.ToString("O", CultureInfo.InvariantCulture),
            type = message.GetType().Name,
            payload = (object)message,
        };

        string json = JsonSerializer.Serialize(envelope, JsonOptions);

        lock (_gate)
        {
            _writer.Write(json);
            _writer.Write('\n');
            WrittenCount++;
        }

        await _writer.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _writer.Flush();
        _writer.Dispose();
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;
        await _writer.FlushAsync().ConfigureAwait(false);
        await _writer.DisposeAsync().ConfigureAwait(false);
    }
}

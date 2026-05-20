using System.Globalization;
using System.Text;
using RfxTiming.Smis.Protocol;

namespace RfxTiming.Smis.Logging;

/// <summary>
/// SMIS 生 XML フレームを 1 メッセージ 1 行のタブ区切りテキストに追記する Writer。
/// <para>
/// フォーマット: <c>{ISO8601 受信時刻}\t{バイト長}\t{エスケープ済 XML}\n</c>
/// </para>
/// <para>
/// 改行・タブを含む XML はエスケープして 1 行に詰めることで、テキストエディタや grep でも扱える。
/// </para>
/// </summary>
public sealed class RawSmisLogWriter : IAsyncDisposable, IDisposable
{
    private readonly StreamWriter _writer;
    // .NET 9 の System.Threading.Lock は利用可能だが、書き込み頻度が低いため
    // 互換性の高い object モニタロックで十分。複数 await の合間に短時間だけロックを保持する。
    private readonly object _gate = new();
    private bool _disposed;

    /// <summary>
    /// 指定パスへの追記モードでファイルを開く。フォルダーが無ければ作成する。
    /// </summary>
    public RawSmisLogWriter(string filePath)
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

    /// <summary>書き込み中のファイル絶対パス。</summary>
    public string FilePath { get; }

    /// <summary>これまでに書き込んだフレーム数。</summary>
    public long WrittenCount { get; private set; }

    /// <summary>1 フレームを 1 行追記し、即座にフラッシュする。</summary>
    public async Task WriteFrameAsync(SmisFrame frame, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(frame);
        ObjectDisposedException.ThrowIf(_disposed, this);

        string line = FormatLine(frame);
        // ロックは短時間: 書き込み順序の整合のためだけ。
        lock (_gate)
        {
            _writer.Write(line);
            WrittenCount++;
        }

        await _writer.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    private static string FormatLine(SmisFrame frame)
    {
        string ts = frame.ReceivedAt.ToString("O", CultureInfo.InvariantCulture);
        string escapedXml = Escape(frame.Xml);
        return string.Create(
            CultureInfo.InvariantCulture,
            $"{ts}\t{frame.Bytes.Length}\t{escapedXml}\n");
    }

    private static string Escape(string xml)
    {
        // タブと改行を文字リテラル化 (\\t, \\n, \\r)。読み込み時に復元可能。
        // バックスラッシュ自身もエスケープして可逆に。
        var sb = new StringBuilder(xml.Length + 8);
        foreach (char c in xml)
        {
            switch (c)
            {
                case '\\': sb.Append("\\\\"); break;
                case '\t': sb.Append("\\t"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                default: sb.Append(c); break;
            }
        }
        return sb.ToString();
    }

    /// <summary>エスケープ済み行から XML 本体を復元する (再生時用)。</summary>
    public static string Unescape(string escaped)
    {
        var sb = new StringBuilder(escaped.Length);
        for (int i = 0; i < escaped.Length; i++)
        {
            char c = escaped[i];
            if (c == '\\' && i + 1 < escaped.Length)
            {
                char next = escaped[++i];
                sb.Append(next switch
                {
                    '\\' => '\\',
                    't' => '\t',
                    'n' => '\n',
                    'r' => '\r',
                    _ => next,
                });
            }
            else
            {
                sb.Append(c);
            }
        }
        return sb.ToString();
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

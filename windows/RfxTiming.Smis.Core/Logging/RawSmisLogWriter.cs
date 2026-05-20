using System.Globalization;
using System.Text;
using RfxTiming.Smis.Protocol;

namespace RfxTiming.Smis.Logging;

/// <summary>
/// SMIS 生 XML フレームを 1 メッセージ 1 行のテキスト形式で追記する Writer。
/// <para>
/// 出力フォーマットは他プロジェクト (SEIKO 計時系) のログと互換:
/// </para>
/// <code>
/// 2026-03-27 13:32:36.204 &lt;Competition ID="477" NameJ="～ 巌流塾 ～" .../&gt;
/// 2026-03-27 13:32:36.246 &lt;Category ID="477:1" NameJ="..." .../&gt;
/// </code>
/// <para>
/// 仕様:
/// <list type="bullet">
///   <item>1 行 = 1 SMIS メッセージ。</item>
///   <item>先頭は <c>yyyy-MM-dd HH:mm:ss.fff</c> (ローカル時刻、ミリ秒精度)。</item>
///   <item>区切りは半角スペース 1 個。</item>
///   <item>XML 本体は 1 行に詰める (内部の <c>\r\n</c>/<c>\t</c> はスペースに正規化)。</item>
///   <item>行末は <c>\n</c>。</item>
/// </list>
/// </para>
/// <para>
/// この形式の利点:
/// <list type="bullet">
///   <item>SEIKO の旧ログをそのまま MOLA_Timing-VirtualServer で再生できる。</item>
///   <item>grep / awk / Excel でそのまま扱える。</item>
///   <item>タイムスタンプが人間にも読めて時系列が瞬時に分かる。</item>
/// </list>
/// </para>
/// </summary>
public sealed class RawSmisLogWriter : IAsyncDisposable, IDisposable
{
    /// <summary>タイムスタンプの書式 (SEIKO 互換)。</summary>
    public const string TimestampFormat = "yyyy-MM-dd HH:mm:ss.fff";

    private readonly StreamWriter _writer;
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

        string line = FormatLine(frame.ReceivedAt.LocalDateTime, frame.Xml);

        lock (_gate)
        {
            _writer.Write(line);
            WrittenCount++;
        }

        await _writer.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>任意のタイムスタンプ + XML で 1 行追記する (テスト・再エクスポート用途)。</summary>
    public async Task WriteAsync(DateTime localTimestamp, string xml, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(xml);
        ObjectDisposedException.ThrowIf(_disposed, this);

        string line = FormatLine(localTimestamp, xml);
        lock (_gate)
        {
            _writer.Write(line);
            WrittenCount++;
        }
        await _writer.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>1 行を組み立てる (内部の改行・タブはスペースに正規化)。</summary>
    public static string FormatLine(DateTime localTimestamp, string xml)
    {
        string ts = localTimestamp.ToString(TimestampFormat, CultureInfo.InvariantCulture);
        string singleLineXml = NormalizeToSingleLine(xml);
        return string.Create(
            CultureInfo.InvariantCulture,
            $"{ts} {singleLineXml}\n");
    }

    private static string NormalizeToSingleLine(string xml)
    {
        // 内部の改行・タブはスペース 1 個に置換し、連続スペースは詰める。
        // SEIKO 実ログでも Standings は 1 行で来るのが通常だが、
        // 万一フォーマッターが挟んだ改行が紛れても 1 行を維持する。
        if (!xml.AsSpan().ContainsAny('\r', '\n', '\t'))
        {
            return xml;
        }

        var sb = new StringBuilder(xml.Length);
        bool prevSpace = false;
        foreach (char c in xml)
        {
            if (c == '\r' || c == '\n' || c == '\t')
            {
                if (!prevSpace)
                {
                    sb.Append(' ');
                    prevSpace = true;
                }
            }
            else
            {
                sb.Append(c);
                prevSpace = c == ' ';
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

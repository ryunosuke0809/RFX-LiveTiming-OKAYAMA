using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text;
using System.Threading;
using RfxTiming.Smis.Logging;

namespace RfxTiming.Smis.Replay;

/// <summary>
/// SMIS 互換ログファイル (<c>MOLA_INPUT_YYYYMMDD.log</c> / <c>seiko_YYYYMMDD.log</c>) を読み込むパーサー。
/// 両形式とも 1 行 = タイムスタンプ (yyyy-MM-dd HH:mm:ss.fff) + スペース + XML で同一フォーマット。
/// <para>
/// 1 行のフォーマット: <c>yyyy-MM-dd HH:mm:ss.fff &lt;Xml.../&gt;</c>
/// </para>
/// </summary>
public static class SeikoLogReader
{
    /// <summary>SEIKO ログのタイムスタンプ書式 (<see cref="RawSmisLogWriter.TimestampFormat"/> と同期)。</summary>
    public static readonly string TimestampFormat = RawSmisLogWriter.TimestampFormat;

    private static readonly Encoding Utf8NoBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);

    /// <summary>同期版: ファイル全体を List で返す (UI 起動時のロード用)。</summary>
    public static List<SeikoLogEntry> ReadAll(string filePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        var result = new List<SeikoLogEntry>(capacity: 16_384);
        using var reader = new StreamReader(filePath, Utf8NoBom, detectEncodingFromByteOrderMarks: true);
        string? line;
        int lineNo = 0;
        while ((line = reader.ReadLine()) is not null)
        {
            lineNo++;
            if (TryParseLine(line, out SeikoLogEntry entry))
            {
                result.Add(entry);
            }
            // 不正な行は無視 (BOM 行 / 空行 / 部分書き込み行など)
        }
        return result;
    }

    /// <summary>
    /// 非同期版: 大きなログでも UI スレッドをブロックしない。
    /// <para>
    /// 非同期メソッドでは <see cref="StreamReader.EndOfStream"/> が同期 I/O を伴うため使用せず、
    /// <see cref="StreamReader.ReadLineAsync(CancellationToken)"/> が <c>null</c> を返したら終端と判定する
    /// (<see href="https://learn.microsoft.com/dotnet/fundamentals/code-analysis/quality-rules/ca2024">CA2024</see>)。
    /// </para>
    /// </summary>
    public static async IAsyncEnumerable<SeikoLogEntry> EnumerateAsync(
        string filePath,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        await using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read,
            bufferSize: 64 * 1024, useAsync: true);
        using var reader = new StreamReader(stream, Utf8NoBom, detectEncodingFromByteOrderMarks: true);

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            string? line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            if (line is null) yield break;
            if (TryParseLine(line, out SeikoLogEntry entry))
            {
                yield return entry;
            }
        }
    }

    /// <summary>1 行をパースする。失敗時は false。</summary>
    public static bool TryParseLine(string line, out SeikoLogEntry entry)
    {
        entry = default!;
        if (string.IsNullOrWhiteSpace(line)) return false;

        // BOM が混じった先頭行を許容
        ReadOnlySpan<char> span = line.AsSpan();
        if (span[0] == '\uFEFF') span = span[1..];

        // タイムスタンプは "yyyy-MM-dd HH:mm:ss.fff" = 23 文字
        if (span.Length < 24) return false;

        ReadOnlySpan<char> tsSpan = span[..23];
        if (!DateTime.TryParseExact(tsSpan, TimestampFormat, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeLocal, out DateTime ts))
        {
            return false;
        }

        if (span[23] != ' ') return false;

        ReadOnlySpan<char> xmlSpan = span[24..].TrimEnd();
        if (xmlSpan.IsEmpty || xmlSpan[0] != '<') return false;

        entry = new SeikoLogEntry(ts, xmlSpan.ToString());
        return true;
    }
}

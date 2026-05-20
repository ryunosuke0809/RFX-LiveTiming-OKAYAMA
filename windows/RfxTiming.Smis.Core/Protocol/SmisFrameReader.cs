using System.Buffers;
using System.IO.Pipelines;
using System.Runtime.CompilerServices;
using System.Text;

namespace RfxTiming.Smis.Protocol;

/// <summary>
/// SMIS の TCP ストリームから NULL (0x00) 終端の XML フレームを切り出す。
/// </summary>
/// <remarks>
/// <para>
/// 仕様書 1.1: 「送信される一連のデータ終端は NULL(0x00) とする」。
/// データ形式は UTF-8 の XML（XML 宣言は省略される）。
/// </para>
/// <para>
/// <see cref="System.IO.Pipelines"/> を使い、大きな受信バッファをコピー無しで走査する。
/// 高頻度の <c>Passing</c> / <c>Standings</c> でも CPU/GC を抑える。
/// </para>
/// </remarks>
public static class SmisFrameReader
{
    /// <summary>1 フレームの上限バイト数（暴走防止）。仕様書に明示はないが Standings の最大想定で約 64KB あれば十分。</summary>
    public const int DefaultMaxFrameBytes = 256 * 1024;

    /// <summary>SMIS フレーム終端マーカー (0x00)。</summary>
    public const byte NullTerminator = 0x00;

    /// <summary>
    /// 指定のストリームからフレームを順次取り出す。
    /// 接続が閉じられるかキャンセルされるまで列挙する。
    /// </summary>
    /// <param name="stream">受信ストリーム (TCP ソケット等)。</param>
    /// <param name="maxFrameBytes">1 フレームの上限サイズ。超過時は例外。</param>
    /// <param name="timeProvider">受信時刻取得用 (テスト差し替え可)。<c>null</c> なら <see cref="TimeProvider.System"/>。</param>
    /// <param name="cancellationToken">キャンセル トークン。</param>
    public static async IAsyncEnumerable<SmisFrame> ReadFramesAsync(
        Stream stream,
        int maxFrameBytes = DefaultMaxFrameBytes,
        TimeProvider? timeProvider = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentOutOfRangeException.ThrowIfLessThan(maxFrameBytes, 1);

        var time = timeProvider ?? TimeProvider.System;
        var reader = PipeReader.Create(stream, new StreamPipeReaderOptions(leaveOpen: true));

        try
        {
            while (true)
            {
                cancellationToken.ThrowIfCancellationRequested();

                ReadResult result = await reader.ReadAsync(cancellationToken).ConfigureAwait(false);
                ReadOnlySequence<byte> buffer = result.Buffer;

                while (TryReadFrame(ref buffer, maxFrameBytes, time, out SmisFrame? frame))
                {
                    yield return frame;
                }

                reader.AdvanceTo(buffer.Start, buffer.End);

                if (result.IsCompleted)
                {
                    if (!buffer.IsEmpty)
                    {
                        throw new SmisProtocolException(
                            $"Stream closed mid-frame: {buffer.Length} bytes left without NULL terminator.");
                    }

                    yield break;
                }
            }
        }
        finally
        {
            await reader.CompleteAsync().ConfigureAwait(false);
        }
    }

    private static bool TryReadFrame(
        ref ReadOnlySequence<byte> buffer,
        int maxFrameBytes,
        TimeProvider time,
        out SmisFrame frame)
    {
        SequencePosition? terminatorPosition = buffer.PositionOf(NullTerminator);
        if (terminatorPosition is null)
        {
            if (buffer.Length > maxFrameBytes)
            {
                throw new SmisProtocolException(
                    $"Frame exceeded maxFrameBytes={maxFrameBytes} without NULL terminator.");
            }

            frame = default!;
            return false;
        }

        ReadOnlySequence<byte> framePayload = buffer.Slice(0, terminatorPosition.Value);
        if (framePayload.Length > maxFrameBytes)
        {
            throw new SmisProtocolException(
                $"Frame exceeded maxFrameBytes={maxFrameBytes} (got {framePayload.Length}).");
        }

        byte[] bytes = framePayload.ToArray();
        string xml = Encoding.UTF8.GetString(bytes);
        frame = new SmisFrame(time.GetUtcNow(), bytes, xml);

        SequencePosition afterTerminator = buffer.GetPosition(1, terminatorPosition.Value);
        buffer = buffer.Slice(afterTerminator);
        return true;
    }
}

/// <summary>SMIS プロトコル違反 (フレームオーバーフロー等) を示す例外。</summary>
public sealed class SmisProtocolException : Exception
{
    public SmisProtocolException(string message) : base(message) { }
    public SmisProtocolException(string message, Exception innerException) : base(message, innerException) { }
}

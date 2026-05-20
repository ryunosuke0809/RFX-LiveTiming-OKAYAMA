using System.Text;

namespace RfxTiming.Smis.Networking;

/// <summary>
/// SMIS フレーム (UTF-8 XML + NULL 終端) を Stream に書き出すヘルパー。
/// VirtualServer の TCP 送信、テスト用のメモリストリーム生成などで使用。
/// </summary>
public static class SmisFrameWriter
{
    /// <summary>NULL 終端マーカー (0x00)。</summary>
    public const byte NullTerminator = 0x00;

    /// <summary>1 フレームを送信する: <c>UTF-8(xml) + 0x00</c>。</summary>
    public static async Task WriteFrameAsync(
        Stream stream,
        string xml,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(xml);

        byte[] bytes = Encoding.UTF8.GetBytes(xml);
        await stream.WriteAsync(bytes.AsMemory(), cancellationToken).ConfigureAwait(false);
        await stream.WriteAsync(new byte[] { NullTerminator }.AsMemory(), cancellationToken).ConfigureAwait(false);
        await stream.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>複数フレームをまとめて送信する。</summary>
    public static async Task WriteFramesAsync(
        Stream stream,
        IEnumerable<string> xmls,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(xmls);

        foreach (string xml in xmls)
        {
            cancellationToken.ThrowIfCancellationRequested();
            byte[] bytes = Encoding.UTF8.GetBytes(xml);
            await stream.WriteAsync(bytes.AsMemory(), cancellationToken).ConfigureAwait(false);
            await stream.WriteAsync(new byte[] { NullTerminator }.AsMemory(), cancellationToken).ConfigureAwait(false);
        }

        await stream.FlushAsync(cancellationToken).ConfigureAwait(false);
    }
}

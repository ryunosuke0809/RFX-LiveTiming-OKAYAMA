namespace RfxTiming.Smis.Protocol;

/// <summary>
/// SMIS ストリームから切り出した 1 フレーム（NULL 区切り）の生データ。
/// <para>
/// パース失敗時でも保存可能なよう、生バイトと UTF-8 文字列の両方を保持する。
/// 生 XML ログ <c>MOLA_INPUT_YYYYMMDD.log</c> はこの構造を SEIKO 互換形式で直列化したもの。
/// </para>
/// </summary>
/// <param name="ReceivedAt">フレーム終端 (NULL バイト) を受信した時刻。</param>
/// <param name="Bytes">NULL を含まない生バイト列 (UTF-8 想定)。</param>
/// <param name="Xml">UTF-8 デコード済 XML 文字列。</param>
public sealed record SmisFrame(
    DateTimeOffset ReceivedAt,
    ReadOnlyMemory<byte> Bytes,
    string Xml);

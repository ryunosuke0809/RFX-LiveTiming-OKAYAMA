namespace RfxTiming.Smis.Replay;

/// <summary>
/// SEIKO 互換ログファイルの 1 行 = 1 SMIS メッセージのレコード。
/// </summary>
/// <param name="Timestamp">行頭のタイムスタンプ (ローカル時刻、ミリ秒精度)。</param>
/// <param name="Xml">UTF-8 XML 本体 (1 行に正規化済み)。</param>
public sealed record SeikoLogEntry(DateTime Timestamp, string Xml);

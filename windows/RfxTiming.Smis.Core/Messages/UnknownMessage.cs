namespace RfxTiming.Smis.Messages;

/// <summary>
/// 仕様書に記載のない、または将来追加される SMIS メッセージを保持するための型。
/// <para>
/// 「外部サービス構築業者との協議の上で変更、更新される」と仕様書冒頭にあるため、
/// 未知のメッセージが流れてきても落とさずに記録できるよう用意する。
/// </para>
/// </summary>
public sealed record UnknownMessage(
    string ElementName,
    string Xml) : SmisMessage;

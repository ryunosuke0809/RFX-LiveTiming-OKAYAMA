namespace RfxTiming.Smis.Messages;

/// <summary>
/// SMIS 2.3.1 計測セッション選択
/// <code>&lt;Select SessionID="1:1:3:0:1" /&gt;</code>
/// </summary>
public sealed record Select(
    string SessionId) : SmisMessage;

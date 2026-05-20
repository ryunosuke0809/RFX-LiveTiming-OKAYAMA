namespace RfxTiming.Smis.Logging;

/// <summary>
/// 実行可能ファイルと同じディレクトリ配下のログ出力パスを生成するユーティリティ。
/// <para>
/// MOLA_Timing-Receiver / MOLA_Timing-VirtualServer はインストーラーを使わず
/// USB / 任意フォルダーへの単一 exe コピーで運用する想定のため、ログ・DB は
/// exe と同じ場所 (<c>%exe%/logs/</c>, <c>%exe%/data/</c>) に置く。
/// </para>
/// <para>
/// Program Files 配下に置かれた場合は書き込み権限の問題が発生し得るため、
/// 計時室 PC では必ずユーザーが書き込み可能なフォルダー (例: <c>C:\MOLA_Timing\</c>)
/// に exe を配置すること。
/// </para>
/// <para>
/// 生ログのフォーマットは他プロジェクト (SEIKO 計時系) の出力と互換になるよう
/// <c>{yyyy-MM-dd HH:mm:ss.fff} {XML}\n</c> に統一する。これにより蓄積された外部の
/// <c>seiko_*.log</c> もそのまま MOLA_Timing-VirtualServer で再生できる。
/// </para>
/// <para>
/// ファイル名は MOLA_Timing-Receiver で受信したログであることが分かるよう
/// <c>MOLA_INPUT_YYYYMMDD.log</c> プレフィックスを使用する。
/// </para>
/// </summary>
public static class LogPaths
{
    /// <summary>ファイル名プレフィックス。</summary>
    public const string FilePrefix = "MOLA_INPUT_";

    /// <summary>ログ出力ルート (<c>%exe%/logs</c>)。</summary>
    public static string LogsRoot => Path.Combine(AppContext.BaseDirectory, "logs");

    /// <summary>ローカル DB / 設定の格納ルート (<c>%exe%/data</c>)。</summary>
    public static string DataRoot => Path.Combine(AppContext.BaseDirectory, "data");

    /// <summary>
    /// 日付指定の生 XML ログのファイルパスを返す。
    /// 形式: <c>MOLA_INPUT_YYYYMMDD.log</c> (SEIKO 互換フォーマット)。
    /// </summary>
    public static string RawLogFileFor(DateOnly date)
        => Path.Combine(LogsRoot, $"{FilePrefix}{date:yyyyMMdd}.log");

    /// <summary>
    /// 日付指定の解析済 JSONL ログのファイルパスを返す。
    /// 形式: <c>MOLA_INPUT_YYYYMMDD.jsonl</c> (社内独自・解析済 1 行 1 JSON)。
    /// </summary>
    public static string ParsedLogFileFor(DateOnly date)
        => Path.Combine(LogsRoot, $"{FilePrefix}{date:yyyyMMdd}.jsonl");

    /// <summary>ユーザー設定 JSON ファイルのパス (<c>%exe%/data/settings.json</c>)。</summary>
    public static string SettingsFile => Path.Combine(DataRoot, "settings.json");

    /// <summary>必要なフォルダーが存在することを保証する。</summary>
    public static void EnsureDirectoriesExist()
    {
        Directory.CreateDirectory(LogsRoot);
        Directory.CreateDirectory(DataRoot);
    }
}

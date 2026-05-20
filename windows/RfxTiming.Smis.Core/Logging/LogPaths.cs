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
/// 生ログのファイル名・フォーマットは他プロジェクト (SEIKO 計時系) の出力と互換になるよう
/// <c>seiko_YYYYMMDD.log</c> / <c>{yyyy-MM-dd HH:mm:ss.fff} {XML}\n</c> に統一する。
/// これにより蓄積された seiko_*.log をそのまま MOLA_Timing-VirtualServer で再生できる。
/// </para>
/// </summary>
public static class LogPaths
{
    /// <summary>ログ出力ルート (<c>%exe%/logs</c>)。</summary>
    public static string LogsRoot => Path.Combine(AppContext.BaseDirectory, "logs");

    /// <summary>ローカル DB / 設定の格納ルート (<c>%exe%/data</c>)。</summary>
    public static string DataRoot => Path.Combine(AppContext.BaseDirectory, "data");

    /// <summary>
    /// 日付指定の生 XML ログのファイルパスを返す。
    /// 形式: <c>seiko_YYYYMMDD.log</c> (他プロジェクトの SEIKO 計時ログと互換)。
    /// </summary>
    public static string RawLogFileFor(DateOnly date)
        => Path.Combine(LogsRoot, $"seiko_{date:yyyyMMdd}.log");

    /// <summary>
    /// 日付指定の解析済 JSONL ログのファイルパスを返す。
    /// 形式: <c>seiko_YYYYMMDD.jsonl</c> (社内独自・解析済 1 行 1 JSON)。
    /// </summary>
    public static string ParsedLogFileFor(DateOnly date)
        => Path.Combine(LogsRoot, $"seiko_{date:yyyyMMdd}.jsonl");

    /// <summary>必要なフォルダーが存在することを保証する。</summary>
    public static void EnsureDirectoriesExist()
    {
        Directory.CreateDirectory(LogsRoot);
        Directory.CreateDirectory(DataRoot);
    }
}

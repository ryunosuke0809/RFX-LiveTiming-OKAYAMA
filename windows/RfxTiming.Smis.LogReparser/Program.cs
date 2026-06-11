using RfxTiming.Smis.Logging;
using RfxTiming.Smis.Messages;
using RfxTiming.Smis.Protocol;
using RfxTiming.Smis.Replay;
using RfxTiming.Smis.Xml;

if (args.Length == 0 || args.Contains("-h") || args.Contains("--help"))
{
    PrintHelp();
    return 0;
}

string? inputPath = null;
string? outputPath = null;

for (int i = 0; i < args.Length; i++)
{
    switch (args[i])
    {
        case "-o":
        case "--output":
            if (i + 1 >= args.Length)
            {
                Console.Error.WriteLine("エラー: --output の後にファイルパスが必要です。");
                return 1;
            }

            outputPath = args[++i];
            break;
        default:
            if (inputPath is null && !args[i].StartsWith('-'))
            {
                inputPath = args[i];
            }

            break;
    }
}

if (string.IsNullOrWhiteSpace(inputPath))
{
    Console.Error.WriteLine("エラー: 入力 .log ファイルを指定してください。");
    PrintHelp();
    return 1;
}

if (!File.Exists(inputPath))
{
    Console.Error.WriteLine($"エラー: 入力ファイルが見つかりません: {inputPath}");
    return 1;
}

outputPath ??= Path.ChangeExtension(inputPath, ".jsonl");
if (File.Exists(outputPath))
{
    File.Delete(outputPath);
}

List<SeikoLogEntry> entries = SeikoLogReader.ReadAll(inputPath);
await using var writer = new JsonlSmisLogWriter(outputPath);

int parseErrors = 0;
int messageCount = 0;
var typeCounts = new Dictionary<string, int>(StringComparer.Ordinal);

for (int lineNo = 0; lineNo < entries.Count; lineNo++)
{
    SeikoLogEntry entry = entries[lineNo];
    DateTimeOffset receivedAt = new(
        entry.Timestamp,
        TimeZoneInfo.Local.GetUtcOffset(entry.Timestamp));
    SmisFrame frame = new(receivedAt, ReadOnlyMemory<byte>.Empty, entry.Xml);

    try
    {
        IReadOnlyList<SmisMessage> messages = SmisXmlParser.ParseMessages(entry.Xml);
        foreach (SmisMessage message in messages)
        {
            await writer.WriteMessageAsync(frame, message).ConfigureAwait(false);
            messageCount++;
            string typeName = message.GetType().Name;
            typeCounts[typeName] = typeCounts.GetValueOrDefault(typeName) + 1;
        }
    }
    catch (SmisXmlParseException ex)
    {
        parseErrors++;
        Console.Error.WriteLine($"パース失敗 (行 {lineNo + 1}): {ex.Message}");
    }
}

Console.WriteLine($"入力: {inputPath}");
Console.WriteLine($"出力: {outputPath}");
Console.WriteLine($"ログ行: {entries.Count}");
Console.WriteLine($"JSONL 行: {messageCount}");
Console.WriteLine($"パースエラー: {parseErrors}");
Console.WriteLine($"パーサー: {SmisXmlParser.ParserProfile}");
foreach ((string type, int count) in typeCounts.OrderBy(kv => kv.Key))
{
    Console.WriteLine($"  {type}: {count}");
}

return parseErrors > 0 ? 2 : 0;

static void PrintHelp()
{
    Console.WriteLine("""
        MOLA_Timing-LogReparser — 生 SMIS ログから JSONL を再生成

        使い方:
          MOLA_Timing-LogReparser <input.log> [-o output.jsonl]

        例:
          MOLA_Timing-LogReparser ..\exports\archive\2026:06:12\MOLA_INPUT_20260612.log
        """);
}

using System.Globalization;
using System.Xml;
using System.Xml.Linq;
using RfxTiming.Smis.Messages;

namespace RfxTiming.Smis.Xml;

/// <summary>
/// SMIS の XML フラグメントを <see cref="SmisMessage"/> に変換する。
/// <para>
/// 仕様書 2 章 各要素の属性定義に従う。XML 宣言 (<c>&lt;?xml ...?&gt;</c>) は付かない前提。
/// </para>
/// <para>
/// 未定義の要素名は <see cref="UnknownMessage"/> として保持し、ログを失わない。
/// パース不能 (XML 構文エラー) は <see cref="SmisXmlParseException"/> を投げる。
/// </para>
/// <para>
/// 岡山 MOLA 実機では、接続時の <c>Team</c> / <c>Transponder</c> / <c>Loop</c> 等が
/// 1 NULL フレーム内に複数ルート要素として連結されて送られる。
/// <see cref="ParseMessages(string)"/> はそのバッチも展開する。
/// </para>
/// </summary>
public static class SmisXmlParser
{
    /// <summary>Receiver UI 等で配布ビルドを識別するためのパーサープロファイル名。</summary>
    public const string ParserProfile = "mola-batch-v2";

    private static readonly System.Text.RegularExpressions.Regex MolaMissingEndDateRegex = new(
        """StartDate="([^"]*)"\s+"([^"]*)"\s*/>""",
        System.Text.RegularExpressions.RegexOptions.CultureInvariant
            | System.Text.RegularExpressions.RegexOptions.Compiled);

    /// <summary>
    /// 単一ルート要素の SMIS XML をパースして DTO を返す。
    /// 複数ルートが含まれる場合は <see cref="SmisXmlParseException"/> を投げる。
    /// </summary>
    public static SmisMessage Parse(string xml)
    {
        IReadOnlyList<SmisMessage> messages = ParseMessages(xml);
        if (messages.Count == 0)
        {
            throw new SmisXmlParseException(
                $"Empty SMIS XML frame (input head: '{Head(NormalizeFrame(xml))}')");
        }

        if (messages.Count > 1)
        {
            throw new SmisXmlParseException(
                $"SMIS frame contains {messages.Count} root elements; use {nameof(ParseMessages)} instead.");
        }

        return messages[0];
    }

    /// <summary>
    /// 1 NULL フレーム分の XML から 0 個以上の SMIS メッセージを取り出す。
    /// 単一ルート・複数ルートのどちらにも対応する。
    /// </summary>
    public static IReadOnlyList<SmisMessage> ParseMessages(string xml)
    {
        ArgumentNullException.ThrowIfNull(xml);

        string normalized = NormalizeFrame(xml);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return Array.Empty<SmisMessage>();
        }

        if (TryParseSingleRoot(normalized, out XElement? root))
        {
            return new[] { ParseElement(root) };
        }

        return ParseFragmentRoots(normalized);
    }

    private static string Head(string xml)
    {
        if (string.IsNullOrEmpty(xml)) return string.Empty;
        const int max = 80;
        return xml.Length <= max ? xml : xml[..max] + "…";
    }

    private static string NormalizeFrame(string xml)
    {
        string normalized = xml.Trim().TrimEnd('\0').TrimEnd();
        return NormalizeMolaSenderQuirks(normalized);
    }

    /// <summary>
    /// 岡山 MOLA 実機で観測された送信側の既知の揺れを補正する。
    /// </summary>
    private static string NormalizeMolaSenderQuirks(string xml)
    {
        if (xml.Contains("StartDatae=", StringComparison.Ordinal))
        {
            xml = xml.Replace("StartDatae=", "StartDate=", StringComparison.Ordinal);
        }

        return MolaMissingEndDateRegex.Replace(xml, """StartDate="$1" EndDate="$2" />""");
    }

    private static bool TryParseSingleRoot(string normalized, out XElement root)
    {
        try
        {
            root = XElement.Parse(normalized, LoadOptions.None);
            return true;
        }
        catch (XmlException)
        {
            root = null!;
            return false;
        }
        catch (InvalidOperationException)
        {
            root = null!;
            return false;
        }
    }

    private static List<SmisMessage> ParseFragmentRoots(string normalized)
    {
        // 岡山 MOLA 実機ログでは Team/Transponder/Loop が連結された 1 フレームになる。
        // 仮想ラッパー方式が最も安定している (Fragment XmlReader は環境によって失敗する)。
        if (TryParseWrappedBatch(normalized, out List<SmisMessage>? wrapped))
        {
            return wrapped;
        }

        var messages = new List<SmisMessage>();
        var settings = new XmlReaderSettings
        {
            ConformanceLevel = ConformanceLevel.Fragment,
            DtdProcessing = DtdProcessing.Prohibit,
            IgnoreWhitespace = true,
        };

        try
        {
            using XmlReader reader = XmlReader.Create(new StringReader(normalized), settings);
            while (reader.Read())
            {
                if (reader.NodeType != XmlNodeType.Element)
                {
                    continue;
                }

                XElement el = (XElement)XNode.ReadFrom(reader)!;
                messages.Add(ParseElement(el));
            }
        }
        catch (XmlException ex)
        {
            throw new SmisXmlParseException(
                $"Malformed SMIS XML: {ex.Message} (input head: '{Head(normalized)}')", ex);
        }
        catch (InvalidOperationException ex)
        {
            throw new SmisXmlParseException(
                $"SMIS XML fragment parse failed: {ex.Message} (input head: '{Head(normalized)}')", ex);
        }

        if (messages.Count == 0)
        {
            throw new SmisXmlParseException(
                $"No SMIS elements in frame (input head: '{Head(normalized)}')");
        }

        return messages;
    }

    /// <summary>
    /// 複数ルート要素を <c>&lt;SmisBatch&gt;</c> で包んで読む。
    /// MOLA 実機のマスターデータ一括送信向け。
    /// </summary>
    private static bool TryParseWrappedBatch(string normalized, out List<SmisMessage> messages)
    {
        messages = new List<SmisMessage>();
        try
        {
            XElement batch = XElement.Parse(
                $"<SmisBatch>{normalized}</SmisBatch>",
                LoadOptions.None);
            foreach (XElement child in batch.Elements())
            {
                messages.Add(ParseElement(child));
            }
        }
        catch (XmlException)
        {
            messages = new List<SmisMessage>();
            return false;
        }
        catch (InvalidOperationException)
        {
            messages = new List<SmisMessage>();
            return false;
        }
        catch (SmisXmlParseException)
        {
            messages = new List<SmisMessage>();
            return false;
        }

        return messages.Count > 0;
    }

    /// <summary>
    /// パース結果がどの要素であってもよい場合に使うエイリアス（失敗時は例外送出）。
    /// </summary>
    public static SmisMessage Parse(ReadOnlySpan<char> xml) => Parse(xml.ToString());

    /// <summary>
    /// 例外を投げずに <c>null</c> を返すバージョン。
    /// </summary>
    public static SmisMessage? TryParse(string xml, out SmisXmlParseException? error)
    {
        try
        {
            error = null;
            return Parse(xml);
        }
        catch (SmisXmlParseException ex)
        {
            error = ex;
            return null;
        }
    }

    private static SmisMessage ParseElement(XElement el) => el.Name.LocalName switch
    {
        "Competition" => ParseCompetition(el),
        "Category" => ParseCategory(el),
        "Round" => ParseRound(el),
        "Group" => ParseGroup(el),
        "Session" => ParseSession(el),
        "Class" => ParseCarClass(el),
        "Team" => ParseTeam(el),
        "Transponder" => ParseTransponder(el),
        "Loop" => ParseLoop(el),
        "Select" => ParseSelect(el),
        "Start" => ParseStart(el),
        "Passing" => ParsePassing(el),
        "Standings" => ParseStandings(el),
        "Message" => ParseRaceControlMessage(el),
        _ => new UnknownMessage(el.Name.LocalName, el.ToString(SaveOptions.DisableFormatting)),
    };

    private static Competition ParseCompetition(XElement el) => new(
        Id: Attr(el, "ID"),
        NameJ: Attr(el, "NameJ"),
        NameE: Attr(el, "NameE"),
        StartDate: Attr(el, "StartDate"),
        EndDate: Attr(el, "EndDate"));

    private static Category ParseCategory(XElement el) => new(
        Id: Attr(el, "ID"),
        NameJ: Attr(el, "NameJ"),
        NameE: Attr(el, "NameE"),
        CourseName: Attr(el, "CourseName"),
        CourseLengthCm: AttrInt(el, "CourseLength"));

    private static Round ParseRound(XElement el) => new(
        Id: Attr(el, "ID"),
        NameJ: Attr(el, "NameJ"),
        NameE: Attr(el, "NameE"),
        Type: ParseRoundType(Attr(el, "Type")));

    private static Group ParseGroup(XElement el) => new(
        Id: Attr(el, "ID"),
        NameJ: Attr(el, "NameJ"),
        NameE: Attr(el, "NameE"));

    private static Session ParseSession(XElement el) => new(
        Id: Attr(el, "ID"),
        NameJ: Attr(el, "NameJ"),
        NameE: Attr(el, "NameE"),
        Time: Attr(el, "Time"),
        Lap: Attr(el, "Lap"));

    private static CarClass ParseCarClass(XElement el) => new(
        Id: Attr(el, "ID"),
        NameJ: Attr(el, "NameJ"),
        NameE: Attr(el, "NameE"),
        Record: Attr(el, "Record"));

    private static Team ParseTeam(XElement el)
    {
        var drivers = el.Elements("Driver").Select(ParseDriver).ToList();
        return new Team(
            Id: Attr(el, "ID"),
            ClassId: Attr(el, "ClassID"),
            No: AttrInt(el, "No"),
            NameJ: Attr(el, "NameJ"),
            NameE: Attr(el, "NameE"),
            Engine: Attr(el, "Engine"),
            Machine: Attr(el, "Machine"),
            Tire: Attr(el, "Tire"),
            Nation: Attr(el, "Nation"),
            Drivers: drivers);
    }

    private static Driver ParseDriver(XElement el) => new(
        No: AttrInt(el, "No"),
        NameJ: Attr(el, "NameJ"),
        NameE: Attr(el, "NameE"),
        Nation: Attr(el, "Nation"));

    private static Transponder ParseTransponder(XElement el)
    {
        var tags = el.Elements("Tag").Select(ParseTag).ToList();
        return new Transponder(
            TeamId: Attr(el, "TeamID"),
            Tags: tags);
    }

    private static Tag ParseTag(XElement el) => new(
        DriverNo: AttrInt(el, "DriverNo"),
        No: Attr(el, "No"));

    private static Loop ParseLoop(XElement el) => new(
        Id: AttrInt(el, "ID"),
        Type: ParseLoopType(Attr(el, "Type")),
        Order: AttrInt(el, "Order"),
        LengthCm: AttrInt(el, "Length"));

    private static Select ParseSelect(XElement el) => new(
        SessionId: Attr(el, "SessionID"));

    private static Start ParseStart(XElement el) => new(
        SessionId: Attr(el, "SessionID"),
        DateTime: Attr(el, "DateTime"));

    private static Passing ParsePassing(XElement el) => new(
        Id: Attr(el, "ID"),
        SessionId: Attr(el, "SessionID"),
        LoopId: AttrInt(el, "LoopID"),
        Time: AttrLong(el, "Time"),
        Order: AttrInt(el, "Order"),
        LastPassingTime: AttrLong(el, "LastPassingTime"),
        TeamId: Attr(el, "TeamID"),
        DriverNo: AttrInt(el, "DriverNo"),
        LapTimeUse: AttrInt(el, "LapTimeUse") != 0,
        Type: ParsePassingType(Attr(el, "Type")));

    private static Standings ParseStandings(XElement el)
    {
        var items = el.Elements("Standing").Select(ParseStanding).ToList();
        return new Standings(
            SessionId: Attr(el, "SessionID"),
            Items: items);
    }

    private static Standing ParseStanding(XElement el) => new(
        Position: AttrInt(el, "Position"),
        ClassPosition: AttrInt(el, "ClassPosition"),
        ClassId: Attr(el, "ClassID"),
        TeamId: Attr(el, "TeamID"),
        DriverNo: AttrInt(el, "DriverNo"),
        Lap: AttrInt(el, "Lap"),
        BestTime: AttrLong(el, "BestTime"),
        BestTimeLap: AttrInt(el, "BestTimeLap"),
        LastLapTime: AttrLong(el, "LastLapTime"),
        LastPassingTime: AttrLong(el, "LastPassingTime"),
        SectorNo: AttrInt(el, "SectorNo"),
        SectorTime: AttrLong(el, "SectorTime"),
        Order: AttrInt(el, "Order"));

    private static RaceControlMessage ParseRaceControlMessage(XElement el) => new(
        Type: ParseMessageType(Attr(el, "Type")),
        Scope: ParseMessageScope(Attr(el, "Scope")),
        Text: Attr(el, "Text"));

    // ----- attribute helpers -----

    private static string Attr(XElement el, string name)
    {
        XAttribute? a = el.Attribute(name);
        return a?.Value ?? string.Empty;
    }

    private static int AttrInt(XElement el, string name)
    {
        string raw = Attr(el, name);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return 0;
        }

        if (!int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out int value))
        {
            throw new SmisXmlParseException(
                $"Attribute '{name}' on <{el.Name.LocalName}> is not a valid integer: '{raw}'");
        }

        return value;
    }

    private static long AttrLong(XElement el, string name)
    {
        string raw = Attr(el, name);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return 0L;
        }

        if (!long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out long value))
        {
            throw new SmisXmlParseException(
                $"Attribute '{name}' on <{el.Name.LocalName}> is not a valid integer: '{raw}'");
        }

        return value;
    }

    // ----- enum parsers -----

    private static RoundType ParseRoundType(string raw) => raw switch
    {
        "T" => RoundType.BestTime,
        "L" => RoundType.Lap,
        _ => RoundType.Unknown,
    };

    private static LoopInstallationType ParseLoopType(string raw) => raw switch
    {
        "C" => LoopInstallationType.Course,
        "P" => LoopInstallationType.Pit,
        _ => LoopInstallationType.Unknown,
    };

    private static PassingType ParsePassingType(string raw) => raw switch
    {
        "N" => PassingType.Normal,
        "B" => PassingType.Backup,
        "M" => PassingType.Manual,
        "C" => PassingType.Cancel,
        "E" => PassingType.Edit,
        _ => PassingType.Unknown,
    };

    private static RaceControlMessageType ParseMessageType(string raw) => raw switch
    {
        "I" => RaceControlMessageType.Information,
        "P" => RaceControlMessageType.Penalty,
        "T" => RaceControlMessageType.Track,
        _ => RaceControlMessageType.Unknown,
    };

    private static RaceControlMessageScope ParseMessageScope(string raw) => raw switch
    {
        "E" => RaceControlMessageScope.Entrants,
        "A" => RaceControlMessageScope.All,
        _ => RaceControlMessageScope.Unknown,
    };
}

/// <summary>SMIS XML パース失敗を示す例外。</summary>
public sealed class SmisXmlParseException : Exception
{
    public SmisXmlParseException(string message) : base(message) { }
    public SmisXmlParseException(string message, Exception innerException) : base(message, innerException) { }
}

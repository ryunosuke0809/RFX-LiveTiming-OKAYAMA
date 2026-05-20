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
/// </summary>
public static class SmisXmlParser
{
    private static readonly XmlReaderSettings ReaderSettings = new()
    {
        ConformanceLevel = ConformanceLevel.Fragment,
        DtdProcessing = DtdProcessing.Prohibit,
        IgnoreWhitespace = true,
        IgnoreComments = true,
        IgnoreProcessingInstructions = true,
    };

    /// <summary>
    /// 単一の SMIS XML フラグメントをパースして DTO を返す。
    /// </summary>
    public static SmisMessage Parse(string xml)
    {
        ArgumentNullException.ThrowIfNull(xml);

        XElement root;
        try
        {
            using var reader = XmlReader.Create(new StringReader(xml), ReaderSettings);
            root = XElement.Load(reader, LoadOptions.None);
        }
        catch (XmlException ex)
        {
            throw new SmisXmlParseException($"Malformed SMIS XML: {ex.Message}", ex);
        }

        return ParseElement(root);
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

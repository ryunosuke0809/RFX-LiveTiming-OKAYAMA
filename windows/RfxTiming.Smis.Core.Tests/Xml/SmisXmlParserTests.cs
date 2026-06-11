using RfxTiming.Smis.Messages;
using RfxTiming.Smis.Xml;
using Xunit;

namespace RfxTiming.Smis.Tests.Xml;

/// <summary>
/// 仕様書 (docs/Specification/計測データ仕様書_20200220.pdf) の例 XML をそのままテストデータとして使用する。
/// 仕様変更時はこのテストも合わせて更新すること。
/// </summary>
public sealed class SmisXmlParserTests
{
    [Fact]
    public void Parse_Competition_ReturnsCompetition()
    {
        const string xml =
            """<Competition ID="1" NameJ="2018 AUTOBACS SUPER GT Round3" NameE="2018 AUTOBACS SUPER GT Round3" StartDate="2018/05/19" EndDate="2018/05/20" />""";

        var result = Assert.IsType<Competition>(SmisXmlParser.Parse(xml));
        Assert.Equal("1", result.Id);
        Assert.Equal("2018 AUTOBACS SUPER GT Round3", result.NameJ);
        Assert.Equal("2018 AUTOBACS SUPER GT Round3", result.NameE);
        Assert.Equal("2018/05/19", result.StartDate);
        Assert.Equal("2018/05/20", result.EndDate);
    }

    [Fact]
    public void Parse_Category_ReturnsCategoryWithCourseLength()
    {
        const string xml =
            """<Category ID="1:1" NameJ="SUPER GT" NameE="SUPER GT" CourseName="International Racing Course" CourseLength="580700" />""";

        var result = Assert.IsType<Category>(SmisXmlParser.Parse(xml));
        Assert.Equal("1:1", result.Id);
        Assert.Equal("SUPER GT", result.NameJ);
        Assert.Equal("International Racing Course", result.CourseName);
        Assert.Equal(580700, result.CourseLengthCm);
    }

    [Theory]
    [InlineData("T", RoundType.BestTime)]
    [InlineData("L", RoundType.Lap)]
    [InlineData("", RoundType.Unknown)]
    [InlineData("X", RoundType.Unknown)]
    public void Parse_Round_MapsTypeCorrectly(string typeAttr, RoundType expected)
    {
        string xml =
            $"""<Round ID="1:1:1" NameJ="公式練習" NameE="Practice" Type="{typeAttr}" />""";

        var result = Assert.IsType<Round>(SmisXmlParser.Parse(xml));
        Assert.Equal(expected, result.Type);
    }

    [Fact]
    public void Parse_Group_ReturnsGroup()
    {
        const string xml =
            """<Group ID="1:2:1:1" NameJ="A 組" NameE="Group A" />""";

        var result = Assert.IsType<Group>(SmisXmlParser.Parse(xml));
        Assert.Equal("1:2:1:1", result.Id);
        Assert.Equal("A 組", result.NameJ);
    }

    [Fact]
    public void Parse_Session_AcceptsEmptyLap()
    {
        const string xml =
            """<Session ID="1:1:3:0:1" NameJ="1 回目" NameE="1" Time="0:20" Lap="" />""";

        var result = Assert.IsType<Session>(SmisXmlParser.Parse(xml));
        Assert.Equal("0:20", result.Time);
        Assert.Equal(string.Empty, result.Lap);
    }

    [Fact]
    public void Parse_Class_ReturnsCarClassWithRecord()
    {
        const string xml =
            """<Class ID="1:1:1" NameJ="GT-500" NameE="GT-500" Record="1'44.319" />""";

        var result = Assert.IsType<CarClass>(SmisXmlParser.Parse(xml));
        Assert.Equal("GT-500", result.NameJ);
        Assert.Equal("1'44.319", result.Record);
    }

    [Fact]
    public void Parse_Team_IncludesDriverChildren()
    {
        const string xml = """
            <Team ID="1:1:1" ClassID="1:1" No="64"
                  NameJ="Epson Modulo NSX-GT"
                  NameE="Epson Modulo NSX-GT"
                  Engine="HR-417E" Machine="Honda NSX-GT" Tire="DL"
                  Nation="Japan">
              <Driver No="0" NameJ="Epson Nakajima Racing" NameE="Epson Nakajima Racing" Nation="Japan" />
              <Driver No="1" NameJ="ベルトラン・バゲット" NameE="Bertrand Baguette" Nation=" Belgium" />
              <Driver No="2" NameJ="松浦 孝亮" NameE="Kosuke Matsuura" Nation="Japan" />
            </Team>
            """;

        var result = Assert.IsType<Team>(SmisXmlParser.Parse(xml));
        Assert.Equal("1:1:1", result.Id);
        Assert.Equal("1:1", result.ClassId);
        Assert.Equal(64, result.No);
        Assert.Equal(3, result.Drivers.Count);
        Assert.Equal("ベルトラン・バゲット", result.Drivers[1].NameJ);
        Assert.Equal("Bertrand Baguette", result.Drivers[1].NameE);
    }

    [Fact]
    public void Parse_Transponder_IncludesTagChildren()
    {
        const string xml = """
            <Transponder TeamID="1:1:1">
              <Tag DriverNo="0" No="23451168" />
              <Tag DriverNo="1" No="23451169" />
              <Tag DriverNo="2" No="23451170" />
            </Transponder>
            """;

        var result = Assert.IsType<Transponder>(SmisXmlParser.Parse(xml));
        Assert.Equal("1:1:1", result.TeamId);
        Assert.Equal(3, result.Tags.Count);
        Assert.Equal("23451169", result.Tags[1].No);
    }

    [Theory]
    [InlineData("C", LoopInstallationType.Course)]
    [InlineData("P", LoopInstallationType.Pit)]
    [InlineData("", LoopInstallationType.Unknown)]
    public void Parse_Loop_MapsTypeAndPositiveLength(string typeAttr, LoopInstallationType expected)
    {
        string xml =
            $"""<Loop ID="0" Type="{typeAttr}" Order="5" Length="580700" />""";

        var result = Assert.IsType<Loop>(SmisXmlParser.Parse(xml));
        Assert.Equal(0, result.Id);
        Assert.Equal(expected, result.Type);
        Assert.Equal(5, result.Order);
        Assert.Equal(580700, result.LengthCm);
    }

    [Fact]
    public void Parse_Select_ReturnsSelect()
    {
        const string xml = """<Select SessionID="1:1:3:0:1" />""";
        var result = Assert.IsType<Select>(SmisXmlParser.Parse(xml));
        Assert.Equal("1:1:3:0:1", result.SessionId);
    }

    [Fact]
    public void Parse_Start_RetainsRawDateTime()
    {
        const string xml = """<Start SessionID="1:1:3:0:1" DateTime="2018/05/19 15:28.22" />""";
        var result = Assert.IsType<Start>(SmisXmlParser.Parse(xml));
        Assert.Equal("2018/05/19 15:28.22", result.DateTime);
    }

    [Fact]
    public void Parse_Passing_DecodesAllAttributes()
    {
        const string xml = """
            <Passing ID="156" SessionID="1:1:3:0:1" LoopID="6" Time="1013520" Order="0"
                     LastPassingTime="1013520" TeamID="1:1:1" DriverNo="0" Type="B" />
            """;

        var result = Assert.IsType<Passing>(SmisXmlParser.Parse(xml));
        Assert.Equal("156", result.Id);
        Assert.Equal("1:1:3:0:1", result.SessionId);
        Assert.Equal(6, result.LoopId);
        Assert.Equal(1013520L, result.Time);
        Assert.Equal(0, result.Order);
        Assert.Equal(1013520L, result.LastPassingTime);
        Assert.Equal("1:1:1", result.TeamId);
        Assert.Equal(0, result.DriverNo);
        Assert.False(result.LapTimeUse);
        Assert.Equal(PassingType.Backup, result.Type);
    }

    [Fact]
    public void Parse_Standings_ParsesAllChildren()
    {
        const string xml = """
            <Standings SessionID="1:1:3:0:1">
              <Standing Position="1" ClassPosition="1" ClassID="1:1:1" TeamID="1:1:1"
                        DriverNo="1" Lap="14" BestTime="935910" BestTimeLap="5"
                        LastLapTime="965680" LastPassingTime="13163520" SectorNo="3"
                        SectorTime="321600" Order="1" />
              <Standing Position="2" ClassPosition="2" ClassID="1:1:1" TeamID="1:1:2"
                        DriverNo="2" Lap="14" BestTime="939020" BestTimeLap="4"
                        LastLapTime="972530" LastPassingTime="13166630" SectorNo="2"
                        SectorTime="305350" Order="2" />
              <Standing Position="3" ClassPosition="3" ClassID="1:1:1" TeamID="1:1:3"
                        DriverNo="1" Lap="11" BestTime="941410" BestTimeLap="5"
                        LastLapTime="988830" LastPassingTime="13169020" SectorNo="1"
                        SectorTime="248970" Order="3" />
            </Standings>
            """;

        var result = Assert.IsType<Standings>(SmisXmlParser.Parse(xml));
        Assert.Equal("1:1:3:0:1", result.SessionId);
        Assert.Equal(3, result.Items.Count);
        Assert.Equal(935910L, result.Items[0].BestTime);
        Assert.Equal(2, result.Items[1].SectorNo);
        Assert.Equal(11, result.Items[2].Lap);
    }

    [Theory]
    [InlineData("T", "A", RaceControlMessageType.Track, RaceControlMessageScope.All)]
    [InlineData("I", "E", RaceControlMessageType.Information, RaceControlMessageScope.Entrants)]
    [InlineData("P", "A", RaceControlMessageType.Penalty, RaceControlMessageScope.All)]
    [InlineData("", "", RaceControlMessageType.Unknown, RaceControlMessageScope.Unknown)]
    public void Parse_Message_MapsTypeAndScope(
        string type, string scope, RaceControlMessageType expectedType, RaceControlMessageScope expectedScope)
    {
        string xml = $"""<Message Type="{type}" Scope="{scope}" Text="赤旗" />""";
        var result = Assert.IsType<RaceControlMessage>(SmisXmlParser.Parse(xml));
        Assert.Equal(expectedType, result.Type);
        Assert.Equal(expectedScope, result.Scope);
        Assert.Equal("赤旗", result.Text);
    }

    [Fact]
    public void Parse_UnknownElement_ReturnsUnknownMessage()
    {
        const string xml = """<FutureFeature Foo="bar" Baz="42" />""";

        var result = Assert.IsType<UnknownMessage>(SmisXmlParser.Parse(xml));
        Assert.Equal("FutureFeature", result.ElementName);
        Assert.Contains("Foo=\"bar\"", result.Xml, StringComparison.Ordinal);
    }

    [Fact]
    public void Parse_MalformedXml_ThrowsSmisXmlParseException()
    {
        const string xml = """<Passing ID="1" unfinished""";
        Assert.Throws<SmisXmlParseException>(() => SmisXmlParser.Parse(xml));
    }

    [Fact]
    public void Parse_InvalidInteger_ThrowsSmisXmlParseException()
    {
        const string xml = """<Loop ID="abc" Type="C" Order="1" Length="100" />""";
        Assert.Throws<SmisXmlParseException>(() => SmisXmlParser.Parse(xml));
    }

    // 以下はリグレッションテスト
    // 旧実装 (XmlReader + ConformanceLevel.Fragment + XElement.Load) で
    // 「The XmlReader state should be EndOfFile after this operation」エラーが
    // 発生していたケースが SmisXmlParseException 化されることを担保する。

    [Fact]
    public void Parse_TrailingWhitespace_DoesNotThrow()
    {
        const string xml = "<Passing ID=\"1\" SessionID=\"X\" LoopID=\"0\" Time=\"0\" Order=\"0\" LastPassingTime=\"0\" TeamID=\"T\" DriverNo=\"0\" LapTimeUse=\"0\" Type=\"N\" />\n\n";
        var result = Assert.IsType<Passing>(SmisXmlParser.Parse(xml));
        Assert.Equal("1", result.Id);
    }

    [Fact]
    public void Parse_TrailingNullByte_DoesNotThrow()
    {
        // SMIS は NULL 終端だが、Frame 分割の境界処理ミスで NULL が残るケースの保険
        string xml = "<Select SessionID=\"S\" />\0";
        var result = Assert.IsType<Select>(SmisXmlParser.Parse(xml));
        Assert.Equal("S", result.SessionId);
    }

    [Fact]
    public void Parse_LeadingWhitespaceAndCrlf_DoesNotThrow()
    {
        const string xml = "\r\n  <Select SessionID=\"S\" />  \r\n";
        var result = Assert.IsType<Select>(SmisXmlParser.Parse(xml));
        Assert.Equal("S", result.SessionId);
    }

    // 岡山 MOLA 実機ログ (exports/archive/2026:06:11) 由来のリグレッション

    [Fact]
    public void ParseMessages_MolaCompetition_StartDataeTypo_ReturnsCompetition()
    {
        const string xml =
            """<Competition ID="1" NameJ="2026 seven × seven FIA-F4 JAPANESE CHAMPIONSHIP" NameE="" StartDatae="2026/06/11" "2026/06/12" />""";

        var result = Assert.IsType<Competition>(SmisXmlParser.ParseMessages(xml).Single());
        Assert.Equal("2026/06/11", result.StartDate);
        Assert.Equal("2026/06/12", result.EndDate);
    }

    [Fact]
    public void ParseMessages_MolaTeamBatch_ReturnsMultipleTeams()
    {
        const string xml =
            """<Team ID="1:1:1" ClassID="1:1:0" No="2" NameJ="RAGNO MOTOR SPORTS" NameE="" Engine="" Machine="" Tire="" Nation="" ><Driver No="0" NameJ="RAGNO MOTOR SPORTS" NameE="RAGNO MOTOR SPORTS" Nation="" ></Driver><Driver No="1" NameJ="岡澤 圭吾" NameE="岡澤 圭吾" Nation="" ></Driver></Team><Team ID="1:1:2" ClassID="1:1:0" No="3" NameJ="TEAM 5ZIGEN F4" NameE="" Engine="" Machine="" Tire="" Nation="" ><Driver No="0" NameJ="TEAM 5ZIGEN F4" NameE="TEAM 5ZIGEN F4" Nation="" ></Driver><Driver No="1" NameJ="山本 聖渚" NameE="山本 聖渚" Nation="" ></Driver></Team>""";

        IReadOnlyList<SmisMessage> messages = SmisXmlParser.ParseMessages(xml);
        Assert.Equal(2, messages.Count);
        var first = Assert.IsType<Team>(messages[0]);
        Assert.Equal("1:1:1", first.Id);
        Assert.Equal("RAGNO MOTOR SPORTS", first.NameJ);
        Assert.Equal(2, first.Drivers.Count);
    }

    [Fact]
    public void ParseMessages_MolaLoopBatch_ReturnsMultipleLoops()
    {
        const string xml =
            """<Loop ID="10" Type="P" Order="1" Length="" /><Loop ID="1" Type="C" Order="2" Length="200000" /><Loop ID="0" Type="C" Order="5" Length="370300" />""";

        IReadOnlyList<SmisMessage> messages = SmisXmlParser.ParseMessages(xml);
        Assert.Equal(3, messages.Count);
        Assert.All(messages, m => Assert.IsType<Loop>(m));
    }

    [Fact]
    public void Parse_MultiRootFrame_ThrowsSmisXmlParseException()
    {
        const string xml =
            """<Select SessionID="1:1:1:1:1" /><Start SessionID="1:1:1:1:1" DateTime="2026/06/11 14:45.00 " />""";

        Assert.Throws<SmisXmlParseException>(() => SmisXmlParser.Parse(xml));
        Assert.Equal(2, SmisXmlParser.ParseMessages(xml).Count);
    }

    [Fact]
    public void ParseMessages_OkayamaArchiveLog_StartupFramesHaveNoParseFailures()
    {
        string? logPath = ResolveOkayamaArchiveLogPath();
        if (logPath is null)
        {
            return;
        }

        string[] lines = File.ReadAllLines(logPath);
        int parseFailures = 0;
        int teamCount = 0;

        foreach (string line in lines)
        {
            if (!TryExtractXml(line, out string xml))
            {
                continue;
            }

            try
            {
                IReadOnlyList<SmisMessage> messages = SmisXmlParser.ParseMessages(xml);
                teamCount += messages.OfType<Team>().Count();
            }
            catch (SmisXmlParseException)
            {
                parseFailures++;
            }
        }

        Assert.Equal(0, parseFailures);
        Assert.True(teamCount >= 31, $"Expected Team master data, got {teamCount}.");
    }

    private static string? ResolveOkayamaArchiveLogPath()
    {
        DirectoryInfo? dir = new(Directory.GetCurrentDirectory());
        while (dir is not null)
        {
            string archiveDir = Path.Combine(dir.FullName, "exports", "archive");
            if (Directory.Exists(archiveDir))
            {
                foreach (string candidate in Directory.EnumerateFiles(archiveDir, "MOLA_INPUT_*.log", SearchOption.AllDirectories))
                {
                    return candidate;
                }
            }

            dir = dir.Parent;
        }

        return null;
    }

    private static bool TryExtractXml(string line, out string xml)
    {
        int space = line.IndexOf(' ');
        if (space < 0)
        {
            xml = string.Empty;
            return false;
        }

        space = line.IndexOf(' ', space + 1);
        if (space < 0)
        {
            xml = string.Empty;
            return false;
        }

        xml = line[(space + 1)..];
        return xml.StartsWith('<', StringComparison.Ordinal);
    }
}

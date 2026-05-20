using RfxTiming.Smis.Messages;
using RfxTiming.Smis.Replay;
using RfxTiming.Smis.Xml;
using Xunit;

namespace RfxTiming.Smis.Core.Tests.Replay;

public class SampleSmisDataTests
{
    [Fact]
    public void All_master_xml_parses_to_known_message_types()
    {
        foreach (string xml in SampleSmisData.Master)
        {
            SmisMessage msg = SmisXmlParser.Parse(xml);
            Assert.NotNull(msg);
            Assert.IsNotType<UnknownMessage>(msg);
        }
    }

    [Fact]
    public void All_measuring_point_xml_parses_to_Loop()
    {
        foreach (string xml in SampleSmisData.MeasuringPoints)
        {
            SmisMessage msg = SmisXmlParser.Parse(xml);
            Assert.IsType<Loop>(msg);
        }
    }

    [Fact]
    public void SessionStart_contains_Select_and_Start()
    {
        var msgs = SampleSmisData.SessionStart.Select(SmisXmlParser.Parse).ToList();
        Assert.Equal(2, msgs.Count);
        Assert.IsType<Select>(msgs[0]);
        Assert.IsType<Start>(msgs[1]);
    }

    [Fact]
    public void Running_samples_yield_passing_standings_and_terminating_message()
    {
        var msgs = SampleSmisData.EnumerateRunningSamples().Select(SmisXmlParser.Parse).ToList();
        Assert.NotEmpty(msgs);
        Assert.Contains(msgs, m => m is Passing);
        Assert.Contains(msgs, m => m is Standings);
        Assert.IsType<RaceControlMessage>(msgs[^1]);
    }
}

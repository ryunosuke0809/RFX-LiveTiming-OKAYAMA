using RfxTiming.Smis.Xml;
using Xunit;

namespace RfxTiming.Smis.Tests.Xml;

public sealed class SmisTimeFormatTests
{
    [Fact]
    public void FormatSmisLapTime_OneMinThirtyThreeSecondsExample()
    {
        // 仕様書例: 935910 = 1分33秒5910 (= 1'33.5910)
        Assert.Equal("1:33.5910", SmisTimeFormat.FormatSmisLapTime(935910));
    }

    [Fact]
    public void FormatSmisLapTime_LessThanOneMinute()
    {
        // 0 分 12 秒 3456
        Assert.Equal("0:12.3456", SmisTimeFormat.FormatSmisLapTime(123456));
    }

    [Fact]
    public void FormatSmisLapTime_ExactMinute()
    {
        // 1 分 0 秒 0000
        Assert.Equal("1:00.0000", SmisTimeFormat.FormatSmisLapTime(600000));
    }

    [Fact]
    public void TryParseStartDateTime_AcceptsSpecExample()
    {
        var parsed = SmisTimeFormat.TryParseStartDateTime("2018/05/19 15:28.22");
        Assert.NotNull(parsed);
        Assert.Equal(new DateTime(2018, 5, 19, 15, 28, 22), parsed);
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("2018-05-19 15:28:22")]
    public void TryParseStartDateTime_InvalidReturnsNull(string? input)
    {
        Assert.Null(SmisTimeFormat.TryParseStartDateTime(input));
    }
}

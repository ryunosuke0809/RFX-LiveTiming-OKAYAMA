using System.Text;
using RfxTiming.Smis.Protocol;
using Xunit;

namespace RfxTiming.Smis.Tests.Protocol;

public sealed class SmisFrameReaderTests
{
    [Fact]
    public async Task ReadFramesAsync_SingleFrame_YieldsOnce()
    {
        const string xml = """<Select SessionID="1:1:3:0:1" />""";
        await using var stream = new MemoryStream(BuildStream(xml));

        var frames = await CollectAsync(stream);

        Assert.Single(frames);
        Assert.Equal(xml, frames[0].Xml);
        Assert.Equal(Encoding.UTF8.GetByteCount(xml), frames[0].Bytes.Length);
    }

    [Fact]
    public async Task ReadFramesAsync_MultipleFrames_YieldsInOrder()
    {
        const string xml1 = """<Passing ID="1" SessionID="s" LoopID="0" Time="1000" Order="0" LastPassingTime="1000" TeamID="t" DriverNo="1" Type="N" LapTimeUse="1" />""";
        const string xml2 = """<Passing ID="2" SessionID="s" LoopID="1" Time="2000" Order="0" LastPassingTime="2000" TeamID="t" DriverNo="1" Type="N" LapTimeUse="1" />""";
        const string xml3 = """<Message Type="T" Scope="A" Text="Green" />""";

        await using var stream = new MemoryStream(BuildStream(xml1, xml2, xml3));

        var frames = await CollectAsync(stream);

        Assert.Equal(3, frames.Count);
        Assert.Equal(xml1, frames[0].Xml);
        Assert.Equal(xml2, frames[1].Xml);
        Assert.Equal(xml3, frames[2].Xml);
    }

    [Fact]
    public async Task ReadFramesAsync_FrameSplitAcrossReads_ReassemblesCorrectly()
    {
        const string xml = """<Standings SessionID="s"><Standing Position="1" ClassPosition="1" ClassID="c" TeamID="t" DriverNo="1" Lap="1" BestTime="100" BestTimeLap="1" LastLapTime="100" LastPassingTime="100" SectorNo="1" SectorTime="100" Order="1" /></Standings>""";
        byte[] full = BuildStream(xml);
        await using var stream = new ChunkedStream(full, chunkSize: 17);

        var frames = await CollectAsync(stream);

        Assert.Single(frames);
        Assert.Equal(xml, frames[0].Xml);
    }

    [Fact]
    public async Task ReadFramesAsync_EmptyFrame_IsAllowed()
    {
        // NULL のみ送られてきた場合 → 空 XML フレームを返す (生 XML ログには記録、Parser で UnknownMessage 処理)
        await using var stream = new MemoryStream(new byte[] { 0x00 });

        var frames = await CollectAsync(stream);

        Assert.Single(frames);
        Assert.Equal(string.Empty, frames[0].Xml);
    }

    [Fact]
    public async Task ReadFramesAsync_StreamClosedMidFrame_Throws()
    {
        // NULL なしで切断
        await using var stream = new MemoryStream(Encoding.UTF8.GetBytes("<Passing ID=\"1\""));

        await Assert.ThrowsAsync<SmisProtocolException>(async () =>
        {
            await foreach (var _ in SmisFrameReader.ReadFramesAsync(stream))
            {
                // never yielded
            }
        });
    }

    [Fact]
    public async Task ReadFramesAsync_OversizedFrame_Throws()
    {
        // maxFrameBytes=8 でそれを超えるデータを送る (NULL なし)
        byte[] big = new byte[256];
        Array.Fill(big, (byte)'a');
        await using var stream = new MemoryStream(big);

        await Assert.ThrowsAsync<SmisProtocolException>(async () =>
        {
            await foreach (var _ in SmisFrameReader.ReadFramesAsync(stream, maxFrameBytes: 8))
            {
                // never yielded
            }
        });
    }

    [Fact]
    public async Task ReadFramesAsync_HandlesUtf8Bom_AsPartOfFrame()
    {
        // SMIS 本来は BOM なしだが、誤って混入した場合に落ちないことを確認
        const string xml = """<Group ID="g" NameJ="A" NameE="A" />""";
        byte[] bom = [0xEF, 0xBB, 0xBF];
        byte[] payload = Encoding.UTF8.GetBytes(xml);
        byte[] stream = [.. bom, .. payload, 0x00];

        await using var ms = new MemoryStream(stream);
        var frames = await CollectAsync(ms);

        Assert.Single(frames);
        // BOM 付きで保持されるが、XML 本体としてパース可能 (System.Xml は BOM を許容)
        Assert.Contains("Group", frames[0].Xml, StringComparison.Ordinal);
    }

    // ----- helpers -----

    private static byte[] BuildStream(params string[] xmls)
    {
        using var ms = new MemoryStream();
        foreach (string xml in xmls)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(xml);
            ms.Write(bytes, 0, bytes.Length);
            ms.WriteByte(0x00);
        }
        return ms.ToArray();
    }

    private static async Task<List<SmisFrame>> CollectAsync(Stream stream)
    {
        var frames = new List<SmisFrame>();
        await foreach (var frame in SmisFrameReader.ReadFramesAsync(stream))
        {
            frames.Add(frame);
        }
        return frames;
    }

    /// <summary>テスト用: 指定サイズ毎にしか読めないストリーム (TCP 分割を模擬)。</summary>
    private sealed class ChunkedStream : Stream
    {
        private readonly byte[] _data;
        private readonly int _chunkSize;
        private int _position;

        public ChunkedStream(byte[] data, int chunkSize)
        {
            _data = data;
            _chunkSize = chunkSize;
        }

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => _data.Length;
        public override long Position
        {
            get => _position;
            set => throw new NotSupportedException();
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            int remaining = _data.Length - _position;
            if (remaining <= 0) return 0;
            int n = Math.Min(Math.Min(count, _chunkSize), remaining);
            Buffer.BlockCopy(_data, _position, buffer, offset, n);
            _position += n;
            return n;
        }

        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
            => Task.FromResult(Read(buffer, offset, count));

        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            int n = Read(buffer.Span);
            return ValueTask.FromResult(n);
        }

        public override int Read(Span<byte> buffer)
        {
            int remaining = _data.Length - _position;
            if (remaining <= 0) return 0;
            int n = Math.Min(Math.Min(buffer.Length, _chunkSize), remaining);
            _data.AsSpan(_position, n).CopyTo(buffer);
            _position += n;
            return n;
        }

        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}

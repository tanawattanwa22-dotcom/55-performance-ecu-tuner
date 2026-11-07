using System;
using System.Linq;
using System.Collections.Generic;
using System.Globalization;

namespace CSharpCoreBrowser.Source;

/// <summary>
/// Browser-compilable pure C# extracted from the logic of the owner's purchased
/// FormMain.cs: Checksum8BitHonda, ValidateChecksum, SendCommand reply checks,
/// WriteFlash source ACK/retry cases, and 50+2*N stopwatch formula.
/// Windows FTDI.FT_* calls, WinForms and Thread.Sleep are NOT compiled here.
/// This library never touches USB, ECU or firmware.
/// </summary>
public static class MainProtocol
{
    // FormMain.cs: Checksum8BitHonda(data, dataSize, startPos)
    public static byte Checksum8BitHonda(byte[] data, int dataSize, int startPos = 0)
    {
        if (data is null || dataSize < 0 || startPos < 0 || startPos + dataSize > data.Length)
            throw new ArgumentOutOfRangeException(nameof(dataSize));
        int end = startPos + dataSize;
        int sum = 0;
        while (startPos < end)
        {
            sum += data[startPos];
            startPos++;
        }
        return (byte)(((sum ^ 0xFF) + 1) & 0xFF);
    }

    // FormMain.cs: ValidateChecksum(data, dataSize)
    public static bool ValidateChecksum(byte[] data, int dataSize) =>
        data is not null && dataSize >= 2 && dataSize <= data.Length &&
        Checksum8BitHonda(data, dataSize - 1) == data[dataSize - 1];

    public static int FormMainTimeoutMs(int commandSize) =>
        commandSize is >= 1 and <= 256 ? 50 + 2 * commandSize :
        throw new ArgumentOutOfRangeException(nameof(commandSize));

    // Exact source SendCommand capture layout: TX echo then framed ECU reply.
    // Crucial: source checks length/checksum, but DOES NOT compare echo bytes.
    public static byte[]? ParseSendCommandCapture(byte[] command, byte[] received)
    {
        if (command is null || received is null || command.Length == 0 ||
            received.Length < command.Length + 2) return null;
        int expected = received[command.Length + 1];
        if (expected < 3 || expected > 255 || received.Length != command.Length + expected)
            return null;
        var reply = received.AsSpan(command.Length, expected).ToArray();
        return ValidateChecksum(reply, reply.Length) ? reply : null;
    }

    public static SourceWriteAck InspectWriteAck(byte[] reply)
    {
        if (reply is null || reply.Length < 3 ||
            reply[1] != reply.Length || !ValidateChecksum(reply, reply.Length))
            return new("INVALID", null, false, false, "length/checksum mismatch");
        if (reply.Length == 5)
            return new("ACCEPT", reply.Length > 3 ? reply[3] : null, true, false,
                "FormMain.WriteFlash: accept checksum-valid length-5 ACK regardless of reply[3]");
        if (reply.Length == 7 && reply[4] == 0 && reply[5] == 0)
            return new("RETRY", reply[3], false, true,
                "FormMain.WriteFlash: length-7 zero bytes [4],[5] permits source retry (global budget 2)");
        return new("INVALID", reply.Length > 3 ? reply[3] : null, false, false,
            "FormMain.WriteFlash: unaccepted reply length/status");
    }

    // FormMain.cs: Checksum8Bit(data, dataSize, startPos)
    public static byte Checksum8Bit(byte[] data, int size, int startPos = 0)
    {
        if (data is null || startPos < 0 || size < 0 || startPos + size > data.Length)
            throw new ArgumentOutOfRangeException(nameof(size));
        int sum=0;
        for(int i=startPos;i<startPos+size;i++) sum += data[i];
        return unchecked((byte)(255 - ((sum - 1) >> 8)));
    }

    // Offline packet preview only; never selects a physical profile or sends USB.
    // The header and checksums are derived from FormMain.WriteFlash.
    public static byte[] BuildOfflineWriteFrame(byte[] block, bool shindengen, int addressUnits,
        int nextAddressUnits)
    {
        if (block is null || (block.Length != 64 && block.Length != 128))
            throw new ArgumentException("Main source block must have 64 or 128 bytes");
        if (addressUnits is < 0 or > 65535 || nextAddressUnits is < 0 or > 65535)
            throw new ArgumentOutOfRangeException(nameof(addressUnits));
        if (shindengen && block.Length != 128)
            throw new ArgumentException("Shindengen source uses 128-byte blocks");
        int n = block.Length;
        var frame = new byte[n + 11];
        frame[0] = (byte)(shindengen ? 0x7C : 0x7E);
        frame[1] = (byte)frame.Length;
        frame[2] = (byte)(shindengen ? 2 : 1);
        frame[3] = 6;
        frame[4] = (byte)(addressUnits >> 8); frame[5] = (byte)addressUnits;
        Array.Copy(block, 0, frame, 6, n);
        frame[n+6] = (byte)(nextAddressUnits >> 8);
        frame[n+7] = (byte)nextAddressUnits;
        frame[n+8] = Checksum8Bit(frame, n+4, 4);
        frame[n+9] = Checksum8BitHonda(frame, n+4, 4);
        frame[n+10] = Checksum8BitHonda(frame, frame[1]-1);
        return frame;
    }

    public static byte[] ParseHex(string hex)
    {
        if (hex is null) throw new ArgumentNullException(nameof(hex));
        string s = new(hex.Where(c => !char.IsWhiteSpace(c) && c != ':' && c != '-').ToArray());
        return s.Length > 0 && s.Length % 2 == 0 ?
            Convert.FromHexString(s) : throw new FormatException("HEX length is not even");
    }
    public static string Hex(byte[] b) => Convert.ToHexString(b);
}
public sealed record SourceWriteAck(string Decision, int? RawByte3, bool Accept,
    bool ExplicitRetry, string Explanation);

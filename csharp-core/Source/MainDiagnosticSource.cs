using System;
using System.Collections.Generic;
using System.Linq;

namespace CSharpCoreBrowser.Source;

// Browser-compatible C# port of FM_diag.cs method_96 and method_99-102.
// Source receive format: command echo + six-byte Honda reply envelope.
// The source Group 7 third 0xD1 TX checksum is 0x37 (incorrect);
// source checksum 0x3E is transmitted instead, matching the existing WebUSB fix.
public static class MainDiagnosticSource
{
    private static readonly IReadOnlyDictionary<int,byte[][]> Groups=new Dictionary<int,byte[][]>{
        [1]=new[]{
            new byte[]{0x72,7,0x72,0x11,0,0x14,0xF0},
            new byte[]{0x72,7,0x72,0x20,0,2,0xF3},
            new byte[]{0x72,7,0x72,0xD1,0,6,0x3E},
            new byte[]{0x72,7,0x72,0xD0,0,0x0E,0x37}},
        [4]=new[]{
            new byte[]{0x72,7,0x72,0x17,0,0x0F,0xEF},
            new byte[]{0x72,7,0x72,0xD1,0,6,0x3E},
            new byte[]{0x72,7,0x72,0x20,0,2,0xF3},
            new byte[]{0x72,7,0x72,0xD0,0,0x0E,0x37}},
        [7]=new[]{
            new byte[]{0x72,7,0x72,0x13,0,0x0E,0xF4},
            new byte[]{0x72,7,0x72,0xD0,0,0x0E,0x37},
            new byte[]{0x72,7,0x72,0xD1,0,6,0x3E},
            new byte[]{0x72,7,0x72,0x20,0,2,0xF3}}
    };
    public static byte[][] CaptureCommands(int group) =>
        Groups.TryGetValue(group,out var commands)?
        commands.Select(x=>(byte[])x.Clone()).ToArray():
        throw new ArgumentOutOfRangeException(nameof(group));
    public static bool ValidateCapture(byte[] raw,int group,out string reason)
    {
        reason="";
        if(raw is null||!Groups.TryGetValue(group,out var commands)){
            reason="Unknown group or missing raw";return false;
        }
        int offset=0;
        foreach(var cmd in commands){
            int expectedReplyLength=cmd[5]+6;
            if(offset+cmd.Length+expectedReplyLength>raw.Length){
                reason="Capture shorter than Group "+group+" source frames";return false;
            }
            // The original diagnostic path checks these reply sizes implicitly
            // with fixed positions. WebUSB adds envelope/echo validation.
            if(!raw.AsSpan(offset,cmd.Length).SequenceEqual(cmd)){
                reason="Serial echo mismatch at "+offset;return false;
            }
            var reply=raw.AsSpan(offset+cmd.Length,expectedReplyLength).ToArray();
            if(reply[1]!=expectedReplyLength||!MainProtocol.ValidateChecksum(reply,reply.Length)){
                reason="Honda reply envelope or checksum mismatch";return false;
            }
            offset+=cmd.Length+expectedReplyLength;
        }
        if(offset!=raw.Length){reason="Trailing diagnostic bytes "+(raw.Length-offset);return false;}
        return true;
    }
    private static double Round(double x,int decimals=0)=>
        Math.Round(x,decimals,MidpointRounding.ToEven);
    private static MainReading Number(string name,double value,string unit="")=>
        new(name,value,unit,null,null,null);
    private static MainReading Temperature(string name,byte[] b,int idx,int max){
        int raw=b[idx],decoded=raw-40;
        string? reason=raw==0xFF?"RAW FF · ECU sensor/group invalid":
            decoded<0||decoded>max?"Outside FM_diag.cs range":"";
        return new(name,raw==0xFF?null:decoded,"°C",raw,idx,reason);
    }
    public static List<MainReading> DecodeCapture(byte[] capture,int group)
    {
        if(!ValidateCapture(capture,group,out string reason))
            throw new ArgumentException(reason);
        byte[] b=capture;
        var result=new List<MainReading>{
            Number("RPM",b[12]*256+b[13],"rpm"),
            Number("Injection",Round((b[group==1?26:23]*256+b[group==1?27:24])/250d,1),"ms"),
            Number("Ignition",Round((b[group==1?28:25]-128)*0.5,1),"deg"),
            Number("TPS",b[15]*0.5,"deg"),
            Number("TPS voltage",Round(b[14]*19.5),"mV")
        };
        // Source exposes one S3 channel named ECT/EOT, not two independent reads.
        result.Add(Temperature("ECT/EOT S3",b,17,120));
        result.Add(Number("S3 voltage",Round(b[16]*19.5),"mV"));
        result.Add(Temperature("IAT S4",b,19,60));
        result.Add(Number("S4 voltage",Round(b[18]*19.5),"mV"));
        if(group==1){
            result.Add(Number("O2 voltage",Round(b[45]*19.5),"mV"));
            result.Add(Number("MAP",b[21],"kPa"));
            result.Add(Number("MAP voltage",Round(b[20]*19.5),"mV"));
            result.Add(Number("Battery",Round(b[24]/10d,1),"V"));
        }else if(group==4){
            result.Add(Number("O2 voltage",Round(b[59]*19.5),"mV"));
            result.Add(Number("Battery",Round(b[22]/10d,1),"V"));
            result.Add(new("MAP",null,"kPa",null,null,"Not supported in source Group 4"));
        }else{
            result.Add(Number("MAP",b[21],"kPa"));
            result.Add(Number("MAP voltage",Round(b[20]*19.5),"mV"));
            result.Add(Number("Battery",Round(b[22]/10d,1),"V"));
            result.Add(Number("DTC count",b[39]&0x7F));
        }
        return result;
    }
}
public sealed record MainReading(string Name,double? Value,string Unit,
    int? RawByte,int? SourceByteIndex,string? Warning);

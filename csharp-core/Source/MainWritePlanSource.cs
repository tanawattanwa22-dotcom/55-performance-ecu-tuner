using System;
using System.Linq;
using System.Collections.Generic;

namespace CSharpCoreBrowser.Source;

// C# port of FormMain.WriteFlash() BLOCK traversal (pure offline preparation).
// The original uses 64-byte H8C and 128-byte other profiles, 16-byte
// addressing and a selective future FF block skip for KEIHINOTHER/V850.
// This never opens FT232R, does not run ERASE/WRITE or infer ECU from BIN alone.
public static class MainWritePlanSource
{
    public static int BlockSize(string profile) => profile switch{
        "KEIHINH8C"=>64,
        "KEIHINOTHER" or "KEIHINM32R" or "SHINDENGENV850"
          or "SHINDENGENRH850" or "SHINDENGENRH850B"=>128,
        _=>throw new ArgumentException("Unsupported original Main ECU profile")
    };
    public static bool IsShindengen(string profile) => profile.StartsWith("SHINDENGEN",StringComparison.Ordinal);
    public static bool SkipFutureFF(string profile) =>
        profile is "KEIHINOTHER" or "SHINDENGENV850";
    public static int NextSourceWriteIndex(byte[] bin,int current,string profile)
    {
        int block=BlockSize(profile);
        if(bin is null || bin.Length%block!=0)throw new ArgumentException("BIN block alignment differs");
        int total=bin.Length/block;
        if(current<0||current>=total)throw new ArgumentOutOfRangeException(nameof(current));
        int next=current+1;
        if(!SkipFutureFF(profile))return next;
        while(next<total){
            bool allFF=true;
            for(int j=next*block;j<(next+1)*block;j++)
                if(bin[j]!=0xFF){allFF=false;break;}
            if(!allFF)break;
            next++;
        }
        return next;
    }
    public static WritePlanAudit Audit(byte[] bin,string profile,int startOffset=0,int maxSampleFrames=4)
    {
        int block=BlockSize(profile);
        if(bin is null || bin.Length%block!=0||bin.Length<block)
            throw new ArgumentException("BIN size not aligned to Main source block");
        if(startOffset<0||startOffset%16!=0)
            throw new ArgumentException("Source startOffset must be non-negative / 16-byte aligned");
        int first=IsShindengen(profile)?startOffset/block:0;
        if(IsShindengen(profile)&&startOffset%block!=0)
            throw new ArgumentException("Shindengen startOffset not divisible by 128");
        int total=bin.Length/block;
        if(first>=total)throw new ArgumentException("Start Offset exceeds BIN coverage");
        int address=startOffset/16;
        int addrStep=block/16;
        int written=0,skipped=0;
        var samples=new List<WriteFrameAudit>();
        for(int index=first;index<total;){
            int next=NextSourceWriteIndex(bin,index,profile);
            int sourceAddress=address+(index-first)*addrStep;
            int nextAddress=next==total?0:address+(next-first)*addrStep;
            var b=bin.AsSpan(index*block,block).ToArray();
            byte[] frame=MainProtocol.BuildOfflineWriteFrame(b,IsShindengen(profile),sourceAddress,nextAddress);
            if(samples.Count<maxSampleFrames)
                samples.Add(new(index,next,MainProtocol.Hex(frame[..Math.Min(12,frame.Length)]),
                    MainProtocol.Hex(frame[^Math.Min(8,frame.Length)..]),
                    MainProtocol.ValidateChecksum(frame,frame.Length)));
            written++;skipped+=next-index-1;index=next;
        }
        return new(profile,bin.Length,startOffset,block,written,skipped,samples);
    }
}
public sealed record WriteFrameAudit(int Block,int NextBlock,string HeaderHex,string TailHex,bool ChecksumValid);
public sealed record WritePlanAudit(string Profile,int BinBytes,int StartOffset,
    int BlockBytes,int FramesSent,int FutureFFBlocksSkipped,List<WriteFrameAudit> Samples);

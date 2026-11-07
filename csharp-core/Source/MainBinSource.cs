using System;
using System.Linq;
using System.Buffers.Binary;

namespace CSharpCoreBrowser.Source;

// Pure C# rules from purchased FormMain.cs:
// GetEcuType, GetOffsetsFromBinType, Sum8Bit, Sum32Bit,
// KeihinAutoChecksum, GetShindengenWriteKey/RecoveryKey.
// No Windows FTDI/WinForms code, no USB access, no mutation of the chosen BIN.
public static class MainBinSource
{
    private static readonly byte[] ShTail={0x5A,0x5A,0x5A,0x5A};
    private static readonly byte[] ShStart0={0xA5,0xA5,0xA5,0xA5,0};
    private static readonly byte[] ShWriteSignature={17,18,19,20,21,21,23};
    private static readonly byte[] ShRecoverySignature={0x91,0x91,0x0D,0x00,0x9E,0x8D};
    private static readonly byte[] V850="SV850"u8.ToArray();
    private static readonly byte[] Rh850="SH850"u8.ToArray();
    private static readonly byte[] KhH8c={0xFF,0xFF,0xAA,0xAA};
    private static readonly byte[] KhM32r={0xFF,0xFF,0xFF,0xAA,0xAA,0xAA,0xAA};
    private static readonly byte[] KhRh850={0xFF,0xFF,0xFF,0,0,0,0};
    private static readonly byte[] KhMpc560=Enumerable.Repeat((byte)0xFF,7).ToArray();
    public static readonly int[] SourceBinSizes={32768,49152,57344,65536,98304,131072,262144,393216,524288,786432,1048576};

    public static bool CompareMemory(byte[] data,int at,byte[] pattern) =>
        data is not null && pattern is not null && at>=0 && at<=data.Length-pattern.Length &&
        data.AsSpan(at,pattern.Length).SequenceEqual(pattern);
    public static int FindPatternInBin(byte[] data,byte[] pattern)
    {
        if(data is null || pattern is null || pattern.Length==0)return -1;
        return data.AsSpan().IndexOf(pattern);
    }
    public static byte Sum8Bit(byte[] data,int count,int start=0)
    {
        if(data is null || start<0 || count<0 || count>data.Length-start)throw new ArgumentOutOfRangeException(nameof(count));
        byte sum=0;
        for(int i=start;i<start+count;i++)sum=unchecked((byte)(sum+data[i]));
        return sum;
    }
    public static uint Sum32Bit(byte[] data,int count,int start=0)
    {
        if(data is null || start<0 || count<0 || count>data.Length-start)throw new ArgumentOutOfRangeException(nameof(count));
        uint sum=0;
        for(int i=start;i+4<=start+count;i+=4)
            sum=unchecked(sum+BinaryPrimitives.ReadUInt32LittleEndian(data.AsSpan(i,4)));
        return sum;
    }
    // FormMain.KeihinAutoChecksum(int checksumOffset=0). Return a NEW BIN
    // so the original selected input is never modified by inspection.
    public static byte[] KeihinChecksumCopy(byte[] source,int checksumOffset=0)
    {
        if(source is null || source.Length<2 || checksumOffset<0 || checksumOffset>=source.Length)
            throw new ArgumentOutOfRangeException(nameof(checksumOffset));
        var data=(byte[])source.Clone();
        byte b=checksumOffset!=0?
            unchecked((byte)(Sum8Bit(data,checksumOffset)+
            Sum8Bit(data,data.Length-checksumOffset-1,checksumOffset+1))):
            Sum8Bit(data,data.Length-1,1);
        data[checksumOffset]=unchecked((byte)(-b));
        return data;
    }
    public static BinProfile Examine(byte[] bin)
    {
        if(bin is null || bin.Length<8)throw new ArgumentException("BIN too short");
        int size=bin.Length;
        // FormMain.GetEcuType, signature scan and 0xA000 variant
        if(CompareMemory(bin,size-ShTail.Length,ShTail)){
            bool hasWriteKey=false;
            for(int i=0;i<size-ShWriteSignature.Length;i++){
                if(CompareMemory(bin,i,ShWriteSignature))hasWriteKey=true;
                if(CompareMemory(bin,i,V850))
                    return new("SHINDENGENV850",0x10000,null,"auto","auto",true);
                if(CompareMemory(bin,i,Rh850))
                    return CompareMemory(bin,40960,ShStart0)?
                        new("SHINDENGENRH850B",0xA000,null,"auto","auto",true):
                        new("SHINDENGENRH850",0x10000,null,"auto","auto",true);
            }
            if(hasWriteKey)return new("SHINDENGENV850",0x10000,null,"auto","auto",true);
        }
        string type=(size==57344||size==32768)&&CompareMemory(bin,size-KhH8c.Length,KhH8c)?
            "KEIHINH8C":size==262144&&CompareMemory(bin,size-KhM32r.Length,KhM32r)?
            "KEIHINM32R":"KEIHINOTHER";
        int? offset=null,check=null;string startText="—",checkText="—";
        // FormMain.GetOffsetsFromBinType source size defaults; these are
        // only firmware-derived hints and do NOT establish a physical ECU match.
        if(size==49152){offset=0x4000;check=0x7600;}
        else if(size==57344){offset=0;check=0xDFEF;}
        else if(size==65536||size==98304){offset=0x8000;check=0;}
        else if(size==131072){offset=0xE0000;check=0xB000;}
        else if(size==262144&&(CompareMemory(bin,size-KhRh850.Length,KhRh850)||
          CompareMemory(bin,size-KhM32r.Length,KhM32r)||CompareMemory(bin,size-KhMpc560.Length,KhMpc560))){
          offset=0;check=0x3FFF8;
        }else if(size==524288&&CompareMemory(bin,size-KhMpc560.Length,KhMpc560)){
          offset=0;check=0x7FFF8;
        }else if(size==1048576){offset=0;check=0x7FFF8;} // SH705X signature handled separately by full source
        if(offset.HasValue)startText=offset.Value.ToString("X");
        if(check.HasValue)checkText=check.Value.ToString("X");
        return new(type,offset,check,startText,checkText,false);
    }
    // FormMain.GetShindengenWriteKey/GetShindengenRecoveryKey;
    // exact source 16-bit overflow and signature probing. Pure calculation.
    public static byte[]? DeriveShindengenKey(byte[] bin,byte[] seed,bool recovery)
    {
        if(bin is null || seed is null || seed.Length!=2)throw new ArgumentException("Need BIN and two seed bytes");
        var sig=recovery?ShRecoverySignature:ShWriteSignature;
        for(int i=0;i<bin.Length-sig.Length;i++){
            if(recovery){
                if(!CompareMemory(bin,i+6,sig)||i+6>bin.Length)continue;
                return KeyAt(bin,i,seed);
            }
            if(!CompareMemory(bin,i,sig))continue;
            for(int j=i+sig.Length;j<bin.Length-10;j++){
                if(bin[j+8]!=0xEE||(bin[j+9]!=0&&bin[j+9]!=0xFF))continue;
                return KeyAt(bin,j,seed);
            }
        }
        return null;
    }
    private static byte[] KeyAt(byte[] bin,int pos,byte[] seed)
    {
        if(pos<0||pos+6>bin.Length)throw new ArgumentOutOfRangeException(nameof(pos));
        ushort n=(ushort)((seed[0]<<8)|seed[1]);
        ushort a=(ushort)((bin[pos+1]<<8)|bin[pos]);
        ushort b=(ushort)((bin[pos+3]<<8)|bin[pos+2]);
        ushort c=(ushort)((bin[pos+5]<<8)|bin[pos+4]);
        ushort x=unchecked((ushort)(b*(n+a)));
        int key=unchecked((ushort)(x+(c>0?n%c:n)));
        return new[]{(byte)(key>>8),(byte)key};
    }
}
public sealed record BinProfile(string Type,int? StartOffset,int? ChecksumOffset,
    string StartText,string ChecksumText,bool ShindengenAuto);

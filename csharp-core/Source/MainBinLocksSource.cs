using System;
using System.Collections.Generic;
using System.Linq;

namespace CSharpCoreBrowser.Source;

// FormMain.cs LockRead 48/64KB and LockMode 48/64KB.
// Both operate on CLONES: no source BIN mutation, no USB communication.
// The original code modifies binBytes and uses undo lists. The immutable
// browser inspection returns the edited copy; caller may save it separately.
public static class MainBinLocksSource
{
    private static readonly byte[][] ModeSearch48={
        new byte[]{163,3,16,32,0},new byte[]{163,3,16,32,3},
        new byte[]{163,75,0,81,0},new byte[]{179,33,16,40,0},
        new byte[]{242,33,16,107,0},new byte[]{35,75,0,85,0},
        new byte[]{99,75,0,85,0}};
    private static readonly byte[][] ModeReplace48={
        new byte[]{131,3,0,32,0},new byte[]{130,3,0,32,0},
        new byte[]{163,75,0,81,0},new byte[]{146,33,0,40,0},
        new byte[]{146,33,0,40,0},new byte[]{3,75,16,85,0},
        new byte[]{3,75,16,85,0}};
    private static readonly byte[][] ModeSearch64={
        new byte[]{163,3,16,32,16},new byte[]{163,3,16,32,0},
        new byte[]{163,32,16,32,16},new byte[]{163,0,16,32,16},
        new byte[]{131,3,16,32,16},new byte[]{179,3,16,32,0}};
    private static readonly byte[][] ModeReplace64={
        new byte[]{131,3,0,32,0},new byte[]{131,3,18,32,0},
        new byte[]{131,2,18,32,18},new byte[]{131,0,0,32,0},
        new byte[]{131,3,18,32,18},new byte[]{147,3,18,32,0}};
    private static void RequireSourceSize(byte[] bin){
        if(bin is null||bin.Length!=49152&&bin.Length!=65536)
            throw new ArgumentException("FormMain source Lock only accepts 48 KiB and 64 KiB BIN");
    }
    public static MainLockResult LockReadCopy(byte[] bin){
        RequireSourceSize(bin);
        var clone=(byte[])bin.Clone();
        var old=new byte[]{65,114,110};
        var next=new byte[]{66,114,110};
        int pos=MainBinSource.FindPatternInBin(clone,old);
        if(pos<0)return new(clone,0,"Not found");
        Array.Copy(next,0,clone,pos,3);
        return new(clone,1,"LockRead first source match @0x"+pos.ToString("X"));
    }
    public static MainLockResult LockModeCopy(byte[] bin){
        RequireSourceSize(bin);
        var clone=(byte[])bin.Clone();
        var find=bin.Length==49152?ModeSearch48:ModeSearch64;
        var put=bin.Length==49152?ModeReplace48:ModeReplace64;
        int changedBytes=0,matches=0;
        // The source loops over patterns in sequence and mutates the same
        // cloned buffer before considering the next pattern.
        for(int i=0;i<find.Length;i++){
            byte[] needle=find[i],replacement=put[i];
            for(int pos=0;pos<=clone.Length-needle.Length;pos++){
                if(!clone.AsSpan(pos,needle.Length).SequenceEqual(needle))continue;
                for(int j=0;j<replacement.Length;j++){
                    if(clone[pos+j]!=replacement[j])changedBytes++;
                    clone[pos+j]=replacement[j];
                }
                matches++;
            }
        }
        return new(clone,changedBytes,matches+" source LockMode matches");
    }
}
public sealed record MainLockResult(byte[] Bytes,int ChangedBytes,string Description);

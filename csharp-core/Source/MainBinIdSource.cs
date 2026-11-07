using System;
using System.Collections.Generic;
using System.Linq;

namespace CSharpCoreBrowser.Source;

// FormMain.cs SearchBinFileForPattern + SearchPattern32/48/56/64/96/
// 128/256/384/512/768/1024KB. The unusual non-adjacent marker check
// addresses (e.g. 512KB at 11127 for data at 11122) are kept as source.
// A match is BIN FILE evidence ONLY, not a physical ECU or family ID.
public static class MainBinIdSource
{
    private sealed record Rule(int MarkerOffset,int DataOffset,int DataSize,string PrefixHex);
    private static readonly Dictionary<int,Rule[]> Rules=new(){
        [32768]=new[]{new Rule(31952,31956,5,"FF000000"),new(38857,38861,5,"8C0FA000"),new(38856,38861,5,"8C0FA000")},
        [49152]=new[]{new Rule(38809,38813,5,"8C0FA000"),new(38857,38861,5,"8C0FA000"),new(38856,38861,5,"8C0FA000")},
        [57344]=new[]{new Rule(50120,50124,5,"00000000"),new(31870,31874,5,"FF000000"),new(49564,49568,5,"00000000")},
        [65536]=new[]{
            new Rule(9140,9144,5,"00000000"),new(11127,11122,5,"000000FF"),
            new(9736,9740,5,"00000000"),new(11150,11154,5,"00000000"),
            new(10298,10302,5,"00000000"),new(11150,9740,5,"00000000"),
            new(9106,9110,5,"00000000")},
        [98304]=new[]{
            new Rule(15947,15951,5,"00000000"),new(15694,15698,5,"00FFA015"),
            new(12847,12851,5,"00000000"),new(15679,15683,5,"00000000"),
            new(15796,15800,5,"00000000"),new(12124,12128,5,"00000000")},
        [131072]=new[]{
            new Rule(55925,55929,5,"9F01FF00"),new(55904,55908,5,"9F01FF00"),
            new(56163,56167,5,"9F01FF00")},
        [262144]=new[]{
            new Rule(2044,2048,3,"00000000"),new(1924,1928,3,"FFFFFFFF"),
            new(224460,224455,3,"00202020")},
        [393216]=new[]{
            new Rule(1924,1928,3,"FFFFFFFF"),new(2044,2048,3,"00000000")},
        [524288]=new[]{
            new Rule(99412,99416,5,"3ABC33FF"),new(11127,11122,5,"000000FF"),
            new(9149,9144,5,"000200FF")},
        [786432]=new[]{
            new Rule(779178,779182,5,"00000000"),new(777562,777566,5,"00000000"),
            new(9149,9144,5,"000200FF")},
        [1048576]=new[]{
            new Rule(9149,9144,5,"000000FF"),new(11127,11122,5,"000000FF"),
            new(9149,9144,5,"000200FF")}
    };
    public static MainBinIdResult Find(byte[] bin)
    {
        if(bin is null)throw new ArgumentNullException(nameof(bin));
        if(!Rules.TryGetValue(bin.Length,out var rules))
            return new(false,"",null,null,"FormMain.cs has no BIN ID pattern for this size");
        MainBinIdResult? first56=null;
        foreach(var r in rules){
            if(r.MarkerOffset<0||r.MarkerOffset+4>bin.Length||r.DataOffset<0||
                r.DataOffset+r.DataSize>bin.Length)continue;
            if(!bin.AsSpan(r.MarkerOffset,4).SequenceEqual(Convert.FromHexString(r.PrefixHex)))
                continue;
            var found=new MainBinIdResult(true,
                BitConverter.ToString(bin,r.DataOffset,r.DataSize).Replace("-",""),
                r.DataOffset,r.MarkerOffset,"FormMain SearchPattern"+bin.Length/1024+"KB source marker");
            // The 56KB original first candidate writes BIN ID but does not
            // return; a later match overrides it. Preserve that quirk.
            if(bin.Length==57344 && r==rules[0]){first56=found;continue;}
            return found;
        }
        // FormMain's 56KB method writes the no-match label at the end even
        // if its first rule matched but the two later rules did not.
        return new(false,"",null,null,
            "No matching FormMain source BIN ID marker (file still opens)");
    }
}
public sealed record MainBinIdResult(bool Found,string IdHex,int? Offset,
    int? MarkerOffset,string Evidence);

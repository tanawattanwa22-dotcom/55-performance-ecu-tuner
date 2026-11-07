using System;
using System.Linq;
using System.Collections.Generic;

namespace CSharpCoreBrowser.Source;

// FM_dtc.cs method_110 and method_111.
// Hex offsets below come DIRECTLY from method_110's string_9.Substring(...)
// offsets: num2*2+18, num2*2+40 and num2*2+62.
// This is a raw capture parser, not a DTC clear/write implementation.
public static class MainDtcSource
{
    public static readonly byte[][] ReadFrames={
        new byte[]{0x72,5,0x74,1,0x14},
        new byte[]{0x72,5,0x74,2,0x13},
        new byte[]{0x72,5,0x74,3,0x12},
        new byte[]{0x72,5,0x73,1,0x15},
        new byte[]{0x72,5,0x73,2,0x14},
        new byte[]{0x72,5,0x73,3,0x13}
    };
    public static readonly byte[][] ClearFrames={
        new byte[]{0x72,5,0x60,3,0x26},
        new byte[]{0x72,5,0x60,1,0x28}
    };
    // Source description from FM_dtc.method_111 (condensed labels).
    private static readonly Dictionary<int,string> CodeText=new(){
        [1]="MAP circuit",[2]="MAP performance",[7]="ECT/EOT temperature circuit",
        [8]="TPS circuit/performance",[9]="IAT circuit",[10]="MAP circuit",
        [11]="VSS speed",[12]="Injector 1",[14]="Injector 3",[15]="Injector 4",
        [16]="Secondary injector 1",[17]="Secondary injector 2",
        [18]="CAM pulse missing",[19]="Ignition pulse missing",[20]="EEPROM failure",
        [21]="O2 circuit 1",[22]="O2 circuit 2",[23]="O2 heater 1",
        [24]="O2 heater 2",[29]="IACV idle-air control",[33]="EEPROM failure",
        [52]="CKP circuit",[54]="Bank angle sensor",[57]="ECT circuit",
        [71]="Throttle position signal 1",[72]="Throttle position signal 2",
        [73]="Throttle sensor synchronisation",[82]="FISV",[88]="EVAP",
        [89]="AISV/secondary air",[91]="Ignition coil primary",[103]="ECM to dashboard CAN"
    };
    public static string Describe(int major)=>CodeText.TryGetValue(major,out var d)?
        d:"No original source description for code "+major;
    public static List<MainDtc> DecodeSourceCaptureHex(string hex,bool historical)
    {
        var bytes=MainProtocol.ParseHex(hex);
        if(bytes.Length<=35)throw new ArgumentException("FM_dtc source capture too short");
        var values=new int[19];
        var items=new List<MainDtc>();
        for(int i=1;i<=18;i++){
            int pos=i<7?i+9:i<13?i+20:i+31;
            if(pos>=bytes.Length)throw new ArgumentException("FM_dtc source HEX capture lacks byte "+pos);
            values[i]=bytes[pos];
            // Unlike generic OBD2 DTC, source pairs are displayed as 'major-minor'.
            if(values[i]==0&&values[i-1]==0)break;
            if((i&1)==0){
                int major=values[i-1],minor=values[i];
                items.Add(new(major,minor,major+"-"+minor,Describe(major),historical));
            }
        }
        return items;
    }
}
public sealed record MainDtc(int Major,int Minor,string Code,string Description,bool Historical);

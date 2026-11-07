using System;
using System.Collections.Generic;
namespace CSharpCoreBrowser.Source;

/// <summary>
/// Raw command bytes transcribed from owner's original FormMain.cs
/// KeihinPreWriteFlash, ShindengenPreWriteFlash, WriteFlash, WorkerThread.
/// Command sequences belong to C# core. Browser bridge only transports bytes.
/// </summary>
public static class MainFlashCommands
{
    public static readonly byte[] Wake={0xFE,0x04,0x72,0x8C};
    public static readonly byte[] Hello={0x72,0x05,0,0xF0,0x99};
    public static readonly byte[] EcuId={0x72,7,0x72,0,0,5,0x10};
    public static readonly byte[] KhCount={0x7D,6,1,1,3,0x78};
    public static readonly byte[] ShCount={0x7B,6,2,1,3,0x79};
    public static readonly byte[] KhPoll={0x7E,6,1,1,0,0x7A};
    public static readonly byte[] ShPoll={0x7C,6,2,1,0,0x7B};
    public static readonly byte[] KhHello1={0x7D,8,1,2,0x50,0x47,0x4D,0x94};
    public static readonly byte[] KhHello2={0x7D,8,1,3,0x2D,0x46,0x49,0xBB};
    public static readonly byte[] KhPrepare={0x7E,5,1,2,0x7A};
    public static readonly byte[] KhEraseParam={0x7E,7,1,3,0,0,0x77};
    public static readonly byte[] KhEraseRange={0x7E,11,1,11,0,0,0,255,255,255,0x6E};
    public static readonly byte[] KhEraseGo={0x7E,7,1,14,1,0x90,0xDB};
    public static readonly byte[] KhEraseStatus={0x7E,6,1,4,0xFF,0x78};
    public static readonly byte[] KhEraseFinish={0x7E,5,1,5,0x77};
    public static readonly byte[] KhFlush={0x7E,5,1,7,0x75};
    public static readonly byte[] KhFinish1={0x7E,5,1,8,0x74};
    public static readonly byte[] KhFinish2={0x7E,5,1,9,0x73};
    public static readonly byte[] KhFinish3={0x7E,5,1,10,0x72};
    public static readonly byte[] KhFinish4={0x7E,5,1,12,0x70};
    public static readonly byte[] KhFinish5={0x7E,5,1,13,0x6F};
    public static readonly byte[] ShHello1={0x7B,8,2,2,0x50,0x19,0x76,0x9A};
    public static readonly byte[] ShHello2={0x7B,8,2,3,0x25,0x37,0x86,0x96};
    public static readonly byte[] ShSeed={0x7B,5,2,4,0x7A};
    public static readonly byte[] ShErase1={0x7C,6,2,1,0,0x7B};
    public static readonly byte[] ShErase2={0x7C,11,2,11,0,0,0,255,255,255,0x6F};
    public static readonly byte[] ShErase3={0x7C,7,2,14,1,0,0x6C};
    public static readonly byte[] ShEraseStatus={0x7C,6,2,4,0xFF,0x79};
    public static readonly byte[] ShEraseFinish={0x7C,5,2,5,0x78};
    public static readonly byte[] ShFinish1={0x7C,5,2,8,0x75};
    public static readonly byte[] ShFinish2={0x7C,5,2,9,0x74};
    public static readonly byte[] ShFinish3={0x7C,5,2,10,0x73};
    public static readonly byte[] ShFinish4={0x7C,5,2,12,0x71};
    public static readonly byte[] ShFinish5={0x7C,5,2,13,0x70};
    public static readonly byte[] FastSwitch={0xFF,0x25,0,0x20,0x7C,0};
    public static byte[] ShResponseKey(byte[] key)
    {
        if(key is null||key.Length!=2)throw new ArgumentException("Shindengen source challenge requires two-key bytes");
        byte[] frame={0x7B,7,2,5,key[0],key[1],0};
        frame[^1]=MainProtocol.Checksum8BitHonda(frame,frame.Length-1);
        return frame;
    }
    public static IEnumerable<(string Name,byte[] Value)> AllHondaFrames()
    {
        var fields=typeof(MainFlashCommands).GetFields(System.Reflection.BindingFlags.Public|System.Reflection.BindingFlags.Static);
        foreach(var field in fields)
            if(field.GetValue(null) is byte[] frame && frame!=FastSwitch)
                yield return (field.Name,frame);
    }
}

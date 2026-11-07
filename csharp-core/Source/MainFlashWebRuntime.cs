using System;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.JSInterop;

namespace CSharpCoreBrowser.Source;

/// <summary>
/// The UI invokes this C# state machine by DotNet.invokeMethodAsync.
/// Browser JavaScript is transport ONLY; flash decisions remain in C#.
/// The PARENT HTML owns the single FT232R USB port and its FLASH lock.
/// </summary>
public static class MainFlashWebRuntime
{
    private static IJSRuntime? _js;
    private static bool _busy;
    public static void Initialize(IJSRuntime js) => _js=js;
    [JSInvokable("MainCSharpReady")]
    public static string Ready() => "MAIN_CSHARP_WASM_SOURCE_FLASH_V1";
    [JSInvokable("RunSourceCSharpFlash")]
    public static async Task<MainFlashResult> RunSourceCSharpFlash(string json)
    {
        if(_busy)throw new InvalidOperationException("Another C# ECU flash is active");
        if(_js is null)throw new InvalidOperationException("C# WASM JS transport unavailable");
        if(string.IsNullOrWhiteSpace(json))throw new ArgumentException("Main source plan missing");
        _busy=true;
        try{
            var transfer=JsonSerializer.Deserialize<SourceBrowserPlan>(json,
                new JsonSerializerOptions{PropertyNameCaseInsensitive=true})??
                throw new ArgumentException("Cannot parse validated source plan");
            var bin=Convert.FromBase64String(transfer.BinBase64??"");
            var plan=new MainFlashPlan(
                transfer.EcuId??"", transfer.Profile??"",
                transfer.Family??"",transfer.PartCode,
                bin,transfer.StartOffset,transfer.ChecksumOffset,
                transfer.Fast,transfer.PhysicalFamilyConfirmed,
                transfer.InitialFlashCount,false,transfer.Handshake??"AUTO");
            var transport=new MainFlashWebUsb(_js);
            var writer=new MainFlashSourceEngine(transport);
            return await writer.FlashAsync(plan);
        }finally{_busy=false;}
    }
}
public sealed class SourceBrowserPlan
{
    public string? EcuId {get;set;}
    public string? Profile {get;set;}
    public string? Family {get;set;}
    public string? PartCode {get;set;}
    public string? BinBase64 {get;set;}
    public int StartOffset {get;set;}
    public int ChecksumOffset {get;set;}
    public bool Fast {get;set;}
    public bool PhysicalFamilyConfirmed {get;set;}
    public int? InitialFlashCount {get;set;}
    public string? Handshake {get;set;}
}
public sealed class MainFlashWebUsb : IMainFlashTransport {
    private readonly IJSRuntime _js;
    public MainFlashWebUsb(IJSRuntime js) => _js=js;
    public async Task<byte[]?> ExchangeAsync(string label,byte[] frame,int timeoutMs,
        int afterWriteMs=0){
        string value=await _js.InvokeAsync<string>("csharpHost.flashExchange",
            label,MainProtocol.Hex(frame),timeoutMs,afterWriteMs);
        return string.IsNullOrWhiteSpace(value)?null:MainProtocol.ParseHex(value);
    }
    public Task ReopenSameUsbBeforeEraseAsync() =>
        _js.InvokeVoidAsync("csharpHost.flashReopenBeforeErase").AsTask();
    public Task SetBaudAsync(int baud) =>
        _js.InvokeVoidAsync("csharpHost.flashBaud",baud).AsTask();
    public Task SignalAsync(string phase,object? details=null) =>
        _js.InvokeVoidAsync("csharpHost.flashSignal",phase,details).AsTask();
    public Task DelayAsync(int milliseconds) => Task.Delay(milliseconds);
}

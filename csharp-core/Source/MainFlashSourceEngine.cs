using System;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Linq;

namespace CSharpCoreBrowser.Source;

/// <summary>
/// Main.zip FormMain.cs WorkerThread + KeihinPreWriteFlash and
/// ShindengenPreWriteFlash migrated to browser-compatible asynchronous C#.
/// USB transfer/FTDI D2XX is replaced by an injected WebUSB adapter.
/// Delays use Task.Delay instead of WinForms Thread.Sleep.
/// Source command order and raw reply byte decisions are explicit.
/// </summary>
public interface IMainFlashTransport {
    Task<byte[]?> ExchangeAsync(string label,byte[] frame,int timeoutMs,int afterWriteMs=0);
    Task SetBaudAsync(int baud);
    Task ReopenSameUsbBeforeEraseAsync();
    Task SignalAsync(string phase,object? values=null);
    Task DelayAsync(int milliseconds);
}
public sealed record MainFlashPlan(
    string EcuId,string Profile,string Family,string? PartCode,
    byte[] Bin,int StartOffset,int ChecksumOffset,
    bool Fast,bool PhysicalFamilyConfirmed,int? InitialFlashCount,
    bool Recovery=false,string Handshake="AUTO");
public sealed record MainFlashResult(bool Ok,string Phase,string EcuId,
    int BlocksSent,bool ReadbackVerified,bool NeedRestart,bool EraseMayHaveStarted);
public sealed class MainFlashException : Exception {
    public string Code {get;}
    public bool EraseMayHaveStarted {get;}
    public MainFlashException(string code,string message,bool erase)
        :base(message){Code=code;EraseMayHaveStarted=erase;}
}

public sealed partial class MainFlashSourceEngine {
    private readonly IMainFlashTransport _usb;
    private MainFlashPlan _plan=null!;
    private bool _eraseMayHaveStarted=false;
    private bool _fastBaud=false;
    private int _sourceRetryBudget=2;
    public MainFlashSourceEngine(IMainFlashTransport transport){
        _usb=transport??throw new ArgumentNullException(nameof(transport));
    }
    private void Fail(string code,string message) =>
        throw new MainFlashException(code,message,_eraseMayHaveStarted);
    private async Task Emit(string phase,object? detail=null) =>
        await _usb.SignalAsync(phase,detail);
    private async Task<byte[]> Command(string name,byte[] frame,int timeout=2500,
        int delayMs=0){
        byte[]? received;
        await Emit(name,new{stage="TX",tx=MainProtocol.Hex(frame),
            txBytes=frame.Length,requestedTimeoutMs=timeout});
        try{received=await _usb.ExchangeAsync(name,frame,timeout,delayMs);}
        catch(Exception e){await Emit("COMMAND_FAILED",new{command=name,error=e.Message});
            Fail("USB_OR_ECU_TIMEOUT",name+": "+e.Message);throw;}
        if(received is null||received.Length<3||received[1]!=received.Length||
            !MainProtocol.ValidateChecksum(received,received.Length))
            Fail("INVALID_ECU_ACK",name+": reply length/checksum invalid");
        await Emit(name,new{stage="RX",rx=MainProtocol.Hex(received!),
            replyLength=received!.Length,rawByte3=received.Length>=4?(int?)received[3]:null});
        return received!;
    }
    // In purchased C# some SendCommand bool results are ignored; on Android
    // WebUSB a failed pending bulk transfer can close the interface. Abort on
    // transport failure instead of sending the next destructive command to
    // a possibly invalid USB session. This difference is intentional.
    private Task<byte[]> SourceUnchecked(string name,byte[] frame,int timeout=3000,
        int delayMs=0)=>Command(name,frame,timeout,delayMs);
    private async Task<byte[]> RequireStatus(string name,byte[] frame,byte code,int timeout=5000,
        int delayMs=0){
        var r=await Command(name,frame,timeout,delayMs);
        if(r.Length<5||r[3]!=code)Fail("ECU_STATUS_REJECTED",
            name+": expected 0x"+code.ToString("X2")+" got "+
            (r.Length<5?"short reply":"0x"+r[3].ToString("X2")));
        return r;
    }
    private void ValidatePlan(MainFlashPlan plan){
        if(plan is null || plan.Bin is null || plan.Bin.Length==0)
            Fail("BAD_PLAN","Source flash requires a validated BIN");
        // Browser FT232R 921600 switch has not been proven to preserve the
        // purchased D2XX timing. The primary UI already requests normal
        // baud for this profile; enforce that here before ANY ECU command.
        if(plan.Fast && plan.Profile=="KEIHINOTHER")
            Fail("FAST_SWITCH_NOT_PROVEN",
                "KeihinOther 921600 fast switch has no verified WebUSB source parity; choose normal speed before Flash");
        if(plan.Recovery)Fail("RECOVERY_PATH_NOT_MIGRATED",
            "Use the separate verified Recovery page; do not guess boot identity.");
        if(plan.EcuId is null||plan.EcuId.Length!=10||
            !plan.EcuId.All(Uri.IsHexDigit))Fail("BAD_ECU_ID","Physical ECU ID invalid");
        if(plan.EcuId.EndsWith("0000",StringComparison.OrdinalIgnoreCase))
            Fail("RECOVERY_BOOT","Recovery boot detected: normal flash forbidden");
        if(!plan.PhysicalFamilyConfirmed)
            Fail("FAMILY_NOT_VERIFIED","No physical ECU Family/Flash Count proof");
        if(plan.Family!=(MainWritePlanSource.IsShindengen(plan.Profile)?"SHINDENGEN":"KEIHIN"))
            Fail("PROFILE_FAMILY_MISMATCH","Flash source profile mismatched ECU Family");
        // Main.zip may fall back to normal baud if the special fast command
        // lacks ACK, because native D2XX keeps its RX queue alive.
        // Android WebUSB closes an orphan transferIn on timeout. After ERASE
        // an unsupported fast-switch command could strand the write session.
        // Until that exact ECU has a validated switch response on Android,
        // require normal speed BEFORE sending any destructive command.
        if(plan.Fast && plan.Profile=="KEIHINOTHER")
            Fail("FAST_SWITCH_NOT_PROVEN",
                "C# KeihinOther: ปิด Fast Write ก่อนทดสอบ เพราะ WebUSB อาจปิดพอร์ตเมื่อคำสั่งสลับ 921600 ไม่ตอบ หลัง ERASE");
        var row=MainCatalogSource.Lookup(plan.EcuId);
        if(row is not null && row.Family!=plan.Family)
            Fail("CATALOG_FAMILY_MISMATCH","Original Main 290 catalog Family differs");
        if(row?.PartCode is string expected && !string.Equals(
            expected,plan.PartCode,StringComparison.OrdinalIgnoreCase))
            Fail("PART_CODE_MISMATCH","Source Part Code differs from preflight plan");
        int block=MainWritePlanSource.BlockSize(plan.Profile);
        if(!MainBinSource.SourceBinSizes.Contains(plan.Bin.Length)||plan.Bin.Length%block!=0)
            Fail("BIN_SIZE","BIN size not in original 11 supported sizes");
        if(plan.StartOffset<0||plan.StartOffset%16!=0)
            Fail("START_OFFSET","Start Offset not 16-byte aligned");
        if(plan.ChecksumOffset<0||plan.ChecksumOffset>=plan.Bin.Length)
            Fail("CHECKSUM_OFFSET","Checksum Offset outside selected BIN");
        // C# source BIN packet traversal must succeed BEFORE destructive TX.
        MainWritePlanSource.Audit(plan.Bin,plan.Profile,plan.StartOffset,1);
        // Reject different C# and JS firmware checksum calculations BEFORE ERASE.
        // The owner originally confirmed the BIN in the existing preflight UI.
        if(MainWritePlanSource.IsShindengen(plan.Profile)){
            var corrected=MainBinSource.ShindengenChecksumCopy(plan.Bin);
            if(corrected is null||!corrected.Bytes.AsSpan().SequenceEqual(plan.Bin))
                Fail("SOURCE_CHECKSUM_MISMATCH","Shindengen source checksum does not match selected BIN");
        }else{
            var corrected=MainBinSource.KeihinChecksumCopy(plan.Bin,plan.ChecksumOffset);
            if(!corrected.AsSpan().SequenceEqual(plan.Bin))
                Fail("SOURCE_CHECKSUM_MISMATCH","Keihin source checksum does not match selected BIN");
        }
    }
    private async Task RecheckPhysicalIdentity(){
        // C# source WorkerThread/SendCommand physical ECU read, not UI cached ID.
        try{
            await SourceUnchecked("RECHECK_HELLO",
                _plan.Handshake=="KEIHIN_POLL"?MainFlashCommands.KhPoll:MainFlashCommands.Hello,
                1600);
            var id=await Command("RECHECK_ECU_ID",MainFlashCommands.EcuId,1600);
            if(id.Length<11)Fail("ECU_ID_INVALID","Physical ECU ID response shorter than 11 bytes");
            var physical=MainProtocol.Hex(id.AsSpan(5,5).ToArray());
            if(!physical.Equals(_plan.EcuId,StringComparison.OrdinalIgnoreCase))
                Fail("ECU_ID_CHANGED","Connected ECU changed: "+physical);
            byte[] countFrame=_plan.Family=="SHINDENGEN"?
                MainFlashCommands.ShCount:MainFlashCommands.KhCount;
            var count=await Command("RECHECK_FAMILY_FLASH_COUNT",countFrame,2500);
            if(count.Length<8||count[3]==15)
                Fail("FAMILY_PROOF_LOST","ECU programming family count reply invalid");
            if(_plan.InitialFlashCount is int before && count[6]!=before)
                Fail("FLASH_COUNT_CHANGED","ECU flash-count changed before ERASE");
            await Emit("CSHARP_RECHECK_CONFIRMED",new{
                ecuId=physical,family=_plan.Family,count=count[6],eraseSent=false
            });
        }catch(MainFlashException){throw;}
        catch(Exception e){Fail("RECHECK_FAILED",e.Message);}
    }
    private async Task Countdown(string family){
        for(int seconds=10;seconds>=1;seconds--){
            await Emit(family=="KEIHIN"?"SECURITY_WAIT":"SH_SECURITY_WAIT",
                new{secondsRemaining=seconds});
            await _usb.DelayAsync(1000);
        }
        await Emit("SECURITY_WAIT",new{secondsRemaining=0});
        await _usb.DelayAsync(500);
    }
    private async Task KeihinPreWriteFlash(){
        await Emit("PREWRITE_BEGIN",new{profile=_plan.Profile});
        // FormMain retries the FIRST 7D hello once after 500ms.
        // Do not retransmit if the WebUSB transfer state is unknown; the
        // bridge closes the port on a timed-out transfer. Abort in that case.
        bool khFirstAccepted=false;
        try{
            await SourceUnchecked("KH_HANDSHAKE_A",MainFlashCommands.KhHello1,2500);
            khFirstAccepted=true;
        }catch(MainFlashException firstError){
            if(_eraseMayHaveStarted)throw;
            await Emit("KH_HANDSHAKE_SOURCE_RETRY",new{
                attempt=2,maxAttempts=2,firstError=firstError.Message,
                eraseStarted=false});
            await _usb.DelayAsync(500);
            // Browser transferIn cannot be cancelled: reopen only the SAME
            // approved FT232R, reproduce InitFtdiIso and SOURCE wake, and
            // re-read the SAME physical ECU ID/Flash Count before retrying.
            await _usb.ReopenSameUsbBeforeEraseAsync();
            await RecheckPhysicalIdentity();
            await SourceUnchecked("KH_HANDSHAKE_A_RETRY",MainFlashCommands.KhHello1,2500);
            khFirstAccepted=true;
        }
        if(khFirstAccepted)
            await SourceUnchecked("KH_HANDSHAKE_B",MainFlashCommands.KhHello2,2500);
        await _usb.DelayAsync(200);
        await SourceUnchecked("KH_READY",MainFlashCommands.KhPoll,2500);
        await Countdown("KEIHIN");
        await Emit("ERASE_BEGIN",new{profile=_plan.Profile});
        _eraseMayHaveStarted=true;
        await SourceUnchecked("KH_PREPARE",MainFlashCommands.KhPrepare,2400,250);
        await SourceUnchecked("KH_ERASE_PARAM",MainFlashCommands.KhEraseParam,2400);
        await SourceUnchecked("KH_POLL_1",MainFlashCommands.KhPoll,2400);
        await SourceUnchecked("KH_ERASE_RANGE",MainFlashCommands.KhEraseRange,3200);
        await SourceUnchecked("KH_POLL_2",MainFlashCommands.KhPoll,2400);
        await SourceUnchecked("KH_ERASE_GO",MainFlashCommands.KhEraseGo,2500);
        await RequireStatus("KH_ERASE_STATUS",MainFlashCommands.KhEraseStatus,0,5000);
        await _usb.DelayAsync(2000);
        await RequireStatus("KH_ERASE_FINISH",MainFlashCommands.KhEraseFinish,0,5000,250);
        await SourceUnchecked("KH_POLL_3",MainFlashCommands.KhPoll,2400);
        await Emit("ERASE_ACKNOWLEDGED");
    }
    private async Task ShindengenPreWriteFlash(){
        await Emit("PREWRITE_BEGIN",new{profile=_plan.Profile});
        int delay=_plan.Fast?0:150;
        await SourceUnchecked("SH_HANDSHAKE_A",MainFlashCommands.ShHello1,3000,delay);
        await SourceUnchecked("SH_HANDSHAKE_B",MainFlashCommands.ShHello2,3000,delay);
        await Countdown("SHINDENGEN");
        var seed=await Command("SH_SEED",MainFlashCommands.ShSeed,3000,delay);
        if(seed.Length!=7||seed[3]!=0)
            Fail("SEED_REJECTED","Shindengen seed response length/status mismatch");
        var key=MainBinSource.DeriveShindengenKey(_plan.Bin,new[]{seed[4],seed[5]},false);
        if(key is null)Fail("SEED_KEY_MISSING","No original Main Shindengen write-key in BIN");
        await RequireStatus("SH_KEY",MainFlashCommands.ShResponseKey(key!),0,3000,delay);
        await Emit("SH_ERASE_BEGIN");
        _eraseMayHaveStarted=true;
        await SourceUnchecked("SH_PRE_ERASE_A",MainFlashCommands.ShErase1,3500,delay);
        await SourceUnchecked("SH_ERASE_RANGE",MainFlashCommands.ShErase2,3500,delay);
        await SourceUnchecked("SH_ERASE_MODE",MainFlashCommands.ShErase3,3500,delay);
        await RequireStatus("SH_ERASE_STATUS",MainFlashCommands.ShEraseStatus,0,5000,delay);
        await _usb.DelayAsync(2000);
        await RequireStatus("SH_ERASE_FINISH",MainFlashCommands.ShEraseFinish,0,5000,delay);
        await Emit("SH_ERASE_ACKNOWLEDGED");
    }
    public async Task<MainFlashResult> FlashAsync(MainFlashPlan plan){
        _plan=plan;
        ValidatePlan(plan);
        _sourceRetryBudget=2;_eraseMayHaveStarted=false;_fastBaud=false;
        try{
            await Emit("FLASH_START",new{ecuId=plan.EcuId,part=plan.PartCode,
                profile=plan.Profile,engine="MAIN_CSHARP_WASM"});
            await RecheckPhysicalIdentity();
            if(MainWritePlanSource.IsShindengen(plan.Profile))
                await ShindengenPreWriteFlash();
            else await KeihinPreWriteFlash();
            int blocks=await WriteBlocks();
            if(MainWritePlanSource.IsShindengen(plan.Profile))await ShindengenFinish();
            else await KeihinFinish();
            if(_fastBaud){await _usb.SetBaudAsync(10400);_fastBaud=false;}
            var result=new MainFlashResult(true,"SOURCE_FINAL_ACK",
                plan.EcuId,blocks,false,true,true);
            await Emit("FLASH_SOURCE_COMPLETE",result);
            return result;
        }catch(Exception ex){
            // Restore local UART mode if the FT232R USB interface is still
            // operational; do not transmit ANY additional ECU write command.
            if(_fastBaud){
                try{await _usb.SetBaudAsync(10400);}catch{}
                _fastBaud=false;
            }
            await Emit("FLASH_STOP",new{error=ex.Message,eraseMayHaveStarted=_eraseMayHaveStarted,
                recoveryRequired=_eraseMayHaveStarted});
            throw;
        }
    }
}

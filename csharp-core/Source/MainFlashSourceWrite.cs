using System;
using System.Linq;
using System.Threading.Tasks;

namespace CSharpCoreBrowser.Source;

public sealed partial class MainFlashSourceEngine
{
    /// <summary>
    /// FormMain.cs WriteFlash: source block format, source future-FF skip,
    /// global two-retry budget only for explicit seven-byte ECU reply,
    /// checksum-valid five-byte ACK (even nonzero byte3).
    /// </summary>
    private async Task<int> WriteBlocks(){
        int block=MainWritePlanSource.BlockSize(_plan.Profile);
        int total=_plan.Bin.Length/block;
        int first=MainWritePlanSource.IsShindengen(_plan.Profile)?
            _plan.StartOffset/block:0;
        int cursor=first,frames=0;
        if(first>=total)Fail("NO_BLOCKS","Main source write start exceeds BIN");
        await Emit("WRITE_ACK_POLICY",new{mode="source",
            fiveByteAckRequiresZeroStatus=false,globalExplicitRetryBudget=2});
        if(_plan.Fast&&_plan.Profile=="KEIHINOTHER"){
            // FormMain's special command has no valid Honda framed checksum
            // and is a separate baud-switch request, not a normal write block.
            var speedReply=await Command("KH_FAST_SWITCH",
                MainFlashCommands.FastSwitch,3000);
            if(speedReply.Length==5&&speedReply[3]==0){
                await _usb.SetBaudAsync(921600);
                _fastBaud=true;
                await Emit("FAST_BAUD_ENABLED",new{baud=921600});
            }else await Emit("FAST_BAUD_REFUSED",
                new{replyLength=speedReply.Length,rawByte3=speedReply.Length>=4?(int?)speedReply[3]:null});
        }else if(_plan.Fast){
            await Emit("FAST_IGNORED",new{profile=_plan.Profile,
                note="Source switches baud only for KEIHINOTHER"});
        }
        int delay=MainWritePlanSource.IsShindengen(_plan.Profile)&&!_plan.Fast?150:0;
        for(;cursor<total;){
            int next=MainWritePlanSource.NextSourceWriteIndex(_plan.Bin,cursor,_plan.Profile);
            int address=(_plan.StartOffset/16)+(cursor-first)*(block/16);
            int nextAddress=next==total?0:(_plan.StartOffset/16)+(next-first)*(block/16);
            var data=_plan.Bin.AsSpan(cursor*block,block).ToArray();
            var frame=MainProtocol.BuildOfflineWriteFrame(data,
                MainWritePlanSource.IsShindengen(_plan.Profile),address,nextAddress);
            if(!MainProtocol.ValidateChecksum(frame,frame.Length))
                Fail("GENERATED_WRITE_CHECKSUM","Source C# frame checksum mismatch");
            while(true){
                // A USB timeout after a write has unknown ECU outcome.
                // Never retransmit without an explicit valid source retry reply.
                var reply=await Command("WRITE_BLOCK_"+cursor,frame,7000,delay);
                var decision=MainProtocol.InspectWriteAck(reply);
                if(decision.Accept){
                    if(decision.RawByte3!=0)
                        await Emit("SOURCE_WRITE_ACK_NONZERO_UNINTERPRETED",new{
                            block=cursor,rawByte3=decision.RawByte3,
                            sourceAcceptsByLengthAndChecksum=true,readbackVerified=false});
                    await Emit("WRITE_BLOCK_ACK",new{
                        block=cursor,sourceReplyStatus=decision.RawByte3,
                        sourceRule="FORMMAIN_FIVE_BYTE_CHECKSUM_VALID",readbackVerified=false});
                    break;
                }
                if(decision.ExplicitRetry&&_sourceRetryBudget>0){
                    _sourceRetryBudget--;
                    await Emit("SOURCE_EXPLICIT_RETRY",new{
                        block=cursor,remaining=_sourceRetryBudget,
                        replyHex=MainProtocol.Hex(reply)});
                    continue;
                }
                Fail("WRITE_REJECTED","ECU refused block "+cursor+
                    " / ACK "+MainProtocol.Hex(reply)+
                    " / source retry budget "+_sourceRetryBudget);
            }
            if(block==64&&(cursor+1)%2==0){
                await SourceUnchecked("KH_H8C_FLUSH",MainFlashCommands.KhFlush,3000);
                await _usb.DelayAsync(100);
            }
            frames++;
            await Emit("WRITE_PROGRESS",new{
                bytesCovered=next*block,totalBytes=_plan.Bin.Length,
                percent=(int)Math.Floor((double)next*100/total),blocksSent=frames,
                sourceBlock=cursor,nextBlock=next,skipFutureFF=next>cursor+1});
            cursor=next;
        }
        if(frames==0)Fail("NO_WRITE","No Main source write block transmitted");
        if(block==64){
            await SourceUnchecked("KH_H8C_FINAL_FLUSH",MainFlashCommands.KhFlush,3000);
            await _usb.DelayAsync(100);
        }
        return frames;
    }

    private async Task KeihinFinish(){
        // FormMain.cs WriteFlash post-write Keihin sequence; only the
        // final F4 poll and final-5 status are required to equal 0x0F.
        await SourceUnchecked("KH_FINAL_1",MainFlashCommands.KhFinish1,4000);
        await _usb.DelayAsync(1000);
        await SourceUnchecked("KH_POLL_F1",MainFlashCommands.KhPoll,4000);
        await SourceUnchecked("KH_FINAL_2",MainFlashCommands.KhFinish2,4000);
        await _usb.DelayAsync(1000);
        await SourceUnchecked("KH_POLL_F2",MainFlashCommands.KhPoll,4000);
        await SourceUnchecked("KH_FINAL_3",MainFlashCommands.KhFinish3,4000);
        await _usb.DelayAsync(1000);
        await SourceUnchecked("KH_POLL_F3",MainFlashCommands.KhPoll,4000);
        await SourceUnchecked("KH_FINAL_4",MainFlashCommands.KhFinish4,4000);
        await _usb.DelayAsync(1000);
        await RequireStatus("KH_POLL_F4",MainFlashCommands.KhPoll,0x0F,4000);
        await RequireStatus("KH_FINAL_5",MainFlashCommands.KhFinish5,0x0F,4000);
        await Emit("FINAL_ACK_RECEIVED",new{family="KEIHIN",status="0F"});
    }

    private async Task ShindengenFinish(){
        // FormMain.cs WriteFlash Shindengen 8/9/10/12/13 and 1/1/1/3s.
        int delay=_plan.Fast?0:150;
        await SourceUnchecked("SH_FINAL1",MainFlashCommands.ShFinish1,6000,delay);
        await _usb.DelayAsync(1000);
        await SourceUnchecked("SH_FINAL2",MainFlashCommands.ShFinish2,6000,delay);
        await _usb.DelayAsync(1000);
        await SourceUnchecked("SH_FINAL3",MainFlashCommands.ShFinish3,6000,delay);
        await _usb.DelayAsync(1000);
        await SourceUnchecked("SH_FINAL4",MainFlashCommands.ShFinish4,6000,delay);
        await _usb.DelayAsync(3000);
        await RequireStatus("SH_FINAL5",MainFlashCommands.ShFinish5,0x0F,6000,delay);
        await Emit("SH_FINAL_ACK",new{family="SHINDENGEN",status="0F"});
    }
}

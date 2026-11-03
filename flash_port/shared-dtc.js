import {MAIN_DTC_READ_FRAMES,decodeMainDtcReplies} from './main-source-dtc.js?v=301';
import {MAIN_DTC_CLEAR_SOURCE} from './main-dtc-clear-source.js?v=301';
export async function readSharedDtc(port){
 const entries=[];
 for(const frame of MAIN_DTC_READ_FRAMES){
  const {reply}=await port.exchangeRaw(frame,{timeoutMs:2000,afterWriteMs:50});
  // Reject a missing/corrupt bank instead of reporting an empty fault memory.
  decodeMainDtcReplies([{cmd:frame[2],bank:frame[3],reply}]);
  entries.push({cmd:frame[2],bank:frame[3],reply});
 }
 return {rows:decodeMainDtcReplies(entries),entries};
}
export async function clearSharedDtc(port,wait=ms=>new Promise(r=>setTimeout(r,ms))){
 await port.sourceDiagnosticWake('dtc');
 // FM_dtc.method_107 sends bank 3 then bank 1; no bank 2 command.
 // Source does not establish an ACK format. Verify with all six read banks.
 for(const frame of [MAIN_DTC_CLEAR_SOURCE.clearFirst,MAIN_DTC_CLEAR_SOURCE.clearSecond]){
  await port.exchangeRaw(frame,{expectReply:false,afterWriteMs:50});
 }
 await wait(1000);
 const result=await readSharedDtc(port);
 return {...result,cleared:result.rows.length===0};
}

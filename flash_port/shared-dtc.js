import {MAIN_DTC_READ_FRAMES,decodeMainDtcReplies} from './main-source-dtc.js?v=301';
import {MAIN_DTC_CLEAR_SOURCE} from './main-dtc-clear-source.js?v=301';
export async function readSharedDtc(port){
 const entries=[];
 // FM_dtc.method_110 sends 0x74 bank 1/2/3 then 0x73 bank 1/2/3.
 // Each group is sent with 50ms pauses BEFORE method_11 reads UART.
 for(const cmd of [0x74,0x73]){
  const frames=MAIN_DTC_READ_FRAMES.filter(frame=>frame[2]===cmd);
  if(typeof port.exchangeMainDiagnosticBurst==='function'){
   const {entries:received}=await port.exchangeMainDiagnosticBurst(frames);
   if(received.length!==3)throw Error('Incomplete FM_dtc source bank burst');
   for(let i=0;i<frames.length;i++){
    const {reply,echoOK}=received[i];
    if(!echoOK)throw Error('DTC source UART echo mismatch');
    decodeMainDtcReplies([{cmd,bank:frames[i][3],reply}]);
    entries.push({cmd,bank:frames[i][3],reply});
   }
  }else{
   // Fake test ports retain the original frames and command order.
   for(const frame of frames){
    const {reply}=await port.exchangeRaw(frame,{timeoutMs:2000,afterWriteMs:50});
    decodeMainDtcReplies([{cmd,bank:frame[3],reply}]);
    entries.push({cmd,bank:frame[3],reply});
   }
  }
 }
 return {rows:decodeMainDtcReplies(entries),entries};
}
export async function clearSharedDtc(port,wait=ms=>new Promise(r=>setTimeout(r,ms))){
 await port.sourceDiagnosticWake('dtc');
 // FM_dtc.method_107 sends bank 3 then bank 1; no bank 2 command.
 // No clear ACK is checked by FM_dtc.method_107; method_110 later reads six DTC banks.
 const clearFrames=[MAIN_DTC_CLEAR_SOURCE.clearFirst,MAIN_DTC_CLEAR_SOURCE.clearSecond];
 if(typeof port.sendMainDtcClearFrames==='function'){
  // The C# clear method writes both commands before reading any data.
  await port.sendMainDtcClearFrames(clearFrames);
 }else{
  // In-memory source mocks retain the exact two frames and 50ms intervals.
  for(const frame of clearFrames)
   await port.exchangeRaw(frame,{expectReply:false,afterWriteMs:50});
 }
 await wait(1000);
 const result=await readSharedDtc(port);
 return {...result,cleared:result.rows.length===0};
}

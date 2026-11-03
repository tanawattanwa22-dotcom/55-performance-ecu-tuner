// FormMain.cs ResetFlashCountShindengen: exact fixed nonstandard 91 91 frames.
export const RESET_SH_COUNT_FRAMES=Object.freeze([
 Object.freeze([145,145,13,223,158,141,154,134,144,138,140,155,136]),
 Object.freeze([145,145,13,223,146,158,134,150,139,141,134,192,106]),
 Object.freeze([145,145,9,65,14,0,0,0,168])
]);
export function isSourceResetCountFrame(bytes){return RESET_SH_COUNT_FRAMES.some(f=>f.length===bytes.length&&f.every((b,i)=>b===bytes[i]));}
export async function resetShindengenCount(port,identity,wait=ms=>new Promise(r=>setTimeout(r,ms))){
 if(!identity?.sourceMatched||identity.family!=='SHINDENGEN')throw Error('ต้องอ่าน ID และยืนยัน Shindengen จากฐาน Main ก่อน');
 for(const frame of RESET_SH_COUNT_FRAMES){
  await port.exchangeRaw(frame,{timeoutMs:2000});await wait(100);
 }
 await wait(1000);
 return {sent:true,verified:false}; // Caller must power-cycle and read count again.
}

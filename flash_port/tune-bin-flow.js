/* 55 PERFORMANCE: exact immutable *snapshot by convention* of the downloaded BIN.
 * No device I/O and no firmware merging. Flash must use saved.bytes.slice().
 * The prepared checksum is the app's existing sum-to-zero export convention;
 * the Flash Engine performs its own ECU-specific preflight independently.
 */
(function(root){
 "use strict";
 const bytes=x=>x instanceof Uint8Array && x.length>0;
 function sum0Copy(input){
  if(!bytes(input))throw Error("ยังไม่มีข้อมูล BIN");
  const out=input.slice();
  let sum=0;for(let i=1;i<out.length;i++)sum=(sum+out[i])&255;
  out[0]=(256-sum)&255;
  return out;
 }
 function prepare(input,{model,sourceName,filename,checksumMode="sum0",customerBin=false}={}){
  if(!bytes(input))throw Error("ยังไม่มีข้อมูล BIN สำหรับบันทึก");
  if(!model||!filename||!sourceName)throw Error("ต้องระบุรุ่นและชื่อ BIN ให้ครบ");
  const output=checksumMode==="sum0"?sum0Copy(input):input.slice();
  const state={model:String(model),sourceName:String(sourceName),filename:String(filename),
    customerBin:!!customerBin,checksumMode,size:output.length,bytes:output,
    rawAtSave:input.slice(),savedAt:new Date().toISOString()};
  return state;
 }
 function matches(saved,current,{model,sourceName,customerBin}={}){
  if(!saved||!bytes(current)||saved.model!==model||
     saved.sourceName!==sourceName||saved.customerBin!==!!customerBin||
     !bytes(saved.rawAtSave)||saved.rawAtSave.length!==current.length)return false;
  for(let i=0;i<current.length;i++)if(current[i]!==saved.rawAtSave[i])return false;
  const prepared=saved.checksumMode==="sum0"?sum0Copy(current):current.slice();
  if(prepared.length!==saved.bytes.length)return false;
  for(let i=0;i<prepared.length;i++)if(prepared[i]!==saved.bytes[i])return false;
  return true;
 }
 root.TuneBinFlow=Object.freeze({sum0Copy,prepare,matches});
})(globalThis);

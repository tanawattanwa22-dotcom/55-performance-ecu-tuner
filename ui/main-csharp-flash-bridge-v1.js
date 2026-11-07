/*
 * Main.zip real C# flash orchestrator; runs inside existing main app.
 * The original homepage owns FT232R and Preflight. The child .NET WASM
 * engine makes ALL source command/ACK/Retry decisions; existing JS WebUSB
 * performs only USB transfer/control. No second picker/port/driver.
 * Not an automatic default; a technician explicitly opts in to C# Flash.
 */
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let runtimeFrame=null;
function base64(bytes){
 const view=Uint8Array.from(bytes);
 let text='';
 for(let i=0;i<view.length;i+=16384)
  text+=String.fromCharCode(...view.subarray(i,i+16384));
 return btoa(text);
}
async function ensureRuntime(){
 if(runtimeFrame&&!runtimeFrame.isConnected)runtimeFrame=null;
 if(!runtimeFrame){
  runtimeFrame=document.createElement('iframe');
  runtimeFrame.id='mainCSharpFlashRuntime';
  runtimeFrame.src=new URL('./main-csharp-runtime/',document.baseURI).href;
  runtimeFrame.title='Main.zip compiled C# WebAssembly flash runtime';
  runtimeFrame.setAttribute('aria-hidden','true');
  runtimeFrame.style.cssText='position:fixed;left:-3px;top:-3px;width:1px;height:1px;opacity:0;pointer-events:none;border:0;z-index:-1';
  document.body.append(runtimeFrame);
 }
 for(let attempt=0;attempt<90;attempt++){
  const child=runtimeFrame.contentWindow;
  if(child?.DotNet?.invokeMethodAsync){
   try{
    const ready=await child.DotNet.invokeMethodAsync('CSharpCoreBrowser','MainCSharpReady');
    if(ready==='MAIN_CSHARP_WASM_SOURCE_FLASH_V1')return child;
   }catch(_){/* runtime still booting or outdated; next attempt */}
  }
  await delay(250);
 }
 throw Error('C# WASM Runtime ไม่พร้อมหรือยังเผยแพร่ไม่สำเร็จ • ไม่มีการส่ง ERASE/WRITE');
}
export async function flashWithSourceCSharp(plan,identity,onEvent){
 if(window.__55CSharpFlashActive)throw Error('มี Main C# Flash session ทำงานแล้ว');
 const shared=window.__55SharedEcu;
 if(!shared?.port?.ready)throw Error('สาย FT232R ของโปรแกรมหลักไม่ได้เชื่อมต่อ');
 if(!window.__55RetailFlashState?.().busy)throw Error('ยังไม่ได้กดเริ่ม Flash ที่หน้าโปรแกรมหลัก');
 if(!plan||!(plan.bin instanceof Uint8Array)||
    !plan.ecuId||plan.ecuId!==identity?.ecuId)
  throw Error('C# Flash requires an ECU-validated plan from the primary Preflight');
 const confirmed=!!(identity.sourceMatched||
   (identity.programmingSessionVerified&&
    identity.physicalFamilyEvidence==='MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK'));
 if(!confirmed)throw Error('C# Flash: ECU family was not confirmed by the physical source ACK');
 // All prerequisites are checked before exposing the destructive transport.
 const child=await ensureRuntime();
 const payload={
  ecuId:plan.ecuId,profile:plan.profile,family:identity.family,
  partCode:plan.part||null,
  binBase64:base64(plan.bin),
  startOffset:plan.startOffset,checksumOffset:plan.checksumOffset,
  fast:!!plan.fast,physicalFamilyConfirmed:confirmed,
  initialFlashCount:Number.isInteger(identity.count)?identity.count:null,
  handshake:identity.handshake||'AUTO'
 };
 window.__55CSharpFlashActive=true;
 window.__55CSharpFlashReport=typeof onEvent==='function'?onEvent:null;
 window.__55CSharpFlashRawTrace=event=>{
  try{onEvent?.({phase:'CSHARP_USB_TRACE',...event})}catch(_){}
 };
 try{
  // .NET C# handles recheck, Keihin/Shindengen prewrite, ERASE,
  // WRITE blocks, source ACK/Retry and both final-ACK sequences.
  const r=await child.DotNet.invokeMethodAsync('CSharpCoreBrowser',
      'RunSourceCSharpFlash',JSON.stringify(payload));
  const ok=r?.ok??r?.Ok;
  if(ok!==true)throw Error('C# source flash did not return verified Final ACK');
  return {
   ok:true,phase:r.phase??r.Phase??'SOURCE_FINAL_ACK',
   ecuId:r.ecuId??r.EcuId??plan.ecuId,
   blocksSent:r.blocksSent??r.BlocksSent??0,
   readbackVerified:false,needEcuRestart:true,
   engine:'MAIN_CSHARP_WASM_SOURCE'
  };
 }finally{
  window.__55CSharpFlashActive=false;
  window.__55CSharpFlashReport=null;
  window.__55CSharpFlashRawTrace=null;
 }
}

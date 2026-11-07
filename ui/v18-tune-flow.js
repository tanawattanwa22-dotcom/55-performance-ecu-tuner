/* 55 PERFORMANCE V18.2: presentation + saved-file handoff only.
 * Does NOT alter ECU commands, unlocks, offsets or preflight rules.
 * Installed after the original tuner script; saves go to IndexedDB vault; no BIN download.
 */
(()=>{"use strict";
 const el=id=>document.getElementById(id);
 const flow=globalThis.TuneBinFlow;
 globalThis.__55TuneFlowVersion="18.5";
 if(!flow||!el("btnSave")||!el("flashSnapshot")){
   console.error("55 BIN flow initialization failed: missing dependency or UI");
   if(el("tuneSaveStatus"))el("tuneSaveStatus").textContent="ระบบสถานะบันทึก BIN ไม่พร้อม · กรุณาโหลดหน้าเว็บใหม่";
   return;
 }
 globalThis.__55TuneFlowReady=true;
 el("tuneSaveStatus").setAttribute("role","status");
 const same=()=>!!S.saved&&!!S.bin&&flow.matches(S.saved,S.bin,{
   model:MODELS[S.mi]?.id,sourceName:S.fname,customerBin:S.custom
 });
 function refresh(){
   if(S.saved&&!same()&&!INLINEFLASH.busy)S.saved=null;
   const saved=same(),fromCustomer=saved&&S.saved.customerBin;
   const quickReady=window.__55QuickFlashBin?.bytes instanceof Uint8Array&&window.__55QuickFlashBin.bytes.length>0;
   const flash=el("btnFlash"),go=el("btnToFlash"),panel=el("flashSnapshot");
   go.hidden=!saved;
   go.textContent=saved?"ไปหน้าอัด · เลือกจากคลัง BIN":"ไปหน้าอัดไฟล์";
   el("tune").querySelector(".bb")?.classList.toggle("no-snapshot",!saved);
   el("btnSave").textContent=saved?"✓ อยู่ในคลัง BIN ("+changedBytes()+" ไบต์)":"💾 บันทึกเข้าคลัง BIN";
   el("flowTune")?.classList.toggle("done",saved);
   el("flowTune")?.classList.toggle("on",!saved);
   el("flowSaved")?.classList.toggle("on",saved);
   el("flowSaved")?.classList.toggle("done",saved);
   el("flowFlash")?.classList.toggle("on",false);
   el("tuneSaveStatus").textContent=saved
     ?("✓ เก็บในคลัง BIN ภายในแอป: "+(S.saved.vaultName||S.saved.filename)+" · ไม่ดาวน์โหลดลงโทรศัพท์")
     :"จูนเสร็จแล้วกดบันทึกเข้าคลัง BIN ตั้งชื่อไฟล์ได้ และเลือกไฟล์จากคลังหน้า Fast Flash";
   panel.textContent=saved
     ?"ไฟล์ในคลัง: "+(S.saved.vaultName||S.saved.filename)+"\nต้นฉบับ: "+S.saved.sourceName+
       "\nขนาด: "+S.saved.size+" ไบต์ · "+(fromCustomer?"BIN ที่เปิดจากเครื่อง":"ไฟล์มาตรฐานในแอป")+
       "\nSHA-256: "+(S.saved.sha256||"กำลังคำนวณ...")+
       "\nเลือกไฟล์นี้หรือไฟล์อื่นในคลังได้ที่หน้า Fast Flash • ตรวจ ECU ID จริงก่อนอัด"+
       "\nคลังอยู่ใน Chrome เครื่องนี้เท่านั้นและไม่ใช่ระบบป้องกันการคัดลอกสมบูรณ์"
     :"ยังไม่มี BIN ที่บันทึกแล้ว · บันทึกไฟล์ที่จูนก่อน จึงจะแสดงขั้นตอนอัด";
   el("btnReturnTune").disabled=S.mi<0||!S.bin;
   flash.hidden=!saved&&!quickReady&&!INLINEFLASH.postCheck;
   if(!INLINEFLASH.busy&&!INLINEFLASH.postCheck){
     flash.disabled=(!saved&&!quickReady)||!!document.getElementById("licenseGate");
     flash.textContent=quickReady?"ตรวจ ECU และอัด BIN ที่เลือก":"ตรวจ BIN ที่บันทึก · ECU ID / Part / Offset ก่อนอัด";
   }
 }
 function forget(){
   if(INLINEFLASH.busy)return;
   S.saved=null;S.flash=false;
   el("autoOffsetInfo").textContent="Auto Offset: ต้องตรวจใหม่หลังเปลี่ยนข้อมูล BIN";
   refresh();
 }
 const baseAfter=afterEdit;
 afterEdit=function(...args){forget();return baseAfter.apply(this,args)};
 const baseHome=home;
 home=function(...args){const r=baseHome.apply(this,args);refresh();return r};
 const baseLoad=loadFile;
 loadFile=function(...args){forget();return baseLoad.apply(this,args)};
 const baseEmbedded=useEmbedded;
 useEmbedded=function(...args){forget();const r=baseEmbedded.apply(this,args);refresh();return r};
 const baseBuild=buildOut;
 buildOut=function(){
   if(INLINEFLASH.busy&&!INLINEFLASH.postCheck){
     if(!same())throw Error("BIN ถูกแก้หลังบันทึก หยุดการส่งข้อมูล กรุณาบันทึกใหม่");
     // Physical flash receives a COPY of the exact bytes offered for download.
     return S.saved.bytes.slice();
   }
   return baseBuild();
 };
 let saveBusy=false;
 saveBin=async function(){
   if(!S.bin||S.mi<0)return toast("เลือก BIN และรุ่นรถก่อน");
   if(INLINEFLASH.busy||saveBusy)return toast("มีขั้นตอนบันทึกหรือ ECU กำลังทำงาน");
   const vault=globalThis.__55TunedBinVault;
   if(!vault)return toast("คลัง BIN ยังไม่พร้อม ไม่ได้ส่งไฟล์ลงเครื่อง กรุณารีโหลดหน้าเว็บ",5000);
   if(!guardConfirm("บันทึกไฟล์"))return;
   const model=MODELS[S.mi].id;
   const suggested=model+" จูน "+new Date().toLocaleDateString("th-TH");
   const chosen=prompt("ตั้งชื่อ BIN ที่จูนแล้ว เพื่อเก็บในคลังของแอป\n(ไม่ดาวน์โหลดไฟล์ลงโทรศัพท์)",suggested);
   if(chosen===null)return;
   const vaultName=vault.cleanName(chosen);
   if(!vaultName)return toast("กรุณาตั้งชื่อ BIN ที่จะเก็บในคลัง",3500);
   const filename=(model+"_"+vaultName).replace(/[^A-Za-z0-9_.\u0E00-\u0E7F-]+/g,"_").slice(0,100)+".bin";
   let snap;
   try{
     const sourceBin=S.bin,sourceModel=S.mi,sourceFilename=S.fname;
     snap=flow.prepare(sourceBin,{
       model,sourceName:sourceFilename,filename,
       customerBin:S.custom,checksumMode:curCk()
     });
     const bytes=baseBuild();
     if(bytes.length!==snap.bytes.length||bytes.some((x,i)=>x!==snap.bytes[i]))
       throw Error("ข้อมูล BIN ไม่ตรงระหว่างบันทึกกับไฟล์ที่จะอัด");
     if(MODELS[S.mi]?.xdf){
       const check=window.__55MSX?.validateCustomer(bytes);
       if(!check?.ok)throw Error("BIN/XDF ไม่ผ่าน: "+(check?.error||"ข้อมูลยังไม่ครบ"));
     }
     saveBusy=true;el("btnSave").disabled=true;
     const stored=await vault.save({name:vaultName,bytes:snap.bytes,
       model,sourceName:sourceFilename,filename,
       customerBin:S.custom,checksumMode:snap.checksumMode});
     snap.vaultId=stored.id;snap.vaultName=stored.name;snap.sha256=stored.sha256;
     if(S.bin===sourceBin&&S.mi===sourceModel&&S.fname===sourceFilename&&sameSnapshot(snap)){
       S.saved=snap;S.flash=true;
       // A previous external/quick selection must never silently override a new tune.
       window.__55QuickFlashBin=null;
       refresh();
       toast("✓ บันทึกลงคลัง BIN: "+stored.name+" · ไม่ได้ดาวน์โหลดไฟล์",4200);
     }else{
       toast("เก็บ BIN ในคลังแล้ว แต่มีการแก้จูนระหว่างบันทึก • ต้องบันทึกใหม่ก่อนอัด",5000);
     }
     window.dispatchEvent(new CustomEvent("55:tuned-bin-vault-updated",{detail:{id:stored.id}}));
   }catch(error){
     toast("บันทึกคลัง BIN ไม่สำเร็จ: "+(error?.message||error),6000);
   }finally{saveBusy=false;el("btnSave").disabled=false;refresh();}
 };
 const sameSnapshot=snap=>!!S.bin&&flow.matches(snap,S.bin,{
   model:MODELS[S.mi]?.id,sourceName:S.fname,customerBin:S.custom
 });
 // A later UI handler or cached inline script must not silently bypass snapshot creation.
 el("btnSave").onclick=saveBin;
 el("btnSave").addEventListener("click",()=>{if(S.saved)refresh();});
 el("btnToFlash").onclick=()=>{
   if(!same())return toast("กรุณาบันทึก BIN ใหม่ก่อน");
   S.flash=true;history.back();
   setTimeout(()=>{
     home();
     window.__55NeonNavigate?.("flash");
     el("n20Stage")?.scrollIntoView({behavior:"smooth",block:"start"});
   },100);
 };
 el("btnReturnTune").onclick=()=>openTune();
 el("btnAutoOffset").onclick=async()=>{
   const out=el("autoOffsetInfo");
   if(!S.bin){out.textContent="กรุณาเปิด BIN ก่อน";return}
   try{
     const {csharpOffsetInference}=await import("./flash_port/csharp-offsets.js?v=317");
     const result=csharpOffsetInference(S.saved?.bytes||S.bin);
     out.textContent="Offset Auto (อ้างอิง BIN):"+
       "\nStart: "+(result.startOffsetHex||"ไม่ทราบ")+
       "\nChecksum: "+(result.checksumOffsetHex||"ไม่ทราบ")+
       "\nFamily: "+result.csharpClassHint+
       "\nแหล่ง: "+result.source+
       "\nระดับหลักฐาน: "+result.confidence+
       "\nนี่เป็นค่าจากขนาด/ลายเซ็น BIN เท่านั้น ไม่อนุญาต ERASE จนกว่า Flash Engine จะอ่าน ECU ID จริงและตรวจฐาน C#";
   }catch(e){out.textContent="Auto Offset ตรวจไม่ได้: "+e.message}
 };
 // Never let an invalid or unsaved image reach the legacy write click handler.
 el("btnFlash").addEventListener("click",event=>{
   if(INLINEFLASH.postCheck)return;
   if(!window.__55QuickFlashBin?.bytes&&(!same()||guardRun().st==="MISMATCH")){
     event.preventDefault();event.stopImmediatePropagation();
     toast("BIN ยังไม่ได้บันทึก ถูกแก้ภายหลัง หรือ Match Guard พบข้อมูลไม่ตรง");
     refresh();
   }
 },true);
 const oldRefresh=globalThis.__55refreshFlashButton;
 globalThis.__55refreshFlashButton=()=>{oldRefresh?.();refresh()};
 refresh();
})();

/* 55 PERFORMANCE V18.2: presentation + saved-file handoff only.
 * Does NOT alter ECU commands, unlocks, offsets or preflight rules.
 * Installed after the original tuner script; main source variables are reused.
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
   const flash=el("btnFlash"),go=el("btnToFlash"),panel=el("flashSnapshot");
   go.hidden=!saved;
   go.textContent=saved?"ไปหน้าอัด BIN ที่บันทึกแล้ว":"ไปหน้าอัดไฟล์";
   el("tune").querySelector(".bb")?.classList.toggle("no-snapshot",!saved);
   if(saved)el("btnSave").textContent="✓ บันทึก BIN แล้ว ("+changedBytes()+" ไบต์)";
   el("flowTune")?.classList.toggle("done",saved);
   el("flowTune")?.classList.toggle("on",!saved);
   el("flowSaved")?.classList.toggle("on",saved);
   el("flowSaved")?.classList.toggle("done",saved);
   el("flowFlash")?.classList.toggle("on",false);
   el("tuneSaveStatus").textContent=saved
     ?("✓ บันทึก BIN สำเร็จ · "+(fromCustomer?"BIN นำเข้าจากเครื่อง":"BIN หลักในแอป")+" · ไปตรวจ ECU ID / Part / Offset ก่อนอัด")
     :"แก้ตารางจูนได้ตามต้องการ แล้วกด บันทึก BIN ก่อนจะแสดงปุ่มไปหน้าอัด";
   panel.textContent=saved
     ?"ไฟล์ที่จะใช้: "+S.saved.filename+"\nต้นฉบับ: "+S.saved.sourceName+
       "\nขนาด: "+S.saved.size+" ไบต์ · "+(fromCustomer?"BIN ที่เปิดจากเครื่อง":"ไฟล์มาตรฐานในแอป")+
       "\nSHA-256: "+(S.saved.sha256||"กำลังคำนวณ...")+
       "\nพร้อมตรวจ ECU ID / Part / Offset ของกล่องจริงก่อนอัด"+"\nไฟล์หลักของรุ่นไม่รับประกันว่าเข้ากับเฟิร์มแวร์ ECU ทุกคัน"
     :"ยังไม่มี BIN ที่บันทึกแล้ว · บันทึกไฟล์ที่จูนก่อน จึงจะแสดงขั้นตอนอัด";
   el("btnReturnTune").disabled=S.mi<0||!S.bin;
   flash.hidden=!saved&&!INLINEFLASH.postCheck;
   if(!INLINEFLASH.busy&&!INLINEFLASH.postCheck){
     flash.disabled=!saved||!!document.getElementById("licenseGate");
     flash.textContent="ตรวจ BIN ที่บันทึก · ECU ID / Part / Offset ก่อนอัด";
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
 saveBin=function(){
   if(!S.bin||S.mi<0)return toast("เลือก BIN และรุ่นรถก่อน");
   if(INLINEFLASH.busy)return toast("มีขั้นตอน ECU กำลังทำงาน");
   if(!guardConfirm("บันทึกไฟล์"))return;
   const d=new Date(),p=n=>String(n).padStart(2,"0");
   const name=(MODELS[S.mi].id||"ECU")+"_55_TUNED_"+
     d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+"_"+p(d.getHours())+p(d.getMinutes())+".bin";
   const snap=flow.prepare(S.bin,{
     model:MODELS[S.mi].id,sourceName:S.fname,filename:name,
     customerBin:S.custom,checksumMode:curCk()
   });
   const bytes=baseBuild();
   if(bytes.length!==snap.bytes.length||bytes.some((x,i)=>x!==snap.bytes[i]))
     return toast("ข้อมูล BIN ไม่ตรงระหว่างบันทึกกับไฟล์ที่จะอัด");
   const url=URL.createObjectURL(new Blob([snap.bytes],{type:"application/octet-stream"}));
   const a=document.createElement("a");a.href=url;a.download=name;
   document.body.append(a);a.click();
   setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},8000);
   S.saved=snap;S.flash=true;refresh();
   el("tuneSaveStatus").textContent=snap.customerBin
     ?"✓ บันทึก BIN ลูกค้าแล้ว · ดาวน์โหลดไฟล์ "+name+" · ปุ่มไปหน้าอัดแสดงแล้ว"
     :"✓ บันทึก BIN หลักแล้ว · "+name+" · ไปหน้าอัดเพื่อตรวจ ECU จริง";
   toast("สร้าง BIN และสั่งดาวน์โหลดแล้ว · "+name,3500);
   crypto.subtle.digest("SHA-256",snap.bytes).then(buf=>{
     const hex=Array.from(new Uint8Array(buf),x=>x.toString(16).padStart(2,"0")).join("");
     if(S.saved===snap){snap.sha256=hex;refresh()}
   }).catch(()=>{});
 };
 // A later UI handler or cached inline script must not silently bypass snapshot creation.
 el("btnSave").onclick=saveBin;
 el("btnSave").addEventListener("click",()=>{if(S.saved)refresh();});
 el("btnToFlash").onclick=()=>{
   if(!same())return toast("กรุณาบันทึก BIN ใหม่ก่อน");
   S.flash=true;history.back();
   setTimeout(()=>{
     home();
     window.__55NeonNavigate?.("flash");
     el("flashCard").scrollIntoView({behavior:"smooth",block:"center"});
   },100);
 };
 el("btnReturnTune").onclick=()=>openTune();
 el("btnAutoOffset").onclick=async()=>{
   const out=el("autoOffsetInfo");
   if(!S.bin){out.textContent="กรุณาเปิด BIN ก่อน";return}
   try{
     const {csharpOffsetInference}=await import("../flash_port/csharp-offsets.js");
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
   if(!same()||guardRun().st==="MISMATCH"){
     event.preventDefault();event.stopImmediatePropagation();
     toast("BIN ยังไม่ได้บันทึก ถูกแก้ภายหลัง หรือ Match Guard พบข้อมูลไม่ตรง");
     refresh();
   }
 },true);
 const oldRefresh=globalThis.__55refreshFlashButton;
 globalThis.__55refreshFlashButton=()=>{oldRefresh?.();refresh()};
 refresh();
})();
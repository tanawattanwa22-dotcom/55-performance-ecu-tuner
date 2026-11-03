/* 55 PERFORMANCE Preflight V24 — inspect only, NEVER write/erase from this module.
   The original verified flash button and engine remain the sole destructive path.
   Runtime fields are read from a saved immutable BIN snapshot and physical FT232R ECU-ID probe.
   C# FormMain.cs catalog/offset/flash-count resolution is via HondaFlashEngine. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const TTL=180000;
const X=n=>Number.isInteger(n)?'0x'+n.toString(16).toUpperCase().padStart(8,'0'):'—';
const make=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el};
const btn=(txt,cls,fn)=>{const e=make('button',cls,txt);e.type='button';e.onclick=fn;return e};
let stage=null,dom={},working=false,last=null,confirmAt=null,hash=null,error='',message='';
const current=()=>{
 const s=S.saved,m=S.mi>=0&&MODELS[S.mi]?MODELS[S.mi]:null;
 let valid=false;
 try{valid=!!s&&S.bin instanceof Uint8Array&&TuneBinFlow.matches(s,S.bin,{model:m?.id,sourceName:S.fname,customerBin:S.custom})}catch{}
 return {saved:s,model:m?.id||null,valid,bytes:s?.bytes instanceof Uint8Array?s.bytes:null};
};
const recency=()=>last&&Date.now()-last.at<TTL;
const verified=()=>{
 const c=current();
 return !!(c.valid&&last?.plan&&recency()&&last.saved===c.saved&&last.model===c.model&&last.identity?.sourceMatched);
};
function setItem(key,value){
 const el=dom[key];if(el)el.textContent=value??'—';
}
function line(cls,label,value){
 const row=make('div','n24-info-line');
 row.append(make('span','',label));
 const v=make('strong','',value||'—');v.dataset.n24=cls;dom[cls]=v;row.append(v);
 return row;
}
function card(cls,icon,title){
 const e=make('section','n24-panel '+cls);
 const h=make('header','n24-panel-title');
 h.append(make('span','n24-panel-icon',icon),make('b','',title));e.append(h);return e;
}
function addChecklist(box){
 const list=make('div','n24-check-list');const checks=[
  ['bin','BIN ที่บันทึกยังตรงกับตารางและรุ่น'],
  ['id','อ่าน ECU ID จากกล่องจริง'],
  ['catalog','ECU ID / Family อยู่ในฐาน Main C#'],
  ['offset','ตรวจ Memory Map / Offset / Checksum'],
  ['hardware','ตรวจไฟเลี้ยง สาย K-Line และวงจรกู้คืนด้วยตนเอง']
 ];
 for(const [id,label] of checks){
  const row=make('div','n24-check-row');
  const ico=make('span','n24-check-mark','○');const text=make('span','',label),state=make('b','','รอตรวจ');
  row.append(ico,text,state);list.append(row);dom['check_'+id]={row,ico,state};
 }
 box.append(list);
}
function render(){
 if(!stage?.isConnected)return;
 const c=current(),identity=recency()?last?.identity:null,plan=verified()?last?.plan:null;
 const progress=c.valid&&last?.saved===c.saved&&recency();
 setItem('model',c.model||'ยังไม่เลือกรุ่น');
 setItem('filename',c.valid?c.saved.filename:'ยังไม่ได้บันทึก BIN');
 setItem('source',c.valid?(c.saved.customerBin?'BIN ที่นำเข้าจากเครื่อง':'Master BIN (จากแอป)'):'—');
 setItem('size',c.valid?c.bytes.length.toLocaleString('en-US')+' bytes ('+(c.bytes.length/1024).toFixed(2)+' KB)':'—');
 setItem('sha',hash&&hash.saved===c.saved&&c.valid?hash.hex.slice(0,20)+'…':'ยังไม่ได้คำนวณ');
 setItem('ecu',identity?.ecuId||'ยังไม่ได้อ่านจาก ECU');
 setItem('part',identity?.sourcePart||'—');
 setItem('family',identity?.family||'—');
 setItem('flashcount',Number.isInteger(identity?.count)?identity.count+' ครั้ง':'อ่านไม่ได้');
 setItem('sourceMatch',identity?(identity.sourceMatched?'ตรงฐาน Main C#':'ไม่ตรง / ยังไม่ยืนยัน'):'รอ ECU');
 setItem('start',X(plan?.startOffset));
 setItem('checksum',X(plan?.checksumOffset));
 setItem('block',Number.isInteger(plan?.blockBytes)?plan.blockBytes.toLocaleString()+' bytes':'—');
 setItem('profile',plan?.profile||'ยังไม่มีแผนที่ยืนยัน');
 setItem('offsetState',plan?'ตรวจด้วย HondaFlashEngine / C# แล้ว':'ยังไม่ผ่านการตรวจ');
 dom.note.textContent=error?'หยุดตรวจ: '+error:message||
  'การตรวจนี้อ่าน ECU ID และคำนวณแผนเท่านั้น ไม่มีคำสั่ง ERASE/WRITE · ขั้นตอนอัดจริงจะอ่าน ID ใหม่';
 const status={
  bin:c.valid,
  id:!!identity?.ecuId&&progress,
  catalog:!!identity?.sourceMatched&&progress,
  offset:!!plan,
  hardware:false
 };
 for(const [k,obj] of Object.entries(dom).filter(([k])=>k.startsWith('check_'))){
  const key=k.slice(6),ok=status[key];
  obj.state.textContent=ok?'ผ่าน':key==='hardware'?'ต้องตรวจด้วยตนเอง':'รอตรวจ';
  obj.ico.textContent=ok?'✓':key==='hardware'?'!':'○';
  obj.row.classList.toggle('passed',ok);
 }
 dom.read.disabled=working||!!INLINEFLASH.busy||!!document.getElementById('licenseGate');
 dom.check.disabled=working||!c.valid||!identity||!recency()||last?.saved!==c.saved;
 dom.flash.disabled=working||!verified()||!!INLINEFLASH.busy||!!$('btnFlash')?.hidden||!!$('btnFlash')?.disabled;
 dom.flash.title=dom.flash.disabled?'ต้องบันทึก BIN อ่าน ECU ID และตรวจ Preflight ให้ผ่านก่อน':'ใช้ Flash Engine เดิมซึ่งอ่าน ECU ID ใหม่ก่อน ERASE';
 if(dom.gateReason){
  const blockers=[];
  if(!c.valid)blockers.push('ยังไม่ได้บันทึกไฟล์ BIN ที่ตรงกับรุ่น');
  if(!recency()||!last?.identity?.ecuId)blockers.push('ยังไม่มี ECU ID ล่าสุดจากสาย FT232R');
  else if(!last.identity.sourceMatched)blockers.push('ECU ID ยังไม่ตรงฐาน Main C#');
  if(!last?.plan||!verified())blockers.push('ยังไม่ผ่านการตรวจ Offset/Checksum/Part');
  if($('btnFlash')?.hidden||$('btnFlash')?.disabled)blockers.push('ปุ่ม Flash เดิมยังถูกล็อกจากสถานะ BIN หรือ License');
  if(working||INLINEFLASH.busy)blockers.push('โปรแกรมกำลังทำงาน');
  dom.gateReason.textContent=blockers.length?'ยังเปิดปุ่ม ERASE / WRITE ไม่ได้: '+[...new Set(blockers)].join(' • '):
   'Preflight ผ่านแล้ว · กดเริ่มอัดเพื่อเข้า Flash Engine จริง (ยังต้องยืนยันและอ่าน ECU ID อีกครั้ง)';
 }
 const stepIndex=verified()?3:identity?2:c.valid?1:0;
 for(let n=0;n<4;n++){
  const item=dom['step'+n];item.classList.toggle('done',n<stepIndex);
  item.classList.toggle('active',n===stepIndex);
 }
 const ready=verified();
 dom.title.textContent=ready?'ผ่านการตรวจซอฟต์แวร์ (ยังไม่ได้ ERASE)':
  working?'กำลังอ่าน ECU / ตรวจ Preflight':'รอการตรวจ Preflight';
 dom.title.classList.toggle('ready',ready);
}
async function saveHash(c){
 if(!c.valid)throw Error('BIN ที่บันทึกไม่ตรงกับตารางล่าสุด กรุณากดบันทึก BIN ใหม่');
 if(!crypto?.subtle?.digest)throw Error('เบราว์เซอร์ไม่รองรับ SHA-256');
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',c.bytes));
 const hex=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
 hash={saved:c.saved,hex};return hex;
}
async function readECU(){
 if(working||INLINEFLASH.busy)return;
 if(!navigator.usb) return errorOut('Chrome นี้ไม่รองรับ WebUSB / FT232R');
 if(document.getElementById('licenseGate'))return errorOut('กรุณาเข้าสู่ระบบ License ก่อนอ่าน ECU');
 const shared=window.__55SharedEcu;
 if(!shared?.port?.ready)return errorOut('กรุณาเชื่อมต่อ FT232R จากหน้าหลักก่อน • หน้าอัดไฟล์ไม่เปิดสายแยก');
 if(shared.snapshot().running)return errorOut('กรุณาหยุดอ่าน Live Data ก่อนอ่าน ECU ID เพื่อใช้สายเดียวกัน');
 if(K.t)return errorOut('ระบบ DTC เก่ากำลังใช้พอร์ต USB แยก กรุณาตัดการเชื่อมต่อเดิม');
 working=true;error='';message='กำลังเลือกอุปกรณ์ FT232R…';last=null;hash=null;render();
 let port=null;
 try{
  // Reuse the physical FT232R opened from the home dashboard.
  const [{HondaFlashEngine}]=await Promise.all([
   import(new URL('flash_port/honda-write-engine.js?v=ecu-id-fix-2',location.origin+'/55-performance-ecu-tuner/').href)]);
  if(typeof api!=='function')throw Error('ไม่พบตัวตรวจ License');
  const license=await api('check',{device:localStorage.getItem('55_device_id')});
  if(!license?.active)throw Error('License ไม่ได้เปิดใช้งาน');
  port=await shared.acquire("PREFLIGHT");
  if(!port?.ready)throw Error('สายหลักถูกตัดการเชื่อมต่อแล้ว');
  const engine=new HondaFlashEngine(port,()=>{});
  message='กำลังอ่าน ECU ID และ Flash Count ด้วย FormMain C#…';render();
  const identity=await engine.identify();
  const c=current();
  last={identity,engine,at:Date.now(),saved:c.valid?c.saved:null,model:c.model,plan:null};
  message=identity.sourceMatched?
   'อ่าน ECU ID จริงแล้ว · ปิดการเชื่อมต่ออ่านชั่วคราว · กดตรวจ Preflight':
   'อ่าน ECU ID แล้ว แต่ยังไม่ตรงฐาน C# · ไม่อนุญาตให้เตรียมอัด';
 }catch(e){
  last=null;
  error=e?.message||String(e);
 }finally{
  shared.release("PREFLIGHT");
  // Shared port belongs to the home dashboard. Never close it here.
  working=false;render();
 }
}
async function runCheck(){
 if(working||INLINEFLASH.busy)return;
 working=true;error='';message='กำลังตรวจ BIN / Part Code / Memory Map…';render();
 try{
  const c=current();
  if(!c.valid)throw Error('BIN ไม่ได้บันทึกหรือถูกแก้ภายหลัง · ต้องบันทึกใหม่');
  if(!last||!recency()||last.saved!==c.saved||last.model!==c.model)throw Error('ผล ECU ID หมดอายุหรือคนละไฟล์ · กรุณาอ่าน ECU ID ใหม่');
  if(!last.identity.sourceMatched)throw Error('ECU ID หรือ Family ไม่ตรงฐานต้นฉบับ Main C#');
  await saveHash(c);
  // makePlan() is a strict calculation only: no USB communication, no erase, no write.
  const plan=last.engine.makePlan(c.bytes.slice(),{filename:c.saved.filename,fast:false,recovery:false});
  if(!Number.isInteger(plan.startOffset)||!Number.isInteger(plan.checksumOffset)||!Number.isInteger(plan.blockBytes))
   throw Error('Memory Map ไม่ครบ จึงไม่ผ่าน Preflight');
  if(!plan.checks?.physicalIdMatched||!plan.checks?.offsetsFromCSharp)
   throw Error('แผนเขียนไม่ยืนยัน ECU ID/Offset');
  last.plan=plan;
  message='ตรวจซอฟต์แวร์ผ่าน · ไม่ได้ยืนยันแรงดันไฟ สาย K-Line หรือความเข้ากันได้ของเฟิร์มแวร์กับกล่องลูกค้า · ก่อน ERASE ระบบอ่าน ECU ID ใหม่';
 }catch(e){if(last)last.plan=null;error=e?.message||String(e)}
 finally{working=false;render()}
}
function errorOut(s){error=s;message='';render()}
function startFlash(){
 if(!verified())return errorOut('ต้องอ่าน ECU ID และตรวจ Preflight ให้ผ่านก่อน');
 const target=$('btnFlash');if(!target||target.hidden||target.disabled)return errorOut('ระบบ Flash Engine เดิมยังไม่อนุญาตให้อัด');
 // Only the existing button invokes the engine's physical re-identification,
 // original backup/power/recovery confirmations, and original erase/write.
 target.click();
 message='ส่งต่อไป Flash Engine เดิม · ระบบอ่าน ECU ID ใหม่และถามยืนยัน ERASE/WRITE อีกครั้ง';
 render();
}
function mount(host){
 stage=host;stage.classList.add('n24-preflight-stage');stage.replaceChildren();dom={};
 const head=make('section','n24-hero');
 head.append(make('div','n24-headline','อัดไฟล์ ECU'),make('p','','FLASH ECU / PREFLIGHT'));
 head.append(make('small','','ตรวจสอบความพร้อมของ BIN และกล่องจริงก่อนอัด โดยไม่ใช้ข้อมูลจำลอง'));stage.append(head);
 const choose=make('div','n24-model');
 choose.append(make('span','','รุ่นที่เลือก'));const model=make('strong','','—');dom.model=model;choose.append(model);
 choose.append(btn('เปลี่ยนรุ่น ›','n24-model-change',()=>window.__55NeonNavigate?.('library')));stage.append(choose);
 const file=card('n24-bin','▧','ไฟล์ที่จะอัด (BIN)');
 file.append(line('filename','ชื่อไฟล์'),line('source','ประเภทไฟล์'),line('size','ขนาดไฟล์'),line('sha','Checksum (SHA-256)'));stage.append(file);
 const ecu=card('n24-ecu','▣','ข้อมูล ECU (Identification)');
 ecu.append(line('ecu','ECU ID'),line('part','Part Code'),line('family','Family'),line('flashcount','Flash Count'),line('sourceMatch','Source Match'));stage.append(ecu);
 const map=card('n24-map','▱','Auto Offset / Memory Map');
 map.append(line('start','Start Offset'),line('checksum','Checksum Offset'),line('block','Block Size'),line('profile','C# ECU Profile'),line('offsetState','สถานะตรวจ'));stage.append(map);
 const h=make('h3','n24-section-head','ขั้นตอนการอัดไฟล์ (Workflow)');stage.append(h);
 const steps=make('div','n24-workflow');
 for(const [n,label] of ['บันทึก BIN','อ่าน ECU ID','ตรวจ Offset','ยืนยันอัดไฟล์'].entries()){
  const x=make('div','n24-step');x.append(make('b','',String(n+1)),make('span','',label));
  steps.append(x);dom['step'+n]=x;
 }stage.append(steps);
 const checking=card('n24-check','✓','รายการตรวจสอบก่อนอัดไฟล์');
 addChecklist(checking);stage.append(checking);
 const warning=make('div','n24-warning');
 warning.textContent='คำเตือน: BIN หลักจากแอปอาจไม่ตรงเฟิร์มแวร์ของ ECU ทุกคัน • ต้องมีสำเนากล่องลูกค้า, ตรวจ Part Code และไฟเลี้ยงกับเครื่องมือกู้คืน • ไม่มีการอ่าน BIN กลับทั้งก้อนเพื่อยืนยันหลังเขียน';
 stage.append(warning);
 const state=make('div','n24-state');
 const title=make('strong','','รอการตรวจ Preflight');dom.title=title;
 const note=make('p','','');dom.note=note;state.append(title,note);stage.append(state);
 const actions=make('div','n24-actions');
 const read=btn('▣ อ่าน ECU ID','n24-btn n24-read',readECU);dom.read=read;
 const check=btn('▱ ตรวจ Preflight','n24-btn n24-verify',runCheck);dom.check=check;
 const flash=btn('⇧ เริ่มอัดไฟล์','n24-btn n24-flash',startFlash);dom.flash=flash;
 actions.append(read,check,flash);stage.append(actions);
 const gate=make('p','n24-help','');gate.setAttribute('role','status');dom.gateReason=gate;stage.append(gate);
 // The user's Main.zip FormMain.cs SHA-256 matches the source already ported
 // into the shared real-write engine. These are separate navigation routes,
 // not alternate command bytes or a bypass of any programming safeguards.
 const routes=make('div','n24-actions');
 for(const [title,path] of [
  ['ตรวจสาย USB / VID-PID (ไม่ส่งข้อมูล ECU)','flash_port/usb-cable-diagnostic.html'],
  ['เปิด Real ECU Flash (ขั้นสูง)','flash_port/flash-write-lab.html'],
  ['เปิด Offline Flash V28','flash_port/offline/index.html']
 ]){
  const a=make('a','n24-btn',title);
  a.href=new URL(path,document.baseURI).href;
  a.style.cssText='display:inline-flex;align-items:center;justify-content:center;text-decoration:none;min-height:42px;background:#263547;border:1px solid #56748e';
  routes.append(a);
 }
 stage.append(routes);
 const help=make('p','n24-help','ต้องเลือก FT232R ด้วย Chrome Android • การอ่าน ID และตรวจ Preflight ไม่ลบ/เขียน ECU • ทุกสถานะมาจากการอ่านจริงหรือการคำนวณของ C# Flash Engine เท่านั้น');
 stage.append(help);
 render();
}
window.__55FlashPreflight={mount,render,readECU,runCheck,ready:verified};
['btnSave','sel','btnAutoOffset','btnRead','goTune'].forEach(id=>$(id)?.addEventListener('click',()=>queueMicrotask(render)));
window.addEventListener('55:bin-changed',render);
setInterval(()=>{if(stage?.isConnected)render()},1500);
})();

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
let stage=null,dom={},working=false,last=null,confirmAt=null,hash=null,error='',message='',binOffsetHint=null;
let fileAnalysis={saved:null,report:null,error:null,working:false};
let catalog290={rows:null,error:null};
import(new URL('flash_port/csharp-ecu-catalog.js?v=302',document.baseURI).href)
 .then(mod=>mod.loadCSharpCatalog())
 .then(rows=>{catalog290={rows,error:null};render()})
 .catch(e=>{catalog290={rows:null,error:e?.message||String(e)};render()});
const MAIN_BIN_ID_SIZES=new Set([32768,49152,57344,65536,98304,131072,262144,393216,524288,786432,1048576]);
const mainFileSize=bytes=>bytes>=1048576?(bytes/1048576).toFixed(2)+' MB':
 bytes>=1024?(bytes/1024).toFixed(2)+' KB':bytes+' B'; // FormMain.FormatFileSize
const hasMainLocator=bytes=>bytes instanceof Uint8Array&&MAIN_BIN_ID_SIZES.has(bytes.length);
const quickBin=()=>window.__55QuickFlashBin?.bytes instanceof Uint8Array?window.__55QuickFlashBin:null;
const catalogRecord=identity=>identity?.ecuId?(catalog290.rows?.get(String(identity.ecuId).toUpperCase())||identity.catalog||identity.datReference||null):null;
const sourceOffset=(n,raw)=>Number.isInteger(n)?X(n):raw==='auto'?'AUTO (Main C#)':raw===''?'ไม่ระบุใน Main C#':'—';
// A BIN-only estimate is shown before connecting, but NEVER permits writing.
async function previewBinOffset(){
 const item=current();
 if(!item.valid||!(item.bytes instanceof Uint8Array)){binOffsetHint=null;render();return}
 if(binOffsetHint?.saved===item.saved){render();return}
 try{
  const [{csharpOffsetInference},{previewMainShindengenBin}]=await Promise.all([
   import(new URL('flash_port/csharp-offsets.js?v=317',document.baseURI).href),
   import(new URL('flash_port/main-shindengen-auto-preview.js?v=2',document.baseURI).href)]);
  const estimated=csharpOffsetInference(item.bytes.slice());
  const sourceAuto=previewMainShindengenBin(item.bytes);
  if(sourceAuto.ready){
   estimated.binProfile=sourceAuto.type;
   estimated.binBlockBytes=sourceAuto.blockBytes;
   estimated.startOffset=sourceAuto.startOffset;
   estimated.startOffsetHex=sourceAuto.startOffsetHex;
   estimated.checksumOffset=sourceAuto.checksumOffset;
   estimated.checksumOffsetHex=sourceAuto.checksumOffsetHex;
   estimated.eligibleForHardwareWrite=false;
  }
  const latest=current();
  if(latest.saved===item.saved)binOffsetHint={saved:item.saved,estimated};
 }catch(e){binOffsetHint={saved:item.saved,error:e.message}}
 render();
}
// Read-only BIN analysis: this never acquires USB or constructs a Flash plan.
async function analyzeSelectedBin(){
 if(!stage?.isConnected)return;
 const selected=current();
 const source=selected.saved;
 if(!selected.valid||!(selected.bytes instanceof Uint8Array)){
  fileAnalysis={saved:null,report:null,error:null,working:false};render();return;
 }
 if(fileAnalysis.saved===source&&(fileAnalysis.working||fileAnalysis.report||fileAnalysis.error))return;
 fileAnalysis={saved:source,report:null,error:null,working:true};render();
 try{
  const {analyzeMainBinResult}=await import(new URL('flash_port/main-bin-analyze-result.js?v=1',document.baseURI).href);
  const report=await analyzeMainBinResult(selected.bytes,{filename:source.filename||source.filenameFromUser||S.fname||''});
  if(fileAnalysis.saved!==source)return;
  fileAnalysis={saved:source,report,error:null,working:false};
 }catch(e){
  if(fileAnalysis.saved!==source)return;
  fileAnalysis={saved:source,report:null,error:e?.message||String(e),working:false};
 }
 render();
}

async function downloadLockedBin(mode){
 const chosen=current();
 if(INLINEFLASH.busy){dom.lockStatus.textContent='มีการอัด ECU อยู่ กรุณารอให้จบก่อน';return}
 if(!chosen.valid||!(chosen.bytes instanceof Uint8Array)){dom.lockStatus.textContent='ยังไม่ได้เลือก BIN';return}
 if(![49152,65536].includes(chosen.bytes.length)){dom.lockStatus.textContent='ฟังก์ชันนี้รองรับ Keihin 48 KB / 64 KB ตาม Main.zip เท่านั้น';return}
 for(const b of [dom.lockRead,dom.lockMode])b.disabled=true;
 dom.lockStatus.textContent='กำลังตรวจโค้ด Lock และคำนวณ Checksum ใหม่ในสำเนา BIN…';
 try{
  const {prepareMainLockCopy}=await import(new URL('flash_port/main-bin-lock-export.js?v=1',document.baseURI).href);
  const result=await prepareMainLockCopy(chosen.bytes,{mode,filename:chosen.saved.filename||S.fname||'firmware.bin'});
  if(current().saved!==chosen.saved)throw Error('เลือก BIN ใหม่ระหว่างประมวลผล กรุณาลองอีกครั้ง');
  const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/octet-stream'}));
  const a=document.createElement('a');a.href=url;a.download=result.filename;
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  dom.lockStatus.textContent='สร้างสำเนา '+result.filename+' • แก้ '+result.count+' ไบต์ • Checksum 8-bit = 00'+
    ' • Main '+(result.mainCatalogMatch?'พบ ECU ID ในฐาน 290':'คำนวณตามขนาด BIN')+
    ' • ไม่มีการเปลี่ยน BIN ต้นฉบับและไม่ได้ส่งคำสั่ง ECU';
 }catch(e){dom.lockStatus.textContent='Lock ไม่สำเร็จ: '+(e?.message||String(e))}
 finally{if(stage?.isConnected)render()}
}
function renderAnalyzeResult(){
 if(!dom.analysisBody)return;
 const c=current(),state=fileAnalysis;
 const valid=c.valid&&c.saved===state.saved;
 if(!c.valid){dom.analysisStatus.textContent='รอเลือกไฟล์ BIN';dom.analysisBar.style.width='0%';dom.analysisBody.textContent='เลือก BIN เพื่อวิเคราะห์ไฟล์โดยไม่เชื่อมต่อ ECU';return}
 if(!valid||state.working){dom.analysisStatus.textContent='กำลังวิเคราะห์ BIN จาก Main.zip และ ECM.dat';dom.analysisBar.style.width='0%';dom.analysisBody.textContent='กำลังอ่าน ECU ID, Signature และตรวจ Checksum จากไฟล์';return}
 if(state.error){dom.analysisStatus.textContent='ANALYZE FAILED';dom.analysisBar.style.width='0%';dom.analysisBody.textContent='วิเคราะห์ไม่สำเร็จ: '+state.error;return}
 const a=state.report;
 if(!a){dom.analysisStatus.textContent='รอผลวิเคราะห์';dom.analysisBar.style.width='0%';dom.analysisBody.textContent='ยังไม่มีผล';return}
 dom.analysisStatus.textContent='ANALYZE COMPLETE · 100% (อ่าน BIN เสร็จ ไม่ใช่พร้อม Flash)';
 dom.analysisBar.style.width='100%';
 const lines=[
  ['File ID',a.fileId||'ไม่พบ'],
  ['สถานะ ID',a.idEvidence],
  ['Part Code',a.partCode||'ไม่พบในฐาน'],
  ['ข้อมูลจาก',a.partSource],
  ['ชนิดไฟล์',a.signature],
  ['Start Offset',a.startHex],
  ['Checksum Offset',a.checksumHex],
  ['Checksum Type',a.checksumType],
  ['Checksum result',a.checksumStatus==='MATCH'?'MATCH · คำนวณแล้วตรงกับ BIN':
    a.checksumStatus==='WOULD_CHANGE'?'ต้องคำนวณใหม่ (ยังไม่ได้แก้ไฟล์)':'ยังตรวจไม่ได้'],
  ['Checksum เดิม → ค่าที่คำนวณ',a.checksumOld&&a.checksumCalculated?a.checksumOld+' → '+a.checksumCalculated:'—'],
  ['ข้อมูลอ้างอิง',a.explanation]
 ];
 const host=dom.analysisBody;host.replaceChildren();
 for(const [title,value] of lines){const line=make('div','n24-info-line');
  line.append(make('span','',title),make('strong','',String(value||'—')));host.append(line)}
 const note=make('p','n24-analysis-note',
  'ANALYZE 100% หมายถึงตรวจข้อมูล BIN เสร็จ ไม่ใช่ยืนยันว่า BIN ตรง ECU ที่เสียบ หรือเขียนแฟลชสำเร็จ');
 host.append(note);
 if(a.warnings?.length){const warn=make('div','n24-analysis-warning');
  warn.textContent='ข้อสังเกต: '+a.warnings.join(' • ');host.append(warn)}
}
const current=()=>{
 const quick=quickBin();
 if(quick)return {saved:quick,model:null,valid:true,bytes:quick.bytes};
 const s=S.saved,m=S.mi>=0&&MODELS[S.mi]?MODELS[S.mi]:null;
 let valid=false;
 try{valid=!!s&&S.bin instanceof Uint8Array&&TuneBinFlow.matches(s,S.bin,{model:m?.id,sourceName:S.fname,customerBin:S.custom})}catch{}
 return {saved:s,model:m?.id||null,valid,bytes:s?.bytes instanceof Uint8Array?s.bytes:null};
};
const recency=()=>last&&Date.now()-last.at<TTL&&last.engine?.usb===window.__55SharedEcu?.port;
// Never reuse an authorized plan for ECU A when the single FTDI cable now reports ECU B.
const physicalIdMatchesLast=()=>{
 const actual=window.__55SharedEcu?.snapshot?.()?.ecuId;
 return !actual||!!last?.identity?.ecuId&&actual===last.identity.ecuId;
};
const verified=()=>{
 const c=current();
 return !!(c.valid&&last?.plan&&recency()&&physicalIdMatchesLast()&&
  last.saved===c.saved&&last.model===c.model&&(last.identity?.sourceMatched||last.plan?.checks?.sourceUnlistedWithProof));
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
  ['bin','ตรวจไฟล์ที่เลือกกับข้อมูลที่บันทึก'],
  ['id','อ่าน ECU ID จากรถจริง'],
  ['catalog','ตรวจข้อมูลรุ่นกล่องเพิ่มเติม'],
  ['family','ตรวจประเภทกล่องจาก ECU จริง'],
  ['offset','ตรวจ Start Offset และ Checksum'],
  ['hardware','ตรวจสายและไฟเลี้ยงรถก่อนเขียน']
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
 renderAnalyzeResult();
 const c=current(),quick=quickBin();
 if(dom.fast)dom.fast.disabled=!!INLINEFLASH.busy;
 if(dom.lockRead&&dom.lockMode){
  const eligible=c.valid&&[49152,65536].includes(c.bytes?.length)&&!INLINEFLASH.busy;
  dom.lockRead.disabled=!eligible;dom.lockMode.disabled=!eligible;
  if(!eligible&&!INLINEFLASH.busy)dom.lockStatus.textContent=c.valid?
   'Lock ตาม Main.zip รองรับเฉพาะ BIN Keihin 48 KB / 64 KB; ไฟล์ขนาดนี้ยังไม่รองรับ':
   'เลือก BIN Keihin 48 KB / 64 KB เพื่อสร้างไฟล์ Lock แยกจากต้นฉบับ';
 }
 const shared=window.__55SharedEcu?.snapshot?.();
 const connectedId=shared?.connected&&/^[0-9A-F]{10}$/.test(shared.ecuId||'')?{
  ecuId:shared.ecuId,family:'UNVERIFIED',sourcePart:shared.part||null,
  sourceMatched:false,handshake:'AUTO_DIAGNOSTIC',
  catalog:shared.catalogMatched?{ecuId:shared.ecuId,part:shared.part,
   family:shared.catalogFamily,startOffset:shared.startOffset,checksumOffset:shared.checksumOffset,
   startOffsetText:shared.startOffsetText,checksumOffsetText:shared.checksumOffsetText}:null
 }:null;
 const inlineIdentity=(INLINEFLASH.busy||INLINEFLASH.postCheck)?INLINEFLASH.engine?.identity:null;
 const staleId=!!last?.identity?.ecuId&&!!connectedId?.ecuId&&last.identity.ecuId!==connectedId.ecuId;
 const identity=inlineIdentity||(recency()&&!staleId?last?.identity:null)||connectedId;
 const recoveryCandidate=!!identity?.ecuId?.endsWith('0000');
 const plan=(inlineIdentity?.sourceMatched||INLINEFLASH.plan?.checks?.sourceUnlistedWithProof)?INLINEFLASH.plan:verified()?last?.plan:null;
 const source=catalogRecord(identity);
 const sourceCount=window.__55MainProgrammingProbe?.snapshot?.();
 const physicalFamilyAck=identity?.programmingSessionVerified===true&&
  identity?.physicalFamilyEvidence==='MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK';
 const originalEcmAuto=source?.origin==='ORIGINAL_PUBLIC_ECM_DAT'&&
  String(source.startOffsetText||'').toLowerCase()==='auto'&&
  String(source.checksumOffsetText||'').toLowerCase()==='auto';
 // The initial session may have neither BIN nor offset hint: never dereference null.
 const binEstimate=binOffsetHint&&binOffsetHint.saved===c.saved?binOffsetHint.estimated:null;
 const fileReady=!!quick||c.valid;
 // Main Button1_Click reads any selected file first. SearchPattern methods
 // exist for only 11 sizes; source BIN import must not be blocked by that.
 const sourceBinSizeSupported=hasMainLocator(quick?.bytes||c.bytes);
 const cableReady=!!window.__55SharedEcu?.port?.ready;
 // Physical ECU absent from the purchased Main C# catalog: show the reason,
 // never suggest this BIN-only analysis authorizes erase or write.
 // ECM.dat is a supplementary reference; its presence does not make the
 // physical ECU a member of the original embedded Main 290 table.
 const unlistedPhysical=!!connectedId?.ecuId&&
  !catalog290.rows?.has(connectedId.ecuId)&&!connectedId.catalog&&
  !INLINEFLASH.busy&&!INLINEFLASH.postCheck;
 const progress=!!inlineIdentity||!!connectedId||(c.valid&&last?.saved===c.saved&&recency()&&!staleId);
 setItem('model',quick?'อ่านรุ่นจาก ECU จริงอัตโนมัติ':c.model||'ยังไม่เลือกรุ่น');
 setItem('dbcount',catalog290.rows?'ฐาน Main 290 + ECM.dat ต้นฉบับ 122':catalog290.error?'ฐาน Main 290 โหลดผิดพลาด (ECM.dat อ้างอิงยังใช้ได้)':'กำลังโหลดฐาน Main 290');
 setItem('filename',quick?quick.filename:c.valid?c.saved.filename:'ยังไม่ได้เลือก BIN');
 setItem('source',quick?(quick.vaultId?'BIN ในคลังของแอป':'BIN ที่เลือกจากโทรศัพท์'):c.valid?(c.saved.vaultId?'BIN ในคลังของแอป':c.saved.customerBin?'BIN ที่นำเข้าจากเครื่อง':'Master BIN (จากแอป)'):'—');
 setItem('size',quick?mainFileSize(quick.bytes.length):c.valid?mainFileSize(c.bytes.length):'—');
 setItem('sha',quick?(quick.sha256?.slice(0,20)+'…'||'กำลังตรวจ…'):hash&&hash.saved===c.saved&&c.valid?hash.hex.slice(0,20)+'…':'ยังไม่ได้คำนวณ');
 setItem('ecu',identity?.ecuId||'ยังไม่ได้อ่านจาก ECU');
 setItem('part',identity?(source?.part||identity.sourcePart||'ไม่ระบุใน Main C#'):'—');
 setItem('family',identity?(identity.programmingSessionVerified&&identity.family!=='UNVERIFIED'?
  identity.family+' · Family จาก ECU ACK จริง':
  sourceCount?.countState==='CONFIRMED'&&sourceCount.ecuId===identity.ecuId?
    sourceCount.family+' · Flash Count ACK (อ่านจริง)':
  source?.family?source.family+(source.origin==='ORIGINAL_PUBLIC_ECM_DAT'?' · จาก ECM.dat ต้นฉบับ (รอ ECU ACK)':' · อ้างอิงฐาน C# (ยังไม่ยืนยัน)'):identity.family||'ไม่ระบุ'):'—');
 setItem('flashcount',Number.isInteger(identity?.count)?identity.count+' ครั้ง':
  sourceCount?.countState==='CONFIRMED'?sourceCount.flashCount+' ครั้ง · ACK โหมดโปรแกรมมิ่ง (ยังไม่อนุญาต Flash)':
  sourceCount?.countState==='NO_REPLY'||sourceCount?.countState==='ERROR'?
   'ตรวจแล้วไม่ตอบ/ไม่ผ่าน: '+(sourceCount.countError||'ไม่มี ACK ที่ยืนยันได้'):
  sourceCount?.countState==='NOT_TESTED'&&sourceCount.handshake==='FAILED'?
   'ลองปลุกโหมดโปรแกรมมิ่งแล้ว แต่ HELLO/FALLBACK ไม่ตอบ · ยังไม่ได้ส่งคำสั่ง Flash Count':
  'ยังไม่ได้ตรวจ Flash Count ในโหมดโปรแกรมมิ่ง');
 setItem('sourceMatch',identity?(identity.sourceMatched?'ยืนยัน ECU ID / Family จาก ECU จริง':
  identity.programmingSessionVerified&&identity.physicalFamilyEvidence==='MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK'?
  (source?.origin==='ORIGINAL_PUBLIC_ECM_DAT'?'ECM.dat ต้นฉบับพบ Part Code • Family / Flash Count ยืนยันจาก ECU จริง':'ECU นอกฐาน 290 · Family / Flash Count ยืนยันจาก ECU จริง'):
  source?(source.part?'พบรหัสในฐาน Main แต่ Family ยังไม่ยืนยันจริง':'พบรหัสแต่ไม่มี Part Code'):
  'อ่าน ECU ID ได้ • ไม่อยู่ในฐาน Main 290 (ไม่บังคับ)'):'รออ่าน ECU ID จริง');
 // For original ECM.dat's AUTO fields, show the firmware-derived preview
 // when it exists, always explicitly labeled BIN-only, NOT a write plan.
 setItem('start',plan?X(plan.startOffset):
  originalEcmAuto&&binEstimate?.startOffsetHex?binEstimate.startOffsetHex+' • BIN เท่านั้น':
  source?sourceOffset(source.startOffset,source.startOffsetText):
  binEstimate?.startOffsetHex?binEstimate.startOffsetHex+' • BIN เท่านั้น':'—');
 setItem('checksum',plan?X(plan.checksumOffset):
  originalEcmAuto&&binEstimate?.checksumOffsetHex?binEstimate.checksumOffsetHex+' • BIN เท่านั้น':
  source?sourceOffset(source.checksumOffset,source.checksumOffsetText):
  binEstimate?.checksumOffsetHex?binEstimate.checksumOffsetHex+' • BIN เท่านั้น':'—');
 // A valid Shindengen firmware signature identifies the C# profile and
 // block size before the actual ECU+BIN write plan is authorized. The two
 // statuses must remain visibly distinct until full BIN identity approval.
 setItem('block',Number.isInteger(plan?.blockBytes)?plan.blockBytes.toLocaleString()+' bytes':
  Number.isInteger(binEstimate?.binBlockBytes)?binEstimate.binBlockBytes.toLocaleString()+' bytes • BIN เท่านั้น':'—');
 setItem('profile',plan?.profile||
  (binEstimate?.binProfile?binEstimate.binProfile+' • BIN เท่านั้น':'ยังไม่มีแผนที่ยืนยัน'));
 setItem('offsetState',plan?'ตรวจด้วย HondaFlashEngine / C# แล้ว':
  source?(source.origin==='ORIGINAL_PUBLIC_ECM_DAT'?
   (binEstimate?.startOffsetHex&&binEstimate?.checksumOffsetHex?
    'ECM.dat ระบุ AUTO • พบ Offset/Checksum จาก BIN เท่านั้น • ยังไม่มีแผนเขียนที่ตรวจผ่าน':
    'ECM.dat ระบุ AUTO • ต้องตรวจ Offset/Checksum จาก BIN'):
   'พบข้อมูลจากฐาน C# · ต้องตรวจเทียบ BIN ก่อนเขียน'):
  binEstimate?'ประมาณจากขนาด/ลายเซ็น BIN เท่านั้น • ต้องเสียบ ECU ยืนยันก่อนอัด':
  fileReady?'กำลังวิเคราะห์ BIN / ต้องอ่าน ECU ID จริง':'ยังไม่มีค่า Offset ที่ยืนยัน');
 dom.note.textContent=staleId?'ECU ID จากสายล่าสุดเปลี่ยนจาก '+last.identity.ecuId+' เป็น '+connectedId.ecuId+' • แผนเดิมใช้ไม่ได้ ต้องอ่าน ECU ID และตรวจ BIN ใหม่':error?'หยุดตรวจ: '+error:message||
  'การตรวจนี้อ่าน ECU ID และคำนวณแผนเท่านั้น ไม่มีคำสั่ง ERASE/WRITE · ขั้นตอนอัดจริงจะอ่าน ID ใหม่';
 const status={
  bin:fileReady,
  id:!!identity?.ecuId&&progress,
  catalog:!!source&&progress,
  family:!!(identity?.sourceMatched||physicalFamilyAck)&&progress,
  offset:!!plan,
  hardware:false
 };
 for(const [k,obj] of Object.entries(dom).filter(([k])=>k.startsWith('check_'))){
  const key=k.slice(6),ok=status[key];
  obj.state.textContent=ok?'ผ่าน':key==='catalog'?'ข้อมูลอ้างอิงเท่านั้น':key==='hardware'?'ต้องตรวจด้วยตนเอง':key==='family'&&identity?.ecuId?'ยังไม่ยืนยัน':'รอตรวจ';
  obj.ico.textContent=ok?'✓':key==='hardware'?'!':'○';
  obj.row.classList.toggle('passed',ok);
 }
 dom.read.disabled=working||!!INLINEFLASH.busy||!!document.getElementById('licenseGate');
 dom.check.disabled=working||!c.valid||!identity||!recency()||last?.saved!==c.saved;
 dom.flash.disabled=working||!!INLINEFLASH.busy||(recoveryCandidate&&!INLINEFLASH.postCheck)||
   !(INLINEFLASH.postCheck||(fileReady&&sourceBinSizeSupported&&cableReady))||
  !!$('btnFlash')?.hidden||!!$('btnFlash')?.disabled;
 dom.flash.textContent=INLINEFLASH.busy?'กำลังตรวจ / อัดไฟล์ ECU':
  INLINEFLASH.postCheck?'✓ ตรวจ ECU หลังเปิดกุญแจใหม่':
  recoveryCandidate?'⟳ พบ Recovery • หยุด Flash ปกติ':
  unlistedPhysical?(fileReady?'⇧ ตรวจ BIN / Flash ECU นอกฐาน (ยืนยันก่อนลบ)':'○ รอเลือก BIN สำหรับ ECU นอกฐาน'):'⇧ อัดไฟล์ ECU';
 if(dom.recovery)dom.recovery.hidden=!(recoveryCandidate||window.__55RecoverySuggested);
 if(dom.miniProgress){const pct=$('pct')?.textContent||'0%';dom.miniProgress.textContent=INLINEFLASH.busy||INLINEFLASH.postCheck?
  'ความคืบหน้า '+pct+' · '+(INLINEFLASH.status||''):
  unlistedPhysical?(fileReady&&binEstimate?.startOffsetHex&&binEstimate?.checksumOffsetHex?'อ่าน BIN แล้ว • Start '+binEstimate.startOffsetHex+' / Checksum '+binEstimate.checksumOffsetHex+' (BIN เท่านั้น) • ยังไม่มีโปรไฟล์เขียนยืนยัน':'อ่าน ECU ID ได้แล้ว แต่ยังไม่มีโปรไฟล์เขียนที่ยืนยัน'):'พร้อมเริ่มตรวจ';}
 if(dom.miniBar){dom.miniBar.style.width=(INLINEFLASH.busy||INLINEFLASH.postCheck?$('barFill')?.style.width||'0%':'0%');}
 dom.flash.title=unlistedPhysical?'ECU นอกฐาน 290: Flash Engine จะตรวจ ECU ID / Family ACK จริงและ BIN ซ้ำ ก่อนขออนุมัติ ERASE/WRITE':
  dom.flash.disabled?'ต้องบันทึก BIN อ่าน ECU ID และตรวจ Preflight ให้ผ่านก่อน':
  'ใช้ Flash Engine เดิมซึ่งอ่าน ECU ID ใหม่ก่อน ERASE';
 if(dom.gateReason){
  const blockers=[];
  if(!fileReady)blockers.push('ยังไม่ได้เลือกไฟล์ BIN');
  if(!cableReady)blockers.push('ยังไม่ได้เชื่อมต่อ FT232R จากหน้าแรก');
  if(recoveryCandidate)blockers.push('ECU ID ลงท้าย 0000: อาจอยู่ใน Recovery Boot • หยุด Flash ปกติ และยืนยัน Boot/Family ผ่านเมนู Recovery');
  if(!identity?.ecuId){if(fileReady&&cableReady&&!INLINEFLASH.busy)blockers.push('กดปุ่มอัดเพื่อให้อ่าน ECU ID/Part/Family อัตโนมัติ');}
  else if(!catalogRecord(identity)){/* Main 290 is optional: do not present catalog absence as a blocker. */}
  else if(!catalogRecord(identity)?.part)blockers.push('ต้นฉบับไม่มี Part Code สำหรับ ECU ID '+identity.ecuId);
  else if(!identity.sourceMatched&&!physicalFamilyAck)
   blockers.push('พบข้อมูล ECU ในฐานอ้างอิงแล้ว แต่ Flash Preflight ยังไม่มี Family ACK ในเซสชันของตน ('+identity.handshake+')');
  if(identity?.ecuId&&fileReady&&!plan)blockers.push('ยังไม่มีแผนเขียนจาก BIN + ECU ที่ตรวจผ่าน (หน้า Flash จะตรวจยืนยันอีกครั้งก่อน ERASE)');
  if(($('btnFlash')?.hidden||$('btnFlash')?.disabled)&&!INLINEFLASH.busy)blockers.push('Flash Engine ยังไม่พร้อม หรือ License ไม่พร้อม');
  if(working||INLINEFLASH.busy)blockers.push('โปรแกรมกำลังทำงาน');
  dom.gateReason.textContent=INLINEFLASH.postCheck?'Final ACK สำเร็จ · ปิดกุญแจ OFF แล้วเปิด ON เพื่อกดตรวจ ECU ID อีกครั้ง':INLINEFLASH.busy?'กำลังตรวจและอัดผ่าน Flash Engine จาก Main C#':blockers.length?'ยังไม่พร้อมอัด: '+[...new Set(blockers)].join(' • '):
   'Preflight ผ่านแล้ว · กดเริ่มอัดเพื่อเข้า Flash Engine จริง (ยังต้องยืนยันและอ่าน ECU ID อีกครั้ง)';
 }
 const stepIndex=verified()?3:identity?2:fileReady?1:0;
 for(let n=0;n<4;n++){
  const item=dom['step'+n];item.classList.toggle('done',n<stepIndex);
  item.classList.toggle('active',n===stepIndex);
 }
 const ready=verified();
 dom.title.textContent=INLINEFLASH.postCheck?'อัดเสร็จ • ปิดกุญแจ OFF → เปิด ON':
  recoveryCandidate?'ตรวจพบ Recovery Boot ID • Flash ปกติถูกล็อก':
  INLINEFLASH.busy?'กำลังตรวจและอัดไฟล์ ECU':
  ready?'ผ่านการตรวจซอฟต์แวร์ (ยังไม่ได้ ERASE)':
  unlistedPhysical?(fileReady?'ECU นอกฐาน Main 290 • ตรวจ BIN / Family สดเมื่อกด Flash':'อ่าน ECU ID ได้แล้ว • รอเลือก BIN'):
  fileReady&&!sourceBinSizeSupported?'เปิด BIN แล้ว • ขนาดไฟล์ไม่มีตัวค้น BIN ID จาก Main':
  fileReady&&cableReady?'พร้อมตรวจ ECU / BIN ก่อนอัด':
  working?'กำลังอ่าน ECU / ตรวจ Preflight':identity?.ecuId&&source?.part&&!identity.sourceMatched?'พบ ECU ID ในฐาน · รอยืนยัน Family':'รอเลือก BIN และเชื่อม FT232R';
 dom.title.classList.toggle('ready',ready);
}
async function saveHash(c){
 if(!c.valid)throw Error('BIN ที่บันทึกไม่ตรงกับตารางล่าสุด กรุณากดบันทึก BIN ใหม่');
 if(!crypto?.subtle?.digest)throw Error('เบราว์เซอร์ไม่รองรับ SHA-256');
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',c.bytes));
 const hex=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
 if(quickBin()===c.saved&&c.saved.sha256&&c.saved.sha256.toLowerCase()!==hex)throw Error('SHA-256 ของ BIN ที่เลือกเปลี่ยนก่อนตรวจ Preflight');
 hash={saved:c.saved,hex};return hex;
}
async function readECU(){
 if(working||INLINEFLASH.busy)return;
 if(!navigator.usb) return errorOut('Chrome นี้ไม่รองรับ WebUSB / FT232R');
 if(document.getElementById('licenseGate'))return errorOut('กรุณาเข้าสู่ระบบ License ก่อนอ่าน ECU');
 const shared=window.__55SharedEcu;
 if(!shared)return errorOut('ระบบสาย FT232R ที่เชื่อมจากหน้าแรกยังไม่พร้อม');
 if(shared.snapshot().running)return errorOut('กรุณาหยุดอ่าน Live Data ก่อนอ่าน ECU ID เพื่อใช้สายเดียวกัน');
 // A failed Android WebUSB transferIn closes the old FT232R handle.
 // Recover ONLY the same previously granted cable before source
 // programming identification; no new ECU command or USB picker.
 if(!shared.port?.ready){
  const restored=await shared.restoreCable?.();
  if(!restored||!shared.port?.ready)
   return errorOut('FT232R interface หลุดหลังอ่าน ECU • กรุณาเชื่อมสายจากหน้าแรกใหม่ก่อนตรวจ Flash');
 }
 if(K.t)return errorOut('ระบบ DTC เก่ากำลังใช้พอร์ต USB แยก กรุณาตัดการเชื่อมต่อเดิม');
 working=true;error='';message='กำลังเลือกอุปกรณ์ FT232R…';last=null;hash=null;render();
 let port=null;
 try{
  // Reuse the physical FT232R opened from the home dashboard.
  const [{HondaFlashEngine}]=await Promise.all([
   import(new URL('flash_port/honda-write-engine.js?v=420',document.baseURI).href)]);
  if(typeof api!=='function')throw Error('ไม่พบตัวตรวจ License');
  const license=await api('check',{device:localStorage.getItem('55_device_id')});
  if(!license?.active)throw Error('License ไม่ได้เปิดใช้งาน');
  port=await shared.acquire("PREFLIGHT");
  if(!port?.ready)throw Error('สายหลักถูกตัดการเชื่อมต่อแล้ว');
  const engine=new HondaFlashEngine(port,()=>{});
  message='กำลังอ่าน ECU ID และ Flash Count ด้วย FormMain C#…';render();
  const identity=await engine.identify({programmingPreflight:true});
  const c=current();
  last={identity,engine,at:Date.now(),saved:c.valid?c.saved:null,model:c.model,plan:null};
  const found=catalogRecord(identity);
  message=identity.ecuId?.endsWith('0000')?
   'พบ ECU Boot ID '+identity.ecuId+' • Flash ปกติหยุดก่อน ERASE ให้เปิด Recovery เพื่อยืนยันโหมด/Family จาก ECU จริง':identity.sourceMatched?
   'อ่าน ECU ID '+identity.ecuId+' และยืนยัน Family แล้ว · กดตรวจ Preflight':
   found?(found.origin==='ORIGINAL_PUBLIC_ECM_DAT'?
    'อ่าน ECU ID '+identity.ecuId+' • พบ Part '+found.part+' ใน ECM.dat ต้นฉบับ • '+
     (identity.programmingSessionVerified?'Family / Flash Count ยืนยันจากรถแล้ว • ตรวจ BIN / Offset ต่อ':'ต้องรอ Family ACK ก่อนสร้างแผนเขียน'):
    'อ่าน ECU ID '+identity.ecuId+' ได้จริง · พบในฐาน 290 ('+found.family+') แต่เซสชัน '+identity.handshake+' ยังไม่ยืนยัน Family สำหรับแฟลช'):
   'อ่าน ECU ID '+identity.ecuId+' ได้จริง แต่ไม่พบในฐาน 290 รายการ · ตรวจรุ่นกล่อง/คำตอบดิบก่อน';
 }catch(e){
  last=null;
  error=e?.message||String(e);
 }finally{
  shared.release("PREFLIGHT");
  if(port&&!port.ready)await shared.restoreCable?.();
  // Shared port belongs to the home dashboard. Never close it here.
  working=false;render();
 }
}
const approvedPartialBins=new Set(); // Session-only: exact ECU ID + saved BIN SHA-256
async function runCheck({requestConfirmation=false}={}){
 if(working||INLINEFLASH.busy)return;
 working=true;error='';message='กำลังตรวจ BIN / Part Code / Memory Map…';render();
 try{
  const c=current();
  if(!c.valid)throw Error('BIN ไม่ได้บันทึกหรือถูกแก้ภายหลัง · ต้องบันทึกใหม่');
  if(!last||!recency()||!physicalIdMatchesLast()||last.saved!==c.saved||last.model!==c.model)throw Error('ผล ECU ID หมดอายุ ไม่ตรง ECU ที่ต่อสายล่าสุด หรือคนละไฟล์ · กรุณาอ่าน ECU ID ใหม่');
  if(last.identity.ecuId?.endsWith('0000'))throw Error('พบ Recovery Boot ID: หยุด Preflight ของ Flash ปกติและเปิดเมนู Recovery');
  const catalog=catalogRecord(last.identity);
  const sourceFamilyAck=last.identity.programmingSessionVerified===true&&
   last.identity.physicalFamilyEvidence==='MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK';
  if(!last.identity.sourceMatched&&!sourceFamilyAck){
   message='ยังไม่มี Family/Flash Count ACK ที่ตรวจจากกล่องจริงสำหรับ '+last.identity.ecuId+' • ต้องตรวจโหมดโปรแกรมมิ่งก่อน';
   last.plan=null;
   return;
  }
  await saveHash(c);
  // makePlan() is a strict calculation only: no USB communication, no erase, no write.
  let plan;
   try{plan=last.engine.makePlan(c.bytes.slice(),{filename:c.saved.filename,fast:false,recovery:false})}
   catch(e){
    if(e.code==='UNLISTED_PARTIAL_ID_CONFIRM'){
     last.plan=null;
     const approvalKey=last.identity.ecuId+'|'+(hash?.saved===c.saved?hash.hex:'');
     const previouslyApproved=approvalKey.split('|')[1]&&approvedPartialBins.has(approvalKey);
     // Automatic PRE-FLIGHT is calculation only: source C# accepts a
     // three-byte embedded BIN locator when physical Family ACK is known.
     // Never claim that this proves a full five-byte BIN ID match. The real
     // Flash button independently re-identifies and requests consent.
     if(!requestConfirmation&&!previouslyApproved){
      plan=last.engine.makePlan(c.bytes.slice(),{
       filename:c.saved.filename,confirmedPart:'CONFIRM '+last.identity.ecuId,
       fast:false,recovery:false
      });
      message='Auto Preflight: แผน BIN/Offset/Checksum ผ่านการคำนวณจาก ECU ID และ Family ACK • BIN มีรหัส ECU เพียง 3 ไบต์ • ยังไม่ได้ ERASE';
     }else{
     // Same explicit partial-ID confirmation supported by the original
     // inline Flash button. This confirmation creates a READ-ONLY plan;
     // destructive Flash still identifies the ECU anew and asks separately.
     const id=last.identity.ecuId;
     const part=last.identity.datReference?.part||last.identity.sourcePart||'ไม่พบ';
     const approved=previouslyApproved||confirm('55 PERFORMANCE • ตรวจ BIN ก่อนสร้างแผนเขียน (ยังไม่อัด)\n\n'+
      'ECU ID จากรถ: '+id+'\n'+
      'Family จาก ECU ACK: '+last.identity.family+'\n'+
      'Part Code ฐานอ้างอิง: '+part+'\n'+
      'ไฟล์: '+c.saved.filename+'\n'+
      'SHA-256: '+(hash?.saved===c.saved?hash.hex:'ยังไม่ทราบ')+'\n\n'+
      'BIN มี ECU ID เพียง 3 ไบต์แรก ไม่ยืนยันรหัสเต็มทั้ง 5 ไบต์\n'+
      'คุณตรวจแล้วว่าไฟล์นี้เป็นไฟล์จูน/ไฟล์สำรองที่ใช้กับกล่องรุ่นนี้จริงหรือไม่?\n\n'+
      'ตกลง = บันทึกคำยืนยันของช่างเพื่อคำนวณแผน (ไม่ ERASE/WRITE)\n'+
      'ยกเลิก = หยุด โดยไม่สร้างแผน');
     if(!approved){
      message='ยกเลิกการยืนยัน BIN • ไม่มีแผนเขียน และไม่ได้ ERASE/WRITE';
      return;
     }
     if(!previouslyApproved)approvedPartialBins.add(approvalKey);
     // Do NOT mark full five-byte BIN ID matching. The engine preserves
     // its source locator evidence and independently calculates offsets,
     // checksum, write profile and block count from a copied immutable BIN.
     plan=last.engine.makePlan(c.bytes.slice(),{
      filename:c.saved.filename,confirmedPart:'CONFIRM '+id,
      fast:false,recovery:false
     });
     }
    }else{
    if(e.code!=='PART_NOT_CONFIRMED')throw e;
    const {readBinId}=await import(new URL('flash_port/bin-tools.js?v=379',document.baseURI).href);
    const embedded=readBinId(c.bytes);
    if(!embedded.ok||String(embedded.id).toUpperCase()!==last.identity.ecuId)throw e;
    plan=last.engine.makePlan(c.bytes.slice(),{filename:c.saved.filename,confirmedPart:last.identity.sourcePart,fast:false,recovery:false});
    }
   }
  if(!Number.isInteger(plan.startOffset)||!Number.isInteger(plan.checksumOffset)||!Number.isInteger(plan.blockBytes))
   throw Error('Memory Map ไม่ครบ จึงไม่ผ่าน Preflight');
  if(!plan.checks?.physicalIdMatched||!plan.checks?.offsetsFromCSharp)
   throw Error('แผนเขียนไม่ยืนยัน ECU ID/Offset');
  last.plan=plan;
  if(!message.startsWith('Auto Preflight:'))message='ตรวจซอฟต์แวร์ผ่าน · ไม่ได้ยืนยันแรงดันไฟ สาย K-Line หรือความเข้ากันได้ของเฟิร์มแวร์กับกล่องลูกค้า · ก่อน ERASE ระบบอ่าน ECU ID ใหม่';
 }catch(e){if(last)last.plan=null;error=e?.message||String(e)}
 finally{working=false;render()}
}
function errorOut(s){error=s;message='';render()}
function startFlash(){
 if((last?.identity?.ecuId||window.__55SharedEcu?.snapshot?.().ecuId||'').endsWith('0000')&&!INLINEFLASH.postCheck)return errorOut('พบ Recovery Boot ID • เปิดเมนู Recovery ก่อน ห้ามใช้ Flash ปกติ');
 if(!quickBin()&&!current().valid&&!INLINEFLASH.postCheck)return errorOut('กรุณาเลือก BIN จากเครื่องหรือบันทึก BIN ที่จูนก่อน');
 if(!window.__55SharedEcu?.port?.ready&&!INLINEFLASH.postCheck)return errorOut('กรุณาเชื่อม FT232R จากหน้าแรกก่อน');
 const target=$('btnFlash');if(!target||target.hidden||target.disabled)return errorOut('ระบบ Flash Engine เดิมยังไม่อนุญาตให้อัด');
 // One tap on the normal Flash button: the engine automatically re-identifies
 // the physical ECU and checks source/BIN/offset before any erase/write.
 // This click does not electronically verify external voltage or backup.
 error='';target.click();
 message=INLINEFLASH.postCheck?'กำลังตรวจ ECU ID หลังเปิดกุญแจใหม่':'กำลังตรวจ ECU ID, Family, Part Code, BIN, Checksum และ Offset อัตโนมัติ ก่อน ERASE/WRITE';
 render();
}

let flashOverlay=null,flashOverlayMarker=null,flashOverlayFocus=null;
function updateFlashOverlay(){
 if(!flashOverlay)return;
 const active=!!INLINEFLASH.busy;
 const state=window.__55FlashStageView?.phase;
 const notice=flashOverlay.querySelector('.n24-flash-lock-summary');
 const icon=flashOverlay.querySelector('.n24-flash-lock-icon');
 const close=flashOverlay.querySelector('.n24-flash-overlay-close');
 if(active){
  icon.textContent='🔒';
  notice.textContent=state==='WRITE'?'กำลังเขียน BIN ลง ECU จริง · อย่าขัดจังหวะ':
   state==='ERASE'?'กำลังลบแฟลช ECU · อย่าขัดจังหวะ':
   state==='FINAL'?'รอ Final ACK จาก ECU · ยังห้ามออกจากหน้านี้':
   'กำลังตรวจและเตรียมการอัด ECU · กรุณาอยู่ที่หน้านี้';
 }else{
  icon.textContent=state==='DONE'?'✅':state==='STOP'?'⚠️':'🔓';
  notice.textContent=state==='DONE'?'ได้รับ Final ACK แล้ว · ทำตามคำสั่งปิด/เปิดกุญแจหลังอัด':
   state==='STOP'||INLINEFLASH.status?.includes('FAILED')?'การอัดหยุดแล้ว · ตรวจ Log และสถานะ ECU ก่อนทำต่อ':
   INLINEFLASH.postCheck?'การอัดเสร็จแล้ว · ไปตรวจ ECU หลังรีสตาร์ต':
   'สิ้นสุดการทำงาน Flash · ตรวจสถานะและ Log ก่อนทำต่อ';
 }
 close.hidden=active;
 flashOverlay.classList.toggle('n24-flash-overlay-finished',!active);
 flashOverlay.setAttribute('aria-busy',active?'true':'false');
}
function closeFlashOverlay(){
 if(!flashOverlay||INLINEFLASH.busy)return;
 const progress=dom.sourceCard;
 if(progress&&flashOverlayMarker?.parentNode){
  flashOverlayMarker.parentNode.replaceChild(progress,flashOverlayMarker);
 }
 flashOverlayMarker=null;
 flashOverlay.remove();flashOverlay=null;
 document.body.classList.remove('n24-flash-dialog-open');
 if(flashOverlayFocus?.isConnected)flashOverlayFocus.focus({preventScroll:true});
 flashOverlayFocus=null;
}
function openFlashOverlay(){
 if(flashOverlay){updateFlashOverlay();return}
 const progress=dom.sourceCard;
 if(!progress?.isConnected)return;
 flashOverlayFocus=document.activeElement;
 flashOverlayMarker=document.createComment('flash-progress-return');
 progress.parentNode.insertBefore(flashOverlayMarker,progress);
 const shade=make('div','n24-flash-overlay');
 shade.id='n24FlashOverlay';
 shade.setAttribute('role','dialog');
 shade.setAttribute('aria-modal','true');
 shade.setAttribute('aria-label','55 Performance · กำลังอัดไฟล์ ECU');
 shade.setAttribute('aria-busy','true');
 const modal=make('div','n24-flash-overlay-modal');
 const header=make('div','n24-flash-overlay-heading');
 header.append(make('span','n24-flash-lock-icon','🔒'),
  make('div','n24-flash-lock-summary','กำลังตรวจและเตรียมการอัด ECU · กรุณาอยู่ที่หน้านี้'));
 const warning=make('div','n24-flash-overlay-warning');
 warning.append(make('strong','','⚠ ระหว่างแฟลช ห้ามขัดจังหวะ'));
 const list=make('p','',
  'ห้ามปิดเว็บ / รีเฟรช / กดกลับ / สลับแอป / ปิดจอ / ถอดสาย USB หรือ OTG / ดับไฟเลี้ยง ECU / บิดกุญแจ OFF / สตาร์ตเครื่อง จนกว่าระบบจะแจ้งผล');
 warning.append(list);
 const slot=make('div','n24-flash-overlay-progress');
 slot.append(progress); // Move the ACTUAL progress card: engine events keep updating this single UI.
 const close=btn('ปิดหน้าต่าง · กลับหน้า Flash','n24-flash-overlay-close',closeFlashOverlay);
 close.hidden=true;
 const footer=make('p','n24-flash-overlay-footer',
  'หน้าต่างนี้แสดงผลจาก ECU จริง • ไม่เพิ่มคำสั่ง USB และไม่เปลี่ยนสูตรเปอร์เซ็นต์จาก Main.zip');
 modal.append(header,warning,slot,close,footer);
 shade.append(modal);
 document.body.append(shade);
 document.body.classList.add('n24-flash-dialog-open');
 flashOverlay=shade;
 updateFlashOverlay();
}
window.__55FlashStageOverlayOpen=openFlashOverlay;
window.__55FlashStageOverlayFinish=updateFlashOverlay;
window.addEventListener('beforeunload',event=>{
 if(INLINEFLASH.busy&&!INLINEFLASH.postCheck){
  event.preventDefault();
  event.returnValue='';
 }
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&flashOverlay){
  if(INLINEFLASH.busy){event.preventDefault();return}
  closeFlashOverlay();
 }
});

// Event-driven source Flash progress. This panel never controls ECU I/O.
function renderSourceFlashStage(){
 if(!dom.sourceTitle)return;
 const p=window.__55FlashStageView;
 const phases={CONNECT:0,PREPARE:0,WAIT:0,AUTH:0,ERASE:1,ERASE_OK:1,WRITE:2,FINAL:3,DONE:3};
 const currentStep=phases[p?.phase]??-1;
 dom.sourceTitle.textContent=p?.label||'รอเริ่มการอัดไฟล์จริง';
 dom.sourceDetail.textContent=p?.detail||'ยังไม่มีคำสั่งแฟลชจาก ECU';
 dom.sourcePct.textContent=p?.barKind==='COUNTDOWN'?
  p.barPercent+'% · นับถอยหลัง':p?.barKind==='WRITE'||p?.barKind==='DONE'?
  p.barPercent+'% · ตำแหน่ง BIN':'—';
 dom.sourceFill.style.width=p&&['COUNTDOWN','WRITE','DONE','STOP'].includes(p.barKind)?
  p.barPercent+'%':'0%';
 dom.sourceTrack.classList.toggle('n24-source-indeterminate',p?.barKind==='INDETERMINATE');
 dom.sourceTrack.classList.toggle('n24-source-countdown',p?.barKind==='COUNTDOWN');
 dom.sourceElapsed.textContent=p?.elapsedSeconds===null||p?.elapsedSeconds===undefined?'—':p.elapsedText;
 dom.sourceRemaining.textContent=p?.remainingText||'—';
 dom.sourceBlocks.textContent=p&&p.blocksSent?
  p.blocksSent.toLocaleString('en-US')+' บล็อก · '+(p.bytesSent/1024).toFixed(1)+' KiB ส่งจริง':'ยังไม่มี WRITE ACK';
 for(let i=0;i<dom.sourceSteps.length;i++){
  const el=dom.sourceSteps[i];
  el.classList.toggle('done',p?.phase==='DONE'||currentStep>i);
  el.classList.toggle('active',p?.phase!=='STOP'&&currentStep===i);
 }
 dom.sourceStatus.textContent=p?.phase==='STOP'?
  'หยุดดำเนินการ • ตรวจ TX/RX และ Recovery ก่อนส่งคำสั่งใหม่':
  p?.phase==='DONE'?'เสร็จสิ้นตาม Final ACK • ต้องตรวจ ECU หลัง OFF/ON':
  p?.phase==='WAIT'?'กำลังรอเวลาจริงของ Main.zip ไม่ใช่เปอร์เซ็นต์การเขียน':
  p?.phase==='ERASE'?'กำลัง ERASE • ไม่สร้างเปอร์เซ็นต์ระหว่างรอ ECU':
  p?.phase==='WRITE'?'ความคืบหน้าจากตำแหน่งบล็อกที่ ECU ตอบรับ':
  'ขั้นตอนจะแสดงตามคำตอบ ECU จริง';
 updateFlashOverlay();
}
function mount(host){
 if(flashOverlay&&!INLINEFLASH.busy)closeFlashOverlay();
 stage=host;stage.classList.add('n24-preflight-stage');stage.replaceChildren();dom={};
 const head=make('section','n24-hero');
 head.append(make('div','n24-headline','FAST FLASH'),make('p','','ตรวจ ECU และไฟล์อัตโนมัติ'));
 head.append(make('small','','เลือกไฟล์ ตรวจ ECU ID และความพร้อมก่อนเริ่มเขียนจริง'));stage.append(head);
 const choose=make('div','n24-model');
 choose.append(make('span','','รุ่นที่เลือก'));const model=make('strong','','—');dom.model=model;choose.append(model);
 choose.append(btn('เปลี่ยนรุ่น ›','n24-model-change',()=>window.__55NeonNavigate?.('library')));stage.append(choose);
 const easy=card('n24-easy','⚡','อัดไฟล์ ECU');

 // Tuned BIN vault: IndexedDB in this app, not an exported .bin file.
 const vaultBox=make('section','n24-vault');
 const vaultHeading=make('b','n24-vault-heading','📚 คลัง BIN ที่จูนแล้วในแอป');
 const vaultIntro=make('p','n24-help',
  'เลือกไฟล์ที่ตั้งชื่อไว้หลังจูน • โปรแกรมตรวจ SHA-256 ของไฟล์ในคลัง และตรวจ ECU ID / Part / Offset จริงอีกครั้งก่อนอัด');
 const vaultSelect=make('select','n24-vault-select');vaultSelect.id='n24VaultSelect';
 vaultSelect.setAttribute('aria-label','เลือก BIN จากคลังภายในแอป');
 const vaultRow=make('div','n24-vault-row');
 const vaultLoad=btn('✓ เลือก BIN นี้','n24-btn n24-vault-load',()=>void loadVault());
 const vaultDelete=btn('ลบ','n24-btn n24-vault-delete',()=>void deleteVault());
 vaultRow.append(vaultLoad,vaultDelete);
 const vaultMessage=make('p','n24-vault-message','กำลังเปิดคลัง BIN…');
 const vaultWarning=make('p','n24-help',
  'คลังนี้อยู่ใน Chrome เครื่องปัจจุบัน หากล้างข้อมูลเว็บไซต์หรือเปลี่ยนเครื่อง ไฟล์อาจหาย • ไม่ใช่ DRM ที่ป้องกันการดึงไฟล์ได้สมบูรณ์');
 vaultBox.append(vaultHeading,vaultIntro,vaultSelect,vaultRow,vaultMessage,vaultWarning);
 easy.append(vaultBox);
 let vaultList=[];
 async function refreshVault(preferId){
  const vault=window.__55TunedBinVault;
  if(!vault){
   vaultSelect.replaceChildren(new Option('ระบบคลัง BIN ยังไม่พร้อม',''));
   vaultLoad.disabled=true;vaultDelete.disabled=true;
   vaultMessage.textContent='ระบบคลัง BIN ไม่พร้อม • รีโหลดหน้าเว็บ';return;
  }
  try{
   const previous=preferId||vaultSelect.value||quickBin()?.vaultId||S.saved?.vaultId||'';
   vaultList=await vault.list();
   if(!vaultSelect.isConnected)return;
   vaultSelect.replaceChildren(new Option('— เลือกไฟล์ BIN จากคลัง —',''));
   for(const record of vaultList){
    const label=record.name+' · '+record.model+' · '+mainFileSize(record.size);
    vaultSelect.add(new Option(label,record.id));
   }
   vaultSelect.value=vaultList.some(row=>row.id===previous)?previous:'';
   vaultLoad.disabled=!vaultSelect.value||!!INLINEFLASH.busy;
   vaultDelete.disabled=vaultLoad.disabled;
   vaultMessage.textContent=vaultList.length
    ?'มี '+vaultList.length+' ไฟล์ในคลัง • เลือกไฟล์แล้วกด “เลือก BIN นี้” เพื่อตรวจ ECU'
    :'คลัง BIN ยังว่าง • ไปหน้าจูน กดบันทึกและตั้งชื่อไฟล์ก่อน';
  }catch(e){
   vaultLoad.disabled=true;vaultDelete.disabled=true;
   vaultMessage.textContent='เปิดคลัง BIN ไม่สำเร็จ: '+(e?.message||e);
  }
 }
 async function loadVault(){
  if(INLINEFLASH.busy)return;
  const id=vaultSelect.value;
  if(!id)return errorOut('กรุณาเลือกไฟล์ในคลัง BIN ก่อน');
  const vault=window.__55TunedBinVault;
  vaultLoad.disabled=true;vaultMessage.textContent='กำลังตรวจ SHA-256 ของ BIN ในคลัง…';
  try{
   const entry=await vault.load(id);
   if(!entry)throw Error('ไม่พบไฟล์นี้ในคลัง BIN');
   if(INLINEFLASH.busy)throw Error('ECU กำลังทำงาน ไม่เปลี่ยน BIN ระหว่างอัด');
   const currentId=window.__55SharedEcu?.snapshot?.().ecuId;
   // Never claim that the human-supplied title or model label proves ECU compatibility.
   window.__55QuickFlashBin={
    bytes:entry.bytes,filename:entry.filename,sha256:entry.sha256,
    vaultId:entry.id,vaultName:entry.name,model:entry.model,
    selectedAt:Date.now(),source:'TUNED_LOCAL_VAULT'
   };
   error='';last=null;hash=null;binOffsetHint=null;
   window.dispatchEvent(new Event('55:bin-selection-changed'));
   vaultMessage.textContent='✓ ใช้ไฟล์ “'+entry.name+'” รุ่น '+entry.model+
    ' • SHA-256 ตรง • '+mainFileSize(entry.size)+' • ECU '+(currentId||'ยังไม่ได้อ่าน');
   if(dom.quickStatus)dom.quickStatus.textContent='✓ BIN จากคลัง: '+entry.name+' ('+mainFileSize(entry.size)+')';
   message='เลือก BIN จากคลังแล้ว • ให้ระบบอ่าน ECU ID จริงและตรวจความเข้ากันได้ก่อนอัด';
   void previewBinOffset();void analyzeSelectedBin();window.__55refreshFlashButton?.();
   render();if(window.__55SharedEcu?.snapshot?.().connected)void autoPrepare();
  }catch(e){errorOut('เลือก BIN ในคลังไม่สำเร็จ: '+(e?.message||e))}
  finally{vaultLoad.disabled=false;render()}
 }
 async function deleteVault(){
  if(INLINEFLASH.busy)return;
  const id=vaultSelect.value,entry=vaultList.find(x=>x.id===id);
  if(!entry||!confirm('ลบ BIN “'+entry.name+'” ออกจากคลังใน Chrome เครื่องนี้ถาวร?'))return;
  try{
   await window.__55TunedBinVault.remove(id);
   if(window.__55QuickFlashBin?.vaultId===id)window.__55QuickFlashBin=null;
   if(S.saved?.vaultId===id)S.saved=null;
   binOffsetHint=null;last=null;hash=null;
   await refreshVault();
   window.dispatchEvent(new Event('55:bin-selection-changed'));
   window.__55refreshFlashButton?.();render();
  }catch(e){errorOut('ลบ BIN ไม่สำเร็จ: '+(e?.message||e))}
 }
 vaultSelect.addEventListener('change',()=>{
  vaultLoad.disabled=!vaultSelect.value||!!INLINEFLASH.busy;
  vaultDelete.disabled=vaultLoad.disabled;
 });
 dom.vaultRefresh=refreshVault;
 void refreshVault();
 const uploadLabel=make('label','n24-upload-label','หรือเปิด BIN ภายนอกจากเครื่อง (ไฟล์ที่ลูกค้ามีอยู่แล้ว)');
 uploadLabel.htmlFor='n24QuickBin';
 const upload=make('input','n24-file-input');upload.type='file';upload.id='n24QuickBin';upload.accept='.bin'; // FormMain.OpenFileDialog.Filter: Bin file (*.bin)|*.bin
 const uploadNote=make('p','n24-help','ตัวเลือกสำรองสำหรับ BIN ภายนอก • BIN ที่ร้านจูนและบันทึกไว้ใช้จากคลังภายในแอป โดยไม่ต้องดาวน์โหลดไฟล์');
 // One source of truth: the old hidden FormMain checkbox is the actual value
 // consumed by inlineFlashStart(). The visible Fast Flash checkbox mirrors it.
 const sourceFast=$('mainFastWrite');
 const fastLabel=make('label','n24-fast-label');const fast=make('input','');fast.type='checkbox';fast.id='n24FastWrite';
 fast.checked=sourceFast?.checked??true;
 window.__55QuickFlashFast=fast.checked;
 fastLabel.append(fast,document.createTextNode(' เขียนเร็ว (Fast Write) · ไม่ติ๊ก = เขียนปกติ'));
 const fastStatus=make('p','n24-help',fast.checked?
  '✓ เปิด Fast Write ตาม Main.zip · ใช้เฉพาะโปรไฟล์ ECU ที่รองรับ':
  'โหมดเขียนปกติ ตาม Main.zip');
 dom.fast=fast;dom.fastStatus=fastStatus;
 const syncFastDisplay=()=>{
  const active=sourceFast?.checked??true;
  fast.checked=active;
  window.__55QuickFlashFast=active;
  fastStatus.textContent=active?
   '✓ Fast Write: ใช้การเร่งตามโปรไฟล์ที่ Main.zip รองรับ':
   'เขียนปกติ: ไม่เร่ง Baud Rate และไม่ลดช่วงหน่วง 150 ms ของ Shindengen';
 };
 fast.onchange=()=>{
  if(INLINEFLASH.busy){syncFastDisplay();return}
  if(sourceFast){
   sourceFast.checked=fast.checked;
   sourceFast.dispatchEvent(new Event('change',{bubbles:true}));
  }
  syncFastDisplay();
  message=fast.checked?'เลือก Fast Write แล้ว · โปรแกรมจะใช้โหมดเร็วตามชนิด ECU ที่พบ':
   'เลือกโหมดเขียนปกติแล้ว';
  render();
 };
 sourceFast?.addEventListener('change',()=>{
  if(INLINEFLASH.busy)return;
  syncFastDisplay();
 });
 const previous=quickBin();
 const uploadStatus=make('p','n24-upload-status',previous?'✓ '+previous.filename+' ('+mainFileSize(previous.bytes.length)+')':'ยังไม่ได้เลือกไฟล์');dom.quickStatus=uploadStatus;
 upload.onchange=async()=>{
  if(INLINEFLASH.busy){upload.value='';return}
  window.__55QuickFlashBin=null;vaultSelect.value='';error='';
  try{
   const f=upload.files?.[0];
   if(!f){uploadStatus.textContent='ยังไม่ได้เลือกไฟล์';return}
   // The original C# OpenFileDialog loads bytes before SearchBinFileForPattern.
   // Size is a later scan/write decision, not an input-file rejection.
   const sourceSizeSupported=MAIN_BIN_ID_SIZES.has(f.size);
   const bytes=new Uint8Array(await f.arrayBuffer());
   const digest=await crypto.subtle.digest('SHA-256',bytes);
   const sha256=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
   window.__55QuickFlashBin={filename:f.name,bytes,sha256,selectedAt:Date.now()};
   window.dispatchEvent(new Event('55:bin-selection-changed'));
   binOffsetHint=null;
   void previewBinOffset();
   void analyzeSelectedBin();
   uploadStatus.textContent='✓ '+f.name+' ('+mainFileSize(f.size)+')'+
    (sourceSizeSupported?' · เปิดไฟล์สำเร็จ':' · เปิดอ่านได้ แต่ขนาดไม่มีตัวค้นรหัส BIN ใน Main');
   message=sourceSizeSupported?
    'เปิด BIN แล้ว · ตรวจ ECU ID/Checksum/Offset ต่อได้':
    'เปิดไฟล์ตาม Main ได้แล้ว แต่ขนาดนี้ไม่มี SearchPattern สำหรับการตรวจ BIN ID · ยังไม่เปิดคำสั่งแฟลช';
  }catch(e){uploadStatus.textContent='เลือกไฟล์ไม่สำเร็จ: '+e.message;error=e.message}
  finally{window.__55refreshFlashButton?.();render();upload.value='';if(window.__55SharedEcu?.snapshot?.().ecuId)void autoPrepare();}
 };
 const flash=btn('⇧ อัดไฟล์ ECU','n24-btn n24-flash n24-easy-flash',startFlash);
 // Fail closed before the first asynchronous catalog/USB render.
 flash.disabled=true;dom.flash=flash;
 const recovery=btn('⟳ เข้าสู่ Recovery · ตรวจ ECU อีกครั้ง','n24-btn n24-read',()=>{
  if(INLINEFLASH.busy)return errorOut('รอการทำงาน Flash ให้จบก่อน');
  if(window.__55OpenRecoveryPanel)window.__55OpenRecoveryPanel();
  else window.__55NeonNavigate?.('recovery');
 });dom.recovery=recovery;recovery.hidden=true;
 const miniProgress=make('p','n24-mini-progress','พร้อมเริ่มตรวจ');dom.miniProgress=miniProgress;
 const miniBar=make('div','n24-mini-bar');const miniFill=make('i','');dom.miniBar=miniFill;miniBar.append(miniFill);
 // Keep the Main.zip C# writer opt-in inside the existing Flash controls.
 // No separate experimental C# test window or extra card in Fast Flash.
 const csharpModeRow=make('label','n24-csharp-mode-row');
 const csharpMode=document.createElement('input');
 csharpMode.type='checkbox';
 csharpMode.id='n24UseMainCSharpFlash';
 csharpMode.checked=window.__55PreferMainCSharpFlash===true;
 const csharpModeText=make('span','',
  csharpMode.checked?'✓ เครื่องยนต์แฟลช: C# Main.zip (ทดลอง)':
   'เครื่องยนต์แฟลช: JavaScript เดิม · ติ๊กเพื่อใช้ C# Main.zip (ทดลอง)');
 csharpModeRow.append(csharpMode,csharpModeText);
 const csharpModeHint=make('p','n24-help',
  'ขั้นตอนหน้าอัดและ USB เดิมเหมือนเดิม · C# ควบคุม Pre-Write → ERASE → WRITE → Final ACK เมื่อเลือกโหมดนี้ · KeihinOther ต้องปิด Fast Write');
 csharpMode.addEventListener('change',()=>{
  if(INLINEFLASH.busy){
   csharpMode.checked=window.__55PreferMainCSharpFlash===true;
   return;
  }
  window.__55PreferMainCSharpFlash=csharpMode.checked;
  csharpModeText.textContent=csharpMode.checked?
   '✓ เครื่องยนต์แฟลช: C# Main.zip (ทดลอง)':
   'เครื่องยนต์แฟลช: JavaScript เดิม · ติ๊กเพื่อใช้ C# Main.zip (ทดลอง)';
 });

 easy.append(uploadLabel,upload,uploadNote,uploadStatus,csharpModeRow,csharpModeHint,fastLabel,fastStatus,flash,recovery,miniBar,miniProgress);
 stage.append(easy);
 const sourceCard=card('n24-source-progress','◴','Flash Progress · Main.zip');
 const sourceSteps=make('div','n24-source-steps');
 dom.sourceSteps=['เตรียม','ลบแฟลช','เขียน BIN','Final ACK'].map((label,i)=>{
  const tile=make('div','n24-source-step');
  tile.append(make('b','',String(i+1)),make('span','',label));
  sourceSteps.append(tile);return tile;
 });
 const sourceTitle=make('strong','n24-source-title','รอเริ่มการอัดไฟล์จริง');
 const sourceDetail=make('p','n24-source-detail','ขั้นตอนจะมาจากคำสั่ง ECU จริง');
 const sourceTrack=make('div','n24-source-track'),sourceFill=make('i','');
 sourceTrack.append(sourceFill);
 const sourcePct=make('div','n24-source-pct','—');
 const sourceStats=make('div','n24-source-stats');
 const elapsed=make('strong','','—'),remaining=make('strong','','—'),blocks=make('strong','','ยังไม่มี WRITE ACK');
 for(const [caption,value] of [['เวลาที่ใช้',elapsed],['เวลาคงเหลือ (ประมาณ)',remaining],['ข้อมูลที่เขียนจริง',blocks]]){
  const cell=make('div','n24-source-stat');cell.append(make('span','',caption),value);sourceStats.append(cell);
 }
 const sourceStatus=make('p','n24-source-status','ขั้นตอนจะแสดงตามคำตอบ ECU จริง');
 Object.assign(dom,{sourceTitle,sourceDetail,sourceTrack,sourceFill,sourcePct,sourceElapsed:elapsed,
  sourceRemaining:remaining,sourceBlocks:blocks,sourceStatus});
 sourceCard.append(sourceSteps,sourceTitle,sourceDetail,sourceTrack,sourcePct,sourceStats,sourceStatus);
 dom.sourceCard=sourceCard;
 stage.append(sourceCard);
 window.__55FlashStageRender=()=>{if(sourceCard.isConnected)renderSourceFlashStage()};
 window.__55FlashStageRender();
 const analyzeCard=card('n24-analysis','▤','Analyze Result · ตรวจ BIN จาก Main.zip + ECM.dat');
 const analyzeStatus=make('p','n24-analysis-status','รอเลือกไฟล์ BIN');
 const analyzeTrack=make('div','n24-analysis-track'),analyzeBar=make('i','');
 analyzeTrack.append(analyzeBar);
 const analyzeBody=make('div','n24-analysis-data','เลือก BIN เพื่อเริ่ม');
 dom.analysisStatus=analyzeStatus;dom.analysisBar=analyzeBar;dom.analysisBody=analyzeBody;
 analyzeCard.append(analyzeStatus,analyzeTrack,analyzeBody);
 stage.append(analyzeCard);
 const lockCard=card('n24-lock','🔒','Lock ReadROM / Lock Mode · Main.zip');
 const lockNote=make('p','n24-help',
  'ใช้ฟังก์ชันต้นฉบับ FormMain.cs เฉพาะ Keihin BIN 48/64 KB เท่านั้น • สร้างสำเนา BIN พร้อมคำนวณ Checksum ใหม่ • ไม่ใช่คำสั่ง Lock EEPROM และไม่รับรองว่าป้องกันการอ่านด้วยอุปกรณ์อื่นได้ทุกวิธี');
 const lockActions=make('div','n24-actions n24-main-check-actions');
 const lockReadBtn=btn('🔒 Lock ReadROM · ดาวน์โหลด BIN','n24-btn',()=>void downloadLockedBin('read'));
 const lockModeBtn=btn('🔒 Lock Mode · ดาวน์โหลด BIN','n24-btn',()=>void downloadLockedBin('mode'));
 dom.lockRead=lockReadBtn;dom.lockMode=lockModeBtn;
 lockActions.append(lockReadBtn,lockModeBtn);
 const lockStatus=make('p','n24-lock-status','เลือก BIN 48 KB หรือ 64 KB เพื่อใช้ Main Lock');
 dom.lockStatus=lockStatus;lockCard.append(lockNote,lockActions,lockStatus);
 stage.append(lockCard);
 const file=card('n24-bin','▧','ไฟล์ที่จะอัด (BIN)');
 file.append(line('filename','ชื่อไฟล์'),line('source','ประเภทไฟล์'),line('size','ขนาดไฟล์'),line('sha','Checksum (SHA-256)'));stage.append(file);
 const ecu=card('n24-ecu','▣','ข้อมูล ECU (Identification)');
 ecu.append(line('dbcount','ฐานข้อมูลจาก Main.zip','กำลังโหลด…'));
 ecu.append(line('ecu','ECU ID','ยังไม่ได้อ่านจาก ECU'),line('part','Part Code'),line('family','Family'),line('flashcount','Flash Count'),line('sourceMatch','Source Match'));stage.append(ecu);
 const map=card('n24-map','▱','Auto Offset / Memory Map');
 map.append(line('start','Start Offset'),line('checksum','Checksum Offset'),line('block','Block Size'),line('profile','C# ECU Profile'),line('offsetState','สถานะตรวจ'));stage.append(map);
 const h=make('h3','n24-section-head','ขั้นตอนการอัดไฟล์ (Workflow)');stage.append(h);
 const steps=make('div','n24-workflow');
 for(const [n,label] of ['เลือก BIN','อ่าน ECU ID','ตรวจ Offset','อัดไฟล์'].entries()){
  const x=make('div','n24-step');x.append(make('b','',String(n+1)),make('span','',label));
  steps.append(x);dom['step'+n]=x;
 }stage.append(steps);
 const checking=card('n24-check','✓','รายการตรวจสอบก่อนอัดไฟล์');
 addChecklist(checking);stage.append(checking);
 const warning=make('div','n24-warning');
 warning.textContent='คำเตือน: BIN หลักจากแอปอาจไม่ตรงเฟิร์มแวร์ของ ECU ทุกคัน • ควรมี Full Backup ของกล่องลูกค้า (บางรุ่นอ่านเต็มก้อนไม่ได้), ต้องตรวจ Part Code และไฟเลี้ยงกับวิธีกู้คืน • ไม่มีการอ่าน BIN กลับทั้งก้อนเพื่อยืนยันหลังเขียน';
 stage.append(warning);
 const state=make('div','n24-state');
 const title=make('strong','','รอการตรวจ Preflight');dom.title=title;
 const note=make('p','','');dom.note=note;state.append(title,note);stage.append(state);
 const actions=make('div','n24-actions n24-main-check-actions');
 const read=btn('▣ อ่าน ECU ID','n24-btn n24-read',readECU);dom.read=read;
 const check=btn('▱ ตรวจ Preflight','n24-btn n24-verify',()=>runCheck({requestConfirmation:true}));dom.check=check;
 actions.append(read,check);
 stage.append(actions);
 const advanced=make('details','n24-advanced');
 advanced.append(make('summary','','ตัวเลือกขั้นสูง / ตรวจละเอียด'));
 stage.append(advanced);
 const gate=make('p','n24-help','');gate.setAttribute('role','status');dom.gateReason=gate;stage.append(gate);
 // The user's Main.zip FormMain.cs SHA-256 matches the source already ported
 // into the shared real-write engine. These are separate navigation routes,
 // not alternate command bytes or a bypass of any programming safeguards.
 const routes=make('div','n24-actions');
 for(const [title,path] of [
  ['ตรวจสาย USB / VID-PID (ไม่ส่งข้อมูล ECU)','flash_port/usb-cable-diagnostic.html'],
  ['เปิด Real ECU Flash (ขั้นสูง)','flash_port/flash-write-lab.html'],
  ['เปิด Offline Flash V28','flash_port/offline/index.html'],
  ['ตรวจ BIN ID / Checksum ตาม Main C#','flash_port/main-bin-audit.html'],
  ['ค้นฐาน ECU 290 รายการ','flash_port/main-ecu-catalog.html']
 ]){
  const a=make('a','n24-btn',title);
  a.href=new URL(path,document.baseURI).href;
  a.style.cssText='display:inline-flex;align-items:center;justify-content:center;text-decoration:none;min-height:42px;background:#263547;border:1px solid #56748e';
  routes.append(a);
 }
 if(!$('retailPreflightTools')){
  routes.id='retailPreflightTools';
  // Emergency links stay available in the locked Main Tools card only.
  $('mainSourceDetails')?.append(routes);
 }
 const help=make('p','n24-help','แสดงค่า ECU ID, ประเภทกล่อง, Offset และ Checksum จากข้อมูลที่ตรวจได้ · ข้อมูลอ้างอิงยังไม่ใช่การยืนยันว่าไฟล์ตรงกล่อง • การตรวจสอบไม่ส่งคำสั่งลบหรือเขียน');
 stage.append(help);
 // Live diagnostic capture on the actual Fast Flash page. Every TX/RX byte
 // originates from the same HondaFlashEngine used for real ECU writes.
 const trace=card('n24-flash-trace','↔','TX / RX LOG • Fast Flash');
 const traceNote=make('p','n24-help','แสดงคำสั่งที่ส่ง (TX), คำตอบ ECU (RX), สถานะและข้อผิดพลาดจริง • ส่งไฟล์ TXT ให้ตรวจได้ • ไม่ใช่การอ่านแฟลชกลับทั้งก้อน');
 const traceStatus=make('div','n24-help','ยังไม่มีคำสั่ง Flash ในรอบนี้');
 const traceText=make('pre','n24-txrx-text');
 traceText.style.cssText='max-height:240px;min-height:96px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.5 ui-monospace,monospace;background:#10151d;color:#cce2fa;border:1px solid #38485b;border-radius:9px;padding:10px;';
 const traceActions=make('div','n24-actions');
 const saveTrace=btn('↓ ส่ง TX/RX Log (TXT)','n24-btn',()=>window.__55ExportFlashLog?.());
 const copyTrace=btn('คัดลอก TX/RX','n24-btn',()=>{
  const body=(INLINEFLASH.log||[]).join('\\n');
  if(!body){traceStatus.textContent='ยังไม่มี TX/RX Log';return}
  if(!navigator.clipboard?.writeText){traceStatus.textContent='เบราว์เซอร์ไม่รองรับคัดลอก • ใช้ปุ่มดาวน์โหลด TXT';return}
  navigator.clipboard.writeText(body).then(()=>{traceStatus.textContent='คัดลอก Log แล้ว'},e=>{traceStatus.textContent='คัดลอกไม่ได้: '+e.message});
 });
 traceActions.append(saveTrace,copyTrace);
 trace.append(traceNote,traceStatus,traceText,traceActions);
 stage.insertBefore(trace,file); // visible beside Flash button, not in Advanced Tools
 let lastTraceRender=0;
 window.__55FlashLogRefresh=()=>{
  if(!trace.isConnected)return;
  const entries=INLINEFLASH.log||[];
  const last=entries.at(-1)||'';
  const urgent=/ERROR|FAILED|STOP|FINAL ACK|ECU_REJECTED/.test(last);
  if(!urgent&&Date.now()-lastTraceRender<250)return;
  lastTraceRender=Date.now();
  traceStatus.textContent=entries.length+' รายการ • '+(INLINEFLASH.status||'IDLE');
  traceText.textContent=entries.slice(-40).join('\\n')||'รอเชื่อมต่อ ECU และเริ่มตรวจ';
  traceText.scrollTop=traceText.scrollHeight;
 };
 window.__55FlashLogRefresh();
 render();
 void previewBinOffset();
 void analyzeSelectedBin();
 // Start read-only automatic Preflight when Fast Flash is entered with cable/BIN.
 queueMicrotask(()=>{if(stage===host)void autoPrepare().catch(e=>{error=e.message;render()})});
}
let preparingAuto=false,lastAutoProbe=null;
async function autoPrepare(){
 if(preparingAuto||working||INLINEFLASH.busy)return false;
 const shared=window.__55SharedEcu;
 const snap=shared?.snapshot?.();
 if(!stage?.isConnected||!snap?.connected)return false;
 const c=current();
 if(recency()&&last?.identity?.ecuId===snap.ecuId&&last.saved===c.saved)return verified();
 const key=(snap.ecuId||'UNREAD')+'|'+(c.saved?.sha256||c.saved?.filename||'no-bin');
 if(lastAutoProbe?.key===key&&Date.now()-lastAutoProbe.at<15000)return false;
 lastAutoProbe={key,at:Date.now()};
 preparingAuto=true;
 try{
  // Read ID/Boot session even without a BIN; only make a plan when a valid BIN exists.
  await readECU();
  // FormMain.SetEcmParamsFromDb permits ECU IDs absent from its
  // embedded catalog; the caller still needs physical source-family ACK
  // and BIN signature/ID proof. Do not skip read-only plan checking just
  // because the source Part Code table has no row for this ECU.
  const proof=last?.identity?.programmingSessionVerified===true&&
   last?.identity?.physicalFamilyEvidence==='MAIN_SOURCE_READ_ONLY_FLASH_COUNT_ACK';
  if(current().valid&&(last?.identity?.sourceMatched||proof))await runCheck({requestConfirmation:false});
  return verified();
 }finally{preparingAuto=false;render()}
}
// Dashboard may read already calculated BIN-only metadata. Do not expose
// an unverified snapshot as a flash plan or physical ECU memory map.
const sourceBinPreview=()=>{
 const c=current();
 const p=c.valid&&binOffsetHint?.saved===c.saved?binOffsetHint.estimated:null;
 return p?{filename:c.saved?.filename||null,startOffset:p.startOffset,
  checksumOffset:p.checksumOffset,profile:p.binProfile||null,
  blockBytes:p.binBlockBytes||null,verified:false,origin:'BIN_ONLY'}:null;
};
window.__55FlashPreflight={mount,render,readECU,runCheck,autoPrepare,
 hasBin:()=>current().valid,ready:verified,sourceBinPreview};
['btnSave','sel','btnAutoOffset','btnRead','goTune'].forEach(id=>$(id)?.addEventListener('click',()=>queueMicrotask(render)));
window.addEventListener('55:bin-selection-changed',()=>{if(stage?.isConnected)void analyzeSelectedBin()});
window.addEventListener('55:tuned-bin-vault-updated',event=>{
 if(stage?.isConnected)void dom.vaultRefresh?.(event.detail?.id);
});
$('btnSave')?.addEventListener('click',()=>{if(stage?.isConnected)queueMicrotask(()=>void analyzeSelectedBin())});
window.addEventListener('55:bin-changed',render);
 const stepBox=$('stepTxt');
 if(stepBox)new MutationObserver(()=>{if(INLINEFLASH.busy||INLINEFLASH.postCheck){message=stepBox.textContent;render()}}).observe(stepBox,{childList:true,subtree:true,characterData:true});
 const pct=$('pct');
 if(pct)new MutationObserver(()=>render()).observe(pct,{childList:true,characterData:true,subtree:true});
setInterval(()=>{if(stage?.isConnected){render();window.__55FlashLogRefresh?.();
 if(current().valid&&!verified()&&!preparingAuto&&!working&&!INLINEFLASH.busy)
  void autoPrepare().catch(e=>{error=e.message;render()});
}},1500);
})();

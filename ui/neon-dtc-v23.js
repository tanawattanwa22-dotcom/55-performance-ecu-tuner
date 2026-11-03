/* DTC Neon V23: presentation only, original Honda K-Line read/clear handlers remain authoritative. */
(function(){
'use strict';
const doc=document,live=doc.getElementById('live'),legacy=doc.getElementById('vDtc');
const api=window.__55LiveBridge;
if(!live||!legacy||!api||doc.getElementById('n23Pane'))return;
const $=id=>doc.getElementById(id);
const create=(tag,cls='',value)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n};
const svg=(path)=>'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
const icons={
 engine:svg('<path d="M7 7h3V4h4v3h3l3 3v8h-3v2H7v-2H4v-8h3zM2 11v6m20-6v6"/>'),
 history:svg('<path d="M3 12a9 9 0 1 0 3-6L3 9M3 3v6h6M12 7v5l4 2"/>'),
 system:svg('<path d="m12 2 10 5-10 5L2 7zM2 12l10 5 10-5M2 17l10 5 10-5"/>'),
 warning:svg('<path d="m12 3 10 17H2zM12 9v5m0 3h.01"/>'),
 chip:svg('<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>'),
 trash:svg('<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v7m4-7v7"/>'),
 info:svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>')
};
const press=(title,fn,cls)=>{const b=create('button',cls,title);b.type='button';b.onclick=fn;return b};
const pane=create('div','n23-pane');pane.id='n23Pane';
// Dedicated DTC header. Old Live Data header and tabs are hidden only in DTC mode.
const brand=create('header','n23-brand');
const returnHome=()=>api.home('dashboard');
const logo=doc.querySelector('#neonShell .n20-icon')||doc.querySelector('#home .top img.lg');
const goHome=press('',returnHome,'n23-brand-home');
goHome.setAttribute('aria-label','กลับหน้าหลัก');
if(logo){const img=logo.cloneNode(true);img.className='n23-brand-logo';goHome.append(img)}
const wordmark=create('span','n23-brand-name');
wordmark.append(create('strong','','55 PERFORMANCE'),create('small','','ECU TUNER'));
brand.append(goHome,wordmark);
const menu=press('☰',()=>{if(!menuDialog.open)menuDialog.showModal()},'n23-brand-menu');
menu.setAttribute('aria-label','เมนูหมวดทั้งหมด');
brand.append(menu);pane.append(brand);
const menuDialog=create('dialog','n23-menu-dialog');
menuDialog.setAttribute('aria-label','เมนูนำทาง DTC');
const menuHeading=create('h2','','55 PERFORMANCE · เมนูหลัก');
menuDialog.append(menuHeading);
menuDialog.append(press('✕ ปิด',()=>menuDialog.close(),'n23-menu-dismiss'));
for(const [id,label] of [
 ['dashboard','หน้าหลัก'],['library','คลังรุ่น / BIN หลัก'],
 ['tune','จูน BIN'],['flash','อัดไฟล์ ECU'],
 ['live','Live Data'],['dtc','DTC / วินิจฉัย'],
 ['tools','เครื่องมือ C#'],['settings','ตั้งค่า / License']]){
 const button=press(label,()=>{menuDialog.close();if(id==='dtc')return;api.home(id)},'n23-menu-item');
 menuDialog.append(button);
}
menuDialog.addEventListener('click',event=>{if(event.target===menuDialog)menuDialog.close()});
pane.append(menuDialog);
const hero=create('div','n23-hero');
const headline=create('div','n23-page-title');
headline.append(create('span','n23-slash'),create('h1','','DTC / วินิจฉัย'));
hero.append(headline,create('p','','อ่านและจัดการรหัสปัญหา (Diagnostic Trouble Code)'));
pane.append(hero);
const tabs=create('div','n23-tabs');pane.append(tabs);
let active='current',result=null,pending=false,clearState='';
for(const [id,label,icon] of [['current','ปัจจุบัน','engine'],['history','ประวัติ','history'],['system','ข้อมูลระบบ','system']]){
 const b=press('',()=>{active=id;render()},'n23-tab');b.dataset.tab=id;b.innerHTML=icons[icon];b.append(create('span','',label));tabs.append(b);
}
const alert=create('section','n23-alert n23-unknown');
const aico=create('span','n23-alert-icon');aico.innerHTML=icons.warning;
const atxt=create('div','n23-alert-copy');
const atitle=create('strong','','ยังไม่ได้อ่าน DTC'),anote=create('small','','เชื่อม ECU แล้วกดอ่าน DTC');
atxt.append(atitle,anote);
const aend=create('span','n23-alert-engine');aend.innerHTML=icons.engine;
alert.append(aico,atxt,aend);pane.append(alert);
const communication=create('section','n23-comm');
const cico=create('span','n23-comm-icon');cico.innerHTML=icons.chip;
const cmain=create('div','n23-comm-main');cmain.append(create('b','','สถานะการสื่อสาร ECU'));
const cstate=create('strong','n23-disconnected','ยังไม่เชื่อมต่อ');cmain.append(cstate);
const cinfo=create('div','n23-comm-extra'),cell={};
for(const [id,label] of [['ecu','ECU'],['protocol','โปรโตคอล'],['speed','ความเร็ว']]){
 const col=create('div','n23-comm-cell');col.append(create('small','',label));
 const val=create('b','','—');cell[id]=val;col.append(val);cinfo.append(col);
}
communication.append(cico,cmain,cinfo);pane.append(communication);
const hdr=create('div','n23-section-head'),sectionTitle=create('h2','','รายการ DTC (ปัจจุบัน)'),count=create('span','','ยังไม่มีผลการอ่าน');
hdr.append(sectionTitle,count);pane.append(hdr);
const list=create('div','n23-codes');list.id='n23CodeList';pane.append(list);
const msg=create('div','n23-message');msg.id='n23Message';msg.setAttribute('role','status');msg.setAttribute('aria-live','polite');pane.append(msg);
const note=create('section','n23-notes'),noteTitle=create('div','n23-note-header');noteTitle.innerHTML=icons.info;
noteTitle.append(create('b','','หมายเหตุ'));note.append(noteTitle);
const ul=create('ul');
for(const v of [
 'อ่านรหัสที่เก็บด้วย 0x73 และรหัสปัจจุบันด้วย 0x74 จาก Honda K-Line จริง',
 'ส่งคำขอ 3 ตารางต่อประเภท รวมสูงสุด 6 คำขอ ไม่รับรองว่า ECU ทุกกล่องรองรับ 6-bank',
 'ไม่สมมติความรุนแรงหรือรหัสแบบ P-code เมื่อ ECU ไม่ได้ส่งข้อมูลนั้น'
])ul.append(create('li','',v));
note.append(ul);pane.append(note);
const actions=create('div','n23-actions');
function delegate(id){
 if(pending)return;
 let state;try{state=window.__55SharedEcu?.snapshot?.()||api.snapshot()}catch{return}
 if(!state.connected){msg.textContent='ยังไม่ได้เชื่อมต่อ ECU จริง กรุณาเชื่อมต่อ FTDI และอ่าน ECU ID ก่อน';return}
 const shared=window.__55SharedEcu;
 if(id==='dtcRead'&&shared?.readDtc){
  if(shared.snapshot()?.connecting){msg.textContent='ระบบกำลังตรวจอัตโนมัติจากการเชื่อมสาย กรุณาให้การตรวจครั้งนี้เสร็จก่อน';return}
  void shared.readDtc().catch(e=>{msg.textContent='อ่าน DTC จากสายร่วมไม่สำเร็จ: '+String(e?.message||e)});
  return;
 }
 if(id==='dtcClr'&&shared?.port?.ready){
  msg.textContent='ระบบลบ DTC ต้องรอตรวจยืนยัน ECU ID และการตอบกลับจากกล่องจริง';
  return;
 }
 const b=$(id);if(b&&!b.disabled)b.click();
}
const read=press('อ่าน DTC',()=>delegate('dtcRead'),'n23-action n23-read');
const clear=press('ลบ DTC',()=>delegate('dtcClr'),'n23-action n23-clear');
const info=press('อ่านข้อมูลระบบ',()=>{active='system';render()},'n23-action n23-info');
for(const [b,icon] of [[read,'engine'],[clear,'trash'],[info,'system']]){
 const i=create('span','n23-action-ico');i.innerHTML=icons[icon];b.prepend(i);actions.append(b);
}
pane.append(actions,create('p','n23-footer','แสดงผลจากการอ่าน ECU เท่านั้น ไม่ใช่รหัสหรือค่าในภาพตัวอย่าง'));
legacy.prepend(pane);
function refreshConnection(){
 let s;try{s=window.__55SharedEcu?.snapshot?.()||api.snapshot()}catch{return}
 cstate.classList.toggle('n23-connected',!!s.connected);
 cstate.classList.toggle('n23-disconnected',!s.connected);
 cstate.textContent=s.connected?(s.ecuId?'● ECU ยืนยันตัวตนแล้ว':'● FT232R เชื่อมต่อแล้ว · ยังไม่ยืนยัน ECU ID'):s.cable?'ต่อสายแล้ว · รอ ECU ID':'ยังไม่เชื่อมต่อ FT232R';
 cell.ecu.textContent=s.ecuId?(s.ecuId+(s.part?' · '+s.part:'')):'ยังไม่ยืนยัน ECU ID';
 cell.protocol.textContent=s.connected?s.protocol||'Honda K-Line / FTDI':'—';
 cell.speed.textContent='ไม่ได้ตรวจวัด';
 const ready=!!s.connected&&!s.connecting&&!window.__55SharedEcu?.owner;
 read.disabled=pending||!ready;
 clear.disabled=pending||!ready||!!window.__55SharedEcu?.port?.ready;
}
function makeCode(v){
 const outer=create('details','n23-code-card'),summary=create('summary','n23-code-summary');
 const icon=create('span','n23-code-ico');icon.innerHTML=icons.engine;
 const middle=create('div','n23-code-body'),line=create('div','n23-code-line');
 line.append(create('b','n23-code-id',v.k),create('span','n23-code-badge',v.known?'มีคำอธิบาย':'ยังไม่ระบุ'));
 middle.append(line,create('p','',v.txt||'ยังไม่มีคำอธิบายที่ยืนยันสำหรับรหัสนี้'));
 summary.append(icon,middle,create('span','n23-code-state',active==='history'?'เก็บในหน่วยความจำ':'ตรวจพบตอนอ่าน'),create('span','n23-code-arrow','›'));
 const details=create('div','n23-code-detail');
 details.append(create('b','','รหัส Honda '+v.k));
 details.append(create('p','',active==='history'?'อ่านจากหน่วยความจำด้วยคำสั่ง 0x73':'อ่านรหัสปัจจุบันด้วยคำสั่ง 0x74'));
 details.append(create('p','','ความรุนแรงและสถานะ MIL ยังไม่ยืนยันจากผลตอบกลับนี้'));
 outer.append(summary,details);return outer;
}
function render(){
 refreshConnection();
 for(const b of tabs.children){const on=b.dataset.tab===active;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))}
 list.replaceChildren();
 const partial=!!result&&(result.missing>0||!!result.error);
 if(active==='system'){
  sectionTitle.textContent='ข้อมูลระบบ ECU';count.textContent='ข้อมูลจากกล่อง / ผลอ่านล่าสุด';
  const s=api.snapshot(),grid=create('div','n23-system-grid');
  const fields=[
   ['กล่องจาก ECU ID จริง',s.part||'ยังไม่ยืนยันรุ่น ECU'],
   ['ECU Family จากฐาน Main',s.catalogFamily||'ยังไม่ระบุ'],
   ['Live Group ที่ตรวจจาก ECU',s.liveGroupVerified?'Group '+s.group:'ยังไม่ยืนยัน'],
   ['สถานะ ECU',s.ecuId?'ยืนยัน ECU ID แล้ว':s.connected?'เปิด FT232R แล้ว · ยังไม่ยืนยัน ECU':'ยังไม่เชื่อมต่อ'],
   ['โปรโตคอล',s.connected?s.protocol||'Honda K-Line / FTDI':'—'],
   ['ความเร็วบัส','ไม่ได้ตรวจวัด'],
   ['ระบบ DTC','Honda 0x73 / 0x74 ตาราง 01–03'],
   ['ผลการอ่านล่าสุด',result?new Date(result.timestamp).toLocaleString('th-TH'):'ยังไม่ได้อ่าน'],
   ['คำขอที่ตอบ',result?String(6-result.missing)+'/6':'ยังไม่ตรวจ']
  ];
  for(const [k,v] of fields){const row=create('div','n23-system-row');row.append(create('span','',k),create('strong','',v));grid.append(row)}
  list.append(grid);
 }else{
  sectionTitle.textContent=active==='history'?'รหัส DTC ที่เก็บในหน่วยความจำ':'รายการ DTC (ปัจจุบัน)';
  const data=result?.success?(active==='history'?result.stored:result.current):null;
  if(!data){count.textContent='รอผลการอ่าน';list.append(create('div','n23-empty','ยังไม่มีผล DTC ที่อ่านสำเร็จจาก ECU'))}
  else{
   count.textContent=String(data.length)+' รายการ'+(partial?' · ผลไม่ครบ':'');
   for(const item of data)list.append(makeCode(item));
   if(!data.length)list.append(create('div','n23-empty',partial?'ไม่พบรหัสในส่วนที่ตอบกลับ แต่ผลอ่านไม่ครบ':'ไม่พบรหัสในผลตอบกลับ'));
  }
 }
 alert.classList.toggle('n23-unknown',!result||!result.success);
 alert.classList.toggle('n23-danger',!!result?.current?.length);
 alert.classList.toggle('n23-ok',!!result?.success&&!result?.current?.length&&!partial);
 if(!result){atitle.textContent=pending?'กำลังอ่านรหัส DTC':'ยังไม่ได้อ่านรหัส DTC';anote.textContent='ยังไม่มีข้อมูลจริงจาก ECU'}
 else if(!result.success){atitle.textContent='อ่าน DTC ไม่สำเร็จ';anote.textContent=result.error||'กล่องไม่ตอบคำสั่ง'}
 else if(partial){atitle.textContent='ผลอ่าน DTC ไม่ครบ '+result.current.length+' รายการ';anote.textContent='กล่องตอบไม่ครบทุกตาราง ไม่สามารถยืนยันว่าไม่มีรหัสเสีย'}
 else if(result.current.length){atitle.textContent='พบรหัสปัญหา '+result.current.length+' รายการ';anote.textContent='รหัสปัจจุบันจาก ECU ที่ตอบกลับ'}
 else {atitle.textContent='ไม่พบรหัสปัจจุบัน';anote.textContent='อ่านครบทุกตาราง ไม่พบรหัสในผลตอบกลับ'}
 if(clearState)msg.textContent=clearState;
 else if(result)msg.textContent=(result.error||'')+(result.success?' อ่านเมื่อ '+new Date(result.timestamp).toLocaleTimeString('th-TH'):'');
 else msg.textContent='เมื่อเชื่อมสายจากหน้าแรก ระบบจะอ่านตาราง DTC อัตโนมัติ · กด อ่าน DTC เพื่อสแกนซ้ำ';
}
window.addEventListener('55:dtc-read-start',()=>{pending=true;result=null;clearState='';render();msg.textContent='กำลังอ่าน DTC จากกล่อง ECU จริง…'});
window.addEventListener('55:dtc-result',e=>{pending=false;const x=e.detail;if(x&&Array.isArray(x.current)&&Array.isArray(x.stored)){result=x;clearState=''}render()});
window.addEventListener('55:dtc-clear-start',()=>{pending=true;clearState='กำลังส่งคำสั่งลบรหัส DTC…';render()});
window.addEventListener('55:dtc-clear-result',e=>{pending=false;const x=e.detail;
 clearState=x?.error?'ลบไม่สำเร็จ: '+x.error:x?.ok===3?'ส่งคำสั่งลบครบ 3 ตารางแล้ว · อ่าน DTC อีกครั้งเพื่อยืนยัน':'ลบไม่ครบ ('+(x?.ok??0)+'/3) · ตรวจสอบสาย';
 result=null;render()});
window.__55DtcV23={
 open(){
  // Use the original ECU diagnosis entry only as a navigation/handler bridge.
  // The visible page is exclusively the new DTC pane; never show legacy UI.
  const trigger=$('mtDtc');if(!trigger)return false;
  trigger.click();
  if(!live.classList.contains('n23-dtc'))api.mode('dtc');
  // Never render DTC cached from the previously connected motorcycle.
  result=null;pending=false;render();
  const usb=!!window.__55SharedEcu?.snapshot?.().connected;
  msg.textContent=usb?'กำลังตรวจ ECU ปัจจุบันและอ่าน DTC จากสายเดียวกัน…':'กรุณาเชื่อมต่อ FT232R ก่อนตรวจ DTC';
  void window.__55AutoEcu?.enter('dtc');
  return live.classList.contains('on')&&live.classList.contains('n23-dtc');
 },
 modeChanged:m=>{live.classList.toggle('n23-dtc',m==='dtc');if(m==='dtc'){active='current';render()}},
 render
};
setInterval(()=>{if(live.classList.contains('on')&&live.classList.contains('n23-dtc'))refreshConnection()},800);
render();
})();
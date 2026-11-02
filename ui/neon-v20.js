/* 55 PERFORMANCE — Neon UI v20. Presentation and navigation only.
   Real ECU, calibration, saving, flashing and licensing remain in the original handlers. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const home=$('home'),sc=home?.querySelector(':scope > .scroll');
if(!home||!sc||$('neonShell'))return;
const cards=[...sc.children].filter(x=>x.classList.contains('card'));
const memberships={
 dashboard:[],library:['modelCard','binCard'],tune:['modelCard','binCard','guardCard'],
 flash:['ecuCard','cableCard','guardCard','flashCard'],live:['liveCard','cableCard'],
 dtc:['liveCard','cableCard'],tools:['mainSourceTools'],settings:[]};
const cats=[
 ['dashboard','⌂','หน้าหลัก','ภาพรวม สถานะ งานปัจจุบัน','#38c5f8'],
 ['library','▤','คลังรุ่น / BIN หลัก','ค้นหาและเลือก BIN หลักของแต่ละรุ่น','#b375ff'],
 ['tune','▦','จูน BIN','แก้ตารางน้ำมัน/ไฟจุดระเบิด บันทึก BIN','#34ddb1'],
 ['flash','⇧','อัดไฟล์ ECU','อ่าน ECU ID ตรวจ Offset และ Preflight','#fa67c8'],
 ['live','∿','Live Data','เกจ AFR และบันทึกข้อมูลจริง','#39aaff'],
 ['dtc','⚠','DTC / วินิจฉัย','อ่านรหัสข้อผิดพลาดและข้อมูล ECU','#f6b356'],
 ['tools','⌘','เครื่องมือ C#','BIN, DAT, FTDI และเครื่องมือช่าง','#40d8ec'],
 ['settings','⚙','ตั้งค่า / License','บัญชีและสิทธิ์ใช้งาน','#9aabcd']];
const titleText={
 dashboard:['ศูนย์ควบคุม ECU','เลือกหมวดเพื่อเริ่มทำงาน'],
 library:['คลังรุ่น / BIN หลัก','รายการไฟล์หลักที่มีในแอปจริง'],
 tune:['จูน BIN','เลือก BIN หลักหรือนำเข้า แล้วเปิดตารางจูน'],
 flash:['อัดไฟล์ ECU / Preflight','ตรวจไฟล์ ECU ID และ Offset ก่อนยืนยันการเขียน'],
 live:['Live Data','ข้อมูลเซ็นเซอร์และกราฟตามสถานะเชื่อมต่อจริง'],
 dtc:['DTC / วินิจฉัย','ตรวจและจัดการรหัสข้อผิดพลาด'],
 tools:['เครื่องมือ Main C#','เครื่องมือ BIN, DAT, FTDI และการทดสอบ'],
 settings:['ตั้งค่า / License','บัญชีและข้อมูลแอป']};
const mk=(tag,cls,content)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e;};
const action=(txt,handler,cls='btn')=>{const b=mk('button',cls,txt);b.type='button';b.onclick=handler;return b};
const click=id=>{const e=$(id);if(e&&!e.disabled)e.click();else alert('ฟังก์ชันยังไม่พร้อม กรุณาเลือก BIN และรุ่นก่อน')};
const shell=mk('div');shell.id='neonShell';
const top=mk('header','n20-head');
const logo=home.querySelector('.top img.lg');
if(logo){const icon=logo.cloneNode(true);icon.className='n20-icon';icon.alt='55 PERFORMANCE';top.append(icon)}
const name=mk('div','n20-logo','55 PERFORMANCE');name.append(mk('small','','ECU TUNER'));top.append(name);
const drawer=mk('dialog','n20-menu-dialog');drawer.id='n20MenuDialog';
drawer.setAttribute('aria-label','เมนูทั้งหมด');
drawer.append(mk('h2','','55 PERFORMANCE · เมนูทั้งหมด'));
const closeMenu=action('✕ ปิดเมนู',()=>drawer.close(),'btn n20-menu-close');drawer.append(closeMenu);
const drawerItems=mk('div','n20-menu-items');
for(const cat of cats){
 const b=action(cat[1]+'  '+cat[2],()=>{drawer.close();navigate(cat[0])});
 drawerItems.append(b);
}
drawer.append(drawerItems);drawer.addEventListener('click',e=>{if(e.target===drawer)drawer.close()});
document.body.append(drawer);
const menu=action('☰',()=>drawer.showModal(),'n20-menu-button');
menu.setAttribute('aria-label','เปิดเมนูทั้งหมด');top.append(menu);
const hero=mk('div','n20-hero');
hero.innerHTML='<div class="n20-eyebrow">55 Performance • Motorcycle ECU</div>'+
 '<div class="n20-mark">55<span>PERFORMANCE</span></div>'+
 '<h2 class="n20-hero-title" id="n20HeroTitle">ศูนย์ควบคุม ECU</h2>'+
 '<p id="n20HeroSubtitle">ระบบจูน BIN ตรวจ ECU และเครื่องมือช่าง</p>';
const stats=mk('div','n20-stats');
stats.innerHTML='<div><small>🔌 การเชื่อมต่อ</small><strong id="n20Connection">ยังไม่เชื่อมต่อ</strong></div>'+
 '<div><small>🏍️ รุ่นที่เลือก</small><strong id="n20Model">ยังไม่เลือกรุ่น</strong></div>'+
 '<div><small>💾 BIN สำหรับอัด</small><strong id="n20Save">ยังไม่บันทึก</strong></div>';
const nav=mk('nav','n20-nav');nav.id='v20Nav';nav.setAttribute('aria-label','เมนูหลัก ECU');
for(const cat of cats){const b=action(cat[1]+' '+cat[2],()=>navigate(cat[0]));b.dataset.cat=cat[0];nav.append(b)}
shell.append(top,hero,stats,nav);sc.prepend(shell);
const stage=mk('div','n20-stage');stage.id='n20Stage';sc.insertBefore(stage,shell.nextSibling);
let selected='dashboard',searchText='',activeFilter='all';
function status(){
 try{if(INLINEFLASH.busy)return ['ECU กำลังดำเนินการ',false];
  if(K.ecu)return ['ECU ตอบแล้ว',true];
  if(K.t)return ['สายเชื่อมต่อแล้ว',false];}catch{}
 return ['ยังไม่เชื่อมต่อ',false];
}
function refreshStatus(){
 const [t,ok]=status();$('n20Connection').textContent=t;$('n20Connection').classList.toggle('ok',ok);
 const m=typeof S!=='undefined'&&S.mi>=0?MODELS[S.mi]:null;
 $('n20Model').textContent=m?.id||'ยังไม่เลือกรุ่น';
 let saved=false;
 try{saved=!!S.saved&&TuneBinFlow.matches(S.saved,S.bin,{model:m?.id,sourceName:S.fname,customerBin:S.custom})}catch{}
 $('n20Save').textContent=saved?'บันทึก BIN แล้ว':'ยังไม่บันทึก';
}
function heading(t,desc){
 stage.append(mk('h2','n20-stage-title',t));
 if(desc)stage.append(mk('p','n20-stage-sub',desc));
}
function steps(){
 const bar=mk('div','n20-step-summary');
 for(const text of ['01 เลือก BIN','02 จูนตาราง','03 บันทึก BIN','04 ตรวจ ECU / Offset'])bar.append(mk('span','',text));
 stage.append(bar);
}
function dashboard(){
 heading('หมวดหมู่หลัก','แต่ละหมวดแยกจากกันชัดเจน ใช้ฟังก์ชัน ECU เดิมทุกปุ่ม');
 const grid=mk('div','n20-grid');
 for(const cat of cats){
  const b=action('',()=>navigate(cat[0]),'n20-tile');
  b.style.setProperty('--tile-stroke',cat[4]+'88');b.style.setProperty('--tile-glow',cat[4]+'65');
  b.append(mk('span','n20-tile-icon',cat[1]),mk('span','n20-tile-label',cat[2]),mk('span','n20-tile-desc',cat[3]),mk('span','n20-tile-arrow','›'));
  grid.append(b);
 }
 stage.append(grid);
 stage.append(mk('h3','n20-section-title','สถานะงานปัจจุบัน'));
 const panel=mk('div','n20-panel');
 const m=typeof S!=='undefined'&&S.mi>=0?MODELS[S.mi]:null;
 for(const [symbol,subject,value] of [
  ['▦','รุ่นที่เลือก',m?.id||'ยังไม่ได้เลือกรุ่น'],
  ['💾','BIN ที่เปิดอยู่',typeof S!=='undefined'&&S.bin?S.fname:'ยังไม่ได้เปิด BIN'],
  ['🔌','สถานะ ECU',status()[0]]
 ]){
  const row=mk('div','n20-job');row.append(mk('span','',symbol));
  const label=mk('b','',subject);label.append(mk('small','',value));row.append(label);panel.append(row);
 }
 stage.append(panel);
 const note=mk('div','n20-panel');
 note.append(mk('p','','ลำดับใช้งาน: คลังรุ่น / BIN หลัก → จูน BIN → บันทึก BIN → อัดไฟล์ ECU ผ่าน Preflight'));
 stage.append(note);
}
function library(){
 heading('รายการรุ่น / Master BIN','แสดงไฟล์หลักที่ติดตั้งอยู่จริง ไม่สมมติข้อมูลรุ่นหรือขนาดไฟล์');
 const search=mk('input','n20-search');search.type='search';search.value=searchText;
 search.placeholder='ค้นหารุ่นรถ / รหัส ECU';search.setAttribute('aria-label','ค้นหา BIN หลัก');
 stage.append(search);
 const filter=mk('div','n20-filters');stage.append(filter);
 const counter=mk('p','n20-stage-sub');stage.append(counter);
 const list=mk('div','n20-model-list');stage.append(list);
 const redraw=()=>{
  list.replaceChildren();
  const all=typeof MODELS!=='undefined'?MODELS:[];
  const ready=m=>Boolean(BINS[m.id]&&DEFS[m.id]);
  const rows=all.map((m,i)=>({m,i})).filter(({m})=>{
   if(searchText&&!((m.id+' '+(m.sub||'')+' '+(m.fam||'')).toLowerCase().includes(searchText.toLowerCase())))return false;
   if(activeFilter==='ready'&&!ready(m))return false;
   if(activeFilter==='missing'&&ready(m))return false;
   if(activeFilter==='k03'&&!m.id.toLowerCase().includes('k03'))return false;
   if(activeFilter==='k2j'&&!m.id.toLowerCase().includes('k2j'))return false;
   return true;
  });
  counter.textContent='รุ่นในระบบ '+all.length+' · มี BIN พร้อมจูน '+all.filter(ready).length+' · แสดง '+rows.length;
  for(const {m,i} of rows){
   const row=mk('div','n20-model-row'),meta=mk('div','n20-model-meta');
   const file=typeof BINS[m.id]==='string'?BINS[m.id]:null;
   const size=file?Math.floor(file.length*3/4/1024)+' KB (โดยประมาณ)':'ไม่มี BIN';
   const badge=mk('span','n20-model-pill'+(ready(m)?'':' missing'),ready(m)?'✓ มี BIN / ตารางจูน':'รอไฟล์ BIN');
   meta.append(mk('b','',m.id),mk('small','',m.sub||'รุ่นรถ'),mk('small','',(m.fam||'ECU ไม่ระบุตระกูล')+' · '+size),badge);
   const open=action(ready(m)?'เปิดจูน':'เลือกรุ่น',()=>{
    const select=$('sel');select.value=String(i);select.dispatchEvent(new Event('change',{bubbles:true}));
    if(select.value!==String(i))return;
    if(ready(m))click('goTune');else navigate('tune');
   });
   row.append(mk('div','n20-model-badge','▣'),meta,open);list.append(row);
  }
  if(!rows.length)list.append(mk('div','n20-panel','ไม่พบรุ่นที่ค้นหา กรุณาเปลี่ยนคำค้นหาหรือตัวกรอง'));
 };
 for(const [id,text] of [['all','ทั้งหมด'],['ready','มี BIN หลัก'],['missing','ยังไม่มี BIN'],['k03','K03'],['k2j','K2J']]){
  const button=action(text,()=>{activeFilter=id;for(const b of filter.children)b.setAttribute('aria-pressed',String(b===button));redraw()},'btn n20-filter');
  button.setAttribute('aria-pressed',String(activeFilter===id));filter.append(button);
 }
 search.oninput=()=>{searchText=search.value.trim();redraw()};redraw();
}
function flashStage(){
 heading('ตรวจไฟล์ก่อนอัด / Preflight','ไฟล์ที่อัดต้องเป็นสำเนา BIN ที่บันทึก ไม่ใช่ไฟล์ที่กำลังแก้');
 steps();
 stage.append(mk('div','n20-flash-note','BIN หลักที่อยู่ในแอปอาจไม่ตรงกับ ECU ทุกคัน ต้องอ่าน ECU ID จริง ตรวจ Part Code, ชนิดกล่อง, Firmware และ Auto Offset ก่อน ERASE / WRITE'));
 const info=mk('div','n20-panel');info.append(mk('b','','ลำดับตรวจ'));
 info.append(mk('p','','เชื่อม FTDI → อ่าน ECU ID → ตรวจ Offset → ตรวจ BIN ที่บันทึก → ยืนยันก่อนอัด'));
 stage.append(info);
}
function liveOrDtc(id){
 heading(titleText[id][0],titleText[id][1]);
 const panel=mk('div','n20-panel');
 panel.append(mk('p','',id==='live'?
  'Live Data มีโหมดเกจ AFR / Log / ช่วยจูน และแยกโหมดจำลองจากกล่องจริง':
  'DTC ใช้ฟังก์ชันอ่าน/ลบรหัสที่มีอยู่แล้ว ไม่ส่งคำสั่งลบก่อนกดปุ่มยืนยัน'));
 panel.append(action(id==='live'?'📈 เปิด Live Data / เกจ':'⚠ เปิดหน้ารหัส DTC',
  ()=>id==='live'?click('goLive'):click('mtDtc'),'btn ac'));
 stage.append(panel);
}
const toolLinks=[
 ['📊 Main C# Live Data','flash_port/main-source-live.html'],
 ['🧰 DTC C# / 6-bank','flash_port/main-source-dtc.html'],
 ['🗂️ จัดการ ecuData.dat','flash_port/main-source-manager.html'],
 ['📦 ACG / ECU → BIN','flash_port/main-source-converter.html'],
 ['🧮 วิเคราะห์ Auto Offset','flash_port/main-source-offset-lab.html'],
 ['📚 ทะเบียน ECM / KTR','ktr/index.html'],
 ['🔌 ทดสอบ FTDI','flash_port/bench.html'],
 ['🧪 Flash Bench ขั้นสูง','flash_port/flash-write-lab.html'],
 ['📑 ตรวจโปรโตคอล','flash_port/source-validation-v15.html']
];
function links(items){
 const box=mk('div','n20-tool-links');
 for(const [name,url] of items){const a=mk('a','',name);a.href=url;a.target='_blank';a.rel='noopener noreferrer';box.append(a)}
 stage.append(box);
}
function toolsStage(){
 heading('เครื่องมือ Honda Main C#','เครื่องมือ BIN, DAT และการเชื่อมต่อที่ใช้ข้อมูลจริง');links(toolLinks);
 stage.append(mk('div','n20-panel','ด้านล่างเป็นเครื่องมือ Main C# เดิม เช่น ค้น ECM ID, Lock Read, Lock Mode, BIN ID, ECU Count และ DAT'));
 if($('mainSourceDetails'))$('mainSourceDetails').open=true;
}
function settingsStage(){
 heading('ตั้งค่า / License','รักษาระบบ Login และ License เดิม');
 const box=mk('div','n20-panel');box.append(mk('b','','🔐 บัญชีและ License'));
 box.append(mk('p','',$('licenseGate')?'ยังไม่เข้าสู่ระบบหรือ License ไม่พร้อม':'เข้าสู่ระบบแล้ว · ใช้การตรวจ License เดิม'));
 box.append(action('ออกจากระบบ',()=>click('lo')));stage.append(box);
 const info=mk('div','n20-panel');info.append(mk('b','','⚙ ระบบและการตรวจสอบ'));
 info.append(mk('p','','55 PERFORMANCE ECU TUNER · Neon UI v20 · Chrome Android / WebUSB'));
 info.append(mk('p','','ปรับเฉพาะหน้าตาและเมนู ระบบ BIN, Flash Engine, ECU ID, Offset, DTC และ License ทำงานจากโค้ดเดิม'));
 stage.append(info);
 links([['📄 บันทึก Flash','flash_port/flash-audit.html'],['📑 ทดสอบโปรโตคอล','flash_port/protocol-tests.html']]);
}
function navigate(id){
 if(!Object.prototype.hasOwnProperty.call(memberships,id))return;
 selected=id;
 for(const card of cards)card.classList.toggle('n20-hidden',!memberships[id].includes(card.id));
 stage.replaceChildren();stage.hidden=false;stage.classList.toggle('n20-settings',id==='settings');
 for(const b of nav.querySelectorAll('button')){const active=b.dataset.cat===id;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false')}
 $('n20HeroTitle').textContent=titleText[id][0];$('n20HeroSubtitle').textContent=titleText[id][1];
 if(id==='dashboard')dashboard();
 else if(id==='library')library();
 else if(id==='tune'){
  heading('จูน BIN / เลือกไฟล์','เลือกรุ่นจากคลังรุ่น หรือเปิด BIN จากเครื่องเพื่อปรับแต่งตาราง');
  steps();const c=mk('div','n20-panel');c.append(mk('p','','กดเปิดตารางจูนด้านล่าง เมื่อเสร็จให้กดบันทึก BIN ก่อนเข้าสู่หน้าอัด'));
  c.append(action('▦ เปิดตารางจูน',()=>click('goTune'),'btn ac'));stage.append(c);
 }
 else if(id==='flash')flashStage();
 else if(id==='live'||id==='dtc')liveOrDtc(id);
 else if(id==='tools')toolsStage();else if(id==='settings')settingsStage();
 refreshStatus();sc.scrollTo({top:0,behavior:'auto'});
}
window.__55NeonNavigate=navigate;
['sel','btnSave','btnCable','btnFlash','mtReadEcu','btnAutoOffset','btnRead','goTune'].forEach(id=>{
 $(id)?.addEventListener('click',()=>queueMicrotask(refreshStatus));
});
const observer=new MutationObserver(()=>refreshStatus());
for(const id of ['cableMsg','tuneSaveStatus','stepTxt','fname','sEcu'])if($(id))
 observer.observe($(id),{childList:true,characterData:true,subtree:true});
navigate('dashboard');
})();
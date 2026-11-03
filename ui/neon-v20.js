/* 55 PERFORMANCE — Neon UI v20. Presentation and navigation only.
   Real ECU, calibration, saving, flashing and licensing remain in the original handlers. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const home=$('home'),sc=home?.querySelector(':scope > .scroll');
if(!home||!sc||$('neonShell'))return;
const cards=[...sc.children].filter(x=>x.classList.contains('card'));
const memberships={
 dashboard:[],library:[],tune:['modelCard','binCard','guardCard'],
 flash:[],live:['liveCard','cableCard'],
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
const iconPath={
 dashboard:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
 library:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 7h8M8 12h8M8 17h8"/>',
 tune:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
 flash:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M12 16V9m-3 3 3-3 3 3M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
 live:'<path d="M2 12h4l3-7 4 14 3-7h6"/><path d="M4 3h16v18H4" opacity=".35"/>',
 dtc:'<path d="M10.3 3.7 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v5m0 3h.01"/>',
 tools:'<path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.12-1.26l2-1.55-2-3.46-2.38.95A7 7 0 0 0 14.5 5.5L14 3h-4l-.5 2.5a7 7 0 0 0-2 1.18l-2.38-.95-2 3.46 2 1.55A7 7 0 0 0 5 12c0 .43.04.85.12 1.26l-2 1.55 2 3.46 2.38-.95a7 7 0 0 0 2 1.18L10 21h4l.5-2.5a7 7 0 0 0 2-1.18l2.38.95 2-3.46-2-1.55c.08-.41.12-.83.12-1.26Z"/>'
};
const lineIcon=(id)=>{
 const span=document.createElement('span');span.className='n20-icon-line';
 span.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+iconPath[id]+'</svg>';
 return span;
};
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
 const b=action('',()=>{drawer.close();navigate(cat[0])});
 b.append(lineIcon(cat[0]),document.createTextNode(' '+cat[2]));drawerItems.append(b);
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
for(const cat of cats){const b=action('',()=>navigate(cat[0]));b.dataset.cat=cat[0];b.append(lineIcon(cat[0]),document.createTextNode(' '+cat[2]));nav.append(b)}
shell.append(top,hero,stats,nav);sc.prepend(shell);
const stage=mk('div','n20-stage');stage.id='n20Stage';sc.insertBefore(stage,shell.nextSibling);
let selected='dashboard',searchText='',activeFilter='all';
function status(){
 try{
  if(INLINEFLASH.busy)return ['ECU กำลังดำเนินการ',false];
  const physical=window.__55SharedEcu?.snapshot?.();
  if(physical?.connected)return [physical.ecuId?'FT232R + ECU '+physical.ecuId:'✓ FT232R / USB เชื่อมต่อแล้ว',true];
  if(physical?.connecting)return ['กำลังเปิด USB FT232R…',false];
  if(physical?.error)return ['FT232R เปิดไม่สำเร็จ · ดูรายละเอียด USB',false];
 }catch{}
 return ['ยังไม่ได้เปิด FT232R',false];
}
function refreshStatus(){
 const [t,ok]=status();$('n20Connection').textContent=t;$('n20Connection').classList.toggle('ok',ok);
 const m=typeof S!=='undefined'&&S.mi>=0?MODELS[S.mi]:null;
 $('n20Model').textContent=m?.id||'ยังไม่เลือกรุ่น';
 let saved=false;
 try{saved=!!S.saved&&TuneBinFlow.matches(S.saved,S.bin,{model:m?.id,sourceName:S.fname,customerBin:S.custom})}catch{}
 $('n20Save').textContent=saved?'บันทึก BIN แล้ว':'ยังไม่บันทึก';
}
window.__55V20RefreshStatus=refreshStatus;
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
  const ic=mk('span','n20-tile-icon');ic.append(lineIcon(cat[0]));
  b.append(ic,mk('span','n20-tile-label',cat[2]),mk('span','n20-tile-desc',cat[3]),mk('span','n20-tile-arrow','›'));
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
 const data=()=>typeof MODELS==='undefined'?[]:MODELS.map((m,i)=>{
  const ready=!!m.xdf||Boolean(BINS[m.id]&&DEFS[m.id]);
  const file=ready?BINS[m.id]:null;
  const bytes=m.xdf?49152:typeof file==='string'?Math.max(0,Math.floor(file.length/4)*3-(file.endsWith('==')?2:file.endsWith('=')?1:0)):0;
  const meta=m.meta&&typeof m.meta==='object'?m.meta:{};
  const manufacturer=String(m.brand||meta.brand||meta.manufacturer||meta.make||'ไม่ระบุยี่ห้อ').trim();
  const vendor=String(m.ecuVendor||meta.ecuVendor||meta.ecuManufacturer||meta.ecuType||meta.vendor||(m.id==='K03-H01'?'Keihin':'')).trim();
  return {m,i,ready,bytes,manufacturer,vendor};
 });
 const read=(key,fallback)=>{try{const x=JSON.parse(localStorage.getItem(key));return Array.isArray(fallback)?Array.isArray(x)?x:fallback:typeof x==='string'?x:fallback}catch{return fallback}};
 const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
 const KMASTER='55lib.master',KFAV='55lib.favorites',KRECENT='55lib.recent';
 let master=read(KMASTER,''),favorites=read(KFAV,[]),recent=read(KRECENT,[]),
     maker='all',tab='all',order='name',gridView=false,page=1,featured=0,
     panelOpen=false;
 const perPage=10;
 const logoFor=(r,cls='n22-brand-logo')=>{
  const span=mk('span',cls);
  if(/honda/i.test(r.manufacturer)){
   const img=document.createElement('img');img.src='ui/assets/honda-wing.svg';
   img.alt='Honda';img.width=76;img.height=55;img.loading='lazy';span.append(img);
  }else{
   const tag=mk('b','',r.manufacturer.slice(0,12).toUpperCase()||'ECU');span.append(tag);
  }
  return span;
 };
 const lib=mk('section','n22-library');lib.id='n22Library';
 const notice=mk('p','n22-notice','จัดการรุ่นรถ ไฟล์ BIN และไฟล์หลักสำหรับจูน ECU · เลือกใช้เฉพาะไฟล์ที่มีอยู่ในระบบ');
 lib.append(notice);
 const searchArea=mk('div','n22-search-box');
 const input=mk('input','n22-search');input.type='search';input.value=searchText;
 input.placeholder='ค้นหารุ่น รหัส ECU หรือหมายเหตุ…';input.setAttribute('aria-label','ค้นหา BIN หลัก');
 const clear=action('×',()=>{input.value='';searchText='';page=1;render()},'n22-clear');
 clear.setAttribute('aria-label','ล้างคำค้นหา');
 const filterButton=action('☷  ตัวกรอง',()=>{panelOpen=!panelOpen;filterBox.hidden=!panelOpen;filterButton.setAttribute('aria-expanded',String(panelOpen))},'btn n22-filter-button');
 filterButton.setAttribute('aria-expanded','false');
 searchArea.append(input,clear,filterButton);lib.append(searchArea);
 const filterBox=mk('div','n22-filter-panel');filterBox.hidden=true;
 filterBox.append(mk('label','', 'กรองด้วยผู้ผลิต ECU (จากข้อมูลที่มี)'));
 const vendorSel=mk('select','');vendorSel.setAttribute('aria-label','ผู้ผลิต ECU');
 for(const [value,label] of [['all','ทั้งหมด'],['Keihin','Keihin'],['Shindengen','Shindengen'],['unknown','ไม่ระบุผู้ผลิต ECU']]){
  const option=mk('option','',label);option.value=value;vendorSel.append(option);
 }
 filterBox.append(vendorSel);
 const reset=action('ล้างตัวกรอง',()=>{vendorSel.value='all';maker='all';tab='all';searchText='';input.value='';page=1;setFilter();render()});
 filterBox.append(reset);lib.append(filterBox);
 const chips=mk('div','n22-quick-filters');lib.append(chips);
 const chipValues=[
  ['all','ทั้งหมด','all'],
  ['Honda','Honda','honda'],
  ['Keihin','Keihin','keihin'],
  ['Shindengen','Shindengen','shindengen'],
  ['fav','นิยม','star']
 ];
 for(const [id,label,icon] of chipValues){
  const b=action('',()=>{maker=id;page=1;setFilter();render()},'n22-filter-chip');
  b.dataset.maker=id;
  b.setAttribute('aria-label',label);
  if(icon==='honda'){
   const image=document.createElement('img');image.src='ui/assets/honda-wing.svg';image.alt='';
   image.className='n22-filter-logo';b.append(image);
  }else if(icon==='keihin'||icon==='shindengen'){
   const image=document.createElement('img');
   image.src=icon==='keihin'?'ui/assets/keihin-badge.svg':'ui/assets/shindengen-badge.svg';
   image.alt=label;image.className='n22-filter-vendor-logo';b.append(image);
  }else b.append(mk('span','n22-filter-icon',icon==='star'?'☆':icon==='all'?'◎':'▣'));
  if(icon!=='keihin'&&icon!=='shindengen')b.append(document.createTextNode(label));
  chips.append(b);
 }
 const sectionTitle=(label)=>{const h=mk('h3','n22-section-heading',label);return h};
 const fhead=mk('div','n22-section-line');
 fhead.append(sectionTitle('รุ่นแนะนำ / ใช้บ่อย'));
 const dots=mk('span','n22-dots');fhead.append(dots);lib.append(fhead);
 const carousel=mk('div','n22-carousel');
 const prev=action('‹',()=>{featured--;renderFeatured()},'n22-feature-arrow');
 const featureCard=mk('div','n22-feature-card');
 const next=action('›',()=>{featured++;renderFeatured()},'n22-feature-arrow');
 prev.setAttribute('aria-label','รุ่นแนะนำก่อนหน้า');next.setAttribute('aria-label','รุ่นแนะนำถัดไป');
 carousel.append(prev,featureCard,next);lib.append(carousel);
 const tabs=mk('div','n22-library-tabs');
 for(const [id,label] of [['all','ทั้งหมด'],['recent','ล่าสุด'],['master','ไฟล์หลัก'],['fav','ใช้บ่อย']]){
  const b=action('',()=>{tab=id;page=1;setTabs();render()},'n22-tab');
  b.dataset.tab=id;b.append(mk('span','',label),mk('span','n22-tab-count','0'));tabs.append(b);
 }
 const orderSel=mk('select','n22-order');
 orderSel.setAttribute('aria-label','เรียงรายการ');
 for(const [id,label] of [['name','ชื่อรุ่น A–Z'],['recent','ใช้งานล่าสุด'],['size','ขนาดไฟล์'],['id','ชื่อรุ่น Z–A']]){
  const option=mk('option','',label);option.value=id;orderSel.append(option);
 }
 const tabWrap=mk('div','n22-tabbar');tabWrap.append(tabs,orderSel);lib.append(tabWrap);
 const lhead=mk('div','n22-section-line n22-list-header');
 const listTitle=sectionTitle('รายการรุ่น / BIN');
 const views=mk('div','n22-view-switch');
 const listBtn=action('☰ รายการ',()=>{gridView=false;setViews();render()},'n22-view-btn');
 const gridBtn=action('▦ ตาราง',()=>{gridView=true;setViews();render()},'n22-view-btn');
 views.append(listBtn,gridBtn);lhead.append(listTitle,views);lib.append(lhead);
 const meta=mk('p','n22-results-meta');
 const rows=mk('div','n20-model-list n22-model-list');lib.append(meta,rows);
 const pager=mk('div','n22-pager');lib.append(pager);
 const foot=mk('div','n22-footer-info');lib.append(foot);
 stage.append(lib);
 const infoDialog=mk('dialog','n22-dialog');infoDialog.id='n22InfoDialog';
 infoDialog.append(mk('h3','', 'รายละเอียดไฟล์ BIN'));
 const infoBody=mk('div','n22-dialog-body');infoDialog.append(infoBody);
 infoDialog.append(action('ปิดรายละเอียด',()=>infoDialog.close(),'btn'));
 lib.append(infoDialog); // Scoped to the library; removed automatically on category change
 const currentFav=id=>favorites.includes(id);
 const markRecent=id=>{
  recent=[id,...recent.filter(x=>x!==id)].slice(0,30);save(KRECENT,recent);
 };
 const selectModel=(r)=>{
  const sel=$('sel');if(!sel)return false;
  sel.value=String(r.i);sel.dispatchEvent(new Event('change',{bubbles:true}));
  return sel.value===String(r.i)&&S.mi===r.i;
 };
 const toggleMaster=(r)=>{
  // MSX XDF's source BIN is integrity checked before the built-in tuner opens.
  if(!r.ready){alert('รุ่นนี้ยังไม่มี BIN และตารางจูน');return}
  if(!selectModel(r))return;
  master=r.m.id;save(KMASTER,master);render();
 };
 const openTable=(r)=>{
  // MSX uses the same built-in TunePro-style grid; the XDF definitions are loaded on entry.
  if(!r.ready){alert('รุ่นนี้ยังไม่มี BIN พร้อมจูน');return}
  if(!selectModel(r))return;
  markRecent(r.m.id);click('goTune');
 };
 const showDetails=r=>{
  infoBody.replaceChildren();
  infoBody.append(logoFor(r,'n22-dialog-logo'));
  const records=[
   ['รุ่นรถ / BIN',r.m.id],
   ['ยี่ห้อรถ',r.manufacturer],
   ['ตระกูล ECU',r.m.fam||'ไม่ระบุ'],
   ['ผู้ผลิต ECU',r.vendor||'ยังไม่มีข้อมูลยืนยัน'],
   ['ขนาด BIN',r.m.xdf?'48 KB (เลือกไฟล์และตรวจ SHA-256 ตอนเปิด XDF)':r.ready?r.bytes.toLocaleString('en-US')+' bytes ('+(r.bytes/1024).toFixed(2)+' KB)':'ยังไม่มี BIN'],
   ['สถานะ',r.m.xdf?'XDF 29 ตาราง · BIN ต้นฉบับตรวจ SHA-256 ก่อนเปิด':r.ready?'มีไฟล์ BIN และตารางจูนจริง':'ยังไม่พร้อมจูน'],
   ['ชนิดไฟล์',r.m.xdf?'XDF 29 ตาราง → หน้าจูนตารางเดิมของ 55 Performance':'ไฟล์หลักของแอป (ไม่ใช่ไฟล์ที่อ่านจาก ECU ลูกค้า)']
  ];
  for(const [key,val] of records){
   const row=mk('div','n22-detail-row');
   row.append(mk('span','',key),mk('strong','',val));infoBody.append(row);
  }
  infoBody.append(mk('p','n22-detail-warning','ก่อนเขียนลง ECU ต้องตรวจ ECU ID, Part Code, เฟิร์มแวร์และ Auto Offset กับกล่องจริงทุกครั้ง'));
  if(!infoDialog.open)infoDialog.showModal();
 };
 const btnSmall=(label,fn,cls)=>{
  const b=action(label,fn,'n22-row-action '+cls);
  b.type='button';return b;
 };
 const createRow=r=>{
  const row=mk('article','n20-model-row n22-bin-row'+(r.m.id===master?' n22-selected-master':''));
  row.dataset.model=r.m.id;
  const brand=logoFor(r);
  const left=mk('div','n22-row-left');
  const code=mk('b','n22-row-code',r.m.id);
  const sub=mk('small','',r.manufacturer+' · ECU '+(r.vendor||r.m.fam||'ไม่ระบุ'));
  left.append(code,sub);
  const vendorLogo=/^keihin$/i.test(r.vendor)?'ui/assets/keihin-badge.svg':
   /^shindengen$/i.test(r.vendor)?'ui/assets/shindengen-badge.svg':null;
  if(vendorLogo){
   const vimg=document.createElement('img');vimg.src=vendorLogo;
   vimg.alt=r.vendor;vimg.className='n22-row-vendor-logo';vimg.loading='lazy';left.append(vimg);
  }
  const mid=mk('div','n22-row-mid');
  mid.append(mk('div','n22-fileline',r.m.xdf?'▣ XDF 29 ตาราง · BIN 48 KB (โหลดจากเครื่อง)':r.ready?'▣ BIN '+(r.bytes/1024).toFixed(2)+' KB':'ยังไม่มีไฟล์ BIN'));
  mid.append(mk('div','n22-fileline','▤ '+(r.m.sub||'ตระกูล '+(r.m.fam||'-'))));
  const pill=mk('span','n22-state-pill'+(r.m.id===master?' main':r.ready?' ready':' missing'),
   r.m.id===master?'♛ ไฟล์หลัก':r.ready?'✓ พร้อมจูน':'รอ BIN');
  const actions=mk('div','n22-row-actions');
  actions.append(
   btnSmall('▤ เปิดตาราง',()=>openTable(r),'n22-action-tune'),
   btnSmall('ⓘ รายละเอียด',()=>showDetails(r),'n22-action-info'),
   btnSmall(r.m.id===master?'♛ เลือกอยู่':'♛ ไฟล์หลัก',()=>toggleMaster(r),'n22-action-master')
  );
  const favorite=action(currentFav(r.m.id)?'★':'☆',()=>{
   if(currentFav(r.m.id))favorites=favorites.filter(x=>x!==r.m.id);
   else favorites=[...favorites,r.m.id];
   save(KFAV,favorites);render();
  },'n22-favorite');
  favorite.setAttribute('aria-label',currentFav(r.m.id)?'ยกเลิกใช้บ่อย':'เพิ่มในใช้บ่อย');
  row.append(brand,left,mid,pill,actions,favorite);return row;
 };
 function eligible(){
  const all=data().filter(r=>r.ready);
  return all.sort((a,b)=>(a.m.id===master?-1:0)-(b.m.id===master?-1:0)||
   (currentFav(a.m.id)?-1:0)-(currentFav(b.m.id)?-1:0)||a.m.id.localeCompare(b.m.id));
 }
 function renderFeatured(){
  const all=eligible();featureCard.replaceChildren();dots.replaceChildren();
  if(!all.length){
   featureCard.append(mk('p','n22-empty','ยังไม่มี BIN หลักพร้อมจูน กรุณาเพิ่มไฟล์ก่อน'));
   prev.disabled=next.disabled=true;return;
  }
  const i=((featured%all.length)+all.length)%all.length,r=all[i];
  prev.disabled=next.disabled=all.length<2;
  const chip=mk('div','n22-feature-chip');
  const svg='<svg viewBox="0 0 120 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#21f4fc"/><stop offset="1" stop-color="#ee4fef"/></linearGradient></defs><path d="M27 13h70l21 19v57l-21 20H27L5 89V32Z" stroke="url(#b)" stroke-width="4" fill="#17204b"/><path d="M28 33h70v53H28z" stroke="#50dfff" fill="#29174d"/><path d="M10 30 2 30 M10 48 2 48 M10 65 2 65 M10 82 2 82 M113 30h6 M113 48h6 M113 65h6 M113 82h6" stroke="#df55ff" stroke-width="3"/></svg>';
  chip.innerHTML=svg;chip.append(mk('span','',r.m.id));
  const featureBrand=logoFor(r,'n22-feature-brand');featureBrand.title=r.manufacturer;
  const featureVendor=/^keihin$/i.test(r.vendor)?'ui/assets/keihin-badge.svg':/^shindengen$/i.test(r.vendor)?'ui/assets/shindengen-badge.svg':null;
  if(featureVendor){const badge=document.createElement('img');badge.src=featureVendor;badge.alt=r.vendor;badge.className='n22-feature-vendor';chip.append(badge)}
  const details=mk('div','n22-feature-detail');
  const heading=mk('div','n22-feature-title');
  heading.append(mk('b','',r.m.id),mk('span','n22-state-pill main',r.m.id===master?'♛ ไฟล์หลัก':'✓ พร้อมจูน'));
  details.append(heading, mk('p','','ECU: '+(r.vendor||r.m.fam||'ไม่ระบุ')+' · BIN: '+(r.bytes/1024).toFixed(2)+' KB'));
  details.append(mk('p','',r.m.sub||'เลือกไฟล์หลักเพื่อเปิดตารางจูน'));
  const buttons=mk('div','n22-feature-actions');
  buttons.append(btnSmall('▤ เปิดตาราง',()=>openTable(r),'n22-action-tune'),
   btnSmall('ⓘ รายละเอียด',()=>showDetails(r),'n22-action-info'),
   btnSmall('♛ เลือกเป็นไฟล์หลัก',()=>toggleMaster(r),'n22-action-master'));
  const bike=document.createElement('img');bike.className='n22-feature-bike';
  bike.src='ui/assets/neon-bike.svg';bike.alt='ภาพประกอบรถจักรยานยนต์';bike.loading='lazy';
  featureCard.append(chip,featureBrand,details,bike,buttons);
  for(let d=0;d<Math.min(5,all.length);d++){
   const dot=mk('span','n22-dot'+(d===i?' active':''));
   dots.append(dot);
  }
 }
 function setTabs(){
  for(const b of tabs.children){
   b.classList.toggle('active',b.dataset.tab===tab);
   b.setAttribute('aria-pressed',String(b.dataset.tab===tab));
   const id=b.dataset.tab,count=id==='all'?data().length:id==='recent'?data().filter(r=>recent.includes(r.m.id)).length:
    id==='master'?data().filter(r=>r.m.id===master).length:
    data().filter(r=>currentFav(r.m.id)).length;
   b.lastChild.textContent=String(count);
  }
 }
 function setFilter(){
  for(const b of chips.children)b.setAttribute('aria-pressed',String(b.dataset.maker===maker));
  filterButton.setAttribute('aria-expanded',String(panelOpen));
 }
 function setViews(){
  listBtn.classList.toggle('active',!gridView);
  gridBtn.classList.toggle('active',gridView);
 }
 function filtered(){
  let arr=data();
  const q=searchText.toLowerCase();
  if(q)arr=arr.filter(r=>[r.m.id,r.m.sub,r.m.fam,r.manufacturer,r.vendor].some(v=>String(v||'').toLowerCase().includes(q)));
  if(maker==='fav')arr=arr.filter(r=>currentFav(r.m.id));
  else if(maker!=='all'){
   if(maker==='Honda')arr=arr.filter(r=>/honda/i.test(r.manufacturer));
   else arr=arr.filter(r=>r.vendor.toLowerCase()===maker.toLowerCase());
  }
  if(vendorSel.value==='unknown')arr=arr.filter(r=>!r.vendor);
  else if(vendorSel.value!=='all')arr=arr.filter(r=>r.vendor.toLowerCase()===vendorSel.value.toLowerCase());
  if(tab==='fav')arr=arr.filter(r=>currentFav(r.m.id));
  if(tab==='master')arr=arr.filter(r=>r.m.id===master);
  if(tab==='recent')arr=arr.filter(r=>recent.includes(r.m.id));
  arr.sort((a,b)=>order==='size'?b.bytes-a.bytes||a.m.id.localeCompare(b.m.id):
   order==='id'?b.m.id.localeCompare(a.m.id):
   order==='recent'?(recent.indexOf(a.m.id)<0?999:recent.indexOf(a.m.id))-(recent.indexOf(b.m.id)<0?999:recent.indexOf(b.m.id)):
   a.m.id.localeCompare(b.m.id));
  return arr;
 }
 function render(){
  setTabs();setFilter();setViews();renderFeatured();
  const all=filtered(),maxPages=Math.max(1,Math.ceil(all.length/perPage));
  page=Math.max(1,Math.min(page,maxPages));
  rows.replaceChildren();
  rows.classList.toggle('n22-as-grid',gridView);
  for(const r of all.slice((page-1)*perPage,page*perPage))rows.append(createRow(r));
  if(!all.length)rows.append(mk('div','n22-empty','ยังไม่มีรายการตามตัวกรองนี้ · ลองเลือกทั้งหมด หรือเพิ่ม BIN จากระบบเดิม'));
  meta.textContent='รายการรุ่น / BIN ('+all.length+' รายการ) · ข้อมูลจากไฟล์ที่ติดตั้งจริง';
  pager.replaceChildren();
  const pbtn=(label,n,selected=false)=>{
   const b=action(label,()=>{page=n;render()},'n22-page-button'+(selected?' active':''));
   b.disabled=n<1||n>maxPages;return b;
  };
  pager.append(pbtn('‹',page-1));
  const start=Math.max(1,Math.min(page-2,maxPages-4));
  for(let i=start;i<=Math.min(maxPages,start+4);i++)pager.append(pbtn(String(i),i,i===page));
  pager.append(pbtn('›',page+1));
  const allData=data();
  foot.textContent='ทั้งหมด '+allData.length+' รุ่น · มี BIN '+allData.filter(r=>r.ready).length+
   ' · ไฟล์หลัก '+allData.filter(r=>r.m.id===master).length+' · ใช้บ่อย '+allData.filter(r=>currentFav(r.m.id)).length;
 }
 input.oninput=()=>{searchText=input.value.trim();page=1;render()};
 vendorSel.onchange=()=>{page=1;render()};
 orderSel.onchange=()=>{order=orderSel.value;page=1;render()};
 setViews();render();
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
 ['📋 ค้นฐาน ECU 290 รายการ (Main C#)','flash_port/main-ecu-catalog.html'],
 ['📦 ACG / ECU → BIN','flash_port/main-source-converter.html'],
 ['🧮 วิเคราะห์ Auto Offset','flash_port/main-source-offset-lab.html'],
 ['🔎 สแกน BIN ID + Checksum จาก Main C# (11 ขนาด)','flash_port/main-bin-audit.html'],
 ['📚 ฐานข้อมูล ECM • 55 Performance','ecm/index.html'],
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
 // Live Data always uses the real-time decoder ported from purchased Main/FM_diag.cs.
 // The old in-page ADX renderer is retained only as an inactive compatibility backend
 // for legacy DTC; users must never be routed to it from the homepage.
 if(id==='live'){
  // Open the existing Neon Live page; the FM_diag.cs session feeds its gauges.
  if($('goLive'))$('goLive').click();
  void window.__55AutoEcu?.enter('live');
  return;
 }
 // The homepage DTC tile opens the dedicated redesigned page immediately.
 // Original hidden command buttons remain solely as the diagnostic transport backend.
 if(id==='dtc'){
  if(!window.__55DtcV23?.open?.()){
   alert('หน้า DTC ใหม่ยังโหลดไม่สำเร็จ กรุณารีเฟรชเว็บ');
  }
  return;
 }
 selected=id;
 // Preflight stage layout must not leak into Library/Dashboard/Tools after back navigation.
 stage.classList.remove('n24-preflight-stage');
 home.dataset.neonPage=id;
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
 else if(id==='flash'){if(window.__55FlashPreflight?.mount)window.__55FlashPreflight.mount(stage);else flashStage();}
 else if(id==='live'||id==='dtc')liveOrDtc(id);
 else if(id==='tools')toolsStage();else if(id==='settings')settingsStage();
 refreshStatus();sc.scrollTo({top:0,behavior:'auto'});
 if(id==='flash')void window.__55AutoEcu?.enter('flash');
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
/* 55 PERFORMANCE TUNE PRO v1 — functional landscape UI.
   All original tuning algorithms, BIN bytes, Save flow and XDF protection
   remain in index.html. The UI only calls __55TuneProAdapter or clicks
   the ORIGINAL wired buttons; previews never create a second BIN. */
(function(){
 'use strict';
 const tune=document.getElementById('tune');
 const api=window.__55TuneProAdapter;
 if(!tune||!api||tune.querySelector('.tp-shell'))return;

 const node=(tag,cls,text)=>{
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(text!==undefined)e.textContent=String(text);
  return e;
 };
 const control=(name,title,fn,cls='')=>{
  const el=node('button','tp-cmd '+cls,name);
  el.type='button';
  if(title)el.title=title;
  el.addEventListener('click',fn);
  return el;
 };
 const toolbar=node('div','tp-toolbar');
 const shell=node('div','tp-shell');
 const sidebar=node('aside','tp-sidebar');
 sidebar.setAttribute('aria-label','รายการตารางจูน');
 const sideHeader=node('div','tp-side-header');
 const sideTitle=node('b','', '☰ Tuning Tables');
 const sideClose=control('«','ยุบรายการตาราง',()=>toggleLeft(false),'tp-side-close');
 const search=node('input','tp-search');
 search.type='search';search.placeholder='ค้นหาตารางน้ำมัน ไฟ AFR…';
 search.setAttribute('aria-label','ค้นหาตารางจูน');
 const sideList=node('div','tp-side-list');
 sideHeader.append(sideTitle,sideClose);
 sidebar.append(sideHeader,search,sideList);

 const main=node('main','tp-main');
 const mainBar=node('div','tp-mainbar');
 const leftToggle=control('☰','เปิดหรือปิดเมนูตารางซ้าย',()=>toggleLeft());
 leftToggle.setAttribute('aria-label','เปิดหรือปิดรายการตารางจูน');
 const title=node('b','','MAP EDITOR · BIN');
 const spacer=node('span','tp-spacer');
 const rightToggle=control('⚙ Tools','เปิดหรือปิดเครื่องมือปรับตัวเลข',()=>toggleRight());
 rightToggle.setAttribute('aria-label','เปิดหรือปิดเครื่องมือปรับค่า');
 const previewToggle=control('▦ Preview','แสดงหรือซ่อนตารางย่อย',()=>togglePreviews());
 mainBar.append(leftToggle,title,spacer,previewToggle,rightToggle);
 const openTabs=node('div','tp-open-tabs');
 openTabs.setAttribute('role','tablist');
 openTabs.setAttribute('aria-label','ตารางจูนที่เปิดอยู่');
 const previewZone=node('section','tp-preview-zone');
 const previewHead=node('div','tp-preview-head');
 const previewTitle=node('b','','MULTI MAP');
 const previewHint=node('span','', 'แสดงค่าจริงจาก BIN · แตะชื่อเพื่อเปิด');
 const previewClose=control('▾','ยุบหรือขยายพรีวิว',()=>togglePreviews());
 const previewList=node('div','tp-preview-list');
 previewHead.append(previewTitle,previewHint,previewClose);
 previewZone.append(previewHead,previewList);
 const toolHost=node('aside','tp-tool-host');
 toolHost.setAttribute('aria-label','เครื่องมือแก้ตัวเลข');
 const status=node('div','tp-status');
 status.setAttribute('role','status');
 status.setAttribute('aria-live','polite');
 const statusModel=node('span');
 const statusFile=node('span');
 const statusCells=node('span');
 const statusUsb=node('span');
 status.append(statusModel,statusFile,statusCells,statusUsb);
 const oldToolbar=tune.querySelector('.bb');
 const oldTabs=tune.querySelector('#tabs');
 const oldSub=tune.querySelector('.sub');
 const grid=tune.querySelector('#gw');
 const toolPanel=tune.querySelector('#fp');
 const flow=tune.querySelector('#tuneFlow');
 if(!oldToolbar||!oldTabs||!oldSub||!grid||!toolPanel||!flow)return;
 const defaultSmall=window.innerWidth<=1050||window.innerHeight<=570;
 // Small landscape devices prioritize the editable grid, not preview cards.
 // Preview remains available on demand as a floating panel.
 const compactLandscape=()=>window.matchMedia('(orientation: landscape) and (max-height: 660px)').matches;
 let compactLast=compactLandscape();
 let leftOpen=!defaultSmall,rightOpen=!defaultSmall,previewOpen=!compactLast;
 let opened=[],pinned=[],modelKey='',query='',lastActive=-999,lastRenderedModel='';
 let scheduled=false;

 // Buttons are deliberately routed to the already bound original actions.
 const oldAction=op=>{
  const target=toolPanel.querySelector('[data-op="'+op+'"]');
  if(!target){console.warn('TUNE PRO: missing existing command',op);return}
  target.click();
 };
 const sourceButtons=node('div','tp-toolbar-extra');
 sourceButtons.style.cssText='display:flex;align-items:center;gap:5px;flex:none';
 sourceButtons.append(
  control('📂 BIN','เปิดไฟล์ BIN โดยใช้ระบบอ่านไฟล์ของหน้าจูนเดิม',()=>{
   const done=api.openFilePicker?.();
   if(!done)console.warn('TUNE PRO: original file picker declined');
  }),
  control('↔ Interpolate','ไล่ค่าระหว่างขอบที่เลือก ตามโค้ดเดิม',()=>oldAction('ib')),
  control('≈ Smooth','ทำให้ค่าที่เลือกเรียบ ตามโค้ดเดิม',()=>oldAction('smooth')),
  control('⧉ Copy','คัดลอกเซลล์ที่เลือก',()=>oldAction('copy')),
  control('▣ Paste','วางในตารางเดิม',()=>oldAction('paste'))
 );
 toolbar.append(sourceButtons,oldToolbar);

 const head=tune.querySelector('.top');
 head.after(toolbar);
 flow.after(shell);
 shell.append(sidebar,main,toolHost);
 main.append(mainBar,openTabs,oldTabs,oldSub,grid,previewZone);
 toolHost.append(toolPanel);
 shell.after(status);

 // The original floating-panel drag handler runs at pointerdown on #fph.
 // Its content remains working, but dragging must not escape the new right dock.
 const panelHeader=toolPanel.querySelector('#fph');
 panelHeader?.addEventListener('pointerdown',event=>{
  if(tune.classList.contains('tp-on'))event.stopImmediatePropagation();
 },true);
 tune.classList.add('tp-on');
 const setClass=()=>{
  tune.classList.toggle('tp-left-closed',!leftOpen);
  tune.classList.toggle('tp-right-closed',!rightOpen);
  sidebar.setAttribute('aria-hidden',String(!leftOpen));
  toolHost.setAttribute('aria-hidden',String(!rightOpen));
  leftToggle.classList.toggle('tp-active',leftOpen);
  rightToggle.classList.toggle('tp-active',rightOpen);
  if(rightOpen&&tune.classList.contains('on')&&toolPanel.classList.contains('cl')){
   toolPanel.classList.remove('cl');
   const minButton=toolPanel.querySelector('#fpc');
   if(minButton)minButton.textContent='ย่อ';
  }
  previewZone.classList.toggle('tp-preview-closed',!previewOpen);
  previewToggle.classList.toggle('tp-active',previewOpen);
  previewClose.textContent=previewOpen?'▾':'▸';
 };
 function toggleLeft(desired){
  leftOpen=typeof desired==='boolean'?desired:!leftOpen;
  setClass();
 }
 function toggleRight(desired){
  rightOpen=typeof desired==='boolean'?desired:!rightOpen;
  setClass();
 }
 function togglePreviews(){
  previewOpen=!previewOpen;setClass();
 }
 setClass();

 const tone=(group,name='')=>{
  const text=String(group||'')+' '+String(name||'');
  if(/น้ำมัน|fuel|inject|inj|หัวฉีด/i.test(text))return 'tp-fuel';
  if(/ไฟ|ign|spark|timing|จุดระเบิด/i.test(text))return 'tp-ign';
  if(/AFR|lambda|o2|ชดเชย|comp|อุณหภูมิ|temp|warm|fan/i.test(text))return 'tp-afr';
  return 'tp-other';
 };
 const remember=(idx)=>{
  if(!opened.includes(idx))opened.push(idx);
  if(opened.length>8){
   const drop=opened.find(x=>x!==lastActive&&!pinned.includes(x));
   if(drop!==undefined)opened=opened.filter(x=>x!==drop);
  }
 };
 const addPin=(idx)=>{
  if(!Number.isInteger(idx)||idx<0)return;
  if(pinned.includes(idx))return;
  pinned.push(idx);
  if(pinned.length>3)pinned.shift();
  // Keep the real grid visible after every table switch on a landscape phone.
  // The Preview control opens the already-prepared maps on demand.
  if(!compactLandscape())previewOpen=true;
 };
 function openTable(idx){
  const current=api.state();
  if(!current?.ready)return;
  if(current.active!==idx&&current.active>=0)addPin(current.active);
  remember(idx);
  if(api.select(idx)){
   lastActive=idx;
   if((window.innerWidth<=1050||window.innerHeight<=570)&&leftOpen)leftOpen=false;
   setClass();schedule();
  }
 }
 const button=(text,handler,cls)=>{
  const b=node('button',cls||'',text);
  b.type='button';b.addEventListener('click',handler);return b;
 };
 function renderSidebar(state){
  const oldScroll=sideList.scrollTop;
  sideList.replaceChildren();
  const needle=query.trim().toLocaleLowerCase();
  const groups=new Map();
  for(const table of state.tables){
   if(needle&&!String(table.name+' '+table.group).toLocaleLowerCase().includes(needle))continue;
   const group=String(table.group||'อื่นๆ');
   if(!groups.has(group))groups.set(group,[]);
   groups.get(group).push(table);
  }
  if(state.switches>0&&(!needle||'สวิตช์ ล็อก'.includes(needle))){
   groups.set('สวิตช์ / ล็อก',groups.get('สวิตช์ / ล็อก')||[]);
   groups.get('สวิตช์ / ล็อก').push({
    id:-1,name:'สวิตช์ / ล็อก ('+state.switches+')',
    group:'สวิตช์ / ล็อก',readOnly:false,changed:false
   });
  }
  for(const [name,items] of groups){
   const label=node('div','tp-group-label '+tone(name),name);
   sideList.append(label);
   for(const t of items){
    const row=node('button','tp-side-item '+tone(t.group,t.name));
    row.type='button';row.dataset.table=String(t.id);
    row.setAttribute('aria-current',String(state.active===t.id));
    row.title=t.name+(t.readOnly?' · อ่านอย่างเดียว':'');
    const ic=node('span','',t.id===-1?'⚙':t.readOnly?'▤':'▦');
    const tname=node('span','tp-name',t.name);
    row.append(ic,tname);
    if(t.changed)row.append(node('span','tp-dirty','●'));
    row.addEventListener('click',()=>openTable(t.id));
    const wrapper=node('div');
    wrapper.style.cssText='display:flex;align-items:center;gap:3px';
    row.style.flex='1';
    wrapper.append(row);
    if(t.id>=0){
     const pin=button(pinned.includes(t.id)?'✓':'＋',()=>{
      if(pinned.includes(t.id))pinned=pinned.filter(x=>x!==t.id);
      else {addPin(t.id);remember(t.id)}
      setClass();schedule();
     },'tp-pin');
     pin.title=pinned.includes(t.id)?'เอาตารางออกจากพรีวิว':'ปักหมุดตารางนี้เป็นพรีวิว';
     pin.setAttribute('aria-pressed',String(pinned.includes(t.id)));
     wrapper.append(pin);
    }
    sideList.append(wrapper);
   }
  }
  if(!groups.size)sideList.append(node('p','tp-sidebar-empty','ไม่พบชื่อตารางใน BIN/XDF รุ่นนี้'));
  sideList.scrollTop=oldScroll;
 }
 function renderTabs(state){
  openTabs.replaceChildren();
  for(const i of opened){
   const t=state.tables.find(x=>x.id===i)||
    (i===-1&&state.switches?{id:-1,name:'สวิตช์ / ล็อก',group:'ล็อก'}:null);
   if(!t)continue;
   const tab=node('div','tp-open-tab '+tone(t.group,t.name)+(state.active===i?' tp-on-tab':''));
   tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(state.active===i));
   const open=button(t.name,()=>openTable(i),'tp-tab-label');
   open.title=t.name;
   const close=button('×',()=>{
    if(opened.length<=1)return;
    opened=opened.filter(x=>x!==i);
    pinned=pinned.filter(x=>x!==i);
    if(state.active===i)openTable(opened[opened.length-1]);
    else schedule();
   },'tp-tab-remove');
   close.title='ปิดแท็บ (ไม่ลบค่าจูน)';
   tab.append(open,close);openTabs.append(tab);
  }
  const more=control('＋','เปิดรายการตารางทางซ้าย',()=>toggleLeft(true));
  more.style.cssText='height:26px;min-height:26px;padding:0 9px';
  openTabs.append(more);
 }
 function colorCell(value,min,max){
  if(!Number.isFinite(value)||min===null||max===null)return '#16354b';
  const ratio=max===min?0.5:Math.max(0,Math.min(1,(value-min)/(max-min)));
  const h=130-128*ratio;
  return 'hsl('+h.toFixed(0)+' 76% '+(22+9*ratio).toFixed(0)+'%)';
 }
 function renderPreviews(state){
  previewList.replaceChildren();
  const visible=pinned.filter(id=>id!==state.active&&state.tables.some(t=>t.id===id)).slice(-3);
  for(const id of visible){
   const data=api.preview(id);if(!data)continue;
   const card=node('div','tp-preview-card');
   const header=node('div','tp-preview-card-head');
   const label=node('strong','',data.name+(data.readOnly?' · อ่านอย่างเดียว':''));
   const activate=button('เปิดเต็ม',()=>openTable(id));
   const remove=button('×',()=>{pinned=pinned.filter(i=>i!==id);schedule()});
   activate.title='แก้ข้อมูลตารางนี้ในพื้นที่หลัก';
   remove.title='เอาพรีวิวนี้ออก';
   header.append(label,activate,remove);
   const scroller=node('div','tp-preview-scroll');
   const table=node('table','tp-preview-grid');
   const tr=node('tr');
   tr.append(node('th','',data.unit||''));
   for(const x of data.x)tr.append(node('th','',x));
   const thead=node('thead');thead.append(tr);table.append(thead);
   const tbody=node('tbody');
   for(let row=0;row<data.values.length;row++){
    const r=node('tr');r.append(node('th','',data.y[row]??row+1));
    for(const cell of data.values[row]){
     const td=node('td',cell.edited?'tp-preview-mod':'',cell.text);
     td.style.background=colorCell(cell.value,data.min,data.max);
     r.append(td);
    }
    tbody.append(r);
   }
   table.append(tbody);scroller.append(table);card.append(header,scroller);
   previewList.append(card);
  }
  if(!visible.length){
   previewList.append(node('span','tp-sidebar-empty',
    'เลือกตารางอื่นหรือกด ＋ ในเมนูซ้าย เพื่อดูหลายตารางพร้อมกัน'));
  }
  previewHint.textContent=visible.length+' ตารางย่อย · อ้างอิง BIN ปัจจุบัน';
 }
 function updateStatus(state){
  statusModel.textContent=state.model||'ยังไม่เลือก ECU';
  statusFile.textContent='BIN: '+(state.file||'—')+' · '+(state.binSize||0).toLocaleString('en-US')+' B';
  statusCells.textContent='แก้ '+(state.changedBytes||0)+' byte · '+(state.saved?'บันทึกแล้ว':'ยังไม่บันทึก');
  const snap=window.__55SharedEcu?.snapshot?.();
  if(snap?.connected){
   statusUsb.textContent='FT232R Connected · ECU '+(snap.ecuId||'ยังไม่ได้อ่าน ID');
   statusUsb.style.color='#61f7ca';
  }else{
   statusUsb.textContent='FT232R ไม่ได้เชื่อมต่อ (จูน BIN แบบออฟไลน์ได้)';
   statusUsb.style.color='#ffbf75';
  }
 }
 function render(){
  scheduled=false;
  const state=api.state();
  if(!state?.ready)return;
  if(modelKey!==state.model){
   modelKey=state.model;opened=[];pinned=[];lastActive=-999;
  }
  if(!opened.includes(state.active))remember(state.active);
  lastActive=state.active;
  title.textContent='MAP EDITOR · '+state.tables.length+' TABLES';
  renderSidebar(state);renderTabs(state);renderPreviews(state);
  updateStatus(state);setClass();
 }
 function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(render);
 }
 search.addEventListener('input',()=>{
  query=search.value;schedule();
 });
 window.addEventListener('55:tune-pro-update',schedule);
 const onTuneState=new MutationObserver(schedule);
 onTuneState.observe(tune,{attributes:true,attributeFilter:['class']});
 // Update connection status without repeatedly rebuilding all tuning tables.
 window.setInterval(()=>{
  if(tune.classList.contains('on')){
   const state=api.state();
   if(state?.ready)updateStatus(state);
  }
 },2500);
 window.addEventListener('resize',()=>{
  const compactNow=compactLandscape();
  if(compactNow!==compactLast){
   compactLast=compactNow;
   previewOpen=!compactNow;
   if(compactNow){leftOpen=false;rightOpen=false}
   setClass();
  }
  if(tune.classList.contains('on'))schedule();
 });
 schedule();
 window.__55TuneProUI=Object.freeze({
  version:'1.0',
  getLayout:()=>({leftOpen,rightOpen,previewOpen,openTabs:[...opened],pinned:[...pinned]}),
  refresh:schedule
 });
})();

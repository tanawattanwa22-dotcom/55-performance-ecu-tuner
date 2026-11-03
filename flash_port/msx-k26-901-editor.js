// 55 PERFORMANCE • Honda MSX125 Gen 1 / 38770-K26-901 XDF editor.
// Exact source: user-provided 38770-K26-901_unlock.xdf and 4000-FFFF 48KB BIN.
// File-relative addresses. NEVER subtract 0x4000. No ECU USB calls in this tool.
const $=id=>document.getElementById(id);
const state={cfg:null,original:null,bytes:null,table:null,changes:[],verified:false,readonlyReason:''};
const hex=(x,n=4)=>'0x'+x.toString(16).toUpperCase().padStart(n,'0');
const field=(id,value)=>{$(id).textContent=String(value)};
const note=(txt,kind='')=>{field('notice',txt);$('notice').dataset.kind=kind};
const pnum=(v,d=2)=>Number.isFinite(v)?v.toFixed(Math.min(6,Math.max(0,d))):'—';
const bytesOfBase64=x=>Uint8Array.from(atob(x.trim()),c=>c.charCodeAt(0));
async function unzip(b64){const b=bytesOfBase64(b64);const stream=new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));return new Uint8Array(await new Response(stream).arrayBuffer())}
async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function config(){
 const url='./msx-k26-901-meta.json.gz.b64?v=1';
 const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('โหลดข้อมูล XDF จาก GitHub ไม่สำเร็จ (HTTP '+r.status+')');
 const cfg=JSON.parse(new TextDecoder().decode(await unzip(await r.text())));
 if(cfg?.part!=='38770-K26-901'||cfg.size!==49152||cfg.tables?.length!==29||cfg.flags?.length!==9)
  throw Error('ข้อมูล XDF ไม่ครบ 29 ตาราง / 9 flags');
 const ids=new Set(cfg.tables.map(t=>t.id));
 if(ids.size!==29||!ids.has('0X52F2')||!ids.has('0X73BF'))throw Error('พบ XDF ID ซ้ำหรือข้อมูลไม่ครบ');
 for(const t of cfg.tables){
  const size=t.bits/8;
  if(!Number.isInteger(t.addr)||!Number.isInteger(size)||![1,2].includes(size)||!Number.isInteger(t.rows)||!Number.isInteger(t.cols)||t.rows*t.cols>2000)
   throw Error('ข้อมูล XDF ผิดรูปแบบที่ '+t.id);
  for(let row=0;row<t.rows;row++)for(let col=0;col<t.cols;col++){
   const a=t.addr+row*(t.cols*t.step+t.gap)+col*t.step;
   if(a<0||a+size>49152)throw Error('XDF เกินขอบ BIN: '+t.title+' '+hex(a));
  }
 }
 return cfg;
}
function getRaw(bytes,addr,bits,little){
 if(addr<0||addr+bits/8>bytes.length)throw Error('Offset นอกไฟล์ '+hex(addr));
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 return bits===8?view.getUint8(addr):view.getUint16(addr,!!little);
}
function setRaw(bytes,addr,bits,little,n){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bits===8)view.setUint8(addr,n);
 else view.setUint16(addr,n,!!little);
}
function cellOffset(t,row,col){return t.addr+row*(t.cols*t.step+t.gap)+col*t.step}
function getValue(t,row,col){return getRaw(state.bytes,cellOffset(t,row,col),t.bits,t.little)*t.formula[0]+t.formula[1]}
function getOriginalValue(t,row,col){return getRaw(state.original,cellOffset(t,row,col),t.bits,t.little)*t.formula[0]+t.formula[1]}
function tableById(id){return state.cfg.tables.find(t=>t.id===String(id).toUpperCase())}
function axisValues(axis,count){
 if(axis?.link){
  const source=tableById(axis.link);
  if(!source)return Array.from({length:count},(_,i)=>String(i+1));
  return Array.from({length:count},(_,i)=>pnum(getValue(source,Math.min(i,source.rows-1),source.cols===1?0:i%source.cols),source.precision));
 }
 if(axis?.labels?.some(x=>String(x||'').trim())){
  return Array.from({length:count},(_,i)=>String(axis.labels[i]??i+1));
 }
 if(Number.isInteger(axis?.address)){
  return Array.from({length:count},(_,i)=>{
   const v=getRaw(state.bytes,axis.address+i*axis.step,axis.bits,axis.little);
   return pnum(v*axis.formula[0]+axis.formula[1],1)
  });
 }
 return Array.from({length:count},(_,i)=>String(i+1));
}
const locked=t=>['0X11B4','0X1EB'].includes(t.id)||t.cat===9;
function changedCell(t,r,c){
 const at=cellOffset(t,r,c),len=t.bits/8;
 for(let k=0;k<len;k++)if(state.bytes[at+k]!==state.original[at+k])return true;
 return false;
}
function countDiff(){
 let n=0;for(let i=0;i<state.bytes.length;i++)if(state.bytes[i]!==state.original[i])n++;
 return n;
}
function updateStats(){
 let count=0;for(const t of state.cfg.tables)for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++)if(changedCell(t,r,c))count++;
 field('changes',countDiff()+' ไบต์ · '+count+' ช่อง');
 $('save').disabled=!state.verified||countDiff()===0;
 $('undo').disabled=!state.changes.length;
}
function showTable(id){
 if(!state.bytes)return;
 const t=tableById(id);if(!t)return;
 state.table=t;field('mapTitle',t.title);field('mapInfo',
  'XDF '+t.id+' · ตำแหน่งใน BIN '+hex(t.addr)+' · '+t.rows+' × '+t.cols+' · '+t.bits+' bit '+(t.bits===16?(t.little?'Little Endian':'Big Endian'):'')+
  ' · สูตร '+t.rawEquation+' · ก้าว '+t.step+' ไบต์');
 const readOnly=locked(t)||!state.verified;
 field('editNote',locked(t)?'อ่านอย่างเดียว: ตารางนี้ซ้อนตำแหน่งหรือเป็นข้อมูล Code/Identity ของกล่อง':!state.verified?'อ่านอย่างเดียว: ไฟล์ BIN ไม่ตรง SHA-256 ต้นฉบับ':'แตะค่าภายในตารางเพื่อแก้ไข ค่าจะถูกแปลงกลับเป็นข้อมูลดิบตามสูตร XDF เท่านั้น');
 const x=axisValues(t.x,t.cols),y=axisValues(t.y,t.rows),tab=$('matrix');tab.replaceChildren();
 const header=document.createElement('tr'),first=document.createElement('th');first.textContent='RPM / แกน Y';header.append(first);
 for(const xx of x){const th=document.createElement('th');th.textContent=xx;header.append(th)}
 tab.append(header);
 let outliers=0,min=Infinity,max=-Infinity;
 for(let r=0;r<t.rows;r++){
  const tr=document.createElement('tr'),ylabel=document.createElement('th');ylabel.textContent=y[r]??r+1;tr.append(ylabel);
  for(let c=0;c<t.cols;c++){
   const v=getValue(t,r,c);min=Math.min(min,v);max=Math.max(max,v);
   if((t.min!==null&&v<t.min-1e-4)||(t.max!==null&&v>t.max+1e-4))outliers++;
   const td=document.createElement('td'),button=document.createElement('button');
   button.type='button';button.className='cell'+(changedCell(t,r,c)?' changed':'');
   button.textContent=pnum(v,t.precision);button.disabled=readOnly;
   button.title='Offset '+hex(cellOffset(t,r,c))+' · ค่า '+pnum(v,6);
   button.onclick=()=>editCell(t,r,c);
   td.append(button);tr.append(td);
  }tab.append(tr);
 }
 field('range','ค่าจริงใน BIN '+pnum(min,2)+' ถึง '+pnum(max,2)+(outliers?' · ค่าเกินช่วง XDF '+outliers+' ช่อง (ไม่แก้อัตโนมัติ)':' · ค่าทั้งหมดอยู่ในช่วง XDF'));
 $('readOnly').hidden=!readOnly;
 updateStats();
}
function editCell(t,row,col){
 if(!state.verified||locked(t))return;
 const at=cellOffset(t,row,col),raw=getRaw(state.bytes,at,t.bits,t.little),original=getValue(t,row,col);
 const entered=prompt(t.title+'\nแถว '+(row+1)+' / คอลัมน์ '+(col+1)+'\nOffset '+hex(at)+'\nค่าเดิม '+pnum(original,6)+'\nป้อนค่าใหม่:',pnum(original,t.precision));
 if(entered===null)return;
 const val=Number(entered.trim().replace(',','.'));
 if(!Number.isFinite(val)||!entered.trim()){alert('กรุณาป้อนตัวเลขที่ถูกต้อง');return}
 if(t.min!==null&&val<t.min-1e-8||t.max!==null&&val>t.max+1e-8){
  alert('ค่านอกช่วงของ XDF: '+t.min+' ถึง '+t.max+' · ยกเลิกเพื่อไม่ให้ค่าผิด');return
 }
 const rawNext=Math.round((val-t.formula[1])/t.formula[0]);
 const maxRaw=t.bits===8?255:65535;
 if(!Number.isInteger(rawNext)||rawNext<0||rawNext>maxRaw){alert('ค่าดิบหลังแปลงเกิน '+t.bits+' bit');return}
 const storedValue=rawNext*t.formula[0]+t.formula[1];
 const tolerance=Math.max(0.5*Math.pow(10,-t.precision),Math.abs(t.formula[0])/2+1e-6);
 if(Math.abs(storedValue-val)>tolerance+1e-8){
  alert('ค่าป้อนแปลงกลับเป็นข้อมูลดิบไม่ตรงตามความละเอียด XDF');return
 }
 if(raw===rawNext)return;
 state.changes.push({at,bits:t.bits,little:t.little,raw});
 setRaw(state.bytes,at,t.bits,t.little,rawNext);
 // Round-trip proof before exposing Save BIN.
 if(getRaw(state.bytes,at,t.bits,t.little)!==rawNext){state.changes.pop();setRaw(state.bytes,at,t.bits,t.little,raw);throw Error('BIN round-trip mismatch')}
 showTable(t.id);
 note('แก้ช่องที่ '+hex(at)+' สำเร็จ · '+pnum(original,t.precision)+' → '+pnum(storedValue,t.precision),'ok');
}
function filterTables(){
 const q=$('filter').value.trim().toLowerCase(),cat=$('category').value;
 const items=state.cfg.tables.filter(t=>(!cat||String(t.cat)===cat)&&(!q||(t.title+' '+t.id).toLowerCase().includes(q)));
 const select=$('tables'),current=state.table?.id;select.replaceChildren();
 for(const t of items){
  const opt=document.createElement('option');opt.value=t.id;opt.textContent=(locked(t)?'🔒 ':'')+t.title+' · '+hex(t.addr);
  select.append(opt);
 }
 if(!items.length){field('mapTitle','ไม่พบตาราง');$('matrix').replaceChildren();return}
 select.value=items.some(t=>t.id===current)?current:items[0].id;
 showTable(select.value);
}
async function loadBin(file){
 state.bytes=null;state.original=null;state.verified=false;state.changes=[];
 $('save').disabled=true;
 if(!file)return;
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes.length!==state.cfg.size)throw Error('BIN ต้องมีขนาด 49,152 ไบต์ (48 KB) ไม่ใช่ '+bytes.length);
 const hash=await sha256(bytes);
 state.original=bytes.slice();state.bytes=bytes.slice();state.verified=hash===state.cfg.sha256;
 field('sha',hash);
 const rpm=tableById('0X2769'),tps=tableById('0X44F7');
 if(!rpm||!tps||Math.abs(getValue(rpm,0,0)-800)>20||Math.abs(getValue(tps,1,0)-0.3904)>0.01){
  state.verified=false;
  note('ไม่พบ Breakpoint ในตำแหน่งตาม XDF · เปิดดูได้อย่างเดียว ห้ามบันทึก','bad');
 }else if(state.verified){
  note('✓ SHA-256 ตรงกับ BIN 38770-K26-901 ที่ส่งมา · 29 ตาราง / 9 แฟล็ก · พร้อมจูนแบบออฟไลน์','ok');
 }else{
  note('BIN ขนาดถูก แต่ SHA-256 ไม่ตรงต้นฉบับ · เปิดอ่านอย่างเดียวเพื่อป้องกันแก้ไฟล์ผิดรุ่น','bad');
 }
 field('file',file.name+' · '+bytes.length.toLocaleString()+' bytes');
 filterTables();
}
function save(){
 if(!state.verified||!state.bytes||!countDiff())return;
 const file=state.bytes.slice();
 // Every changed address must be one of the unlocked XDF table cell bytes.
 const allowed=new Set();
 for(const t of state.cfg.tables.filter(t=>!locked(t)))for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++){
  const at=cellOffset(t,r,c);for(let i=0;i<t.bits/8;i++)allowed.add(at+i);
 }
 for(let i=0;i<file.length;i++)if(file[i]!==state.original[i]&&!allowed.has(i))throw Error('พบบิตเปลี่ยนนอกตาราง XDF ที่อนุญาต: '+hex(i));
 const blob=new Blob([file],{type:'application/octet-stream'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='38770-K26-901_MSX_GEN1_TUNED.bin';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),10000);
 note('สร้าง BIN 48 KB จากไฟล์เดิม โดยเปลี่ยนเฉพาะช่องที่แก้แล้ว · ยังไม่ได้เขียนลง ECU และไม่ได้ยืนยัน Checksum สำหรับแฟลช','ok');
}
$('bin').addEventListener('change',async e=>{
 try{await loadBin(e.target.files?.[0])}
 catch(err){state.bytes=null;state.verified=false;note('เปิด BIN ไม่สำเร็จ: '+err.message,'bad');$('matrix').replaceChildren()}
 e.target.value='';
});
$('filter').oninput=()=>state.cfg&&state.bytes&&filterTables();
$('category').onchange=()=>state.cfg&&state.bytes&&filterTables();
$('tables').onchange=()=>showTable($('tables').value);
$('undo').onclick=()=>{
 const last=state.changes.pop();if(!last)return;
 setRaw(state.bytes,last.at,last.bits,last.little,last.raw);showTable(state.table.id);note('ย้อนกลับการแก้ไขล่าสุดแล้ว','ok');
};
$('reset').onclick=()=>{
 if(!state.original||!confirm('คืนค่าช่องทั้งหมดเป็นค่าเดิมของ BIN ที่เปิด?'))return;
 state.bytes=state.original.slice();state.changes=[];showTable(state.table.id);note('คืนค่าตาม BIN ต้นฉบับแล้ว','ok');
};
$('save').onclick=save;
$('downloadAudit').onclick=()=>{
 const cfg=state.cfg;if(!cfg)return;
 const report={source:cfg.part,binSha256:cfg.sha256,xdfSha256:cfg.xdfSha256,tableCount:cfg.tables.length,flagCount:cfg.flags.length,
  readOnlyTables:cfg.tables.filter(locked).map(x=>x.id),fileRelativeOffsets:true,checksumNotVerified:true};
 const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='55_Msx_K26_XDF_AUDIT.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);
};
(async()=>{
 try{
  state.cfg=await config();
  const sel=$('category');for(const [id,name]of Object.entries(state.cfg.categories)){
   const opt=document.createElement('option');opt.value=id;opt.textContent=name;sel.append(opt);
  }
  field('definition','XDF 29 ตาราง + 9 Flags · MSX Gen1 K26-901');
  note('โหลดนิยาม XDF สำเร็จ · เลือกไฟล์ 38770-K26-901_4000-FFFF.bin จากโทรศัพท์เพื่อแสดงตาราง','ok');
 }catch(err){note('ไม่สามารถโหลดนิยาม XDF: '+err.message,'bad');$('bin').disabled=true}
})();
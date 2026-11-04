/* 55 PERFORMANCE - XDF definitions into the ORIGINAL TunePro-style editor.
 * Derived from the owner's exact 38770-K26-901_unlock.xdf / 48 KB BIN.
 * No alternate tuner UI, no ECU write or USB commands.
 */
(()=>{'use strict';
const ID='MSX-GEN1-K26-901',PART='38770-K26-901',N=49152;
const SOURCE_ROOT=new URL('flash_port/',document.baseURI);
const SOURCE_HASH='7fcd19352605a3197e9b9b498e32ecf7ab9147da318673a8f41a7c131f8fc785';
const LOCKED=new Set(['0X11B4','0X1EB','0X2863','0X3BD6','0X4193']);
// Exact XDF IDs are retained internally; UI shows short, neutral Thai labels.
const TH=Object.freeze({
 '0X44F7':'แกนตำแหน่งคันเร่ง (%)',
 '0X2769':'แกนรอบเครื่องยนต์ (RPM)',
 '0X52F2':'น้ำมันชดเชยตามคันเร่ง',
 '0X73BF':'ตารางจ่ายน้ำมันหลัก',
 '0X7662':'ไฟจุดระเบิดขณะเข้าเกียร์',
 '0X5B95':'ไฟจุดระเบิดเกียร์ว่าง',
 '0X4C59':'รอบตัดจุดระเบิด (RPM)',
 '0X1CA0':'รอบตัดหัวฉีด (RPM)',
 '0X7E1A':'รอบคำสั่งชดเชย (RPM)',
 '0X11B4':'คำขอคันเร่งชดเชย',
 '0X1EB':'คำขอปริมาณฉีดชดเชย',
 '0X5E66':'รอบจำกัดการทำงานปั๊มน้ำมัน (RPM)',
 '0X3E6C':'น้ำมันชดเชยช่วงเร่งเครื่อง',
 '0X7C9C':'ไฟจุดระเบิดชดเชยช่วงเร่ง',
 '0X4200':'ตารางส่วนผสมอากาศ/เชื้อเพลิง',
 '0X4572':'ส่วนผสมช่วงเดินเบาขณะเข้าเกียร์',
 '0X3A04':'ส่วนผสมช่วงเดินเบาเกียร์ว่าง',
 '0X7DDD':'แกนรอบคอยล์ช่วงเริ่มเครื่อง',
 '0X1E92':'เวลาคอยล์ช่วงเริ่มเครื่อง',
 '0X6F00':'แกนรอบคอยล์ขณะเข้าเกียร์',
 '0X14CE':'เวลาคอยล์ขณะเข้าเกียร์',
 '0X345':'สอบเทียบอุณหภูมิน้ำมันเครื่อง',
 '0X6025':'คำนวณอุณหภูมิน้ำมันเครื่อง',
 '0X72AE':'สอบเทียบอุณหภูมิไอดี',
 '0X29C5':'เวลาเริ่มจุดระเบิดช่วงต่ำ',
 '0X3475':'เวลาเริ่มจุดระเบิดช่วงสูง',
 '0X2863':'ข้อมูลรหัสตรวจสอบเครื่องยนต์',
 '0X3BD6':'ข้อมูลรหัสซอฟต์แวร์กล่อง',
 '0X4193':'ข้อมูลรหัสจุดศูนย์ตายบน'
});
const FLAG_TH=Object.freeze({
 '0X1D1F':'เซนเซอร์อุณหภูมิน้ำมันเครื่อง',
 '0X283F':'เซนเซอร์แรงดันไอดี',
 '0X40F4':'เซนเซอร์อุณหภูมิไอดี',
 '0X5D61':'เซนเซอร์ออกซิเจน',
 '0X2457':'เซนเซอร์รถล้ม',
 '0X523':'วาล์วเร่งรอบเดินเบา',
 '0X22D5':'ปิดการปรับน้ำมันระยะยาว',
 '0X1913':'ระบบตอบสนองป้อนกลับ',
 '0X73AF':'ข้อมูลประจำรุ่นใน XDF'
});
let job=null,cfg=null,baseline=null,allowed=null,defs=null;
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const unzip=async text=>{
 const raw=Uint8Array.from(atob(text.trim()),c=>c.charCodeAt(0));
 const st=new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));
 return new Uint8Array(await new Response(st).arrayBuffer());
};
const fetchGzip=async file=>{
 const r=await fetch(new URL(file+'?v=320',SOURCE_ROOT),{cache:'no-store'});
 if(!r.ok)throw Error('โหลดนิยาม MSX '+file+' ไม่ได้: HTTP '+r.status);
 return unzip(await r.text());
};
function toBase64(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)
 text+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(text);
}
function axis(t,which,byId){
 const a=t[which],count=which==='x'?t.cols:t.rows;
 if(a?.link){
  const linked=byId.get(a.link);
  if(!linked||!((linked.cols===1&&linked.rows>=count)||(linked.rows===1&&linked.cols>=count)))throw Error('XDF linked axis '+a.link+' dimension mismatch in '+t.id);
  return {a:linked.addr,b:linked.bits,sg:false,le:linked.little,st:linked.step,d:linked.precision,eq:linked.rawEquation,n:count,rpm:a.link==='0X2769'};
 }
 if(Array.isArray(a?.labels)){
  return {l:Array.from({length:count},(_,i)=>String(a.labels[i]??''))};
 }
 if(Number.isInteger(a?.address)){
  if(a.address+(count-1)*a.step+a.bits/8>N)throw Error('XDF axis outside BIN: '+t.id);
  return {a:a.address,b:a.bits,sg:false,le:a.little,st:a.step,d:1,n:count,rpm:false,
    eq:'X*'+a.formula[0]+(a.formula[1]>=0?'+':'')+a.formula[1]};
 }
 return null; // No definition in XDF: do not invent breakpoints.
}
function prepare(meta,bin){
 if(meta?.part!==PART||meta.size!==N||meta.tables?.length!==29||meta.flags?.length!==9)
  throw Error('MSX XDF ต้องมี 29 ตารางและ 9 flags เท่านั้น');
 const ids=new Set(meta.tables.map(t=>t.id));if(ids.size!==29)throw Error('XDF ID ซ้ำ');
 const byId=new Map(meta.tables.map(t=>[t.id,t]));
 const occupied=new Map();
 for(const t of meta.tables){
  if(![8,16].includes(t.bits)||t.rows<=0||t.cols<=0||t.rows*t.cols>1800||
    !Number.isInteger(t.addr)||!Number.isInteger(t.step)||t.step<t.bits/8||
    !Number.isInteger(t.gap)||t.gap<0||
    !Number.isFinite(t.formula?.[0])||!t.formula[0])
   throw Error('XDF layout หรือสูตรไม่รองรับ '+t.id);
  for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++){
   const at=t.addr+r*(t.cols*t.step+t.gap)+c*t.step;
   if(at<0||at+t.bits/8>N)throw Error('XDF '+t.id+' ชี้นอก BIN 48KB');
   for(let i=0;i<t.bits/8;i++){
    const k=at+i;const o=occupied.get(k)||new Set();o.add(t.id);occupied.set(k,o);
   }
  }
 }
 // Do not edit any overlap, source identity, flags, or unknown XDF structure.
 const protectedBytes=new Set();
 for(const [at,owners] of occupied)if(owners.size>1||[...owners].some(id=>LOCKED.has(id)))protectedBytes.add(at);
 for(const f of meta.flags)protectedBytes.add(f.addr);
 const good=new Set();
 for(const t of meta.tables)if(!LOCKED.has(t.id)){
  let crosses=false;
  for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++){
   const at=t.addr+r*(t.cols*t.step+t.gap)+c*t.step;
   for(let i=0;i<t.bits/8;i++)if(protectedBytes.has(at+i))crosses=true;
  }
  if(!crosses)for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++){
   const at=t.addr+r*(t.cols*t.step+t.gap)+c*t.step;
   for(let i=0;i<t.bits/8;i++)good.add(at+i);
  }
 }
 const groups=['แกน','น้ำมัน','จุดระเบิด','จ่ายเชื้อเพลิง','คอยล์','เซนเซอร์','ค่าชดเชย','AFR','ตัดรอบ','ล็อก / โค้ด'];
 if(Object.keys(TH).length!==29||Object.keys(FLAG_TH).length!==9||meta.tables.some(t=>!TH[t.id])||meta.flags.some(f=>!FLAG_TH[f.id]))
  throw Error('นิยามเมนู MSX XDF ไม่ครบ 29 ตารางและ 9 รายการ');
 const tables=meta.tables.map(t=>{
  let safe=!LOCKED.has(t.id);
  for(let r=0;r<t.rows&&safe;r++)for(let c=0;c<t.cols&&safe;c++){
   const at=t.addr+r*(t.cols*t.step+t.gap)+c*t.step;
   for(let i=0;i<t.bits/8;i++)if(!good.has(at+i))safe=false;
  }
  return {t:TH[t.id],s:safe?'': 'ส่วนข้อมูลซ้อนหรือรหัสกล่อง · อ่านอย่างเดียว',
   g:groups[t.cat]||'ข้อมูลกล่อง',a:t.addr,r:t.rows,c:t.cols,rs:t.cols*t.step+t.gap,cs:t.step,
   b:t.bits,sg:false,le:t.little,eq:t.rawEquation,d:t.precision,
   mn:t.min,mx:t.max,x:axis(t,'x',byId),y:axis(t,'y',byId),ro:!safe,
   u:t.cat===8?'RPM':'',xdfId:t.id,sourceAddress:t.addr};
 });
 const sw=meta.flags.map(f=>{
  const oneBit=Number.isInteger(f.mask)&&f.mask>0&&(f.mask&(f.mask-1))===0;
  const addressOK=Number.isInteger(f.addr)&&f.addr>0&&f.addr<N;
  // Only edit one unambiguous bit outside identity/overlapping code.
  const safe=oneBit&&addressOK&&!occupied.has(f.addr);
  if(safe)good.add(f.addr);
  const why=!addressOK?'XDF ไม่ได้ระบุที่อยู่สวิตช์ที่ใช้ได้':
   !oneBit?'XDF ใช้มาสก์หลายบิตหรือมาสก์ศูนย์ · ยังยืนยันไม่ได้':
   (protectedBytes.has(f.addr)||occupied.has(f.addr))?'พื้นที่ข้อมูลทับรหัสหรือใช้ร่วมกับตารางอื่น':'';
  return {t:FLAG_TH[f.id],s:safe?'อ่านและแก้ไขบิตตามนิยาม XDF':'อ่านอย่างเดียว · '+why,
   i:addressOK&&f.mask?[[f.addr,f.mask,true]]:[],ro:!safe,
   xdfId:f.id,sourceAddress:f.addr,sourceMask:f.mask};
 });
 return {tables,sw,allowed:good,sourceIds:ids,protectedCount:protectedBytes.size};
}
async function ensure(){
 if(defs&&baseline)return true;
 if(job)return job;
 job=(async()=>{
  if(typeof DecompressionStream==='undefined')throw Error('เบราว์เซอร์ไม่รองรับอ่าน XDF/BIN gzip');
  const [metaBytes,bin]=await Promise.all([
   fetchGzip('msx-k26-901-meta.json.gz.b64'),fetchGzip('msx-k26-901-bin.gz.b64')]);
  if(bin.length!==N)throw Error('BIN ของ MSX ไม่ใช่ 48KB');
  if(await sha(bin)!==SOURCE_HASH)throw Error('BIN MSX ไม่ตรง SHA-256 ต้นฉบับ');
  const meta=JSON.parse(new TextDecoder().decode(metaBytes));
  if(meta.sha256!==SOURCE_HASH)throw Error('XDF metadata และ BIN ไม่ตรงกัน');
  const built=prepare(meta,bin);
  baseline=bin.slice();cfg=meta;allowed=built.allowed;defs=built;
  DEFS[ID]={tables:built.tables,sw:built.sw};
  BINS[ID]=toBase64(bin);
  return true;
 })().catch(e=>{job=null;throw e});
 return job;
}
function validateCustomer(bytes){
 if(!baseline||!allowed)return {ok:false,error:'ต้องโหลด XDF และ BIN ต้นฉบับก่อน'};
 if(!(bytes instanceof Uint8Array)||bytes.length!==N)return {ok:false,error:'BIN ต้องมี 49,152 bytes'};
 let changed=0;for(let i=0;i<N;i++)if(bytes[i]!==baseline[i]){
  changed++;if(!allowed.has(i))return {ok:false,error:'BIN เปลี่ยนนอกตารางที่ตรวจแล้ว: 0x'+i.toString(16).toUpperCase()};
 }
 return {ok:true,changed};
}
function axisVerified(tableId,which,actual,count){
 if(!defs||!['x','y'].includes(which)||!Number.isInteger(count))return false;
 const t=defs.tables.find(x=>x.xdfId===tableId),expected=t?.[which];
 return Boolean(expected&&actual&&Number.isInteger(expected.a)&&expected.n===count&&
  ['a','b','sg','le','st','eq','d','n','rpm'].every(k=>expected[k]===actual[k]));
}
function tableVerified(actual){
 if(!defs||!actual?.xdfId)return false;
 const expected=defs.tables.find(t=>t.xdfId===actual.xdfId);
 return Boolean(expected&&['a','r','c','rs','cs','b','sg','le','eq'].every(k=>expected[k]===actual[k]));
}
const api={modelId:ID,ensure,validateCustomer,axisVerified,tableVerified,isProtectedByte:offset=>!allowed?.has(offset),
 get switches(){return defs?.sw.length||0},
 get rpmTables(){return defs?.tables.filter(t=>t.g==='ตัดรอบ').length||0},
 get loaded(){return !!defs},get tables(){return defs?.tables.length||0},get allowedCount(){return allowed?.size||0},
 get sourceHash(){return SOURCE_HASH}};
Object.freeze(api);
window.__55MSX=api;
})();
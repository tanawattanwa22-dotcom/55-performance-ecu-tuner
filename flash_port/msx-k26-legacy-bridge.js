/* 55 PERFORMANCE - XDF definitions into the ORIGINAL TunePro-style editor.
 * Derived from the owner's exact 38770-K26-901_unlock.xdf / 48 KB BIN.
 * No alternate tuner UI, no ECU write or USB commands.
 */
(()=>{'use strict';
const ID='MSX-GEN1-K26-901',PART='38770-K26-901',N=49152;
const SOURCE_ROOT=new URL('flash_port/',document.baseURI);
const SOURCE_HASH='7fcd19352605a3197e9b9b498e32ecf7ab9147da318673a8f41a7c131f8fc785';
const LOCKED=new Set(['0X11B4','0X1EB','0X2863','0X3BD6','0X4193']);
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
  if(!linked||linked.cols!==1||linked.rows<count)throw Error('XDF linked axis '+a.link+' dimension mismatch in '+t.id);
  return {a:linked.addr,b:linked.bits,sg:false,le:linked.little,st:linked.step,d:linked.precision,eq:linked.rawEquation};
 }
 if(Array.isArray(a?.labels)){
  return {l:Array.from({length:count},(_,i)=>String(a.labels[i]??i+1))};
 }
 if(Number.isInteger(a?.address)){
  if(a.address+(count-1)*a.step+a.bits/8>N)throw Error('XDF axis outside BIN: '+t.id);
  return {a:a.address,b:a.bits,sg:false,le:a.little,st:a.step,d:1,
    eq:'X*'+a.formula[0]+(a.formula[1]>=0?'+':'')+a.formula[1]};
 }
 return {l:Array.from({length:count},(_,i)=>String(i+1))};
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
 const tables=meta.tables.map(t=>{
  let safe=!LOCKED.has(t.id);
  for(let r=0;r<t.rows&&safe;r++)for(let c=0;c<t.cols&&safe;c++){
   const at=t.addr+r*(t.cols*t.step+t.gap)+c*t.step;
   for(let i=0;i<t.bits/8;i++)if(!good.has(at+i))safe=false;
  }
  return {t:t.title,s:'MSX125 Gen1 '+PART+' · XDF '+t.id+' · 0x'+t.addr.toString(16).toUpperCase()+
    (safe?'':' · ป้องกันการแก้ไขข้อมูลซ้อน/รหัสกล่อง'),
   g:groups[t.cat]||'ข้อมูล XDF',a:t.addr,r:t.rows,c:t.cols,rs:t.cols*t.step+t.gap,cs:t.step,
   b:t.bits,sg:false,le:t.little,eq:t.rawEquation,d:t.precision,
   mn:t.min,mx:t.max,x:axis(t,'x',byId),y:axis(t,'y',byId),ro:!safe,u:'ค่าตาม XDF'};
 });
 return {tables,sw:[],allowed:good,sourceIds:ids,protectedCount:protectedBytes.size};
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
  DEFS[ID]={tables:built.tables,sw:[]};
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
const api={ensure,validateCustomer,isProtectedByte:offset=>!allowed?.has(offset),
 get loaded(){return !!defs},get tables(){return defs?.tables.length||0},get allowedCount(){return allowed?.size||0},
 get sourceHash(){return SOURCE_HASH}};
Object.freeze(api);
window.__55MSX=api;
})();
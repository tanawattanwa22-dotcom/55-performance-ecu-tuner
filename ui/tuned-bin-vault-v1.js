/* 55 PERFORMANCE — named local tuned-BIN vault (V1).
 * Files stay in origin-scoped IndexedDB. The UI exposes NO .bin export.
 * IMPORTANT: browser-local storage is not DRM or server-grade file secrecy.
 * Flash Engine still checks the ECU and BIN independently before any write.
 */
(function(root){
 'use strict';
 const DB='55_PERFORMANCE_TUNED_BIN_VAULT_V1',STORE='entries';
 const hasBytes=x=>x instanceof Uint8Array&&x.length>0&&x.length<=4*1024*1024;
 const cleanName=value=>String(value||'').trim().replace(/[\u0000-\u001f<>:"/\\|?*]/g,' ').replace(/\s+/g,' ').slice(0,64);
 const hash=async bytes=>{
  if(!root.crypto?.subtle)throw Error('Chrome ไม่รองรับ SHA-256 สำหรับคลัง BIN');
  const b=await root.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
 };
 let pending=null;
 function db(){
  if(pending)return pending;
  pending=new Promise((resolve,reject)=>{
   if(!root.indexedDB)return reject(Error('Chrome ไม่รองรับ IndexedDB'));
   const request=root.indexedDB.open(DB,1);
   request.onupgradeneeded=()=>{
    if(!request.result.objectStoreNames.contains(STORE))
     request.result.createObjectStore(STORE,{keyPath:'id'});
   };
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||Error('เปิดคลัง BIN ไม่สำเร็จ'));
   request.onblocked=()=>reject(Error('คลัง BIN ถูกล็อกโดยอีกแท็บ กรุณาปิดแท็บอื่น'));
  }).catch(e=>{pending=null;throw e});
  return pending;
 }
 async function transact(mode,operation){
  const database=await db();
  return new Promise((resolve,reject)=>{
   const tx=database.transaction(STORE,mode),table=tx.objectStore(STORE);
   let req,answer;
   try{req=operation(table)}catch(e){tx.abort();reject(e);return}
   req.onsuccess=()=>answer=req.result;
   req.onerror=()=>reject(req.error||Error('คลัง BIN อ่านหรือเขียนไม่ได้'));
   tx.oncomplete=()=>resolve(answer);
   tx.onabort=()=>reject(tx.error||Error('คลัง BIN ไม่สามารถบันทึกได้'));
   tx.onerror=()=>reject(tx.error||Error('คลัง BIN ไม่สามารถบันทึกได้'));
  });
 }
 function metadata(entry){
  if(!entry)return null;
  const {id,name,model,sourceName,filename,customerBin,checksumMode,size,sha256,createdAt}=entry;
  return {id,name,model,sourceName,filename,customerBin,checksumMode,size,sha256,createdAt};
 }
 async function save({name,model,sourceName,filename,customerBin=false,checksumMode,bytes}={}){
  const title=cleanName(name);
  if(!title)throw Error('ต้องตั้งชื่อไฟล์ก่อนบันทึก');
  if(!hasBytes(bytes))throw Error('BIN ไม่ถูกต้องหรือขนาดเกิน 4 MB');
  if(!model||!sourceName)throw Error('BIN ต้องมีรุ่นรถและต้นฉบับ');
  const recorded=Date.now();
  const key=root.crypto?.randomUUID?.()||'bin_'+recorded+'_'+Math.random().toString(36).slice(2);
  const clone=bytes.slice();
  const digest=await hash(clone);
  const record={
   id:key,name:title,model:String(model),sourceName:String(sourceName),
   filename:String(filename||model+'_'+title+'.bin'),
   customerBin:!!customerBin,checksumMode:String(checksumMode||'unknown'),
   size:clone.length,sha256:digest,createdAt:recorded,bytes:clone
  };
  await transact('readwrite',store=>store.put(record));
  return metadata(record);
 }
 async function list(){
  const rows=await transact('readonly',store=>store.getAll());
  return rows.map(metadata).sort((a,b)=>b.createdAt-a.createdAt);
 }
 async function load(id){
  if(typeof id!=='string'||!id)return null;
  const entry=await transact('readonly',store=>store.get(id));
  if(!entry)return null;
  const bytes=entry.bytes instanceof Uint8Array?entry.bytes:new Uint8Array(entry.bytes);
  if(!hasBytes(bytes)||bytes.length!==entry.size)throw Error('BIN ในคลังมีขนาดผิดปกติ');
  if(await hash(bytes)!==entry.sha256)throw Error('SHA-256 ของ BIN ในคลังไม่ตรง หยุดการอัด');
  return {...metadata(entry),bytes:bytes.slice()};
 }
 async function remove(id){
  if(typeof id!=='string'||!id)throw Error('ยังไม่ได้เลือกไฟล์');
  await transact('readwrite',store=>store.delete(id));
  return true;
 }
 root.__55TunedBinVault=Object.freeze({version:'1.0',save,list,load,remove,cleanName});
})(globalThis);

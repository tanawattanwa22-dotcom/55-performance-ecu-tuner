/*
 * 55 PERFORMANCE Main C# ECU ID database.
 * Reads data/ecu-catalog-290.json — 232 Keihin + 58 Shindengen IDs.
 * Source: Main.zip / FormMain.cs arrays. This module is lookup-only.
 * The last two Shindengen IDs have no matching part code in Main C#.
 */
let pending=null;
export async function loadCSharpCatalog(){
 if(pending)return pending;
 pending=(async()=>{
  const url=new URL('../data/ecu-catalog-290.json?v=302',import.meta.url);
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw Error('ECU catalog HTTP '+response.status);
  const db=await response.json();
  if(db?.counts?.total!==290||db.packedRowsCount!==288||!Array.isArray(db.additionalRows)||db.additionalRows.length!==2)
   throw Error('290 ECU catalog manifest invalid');
  if(typeof DecompressionStream==='undefined')throw Error('Chrome needs gzip DecompressionStream');
  const zipped=Uint8Array.from(atob(db.packedRowsGzipBase64),c=>c.charCodeAt(0));
  const stream=new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'));
  const packed=JSON.parse(await new Response(stream).text());
  if(!Array.isArray(packed)||packed.length!==db.packedRowsCount)throw Error('ECU catalog compressed rows mismatch');
  const rows=packed.concat(db.additionalRows);
  const m=new Map();let keihin=0,shindengen=0,missingPart=0;
  for(const row of rows){
   if(!Array.isArray(row)||row.length!==5)throw Error('Invalid ECU catalog row');
   const [id,rawPart,startText,checksumText,kind]=row;
   const ecuId=String(id||'').trim().toUpperCase();
   if(!/^[0-9A-F]{10}$/.test(ecuId)||m.has(ecuId))throw Error('Duplicate or invalid ECU ID: '+ecuId);
   if(kind!=='K'&&kind!=='S')throw Error('Invalid ECU family: '+ecuId);
   const hex=v=>v===null||v===''||v==='auto'?null:(/^[0-9A-F]+$/i.test(String(v))?parseInt(v,16):null);
   const family=kind==='K'?'KEIHIN':'SHINDENGEN';
   if(kind==='K')keihin++;else shindengen++;
   const part=typeof rawPart==='string'&&rawPart.trim()?rawPart.trim():null;
   if(!part)missingPart++;
   m.set(ecuId,Object.freeze({ecuId,part,family,startOffset:hex(startText),checksumOffset:hex(checksumText),
     startOffsetText:startText,checksumOffsetText:checksumText,
     complete:!!part&&(kind==='S'||(checksumText!==''&&startText!=='')),
     source:'Main.zip FormMain.cs SearchInProgram'}));
  }
  if(m.size!==290||keihin!==232||shindengen!==58||missingPart!==2)throw Error('ECU catalog 290/232/58 integrity failed');
  return m;
 })();
 pending.catch(()=>{pending=null});
 return pending;
}
export async function findCSharpEcuId(ecuId){
 return (await loadCSharpCatalog()).get(String(ecuId||'').trim().toUpperCase())||null;
}
export async function findByPartCode(part){
 const term=String(part||'').trim().toUpperCase();
 const rows=await loadCSharpCatalog();
 return term?[...rows.values()].filter(r=>r.part?.toUpperCase().includes(term)):[];
}

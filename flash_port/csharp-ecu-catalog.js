/*
 * Derived ECU ID metadata from the owner's purchased FormMain.cs catalog.
 * 232 Keihin + 56 Shindengen rows; last two Shindengen IDs had no associated
 * part-code entry in original C# and are deliberately excluded.
 * Map is source evidence, NOT proof of physical flash compatibility.
 */
const B64="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";
let pending=null;
export async function loadCSharpCatalog(){
 if(pending)return pending;
 pending=(async()=>{
  if(typeof DecompressionStream==='undefined')throw Error('Chrome needs gzip DecompressionStream');
  const zipped=Uint8Array.from(atob(B64),c=>c.charCodeAt(0));
  const stream=new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'));
  const rows=JSON.parse(await new Response(stream).text());
  if(rows.length!==288)throw Error('Catalog row count mismatch');
  const m=new Map();
  for(const row of rows){
    const [ecuId,part,offsetText,checksumText,kind]=row;
    if(!/^[0-9A-F]{10}$/.test(ecuId)||m.has(ecuId))throw Error('Invalid or duplicate source ECU ID');
    const hex=s=>s==='auto'?null:(/^[0-9A-F]+$/i.test(s)?parseInt(s,16):null);
    m.set(ecuId,{ecuId,part,startOffset:hex(offsetText),checksumOffset:hex(checksumText),
      family:kind==='K'?'KEIHIN':'SHINDENGEN',source:'FormMain.cs static SearchInProgram'});
  }
  return m;
 })();
 return pending;
}
export async function findCSharpEcuId(ecuId){
 return (await loadCSharpCatalog()).get(String(ecuId||'').toUpperCase())||null;
}
export async function findByPartCode(part){
 const term=String(part||'').toUpperCase();
 const rows=await loadCSharpCatalog();
 return [...rows.values()].filter(r=>r.part.toUpperCase().includes(term));
}

/*
 * Original FormMain.SetEcmParamsFromDb searches embedded ECU catalog first,
 * then ecuData.dat. Chrome has no permanent access to a user's local file,
 * so store only its imported metadata after an explicit file selection.
 * This is a PART/NAME/OFFSET reference, never a family or flash authorization.
 */
const KEY='55_performance_main_dat_reference_v1';
const MAX_ROWS=12000;
let cache=null;
const safe=s=>String(s??'').trim();
function normalize(row){
 const ecuId=safe(row.ecuId).toUpperCase();
 if(!/^[0-9A-F]{10}$/.test(ecuId))throw Error('Invalid DAT ECU ID');
 const rawHex=value=>typeof value==='number'&&Number.isInteger(value)&&value>=0?
  value.toString(16).toUpperCase():safe(value);
 const fields={ecuId,part:safe(row.part),model:safe(row.model),
  rawStartOffset:rawHex(row.rawStartOffset??row.startOffset),
  rawChecksumOffset:rawHex(row.rawChecksumOffset??row.checksumOffset),
  sizeText:safe(row.sizeText),typeText:safe(row.typeText)};
 if(Object.values(fields).some(v=>v.length>320))throw Error('DAT text too long');
 const parse=s=>/^[0-9A-F]+$/i.test(s)?parseInt(s,16):null;
 return Object.freeze({...fields,startOffset:parse(fields.rawStartOffset),
  checksumOffset:parse(fields.rawChecksumOffset),
  family:/shind/i.test(fields.typeText)?'SHINDENGEN':
    /keihin/i.test(fields.typeText)?'KEIHIN':'UNVERIFIED',
  source:'USER_IMPORTED_MAIN_ECU_DATA_DAT_REFERENCE'});
}
function parseStored(){
 if(cache)return cache;
 let data=null;
 try{data=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}
 if(!data||!Array.isArray(data.rows)||data.rows.length>MAX_ROWS)return cache={file:'',rows:[]};
 try{
  return cache={file:safe(data.file),rows:data.rows.map(normalize)};
 }catch{return cache={file:'',rows:[]}}
}
export function readMainDatReference(){
 const data=parseStored();
 return {filename:data.file,rows:data.rows.slice(),count:data.rows.length};
}
export function lookupMainDatReference(ecuId){
 const id=safe(ecuId).toUpperCase();
 if(!/^[0-9A-F]{10}$/.test(id))return null;
 const hits=parseStored().rows.filter(r=>r.ecuId===id);
 return hits.length===1?hits[0]:null; // duplicates never choose silently
}
export function saveMainDatReference(rows,filename='ecuData.dat'){
 if(!Array.isArray(rows)||rows.length>MAX_ROWS)throw Error('DAT row count exceeds supported limit');
 const normalized=rows.map(normalize);
 const ids=new Set();
 for(const row of normalized){
  if(ids.has(row.ecuId))throw Error('Duplicate ECU ID in DAT: '+row.ecuId);
  ids.add(row.ecuId);
 }
 const data={version:1,file:safe(filename).slice(0,120),rows:normalized};
 const encoded=JSON.stringify(data);
 if(encoded.length>2_500_000)throw Error('DAT metadata exceeds browser storage allowance');
 try{localStorage.setItem(KEY,encoded)}
 catch(e){throw Error('Cannot save DAT reference on this browser: '+String(e?.message||e))}
 cache={file:data.file,rows:normalized};
 return {filename:cache.file,count:normalized.length};
}

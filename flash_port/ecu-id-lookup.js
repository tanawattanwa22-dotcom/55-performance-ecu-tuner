/**
 * 55 PERFORMANCE — automatic ECM ID -> part-code/model lookup after REAL ECU reply.
 * Pure lookup is display-only. NEVER use KTR image metadata to authorize ERASE/WRITE.
 * Sources: owner-provided KTR table (local + optional read-only Supabase) and
 * independently the purchased C# FormMain.cs 288-entry ECU catalog.
 */
import {KTR_ECM_ROWS} from '../ktr/ecm-catalog.js';
import {findCSharpEcuId} from './csharp-ecu-catalog.js';

const ID_RE=/^[0-9A-F]{10}$/;
const PART_RE=/^[A-Z0-9]+-[A-Z0-9]+$/;
export function normalizeEcmId(id){
  const value=String(id??'').replace(/[\s-]/g,'').toUpperCase();
  if(!ID_RE.test(value))throw Error('ECM ID ต้องเป็น HEX 10 หลักที่อ่านจาก ECU จริง');
  return value;
}
export function parseEcmIdReply(raw){
  const bytes=Uint8Array.from(raw??[]);
  // Extract the first valid Honda 02-length-status response. Ignore serial
  // echo/prefix and reject trailing/noisy incomplete frames.
  for(let i=0;i+11<=bytes.length;i++){
    if(bytes[i]!==0x02)continue;
    const len=bytes[i+1];
    if(len<11||i+len>bytes.length)continue;
    const frame=bytes.subarray(i,i+len);
    if((frame.reduce((sum,v)=>sum+v,0)&255)!==0)continue;
    if(frame[3]!==0)continue; // Status must be the normal successful response.
    // C# FormMain.cs WorkerThread reads five bytes from response[5..9].
    const id=Array.from(frame.subarray(5,10),x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
    if(ID_RE.test(id))return id;
  }
  return null;
}
const suffix=s=>String(s||'').toUpperCase().replace(/^[0-9]{5}-/,'');
function normalizeRow(item){
  const id=String(item.ecuId??item.ecu_id??'').toUpperCase();
  const part=String(item.partCode??item.part_code??'').toUpperCase();
  const family=String(item.family??'').toUpperCase();
  const size=Number(item.sizeKB??item.bin_size_kb);
  const model=String(item.model??'').trim();
  if(!ID_RE.test(id)||!PART_RE.test(part)||!['KEIHIN','SHINDENGEN'].includes(family)||
     ![48,56,64,96,128,256,384,768].includes(size)||!model)return null;
  return Object.freeze({
    ecuId:id,partCode:part,model,family,sizeKB:size,
    reviewRequired:Boolean(item.reviewRequired??item.needs_review),
    referenceId:item.referenceId??item.reference_id??null,
    source:'KTR_IMAGE_2026_11_02'
  });
}
export function localKtrCandidates(ecuId,rows=KTR_ECM_ROWS){
  const id=normalizeEcmId(ecuId);
  return rows.map(normalizeRow).filter(x=>x?.ecuId===id);
}
export function combineEcmSources(ecuId,{ktrRows=[],csharp=null,remoteUsed=false}={}){
  const id=normalizeEcmId(ecuId);
  const map=new Map();
  for(const source of ktrRows){
    const r=normalizeRow(source);
    if(!r||r.ecuId!==id)continue;
    const key=r.partCode+'|'+r.model+'|'+r.family+'|'+r.sizeKB;
    const prior=map.get(key);
    map.set(key,prior?{...prior,reviewRequired:prior.reviewRequired||r.reviewRequired}:r);
  }
  const candidates=[...map.values()];
  const parts=[...new Set(candidates.map(x=>x.partCode))];
  const families=[...new Set(candidates.map(x=>x.family))];
  const matchedCSharp=!!csharp&&csharp.ecuId===id&&!!csharp.part;
  const csharpPart=matchedCSharp?suffix(csharp.part):null;
  const conflict=matchedCSharp&&parts.length>0&&!parts.includes(csharpPart);
  const ambiguous=parts.length>1||families.length>1;
  const showPart=matchedCSharp?csharpPart:parts.length===1?parts[0]:null;
  const modelNames=[...new Set(candidates.filter(x=>x.partCode===showPart).map(x=>x.model))];
  const model=modelNames.length===1?modelNames[0]:null;
  const family=matchedCSharp?csharp.family:families.length===1?families[0]:null;
  const sizeMatches=candidates.filter(x=>x.partCode===showPart);
  const sizes=[...new Set(sizeMatches.map(x=>x.sizeKB))];
  return Object.freeze({
    ecuId:id,partCode:showPart,model,models:[...new Set(candidates.map(x=>x.model))],
    family,sizeKB:sizes.length===1?sizes[0]:null,
    candidates,ktrMatched:candidates.length>0,csharpMatched:matchedCSharp,
    csharpPart:matchedCSharp?csharp.part:null,
    source:matchedCSharp?(candidates.length?'C# + 55 Performance':'C# FormMain.cs'):(candidates.length?'55 Performance • ฐานข้อมูล ECM':'NOT_FOUND'),
    ambiguous,conflict,needsReview:candidates.some(x=>x.reviewRequired),
    remoteUsed,flashApproved:false,
    status:conflict?'CONFLICT':ambiguous?'AMBIGUOUS':showPart?'MATCHED':'UNKNOWN'
  });
}
async function fetchSupabaseRows(id,timeoutMs=2200){
  const cfg=globalThis.LICENSE_CONFIG;
  if(!cfg?.url||!cfg?.anonKey||typeof fetch!=='function')return null;
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const url=cfg.url.replace(/\/$/,'')+
      '/rest/v1/ecu_ktr_reference?select=reference_id,model,ecu_id,part_code,family,bin_size_kb,needs_review'+
      '&ecu_id=eq.'+id+'&limit=100';
    const res=await fetch(url,{headers:{apikey:cfg.anonKey},signal:ctrl.signal,cache:'no-store'});
    if(!res.ok)throw Error('KTR Supabase HTTP '+res.status);
    const data=await res.json();
    if(!Array.isArray(data))throw Error('Invalid KTR server response');
    return data;
  }catch{return null}
  finally{clearTimeout(timer)}
}
export async function lookupEcmId(ecuId,{useSupabase=true}={}){
  const id=normalizeEcmId(ecuId);
  const local=localKtrCandidates(id);
  const [server,csharp]=await Promise.all([
    useSupabase?fetchSupabaseRows(id):Promise.resolve(null),
    findCSharpEcuId(id).catch(()=>null)
  ]);
  // Never drop bundled KTR rows if the server only returns partial data.
  const all=Array.isArray(server)?[...local,...server]:local;
  return combineEcmSources(id,{ktrRows:all,csharp,remoteUsed:Array.isArray(server)});
}

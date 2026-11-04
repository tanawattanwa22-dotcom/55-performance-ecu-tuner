/* 55 PERFORMANCE — local read-only ECU observations.
 * Main.zip is the canonical 290-ID catalog. This cache only changes the ORDER
 * of non-destructive probes when the same physical ECU ID is read again.
 * No BIN, offsets, DTC, flash count, seed, writes, or old ECU identity is cached.
 */
const KEY='55_performance_ecu_readonly_profiles_v1';
const ID=/^[0-9A-F]{10}$/;
const GROUPS=[7,4,1];
const FAMILIES=['KEIHIN','SHINDENGEN'];
const MAX_ENTRIES=120;
const cleanId=id=>String(id||'').trim().toUpperCase();
function read(){
 try{
  const raw=globalThis.localStorage?.getItem(KEY);
  if(!raw)return {};
  const parsed=JSON.parse(raw);
  return parsed?.version===1&&parsed.profiles&&typeof parsed.profiles==='object'&&!Array.isArray(parsed.profiles)?parsed.profiles:{};
 }catch{return {}}
}
export function getReadOnlyObservation(ecuId){
 const id=cleanId(ecuId);
 if(!ID.test(id)||/^(?:0{10}|F{10})$/.test(id))return null;
 const row=read()[id];
 if(!row||typeof row!=='object')return null;
 const group=GROUPS.includes(row.liveGroup)?row.liveGroup:null;
 const family=FAMILIES.includes(row.family)?row.family:null;
 return group||family?{ecuId:id,liveGroup:group,family,observedAt:typeof row.observedAt==='string'?row.observedAt:null,source:'SAME_DEVICE_READ_ONLY_ACK'}:null;
}
export function preferredLiveScanOrder(ecuId,order=GROUPS){
 const fallback=[...new Set(order.filter(n=>GROUPS.includes(n)))];
 const known=getReadOnlyObservation(ecuId)?.liveGroup;
 return known&&fallback.includes(known)?[known,...fallback.filter(n=>n!==known)]:fallback;
}
export function rememberReadOnlyObservation({ecuId,liveGroup=null,family=null}={}){
 const id=cleanId(ecuId);
 if(!ID.test(id)||/^(?:0{10}|F{10})$/.test(id))return false;
 const validGroup=GROUPS.includes(liveGroup)?liveGroup:null;
 const validFamily=FAMILIES.includes(family)?family:null;
 if(!validGroup&&!validFamily)return false;
 try{
  const profiles=read(),previous=profiles[id]||{};
  profiles[id]={liveGroup:validGroup||(GROUPS.includes(previous.liveGroup)?previous.liveGroup:null),
   family:validFamily||(FAMILIES.includes(previous.family)?previous.family:null),observedAt:new Date().toISOString()};
  const sorted=Object.entries(profiles).filter(([key,value])=>ID.test(key)&&value&&typeof value==='object')
   .sort((a,b)=>String(b[1].observedAt||'').localeCompare(String(a[1].observedAt||'')))
   .slice(0,MAX_ENTRIES);
  globalThis.localStorage?.setItem(KEY,JSON.stringify({version:1,profiles:Object.fromEntries(sorted)}));
  return true;
 }catch{return false}
}
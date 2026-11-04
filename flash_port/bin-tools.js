/**
 * 55 PERFORMANCE — BIN file helpers ported from Main/FormMain.cs
 *   findEcmIdInBin  <- SearchEcmIdInBinFile / FindPatternInBin
 *   readBinId       <- SearchBinFileForPattern + SearchPattern*KB (table driven)
 *   lockRead        <- lockRead48Kb64KbToolStripMenuItem_Click
 *   lockMode        <- lockMode48Kb64KbToolStripMenuItem_Click
 * All functions are PURE: they never mutate the input Uint8Array. Patch functions
 * return {bytes, undo, ...}; call revertPatch(bytes, undo) to restore.
 * After any patch, Keihin/Shindengen checksum must be recomputed before flashing
 * (the existing flash engine does that on a copy at write time).
 */
import {BIN_ID_TABLE} from './bin-id-table.js';
import {applyMainLockRead,applyMainLockMode} from './main-source-bin-locks.js?v=2';

const hex=(u8,sep=' ')=>Array.from(u8,x=>x.toString(16).padStart(2,'0')).join(sep).toUpperCase();
const eq=(bin,off,pat)=>pat.every((v,i)=>bin[off+i]===v);

/* ---- ECM ID inside BIN: first 3 bytes (6 hex chars) of the typed ECM ID ---- */
export function findPattern(bin,pattern){
  for(let i=0;i<=bin.length-pattern.length;i++) if(eq(bin,i,pattern)) return i;
  return -1;
}
export function findEcmIdInBin(bin,ecmIdHex){
  if(!/^[0-9A-Fa-f]{6,}$/.test(ecmIdHex)) return {ok:false,error:'Invalid ECM ID format'};
  const head=ecmIdHex.slice(0,6);
  const pat=[0,2,4].map(i=>parseInt(head.slice(i,i+2),16));
  const index=findPattern(bin,pat);
  return index>=0?{ok:true,index,found:hex(bin.subarray(index,index+3),'')}:{ok:false,error:'ECM ID not found in BIN'};
}

/* ---- BIN ID by file size ---- */
export function readBinId(bin){
  const rows=BIN_ID_TABLE[bin.length];
  if(!rows) return {ok:false,id:'-',reason:'Unsupported BIN size '+bin.length};
  for(const r of rows){
    if(bin.length<r.minLen||bin.length<r.idOff+r.len) continue;
    if(eq(bin,r.chkOff,r.chk)) return {ok:true,id:hex(bin.subarray(r.readFrom,r.readFrom+r.len),''),at:r.readFrom};
  }
  return {ok:false,id:'',reason:'No matching pattern for '+(bin.length/1024)+' KB'};
}

/* ---- FormMain.cs Lock Read/Lock Mode, all source patterns in order ---- */
export function revertPatch(bin,undo){
 const out=Uint8Array.from(bin);
 // Restoration in reverse order protects the original values when source
 // scan patterns overlap. Source writes only to the loaded BIN.
 for(let i=undo.length-1;i>=0;i--){
  const [pos,val]=undo[i];
  out[pos]=val;
 }
 return out;
}
function lockResult(bin,func,label){
 try{
  const result=func(bin);
  if(!result.found)return {ok:false,error:result.message};
  return {ok:true,bytes:result.bin,
   undo:result.history.map(p=>[p.index,p.previous]),
   hits:result.history.length/(label==='read'?3:5),
   source:result.source};
 }catch(e){return {ok:false,error:String(e?.message||e)}}
}
export function lockRead(bin){return lockResult(bin,applyMainLockRead,'read')}
export function lockMode(bin){return lockResult(bin,applyMainLockMode,'mode')}

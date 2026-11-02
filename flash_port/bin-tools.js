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
    if(eq(bin,r.chkOff,r.chk)) return {ok:true,id:hex(bin.subarray(r.readFrom,r.readFrom+r.len)),at:r.readFrom};
  }
  return {ok:false,id:'',reason:'No matching pattern for '+(bin.length/1024)+' KB'};
}

/* ---- Patches (48 KB / 64 KB only) ---- */
const SIZE_OK=n=>n===49152||n===65536;
export function revertPatch(bin,undo){
  const out=Uint8Array.from(bin);
  for(const [pos,val] of undo) out[pos]=val;
  return out;
}
function applyPairs(bin,pairs,firstOnly){
  const out=Uint8Array.from(bin),undo=[];
  let hits=0;
  for(const [search,replace] of pairs){
    for(let i=0;i<=out.length-search.length;i++){
      if(!eq(out,i,search)) continue;
      hits++;
      for(let k=0;k<replace.length;k++){undo.push([i+k,out[i+k]]);out[i+k]=replace[k];}
      if(firstOnly) return {bytes:out,undo,hits};
    }
  }
  return {bytes:out,undo,hits};
}

/** "Lock Read": first "Arn" -> "Brn" (41 72 6E -> 42 72 6E). */
export function lockRead(bin){
  if(!bin?.length) return {ok:false,error:'Load a BIN first'};
  if(!SIZE_OK(bin.length)) return {ok:false,error:'BIN must be 48 KB or 64 KB'};
  const r=applyPairs(bin,[[[0x41,0x72,0x6E],[0x42,0x72,0x6E]]],true);
  return r.hits?{ok:true,...r}:{ok:false,error:'Cannot lock read (pattern not found)'};
}

// pairs copied 1:1 from the C# lists (search -> replace)
const P48=[
 [[163,3,16,32,0],[131,3,0,32,0]],[[163,3,16,32,3],[130,3,0,32,0]],[[163,75,0,81,0],[163,75,0,81,0]],
 [[179,33,16,40,0],[146,33,0,40,0]],[[242,33,16,107,0],[146,33,0,40,0]],
 [[35,75,0,85,0],[3,75,16,85,0]],[[99,75,0,85,0],[3,75,16,85,0]],
];
const P64=[
 [[163,3,16,32,16],[131,3,0,32,0]],[[163,3,16,32,0],[131,3,18,32,0]],[[163,32,16,32,16],[131,2,18,32,18]],
 [[163,0,16,32,16],[131,0,0,32,0]],[[131,3,16,32,16],[131,3,18,32,18]],[[179,3,16,32,0],[147,3,18,32,0]],
];
/** "Lock Mode": replaces every occurrence of each pattern pair. */
export function lockMode(bin){
  if(!bin?.length) return {ok:false,error:'Load a BIN first'};
  if(!SIZE_OK(bin.length)) return {ok:false,error:'BIN must be 48 KB or 64 KB'};
  const r=applyPairs(bin,bin.length===49152?P48:P64,false);
  return r.hits?{ok:true,...r}:{ok:false,error:'Cannot lock mode (pattern not found)'};
}

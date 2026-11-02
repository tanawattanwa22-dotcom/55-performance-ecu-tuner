/** Honda Main BIN file tools. Operate on copies; never access ECU. */
import {BIN_ID_TABLE} from './bin-id-table.js';
const eq=(b,o,p)=>o>=0&&o+p.length<=b.length&&p.every((n,i)=>b[o+i]===n);
const hex=b=>Array.from(b,v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
export function findPattern(b,p){for(let i=0;i<=b.length-p.length;i++)if(eq(b,i,p))return i;return -1}
export function findEcmIdInBin(b,id){
 if(!/^[0-9A-F]{6,}$/i.test(id))return {ok:false,error:'Invalid ECM ID'};
 const x=id.slice(0,6).match(/../g).map(v=>parseInt(v,16)),index=findPattern(b,x);
 return index<0?{ok:false,error:'Not found'}:{ok:true,index,found:hex(b.slice(index,index+3))};
}
export function readBinId(b){const list=BIN_ID_TABLE[b.length];if(!list)return {ok:false,reason:'Unsupported BIN size'};
 for(const r of list){if(b.length>=r.minLen&&r.readFrom+r.len<=b.length&&eq(b,r.chkOff,r.chk))
 return {ok:true,id:hex(b.slice(r.readFrom,r.readFrom+r.len)),at:r.readFrom};}
 return {ok:false,reason:'Pattern not found'};
}
const sizeOk=b=>b?.length===49152||b?.length===65536;
export function revertPatch(b,undo){const o=b.slice();for(const [i,v] of undo)o[i]=v;return o}
function applyPairs(b,pairs,first){const out=b.slice(),undo=[];let hits=0;
 for(const [search,repl] of pairs)for(let i=0;i<=out.length-search.length;i++){
  if(!eq(out,i,search))continue;hits++;for(let k=0;k<repl.length;k++){undo.push([i+k,out[i+k]]);out[i+k]=repl[k]}
  if(first)return {bytes:out,undo,hits};
 }return {bytes:out,undo,hits}
}
export function lockRead(b){if(!sizeOk(b))return {ok:false,error:'Only 48/64KB BIN'};
 const r=applyPairs(b,[[[65,114,110],[66,114,110]]],true);return r.hits?{ok:true,...r}:{ok:false,error:'Pattern not found'}}
const p48=[
 [[163,3,16,32,0],[131,3,0,32,0]],[[163,3,16,32,3],[130,3,0,32,0]],[[163,75,0,81,0],[163,75,0,81,0]],
 [[179,33,16,40,0],[146,33,0,40,0]],[[242,33,16,107,0],[146,33,0,40,0]],
 [[35,75,0,85,0],[3,75,16,85,0]],[[99,75,0,85,0],[3,75,16,85,0]]];
const p64=[
 [[163,3,16,32,16],[131,3,0,32,0]],[[163,3,16,32,0],[131,3,18,32,0]],[[163,32,16,32,16],[131,2,18,32,18]],
 [[163,0,16,32,16],[131,0,0,32,0]],[[131,3,16,32,16],[131,3,18,32,18]],[[179,3,16,32,0],[147,3,18,32,0]]];
export function lockMode(b){if(!sizeOk(b))return {ok:false,error:'Only 48/64KB BIN'};
 const r=applyPairs(b,b.length===49152?p48:p64,false);return r.hits?{ok:true,...r}:{ok:false,error:'Pattern not found'}}

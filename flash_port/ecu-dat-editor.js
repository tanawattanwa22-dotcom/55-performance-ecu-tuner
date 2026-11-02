// Port of purchased PartID_ECU.cs: edit and save .NET BinaryWriter ecuData.dat.
// File-format only. Imported rows are never trusted for flash authorization.
import {parseEcuDat} from './ecu-dat.js';
export const FIELDS=['ecuId','part','model','startOffset','checksumOffset','sizeText','typeText'];
const safeString=s=>String(s??'').trim();
const hex=n=>Number.isInteger(n)&&n>=0?n.toString(16).toUpperCase():safeString(n);
export function cleanRow(row){
 const r={ecuId:safeString(row.ecuId).toUpperCase(),
  part:safeString(row.part),model:safeString(row.model),
  startOffset:hex(row.startOffset),checksumOffset:hex(row.checksumOffset),
  sizeText:safeString(row.sizeText),typeText:safeString(row.typeText)};
 if(!/^[0-9A-F]{10}$/.test(r.ecuId))throw Error('ECU ID must be 10 HEX digits');
 for(const k of FIELDS)if(!r[k]||r[k].length>300)throw Error('Missing or overly long field: '+k);
 for(const k of ['startOffset','checksumOffset'])
  if(!/^[0-9A-F]{1,8}$/i.test(r[k]))throw Error('Invalid hex: '+k);
 return r;
}
export function normalizeRows(rows){
 if(!Array.isArray(rows)||rows.length>100000)throw Error('Invalid database size');
 const ids=new Set();
 return rows.map(row=>{
  const r=cleanRow(row);
  if(ids.has(r.ecuId))throw Error('Duplicate ECU ID: '+r.ecuId);
  ids.add(r.ecuId);return r;
 });
}
function netString(s){
 const bytes=new TextEncoder().encode(s);let n=bytes.length;
 const prefix=[];
 do{const b=n&127;n>>>=7;prefix.push(b|(n?128:0));}while(n);
 return [...prefix,...bytes];
}
export function writeEcuDat(rows){
 const clean=normalizeRows(rows);
 const data=clean.flatMap(row=>FIELDS.flatMap(k=>netString(row[k])));
 const out=new Uint8Array(4+data.length);
 new DataView(out.buffer).setInt32(0,clean.length,true);
 out.set(data,4);return out;
}
export function readEcuDat(data){return normalizeRows(parseEcuDat(data));}
export function upsertRow(rows,row,oldId=null){
 const normalized=normalizeRows(rows),next=cleanRow(row),id=oldId?oldId.toUpperCase():null;
 if(id&&!normalized.some(r=>r.ecuId===id))throw Error('Original ECU row missing');
 if(normalized.some(r=>r.ecuId===next.ecuId&&r.ecuId!==id))throw Error('Duplicate ECU ID');
 return normalizeRows(id?normalized.map(r=>r.ecuId===id?next:r):[...normalized,next]);
}
export function removeRow(rows,id){
 const next=normalizeRows(rows).filter(r=>r.ecuId!==String(id).toUpperCase());
 if(next.length===rows.length)throw Error('ECU ID not found');return next;
}

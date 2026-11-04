/* Only XDF-verified axes may be written. This does not alter ECU flashing. */
(function(root){
 'use strict';
 function source(model,provider){
  return Boolean(model?.xdf===true&&model.id&&provider?.loaded===true&&
   provider.modelId===model.id&&typeof provider.axisVerified==='function'&&
   typeof provider.tableVerified==='function'&&typeof provider.isProtectedByte==='function');
 }
 function axisProven(model,table,key,provider){
  if(!source(model,provider)||!table?.xdfId)return false;
  const a=table[key],count=key==='x'?table.c:table.r;
  return Boolean(a&&Number.isInteger(a.a)&&[8,16].includes(a.b)&&
   Number.isInteger(a.st)&&a.st>=a.b/8&&Number.isInteger(count)&&count>0&&
   provider.axisVerified(table.xdfId,key,a,count));
 }
 function hasAxisByte(a,count,offset){
  if(!a||!Number.isInteger(a.a)||!Number.isInteger(a.st)||
   ![8,16].includes(a.b)||!Number.isInteger(count)||count<=0)return false;
  for(let i=0;i<count;i++){
   const pos=a.a+i*a.st;
   if(offset>=pos&&offset<pos+a.b/8)return true;
  }
  return false;
 }
 function hasAxisTableByte(t,offset){
  if(t?.g!=='แกน'||!Number.isInteger(t.a)||![8,16].includes(t.b)||
   !Number.isInteger(t.rs)||!Number.isInteger(t.cs)||
   !Number.isInteger(t.r)||!Number.isInteger(t.c))return false;
  for(let r=0;r<t.r;r++)for(let c=0;c<t.c;c++){
   const at=t.a+r*t.rs+c*t.cs;
   if(offset>=at&&offset<at+t.b/8)return true;
  }
  return false;
 }
 function validateChanges(model,tables,changes,provider){
  if(!Array.isArray(tables)||!Array.isArray(changes))
   return {ok:false,reason:'ไม่มีข้อมูลตารางสำหรับตรวจแกน'};
  for(const entry of changes){
   const offset=entry?.[0];
   if(!Number.isInteger(offset)||offset<0)return {ok:false,reason:'Offset ไม่ถูกต้อง'};
   for(const t of tables){
    if(hasAxisTableByte(t,offset)&&
      !(source(model,provider)&&provider.tableVerified(t)&&!provider.isProtectedByte(offset)))
     return {ok:false,reason:'ตารางแกน '+String(t.t||'')+' ไม่มี XDF ยืนยันตำแหน่งเขียน'};
    for(const key of ['x','y']){
     if(hasAxisByte(t?.[key],key==='x'?t.c:t.r,offset)&&
       !(axisProven(model,t,key,provider)&&!provider.isProtectedByte(offset)))
      return {ok:false,reason:'แกน '+key.toUpperCase()+' ของ '+String(t.t||'')+' ไม่มี XDF ยืนยันตำแหน่งเขียน'};
    }
   }
  }
  return {ok:true};
 }
 root.__55XdfAxisGuard=Object.freeze({source,axisProven,validateChanges});
})(globalThis);

import {FIELDS,readEcuDat,writeEcuDat,upsertRow,removeRow,normalizeRows} from './ecu-dat-editor.js';
const $=id=>document.getElementById(id);
let rows=[],selected=null,importedName='';
const status=msg=>{$('status').textContent=msg};
const clearForm=()=>{selected=null;$('editor').reset();$('delete').disabled=true;$('formTitle').textContent='เพิ่มรายการ ECU';render()};
function formData(){const f=new FormData($('editor'));return Object.fromEntries(FIELDS.map(k=>[k,String(f.get(k)||'')]))}
function showRow(row){
 selected=row.ecuId;
 for(const k of FIELDS)$('editor').elements.namedItem(k).value=String(row[k]??'');
 $('delete').disabled=false;$('formTitle').textContent='แก้ไข ECU '+selected;
 $('editor').scrollIntoView({behavior:'smooth',block:'start'});render();
}
function render(){
 const term=$('search').value.trim().toUpperCase(),filtered=rows.filter(r=>
  [r.ecuId,r.part,r.model,r.typeText].some(v=>String(v).toUpperCase().includes(term)));
 $('summary').textContent=rows.length+' รายการ · แสดง '+filtered.length+' รายการ · '+(importedName||'ยังไม่ได้เปิดไฟล์');
 const list=$('list');list.replaceChildren();
 for(const r of filtered.slice(0,150)){
  const div=document.createElement('div');div.className='item'+(r.ecuId===selected?' active':'');
  const title=document.createElement('strong');title.textContent=r.ecuId+' · '+r.part;
  const subtitle=document.createElement('div');subtitle.textContent=r.model+' | '+r.sizeText+' | '+r.typeText;
  div.append(title,subtitle);div.onclick=()=>showRow(r);list.append(div);
 }
 if(filtered.length>150){
  const p=document.createElement('p');p.className='muted';p.textContent='แสดง 150 รายการแรก โปรดพิมพ์เพื่อค้นหา';
  list.append(p);
 }
}
$('import').onclick=()=>$('file').click();
$('file').onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>15e6)throw Error('ไฟล์ใหญ่เกิน 15 MB');
  const parsed=readEcuDat(await file.arrayBuffer());
  rows=parsed;importedName=file.name;clearForm();
  status('นำเข้าฐาน Windows DAT '+rows.length+' รายการ สำเร็จ (ทำงานในเครื่อง)');
 }catch(err){status('นำเข้าไม่สำเร็จ: '+err.message)}
 finally{e.target.value=''}
};
$('search').oninput=render;
$('new').onclick=()=>{clearForm();$('editor').scrollIntoView({behavior:'smooth'})};
$('reset').onclick=clearForm;
$('clear').onclick=()=>{
 if(!rows.length)return;
 if(!confirm('ล้างรายการในหน้านี้ '+rows.length+' รายการ? ไฟล์เดิมบนเครื่องจะไม่ถูกลบ'))return;
 rows=[];importedName='ฐานใหม่';clearForm();status('ล้างรายการในหน้านี้แล้ว');
};
$('editor').onsubmit=e=>{
 e.preventDefault();
 try{
  rows=upsertRow(rows,formData(),selected);
  const id=formData().ecuId.toUpperCase();selected=id;render();
  status('บันทึก '+id+' ในหน้านี้แล้ว · กด บันทึก ecuData.dat เพื่อดาวน์โหลดไฟล์ Windows');
 }catch(err){status('บันทึกไม่สำเร็จ: '+err.message)}
};
$('delete').onclick=()=>{
 if(!selected||!confirm('ลบ ECU ID '+selected+' ?'))return;
 try{rows=removeRow(rows,selected);clearForm();status('ลบรายการแล้ว · ดาวน์โหลด DAT เพื่อเก็บการเปลี่ยนแปลง')}
 catch(err){status(err.message)}
};
$('export').onclick=()=>{
 try{
  const data=writeEcuDat(normalizeRows(rows));
  const url=URL.createObjectURL(new Blob([data],{type:'application/octet-stream'}));
  const a=document.createElement('a');a.href=url;a.download='ecuData.dat';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  status('ส่งออก ecuData.dat '+rows.length+' รายการสำเร็จ · ไฟล์ใช้รูปแบบ .NET BinaryWriter เดิม');
 }catch(err){status('ส่งออกไม่สำเร็จ: '+err.message)}
};
render();
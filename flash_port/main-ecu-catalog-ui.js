import {loadCSharpCatalog} from './csharp-ecu-catalog.js?v=302';
const $=id=>document.getElementById(id);
let rows=[],page=0;const PER=40;
const hx=(n,txt)=>Number.isInteger(n)?'0x'+n.toString(16).toUpperCase().padStart(4,'0'):txt==='auto'?'AUTO':'ไม่ระบุ';
const td=(row,value)=>{const el=document.createElement('td');el.textContent=String(value??'ไม่ระบุ');row.append(el)};
function draw(){
 const q=$('search').value.trim().toUpperCase(),f=$('family').value;
 const found=rows.filter(r=>(!f||r.family===f)&&(!q||[r.ecuId,r.part,r.family].some(v=>String(v||'').toUpperCase().includes(q))));
 const maxPage=Math.max(1,Math.ceil(found.length/PER));page=Math.min(page,maxPage-1);
 const host=$('rows');host.replaceChildren();
 const table=document.createElement('table');
 const head=document.createElement('tr');
 for(const label of ['ECU ID','Part Code','Family','Start Offset','Checksum Offset']){const th=document.createElement('th');th.textContent=label;head.append(th)}
 table.append(head);
 for(const r of found.slice(page*PER,(page+1)*PER)){
  const tr=document.createElement('tr');
  [r.ecuId,r.part||'ไม่ระบุ',r.family,hx(r.startOffset,r.startOffsetText),hx(r.checksumOffset,r.checksumOffsetText)]
    .forEach(v=>td(tr,v));table.append(tr);
 }
 host.append(table);
 $('page').textContent=(page+1)+' / '+maxPage;
 $('prev').disabled=page===0;$('next').disabled=page>=maxPage-1;
 $('status').textContent='ทั้งหมด '+rows.length+' ECU ID · ผลค้นหา '+found.length+' รายการ · Keihin 232 / Shindengen 58';
}
$('search').oninput=()=>{page=0;draw()};
$('family').onchange=()=>{page=0;draw()};
$('clear').onclick=()=>{$('search').value='';$('family').value='';page=0;draw()};
$('prev').onclick=()=>{page=Math.max(0,page-1);draw()};
$('next').onclick=()=>{page++;draw()};
try{
 const map=await loadCSharpCatalog();rows=[...map.values()];
 rows.sort((a,b)=>a.family.localeCompare(b.family)||a.ecuId.localeCompare(b.ecuId));
 draw();
}catch(e){$('status').textContent='โหลดฐาน ECU ไม่สำเร็จ: '+(e?.message||e)}

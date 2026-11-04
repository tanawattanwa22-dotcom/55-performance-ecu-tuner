import {auditMainBin} from './main-bin-audit.js?v=5';
const $=id=>document.getElementById(id);
let file=null,output=null;
const message=s=>{$('message').textContent=s};
const draw=out=>{
 const lines=[
 'ไฟล์: '+out.fileName,
 'ขนาด: '+out.sourceFileSize+' ('+out.size.toLocaleString('en-US')+' bytes)',
 'ขนาดที่โปรแกรม Main C# มีตัวค้นหา: '+(out.supportedSourceSize?'รองรับ':'ไม่มี SearchPattern สำหรับขนาดนี้'),
 'BIN Signature: '+(out.type.type||'UNDETERMINED'),
 'ผลอ่าน BIN ID ตามหน้าต่าง Main: '+out.sourceBinIdText,
 'Sum8Bit: 0x'+out.sums.sum8.toString(16).toUpperCase().padStart(2,'0'),
 'Sum32Bit (LE): 0x'+out.sums.sum32.toString(16).toUpperCase().padStart(8,'0'),
 'Honda checksum if used as packet: 0x'+out.sums.checksum8Honda.toString(16).toUpperCase().padStart(2,'0'),
 ...(out.requestedEcuId?['ECU ที่ระบุ: '+out.requestedEcuId,
  'ฐาน Main C#: '+(out.requestedCatalog?.part||'ไม่พบ Part Code'),
  'เทียบ prefix 3 bytes: '+(out.prefix?.found?'พบที่ 0x'+out.prefix.offset.toString(16).toUpperCase():'ไม่พบ')]:[])
 ];
 $('summary').textContent=lines.join('\n');
 const rows=out.scannedIds;
 const host=$('matched');host.replaceChildren();
 if(!rows.length){const p=document.createElement('p');p.className='muted';p.textContent='ไม่พบรหัส BIN ตามเงื่อนไขที่โปรแกรมต้นฉบับใช้';host.append(p);return}
 const table=document.createElement('table'),h=document.createElement('tr');
 for(const t of ['รหัสใน BIN','ออฟเซ็ต','Part Code / ข้อจำกัด']){const e=document.createElement('th');e.textContent=t;h.append(e)}
 table.append(h);
 for(const row of rows){
  const tr=document.createElement('tr');
  const values=[row.id,'0x'+row.idOffset.toString(16).toUpperCase(),
   row.fullId?(row.catalog?.part||'ไม่พบในฐาน 290'):'มีเพียง 3 ไบต์ · ไม่ใช่ ECU ID เต็ม'];
  for(const val of values){const td=document.createElement('td');td.textContent=val;tr.append(td)}
  table.append(tr);
 }
 host.append(table);
};
$('bin').onchange=()=>{
 file=$('bin').files?.[0]||null;output=null;
 $('analyze').disabled=!file;$('export').disabled=true;
 $('summary').textContent='ยังไม่ได้ตรวจ';$('matched').replaceChildren();$('result').textContent='—';
 message(file?'เลือก '+file.name+' ('+file.size.toLocaleString()+' bytes)':'เลือกไฟล์เพื่อเริ่ม');
};
$('analyze').onclick=async()=>{
 if(!file)return;
 $('analyze').disabled=true;$('export').disabled=true;message('กำลังอ่าน BIN และค้นข้อมูลจาก Main C#…');
 try{
  if(file.size>16*1024*1024)throw Error('รองรับ BIN สูงสุด 16 MB ในหน้านี้');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const ecu=$('ecu').value.replace(/\s+/g,'').toUpperCase();
  output=await auditMainBin(bytes,{fileName:file.name,claimedEcuId:ecu});
  draw(output);$('result').textContent=JSON.stringify(output,null,2);
  $('export').disabled=false;message('ตรวจเสร็จแล้ว (เฉพาะการอ่านไฟล์ ไม่ได้ตรวจกล่อง ECU จริง)');
 }catch(e){message('ตรวจไม่สำเร็จ: '+(e?.message||String(e)));$('result').textContent=String(e?.stack||e)}
 finally{$('analyze').disabled=!file}
};
$('export').onclick=()=>{
 if(!output)return;
 const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);
 a.download='55-main-bin-audit-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
};

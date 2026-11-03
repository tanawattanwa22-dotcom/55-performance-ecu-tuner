/**
 * Display-only ECM identification based on a validated, physically read Honda ID.
 * DOM textContent exclusively: metadata cannot inject HTML. Never selects a BIN.
 */
function node(tag,text,style){
 const e=document.createElement(tag);
 if(text!==undefined)e.textContent=String(text);
 if(style)e.style.cssText=style;
 return e;
}
export function ecmIdentificationLines(r){
 if(!r||!/^[0-9A-F]{10}$/.test(r.ecuId||''))throw Error('Valid physical ECU ID required');
 const lines=[
  ['ECM ID ที่อ่านได้',r.ecuId],
  ['Part Code',r.conflict?'ข้อมูลขัดแย้ง — กรุณาตรวจฉลาก ECU':(r.partCode||'ไม่พบรหัสในตาราง')],
  ['รุ่นรถ',r.conflict||r.ambiguous?'ต้องเลือกจากข้อมูลที่ตรงกันก่อน':(r.model||'ไม่มีชื่อรุ่นในฐานข้อมูล 55 Performance')],
  ['ชนิด ECU',r.family||'ยังไม่ยืนยัน'],
  ['ขนาด BIN อ้างอิง',r.sizeKB?r.sizeKB+' KB':'ไม่มีข้อมูลยืนยัน'],
  ['แหล่งข้อมูล',r.source]
 ];
 return lines;
}
function status(r){
 if(r.conflict)return 'พบข้อมูลขัดแย้งระหว่าง C# กับฐานข้อมูล 55 Performance — ตรวจกล่องจริงก่อน';
 if(r.ambiguous)return 'หนึ่ง ECM ID พบหลาย Part Code — ห้ามเลือกอัตโนมัติ';
 if(!r.partCode)return 'ECU ตอบกลับแล้ว แต่ยังไม่พบรหัสนี้ในฐานที่อ่านได้';
 if(r.needsReview)return 'พบในฐานข้อมูล 55 Performance แต่ข้อมูลต้นฉบับบางส่วนต้องตรวจซ้ำ';
 return 'จับคู่รหัส ECM ID กับ Part Code ได้จากฐานอ้างอิง';
}
export function renderEcmIdentification(element,result){
 if(!element)return;
 element.replaceChildren();
 const title=node('div','ตรวจพบ ECU: '+(result.partCode||'ไม่ทราบ Part Code'),
  'font-size:18px;font-weight:800;color:#fff;margin-bottom:9px');
 element.append(title);
 for(const [label,value] of ecmIdentificationLines(result)){
  const row=node('div',null,'display:flex;gap:10px;flex-wrap:wrap;margin:5px 0;line-height:1.4');
  row.append(node('span',label,'color:#a9beda;min-width:92px'),
             node('strong',value,'overflow-wrap:anywhere;color:#fff'));
  element.append(row);
 }
 const msg=node('div',status(result),
  'margin-top:10px;padding:9px;border-radius:9px;background:#304052;color:#f9dfb8;font-size:12px');
 element.append(msg);
 if(result.candidates.length>1){
  const more=node('div','รายการจากฐานข้อมูล 55 Performance: '+result.candidates.map(x=>x.partCode+' / '+x.model).join(' • '),
   'color:#ffdca9;font-size:12px;margin-top:7px;overflow-wrap:anywhere');
  element.append(more);
 }
 element.append(node('div','อ้างอิงเท่านั้น: ไม่ใช่การยืนยันว่ามี BIN/XDF หรือรองรับการแฟลช',
 'font-size:11px;color:#b7bfd0;margin-top:8px'));
 element.hidden=false;
}
export function showEcmPopup(result){
 if(typeof document==='undefined')return;
 document.getElementById('ecm-detection-dialog')?.remove();
 const dlg=node('dialog',null,
  'box-sizing:border-box;width:min(94vw,460px);max-height:86vh;overflow:auto;'+
  'padding:21px;border:1px solid #9569ca;border-radius:17px;'+
  'color:#f5efff;background:#172039;box-shadow:0 18px 85px #000c;'+
  'font:14px/1.48 system-ui;position:fixed;z-index:2147483647');
 dlg.id='ecm-detection-dialog';
 const title=node('div','55 PERFORMANCE • พบข้อมูล ECU',
  'font-size:13px;color:#d5b5ff;font-weight:750;margin-bottom:8px');
 const summary=node('div');
 renderEcmIdentification(summary,result);
 const actions=node('div',null,'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px');
 const openCatalog=node('a','เปิดฐานข้อมูล ECM • 55 Performance',
  'color:#e8c8ff;padding:10px 12px;border:1px solid #7e73a8;border-radius:9px;text-decoration:none;font-weight:600');
 openCatalog.href=new URL('../ecm/index.html?q='+encodeURIComponent(result.ecuId),import.meta.url).href;
 openCatalog.target='_blank';openCatalog.rel='noopener';
 const close=node('button','รับทราบ / ปิด',
  'color:white;background:#8946b2;border:0;border-radius:9px;padding:10px 15px;font:650 14px system-ui;min-height:44px');
 close.addEventListener('click',()=>dlg.close());
 actions.append(openCatalog,close);
 dlg.append(title,summary,actions);
 dlg.addEventListener('close',()=>dlg.remove(),{once:true});
 document.body.append(dlg);
 if(typeof dlg.showModal==='function')dlg.showModal();
 else{dlg.open=true;dlg.style.display='block'}
}

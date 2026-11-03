/* 55 PERFORMANCE V35 — integrated Recovery stage in the main neon application.
 * One shared FT232R owner; no iframe, separate tab, demo transport or auto erase.
 * Automatic inspection is read-only. Recovery writes require verified boot,
 * BIN-family count ACK, a strict plan, and explicit Recovery-specific approval.
 */
(()=>{'use strict';
 const OWNER='RECOVERY_NATIVE';
 let host=null,ui={},port=null,engine=null,identity=null,plan=null,bin=null;
 let busy=false,writing=false,postCheck=false,phase='IDLE',events=[],lastFailure='',startedAt=0;
 const el=(tag,cls='',txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
 const button=(label,fn,cls='btn')=>{const b=el('button',cls,label);b.type='button';b.onclick=fn;return b};
 const isOpen=()=>!!host?.isConnected&&document.getElementById('home')?.dataset.neonPage==='recovery';
 const fmt=n=>Number.isInteger(n)?'0x'+n.toString(16).toUpperCase().padStart(8,'0'):'—';
 const note=(txt,bad=false)=>{
   if(ui.status){ui.status.textContent=txt;ui.status.style.borderColor=bad?'#e8a36d':'#2a718d';}
 };
 const log=(txt)=>{
   events.push(new Date().toLocaleTimeString('th-TH',{hour12:false})+' '+txt);
   if(events.length>350)events.splice(0,80);
   if(ui.log){ui.log.textContent=events.slice(-80).join('\n');ui.log.scrollTop=ui.log.scrollHeight;}
 };
 const field=(box,label)=>{
   const row=el('div','n24-info-line');
   row.append(el('span','',label));const value=el('strong','','—');row.append(value);box.append(row);return value;
 };
 function sharedPort(){return window.__55SharedEcu}
 function release(){
   if(port){try{sharedPort()?.release(OWNER)}catch(_){}}
   port=null;engine=null;plan=null;postCheck=false;
 }
 function update(){
   if(!host||!host.isConnected)return;
   const boot=!!identity?.ecuId?.endsWith('0000');
   ui.ecu.textContent=identity?.ecuId||'ยังไม่ได้อ่านจาก ECU';
   ui.session.textContent=identity?.handshake||'—';
   ui.family.textContent=identity?.recoveryFamilyVerified?identity.family:boot?'Boot ID • รอยืนยัน Family':identity?.family||'—';
   ui.count.textContent=Number.isInteger(identity?.count)?identity.count+' ครั้ง':'ยังไม่ได้ยืนยัน';
   ui.fileState.textContent=bin?bin.name+' • '+(bin.data.length/1024).toFixed(0)+' KB':'ยังไม่ได้เลือก BIN';
   ui.part.textContent=identity?.sourcePart||'—';
   ui.start.textContent=plan?fmt(plan.startOffset):'ต้องมี Recovery Plan ก่อน';
   ui.checksum.textContent=plan?fmt(plan.checksumOffset):'ต้องมี Recovery Plan ก่อน';
   ui.profile.textContent=plan?.profile||'—';
   ui.phase.textContent=phase;
   ui.scan.disabled=busy;
   ui.prepare.disabled=busy||!bin||!boot;
   ui.write.disabled=busy||!plan||!port?.ready||!identity?.recoveryFamilyVerified||
     !ui.backup.checked||!ui.power.checked||!ui.tools.checked||
     ui.typed.value.trim().toUpperCase()!=='FLASH '+identity.ecuId;
   ui.post.disabled=busy||!postCheck||!port?.ready;
   ui.cancel.disabled=busy||!plan;
   ui.upload.disabled=busy;
   ui.error.textContent=lastFailure||'';
   ui.error.hidden=!lastFailure;
   ui.hardware.textContent=plan?'Recovery ตรวจ BIN/Count/Offset แล้ว • ต้องยืนยันอุปกรณ์จริงก่อนกู้':'การตรวจ Boot ID ไม่ยืนยันไฟเลี้ยงหรือสภาพภายใน ECU';
 }
 function close(){
   if(busy)return false;
   release();
   host=null;ui={};identity=null;bin=null;events=[];
   return true;
 }
 async function scan(){
   if(busy||!isOpen())return;
   if(document.getElementById('licenseGate'))return note('กรุณาเข้าสู่ระบบ License ก่อนอ่าน ECU',true);
   if(!sharedPort()?.port?.ready)return note('ยังไม่เชื่อม FT232R จากหน้าแรก • กลับไปเปิดสายก่อน',true);
   release();identity=null;lastFailure='';phase='READ ONLY • ECU ID';busy=true;update();
   note('กำลังตรวจ FT232R → ECU ID → Normal/Diagnostic/Recovery Boot อัตโนมัติ');
   try{
     const shared=sharedPort();
     port=await shared.acquire(OWNER);
     if(!port?.ready)throw Error('สาย FT232R ไม่พร้อม หรือถูกใช้งานโดยเมนูอื่น');
     const {HondaFlashEngine}=await import(new URL('flash_port/honda-write-engine.js?v=321',document.baseURI).href);
     engine=new HondaFlashEngine(port,e=>log(e.phase+' '+JSON.stringify(e)));
     identity=await engine.identify({programmingPreflight:true});
     log('READ ECU_ID '+identity.ecuId+' SESSION '+identity.handshake);
     if(identity.ecuId.endsWith('0000')){
       phase='RECOVERY_BOOT_DETECTED';
       note('พบ Recovery Boot ID '+identity.ecuId+' • ยังไม่ได้ยืนยัน Family\nเลือก BIN สำรองที่ตรงกับกล่องเพื่อให้ตรวจ Flash Count และสร้างแผนกู้');
     }else{
       phase='NOT_RECOVERY';
       note('ECU ตอบ '+identity.ecuId+' ในโหมด '+identity.handshake+
        '\nยังไม่พบ Boot ID ที่รองรับ • กล่องที่ตอบปกติควรใช้หน้า Flash ปกติ ไม่ส่ง ERASE/WRITE Recovery');
     }
   }catch(e){phase='SCAN_STOPPED';lastFailure=e.message;note('ตรวจ Recovery ไม่สำเร็จ: '+e.message+'\nยังไม่ส่ง ERASE/WRITE',true);log('SCAN STOP '+e.message)}
   finally{
     if(port){sharedPort()?.release(OWNER);port=null;engine=null;}
     if(!sharedPort()?.port?.ready)await sharedPort()?.restoreCable?.().catch(()=>{});
     busy=false;update();
     if(identity?.ecuId?.endsWith('0000')&&bin&&isOpen())void prepare();
   }
 }
 async function prepare(){
   if(busy||!isOpen())return;
   if(!bin)return note('เลือกไฟล์ BIN สำรองที่ตรงกับ ECU ก่อน',true);
   if(!identity?.ecuId?.endsWith('0000'))return note('ยังไม่พบ Recovery Boot ID จริง • ไม่สร้างแผนเขียน',true);
   if(!sharedPort()?.port?.ready)return note('ต้องเชื่อม FT232R จากหน้าแรกก่อน',true);
   lastFailure='';busy=true;phase='VERIFY RECOVERY FAMILY';release();update();
   try{
     port=await sharedPort().acquire(OWNER);
     const {HondaFlashEngine}=await import(new URL('flash_port/honda-write-engine.js?v=321',document.baseURI).href);
     engine=new HondaFlashEngine(port,e=>{
       log(e.phase+' '+JSON.stringify(e));
       if(e.phase==='WRITE_PROGRESS'&&ui.progress)ui.progress.textContent=String(e.percent||0)+'% • WRITE ACK';
     });
     identity=await engine.identify({programmingPreflight:true});
     if(!identity.ecuId.endsWith('0000'))throw Error('ECU เปลี่ยนเป็น Normal/Diagnostic หรือไม่พบ Boot ID • หยุด Recovery');
     if(identity.handshake==='DIAGNOSTIC_ONLY')throw Error('ได้ Diagnostic Session เท่านั้น • ไม่อนุญาต Recovery');
     identity=await engine.confirmRecoveryFamily(bin.data);
     const start=parseHex(ui.manualStart.value),checksum=parseHex(ui.manualChecksum.value);
     plan=engine.makePlan(bin.data.slice(),{
       filename:bin.name,recovery:true,fast:false,
       startOffsetOverride:start,checksumOffsetOverride:checksum
     });
     phase='PLAN_READY';startedAt=Date.now();
     log('RECOVERY PLAN '+JSON.stringify({ecuId:plan.ecuId,family:identity.family,start:fmt(plan.startOffset),checksum:fmt(plan.checksumOffset),profile:plan.profile,bytes:plan.size,blocks:plan.expectedBlockCount}));
     note('ตรวจ Recovery ผ่าน: Boot ID '+identity.ecuId+' / '+identity.family+
      ' / Flash Count ACK '+identity.count+'\nStart '+fmt(plan.startOffset)+' · Checksum '+fmt(plan.checksumOffset)+
      '\nยังไม่ส่ง ERASE/WRITE • ตรวจไฟเลี้ยง/สำรอง BIN และยืนยันก่อนกู้');
   }catch(e){
     phase='PLAN_STOPPED';lastFailure=e.message;
     note('หยุดเตรียม Recovery: '+e.message+'\nยังไม่เริ่ม ERASE/WRITE',true);
     log('RECOVERY PLAN STOP '+e.message);
     release();
   }finally{
     busy=false;update();
     if(!plan&&!sharedPort()?.port?.ready)await sharedPort()?.restoreCable?.().catch(()=>{});
   }
 }
 function parseHex(value){
   const t=value.trim().replace(/^0x/i,'');
   if(!t)return null;
   if(!/^[0-9a-f]+$/i.test(t))throw Error('Offset ต้องเป็นตัวเลขฐาน 16 (HEX)');
   return Number.parseInt(t,16);
 }
 async function write(){
   if(busy||!plan||!port?.ready||!identity?.recoveryFamilyVerified)return;
   const checks=ui.backup.checked&&ui.power.checked&&ui.tools.checked;
   const typed=ui.typed.value.trim().toUpperCase();
   if(!checks||typed!=='FLASH '+identity.ecuId)return note('Recovery ต้องยืนยันสำรอง BIN, ไฟเลี้ยง, เครื่องมือกู้ และ ECU ID ให้ครบ',true);
   if(!confirm('กู้คืน ECU '+identity.ecuId+' ('+identity.family+')\nBIN: '+plan.filename+
      '\nStart: '+fmt(plan.startOffset)+'\n\nยืนยัน ERASE/WRITE จริงกับกล่องที่ต่อสายอยู่หรือไม่?'))return;
   busy=true;writing=true;phase='RECOVERY_WRITING';lastFailure='';update();
   log('USER CONFIRMED REAL RECOVERY ERASE/WRITE');
   let wake=null;
   try{
     if(navigator.wakeLock?.request)wake=await navigator.wakeLock.request('screen').catch(()=>null);
     const outcome=await engine.flash(plan,{confirmation:typed,physicalBackupConfirmed:ui.backup.checked,
       externalPowerConfirmed:ui.power.checked,recoveryReady:ui.tools.checked});
     phase='SOURCE_FINAL_ACK_NOT_READBACK';
     postCheck=true;
     note('ECU ตอบ Final ACK แล้ว • ยังไม่ใช่การอ่าน BIN กลับ\nปิดกุญแจ OFF → เปิด ON แล้วกดตรวจ ECU หลังรีสตาร์ต');
     log('RECOVERY SOURCE FINAL ACK '+JSON.stringify(outcome));
   }catch(e){
     phase='RECOVERY_FLASH_FAILED';lastFailure=e.message;
     note('Recovery หยุด: '+e.message+'\nห้ามสันนิษฐานว่า ECU ยังใช้งานได้ และห้ามเขียนซ้ำโดยไม่ตรวจโหมดก่อน',true);
     log('RECOVERY FLASH STOP '+e.message);
     try{sessionStorage.setItem('55_flash_recovery_hint',JSON.stringify({at:Date.now(),ecuId:identity?.ecuId,error:e.message,eraseMayHaveStarted:true}))}catch(_){}
     postCheck=false;release();
   }finally{
     if(wake)try{await wake.release()}catch(_){}
     busy=false;writing=false;update();
   }
 }
 async function post(){
   if(!postCheck||busy||!engine||!port?.ready)return;
   if(!confirm('ปิดกุญแจ OFF และเปิด ON อีกครั้งแล้วใช่ไหม? จะตรวจ ECU ID ไม่ใช่อ่าน BIN กลับ'))return;
   busy=true;phase='POST_RESTART_CHECK';update();
   try{
     const result=await engine.postFlashCheck();
     phase='POST_RESTART_ID_OK';
     log('POST_RESTART '+JSON.stringify(result));
     note('อ่าน ECU ID หลัง Recovery ได้ '+result.ecuId+' • ไม่ใช่ Full Readback Verify');
     release();
   }catch(e){phase='POST_RESTART_FAILED';lastFailure=e.message;note('ตรวจหลังรีสตาร์ตไม่ผ่าน: '+e.message,true);release();}
   finally{busy=false;update();}
 }
 function mount(stage){
   if(!close())return false;
   host=stage;host.classList.add('n24-preflight-stage');host.replaceChildren();startedAt=0;lastFailure='';
   const intro=el('section','n24-panel n24-ecu');
   const title=el('div','n24-panel-title');title.append(el('span','n24-panel-icon','⟳'),el('b','','Recovery / กู้ ECU ในแอปหลัก'));intro.append(title);
   intro.append(el('p','n24-help','ตรวจ FT232R และ ECU ID อัตโนมัติเมื่อเข้าเมนู • ไม่เปิดหน้า Flash Lab ใหม่ • ไม่ ERASE/WRITE ระหว่างตรวจ'));
   ui.status=el('div','n24-state','กำลังตรวจสถานะสาย FT232R...');ui.status.setAttribute('role','status');intro.append(ui.status);
   ui.scan=button('⟳ ตรวจ ECU ID / โหมดอีกครั้ง',scan,'n24-btn n24-read');
   ui.scan.style.width='100%';ui.scan.style.marginTop='10px';intro.append(ui.scan);host.append(intro);
   const data=el('section','n24-panel n24-map');
   const dt=el('div','n24-panel-title');dt.append(el('span','n24-panel-icon','▣'),el('b','','ผลตรวจ ECU จากกล่องจริง'));data.append(dt);
   ui.ecu=field(data,'ECU ID');ui.session=field(data,'Session / Boot');ui.family=field(data,'ECU Family');ui.count=field(data,'Flash Count');ui.part=field(data,'Part Code');host.append(data);
   const section=el('section','n24-panel n24-bin');
   const bt=el('div','n24-panel-title');bt.append(el('span','n24-panel-icon','▧'),el('b','','เลือก BIN สำรองสำหรับกู้'));section.append(bt);
   ui.upload=el('input','n24-file-input');ui.upload.type='file';ui.upload.accept='.bin,.rom,application/octet-stream';
   ui.upload.setAttribute('aria-label','เลือกไฟล์ BIN สำรองสำหรับ Recovery');section.append(ui.upload);
   ui.upload.onchange=async()=>{
     if(busy)return;
     const file=ui.upload.files?.[0];if(!file)return;
     try{
       const valid=new Set([32768,49152,57344,65536,98304,131072,262144,393216,524288,786432,1048576]);
       if(!valid.has(file.size))throw Error('ขนาดไฟล์ไม่ใช่ขนาด BIN ที่ Main C# รองรับ');
       const data=new Uint8Array(await file.arrayBuffer());
       bin={name:file.name,data};
       release();lastFailure='';phase='BIN_SELECTED';
       log('RECOVERY BIN CHOSEN '+file.name+' '+data.length+' bytes');
       note('เลือก BIN สำรองแล้ว • ระบบจะตรวจ Boot/Family/Flash Count/Offset ก่อนสร้างแผน Recovery');
       update();
       if(identity?.ecuId?.endsWith('0000'))await prepare();
     }catch(e){bin=null;lastFailure=e.message;note('อ่าน BIN ไม่สำเร็จ: '+e.message,true);update()}
   };
   ui.fileState=el('p','n24-upload-status','ยังไม่ได้เลือก BIN');section.append(ui.fileState);
   const advanced=el('details','n24-advanced');advanced.append(el('summary','','Offset HEX ขั้นสูง • ใช้เมื่อมีค่าที่ตรวจสอบจากต้นฉบับเท่านั้น'));
   for(const [key,label] of [['manualStart','Start Offset (HEX)'],['manualChecksum','Checksum Offset (HEX)']]){
     const l=el('label','',label);l.style.display='block';l.style.margin='9px 0 5px';
     const inp=el('input');inp.type='text';inp.placeholder='ปล่อยว่าง = คำนวณอัตโนมัติ';inp.style.cssText='width:100%;box-sizing:border-box;padding:11px;border-radius:10px;background:#0b1d35;color:#fff;border:1px solid #456d91';
     ui[key]=inp;advanced.append(l,inp);
   }
   section.append(advanced);
   ui.prepare=button('▱ ตรวจ BIN / Family / Offset อัตโนมัติ',prepare,'n24-btn n24-verify');
   ui.prepare.style.width='100%';section.append(ui.prepare);host.append(section);
   const map=el('section','n24-panel n24-map');
   const mt=el('div','n24-panel-title');mt.append(el('span','n24-panel-icon','▱'),el('b','','Recovery Memory Map'));map.append(mt);
   ui.start=field(map,'Start Offset');ui.checksum=field(map,'Checksum Offset');ui.profile=field(map,'Write Profile');ui.phase=field(map,'สถานะ');
   host.append(map);
   const gate=el('section','n24-panel n24-check');
   const gt=el('div','n24-panel-title');gt.append(el('span','n24-panel-icon','✓'),el('b','','ยืนยันก่อน Recovery ERASE / WRITE'));gate.append(gt);
   ui.hardware=el('p','n24-help');gate.append(ui.hardware);
   for(const [key,label] of [
     ['backup','มี BIN สำรองที่ถูกต้องของ ECU คันนี้เก็บไว้แล้ว'],
     ['power','ตรวจไฟเลี้ยงและวงจร K-Line จริงแล้ว'],
     ['tools','เตรียมอุปกรณ์และขั้นตอนกู้คืนไว้แล้ว']
   ]){
     const wrap=el('label','');wrap.style.cssText='display:flex;gap:8px;align-items:center;padding:8px 0;color:#dceaff;font-size:13px';
     const cb=el('input');cb.type='checkbox';cb.style.cssText='width:21px;height:21px;accent-color:#32e3cd';
     ui[key]=cb;cb.onchange=update;wrap.append(cb,document.createTextNode(label));gate.append(wrap);
   }
   const c=el('label','','พิมพ์ FLASH ตามด้วย ECU ID ที่ตรวจพบ');c.style.display='block';c.style.margin='10px 0 5px';gate.append(c);
   ui.typed=el('input');ui.typed.type='text';ui.typed.autocomplete='off';ui.typed.spellcheck=false;
   ui.typed.placeholder='FLASH + ECU ID';ui.typed.style.cssText='width:100%;box-sizing:border-box;padding:12px;border-radius:10px;background:#071a2d;color:#fff;border:1px solid #4a708c';
   ui.typed.oninput=update;gate.append(ui.typed);
   ui.write=button('⟳ ERASE / WRITE • Recovery ECU',write,'n24-btn n24-flash');
   ui.write.style.cssText='width:100%;margin-top:12px';gate.append(ui.write);
   ui.post=button('✓ ตรวจ ECU หลังรีสตาร์ต',post,'n24-btn n24-read');
   ui.post.style.cssText='width:100%;margin-top:9px';gate.append(ui.post);
   ui.cancel=button('ยกเลิกแผนก่อนเขียน',()=>{release();phase='PLAN_CANCELLED';note('ยกเลิกแผนแล้ว • ไม่ส่ง ERASE/WRITE');update()},'n24-btn');
   ui.cancel.style.cssText='width:100%;margin-top:9px';gate.append(ui.cancel);
   host.append(gate);
   ui.error=el('div','n24-warning');ui.error.hidden=true;host.append(ui.error);
   const logs=el('details','n24-advanced');logs.append(el('summary','','TX/RX และสถานะ Recovery'));
   ui.log=el('pre');ui.log.style.cssText='max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#071728;color:#9ef4e5;padding:12px;border-radius:10px;font-size:11px';
   logs.append(ui.log);host.append(logs);
   host.append(el('p','n24-help','การตรวจจับ Recovery อัตโนมัติเป็นแบบอ่านอย่างเดียว • กล่องต้องตอบ Boot/Session และ Flash Count ตามตระกูลจึงจะสร้างแผน • ACK หลังเขียนไม่ใช่ Full Readback Verify'));
   const prior=window.__55RecoverySuggested;
   if(prior)note('ตรวจพบเหตุจาก Flash: '+(prior.detail||prior.kind)+'\nกำลังอ่าน ECU ID จากกล่องจริงอีกครั้ง');
   else note('เข้า Recovery แล้ว • จะตรวจ ECU ID/Boot Mode อัตโนมัติเมื่อสาย FT232R เชื่อมอยู่');
   update();
   if(sharedPort()?.port?.ready)void scan();
   else note('ยังไม่เปิด FT232R • กลับหน้าหลักเพื่อเชื่อมสายก่อน แล้วเข้า Recovery อีกครั้ง',true);
   return true;
 }
 window.__55RecoveryNative={mount,close,isBusy:()=>busy||writing,inspect:scan};
})();

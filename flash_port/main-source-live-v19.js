import {MAIN_CAPTURE_COMMANDS,decodeMainDiagnosticTrace} from './main-source-diagnostic.js';
import {Ft232rWebUsb} from './ftdi-webusb.js';
import {HondaFlashEngine} from './honda-write-engine.js';

const $=id=>document.getElementById(id);
const STATE={port:null,busy:false,running:false,connected:false,records:[],history:new Map(),latest:null,trace:null,ecuId:null,cycle:0,generation:0,stopRequested:false,group:1};
const MAX_HISTORY=120;
const date=()=>new Date().toLocaleTimeString('th-TH',{hour12:false});
const writeLog=s=>{
 const el=$('log');el.textContent+='['+date()+'] '+s+'\n';
 if(el.textContent.length>40000)el.textContent=el.textContent.slice(-30000);
 el.scrollTop=el.scrollHeight;
};
const notice=s=>$('notice').textContent=s;
const bad=s=>{writeLog('หยุด: '+s);notice(s)};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
const selected=()=>Number($('group').value);
const fmt=(n,k=1)=>typeof n==='number'?(Number.isInteger(n)?String(n):n.toFixed(k)):String(n);
const download=(data,type,filename)=>{
 const url=URL.createObjectURL(new Blob([data],{type}));
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2500);
};
function refreshControls(){
 const on=STATE.connected,working=STATE.running||STATE.busy;
 $('connection').textContent=STATE.running?'LIVE':on?'ECU CONNECTED':'OFFLINE';
 $('connection').className='badge'+(STATE.running?' on':on?' on':'');
 $('connect').disabled=working;
 $('start').disabled=!on||working;
 $('stop').disabled=!STATE.running;
 $('group').disabled=working||on;
 $('ecuId').textContent=STATE.ecuId||'—';
 $('cycles').textContent=STATE.cycle;
}
function getMetrics(values){
 const result=new Map();
 for(const v of values){const key=v.name,value=v.value;if(typeof value==='number'&&Number.isFinite(value)){
  const old=STATE.history.get(key)||[];
  old.push(value);while(old.length>MAX_HISTORY)old.shift();
  STATE.history.set(key,old);
 }
 result.set(key,v);}
 return result;
}
function renderMetrics(values){
 const metrics=getMetrics(values);
 STATE.latest=metrics;
 const picks=['RPM','Throttle TPS','Injection','Ignition','Battery','ECT','IAT','MAP','A/F'];
 const ordered=[...picks.filter(name=>metrics.has(name)).map(name=>metrics.get(name)),...values.filter(v=>!picks.includes(v.name))];
 const tiles=$('tiles');tiles.replaceChildren();
 for(const v of ordered.slice(0,9)){
  const card=document.createElement('div');card.className='value'+(v.name==='A/F'?' main-af':'');
  if(v.name==='A/F')card.title='A/F คำนวณด้วยสูตรใน FM_diag.cs (กลุ่ม 1/4) ไม่ใช่การรับรองว่า ECU มีเซนเซอร์ Wideband';
  const name=document.createElement('div');name.className='name';name.textContent=v.name;
  const number=document.createElement('div');number.className='big';number.textContent=fmt(v.value);
  const unit=document.createElement('div');unit.className='unit';unit.textContent=v.unit||'สถานะ';
  const range=document.createElement('div');range.className='range';
  const h=STATE.history.get(v.name);range.textContent=h?.length?'MIN '+fmt(Math.min(...h))+' · MAX '+fmt(Math.max(...h)):'—';
  card.append(name,number,unit,range);tiles.append(card);
 }
 const rows=$('rows');rows.replaceChildren();
 for(const v of values){
  const box=document.createElement('div');box.className='row';
  const n=document.createElement('span');n.textContent=v.name;
  const x=document.createElement('b');x.textContent=fmt(v.value)+' '+v.unit;
  box.append(n,x);rows.append(box);
 }
 const options=$('series');const current=options.value;options.replaceChildren();
 for(const v of values.filter(v=>typeof v.value==='number')){
  const op=document.createElement('option');op.value=v.name;op.textContent=v.name;options.append(op);
 }
 if(metrics.has(current)&&STATE.history.has(current))options.value=current;
 $('dataBadge').textContent='C# GROUP '+STATE.group+' · '+values.length+' ค่า';
 $('dataBadge').title=STATE.group===7?'C# Group 7 ไม่มีฟิลด์ A/F':'A/F คำนวณจากไบต์ ECU จริงตาม FM_diag.cs; ไม่ยืนยันเป็นเซนเซอร์ Wideband';
 $('dataBadge').className='badge on';
 $('updated').textContent=date();
 drawChart();
}
function chartNumberHistory(){return STATE.history.get($('series').value)||[]}
function drawChart(){
 const c=$('chart');const dpr=Math.min(2,window.devicePixelRatio||1);
 const width=Math.max(240,c.clientWidth||320),height=Math.max(180,c.clientHeight||220);
 c.width=Math.round(width*dpr);c.height=Math.round(height*dpr);
 const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.clearRect(0,0,width,height);
 const h=chartNumberHistory();
 const label=$('series').value, latest=STATE.latest?.get(label);
 $('current').textContent=latest?fmt(latest.value)+' '+latest.unit:'—';
 $('points').textContent=h.length;
 if(!h.length){$('min').textContent='—';$('max').textContent='—';ctx.fillStyle='#89a9c9';ctx.textAlign='center';ctx.font='14px system-ui';ctx.fillText('รอข้อมูล ECU / HEX Trace',width/2,height/2);return;}
 const low=Math.min(...h),high=Math.max(...h),range=Math.max(0.01,high-low);
 $('min').textContent=fmt(low);$('max').textContent=fmt(high);
 const l=46,r=14,t=15,b=25,innerW=width-l-r,innerH=height-t-b;
 ctx.strokeStyle='#2d4967';ctx.lineWidth=1;
 for(let i=0;i<=4;i++){
  const yy=t+innerH*i/4;ctx.beginPath();ctx.moveTo(l,yy);ctx.lineTo(width-r,yy);ctx.stroke();
  ctx.fillStyle='#8dadc7';ctx.textAlign='right';ctx.font='10px system-ui';ctx.fillText(fmt(high-range*i/4),l-6,yy+3);
 }
 const points=h.map((v,i)=>[l+(h.length<2?0:i/(h.length-1))*innerW,t+(high-v)/range*innerH]);
 ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
 ctx.strokeStyle='#55e4ff';ctx.lineWidth=2.5;ctx.stroke();
 const grad=ctx.createLinearGradient(0,t,0,height-b);grad.addColorStop(0,'rgba(77,231,255,.26)');grad.addColorStop(1,'rgba(77,231,255,.01)');
 ctx.lineTo(points.at(-1)[0],height-b);ctx.lineTo(points[0][0],height-b);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
 const [x,y]=points.at(-1);ctx.fillStyle='#ffc76c';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();
}
const emitData=(values,trace,mode)=>{
 STATE.group=selected();
 STATE.trace=Uint8Array.from(trace);
 STATE.cycle++;
 STATE.records.push({timestamp:new Date().toISOString(),mode,ecuId:STATE.ecuId,group:STATE.group,metrics:values.map(x=>({...x}))});
 if(STATE.records.length>10000)STATE.records.shift();
 $('cycles').textContent=STATE.cycle;
 renderMetrics(values);
};
async function closePort(){
 const port=STATE.port;STATE.port=null;STATE.connected=false;STATE.ecuId=null;
 if(port)try{await port.close()}catch(e){writeLog('USB close: '+e.message)}
 refreshControls();
}
async function connect(){
 if(STATE.busy||STATE.running)return;
 STATE.busy=true;refreshControls();
 try{
  if(!navigator.usb)throw Error('ต้องเปิด Chrome Android ที่รองรับ WebUSB ผ่าน HTTPS');
  // User gesture before awaits: browser WebUSB permission is requested immediately.
  const device=await Ft232rWebUsb.choose();
  const deviceId=localStorage.getItem('55_device_id');
  const status=await window.api('check',{device:deviceId});
  if(!status?.active)throw Error('License ไม่ได้เปิดใช้งาน · ล็อกอินในหน้าโปรแกรมหลักก่อน');
  await closePort();
  const port=new Ft232rWebUsb(s=>writeLog('USB '+s));STATE.port=port;
  await port.openSelected(device);
  const engine=new HondaFlashEngine(port,ev=>{
   if(ev.phase==='ECU_IDENTIFIED')writeLog('C# '+ev.phase+': '+ev.ecuId);
  });
  const identity=await engine.identify();
  STATE.ecuId=identity.ecuId;STATE.connected=true;STATE.group=selected();
  notice('เชื่อมต่อ ECU ID '+identity.ecuId+' แล้ว · เลือก Group '+STATE.group+' สำหรับอ่านข้อมูลจริง');
 }catch(e){bad(e.message||String(e));await closePort()}
 finally{STATE.busy=false;refreshControls();}
}
async function readCycle(){
 const group=selected(),frames=MAIN_CAPTURE_COMMANDS[group];
 if(!frames)throw Error('ไม่พบกลุ่มคำสั่ง Live Data จาก C#');
 // Original FM_diag.cs method_99: send four read-only commands, 50 ms between.
 // Transport enforces echo + Honda reply checksum. Timeout fails closed;
 // never retries, erases, writes or replays an ambiguous command.
 const capture=[];
 for(let i=0;i<frames.length;i++){
  if(STATE.stopRequested)return null;
  const frame=frames[i];
  const {reply,echoOK}=await STATE.port.exchangeRaw(frame,{timeoutMs:2300,afterWriteMs:50});
  if(!echoOK)throw Error('ECU Echo ผิดรูปแบบ group '+group+' command '+i);
  capture.push(...frame,...reply);
  if(i<frames.length-1)await delay(50);
 }
 return Uint8Array.from(capture);
}
async function run(){
 if(!STATE.connected||STATE.busy||STATE.running)return;
 STATE.running=true;STATE.stopRequested=false;STATE.generation++;
 refreshControls();
 const ticket=STATE.generation;
 notice('กำลังรับ Live Data จาก ECU จริง • Group '+selected());
 try{
  while(STATE.running&&ticket===STATE.generation&&!STATE.stopRequested){
   const capture=await readCycle();
   if(!capture)break;
   const vals=decodeMainDiagnosticTrace(capture,selected());
   if(!vals.length)throw Error('ไม่พบค่าตามรูปแบบ C#');
   emitData(vals,capture,'ECU');
   const delayMs=Math.max(0,Number($('interval').value)||700);
   if(delayMs)await delay(delayMs);
  }
 }catch(e){bad('Live Data หยุด: '+(e.message||String(e))+' • ให้ตรวจสายและกลุ่ม ECU ก่อนเชื่อมต่อใหม่');await closePort()}
 finally{STATE.running=false;STATE.stopRequested=false;refreshControls();}
}
const halt=()=>{if(!STATE.running)return;STATE.stopRequested=true;notice('กำลังหยุดหลังจบคำสั่งอ่านปัจจุบัน (ไม่ตัด USB ระหว่างรับข้อมูล)');refreshControls()};
function decodeTrace(){
 try{
  const raw=$('hex').value.trim();
  if(raw.length>500000)throw Error('HEX Trace ยาวเกิน 250 KB');
  const result=decodeMainDiagnosticTrace(raw,selected());
  const stripped=raw.replace(/\s+/g,'');
  const bytes=Uint8Array.from({length:stripped.length/2},(_,i)=>parseInt(stripped.slice(i*2,i*2+2),16));
  emitData(result,bytes,'IMPORTED_TRACE');
  notice('ถอดข้อมูล '+result.length+' ค่า จาก HEX Trace ที่นำเข้า (ไม่ใช่ข้อมูลสดจาก ECU)');
  writeLog('Parsed '+result.length+' C# metrics from imported trace, group '+selected());
 }catch(e){bad('HEX: '+e.message)}
}
function exportCsv(){
 if(!STATE.records.length)return notice('ยังไม่มีข้อมูลสำหรับส่งออก');
 const names=[...new Set(STATE.records.flatMap(x=>x.metrics.map(v=>v.name)))];
 const safe=s=>'"'+String(s??'').replaceAll('"','""')+'"';
 const rows=[['timestamp','source','ECU ID','group',...names].map(safe).join(',')];
 for(const point of STATE.records){
  const map=new Map(point.metrics.map(v=>[v.name,v.value]));
  rows.push([point.timestamp,point.mode,point.ecuId||'',point.group,...names.map(n=>map.get(n)??'')].map(safe).join(','));
 }
 download('\ufeff'+rows.join('\r\n'),'text/csv;charset=utf-8','55_main_live_'+Date.now()+'.csv');
 writeLog('CSV exported '+STATE.records.length+' frames');
}
function exportJson(){
 if(!STATE.records.length)return notice('ยังไม่มีข้อมูลสำหรับส่งออก');
 download(JSON.stringify({version:'55 Main C# Live 19',warning:'Software telemetry. No ECU firmware readback.',data:STATE.records},null,2),'application/json','55_main_live_'+Date.now()+'.json');
}
$('connect').onclick=connect;
$('start').onclick=run;
$('stop').onclick=halt;
$('decode').onclick=decodeTrace;
$('raw').onclick=()=>{$('hex').value=STATE.trace?hex(STATE.trace):''};
$('csv').onclick=exportCsv;
$('export').onclick=exportJson;
$('series').onchange=drawChart;
$('resetStats').onclick=()=>{STATE.history.clear();if(STATE.latest){for(const [key,v] of STATE.latest){if(typeof v.value==='number')STATE.history.set(key,[v.value]);}}drawChart()};
$('clearHistory').onclick=()=>{if(!confirm('ล้างค่าที่เก็บในหน้านี้? ไฟล์ CSV/JSON ที่ดาวน์โหลดแล้วจะไม่ถูกลบ'))return;STATE.records=[];STATE.history.clear();STATE.cycle=0;STATE.latest=null;STATE.trace=null;$('tiles').replaceChildren();$('rows').replaceChildren();$('cycles').textContent='0';$('dataBadge').textContent='NO DATA';drawChart();};
$('clearLog').onclick=()=>$('log').textContent='Log cleared\n';
window.addEventListener('resize',drawChart);
window.addEventListener('pagehide',()=>{STATE.stopRequested=true;STATE.running=false;closePort()});
refreshControls();drawChart();

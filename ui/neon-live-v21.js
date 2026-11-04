(function liveUI(){
 "use strict";
 const live=document.getElementById("live"),api=window.__55LiveBridge;
 if(!live||!api||document.getElementById("n21Pane"))return;
 const $=id=>document.getElementById(id);
 const line=path=>`<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" aria-hidden="true">${path}</svg>`;
 const icons={
  link:line('<path d="M8 16 16 8M8 10l-1 1a4 4 0 0 0 6 6l1-1m2-2 1-1a4 4 0 0 0-6-6l-1 1"/>'),
  rpm:line('<path d="M5 17a9 9 0 1 1 14 0M12 13l5-5M8 20h8"/>'),
  tps:line('<circle cx="12" cy="12" r="9"/><path d="M12 12 17 7M6 17l-2 2M18 17l2 2"/>'),
  map:line('<path d="M3 18h18M5 16V8h4v8m2 0v-4h4v4m2 0V6h2v10"/>'),
  ect:line('<path d="M11 13V4a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0Z"/><path d="M13 7v10M4 20l2-2 2 2"/>'),
  iat:line('<path d="M10 13V5a2 2 0 0 1 4 0v8a4 4 0 1 1-4 0Z"/><path d="M2 6h4m-4 4h4"/>'),
  bat:line('<rect x="2" y="7" width="19" height="12" rx="2"/><path d="M6 7V5h4v2M14 7V5h4v2M7 13h4m-2-2v4m6-2h4"/>'),
  inj:line('<path d="m6 17 11-11m-3-2 6 6M4 14l6 6m-7 1 4-4M16 2l6 6"/>'),
  ign:line('<path d="m6 16 10-10 3 3-10 10-3-3ZM17 3l4 4M4 20l3-3"/>'),
  afr:line('<path d="M4 17a8 8 0 1 1 16 0M12 17l3-7M4 21h16"/>'),
  reset:line('<path d="M3 11a9 9 0 1 1 3 7M3 4v7h7"/>'),
  csv:line('<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>'),
  record:line('<rect x="6" y="6" width="12" height="12" rx="2"/>')
 };
 const keys=["rpm","tps","map","ect","iat","bat","inj","ign","afr"];
 const names={rpm:"RPM",tps:"TPS",map:"MAP",ect:"ECT",iat:"IAT",bat:"Battery",inj:"Injection",ign:"Ignition",afr:"AFR / A/F"};
 const units={rpm:"รอบ/นาที",tps:"°",map:"kPa",ect:"°C",iat:"°C",bat:"V",inj:"ms",ign:"°BTDC",afr:"AFR"};
 const descriptions={rpm:"ความเร็วรอบเครื่องยนต์",tps:"มุมเปิดลิ้นเร่ง",map:"ความดันไอดี",ect:"อุณหภูมิน้ำหล่อเย็น",iat:"อุณหภูมิไอดี",bat:"แรงดันแบตเตอรี่",inj:"ระยะเวลาฉีดน้ำมัน",ign:"องศาจุดระเบิด",afr:"ค่า A/F ที่ ECU ประเมิน (ไม่ใช่ Wideband ที่ยืนยันแล้ว)"};
 const groups={engine:keys,fuel:["inj","tps","map","afr"],electric:["bat","ign","ect"],sensors:["tps","map","ect","iat","afr"]};
 const icon=document.querySelector("#tune img.lg");
 const header=document.createElement("div");header.id="n21Header";
 header.innerHTML=`<div class="n21-brand">${icon?`<img alt="55 PERFORMANCE" src="${icon.src}">`:'<span class="n21-brand-icon">55</span>'}<span class="n21-brand-text"><b>55 PERFORMANCE</b><em>ECU TUNER</em></span></div><button type="button" id="n21Menu" class="n21-icon-button" aria-label="เมนูทั้งหมด">☰</button>`;
 live.insertBefore(header,live.firstElementChild);
 const pane=document.createElement("div");pane.id="n21Pane";
 pane.innerHTML=`
 <div class="n21-page-title">
  <button id="n21Back" type="button" class="n21-icon-button" aria-label="กลับหน้าแรก">‹</button>
  <div class="n21-page-title-copy"><h2><span class="n21-slash"></span><i>Live Data</i></h2><p>ข้อมูลการทำงานแบบเรียลไทม์ (Real-Time)</p></div>
  <button type="button" id="n21Model" class="n21-model-pill"><span>♧</span> <b id="n21ModelTxt">เลือกรุ่น</b> <span>⌄</span></button>
 </div>
 <div class="n21-connection-card">
  <button type="button" id="n21Connection" class="n21-status-block n21-connect"><span class="n21-status-ico">${icons.link}</span><span><b id="n21ConnTitle">ยังไม่เชื่อมต่อ ECU</b><small id="n21ConnSub">แตะเพื่อเชื่อมต่อ FTDI</small></span></button>
  <div class="n21-status-block"><span class="n21-status-ico">▱</span><span><small>โปรโตคอล</small><b id="n21Protocol">—</b></span></div>
  <div class="n21-status-block"><span class="n21-status-ico">↻</span><span><small>อัตรารีเฟรชจริง</small><b id="n21Rate">— Hz</b></span></div>
  <div class="n21-status-block n21-record"><span class="n21-red-dot"></span><span><small>บันทึกข้อมูล</small><b id="n21Rec">ยังไม่บันทึก</b><small id="n21Timer">00:00:00</small></span></div>
 </div>
 <section class="n21-chart-panel">
  <div class="n21-chart-head"><label class="n21-chart-select-wrap"><span>${icons.rpm}</span><select id="n21GraphMetric" aria-label="เลือกค่าที่แสดงกราฟ">${keys.map(k=>`<option value="${k}">${names[k]} (${units[k]})</option>`).join("")}</select></label>
   <div class="n21-chart-switch"><button id="n21Real" type="button" class="n21-chart-chip active">⌁ เรียลไทม์</button><button id="n21Range" type="button" class="n21-chart-chip">◷ 30 วินาที</button><button id="n21Expand" type="button" class="n21-expand" aria-label="ขยายกราฟ">⛶</button></div>
  </div>
  <div class="n21-chart-area"><div class="n21-chart-canvas"><canvas id="n21Canvas" aria-label="กราฟค่าที่อ่านได้จาก ECU"></canvas></div><div class="n21-chart-current"><small id="n21NowName">RPM (ปัจจุบัน)</small><strong id="n21NowValue">—</strong><small id="n21NowUnit">รอบ/นาที</small></div></div>
  <div class="n21-chart-foot" id="n21ChartFoot">ยังไม่มีข้อมูลสำหรับกราฟ • เชื่อมต่อ ECU และเริ่มอ่านข้อมูล</div>
 </section>
 <div class="n21-categories">
  <div class="n21-section-title"><span class="n21-slash"></span><b>หมวดข้อมูล</b><small>(แสดงผล)</small></div>
  <div class="n21-cat-chips">
   <button type="button" data-n21-cat="engine" class="active">⚙ เครื่องยนต์</button><button type="button" data-n21-cat="fuel">♧ เชื้อเพลิง</button>
   <button type="button" data-n21-cat="electric">ϟ ไฟฟ้า</button><button type="button" data-n21-cat="sensors">◉ เซนเซอร์</button>
  </div>
 </div>
 <div class="n21-metric-grid">${keys.map(k=>`<button type="button" class="n21-metric n21-${k}" data-n21-key="${k}" aria-label="${names[k]}"><span class="n21-metric-icon">${icons[k]}</span><span class="n21-metric-name"><b>${names[k]}</b><small>${descriptions[k]}</small></span><span class="n21-metric-right"><span class="n21-signal">▁▃▅</span><strong id="n21Value-${k}">—</strong><small>${units[k]}</small></span></button>`).join("")}</div>
 <div id="n21AfrNote" class="n21-afr-provenance" role="note">A/F เป็นค่าที่ประเมินจาก ECU • ไม่ใช่ผลจากเซนเซอร์ Wideband โดยตรง</div>
 <div class="n21-summary-head"><div class="n21-section-title"><span class="n21-slash"></span><b>สรุปค่า</b><small>(Min / Max / ปัจจุบัน)</small></div><span id="n21SummaryTime">ไม่มีข้อมูลบันทึก</span></div>
 <div class="n21-summary"><div class="n21-summary-name"><b id="n21SummaryName">RPM</b><small id="n21SummaryUnit">รอบ/นาที</small></div><div><small>ต่ำสุด (Min)</small><strong id="n21Min" class="n21-cyan">—</strong></div><div><small>สูงสุด (Max)</small><strong id="n21Max" class="n21-pink">—</strong></div><div class="n21-summary-now"><small>ปัจจุบัน (Now)</small><strong id="n21SummaryNow">—</strong></div></div>
 <div class="n21-actions">
  <button type="button" id="n21RecordBtn" class="n21-action n21-action-record">${icons.record}<span><b>เริ่มบันทึก</b><small>Record</small></span></button>
  <button type="button" id="n21Reset" class="n21-action n21-action-reset">${icons.reset}<span><b>รีเซ็ตค่า Min-Max</b><small>Reset Min-Max</small></span></button>
  <button type="button" id="n21Csv" class="n21-action n21-action-csv">${icons.csv}<span><b>ส่งออก CSV</b><small>Export CSV</small></span></button>
 </div>
 <div class="n21-live-controls"><button type="button" id="n21Read" class="n21-secondary">⇄ เชื่อมต่อ / เริ่มอ่าน ECU</button><label class="n21-main-group-label">รูปแบบการอ่านข้อมูล <select id="n21MainGroup" aria-label="เลือกรูปแบบการอ่านข้อมูล"><option value="1">Group 1 · A/F คำนวณ</option><option value="4">Group 4 · A/F คำนวณ</option><option value="7">Group 7 · ไม่มี A/F</option></select></label></div>
 <div id="n21SourceNotice" class="n21-source-notice">ยังไม่ได้เชื่อมต่อ ECU • ค่าจะเป็น — จนกว่าจะอ่านได้จริง</div>
`;
 $("lvBody").insertBefore(pane,$("lvBody").firstElementChild);
 const meterEls=Object.fromEntries(keys.map(k=>[k,$("n21Value-"+k)]));
 let selected="rpm",windowMs=30000,expanded=false,lastSource="idle",lastSample=0,lastProcessed=0,lastRender=0;
 const samples=[],stats=new Map(),frames=[];
 const fmt=(v,k)=>v==null||!Number.isFinite(v)?"—":v.toLocaleString("en-US",{maximumFractionDigits:({bat:1,inj:2,ign:1,tps:1,map:1,ect:0,iat:0,rpm:0,afr:2})[k]??1});
 const hhmmss=sec=>{const n=Math.max(0,Math.floor(sec));return[Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,"0")).join(":")};
 function category(which){for(const b of pane.querySelectorAll("[data-n21-cat]"))b.classList.toggle("active",b.dataset.n21Cat===which);
  for(const b of pane.querySelectorAll("[data-n21-key]"))b.hidden=!groups[which].includes(b.dataset.n21Key)}
 function draw(){
  const canvas=$("n21Canvas"),rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;if(w<50||h<50)return;
  const ratio=Math.min(2,devicePixelRatio||1);
  if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio)}
  const c=canvas.getContext("2d");c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,w,h);
  const p={l:42,t:14,r:11,b:27},cw=w-p.l-p.r,ch=h-p.t-p.b,now=Date.now(),start=now-windowMs;
  const a=samples.filter(s=>s.t>=start&&Number.isFinite(s[selected]));
  const hi=a.length?Math.max(...a.map(s=>s[selected])):0;
  const lo=a.length?Math.min(...a.map(s=>s[selected])):0;
  const min=selected==="rpm"||selected==="tps"||selected==="bat"?0:Math.min(0,lo);
  const max=selected==="rpm"?Math.max(2000,Math.ceil(hi/2000)*2000):selected==="tps"?100:Math.max(1,Math.ceil(hi*1.15));
  const toY=v=>p.t+ch-(v-min)/Math.max(1,max-min)*ch;
  c.font="10px system-ui";c.textAlign="right";c.fillStyle="#b6cbe1";
  for(let i=0;i<=5;i++){const y=p.t+ch*i/5;c.setLineDash([3,4]);c.strokeStyle="#50769d77";c.beginPath();c.moveTo(p.l,y);c.lineTo(w-p.r,y);c.stroke();c.fillText(fmt(max-(max-min)*i/5,selected),p.l-6,y+3)}
  c.textAlign="center";for(let i=0;i<=5;i++){const x=p.l+cw*i/5;c.beginPath();c.moveTo(x,p.t);c.lineTo(x,p.t+ch);c.stroke();c.fillText(i===5?"ตอนนี้":"-"+Math.round(windowMs/1000*(1-i/5))+"s",x,h-6)}
  c.setLineDash([]);if(!a.length)return;
  const pts=a.map(s=>[p.l+cw*Math.max(0,Math.min(1,(s.t-start)/windowMs)),toY(s[selected])]);
  const trace=()=>{c.beginPath();pts.forEach(([x,y],i)=>{if(i===0)c.moveTo(x,y);else c.lineTo(x,y)})};
  const fill=c.createLinearGradient(0,p.t,0,p.t+ch);fill.addColorStop(0,"#04eaff82");fill.addColorStop(1,"#07dafa05");
  trace();c.lineTo(pts[pts.length-1][0],p.t+ch);c.lineTo(pts[0][0],p.t+ch);c.closePath();c.fillStyle=fill;c.fill();
  trace();c.lineWidth=3;c.strokeStyle="#36f1ff";c.lineJoin="round";c.shadowColor="#04f4ff";c.shadowBlur=10;c.stroke();c.shadowBlur=0;
  const [x,y]=pts[pts.length-1];c.beginPath();c.arc(x,y,4.5,0,Math.PI*2);c.shadowColor="#21f0ff";c.shadowBlur=9;c.fillStyle="#fff";c.fill();c.shadowBlur=0;
 }
 function render(){
  const s=api.snapshot(),now=Date.now(),values={...(s.values||{})},mode=s.mode||"gauge";
  if(s.demo||!s.afrSupported)values.afr=null;
  live.classList.toggle("n21-gauge",mode==="gauge");
  if(s.source==="ecu"&&lastSource!=="ecu"){samples.length=0;stats.clear();frames.length=0;lastSample=0;lastProcessed=0}lastSource=s.source;
  if(s.run&&s.source==="ecu"&&s.sampleSeq>lastProcessed&&keys.some(k=>values[k]!=null)){
   lastProcessed=s.sampleSeq;
   lastSample=now;const item={t:now};
   for(const k of keys){item[k]=values[k];if(values[k]!=null&&Number.isFinite(values[k])){
    const v=values[k],r=stats.get(k)||{min:v,max:v};r.min=Math.min(r.min,v);r.max=Math.max(r.max,v);stats.set(k,r)}}
   samples.push(item);while(samples.length>900||samples[0]?.t<now-125000)samples.shift();
  }
  if(mode!=="gauge")return;
  $("n21ModelTxt").textContent=s.model||"เลือกรุ่น";
  $("n21Connection").classList.toggle("n21-linked",!!s.connected);
  $("n21ConnTitle").textContent=s.demo?"DEMO (จำลอง)":s.connected?
  (s.ecuId?"● FT232R เชื่อมต่อ · ECU ตอบแล้ว":"● FT232R / USB เชื่อมต่อแล้ว"):
  "ยังไม่ได้เชื่อมต่อสาย FT232R";
  const activeStage=s.phase==='USB_CHOOSER'?'เลือก FT232R ในหน้าต่าง Android':
   s.phase==='USB_OPEN'?'กำลังขอเปิด USB จาก Android':
   s.phase==='ECU_ID_PROBE'?'เปิด USB แล้ว · กำลังอ่าน ECU ID':
   'กำลังเชื่อมต่อ FT232R / ECU ID';
  $("n21ConnSub").textContent=s.connected?
   (s.ecuId?"ECU ID "+s.ecuId+" · ออนไลน์":"สายเปิดพอร์ตแล้ว · ยังไม่ได้อ่าน/ต่อรถ"):
   s.connecting?activeStage:
   s.phase==='USB_ACCESS_DENIED'?'USB Access denied • ดูข้อความข้อผิดพลาด':
   "แตะเพื่อเลือกสายและเปิด USB เท่านั้น";
  $("n21Protocol").textContent=s.demo?"DEMO":s.protocol||"—";
  while(frames.length&&frames[0]<now-4000)frames.shift();
  const isReal=s.run&&s.source==="ecu"&&s.connected;
  $("n21Rate").textContent=isReal&&Number.isFinite(s.refreshHz)?s.refreshHz.toFixed(1)+" Hz":"— Hz";
  $("n21Rec").textContent=s.recording?"● REC":s.hasLog?"Log พร้อมส่งออก":"ยังไม่บันทึก";
  $("n21Rec").classList.toggle("recording",s.recording);$("n21Timer").textContent=hhmmss(s.recordSeconds||0);
  $("n21RecordBtn").querySelector("b").textContent=s.recording?"หยุดบันทึก":"เริ่มบันทึก";
  $("n21RecordBtn").querySelector("small").textContent=s.recording?"Stop":"Record";
  $("n21RecordBtn").disabled=!s.recording&&!isReal;$("n21Csv").disabled=!s.hasLog&&!s.recording;
  $("n21Read").textContent=isReal?"■ หยุดอ่าน ECU":s.connecting?"กำลังเปิด USB…":
   s.connected?"▶ เริ่มอ่าน ECU (หลังเสียบรถ)":"⇄ เชื่อมต่อสาย FT232R เท่านั้น";
  $("n21Read").disabled=!!s.connecting;
  $("n21MainGroup").disabled=!!s.connecting||!!s.run;
  $("n21MainGroup").value=String(s.group||1);
  $("n21SummaryTime").textContent=s.recording?"บันทึก "+hhmmss(s.recordSeconds):s.demo?"โหมดจำลอง":"ข้อมูล "+samples.length+" ชุด";
  $("n21SourceNotice").textContent=s.message||"ยังไม่ได้เชื่อมต่อ ECU • ค่าที่ไม่มีจะแสดง —";
  $("n21SourceNotice").classList.toggle("n21-demo-note",s.demo);
  $("n21AfrNote").textContent=s.afrSource||"ECU ไม่ส่งค่า A/F";
  for(const k of keys){const value=k==="afr"&&(s.demo||!s.afrSupported)?null:values[k];meterEls[k].textContent=fmt(value,k);pane.querySelector(`[data-n21-key="${k}"]`).classList.toggle("n21-missing",value==null)}
  $("n21NowName").textContent=names[selected]+" (ปัจจุบัน)";$("n21NowValue").textContent=fmt(values[selected],selected);$("n21NowUnit").textContent=units[selected];
  $("n21SummaryName").textContent=names[selected];$("n21SummaryUnit").textContent=units[selected];
  const r=stats.get(selected);$("n21Min").textContent=fmt(r?.min,selected);$("n21Max").textContent=fmt(r?.max,selected);
  $("n21SummaryNow").textContent=fmt(values[selected],selected);
  $("n21ChartFoot").textContent=samples.some(p=>p[selected]!=null)?"กราฟข้อมูลจาก ECU • ช่วง "+windowMs/1000+" วินาที":"รอข้อมูล "+names[selected]+" จาก ECU จริง";
  if(now-lastRender>=160){lastRender=now;requestAnimationFrame(draw)}
 }
 $("n21Back").onclick=()=>api.home("dashboard");
 $("n21Menu").onclick=()=>{const dialog=$("n20MenuDialog");if(dialog?.showModal)dialog.showModal();else api.home("dashboard")};
 const navDialog=$("n20MenuDialog");
 if(navDialog)navDialog.addEventListener("click",e=>{
   if(!live.classList.contains("on"))return;
   const item=e.target.closest?.(".n20-menu-items button");
   if(!item)return;
   const all=[...navDialog.querySelectorAll(".n20-menu-items button")];
   const destination=["dashboard","library","tune","flash","live","dtc","tools","settings"][all.indexOf(item)];
   if(!destination)return;
   e.preventDefault();e.stopImmediatePropagation();
   navDialog.close();api.home(destination);
 },true);
 $("n21Model").onclick=()=>api.home("library");
 $("n21Connection").onclick=()=>{
  // Reuse the same port on Home and Live. A connected indicator is not a
  // request to probe ECU or open a second USB session.
  if(api.snapshot().connected)return;
  void api.connect().then(render).catch(()=>render());
 };
 $("n21GraphMetric").onchange=e=>{selected=e.target.value;render();requestAnimationFrame(draw)};
 $("n21Real").onclick=()=>{requestAnimationFrame(draw)};
 $("n21Range").onclick=()=>{windowMs=windowMs===30000?60000:windowMs===60000?120000:30000;$("n21Range").textContent="◷ "+windowMs/1000+" วินาที";requestAnimationFrame(draw)};
 $("n21Expand").onclick=()=>{expanded=!expanded;pane.querySelector(".n21-chart-panel").classList.toggle("n21-chart-expanded",expanded);requestAnimationFrame(draw)};
 for(const b of pane.querySelectorAll("[data-n21-cat]"))b.onclick=()=>category(b.dataset.n21Cat);
 for(const b of pane.querySelectorAll("[data-n21-key]"))b.onclick=()=>{selected=b.dataset.n21Key;$("n21GraphMetric").value=selected;render();requestAnimationFrame(draw)};
 $("n21RecordBtn").onclick=()=>{api.record();render()};
 $("n21Reset").onclick=()=>{samples.length=0;stats.clear();lastSample=0;render()};
 $("n21Csv").onclick=()=>{api.exportCsv();render()};
 $("n21Read").onclick=async()=>{
  const s=api.snapshot();
  if(s.source==="ecu"&&s.run){api.stopEcu();render();return;}
  if(s.connecting){render();return;}
  // Phase 1 only opens FT232R. Do not send a single K-Line command:
  // a cable without a motorcycle must still report USB connected.
  if(!s.connected){await api.connect();render();return;}
  // Phase 2 is an explicit operator action after plugging the bike in.
  api.startEcu();render();
 };
 $("n21MainGroup").onchange=e=>{window.__55MainLive?.setGroup(e.target.value);samples.length=0;stats.clear();render()};
 window.__55LiveV21={
  render,
  modeChanged:m=>{live.classList.toggle("n21-gauge",m==="gauge");requestAnimationFrame(render)},
  received:n=>{const t=Date.now();for(let i=0;i<Math.min(10,n);i++)frames.push(t);while(frames.length&&frames[0]<t-4000)frames.shift()}
 };
 category("engine");$("n21GraphMetric").value=selected;
 setInterval(()=>{if(live.classList.contains("on"))render()},440);
 render();
})();
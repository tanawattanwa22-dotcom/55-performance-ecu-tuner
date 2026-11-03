/* Neon V20 mobile UI browser regression; never connects to, erases, or writes ECU. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8',
 '.css':'text/css;charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
 '.webmanifest':'application/manifest+json','.json':'application/json'};
const server=http.createServer((req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1'),relative=decodeURIComponent(u.pathname).replace(/^\/+/,'')||'index.html';
  const target=path.resolve(root,relative);
  if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403).end();return}
  const stat=fs.statSync(target);
  if(!stat.isFile()){res.writeHead(404).end();return}
  res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(target).pipe(res);
 }catch{res.writeHead(404).end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/index.html';
let browser;
const results=[];
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 fs.mkdirSync(path.join(root,'test-reports'),{recursive:true});
 for(const width of [320,360,393,412,720]){
  const page=await browser.newPage({viewport:{width,height:820},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const jsErrors=[],assetErrors=[];
  page.on('pageerror',e=>jsErrors.push(e.message));
  page.on('response',r=>{
   if(r.url().includes('/ui/neon-')&&r.status()>=400)assetErrors.push(r.url()+' '+r.status());
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('#neonShell',{state:'attached',timeout:20000});
  // Screenshot only: expose the underlying app while preserving the actual License gate in production.
  await page.evaluate(()=>{document.getElementById('home').classList.add('on');
   const gate=document.getElementById('licenseGate');if(gate)gate.style.visibility='hidden';
   const splash=document.getElementById('spl');if(splash)splash.style.visibility='hidden';});
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#v20Nav button').count(),8,'8 real UI categories');
  assert.equal(await page.locator('#n20Stage .n20-tile').count(),8,'8 dashboard tiles');
  assert.equal(await page.locator('#n20MenuDialog .n20-menu-items button').count(),8,'hamburger drawer contains every category');
  await page.evaluate(()=>document.querySelector('.n20-menu-button').click());
  assert.equal(await page.locator('#n20MenuDialog').evaluate(el=>el.open),true,'hamburger opens real dialog');
  await page.evaluate(()=>document.querySelector('.n20-menu-close').click());
  assert.equal(await page.locator('#n20MenuDialog').evaluate(el=>el.open),false,'close button closes drawer');
  const overflowing=async label=>{
   const x=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,
    viewport:innerWidth,body:document.body.scrollWidth}));
   assert(x.scroll<=x.viewport+3,label+' horizontal document overflow: '+JSON.stringify(x));
  };
  await overflowing('Dashboard '+width);
  await page.evaluate(()=>document.querySelector('#v20Nav [data-cat="library"]').click());
  assert.equal(await page.locator('#n20Model').count(),1);
  assert.equal(await page.locator('#n20Stage .n20-model-row').count(),3,'3 actual bundled models, no fabricated 50');
  assert.equal(await page.locator('#modelCard').evaluate(el=>el.classList.contains('n20-hidden')),true,'old model selector hidden behind new full BIN library');
  assert.equal(await page.locator('#flashCard').evaluate(el=>el.classList.contains('n20-hidden')),true);
  assert.equal(await page.locator('#n22Library').count(),1,'dedicated catalog page present');
  assert.equal(await page.locator('.n22-feature-card').count(),1,'featured master BIN card');
  assert.equal(await page.locator('#n22Library .n22-bin-row').count(),3,'only actual three installed models');
  assert.equal(await page.locator('#n22Library .n22-brand-logo').count(),3,
   'Every BIN row has a manufacturer badge, including rows without verified make');
  assert.equal(await page.locator('#n22Library .n22-brand-logo img[alt="Honda"]').count(),0,
   'Do not falsely label an unknown manufacturer as Honda');
  assert.equal(await page.locator('#n22Library .n22-row-actions').count(),3,
   'every row has three actionable buttons');
  assert.equal(await page.locator('#n22Library .n22-filter-chip').count(),5,
   'full brand and ECU vendor filter bar');
  assert.equal(await page.locator('#n22Library .n22-filter-vendor-logo').count(),2,
   'Keihin and Shindengen vendor wordmarks are present');
  assert.equal(await page.locator('#n22Library .n22-row-vendor-logo').count(),1,
   'validated K03 Keihin row has vendor badge');
  await page.evaluate(()=>document.querySelector('#n22Library .n22-bin-row .n22-action-info').click());
  assert.equal(await page.locator('#n22InfoDialog').evaluate(d=>d.open),true,'BIN details dialog opens');
  assert((await page.locator('#n22InfoDialog').innerText()).includes('ECU'));
  await page.evaluate(()=>document.querySelector('#n22InfoDialog button').click());
  assert.equal(await page.locator('#n22InfoDialog').evaluate(d=>d.open),false,'details dialog closes');
  await page.evaluate(()=>document.querySelector('.n22-view-switch button:last-child').click());
  assert.equal(await page.locator('#n22Library .n22-model-list').evaluate(el=>el.classList.contains('n22-as-grid')),true,
   'list/grid toggle works');
  await page.evaluate(()=>document.querySelector('.n22-view-switch button:first-child').click());
  const logos=await page.evaluate(()=>[...document.querySelectorAll('#n22Library .n22-brand-logo img')]
   .map(img=>({src:img.getAttribute('src'),complete:img.complete,loaded:img.naturalWidth>0})));
  assert(logos.every(l=>l.loaded),'every manufacturer image shown loaded: '+JSON.stringify(logos));
  const brandAssets=await page.evaluate(()=>[...document.querySelectorAll('#n22Library .n22-filter-vendor-logo, #n22Library .n22-row-vendor-logo')]
    .map(img=>({src:img.getAttribute('src'),loaded:img.complete&&img.naturalWidth>0})));
  assert(brandAssets.every(v=>v.loaded),'all ECU vendor logos loaded: '+JSON.stringify(brandAssets));
  await overflowing('Library '+width);
  if(width===393){
   await page.screenshot({path:path.join(root,'test-reports','neon-library-v22-393.png'),fullPage:false});
   // Visual fixture ONLY. Production still reads encrypted licensed BIN data, not these synthetic bytes.
   const preexisting=await page.evaluate(()=>Boolean(BINS['K03-H01']&&DEFS['K03-H01']));
   if(!preexisting){
    await page.evaluate(()=>{
     BINS['K03-H01']=btoa(String.fromCharCode(...new Uint8Array(1024)));
     DEFS['K03-H01']={tables:[]};
     window.__55NeonNavigate('library');
    });
   }
   await page.waitForTimeout(90);
   await page.screenshot({path:path.join(root,'test-reports','neon-library-v22-ready-fixture-393.png'),fullPage:false});
   if(!preexisting)await page.evaluate(()=>{
    delete BINS['K03-H01'];delete DEFS['K03-H01'];window.__55NeonNavigate('library');
   });
  }

  await page.evaluate(()=>document.querySelector('#v20Nav [data-cat="flash"]').click());
  assert.equal(await page.locator('#flashCard').evaluate(el=>el.classList.contains('n20-hidden')),true,'old Flash form hidden behind V24');
  assert.equal(await page.locator('#n20Stage .n24-hero').isVisible(),true,'real-state V24 Flash dashboard visible');
  assert.equal(await page.locator('#n20Stage .n24-panel').count(),4,'BIN, ECU, Offset and checklist panels');
  assert.equal(await page.locator('#n20Stage .n24-info-line').count(),14,'read-only BIN/ECU/Offset fields');
  assert.equal(await page.locator('#n20Stage .n24-check-row').count(),5,'five preflight checks');
  assert.equal(await page.locator('#n20Stage [data-n24="ecu"]').innerText(),'ยังไม่ได้อ่านจาก ECU','ECU ID never fabricated');
  assert.equal(await page.locator('#n20Stage [data-n24="start"]').innerText(),'—','Offset never fabricated');
  assert.equal(await page.locator('#n20Stage .n24-flash').isDisabled(),true,'cannot flash without physical preflight');
  assert.equal(await page.locator('#btnFlash').evaluate(el=>el.hidden),true,'legacy write button still gated');
  await overflowing('Flash '+width);
  const flashButtons=await page.evaluate(()=>[...document.querySelectorAll('#n20Stage .n24-actions button')].map(b=>{
   const r=b.getBoundingClientRect();return {name:b.className,left:r.left,right:r.right};
  }));
  for(const b of flashButtons)assert(b.left>=-2&&b.right<=width+2,
   'V24 Flash button overflows '+width+'px: '+JSON.stringify(b));
  await page.evaluate(()=>document.querySelector('#v20Nav [data-cat="live"]').click());
  assert.equal(await page.locator('#liveCard').evaluate(el=>el.classList.contains('n20-hidden')),false);
  assert.equal(await page.locator('#flashCard').evaluate(el=>el.classList.contains('n20-hidden')),true);
  await overflowing('Live entry '+width);

  // Reference Live Data V21 must render its real source dashboard, not fixed mock numbers.
  await page.evaluate(()=>document.getElementById('goLive').click());
  assert.equal(await page.locator('#n21Pane').count(),1,'image-matched Live dashboard exists');
  assert.equal(await page.locator('#n21Pane .n21-metric').count(),9,'nine sensor cards, with AFR');
  assert.equal(await page.locator('#n21Value-afr').innerText(),'—','no fake AFR while disconnected');
  assert.equal(await page.locator('#n21AfrNote').isVisible(),true,'AFR provenance visible');
  assert.equal(await page.locator('#n21Canvas').count(),1,'real rolling graph canvas');
  assert.equal(await page.locator('#n21Rec').innerText(),'ยังไม่บันทึก','no fabricated REC status');
  assert.equal(await page.locator('#n21NowValue').innerText(),'—','never display mock RPM while disconnected');
  assert.equal(await page.locator('#n21Connection').innerText().then(x=>x.includes('เชื่อมต่อแล้ว')),false,'no fake ECU connection');
  assert.equal(await page.locator('#n21RecordBtn').isDisabled(),true,'record button disabled without real ECU data');
  await page.evaluate(()=>document.getElementById('n21Range').click());
  assert((await page.locator('#n21Range').innerText()).includes('60'),'time window toggles to 60 seconds');
  await page.evaluate(()=>document.querySelector('#n21Pane [data-n21-cat="fuel"]').click());
  assert.equal(await page.locator('#n21Pane .n21-metric:not([hidden])').count(),4,'fuel filter includes AFR card');
  await page.evaluate(()=>document.querySelector('#n21Pane [data-n21-cat="engine"]').click());
  assert.equal(await page.locator('#n21Pane .n21-metric:not([hidden])').count(),9,'engine category restores all nine sensor cards');
  if(width===393)await page.screenshot({path:path.join(root,'test-reports','neon-live-v21-393.png'),fullPage:false});
  await page.evaluate(()=>document.getElementById('n21Demo').click());
  await page.waitForTimeout(180);
  assert((await page.locator('#n21SourceNotice').innerText()).includes('DEMO'),'demo values marked as simulated');
  assert.equal(await page.locator('#n21Value-afr').innerText(),'—','AFR remains blank in DEMO');
  assert.equal(await page.locator('#n21RecordBtn').isDisabled(),true,'demo cannot be recorded as a real ECU log');
  await page.evaluate(()=>document.getElementById('n21Back').click());
  await overflowing('Live real dashboard '+width);
  await page.evaluate(()=>document.querySelector('#v20Nav [data-cat="dtc"]').click());
  assert.equal(await page.locator('#live').evaluate(el=>el.classList.contains('on')),true,'DTC menu opens real full-screen diagnostic page');
  assert.equal(await page.locator('#n23Pane').count(),1,'DTC reference UI installed');
  assert.equal(await page.locator('#n23Pane .n23-brand').isVisible(),true,'new standalone DTC header visible');
  assert.equal(await page.locator('#live > header.top').isVisible(),false,'old Live Data header hidden in DTC');
  assert.equal(await page.locator('#live > .lvtabs').isVisible(),false,'old Live tabs hidden in DTC');
  assert.equal(await page.locator('#live #vDtc > .card').isVisible(),false,'old DTC card hidden but backend retained');
  await page.evaluate(()=>document.querySelector('#n23Pane .n23-brand-menu').click());
  assert.equal(await page.locator('#n23Pane .n23-menu-dialog').evaluate(el=>el.open),true,'new DTC menu opens');
  await page.evaluate(()=>document.querySelector('#n23Pane .n23-menu-dismiss').click());
  assert.equal(await page.locator('#n23Pane .n23-menu-dialog').evaluate(el=>el.open),false,'new DTC menu closes');
  assert.equal(await page.locator('#n23Pane .n23-tab').count(),3,'current/history/system tabs');
  assert.equal(await page.locator('#n23Pane .n23-action').count(),3,'read/clear/system actions');
  assert.equal(await page.locator('#n23Pane .n23-read').isDisabled(),true,'no DTC read before real ECU connection');
  assert.equal(await page.locator('#n23Pane .n23-clear').isDisabled(),true,'no DTC clear before real ECU connection');
  assert((await page.locator('#n23Pane .n23-alert').innerText()).includes('ยังไม่ได้อ่าน'),'no mocked DTC errors');
  await overflowing('DTC real dashboard '+width);
  await page.evaluate(()=>document.querySelector('#n23Pane [data-tab="history"]').click());
  assert((await page.locator('#n23Pane .n23-section-head').innerText()).includes('หน่วยความจำ'),'stored/history tab works');
  await page.evaluate(()=>document.querySelector('#n23Pane [data-tab="system"]').click());
  assert((await page.locator('#n23Pane .n23-system-grid').innerText()).includes('Honda 0x73'),'real ECU system info tab works');
  await page.evaluate(()=>document.querySelector('#n23Pane [data-tab="current"]').click());
  if(width===393)await page.screenshot({path:path.join(root,'test-reports','neon-dtc-v23-393.png'),fullPage:false});
  await page.evaluate(()=>document.querySelector('#n23Pane .n23-brand-home').click());
  assert.equal(await page.locator('#home').evaluate(el=>el.classList.contains('on')),true,'DTC back returns directly to homepage');
  assert.equal(await page.locator('#live').evaluate(el=>el.classList.contains('on')),false,'DTC old Live page closes');
  if(width===393){
   await page.evaluate(()=>window.__55NeonNavigate('flash'));
   await page.screenshot({path:path.join(root,'test-reports','neon-flash-v24-393.png'),fullPage:false});
   await page.evaluate(()=>window.__55NeonNavigate('dashboard'));
  }
  await page.evaluate(()=>document.querySelector('#v20Nav [data-cat="tools"]').click());
  assert.equal(await page.locator('#mainSourceTools').evaluate(el=>el.classList.contains('n20-hidden')),false);
  assert(await page.locator('#n20Stage .n20-tool-links a').count()>=9,'all external C# tools linked');
  await overflowing('Tools '+width);
  await page.evaluate(()=>document.querySelector('#v20Nav [data-cat="settings"]').click());
  assert((await page.locator('#n20Stage').innerText()).includes('License'));
  await overflowing('Settings '+width);
  await page.evaluate(()=>document.querySelector('#v20Nav [data-cat="dashboard"]').click());
  if(width===393){
   await page.screenshot({path:path.join(root,'test-reports','neon-dashboard-393.png'),fullPage:false});
   await page.evaluate(()=>document.getElementById('goLive').click());
   assert.equal(await page.locator('#live').evaluate(el=>el.classList.contains('on')),true,'real Live screen opens');
   assert.equal(await page.locator('#vGauge').count(),1,'original RPM gauge preserved');
   assert.equal(await page.locator('#n21Pane .n21-metric').count(),9,'reference-matched nine sensor cards present');
   await page.evaluate(()=>document.querySelector('#live .lvtabs [data-m="dtc"]').click());
   assert.equal(await page.locator('#vDtc').evaluate(el=>el.style.display==='none'),false,'original DTC mode opens');
   assert.equal(await page.locator('#n23Pane').count(),1,'real DTC panel preserved in Live mode');
   // UI-only fixture: simulate a diagnostic result event without connecting to or clearing an ECU.
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('55:dtc-result',{detail:{
    current:[{k:'1-1',known:true,txt:'MAP ต่ำ'},{k:'8-1',known:true,txt:'TP ต่ำ'}],
    stored:[{k:'7-1',known:true,txt:'ECT ต่ำ'}],missing:0,error:'',success:true,timestamp:Date.now()
   }})));
   assert.equal(await page.locator('#n23Pane .n23-code-card').count(),2,'real event populates current DTC cards');
   assert((await page.locator('#n23Pane .n23-alert').innerText()).includes('2 รายการ'),'DTC count comes from event');
   await page.evaluate(()=>document.querySelector('#n23Pane [data-tab="history"]').click());
   assert.equal(await page.locator('#n23Pane .n23-code-card').count(),1,'stored DTC codes isolated from current');
   await page.evaluate(()=>window.dispatchEvent(new Event('55:dtc-read-start')));
   assert.equal(await page.locator('#n23Pane .n23-code-card').count(),0,'new read clears prior code display');
   await page.screenshot({path:path.join(root,'test-reports','neon-live-dtc-393.png'),fullPage:false});
   await page.evaluate(()=>{document.getElementById('live').classList.remove('on');
    document.getElementById('home').classList.add('on')});
   await page.evaluate(()=>{
    document.getElementById('home').classList.remove('on');
    document.getElementById('tune').classList.add('on');
   });
   await overflowing('Tune '+width);
   await page.screenshot({path:path.join(root,'test-reports','neon-tune-393.png'),fullPage:false});
  }
  assert.deepEqual(assetErrors,[],'no missing Neon assets');
  const critical=jsErrors.filter(e=>/ReferenceError|SyntaxError|neon-v20|n20Stage|Cannot access .* before initialization/i.test(e));
  assert.deepEqual(critical,[],'critical JS errors in mobile page');
  results.push({width,views:7,assets:'ok',overflow:'none',errors:jsErrors.slice(0,3)});
  await page.close();
 }
 console.log('PASS Neon V20 Chrome mobile screens: '+JSON.stringify(results,null,2));
 console.log('Static visual regression screenshots saved under test-reports/. No hardware ECU tests.');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}

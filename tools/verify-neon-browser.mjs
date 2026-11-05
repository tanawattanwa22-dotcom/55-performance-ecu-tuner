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
assert.doesNotMatch(fs.readFileSync(path.join(root,'index.html'),'utf8'),
 /data:image\\/jpeg;base64,/,'Legacy low-resolution base64 JPEG logo must not reappear');
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
  // Brand regression: app header and first-run splash must show the approved
  // smartphone icon, never a legacy inline low-resolution JPEG.
  await page.waitForFunction(()=>{
   const logos=[
    document.querySelector('#spl .brand-splash-art'),
    document.querySelector('#home .top img.lg'),
    document.querySelector('#neonShell .n20-icon')
   ];
   return logos.every(img=>img&&img.complete&&img.naturalWidth>=512);
  },null,{timeout:10000});
  const brand=await page.evaluate(()=>({
   logos:[
    document.querySelector('#spl .brand-splash-art'),
    document.querySelector('#home .top img.lg'),
    document.querySelector('#neonShell .n20-icon')
   ].map(img=>({src:img.getAttribute('src'),width:img.naturalWidth,
     rendered:img.getBoundingClientRect().width})),
   title:document.querySelector('#spl .brand-splash-wordmark')?.textContent||''
  }));
  assert(brand.logos.every(img=>img.src==='icons/icon-512.png?v=brand-20261105b'),
   'Every opening/header logo loads the same new 55 PERFORMANCE icon: '+JSON.stringify(brand));
  assert(brand.logos[0].rendered<=brand.logos[0].width,
   'Splash must not upscale its raster source: '+JSON.stringify(brand.logos[0]));
  assert(brand.title.includes('55 PERFORMANCE')&&brand.title.includes('ECU TUNER'),
   'Splash brand text renders at browser-native sharpness');

  // Screenshot only: expose the underlying app while preserving the actual License gate in production.
  await page.evaluate(()=>{document.getElementById('home').classList.add('on');
   const gate=document.getElementById('licenseGate');if(gate)gate.style.visibility='hidden';
   const splash=document.getElementById('spl');if(splash)splash.style.visibility='hidden';});
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#v20Nav button').count(),8,'8 quick-nav categories; Recovery is kept in the menu drawer');
  assert.equal(await page.locator('#n20Stage .n20-tile').count(),8,'8 dashboard tiles; Recovery remains a separate drawer route');
  assert.equal(await page.locator('#n20MenuDialog .n20-menu-items button').count(),9,'hamburger drawer contains all 9 categories including Recovery');
   assert.equal(await page.locator('#n20MenuDialog .n20-menu-items button').filter({hasText:'Recovery'}).count(),1,'Recovery is directly accessible from the main menu');
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
  const installedModels=await page.evaluate(()=>MODELS.length);
  assert.equal(await page.locator('#n20Stage .n20-model-row').count(),installedModels,'all actual bundled models, no fabricated catalog');
  assert.equal(await page.locator('#modelCard').evaluate(el=>el.classList.contains('n20-hidden')),true,'old model selector hidden behind new full BIN library');
  assert.equal(await page.locator('#flashCard').evaluate(el=>el.classList.contains('n20-hidden')),true);
  assert.equal(await page.locator('#n22Library').count(),1,'dedicated catalog page present');
  assert.equal(await page.locator('.n22-feature-card').count(),1,'featured master BIN card');
  assert.equal(await page.locator('#n22Library .n22-bin-row').count(),installedModels,'only actual installed models');
  assert.equal(await page.locator('#n22Library .n22-brand-logo').count(),installedModels,
   'Every BIN row has a manufacturer badge, including rows without verified make');
  const documentedHondaCount=await page.evaluate(()=>MODELS.filter(m=>/honda/i.test(String(m.brand||m.meta?.brand||m.meta?.manufacturer||m.meta?.make||''))).length);
  assert.equal(await page.locator('#n22Library .n22-brand-logo img[alt="Honda"]').count(),documentedHondaCount,
   'Honda logo count follows documented model metadata');
  assert.equal(await page.locator('#n22Library .n22-row-actions').count(),installedModels,
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
  await page.waitForTimeout(30);
  assert.equal(jsErrors.length,0,'No JS crash when mounting Flash UI: '+JSON.stringify(jsErrors));
  assert.equal(await page.locator('#flashCard').evaluate(el=>el.classList.contains('n20-hidden')),true,'old Flash form hidden behind V24');
  assert.equal(await page.locator('#n20Stage .n24-hero').isVisible(),true,'real-state V24 Flash dashboard visible');
  assert.equal(await page.locator('#n20Stage .n24-panel').count(),6,'BIN upload, ECU, Offset, checklist and live TX/RX Flash panel');
  assert.equal(await page.locator('#n20Stage .n24-flash-trace').isVisible(),true,'Live TX/RX log is visible in Fast Flash without entering Advanced Tools');
  assert.equal(await page.locator('#n20Stage .n24-flash-trace button').count(),2,'TX/RX Flash panel offers download and copy actions');
  assert.equal(await page.locator('#n20Stage .n24-info-line').count(),15,'read-only BIN/ECU/Offset fields');
  assert.equal(await page.locator('#n20Stage .n24-check-row').count(),6,'six preflight checks');
  const unsetEcu=await page.locator('#n20Stage [data-n24="ecu"]').innerText();
  assert(['—','ยังไม่ได้อ่านจาก ECU'].includes(unsetEcu),
   'ECU ID must be unset until physical FT232R read, not invented: '+unsetEcu);
  assert.equal(await page.locator('#n20Stage [data-n24="start"]').innerText(),'—','Offset never fabricated');
  assert.equal(await page.locator('#n20Stage .n24-flash').isDisabled(),true,'cannot flash without physical preflight');
  assert.equal(await page.locator('#btnFlash').evaluate(el=>el.hidden),true,'legacy write button still gated');
  await overflowing('Flash '+width);
  const flashButtons=await page.evaluate(()=>[...document.querySelectorAll('#n20Stage .n24-actions button')].map(b=>{
   const r=b.getBoundingClientRect();return {name:b.className,left:r.left,right:r.right};
  }));
  for(const b of flashButtons)assert(b.left>=-2&&b.right<=width+2,
   'V24 Flash button overflows '+width+'px: '+JSON.stringify(b));
  // Live Data opens the exact original Neon UI, with Main FM_diag backend.
  await page.waitForFunction(()=>window.__55MainLive?.ready===true,{timeout:15000});
  await page.evaluate(()=>document.querySelector('#v20Nav [data-cat="live"]').click());
  assert.equal(await page.locator('#live').evaluate(el=>el.classList.contains('on')),true,'main Live opens in original full-screen Neon page');
  assert.equal(await page.locator('#n21Pane').isVisible(),true,'original Live dashboard is visible');
  assert.equal(await page.locator('#n21Pane .n21-metric').count(),9,'nine original neon sensor tiles, including C# A/F');
  assert.equal((await page.locator('#n21MainGroup option').count()),4,'Main source groups 1/4/7 selectable within Neon');
  assert.equal(await page.locator('#n21Demo').count(),0,'no simulated sensor mode exposed');
  assert.equal(await page.evaluate(()=>Boolean(window.__55SharedEcu?.snapshot?.().connected)),false,'no invented ECU connection without FTDI');
  assert.equal((await page.locator('#n21Value-rpm').innerText()).trim(),'—','no invented ECU RPM');
  assert.equal((await page.locator('#n21Rate').innerText()).trim(),'— Hz','no fake 50 Hz refresh speed');
  assert.equal(await page.locator('#n21RecordBtn').isDisabled(),true,'record disabled without real ECU data');
  await page.evaluate(()=>{const input=document.getElementById('n21MainGroup');input.value='7';input.dispatchEvent(new Event('change',{bubbles:true}));});
  assert((await page.locator('#n21AfrNote').innerText()).includes('ไม่มีช่อง A/F'),'Group 7 cannot fabricate A/F');
  await page.evaluate(()=>{const input=document.getElementById('n21MainGroup');input.value='1';input.dispatchEvent(new Event('change',{bubbles:true}));});
  assert((await page.locator('#n21AfrNote').innerText()).includes('ค่าประเมินจาก ECU')&&
    (await page.locator('#n21AfrNote').innerText()).includes('ไม่ใช่ Wideband'),
    'Main ECU A/F is shown as an estimate, never mislabelled as a measured Wideband reading');
  await overflowing('Original Neon Live (Main FM_diag backend) '+width);
  if(width===393)await page.screenshot({path:path.join(root,'test-reports','neon-live-main-v25-393.png'),fullPage:false});
  await page.evaluate(()=>document.querySelector('#n21Back').click());
  assert.equal(await page.locator('#home').evaluate(el=>el.classList.contains('on')),true,'Live back returns to main UI');
  assert.equal(await page.locator('#live').evaluate(el=>el.classList.contains('on')),false,'Live page closes properly');
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
  assert((await page.locator('#n23Pane .n23-system-grid').innerText()).includes('ECU ID จากรถ')&&
    (await page.locator('#n23Pane .n23-system-grid').innerText()).includes('สถานะการเชื่อมต่อ'),
    'real ECU system info tab shows physical ID and connection without a fabricated protocol label');
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
  assert.equal(await page.locator('#mainSourceTools').evaluate(el=>el.classList.contains('n20-hidden')),true,
   'Advanced Main C# tools remain hidden without Supabase admin authorization');
  assert.equal(await page.locator('#n20Stage .n20-tool-links button').count(),0,
   'No privileged tools are exposed to unapproved accounts');
  await overflowing('Unauthorised Tools '+width);
  await page.evaluate(()=>document.querySelector('#v20Nav [data-cat="settings"]').click());
  assert((await page.locator('#n20Stage').innerText()).includes('License'));
  await overflowing('Settings '+width);
  await page.evaluate(()=>document.querySelector('#v20Nav [data-cat="dashboard"]').click());
  if(width===393){
   await page.screenshot({path:path.join(root,'test-reports','neon-dashboard-393.png'),fullPage:false});
   // Diagnostic tests still exercise the legacy read-only transport backend through the redesigned DTC route.
   await page.evaluate(()=>window.__55NeonNavigate('dtc'));
   assert.equal(await page.locator('#live').evaluate(el=>el.classList.contains('on')),true,'DTC transport bridge opens');
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
 // The branded ECM library is real, backed by the untouched 152-row reference catalog.
 const ecmPage=await browser.newPage({viewport:{width:393,height:820},isMobile:true,hasTouch:true});
 await ecmPage.goto(new URL('/ecm/index.html',url).toString(),{waitUntil:'domcontentloaded',timeout:30000});
 await ecmPage.waitForFunction(()=>document.querySelectorAll('#results .entry').length===152,{timeout:10000});
 // ECM registry requires an authenticated advanced/admin role. Validate its
 // DOM-backed catalog without visually unlocking a protected customer screen.
 assert.equal(await ecmPage.locator('html').evaluate(el=>el.classList.contains('advanced-direct-granted')),false,
   'ECM registry must not unlock for a customer without administrator permission');
 assert((await ecmPage.locator('h1').textContent()).includes('55 Performance'),'ECM catalog retains owner branding');
 assert.equal((await ecmPage.locator('#total').textContent()).trim(),'152','catalog must retain 152 rows');
 assert(!(await ecmPage.locator('body').textContent()).includes('KTR Racing'),'old supplier branding must not appear in the UI');
 await ecmPage.evaluate(()=>{const search=document.getElementById('search');search.value='0101C60D01';
   search.dispatchEvent(new Event('input',{bubbles:true}));});
 assert((await ecmPage.locator('.entry').count())>=1,'search by genuine ECU ID still works');
 assert((await ecmPage.locator('.entry').first().textContent()).includes('55 Performance #'),
   'reference row retains branded display ID while admin gate is closed');
 await ecmPage.screenshot({path:path.join(root,'test-reports','55-performance-ecm-locked-393.png'),fullPage:false});
 await ecmPage.goto(new URL('/ktr/index.html?q=0101C60D01',url).toString(),{waitUntil:'domcontentloaded'});
 await ecmPage.waitForURL(/\/ecm\/index\.html\?q=0101C60D01/,{timeout:10000});
 await ecmPage.close();
 console.log('PASS branded ECM page, 152 rows, searchable ECU ID and backward compatible redirect.');
 console.log('PASS Neon V20 Chrome mobile screens: '+JSON.stringify(results,null,2));
 console.log('Static visual regression screenshots saved under test-reports/. No hardware ECU tests.');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}

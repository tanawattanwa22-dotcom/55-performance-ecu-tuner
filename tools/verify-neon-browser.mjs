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
  assert.equal(await page.locator('#modelCard').evaluate(el=>el.classList.contains('n20-hidden')),false);
  assert.equal(await page.locator('#flashCard').evaluate(el=>el.classList.contains('n20-hidden')),true);
  await overflowing('Library '+width);
  await page.evaluate(()=>document.querySelector('#v20Nav [data-cat="flash"]').click());
  assert.equal(await page.locator('#flashCard').evaluate(el=>el.classList.contains('n20-hidden')),false);
  assert.equal(await page.locator('#btnFlash').evaluate(el=>el.hidden),true,'no flash before saved BIN');
  await overflowing('Flash '+width);
  const flashButtons=await page.evaluate(()=>[...document.querySelectorAll('#flashCard .btn:not([hidden])')].map(b=>{
   const r=b.getBoundingClientRect();return {name:b.id,left:r.left,right:r.right};
  }));
  for(const b of flashButtons)assert(b.left>=-2&&b.right<=width+2,
   'Flash action overflows '+width+'px: '+JSON.stringify(b));
  await page.evaluate(()=>document.querySelector('#v20Nav [data-cat="live"]').click());
  assert.equal(await page.locator('#liveCard').evaluate(el=>el.classList.contains('n20-hidden')),false);
  assert.equal(await page.locator('#flashCard').evaluate(el=>el.classList.contains('n20-hidden')),true);
  await overflowing('Live entry '+width);
  await page.evaluate(()=>document.querySelector('#v20Nav [data-cat="dtc"]').click());
  assert.equal(await page.locator('#liveCard').evaluate(el=>el.classList.contains('n20-hidden')),false);
  await overflowing('DTC entry '+width);
  if(width===393)await page.screenshot({path:path.join(root,'test-reports','neon-flash-393.png'),fullPage:false});
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
   await page.evaluate(()=>document.querySelector('#live .lvtabs [data-m="dtc"]').click());
   assert.equal(await page.locator('#vDtc').evaluate(el=>el.style.display==='none'),false,'original DTC mode opens');
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

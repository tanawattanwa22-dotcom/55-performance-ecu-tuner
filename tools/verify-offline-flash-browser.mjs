// V28 browser validation: install isolated offline service worker, disconnect
// the network, reload page and verify the same HondaFlashEngine still imports.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8'};
const srv=http.createServer((req,res)=>{
 try{
  const rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\/+/, '');
  const pathname=path.resolve(root,rel);
  if(!pathname.startsWith(root+path.sep))return res.writeHead(403).end();
  const stat=fs.statSync(pathname);if(!stat.isFile())return res.writeHead(404).end();
  res.writeHead(200,{'Content-Type':mime[path.extname(pathname)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(pathname).pipe(res);
 }catch(e){res.writeHead(404).end('404')}
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
let browser,ctx;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 ctx=await browser.newContext({viewport:{width:393,height:840},isMobile:true,hasTouch:true,serviceWorkers:'allow'});
 const page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',msg=>{if(msg.type()==='error')console.error('BROWSER CONSOLE:',msg.text())});
 page.on('requestfailed',req=>console.error('BROWSER REQUEST FAIL:',req.url(),req.failure()?.errorText));
 page.on('response',res=>{if(res.status()>=400)console.error('BROWSER HTTP',res.status(),res.url())});
 const url='http://127.0.0.1:'+srv.address().port+'/flash_port/offline/index.html';
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForTimeout(1800);console.log('OFFLINE BOOT SNAPSHOT',await page.locator('#offlineFiles').innerText(),await page.locator('#offlineState').innerText(),JSON.stringify(errors));
 await page.waitForFunction(()=>/เก็บไฟล์ออฟไลน์ครบ|ไฟล์ออฟไลน์ยังไม่พร้อม/.test(document.getElementById('offlineFiles')?.textContent||''),{timeout:30000});
 assert.equal(await page.locator('#offlineFiles').evaluate(el=>el.classList.contains('ok')),true,'service worker install and 16 assets must be cached');
 assert.equal(await page.locator('#connect').isDisabled(),true,'cannot connect before signed permit');
 assert.equal(await page.locator('#write').isDisabled(),true,'cannot erase without verified license and plan');
 console.log('PASS offline SW installed and flash buttons are guarded');
 // Real issuer keys/receipts are never in CI; create a test-only ephemeral signing key.
 await page.evaluate(async()=>{
  const device='9faf900c-3644-4cd5-9336-9a4fd7986cdd';
  const sub='9faf900c-3644-4cd5-9336-9a4fd7986cde';
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const pub=await crypto.subtle.exportKey('jwk',pair.publicKey);
  const enc=new TextEncoder(), h=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(device)));
  const hash=[...h].map(n=>n.toString(16).padStart(2,'0')).join('');
  const now=Math.floor(Date.now()/1000);
  const c={v:1,purpose:'55-performance-offline-flash',sub,device_hash:hash,iat:now,exp:now+3600};
  const b64=x=>btoa(String.fromCharCode(...x)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const data=b64(enc.encode(JSON.stringify(c)));
  const sig=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,enc.encode(data)));
  localStorage.setItem('55_device_id',device);
  localStorage.setItem('55_perf_offline_issuer_pub_v1',JSON.stringify(pub));
  localStorage.setItem('55_perf_offline_permit_v1',data+'.'+b64(sig));
  localStorage.removeItem('55_perf_offline_last_clock_v1');
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.getElementById('offlineState')?.textContent.includes('OFFLINE READY'),{timeout:30000});
 assert.equal(await page.locator('#connect').isDisabled(),false,'signed permit grants local connection eligibility');
 console.log('PASS valid signed fixture recognized; no ECU accessed');
 await ctx.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded',timeout:20000});
 await page.waitForFunction(()=>document.getElementById('offlineState')?.textContent.includes('OFFLINE READY'),{timeout:20000});
 assert.equal(await page.locator('#offlineFiles').evaluate(el=>el.classList.contains('ok')),true,'all flash modules available with zero network');
 assert.equal(await page.locator('#connect').isDisabled(),false,'license can be validated without Supabase call');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3),true,'no horizontal overflow');
 console.log('PASS genuine browser network disconnection + full reload + offline Flash UI and cryptographic permit validation');
 await page.evaluate(()=>localStorage.setItem('55_perf_offline_permit_v1','forged.invalid'));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.getElementById('offlineState')?.textContent.includes('OFFLINE BLOCKED'),{timeout:20000});
 assert.equal(await page.locator('#connect').isDisabled(),true,'modified permit blocks connection');
 assert.equal(await page.locator('#write').isDisabled(),true,'modified permit blocks erase');
 assert.deepEqual(errors,[],'no unhandled browser exceptions');
 console.log('PASS invalid permit blocks offline flash');
 await ctx.setOffline(false);
 await page.goto('http://127.0.0.1:'+srv.address().port+'/flash_port/flash-write-lab.html',{waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('#offlineActivate').count(),0,'original online Flash Bench remains an independent page');
 assert.equal(await page.locator('#check').count(),1,'original online License button remains');
 const controlling=await page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL||'');
 assert(!controlling.includes('/flash_port/offline/sw.js'),'offline worker MUST NOT control original bench');
 console.log('PASS original Flash Bench remains separate and outside offline worker scope');

}finally{await ctx?.close();await browser?.close();await new Promise(ok=>srv.close(ok))}

import {chromium} from 'playwright';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const server=http.createServer((q,r)=>{try{const p=path.join(root,new URL(q.url,'http://localhost').pathname);r.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');r.end(fs.readFileSync(p));}catch{r.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:393,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 await page.waitForFunction(()=>window.__55SharedEcu);
 await page.evaluate(()=>{
  document.getElementById('licenseGate')?.remove();document.getElementById('spl')?.remove();
  const port={ready:true,exchangeRaw:async f=>{const reply=Uint8Array.of(0x72,8,f[2],f[3],0,7,1,0);reply[7]=(-reply.slice(0,7).reduce((a,b)=>a+b,0))&255;return {reply}}};
  window.__55SharedEcu={port,snapshot:()=>({connected:true}),acquire:async()=>port,release:()=>{}};
  document.getElementById('dtcRead').click();
 });
 await page.waitForFunction(()=>document.getElementById('dtcMsg').textContent.includes('อ่านครบ 6'));
 assert((await page.locator('#dtcOut').textContent()).includes('7-1'));
 await page.evaluate(()=>document.getElementById('realFlashOnlineLink').click());
 await page.waitForSelector('dialog[open] iframe');
 assert.equal(await page.locator('dialog[open] iframe').count(),1);
 await page.waitForTimeout(150);
 assert.deepEqual(errors,[]);
 console.log('PASS mobile browser: shared DTC handler renders ECU faults; Flash opens embedded and retains main document; no runtime errors.');
}finally{await browser.close();await new Promise(r=>server.close(r));}

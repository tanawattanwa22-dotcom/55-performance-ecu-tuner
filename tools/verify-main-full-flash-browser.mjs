/* Mobile Chrome full-flash in-memory simulator regression. No ECU/USB access. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8'};
const server=http.createServer((req,res)=>{
 try{
  const relative=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\/+/, '');
  const target=path.resolve(root,relative);
  if(!target.startsWith(root+path.sep))return res.writeHead(403).end();
  if(!fs.statSync(target).isFile())return res.writeHead(404).end();
  res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(target).pipe(res);
 }catch{res.writeHead(404).end('not found')}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser=null;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:393,height:850},isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'usb',{configurable:true,value:{
   requestDevice(){throw Error('SIM TEST TRIED TO ACCESS USB')}
  }});
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/flash_port/main-full-flash-simulator.html',{waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('[data-test]').count(),4);
 for(const type of ['kh','sh','rec','384']){
  await page.locator('[data-test="'+type+'"]').click();
  await page.waitForFunction(()=>/^(PASS|FAIL) · SIMULATOR$/.test(document.getElementById('status').textContent),{timeout:20000});
  const state=await page.locator('#status').innerText();
  assert.equal(state,'PASS · SIMULATOR',type+': '+await page.locator('#out').innerText());
  assert((await page.locator('#out').innerText()).includes('PASS'),type+' summary missing');
  console.log('PASS mobile simulator '+type);
 }
 assert.deepEqual(errors,[],'no browser runtime errors');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3),true,'no horizontal overflow');
 await page.close();
}finally{await browser?.close();await new Promise(ok=>server.close(ok))}
console.log('PASS simulated flash source paths in Chrome; no FTDI/USB calls.');

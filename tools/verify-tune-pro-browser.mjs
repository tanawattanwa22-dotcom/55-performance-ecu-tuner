/* TUNE PRO browser regression with OFFLINE synthetic BIN data ONLY.
   No WebUSB, ECU command, actual write, recovery or real firmware changes. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8',
 '.css':'text/css;charset=utf-8','.json':'application/json','.png':'image/png',
 '.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 try{
  const p=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)
   .replace(/^\/+/, '')||'index.html';
  const file=path.resolve(root,p);
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  if(!fs.statSync(file).isFile()){res.writeHead(404).end();return}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404).end('Not found')}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const url='http://127.0.0.1:'+server.address().port+'/index.html';
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 fs.mkdirSync(path.join(root,'test-reports'),{recursive:true});
 for(const [width,height] of [[1366,768],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:width<900,
   hasTouch:width<900,acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#neonShell',{state:'attached',timeout:15000});
  await page.evaluate(()=>{
   document.getElementById('licenseGate').style.visibility='hidden';
   document.getElementById('spl').style.visibility='hidden';
   // UI-only fixture. Every value is known; no production/calibration data.
   const num=1024,b=new Uint8Array(num);
   b.set([75,49,77,65],1); // 'K1MA' exactly matches fixture model family
   for(let i=100;i<num;i++)b[i]=120;
   S.mi=0;S.custom=true;S.bin=b;S.orig=b.slice();S.fname='TUNE_PRO_UI_FIXTURE.bin';
   S.idStr='K1MA';S.undo=[];S.redo=[];S.saved=null;S.sel=null;
   DEFS[MODELS[0].id]={tables:[
    {t:'Fuel Injection',g:'น้ำมัน',u:'ms',a:100,r:5,c:8,b:8,sg:0,le:0,cs:1,rs:8,eq:'X',mn:0,mx:255,d:0},
    {t:'Ignition Advance',g:'ไฟ',u:'°',a:200,r:5,c:8,b:8,sg:0,le:0,cs:1,rs:8,eq:'X',mn:0,mx:255,d:0},
    {t:'AFR Target',g:'AFR',u:'AFR',a:300,r:5,c:8,b:8,sg:0,le:0,cs:1,rs:8,eq:'X',mn:0,mx:255,d:0},
    {t:'Idle Fuel',g:'น้ำมัน',u:'ms',a:400,r:5,c:8,b:8,sg:0,le:0,cs:1,rs:8,eq:'X',mn:0,mx:255,d:0}
   ],sw:[]};
   M=null;openTune();
  });
  await page.waitForFunction(()=>document.querySelector('#tune.tp-on.on .tp-shell')&&
   window.__55TuneProUI?.getLayout&&
   document.querySelectorAll('#tune .tp-side-item').length>=4);
  // V4: duplicate floating back must not cover Undo/toolbar on Tune.
  assert.equal(await page.locator('#retailGlobalBack').evaluate(el=>getComputedStyle(el).display),'none',
   'legacy global Back must be hidden on Tune (the header Back remains)');
  assert.equal(await page.locator('#tune .tp-save-now').count(),1);
  assert.equal(await page.locator('#tune .tp-flash-now').count(),1);
  assert.equal(await page.locator('#tune .tp-flash-now').isDisabled(),true,
   'Flash action is grey/disabled before an actual saved BIN snapshot');
  // The old 'ย่อ' must close the entire value dock, not just its contents.
  await page.evaluate(()=>{
   const toggle=document.querySelector('#tune .tp-mainbar [aria-label="เปิดหรือปิดเครื่องมือปรับค่า"]');
   if(!window.__55TuneProUI.getLayout().rightOpen)toggle.click();
   document.getElementById('fpc').click();
  });
  assert.equal(await page.evaluate(()=>window.__55TuneProUI.getLayout().rightOpen),false,
   'minimize closes the entire right dock and frees the grid');
  assert.equal(await page.locator('#tune .tp-side-item').count(),4,'all original fixture tables in sidebar');
  assert.equal(await page.locator('#tune .tp-side-item.tp-fuel').count(),2);
  assert.equal(await page.locator('#tune .tp-side-item.tp-ign').count(),1);
  assert.equal(await page.locator('#tune .tp-side-item.tp-afr').count(),1);
  assert.equal(await page.locator('#tune #gw table.g tbody td').count(),40,'real main grid rows and cols');
  assert.equal(await page.locator('#tune .tp-toolbar #btnSave').count(),1,
   'actual Save BIN button moved, never cloned');
  assert.equal(await page.locator('#tune .tp-toolbar #btn3d').count(),1);
  assert.equal(await page.locator('#tune .tp-tool-host #vStep').count(),1);
  assert.equal(await page.locator('#tune .tp-toolbar #btnToFlash').count(),1);
  assert.equal(await page.locator('#tune #tabs .chip').count(),5,
   'original hidden tabs persist and original selectors still exist');
  // Keep the original change propagation in a single BIN, no extra data copy.
  const initial=await page.evaluate(()=>S.bin[100]);
  assert.equal(initial,120);
  await page.locator('#tune .tp-main #gw td[data-r="0"][data-c="0"]').click();
  await page.evaluate(()=>{document.querySelector('#vStep').value='3'});
  await page.evaluate(()=>document.querySelector('#tune #fp [data-op="stepp"]').click());
  assert.equal(await page.evaluate(()=>S.bin[100]),123,'original editor modifies actual BIN');
  await page.evaluate(()=>document.querySelector('#tune .bb [data-op="undo"]').click());
  assert.equal(await page.evaluate(()=>S.bin[100]),120,'original Undo restores BIN bytes');
  await page.evaluate(()=>document.querySelector('#tune .bb [data-op="redo"]').click());
  assert.equal(await page.evaluate(()=>S.bin[100]),123,'original Redo replays edit');
  // Toolbar Copy/Paste must call the ORIGINAL runOp() and commit to BIN.
  await page.evaluate(()=>document.querySelector('#tune .tp-toolbar-extra button:nth-child(4)').click());
  await page.evaluate(()=>document.querySelector('#tune #gw td[data-r="0"][data-c="1"]').click());
  await page.evaluate(()=>document.querySelector('#tune .tp-toolbar-extra button:nth-child(5)').click());
  assert.equal(await page.evaluate(()=>S.bin[101]),123,'real toolbar Copy/Paste writes BIN through original commit()');
  await page.evaluate(()=>document.querySelector('#tune .bb [data-op="undo"]').click());
  assert.equal(await page.evaluate(()=>S.bin[101]),120,'Undo reverts toolbar Paste without touching other cells');
  // Saving stores a named BIN inside IndexedDB — never starts a .bin download.
  const downloadEvents=[];
  page.on('download',entry=>downloadEvents.push(entry));
  page.on('dialog',dialog=>dialog.type()==='prompt'?
   dialog.accept('Fixture Tune 01'):dialog.accept());
  await page.evaluate(()=>document.querySelector('#tune #btnSave').click());
  await page.waitForFunction(()=>!!S.saved?.vaultId,{timeout:15000});
  const library=await page.evaluate(()=>window.__55TunedBinVault.list());
  assert(library.some(x=>x.name==='Fixture Tune 01'&&x.sha256&&x.size===1024),
   'named tuned-BIN stored with integrity hash in browser vault');
  assert.equal(downloadEvents.length,0,'Save must NOT download .bin to customer device');
  assert.equal(await page.evaluate(()=>S.saved?.rawAtSave?.[100]),123,
   'real saved snapshot holds the current edited BIN');
  assert.equal(await page.evaluate(()=>document.querySelector('#tune #btnToFlash').hidden),false,
   'existing Tune-to-Flash action requires an exact saved snapshot');
  await page.waitForFunction(()=>!document.querySelector('#tune .tp-flash-now')?.disabled);
  await page.locator('#tune .tp-flash-now').click();
  assert.equal(await page.locator('.tp-flash-dialog').evaluate(el=>el.open),true,
   'ready action opens 12V/cable preparation dialog');
  await page.waitForFunction(()=>document.querySelectorAll('.tp-flash-vault-select option').length>1);
  assert.equal(await page.locator('.tp-flash-vault-select').inputValue(),
   await page.evaluate(()=>S.saved.vaultId),'newly saved BIN preselected from own vault');
  assert.equal(await page.locator('.tp-flash-dialog input[data-check]').count(),3);
  assert.equal(await page.locator('.tp-flash-accept').isDisabled(),true,
   'no USB: real ECU flash must remain blocked after saving a BIN');
  await page.locator('.tp-flash-dialog-actions button').first().click();

  // Later editing must invalidate the old snapshot before Flash.
  await page.evaluate(()=>{
   document.querySelector('#tune #gw td[data-r="0"][data-c="0"]').click();
   document.querySelector('#vStep').value='2';
   document.querySelector('#tune #fp [data-op="stepp"]').click();
  });
  assert.equal(await page.evaluate(()=>S.saved===null),true,
   'post-save edit invalidates snapshot; old flash cannot use stale bytes');
  assert.equal(await page.evaluate(()=>document.querySelector('#tune #btnToFlash').hidden),true,
   'Go to Flash re-hides after unsaved edits');
  await page.evaluate(()=>document.querySelector('#tune .tp-side-item[data-table="1"]').click());
  await page.waitForFunction(()=>window.__55TuneProAdapter.state().active===1);
  await page.waitForFunction(()=>document.querySelector('#tune .tp-preview-card'));
  assert.equal(await page.locator('#tune .tp-preview-card').count(),1,
   'switching tabs pins a LIVE preview of previous original BIN map');
  await page.waitForFunction(()=>{
   const actual=String(S.bin[100]);
   return (document.querySelector('#tune .tp-preview-grid')?.textContent||'').includes(actual);
  });
  assert.equal(await page.evaluate(()=>S.bin[100]),125,
   'post-save edit reaches same original BIN observed by preview');
  await page.evaluate(()=>document.querySelector('#tune .tp-side-item[data-table="2"]').click());
  await page.waitForFunction(()=>window.__55TuneProAdapter.state().active===2);
  await page.waitForFunction(()=>document.querySelectorAll('#tune .tp-preview-card').length===2);
  assert.equal(await page.locator('#tune .tp-preview-card').count(),2,
   'two actual maps visible as simultaneous previews');
  await page.evaluate(()=>document.querySelector('#tune .tp-preview-card button').click());
  assert.equal(await page.evaluate(()=>window.__55TuneProAdapter.state().active),0,
   'preview Open switches the REAL editor table');
  await page.evaluate(()=>document.querySelector('#tune #btn3d').click());
  assert.equal(await page.locator('#o3d').evaluate(e=>e.style.display!=='none'),true,
   'original 3D map tool opens from real moved button');
  await page.evaluate(()=>document.querySelector('#o3x').click());

  // Verify visually that landscape tools overlay on phone (not shrink main grid).
  const layout=await page.evaluate(()=>{
   const grid=document.querySelector('#tune #gw'),box=grid.getBoundingClientRect();
   const row=grid.querySelector('table.g tbody tr');
   const rowHeight=row?.getBoundingClientRect().height||25;
   return {
    shell:document.querySelector('#tune .tp-shell').getBoundingClientRect().width,
    grid:document.querySelector('#tune .tp-main').getBoundingClientRect().width,
    gridHeight:box.height,
    visibleRows:Math.floor(box.height/rowHeight),
    gridBottomPadding:getComputedStyle(grid).paddingBottom,
    stepsVisible:getComputedStyle(document.getElementById('tuneFlow')).display!=='none',
    previewVisible:getComputedStyle(document.querySelector('#tune .tp-preview-zone')).display!=='none',
    statusVisible:getComputedStyle(document.querySelector('#tune .tp-status')).display!=='none',
    left:window.__55TuneProUI.getLayout().leftOpen,
    right:window.__55TuneProUI.getLayout().rightOpen,
    toolExists:!!document.querySelector('#tune .tp-tool-host #fp')
   };
  });
  assert.equal(layout.toolExists,true);
  if(width===844){
   assert(layout.grid>=width*0.83,'phone landscape main grid remains wide: '+JSON.stringify(layout));
   assert(layout.gridHeight>=165&&layout.visibleRows>=6,
    'LANDSCAPE GRID MUST SHOW AT LEAST 6 ROWS, not only 2: '+JSON.stringify(layout));
   assert.equal(layout.gridBottomPadding,'0px','legacy 75–148px Flash toolbar space is fully reclaimed');
   assert.equal(layout.stepsVisible,false,'steps are visually hidden on short landscape');
   assert.equal(layout.statusVisible,false,'status footer does not consume landscape grid height');
   assert.equal(layout.previewVisible,false,'multi-map stays collapsed until user deliberately opens it');
   const gridHeightBefore=layout.gridHeight;
   await page.evaluate(()=>document.querySelector('#tune .tp-mainbar .tp-cmd[title="แสดงหรือซ่อนตารางย่อย"]').click());
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('#tune .tp-preview-zone')).display!=='none');
   const gridHeightDuring=await page.evaluate(()=>document.querySelector('#tune #gw').getBoundingClientRect().height);
   assert(Math.abs(gridHeightDuring-gridHeightBefore)<=2,
    'opening floating Preview must NOT shrink real edit grid');
   await page.evaluate(()=>document.querySelector('#tune .tp-mainbar .tp-cmd[title="แสดงหรือซ่อนตารางย่อย"]').click());
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('#tune .tp-preview-zone')).display==='none');
   await page.evaluate(()=>document.querySelector('#tune .tp-mainbar button[aria-label="เปิดหรือปิดรายการตารางจูน"]').click());
   assert.equal(await page.evaluate(()=>window.__55TuneProUI.getLayout().leftOpen),true);
   await page.evaluate(()=>document.querySelector('#tune .tp-side-close').click());
   await page.evaluate(()=>document.querySelector('#tune .tp-mainbar button[aria-label="เปิดหรือปิดเครื่องมือปรับค่า"]').click());
   assert.equal(await page.evaluate(()=>window.__55TuneProUI.getLayout().rightOpen),true);
   assert((await page.locator('#tune .tp-tool-host #fp').isVisible()),'real tools slide in');
   // Screenshot must show the full unblocked editing table, not a tool overlay.
   await page.evaluate(()=>document.querySelector('#tune .tp-mainbar button[aria-label="เปิดหรือปิดเครื่องมือปรับค่า"]').click());
   assert.equal(await page.evaluate(()=>window.__55TuneProUI.getLayout().rightOpen),false);
  }
  await page.screenshot({path:path.join(root,'test-reports','tune-pro-landscape-'+width+'.png')});
  assert.deepEqual(errors,[],'TUNE PRO browser JS errors: '+errors.join(' | '));
  await page.close();
 }
 console.log('PASS TUNE PRO: landscape sidebar, tabs, real multi-map BIN previews, original edit/undo/redo, 3D, tool drawers');
}finally{await browser?.close();await new Promise(ok=>server.close(ok))}

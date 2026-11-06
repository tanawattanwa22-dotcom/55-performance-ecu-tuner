// Read-only UI regression. Synthetic engine events; no FT232R, no ECU, no erase/write.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSourceFlashProgress,beginSourceFlashProgress,progressWithPlan,
  updateSourceFlashProgress,displaySourceFlashProgress,flashClock,REFERENCE_GIORNO
} from '../ui/source-flash-progress-v1.js';
const text=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const index=text('index.html'),v24=text('ui/neon-preflight-v24.js'),css=text('ui/neon-preflight-v24.css');
assert.equal(REFERENCE_GIORNO.seconds,234);
assert.equal(flashClock(234),'3:54');
assert.equal(flashClock(10),'0:10');
let p=beginSourceFlashProgress(0);
assert.equal(p.phase,'CONNECT');assert.equal(p.startedAt,0);
p=progressWithPlan(p,{ecuId:'0105040D01',profile:'SHINDENGENRH850',size:262144,
  startOffset:65536,blockBytes:128});
assert.equal(p.totalBytes,262144);assert.equal(p.startOffset,65536);
p=updateSourceFlashProgress(p,{phase:'SH_PREWRITE_BEGIN'},1000);
assert.equal(p.phase,'PREPARE');
for(let n=10;n>=1;n--){
 p=updateSourceFlashProgress(p,{phase:'SH_SECURITY_WAIT',secondsRemaining:n},(11-n)*1000);
 assert.equal(p.phase,'WAIT');assert.equal(p.barKind,'COUNTDOWN');assert.equal(p.barPercent,n*10);
 assert.equal(p.secondsRemaining,n);
}
p=updateSourceFlashProgress(p,{phase:'SH_GET_SEED'},11000);
assert.equal(p.phase,'AUTH');assert.equal(p.barPercent,0);assert.equal(p.barKind,'NONE');
p=updateSourceFlashProgress(p,{phase:'SH_ERASE_BEGIN'},13000);
assert.equal(p.phase,'ERASE');assert.equal(p.barKind,'INDETERMINATE');assert.equal(p.barPercent,0);
p=updateSourceFlashProgress(p,{phase:'SH_ERASE_ACKNOWLEDGED'},16000);
assert.equal(p.phase,'ERASE_OK');
p=updateSourceFlashProgress(p,{phase:'WRITE_PROGRESS',bytesCovered:65664,percent:25,blocksSent:1},18000);
assert.equal(p.phase,'WRITE');assert.equal(p.barPercent,25);
assert.equal(p.bytesSent,128); // NOT 65KiB physically written.
assert.equal(p.etaSeconds,null);
p=updateSourceFlashProgress(p,{phase:'WRITE_PROGRESS',bytesCovered:118784,percent:45,blocksSent:416},38000);
assert.equal(p.phase,'WRITE');assert(p.etaSeconds>0);
assert.equal(p.bytesSent,416*128);
const view=displaySourceFlashProgress(p,38000);
assert.equal(view.elapsedText,'0:38');
assert(view.remainingText.startsWith('≈ '));
p=updateSourceFlashProgress(p,{phase:'WRITE_PROGRESS',bytesCovered:262144,percent:100,blocksSent:1536},216000);
assert.equal(p.phase,'FINAL');assert.equal(p.barPercent,100);assert.equal(p.finishedAt,null,
 '100% coverage alone MUST NOT claim successful firmware write');
p=updateSourceFlashProgress(p,{phase:'FLASH_SOURCE_COMPLETE'},234000);
assert.equal(p.phase,'DONE');assert.equal(p.finishedAt,234000);
assert.equal(displaySourceFlashProgress(p,235000).elapsedText,'3:54');
const stopped=updateSourceFlashProgress(p,{phase:'FLASH_STOP',error:'USB_LOST',eraseMayHaveStarted:true},235000);
assert.equal(stopped.phase,'STOP');assert(stopped.detail.includes('USB_LOST'));
let keihin=beginSourceFlashProgress(0);
keihin=updateSourceFlashProgress(keihin,{phase:'SECURITY_WAIT',secondsRemaining:10},1000);
assert.equal(keihin.barPercent,100);assert.equal(keihin.phase,'WAIT');
assert(index.includes("inlineFlashStageEvent(ev);"),'actual writer callback must send real engine events to progress');
assert(index.includes("progressWithPlan(INLINEFLASH.stage,plan)"),'write plan must supply true BIN size/start offset/block size');
assert(index.includes("sourceFlashProgressModule.displaySourceFlashProgress"),'elapsed must be computed from real clock');
assert(v24.includes('window.__55FlashStageRender'), 'Fast Flash must paint stage UI');
assert(v24.includes('n24-source-progress'), 'stage panel must be on main Fast Flash screen');
assert(css.includes('.n24-source-track.n24-source-countdown'), 'real 100-to-zero countdown has distinct appearance');
assert(!index.includes("inlineFlashProgress(37)"), 'never fake 37% from competitor screenshot');
console.log('PASS: real source countdown 10->0, erase progress unknown, 128-byte ACK coverage, ETA, final ACK and stop without ECU commands');

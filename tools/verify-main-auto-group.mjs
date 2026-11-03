// Main.zip FM_diag.cs method_96 read-only auto group parity (NO DEVICE I/O).
import assert from 'node:assert/strict';
import {MainLiveSession,SOURCE_AUTO_PROBE_ORDER,acceptedSourceProbe} from '../flash_port/main-live-session.js';
import {MAIN_CAPTURE_COMMANDS} from '../flash_port/main-source-diagnostic.js';

let checks=0;
const test=(label,fn)=>{return Promise.resolve().then(fn).then(()=>{checks++;console.log('PASS '+label)})};
const sourceReply=(size=12,variant=false)=>{
 const b=new Uint8Array(size);b[0]=0x72;b[1]=size;b[2]=0x72;
 if(variant){b[9]=255;b[10]=255;}
 b[size-1]=(-b.slice(0,-1).reduce((a,x)=>a+x,0))&255;
 return b;
};
function bench(answers){
 const session=new MainLiveSession();
 const calls=[];
 let restores=0;
 session.ecuId='0101880D01';
 session.port={ready:true,lastDevice:{},async exchangeRaw(frame){
   calls.push(Array.from(frame));
   if(frame[0]!==0x72||frame[2]!==0x72||frame.length!==7)
    throw Error('Non-read-only frame in diagnostic probe');
   const chosen=answers[frame[3]];
   if(chosen==='TIMEOUT'){this.ready=false;throw Error('No response');}
   if(!chosen) return {reply:sourceReply(7),echoOK:true};
   return {reply:chosen,echoOK:true};
 }};
 session._reopenDiagnostic=async()=>{
  // Mock reopening the previously authorized FTDI after a timeout.
  restores++;session.port.ready=true;
 };
 return {session,calls,get restores(){return restores}};
}

await test('Purchased C# probe order is Group 7 then Group 4, with Group 1 fallback',()=>{
 assert.deepEqual(SOURCE_AUTO_PROBE_ORDER,[7,4,1]);
 assert.equal(MAIN_CAPTURE_COMMANDS[7][0][3],0x13);
 assert.equal(MAIN_CAPTURE_COMMANDS[4][0][3],0x17);
});
await test('Reject short or unconfirmed echo even when response is nonempty',()=>{
 assert.equal(acceptedSourceProbe(sourceReply(8),true),false);
 assert.equal(acceptedSourceProbe(sourceReply(12),false),false);
 assert.equal(acceptedSourceProbe(sourceReply(12),true),true);
});
await test('Auto picks Group 7 on first valid Honda diagnostic response',async()=>{
 const b=bench({0x13:sourceReply()});
 assert.equal(await b.session.detectGroup(),7);
 assert.deepEqual(b.calls.map(x=>x[3]),[0x13]);
 assert.equal(b.session.status().group,7);
});
await test('Auto recovers closed FTDI after a timed-out Group 7 and picks Group 4',async()=>{
 const b=bench({0x13:'TIMEOUT',0x17:sourceReply(12,true)});
 assert.equal(await b.session.detectGroup(),4);
 assert.equal(b.session.group4Variant,4);
 assert.equal(b.restores,1);
 assert.deepEqual(b.calls.map(x=>x[3]),[0x13,0x17]);
});
await test('Auto chooses Group 1 after both Group 7 and Group 4 do not respond',async()=>{
 const b=bench({0x13:'TIMEOUT',0x17:'TIMEOUT',0x11:sourceReply(12)});
 assert.equal(await b.session.detectGroup(),1);
 assert.equal(b.restores,2);
 assert.equal(b.session.status().group,1);
});
await test('Manual group selection does not masquerade as detected',()=>{
 const s=new MainLiveSession();
 s.setGroup(4);assert.equal(s.status().group,4);
 assert.equal(s.status().groupMode,4);
 s.setGroup('auto');assert.equal(s.status().group,'auto');
 assert.equal(s.status().groupMode,'auto');
});
await test('Stop request prevents further source probing',async()=>{
 const b=bench({});
 b.session.stopRequested=true;
 assert.equal(await b.session.detectGroup(),null);
 assert.equal(b.calls.length,0);
});
console.log(checks+'/'+checks+' Main C# group selection offline checks passed — no USB, erase or write.');

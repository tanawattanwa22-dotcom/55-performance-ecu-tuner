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
 const calls=[],timings=[];
 let restores=0;
 session.ecuId='0101880D01';
 session.port={ready:true,lastDevice:{},async exchangeRaw(frame,opts={}){
   calls.push(Array.from(frame));
   timings.push({opcode:frame[3],delay:opts.afterWriteMs});
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
 return {session,calls,timings,get restores(){return restores}};
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
 assert.deepEqual(b.timings,[{opcode:0x13,delay:30}],
  'FM_diag.method_96 Group 7 must sleep exactly 30ms after TX');
 assert.equal(b.session.status().group,7);
});
await test('Auto recovers closed FTDI after a timed-out Group 7 and picks Group 4',async()=>{
 const b=bench({0x13:'TIMEOUT',0x17:sourceReply(12,true)});
 assert.equal(await b.session.detectGroup(),4);
 assert.equal(b.session.group4Variant,4);
 assert.equal(b.restores,1);
 assert.deepEqual(b.calls.map(x=>x[3]),[0x13,0x17]);
 assert.deepEqual(b.timings,[{opcode:0x13,delay:30},{opcode:0x17,delay:50}],
  'FM_diag.method_96 Group 4 fallback must sleep 50ms, unlike Group 7');
});
await test('Auto chooses Group 1 after both Group 7 and Group 4 do not respond',async()=>{
 const b=bench({0x13:'TIMEOUT',0x17:'TIMEOUT',0x11:sourceReply(12)});
 assert.equal(await b.session.detectGroup(),1);
 assert.equal(b.restores,2);
 assert.equal(b.session.status().group,1);
 assert.deepEqual(b.calls.map(x=>x[3]),[0x13,0x17],
  'FM_diag.method_96 falls back to Group 1 WITHOUT a third probe');
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
// Regression: after an intermittent RX timeout Live must resume without a button click.
await test('Live automatically resumes after one transient read timeout on the same ECU',async()=>{
 let s;
 s=new MainLiveSession(()=>{},()=>s.stop());
 s.port={ready:true,lastDevice:{},async sourceDiagnosticWake(){}};
 s.ecuId='0101880D01';s.group=4;s.running=true;
 let cycles=0,recovered=0;
 const trace=new Uint8Array(100);
 trace[12]=4;trace[13]=210;trace[15]=80;trace[17]=125;trace[24]=138;trace[22]=138;trace[46]=128;trace[60]=128;
 s._cycle=async()=>{if(++cycles===1)throw Error('simulated FTDI timeout');return trace;};
 s._restoreLiveReadOnly=async id=>{assert.equal(id,'0101880D01');recovered++;return true;};
 await s._loop();
 assert.equal(recovered,1,'read-only session should reopen once');
 assert.equal(s.sampleSeq,1,'Live must read and decode a fresh sample after recovery');
 assert.equal(s.liveAutoRecoveries,1);
 assert.equal(s.error,'');
});
await test('User Stop cancels automatic read-only recovery without continuing capture',async()=>{
 const s=new MainLiveSession();
 s.port={ready:true,lastDevice:{},async sourceDiagnosticWake(){}};
 s.ecuId='0101880D01';s.group=4;s.running=true;
 let restored=0;
 s._cycle=async()=>{throw Error('timeout')};
 s._restoreLiveReadOnly=async()=>{restored++;s.stop();return false;};
 await s._loop();
 assert.equal(restored,1);
 assert.equal(s.running,false);
 assert.equal(s.liveAutoRecoveries,0);
});
await test('Changing ECU ID during auto-reconnect must stop Live instead of displaying stale samples',async()=>{
 const s=new MainLiveSession();
 s.port={ready:true,lastDevice:{},async sourceDiagnosticWake(){}};
 s.ecuId='0101880D01';s.group=4;s.running=true;
 s._cycle=async()=>{throw Error('timeout')};
 let recoveries=0;
 s._restoreLiveReadOnly=async()=>{recoveries++;const err=Error('ECU ID changed');err.code='LIVE_ECU_CHANGED';throw err;};
 await s._loop();
 assert.equal(recoveries,1);
 assert.equal(s.running,false);
 assert.equal(s.sampleSeq,0);
 assert.match(s.error,/ECU ID changed/);
});
console.log(checks+'/'+checks+' Main C# group selection offline checks passed — no USB, erase or write.');

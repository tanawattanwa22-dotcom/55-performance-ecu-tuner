import assert from 'node:assert/strict';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const mockUsb={
  getDevices:async()=>[],
  addEventListener:()=>{},
  requestDevice:async()=>{throw Error('USB picker must not be required in offline tests')}
};
Object.defineProperty(globalThis,'navigator',{
  configurable:true,writable:true,value:{usb:mockUsb}
});

const {Ft232rWebUsb,READ_ONLY_COMMANDS,stripFtdiStatus}=
  await import('../flash_port/ftdi-webusb.js?usb-first-connect-regression=1');
const {MainLiveSession}=
  await import('../flash_port/main-live-session.js?usb-first-connect-regression=1');

assert.equal(stripFtdiStatus([0x01,0x60]).data.length,0,
  'FTDI two status bytes are USB data, not an ECU reply');

const physical={
  vendorId:0x0403,productId:0x6001,
  serialNumber:'TEST-FT232R-ORIGINAL',opened:true,
  transferIn:async()=>{await wait(8);return {
    status:'ok',data:new DataView(Uint8Array.from([0x01,0x60]).buffer)
  }},
  controlTransferOut:async()=>({status:'ok'}),
  releaseInterface:async()=>{},
  close:async()=>{}
};

function makePort(device=physical){
 const port=new Ft232rWebUsb();
 let closes=0,writes=0,purges=0;
 port.dev=device;port.lastDevice=device;port.itf=0;
 port.inEp=1;port.outEp=2;port.maxPacketSize=64;
 port.ready=true;port.uartConfigured=true;
 port._write=async()=>{writes++};
 port.purge=async()=>{purges++};
 const realClose=port.close.bind(port);
 port.close=async()=>{closes++;await realClose()};
 return {port,stats:()=>({closes,writes,purges})};
}

{
 const {port,stats}=makePort();
 await assert.rejects(
  ()=>port.command('ID',{timeoutMs:90}),
  /ECU did not reply.*FT232R remains connected/,
  'ECU silence should be distinct from actual USB disconnect'
 );
 assert.equal(port.ready,true,'FT232R remains claimed after no ECU ID');
 assert.equal(stats().closes,0,'No close on ECU-only timeout');
 assert.equal(port.lastDiagnosticObservation?.answered,false);
 assert.equal(port.lastDiagnosticObservation?.label,'ID');
 assert.equal(port.lastDiagnosticObservation?.uartBytes,0);
 assert.equal(port.lastDiagnosticObservation?.statusPackets>0,true);
 assert.equal(stats().writes,1,'One ID frame only');
 await port.close();
}

{
 const {port,stats}=makePort();
 const group=[
  [0x72,0x05,0x74,0x01,0x14],
  [0x72,0x05,0x74,0x02,0x13],
  [0x72,0x05,0x74,0x03,0x12]
 ];
 await assert.rejects(
  ()=>port.exchangeMainDiagnosticBurst(group,{timeoutMs:120}),
  /diagnostic burst incomplete.*USB remains connected/i,
  'Silent ECU memory should not tear down an otherwise healthy FT232R'
 );
 assert.equal(port.ready,true,'Bulk diagnostics ECU silence keeps cable opened');
 assert.equal(stats().closes,0,'No extra USB chooser or reopen');
 await port.close();
}

{
 const {port,stats}=makePort();
 await assert.rejects(
  ()=>port._readOnce(Date.now()-1),
  /ECU response window expired/,
  'Expired protocol window without an active USB request is safe'
 );
 assert.equal(stats().closes,0);
 await port.close();
}

{
 const {port,stats}=makePort({
  ...physical,
  transferIn:()=>new Promise(()=>{})
 });
 await assert.rejects(
  ()=>port._readOnce(Date.now()+55),
  /FTDI USB bulk IN stalled/,
  'A truly stalled un-cancellable WebUSB IN must close the interface'
 );
 assert.equal(port.ready,false,'Stalled physical USB transfer is not reused');
 assert.equal(stats().closes,1,'Close a genuinely orphaned transfer once');
}

{
 const {port,stats}=makePort();
 const session=new MainLiveSession();
 session.port=port;
 session._selectedUsbDevice=physical;
 session.ecuId='0104080F01';
 // Chromium Android may return empty/temporary getDevices() after a
 // permission change. Do not invent physical unplug from an empty snapshot.
 for(let i=0;i<4;i++)await session.checkUsbPresence();
 assert.equal(session.status().connected,true,
  'Uncertain getDevices enumeration must not invent physical USB unplug');
 assert.equal(session.ecuId,'0104080F01','No false ECU data reset');
 assert.equal(stats().closes,0);
 // The actual hardware event is still definitive: release and clear state.
 assert.equal(session.handleUsbDetached(physical),true);
 assert.equal(session.status().connected,false);
 assert.equal(session.ecuId,'','Real USB detach clears stale ECU identity');
 await wait(0);
}


{
 const session=new MainLiveSession();
 let workerAttempts=0;
 const port={
  ready:true,
  lastDiagnosticObservation:{label:'ID',uartBytes:0,statusPackets:6,answered:false},
  sourceDiagnosticWake:async()=>{},
  command:async()=>{throw Error('ECU did not reply; FT232R still healthy')},
  initializeIso:async()=>{workerAttempts++},
  sendWake:async()=>{workerAttempts++},
  close:async()=>{workerAttempts++}
 };
 session.port=port;
 const detected=await session.rescanWithProgramming();
 assert.equal(detected,false,'No physical ECU attached is not a programming-ready session');
 assert.equal(session.status().connected,true,
  'First automatic diagnostic scan keeps FT232R connected without a motorcycle');
 assert.equal(session.status().ecuId,'');
 assert.equal(workerAttempts,0,
  'Do not cycle source programming handshake/open/close after status-only ECU silence');
 assert.equal(session.phase,'USB_READY_NO_ECU');
}


/* Android quick unplug/replug regression: the native chooser must be called
 * during the click, but the next USBDevice.open must wait for the old handle
 * to release. Never fake an ECU response or issue a write command. */
{
 const {Ft232rWebUsb: SessionFt232rWebUsb}=
  await import('../flash_port/ftdi-webusb.js?v=419');
 const oldChoose=SessionFt232rWebUsb.choose;
 const oldOpen=SessionFt232rWebUsb.prototype.openSelected;
 let finishOldClose,opened=0,chosen=0;
 const alreadyOpen={
  ready:true,trace:[],
  close:()=>new Promise(resolve=>{finishOldClose=resolve})
 };
 const reader=new MainLiveSession();
 reader.port=alreadyOpen;reader._selectedUsbDevice=physical;
 try{
  SessionFt232rWebUsb.choose=async()=>{
   chosen++;
   return {vendorId:0x0403,productId:0x6001,serialNumber:physical.serialNumber};
  };
  SessionFt232rWebUsb.prototype.openSelected=async function(device){
   opened++;this.dev={...device,opened:false};
   this.ready=true;this.trace=[];
  };
  assert(reader.handleUsbDetached(physical),'unplug triggers asynchronous release');
  const next=reader.connect({forcePicker:true});
  await wait(0);
  assert.equal(chosen,1,'replug invokes new chooser immediately, without awaiting stale release');
  assert.equal(opened,0,'never invoke USBDevice.open while previous close is unfinished');
  finishOldClose();
  assert.equal(await next,true,'next selected FT232R opens once release completes');
  assert.equal(opened,1,'one new USB open, not multiple automatic retries');
  assert.equal(reader.status().connected,true);
  await reader.disconnect();
 }finally{
  SessionFt232rWebUsb.choose=oldChoose;
  SessionFt232rWebUsb.prototype.openSelected=oldOpen;
 }
}

/* The real USB disconnect event must never attempt I/O on a physically
 * detached FT232R: control, release and close may hang in Android Chromium. */
{
 let io=0;
 const disconnected={
  opened:true,
  controlTransferOut:async()=>{io++},
  releaseInterface:async()=>{io++},
  close:async()=>{io++}
 };
 const port=new Ft232rWebUsb();
 port.dev=disconnected;port.itf=0;port.ready=true;
 await port.close({detached:true});
 assert.equal(io,0,'do not make WebUSB calls on detached Android USB handle');
 assert.equal(port.ready,false);
 assert.equal(port.dev,null);
}
/* An old pending Android chooser must not restore a stale device after the
 * user disconnects and successfully starts a newer chooser. */
{
 const {Ft232rWebUsb: Cable}=
  await import('../flash_port/ftdi-webusb.js?v=419');
 const prevChoose=Cable.choose,prevOpen=Cable.prototype.openSelected;
 let resolveOld=null,attempts=0,opened=0;
 const device={vendorId:0x0403,productId:0x6001,serialNumber:'FRESH-USB'};
 const reader=new MainLiveSession();
 try{
  Cable.choose=()=>{
   attempts++;
   return attempts===1?new Promise(resolve=>{resolveOld=resolve}):Promise.resolve(device);
  };
  Cable.prototype.openSelected=async function(dev){
   opened++;this.dev={...dev,opened:false};this.ready=true;
  };
  const first=reader.connect({forcePicker:true});
  await wait(0);
  assert.equal(reader.status().connecting,true);
  await reader.disconnect();
  const second=reader.connect({forcePicker:true});
  resolveOld(device);
  assert.equal(await first,false,'outdated picker must not overtake new connection');
  assert.equal(await second,true,'new Android selection retains physical FT232R');
  assert.equal(opened,1,'old device must not be opened after disconnect');
  assert.equal(reader.status().connected,true);
  await reader.disconnect();
 }finally{
  Cable.choose=prevChoose;Cable.prototype.openSelected=prevOpen;
 }
}
/* Flash auto status observes a LIVE ECU ID, not a remembered BIN model.
 * Pure read-only commands must stop for any active port owner and clear
 * stale vehicle information after a failed ECU answer. No real USB used. */
{
 const reader=new MainLiveSession();
 let commands=0,wakes=0;
 let answer=true;
 reader.port={
  ready:true,sourceDiagnosticWake:async()=>{wakes++},
  command:async(name,opts)=>{
   assert.equal(name,'ID');
   assert.equal(opts.timeoutMs,2200,'preserve original ID timeout');
   commands++;
   if(!answer)throw Error('ECU removed from K-Line');
   return {echoOK:true,reply:Uint8Array.from([0,0,0,0,0,1,2,3,4,5,0])};
  }
 };
 let result=await reader.observeEcuIdReadOnly();
 assert.equal(result.state,'CONFIRMED');
 assert.equal(reader.status().ecuId,'0102030405');
 assert.equal(reader.status().ecuPresenceState,'CONFIRMED');
 assert.equal(commands,1);
 reader.owner='FLASH';
 result=await reader.observeEcuIdReadOnly();
 assert.equal(result.state,'BUSY','no monitor read when Flash owns FT232R');
 assert.equal(commands,1,'never issue extra ID during a write lease');
 reader.owner=null;
 reader.sourceProbe={expectedEcuId:'0102030405',sourceMatched:true};
 reader.dtcSnapshot={ecuId:'0102030405',success:true};
 answer=false;
 result=await reader.observeEcuIdReadOnly();
 assert.equal(result.state,'NO_ECU_REPLY');
 assert.equal(reader.status().connected,true,'FT232R remains connected without ECU');
 assert.equal(reader.status().ecuId,'','do not retain previous vehicle ID');
 assert.equal(reader.status().ecuPresenceState,'NO_REPLY');
 assert.equal(reader.status().sourceProbe,null,'invalidate prior source family evidence');
 assert.equal(reader.status().dtcSnapshot,null,'invalidate prior vehicle DTC evidence');
 assert.equal(wakes,2);
}
console.log('PASS FT232R USB-C: no stale chooser, no detached I/O, serialized replug and unchanged ECU timeouts');

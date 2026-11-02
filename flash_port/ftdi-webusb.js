/*
 * 55 PERFORMANCE — FT232R WebUSB transport, for controlled bench validation.
 * Protocol basis: owner's C# InitFtdiIso/SendCommand (not a Windows D2XX DLL).
 * FT232R only: VID 0403 PID 6001. No ECU erase/write methods exposed.
 */
export const FT232R_VID=0x0403, FT232R_PID=0x6001;
const FRAC_CODE=[0,3,2,4,1,5,6,7];
export function baudDivisor(baud){
  if(!Number.isInteger(baud)||baud<300||baud>3000000)throw Error('Unsupported baud rate');
  const divisor8=Math.round(24000000/baud);
  let encoded=(divisor8>>3)|(FRAC_CODE[divisor8&7]<<14);
  if(encoded===1)encoded=0;
  else if(encoded===0x4001)encoded=1;
  return {value:encoded&65535,index:(encoded>>>16)&65535,actual:3000000/(divisor8/8)};
}
export const toHex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join(' ').toUpperCase();
export function stripFtdiStatus(raw,packetSize=64){
  const bytes=Uint8Array.from(raw);
  if(!Number.isInteger(packetSize)||packetSize<8)throw Error('Invalid FTDI packet size');
  const output=[],status=[];
  for(let i=0;i<bytes.length;i+=packetSize){
    const last=Math.min(i+packetSize,bytes.length);
    if(last-i<2)throw Error('Truncated FTDI modem-status header');
    status.push([bytes[i],bytes[i+1]]);
    for(let p=i+2;p<last;p++)output.push(bytes[p]);
  }
  return {data:Uint8Array.from(output),status};
}
export function hondaChecksum(data){
  return (-Array.from(data).reduce((a,b)=>a+b,0))&255;
}
export function checkedHondaReply(data){
  if(!data||data.length<3||data.length>255)throw Error('Honda reply length is invalid');
  if(data[1]!==data.length)throw Error('Honda reply declared length differs');
  if(hondaChecksum(data)!==0)throw Error('Honda reply checksum mismatch');
  return Uint8Array.from(data);
}
export const READ_ONLY_COMMANDS=Object.freeze({
  WAKE:Object.freeze([0xfe,0x04,0x72,0x8c]),
  HELLO:Object.freeze([0x72,0x05,0x00,0xf0,0x99]),
  ID:Object.freeze([0x72,0x07,0x72,0x00,0x00,0x05,0x10]),
  FLASH_COUNT_KEIHIN:Object.freeze([0x7d,0x06,0x01,0x01,0x03,0x78])
});
function requireAllowed(command){
  if(!Object.values(READ_ONLY_COMMANDS).some(list=>list.length===command.length&&list.every((v,i)=>v===command[i]))){
    throw Error('Command not on the audited read-only allowlist');
  }
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export class Ft232rWebUsb {
  constructor(logger=()=>{}){this.log=logger;this.dev=null;this.itf=null;this.inEp=null;this.outEp=null;this.maxPacketSize=64;this.ready=false;this.terminated=false;this.trace=[];}
  static async choose(){
    if(!navigator.usb)throw Error('Chrome นี้ไม่รองรับ WebUSB หรือไม่ได้เปิดผ่าน HTTPS');
    return navigator.usb.requestDevice({filters:[{vendorId:FT232R_VID,productId:FT232R_PID}]});
  }
  _log(message){this.log(message);this.trace.push({at:new Date().toISOString(),message});}
  async ctl(req,value,index=0){
    if(!this.dev?.opened)throw Error('FTDI device not opened');
    const response=await this.dev.controlTransferOut({requestType:'vendor',recipient:'device',request:req,value,index});
    if(response.status!=='ok')throw Error('FTDI USB control 0x'+req.toString(16)+' failed: '+response.status);
  }
  async purge(){
    await this.ctl(0x00,1);
    await this.ctl(0x00,2);
  }
  async setBaud(baud){
    const div=baudDivisor(baud);
    // FT232R single-channel requests: high divisor bits live in wIndex.
    await this.ctl(0x03,div.value,div.index);
    this._log('baud requested '+baud+', nominal actual '+div.actual.toFixed(2));
  }
  async openSelected(dev){
    if(dev.vendorId!==FT232R_VID||dev.productId!==FT232R_PID)throw Error('Only verified FT232R 0403:6001 accepted');
    if(this.dev)throw Error('Close current device before connecting another');
    this.dev=dev;
    try{
      await dev.open();
      if(!dev.configuration)await dev.selectConfiguration(1);
      const configs=[];
      for(const itf of dev.configuration.interfaces){
        for(const alt of itf.alternates){
          const input=alt.endpoints.find(e=>e.type==='bulk'&&e.direction==='in');
          const output=alt.endpoints.find(e=>e.type==='bulk'&&e.direction==='out');
          if(input&&output)configs.push({itf:itf.interfaceNumber,alt:alt.alternateSetting,input,output});
        }
      }
      if(configs.length!==1)throw Error('Expected one FT232R bulk interface; found '+configs.length);
      const c=configs[0];
      await dev.claimInterface(c.itf);
      this.itf=c.itf;
      if(c.alt)await dev.selectAlternateInterface(c.itf,c.alt);
      this.inEp=c.input.endpointNumber;
      this.outEp=c.output.endpointNumber;
      this.maxPacketSize=c.input.packetSize||64;
      if(this.maxPacketSize<8)throw Error('Unsupported FT232R USB packet size');
      await this.ctl(0x00,0);
      await this.purge();
      await this.ctl(0x0b,0);           // UART mode, FT_SetBitMode(mask=0,mode=0)
      await this.ctl(0x04,0x0008);       // 8N1
      await this.ctl(0x02,0);            // no hardware flow control
      await this.ctl(0x09,8);            // C# D2XX latency = 8 ms
      await this.setBaud(10400);
      this.ready=true;
      this._log('FT232R opened; USB '+dev.vendorId.toString(16)+':'+dev.productId.toString(16)+', IN '+this.inEp+', OUT '+this.outEp+', packet '+this.maxPacketSize);
    }catch(err){
      await this.close();
      throw err;
    }
  }
  async _write(data){
    if(!this.ready)throw Error('FT232R is not ready');
    const b=Uint8Array.from(data);
    const result=await this.dev.transferOut(this.outEp,b);
    if(result.status!=='ok'||result.bytesWritten!==b.length)throw Error('FTDI short/failed USB write');
  }
  async initializeIso(){
    if(!this.ready)throw Error('FTDI not open');
    // Exact FT_SetBitMode and baud sequence from C# InitFtdiIso().
    // Do not run against ECU until electrical interface/pinout has been verified.
    await this.purge();
    await this.ctl(0x0b,0);
    await this.ctl(0x04,0x0008);
    await this.setBaud(921600);
    await this.ctl(0x09,8);
    await this.ctl(0x0b,0x0101); // mask 0x01 / async bit-bang mode 0x01
    await this._write([0x00]);
    await sleep(50);
    await this._write([0x01]);
    await this.ctl(0x0b,0);
    await this.setBaud(10400);
    await this.purge();
    await sleep(80);
    this._log('InitFtdiIso sequence complete (hardware reply not yet established)');
  }
  async _readOnce(deadline){
    if(Date.now()>=deadline)throw Error('FTDI response timed out');
    const remain=Math.max(1,deadline-Date.now());
    let timer;
    try{
      const wait=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FTDI USB read timeout; interface closed to avoid overlapping transfers')),remain)});
      const result=await Promise.race([this.dev.transferIn(this.inEp,this.maxPacketSize),wait]);
      if(result.status!=='ok')throw Error('FTDI read status '+result.status);
      if(!result.data)throw Error('FTDI read returned no bytes');
      const view=new Uint8Array(result.data.buffer,result.data.byteOffset,result.data.byteLength);
      return stripFtdiStatus(view,this.maxPacketSize);
    }catch(err){
      // transferIn has no AbortSignal; close on any read failure so next command
      // can never overlap an abandoned transfer.
      await this.close();
      throw err;
    }finally{clearTimeout(timer)}
  }
  async sendWake(){
    if(!this.ready)throw Error('Connect FT232R first');
    const wake=Uint8Array.from(READ_ONLY_COMMANDS.WAKE);
    requireAllowed(wake);
    await this.purge();
    await this._write(wake);
    this._log('TX WAKE (no reply required by C#): '+toHex(wake));
    // C# SendCommand attempts a short reply; failure is ignored before HELLO.
    await sleep(80);
    await this.purge();
  }
  async exchangeRaw(frame,{timeoutMs,afterWriteMs=0,expectReply=true}={}){
    // C# SendCommand-compatible echo + reply. This method can transmit an ECU
    // programming frame: callers must complete hardware/profile preflight.
    if(!this.ready)throw Error('FT232R not connected');
    if(this.exchangeBusy)throw Error('FTDI exchange already active');
    const bytes=Uint8Array.from(frame);
    if(bytes.length<3||bytes.length>256||bytes[1]!==bytes.length)
      throw Error('Invalid framed command length');
    if(hondaChecksum(bytes)!==0)throw Error('Incorrect command checksum');
    if(!Number.isFinite(afterWriteMs)||afterWriteMs<0||afterWriteMs>5000)
      throw Error('Invalid response delay');
    const timeout=timeoutMs??Math.min(6000,Math.max(700,200+bytes.length*10));
    if(!Number.isFinite(timeout)||timeout<80||timeout>15000)throw Error('Invalid response timeout');
    this.exchangeBusy=true;
    try {
      await this.purge();
      await this.ctl(0x09,8);
      await this._write(bytes);
      this._log('TX RAW '+toHex(bytes.length<=16?bytes:bytes.slice(0,16))+(bytes.length>16?' ... ('+bytes.length+' bytes)':''));
      if(!expectReply){await sleep(afterWriteMs);return {reply:null,echoOK:null}}
      if(afterWriteMs)await sleep(afterWriteMs);
      const end=Date.now()+timeout,stream=[];
      while(Date.now()<end){
        const rx=await this._readOnce(end);
        stream.push(...rx.data);
        if(stream.length>bytes.length+256+64)
          throw Error('Too many bytes without valid ECU reply');
        if(stream.length<bytes.length+2)continue;
        const echo=stream.slice(0,bytes.length);
        if(echo.some((v,i)=>v!==bytes[i]))throw Error('Serial echo does not match transmitted bytes');
        const size=stream[bytes.length+1];
        if(size<3||size>255)throw Error('ECU reply length invalid: '+size);
        if(stream.length<bytes.length+size)continue;
        const reply=Uint8Array.from(stream.slice(bytes.length,bytes.length+size));
        checkedHondaReply(reply);
        this._log('RX '+toHex(reply.length<=24?reply:reply.slice(0,24))+(reply.length>24?' ...':''));
        await this.purge();
        return {reply,echoOK:true};
      }
      throw Error('No complete ECU reply before timeout');
    }catch(error){
      this._log('STOP exchange: '+error.message);
      // Any ambiguous write response requires aborting the programming run.
      await this.close();
      throw error;
    }finally{this.exchangeBusy=false}
  }
  async command(label,{timeoutMs=500,afterWriteMs=0}={}){
    if(!this.ready)throw Error('Connect FT232R first');
    if(!Object.hasOwn(READ_ONLY_COMMANDS,label))throw Error('Unknown read-only action');
    const frame=Uint8Array.from(READ_ONLY_COMMANDS[label]);
    requireAllowed(frame);
    if(timeoutMs<80||timeoutMs>5000)throw Error('Invalid response window');
    await this.purge();
    const deadline=Date.now()+timeoutMs;
    await this._write(frame);
    this._log('TX '+label+': '+toHex(frame));
    if(afterWriteMs)await sleep(afterWriteMs);
    const stream=[];
    while(Date.now()<deadline){
      const received=await this._readOnce(deadline);
      for(const v of received.data)stream.push(v);
      if(stream.length>1024)throw Error('Response over 1024 bytes (malformed/noisy link)');
      // C# SendCommand: echo first commandSize bytes, then reply[1] = length.
      if(stream.length<frame.length+2)continue;
      const declared=stream[frame.length+1];
      if(declared<3||declared>255)throw Error('Invalid reply length '+declared);
      if(stream.length<frame.length+declared)continue;
      const echoed=stream.slice(0,frame.length);
      const echoOK=echoed.every((b,i)=>b===frame[i]);
      if(!echoOK)this._log('Warning: serial echo differs from outgoing command (inspect wiring)');
      const reply=stream.slice(frame.length,frame.length+declared);
      checkedHondaReply(reply);
      this._log('RX '+label+': '+toHex(reply)+(echoOK?'':' [echo mismatch]'));
      await this.purge();
      return {reply:Uint8Array.from(reply),echoOK,raw:Uint8Array.from(stream)};
    }
    await this.close();
    throw Error('Honda ECU response timed out');
  }
  async close(){
    const d=this.dev;this.ready=false;this.dev=null;
    if(d){
      try{if(d.opened)await d.controlTransferOut({requestType:'vendor',recipient:'device',request:0x0b,value:0,index:0})}catch{}
      try{if(this.itf!==null&&d.opened)await d.releaseInterface(this.itf)}catch{}
      try{if(d.opened)await d.close()}catch{}
    }
    this.itf=null;this._log('USB disconnected');
  }
}

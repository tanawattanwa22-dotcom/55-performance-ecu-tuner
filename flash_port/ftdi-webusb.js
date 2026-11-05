import {isSourceResetCountFrame} from './main-reset-count.js?v=301';
import {MAIN_DTC_CLEAR_SOURCE} from './main-dtc-clear-source.js?v=301';
/*
 * 55 PERFORMANCE — FT232R WebUSB transport, for controlled bench validation.
 * Protocol basis: owner's C# InitFtdiIso/SendCommand (not a Windows D2XX DLL).
 * FT232R only: VID 0403 PID 6001. No ECU erase/write methods exposed.
 */
export const FT232R_VID=0x0403, FT232R_PID=0x6001;
const FRAC_CODE=[0,3,2,4,1,5,6,7];
export const FAST_SWITCH_COMMAND=Object.freeze([0xFF,0x25,0x00,0x20,0x7C,0x00]); // C# WriteFlash array (KEIHINOTHER + fastWrite)
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
/** FT232R bulk-IN packet header byte #2 is UART Line Status.
 * FTDI D2XX Programmer's Guide and Linux ftdi_sio.h:
 * 0x02 overrun, 0x04 parity, 0x08 framing, 0x10 break, 0x80 FIFO error.
 * A command reply may still pass Honda's 8-bit checksum despite damaged
 * UART bytes; do not treat that response as a clean flash ACK.
 */
export function ftdiUartLineErrors(statusPackets){
 const errors=[];
 for(const pair of statusPackets||[]){
  const value=Number(pair?.[1]??0)&0xff;
  const flags=[['OVERRUN',0x02],['PARITY',0x04],['FRAMING',0x08],
    ['BREAK',0x10],['FIFO',0x80]];
  const found=flags.filter(([,mask])=>value&mask).map(([name])=>name);
  if(found.length)errors.push({rawLineStatus:value,flags:found});
 }
 return errors;
}
export function hondaChecksum(data){
  return (-Array.from(data).reduce((a,b)=>a+b,0))&255;
}
/** Original FormMain.cs SendCommand(): stopwatch limit 50 + 2*commandSize ms.
 * Starts AFTER FT_Write, FT_SetLatencyTimer(8) and any sleepMs.
 * WebUSB cannot cancel an in-flight bulk transfer; _readOnce safely closes
 * the port at this deadline rather than allowing stale USB read overlap.
 */
export function formMainSendCommandTimeoutMs(commandSize){
 if(!Number.isInteger(commandSize)||commandSize<1||commandSize>256)
  throw RangeError('Invalid source command size');
 return 50+2*commandSize;
}
/** Browser transport timeout, not the source ECU protocol timing.
 * Windows D2XX polls a native RX queue. Android WebUSB transferIn() is an
 * asynchronous USB request and needs a separate response deadline.
 * Preserve the source's 50+2*N minimum, honor the existing per-command
 * timeout requested by HondaFlashEngine, and never repeat an ambiguous
 * ERASE/WRITE command on expiry. The caller fails closed on timeout.
 */
export function webUsbSourceTimeoutMs(commandSize,requestedMs){
 const sourceMs=formMainSendCommandTimeoutMs(commandSize);
 if(requestedMs==null)return sourceMs;
 if(!Number.isInteger(requestedMs)||requestedMs<80||requestedMs>15000)
  throw RangeError('Invalid WebUSB source response timeout');
 return Math.max(sourceMs,requestedMs);
}
export function checkedHondaReply(data){
  if(!data||data.length<3||data.length>255)throw Error('Honda reply length is invalid');
  if(data[1]!==data.length)throw Error('Honda reply declared length differs');
  if(hondaChecksum(data)!==0)throw Error('Honda reply checksum mismatch');
  return Uint8Array.from(data);
}
/**
 * FormMain.cs SendCommand(): collected UART data consists of commandSize
 * echoed bytes followed by a framed reply. Source checks the reply length and
 * Checksum8BitHonda, but DOES NOT compare the echoed bytes with its TX frame.
 * Return null for incomplete or invalid captures, as the C# loop would wait.
 * This pure parser is also used by the live source Flash/Recovery transport.
 */
export function parseFormMainSendCommandReply(received,command){
 const rx=Uint8Array.from(received||[]);
 const tx=Uint8Array.from(command||[]);
 if(tx.length===0||rx.length<tx.length+2)return null;
 const replyLength=rx[tx.length+1];
 if(replyLength===0||rx.length-tx.length!==replyLength)return null;
 const reply=rx.slice(rx.length-replyLength);
 if(hondaChecksum(reply)!==0)return null;
 const echoOK=tx.every((v,i)=>v===rx[i]);
 return {reply,echoOK};
}
/** Decode the accumulated response from FM_diag.method_99() or
 * FM_dtc.method_110(): three/four writes, then a single serial read.
 * Incomplete results return null while Chrome waits for FTDI USB packets.
 */
export function parseMainDiagnosticBurst(raw,frames){
 const buffer=Uint8Array.from(raw||[]);
 if(!Array.isArray(frames)||!frames.length)throw Error('Missing Main diagnostic frames');
 let offset=0;const entries=[];
 for(const requested of frames){
  const cmd=Uint8Array.from(requested);
  if(buffer.length-offset<cmd.length+2)return null;
  const echoed=buffer.slice(offset,offset+cmd.length);
  const replySize=buffer[offset+cmd.length+1];
  if(replySize<3||replySize>255)throw Error('Source diagnostic reply length '+replySize+' invalid');
  const end=offset+cmd.length+replySize;
  if(end>buffer.length)return null;
  const reply=checkedHondaReply(buffer.slice(offset+cmd.length,end));
  entries.push({frame:cmd,reply,echoOK:cmd.every((b,i)=>b===echoed[i])});
  offset=end;
 }
 if(offset!==buffer.length)throw Error('Extra UART bytes after Main diagnostic burst: '+(buffer.length-offset));
 return {entries,raw:buffer};
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
// Read previously approved WebUSB grants at module load, BEFORE a user gesture.
// Never await getDevices() before requestDevice(), or Android may lose gesture activation.
let permittedFt232r=[];
const ft232rOnly=device=>device?.vendorId===FT232R_VID&&device?.productId===FT232R_PID;
if(typeof navigator!=='undefined'&&navigator.usb?.getDevices){
  navigator.usb.getDevices().then(devices=>{permittedFt232r=devices.filter(ft232rOnly)}).catch(()=>{});
  navigator.usb.addEventListener?.('connect',event=>{
    if(ft232rOnly(event.device)&&!permittedFt232r.includes(event.device))permittedFt232r.push(event.device);
  });
  navigator.usb.addEventListener?.('disconnect',event=>{
    permittedFt232r=permittedFt232r.filter(device=>device!==event.device);
  });
}
export class Ft232rWebUsb {
  constructor(logger=()=>{}){this.log=logger;this.dev=null;this.itf=null;this.inEp=null;this.outEp=null;this.maxPacketSize=64;this.ready=false;this.terminated=false;this.trace=[];this.uartConfigured=false;this.uartBusy=null;}
  static async choose({forcePicker=false}={}){
    if(!navigator.usb)throw Error('Chrome นี้ไม่รองรับ WebUSB หรือไม่ได้เปิดผ่าน HTTPS');
    // Reconnect without the Android picker only when ONE allowed FT232R is unambiguous.
    // If the OS reports several namesakes, let the user select; never guess a port.
    if(!forcePicker&&permittedFt232r.length===1)return permittedFt232r[0];
    const selected=await navigator.usb.requestDevice({filters:[{vendorId:FT232R_VID,productId:FT232R_PID}]});
    if(ft232rOnly(selected)){
      permittedFt232r=permittedFt232r.filter(device=>device!==selected);
      permittedFt232r.unshift(selected);
    }
    return selected;
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
    if(dev.vendorId!==FT232R_VID||dev.productId!==FT232R_PID)
      throw Error('FT232R ต้องเป็น USB 0403:6001; พบ '+Number(dev.vendorId).toString(16)+':'+Number(dev.productId).toString(16));
    if(this.dev)throw Error('FT232R instance นี้เปิดพอร์ตอยู่แล้ว');
    this.dev=dev;
    this.lastDevice=dev;
    let stage='ตรวจสิทธิ์อุปกรณ์';
    try{
      this._log('FT232R selected '+(dev.productName||'USB device')+' '+Number(dev.vendorId).toString(16)+':'+Number(dev.productId).toString(16));
      stage='เปิดอุปกรณ์ (device.open)';
      if(!dev.opened)await dev.open();
      this._log('USB device.open OK');
      stage='เลือก USB configuration';
      if(!dev.configuration)await dev.selectConfiguration(1);
      if(!dev.configuration?.interfaces?.length)throw Error('อุปกรณ์ไม่มี USB interface');
      const configs=[];
      for(const itf of dev.configuration.interfaces){
        for(const alt of itf.alternates||[]){
          const input=alt.endpoints?.find(e=>e.type==='bulk'&&e.direction==='in');
          const output=alt.endpoints?.find(e=>e.type==='bulk'&&e.direction==='out');
          if(input&&output)configs.push({itf:itf.interfaceNumber,alt:alt.alternateSetting,input,output,
            current:itf.alternate?.alternateSetting===alt.alternateSetting});
        }
      }
      if(!configs.length)throw Error('ไม่พบคู่ Bulk IN/OUT · ตรวจ VID/PID และ USB descriptor');
      // Some Android devices report multiple Alternate Settings for ONE
      // physical FT232R. They are not duplicate cables. Claim only one
      // interface and prefer its currently active/alternate 0 endpoint pair.
      const onZero=configs.filter(c=>c.itf===0);
      const choices=onZero.length?onZero:configs;
      if(new Set(choices.map(c=>c.itf)).size!==1)
        throw Error('USB รายงานหลาย Interface; ไม่สามารถเลือก FT232R อย่างปลอดภัย');
      choices.sort((a,b)=>Number(b.current)-Number(a.current)||Number(a.alt!==0)-Number(b.alt!==0)||a.alt-b.alt);
      const c=choices[0];
      this._log('USB descriptors: '+configs.length+' bulk alternate(s) / using interface '+c.itf+' alternate '+c.alt+
        ' IN '+c.input.endpointNumber+' OUT '+c.output.endpointNumber);
      stage='ยึด USB interface '+c.itf;
      const itf=dev.configuration.interfaces.find(x=>x.interfaceNumber===c.itf);
      if(itf?.claimed)throw Error('Interface '+c.itf+' ถูกใช้งานอยู่แล้วในเบราว์เซอร์ · ปิดแอป/แท็บที่ใช้สาย USB ก่อน');
      await dev.claimInterface(c.itf);
      this.itf=c.itf;
      this._log('USB claimInterface OK');
      if(c.alt!==itf?.alternate?.alternateSetting){
        stage='เลือก Alternate Setting '+c.alt;
        await dev.selectAlternateInterface(c.itf,c.alt);
      }
      this.inEp=c.input.endpointNumber;
      this.outEp=c.output.endpointNumber;
      this.maxPacketSize=c.input.packetSize||64;
      if(this.maxPacketSize<8)throw Error('Unsupported FT232R USB packet size '+this.maxPacketSize);
      // WebUSB cable connection is complete as soon as the bulk interface
      // is claimed. Do NOT perform any UART / K-Line control transfers here.
      // They belong to the later, explicit ECU diagnostic / programming stage.
      // This matches the owner's earlier standalone FTDI USB cable test.
      this.uartConfigured=false;
      this.ready=true;
      this._log('FT232R USB CONNECTED: interface '+this.itf+', IN '+this.inEp+', OUT '+this.outEp+
        ', packet '+this.maxPacketSize+'; UART setup pending until ECU action');
    }catch(err){
      const message='FT232R ['+stage+'] '+String(err?.message||err);
      this._log('OPEN FAILED '+message);
      try{await this.close()}catch(closeError){this._log('Close after failure: '+String(closeError?.message||closeError))}
      const error=new Error(message);error.name=err?.name||'UsbOpenError';
      throw error;
    }
  }
  async prepareUart(){
    if(!this.ready||!this.dev?.opened||this.itf===null)
      throw Error('ต้องเปิด FT232R USB interface ก่อนตั้ง UART');
    if(this.uartConfigured)return true;
    if(this.uartBusy)return this.uartBusy;
    // One configuration operation at a time. Failure leaves the physical
    // USB connection visible but forbids any ECU traffic until configured.
    this.uartBusy=(async()=>{
      let phase='FTDI reset UART';
      try{
        await this.ctl(0x00,0);
        phase='FTDI purge RX/TX';await this.purge();
        phase='FTDI UART mode';await this.ctl(0x0b,0);
        phase='FTDI 8N1';await this.ctl(0x04,0x0008);
        phase='FTDI flow control';await this.ctl(0x02,0);
        phase='FTDI latency';await this.ctl(0x09,8);
        phase='FTDI baud 10400';await this.setBaud(10400);
        this.uartConfigured=true;
        this._log('FT232R UART CONFIGURED for ECU session (no ECU reply confirmed)');
        return true;
      }catch(e){
        this.uartConfigured=false;
        const err=Error('FT232R UART ['+phase+']: '+String(e?.message||e));
        this._log(err.message);
        throw err;
      }
    })();
    try{return await this.uartBusy}finally{this.uartBusy=null}
  }
  async _write(data){
    if(!this.ready)throw Error('FT232R is not ready');
    const b=Uint8Array.from(data);
    const result=await this.dev.transferOut(this.outEp,b);
    if(result.status!=='ok'||result.bytesWritten!==b.length)throw Error('FTDI short/failed USB write');
  }
  async initializeIso({observe=null}={}){
    if(!this.ready)throw Error('FTDI not open');
    const trace=(phase,data={})=>{
      if(typeof observe!=='function')return;
      try{observe({phase,...data})}catch{} // tracing must never change ECU timing
    };
    await this.prepareUart();
    // Exact FT_SetBitMode and baud sequence from C# InitFtdiIso().
    // Do not run against ECU until electrical interface/pinout has been verified.
    this.diagnosticReady=false;
    await this.purge();
    await this.ctl(0x0b,0);
    await this.ctl(0x04,0x0008);
    await this.setBaud(921600);
    trace('SOURCE_BITBANG_BAUD_REQUESTED',{baud:921600});
    await this.ctl(0x09,8);
    await this.ctl(0x0b,0x0101); // mask 0x01 / async bit-bang mode 0x01
    trace('SOURCE_BITBANG_MODE_SET',{mode:1,mask:1});
    await this._write([0x00]);
    const lowWrittenAt=Date.now();
    trace('SOURCE_BITBANG_LOW_USB_WRITE_OK',{byte:'00'});
    await sleep(50);
    await this._write([0x01]);
    trace('SOURCE_BITBANG_HIGH_USB_WRITE_OK',{byte:'01',softwareTransferIntervalMs:Date.now()-lowWrittenAt});
    await this.ctl(0x0b,0);
    await this.setBaud(10400);
    trace('SOURCE_UART_RESTORED',{baud:10400});
    await this.purge();
    await sleep(80);
    trace('SOURCE_ISO_INIT_COMPLETED',{note:'USB command completion is not a measured K-Line waveform'});
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
  async sourceDiagnosticWake(session="diagnostic"){
    // FM_diag.cs method_25(): SerialPort 10400 8N1, Break 100/70/5/145,
    // FE 04 72 8C, then 72 05 71 00 18. Diagnostic ONLY, no flash commands.
    if(!this.ready)throw Error('FT232R must be open before Main diagnostic wake');
    await this.prepareUart();
    if(this.exchangeBusy)throw Error('Another FTDI exchange is active');
    this.exchangeBusy=true;
    try{
      await this.setBaud(10400);
      await this.ctl(0x04,0x0008); // 8N1, break off
      await sleep(100);
      await this.ctl(0x04,0x4008); // FTDI SIO_SET_DATA: BREAK ON
      await sleep(70);
      await this.ctl(0x04,0x0008); // BREAK OFF
      await sleep(5);
      await sleep(145);
      await this._write([0xfe,0x04,0x72,0x8c]);
      this._log('MAIN DIAG TX WAKE FE 04 72 8C');
      await sleep(30);
      await this.purge(); // C# discards output and ReadExisting before next write
      const sourceWake=session==="dtc"?[0x72,0x05,0x00,0xf0,0x99]:[0x72,0x05,0x71,0x00,0x18];
      await this._write(sourceWake);
      this._log('MAIN '+(session==="dtc"?'DTC':'LIVE')+' TX SESSION '+toHex(sourceWake));
      // FM_dtc.method_107 waits 30ms; FM_diag.method_25 waits 50ms.
      await sleep(session==="dtc"?30:50);
      // Match DiscardOutBuffer and ReadExisting before next source group.
      await this.purge();
      // Do not await transferIn here: Chrome has no cancellable bulk read.
      // The C# code reads only currently available bytes and can discard them.
      // A fresh group probe validates the next reply, not this wake alone.
      this.diagnosticReady=true;
      this._log('MAIN DIAG wake sequence sent; ECU response NOT YET VERIFIED');
    }catch(error){
      this._log('MAIN DIAG wake failed: '+String(error?.message||error));
      await this.close();
      throw error;
    }finally{
      if(this.dev?.opened)try{await this.ctl(0x04,0x0008)}catch{}
      this.exchangeBusy=false;
    }
  }
  async sendWake(){
    if(!this.ready)throw Error('Connect FT232R first');
    await this.prepareUart();
    const wake=Uint8Array.from(READ_ONLY_COMMANDS.WAKE);
    requireAllowed(wake);
    await this.purge();
    await this._write(wake);
    this._log('TX WAKE (no reply required by C#): '+toHex(wake));
    // Main FormMain.WorkerThread ignores the WAKE reply. Reproduce
    // SendCommand's 50+2*4 = 58ms response window before its final purge.
    // Do not leave the former invented 80ms wake delay in this source path.
    await sleep(formMainSendCommandTimeoutMs(wake.length));
    await this.purge();
  }
  /** FM_dtc.method_107: EXACT two clear commands, 50ms after each,
   * no ACK reads or UART purge between the two source writes.
   * We explicitly refuse to issue an invented bank-2 clear command.
   */
  async sendMainDtcClearFrames(frames){
    if(!this.ready)throw Error('FT232R not connected');
    await this.prepareUart();
    if(this.exchangeBusy)throw Error('FTDI exchange already active');
    const source=[MAIN_DTC_CLEAR_SOURCE.clearFirst,MAIN_DTC_CLEAR_SOURCE.clearSecond];
    if(!Array.isArray(frames)||frames.length!==2||frames.some((frame,i)=>
      frame.length!==source[i].length||frame.some((byte,j)=>byte!==source[i][j])))
      throw Error('DTC clear frames do not match purchased FM_dtc.method_107');
    this.exchangeBusy=true;
    let sent=0;
    try{
      for(const cmd of source){
        await this._write(cmd);
        sent++;
        this._log('MAIN DTC CLEAR TX '+toHex(cmd)+' (NO SOURCE ACK)');
        await sleep(50);
      }
      return {sent};
    }catch(error){
      // This is a count of completed WebUSB writes, NOT a verified ECU ACK.
      if(error&&typeof error==='object')error.dtcClearSent=sent;
      this._log('MAIN DTC CLEAR FAILED '+String(error?.message||error)+
        ' / completed USB writes '+sent+'/2');
      await this.close();
      throw error;
    }finally{this.exchangeBusy=false}
  }
  /** FM_diag.method_99 / FM_dtc.method_110: batch all source commands
   * before reading, instead of waiting for a reply after each command.
   */
  async exchangeMainDiagnosticBurst(frames,{timeoutMs=1600}={}){
    if(!this.ready)throw Error('FT232R not connected');
    await this.prepareUart();
    if(this.exchangeBusy)throw Error('FTDI exchange already active');
    if(!Array.isArray(frames)||![3,4].includes(frames.length))
      throw Error('Main diagnostic requires three DTC or four Live commands');
    const txs=frames.map(f=>Uint8Array.from(f));
    for(const frame of txs){
      if(![5,7].includes(frame.length)||frame[0]!==0x72||frame[1]!==frame.length||
         ![0x72,0x73,0x74].includes(frame[2])||hondaChecksum(frame)!==0)
        throw Error('Source diagnostic read-only command invalid');
    }
    if(!Number.isFinite(timeoutMs)||timeoutMs<100||timeoutMs>6000)
      throw Error('Diagnostic bulk receive timeout invalid');
    this.exchangeBusy=true;
    try{
      // Do not purge between writes: C# reads the accumulated raw capture.
      await this.purge();
      for(const frame of txs){
        await this._write(frame);
        this._log('MAIN DIAG BURST TX '+toHex(frame));
        await sleep(50);
      }
      const deadline=Date.now()+timeoutMs,uart=[];
      while(Date.now()<deadline){
        const rx=await this._readOnce(deadline);
        uart.push(...rx.data);
        if(uart.length>4096)throw Error('Main diagnostic burst too long');
        const result=parseMainDiagnosticBurst(uart,txs);
        if(result){
          this._log('MAIN DIAG BURST RX '+uart.length+' UART bytes / '+result.entries.length+' replies');
          await this.purge();
          return result;
        }
      }
      throw Error('Main diagnostic burst incomplete');
    }catch(error){
      this._log('MAIN DIAG BURST FAILED '+String(error?.message||error));
      await this.close();
      throw error;
    }finally{this.exchangeBusy=false}
  }
  async exchangeRaw(frame,{timeoutMs,afterWriteMs=0,expectReply=true,observe=null,mainSourceMode=false}={}){
    // C# SendCommand-compatible echo + reply. This method can transmit an ECU
    // programming frame: callers must complete hardware/profile preflight.
    if(!this.ready)throw Error('FT232R not connected');
    await this.prepareUart();
    if(this.exchangeBusy)throw Error('FTDI exchange already active');
    const bytes=Uint8Array.from(frame);
    // The ONE non-framed command in the C# source (Keihin Fast Write baud switch,
    // FormMain.cs WriteFlash) is accepted only as an exact byte match.
    const isFastSwitch=bytes.length===FAST_SWITCH_COMMAND.length&&FAST_SWITCH_COMMAND.every((v,i)=>bytes[i]===v);
    if(!isFastSwitch&&!isSourceResetCountFrame(bytes)){
      if(bytes.length<3||bytes.length>256||bytes[1]!==bytes.length)
        throw Error('Invalid framed command length');
      if(hondaChecksum(bytes)!==0)throw Error('Incorrect command checksum');
    }
    if(!Number.isFinite(afterWriteMs)||afterWriteMs<0||afterWriteMs>5000)
      throw Error('Invalid response delay');
    // Keep FormMain's original D2XX wait formula for parity, but give
    // Android WebUSB's asynchronous transfer its OWN deadline. Every caller
    // already supplies a per-command response budget (HELLO, ERASE, WRITE,
    // FINISH). A timeout still closes FT232R and aborts the write: no replay.
    // Diagnostic non-source clients retain their independent time windows.
    const timeout=mainSourceMode?webUsbSourceTimeoutMs(bytes.length,timeoutMs):
      (timeoutMs??Math.min(6000,Math.max(700,200+bytes.length*10)));
    if(!Number.isFinite(timeout)||timeout<(mainSourceMode?52:80)||timeout>15000)
      throw Error('Invalid response timeout');
    this.exchangeBusy=true;
    // Opt-in source-probe telemetry only. Ordinary Flash/Recovery keeps its
    // existing timing, read/write framing and failure-stop behavior unchanged.
    const telemetry=typeof observe==='function'?observe:null;
    let uartBytes=0,ftdiPackets=0,uartSample=[],usbChunks=0;
    let sent=false,echoConfirmed=false;
    const trace=(phase,fields={})=>{
      if(!telemetry)return;
      try{telemetry({phase,...fields})}catch{} // diagnostics cannot interrupt transfers
    };
    try {
      if(mainSourceMode)trace('SOURCE_TIMEOUT_WINDOW',{
        formula:'50+2*commandSize',commandSize:bytes.length,
        originalD2xxSourceMs:formMainSendCommandTimeoutMs(bytes.length),
        webUsbResponseDeadlineMs:timeout,
        commandRequestedMs:timeoutMs??null,
        sourceReplyRulesUnchanged:true});
      // Original FormMain.SendCommand() does FT_Write, then sets 8ms
      // latency and reads the command echo+reply. It purges AFTER the
      // exchange, never before each command. Preserve that source order
      // for the Flash/Recovery source path only.
      if(!mainSourceMode){
        await this.purge();
        await this.ctl(0x09,8);
      }
      await this._write(bytes);
      sent=true;
      if(mainSourceMode)await this.ctl(0x09,8);
      trace('USB_OUT_OK',{uartHex:toHex(bytes.slice(0,32)),bytesWritten:bytes.length});
      this._log('TX RAW '+toHex(bytes.length<=16?bytes:bytes.slice(0,16))+(bytes.length>16?' ... ('+bytes.length+' bytes)':''));
      if(!expectReply){await sleep(afterWriteMs);return {reply:null,echoOK:null}}
      if(afterWriteMs)await sleep(afterWriteMs);
      const end=Date.now()+timeout,stream=[];
      while(Date.now()<end){
        const rx=await this._readOnce(end);
        // Only enforce UART line-status bits in the source programming
        // exchange; do not change the already working Live Data reader.
        // Never retry a programming command when the UART was corrupted.
        if(mainSourceMode){
          const uartErrors=ftdiUartLineErrors(rx.status);
          if(uartErrors.length){
            trace('FTDI_UART_LINE_ERROR',{details:uartErrors,uartBytes:rx.data.length});
            throw Error('FT232R UART line error during ECU exchange: '+
              uartErrors.map(e=>e.flags.join('+')+' 0x'+e.rawLineStatus.toString(16)).join(', '));
          }
        }
        usbChunks++;
        ftdiPackets+=rx.status?.length||0;
        uartBytes+=rx.data.length;
        if(uartSample.length<96)uartSample.push(...rx.data.slice(0,96-uartSample.length));
        if(usbChunks<=32||rx.data.length>0){
          trace('USB_IN_CHUNK',{chunk:usbChunks,ftdiStatusPackets:rx.status?.length||0,
            uartBytes:rx.data.length,uartHex:toHex(rx.data.slice(0,96)),
            accumulatedUartBytes:uartBytes});
        }
        stream.push(...rx.data);
        if(stream.length>bytes.length+256+64)
          throw Error('Too many bytes without valid ECU reply');
        if(stream.length<bytes.length+2)continue;
        const echo=stream.slice(0,bytes.length);
        const echoMatches=echo.every((v,i)=>v===bytes[i]);
        // FormMain.SendCommand does not compare the echo bytes. The legacy
        // strict option is retained for non-FormMain diagnostic clients.
        if(!mainSourceMode&&!echoMatches)throw Error('Serial echo does not match transmitted bytes');
        if(!echoConfirmed){
          trace('SOURCE_ECHO_OBSERVED',{length:bytes.length,echoMatches,validatedBySource:!mainSourceMode});
          echoConfirmed=true;
        }
        const size=stream[bytes.length+1];
        if(!mainSourceMode&&(size<3||size>255))throw Error('ECU reply length invalid: '+size);
        if(stream.length<bytes.length+size)continue;
        let reply;
        if(mainSourceMode){
          const source=parseFormMainSendCommandReply(stream,bytes);
          if(!source)continue; // C# waits until timeout when reply/checksum invalid
          reply=source.reply;
        }else{
          reply=Uint8Array.from(stream.slice(bytes.length,bytes.length+size));
          checkedHondaReply(reply);
        }
        trace('SOURCE_REPLY_OK',{replyHex:toHex(reply.slice(0,96)),length:reply.length,
          status:reply.length>=5?reply[3]:null,
          rawByte3:reply[3],checksumValid:true});
        this._log('RX '+toHex(reply.length<=24?reply:reply.slice(0,24))+(reply.length>24?' ...':''));
        await this.purge();
        return {reply,echoOK:echoMatches};
      }
      throw Error('No complete ECU reply before timeout');
    }catch(error){
      const observedPhase=!sent?'WRITE_NOT_CONFIRMED':
        uartBytes===0?'NO_UART_DATA':
        uartBytes<bytes.length?'PARTIAL_ECHO':
        uartBytes===bytes.length?'ECHO_ONLY':
        echoConfirmed?'INCOMPLETE_ECU_REPLY':'UNVERIFIED_UART_DATA';
      trace('SOURCE_RX_FAILURE',{classification:observedPhase,error:String(error?.message||error),
        uartBytes,ftdiPackets,usbChunks,uartSampleHex:toHex(uartSample),
        echoConfirmed,portReady:!!this.ready});
      this._log('STOP exchange: '+error.message);
      // Any ambiguous write response requires aborting the programming run.
      await this.close();
      throw error;
    }finally{this.exchangeBusy=false}
  }
  async command(label,{timeoutMs=500,afterWriteMs=0}={}){
    if(!this.ready)throw Error('Connect FT232R first');
    await this.prepareUart();
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
    let usbStatusPackets=0;
    while(Date.now()<deadline){
      let received;
      try {
        received=await this._readOnce(deadline);
      }catch(error){
        // Diagnostic only. _readOnce() already closed the interface to
        // prevent the pending Chrome USB read from overlapping later I/O.
        const phase=stream.length===0?'NO_UART_RX':
          stream.length<frame.length?'PARTIAL_ECHO':
          stream.length===frame.length?'ECHO_ONLY':'PARTIAL_ECU_REPLY';
        const details=label+' '+phase+' ('+stream.length+' UART byte(s), '+
          usbStatusPackets+' FTDI status packet(s))';
        this._log('ECU READ DIAGNOSTIC: '+details+
          (stream.length?' RX='+toHex(stream.slice(0,32)):''));
        throw Error(details+'; '+error.message);
      }
      usbStatusPackets+=received.status?.length||0;
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
    const d=this.dev;this.ready=false;this.diagnosticReady=false;this.uartConfigured=false;this.uartBusy=null;this.dev=null;
    if(d){
      try{if(d.opened)await d.controlTransferOut({requestType:'vendor',recipient:'device',request:0x0b,value:0,index:0})}catch{}
      try{if(this.itf!==null&&d.opened)await d.releaseInterface(this.itf)}catch{}
      try{if(d.opened)await d.close()}catch{}
    }
    this.itf=null;this._log('USB disconnected');
  }
}

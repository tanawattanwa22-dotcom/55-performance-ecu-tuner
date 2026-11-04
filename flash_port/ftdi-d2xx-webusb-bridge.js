/* 55 PERFORMANCE — FT232R D2XX to WebUSB bridge.
 * Translates supported D2XX calls; not FTD2XX_NET.dll or a Windows driver.
 * Controller audit NEVER writes UART data or sends ECU commands.
 */
import {Ft232rWebUsb,FT232R_VID,FT232R_PID} from './ftdi-webusb.js';
export const D2XX_COVERAGE=Object.freeze({
 mapped:['FT_Open','FT_Close','FT_ResetDevice','FT_Purge','FT_SetBitMode (0/1)','FT_SetDataCharacteristics (8N1)','FT_SetBaudRate','FT_SetLatencyTimer','FT_SetTimeouts (software policy)'],
 conditional:['FT_Write (explicit transmit permission)','exchangeHondaFrame (existing WebUSB ECU protocol)'],
 unsupported:['FT_GetQueueStatus (nonblocking USB RX count)','FT_Read (D2XX queue semantics)','Windows FTD2XX_NET.dll','EEPROM functions']
});
const range=(v,min,max,name)=>{if(!Number.isInteger(v)||v<min||v>max)throw RangeError(name+' expected '+min+'..'+max);return v};
function unavailable(name,reason){const e=Error(name+': '+reason);e.code='D2XX_UNSUPPORTED';return e}
export class D2xxWebUsbBridge{
 constructor(port,{ownsConnection=false,allowDataTransmit=false}={}){
  if(!port)throw TypeError('FT232R WebUSB port required');
  this.port=port;this.ownsConnection=ownsConnection;this.allowDataTransmit=allowDataTransmit;
 }
 static newCable(logger=()=>{}){return new D2xxWebUsbBridge(new Ft232rWebUsb(logger),{ownsConnection:true})}
 get connected(){return !!this.port.ready&&!!this.port.dev?.opened}
 requireOpen(){if(!this.connected)throw Error('FT232R USB not open')}
 async FT_Open(device){
  if(this.connected)return {ok:true,reused:true};
  if(!this.ownsConnection)throw Error('Borrowed port: connect through app Home first');
  const selected=device||await Ft232rWebUsb.choose();
  if(selected?.vendorId!==FT232R_VID||selected?.productId!==FT232R_PID)throw Error('Only FT232R 0403:6001 supported');
  await this.port.openSelected(selected);
  return {ok:true,reused:false,interface:this.port.itf,inEp:this.port.inEp,outEp:this.port.outEp}
 }
 async FT_Close(){if(this.ownsConnection&&this.port.ready)await this.port.close();return {ok:true,closed:this.ownsConnection}}
 async FT_ResetDevice(){this.requireOpen();await this.port.ctl(0,0);this.port.uartConfigured=false;return true}
 async FT_Purge(mask=3){this.requireOpen();range(mask,1,3,'purge');if(mask&1)await this.port.ctl(0,1);if(mask&2)await this.port.ctl(0,2);return true}
 async FT_SetBitMode(mask,mode){
  this.requireOpen();range(mask,0,255,'bitmask');
  if(mode!==0&&mode!==1)throw unavailable('FT_SetBitMode','source only uses reset/async bitbang');
  if(mode===1&&!this.allowDataTransmit)throw unavailable('FT_SetBitMode','bitbang may signal the ECU');
  await this.port.ctl(0x0b,(mode<<8)|mask);return true
 }
 async FT_SetDataCharacteristics(bits,stop,parity){
  this.requireOpen();if(bits!==8||stop!==0||parity!==0)throw unavailable('FT_SetDataCharacteristics','8N1 only');
  await this.port.ctl(0x04,8);return true
 }
 async FT_SetBaudRate(baud){this.requireOpen();await this.port.setBaud(range(baud,300,3000000,'baud'));return true}
 async FT_SetLatencyTimer(ms){this.requireOpen();await this.port.ctl(0x09,range(ms,2,255,'latency'));return true}
 async FT_SetTimeouts(read,write){this.requireOpen();range(read,0,15000,'read timeout');range(write,0,15000,'write timeout');this.readTimeoutMs=read;this.writeTimeoutMs=write;return {ok:true,softwareOnly:true}}
 async FT_Write(bytes){
  this.requireOpen();if(!this.allowDataTransmit)throw unavailable('FT_Write','diagnostic bridge cannot send ECU bytes');
  if(!(bytes instanceof Uint8Array)||!bytes.length)throw TypeError('nonempty Uint8Array required');
  if(this.port.exchangeBusy)throw Error('USB exchange in progress');
  await this.port._write(bytes);return {bytesWritten:bytes.length}
 }
 FT_GetQueueStatus(){throw unavailable('FT_GetQueueStatus','Chrome WebUSB cannot poll the D2XX driver RX queue')}
 FT_Read(){throw unavailable('FT_Read','queued D2XX read differs from WebUSB transferIn; use exchangeRaw')}
 async exchangeHondaFrame(frame,opts={}){
  this.requireOpen();if(!this.allowDataTransmit)throw unavailable('exchangeHondaFrame','transmit permission required');
  return this.port.exchangeRaw(frame,opts)
 }
 async auditConfiguration(){
  this.requireOpen();if(this.allowDataTransmit)throw Error('Audit must be transmit-disabled');
  // No bitbang TX pin pulses, WAKE, ECU ID, ERASE, WRITE, or firmware data.
  let at10400=false;
  try{
   await this.FT_Purge(3);
   await this.FT_SetBitMode(0,0);
   await this.FT_SetDataCharacteristics(8,0,0);
   await this.FT_SetBaudRate(921600);
   await this.FT_SetTimeouts(50,0);
   await this.FT_SetLatencyTimer(8);
   await this.FT_SetBaudRate(10400);at10400=true;
   await this.FT_Purge(3);
   return {ok:true,usbControllerConfigured:true,noEcuTraffic:true,
    hardwareEcuVerified:false,flashAuthorized:false,
    d2xxQueueSemanticsSupported:false,fullWindowsDriverReplacement:false};
  }finally{if(!at10400&&this.connected)try{await this.FT_SetBaudRate(10400)}catch{}}
 }
}

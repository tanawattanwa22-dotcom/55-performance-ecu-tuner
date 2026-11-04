import assert from 'node:assert/strict';
import {D2xxWebUsbBridge,D2XX_COVERAGE} from '../flash_port/ftdi-d2xx-webusb-bridge.js';
const calls=[];
const p={ready:true,dev:{opened:true},uartConfigured:true,async ctl(...a){calls.push(['ctl',...a])},
 async setBaud(v){calls.push(['baud',v])},async _write(b){calls.push(['write',Array.from(b)])},
 async exchangeRaw(b){calls.push(['exchange',Array.from(b)]);return {reply:Uint8Array.of(2,5,0,0,0)}},
 async close(){calls.push(['close']);this.ready=false;this.dev.opened=false}};
const d=new D2xxWebUsbBridge(p);
const r=await d.auditConfiguration();
assert.equal(r.usbControllerConfigured,true);assert.equal(r.hardwareEcuVerified,false);assert.equal(r.flashAuthorized,false);
assert.deepEqual(calls.filter(x=>x[0]==='baud').map(x=>x[1]),[921600,10400]);
assert(calls.some(x=>x[0]==='ctl'&&x[1]===0x0b&&x[2]===0));
assert(calls.some(x=>x[0]==='ctl'&&x[1]===0x09&&x[2]===8));
assert.equal(calls.some(x=>x[0]==='write'||x[0]==='exchange'),false);
await assert.rejects(d.FT_Write(Uint8Array.of(0)),e=>e.code==='D2XX_UNSUPPORTED');
await assert.rejects(d.FT_SetBitMode(1,1),e=>e.code==='D2XX_UNSUPPORTED');
assert.throws(()=>d.FT_Read(),e=>e.code==='D2XX_UNSUPPORTED');
assert.throws(()=>d.FT_GetQueueStatus(),e=>e.code==='D2XX_UNSUPPORTED');
await d.FT_Close();assert.equal(p.ready,true);
const w=new D2xxWebUsbBridge(p,{ownsConnection:true,allowDataTransmit:true});
assert.equal((await w.FT_Write(Uint8Array.of(1))).bytesWritten,1);
await w.FT_Close();assert.equal(p.ready,false);
assert(D2XX_COVERAGE.unsupported.length>=3);
console.log('PASS D2XX WebUSB bridge (mock only; NO ECU)');

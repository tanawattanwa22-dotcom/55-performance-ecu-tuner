/* FM_diag.cs methods 96 / 99 / 100 / 101 / 102:
 * Three source capture layouts. Byte offsets are taken from the purchased
 * C# string_9 hex positions. These are not interchangeable ECU profiles.
 */
export const MAIN_CAPTURE_COMMANDS=Object.freeze({
  1:[[0x72,7,0x72,0x11,0,0x14,0xf0],[0x72,7,0x72,0x20,0,2,0xf3],[0x72,7,0x72,0xd1,0,6,0x3e],[0x72,7,0x72,0xd0,0,0x0e,0x37]],
  4:[[0x72,7,0x72,0x17,0,0x0f,0xef],[0x72,7,0x72,0xd1,0,6,0x3e],[0x72,7,0x72,0x20,0,2,0xf3],[0x72,7,0x72,0xd0,0,0x0e,0x37]],
  // Purchased source has a checksum typo for third 0xD1 frame: 0x37.
  // 0x3E is its correct Honda complement. A corrupt frame MUST NOT be sent.
  7:[[0x72,7,0x72,0x13,0,0x0e,0xf4],[0x72,7,0x72,0xd0,0,0x0e,0x37],[0x72,7,0x72,0xd1,0,6,0x3e],[0x72,7,0x72,0x20,0,2,0xf3]]
});
export function decodeMainDiagnosticTrace(raw,group=1){
 const g=Number(group);
 if(!MAIN_CAPTURE_COMMANDS[g])throw Error('Unknown source diagnostic group');
 const hex=typeof raw==='string'?raw.replace(/\s+/g,''):Array.from(raw,b=>b.toString(16).padStart(2,'0')).join('');
 if(!/^[0-9a-f]+$/i.test(hex)||hex.length%2)throw Error('Invalid diagnostic HEX trace');
 const bytes=Uint8Array.from({length:hex.length/2},(_,i)=>parseInt(hex.slice(i*2,i*2+2),16));
 const min={1:80,4:75,7:71}[g];
 if(bytes.length<min)throw Error('Diagnostic capture too short for C# group '+g+': '+bytes.length+' / '+min);
 const b=i=>{if(i<0||i>=bytes.length)throw Error('Missing byte '+i);return bytes[i]};
 const n=(name,value,unit='')=>({name,value,unit});
 const r=(x,k=0)=>Number(x.toFixed(k));
 const af=x=>r((x<128?147-(128-x)*100/87:147+(x-128)*100/87)/10,1);
 const base=[
  n('RPM',b(12)*256+b(13),'rpm'),
  n('Injection',r((b(g===1?26:23)*256+b(g===1?27:24))/250,1),'ms'),
  n('Ignition',r((b(g===1?28:25)-128)*0.5,1),'deg'),
  n('Throttle TPS',b(15)*0.5,'deg'),
  n('TPS voltage',r(b(14)*19.5),'mV')
 ];
 if(g===1)return [...base,
  n('O2 voltage',r(b(45)*19.5),'mV'),
  n('Fuel correction',r(b(46)*.78-100),'%'),
  n('ECT',b(17)-40,'°C'),n('ECT voltage',r(b(16)*19.5),'mV'),
  n('IAT',b(19)-40,'°C'),n('IAT voltage',r(b(18)*19.5),'mV'),
  n('MAP',b(21),'kPa'),n('MAP voltage',r(b(20)*19.5,0),'mV'),n('Speed',b(25),'km/h'),
  n('Battery',r(b(24)/10,1),'V'),n('IACV',b(29),'step'),
  n('Environmental correction','Not available'),
  n('A/F',af(b(46)),''),n('Fuel pump',Boolean(b(64)&1)?'ON':'OFF'),
  n('Side stand',Boolean(b(60)&2)?'ON':'OFF'),
  n('Starter',Boolean(b(60)&0x20)?'ON':'OFF'),
  n('Relay',Boolean(b(64)&0x90)?'ON':'OFF'),
  n('MIL',b(79)>=128?'ON':'OFF')];
 if(g===4)return [...base,
  n('O2 voltage',r(b(59)*19.5),'mV'),
  n('Fuel correction',r(b(60)*.78-100),'%'),
  n('ECT',b(17)-40,'°C'),n('ECT voltage',r(b(16)*19.5),'mV'),
  n('IAT',b(19)-40,'°C'),n('IAT voltage',r(b(18)*19.5),'mV'),
  n('MAP','Not supported'),n('MAP voltage','Not supported'),n('Speed','Not supported'),
  n('Battery',r(b(22)/10,1),'V'),
  n('FISV',Math.floor(b(44)/16)===4?'ON':'OFF'),
  n('Env correction',r(b(26)*.78-100),'%'),
  n('A/F',af(b(60)),''),n('Fuel pump',Boolean(b(44)&1)?'ON':'OFF'),
  n('Side stand',Boolean(b(40)&2)?'ON':'OFF'),
  n('Starter',Boolean(b(40)&0x20)?'ON':'OFF'),
  n('Relay',Boolean(b(44)&0x90)?'ON':'OFF'),
  n('MIL',b(74)>=128?'ON':'OFF')];
 return [...base,
  n('ECT',b(17)-40,'°C'),n('ECT voltage',r(b(16)*19.5),'mV'),
  n('IAT',b(19)-40,'°C'),n('IAT voltage',r(b(18)*19.5),'mV'),
  n('MAP',b(21),'kPa'),n('MAP voltage',r(b(20)*19.5),'mV'),
  n('Battery',r(b(22)/10,1),'V'),n('DTC count',b(39)&0x7f),
  n('Fuel pump',Boolean(b(39)&0x80)?'ON':'OFF'),
  n('MIL',b(70)>=128?'ON':'OFF')];
}
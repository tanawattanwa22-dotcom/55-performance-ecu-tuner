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
// System.Math.Round(double, digits) in the purchased C# defaults to
// MidpointRounding.ToEven (banker's rounding), unlike JavaScript toFixed().
// Example: 58.5mV -> 58mV in C#, not 59mV.
export function roundMainCSharp(value,digits=0){
 if(!Number.isFinite(value)||!Number.isInteger(digits)||digits<0||digits>6)
  throw RangeError('Invalid FM_diag Math.Round input');
 const scale=10**digits,absolute=Math.abs(value*scale);
 const floor=Math.floor(absolute),fraction=absolute-floor;
 const tolerance=Number.EPSILON*Math.max(1,absolute)*4;
 const tie=Math.abs(fraction-0.5)<=tolerance;
 const rounded=tie?(floor%2===0?floor:floor+1):
  (fraction>0.5?floor+1:floor);
 return Math.sign(value)*rounded/scale;
}
/** Verify FM_diag.cs method_99 byte layout BEFORE method_100/101/102
 * decodes absolute byte offsets. Original requests carry the DATA byte count
 * in TX[5]. The source's fixed positions require a six-byte Honda reply
 * envelope (header, length, command, bank/status, header, checksum) around
 * exactly that many payload bytes. A checksum-valid SHORT reply is a control
 * response, not sensor data: otherwise the next TX echo is misread as
 * RPM/TPS/INJ. No ECU commands or map formulas are changed here.
 */
export function validateMainSourceLiveBurst(result,group){
 const frames=MAIN_CAPTURE_COMMANDS[Number(group)];
 if(!frames||!Array.isArray(result?.entries)||result.entries.length!==frames.length)
  throw Error('FM_diag C# live burst is incomplete');
 const actualLengths=[],expectedLengths=[];
 for(let i=0;i<frames.length;i++){
  const requestedDataBytes=frames[i][5];
  const expectedReplyBytes=requestedDataBytes+6;
  const actualReplyBytes=result.entries[i]?.reply?.length??0;
  expectedLengths.push(expectedReplyBytes);
  actualLengths.push(actualReplyBytes);
  if(actualReplyBytes!==expectedReplyBytes)
   throw Error('FM_diag Group '+group+' TX '+(i+1)+' (0x'+frames[i][3].toString(16).toUpperCase()+
    ') expects '+requestedDataBytes+' data bytes / '+expectedReplyBytes+
    '-byte response, got '+Math.max(0,actualReplyBytes)+
    ' bytes; C# sensor positions would point into UART command/ACK. RX lengths '+
    actualLengths.join('/')+'; expected '+expectedLengths.join('/'));
  if(result.entries[i].echoOK!==true)
   throw Error('FM_diag Group '+group+' TX '+(i+1)+' command echo mismatch');
 }
 const expectedCaptureBytes=frames.reduce((n,f)=>n+f.length+f[5]+6,0);
 if((result.raw?.length??0)!==expectedCaptureBytes)
  throw Error('FM_diag Group '+group+' C# capture length mismatch: expected '+
   expectedCaptureBytes+', got '+(result.raw?.length??0));
 return true;
}

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
 // Keep the FM_diag.cs RAW-40 formula unchanged for supported values.
 // 0xFF produces 215°C but is not a verified physical temperature;
 // preserve the exact raw source byte for checking ECU/sensor/group faults.
 const temperature=(name,byteIndex)=>{
  const rawByte=b(byteIndex);
  return {name,value:rawByte===0xFF?null:rawByte-40,unit:'°C',
   rawByte,rawHex:rawByte.toString(16).padStart(2,'0').toUpperCase(),
   sourceByteIndex:byteIndex,status:rawByte===0xFF?'RAW_FF':'OK'};
 };
 const r=(x,k=0)=>roundMainCSharp(x,k);
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
  temperature('ECT',17),n('ECT voltage',r(b(16)*19.5),'mV'),
  temperature('IAT',19),n('IAT voltage',r(b(18)*19.5),'mV'),
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
  temperature('ECT',17),n('ECT voltage',r(b(16)*19.5),'mV'),
  temperature('IAT',19),n('IAT voltage',r(b(18)*19.5),'mV'),
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
  temperature('ECT',17),n('ECT voltage',r(b(16)*19.5),'mV'),
  temperature('IAT',19),n('IAT voltage',r(b(18)*19.5),'mV'),
  n('MAP',b(21),'kPa'),n('MAP voltage',r(b(20)*19.5),'mV'),
  n('Battery',r(b(22)/10,1),'V'),n('DTC count',b(39)&0x7f),
  n('Fuel pump',Boolean(b(39)&0x80)?'ON':'OFF'),
  n('MIL',b(70)>=128?'ON':'OFF')];
}
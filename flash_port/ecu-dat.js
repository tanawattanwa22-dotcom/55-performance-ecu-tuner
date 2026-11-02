/**
 * Reader for Main's ecuData.dat (written by PartID_ECU form with .NET BinaryWriter).
 * Layout: Int32 rowCount, then per row 7 strings (7-bit length prefix + UTF-8):
 *   ecuId, partEcu, nameCar, startOffset(hex), checksum(hex), fileSize, typeEcu
 * Returns rows shaped like csharp-ecu-catalog entries so they can be merged in.
 */
function readString(dv,u8,pos){
  let len=0,shift=0,b;
  do{b=u8[pos.i++];if(b===undefined)throw Error('ecuData.dat truncated');len|=(b&0x7f)<<shift;shift+=7}while(b&0x80);
  const s=new TextDecoder().decode(u8.subarray(pos.i,pos.i+len));
  if(pos.i+len>u8.length)throw Error('ecuData.dat truncated');
  pos.i+=len;return s;
}
const hexOrNull=s=>/^[0-9A-F]+$/i.test(s)?parseInt(s,16):null;
export function parseEcuDat(buffer){
  const u8=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  const count=dv.getInt32(0,true);
  if(count<0||count>100000)throw Error('ecuData.dat row count invalid');
  const pos={i:4},rows=[];
  for(let r=0;r<count;r++){
    const [ecuId,part,name,start,cks,size,type]=Array.from({length:7},()=>readString(dv,u8,pos));
    const id=ecuId.toUpperCase();
    if(!/^[0-9A-F]{10}$/.test(id))continue;
    rows.push({ecuId:id,part,model:name,startOffset:hexOrNull(start),checksumOffset:hexOrNull(cks),
      sizeText:size,typeText:type,family:/shind/i.test(type)?'SHINDENGEN':'KEIHIN',source:'ecuData.dat (user file)'});
  }
  return rows;
}

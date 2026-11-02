/** Main ecuData.dat .NET BinaryWriter reader (read-only reference). */
function str(u,p){let n=0,s=0,b;do{b=u[p.i++];if(b===undefined||s>28)throw Error('Invalid DAT');n|=(b&127)<<s;s+=7}while(b&128);if(n<0||p.i+n>u.length)throw Error('DAT truncated');const v=new TextDecoder().decode(u.subarray(p.i,p.i+n));p.i+=n;return v}
export function parseEcuDat(bytes){
 const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);if(u.length<4)throw Error('DAT truncated');
 const d=new DataView(u.buffer,u.byteOffset,u.byteLength),count=d.getInt32(0,true),p={i:4},rows=[];
 if(count<0||count>100000)throw Error('Invalid DAT count');
 for(let i=0;i<count;i++){const [id,part,model,start,ck,size,type]=Array.from({length:7},()=>str(u,p));
 if(!/^[0-9A-F]{10}$/i.test(id))continue;
 const num=x=>/^[0-9A-F]+$/i.test(x)?parseInt(x,16):null;
 rows.push({ecuId:id.toUpperCase(),part,model,startOffset:num(start),checksumOffset:num(ck),sizeText:size,typeText:type,family:/shind/i.test(type)?'SHINDENGEN':'KEIHIN',source:'ecuData.dat'});}
 return rows;
}
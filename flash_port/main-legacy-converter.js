/* Local-only compatibility with purchased ACGECUTOBIN.cs.
 * Caller supplies the correct file-format password; never store it, log it,
 * send it to a server, or include the vendor's password in the public site.
 * Legacy MD5 is used solely for matching the old .NET file format.
 */
import {decryptPkcs7} from './main-legacy-aes.js';
const K=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*4294967296)>>>0);
const shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
export function legacyMd5(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 const n=bytes.length;const blocks=(Math.floor((n+8)/64)+1);
 const buffer=new Uint8Array(blocks*64);
 buffer.set(bytes);buffer[n]=0x80;
 const v=new DataView(buffer.buffer),bits=n*8;
 v.setUint32(buffer.length-8,bits>>>0,true);
 v.setUint32(buffer.length-4,Math.floor(bits/4294967296),true);
 const st=[0x67452301,0xefcdab89,0x98badcfe,0x10325476];
 for(let offset=0;offset<buffer.length;offset+=64){
  let [a,b,c,d]=st;
  for(let i=0;i<64;i++){
   let f,g,shift;
   if(i<16){f=(b&c)|(~b&d);g=i;shift=shifts[i%4];}
   else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;shift=shifts[4+i%4];}
   else if(i<48){f=b^c^d;g=(3*i+5)%16;shift=shifts[8+i%4];}
   else{f=c^(b|~d);g=(7*i)%16;shift=shifts[12+i%4];}
   const x=(a+f+K[i]+v.getUint32(offset+4*g,true))>>>0;
   const next=(b+((x<<shift)|(x>>>(32-shift))))>>>0;
   [a,b,c,d]=[d,next,b,c];
  }
  st[0]=(st[0]+a)>>>0;st[1]=(st[1]+b)>>>0;st[2]=(st[2]+c)>>>0;st[3]=(st[3]+d)>>>0;
 }
 const result=new Uint8Array(16),o=new DataView(result.buffer);
 for(let i=0;i<4;i++)o.setUint32(i*4,st[i],true);
 return result;
}
export function legacyPasswordKey(password){
 if(typeof password!=='string'||!password.length)throw Error('ต้องใส่รหัสรูปแบบไฟล์ตาม Main C#');
 const ascii=new Uint8Array([...password].map(ch=>{
  const code=ch.codePointAt(0);return code<128?code:63;
 }));
 const md5=legacyMd5(ascii);
 // Original C# copies MD5 into positions 0 and 15, byte 31 stays zero.
 const key=new Uint8Array(32);key.set(md5,0);key.set(md5,15);return key;
}
export function decodeLegacyFile(text,password){
 if(typeof text!=='string'||text.length>40000000)throw Error('ขนาดไฟล์ไม่ถูกต้องหรือใหญ่เกิน 40 MB');
 const data=text.replace(/^\ufeff/,'').replace(/\s+/g,'');
 const chunkSize=43712; // ACGECUTOBIN.cs: independent Base64 segments
 if(!data.length||data.length%chunkSize!==0)throw Error('ไฟล์ต้องประกอบด้วยบล็อก Base64 ขนาด 43,712 ตัวอักษร');
 const key=legacyPasswordKey(password),decoder=new TextDecoder('utf-8',{fatal:true});
 const parts=[];let full=0;
 for(let i=0;i<data.length;i+=chunkSize){
  const encoded=data.slice(i,i+chunkSize);
  if(!/^[0-9a-z+/]+={0,2}$/i.test(encoded))throw Error('Base64 ไม่ถูกต้อง');
  const raw=atob(encoded),buffer=Uint8Array.from(raw,ch=>ch.charCodeAt(0));
  const clear=decoder.decode(decryptPkcs7(buffer,key)).trim();
  if(!clear||clear.length%2||!/^[0-9a-f]+$/i.test(clear))throw Error('รหัสไม่ตรงหรือเนื้อหาถอดรหัสไม่ใช่ HEX');
  const part=new Uint8Array(clear.length/2);
  for(let p=0;p<part.length;p++)part[p]=parseInt(clear.slice(p*2,p*2+2),16);
  parts.push(part);full+=part.length;
  if(full>20000000)throw Error('ผลแปลงใหญ่เกิน 20 MB');
 }
 const output=new Uint8Array(full);let p=0;
 for(const part of parts){output.set(part,p);p+=part.length;}
 return output;
}

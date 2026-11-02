/* 55 ECU — ตัวแปลงไฟล์ XDF / ADX (ทำงานในเบราว์เซอร์ของแอดมิน) */
(function(g){
"use strict";
const N=(v,d)=>{d=d||0;if(v===null||v===undefined||v==="")return d;v=String(v).trim();const n=/^0x/i.test(v)?parseInt(v,16):Math.trunc(parseFloat(v));return isNaN(n)?d:n};
const F=(v,d)=>{const n=parseFloat(v);return isNaN(n)?(d||0):n};
let TD=null;try{TD=new TextDecoder("windows-874")}catch(e){}
function thai(s){
  if(!s)return"";let hi=false;
  for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c>255)return s;if(c>=0xA1)hi=true}
  if(!hi||!TD)return s;
  try{const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return TD.decode(u)}catch(e){return s}
}
function bytesToLatin1(u8){let s="";const CH=8192;for(let i=0;i<u8.length;i+=CH)s+=String.fromCharCode.apply(null,u8.subarray(i,i+CH));return s}
function loadXml(u8){
  let t=bytesToLatin1(u8).replace(/^\s*<\?xml[^>]*\?>/,"").replace(/^\s*<!--[\s\S]*?-->/,"");
  const doc=new DOMParser().parseFromString(t,"text/xml");
  if(doc.getElementsByTagName("parsererror").length)throw new Error("อ่านไฟล์ XML ไม่ได้");
  return doc.documentElement;
}
const kids=(e,n)=>Array.prototype.filter.call(e.children,c=>c.tagName===n);
const first=(e,n)=>kids(e,n)[0]||null;
const txt=(e,n)=>{const c=e&&first(e,n);return c?c.textContent:null};
const all=(e,n)=>Array.prototype.slice.call(e.getElementsByTagName(n));
const at=(e,a)=>e.getAttribute(a);

function lay(e){
  const bits=N(at(e,"mmedelementsizebits"),8)||8,rows=N(at(e,"mmedrowcount"),1)||1,cols=N(at(e,"mmedcolcount"),1)||1;
  const ms=N(at(e,"mmedmajorstridebits"),0),ns=N(at(e,"mmedminorstridebits"),0),fl=N(at(e,"mmedtypeflags"),0),nb=bits>>3;
  const cs=ms>0?ms>>3:nb,rs=ns>0?ns>>3:cols*cs;
  return{addr:at(e,"mmedaddress")?N(at(e,"mmedaddress")):null,bits,rows,cols,cs,rs,sg:!!(fl&1),lsb:!!(fl&2)};
}
function eqs(el){const o={};kids(el,"MATH").forEach(m=>{const r=at(m,"row");o[r?parseInt(r,10):0]=(at(m,"equation")||"").trim()});return o}

function parseXdf(u8){
  const root=loadXml(u8);
  const cats={};all(root,"CATEGORY").forEach(c=>{cats[N(at(c,"index"))]=thai(at(c,"name"))});
  const tabs=all(root,"XDFTABLE"),byid={};tabs.forEach(t=>{byid[at(t,"uniqueid")]=t});
  const ax=(t,i)=>kids(t,"XDFAXIS").find(a=>at(a,"id")===i);
  const res=[];
  tabs.forEach(t=>{
    const z=ax(t,"z");if(!z)return;const e=first(z,"EMBEDDEDDATA");if(!e)return;const L=lay(e);
    const d={uid:at(t,"uniqueid"),title:thai(txt(t,"title")||""),z:L,eq:eqs(z),dec:N(txt(z,"decimalpl"),2),mn:F(txt(z,"min")),mx:F(txt(z,"max")),unit:thai(txt(z,"units")||"")};
    ["x","y"].forEach(k=>{
      const a=ax(t,k);if(!a){d[k]=null;return}
      const ei=first(a,"embedinfo"),typ=ei?N(at(ei,"type")):0,r={};
      r.n=N(txt(a,"indexcount"),1);r.eq=eqs(a);r.dec=N(txt(a,"decimalpl"),1);r.unit=thai(txt(a,"units")||"");
      r.labels=kids(a,"LABEL").map(l=>thai(at(l,"value")||""));
      if(typ===3){
        const lt=byid[at(ei,"linkobjid")],lz=lt&&ax(lt,"z"),le=lz&&first(lz,"EMBEDDEDDATA");
        if(le){Object.assign(r,{kind:"link",L:lay(le),eq:eqs(lz),dec:N(txt(lz,"decimalpl"),1),unit:thai(txt(lz,"units")||"")})}else r.kind="labels";
      }else{
        const ee=first(a,"EMBEDDEDDATA");
        if(typ===1&&ee&&at(ee,"mmedaddress"))Object.assign(r,{kind:"own",L:lay(ee)});else r.kind="labels";
      }
      d[k]=r;
    });
    res.push(d);
  });
  const flags=all(root,"XDFFLAG").map(f=>{const e=first(f,"EMBEDDEDDATA");return{title:thai(txt(f,"title")||""),addr:e&&at(e,"mmedaddress")?N(at(e,"mmedaddress")):null,mask:N(txt(f,"mask"))}});
  return{tables:res,flags};
}

/* ---- สมการ / อ่านค่า ---- */
const SAFE=/^[0-9Xx+\-*\/(). eE]*$/;
function mkeq(s){s=String(s||"X").trim();if(!SAFE.test(s))s="X";const c=s.replace(/x/g,"X");try{return new Function("X","return "+c)}catch(e){return x=>x}}
function rd(b,a,bits,sg,lsb){
  const n=bits>>3;if(a<0||a+n>b.length)return null;let v=0;
  if(lsb){for(let i=n-1;i>=0;i--)v=v*256+b[a+i]}else{for(let i=0;i<n;i++)v=v*256+b[a+i]}
  if(sg&&v>=Math.pow(2,bits-1))v-=Math.pow(2,bits);return v;
}
function zvals(b,t){
  const z=t.z,f=mkeq(t.eq[0]||"X"),out=[];
  for(let r=0;r<z.rows;r++){const fr=t.eq[r+1]!==undefined?mkeq(t.eq[r+1]):f,row=[];
    for(let c=0;c<z.cols;c++){const v=rd(b,z.addr+r*z.rs+c*z.cs,z.bits,z.sg,z.lsb);row.push(v===null?null:fr(v))}out.push(row)}
  return out;
}
function axvals(b,a,n){
  if(!a)return null;if(a.kind==="labels")return a.labels.slice(0,n);
  const L=a.L,f=mkeq(a.eq[0]||"X"),step=L.cols>1?L.cs:(L.rows>1?L.rs:L.cs),out=[];
  for(let i=0;i<n;i++){const v=rd(b,L.addr+i*step,L.bits,L.sg,L.lsb);out.push(v===null?null:f(v))}return out;
}

/* ---- แปลงเป็นรูปแบบที่แอปใช้ ---- */
const PH=/^\s*\d+(\.0+)?\s*$/;
function cleanLabels(lb,n){lb=lb.map(x=>x.trim()).slice(0,n);if(!lb.length||lb.every(x=>x===""||PH.test(x)))return null;while(lb.length<n)lb.push("");return lb}
function tpsFix(eq,fam){return(fam==="K2J"&&/(0?\.09[67]\d*)/.test(eq))?"X*0.0969":eq}
function norm(eq){return eq.replace(/\s+/g,"").replace(/\*\./g,"*0.").replace(/\/\./g,"/0.")}
function axis(a,n,fam){
  if(!a)return null;
  if(a.kind==="labels"){const l=cleanLabels(a.labels,n);return l?{l}:null}
  const L=a.L,step=L.cols>1?L.cs:(L.rows>1?L.rs:L.cs);
  return{a:L.addr,n,b:L.bits,sg:+L.sg,le:+L.lsb,st:step,eq:norm(tpsFix(a.eq[0]||"X",fam)),d:a.dec};
}
function rawTable(t,fam){
  const z=t.z;if(z.addr===null)return null;
  const nr=z.rows,nc=z.cols;
  let x=(nc>1||(t.x&&t.x.kind!=="labels"))?axis(t.x,nc,fam):null;
  let y=(nr>1||(t.y&&t.y.kind!=="labels"))?axis(t.y,nr,fam):null;
  if(t.x&&t.x.kind==="labels"&&nc===1)x=null;
  let rowlabel="";
  if(t.y&&t.y.kind==="labels"&&nr===1){y=null;const l=cleanLabels(t.y.labels,1);rowlabel=l?l[0]:""}
  const d={a:z.addr,r:nr,c:nc,b:z.bits,sg:+z.sg,le:+z.lsb,cs:z.cs,rs:z.rs,eq:norm(tpsFix(t.eq[0]||"X",fam)),d:t.dec,mn:t.mn,mx:t.mx};
  if(x)d.x=x;if(y)d.y=y;if(rowlabel)d.yl=rowlabel;return d;
}
function patchTemps(tables){
  const fix={0x2B23:[0x2B23,0x2B22,"X/49"],0x2B38:[0x2B36,0x2B37,"X/48.4"],0x2B4D:[0x2B4D,0x2B4C,"X/49"]};
  tables.forEach(d=>{const f=fix[d.a];if(f){d.a=f[0];d.x={a:f[1],n:10,b:8,sg:0,le:0,st:2,eq:f[2],d:2}}});
}

/* ---- ตั้งชื่ออัตโนมัติสำหรับรุ่นที่ยังไม่รู้จัก (ใช้เฉพาะลักษณะตาราง ไม่เอาชื่อจากไฟล์มาแสดง) ---- */
const G={FUEL:"น้ำมัน",IGN:"ไฟ",AFR:"AFR / แลมด้า",TQ:"ทอร์ค / องศาฉีด",LIM:"ลิมิต",SEN:"เซนเซอร์",LOCK:"ล็อก / โค้ด",AX:"แกน",OTH:"อื่นๆ"};
const KW=[[G.FUEL,/fuel|inj|\bfi\b|pulse|\bpw\b|น้ำมัน|ฉีด/i],[G.IGN,/ign|spark|advance|timing|ไฟ|จุดระเบิด/i],[G.AFR,/\baf\b|afr|lambda|o2|แลมด้า/i],[G.LIM,/limit|rev|cut|ลิมิต|ตัดรอบ/i],[G.SEN,/temp|ect|iat|eot|sensor|เซนเซอร์|อุณหภูมิ/i]];
function stat(V){const f=[];V.forEach(r=>r.forEach(v=>{if(v!==null&&isFinite(v))f.push(v)}));if(!f.length)return null;f.sort((a,b)=>a-b);return{mn:f[0],mx:f[f.length-1],med:f[f.length>>1]}}
function guessGroup(t,V,xs,ys){
  const z=t.z;
  if(z.rows===1||z.cols===1){
    const f=[];V.forEach(r=>r.forEach(v=>f.push(v)));
    let mono=f.length>3&&f.every((v,i)=>i===0||v>=f[i-1]);
    if(mono&&!KW.some(k=>k[1].test(t.title)))return G.AX;
  }
  for(const k of KW)if(k[1].test(t.title))return k[0];
  const s=stat(V);if(!s)return G.OTH;
  const big=z.rows>=4&&z.cols>=4;
  if(big){
    if(s.mn>=8&&s.mx<=22)return G.AFR;
    if(s.mn>=-15&&s.mx<=70&&s.mn<0||(s.mx<=60&&s.med>=5&&(t.unit||"").match(/°|deg/i)))return G.IGN;
    if(s.mn>=0&&s.mx<=40)return G.FUEL;
    return G.TQ;
  }
  if(s.mn>=1000&&s.mx<=20000)return G.LIM;
  if(s.mn>=-60&&s.mx<=200&&(z.rows===1||z.cols===1)&&(z.rows*z.cols)>=6)return G.SEN;
  return G.OTH;
}
function guessUnit(g,t){if(g===G.FUEL)return"ms";if(g===G.IGN)return"°";if(g===G.AFR)return"AFR";if(g===G.LIM)return"rpm";return t.unit&&t.unit.length<8?t.unit:""}

/* รวมตารางจาก XDF หลายไฟล์ (รุ่นเดียวกัน) แล้วแปลงเป็นรายการให้แอดมินตรวจ
   known=ตารางชื่อสำเร็จรูปของตระกูลนั้น (จาก ov.json) หรือ null */
function compile(bin,xdfList,known){
  const fam=known?known.fam:"";
  const hide=new Set(known?known.hide:[]),seen=new Set(),out=[],cnt={};
  xdfList.forEach(P=>{
    P.tables.forEach(t=>{
      const d=rawTable(t,fam);if(!d||seen.has(d.a))return;
      let V=null,xs=null,ys=null;try{V=zvals(bin,t);xs=axvals(bin,t.x,t.z.cols);ys=axvals(bin,t.y,t.z.rows)}catch(e){}
      if(known){
        if(hide.has(d.a))return;const o=known.ov[String(d.a)];if(!o)return;
        seen.add(d.a);Object.assign(d,{t:o[0],s:o[1],u:o[2],g:o[3],ro:o[4],inc:true,auto:false});
      }else{
        seen.add(d.a);const g=guessGroup(t,V||[[0]],xs,ys);cnt[g]=(cnt[g]||0)+1;
        const nm=g===G.AX?"แกน "+cnt[g]:g+" "+cnt[g];
        Object.assign(d,{t:nm,s:"",u:guessUnit(g,t),g,ro:g===G.AX?1:0,inc:g!==G.OTH&&g!==G.AX,auto:true});
      }
      d.i=out.length;out.push(d);
    });
  });
  const order=[G.FUEL,G.IGN,G.AFR,G.TQ,G.LIM,G.SEN,G.LOCK,G.AX,G.OTH];
  out.sort((a,b)=>order.indexOf(a.g)-order.indexOf(b.g));
  if(fam==="K2J")patchTemps(out);
  return out;
}
function listFlags(xdfList){
  const seen=new Set(),o=[];xdfList.forEach(P=>P.flags.forEach(f=>{if(f.addr===null||!f.mask)return;const k=f.addr+":"+f.mask;if(seen.has(k))return;seen.add(k);o.push({a:f.addr,m:f.mask})}));return o;
}

/* ---- ADX (ข้อมูลสด) ---- */
function parseAdx(u8){
  const root=loadXml(u8);
  const hdr=first(root,"ADXHEADER"),def=hdr&&first(hdr,"DEFAULTS");
  const defBits=def?N(at(def,"datasizeinbits"),8):8;
  const baud=hdr?N(txt(hdr,"baud"),10400):10400;
  const sends={},listens={},lut={};
  all(root,"ADXCSENDCOMMAND").forEach(s=>{const bs=first(s,"bytestring"),ck=first(s,"SNDCMDCHECKSUM");
    const hex=bs?bs.textContent.trim():"";const b=[];for(let i=0;i+1<hex.length;i+=2)b.push(parseInt(hex.substr(i,2),16));
    sends[at(s,"id")]={b,ck:!!ck&&N(at(ck,"type"),0)>0}});
  all(root,"ADXCLISTENPACKET").forEach(l=>{listens[at(l,"idhash")]={id:at(l,"id"),size:N(txt(l,"packetsize"),0)}});
  all(root,"ADXLOOKUPTABLE").forEach(l=>{lut[at(l,"idhash")]=all(l,"tableentry").map(e=>[F(at(e,"input")),F(at(e,"output"))])});
  /* คู่ send→listen จากมาโคร */
  const pairs={};
  all(root,"ADXMACRO").forEach(m=>{
    const ns=all(m,"NODE").map(n=>at(n,"commandID"));
    for(let i=0;i+1<ns.length;i++){
      const s=sends[ns[i]];const lid=ns[i+1];
      const lh=Object.keys(listens).find(h=>listens[h].id===lid);
      if(s&&lh)pairs[lh]={send:s,listen:listens[lh]};
    }
  });
  const vals=[];
  all(root,"ADXVALUE").forEach(v=>{
    const pp=pairs[txt(v,"parentcmdidhash")];
    if(!pp)return;
    const sb=pp.send.b;let tb=null;
    if(sb.length>=4&&sb[2]===0x71)tb=sb[3];if(tb===null)return;
    const echo=sb.length+(pp.send.ck?1:0);
    const m=first(v,"MATH");let eq=m?(at(m,"equation")||"X"):"X";
    const linked=m&&all(m,"VAR").some(x=>at(x,"type")!=="native");
    const sz=txt(v,"sizeinbits");
    vals.push({id:at(v,"id"),title:at(v,"title")||"",u:txt(v,"units")||"",
      tb,off:N(txt(v,"packetoffset"),0),i:N(txt(v,"packetoffset"),0)-echo,n:(sz?N(sz,8):defBits)>>3||1,
      eq:eq.replace(/\s+/g,""),lut:m&&at(m,"lookupidhash")?lut[at(m,"lookupidhash")]||null:null,
      lsb:N(txt(v,"lsbfirst"),0)?1:0,sg:N(txt(v,"signed"),0)?1:0,linked:!!linked});
  });
  const tables={};
  Object.keys(pairs).forEach(h=>{const p=pairs[h],sb=p.send.b;if(sb.length>=4&&sb[2]===0x71){const echo=sb.length+(p.send.ck?1:0);tables[sb[3]]={tb:sb[3],len:p.listen.size-echo,size:p.listen.size,echo}}});
  return{baud,vals,tables:Object.keys(tables).map(k=>tables[k])};
}
const KEYS=[["rpm","รอบเครื่อง","rpm"],["tps","คันเร่ง","%"],["map","MAP","kPa"],["ect","ECT","°C"],["iat","IAT","°C"],["bat","แบตเตอรี่","V"],["spd","ความเร็ว","km/h"],["inj","หัวฉีด","ms"],["ign","องศาไฟ","°"],["o2v","O2 (โวลต์)","V"],["afr","AFR","AFR"]];
function guessKey(v){
  if(v.linked)return null;
  const t=(v.title+" "+v.id).toLowerCase(),u=(v.u||"").toLowerCase();
  if(u==="rpm")return"rpm";
  if(u==="v"){if(/bat/.test(t))return"bat";if(/o2|oxygen|lambda/.test(t)&&!/heat|stft|ltft/.test(t))return"o2v";return null}
  if(/afr/.test(t))return"afr";
  if(/inj/.test(t)&&u==="ms")return"inj";
  if(/spark|ign|advance/.test(t))return"ign";
  if(/map/.test(t)&&/kpa|mbar/.test(u))return"map";
  if(/ect|water|coolant|eot/.test(t)&&/c$|°/.test(u))return"ect";
  if(/iat|intake|air/.test(t)&&/c$|°/.test(u))return"iat";
  if(/tp|throttle|tps/.test(t)&&!/v$/.test(u))return"tps";
  if(u==="km/h"||/speed/.test(t))return"spd";
  return null;
}
function liveProfile(adx){
  const used={},vals=[];
  adx.vals.forEach(v=>{
    const k=guessKey(v);
    const o={k:(k&&!used[k])?k:"",tb:v.tb,i:v.i,n:v.n,eq:v.eq,lsb:v.lsb,sg:v.sg,t:v.title,u:v.u,linked:v.linked};
    if(v.lut)o.lut=v.lut;if(o.k)used[o.k]=1;if(!v.linked)vals.push(o);
  });
  return{baud:adx.baud,tables:adx.tables,vals};
}

g.XDFC={parseXdf,compile,listFlags,parseAdx,liveProfile,KEYS,G,thai,rd,zvals,axvals,mkeq};
})(typeof window!=="undefined"?window:globalThis);

/* Port of purchased FM_dtc.cs method_110() and method_111().
 * Source diagnostic READ commands only (0x74 and 0x73), never clear/reset.
 */
const codes={
 1:'MAP: วงจรแรงดันในท่อร่วมผิดปกติ',2:'MAP: ประสิทธิภาพเซ็นเซอร์แรงดันท่อร่วมผิดปกติ',
 7:'ECT/EOT: วงจรเซ็นเซอร์อุณหภูมิผิดปกติ',8:'TPS: วงจรตำแหน่งลิ้นเร่งผิดปกติ',
 9:'IAT: วงจรอุณหภูมิอากาศไอดีผิดปกติ',10:'MAP: วงจรแรงดันในท่อร่วมผิดปกติ',
 11:'VSS: วงจรเซ็นเซอร์ความเร็วรถผิดปกติ',12:'วงจรหัวฉีดหลักหมายเลข 1',
 14:'วงจรหัวฉีดหลักหมายเลข 3',15:'วงจรหัวฉีดหลักหมายเลข 4',
 16:'วงจรหัวฉีดรองหมายเลข 1',17:'วงจรหัวฉีดรองหมายเลข 2',
 18:'CAM: ไม่พบสัญญาณตำแหน่งเพลาลูกเบี้ยว',19:'ไม่พบสัญญาณพัลส์จุดระเบิด',
 20:'EEPROM: หน่วยความจำผิดปกติ',21:'วงจรเซ็นเซอร์ออกซิเจน',
 22:'วงจรเซ็นเซอร์ออกซิเจนหมายเลข 2',23:'ฮีตเตอร์เซ็นเซอร์ O2',
 24:'ฮีตเตอร์เซ็นเซอร์ O2 หมายเลข 2',29:'IACV: วาล์วเดินเบา',
 33:'EEPROM: หน่วยความจำผิดปกติ',52:'CKP: วงจรตำแหน่งเพลาข้อเหวี่ยง',
 54:'เซ็นเซอร์วัดมุมเอียง',57:'ECT: เซ็นเซอร์อุณหภูมิน้ำหล่อเย็น',
 71:'TP1: สัญญาณเซ็นเซอร์ลิ้นเร่งหมายเลข 1',72:'TP2: สัญญาณเซ็นเซอร์ลิ้นเร่งหมายเลข 2',
 73:'TP1/TP2: ความสัมพันธ์ของเซ็นเซอร์ไม่ถูกต้อง',
 82:'FISV: โซลินอยด์เดินเบาเร็ว',88:'EVAP: ระบบควบคุมไอระเหย',
 89:'PAIR: ระบบอากาศทุติยภูมิ',91:'วงจรคอยล์จุดระเบิดหลัก',
 103:'CAN: การสื่อสาร ECM ไปหน้าปัดผิดปกติ'
};
export const MAIN_DTC_LABELS=Object.freeze(codes);
export const MAIN_DTC_READ_FRAMES=Object.freeze([0x74,0x73].flatMap(cmd=>
 [1,2,3].map(bank=>Object.freeze([0x72,5,cmd,bank,(-0x72-5-cmd-bank)&255]))));
export function decodeMainDtcReplies(entries){
 if(!Array.isArray(entries))throw Error('DTC reply collection invalid');
 const out=[],seen=new Set();
 for(const {cmd,bank,reply} of entries){
  if(![0x73,0x74].includes(cmd)||![1,2,3].includes(bank))throw Error('Invalid DTC command/bank');
  const v=reply instanceof Uint8Array?reply:Uint8Array.from(reply);
  if(v.length<6||v[1]!==v.length||v[2]!==cmd||v[3]!==bank||
     (v.reduce((sum,x)=>sum+x,0)&255)!==0)throw Error('DTC response checksum/status/length mismatch');
  for(let i=5;i+1<v.length-1;i+=2){
   const code=v[i],sub=v[i+1];if(!code)continue;
   const key=cmd+':'+code+':'+sub;
   if(seen.has(key))continue;seen.add(key);
   out.push({type:cmd===0x74?'CURRENT':'STORED',code:code+'-'+sub,description:codes[code]||'รหัสยังไม่มีในตาราง Main C#',bank,known:!!codes[code]});
  }
 }
 return out;
}

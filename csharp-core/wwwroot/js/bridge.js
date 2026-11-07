/* Presentation/status bridge ONLY. Does not claim FT232R or transmit ECU bytes.
   Inside the main site iframe, WebUSB stays exclusively in the parent app. */
window.csharpHost={
  /* Uses the already-open parent FT232R and its EXCLUSIVE USB session lock.
     No other driver, no manual USB chooser, no erase or write commands.
     C# supplies the source diagnostic frame list; JS only transports bytes. */
  async captureDiagnosticOnce(group,frames){
    const parentWindow=window.parent;
    if(parentWindow===window)throw Error('เปิดจากหน้า 55 Performance หลักที่เชื่อมสายอยู่ก่อน');
    const shared=parentWindow.__55SharedEcu;
    if(!shared?.port?.ready||!shared?.acquire)throw Error('ยังไม่เชื่อม FT232R จากหน้าแรก');
    if(parentWindow.__55RetailFlashState?.().busy)throw Error('กำลังแฟลช ECU อยู่ • ไม่แย่งพอร์ต USB');
    if(![1,4,7].includes(group)||!Array.isArray(frames)||frames.length!==4)
      throw Error('C# diagnostic group invalid');
    const owner='CSHARP_LIVE_ONESHOT';
    const port=await shared.acquire(owner);
    try{
      if(parentWindow.__55RetailFlashState?.().busy)throw Error('Flash active');
      await port.sourceDiagnosticWake('diagnostic');
      const result=await port.exchangeMainDiagnosticBurst(frames,{timeoutMs:1600});
      return Array.from(result.raw,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    }finally{
      shared.release(owner);
    }
  },
  async captureDtcOnce(frames){
    const parentWindow=window.parent;
    if(parentWindow===window)throw Error('DTC ต้องเปิดจากเว็บหลักที่เชื่อม FT232R อยู่');
    const shared=parentWindow.__55SharedEcu;
    if(!shared?.port?.ready||!shared?.acquire)throw Error('ยังไม่เชื่อม FT232R');
    if(parentWindow.__55RetailFlashState?.().busy)throw Error('กำลังอัด ECU • ไม่เปิด DTC');
    if(!Array.isArray(frames)||frames.length!==6)throw Error('FM_dtc source command count invalid');
    const owner='CSHARP_DTC_ONESHOT',port=await shared.acquire(owner);
    try{
      if(parentWindow.__55RetailFlashState?.().busy)throw Error('Flash active');
      await port.sourceDiagnosticWake('dtc');
      const first=await port.exchangeMainDiagnosticBurst(frames.slice(0,3),{timeoutMs:1600});
      const second=await port.exchangeMainDiagnosticBurst(frames.slice(3,6),{timeoutMs:1600});
      const toHex=raw=>Array.from(raw,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
      return [toHex(first.raw),toHex(second.raw)];
    }finally{
      shared.release(owner);
    }
  },
  sharedEcuId(){
    try{
      if(window.parent===window)return '';
      const snapshot=window.parent.__55SharedEcu?.snapshot?.();
      return snapshot?.ecuId||'';
    }catch{return '';}
  },
  sharedUsbStatus(){
    try{
      if(window.parent===window)return "Standalone C# Core — ไม่มีพอร์ตจากโปรแกรมหลัก";
      const main=window.parent;
      const shared=main.__55SharedEcu;
      const snapshot=shared?.snapshot?.();
      const connected=!!shared?.port?.ready;
      return connected?
        "FT232R เชื่อมต่อจากโปรแกรมหลัก · "+(snapshot?.ecuId?"ECU ID "+snapshot.ecuId:"รอ ECU ID"):
        "ยังไม่ได้ต่อ FT232R ที่หน้าแรกโปรแกรมหลัก";
    }catch(e){return "ตรวจสถานะสายไม่สำเร็จ: "+String(e?.message||e);}
  }
};
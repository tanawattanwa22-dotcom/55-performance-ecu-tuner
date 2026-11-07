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
  // Destructive source commands are available ONLY while the existing
  // inline Flash page holds the FT232R exclusive INLINE_FLASH lock and
  // explicitly starts a C# run. JS does not select ECU commands here.
  async flashExchange(label,frameHex,timeoutMs,afterWriteMs){
    const main=window.parent,shared=main.__55SharedEcu;
    if(main===window||main.__55CSharpFlashActive!==true||
       main.__55RetailFlashState?.().busy!==true)
      throw Error('No active Main C# flash session on original page');
    const port=shared?.port;
    if(!port?.ready)throw Error('Shared FT232R is disconnected; no C# flash commands');
    if(!/^[A-Z0-9_]+$/i.test(label)||typeof frameHex!=='string'||
       !/^(?:[0-9a-f]{2})+$/i.test(frameHex)||frameHex.length>512)
      throw Error('C# source frame invalid');
    if(!Number.isInteger(timeoutMs)||timeoutMs<80||timeoutMs>15000)
      throw Error('Invalid source response timeout');
    if(!Number.isInteger(afterWriteMs)||afterWriteMs<0||afterWriteMs>3000)
      throw Error('Invalid source write delay');
    const out=Uint8Array.from(frameHex.match(/../g),x=>parseInt(x,16));
    const response=await port.exchangeRaw(out,{
      mainSourceMode:true,timeoutMs,afterWriteMs,
      observe:event=>{
        // Original parent diagnostics keep an exact record of USB status.
        try{main.__55CSharpFlashRawTrace?.({label,...event})}catch{}
      }
    });
    if(!(response?.reply instanceof Uint8Array))
      throw Error('No complete source ECU ACK from existing WebUSB');
    return Array.from(response.reply,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
  },
  async flashReopenBeforeErase(){
    const main=window.parent,shared=main.__55SharedEcu;
    if(main===window||!main.__55CSharpFlashActive||
       main.__55RetailFlashState?.().busy!==true)
      throw Error('No active Main C# Flash session');
    const port=shared?.port;
    if(!port||typeof port.openSelected!=='function'||
       typeof port.initializeIso!=='function')
      throw Error('Original FT232R WebUSB transport unavailable');
    const sameDevice=port.lastDevice||port.dev;
    if(!sameDevice||sameDevice.vendorId!==0x0403||sameDevice.productId!==0x6001)
      throw Error('Cannot verify original FT232R device');
    if(port.ready)await port.close();
    await port.openSelected(sameDevice);
    await port.initializeIso();
    await port.sendWake();
    // C# rechecks physical ECU ID and Flash Count before the source retry.
  },
  async flashBaud(baud){
    const main=window.parent,port=main.__55SharedEcu?.port;
    if(main===window||!main.__55CSharpFlashActive||
       main.__55RetailFlashState?.().busy!==true||!port?.ready)
      throw Error('No active FT232R for C# baud change');
    if(![10400,921600].includes(baud))throw Error('Unexpected FormMain source baud');
    return port.setBaud(baud);
  },
  flashSignal(phase,details){
    const main=window.parent;
    if(main!==window&&main.__55CSharpFlashActive===true){
      try{main.__55CSharpFlashReport?.({phase,...(details||{})})}catch{}
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
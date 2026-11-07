/* Presentation/status bridge ONLY. Does not claim FT232R or transmit ECU bytes.
   Inside the main site iframe, WebUSB stays exclusively in the parent app. */
window.csharpHost={
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
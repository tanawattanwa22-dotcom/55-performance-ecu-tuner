/* 55 Performance — Main C# ECU identification port (isolated; no Live/DTC changes).
   Source: Main/Honda_Flash_Tools.Net/FormMain.cs SetEcmParamsFromDb,
   SetRecoveryOrUnknownFormat. Browser module, no hardware I/O. */
(function(root){
"use strict";
function norm(id){return String(id??"").trim().toUpperCase();}
function identify(id,records=[]){
 const ecuId=norm(id);
 if(!ecuId)return {status:"missing-id",ecuId,matched:false,canFlash:false};
 const recovery=ecuId.endsWith("0000"),unknownFormat=ecuId.includes("-");
 const match=records.find(r=>norm(r.ecuId??r.id)===ecuId);
 if(match)return {status:"matched",ecuId,matched:true,recovery,profile:match,canFlash:false};
 return {status:recovery?"recovery-unknown":unknownFormat?"unknown-format":"not-in-database",ecuId,matched:false,recovery,canFlash:false};
}
function validateBin(bin,profile){
 const bytes=bin instanceof Uint8Array?bin:new Uint8Array(bin||[]);
 if(!bytes.length)return {ok:false,reason:"empty-bin"};
 if(!profile)return {ok:false,reason:"missing-profile"};
 const expected=Number(profile.binSize??profile.fileSize);
 if(!Number.isSafeInteger(expected)||expected<=0)return {ok:false,reason:"unknown-bin-size"};
 if(bytes.length!==expected)return {ok:false,reason:"bin-size-mismatch",actual:bytes.length,expected};
 const parseOffset=v=>typeof v==="number"?v:Number.parseInt(String(v??"").replace(/^0x/i,""),16);
 const start=parseOffset(profile.startOffset),checksum=parseOffset(profile.checksumOffset);
 if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(checksum)||checksum<0||checksum>=bytes.length)
 return {ok:false,reason:"invalid-offset"};
 return {ok:true,reason:"size-and-offset-checked",startOffset:start,checksumOffset:checksum,checksumVerified:false};
}
root.MainEcuPort=Object.freeze({identify,validateBin});
})(typeof window!=="undefined"?window:globalThis);

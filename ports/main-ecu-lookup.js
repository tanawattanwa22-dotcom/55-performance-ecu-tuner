/* Main.zip FormMain.cs SearchInProgram port adapter.
   This module is data-driven: load ECU records from a validated JSON export.
   No changes to Live/DTC/USB or write commands. */
(function(g){"use strict";
let db=[];
function install(records){
 if(!Array.isArray(records))throw Error("ECU records must be an array");
 db=records.filter(x=>x&&typeof x.ecuId==="string"&&typeof x.family==="string");
 return db.length;
}
function lookup(id){
 const key=String(id??"").trim().toUpperCase();
 return db.find(x=>x.ecuId.toUpperCase()===key)||null;
}
function classify(id){
 const key=String(id??"").trim().toUpperCase();
 if(!key)return {status:"missing-id",record:null};
 const record=lookup(key);
 if(record)return {status:"matched",record};
 return {status:key.endsWith("0000")?"recovery-unknown":key.includes("-")?"unknown-format":"not-in-database",record:null};
}
g.MainEcuLookup=Object.freeze({install,lookup,classify});
})(window);

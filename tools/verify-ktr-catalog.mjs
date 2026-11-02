// 55 PERFORMANCE KTR Honda ECM chart — metadata integrity checks only.
// This registry is NOT a BIN/XDF database and MUST NOT authorize flashing.
import assert from 'node:assert/strict';
import {KTR_ECM_ROWS,KTR_ROW_COUNT,KTR_GROUP_COUNT,KTR_NEEDS_REVIEW,KTR_SOURCE} from '../ktr/ecm-catalog.js';
assert.equal(KTR_SOURCE.suppliedAt,'2026-11-02');
assert.equal(KTR_ROW_COUNT,152);
assert.equal(KTR_GROUP_COUNT,56);
assert.equal(KTR_NEEDS_REVIEW,38);
assert.equal(KTR_ECM_ROWS.length,KTR_ROW_COUNT);
const ids=new Set();
for(const item of KTR_ECM_ROWS){
 assert.match(item.referenceId,/^KTR-\d{3}$/);
 assert.equal(ids.has(item.referenceId),false,'Duplicate KTR row ID '+item.referenceId);
 ids.add(item.referenceId);
 assert.ok(typeof item.model==='string'&&item.model.length>0);
 assert.ok(['KEIHIN','SHINDENGEN'].includes(item.family));
 assert.ok([48,56,64,96,128,256,384,768].includes(item.sizeKB));
 if(item.ecuId!==null)assert.match(item.ecuId,/^[0-9A-F]{10}$/);
 if(item.partCode!==null)assert.match(item.partCode,/^[A-Z0-9]+-[A-Z0-9]+$/);
 if(item.ecuId===null||item.partCode===null)assert.equal(item.reviewRequired,true);
 assert.equal(item.hasBin,false);
 assert.equal(item.hasXdf,false);
 assert.equal(item.flashVerified,false);
}
for(const code of ['K2J-T01','K2J-TH1','K2TG-T21','K2SF-T01','K2F-T01','K1ZT-TF1']){
 assert.ok(KTR_ECM_ROWS.some(item=>item.partCode===code),'Expected KTR part '+code);
}
const summary={
 rows:KTR_ECM_ROWS.length,models:new Set(KTR_ECM_ROWS.map(r=>r.model)).size,
 review:KTR_ECM_ROWS.filter(r=>r.reviewRequired).length,
 idAndPartPresent:KTR_ECM_ROWS.filter(r=>r.ecuId&&r.partCode).length,
 keihin:KTR_ECM_ROWS.filter(r=>r.family==='KEIHIN').length,
 shindengen:KTR_ECM_ROWS.filter(r=>r.family==='SHINDENGEN').length
};
assert.deepEqual(summary,{rows:152,models:56,review:38,idAndPartPresent:124,keihin:107,shindengen:45});
console.log('PASS — KTR Honda ECM reference data validated:',JSON.stringify(summary));
console.log('REFERENCE ONLY; NOT ECU WRITING AUTHORIZATION.');

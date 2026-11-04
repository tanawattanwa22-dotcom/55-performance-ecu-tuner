/* Source-only read-order hint. Not a flash-capable ECU profile.
 * For 290 known IDs, Main.zip family comes from the catalog. The observed
 * PCX160 ID came from user-supplied read-only TX/RX traces on 2026-11-04.
 * Always verify a fresh physical ACK; never reuse a previous Flash Count.
 */
const observed=Object.freeze({
 '0105040D01':Object.freeze({
  family:'SHINDENGEN',source:'2026-11-04 verified physical read-only source trace',
  response:'0B 09 01 01 00 00 0E 0E CE'
 }),
 '0101D00D01':Object.freeze({
  family:'SHINDENGEN',source:'2026-11-04 Click125 physical read-only count ACK verified 3/3 rounds',
  response:'0B 09 01 01 00 00 13 13 C4'
 })
});
export function sourceFamilyHint(ecuId,catalogFamily=null){
 const id=String(ecuId||'').trim().toUpperCase();
 if(!/^[0-9A-F]{10}$/.test(id))return {family:null,source:'NO_PHYSICAL_ID'};
 if(['KEIHIN','SHINDENGEN'].includes(catalogFamily))
  return {family:catalogFamily,source:'MAIN_CATALOG_290_READ_ORDER'};
 const ref=observed[id];
 return ref?{family:ref.family,source:'PHYSICAL_READ_ONLY_REFERENCE'}:
  {family:null,source:'UNKNOWN_TRY_BOTH'};
}
export const OBSERVED_READ_ONLY_IDS=Object.freeze(Object.keys(observed));

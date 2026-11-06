/* Read-only exact 122-row snapshot of the original developer's ECM.dat.
 * Source https://github.com/atakowit/DataFlashTool/blob/288b04c0e80cc4fa9daea618227c22107ce65d13/ECM.dat
 * Raw Git blob fe0b9940ba68942f5ab4f619b2f02025280d7bd3, 5621 bytes;
 * .NET BinaryWriter Int32 count + 7 UTF8 strings per row.
 * FormMain.cs embedded SearchInProgram() 290 rows remains FIRST priority.
 * This supplementary catalog supplies identity/Part/size ONLY; original
 * string 'auto' means GetEcuType/ShindengenAutoChecksum must infer from BIN.
 * A catalog record never proves a physical ECU or firmware is write-ready.
 */
export const ORIGINAL_ECM_UPSTREAM=Object.freeze({repository:'atakowit/DataFlashTool',file:'ECM.dat',
 commit:'288b04c0e80cc4fa9daea618227c22107ce65d13',blob:'fe0b9940ba68942f5ab4f619b2f02025280d7bd3',rows:122});
const ROWS=Object.freeze([["0105550D01","K2J TH1 110i new","110 i","8000","0","64","KEIHIN"],["01047B0D01","38770-K3F-T01","125 i new","8000","0","64","KEIHIN"],["0101610D01","38770-K03-T61","110 i","4000","9FEF","48","KEIHIN"],["0101880D01","38770-K03-H01","110 i","8000","0","64","KEIHIN"],["0103FA0D01","38770-K1M-T01","Dream","8000","0","64","KEIHIN"],["01040F0D01","38770-K2J-T01","110 i","8000","0","64","KEIHIN"],["01052A0D01","K3MF-T01 Gionro 125","Gionro 125","auto","auto","256","SHINDENGEN"],["0104780D01","K2TA-T02_LEAD125_4V","LEAD125_4V","auto","auto","256","SHINDENGEN"],["01030A0D01","K60S-T71_Click125","Click125","auto","auto","384","SHINDENGEN"],["0103070D01","K59K-T11_Click150","Click150","auto","auto","384","SHINDENGEN"],["0101990D01","K36F-T01_PCX150","PCX150","auto","auto","384","SHINDENGEN"],["01037C0D01","K0WF-T01_ADV150","ADV150","auto","auto","384","SHINDENGEN"],["0103D00D01","K1ZF-T01_PCX160","PCX160","auto","auto","384","SHINDENGEN"],["0103CF0D01","K1ZF-T11_PCX160","PCX160","auto","auto","384","SHINDENGEN"],["0101FF0D01","K20J-T21_Zoomer-X","Zoomer-X","auto","auto","256","SHINDENGEN"],["0102180D01","K36S-T31_PCX150","PCX150","auto","auto","384","SHINDENGEN"],["0101D00D01","K60F-T01_Click125","Click125","auto","auto","384","SHINDENGEN"],["0102990D01","K97F-T01_PCX150","PCX150","auto","auto","384","SHINDENGEN"],["0103960D01","K12M-J61_LEAD125_2V","LEAD125_2V","auto","auto","384","SHINDENGEN"],["0105050D01","K1ZP-T51 PCX 160","PCX 160","auto","auto","384","SHINDENGEN"],["0105040D01","K1ZP-T71 PCX 160 abs","PCX 160 abs","auto","auto","384","SHINDENGEN"],["01046D0D01","K2SF-T01 Click 160","Click 160","auto","auto","384","SHINDENGEN"],["01048E0D01","K0WM-TA1","adv 160","auto","auto","384","SHINDENGEN"],["01048D0D01","K0WL-T01","adv 160","auto","auto","384","SHINDENGEN"],["01034C0D11","38770-K58M-TC1","-","8000","0","64","KEIHIN"],["01034C0D01","38770-K58-TC2","-","8000","0","64","KEIHIN"],["0102580D01","38770-K73-T32","-","8000","0","64","KEIHIN"],["0102B50D01","38770-K76-T62","-","8000","0","64","KEIHIN"],["0102A00D01","38770-K94-T02","-","8000","0","96","KEIHIN"],["0100C50D02","38770-KPP-T03","-","0","DFEF","56","KEIHIN"],["0101BA0D01","38770-KZV-A61","-","8000","0","64","KEIHIN"],["01010E0D01","38770-KYZ-T03","-","4000","9FEF","48","KEIHIN"],["0100B20D01","38770-KWW-601","-","0","7FEF","56","KEIHIN"],["0100CE0D01","38770-KWW-642","-","4000","9FEF","48","KEIHIN"],["0100CE0D02","38770-KWW-643","-","4000","9FEF","48","KEIHIN"],["0101B30D01","KYZ T41 125i","-","8000","0","64","KEIHIN"],["0102B90D01","K58 T81 -.-","-","8000","0","64","KEIHIN"],["0100C31501","KZZ-J01","-","8000","0","96","KEIHIN"],["0101110F01","KPP-602","-","0","DFEF","56","KEIHIN"],["0102B70D02","K0A-T01","-","8000","0","96","KEIHIN"],["0102CA0501","K0F-A01","-","8000","0","96","KEIHIN"],["0102CA0D01","K0F-T01","-","8000","0","96","KEIHIN"],["01041F0D01","K0F-T61","-","8000","0","96","KEIHIN"],["01030E0D01","K0G-902","-","8000","0","96","KEIHIN"],["0103F90D01","K2E-T01","-","8000","0","96","KEIHIN"],["01015B0D01","KZZ-A22","-","E0000","B000","128","KEIHIN"],["01011A0D02","KZZ-903","-","E0000","B000","128","KEIHIN"],["01011A0D01","KZZ-902","-","E0000","B000","128","KEIHIN"],["0104070D01","K1T-T01","-","8000","0","96","KEIHIN"],["0102850111","MKFA-D72","-","0","7FFF8","1024","KEIHIN"],["0101830401","MGP-A92","-","0","3FFF8","256","KEIHIN"],["0102360D01","KZZ-J01","-","8000","0","96","KEIHIN"],["01031A0501","MKN-L32","-","0","7FFF8","256","KEIHIN"],["01031A1801","MKN-U11","-","0","7FFF8","256","KEIHIN"],["0101350101","K26-931","-","4000","7600","48","KEIHIN"],["0101350501","K26-911","-","4000","7600","48","KEIHIN"],["0104070501","K1T-A11","-","8000","0","96","KEIHIN"],["0102360F01","KZZ-L41","-","8000","0","96","KEIHIN"],["0100DF0D02","KVB-S53","-","4000","7600","48","KEIHIN"],["0103250F01","K54-NA1","-","8000","0","64","KEIHIN"],["0101740D02","KZZ-914","-","E0000","B000","128","KEIHIN"],["01027D0D01","MJE-TB1","-","0","7FFF8","512","KEIHIN"],["01031A0D01","MKN-T11","-","0","7FFF8","512","KEIHIN"],["0101870000","38770-K16-B61","-","8000","0","64","KEIHIN"],["0103130F01","K15-601/K15M-888","-","8000","0","64","KEIHIN"],["0101180D01","K16-901","-","4000","7600","48","KEIHIN"],["0101850D01","K16-B01","-","4000","7600","48","KEIHIN"],["0101270D01","K20-901","-","4000","7600","48","KEIHIN"],["0101350D01","K26-901","-","4000","7600","48","KEIHIN"],["0102130D01","K26-B02","-","8000","0","64","KEIHIN"],["0102130501","K26-B13","-","8000","0","64","KEIHIN"],["0102570601","K26-C01","-","8000","0","96","KEIHIN"],["0103EB0D01","K26-G01","-","8000","0","96","KEIHIN"],["01019E0D01","K33-951","-","E0000","B000","128","KEIHIN"],["0103250D01","K45-NA1/K45-TA1","-","8000","0","64","KEIHIN"],["0100CE0B01","KWW-642","-","4000","7600","48","KEIHIN"],["0100B80D01","KYJ-901","-","0","DFEF","56","KEIHIN"],["0100DB0D01","KYL-T01","-","0","7FEF","56","KEIHIN"],["0102360F11","KZZJ-L41","-","8000","0","96","KEIHIN"],["0104090D01","K2F-T01","-","0","3FFF8","256","KEIHIN"],["0104140D01","K2F-T21","-","0","3FFF8","256","KEIHIN"],["0104F30D01","K2F-T81","K2F-T81","0","3FFF8","256","KEIHIN"],["0104F50D01","K2F-TB1","-","0","3FFF8","256","KEIHIN"],["0102E50D01","K0B-T01 Forza300","-","0","7FFF8","512","KEIHIN"],["0104080D01","K2F-N01 ไฟล์ Vn","-","0","3FFF8","256","KEIHIN"],["0104DC0D01","K2VH-T11","-","auto","auto","256","SHINDENGEN"],["0105950D01","K2TG-T21","-","auto","auto","256","SHINDENGEN"],["01047E0D01","K2E-T11","-","8000","0","96","KEIHIN"],["0101290D01","K04-701 Forza300","-","E0000","B000","128","KEIHIN"],["0105B40D01","K1ZT-TF1","-","auto","auto","384","SHINDENGEN"],["0105B30D01","K1ZT-TC1","-","auto","auto","384","SHINDENGEN"],["0105AA0D02","K2F-TF1","-","0","3FFF8","256","KEIHIN"],["0105AB0D02","K2F-TD1","-","0","3FFF8","256","KEIHIN"],["0105D20D01","K1T-Tm2","K1T-TM2","8000","0","96","KEIHIN"],["0105660D01","K0F-TE1","-","8000","0","96","KEIHIN"],["0105EB0D01","K2E-t31","-","8000","0","64","KEIHIN"],["0106280D01","K3F-T61 SMK","-","8000","0","96","KEIHIN"],["0106270D01","K3F-T41","-","8000","0","64","KEIHIN"],["01033E0D01","K73 T61","-","8000","0","64","KEIHIN"],["0104F20D01","K2F T91","-","0","3FFF8","256","KEIHIN"],["0104540D01","K2W-T01 Dex","-","8000","0","96","KEIHIN"],["0100FE0D02","KZRF 702","-","auto","auto","384","SHINDENGEN"],["0101C60D01","K20 T01","-","8000","0","64","KEIHIN"],["0104C60D01","K1T TA1","-","8000","0","96","KEIHIN"],["0103960601","K12 J61 LEAD 2V","-","auto","auto","384","SHINDENGEN"],["0106900D11","K2TK T51 LEAD ABS ","-","auto","auto","256","SHINDENGEN"],["0105B30D02","K1ZT TC2 PCX160 2026","-","auto","auto","384","SHINDENGEN"],["0106A70D01","K3MH-T71 Giorno2026","-","auto","auto","256","SHINDENGEN"],["0105B40D02","K1ZT TF2 PCX160 2026","-","auto","auto","384","SHINDENGEN"],["01062C0D01","K2J TQ1 110i 2026","-","8000","0","64","KEIHIN"],["0103F70101","38770-MKE-DK1","-","10000","2FFE","960","KEIHIN"],["01034F0D01","38770-k73-t61","-","8000","0","64","KEIHIN"],["0105630D01","KOG T61","-","8000","0","96","KEIHIN"],["0101250D01","MGZ-T92 CBR500F","-","0","3FFF8","256","KEIHIN"],["0100FE0D01","KZRF 701","-","auto","auto","384","SHINDENGEN"],["0101BD0D01","KZRN C01","-","auto","auto","384","SHINDENGEN"],["0101AF0D01","KZRN C11","-","auto","auto","384","SHINDENGEN"],["0101AA0D01","MJP-T61","-","0","7FFF8","512","KEIHIN"],["09029A0D01","K97F-T12","-","auto","auto","384","SHINDENGEN"],["01032D0D01","MKP-T01","-","auto","auto","1024","SHINDENGEN"],["0903CF0D01","K1ZF T61 HY","-","auto","auto","768","SHINDENGEN"],["0105EB0D02","K2E-T32","-","8000","0","96","KEIHIN"]]);
if(ROWS.length!==ORIGINAL_ECM_UPSTREAM.rows||new Set(ROWS.map(r=>r[0])).size!==ROWS.length)
 throw Error('Original ECM.dat static snapshot integrity failed');
const INDEX=new Map(ROWS.map(([ecuId,part,model,start,checksum,size,type])=>
 [ecuId,Object.freeze({ecuId,part,model,startOffset:/^[0-9A-F]+$/i.test(start)?parseInt(start,16):null,
 checksumOffset:/^[0-9A-F]+$/i.test(checksum)?parseInt(checksum,16):null,
 startOffsetText:start,checksumOffsetText:checksum,
 sizeText:size,expectedSizeKb:/^\d+$/.test(size)?Number(size):null,
 family:type==='SHINDENGEN'?'SHINDENGEN':type==='KEIHIN'?'KEIHIN':'UNVERIFIED',
 partNumber:part.trim().split(/\s+/)[0],origin:'ORIGINAL_PUBLIC_ECM_DAT'})]));
export function findOriginalEcmDat(ecuId){
 return INDEX.get(String(ecuId||'').trim().toUpperCase())||null;
}
export function originalEcmDatRows(){return ROWS.map(row=>row.slice())}


/* ECM.dat is a supplementary, read-only catalog for a physically-read ECU ID.
 * Preserve all 122 source rows. The Flash Engine may use an unlisted ID's
 * Part and BIN size as pre-ERASE cross-checks, but never treats the ECM
 * Family/Offset/Checksum columns as ECU protocol or write-address authority.
 * Physical Family ACK and Main.zip BIN logic remain independent.
 * Some upstream model names are '-'; do not invent a model for those rows.
 */
function normalizeDisplayPart(rawPart){
 const cleaned=String(rawPart||'').toUpperCase().trim().replace(/^38770-/,'');
 // ECM.dat uses both K2TK T51 and K2TK-T51; keep the stored raw part too.
 const m=cleaned.match(/^([A-Z0-9]+)[- ]([A-Z0-9]{2,4})(?=$|[\s_\/])/);
 return m?m[1]+'-'+m[2]:null;
}
function readableEcmModel(record){
 const raw=String(record?.model||'').trim();
 if(raw&&raw!=='-'){
  return raw.replace(/Gionro/ig,'Giorno+')
   .replace(/^LEAD125_4V$/i,'Lead 125 · 4V')
   .replace(/^LEAD125_2V$/i,'Lead 125 · 2V')
   .replace(/^PCX\s*160\s*abs$/i,'PCX160 ABS')
   .replace(/^PCX\s*160$/i,'PCX160')
   .replace(/^adv\s*160$/i,'ADV160')
   .replace(/^Click\s*160$/i,'Click160');
 }
 const source=String(record?.part||'');
 if(/Giorno\s*2026/i.test(source))return 'Giorno+ 125 (2026)';
 if(/Gionro\s*125/i.test(source))return 'Giorno+ 125';
 if(/LEAD\s*ABS/i.test(source))return 'Lead 125 ABS';
 if(/LEAD125[_\s-]*4V/i.test(source))return 'Lead 125 · 4V';
 if(/LEAD125[_\s-]*2V/i.test(source))return 'Lead 125 · 2V';
 if(/PCX\s*160\s*2026/i.test(source))return 'PCX160 (2026)';
 return null; // no vehicle/year inference from an ECU ID alone
}
export function describeOriginalEcm(ecuId){
 const record=findOriginalEcmDat(ecuId);
 if(!record)return null;
 return Object.freeze({
  ecuId:record.ecuId,partCode:normalizeDisplayPart(record.part),
  rawPart:record.part,model:readableEcmModel(record),
  modelFromPart:!record.model||record.model==='-',
  family:record.family,sizeKB:record.expectedSizeKb,
  source:'Original ECM.dat · DataFlashTool 122 rows',
  flashApproved:false
 });
}

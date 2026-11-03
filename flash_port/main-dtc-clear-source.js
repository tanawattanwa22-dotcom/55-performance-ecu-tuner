/* 55 Performance — exact FM_dtc.cs method_107 source command port.
 * This module only prepares commands. It NEVER transmits, clears, or claims success.
 * Main.zip: Main/Honda_Flash_Tools.Controls/FM_dtc.cs, method_107.
 * Source uses SerialPort 10400 baud, break 100ms low/70ms high/5ms low,
 * 145ms settle, then 30ms pauses, and 50ms between clear commands.
 * The source shows a success dialog without validating ECU ACK: do not do that.
 */
export const MAIN_DTC_CLEAR_SOURCE = Object.freeze({
  baud:10400,
  init:Object.freeze([0xFE,0x04,0x72,0x8C]),
  wake:Object.freeze([0x72,0x05,0x00,0xF0,0x99]),
  clearFirst:Object.freeze([0x72,0x05,0x60,0x03,0x26]),
  clearSecond:Object.freeze([0x72,0x05,0x60,0x01,0x28]),
  delayAfterInitMs:30,
  delayAfterWakeMs:30,
  delayAfterFirstClearMs:50,
  delayAfterSecondClearMs:50
});
export function getMainDtcClearPlan(){
  const s=MAIN_DTC_CLEAR_SOURCE;
  return [
    {step:'init',tx:[...s.init],waitMs:s.delayAfterInitMs},
    {step:'wake',tx:[...s.wake],waitMs:s.delayAfterWakeMs},
    {step:'clear-bank-3',tx:[...s.clearFirst],waitMs:s.delayAfterFirstClearMs},
    {step:'clear-bank-1',tx:[...s.clearSecond],waitMs:s.delayAfterSecondClearMs}
  ];
}
export function validateMainDtcClearPlan(plan=getMainDtcClearPlan()){
  if(plan.length!==4)throw Error('DTC source plan must have four commands');
  for(const p of plan){
    if(!Array.isArray(p.tx)||!Number.isInteger(p.waitMs)||p.waitMs<0)throw Error('Invalid DTC command');
    if(p.tx.some(b=>!Number.isInteger(b)||b<0||b>255))throw Error('Invalid byte');
  }
  return true;
}

/*
 * Direct translation of purchased FormMain.cs:
 *  - lockRead48Kb64KbToolStripMenuItem_Click
 *  - lockMode48Kb64KbToolStripMenuItem_Click
 *
 * Operates on a COPIED BIN. No ECU commands are transmitted.
 * Exact source pattern/replacement order is retained.
 */
const READ_PATTERN=Uint8Array.of(65,114,110);
const READ_REPLACEMENT=Uint8Array.of(66,114,110);
const MODE48_SEARCH=[
 [163,3,16,32,0],[163,3,16,32,3],[163,75,0,81,0],
 [179,33,16,40,0],[242,33,16,107,0],[35,75,0,85,0],[99,75,0,85,0]
];
const MODE48_REPLACE=[
 [131,3,0,32,0],[130,3,0,32,0],[163,75,0,81,0],
 [146,33,0,40,0],[146,33,0,40,0],[3,75,16,85,0],[3,75,16,85,0]
];
const MODE64_SEARCH=[
 [163,3,16,32,16],[163,3,16,32,0],[163,32,16,32,16],
 [163,0,16,32,16],[131,3,16,32,16],[179,3,16,32,0]
];
const MODE64_REPLACE=[
 [131,3,0,32,0],[131,3,18,32,0],[131,2,18,32,18],
 [131,0,0,32,0],[131,3,18,32,18],[147,3,18,32,0]
];
function eligible(bin){
 if(!(bin instanceof Uint8Array)||!bin.length)throw Error('Please load a bin file before proceeding.');
 if(bin.length!==49152&&bin.length!==65536)
  throw Error('File size must be 48KB or 64KB to proceed.');
}
function matches(bytes,i,p){
 for(let j=0;j<p.length;j++)if(bytes[i+j]!==p[j])return false;
 return true;
}
function recordWrite(bytes,i,replacement,history){
 for(let j=0;j<replacement.length;j++){
  // Original FormMain collects every original value when it encounters a pattern,
  // including when later patterns overlap an earlier replacement.
  history.push({index:i+j,previous:bytes[i+j]});
  bytes[i+j]=replacement[j];
 }
}
export function applyMainLockRead(original){
 eligible(original);
 const bin=original.slice(),history=[];
 for(let i=0;i<=bin.length-READ_PATTERN.length;i++){
  if(!matches(bin,i,READ_PATTERN))continue;
  recordWrite(bin,i,READ_REPLACEMENT,history);
  break; // Source modifies FIRST matched "Arn" only.
 }
 return {bin,history,found:history.length>0,source:'FormMain.LockRead48Kb64Kb',
  message:history.length?'Replaced Successfully.':'Cannot Lock Read.'};
}
export function applyMainLockMode(original){
 eligible(original);
 const bin=original.slice(),history=[];
 const patterns=bin.length===49152?MODE48_SEARCH:MODE64_SEARCH;
 const replacements=bin.length===49152?MODE48_REPLACE:MODE64_REPLACE;
 // Source processes patterns in order and each match from low-to-high address,
 // not one combined pass, and it can replace more than one occurrence.
 for(let p=0;p<patterns.length;p++){
  const find=patterns[p],replace=replacements[p];
  for(let i=0;i<=bin.length-find.length;i++){
   if(matches(bin,i,find))recordWrite(bin,i,replace,history);
  }
 }
 return {bin,history,found:history.length>0,source:'FormMain.LockMode48Kb64Kb',
  message:history.length?'Replaced Successfully in LockMode.':'Cannot Lock Mode.'};
}
export function revertMainLock(original,history){
 if(!(original instanceof Uint8Array)||!Array.isArray(history))throw Error('Original BIN/undo history missing');
 const bin=original.slice();
 // Reverse encounter order is required for lossless undo with overlapping
 // matches (otherwise first source bytes could remain partially patched).
 for(let i=history.length-1;i>=0;i--){
  const item=history[i];
  if(!Number.isInteger(item?.index)||item.index<0||item.index>=bin.length||
     !Number.isInteger(item.previous)||item.previous<0||item.previous>255)
   throw Error('Corrupted patch history');
  bin[item.index]=item.previous;
 }
 return bin;
}

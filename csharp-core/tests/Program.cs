using CSharpCoreBrowser.Source;
static void Test(bool ok,string message){if(!ok)throw new Exception("C# Main source parity FAIL: "+message);Console.WriteLine("PASS "+message);}
byte[] five={0x7E,0x05,0x01,0x00,0x7C};
byte[] nonzero={0x7E,0x05,0x01,0x01,0x7B};
byte[] bad={0x7E,0x05,0x01,0x01,0x7C};
Test(MainProtocol.ValidateChecksum(five,5),"Honda checksum");
Test(MainProtocol.InspectWriteAck(five).Accept,"5-byte ACK 00");
Test(MainProtocol.InspectWriteAck(nonzero).Accept,"5-byte ACK 01 accepted exactly like FormMain.cs");
Test(!MainProtocol.InspectWriteAck(bad).Accept,"invalid checksum rejected");
var tx=new byte[]{0x7E,0x05,0x01,0x07,0x75};
var rx=tx.Concat(nonzero).ToArray();
Test(MainProtocol.ParseSendCommandCapture(tx,rx)!.SequenceEqual(nonzero),"SendCommand echo + reply");
rx[0]=0; // Original SendCommand does not validate the echoed command.
Test(MainProtocol.ParseSendCommandCapture(tx,rx)!.SequenceEqual(nonzero),"source does not compare echo");
Test(MainProtocol.FormMainTimeoutMs(5)==60&&MainProtocol.FormMainTimeoutMs(139)==328,"50+2*N timeout formula");
byte[] seven={0x7E,0x07,0x01,0x01,0x00,0x00,0};
seven[^1]=MainProtocol.Checksum8BitHonda(seven,seven.Length-1);
Test(MainProtocol.InspectWriteAck(seven).ExplicitRetry,"7-byte explicit retry");
var block=Enumerable.Range(0,128).Select(i=>(byte)i).ToArray();
var frame=MainProtocol.BuildOfflineWriteFrame(block,false,0,8);
Test(frame.Length==139 && frame[0]==0x7E && frame[1]==139,"C# offline Keihin 128 frame");
Test(MainProtocol.ValidateChecksum(frame,frame.Length),"source packet last Honda checksum");
var smaller=MainProtocol.BuildOfflineWriteFrame(block[..64],false,0,4);
Test(smaller.Length==75&&MainProtocol.ValidateChecksum(smaller,smaller.Length),"source packet Keihin 64");

Test(MainBinSource.SourceBinSizes.Length==11,"FormMain 11 BIN sizes");
var khBin=Enumerable.Repeat((byte)0xFF,57344).ToArray();
khBin[^1]=0xAA;khBin[^2]=0xAA;
Test(MainBinSource.Examine(khBin).Type=="KEIHINH8C","FormMain H8C tail signature");
var rawChecksumBin=new byte[]{1,2,3,4,5};
var newChecksumBin=MainBinSource.KeihinChecksumCopy(rawChecksumBin);
Test(newChecksumBin[0]==unchecked((byte)(-14)) &&
     rawChecksumBin[0]==1,"KeihinAutoChecksum on immutable copy");
Test(MainBinSource.FindPatternInBin(new byte[]{1,2,3,2,3},new byte[]{2,3})==1,
     "source ECM ID signature search");
var shBin=Enumerable.Repeat((byte)0xFF,262144).ToArray();
shBin[^4]=0x5A;shBin[^3]=0x5A;shBin[^2]=0x5A;shBin[^1]=0x5A;
var shText=System.Text.Encoding.ASCII.GetBytes("SV850");
Array.Copy(shText,0,shBin,500,5);
Test(MainBinSource.Examine(shBin).Type=="SHINDENGENV850","FormMain Shindengen V850 classification");
var shWrite=new byte[]{17,18,19,20,21,21,23};
Array.Copy(shWrite,0,shBin,100,shWrite.Length);
shBin[117]=0xEE;shBin[118]=0xFF;
Test(MainBinSource.DeriveShindengenKey(shBin,new byte[]{0x12,0x34},false)?.Length==2,
     "Shindengen source write Seed/Key extraction from BIN");
var blocks=Enumerable.Repeat((byte)0xFF,128*4).ToArray();
blocks[0]=0x12;blocks[3*128]=0x34;
var originalPlan=MainWritePlanSource.Audit(blocks,"KEIHINOTHER");
Test(originalPlan.FramesSent==2 && originalPlan.FutureFFBlocksSkipped==2,
     "FormMain selective future-FF block skip");
var plainPlan=MainWritePlanSource.Audit(blocks,"KEIHINM32R");
Test(plainPlan.FramesSent==4 && plainPlan.FutureFFBlocksSkipped==0,
     "FormMain M32R does not skip future FF blocks");
foreach(int group in new[]{1,4,7}){
 var commands=MainDiagnosticSource.CaptureCommands(group);
 var data=new System.Collections.Generic.List<byte>();
 for(int frameIndex=0;frameIndex<commands.Length;frameIndex++){
  var liveFrame=commands[frameIndex];
  data.AddRange(liveFrame);
  var reply=new byte[liveFrame[5]+6];
  reply[0]=0x72;reply[1]=(byte)reply.Length;reply[2]=0x72;
  if(frameIndex==0){
   reply[12-7]=5;reply[13-7]=220; // source 1500 RPM
   reply[17-7]=255;reply[19-7]=255; // ECT/IAT RAW FF
  }
  reply[^1]=MainProtocol.Checksum8BitHonda(reply,reply.Length-1);
  data.AddRange(reply);
 }
 var capture=data.ToArray();
 Test(MainDiagnosticSource.ValidateCapture(capture,group,out var captureReason),
      "FM_diag Group "+group+" source envelope: "+captureReason);
 var readings=MainDiagnosticSource.DecodeCapture(capture,group);
 Test(readings.First(x=>x.Name=="RPM").Value==1500 &&
      readings.First(x=>x.Name=="ECT/EOT S3").Value is null &&
      readings.First(x=>x.Name=="IAT S4").Warning?.StartsWith("RAW FF")==true,
      "FM_diag Group "+group+" FF temperature + RPM unaffected");
}
var dtcBytes=new byte[60];
dtcBytes[10]=7;dtcBytes[11]=1;
var dtc=MainDtcSource.DecodeSourceCaptureHex(Convert.ToHexString(dtcBytes),false);
Test(dtc.Count==1&&dtc[0].Code=="7-1","FM_dtc original raw capture DTC pair");
Test(MainDtcSource.ReadFrames.Length==6&&MainDtcSource.ClearFrames.Length==2,
     "FM_dtc method_110 / method_107 source commands");

var idBin=new byte[262144]; // FormMain SearchPattern256KB: marker at 2044, three bytes at 2048
idBin[2048]=0x01;idBin[2049]=0x23;idBin[2050]=0x45;
var sourceBinId=MainBinIdSource.Find(idBin);
Test(sourceBinId.Found&&sourceBinId.IdHex=="012345"&&sourceBinId.Offset==2048,
     "FormMain 256 KiB source BIN ID 3-byte locator");
shBin[120]=0xD0;shBin[121]=0x07;
var shCorrected=MainBinSource.ShindengenChecksumCopy(shBin);
Test(shCorrected is not null&&shCorrected.ChecksumOffset==116 &&
    shBin[116]!=shCorrected.Bytes[116],
    "Shindengen original checksum correction on a cloned BIN");

Test(MainCatalogSource.Count==290,"FormMain ECU catalog 232 Keihin + 58 Shindengen");
var match=MainCatalogSource.Lookup("0104080F01");
Test(match is not null&&match.Family=="KEIHIN"&&match.PartCode=="38770-K2F-N01"&&
     match.ChecksumOffset==0x3FFF8,"original Main catalog Part/Checksum lookup");
Test(MainCatalogSource.Lookup("0103060F03")?.PartCode is null,
     "Shindengen ID without Part Code is preserved as unknown");

var lockBin=new byte[49152];
lockBin[100]=65;lockBin[101]=114;lockBin[102]=110;
var lockResult=MainBinLocksSource.LockReadCopy(lockBin);
Test(lockResult.Bytes[100]==66&&lockBin[100]==65&&lockResult.ChangedBytes==1,
     "FormMain LockRead on an immutable 48KiB BIN");
var modeBin=new byte[65536];
byte[] sourceModePattern={163,3,16,32,16};
Array.Copy(sourceModePattern,0,modeBin,100,sourceModePattern.Length);
var modeResult=MainBinLocksSource.LockModeCopy(modeBin);
Test(modeResult.Bytes[100]==131&&modeResult.ChangedBytes>0&&modeBin[100]==163,
     "FormMain LockMode source 64KiB patterns on immutable copy");
foreach(int group in new[]{1,4,7})
 foreach(var command in MainDiagnosticSource.CaptureCommands(group))
  Test(MainProtocol.ValidateChecksum(command,command.Length),
       "FM_diag Group "+group+" source TX Honda checksum");

foreach(var (label,source) in MainFlashCommands.AllHondaFrames())
 Test(MainProtocol.ValidateChecksum(source,source.Length),
      "FormMain flash command "+label+" Honda checksum");
var khSourceBin=Enumerable.Repeat((byte)255,49152).ToArray();
khSourceBin=MainBinSource.KeihinChecksumCopy(khSourceBin,0x7600);
var simulatedKeihin=new FakeMainFlashTransport("0104080F01",3,"KEIHIN");
var khSourcePlan=new MainFlashPlan("0104080F01","KEIHINOTHER","KEIHIN",
    "38770-K2F-N01",khSourceBin,0x4000,0x7600,false,true,3);
var khWriter=new MainFlashSourceEngine(simulatedKeihin);
var khResult=await khWriter.FlashAsync(khSourcePlan);
Test(khResult.Ok&&khResult.Phase=="SOURCE_FINAL_ACK",
     "Keihin C# full pre-write, erase, WRITE and Final ACK emulator");
Test(simulatedKeihin.Steps.Contains("KH_ERASE_GO")&&
     simulatedKeihin.Steps.Contains("KH_FINAL_5")&&
     simulatedKeihin.Steps.Any(x=>x.StartsWith("WRITE_BLOCK_")),
     "Source Keihin complete TX sequence");
Test(simulatedKeihin.RetryCount==2&&
     simulatedKeihin.WriteAttempts>=3,
     "Source seven-byte Retry budget is global TWO, not per-block");
Test(simulatedKeihin.Events.Contains("SOURCE_WRITE_ACK_NONZERO_UNINTERPRETED"),
     "Main five-byte nonzero-status ACK accepted and retained");
var blockedUsb=new FakeMainFlashTransport("0104080F01",3,"KEIHIN"){FailFirstWrite=true};
try{
 await new MainFlashSourceEngine(blockedUsb).FlashAsync(khSourcePlan);
 throw new Exception("Source failed to abort on ambiguous WRITE timeout");
}catch(MainFlashException err){
 Test(err.Code=="USB_OR_ECU_TIMEOUT"&&err.EraseMayHaveStarted&&
      blockedUsb.WriteAttempts==1,
      "No duplicate WRITE after ambiguous WebUSB timeout");
}
var sourceShBin=Enumerable.Repeat((byte)255,262144).ToArray();
byte[] shSig={17,18,19,20,21,21,23};
Array.Copy(shSig,0,sourceShBin,100,shSig.Length);
sourceShBin[117]=0xEE;sourceShBin[118]=0xFF;
sourceShBin[120]=0xD0;sourceShBin[121]=0x07;
var shFix=MainBinSource.ShindengenChecksumCopy(sourceShBin)
    ??throw new Exception("No Shindengen source checksum signature");
sourceShBin=shFix.Bytes;
var simulatedSh=new FakeMainFlashTransport("01046B0F01",1,"SHINDENGEN");
var shSourcePlan=new MainFlashPlan("01046B0F01","SHINDENGENV850","SHINDENGEN",
    "30400-K2SA-N02",sourceShBin,0x10000,shFix.ChecksumOffset,false,true,1);
var shResult=await new MainFlashSourceEngine(simulatedSh).FlashAsync(shSourcePlan);
Test(shResult.Ok&&simulatedSh.Steps.Contains("SH_SEED")&&
     simulatedSh.Steps.Contains("SH_KEY")&&
     simulatedSh.Steps.Contains("SH_FINAL5"),
     "Shindengen C# seed/key, erase, WRITE, Final ACK emulator");
Console.WriteLine("ALL Main.zip C# offline tests PASSED. No ECU/USB commands sent.");
sealed class FakeMainFlashTransport : IMainFlashTransport
{
 public readonly List<string> Steps=new();
 public readonly List<string> Events=new();
 public int RetryCount=0,WriteAttempts=0;
 public bool FailFirstWrite=false;
 private readonly string id,family;private readonly int count;
 public FakeMainFlashTransport(string id,int count,string family){
  this.id=id;this.count=count;this.family=family;
 }
 private static byte[] Reply(byte status){
  byte[] r={0x7E,5,1,status,0};
  r[^1]=MainProtocol.Checksum8BitHonda(r,4);
  return r;
 }
 public Task<byte[]?> ExchangeAsync(string label,byte[] command,int timeoutMs,int afterWriteMs=0)
 {
  Steps.Add(label);
  if(label=="RECHECK_ECU_ID"){
    byte[] r={0x72,11,0x72,0,0,0,0,0,0,0,0};
    var bytes=Convert.FromHexString(id);
    Array.Copy(bytes,0,r,5,5);
    r[^1]=MainProtocol.Checksum8BitHonda(r,10);
    return Task.FromResult<byte[]?>(r);
  }
  if(label=="RECHECK_FAMILY_FLASH_COUNT"){
    byte[] r={0x7D,8,1,0,0,0,(byte)count,0};
    r[^1]=MainProtocol.Checksum8BitHonda(r,7);
    return Task.FromResult<byte[]?>(r);
  }
  if(label=="SH_SEED"){
    byte[] r={0x7B,7,2,0,0x12,0x34,0};
    r[^1]=MainProtocol.Checksum8BitHonda(r,6);
    return Task.FromResult<byte[]?>(r);
  }
  if(label.StartsWith("WRITE_BLOCK_")){
    WriteAttempts++;
    if(FailFirstWrite)throw new TimeoutException("simulated ambiguous WebUSB ACK timeout");
    if(family=="KEIHIN"&&RetryCount<2){
      RetryCount++;
      byte[] retry={0x7E,7,1,0,0,0,0};
      retry[^1]=MainProtocol.Checksum8BitHonda(retry,6);
      return Task.FromResult<byte[]?>(retry);
    }
    return Task.FromResult<byte[]?>(Reply(1)); // source accepts byte3 nonzero
  }
  return Task.FromResult<byte[]?>(Reply(
    label is "KH_POLL_F4" or "KH_FINAL_5" or "SH_FINAL5"? (byte)15:(byte)0));
 }
 public Task SetBaudAsync(int baud){Steps.Add("BAUD_"+baud);return Task.CompletedTask;}
 public Task SignalAsync(string phase,object? detail=null){Events.Add(phase);return Task.CompletedTask;}
 public Task DelayAsync(int millis)=>Task.CompletedTask;
}

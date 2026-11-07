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
Array.Copy(shWrite,shBin,100,shWrite.Length);
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
  var tx=commands[frameIndex];
  data.AddRange(tx);
  var reply=new byte[tx[5]+6];
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
Console.WriteLine("ALL Main.zip C# offline tests PASSED. No ECU/USB commands sent.");
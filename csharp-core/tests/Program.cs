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
Console.WriteLine("ALL Main.zip C# offline tests PASSED. No ECU/USB commands sent.");
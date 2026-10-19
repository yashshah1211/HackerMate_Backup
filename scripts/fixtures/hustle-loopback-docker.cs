// Project-local argv adapter only. Does not change the verified Docker or CLI binaries.
using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Diagnostics;
using System.Threading.Tasks;
class LoopbackDocker {
 const string Docker = @"@DOCKER@";
 const string Project = "@PROJECT@";
 static string Bind(string value) {
  if(Regex.IsMatch(value,@"^\d+:\d+(/tcp|/udp)?$")) return "127.0.0.1:"+value;
  if(Regex.IsMatch(value,@"^127\.0\.0\.1:\d+:\d+(/tcp|/udp)?$")) return value;
  throw new Exception("Non-loopback or unsupported publish specification refused");
 }
 // Windows CreateProcess argv quoting; never uses a shell or command interpolation.
 static string Quote(string value) {
  var result=new StringBuilder("\""); int slashes=0;
  foreach(char c in value) { if(c=='\\'){slashes++;continue;} if(c=='\"'){result.Append('\\',slashes*2+1);result.Append(c);}else{result.Append('\\',slashes);result.Append(c);}slashes=0; }
  result.Append('\\',slashes*2); result.Append('"'); return result.ToString();
 }
 static int Main(string[] args) {
  try {
   if(args.Length==1&&args[0]=="--self-test") {
    if(Bind("57321:8000")!="127.0.0.1:57321:8000"||Bind("127.0.0.1:57322:5432")!="127.0.0.1:57322:5432")return 1;
    int rejected=0;foreach(string invalid in new[]{"0.0.0.0:57321:8000","[::]:57321:8000","8000"}){try{Bind(invalid);}catch{rejected++;}}
    if(rejected!=3)return 1;Console.WriteLine("PASS: five project-local port rewrite/refusal checks");return 0;
   }
   bool create=args.Length>0&&(args[0]=="create"||args[0]=="run");
   if(create)for(int i=1;i<args.Length;i++){
    if(args[i]=="-P"||args[i]=="--publish-all")throw new Exception("Publish-all refused");
    if(args[i]=="-p"||args[i]=="--publish"){
     if(i+1>=args.Length)throw new Exception("Missing publish specification");
     int named=Array.IndexOf(args,"--name"),network=Array.IndexOf(args,"--network");
     if(named<0||named+1>=args.Length||!args[named+1].EndsWith("_"+Project)||network<0||network+1>=args.Length||args[network+1]!=Project)throw new Exception("Port rewrite outside disposable project refused");
     string original=args[i+1];args[++i]=Bind(original);
     File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"port-bindings.log"),original+" -> "+args[i]+Environment.NewLine);
    }else if(args[i].StartsWith("--publish=")||(args[i].StartsWith("-p")&&args[i].Length>2))throw new Exception("Unexpected publish spelling refused");
   }
   var joined=new StringBuilder();foreach(string arg in args){if(joined.Length>0)joined.Append(' ');joined.Append(Quote(arg));}
   var start=new ProcessStartInfo(Docker,joined.ToString()){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
   using(var child=Process.Start(start)){
    var stdout=child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
    var stderr=child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
    // Binary forwarding is required for CLI secret tar/SQL stdin. Never log payloads.
    var stdin=Console.OpenStandardInput().CopyToAsync(child.StandardInput.BaseStream).ContinueWith(t=>{try{child.StandardInput.Close();}catch{}});
    child.WaitForExit();Task.WaitAll(stdout,stderr);return child.ExitCode;
   }
  }catch(Exception){Console.Error.WriteLine("Project-local Docker launcher refused or failed; no arguments or environment disclosed.");return 126;}
 }
}

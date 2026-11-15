// Serve one immutable build only for the lifetime of one browser check.
// Uses an OS-assigned loopback port, closes on success/failure, leaves no service.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const [dir,script,...args]=process.argv.slice(2);
if(!dir||!script)throw Error('Usage: node scripts/run-fixed-check.cjs <dist> <check.cjs> [args]');
const root=path.resolve(dir),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.vrm':'model/gltf-binary','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
 let file;try{file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400);res.end();return;}
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 if(file===root)file=path.join(root,'index.html');
 fs.stat(file,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
});
server.listen(0,'127.0.0.1',()=>{
 const url=`http://127.0.0.1:${server.address().port}/`;
 console.log(`Temporary fixed-build check: ${url}; closes with check`);
 const child=spawn(process.execPath,[path.resolve(script),url,...args],{stdio:'inherit',env:process.env});
 const close=code=>{server.closeAllConnections();server.close(()=>process.exitCode=code??1);};
 child.once('exit',close);child.once('error',error=>{console.error(error);close(1);});
});

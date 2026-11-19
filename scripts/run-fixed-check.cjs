// Serve one immutable build and any verified shape data for the lifetime of one check.
// Uses an OS-assigned loopback port, closes on success/failure, leaves no service.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.vrm':'model/gltf-binary','.glb':'model/gltf-binary','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
async function loadShapeFiles(directories, root){
 if(!directories.length)return new Map();
 const {verifiedShapeOverlay,assertOverlayDist,isShapeDataPath}=require('./runtime-package/shape-overlay.cjs');
 const {files}=await verifiedShapeOverlay(directories);
 if(!(files instanceof Map)||!files.has('records/rule-body-data.json'))throw Error('Missing verified shape overlay manifest');
 for(const [name,bytes] of files){
  if(typeof name!=='string'||!Buffer.isBuffer(bytes)||!isShapeDataPath(name))
   throw Error('Unsupported fixed-check shape overlay path: '+String(name));
 }
 await assertOverlayDist(files,root);
 return files;
}

function makeServer(root,files){
 const overlayNames=new Set([...files.keys()].map(name=>name.toLowerCase()));
 const headers=(file,size)=>({
  'Content-Type':types[path.extname(file)]||'application/octet-stream',
  'Content-Length':size,'Cache-Control':'no-store',
 });
 return http.createServer((req,res)=>{
  const reject=status=>{res.writeHead(status);res.end();};
  let file;
  try{file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}
  catch{reject(400);return;}
  if(file!==root&&!file.startsWith(root+path.sep)){reject(403);return;}
  if(file===root)file=path.join(root,'index.html');
  const relative=path.relative(root,file).split(path.sep).join('/');
  if(overlayNames.has(relative.toLowerCase())){
   const bytes=files.get(relative);
   if(!bytes||req.url.split('?',1)[0]!=='/'+relative){reject(404);return;}
   res.writeHead(200,headers(relative,bytes.length));res.end(bytes);return;
  }
  const serve=()=>fs.stat(file,(err,stat)=>{
   if(err||!stat.isFile()){reject(404);return;}
   res.writeHead(200,headers(file,stat.size));fs.createReadStream(file).pipe(res);
  });
  // In shape mode the frozen side is also served by its exact on-disk path.
  if(files.size)fs.realpath.native(file,(err,actual)=>{if(err||actual!==file)reject(404);else serve();});
  else serve();
 });
}

async function main(){
 const command=process.argv.slice(2),directories=[];
 while(command[0]==='--shape-pack'){
  const [,directory]=command.splice(0,2);
  if(!directory||directory==='--shape-pack')throw Error('Expected a directory for --shape-pack');
  directories.push(path.resolve(directory));
 }
 const [dir,script,...args]=command;
 if(!dir||!script)throw Error('Usage: node scripts/run-fixed-check.cjs [--shape-pack <dir>] <dist> <check.cjs> [args]');
 const root=directories.length?await fs.promises.realpath(dir):path.resolve(dir);
 const server=makeServer(root,await loadShapeFiles(directories,root));
 const project=await productionRoot();
 const prefix=await projectOutput(path.join(project,'experiments','fixed-check-'),project);
 await fs.promises.mkdir(path.dirname(prefix),{recursive:true});
 const scratch=await fs.promises.mkdtemp(prefix);
 try{
  const temporary={TEMP:scratch,TMP:scratch,TMPDIR:scratch};
  const env={...process.env};
  if(process.platform==='win32'){
   for(const key of Object.keys(env)){
    if(Object.hasOwn(temporary,key.toUpperCase()))delete env[key];
   }
  }
  Object.assign(env,temporary);
  await once(server.listen(0,'127.0.0.1'),'listening');
  const url=`http://127.0.0.1:${server.address().port}/`;
  console.log(`Temporary fixed-build check: ${url}; closes with check`);
  process.exitCode=await new Promise(resolve=>{
   const child=spawn(process.execPath,[path.resolve(script),url,...args],{stdio:'inherit',env});
   child.once('error',error=>console.error(error));
   child.once('close',code=>resolve(code??1));
  });
 }finally{
  try{
   if(server.listening)await new Promise((resolve,reject)=>{
    server.close(error=>error?reject(error):resolve());
    server.closeAllConnections();
   });
  }finally{
   if(await projectOutput(scratch,project)!==scratch)throw Error('Fixed-check scratch directory changed: '+scratch);
   await fs.promises.rm(scratch,{recursive:true,force:true,maxRetries:3});
  }
 }
}
main().catch(error=>{
 console.error(error);
 process.exitCode ||= 1;
});

import http from 'node:http';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(directory,process.argv[3]||'viewer'),port=Number(process.argv[2]||0);
if(!Number.isInteger(port)||port<0||port>65535)throw Error('Use a TCP port from 0 to 65535');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(request,response)=>{
  try{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const room=pathname.match(/^\/delivery-room\/([a-z][a-z0-9-]{0,62})\.json$/);
    if(pathname==='/delivery-save.json'||room){
      const entry=room?`data/rooms/${room[1]}/save.json`:'data/save.json';
      const file=path.join(directory,entry);
      const packageRoot=await fs.realpath(directory), realSave=await fs.realpath(file);
      if(realSave!==path.join(packageRoot,entry)){response.writeHead(403).end();return;}
      const manifest=JSON.parse(await fs.readFile(path.join(directory,'transfer-manifest.json'),'utf8'));
      const pin=manifest.files.find(item=>item.path===entry);
      const bytes=await fs.readFile(realSave);
      if(!pin||pin.bytes!==bytes.length||pin.sha256!==createHash('sha256').update(bytes).digest('hex')){
        response.writeHead(409).end('Packaged save differs from its manifest');return;
      }
      response.writeHead(200,{'Content-Type':types['.json'],'Content-Length':bytes.length,'Cache-Control':'no-store'}).end(bytes);return;
    }
    const target=path.resolve(root,'.'+(pathname==='/'?'/company.html':pathname));
    if(!target.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    const real=await fs.realpath(target);
    if(!real.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    const bytes=await fs.readFile(real);response.writeHead(200,{'Content-Type':types[path.extname(real)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store'}).end(bytes);
  }catch{response.writeHead(404).end('Missing package resource');}
});
server.listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${server.address().port}/company.html?delivery=1`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));

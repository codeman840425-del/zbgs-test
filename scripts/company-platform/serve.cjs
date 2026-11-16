// Isolated fixed-build server. Port 0 asks the OS for a free temporary port.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript',
  '.css':'text/css','.json':'application/json','.wasm':'application/wasm',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
async function serve(directory, expectedBuild) {
  const root = path.resolve(directory);
  const info = JSON.parse(await fs.readFile(path.join(root,'build-info.json'),'utf8'));
  if (info.shortId !== expectedBuild) throw Error(`Build mismatch: ${info.shortId} != ${expectedBuild}`);
  const server = http.createServer(async (req,res) => {
    try {
      const name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const target = path.resolve(root,'.'+(name==='/'?'/index.html':name));
      if (!target.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
      const bytes = await fs.readFile(target);
      res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream',
        'Content-Length':bytes.length,'Cache-Control':'no-store'}).end(bytes);
    } catch {res.writeHead(404).end('Missing fixed-build resource');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}/`,info,
    close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
module.exports={serve};
if(require.main===module) serve(process.argv[2],process.argv[3]).then(s=>{
  console.log(JSON.stringify({url:s.url,build:s.info.shortId}));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>s.close().then(()=>process.exit(0)));
}).catch(e=>{console.error(e);process.exitCode=1;});

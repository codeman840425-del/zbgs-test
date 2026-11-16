// Offline HTTP content-coding derivatives. Model and runtime bytes are unchanged.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {gzipSync, gunzipSync, brotliCompressSync, brotliDecompressSync, constants} from 'node:zlib';
import {checkedBytes, localFile, runtimePath} from '../runtime-package/files.mjs';

export const sha = b => createHash('sha256').update(b).digest('hex');
const json = x => JSON.stringify(x, null, 2) + '\n';
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css',
  '.json':'application/json','.glb':'model/gltf-binary','.vrm':'model/gltf-binary',
  '.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.wasm':'application/wasm'};
const eligible = name => /\.(html|js|css|json|glb|vrm|svg|wasm)$/.test(name);
export const settings = {gzipLevel:6, brotliQuality:5, minInputBytes:1024, minSavingBytes:128, minSavingRatio:.02};

export async function prepare(root, out) {
  const manifestBytes = await fs.readFile(path.join(root, 'runtime-package.json'));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schema !== 'runtime-package-inventory-v1') throw Error('Unsupported source package');
  await fs.mkdir(path.dirname(path.resolve(out)), {recursive:true});
  await fs.mkdir(out, {recursive:false}); // Never overwrite an earlier candidate.
  const report = {schema:'runtime-http-coding-v1', sourceManifestSha256:sha(manifestBytes),
    runtime:manifest.runtime, tools:{node:process.version,zlib:process.versions.zlib,brotli:process.versions.brotli},
    config:settings, files:[], note:'HTTP derivatives only. No geometry, texture, fit or runtime identity change.'};
  for (const row of [...manifest.files, {path:'runtime-package.json', bytes:manifestBytes.length, sha256:sha(manifestBytes)}]) {
    const bytes = await checkedBytes(root, row);
    const entry = {path:row.path, bytes:bytes.length, sha256:sha(bytes), encodings:{}};
    if (eligible(row.path) && bytes.length >= settings.minInputBytes) {
      for (const coding of ['gzip','br']) {
        const start = performance.now();
        const encoded = coding === 'gzip' ? gzipSync(bytes, {level:settings.gzipLevel}) :
          brotliCompressSync(bytes, {params:{[constants.BROTLI_PARAM_QUALITY]:settings.brotliQuality}});
        const elapsedMs = performance.now() - start;
        const decoded = coding === 'gzip' ? gunzipSync(encoded) : brotliDecompressSync(encoded);
        if (!decoded.equals(bytes)) throw Error('Roundtrip mismatch: '+row.path);
        const saving = bytes.length - encoded.length;
        const retained = saving >= settings.minSavingBytes && saving / bytes.length >= settings.minSavingRatio;
        const relative = coding+'/'+row.path+(coding==='br'?'.br':'.gz');
        if (retained) { const file=path.join(out,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,encoded,{flag:'wx'}); }
        entry.encodings[coding] = {retained, path:retained?relative:null, bytes:encoded.length, sha256:sha(encoded), elapsedMs};
      }
    }
    report.files.push(entry);
  }
  await fs.writeFile(path.join(out,'http-coding.json'),json(report),{flag:'wx'});
  return report;
}

export function negotiate(header, available) {
  const weights = new Map();
  for (const item of (header||'').toLowerCase().split(',')) {
    const [name,...params]=item.trim().split(';'); if(!name)continue;
    const q=params.find(x=>x.trim().startsWith('q='));
    const value=q===undefined?1:Number(q.trim().slice(2));
    weights.set(name,Number.isFinite(value)&&value>=0&&value<=1?value:0);
  }
  const weight = coding => weights.has(coding) ? weights.get(coding) : coding==='identity' ?
    (weights.get('*')===0?0:1) : (weights.get('*')??0);
  // Prefer encoded bytes on equal quality. Identity remains an explicit fallback.
  return ['br','gzip','identity'].filter(x=>available.includes(x)&&weight(x)>0)
    .sort((a,b)=>weight(b)-weight(a))[0]??null;
}

export async function createServer(root, derivatives, mode='br') {
  if(!['identity','gzip','br'].includes(mode))throw Error('Unknown coding mode');
  const rawManifest=await fs.readFile(path.join(root,'runtime-package.json'));
  const coding=JSON.parse(await fs.readFile(path.join(derivatives,'http-coding.json')));
  if(coding.schema!=='runtime-http-coding-v1'||coding.sourceManifestSha256!==sha(rawManifest))throw Error('HTTP derivative/source identity mismatch');
  const files=new Map(),events=[];
  // Check complete content before binding a port, including reverse decoding.
  for(const row of coding.files){
    if(files.has(row.path))throw Error('Duplicate coding path');
    const bytes=await checkedBytes(root,row),variants={identity:bytes};
    for(const [name,encoded] of Object.entries(row.encodings)){
      if(!['gzip','br'].includes(name))throw Error('Unknown manifest coding');
      if(!encoded.retained)continue;
      const b=await checkedBytes(derivatives,{path:encoded.path,bytes:encoded.bytes,sha256:encoded.sha256});
      const decoded=name==='gzip'?gunzipSync(b):brotliDecompressSync(b);
      if(!decoded.equals(bytes))throw Error('HTTP decoding identity mismatch');
      variants[name]=b;
    }
    files.set(row.path,{row,variants});
  }
  const packageManifest=JSON.parse(rawManifest);
  if(files.size!==packageManifest.files.length+1||packageManifest.files.some(r=>files.get(r.path)?.row.sha256!==r.sha256))throw Error('Incomplete HTTP file inventory');
  const server=http.createServer((req,res)=>{
    const log={url:req.url,method:req.method,mode,time:Date.now()};events.push(log);
    const end=(status,body='')=>{log.status=status;log.bodyBytes=req.method==='HEAD'?0:Buffer.byteLength(body);res.writeHead(status);res.end(req.method==='HEAD'?undefined:body);};
    try{
      if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return end(405);}
      const u=new URL(req.url,'http://localhost');
      const relative=runtimePath(decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
      const file=files.get(relative);if(!file)return end(404,'Package resource missing');
      const available=['identity',...(mode!=='identity'&&file.variants[mode]?[mode]:[])];
      const choice=negotiate(req.headers['accept-encoding'],available);if(!choice)return end(406,'No acceptable content coding');
      const bytes=file.variants[choice];log.path=relative;log.encoding=choice;
      const etag='"'+sha(bytes)+'-'+choice+'"';
      res.setHeader('Vary','Accept-Encoding');res.setHeader('Content-Type',MIME[path.extname(relative)]||'application/octet-stream');
      res.setHeader('ETag',etag);res.setHeader('X-Content-Type-Options','nosniff');
      // Only compiler-content-addressed URLs are immutable. Existing unversioned
      // avatar/catalog URLs must revalidate, even when their contents are pinned here.
      res.setHeader('Cache-Control',/^assets\/.+-[\w-]{8}\.(js|css)$/.test(relative)?'public, max-age=31536000, immutable':'no-cache');
      if(choice!=='identity')res.setHeader('Content-Encoding',choice);
      if((req.headers['if-none-match']||'').split(',').map(x=>x.trim().replace(/^W\//,'')).some(x=>x===etag||x==='*'))return end(304);
      res.setHeader('Content-Length',bytes.length);end(200,bytes);
    }catch{end(400,'Invalid package path');}
  });
  return {server,events,coding,files};
}

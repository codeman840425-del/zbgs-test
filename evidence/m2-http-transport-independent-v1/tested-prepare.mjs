import {prepare} from './transport.mjs';
const [root,out]=process.argv.slice(2);
if(!root||!out)throw Error('Usage: node scripts/runtime-transfer-http/prepare.mjs PACKAGE NEW_OUTPUT');
const r=await prepare(root,out);
console.log(JSON.stringify({sourceManifestSha256:r.sourceManifestSha256,files:r.files.length,
  original:r.files.reduce((n,f)=>n+f.bytes,0),
  gzip:r.files.reduce((n,f)=>n+(f.encodings.gzip?.retained?f.encodings.gzip.bytes:f.bytes),0),
  br:r.files.reduce((n,f)=>n+(f.encodings.br?.retained?f.encodings.br.bytes:f.bytes),0)}));

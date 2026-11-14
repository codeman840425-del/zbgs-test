// Shared identity guard for fixed-candidate browser evidence. No product imports.
const fs=require('node:fs/promises'),path=require('node:path');
function expectations(){
 const build=process.env.QA_M1_BUILD,sha256=process.env.QA_M1_ASSET_SHA?.toLowerCase(),assetId=process.env.QA_M1_ASSET_ID||'beta-base-female-m1';
 if(!/^[a-f0-9]{12}$/.test(build||''))throw Error('QA_M1_BUILD must be the explicit 12-hex fixed candidate ID');
 if(!/^[a-f0-9]{64}$/.test(sha256||''))throw Error('QA_M1_ASSET_SHA must be the explicit primary-avatar SHA256');
 return {build,sha256,assetId};
}
function outputPath(build,leaf){return path.resolve(process.env.QA_M1_RUN_ROOT||path.join('output/playwright/m1',build),leaf);}
async function prepareOutput(build,leaf){
 const out=outputPath(build,leaf);await fs.mkdir(out,{recursive:true});
 for(const name of ['observations.json','report.json','matrix.json','failure.json','start-manifest.json']){
  try{await fs.access(path.join(out,name));}catch{continue;}
  throw Error(`Refuse to overwrite evidence ${path.join(out,name)}; use a fresh QA_M1_RUN_ROOT`);
 }
 return out;
}
async function verifyCandidate(page,expected=expectations()){
 const receipt=await page.evaluate(async()=>{
  const d=window.__debug,a=d?.avatar?.(),profile=a?.getAssetProfile?.()??a?.assetProfile??a?.profile;
  if(!d?.ready||!profile?.url)throw Error('Primary live avatar/profile not ready');
  const read=async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(`Identity fetch HTTP ${r.status}: ${url}`);return r;};
  const servedBuild=await(await read('/build-info.json')).json();
  const primaryUrl=new URL(profile.url,location.href).href;
  const bytes=await(await read(primaryUrl)).arrayBuffer();
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return {runtimeBuild:d.buildInfo,servedBuild,primary:{id:profile.id,url:primaryUrl,declaredSha256:profile.sha256,actualSha256:sha256,bytes:bytes.byteLength},url:location.href,time:new Date().toISOString()};
 });
 for(const [kind,b]of Object.entries({runtime:receipt.runtimeBuild,served:receipt.servedBuild})){
  if(b?.shortId!==expected.build||!b.sourceDigest?.startsWith(expected.build))throw Error(`${kind} fixed build mismatch: expected ${expected.build}, actual ${b?.shortId}`);
  if(b.development===true)throw Error('Development/HMR candidate is not permitted for fixed acceptance');
 }
 if(receipt.runtimeBuild.sourceDigest!==receipt.servedBuild.sourceDigest)throw Error('Runtime and served build digest differ');
 if(receipt.primary.id!==expected.assetId||receipt.primary.actualSha256!==expected.sha256||receipt.primary.declaredSha256!==expected.sha256)throw Error('Live PRIMARY avatar identity mismatch (not merely a matching preloaded VRM)');
 return receipt;
}
async function writeFailure(out,error,extra={}){if(out)await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({status:'failed-or-incomplete',error:String(error),stack:error.stack,...extra},null,2));}
module.exports={expectations,outputPath,prepareOutput,verifyCandidate,writeFailure};

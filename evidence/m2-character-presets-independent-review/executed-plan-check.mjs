// Bounded independent admission check for the single approved A selection.
// Does not create appearance files or claim browser/visual acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const source=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const contract=await import(pathToFileURL(path.join(source,'src/facial-geometry-contract.js')));
const {FOUNDATION_PROFILES:profiles}=await import(pathToFileURL(path.join(source,'src/foundation-profiles.js')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const choices=[
 {id:'baseline',mouthWidth:0,browSample:'none',noseSample:'none',eyeSample:'none'},
 {id:'A',mouthWidth:-.12,browSample:'none',noseSample:'none',eyeSample:'aperture-width105-v2'},
 {id:'B',mouthWidth:.12,browSample:'height3-spacing3-v2',noseSample:'tip-forward2-v2',eyeSample:'none'},
];
const report={scope:'Source/config admission only; actual v5 chooser roundtrip and visual distinction remain pending.',source,colors:{hairColor:'black',eyeColor:'brown',skinTone:'original',lipColor:'original'},outfit:0,rows:[]};
for(const sex of ['female','male']){
 const capability={available:true,mouthEndpointValues:[-.12,.12]};const domains={};
 for(const [domain,pin]of Object.entries(contract.VISIBLE_FACE_SOURCES)){
  const dir=path.join(source,'public/assets',pin.directory),mb=await fs.readFile(path.join(dir,'recipe-manifest.json')),manifest=JSON.parse(mb);
  assert.equal(manifest.sourceManifestSha256,pin.manifestSha256);
  const entry=manifest.recipes.find(r=>r.baseAvatarSha256===profiles[sex].sha256);assert(entry);
  assert.equal(entry.sha256,pin.recipes[sex]);const bytes=await fs.readFile(path.join(dir,entry.file));assert.equal(hash(bytes),entry.sha256);
  if(domain==='mouth')assert.deepEqual(entry.supportedValues,[-.12,0,.12]);
  else{assert.equal(entry.sampleId,pin.sampleId);capability[domain+'Available']=true;capability[domain+'Samples']=['none',entry.sampleId];}
  domains[domain]={id:entry.id,sha256:entry.sha256,manifestBytesSha256:hash(mb),sourceManifestSha256:manifest.sourceManifestSha256};
 }
 for(const selected of choices){
  assert(contract.mouthValueSupported(capability,selected.mouthWidth));
  for(const domain of ['brow','nose','eye'])assert(contract.faceSampleSupported(capability,domain,selected[domain+'Sample']));
  report.rows.push({body:sex,baseAvatarSha256:profiles[sex].sha256,selected,domains,admittedByExistingContract:true});
 }
}
await fs.mkdir(out,{recursive:false});await fs.copyFile(new URL(import.meta.url),path.join(out,'executed-plan-check.mjs'));
await fs.writeFile(path.join(out,'plan-check.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({rows:report.rows.length,scope:report.scope,out}));

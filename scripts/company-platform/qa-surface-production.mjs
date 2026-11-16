import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build,texture,glb,pixelAt} from './build-surface-finishes.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const root=new URL('../../',import.meta.url),out=new URL('evidence/company-surface-production-v1/root-verification/',root);
await fs.mkdir(out,{recursive:true});
const production=await build({check:true}),checks=[];
for(const record of production.resources) {
  const name=`assets-source/company-surface-finishes-v1/${record.id}.json`,source=await fs.readFile(new URL(name,root)),design=JSON.parse(source);
  const image=texture(design),bytes=glb(design,image),key=Object.keys(design.params)[0];
  const changed=structuredClone(design);changed.params[key]=design.params[key]===128?64:design.params[key]*2;
  // Write a real editable second input, then read it through the same exporter.
  const input=new URL(`${record.id}.modified.json`,out);await fs.writeFile(input,JSON.stringify(changed,null,2)+'\n');
  const reread=JSON.parse(await fs.readFile(input)),newImage=texture(reread),newBytes=glb(reread,newImage);
  assert.notEqual(hash(newImage),hash(image),'Every declared pattern parameter must change actual pixels');
  assert(newBytes.equals(glb(reread,texture(reread))),'Export must be deterministic');
  await fs.writeFile(new URL(`${record.id}.modified.png`,out),newImage);
  await fs.writeFile(new URL(`${record.id}.modified.glb`,out),newBytes);
  const resource=JSON.parse(await fs.readFile(new URL(`prototype/public/company-assets/surface-finishes-v1/${record.id}/v1/resource.json`,root)));
  assert.equal(resource.provenance.sourceParametersSha256,hash(source));
  assert.equal(resource.provenance.generatorSha256,hash(await fs.readFile(new URL(resource.provenance.generator,root))));
  assert.equal(resource.asset.sha256,hash(bytes));
  for(let x=-32;x<544;x+=17)for(let y=-32;y<544;y+=19) {
    assert.deepEqual(pixelAt(design,x,y),pixelAt(design,x+512,y));
    assert.deepEqual(pixelAt(design,x,y),pixelAt(design,x,y+512));
  }
  assert.throws(()=>texture({...design,params:{[key]:48}}),'Nonperiodic design input must be rejected');
  checks.push({id:record.id,sourceSha256:hash(source),parameter:key,from:design.params[key],to:changed.params[key],base:hash(bytes),modified:hash(newBytes),repeat:hash(glb(reread,texture(reread))),passed:true});
}
await fs.writeFile(new URL('report.json',out),JSON.stringify({status:'passed',checks,limits:['CPU source/provenance and deterministic PNG/GLB verification; actual browser decoding and room display are separate evidence.']},null,2)+'\n');
console.log(JSON.stringify({status:'passed',checks:checks.length}));

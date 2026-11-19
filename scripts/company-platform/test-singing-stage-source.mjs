import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifySingingSources} from './validate-resource-provenance.mjs';
import {checkManagedOutput} from './package-company.mjs';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};

const [target,...extra]=process.argv.slice(2);
if(!target || extra.length) throw Error('Usage: node test-singing-stage-source.mjs NEW_TEST_DIRECTORY');
const root=fileURLToPath(new URL('../..',import.meta.url)), directory=path.resolve(target);
const producers=new Set(['scripts/company-platform/build-singing-stage.mjs','scripts/company-platform/build-vocal-mic-looks.mjs']);
const assets=catalog.resources.filter(r=>producers.has(r.provenance?.generator));
assert(assets.length>=2);
await checkManagedOutput(directory,root,{allowDelivery:false});
await fs.mkdir(directory);
const results=[];
for(const resource of assets){
  const {dependencies,functionalContractSource,sourceParameters}=resource.provenance;
  for(const name of [functionalContractSource,sourceParameters,...Object.values(dependencies).map(pin=>pin.path)]){
    const dest=path.join(directory,name);
    await fs.mkdir(path.dirname(dest),{recursive:true});
    await fs.copyFile(path.join(root,name),dest);
  }
  const recipe=JSON.parse(await fs.readFile(path.join(directory,sourceParameters),'utf8'));
  const verify=()=>verifySingingSources(directory,resource,recipe);
  await verify();
  const pin=dependencies.fittedMaster, master=path.join(directory,pin.path), bytes=await fs.readFile(master);
  const changed=Buffer.from(bytes);changed[changed.length-8]^=1;
  await fs.writeFile(master,changed);
  await assert.rejects(verify,{code:'singing-source-mismatch',path:pin.path});
  await fs.writeFile(master,bytes);
  const missing=structuredClone(resource);
  delete missing.provenance.dependencies.textureFilter;
  await assert.rejects(verifySingingSources(directory,missing,recipe),{code:'singing-source-mismatch',path:'textureFilter'});
  const pins=await verify();
  results.push({id:resource.id,version:resource.version,verified:pins.size,corruptMasterRejected:true,missingTextureToolRejected:true,restored:true});
}
console.log(JSON.stringify({ok:true,results},null,2));

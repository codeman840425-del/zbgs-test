import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {digest,plantCompiler,plantProducer,verifyPlantEditableProvenance} from './plant-editable-source.mjs';
import {validateResourceProvenance} from './validate-resource-provenance.mjs';

const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const run=(file,...args)=>promisify(execFile)(process.execPath,[file,...args],{cwd:root,maxBuffer:4*1024*1024});
const read=file=>fs.readFile(path.resolve(root,file));
const json=async file=>JSON.parse(await read(file));
const publisher='scripts/company-platform/publish-room-appearance.mjs';
const family='assets-source/company-desktop-plants-v1';
const dir=await fs.mkdtemp(path.join(root,'assets-source','company-production-test-'));
const relative=file=>path.relative(root,file).split(path.sep).join('/');
await fs.mkdir(path.join(root,'output'),{recursive:true});
const out=await fs.mkdtemp(path.join(root,'output','plant-original-test-'));
const fixture=relative(path.join(dir,'recipe.json')),art=relative(path.join(dir,'author.py'));
const recipe=await json(family+'/examples/pointed-kenney-v2.json'),source=recipe.sources[recipe.designs[0].source];
const original=Buffer.from('# Authoring fixture\n');
const pin={path:art,sha256:digest(original)};
const indices=['prototype/src/company/library-catalog.json','scripts/company-platform/library-inputs.json'];
const before=await Promise.all(indices.map(read));
const save=()=>fs.writeFile(path.join(root,fixture),JSON.stringify(recipe,null,2)+'\n');
const valid=path.join(out,'valid');
try{
  // Legacy files are the oracle. Compare defaults with files read from their real target paths.
  const defaults=path.join(out,'default');
  await run(plantProducer,'--output',defaults);
  const collection=await json(family+'/collection.json');
  for(const name of [family+'/collection.json',...collection.resources.flatMap(r=>[r.modelPath,r.resourcePath])])
    assert((await read(name)).equals(await fs.readFile(path.join(defaults,name))),name);
  await fs.writeFile(path.join(root,art),original);
  source.editable=pin;
  await save();await run(plantProducer,'--parameters',fixture,'--output',valid);
  const records=await json(path.join(valid,family,'collection.json')),entry=records.resources[0];
  const resource=await json(path.join(valid,entry.resourcePath));
  assert.equal(resource.provenance.generator,plantProducer);
  assert.equal(resource.provenance.dependencies.geometryCompiler.path,plantCompiler);
  assert.deepEqual(resource.provenance.dependencies.editableSource,pin);
  await validateResourceProvenance({root,resource});
  const stripped=structuredClone(resource);delete stripped.provenance.dependencies.editableSource;
  await assert.rejects(verifyPlantEditableProvenance(root,stripped,recipe),{code:'plant-editable-provenance-mismatch'});
  const oldFile=await read(path.join(valid,entry.resourcePath));
  const failures=[];
  async function rejected(label,code){
    const target=path.join(out,label),args=['--parameters',fixture,'--output',target];
    for(const [tool,params] of [[plantProducer,args],[publisher,['--publish',fixture]]]){
      await assert.rejects(run(tool,...params),e=>JSON.parse(e.stderr).code===code);
    }
    assert.equal(await fs.stat(target).then(()=>true,()=>false),false);
    failures.push({label,code});
  }
  await fs.writeFile(path.join(root,art),Buffer.from('changed'));
  await rejected('changed','appearance-source-pin-mismatch');
  await assert.rejects(validateResourceProvenance({root,resource}),{code:'appearance-source-pin-mismatch'});
  await fs.unlink(path.join(root,art));
  await rejected('missing','appearance-source-missing');
  await assert.rejects(validateResourceProvenance({root,resource}),{code:'appearance-source-missing'});
  for(const name of ['../private.py','assets-source/company-production-test/../private.py','C:/private.py']){
    source.editable={...pin,path:name};await save();await rejected('unsafe','invalid-appearance-source');
  }
  const link=path.join(dir,'linked');
  await fs.symlink(path.join(root,family),link,process.platform==='win32'?'junction':'dir');
  source.editable={path:relative(path.join(link,'parameters.json')),sha256:digest(await read(family+'/parameters.json'))};
  await save();await rejected('linked','appearance-linked-path');
  await fs.unlink(link);
  source.editable=null;await save();await rejected('null','invalid-appearance-source');
  assert.deepEqual(await Promise.all(indices.map(read)),before);
  assert(oldFile.equals(await read(path.join(valid,entry.resourcePath))));
  console.log(JSON.stringify({status:'passed',legacyFiles:9,explicitSource:pin.sha256,failures}));
}finally{
  await fs.rm(dir,{force:true,recursive:true});
  await fs.rm(out,{force:true,recursive:true});
}

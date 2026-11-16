import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {packageCompany} from './package-company.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),evidence=path.join(root,'evidence/company-package-v1');
await fs.mkdir(evidence,{recursive:true});const run=await fs.mkdtemp(path.join(evidence,'run-')),checks=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function check(name,fn){try{checks.push({name,passed:true,observed:await fn()});}catch(error){checks.push({name,passed:false,code:error.code,error:error.stack});}}
async function copy(relative){const destination=path.join(run,'fixed-source',relative);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.cp(path.join(root,relative),destination,{recursive:true,errorOnExist:true,force:false});}
const source=path.join(run,'fixed-source');
for(const name of ['prototype/src/company','prototype/public/company-assets','prototype/company.html','prototype/vite.company.config.js','prototype/scripts/build-company-id.mjs','prototype/package.json','prototype/package-lock.json',
  'scripts/company-platform/company.mjs','scripts/company-platform/batch.mjs','scripts/company-platform/build-facility-catalog.mjs','scripts/company-platform/build-library.mjs','scripts/company-platform/library-inputs.json','scripts/company-platform/build-sofa.mjs','scripts/company-platform/build-timber-sofa.mjs',
  'scripts/company-platform/batch-inputs','scripts/company-platform/space-inputs','assets-source/company-sofa-v1','assets-source/company-timber-sofa',
  'scripts/company-platform/build-home-examples.mjs','docs/COMPANY-APPEARANCE-PRODUCTION-STANDARD.md','docs/COMPANY-SPACE-DESIGN-NOTES-2026-11-16.md'])await copy(name);
const prototype=path.join(source,'prototype'),modules=path.join(prototype,'node_modules');
// This is an actual isolated Vite build of an explicitly minimal CPU viewer.
// It is not relabeled production output and supplies no visual acceptance.
await fs.writeFile(path.join(prototype,'company.html'),'<!doctype html><html><body><p id="fixture"></p><script type="module" src="/src/company/preview.js"></script></body></html>\n');
await fs.writeFile(path.join(prototype,'src/company/preview.js'),"import catalog from './library-catalog.json' with {type:'json'};\nimport templates from './templates-extended.json' with {type:'json'};\ndocument.getElementById('fixture').textContent='CPU package fixture '+catalog.resources.length+'/'+templates.templates.length;\n");
await fs.symlink(path.join(root,'prototype/node_modules'),modules,process.platform==='win32'?'junction':'dir');
let build;
try{
  const identity=spawnSync(process.execPath,['scripts/build-company-id.mjs'],{cwd:prototype,encoding:'utf8'});assert.equal(identity.status,0,identity.stderr);
  const compiled=spawnSync(process.execPath,[path.join(root,'prototype/node_modules/vite/bin/vite.js'),'build',prototype,'--config',path.join(prototype,'vite.company.config.js')],{cwd:prototype,encoding:'utf8'});
  assert.equal(compiled.status,0,compiled.stderr);await fs.writeFile(path.join(run,'fixture-build.log'),identity.stdout+compiled.stdout+compiled.stderr);
  build=JSON.parse(await fs.readFile(path.join(prototype,'dist-company/company-build-info.json'),'utf8'));
}finally{await fs.unlink(modules);}
const dist=path.join(prototype,'dist-company');
const catalog=JSON.parse(await fs.readFile(path.join(prototype,'src/company/library-catalog.json'),'utf8'));
const templates=JSON.parse(await fs.readFile(path.join(prototype,'src/company/templates-extended.json'),'utf8'));
const load=name=>import(pathToFileURL(path.join(prototype,'src/company',name)).href);
const {createScaledCompany}=await load('space.js'),{prepareCompanyChange}=await load('document.js'),{encodeCompanySave,decodeCompanySave}=await load('persistence.js'),{prepareTemplateUpgrade}=await load('upgrade.js');
let document=createScaledCompany({id:'package-two-floors',scale:'building',floors:[{rooms:[{purpose:'streaming',stations:1}]},{rooms:[{purpose:'rest',sofaVersion:1}]}]},catalog,templates);
document=prepareCompanyChange(document,[{type:'replace-resource',id:'package-two-floors/floor-2/room-1/sofa',resource:{id:'timber-sofa',version:1}}],{catalog,templates}).document;
document=prepareTemplateUpgrade(document,'package-two-floors/floor-1/room-1/station-1',{id:'stream-station',version:2},{catalog,templates}).document;
const saveFile=path.join(run,'all-floors.save.json');await fs.writeFile(saveFile,await encodeCompanySave(document,catalog,templates));
const output=path.join(run,'handoff');
const parameters={distDirectory:dist,buildId:build.shortId,inputPath:saveFile,sourceRoot:source};
await check('Earlier requested production identity is checked against the actual current dist and source',async()=>{
  const target=path.join(run,'checked-live-81060'),current=JSON.parse(await fs.readFile(path.join(root,'prototype/dist-company/company-build-info.json'),'utf8'));let observed;
  try{await packageCompany({distDirectory:path.join(root,'prototype/dist-company'),buildId:'81060c5d434c',inputPath:saveFile,outputDirectory:target,sourceRoot:root});}
  catch(error){observed={code:error.code,message:error.message};}
  if(observed){assert(['package-build-mismatch','package-source-digest-mismatch','package-source-inputs-mismatch'].includes(observed.code));await assert.rejects(fs.stat(target),error=>error.code==='ENOENT');}
  else assert.equal(current.shortId,'81060c5d434c');
  const result={requestedBuild:'81060c5d434c',actualDistBuild:current.shortId,...(observed||{status:'fixed-source-matched'})};
  await fs.writeFile(path.join(evidence,'live-production-identity.json'),JSON.stringify(result,null,2)+'\n');return result;
});
let manifest;
await check('Real isolated CPU Vite build produces a complete two-floor handoff with template v2',async()=>{
  manifest=await packageCompany({...parameters,outputDirectory:output});
  assert.equal(manifest.savedCompany.floors.length,2);assert(manifest.savedCompany.dependencies.templates.some(template=>template.version===2));
  assert(manifest.savedCompany.dependencies.resources.some(resource=>resource.id==='timber-sofa'));
  assert.equal(manifest.assetDependencies.length,catalog.resources.filter(resource=>resource.asset).length);
  assert.equal(manifest.runtimeInputs.templates,'src/company/templates-extended.json');
  return{buildId:build.shortId,files:manifest.files.length,floors:manifest.savedCompany.floors,assetVersions:manifest.assetDependencies.map(asset=>`${asset.id}@${asset.version}`),purpose:'Actual minimal CPU fixture build only, not a production company-viewer acceptance'};
});
await check('Every copied file and fixed runtime byte matches its actual recorded SHA',async()=>{
  assert(manifest);
  for(const entry of manifest.files){const bytes=await fs.readFile(path.join(output,entry.path));assert.equal(bytes.length,entry.bytes);assert.equal(hash(bytes),entry.sha256);assert(!entry.path.includes('node_modules'));assert(!entry.path.endsWith('.vrm'));}
  for(const entry of manifest.runtimeFiles)assert((await fs.readFile(path.join(output,'viewer',entry.path))).equals(await fs.readFile(path.join(dist,entry.path))));
  for(const entry of manifest.productionSources)assert.equal(hash(await fs.readFile(path.join(output,'source',entry.path))),entry.sha256);
  const restored=await decodeCompanySave(await fs.readFile(path.join(output,'data/save.json'),'utf8'),catalog,templates);assert.deepEqual(restored,document);
  return{hashedFiles:manifest.files.length,producerSourceReferences:manifest.productionSources.length};
});
await check('Detached handoff validates and edits complete saves without original project modules',async()=>{
  const detachedCwd=path.join(run,'detached-cwd');await fs.mkdir(detachedCwd);
  const validate=spawnSync(process.execPath,[path.join(output,'edit.mjs'),'validate',path.join(output,'data/save.json')],{cwd:detachedCwd,encoding:'utf8'});assert.equal(validate.status,0,validate.stderr);
  const operations=path.join(run,'edit-operations.json'),next=path.join(run,'continued-result');await fs.writeFile(operations,JSON.stringify([{type:'set-state',id:'package-two-floors/floor-1/room-1/station-1/monitor',state:{on:false}}]));
  const edited=spawnSync(process.execPath,[path.join(output,'edit.mjs'),'apply',path.join(output,'data/save.json'),operations,next],{cwd:detachedCwd,encoding:'utf8'});assert.equal(edited.status,0,edited.stderr);
  const restored=await decodeCompanySave(await fs.readFile(path.join(next,'save.json'),'utf8'),catalog,templates);assert.equal(restored.nodes.filter(node=>node.kind==='floor').length,2);assert.equal(restored.nodes.find(node=>node.id.endsWith('/station-1/monitor')).state.on,false);assert.equal(restored.nodes.find(node=>node.kind==='workstation').template.version,2);
  return{standaloneValidation:JSON.parse(validate.stdout),continuedFloors:2,retainedTemplateVersion:2};
});
await check('Existing output is refused and every valid existing byte remains unchanged',async()=>{
  const before=hash(await fs.readFile(path.join(output,'transfer-manifest.json')));await assert.rejects(packageCompany({...parameters,outputDirectory:output}),error=>error.code==='package-output-exists');assert.equal(hash(await fs.readFile(path.join(output,'transfer-manifest.json'))),before);
});
await check('Changed fixed source bytes refuse publication',async()=>{
  const file=path.join(prototype,'src/company/preview.js'),before=await fs.readFile(file),target=path.join(run,'changed-source');
  try{await fs.appendFile(file,'// modified\n');await assert.rejects(packageCompany({...parameters,outputDirectory:target}),error=>error.code==='package-source-digest-mismatch');await assert.rejects(fs.stat(target),error=>error.code==='ENOENT');}finally{await fs.writeFile(file,before);}
});
await check('Missing GLB on a nonselected visible floor is still rejected',async()=>{
  const broken=path.join(run,'missing-runtime');await fs.cp(dist,broken,{recursive:true});await fs.unlink(path.join(broken,'company-assets/timber-sofa/v1/model.glb'));
  await assert.rejects(packageCompany({...parameters,distDirectory:broken,outputDirectory:path.join(run,'missing-runtime-output')}),error=>error.code==='missing-runtime-asset');
});
await check('Missing source GLB identifies the exact absent manifest path',async()=>{
  const name='public/company-assets/timber-sofa/v1/model.glb',file=path.join(prototype,name),before=await fs.readFile(file);
  try{await fs.unlink(file);await assert.rejects(packageCompany({...parameters,outputDirectory:path.join(run,'missing-source-output')}),error=>error.code==='package-source-inputs-mismatch'&&error.message.includes(name));}finally{await fs.writeFile(file,before);}
});
await check('Tampered pinned source parameters or generator cannot masquerade as editable provenance',async()=>{
  const file=path.join(source,'scripts/company-platform/build-timber-sofa.mjs'),before=await fs.readFile(file);
  try{await fs.appendFile(file,'// modified\n');await assert.rejects(packageCompany({...parameters,outputDirectory:path.join(run,'bad-provenance')}),error=>error.code==='production-source-hash-mismatch');}finally{await fs.writeFile(file,before);}
});
await check('Manifest path traversal rejects before source reads or output publication',async()=>{
  const bad=path.join(run,'traversal-dist');await fs.cp(dist,bad,{recursive:true});const info=structuredClone(build);info.inputs[0]='../outside.json';await fs.writeFile(path.join(bad,'company-build-info.json'),JSON.stringify(info));
  await assert.rejects(packageCompany({...parameters,distDirectory:bad,outputDirectory:path.join(run,'traversal-output')}),error=>error.code==='unsafe-package-path');
});
await check('A junction dist input is refused without reading through it',async()=>{
  const junction=path.join(run,'linked-dist');await fs.symlink(dist,junction,process.platform==='win32'?'junction':'dir');
  try{await assert.rejects(packageCompany({...parameters,distDirectory:junction,outputDirectory:path.join(run,'junction-output')}),error=>error.code==='linked-package-input');}finally{await fs.unlink(junction);}
});
await check('An unrelated runtime asset cannot enter the handoff',async()=>{
  const bad=path.join(run,'unrelated-runtime');await fs.cp(dist,bad,{recursive:true});await fs.writeFile(path.join(bad,'unrelated-role.vrm'),'CPU rejection sentinel');
  await assert.rejects(packageCompany({...parameters,distDirectory:bad,outputDirectory:path.join(run,'unrelated-output')}),error=>error.code==='unrelated-runtime-file');
});
await check('Wrong saved dependency content pin refuses publication',async()=>{
  const bad=JSON.parse(await fs.readFile(saveFile,'utf8'));bad.dependencies.resources[0].sha256='0'.repeat(64);const file=path.join(run,'bad-save.json');await fs.writeFile(file,JSON.stringify(bad));
  await assert.rejects(packageCompany({...parameters,inputPath:file,outputDirectory:path.join(run,'bad-save-output')}),error=>error.code==='dependency-content-mismatch');
});
await check('Complete original batch-result files are retained and hash-checked',async()=>{
  const directory=path.join(run,'batch-result');await fs.mkdir(directory);const files={'input.json':Buffer.from(JSON.stringify({key:'all-floors',input:{note:'CPU packaging fixture'}})+'\n'),'layout.json':Buffer.from(JSON.stringify(document)+'\n'),'save.json':await fs.readFile(saveFile)};
  const report={files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:hash(bytes)}]))};files['report.json']=Buffer.from(JSON.stringify(report)+'\n');for(const[name,bytes]of Object.entries(files))await fs.writeFile(path.join(directory,name),bytes);
  const target=path.join(run,'batch-handoff'),packed=await packageCompany({...parameters,inputPath:directory,outputDirectory:target});assert.equal(packed.savedCompany.floors.length,2);for(const[name,bytes]of Object.entries(files))assert((await fs.readFile(path.join(target,'data/batch-result',name))).equals(bytes));return{retainedOriginalFiles:4};
});
const result={status:checks.every(check=>check.passed)?'passed':'failed',configuration:{model:'gpt-6.1-sol',reasoning_effort:'high',reuseKnownConfiguration:true,difficulty:'complex',reason:'Complete fixed-identity handoff, safe file boundaries and detached continued editing',actualProviderConfiguration:'not independently verified',desktopHookInterception:'not independently verified'},runDirectory:run,packageToolSha256:hash(await fs.readFile(new URL('./package-company.mjs',import.meta.url))),checks,
  limits:['The positive package is an actual isolated Vite build of a minimal CPU viewer fixture. Current production identity is recorded separately without relabeling dist files.','No browser/GPU run or fresh npm ci was performed. Existing installed libraries supplied only the CPU fixture build; no node_modules are packaged.','Production fixed source rebuild equivalence and detached real browser acceptance remain root-owned steps.']};
await fs.writeFile(path.join(evidence,'report.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:checks.length,failures:checks.filter(check=>!check.passed)},null,2));if(result.status!=='passed')process.exitCode=1;

import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const defaultSource=fileURLToPath(new URL('../../',import.meta.url));
const fixedInputs=['company.html','vite.company.config.js','scripts/build-company-id.mjs','package.json','package-lock.json'];
const extraFiles=[
  'docs/COMPANY-EXTERIOR-DOOR-LEAF-CONTRACT-v1.txt',
  'scripts/company-platform/build-exterior-door-leaf-v1.mjs',
  'scripts/company-platform/test-exterior-door-leaf-integration.mjs',
  'scripts/company-platform/qa-exterior-door-leaf.cjs',
  'docs/research/COMPANY-DOOR-FRAME-CORRECTION-v2.txt',
  'docs/research/COMPANY-EXTERIOR-ENTRANCE-CONTRACT-v1.txt',
  'scripts/company-platform/test-exterior-entrance-data.mjs',
  'scripts/company-platform/test-exterior-entrance-integration.mjs',
  'scripts/company-platform/test-door-frame-geometry.mjs',
  'scripts/company-platform/qa-exterior-entrance.cjs',
  'docs/research/COMPANY-SCENE-PERFORMANCE-CONTRACT-v1.txt',
  'scripts/company-platform/qa-company-performance.cjs',
  'docs/research/COMPANY-PLACEMENT-INTERACTION-v1.txt',
  'docs/research/COMPANY-WINDOW-CONTRACT-v1.txt',
  'docs/research/COMPANY-WINDOW-COVER-CONTRACT-v1.txt',
  'scripts/company-platform/test-window-cover.mjs',
  'scripts/company-platform/test-window-cover-integration.mjs',
  'scripts/company-platform/qa-window-cover.cjs',
  'scripts/company-platform/build-window-opening.mjs',
  'scripts/company-platform/build-window-examples.mjs',
  'docs/COMPANY-SPACE-PROFILE-v2.txt',
  'scripts/company-platform/build-scale-v2-examples.mjs',
  'docs/research/COMPANY-PUBLIC-FACILITIES-CONTRACT-v1.txt',
  'scripts/company-platform/test-public-facilities.mjs',
  'scripts/company-platform/qa-public-facilities.cjs',
  'docs/COMPANY-CABLE-CONTRACT-v1.txt',
  'docs/COMPANY-PREVIEW-EDITOR-v1.txt',
  'scripts/company-platform/build-cable-devices.mjs',
  'scripts/company-platform/build-cable-route.mjs',
  'scripts/company-platform/record-fill-light-preview.cjs',
  'scripts/company-platform/qa-four-preview.cjs',
  'scripts/company-platform/test-cable-data.mjs',
  'scripts/company-platform/test-cable-render.mjs',
  'scripts/company-platform/test-cable-route-geometry.mjs',
  'scripts/company-platform/qa-cable-preview.cjs',
  'scripts/company-platform/record-cable.cjs',
  'scripts/company-platform/build-ceiling-acoustic-examples.mjs',
  'scripts/company-platform/test-ceiling-acoustic-data.mjs',
  'scripts/company-platform/test-ceiling-acoustic-geometry.mjs',
  'scripts/company-platform/qa-ceiling-acoustic-preview.cjs',
  'scripts/company-platform/qa-ceiling-acoustic-handoff.cjs',
  'scripts/company-platform/record-ceiling-acoustic-preview.cjs',
  'docs/COMPANY-CEILING-ACOUSTIC-CONTRACT-v1.txt',
  'docs/research/COMPANY-CEILING-ACOUSTIC-PREFLIGHT-2026-11-17.txt',
  'scripts/company-platform/build-wall-shelf-examples.mjs',
  'scripts/company-platform/test-wall-shelf-data.mjs',
  'scripts/company-platform/test-wall-shelf-geometry.mjs',
  'scripts/company-platform/qa-wall-shelf-preview.cjs',
  'scripts/company-platform/record-wall-shelf-preview.cjs',
  'scripts/company-platform/qa-wall-shelf-handoff.cjs',
  'docs/COMPANY-WALL-SHELF-CONTRACT-v1.txt',
  'docs/research/COMPANY-WALL-SHELF-PREFLIGHT-2026-11-17.txt',
  'docs/research/COMPANY-TEMPLATE-UPGRADE-CONTRACT-v1.txt',
  'scripts/company-platform/qa-upgrade.mjs',
  'scripts/company-platform/qa-upgrade-preview.cjs',
  'scripts/company-platform/qa-upgrade-handoff.cjs',
  'scripts/company-platform/record-seat-sofa-preview.cjs',
  'scripts/company-platform/record-static-collection-preview.cjs',
  'scripts/company-platform/record-floor-decor-preview.cjs',
  'scripts/company-platform/record-upgrade-preview.cjs',
  'scripts/company-platform/qa-scale-v2.cjs',
  'scripts/company-platform/qa-scale-handoff.cjs',
  'scripts/company-platform/test-scale-profile.mjs',
  'scripts/company-platform/test-scale-batch.mjs',
  'scripts/company-platform/build-side-table-life-items-examples.mjs',
  'docs/COMPANY-SIDE-TABLE-LIFE-ITEMS-CONTRACT-v1.txt',
  'docs/research/COMPANY-SIDE-TABLE-LIFE-ITEMS-PREFLIGHT-2026-11-17.txt',
  'scripts/company-platform/build-side-table-examples.mjs',
  'docs/COMPANY-SIDE-TABLE-CONTRACT-v1.txt',
  'docs/research/COMPANY-SIDE-TABLE-EXTERNAL-PREFLIGHT-2026-11-17.txt',
  'scripts/company-platform/company.mjs','scripts/company-platform/batch.mjs',
  'scripts/company-platform/build-facility-catalog.mjs','scripts/company-platform/build-library.mjs',
  'scripts/company-platform/library-inputs.json','scripts/company-platform/build-sofa.mjs',
  'scripts/company-platform/build-timber-sofa.mjs',
  'scripts/company-platform/build-home-examples.mjs',
  'scripts/company-platform/build-mixed-company.mjs',
  'scripts/company-platform/apply-surface-recipe.mjs',
  'scripts/company-platform/build-surface-examples.mjs',
  'scripts/company-platform/qa-surface-finishes.cjs',
  'scripts/company-platform/qa-surface-production.mjs',
  'scripts/company-platform/qa-surface-data.mjs',
  'scripts/company-platform/record-surface-finishes.cjs',
  'docs/COMPANY-SURFACE-FINISH-CONTRACT-v1.txt',
  'docs/COMPANY-CEILING-FINISH-CONTRACT-v1.txt',
  'docs/COMPANY-SUPPORT-SURFACE-CONTRACT-v1.txt',
  'scripts/company-platform/build-support-examples.mjs',
  'scripts/company-platform/build-hinged-examples.mjs',
  'docs/COMPANY-HINGED-CABINET-CONTRACT-v1.txt',
  'docs/COMPANY-SLIDING-DRAWER-CONTRACT-v1.txt',
  'scripts/company-platform/build-sliding-examples.mjs',
  'scripts/company-platform/build-clock-examples.mjs',
  'docs/COMPANY-CLOCK-CONTRACT-v1.txt',
  'docs/COMPANY-SUPPORTED-CLOCK-CONTRACT-v1.txt',
  'docs/COMPANY-INFORMATION-DISPLAY-CONTRACT-v1.txt',
  'docs/COMPANY-FLOOR-INFORMATION-CONTRACT-v1.txt',
  'scripts/company-platform/build-floor-information-examples.mjs',
  'scripts/company-platform/build-mirror-examples.mjs',
  'scripts/company-platform/build-floor-mirror-examples.mjs',
  'docs/COMPANY-FLOOR-MIRROR-CONTRACT-v1.txt',
  'docs/COMPANY-MIRROR-HOST-QUALITY-v1.txt',
  'docs/COMPANY-VANITY-TABLE-CONTRACT-v1.txt',
  'docs/research/COMPANY-VANITY-TABLE-PREFLIGHT-2026-11-16.txt',
  'docs/COMPANY-PREVIEW-OPERATIONS.txt',
  'scripts/company-platform/build-vanity-examples.mjs',
  'scripts/company-platform/build-makeup-mirror-examples.mjs',
  'docs/COMPANY-MAKEUP-MIRROR-CONTRACT-v1.txt',
  'scripts/company-platform/build-makeup-storage-examples.mjs',
  'docs/COMPANY-MAKEUP-STORAGE-CONTRACT-v1.txt',
  'scripts/company-platform/build-makeup-wall-mirror-examples.mjs',
  'docs/COMPANY-MAKEUP-WALL-MIRROR-CONTRACT-v1.txt',
  'docs/research/COMPANY-MAKEUP-WALL-MIRROR-PREFLIGHT-2026-11-17.txt',
  'scripts/company-platform/build-makeup-drawer-examples.mjs',
  'docs/COMPANY-MAKEUP-DRAWER-CONTRACT-v1.txt',
  'docs/research/COMPANY-MAKEUP-DRAWER-INSTALL-PREFLIGHT-2026-11-17.txt',
  'docs/research/COMPANY-MAKEUP-STORAGE-PREFLIGHT-2026-11-17.txt',
  'docs/research/COMPANY-MAKEUP-MIRROR-PREFLIGHT-2026-11-17.txt',
  'docs/research/COMPANY-FLOOR-MIRROR-PREFLIGHT-2026-11-16.txt',
  'docs/COMPANY-MIRROR-CONTRACT-v1.txt',
  'docs/research/COMPANY-MIRROR-REFLECTION-RESEARCH-2026-11-16.txt',
  'scripts/company-platform/build-information-examples.mjs',
  'scripts/company-platform/build-supported-clock-examples.mjs',
  'scripts/company-platform/qa-clock-data.mjs',
  'scripts/company-platform/qa-clock-geometry.mjs',
  'scripts/company-platform/qa-clock-preview.cjs',
  'scripts/company-platform/record-clock-preview.cjs',
  'scripts/company-platform/qa-information-data.mjs',
  'scripts/company-platform/qa-information-geometry.mjs',
  'scripts/company-platform/qa-information-preview.cjs',
  'scripts/company-platform/record-information-preview.cjs',
  'scripts/company-platform/qa-mirror-data.mjs',
  'scripts/company-platform/qa-mirror-geometry.mjs',
  'scripts/company-platform/qa-mirror-preview.cjs',
  'scripts/company-platform/record-mirror-preview.cjs',
  'assets-source/company-surface-finishes-v1/PRODUCTION.txt',
  'scripts/company-platform/build-appearance-batch.mjs',
  'docs/COMPANY-APPEARANCE-PRODUCTION-STANDARD.md',
  'docs/COMPANY-SPACE-DESIGN-NOTES-2026-11-16.md',
  'docs/research/COMPANY-WALL-VIEW-RESEARCH-2026-11-16.md',
  'docs/research/COMPANY-PLATFORM-COMPLETE-LONG-GOAL-v3-2026-11-16.txt',
  'docs/research/COMPANY-ENVIRONMENT-CATEGORY-RESEARCH-2026-11-16.txt',
  'docs/research/COMPANY-SPACE-DRESSING-RESEARCH-2026-11-16.txt',
  'docs/research/COMPANY-CAMERA-BACKGROUND-CONTRACT-v1.txt',
  'scripts/company-platform/build-camera-background-collection.mjs',
  'scripts/company-platform/register-camera-background.mjs',
  'scripts/company-platform/test-camera-background-data.mjs',
  'scripts/company-platform/qa-camera-background.cjs',
  'scripts/company-platform/serve.cjs',
  'scripts/company-platform/build-headphones-collection.mjs',
  'scripts/company-platform/register-headphones.mjs',
  'scripts/company-platform/test-headphones-data.mjs',
  'scripts/company-platform/qa-headphones.cjs',
  'docs/research/COMPANY-HEADPHONES-CONTRACT-v1.txt',
  'scripts/company-platform/build-audio-control-collection.mjs',
  'scripts/company-platform/register-audio-control.mjs',
  'scripts/company-platform/test-audio-control-data.mjs',
  'scripts/company-platform/qa-audio-control.cjs',
  'docs/research/COMPANY-AUDIO-CONTROL-CONTRACT-v1.txt',
  'scripts/company-platform/build-desktop-computer-collection.mjs',
  'scripts/company-platform/register-desktop-computer.mjs',
  'scripts/company-platform/qa-desktop-computer.mjs',
  'scripts/company-platform/qa-desktop-computer.cjs',
  'assets-source/company-desktop-computer-v1/README.md',
  'assets-source/company-desktop-computer-v1/parameters.json',
  'assets-source/company-desktop-computer-v1/contracts/desktop-computer.json',
  'scripts/company-platform/build-laptop-computer-collection.mjs',
  'scripts/company-platform/register-laptop-computer.mjs',
  'scripts/company-platform/qa-laptop-computer.mjs',
  'scripts/company-platform/qa-laptop-computer.cjs',
  'assets-source/company-laptop-computer-v1/README.md',
  'assets-source/company-laptop-computer-v1/parameters.json',
  'assets-source/company-laptop-computer-v1/contracts/laptop-computer.json',
  'prototype/scripts/build-id.mjs',
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
class PackageError extends Error{constructor(code,location,message){super(message);this.code=code;this.path=location;}}
const fail=(code,location,message)=>{throw new PackageError(code,location,message);};
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
const json=value=>Buffer.from(JSON.stringify(canonical(value),null,2)+'\n','utf8');
function relative(value){
  if(typeof value!=='string'||!value||value.includes('\\')||value.includes(':')||value.includes('\0')||
      path.posix.isAbsolute(value)||value.split('/').some(part=>!part||part==='.'||part==='..'))
    fail('unsafe-package-path',String(value),'Expected a safe relative POSIX path');
  return value;
}
async function noLinks(file){
  const absolute=path.resolve(file),parsed=path.parse(absolute);let cursor=parsed.root;
  for(const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)){
    cursor=path.join(cursor,component);
    const stat=await fs.lstat(cursor);
    if(stat.isSymbolicLink())fail('linked-package-input',cursor,'Symbolic links and junctions are not accepted');
  }
  return absolute;
}
async function read(root,name){
  relative(name);const file=path.resolve(root,...name.split('/'));
  if(!file.startsWith(root+path.sep))fail('unsafe-package-path',name,'Input escapes its assigned root');
  await noLinks(file);const stat=await fs.lstat(file);
  if(!stat.isFile())fail('invalid-package-file',name,'Expected a normal file');
  return fs.readFile(file);
}
async function list(root,folder=''){
  if(folder)relative(folder);const directory=folder?path.join(root,...folder.split('/')):root;
  await noLinks(directory);const result=[];
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    const name=folder?`${folder}/${entry.name}`:entry.name;relative(name);
    if(entry.isSymbolicLink())fail('linked-package-input',name,'Do not package links or junctions');
    if(entry.isDirectory())result.push(...await list(root,name));
    else if(entry.isFile())result.push(name);
    else fail('invalid-package-file',name,'Only ordinary files and directories are supported');
  }
  return result.sort();
}
function decode(bytes,location){try{return JSON.parse(bytes.toString('utf8'));}catch(error){fail('invalid-package-json',location,error.message);}}
async function assertMissing(file){try{await fs.lstat(file);}catch(error){if(error.code==='ENOENT')return;throw error;}fail('package-output-exists',file,'Output already exists and will not be overwritten');}

export async function packageCompany({distDirectory,buildId,inputPath,outputDirectory,sourceRoot=defaultSource}){
  if(!/^[a-f0-9]{12}$/.test(buildId||''))fail('invalid-package-build','buildId','Expected the explicit 12-hex company build identity');
  for(const [key,value]of Object.entries({distDirectory,inputPath,outputDirectory,sourceRoot}))if(typeof value!=='string'||!value)fail('invalid-package-argument',key,'Explicit input/output paths are required');
  const source=await noLinks(sourceRoot),dist=await noLinks(distDirectory),input=await noLinks(inputPath),output=path.resolve(outputDirectory);
  await assertMissing(output);
  try{await noLinks(path.dirname(output));}catch(error){if(error.code!=='ENOENT')throw error;}
  const prototype=path.join(source,'prototype'),infoBytes=await read(dist,'company-build-info.json'),info=decode(infoBytes,'company-build-info.json');
  if(info.shortId!==buildId||!/^[a-f0-9]{64}$/.test(info.sourceDigest||'')||!info.sourceDigest.startsWith(buildId)||!Array.isArray(info.inputs))
    fail('package-build-mismatch','company-build-info.json','Fixed dist identity does not match the requested build');
  const inputs=info.inputs.map(relative);
  if(JSON.stringify([...new Set(inputs)].sort())!==JSON.stringify(inputs))fail('invalid-build-inputs','company-build-info.json','Build inputs must be unique and sorted');
  if(inputs.some(name=>!fixedInputs.includes(name)&&!name.startsWith('src/company/')&&!name.startsWith('public/company-assets/')))
    fail('unrelated-build-input','company-build-info.json','Only the company build source grammar can be packaged');
  const actualInputs=[...await list(prototype,'src/company'),...await list(prototype,'public/company-assets'),...fixedInputs].sort();
  if(JSON.stringify(actualInputs)!==JSON.stringify(inputs)){
    const missing=inputs.filter(name=>!actualInputs.includes(name)),additional=actualInputs.filter(name=>!inputs.includes(name));
    fail('package-source-inputs-mismatch','company-build-info.json',`Fixed source input set differs; missing ${JSON.stringify(missing)}, additional ${JSON.stringify(additional)}`);
  }
  const files=new Map(),folded=new Set(),sourceFiles=[],runtimeFiles=[];
  function add(name,bytes,scope){relative(name);if(folded.has(name.toLowerCase()))fail('duplicate-package-file',name,'Package paths collide');folded.add(name.toLowerCase());files.set(name,{bytes:Buffer.from(bytes),scope});}
  const aggregate=createHash('sha256');
  for(const name of inputs){
    const bytes=await read(prototype,name);aggregate.update(name);aggregate.update('\0');aggregate.update(bytes);aggregate.update('\0');
    add(`source/prototype/${name}`,bytes,'fixed-build-source');sourceFiles.push({path:`prototype/${name}`,bytes:bytes.length,sha256:hash(bytes)});
  }
  const actualDigest=aggregate.digest('hex');
  if(actualDigest!==info.sourceDigest)fail('package-source-digest-mismatch','company-build-info.json',`Fixed build ${info.sourceDigest} differs from source ${actualDigest}`);
  for(const name of await list(dist)){
    const companyAsset=name.startsWith('company-assets/');
    if(!['company.html','company-build-info.json'].includes(name)&&!companyAsset&&!/^assets\/[A-Za-z0-9_.-]+\.(js|css|map)$/.test(name))
      fail('unrelated-runtime-file',name,'The fixed viewer may contain company entry files, bundles and company-assets only');
    const bytes=await read(dist,name);
    if(companyAsset){
      const original=files.get(`source/prototype/public/${name}`)?.bytes;
      if(!original||!bytes.equals(original))fail('runtime-asset-source-mismatch',name,'Runtime company asset differs from the fixed source bytes');
    }
    add(`viewer/${name}`,bytes,'fixed-viewer');runtimeFiles.push({path:name,bytes:bytes.length,sha256:hash(bytes)});
  }
  if(!files.has('viewer/company.html'))fail('missing-runtime-file','company.html','Fixed viewer entry is missing');
  for(const name of inputs.filter(name=>name.startsWith('public/company-assets/')))if(!files.has(`viewer/${name.slice(7)}`))
    fail('missing-runtime-asset',name,'Fixed dist is missing a source-pinned company asset');
  const preview=(await read(prototype,'src/company/preview.js')).toString('utf8');
  function runtimeImport(label){
    const match=preview.match(new RegExp(`import\\s+${label}\\s+from\\s+['"]\\./([^'"]+\\.json)['"]`));
    if(!match)fail('missing-runtime-catalog',label,'The fixed preview must declare its exact JSON catalog import');
    return `src/company/${relative(match[1])}`;
  }
  const runtimeInputs={catalog:runtimeImport('catalog'),templates:runtimeImport('templates')};
  const catalogBytes=await read(prototype,runtimeInputs.catalog),templateBytes=await read(prototype,runtimeInputs.templates);
  const catalog=decode(catalogBytes,runtimeInputs.catalog),templates=decode(templateBytes,runtimeInputs.templates);
  const persistence=await import(pathToFileURL(path.join(prototype,'src/company/persistence.js')).href);
  let inputBytes,inputFiles=[];
  if((await fs.lstat(input)).isDirectory()){
    inputBytes=await read(input,'save.json');
    for(const name of ['save.json','layout.json','input.json','report.json']){
      const bytes=await read(input,name);inputFiles.push({name,bytes});add(`data/batch-result/${name}`,bytes,'original-batch-result');
    }
    const report=decode(inputFiles.find(file=>file.name==='report.json').bytes,'batch-result/report.json');
    for(const name of ['save.json','layout.json','input.json']){
      const bytes=inputFiles.find(file=>file.name===name).bytes,expected=report.files?.[name];
      if(expected?.sha256!==hash(bytes)||expected.bytes!==bytes.length)fail('batch-result-hash-mismatch',name,'Original batch result bytes differ from its report');
    }
  }else{inputBytes=await fs.readFile(input);add('data/original-input.json',inputBytes,'original-save-or-layout');}
  const raw=decode(inputBytes,'save-or-layout');let saved,document;
  if(raw.schema==='company-save'){
    document=await persistence.decodeCompanySave(inputBytes.toString('utf8'),catalog,templates);saved=raw;
  }else if(raw.schema==='company-layout'){
    saved=JSON.parse(await persistence.encodeCompanySave(raw,catalog,templates));document=await persistence.decodeCompanySave(JSON.stringify(saved),catalog,templates);
  }else fail('unsupported-package-save','save-or-layout','Expected company-save or company-layout');
  if(inputFiles.length){const layout=decode(inputFiles.find(file=>file.name==='layout.json').bytes,'batch-result/layout.json');if(JSON.stringify(canonical(layout))!==JSON.stringify(canonical(document)))fail('batch-layout-save-mismatch','layout.json','Saved document differs from the batch layout');}
  add('data/save.json',json(saved),'complete-pinned-save');add('data/layout.json',json(document),'complete-editable-layout');
  add('data/library-catalog.json',catalogBytes,'complete-catalog');
  add('data/templates.json',templateBytes,'complete-templates');
  const supplemental=new Set(extraFiles);
  for(const folder of ['scripts/company-platform/batch-inputs','scripts/company-platform/space-inputs','scripts/company-platform/space-v2-inputs','scripts/company-platform/surface-inputs'])for(const name of await list(source,folder)){
    if(!name.endsWith('.json'))fail('unsupported-production-input',name,'Production input folders must contain JSON only');supplemental.add(name);
  }
  const assetDependencies=[],provenance=[];
  for(const resource of catalog.resources.filter(resource=>resource.asset)){
    const asset=resource.asset;
    if(asset.format!=='glb'||typeof asset.url!=='string'||!asset.url.startsWith('/company-assets/'))fail('unsupported-package-asset',resource.id,'Only local company GLBs can be packaged');
    const name=`prototype/public${asset.url}`;relative(name);const bytes=await read(source,name);
    if(bytes.length!==asset.bytes||hash(bytes)!==asset.sha256)fail('package-asset-hash-mismatch',name,'Actual GLB differs from its resource identity');
    if(!files.has(`viewer${asset.url}`))fail('missing-runtime-asset',name,'Viewer is missing a catalog GLB');
    assetDependencies.push({id:resource.id,version:resource.version,path:name,bytes:bytes.length,sha256:hash(bytes)});
    const entry=resource.provenance;
    for(const [field,pin]of [['sourceParameters','sourceParametersSha256'],['generator','generatorSha256'],['functionalContractSource','functionalContractSourceSha256']]){
      if(field==='functionalContractSource'&&!entry?.[field])continue;
      const target=entry?.[field];relative(target);
      if(!target.startsWith('assets-source/company-')&&!target.startsWith('scripts/company-platform/')&&!target.startsWith('prototype/public/company-assets/')&&
          !(field==='functionalContractSource'&&extraFiles.includes(target)&&target.startsWith('docs/COMPANY-')))
        fail('unsafe-production-source',target,'Model production sources must belong to the company package grammar');
      const original=await read(source,target);
      if(hash(original)!==entry[pin])fail('production-source-hash-mismatch',target,'Actual editable source differs from the model provenance pin');
      supplemental.add(target);provenance.push({resourceId:resource.id,version:resource.version,field,path:target,sha256:hash(original)});
      if(field==='sourceParameters'){
        // Collection producers may read shared design inputs beside each item.
        const collectionRoot=target.split('/').slice(0,2).join('/');
        if(collectionRoot.startsWith('assets-source/company-'))for(const dependency of await list(source,collectionRoot))supplemental.add(dependency);
        const readme=path.posix.join(path.posix.dirname(target),'README.md');
        try{await read(source,readme);supplemental.add(readme);}catch(error){if(error.code!=='ENOENT')throw error;}
      }
    }
  }
  // Packaging tooling belongs to this producer, while sourceRoot supplies the
  // exact fixed company sources and its editable production dependencies.
  const toolRoot=path.dirname(fileURLToPath(import.meta.url));
  const own=await fs.readFile(fileURLToPath(import.meta.url));add('source/scripts/company-platform/package-company.mjs',own,'packaging-tool');
  for(const name of await list(toolRoot,'package-template'))add(`source/scripts/company-platform/${name}`,await read(toolRoot,name),'packaging-template');
  for(const name of [...supplemental].sort())if(!files.has(`source/${name}`))add(`source/${name}`,await read(source,name),'editable-production-source');
  const readme=(await read(toolRoot,'package-template/README.template.md')).toString('utf8').replaceAll('{{BUILD_ID}}',buildId).replaceAll('{{SOURCE_DIGEST}}',info.sourceDigest);
  add('README.md',Buffer.from(readme,'utf8'),'handoff-instructions');add('serve.mjs',await read(toolRoot,'package-template/serve.mjs'),'local-http-viewer');
  add('edit.mjs',await read(toolRoot,'package-template/edit.mjs'),'standalone-data-editor');
  const manifest={schema:'company-transfer',version:1,buildId,sourceDigest:info.sourceDigest,
    runtimeInputs,sourceVerification:{method:'SHA256 of each manifest path, NUL, original bytes, NUL in sorted input order',inputs:sourceFiles},
    savedCompany:{id:document.id,revision:document.revision,floors:document.nodes.filter(node=>node.kind==='floor').map(node=>node.id),dependencies:saved.dependencies},
    assetDependencies,productionSources:provenance,runtimeFiles,
    files:[...files].sort(([a],[b])=>a.localeCompare(b)).map(([name,file])=>({path:name,scope:file.scope,bytes:file.bytes.length,sha256:hash(file.bytes)})),
    limits:['Fixed manifest source identity and exact packaged viewer bytes are verified. Rebuild equivalence and browser use require separate acceptance.',
      'No node_modules or character assets are included. npm ci requires the pinned dependencies to be available; a fresh offline installation is untested.']};
  add('transfer-manifest.json',json(manifest),'package-manifest');
  const parent=path.dirname(output);
  // Windows rejects mkdir on an existing drive root even with recursive:true.
  if(parent!==path.parse(parent).root)await fs.mkdir(parent,{recursive:true});
  await noLinks(parent);
  const lockPath=path.join(parent,`.${path.basename(output)}.package-lock`);let lock,stage;
  try{
    try{lock=await fs.open(lockPath,'wx');}catch(error){if(error.code==='EEXIST')fail('package-output-busy',output,'An active or interrupted publisher holds the output lock');throw error;}
    await assertMissing(output);stage=await fs.mkdtemp(path.join(parent,`.${path.basename(output)}.stage-`));
    for(const [name,file]of files){const destination=path.join(stage,...name.split('/'));if(!destination.startsWith(stage+path.sep))fail('unsafe-package-path',name,'Output escapes staging');await fs.mkdir(path.dirname(destination),{recursive:true});const handle=await fs.open(destination,'wx');try{await handle.writeFile(file.bytes);await handle.sync();}finally{await handle.close();}if(hash(await fs.readFile(destination))!==hash(file.bytes))fail('package-copy-mismatch',name,'Copied bytes differ');}
    const finalDigest=createHash('sha256');for(const name of inputs){finalDigest.update(name);finalDigest.update('\0');finalDigest.update(await read(prototype,name));finalDigest.update('\0');}
    if(finalDigest.digest('hex')!==info.sourceDigest)fail('package-source-changed','company-build-info.json','Source changed while the handoff was being prepared');
    await assertMissing(output);await fs.rename(stage,output);stage=null;return manifest;
  }finally{
    try{if(stage){const resolved=path.resolve(stage);if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith(`.${path.basename(output)}.stage-`))fail('unsafe-package-path',stage,'Refuse cleanup outside owned staging');await fs.rm(resolved,{recursive:true,force:true});}}
    finally{if(lock){try{await lock.close();}finally{await fs.unlink(lockPath);}}}
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [distDirectory,buildId,inputPath,outputDirectory,...options]=process.argv.slice(2);
  if(distDirectory==='--help')console.log('node scripts/company-platform/package-company.mjs FIXED_DIST BUILD_ID SAVE_OR_BATCH_RESULT OUT_NEW_DIR [--source FIXED_SOURCE_ROOT]');
  else if(options.length&&!(options.length===2&&options[0]==='--source')){console.error('Unsupported package arguments');process.exitCode=1;}
  else packageCompany({distDirectory,buildId,inputPath,outputDirectory,sourceRoot:options[1]||defaultSource}).then(manifest=>console.log(JSON.stringify({ok:true,buildId:manifest.buildId,companyId:manifest.savedCompany.id,files:manifest.files.length,output:path.resolve(outputDirectory)},null,2))).catch(error=>{console.error(JSON.stringify({ok:false,code:error.code||'io-error',path:error.path,message:error.message},null,2));process.exitCode=1;});
}

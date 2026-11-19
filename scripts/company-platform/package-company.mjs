import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {bindTrainingDocument,bindingFromSource,editedTrainingBinding,resolveTrainingBinding} from './package-template/training-room.mjs';

const defaultSource=fileURLToPath(new URL('../../',import.meta.url));
const fixedInputs=['company.html','vite.company.config.js','scripts/build-company-id.mjs','package.json','package-lock.json'];
const extraFiles=[
  'scripts/company-platform/publish-tabletop-ornaments.mjs',
  'scripts/company-platform/test-ornament-publication.mjs',
  'scripts/company-platform/adapt-tabletop-ornament.mjs',
  'scripts/company-platform/qa-sourced-ornaments.cjs',
  'scripts/company-platform/test-four-sourced-ornaments.mjs',
  'assets-source/company-sourced-ornaments-v1/collection.json',
  'scripts/company-platform/describe-sourced-table.mjs',
  'scripts/company-platform/test-sourced-table-geometry.mjs',
  'scripts/company-platform/test-lounge-rooms.mjs',
  'scripts/company-platform/qa-lounge-rooms.cjs',
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
  'scripts/company-platform/test-side-table-life-items-data.mjs',
  'scripts/company-platform/test-side-table-life-items-geometry.mjs',
  'scripts/company-platform/qa-side-table-life-items-preview.cjs',
  'scripts/company-platform/qa-side-table-life-items-handoff.cjs',
  'scripts/company-platform/record-side-table-life-items-preview.cjs',
  'evidence/company-side-table-life-items-data-v1/legacy-resources-before.json',
  'evidence/company-side-table-life-items-data-v1/legacy-signatures-before.json',
  'evidence/company-side-table-production-v1/before-nested.glb',
  'evidence/company-side-table-production-v1/before-nested-resource.json',
  'evidence/company-side-table-life-items-production-v1/before-tissue.glb',
  'evidence/company-side-table-life-items-production-v1/before-tissue-resource.json',
  'docs/COMPANY-SIDE-TABLE-LIFE-ITEMS-CONTRACT-v1.txt',
  'docs/research/COMPANY-SIDE-TABLE-LIFE-ITEMS-PREFLIGHT-2026-11-17.txt',
  'scripts/company-platform/build-side-table-examples.mjs',
  'scripts/company-platform/test-side-table-data.mjs',
  'scripts/company-platform/test-side-table-geometry.mjs',
  'scripts/company-platform/qa-side-table-actual.mjs',
  'scripts/company-platform/qa-side-table-preview.cjs',
  'scripts/company-platform/qa-side-table-handoff.cjs',
  'scripts/company-platform/record-side-table-preview.cjs',
  'docs/COMPANY-SIDE-TABLE-CONTRACT-v1.txt',
  'docs/research/COMPANY-SIDE-TABLE-EXTERNAL-PREFLIGHT-2026-11-17.txt',
  'scripts/company-platform/company.mjs','scripts/company-platform/batch.mjs',
  'scripts/company-platform/build-facility-catalog.mjs','scripts/company-platform/build-library.mjs',
  'scripts/company-platform/preflight-library-assets.mjs',
  'scripts/company-platform/validate-resource-provenance.mjs',
  'scripts/company-platform/test-library-asset-preflight.mjs',
  'docs/research/COMPANY-ASSET-PREFLIGHT-CONTRACT-v1.txt',
  'docs/research/COMPANY-BUILD-INPUTS-CONTRACT-v1.txt',
  'scripts/company-platform/library-inputs.json','scripts/company-platform/build-sofa.mjs',
  'scripts/company-platform/build-timber-sofa.mjs',
  'scripts/company-platform/build-home-examples.mjs',
  'scripts/company-platform/build-mixed-company.mjs',
  'scripts/company-platform/qa-mixed-company.cjs',
  'scripts/company-platform/record-mixed-company.cjs',
  'scripts/company-platform/serve.cjs',
  'scripts/company-platform/apply-surface-recipe.mjs',
  'scripts/company-platform/apply-style-recipe.mjs',
  'scripts/company-platform/style-recipes/warm-live.json',
  'scripts/company-platform/style-recipes/cool-work.json',
  'scripts/company-platform/test-style-recipe.mjs',
  'scripts/company-platform/test-style-recipe-batch.mjs',
  'scripts/company-platform/qa-whole-style-batch.cjs',
  'scripts/company-platform/test-workstation-looks.mjs',
  'scripts/company-platform/test-workstation-look-batch.mjs',
  'scripts/company-platform/check-training-clearance.mjs',
  'scripts/company-platform/test-training-clearance.mjs',
  'scripts/company-platform/qa-dance-training-rooms.cjs',
  'scripts/company-platform/qa-workstation-looks.cjs',
  'scripts/company-platform/build-style-recipe-examples.mjs',
  'scripts/company-platform/qa-style-recipe-preview.mjs',
  'scripts/company-platform/record-style-recipe-preview.mjs',
  'docs/COMPANY-STYLE-RECIPE-CONTRACT-v1.txt',
  'assets-source/company-wall-prints-v1/collection.json',
  'scripts/company-platform/import-wall-print.mjs',
  'scripts/company-platform/wall-print-model.mjs',
  'scripts/company-platform/test-wall-print-model.mjs',
  'scripts/company-platform/test-wall-print-ingress.mjs',
  'scripts/company-platform/qa-wall-print-ingress.cjs',
  'scripts/company-platform/build-concept-acoustic-panel.mjs',
  'scripts/company-platform/qa-concept-acoustic-panel-preview.mjs',
  'scripts/company-platform/record-concept-acoustic-panel-preview.mjs',
  'assets-source/company-concept-acoustic-panel-v1/concept-hex-panel.png',
  'prototype/src/company/examples/c1-concept-acoustic-panel.json',
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
  'scripts/company-platform/build-camera-mount-collection.mjs',
  'scripts/company-platform/qa-camera-mount-preview.cjs',
  'scripts/company-platform/record-camera-mount-preview.cjs',
  'scripts/company-platform/test-camera-mount-data.mjs',
  'docs/research/COMPANY-CAMERA-MOUNT-CONTRACT-v1.txt',
  'assets-source/company-camera-mount-v1/README.md',
  'assets-source/company-camera-mount-v1/parameters.json',
  'assets-source/company-camera-mount-v1/contracts/camera-mount.json',
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
  'docs/research/COMPANY-OUTLET-SWITCH-CONTRACT-v1.txt',
  'scripts/company-platform/build-outlet-switch-collection.mjs',
  'scripts/company-platform/register-outlet-switch.mjs',
  'scripts/company-platform/test-outlet-switch-data.mjs',
  'scripts/company-platform/qa-outlet-switch-preview.cjs',
  'scripts/company-platform/record-outlet-switch-preview.cjs',
  'assets-source/company-outlet-switch-v1/parameters.json',
  'assets-source/company-outlet-switch-v1/designs.mjs',
  'assets-source/company-outlet-switch-v1/collection.json',
  'docs/research/COMPANY-POWER-STRIP-CONTRACT-v1.txt',
  'assets-source/company-environment-specs-v1/branches.json',
  'assets-source/company-power-strip-v1/parameters.json',
  'assets-source/company-power-strip-v1/designs.mjs',
  'assets-source/company-power-strip-v1/collection.json',
  'scripts/company-platform/build-power-strip-collection.mjs',
  'scripts/company-platform/register-power-strip.mjs',
  'scripts/company-platform/test-power-strip-data.mjs',
  'scripts/company-platform/qa-power-strip-preview.cjs',
  'scripts/company-platform/record-power-strip-preview.cjs',
  'scripts/company-platform/build-desk-lamp-collection.mjs',
  'scripts/company-platform/test-desk-lamp-assets.mjs',
  'scripts/company-platform/test-desk-lamp-runtime.mjs',
  'scripts/company-platform/qa-desk-lamps.cjs',
  'assets-source/company-desk-lamp-v1/collection.json',
  'scripts/company-platform/build-screen-partition-collection.mjs',
  'scripts/company-platform/test-screen-partition-geometry.mjs',
  'scripts/company-platform/test-screen-partition-placement.mjs',
  'scripts/company-platform/qa-screen-partitions.cjs',
  'scripts/company-platform/publish-room-appearance.mjs',
  'scripts/company-platform/test-room-appearance-publication.mjs',
  'scripts/company-platform/qa-published-room-looks.cjs',
  'assets-source/company-screen-partition-v1/collection.json',
  'scripts/company-platform/build-static-textile-model.mjs',
  'scripts/company-platform/test-static-textile-geometry.mjs',
  'scripts/company-platform/test-sofa-textile-hosts.mjs',
  'scripts/company-platform/test-static-textile-rooms.mjs',
  'scripts/company-platform/qa-static-textiles.cjs',
  'scripts/company-platform/fixtures/static-textiles.json',
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

// Find the owning checkout even when this tool runs from a locally unpacked handoff.
// A recipient outside the managed workspace can choose their own output directory.
export async function checkManagedOutput(output, toolSource = defaultSource) {
  const checkout = path.resolve(toolSource);
  const candidates = [checkout];
  for (let dir = checkout; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (['company-workspace', 'output'].includes(path.basename(dir).toLowerCase()))
      candidates.unshift(path.dirname(dir));
  }
  let project;
  for (const candidate of candidates) {
    try {
      if ((await fs.stat(path.join(candidate, 'scripts', 'company-platform', 'local-workspace.ps1'))).isFile()) {
        project = candidate;
        break;
      }
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
  }
  if (!project) return;
  const releases = path.join(project, 'company-workspace', 'deliveries');
  if (path.relative(releases, path.dirname(output)) === '') return;
  const managed = ['output', 'company-workspace/production-trials'].some(folder => {
    const location = path.relative(path.join(project, folder), output);
    return location !== '' && location !== '..' && !location.startsWith('..' + path.sep) && !path.isAbsolute(location);
  });
  if (!managed)
    fail('outside-managed-package-directory', output,
      '临时包和试制包请放入 output 或 company-workspace/production-trials。正式版本请直接放入 company-workspace/deliveries/<版本名>。');
}

export async function packageCompany({distDirectory,buildId,inputPath,outputDirectory,sourceRoot=defaultSource,rooms=[],seatContacts=false}){
  if(!/^[a-f0-9]{12}$/.test(buildId||''))fail('invalid-package-build','buildId','Expected the explicit 12-hex company build identity');
  for(const [key,value]of Object.entries({distDirectory,inputPath,outputDirectory,sourceRoot}))if(typeof value!=='string'||!value)fail('invalid-package-argument',key,'Explicit input/output paths are required');
  if (typeof seatContacts !== 'boolean') fail('invalid-package-argument', 'seatContacts', 'Expected true or false');
  const output = path.resolve(outputDirectory);
  await checkManagedOutput(output);
  const source=await noLinks(sourceRoot),dist=await noLinks(distDirectory),input=await noLinks(inputPath);
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
  const loadRuntime=name=>import(pathToFileURL(path.join(prototype,'src/company',name)).href);
  const [persistence,space,scale,documentTools]=await Promise.all([
    loadRuntime('persistence.js'),loadRuntime('space.js'),loadRuntime('scale-v2.js'),loadRuntime('document.js')
  ]);
  const installationChecks = await import(pathToFileURL(path.join(source,'scripts/company-platform/preflight-library-assets.mjs')).href);
  // Early handoffs have an asset reader but no room geometry preflight.
  if (!installationChecks.preflightDesktopAreas && catalog.resources.some(r=>r.mounting?.reserveDesktopArea || r.garmentRail || r.mount==='garment-rail'))
    fail('missing-installation-preflight','source','The catalog requires room installation geometry checks');
  const seatCheckerPath = 'scripts/company-platform/check-seat-contacts.mjs';
  const seatCheckerFile = path.join(source, seatCheckerPath);
  const hasSeatChecker = await fs.stat(seatCheckerFile).then(stat => stat.isFile(), error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  if (seatContacts && !hasSeatChecker)
    fail('seat-contact-check-unavailable', seatCheckerPath, 'The requested fixed source has no seat geometry checker');
  if (seatContacts) await noLinks(seatCheckerFile);
  const seatContactReports = [];
  const usePointReports = [];
  const trainingContext={catalog,templates,createScaledCompany:space.createScaledCompany,
    createCompanyScaleV2:scale.createCompanyScaleV2,prepareCompanyChange:documentTools.prepareCompanyChange};
  async function includeScene(input,prefix){
    let inputBytes,inputFiles=[],trainingSource,binding;
    let inputIsDirectory=(await fs.lstat(input)).isDirectory();
    const folder=inputIsDirectory?input:path.dirname(input);
    const dataRoot=path.basename(path.dirname(folder))==='rooms'?path.dirname(path.dirname(folder)):folder;
    let previousPackage;
    if(path.basename(dataRoot)==='data' && (inputIsDirectory || ['save.json','layout.json'].includes(path.basename(input)))){
      const root=path.dirname(dataRoot);
      try{
        const prior=decode(await read(root,'transfer-manifest.json'),'transfer-manifest.json');
        if(prior.schema==='company-transfer' && prior.version===1)previousPackage={root,manifest:prior};
      }catch(error){if(error.code!=='ENOENT')throw error;}
    }
    if(previousPackage && inputIsDirectory){input=await noLinks(path.join(input,'save.json'));inputIsDirectory=false;}
    if(inputIsDirectory){
      inputBytes=await read(input,'save.json');
      const names=await fs.readdir(input);
      if(names.includes('training-edit.json')){
        if(names.includes('report.json')||names.includes('input.json'))fail('ambiguous-package-input',input,'Choose one batch or edited result');
        const receipt=await read(input,'training-edit.json'),edited=decode(receipt,'training-edit.json');
        if(edited.schema!=='training-room-edit@1'||edited.saveSha256!==hash(inputBytes)||!edited.trainingClearance||
            edited.companyId!==decode(inputBytes,'save.json').document?.id)
          fail('training-edit-mismatch','training-edit.json','Edited save differs from the recorded company or digest');
        trainingSource={kind:'training-edit',bytes:receipt};
        inputFiles.push({name:'layout.json',bytes:await read(input,'layout.json')});
      }else{
        for(const name of ['save.json','layout.json','input.json','report.json']){
          const bytes=await read(input,name);inputFiles.push({name,bytes});add(`${prefix}/batch-result/${name}`,bytes,'original-batch-result');
        }
        const original=name=>inputFiles.find(file=>file.name===name).bytes;
        const report=decode(original('report.json'),'batch-result/report.json');
        for(const name of ['save.json','layout.json','input.json']){
          const bytes=original(name),expected=report.files?.[name];
          if(expected?.sha256!==hash(bytes)||expected.bytes!==bytes.length)fail('batch-result-hash-mismatch',name,'Original batch result bytes differ from its report');
        }
        trainingSource={kind:'batch-input',bytes:original('input.json')};
      }
    }else{inputBytes=await fs.readFile(input);add(prefix+'/original-input.json',inputBytes,'original-save-or-layout');}
    const raw=decode(inputBytes,'save-or-layout');let saved,document;
    if(raw.schema==='company-save'){
      document=await persistence.decodeCompanySave(inputBytes.toString('utf8'),catalog,templates);saved=raw;
    }else if(raw.schema==='company-layout'){
      saved=JSON.parse(await persistence.encodeCompanySave(raw,catalog,templates));document=await persistence.decodeCompanySave(JSON.stringify(saved),catalog,templates);
    }else fail('unsupported-package-save','save-or-layout','Expected company-save or company-layout');
    if(!inputIsDirectory){
      if(previousPackage){
        const {root,manifest}=previousPackage;
        const name=path.relative(root,input).split(path.sep).join('/');
        const pin=manifest.files.find(file=>file.path===name);
        if(!pin || pin.sha256!==hash(inputBytes) || pin.bytes!==inputBytes.length)
          fail('training-handoff-file-mismatch',name,'The saved input differs from its original package manifest.');
        binding=await resolveTrainingBinding(root,manifest,input,document,inputBytes,undefined,trainingContext);
      }else{
        binding=await editedTrainingBinding(input,document);
      }
    }
    if(inputFiles.length){const layout=decode(inputFiles.find(file=>file.name==='layout.json').bytes,'batch-result/layout.json');if(JSON.stringify(canonical(layout))!==JSON.stringify(canonical(document)))fail('batch-layout-save-mismatch','layout.json','Saved document differs from the batch layout');}
    if(trainingSource)binding=bindingFromSource(document,trainingSource.kind,trainingSource.bytes,trainingContext);
    const trainingClearance=bindTrainingDocument(document,binding,input,trainingContext);
    if (trainingSource?.kind === 'batch-input') {
      const declaration = decode(trainingSource.bytes,'batch-result/input.json');
      const declared = Object.hasOwn(declaration,'productShowcases') ? declaration.productShowcases : declaration.document?.productShowcases;
      if (JSON.stringify(canonical(declared)) !== JSON.stringify(canonical(document.productShowcases)))
        fail('showcase-batch-binding-mismatch',input,'Saved showcase roles and clearances differ from the batch declaration');
      const interviews = Object.hasOwn(declaration,'interviewRooms') ? declaration.interviewRooms : declaration.document?.interviewRooms;
      if (JSON.stringify(canonical(interviews)) !== JSON.stringify(canonical(document.interviewRooms)))
        fail('interview-batch-binding-mismatch',input,'Saved interview seats, equipment or routes differ from the batch declaration');
      const singing = Object.hasOwn(declaration,'singingRooms') ? declaration.singingRooms : declaration.document?.singingRooms;
      if (JSON.stringify(canonical(singing)) !== JSON.stringify(canonical(document.singingRooms)))
        fail('singing-batch-binding-mismatch',input,'Saved singing equipment, stage or entrance differs from the batch declaration');
      const tea = Object.hasOwn(declaration,'teaStations') ? declaration.teaStations : declaration.document?.teaStations;
      if (JSON.stringify(canonical(tea)) !== JSON.stringify(canonical(document.teaStations)))
        fail('tea-station-binding-mismatch',input,'Saved tea station members, service clearance or passage differs from the batch declaration');
    }
    if (Object.hasOwn(document,'productShowcases')) {
      const checker = path.join(source,'scripts/company-platform/check-showcase-room.mjs');
      await noLinks(checker);
      const {checkProductShowcases} = await import(pathToFileURL(checker).href);
      await checkProductShowcases(document,{catalog,templates});
    }
    if (Object.hasOwn(document,'interviewRooms')) {
      const checker = path.join(source,'scripts/company-platform/check-interview-room.mjs');
      await noLinks(checker);
      const {checkInterviewRooms} = await import(pathToFileURL(checker).href);
      await checkInterviewRooms(document,{catalog,templates});
    }
    let vocalPoints=[];
    if (Object.hasOwn(document,'singingRooms')) {
      const checker = path.join(source,'scripts/company-platform/check-singing-room.mjs');
      await noLinks(checker);
      const {checkSingingRooms} = await import(pathToFileURL(checker).href);
      const checks=await checkSingingRooms(document,{catalog,templates,root:source});
      vocalPoints=checks.filter(result=>result.usePoint).map(result=>result.usePoint);
    }
    saved.document=document;
    if(trainingClearance!==undefined){
      const {checkTrainingClearance}=await import(pathToFileURL(path.join(source,'scripts/company-platform/check-training-clearance.mjs')).href);
      await checkTrainingClearance(document,trainingClearance,{catalog,templates});
      if(!files.has(prefix+'/batch-result/input.json')){
        const receipt={schema:'training-room-edit@1',companyId:document.id,saveSha256:hash(json(saved)),trainingClearance};
        add(prefix+'/training-edit.json',json(receipt),'edited-training-contract');
      }
    }
    const derived = documentTools.deriveCompany(document,catalog,templates);
    if (Object.hasOwn(document,'teaStations') || derived.facilities.some(item=>item.resource.mountRole==='tea-counter')) {
      const checker = path.join(source,'scripts/company-platform/check-tea-station.mjs');
      await noLinks(checker);
      const {checkTeaStations}=await import(pathToFileURL(checker).href);
      await checkTeaStations(document,{catalog,templates,derived,root:source});
    }
    if (installationChecks.preflightDesktopAreas)
      await installationChecks.preflightDesktopAreas(source,derived);
    if (seatContacts) {
      const {inspectSeatContacts} = await import(pathToFileURL(seatCheckerFile).href);
      const points = await inspectSeatContacts(document, {catalog, templates, publicDirectory: path.join(prototype, 'public')});
      const failed = points.find(point => point.status !== 'passed');
      if (failed) {
        const detail = failed.diagnostic?.message ?? failed.failures.join(', ');
        fail('seat-contact-check-failed', prefix + '/' + failed.usePointId,
          detail + ' (expected ' + failed.expectedHeight + ' m, measured ' + failed.actualHeight + ' m)');
      }
      const report = {companyId: document.id, revision: document.revision, seatCount: points.length, points};
      const reportPath = prefix + '/seat-contacts.json';
      add(reportPath, json(report), 'measured-seat-contacts');
      seatContactReports.push({path: reportPath, companyId: document.id, seatCount: points.length});
    }
    const saveBytes=json(saved);
    if(vocalPoints.length) {
      const pointPath=prefix+'/use-points.json';
      add(pointPath,json({schema:'company-installed-use-points',version:1,companyId:document.id,
        revision:document.revision,saveSha256:hash(saveBytes),points:vocalPoints}),'installed-standing-use-points');
      usePointReports.push({path:pointPath,companyId:document.id,count:vocalPoints.length});
    }
    add(prefix+'/save.json',saveBytes,'complete-pinned-save');add(prefix+'/layout.json',json(document),'complete-editable-layout');
    return {saved,document,trainingClearance};
  }
  const {saved,document,trainingClearance}=await includeScene(input,'data');
  const roomKeys=new Set();
  for(const {key,folder} of rooms){
    if(!/^[a-z][a-z0-9-]{0,62}$/.test(key)||roomKeys.has(key))fail('invalid-package-room',key,'Expected a unique room key');
    roomKeys.add(key);
    await includeScene(await noLinks(folder),`data/rooms/${key}`);
  }
  add('data/library-catalog.json',catalogBytes,'complete-catalog');
  add('data/templates.json',templateBytes,'complete-templates');
  const supplemental=new Set(extraFiles);
  const plantValidator='scripts/company-platform/plant-editable-source.mjs';
  const productionSourcePins=new Map();
  let plantTools;
  try {
    await noLinks(path.join(source,plantValidator));
    plantTools=await import(pathToFileURL(path.join(source,plantValidator)).href);
    supplemental.add(plantValidator);
  } catch(error) {
    if(error.code!=='ENOENT')throw error;
    const publisher=await read(source,'scripts/company-platform/publish-room-appearance.mjs');
    if(publisher.includes('plant-editable-source.mjs'))fail('missing-production-tool',plantValidator,'The registered plant production toolchain requires its validator');
  }
  const namedTrainingTest='scripts/company-platform/test-named-training-handoff.mjs';
  try{
    await noLinks(path.join(source,namedTrainingTest));
    supplemental.add(namedTrainingTest);
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const portableTrainingTest = 'scripts/company-platform/test-portable-training-handoff.mjs';
  try {
    await noLinks(path.join(source,portableTrainingTest));
    supplemental.add(portableTrainingTest);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (catalog.resources.some(resource => resource.productionBranch === 'background-fabric')) {
    supplemental.add('docs/research/COMPANY-BACKDROP-FABRIC-PRODUCTION.md');
    supplemental.add('scripts/company-platform/test-backdrop-fabric-assets.mjs');
    supplemental.add('scripts/company-platform/test-backdrop-roll.mjs');
    supplemental.add('scripts/company-platform/test-backdrop-rooms.mjs');
    supplemental.add('scripts/company-platform/qa-backdrop-rooms.cjs');
  }
  if (catalog.resources.some(resource => resource.productionBranch === 'ambient-led-and-neon')) {
    supplemental.add('docs/research/COMPANY-WALL-AMBIENT-PRODUCTION.md');
    supplemental.add('scripts/company-platform/test-wall-ambient-assets.mjs');
    supplemental.add('scripts/company-platform/test-wall-ambient-runtime.mjs');
    supplemental.add('scripts/company-platform/test-wall-ambient-rooms.mjs');
    supplemental.add('scripts/company-platform/qa-wall-ambient-rooms.cjs');
  }
  if (catalog.resources.some(resource => resource.productionBranch === 'phone-static')) {
    supplemental.add('docs/research/COMPANY-PHONE-STATIC-PRODUCTION.md');
    supplemental.add('scripts/company-platform/test-phone-static-assets.mjs');
    supplemental.add('scripts/company-platform/test-phone-rooms.mjs');
    supplemental.add('scripts/company-platform/qa-phone-rooms.cjs');
  }
  const garmentBranches = ['garment-rack-wardrobe','hanging-garment','enclosed-wardrobe'];
  let verifyGarmentEditableProvenance;
  let verifyShowcaseProvenance;
  let verifySingingSources;
  let verifyTeaSources;
  if (catalog.resources.some(resource=>resource.productionBranch==='tea-rest')) {
    const verifier=path.join(source,'scripts/company-platform/validate-resource-provenance.mjs');
    await noLinks(verifier);
    ({verifyTeaSources}=await import(pathToFileURL(verifier).href));
    if(!verifyTeaSources) fail('missing-production-tool',verifier,'Expected original tea-station source verification');
  }
  const singingProducer='scripts/company-platform/build-singing-stage.mjs';
  if (catalog.resources.some(resource=>resource.provenance?.generator===singingProducer)) {
    supplemental.add('scripts/company-platform/test-singing-stage-source.mjs');
    const verifier=path.join(source,'scripts/company-platform/validate-resource-provenance.mjs');
    await noLinks(verifier);
    ({verifySingingSources}=await import(pathToFileURL(verifier).href));
    if(!verifySingingSources) fail('missing-production-tool',verifier,'Expected fitted master and original source verification');
  }
  if (catalog.resources.some(resource => resource.productionBranch === 'showcase-product')) {
    for (const name of ['check-showcase-room.mjs','test-showcase-room.mjs','qa-product-showcase-rooms.cjs','showcase-inputs/showcase-checks.json'])
      supplemental.add('scripts/company-platform/'+name);
    supplemental.add('docs/research/COMPANY-PRODUCT-SHOWCASE-PRODUCTION.md');
    const verifier = path.join(source,'scripts/company-platform/validate-resource-provenance.mjs');
    await noLinks(verifier);
    ({verifyShowcaseProvenance} = await import(pathToFileURL(verifier).href));
    if (!verifyShowcaseProvenance) fail('missing-production-tool',verifier,'Expected product source verification');
  }
  if (catalog.resources.some(resource => garmentBranches.includes(resource.productionBranch))) {
    supplemental.add('docs/research/COMPANY-GARMENT-RACK-PRODUCTION.md');
    supplemental.add('scripts/company-platform/test-garment-rack-assets.mjs');
    supplemental.add('scripts/company-platform/test-garment-rack-rooms.mjs');
    supplemental.add('scripts/company-platform/qa-garment-rack-rooms.cjs');
    const verifier = 'scripts/company-platform/validate-resource-provenance.mjs';
    await noLinks(path.join(source,verifier));
    ({verifyGarmentEditableProvenance} = await import(pathToFileURL(path.join(source,verifier)).href));
    if (!verifyGarmentEditableProvenance && catalog.resources.some(resource => garmentBranches.includes(resource.productionBranch) &&
      resource.provenance?.dependencies?.editableSourceValidator))
      fail('missing-production-tool',verifier,'Garment original inputs require the editable-source verifier');
  }
  if (catalog.resources.some(resource => resource.productionBranch === 'plant-desktop-installation')) {
    supplemental.add('docs/research/COMPANY-DESKTOP-PLANTS-PRODUCTION.md');
    if (plantTools) {
      const toolchain=await plantTools.plantToolchain(source);
      for(const tool of Object.values(toolchain))productionSourcePins.set(tool.path,tool.sha256);
      supplemental.add(plantTools.plantProducer);
      supplemental.add(plantTools.plantToolLock);
      supplemental.add('scripts/company-platform/test-plant-editable-source.mjs');
    }
    supplemental.add('scripts/company-platform/test-desktop-plant-assets.mjs');
    supplemental.add('scripts/company-platform/test-desktop-plant-rooms.mjs');
    supplemental.add('scripts/company-platform/qa-desktop-plant-rooms.cjs');
  }
  if (catalog.resources.some(resource => resource.productionBranch === 'mouse-and-pad')) {
    supplemental.add('docs/research/COMPANY-MOUSE-PAD-PRODUCTION.md');
    supplemental.add('scripts/company-platform/test-mouse-pad-assets.mjs');
    supplemental.add('scripts/company-platform/test-mouse-pad-installation.mjs');
    supplemental.add('scripts/company-platform/test-mouse-pad-offline.mjs');
    supplemental.add('scripts/company-platform/qa-mouse-pad-rooms.cjs');
  }
  if (catalog.resources.some(resource => resource.finish?.allowedSurfaces?.includes('baseboard'))) {
    supplemental.add('docs/research/COMPANY-BASEBOARD-PRODUCTION.md');
    supplemental.add('scripts/company-platform/test-baseboard-geometry.mjs');
    supplemental.add('scripts/company-platform/test-baseboard-assets.mjs');
    supplemental.add('scripts/company-platform/test-baseboard-data.mjs');
    supplemental.add('scripts/company-platform/qa-baseboard-rooms.cjs');
  }
  if (catalog.resources.some(resource => resource.id === 'vanity-chair-side-entry' && resource.version === 2)) {
    supplemental.add('scripts/company-platform/build-vanity-seat-contact-rooms.mjs');
    supplemental.add('scripts/company-platform/qa-vanity-seat-contact-rooms.cjs');
  }
  if (hasSeatChecker) {
    supplemental.add(seatCheckerPath);
    supplemental.add('scripts/company-platform/qa-seat-contact-rooms.cjs');
    supplemental.add('scripts/company-platform/test-seat-contact-audit.mjs');
    supplemental.add('scripts/company-platform/test-seat-contact-template.mjs');
    supplemental.add('docs/research/COMPANY-SEAT-CONTACT-CHECK.md');
  }
  for(const folder of ['scripts/company-platform/batch-inputs','scripts/company-platform/space-inputs','scripts/company-platform/space-v2-inputs','scripts/company-platform/surface-inputs'])for(const name of await list(source,folder)){
    if(!name.endsWith('.json'))fail('unsupported-production-input',name,'Production input folders must contain JSON only');supplemental.add(name);
  }
  const assetDependencies=[],provenance=[];
  if (supplemental.has('scripts/company-platform/batch-inputs/tea-station-rooms.json')) {
    for (const name of ['check-tea-station.mjs','public-door-access.mjs','qa-tea-station-rooms.cjs','test-tea-station-rooms.mjs','test-tea-station-handoff.mjs'])
      supplemental.add('scripts/company-platform/'+name);
    supplemental.add('docs/research/COMPANY-TEA-STATION-PRODUCTION.md');
  }
  if (supplemental.has('scripts/company-platform/batch-inputs/dance-broadcast-rooms.json')) {
    for (const name of ['check-dance-shot.mjs','public-door-access.mjs','qa-dance-broadcast.cjs','test-dance-shot.mjs','test-dance-broadcast-rooms.mjs','test-live-kit-handoff.mjs'])
      supplemental.add('scripts/company-platform/'+name);
    supplemental.add('docs/research/COMPANY-DANCE-BROADCAST-PRODUCTION.md');
  }
  if (supplemental.has('scripts/company-platform/batch-inputs/singing-rooms.json')) {
    for (const name of ['check-singing-room.mjs','public-door-access.mjs','test-singing-room.mjs','qa-singing-rooms.cjs'])
      supplemental.add('scripts/company-platform/'+name);
    for (const name of ['test-singing-score-ingress.mjs','test-singing-score-visibility.mjs','qa-singing-score-view.cjs']) {
      const script = 'scripts/company-platform/'+name;
      try { await noLinks(path.join(source,script)); supplemental.add(script); }
      catch (error) { if (error.code!=='ENOENT') throw error; }
    }
    supplemental.add('docs/research/COMPANY-SINGING-ROOM-PRODUCTION.md');
  }
  if (supplemental.has('scripts/company-platform/batch-inputs/vocal-use-rooms.json')) {
    for(const name of ['test-vocal-slots.mjs','qa-vocal-slot.cjs','test-vocal-slot-handoff.mjs'])
      supplemental.add('scripts/company-platform/'+name);
  }
  if (supplemental.has('scripts/company-platform/batch-inputs/interview-rooms.json')) {
    for (const name of ['check-interview-room.mjs','public-door-access.mjs','test-interview-public-door.mjs','test-interview-room.mjs','qa-interview-rooms.cjs'])
      supplemental.add('scripts/company-platform/'+name);
    supplemental.add('docs/research/COMPANY-INTERVIEW-ROOM-PRODUCTION.md');
  }
  if (catalog.resources.some(resource => resource.productionBranch === 'enclosed-wardrobe')) {
    for (const file of ['test-enclosed-wardrobe-assets.mjs','test-enclosed-wardrobe-geometry.mjs','test-enclosed-wardrobe-rooms.mjs','qa-enclosed-wardrobe-rooms.cjs'])
      supplemental.add('scripts/company-platform/'+file);
    supplemental.add('docs/research/COMPANY-ENCLOSED-WARDROBE-PRODUCTION.md');
  }
  const geometryChecks = new Map([
    ['enclosed-wardrobe','test-enclosed-wardrobe-assets.mjs'],
    ['showcase-product','test-showcase-product-assets.mjs'],
    ['ambient-led-and-neon','test-wall-ambient-assets.mjs'],
    ['plant-desktop-installation','test-desktop-plant-assets.mjs'],
    ['garment-rack-wardrobe','test-garment-rack-assets.mjs'],
    ['hanging-garment','test-garment-rack-assets.mjs'],
  ]);
  for(const resource of catalog.resources.filter(resource=>resource.asset)){
    const asset=resource.asset;
    if(asset.format!=='glb'||typeof asset.url!=='string'||!asset.url.startsWith('/company-assets/'))fail('unsupported-package-asset',resource.id,'Only local company GLBs can be packaged');
    const name=`prototype/public${asset.url}`;relative(name);const bytes=await read(source,name);
    if(bytes.length!==asset.bytes||hash(bytes)!==asset.sha256)fail('package-asset-hash-mismatch',name,'Actual GLB differs from its resource identity');
    if(!files.has(`viewer${asset.url}`))fail('missing-runtime-asset',name,'Viewer is missing a catalog GLB');
    assetDependencies.push({id:resource.id,version:resource.version,path:name,bytes:bytes.length,sha256:hash(bytes)});
    const entry=resource.provenance;
    const plant = resource.productionBranch === 'plant-desktop-installation';
    const garment = garmentBranches.includes(resource.productionBranch);
    const product = resource.productionBranch === 'showcase-product';
    const verifyEditable = resource.productionBranch==='tea-rest' ? verifyTeaSources : entry.generator===singingProducer ? verifySingingSources : product ? verifyShowcaseProvenance : plant ? plantTools?.verifyPlantEditableProvenance : garment ? verifyGarmentEditableProvenance : undefined;
    if (verifyEditable) {
      const recipe = decode(await read(source,entry.sourceParameters),entry.sourceParameters);
      const pins = await verifyEditable(source,resource,recipe);
      for (const pin of pins.values()) {
        supplemental.add(pin.path);
        productionSourcePins.set(pin.path,pin.sha256);
      }
    }
    if (geometryChecks.has(resource.productionBranch)) {
      for (const [field, dependency] of Object.entries(entry.dependencies)) {
        const target = dependency.path;
        relative(target);
        const geometryTest = 'scripts/company-platform/'+geometryChecks.get(resource.productionBranch);
        if (!(target.startsWith('assets-source/company-') || target === geometryTest ||
          ((garment || product) && field === 'editableSourceValidator' && target === plantValidator) ||
          (plant && plantTools && ({geometryCompiler:plantTools.plantCompiler,editableSourceValidator:plantValidator,producerLock:plantTools.plantToolLock})[field]===target)))
          fail('unsafe-production-source', target, 'Expected an artwork source, license or geometry check');
        const bytes = await read(source,target);
        if (hash(bytes) !== dependency.sha256)
          fail('production-source-hash-mismatch',target,'The referenced production dependency has changed');
        supplemental.add(target);
        if ((garment || product) && field === 'editableSourceValidator') productionSourcePins.set(target,dependency.sha256);
        provenance.push({resourceId:resource.id,version:resource.version,field,path:target,sha256:dependency.sha256});
      }
    }
    for(const [field,pin]of [['sourceParameters','sourceParametersSha256'],['generator','generatorSha256'],['functionalContractSource','functionalContractSourceSha256'],['sourceImage','sourceImageSha256'],['sourceArtifactPath','sourceArtifactSha256']]){
      if((field==='functionalContractSource'||field==='sourceImage'||field==='sourceArtifactPath')&&!entry?.[field]&&!entry?.[pin])continue;
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
  for(const name of [...supplemental].sort())if(!files.has(`source/${name}`)){
    const bytes=await read(source,name);
    if(productionSourcePins.has(name)&&hash(bytes)!==productionSourcePins.get(name))fail('production-source-hash-mismatch',name,'Production input changed while preparing the package');
    add(`source/${name}`,bytes,'editable-production-source');
  }
  const readme=(await read(toolRoot,'package-template/README.template.md')).toString('utf8').replaceAll('{{BUILD_ID}}',buildId).replaceAll('{{SOURCE_DIGEST}}',info.sourceDigest);
  add('README.md',Buffer.from(readme,'utf8'),'handoff-instructions');add('serve.mjs',await read(toolRoot,'package-template/serve.mjs'),'local-http-viewer');
  add('edit.mjs',await read(toolRoot,'package-template/edit.mjs'),'standalone-data-editor');
  add('verify.mjs',await read(toolRoot,'package-template/verify.mjs'),'verify-clean-handoff');
  const manifest={schema:'company-transfer',version:1,buildId,sourceDigest:info.sourceDigest,
    runtimeInputs,sourceVerification:{method:'SHA256 of each manifest path, NUL, original bytes, NUL in sorted input order',inputs:sourceFiles},
    savedCompany:{id:document.id,revision:document.revision,...(trainingClearance ? {trainingClearance}:{}),floors:document.nodes.filter(node=>node.kind==='floor').map(node=>node.id),dependencies:saved.dependencies},
    ...(seatContacts ? {seatContactReports} : {}),
    ...(usePointReports.length ? {usePointReports} : {}),
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
  if(distDirectory==='--help')console.log('node package-company.mjs FIXED_DIST BUILD_ID SAVE_OR_BATCH_RESULT OUT_NEW_DIR [--source FIXED_SOURCE_ROOT] [--seat-contacts] [--room KEY SAVE_OR_BATCH_RESULT]...');
  else {
    const run=async()=>{
      let sourceRoot, seatContacts = false;
      const rooms=[];
      while(options.length){
        const flag=options.shift();
        if(flag==='--source'&&!sourceRoot&&options[0])sourceRoot=options.shift();
        else if(flag==='--seat-contacts'&&!seatContacts)seatContacts=true;
        else if(flag==='--room'&&options.length>=2)rooms.push({key:options.shift(),folder:options.shift()});
        else throw Error(`Invalid package option ${flag}`);
      }
      const manifest=await packageCompany({distDirectory,buildId,inputPath,outputDirectory,sourceRoot,rooms,seatContacts});
      console.log(JSON.stringify({ok:true,buildId:manifest.buildId,companyId:manifest.savedCompany.id,rooms:rooms.map(room=>room.key),files:manifest.files.length,output:path.resolve(outputDirectory)},null,2));
    };
    run().catch(error=>{console.error(JSON.stringify({ok:false,code:error.code||'io-error',path:error.path,message:error.message,details:error.details},null,2));process.exitCode=1;});
  }
}

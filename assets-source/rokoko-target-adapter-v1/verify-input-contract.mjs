// Offline fixed-pilot regression checks. No browser, cloud calls or media upload.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {values:args}=parseArgs({options:Object.fromEntries(['archive','baseline','output-root'].map(k=>[k,{type:'string'}])),strict:true});
assert(args['output-root'],'--output-root must name a fresh directory under analysis/');
const work=path.resolve(args['output-root']);
const analysis=path.join(root,'analysis');
assert(work.startsWith(analysis+path.sep),'Test files must stay under ignored analysis/');
assert(!fs.existsSync(work),'Test output-root already exists; preserve it');
const archive=path.resolve(args.archive??path.join(analysis,'rokoko-pilot-archive-v1'));
const baseline=path.resolve(args.baseline??path.join(root,'experiments/m1-hand-release-integrated-v1/dist'));
const script=path.join(root,'scripts/pose-reference/retarget-rokoko-pilot.mjs');
const bundle=path.join(root,'assets-source/rokoko-target-adapter-v1');
const contract=JSON.parse(fs.readFileSync(path.join(bundle,'input-contract.json')));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile=file=>sha(fs.readFileSync(file));
const inputs=Object.fromEntries(Object.entries(contract.inputs).map(([key,value])=>[key,path.join(archive,value.archiveRelativePath)]));
const historical=['original-adapter.mjs','rebuild-result.json','lineage.json'];
const historicalBefore=Object.fromEntries(historical.map(f=>[f,hashFile(path.join(bundle,f))]));
const protectedFiles=[...Object.values(inputs),...contract.baseline.files.map(f=>path.join(baseline,f.path))];
const protectedBefore=protectedFiles.map(hashFile);
fs.mkdirSync(work);
const cases=[];
function run(name,overrides,expectedError){
 const output=path.join(work,name),options={...inputs,baseline,output,...overrides};
 const result=spawnSync(process.execPath,[script,...Object.entries(options).flatMap(([k,v])=>['--'+k,v])],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 fs.writeFileSync(path.join(work,name+'.stdout.txt'),result.stdout??'');
 fs.writeFileSync(path.join(work,name+'.stderr.txt'),result.stderr??'');
 assert(!result.error,result.error?.message);
 if(expectedError){
  assert.notEqual(result.status,0,name+' must fail');
  assert((result.stderr??'').includes(expectedError),name+' failed for unexpected reason');
  if(name!=='existing-output')assert(!fs.existsSync(output),name+' left output');
 }else assert.equal(result.status,0,result.stderr);
 assert(!fs.readdirSync(work).some(f=>f.startsWith('.rokoko-pilot-staging-')),'Leaked staging directory');
 cases.push({name,exitStatus:result.status,expectedError:expectedError??null,passed:true,finalOutputExists:fs.existsSync(output)});
 return output;
}
const wrongFbx=path.join(work,'wrong.fbx');fs.writeFileSync(wrongFbx,'Controlled wrong FBX; never parsed');
run('wrong-fbx',{'source-fbx':wrongFbx},'identity mismatch source-fbx');
run('swapped-rigs',{'female-rig':inputs['male-rig'],'male-rig':inputs['female-rig']},'identity mismatch female-rig');
run('missing-input',{'source-fbx':path.join(work,'missing.fbx')},'missing/non-regular source-fbx');
const wrongBaseline=path.join(work,'wrong-baseline-fixture');fs.mkdirSync(wrongBaseline);fs.writeFileSync(path.join(wrongBaseline,'build-info.json'),JSON.stringify({shortId:'not-038'}));
run('wrong-baseline',{baseline:wrongBaseline},'identity mismatch baseline build-info.json');
const existing=path.join(work,'existing-output');fs.mkdirSync(existing);const sentinel=path.join(existing,'sentinel.txt');fs.writeFileSync(sentinel,'Preserve existing output exactly');const sentinelHash=hashFile(sentinel);
run('existing-output',{},'Output already exists');assert.equal(hashFile(sentinel),sentinelHash);assert.deepEqual(fs.readdirSync(existing),['sentinel.txt']);
const valid=run('valid-output',{},null);
const products=contract.expectedOutputs.map(expected=>{
 const file=path.join(valid,'assets/motion/m1c',expected.file),original=path.join(archive,'candidate-rokoko-v1/assets/motion/m1c',expected.file),bytes=fs.readFileSync(file);
 assert.equal(sha(bytes),expected.sha256);assert.equal(bytes.length,expected.bytes);assert(bytes.equals(fs.readFileSync(original)),'Recorded product differs: '+expected.file);
 return {file:expected.file,bytes:bytes.length,sha256:sha(bytes),byteIdenticalToArchivedProduct:true};
});
assert.deepEqual(protectedFiles.map(hashFile),protectedBefore,'Source or baseline changed');
assert.deepEqual(Object.fromEntries(historical.map(f=>[f,hashFile(path.join(bundle,f))])),historicalBefore,'Historical evidence changed');
const report={schema:'fixed-rokoko-input-contract-verification.1',adapterSha256:hashFile(script),contractSha256:hashFile(path.join(bundle,'input-contract.json')),verifierSha256:hashFile(fileURLToPath(import.meta.url)),nodeVersion:process.version,archive,baseline,output:valid,cases,products,baselineFilesChecked:contract.baseline.files.length,sourceRigBaselineUnchanged:true,historicalFilesUnchanged:historicalBefore,noStagingDirectoryLeft:true,scope:'Input safety and byte-equivalent offline rebuild only. No repeat visual/contact acceptance or arbitrary FBX support. Private inputs and rebuilt runtime remain in ignored analysis/.'};
fs.writeFileSync(path.join(work,'verification-result.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

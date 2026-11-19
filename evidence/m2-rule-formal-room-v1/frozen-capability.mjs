// Exercise the frozen registries and facility task dispatcher without a browser.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {productionRoot,projectOutput} from '../../scripts/project-output.cjs';
import shapeTools from '../../scripts/runtime-package/shape-overlay.cjs';
import {readGameRuntimeReview} from '../../scripts/runtime-package/game-runtime-review.mjs';

const here=fileURLToPath(new URL('./',import.meta.url));
const root=await productionRoot();
const fixed=path.join(root,'experiments/worktrees/shape-ext-a-6e858e51');
const pair=path.join(root,'output/m2-rule-batch-delivery-v1/pair');
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const receipt=await read(path.join(pair,'receipt.json'));
const records=await read(path.join(pair,'records.json'));
const {reviewed}=await readGameRuntimeReview(receipt.runtime.sourceDigest,true);
const head=execFileSync('git',['-C',fixed,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
assert.equal(head,reviewed.sourceCommit);assert.equal(head,receipt.runtime.sourceCommit);
const sourceFiles={};
for(const file of ['main.js','foundation-avatar.js','foundation-profiles.js','record-consumer-demo.js','facility-behavior.js','behavior-tasks.js']){
  const relative='prototype/src/'+file, bytes=await readFile(path.join(fixed,relative));
  const committed=execFileSync('git',['-C',fixed,'show','HEAD:'+relative],{maxBuffer:5*1024*1024,windowsHide:true});
  assert.equal(bytes.toString().replaceAll('\r\n','\n'),committed.toString().replaceAll('\r\n','\n'));
  sourceFiles[relative]=createHash('sha256').update(bytes).digest('hex');
}
const moduleAt=file=>import(pathToFileURL(path.join(fixed,'prototype/src',file)).href);
const {foundationProfile,initializeRuleBodyData}=await moduleAt('foundation-profiles.js');
const {attachFacilityBehavior}=await moduleAt('facility-behavior.js');
const {validateCharacterRecord}=await moduleAt('character-record.js');
const proof={runtime:receipt.runtime,sourceFiles,checks:[]};
const overlay=await shapeTools.verifiedShapeOverlay(receipt.items.map(row=>path.join(pair,row.shapePackPath)));
for(const record of records){
  await validateCharacterRecord(record,{validationCallback:()=>({status:'pending'})});
  const {bodyType}=record.appearanceRecipe.base;
  let reason;
  assert.throws(()=>foundationProfile(bodyType),error=>{reason=error.message;return reason==='Unknown foundation body type: '+bodyType;});
  const id=record.identity.id, requestId='check-walk-'+id;
  // Dispatch rejects the verb even before accessing an avatar, navigation or room.
  const actor=attachFacilityBehavior({}, {actorId:id,avatar:{root:{}},motion:{},getRoom:()=>null});
  const reply=actor.requestBehavior({requestId,kind:'walk',payload:{}});
  const task=actor.behaviorTasks.get(requestId);
  assert.equal(reply.admission,'rejected');assert.equal(task.ownerId,id);
  assert.equal(task.reason,'unsupported-facility-behavior');
  proof.checks.push({id,recordSha256:record.integrity.recordSha256,bodyType,bodySha256:record.appearanceRecipe.base.sha256,
    emptyRegistryRejection:reason,facilityTask:task});
}
const installed=await initializeRuleBodyData(overlay.descriptors,{readBytes:async url=>overlay.files.get(url.slice(1))});
try{
  for(const one of proof.checks){
    one.registeredBodySha256=foundationProfile(one.bodyType).sha256;
    assert.equal(one.registeredBodySha256,one.bodySha256);
  }
}finally{installed.dispose();}
const dest=await projectOutput(path.join(here,'frozen-capability.json'),root);
const raw=JSON.stringify(proof,null,2)+'\n';
try{await writeFile(dest,raw,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;assert.equal(await readFile(dest,'utf8'),raw);}
console.log(dest);

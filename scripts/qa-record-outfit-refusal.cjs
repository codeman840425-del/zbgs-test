// run-fixed-check.cjs DIST this.cjs BUILD_DIGEST OLD_RECORDS DIAGNOSTIC_RECORD EVIDENCE_PARENT
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const look=r=>Object.fromEntries(['appearanceRecipe','equipmentMaterials','liveAccessories','nativeHairCenter','resourceIdentities']
  .filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));

async function readState(identity) {
  const d=window.__debug,actor=d.avatar(),shoe=actor.profile.motion.getFootwear(),snap=d.snapshot();
  const active=[];
  actor.root.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;
    let owner;
    for(let n=mesh;n;n=n.parent)owner??=n.userData.equipmentId;
    const materials=[mesh.material].flat().filter(m=>m.visible);
    if(!owner || !materials.length)return;
    active.push({owner,name:mesh.name,mesh:mesh.uuid,geometry:mesh.geometry.uuid,
      materials:materials.map(m=>({uuid:m.uuid,map:m.map?.uuid??null,color:m.color?.toArray()??null}))});
  });
  const contact=d.motion().getFootLockCalibration().map(({side,selection})=>({side,patches:selection.patches}));
  const captured=await d.captureCharacterRecord({identity});
  return {actor:actor.root.uuid,body:actor.profile.sha256,outfit:snap.outfit,shoe:{id:shoe.id,sha256:shoe.entry.sha256},
    active,contact,accessoryState:actor.livePresentation.getState().accessories,look:{
      appearanceRecipe:captured.appearanceRecipe,liveAccessories:captured.liveAccessories,equipmentMaterials:captured.equipmentMaterials,
      ...(captured.nativeHairCenter===undefined?{}:{nativeHairCenter:captured.nativeHairCenter}),resourceIdentities:captured.resourceIdentities}};
}

async function run(base,build,reference,unsupported,directory){
  const root=await productionRoot(),parent=await projectOutput(directory,root);
  const {canonicalJson,validateCharacterRecord}=await import('../prototype/src/character-record.js');
  const [oldBytes,badBytes]=await Promise.all([reference,unsupported].map(f=>fs.readFile(f)));
  const bad=JSON.parse(badBytes),inputs=JSON.parse(oldBytes);
  const matches=(Array.isArray(inputs)?inputs:[inputs]).filter(r=>r.identity.id===bad.identity.id &&
    r.appearanceRecipe.base.sha256===bad.appearanceRecipe.base.sha256 && r.appearanceRecipe.equipment.role==='pants-top-far');
  assert.equal(matches.length,1);const [old]=matches;
  assert(bad.revision>old.revision);assert.notEqual(bad.appearanceRecipe.equipment.role,old.appearanceRecipe.equipment.role);
  for(const r of [old,bad])assert((await validateCharacterRecord(r,{validationCallback:()=>({status:'pending'})})).valid);
  const resources=r=>Object.values(r.appearanceRecipe.equipment.resources);
  const diagnosticUrls=resources(bad).filter(b=>!resources(old).some(a=>a.url===b.url)).map(b=>b.url);
  assert(diagnosticUrls.length);assert.match(build,/^[0-9a-f]{64}$/);
  await fs.mkdir(parent,{recursive:true});
  const out=await fs.mkdtemp(await projectOutput(path.join(parent,'run-'),root));
  const report={expectedBuild:build,status:'incomplete',inputs:[old,bad].map((r,i)=>({id:r.identity.id,revision:r.revision,
    sha:r.integrity.recordSha256,recipeSha:r.integrity.recipeSha256,fileSha:sha(i?badBytes:oldBytes),role:r.appearanceRecipe.equipment.role})),
    diagnosticUrls,requests:[],pageErrors:[]};
  let stage='opening',session;
  try{
    session=await launchQABrowser(out,{channel:'chrome'});
    const page=await session.browser.newPage({viewport:{width:1100,height:760}});
    report.browser=session.browser.version();
    page.on('request',r=>report.requests.push({stage,path:new URL(r.url()).pathname}));
    page.on('pageerror',e=>report.pageErrors.push(String(e)));
    const url=new URL(base);url.searchParams.set('workbench','appearance');url.searchParams.set('body',old.appearanceRecipe.base.bodyType);
    await page.goto(url.href);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});
    const actual=await page.evaluate(()=>({digest:__debug.buildInfo.sourceDigest,id:__debug.buildInfo.shortId,development:__debug.buildInfo.development}));
    report.build=actual;assert.equal(actual.digest,build);assert.equal(actual.development,false);
    const restore=value=>page.evaluate(async r=>{try{return await __debug.restoreCharacterRecord(r);}
      catch(e){return {threw:true,name:e.name,message:e.message};}},value);
    stage='load-reference';report.firstRestore=await restore(old);assert(report.firstRestore.applied);
    assert.equal(report.firstRestore.recordSha256,old.integrity.recordSha256);
    const read=async()=>{const s=await page.evaluate(readState,old.identity);
      const digest=sha(canonicalJson(s.look)),expected=sha(canonicalJson(look(old)));
      s.lookDigest=digest;assert.equal(digest,expected,'Captured live record differs from reference');
      assert.equal(s.shoe.id,resources(old).find(r=>r.slot==='shoes').id);
      assert.deepEqual([...new Set(s.active.map(a=>a.owner))].sort(),resources(old).map(e=>e.id).sort());
      const shoeMeshes=s.active.filter(a=>a.owner===s.shoe.id).map(a=>a.mesh);
      assert.deepEqual(s.contact.map(c=>c.side).sort(),['left','right']);
      for(const c of s.contact)for(const surface of ['heel','toe'])
        assert(c.patches[surface].length && c.patches[surface].every(p=>shoeMeshes.includes(p.mesh)),'Contact on hidden or unrelated shoe');
      return s;};
    report.before=await read();
    stage='submit-unsupported';report.refusal=await restore(bad);
    report.rejectionForm=report.refusal.threw?'exception':report.refusal.applied===false?'returned-rejection':'unexpected-result';
    const reason=report.refusal.threw?report.refusal.message:report.refusal.reason;
    assert.notEqual(report.rejectionForm,'unexpected-result','Ordinary runtime accepted the diagnostic outfit');
    assert.equal(typeof reason,'string');assert(reason.length>0);
    report.afterRefusal=await read();
    assert.equal(canonicalJson(report.afterRefusal),canonicalJson(report.before),'Rejection changed the visible actor or its bindings');
    stage='restore-reference-again';report.recovery=await restore(old);assert(report.recovery.applied);
    assert.equal(report.recovery.recordSha256,old.integrity.recordSha256);assert.equal(report.recovery.revision,old.revision);
    report.afterRecovery=await read();
    report.candidateRequests=report.requests.filter(r=>diagnosticUrls.includes(r.path)||r.path.includes('/ankle-boot-fit-v1/'));
    assert.deepEqual(report.candidateRequests,[]);assert.deepEqual(report.pageErrors,[]);
    report.status='passed';
  }catch(e){report.failure=String(e.stack??e);throw e;}
  finally{
    try{await session?.close();report.browserClosed=!session?.browser.isConnected();}
    finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);}
  }
}
run(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});

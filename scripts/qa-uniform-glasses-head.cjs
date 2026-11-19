// Exercise the same appearance and glasses commands as the workbench controls.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {productionRoot,projectOutput} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');
const {loadCases,verifiedGeometry,liveMeshes,checkGeometry} = require('./qa-native-glasses-candidate-chain.cjs');

const evidence = path.resolve(__dirname,'../evidence');
const casesFile = path.join(evidence,'m2-uniform-live-fit-intake-v1/cases.json');
const bobFile = path.join(evidence,'m2-uniform-skin-v1/warm-record.json');
const bobFileSha = '1a5e3f61c17965f15f3cd87decfbbd93455a9fd4566e60fba2410ebd70a4fbc8';
const bobRecordSha = 'f1cb9a9e697cfd5ad8e5b89165798137efb8d058aa7b30d2274828ae9803ff0b';
const bobStyle = 'female-bob-v1';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hair = hairStyle => ({type:'appearance',hairStyle});
const glasses = value => ({type:'accessory',kind:'glasses',value});

async function inspect(page) {
  return page.evaluate(async()=>{
    const debug = __debug, actor = debug.avatar(), state = actor.appearance.getState();
    const actorGlass = [], worldGlass = [], source = [], replacement = [];
    const visible = object => {
      for (let node=object; node; node=node.parent) if (!node.visible) return false;
      return true;
    };
    actor.root.traverse(node=>{if(node.name==='LiveAccessory:glasses')actorGlass.push(node.uuid);});
    debug.scene.traverse(node=>{
      if(node.name==='LiveAccessory:glasses')worldGlass.push({uuid:node.uuid,mount:node.parent.name,visible:visible(node)});
    });
    actor.vrm.scene.traverse(node=>{
      if (!node.isMesh) return;
      const materials = [node.material].flat();
      const mesh = {name:node.name,uuid:node.uuid,visible:visible(node)};
      if(node.name==='m2-female-neck-bob-v1' && node.userData.assetRole==='hair')replacement.push(mesh);
      else if(materials.length && materials.every(material=>/_HAIR/.test(material.name)))source.push(mesh);
    });
    const {requested,status,loaded,identity,pending,error}=actor.livePresentation.getState().accessories.glasses;
    return {actor:actor.root.uuid,bodyType:actor.profile.bodyType,bodySHA256:actor.profile.sha256,
      outfit:actor.getOutfitInfo().index,hair:{selected:state.hairStyle,effective:state.effectiveHairStyle,
        asset:state.replacementSHA256,fit:state.hairFit,source,replacement,loading:state.loading},
      glasses:{requested,status,loaded,identity,pending,error,actorGlass,worldGlass}};
  });
}

function assertLook(state, spec, record, bobRecipe, style, identity) {
  assert.equal(state.bodyType,spec.bodyType);
  assert.equal(state.bodySHA256,spec.bodySHA256);
  assert.equal(state.outfit,record.appearanceRecipe.equipment.index);
  assert.equal(state.hair.selected,style);
  assert.equal(state.hair.effective,style);
  assert.equal(state.hair.loading,false);
  assert(state.hair.source.length>0,'No native source hair meshes on this actor');
  assert.equal(state.hair.source.some(mesh=>mesh.visible),style==='original');
  assert.equal(state.hair.replacement.filter(mesh=>mesh.visible).length,style===bobStyle?1:0);
  assert.equal(state.hair.asset,style===bobStyle?bobRecipe.hairAssetSha256:null);
  assert.deepEqual(state.hair.fit,style===bobStyle?bobRecipe.hairFit:null);
  const slot=state.glasses;
  assert.equal(slot.loaded,Boolean(identity));
  assert.equal(slot.requested,Boolean(identity));
  assert.equal(slot.pending,null);
  assert.deepEqual(slot.identity,identity);
  assert.equal(slot.worldGlass.length,identity?1:0);
  assert.deepEqual(slot.actorGlass,slot.worldGlass.map(mesh=>mesh.uuid));
  if(identity){
    assert.equal(slot.worldGlass[0].visible,true);
    assert.match(slot.worldGlass[0].mount,/^LivePresentation:/);
  }
}

async function screen(page, out, label) {
  const png = await page.evaluate(async()=>{
    __debug.view('inspect-face-side');
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return __debug.renderer.domElement.toDataURL('image/png').split(',')[1];
  });
  const bytes = Buffer.from(png,'base64'), file = label+'.png';
  assert(bytes.length>1000,'No usable game canvas image');
  await fs.writeFile(path.join(out,file),bytes,{flag:'wx'});
  return {file,sha256:sha(bytes)};
}

async function oneCase({page,base,out,mode,build,spec,bob,row}) {
  const url = new URL(base);
  url.searchParams.set('workbench','appearance');
  url.searchParams.set('glassesFit','candidate');
  url.searchParams.set('body',spec.bodyType);
  await page.goto(url.href);
  await page.waitForFunction(()=>window.__debug?.ready && __debug.buildInfo?.sourceDigest,null,{timeout:60000});
  row.build = await page.evaluate(()=>__debug.buildInfo);
  assert.equal(row.build.shortId,build.buildId,'Wrong fixed build ID');
  assert.equal(row.build.sourceDigest,build.sourceDigest,'Wrong fixed source digest');
  assert.equal(row.build.development,false);
  const {asset,fit}=await page.evaluate(async bodyType=>{
    const [registry,accessories]=await Promise.all(['/assets/native-glasses-candidate-v2/manifest.json','/assets/m1c/accessories.json']
      .map(async url=>{
        const response=await fetch(url,{cache:'no-store'});
        if(!response.ok)throw Error('Cannot read fixed asset registry '+url);
        return response.json();
      }));
    if(registry.status!=='candidate-only')throw Error('Expected the diagnostic candidate registry');
    return {fit:registry.profiles.find(entry=>entry.bodyType===bodyType),asset:accessories.items.find(entry=>entry.id==='studio-glasses-v1')};
  },spec.bodyType);
  assert(fit&&asset,'Current body and accessory must be present in the candidate registry');
  assert.equal(fit.sha256,spec.fitSHA256);
  row.sourcePins={fit,asset};
  const geometry = await verifiedGeometry(base,spec,asset,fit);
  const verifyGlasses = async identity=>{
    assert.equal(identity.bodySHA256,spec.bodySHA256);
    assert.equal(identity.accessorySHA256,asset.sha256);
    assert.equal(identity.fit.sha256,fit.sha256);
    assert.equal(identity.fit.id,geometry.profileId);
    assert.equal(identity.fit.status,'fitted-candidate');
    assert.equal(identity.fit.verified,false);
    return checkGeometry(geometry,await page.evaluate(liveMeshes)).maximumPositionErrorM;
  };
  const restore = async(record,label)=>{
    assert.deepEqual(record.liveAccessories.selections.glasses,{enabled:false,identity:null});
    const result = await page.evaluate(input=>__debug.restoreCharacterRecord(input),record);
    const state = await inspect(page);
    row.steps.push({label,result,state});
    assert.equal(result.applied,true,JSON.stringify(result));
    assert.deepEqual(result.identity,record.identity);
    assert.equal(result.revision,record.revision);
    assert.equal(result.recordSha256,record.integrity.recordSha256);
    assertLook(state,spec,record,bob.appearanceRecipe,record.appearanceRecipe.appearance.hairStyle,null);
    return state;
  };
  const command = async(record,previous,label,operation,{style,expected,wearing,capture=false})=>{
    const result = await page.evaluate(async operation=>{
      try {return await __debug.command(operation);}
      catch(error){return {applied:false,threw:true,reason:String(error.message||error)};}
    },operation);
    const state = await inspect(page), step = {label,operation,result,state};
    row.steps.push(step);
    if(capture)step.image=await screen(page,out,label);
    assert.equal(result.applied,expected,JSON.stringify(result));
    if(!expected) {
      assert(!result.cancelled && /hair|[发髪]型|头发/i.test(result.reason??''),'Expected actionable hair compatibility rejection');
      assert.deepEqual(state.hair,previous.hair,'Rejected operation changed the visible hair or its identity');
      assert.deepEqual(state.glasses.worldGlass,previous.glasses.worldGlass,'Rejected operation changed the mounted glasses');
    }
    assert.equal(state.actor,previous.actor,'Look command replaced the character instance');
    const identity=wearing?(previous.glasses.identity??result.identity):null;
    assertLook(state,spec,record,bob.appearanceRecipe,style,identity);
    if(wearing){
      if(previous.glasses.loaded)assert.deepEqual(state.glasses.worldGlass,previous.glasses.worldGlass);
      step.geometryErrorsM=await verifyGlasses(identity);
    }
    return state;
  };
  const isFemale=spec.bodyType===bob.appearanceRecipe.base.bodyType;
  const prefix=isFemale?'female':'male';
  const original=await restore(spec.record,prefix+'-restore-original');
  const originalWithGlasses=await command(spec.record,original,prefix+'-original-glasses',glasses(true),
    {style:'original',expected:true,wearing:true,capture:true});
  if(!isFemale)return;
  const before=mode==='before';
  const firstOrder=await command(spec.record,originalWithGlasses,'female-glasses-then-bob',hair(bobStyle),
    {style:before?bobStyle:'original',expected:before,wearing:true,capture:true});
  if(!before){
    const removed=await command(spec.record,firstOrder,'female-remove-glasses',glasses(false),
      {style:'original',expected:true,wearing:false});
    await command(spec.record,removed,'female-bob-after-removal',hair(bobStyle),
      {style:bobStyle,expected:true,wearing:false,capture:true});
  }
  const signedBob=await restore(bob,'female-restore-signed-bob');
  const secondOrder=await command(bob,signedBob,'female-bob-then-glasses',glasses(true),
    {style:bobStyle,expected:before,wearing:before,capture:true});
  if(!before){
    const originalFromBob=await command(bob,secondOrder,'female-switch-back-to-original',hair('original'),
      {style:'original',expected:true,wearing:false});
    await command(bob,originalFromBob,'female-glasses-after-original',glasses(true),
      {style:'original',expected:true,wearing:true,capture:true});
  }
}

async function run(base,mode,sourceDigest,output) {
  assert(base && output && ['before','after'].includes(mode) && /^[a-f0-9]{64}$/.test(sourceDigest??''),
    'Expected BASE (before|after) SOURCE_DIGEST OUTPUT');
  const out=await projectOutput(output,await productionRoot());
  const inputs=await loadCases(casesFile);
  assert.equal(sourceDigest===inputs.fixed.sourceDigest,mode==='before','Use the old fixed digest for before and a new digest for after');
  const bobBytes=await fs.readFile(bobFile);
  assert.equal(sha(bobBytes),bobFileSha);
  const bob=JSON.parse(bobBytes);
  assert.equal(bob.integrity.recordSha256,bobRecordSha);
  assert.equal(bob.appearanceRecipe.appearance.hairStyle,bobStyle);
  assert(inputs.cases.some(spec=>spec.bodySHA256===bob.appearanceRecipe.base.sha256));
  const build={buildId:sourceDigest.slice(0,12),sourceDigest};
  const report={schema:'uniform-glasses-head-v1',mode,build,scriptSha256:sha(await fs.readFile(__filename)),
    originalCases:inputs.caseFile,originalRecords:inputs.signedRecords,
    bobRecord:{path:bobFile,sha256:bobFileSha,recordSha256:bobRecordSha},
    diagnosticMode:'glassesFit=candidate',status:'incomplete',cases:[]};
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.mkdir(out,{recursive:false});
  let session;
  try {
    session=await launchQABrowser(out,{channel:'chrome'});
    report.browser=session.browser.version();
    for(const spec of inputs.cases){
      const row={bodyType:spec.bodyType,steps:[],pageErrors:[]};
      report.cases.push(row);
      const page=await session.browser.newPage({viewport:{width:1600,height:1000}});
      page.on('pageerror',error=>row.pageErrors.push(String(error)));
      try {await oneCase({page,base,out,mode,build,spec,bob,row});}
      catch(error){row.failure=String(error.stack||error);}
      finally{await page.close();}
    }
    if(report.cases.every(row=>!row.failure&&!row.pageErrors.length))report.status=mode==='before'?'reproduced':'passed';
  } finally {
    try{await session?.close();}
    finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
  }
  if(report.status==='incomplete')process.exitCode=1;
  console.log(JSON.stringify({status:report.status,cases:report.cases.map(({bodyType,failure,steps})=>({bodyType,failure,steps:steps.map(step=>step.label)}))}));
}

run(...process.argv.slice(2)).catch(error=>{console.error(error.stack||error);process.exitCode=1;});

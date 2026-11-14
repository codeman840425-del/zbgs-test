// Independent loader contract regression. Test-side bundle only; never edits the served build.
const {chromium}=require('../../prototype/node_modules/playwright');
const esbuild=require('../../prototype/node_modules/esbuild');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const url=process.argv[2]||'http://127.0.0.1:4191';
(async()=>{
 const sourcePath=path.join(root,'prototype/src/equipment.js');
 const source=await fs.readFile(sourcePath);
 const bundle=await esbuild.build({entryPoints:[sourcePath],bundle:true,write:false,format:'iife',globalName:'EquipmentRegressionFactory',platform:'browser',logLevel:'silent'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const page=await browser.newPage();
 await page.goto(url);await page.waitForFunction(()=>window.__debug?.ready);
 await page.evaluate(()=>{__debug.setPaused(true);__debug.setBodyMode('dressed');__debug.setOutfit(2);});
 if(process.env.QA_BUILD){const actual=await page.evaluate(()=>__debug.buildInfo.shortId);if(actual!==process.env.QA_BUILD)throw Error('Build mismatch '+actual);}
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  const {createEquipment}=window.EquipmentRegressionFactory;
  const vrm=__debug.avatar().vrm, identity='12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2',id='athletic-bermuda-v1';
  const options={vrm,avatarSha256:identity};const result={};
  const originalVisibility=[];vrm.scene.traverse(m=>{if(m.isSkinnedMesh&&!m.parent?.name?.startsWith('Equipment'))originalVisibility.push([m.uuid,m.visible]);});
  const bad=await createEquipment({...options,avatarSha256:'new-complete-body-sha'});try{await bad.load(id);result.identityRejected=false}catch(e){result.identityRejected=/not approved/.test(e.message);result.identityMessage=e.message}bad.dispose();
  const manifest=await (await fetch('/assets/garments/equipment.json')).json();manifest.items[0].bindings[0].inverseBindMatrix[12]+=.01;manifest.items[0].url=location.origin+'/assets/garments/athletic-bermuda-v1.glb';
  const badBind=await createEquipment({...options,manifestUrl:'data:application/json,'+encodeURIComponent(JSON.stringify(manifest))});try{await badBind.load(id);result.bindRejected=false}catch(e){result.bindRejected=/Rest bind differs/.test(e.message);result.bindMessage=e.message}badBind.dispose();
  async function pendingTest(dispose){
   const adapter=await createEquipment(options);const original=window.fetch;let release,startedResolve;const started=new Promise(r=>startedResolve=r);const gate=new Promise(r=>release=r);
   window.fetch=async(...args)=>{if(String(args[0]).endsWith('athletic-bermuda-v1.glb')){startedResolve();await gate;}return original(...args)};
   try{
    const pending=adapter.equip(id).then(v=>({applied:v.applied,visible:v.container.visible}),e=>({error:e.message}));await started;
    if(dispose)adapter.dispose();else adapter.unequip('bottoms-overlay');release();const state=await pending;
    const loaded=adapter.get(id);const group=loaded?.container;
    adapter.dispose();return{...state,groupRemoved:!group||!group.parent,getAfterDispose:adapter.get(id),groups:vrm.scene.children.filter(o=>o.name==='Equipment:'+id).length};
   }finally{window.fetch=original;adapter.dispose();}
  }
  result.cancelled=await pendingTest(false);result.disposedPending=await pendingTest(true);
  const active=__debug.avatar().equipment.get(id),before=active.meshes.map(m=>m.geometry),skeletons=active.meshes.map(m=>m.skeleton);
  for(let i=0;i<20;i++){__debug.avatar().equipment.unequip();await __debug.avatar().equipment.equip(id)}
  result.reuse={geometry:active.meshes.every((m,i)=>m.geometry===before[i]),skeleton:active.meshes.every((m,i)=>m.skeleton===skeletons[i]),groups:vrm.scene.children.filter(o=>o.name==='Equipment:'+id).length};
  result.originalVisibilityUnchanged=originalVisibility.every(([id,v])=>vrm.scene.getObjectByProperty('uuid',id)?.visible===v);
  result.stats=active.stats;result.build=__debug.buildInfo;
  if(!result.identityRejected||!result.bindRejected||result.cancelled.applied!==false||result.cancelled.visible||!result.disposedPending.error||!result.originalVisibilityUnchanged||!result.cancelled.groupRemoved||!result.disposedPending.groupRemoved||result.cancelled.getAfterDispose!==null||result.disposedPending.getAfterDispose!==null||result.cancelled.groups!==1||result.disposedPending.groups!==1||!result.reuse.geometry||!result.reuse.skeleton||result.reuse.groups!==1)throw Error('Equipment lifecycle regression');
  return result;
 });
 result.testSourceSha256=crypto.createHash('sha256').update(source).digest('hex');
 result.url=url;
 const dest=path.join(root,'output/playwright/garment-contract',result.build.shortId);
 await fs.mkdir(dest,{recursive:true});await fs.writeFile(path.join(dest,'observations.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

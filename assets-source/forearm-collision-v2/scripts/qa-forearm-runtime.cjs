const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(root,'prototype/node_modules/playwright'));
const {verifyCandidate,expectations}=require(path.join(root,'scripts/qa-m1-common.cjs'));

(async()=>{
 const expected=expectations(),out=path.join(root,'output/playwright/forearm-'+expected.build);
 const url=process.argv[2],fixture=JSON.parse(await fs.readFile(path.join(__dirname,'../runtime-fixture.json')));
 const compareTargets=process.env.QA_FOREARM_TARGET_COMPARE==='1',modes=compareTargets?['lap','authored']:['legacy','calibrated'];
 for(const name of modes.map(m=>m+'.json')){try{await fs.access(path.join(out,name));throw Error('Refuse existing evidence '+name);}catch(e){if(e.code!=='ENOENT')throw e;}}
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const mode of modes){
  const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url+(compareTargets?'?forearm=calibrated&handTarget='+mode:'?forearm='+mode));await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});const identity=await verifyCandidate(page,expected);
  await page.evaluate(f=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();d.reset();d.setPaused(true);d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(false);d.setCorrections('full');
   const chair=d.snapshot().chair;a.root.position.set(...chair.approach);c.yaw=chair.yaw;a.root.rotation.y=c.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);c.cameraPreset('close',true);
   for(let i=0;i<60;i++)c.simulate(1/60);
   let source,body;d.scene.getObjectByName('Equipment:m1-uniform-skirt').traverse(m=>{if(m.isSkinnedMesh)source=m;});a.root.traverse(m=>{if(m.isSkinnedMesh&&m.geometry.attributes.position.count===f.bodyVertexCount&&m.name==='Bodybaked')body=m;});if(!source||!body)throw Error('Exact source surfaces unavailable');
   const V=a.root.position.constructor,hip=a.vrm.humanoid.getRawBoneNode('hips');window.__forearmQA={fixture:f,source,body,hip,V,frames:[],c,a,d,index:0};
  },fixture);
  for(const end of [60,76,77,78,120,180,210,270]){
   await page.evaluate(end=>{const q=__forearmQA,{c,a,d,V,fixture:f}=q;
    for(;q.index<end;q.index++){
     if(q.index===60)c.action('sit');if(q.index===180)c.action('stand');
     const started=performance.now();c.simulate(1/30);const simulateMs=performance.now()-started;a.root.updateMatrixWorld(true);
     const s=d.snapshot(),body=f.bodySourceIds.map(id=>q.body.getVertexPosition(id,new V()).applyMatrix4(q.body.matrixWorld).toArray()),pins={};
     for(const [key,recipe]of Object.entries(f.fixedWaistRecipes)){const p=new V();for(const term of recipe){const local=new V();for(const id of term.sourceIds)local.add(q.source.getVertexPosition(id,new V()).applyMatrix4(q.source.matrixWorld));local.divideScalar(term.sourceIds.length);const delta=new V(...term.localDelta).applyMatrix4(q.hip.matrixWorld).sub(new V().setFromMatrixPosition(q.hip.matrixWorld));p.addScaledVector(local.add(delta),term.weight);}pins[key]=p.toArray();}
     q.frames.push({frame:q.index+1,time:q.index/30,simulateMs,mode:s.mode,sitProgress:s.motion.sitProgress,root:a.root.position.toArray(),handContacts:s.motion.handContacts,body,pins});
    }
   },end);
   await page.screenshot({path:path.join(out,mode+'-'+end+'.png')});
  }
  const frames=await page.evaluate(()=>__forearmQA.frames),finalIdentity=await verifyCandidate(page,expected);
  await fs.writeFile(path.join(out,mode+'.json'),JSON.stringify({identity,finalIdentity,mode,comparison:compareTargets?'80calibrated-rails lap versus authored wrist targets':'legacy rails versus calibrated contours',errors,fixture,frames}));
  console.log(mode,frames.length,'pageerrors',errors.length,'maxsimulate',Math.max(...frames.map(f=>f.simulateMs)));await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

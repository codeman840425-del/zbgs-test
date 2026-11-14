// One pose only. Offline authoring diagnosis, not realtime visual acceptance.
// Execute via run-fixed-check ONLY in the assigned exclusive browser window.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('../../prototype/node_modules/playwright');
const {expectations,verifyCandidate}=require('../qa-m1-common.cjs');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const expected=expectations(),url=process.argv[2],label=process.argv[3]||'standing-01';
 if(!/^https?:/.test(url||''))throw Error('Use fixed-candidate wrapper URL');
 if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(label))throw Error('Use a simple lowercase isolated label');
 const parent=path.join(root,'experiments/skirt-offline-corrective','displayed-initial-'+expected.build);
 await fs.mkdir(parent,{recursive:true});
 const out=path.join(parent,label);
 await fs.mkdir(out); // Deliberately refuses an existing capture, including failed runs.
 const errors=[],browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const identity=await verifyCandidate(page,expected);
  const result=await page.evaluate(()=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();
   d.reset();d.setPaused(true);d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(false);d.setCorrections('full');
   c.cameraPreset('room',true);
   const chair=d.snapshot().chair;a.root.position.set(...chair.approach);c.yaw=chair.yaw;a.root.rotation.y=c.yaw;
   d.motion().reset();for(let i=0;i<60;i++)c.simulate(1/60);
   a.root.updateMatrixWorld(true);
   const profile=a.getAssetProfile(),ids=profile.meshRoles.skirt;
   const displayed=ids.map(id=>d.scene.getObjectByProperty('uuid',id));
   if(displayed.length!==1||!displayed[0]?.isMesh)throw Error('Expected one semantic displayed skirt');
   let source;d.scene.getObjectByName('Equipment:m1-uniform-skirt')?.traverse(m=>{if(m.isSkinnedMesh)source=m;});
   if(!source)throw Error('Original source skirt missing');
   const visible=m=>{for(let n=m;n;n=n.parent)if(!n.visible)return false;return true;};
   if(!visible(displayed[0]))throw Error('Displayed skirt is hidden');
   const V=a.root.position.constructor,v=new V();
   const capture=m=>{
    const g=m.geometry,positions=[];
    for(let i=0;i<g.attributes.position.count;i++){
     if(m.isSkinnedMesh)m.getVertexPosition(i,v);else v.fromBufferAttribute(g.attributes.position,i);
     v.applyMatrix4(m.matrixWorld);positions.push(v.toArray());
    }
    return {name:m.name,uuid:m.uuid,visible:visible(m),isSkinnedMesh:Boolean(m.isSkinnedMesh),positions,
     triangles:Array.from(g.index?.array||Array.from({length:g.attributes.position.count},(_,i)=>i)),
     uv:Array.from(g.attributes.uv?.array||[]),materials:(Array.isArray(m.material)?m.material:[m.material]).map(m=>m.name)};
   };
   const raw=capture(source),shown=capture(displayed[0]);
   if(JSON.stringify(raw.triangles)!==JSON.stringify(shown.triangles)||JSON.stringify(raw.uv)!==JSON.stringify(shown.uv))throw Error('Original topology/UV not retained');
   const colliders=[];a.root.traverse(m=>{if(m.isMesh&&visible(m)&&m!==displayed[0])colliders.push(capture(m));});
   return {schema:'m1.skirt-displayed-initial.1',purpose:'Single static authored pose, no realtime/cloth acceptance',snapshot:d.snapshot(),raw,displayed:shown,colliders,
    hipWorld:a.vrm.humanoid.getRawBoneNode('hips').matrixWorld.toArray(),rootWorld:a.root.matrixWorld.toArray(),meshRoles:profile.meshRoles,
    topologyAndUVExactMatch:true,bodyAndInnerVisibilityChanged:false};
  });
  result.label=label;result.identity=identity;result.finalIdentity=await verifyCandidate(page,expected);result.errors=errors;
  if(errors.length)throw Error(errors.join('\n'));
  await page.screenshot({path:path.join(out,'displayed-standing.png')});
  const bytes=Buffer.from(JSON.stringify(result));await fs.writeFile(path.join(out,'initial.json'),bytes);
  await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),status:'captured-not-diagnosed'},null,2));
  console.log(out);
 }catch(e){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(e),stack:e.stack,errors},null,2));throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

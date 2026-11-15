// Actual same-room authoring input. Offline 30Hz sampling, not a movie/perf pass.
// Derives the schedule from capture-skirt-corrective.cjs; no product changes.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('../../prototype/node_modules/playwright');
const {expectations,verifyCandidate}=require('../qa-m1-common.cjs');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const expected=expectations(),url=process.argv[2];if(!/^https?:/.test(url||''))throw Error('Use run-fixed-check');
 const out=path.join(root,'experiments/skirt-offline-corrective/front-input-'+expected.build);
 await fs.mkdir(out,{recursive:true});
 try{await fs.access(path.join(out,'capture.json'));throw Error('Refuse existing input');}catch(e){if(e.code!=='ENOENT')throw e;}
 const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1080}});page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url+'?forearm=calibrated&handTarget=authored');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const identity=await verifyCandidate(page,expected);
  const data=await page.evaluate(()=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();d.reset();d.setPaused(true);d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(false);d.setCorrections('full');
   const chair=d.snapshot().chair;a.root.position.set(...chair.approach);c.yaw=chair.yaw;a.root.rotation.y=c.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);
   for(let i=0;i<60;i++)c.simulate(1/60);
   let source;d.scene.getObjectByName('Equipment:m1-uniform-skirt').traverse(m=>{if(m.isSkinnedMesh)source=m;});
   const displayed=d.scene.getObjectByName('M1_UniformSkirt_Constrained');if(!source||!displayed)throw Error('Real source/displayed skirt missing');
   const V=a.root.position.constructor,point=new V(),hip=a.vrm.humanoid.getRawBoneNode('hips');
   const visible=m=>{for(let n=m;n;n=n.parent)if(!n.visible)return false;return true;};
   const meshes=[];a.root.traverse(m=>{if(m.isSkinnedMesh&&visible(m))meshes.push(m);});
   const topo=m=>({name:m.name,role:m.userData.assetRole??null,vertexCount:m.geometry.attributes.position.count,
    triangles:Array.from(m.geometry.index?.array||Array.from({length:m.geometry.attributes.position.count},(_,i)=>i)),
    uv:m.geometry.attributes.uv?Array.from(m.geometry.attributes.uv.array):null,
    groups:m.geometry.groups,materials:(Array.isArray(m.material)?m.material:[m.material]).map(x=>({name:x.name,alphaTest:x.alphaTest,opacity:x.opacity,transparent:x.transparent}))});
   const topology={source:topo(source),displayed:topo(displayed),colliders:meshes.map(topo),
    chair:d.chairColliders().map(b=>({name:b.name,min:b.localBox.min.toArray(),max:b.localBox.max.toArray(),matrixWorld:b.matrixWorld.toArray()})),
    thighRadii:a.getOutfitInfo().equipment.skirtDynamics.thighRadii};
   const count=270,fps=30,frameMetadata=[];
   const colliderStride=meshes.reduce((n,m)=>n+m.geometry.attributes.position.count*3,0);
   const positions=new Float32Array(count*colliderStride),sourcePositions=new Float32Array(count*topology.source.vertexCount*3),displayedPositions=new Float32Array(count*topology.displayed.vertexCount*3);
   const put=(m,buffer,offset)=>{for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,point).applyMatrix4(m.matrixWorld);buffer[offset++]=point.x;buffer[offset++]=point.y;buffer[offset++]=point.z;}return offset;};
   for(let frame=0;frame<count;frame++){
    if(frame===60)c.action('sit');if(frame===180)c.action('stand');
    c.simulate(1/fps);a.root.updateMatrixWorld(true);
    let offset=frame*colliderStride;for(const m of meshes)offset=put(m,positions,offset);
    put(source,sourcePositions,frame*topology.source.vertexCount*3);put(displayed,displayedPositions,frame*topology.displayed.vertexCount*3);
    const s=d.snapshot();frameMetadata.push({frame:frame+1,time:frame/fps,mode:s.mode,sitProgress:s.motion.sitProgress,
     hipWorld:hip.matrixWorld.toArray(),rootWorld:a.root.matrixWorld.toArray(),bodyVisible:meshes.every(visible),outfit:s.outfit,
     legs:['left','right'].map(side=>({side,a:a.vrm.humanoid.getRawBoneNode(side+'UpperLeg').getWorldPosition(new V()).toArray(),b:a.vrm.humanoid.getRawBoneNode(side+'LowerLeg').getWorldPosition(new V()).toArray()}))});
   }
   const encode=array=>{const bytes=new Uint8Array(array.buffer);let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
   return {schema:'m1.skirt-front-target-input.1',purpose:'Same actual room/body/controller sampled offline, not visual/performance acceptance',fps,frames:frameMetadata,topology,
    colliderPositionBase64:encode(positions),sourcePositionBase64:encode(sourcePositions),displayedPositionBase64:encode(displayedPositions),
    coordinate:'Three world metres +Y up; hips matrices column-major',limitations:['Topology/material metadata retained; alpha texels are not exported. Raw all-face collision counts are conservative until alpha filtering.']};
  });
  if(errors.length)throw Error(errors.join('\n'));
  for(const [key,file]of [['colliderPositionBase64','colliders.f32'],['sourcePositionBase64','source.f32'],['displayedPositionBase64','displayed.f32']]){
   const bytes=Buffer.from(data[key],'base64');await fs.writeFile(path.join(out,file),bytes);data[file]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};delete data[key];
  }
  const r=await page.request.get(new URL('/assets/m1/m1-uniform-skirt.glb',url).href);if(!r.ok())throw Error('Skirt identity fetch failed');
  data.sourceSkirtSha256=crypto.createHash('sha256').update(await r.body()).digest('hex');
  data.identity=identity;data.finalIdentity=await verifyCandidate(page,expected);data.errors=errors;
  await fs.writeFile(path.join(out,'capture.json'),JSON.stringify(data,null,2));await page.screenshot({path:path.join(out,'end.png')});console.log(out);
 }catch(e){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(e),stack:e.stack,errors},null,2));throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

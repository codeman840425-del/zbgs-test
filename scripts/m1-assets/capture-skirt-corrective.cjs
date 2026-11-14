// Offline-authoring input, NOT normal-time visual/performance evidence.
// Run only in the parent-assigned exclusive browser window via run-fixed-check.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('../../prototype/node_modules/playwright');
const {expectations,verifyCandidate}=require('../qa-m1-common.cjs');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const expected=expectations(),url=process.argv[2];if(!/^https?:/.test(url||''))throw Error('Use run-fixed-check with immutable candidate');
 const label=process.argv[3]||'';if(label&&!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(label))throw Error('Use a simple isolated capture label');
 const out=path.resolve(root,'experiments/skirt-offline-corrective/capture-'+expected.build+(label?'-'+label:''));
 await fs.mkdir(out,{recursive:true});try{await fs.access(path.join(out,'capture.json'));throw Error('Refuse existing capture');}catch(e){if(e.code!=='ENOENT')throw e;}
 const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const identity=await verifyCandidate(page,expected);
  const data=await page.evaluate(()=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();d.reset();d.setPaused(true);d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(false);d.setCorrections('full');
   const chair=d.snapshot().chair;a.root.position.set(...chair.approach);c.yaw=chair.yaw;a.root.rotation.y=c.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);
   for(let i=0;i<60;i++)c.simulate(1/60);
   let source;d.scene.getObjectByName('Equipment:m1-uniform-skirt').traverse(m=>{if(m.isSkinnedMesh)source=m;});if(!source)throw Error('Actual original source skirt missing');
   const V=a.root.position.constructor,M=a.root.matrixWorld.constructor,point=new V(),hip=a.vrm.humanoid.getRawBoneNode('hips');
   const visible=m=>{for(let n=m;n;n=n.parent)if(!n.visible)return false;return true;};
   const meshes=[];a.root.traverse(m=>{if(m.isSkinnedMesh&&visible(m))meshes.push(m);});
   // Retain every visible original inner/body surface; exclude only the source skirt
   // (already replaced/hidden by production). No geometry or visibility is changed.
   const colliderTopology=meshes.map(m=>({name:m.name,uuid:m.uuid,vertexCount:m.geometry.attributes.position.count,triangles:Array.from(m.geometry.index?.array||Array.from({length:m.geometry.attributes.position.count},(_,i)=>i))}));
   const topology={source:{name:source.name,vertexCount:source.geometry.attributes.position.count,triangles:Array.from(source.geometry.index.array)},colliders:colliderTopology,chair:d.chairColliders().map(b=>({min:b.localBox.min.toArray(),max:b.localBox.max.toArray(),matrixWorld:b.matrixWorld.toArray()}))};
   const frameMetadata=[],positions=[],sourcePositions=[];
   const put=(m,buffer)=>{for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,point).applyMatrix4(m.matrixWorld);buffer.push(point.x,point.y,point.z);}};
   const fps=30,count=270;
   for(let frame=0;frame<count;frame++){
    if(frame===60)c.action('sit');if(frame===180)c.action('stand');
    c.simulate(1/fps);a.root.updateMatrixWorld(true);
    for(const m of meshes)put(m,positions);put(source,sourcePositions);
    const s=d.snapshot();frameMetadata.push({frame:frame+1,time:frame/fps,sitProgress:s.motion.sitProgress,mode:s.mode,hipWorld:hip.matrixWorld.toArray(),rootWorld:a.root.matrixWorld.toArray(),bodyVisible:meshes.every(visible),outfit:s.outfit});
   }
   const encode=array=>{const bytes=new Uint8Array(new Float32Array(array).buffer);let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
   return {schema:'m1.skirt-offline-pose-capture.1',purpose:'Authored offline pose data: fixed 30Hz simulation sampling, NOT real-time video or performance',fps,frames:frameMetadata,topology,colliderPositionBase64:encode(positions),sourcePositionBase64:encode(sourcePositions),coordinate:'Three world metres +Y up; Blender conversion [x,-z,y]',sourceSkirtRuntimeVisibility:source.visible};
  });
  if(errors.length)throw Error(errors.join('\n'));
  for(const [key,file]of [['colliderPositionBase64','colliders.f32'],['sourcePositionBase64','source.f32']]){const bytes=Buffer.from(data[key],'base64');await fs.writeFile(path.join(out,file),bytes);data[file]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};delete data[key];}
  data.identity=identity;data.finalIdentity=await verifyCandidate(page,expected);data.errors=errors;
  await fs.writeFile(path.join(out,'capture.json'),JSON.stringify(data,null,2));console.log(out);
 }catch(e){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(e),stack:e.stack,errors},null,2));throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

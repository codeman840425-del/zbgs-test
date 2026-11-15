// Authoring inputs only: fixed real controller, complete visible surfaces and raw skeleton.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../../..'),toolRoot=process.env.QA_RUNTIME_ROOT||root;
const {chromium}=require(path.join(toolRoot,'prototype/node_modules/playwright'));
const {expectations,verifyCandidate}=require(path.join(toolRoot,'scripts/qa-m1-common.cjs'));
(async()=>{
 const out=path.join(root,'assets-source/m1/simple-skirt-v1/input-269');
 await fs.mkdir(out,{recursive:true});
 try{await fs.access(path.join(out,'four-poses.json.gz'));throw Error('Refuse replacing captured evidence');}catch(e){if(e.code!=='ENOENT')throw e;}
 const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1080}});page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(process.argv[2]+'?handTarget=authored');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const identity=await verifyCandidate(page,expectations());
  const data=await page.evaluate(()=>{
   const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio');d.reset();d.setPaused(true);d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(true);d.setCorrections('full');
   const chair=d.snapshot().chair;a.root.position.set(...chair.approach);c.yaw=chair.yaw;a.root.rotation.y=c.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);a.resetSecondary?.();
   const advance=seconds=>{for(let i=0;i<Math.round(seconds*120);i++)c.simulate(1/120);};advance(2);
   const V=a.root.position.constructor,v=new V();
   const visible=m=>{for(let n=m;n;n=n.parent)if(!n.visible)return false;return true;};
   const meshes=[];a.root.traverse(m=>{if(m.isSkinnedMesh&&visible(m))meshes.push(m);});
   const source=d.scene.getObjectByName('Equipment:m1-uniform-skirt').children.find(m=>m.isSkinnedMesh);
   const surface=m=>{const positions=[];for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,v).applyMatrix4(m.matrixWorld);positions.push(...v.toArray());}return {name:m.name,positions,triangles:Array.from(m.geometry.index.array),uv:m.geometry.attributes.uv?Array.from(m.geometry.attributes.uv.array):null,materials:(Array.isArray(m.material)?m.material:[m.material]).map(x=>({name:x.name,alphaTest:x.alphaTest,opacity:x.opacity})),visible:visible(m)};};
   const take=label=>{
    a.root.updateMatrixWorld(true);const bones={};a.vrm.scene.traverse(b=>{if(b.isBone)bones[b.name]=b.matrixWorld.toArray();});
    return {label,snapshot:d.snapshot(),rootWorld:a.root.matrixWorld.toArray(),bones,colliders:meshes.map(surface),sourceSkirt:surface(source),displayedSkirt:surface(d.scene.getObjectByName('M1_UniformSkirt_Constrained')),sourceBind:source.bindMatrix.toArray(),chair:d.chairColliders().map(x=>({name:x.name,min:x.localBox.min.toArray(),max:x.localBox.max.toArray(),matrixWorld:x.matrixWorld.toArray()}))};
   };
   const frames=[take('standing')];c.action('sit');advance(.55);frames.push(take('sit-in'));advance(2);frames.push(take('seated'));c.action('stand');advance(.55);frames.push(take('rise'));
   return {schema:'m1.simple-skirt-four-poses.1',frames,parameters:{dynamics:true,handTarget:'authored',corrections:'full',step:1/120},limits:['Actual original uniform/controller inputs, not final new-skirt hand refit acceptance.','Raw triangle input includes transparent faces; alpha and visible/internal classification required.','Four poses are admission only, not continuous motion or CCD.']};
  });
  if(errors.length)throw Error(errors.join('\n'));
  data.identity=identity;data.finalIdentity=await verifyCandidate(page,expectations());
  const raw=Buffer.from(JSON.stringify(data)),gz=zlib.gzipSync(raw,{level:9});
  await fs.writeFile(path.join(out,'four-poses.json.gz'),gz);
  const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
  await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({build:identity.runtimeBuild.shortId,rawBytes:raw.length,rawSha256:sha(raw),gzipBytes:gz.length,gzipSha256:sha(gz),poses:data.frames.map(f=>({label:f.label,mode:f.snapshot.mode,sitProgress:f.snapshot.motion.sitProgress})),errors},null,2));
  console.log(JSON.stringify({out,poses:data.frames.map(f=>[f.label,f.snapshot.mode,f.snapshot.motion.sitProgress]),rawBytes:raw.length,gzipBytes:gz.length}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

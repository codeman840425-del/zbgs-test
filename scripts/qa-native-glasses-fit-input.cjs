// Capture unfitted source geometry for authoring. A successful capture is not fit admission.
const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const defaults=[['native-female-843ac-v1','native-vroid-unmasked-female-130-v1','843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef'],['native-female-face-v1','native-vroid-face-geometry-unmasked-v1','cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce'],['native-female-waist-v1','native-vroid-waist-geometry-unmasked-v1','cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5'],['native-male-7586-v1','native-vroid-unmasked-male-79-v1','7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81']];

// Runs in the actual workbench after verified body and accessory loading.
function collectPose(pose){
  const d=window.__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio'),V=a.root.position.constructor;
  if(pose==='sit'){
    if(c.action('sit')===false)throw Error('Sit request rejected');
    for(let i=0;i<1200 && d.motion().getMetrics().sitProgress!==1;i++)c.simulate(1/120);
    for(let i=0;i<90;i++)c.simulate(1/120);
  }
  const sitProgress=d.motion().getMetrics().sitProgress;
  if(sitProgress!==(pose==='sit'?1:0))throw Error('Incomplete '+pose+' pose: '+sitProgress);
  a.root.updateMatrixWorld(true);
  const head=a.vrm.humanoid.getRawBoneNode('head'),h=head.getWorldPosition(new V());
  const object=a.root.getObjectByName('LiveAccessory:glasses'),live=a.livePresentation.getState();
  if(!object||live.accessories.glasses.identity?.fit?.id!=='legacy-glasses-fit-v1')throw Error('Expected unfitted glasses on the primary actor');
  const inverse=object.matrixWorld.clone().invert(),meshes=[];
  function captureMesh(m,role){
    const g=m.geometry,materials=[m.material].flat(),p=new V(),positions=[],triangles=[];
    const earTriangleIndices={positiveX:[],negativeX:[]};
    const index=g.index?.array??Array.from({length:g.attributes.position.count},(_,i)=>i);
    const groups=g.groups.length?g.groups:[{start:0,count:index.length,materialIndex:0}];
    for(let i=0;i<g.attributes.position.count;i++)positions.push(m.getVertexPosition(i,p).applyMatrix4(m.matrixWorld).toArray());
    for(const group of groups){
      const mat=materials[group.materialIndex];if(!mat||mat.visible===false||mat.isOutline)continue;
      const face=/_Face_.*SKIN/.test(mat.name);
      if(role==='skin'&&!face&&!/Body_.*SKIN/.test(mat.name))continue;
      if(role==='hair'&&!/_HAIR/.test(mat.name))continue;
      const end=Math.min(index.length,group.start+group.count);
      for(let i=group.start;i+2<end;i+=3){
        const tri=[index[i],index[i+1],index[i+2]];
        if(role==='skin'&&!tri.some(k=>positions[k][1]>h.y-.22))continue;
        if(role==='skin'&&face){
          // Existing four-ring authoring selector in accessory-local coordinates.
          // Keep indices into the sampled face mesh, with all corners in the band.
          const local=tri.map(k=>new V().fromArray(positions[k]).applyMatrix4(inverse));
          if(local.every(v=>v.x>.072&&v.z<-.065))earTriangleIndices.positiveX.push(triangles.length);
          if(local.every(v=>v.x<-.072&&v.z<-.065))earTriangleIndices.negativeX.push(triangles.length);
        }
        triangles.push(tri);
      }
    }
    if(triangles.length)meshes.push({name:m.name,role,positions,triangles,
      ...(role==='skin'?{earTriangleIndices}:{}),materials:materials.map(mat=>({name:mat.name,alphaTest:mat.alphaTest,
        transparent:mat.transparent,opacity:mat.opacity,isOutline:mat.isOutline})),matrixWorld:m.matrixWorld.toArray()});
  }
  a.vrm.scene.traverseVisible(m=>{
    if(!m.isSkinnedMesh)return;
    const names=[m.material].flat().map(x=>x.name);
    if(names.some(n=>/(_Face_.*SKIN|Body_.*SKIN)/.test(n)))captureMesh(m,'skin');
    if(names.some(n=>/_HAIR/.test(n)))captureMesh(m,'hair');
  });
  object.traverseVisible(m=>{if(m.isMesh)captureMesh(m,'glasses');});
  const sum=role=>meshes.filter(m=>m.role===role).reduce((n,m)=>n+m.triangles.length,0);
  const earCount=side=>meshes.reduce((n,m)=>n+(m.earTriangleIndices?.[side].length??0),0);
  const counts={skin:sum('skin'),hair:sum('hair'),earPositiveX:earCount('positiveX'),earNegativeX:earCount('negativeX'),
    temples:Object.fromEntries(['Temple-1','Temple1'].map(name=>[name,meshes.find(m=>m.role==='glasses'&&m.name===name)?.triangles.length??0]))};
  if(!counts.skin||!counts.hair||Object.values(counts.temples).includes(0))throw Error('Missing capture geometry: '+JSON.stringify(counts));
  const images={};
  for(const [name,offset]of [['front',[0,.025,.62]],['left',[.58,.02,.13]],['right',[-.58,.02,.13]],['three-quarter',[.43,.03,.48]]]){
    const cam=d.cameraObject();cam.position.copy(h).add(new V(...offset));cam.lookAt(h.clone().add(new V(0,.015,.025)));
    cam.updateMatrixWorld(true);d.renderer.render(d.scene,cam);images[name]=d.renderer.domElement.toDataURL('image/png').split(',')[1];
  }
  const outfit=a.getOutfitInfo();
  return {pose,head:h.toArray(),headMatrix:head.matrixWorld.toArray(),glassesMatrix:object.matrixWorld.toArray(),
    live,snapshot:{mode:d.snapshot().mode,sitProgress,outfit:outfit.index,outfitRole:outfit.equipment.selection.role},counts,meshes,images};
}

function validCase(row){
  if(!Array.isArray(row)||![3,4].includes(row.length))return false;
  const [body,id,sha,selection]=row;
  if(typeof body!=='string'||!/^[a-z0-9-]+$/.test(body)||!id||typeof id!=='string'||typeof sha!=='string'||!/^[a-f0-9]{64}$/.test(sha))return false;
  return row.length===3||(selection!==null&&typeof selection==='object'&&Object.keys(selection).length===1&&
    typeof selection.role==='string'&&/^[a-z0-9-]+$/.test(selection.role));
}

async function run(base,casesFile){
  const build=process.env.QA_M1_BUILD;
  if(!base||!/^[a-f0-9]{12}$/.test(build||''))throw Error('fixed runner+QA_M1_BUILD required');
  const root=await productionRoot();
  const out=await projectOutput(process.env.QA_M1_RUN_ROOT||path.join(root,'output','playwright','m1',build,'acc01-'+Date.now()),root);
  const exists=await fs.lstat(out).catch(e=>{if(e.code!=='ENOENT')throw e;});
  if(exists)throw Error('Refuse existing capture directory: '+out);
  const requested=casesFile?JSON.parse(await fs.readFile(casesFile,'utf8')):defaults;
  if(!Array.isArray(requested)||!requested.length||!requested.every(validCase)||
    new Set(requested.map(r=>r[0])).size!==requested.length)throw Error('Invalid exact body capture cases');
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
  const report={build,scope:'Unfitted glasses, original skin and hair. Ear samples use the existing four-ring face selector, not an anatomical segmentation or fit approval.',cases:[],errors:[],consoleErrors:[]};
  let session;
  try{
    session=await launchQABrowser(out,{channel:'chrome'});
    for(const [body,assetId,sha256,selection] of requested){
      const page=await session.browser.newPage({viewport:{width:1440,height:1000}});
      try{
        page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
        const url=new URL(base);url.searchParams.set('workbench','appearance');url.searchParams.set('glassesFit','legacy');url.searchParams.set('body',body);
        await page.goto(url.href);
        await page.waitForFunction(()=>window.__debug?.ready||document.body.innerText.includes('角色加载失败'),null,{timeout:60000});
        const identity=await verifyCandidate(page,{build,assetId,sha256});
        await page.evaluate(async({body,selection})=>{
          const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio');
          d.reset();d.setPaused(true);d.setDynamics(true);d.setHelpers(false);d.setBodyMode('dressed');
          let target=body==='male'?2:0;
          if(selection){
            const matches=a.getAssetProfile().qa.outfits.filter(o=>o.bodyMode==='dressed'&&o.name===selection.role);
            if(matches.length!==1)throw Error('Outfit role missing or ambiguous on '+body+': '+selection.role);
            target=matches[0].outfit;
          }
          const outfit=await c.prepareOutfit(target);
          try{if(!outfit.isCurrent())throw Error('Outfit selection superseded');outfit.commit();}finally{outfit.dispose();}
          const active=a.getOutfitInfo();
          if(active.index!==target||(selection&&active.equipment.selection.role!==selection.role))throw Error('Active outfit differs from requested capture outfit');
          c.cameraPreset('room',true);
          const seat=d.snapshot().chair;a.root.position.set(...seat.approach);a.root.rotation.y=c.yaw=seat.yaw;
          d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);
          const result=await a.livePresentation.setAccessory('glasses',true);if(!result.applied)throw Error(result.reason??'Unfitted glasses failed to load');
          a.livePresentation.setSpeaking(true);for(let i=0;i<180;i++)c.simulate(1/120);
        },{body,selection});
        for(const pose of ['stand','sit']){
          const capture=await page.evaluate(collectPose,pose);
          const finalIdentity=await verifyCandidate(page,{build,assetId,sha256});
          if(capture.live.avatarSha256!==sha256)throw Error('Accessory belongs to another body');
          if(selection&&capture.snapshot.outfitRole!==selection.role)throw Error('Capture outfit changed during pose');
          for(const [name,data]of Object.entries(capture.images))await fs.writeFile(path.join(out,body+'-'+pose+'-'+name+'.png'),Buffer.from(data,'base64'),{flag:'wx'});
          delete capture.images;
          await fs.writeFile(path.join(out,body+'-'+pose+'.json.gz'),zlib.gzipSync(JSON.stringify(capture),{level:1}),{flag:'wx'});
          report.cases.push({body,pose,identity,finalIdentity,...(selection?{requestedOutfit:selection}:{}),snapshot:capture.snapshot,counts:capture.counts,
            meshes:capture.meshes.map(m=>({name:m.name,role:m.role,triangles:m.triangles.length})),live:capture.live});
        }
      }finally{await page.close();}
    }
    if(report.errors.length)throw Error(report.errors.join('\n'));
  }catch(error){report.failure=String(error.stack||error);throw error;}
  finally{try{await session?.close();}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});}}
  console.log(out);
}
if(require.main===module)run(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});

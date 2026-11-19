// Run with run-fixed-check.cjs <standalone> <this script> <package SHA256> <evidence directory>.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {projectOutput,productionRoot} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');
const {observeNetwork} = require('./qa-cold-assets.cjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// Fingerprint glTF float positions and triangle indices in accessor order.
function geometryFromGlb(bytes) {
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  const end=20+bytes.readUInt32LE(12), doc=JSON.parse(bytes.subarray(20,end));
  assert.equal(bytes.toString('ascii',end+4,end+8),'BIN\0');
  const data=bytes.subarray(end+8);
  function unpack(id,position) {
    const a=doc.accessors[id],view=doc.bufferViews[a.bufferView];
    assert(!a.sparse && view.buffer===0);
    assert.equal(a.type,position?'VEC3':'SCALAR');
    assert(position?a.componentType===5126:[5121,5123,5125].includes(a.componentType));
    const size=({5121:1,5123:2,5125:4,5126:4})[a.componentType], width=position?3:1;
    const packed=Buffer.alloc(a.count*width*4);
    for(let i=0;i<a.count;i++)for(let c=0;c<width;c++){
      const from=(view.byteOffset??0)+(a.byteOffset??0)+i*(view.byteStride??size*width)+c*size;
      if(position)packed.writeFloatLE(data.readFloatLE(from),(i*3+c)*4);
      else packed.writeUInt32LE(data.readUIntLE(from,size),i*4);
    }
    return sha(packed);
  }
  return doc.meshes.flatMap(m=>m.primitives.map(p=>{
    assert.equal(p.mode??4,4);
    return [unpack(p.attributes.POSITION,true),unpack(p.indices,false)].join('/');
  })).sort();
}

async function readActors(expectedRecords) {
  const api=window.__recordConsumer;
  if(api.inputFailure||api.errors.length||api.actors.size!==expectedRecords||api.records.length!==expectedRecords)
    throw Error('Expected the full signed footwear roster');
  return Promise.all([...api.actors.values()].map(async actor=>{
  const profile=actor.avatar.profile,item=profile.motion.getFootwear();
  const jsonHash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
  const visibleMeshes=new Map(),geometry=[];
  for(const mesh of item.meshes) {
    let owner,attached=false,shown=true;
    for(let node=mesh;node;node=node.parent){owner??=node.userData.equipmentId;attached||=node===api.scene;shown&&=node.visible;}
    if(owner!==item.id||!attached||!shown||!mesh.isSkinnedMesh||![mesh.material].flat().every(m=>m?.visible))throw Error('Inactive selected footwear mesh');
    const g=mesh.geometry,pos=g.attributes.position,idx=g.index,indices=new Uint32Array(idx.count),positions=new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++)positions.set([pos.getX(i),pos.getY(i),pos.getZ(i)],i*3);
    for(let i=0;i<idx.count;i++)indices[i]=idx.getX(i);
    const end=Math.min(idx.count,g.drawRange.start+g.drawRange.count);
    visibleMeshes.set(mesh.uuid,{mesh,drawn:new Set(indices.subarray(g.drawRange.start,end))});
    geometry.push({mesh:mesh.uuid,name:mesh.name,vertices:pos.count,drawnIndices:end-g.drawRange.start,
      fingerprint:[await jsonHash(positions),await jsonHash(indices)].join('/')});
  }
  const patches={};
  for(const {side,selection} of actor.motion.getFootLockCalibration()) {
    patches[side]={};
    for(const kind of ['heel','toe']){
      const points=selection.patches[kind], ys=[],byMesh={};
      for(const {mesh:uuid,vertex} of points){
        const ref=visibleMeshes.get(uuid);
        if(!ref?.drawn.has(vertex))throw Error('Contact point outside the rendered footwear');
        const mesh=ref.mesh,{skinIndex,skinWeight}=mesh.geometry.attributes;
        const sideBones=side==='left'?/^J_Bip_L_(LowerLeg|Foot|ToeBase)$/:/^J_Bip_R_(LowerLeg|Foot|ToeBase)$/;
        let weight=0;
        for(let k=0;k<4;k++)if(sideBones.test(mesh.skeleton.bones[skinIndex.getComponent(vertex,k)]?.name))
          weight+=skinWeight.getComponent(vertex,k);
        if(weight<=.999)throw Error('Wrong side in '+side+' '+kind);
        (byMesh[uuid]??=[]).push(vertex);
        ys.push(mesh.getVertexPosition(vertex,new api.three.Vector3()).applyMatrix4(mesh.matrixWorld).y);
      }
      if(!ys.length||!ys.every(Number.isFinite))throw Error('Empty or nonfinite contact patch');
      patches[side][kind]={count:ys.length,minWorldY:Math.min(...ys),maxWorldY:Math.max(...ys),vertices:byMesh};
    }
  }
  const playback=[];
  function sample() {
    const m=actor.motion.getMetrics();
    playback.push({wallMs:performance.now(),frame:m.frame,seconds:m.actionTime,action:m.action,speakingMix:m.talkMix,
      renderFrame:api.renderer.info.render.frame,pose:['hips','spine','leftUpperArm','rightUpperArm'].flatMap(name=>{
        const bone=actor.avatar.vrm.humanoid.getRawBoneNode(name);
        return [...bone.position.toArray(),...bone.quaternion.toArray()];
      })});
  }
  sample();
  while(playback.at(-1).wallMs-playback[0].wallMs<850){
    await new Promise(requestAnimationFrame);
    if(performance.now()-playback.at(-1).wallMs>95)sample();
  }
  const gl=api.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {build:api.buildInfo.shortId,root:actor.avatar.root.uuid,revision:actor.revision,id:actor.identity.id,
    recordSha256:actor.recordSha256,bodyType:profile.bodyType,bodySha256:profile.sha256,shoe:item.id,
    shoeSha256:item.entry.sha256,shoeFitId:item.entry.fitId,footwearMeshRoles:profile.meshRoles.footwear,
    outfit:actor.controller.outfit,geometry,patches,playback,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};
  }));
}

async function run(base,pin,directory) {
  const project=await productionRoot(),dir=await projectOutput(directory,project);
  assert.match(pin,/^[a-f0-9]{64}$/);
  await fs.mkdir(dir,{recursive:true});
  const out=await fs.mkdtemp(await projectOutput(path.join(dir,'run-'),project)),report={manifestSha256:pin,runs:[]};
  try {
    const response=await fetch(new URL('runtime-package.json',base),{redirect:'error'});
    assert.equal(response.status,200);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(sha(bytes),pin);
    const manifest=JSON.parse(bytes),records=manifest.records;
    assert(records.length>=1&&records.length<=2,'Expected one cold opening group of one or two signed records');
    assert.equal(new Set(records.map(record=>record.id)).size,records.length);
    report.records=records.map(({id,bodyType,avatarSha256,recordSha256,outfitIndex})=>({id,bodyType,avatarSha256,recordSha256,outfitIndex}));
    assert.equal(manifest.runtime.entryUrl,'record-consumer.html?records=/records/manifest.json');
    for(const phase of ['first','reopened']){
      const trace={phase};report.runs.push(trace);
      const session=await launchQABrowser(out,{channel:'chrome'}),{browser}=session;
      try {
        const info=await (await browser.newBrowserCDPSession()).send('SystemInfo.getProcessInfo');
        trace.browserPid=info.processInfo.find(p=>p.type==='browser').id;
        trace.browser=browser.version();
        const context=await browser.newContext({viewport:{width:960,height:700}}),page=await context.newPage();
        const network=await observeNetwork(context,page),requests=[],errors=[];
        page.on('pageerror',e=>errors.push(String(e)));
        page.on('request',r=>requests.push(r.url()));
        await page.goto(new URL(manifest.runtime.entryUrl,base).href);
        await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:90000});
        const transfers=new Map();
        async function served(file){
          if(transfers.has(file))return transfers.get(file);
          const row=manifest.files.find(r=>r.path===file),body=await network.read(new URL(file,base).href);
          assert.equal(sha(body.bytes),row.sha256);
          assert.equal(body.bytes.length,row.bytes);
          (trace.responses??=[]).push({file,sha256:row.sha256,bytes:row.bytes,transferBytes:body.transferBytes});
          transfers.set(file,body.bytes);
          return body.bytes;
        }
        const index=JSON.parse(await served(manifest.recordManifest));
        assert.deepEqual(index.entries,records.map(record=>({id:record.id,url:'/'+record.file,recordSha256:record.recordSha256})));
        const restored=await page.evaluate(readActors,records.length);
        if(records.length===1)trace.actor=restored[0];else trace.actors=restored;
        assert.equal(new Set(restored.map(actor=>actor.root)).size,records.length,'Cold actors must own independent instances');
        assert.equal(new Set(restored.flatMap(actor=>actor.geometry.map(mesh=>mesh.mesh))).size,
          restored.reduce((count,actor)=>count+actor.geometry.length,0),'Cold actors share live footwear meshes');
        for(const record of records){
          const signed=JSON.parse(await served(record.file));
          assert.equal(signed.revision,record.revision);
          assert.equal(signed.identity.id,record.id);
          assert.equal(signed.integrity.recordSha256,record.recordSha256);
          assert.deepEqual(signed.appearanceRecipe.base,{bodyType:record.bodyType,sha256:record.avatarSha256});
          const shoes=Object.values(signed.appearanceRecipe.equipment.resources).filter(resource=>resource.slot==='shoes');
          assert.equal(shoes.length,1);
          const [shoe]=shoes,glb=await served(shoe.url.slice(1));
          assert.equal(shoe.compatibleAvatarSha256,record.avatarSha256);
          assert.equal(sha(glb),shoe.sha256);
          assert.equal(glb.length,shoe.bytes);
          const a=restored.find(actor=>actor.id===record.id);
          assert(a,'Cold scene missed signed actor '+record.id);
          assert.deepEqual([a.id,a.revision,a.recordSha256,a.build,a.bodyType,a.bodySha256,a.outfit,a.shoe,a.shoeSha256,a.shoeFitId],
            [record.id,record.revision,record.recordSha256,manifest.runtime.buildId,record.bodyType,record.avatarSha256,
              record.outfitIndex,shoe.id,shoe.sha256,shoe.fitId]);
          assert.deepEqual(a.geometry.map(g=>g.fingerprint).sort(),geometryFromGlb(glb));
          assert.deepEqual(a.footwearMeshRoles.sort(),a.geometry.map(g=>g.mesh).sort());
          assert.deepEqual(Object.keys(a.patches).sort(),['left','right']);
          const first=a.playback[0],last=a.playback.at(-1);
          assert(last.frame>first.frame && last.seconds>first.seconds && last.renderFrame>first.renderFrame);
          assert(a.playback.some(s=>s.pose.some((v,i)=>Math.abs(v-first.pose[i])>1e-5)));
        }
        trace.glbRequests=requests.filter(u=>new URL(u).pathname.endsWith('.glb')).map(u=>new URL(u).pathname);
        assert(trace.glbRequests.every(url=>manifest.files.some(row=>'/'+row.path===url)));
        const diagnostics=network.diagnostics(),tabIcon=new URL('favicon.ico',base).href;
        trace.httpErrors=diagnostics.httpErrors;
        trace.failedRequests=diagnostics.failed;
        // Chrome can probe the undeclared tab icon after the game finishes loading.
        assert.deepEqual(trace.httpErrors.filter(e=>e.url!==tabIcon||e.status!==404),[]);
        assert.deepEqual(trace.failedRequests.filter(e=>e.url!==tabIcon||e.type!=='Other'),[]);
        assert.deepEqual(errors,[]);
        await page.screenshot({path:path.join(out,phase+'.png')});
      }finally{
        await session.close();
        trace.browserClosed=!browser.isConnected();assert(trace.browserClosed);
      }
    }
    const [a,b]=report.runs;
    assert.notEqual(a.browserPid,b.browserPid);
    function localPatches(actor){
      return Object.values(actor.patches).flatMap(side=>Object.values(side).map(p=>Object.entries(p.vertices)
        .map(([uuid,vertices])=>[actor.geometry.find(g=>g.mesh===uuid).fingerprint,vertices])));
    }
    const actors=run=>run.actors??[run.actor];
    for(const first of actors(a)){
      const reopened=actors(b).find(actor=>actor.id===first.id);
      assert(reopened);
      assert.notEqual(first.root,reopened.root);
      assert.deepEqual(localPatches(first),localPatches(reopened));
    }
    report.passed=true;
  }catch(e){report.error=String(e.stack??e);throw e;}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);}
}
run(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});

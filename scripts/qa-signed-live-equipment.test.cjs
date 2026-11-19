const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const test=require('node:test');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {readPair}=require('./qa-signed-live-equipment.cjs');

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity=(bodySHA256,accessorySHA256,fit)=>({bodySHA256,accessorySHA256,
  fit:{...fit,bodySHA256,accessorySHA256}});

async function fixture(t,micOwner,{omitSelectedMic=false,shareFit=false}={}) {
  const root=await productionRoot();
  const dir=await fs.mkdtemp(await projectOutput(path.join(root,'experiments','qa-signed-live-test-'),root));
  t.after(async()=>{
    assert.equal(await projectOutput(dir,root),dir);
    await fs.rm(dir,{recursive:true});
  });
  const files=[];
  const add=async(name,value)=>{
    const target=path.join(dir,name),bytes=Buffer.from(JSON.stringify(value));
    const row={path:name,sha256:sha(bytes),bytes:bytes.length};
    await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
    files.push(row);
    return row;
  };
  const glasses=await add('assets/glasses.glb','fixtures need only declared bytes');
  const mic={path:'assets/mic.glb',sha256:'c'.repeat(64),bytes:10};
  if(micOwner&&!omitSelectedMic)files.push(mic);
  const item=(file,id)=>({id,url:'/'+file.path,sha256:file.sha256,bytes:file.bytes});
  await add('assets/m1c/accessories.json',{items:[item(glasses,'studio-glasses-v1'),item(mic,'studio-microphone-v1')]});
  const pair=[],rows=[];
  for(const [index,id] of ['first','second'].entries()){
    const base={sha256:String(index).repeat(64)};
    const fitId=shareFit?'first':id;
    const fit=index&&shareFit?files.find(row=>row.path==='assets/first-fit.json'):
      await add('assets/'+fitId+'-fit.json',{id:fitId});
    const liveAccessories={microphonePresentation:null,selections:{
      glasses:{enabled:true,identity:identity(base.sha256,glasses.sha256,{id:fitId,sha256:fit.sha256})},
      mic:{enabled:false,identity:null},
    }};
    if(id===micOwner){
      const grip=await add('assets/grip.json',{id:'grip',compatibleAvatarSha256:base.sha256,compatibleAccessorySha256:mic.sha256});
      liveAccessories.selections.mic={enabled:true,identity:identity(base.sha256,mic.sha256,{id:'grip',sha256:grip.sha256})};
      liveAccessories.microphonePresentation={mouthRawHeadLocal:[0,0,0]};
    }
    const record={identity:{id},appearanceRecipe:{base},liveAccessories};
    pair.push(record);
    rows.push({file:(await add('records/'+id+'.json',record)).path});
  }
  const manifest=await add('runtime-package.json',{files,records:rows});
  const supplied=await add('supplied.json',pair);
  return ()=>readPair(dir,manifest.sha256,path.join(dir,supplied.path));
}

test('derives a glasses-only lifecycle and peer failure when the package contains no microphone',async t=>{
  const read=await fixture(t,null);
  const {scenario,resources,grip}=await read();
  assert.deepEqual(Object.keys(resources),['glasses']);
  assert.equal(grip,null);
  assert.equal(scenario.micOwner,null);
  assert.equal(scenario.activeId,'first');
  assert.equal(scenario.peerId,'second');
  assert.deepEqual(scenario.selectedKinds,['glasses']);
  assert.equal(scenario.failedFit.path,'assets/second-fit.json');
  assert.equal(scenario.failedFit.sha256,sha(JSON.stringify({id:'second'})));
});

test('preserves microphone-owner lifecycle and exact signed grip when that record is second',async t=>{
  const read=await fixture(t,'second');
  const {scenario,resources,grip}=await read();
  assert.equal(scenario.micOwner,'second');
  assert.equal(scenario.activeId,'second');
  assert.equal(scenario.peerId,'first');
  assert.deepEqual(scenario.selectedKinds,['mic','glasses']);
  assert.equal(scenario.failedFit.path,'assets/first-fit.json');
  assert.equal(grip.compatibleAccessorySha256,resources.mic.sha256);
});

test('rejects a missing selected microphone and an ambiguous shared peer fit',async t=>{
  const missing=await fixture(t,'second',{omitSelectedMic:true});
  const shared=await fixture(t,null,{shareFit:true});
  await assert.rejects(missing,/Missing declared studio-microphone-v1/);
  await assert.rejects(shared,/Expected independently addressable glasses fits/);
});

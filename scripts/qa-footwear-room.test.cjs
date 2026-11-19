const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const test=require('node:test');
const {footwearCase,signedFlat,traceChecks}=require('./qa-footwear-room.cjs');

const read=file=>readFile(path.join(__dirname,'..',file));
const femaleBody={type:'source-female-uniform-texture-v1',sha256:'1049f87a865e523e02b53d9985a37aa5229dd2221b7a9645f2261f16d35c172c'};
const female=Object.freeze({schema:'footwear-room-case-v1',bodySha256:femaleBody.sha256,bodyType:femaleBody.type,
  referenceIndex:5,outfitIndex:6,label:'platform',role:'pants-top-far-platform',equipmentRole:'platformShoes',
  id:'female-uniform-platform-shoes-v1',sha256:'fadbf92559ae8e90256c2e7f8cacb450e52c066dcef86b104c9b3826bd17e7de'});

test('the room selects the exact female reference from two original signatures',async()=>{
  const pair=await read('evidence/m2-uniform-lite-operator-v1/records.json');
  const candidate=footwearCase(female),record=signedFlat(pair,candidate);
  const recipe=record.appearanceRecipe;
  assert.equal(record.identity.id,'uniform-lite-female-v1');
  assert.equal(recipe.base.sha256,candidate.bodySha256);
  assert.equal(recipe.equipment.index,5);
  assert.equal(recipe.equipment.resources.shoes.id,'source-female-uniform-texture-v1-shoes');
  assert.equal(recipe.equipment.resources.shoes.compatibleAvatarSha256,female.bodySha256);
  assert.deepEqual(signedFlat(pair,footwearCase({...female,referenceIndex:undefined})),record);
  assert.throws(()=>signedFlat(pair,footwearCase({...female,bodySha256:'0'.repeat(64)})),/one original signed flat record/);
  assert.throws(()=>signedFlat(pair,footwearCase({...female,referenceIndex:0})),/one original signed flat record/);
  assert.throws(()=>signedFlat(pair,footwearCase({...female,id:recipe.equipment.resources.shoes.id})),/different shoes/);
  assert.throws(()=>signedFlat(Buffer.from(JSON.stringify([record,record])),candidate),/one original signed flat record/);
  assert.throws(()=>footwearCase({...female,referenceIndex:female.outfitIndex}),/distinct signed reference/);
});

test('the existing male and both ankle boot calls select the same original flat signature',async()=>{
  const input=await read('evidence/m2-cc0-body-release-game-v1/far-records.json');
  const original=signedFlat(input);
  assert.equal(original.appearanceRecipe.equipment.index,1);
  assert.equal(original.appearanceRecipe.equipment.resources.shoes.id,'cc0-texture-release-flat-shoes-v1');
  for(const file of ['assets-source/ankle-boot-fit-v1/room-case.json','assets-source/ankle-boot-layers-v2/room-case.json']){
    const comparison=footwearCase(JSON.parse(await read(file)));
    assert.deepEqual(signedFlat(input,comparison),original);
  }
});

test('each sole trace requires the active shoe identity and both visible heel/toe ranges',()=>{
  const shoe={id:female.id,sha256:female.sha256,fitId:female.id+'-fit'};
  const matches=()=>({count:5,correctSide:5,minWorldY:-.001,maxWorldY:.003,
    owners:[{mesh:'active-shoe',id:shoe.id,visible:true}]});
  const feet=()=>({sole:{id:shoe.id,groundDeltaM:-.001},vertexCount:1,patches:{heel:matches(),toe:matches()}});
  const samples=Array.from({length:24},(_,i)=>({
    label:'walk',actor:'signed-actor',bodyType:femaleBody.type,bodySHA256:femaleBody.sha256,
    wallMs:80*i,simulationTime:.08*i,playbackRate:1,outfit:6,avatarOutfit:6,
    camera:{position:[0,0,0],rotation:[0,0,0,1],fov:33},
    visible:[{mesh:'active-shoe',id:shoe.id,unclassified:0}],footwear:{...shoe,meshes:['active-shoe']},
    feet:{left:feet(),right:feet()},
  }));
  const options={checkedShoes:{6:shoe},body:femaleBody};
  assert.deepEqual(traceChecks(samples,options).faults,[]);
  samples[1].bodyType='source-male-cc0-texture-release-v1';
  samples[2].footwear.sha256='a'.repeat(64);
  samples[3].feet.right.patches.heel.owners[0].visible=false;
  samples[4].feet.left.patches.toe.maxWorldY=null;
  const observed=traceChecks(samples,options).faults;
  assert.deepEqual(observed.map(({index,reason,side,patch})=>[index,reason,side,patch]),[
    [1,'runtime identity or clock',undefined,undefined],
    [2,'visible meshes differ from the current exact footwear',undefined,undefined],
    [3,'calibration did not use this visible shoe','right','heel'],
    [4,'calibration did not use this visible shoe','left','toe'],
  ]);
});

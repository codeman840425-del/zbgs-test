const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {checkLowPins,checkPhysical}=require('./qa-game-standing-vocal.cjs');
const pair=readFileSync(path.join(__dirname,'../evidence/m2-uniform-lite-operator-v1/records.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const meta={gameRuntime:{buildId:'ddcf40a56d0e',sourceDigest:'ddcf40a56d0ef69662f7d0798ca7e6210bd8cc20f6dc52a2cc034d40b20fe28f'},
  gameInventorySha256:'3d3e2b3885003d0585c1b7eb6ea40c7490001a647f227c2dcff9377aa26060b5',
  roomManifestSha256:'64802112dd64938d88ef6e8115c90096a90f591833467db55bd837e4ca11eebc',roomProfile:'vocal-fit-v1'};
test('low-fit preflight requires the full combined pin, original signed file and exact room/runtime pair',()=>{
  const b=Buffer.from(JSON.stringify(meta)),build=meta.gameRuntime.buildId;
  checkLowPins(b,pair,hash(b),build);
  for(const pin of [undefined,hash(b).slice(0,12),'0'.repeat(64)])assert.throws(()=>checkLowPins(b,pair,pin,build));
  assert.throws(()=>checkLowPins(b,Buffer.from('[]'),hash(b),build));
  const previous=Buffer.from(JSON.stringify({...meta,roomManifestSha256:'5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012'}));
  assert.throws(()=>checkLowPins(previous,pair,hash(previous),build));
});
test('pose checks preserve witnesses for occlusion, landmark mismatch, and the wrong mounted shoe',()=>{
  const [r]=JSON.parse(pair);
  const contact={mouthWorld:[0,1.5,0],eyeWorld:[0,1.6,0],pickupWorld:[0,1.5,.2],
    mouthDistance:.2,incidenceDegrees:0,facingDegrees:0,withinPickupWindow:true};
  const s={record:r.integrity.recordSha256,body:r.appearanceRecipe.base.sha256,
    lease:{ownerId:r.identity.id,state:'occupied'},speaking:true,lipVertexCount:32,triangle:10,
    contact,lipCenter:contact.mouthWorld,eye:contact.eyeWorld,pickupDistance:.2,
    feet:{sha256:r.appearanceRecipe.equipment.resources.shoes.sha256,patches:['left','right'].flatMap(side=>
      ['heel','toe'].map(area=>({side,area,count:2,aboveFloorM:.001})))},
    pages:Array.from({length:18},()=>({visible:true}))};
  checkPhysical(s,r);
  assert.throws(()=>checkPhysical({...s,eye:[0,1.65,0]},r),/eye mismatch/);
  assert.throws(()=>checkPhysical({...s,feet:{...s.feet,sha256:'wrong-shoe'}},r));
  const blocked=structuredClone(s);blocked.pages[17]={visible:false,first:'mic clip'};
  assert.throws(()=>checkPhysical(blocked,r),/mic clip/);
});

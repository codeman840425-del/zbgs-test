import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Scene} from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {describeCompanyUsePoint} from '../../prototype/src/company/use-point-data.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {checkManagedOutput} from './package-company.mjs';
import {adaptVocalHeightOrigin,inheritVocalOrigin,readVocalAuthority} from './package-template/vocal-origin.mjs';

const [batch,reviewed,pin,directory,...extra]=process.argv.slice(2);
assert(batch && reviewed && /^[a-f0-9]{64}$/.test(pin) && directory && !extra.length,
  'Usage: node test-vocal-height-profiles.mjs STANDARD_BATCH REVIEWED_PACKAGE REVIEWED_PIN FRESH_OUTPUT');
const out=path.resolve(directory), context={catalog,templates};
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const hash=data=>createHash('sha256').update(data).digest('hex');
const report={status:'running',rooms:[],reviewedManifestSha256:pin};
const describe=(doc,id)=>describeCompanyUsePoint(doc,deriveCompany(doc,catalog,templates),id);
const invariant=({resource,performerReferences,heightProfile,revision,...point})=>point;

for(const key of ['singing-studio','singing-rental']) {
  const authority=await readVocalAuthority({packageRoot:reviewed,manifestSha256:pin,sourceRoomKey:key});
  const source=await fs.readFile(path.join(batch,key,'save.json'),'utf8');
  const standard=await decodeCompanySave(source,catalog,templates),rule=standard.singingRooms[0];
  const originalEncoding=await encodeCompanySave(standard,catalog,templates);
  const id=rule.roles.mic,slot=id+'#vocal',start=describe(standard,slot);
  const choose=profile=>({type:'set-vocal-height',id,profile});
  const change=(doc,op,options={})=>prepareCompanyChange(doc,[op],{...context,...options}).document;
  const low=change(standard,choose('low')),lower=describe(low,slot);
  assert.equal(start.heightProfile,'standard');assert.equal(lower.heightProfile,'low');
  assert.deepEqual(invariant(start),invariant(lower));
  assert.deepEqual(invariant(start),invariant(authority.points.find(p=>p.id===slot)));
  for(const [p,doc] of [[start,standard],[lower,low]]) {
    const preset=rule.heightProfiles[p.heightProfile];
    assert.deepEqual(p.resource,preset.resource);
    assert.deepEqual(p.performerReferences,{coordinateSpace:'use-point',mouth:preset.mouth,eye:preset.eye});
    assert.equal(adaptVocalHeightOrigin(authority,doc,[p]).mode,'adapted-vocal-height');
    assert.throws(()=>inheritVocalOrigin(authority,doc,[p]),{code:'vocal-slot-binding-mismatch'});
  }
  const returned=change(low,choose('standard'));
  assert.deepEqual({...returned,revision:standard.revision},standard);
  const saved=await encodeCompanySave(low,catalog,templates);
  const reopened=await decodeCompanySave(saved,catalog,templates);
  assert.deepEqual(reopened,low);
  const pins=JSON.parse(saved).dependencies.resources;
  for(const option of Object.values(rule.heightProfiles))
    assert(pins.some(r=>r.id===option.resource.id && r.version===option.resource.version));
  const missing=JSON.parse(saved);
  missing.dependencies.resources=missing.dependencies.resources.filter(r=>r.id!==start.resource.id);
  await assert.rejects(decodeCompanySave(JSON.stringify(missing),catalog,templates),{code:'missing-dependency-pin'});
  assert.throws(()=>change(standard,choose('low'),{isUsePointBusy:pointId=>pointId===slot}),{code:'facility-busy'});
  assert.throws(()=>change(standard,choose('other')),{code:'invalid-vocal-height-profile'});
  assert.throws(()=>change(standard,{type:'replace-resource',id,resource:lower.resource}),{code:'incompatible-replacement'});
  const bad=structuredClone(low);bad.singingRooms[0].performer.eye=start.performerReferences.eye;
  assert.throws(()=>deriveCompany(bad,catalog,templates),{code:'invalid-vocal-height-profile'});
  const shifted=structuredClone(low.nodes.find(n=>n.id===id).transform);
  shifted.position[0]+=.015;
  const moved=change(low,{type:'move',id,transform:shifted});
  assert.throws(()=>adaptVocalHeightOrigin(authority,moved,[describe(moved,slot)]),{code:'vocal-height-binding-mismatch'});
  const real=deriveCompany(standard,catalog,templates), lowAsset=catalog.resources.find(r=>r.id===lower.resource.id&&r.version===lower.resource.version);
  await preflightLibraryAssets({root:path.resolve(import.meta.dirname,'../..'),
    resources:[...real.facilities.map(f=>f.resource),...real.surfaceFinishes.map(f=>f.resource),lowAsset],
    validate:async library=>{
      let failure=null,busy=false;
      const checked={...library,preload:async refs=>{
        if(refs.some(r=>r.id===lowAsset.id)){
          if(failure==='loading') throw Error('fixture-height-load-failed');
          if(failure==='lease') busy=true;
        }
        return library.preload(refs);
      }};
      const ram=new Map(),storage={getItem:k=>ram.get(k)??null,setItem:(k,v)=>ram.set(k,v)};
      const session=await createCompanyAuthoring(new Scene(),standard,{...context,assetLibrary:checked,storage,isUsePointBusy:key=>key===slot&&busy});
      try{
        await session.save();const savedBefore=session.readSavedText(key);
        for(const reason of ['loading','lease']){
          failure=reason;busy=false;
          await assert.rejects(session.apply([choose('low')]), reason==='loading'?/fixture-height-load-failed/:{code:'facility-busy'});
          assert.deepEqual(session.document,standard);assert.equal(session.readSavedText(key),savedBefore);
        }
        busy=false;failure=null;
        await session.apply([choose('low')]);assert.deepEqual(session.document,low);
        await session.save();await session.apply([choose('standard')]);await session.restore();
        assert.deepEqual(session.document,low);
      }finally{session.dispose();}
    }});
  assert.equal(await encodeCompanySave(standard,catalog,templates),originalEncoding);
  assert.equal(await fs.readFile(path.join(batch,key,'save.json'),'utf8'),source);
  await fs.writeFile(path.join(out,key+'-low.json'),saved,{flag:'wx'});
  report.rooms.push({key,slot,standard:start,low:lower,standardSaveSha256:hash(source),lowSaveSha256:hash(saved),
    checked:['both preset resources pinned','same physical slot and approach','actual active references','old exact-origin reader refuses adaptation',
      'busy slot refuses change','ordinary skin swap refuses functional change','unknown preset refused','mismatched saved references refused',
      'missing inactive dependency refused','moved base refused by reviewed handoff','switch back and full save reload',
      'asset load failure and a lease acquired during preload preserve the old scene and save','render session switch and restore']});
}
report.status='passed';
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,rooms:report.rooms.map(r=>r.key),out}));

const assert=require('node:assert/strict');
const test=require('node:test');
const {check}=require('./qa-record-disposal.cjs');
const observed=require('../evidence/m2-role-disposal-v1/before/report.json');
const records=require('../evidence/m2-uniform-lite-glasses-game-v1/signed-pair.json');

test('the recorded public removal reproduces two face and four body notifications',()=>{
  const actual=structuredClone(observed);
  check(actual,records);
  assert.deepEqual(actual.targets.map(x=>x.notifications),[2,4]);
  actual.mode='after';
  for(const row of actual.resources) if(row.kind==='texture') row.events=row.events.slice(0,1);
  assert.throws(()=>check(actual,records),/Repeated material/);
});

test('the after check needs one notification per owned material and uninterrupted survivor draws',()=>{
  const fixture=structuredClone(observed);
  fixture.mode='after';
  for(const row of fixture.resources) row.events=row.events.slice(0,1);
  check(fixture,records);
  const lost=structuredClone(fixture);
  lost.resources.find(r=>r.kind==='material').events=[];
  assert.throws(()=>check(lost,records),/Missing material release/);
  const duplicate=structuredClone(fixture);
  const texture=duplicate.resources.find(r=>r.kind==='texture');
  texture.events.push({...texture.events[0]});
  assert.throws(()=>check(duplicate,records),/Repeated texture/);
  const early=structuredClone(fixture);
  early.resources.find(r=>r.refs[0].actor===records[0].identity.id).events.push({stage:'remove-male'});
  assert.throws(()=>check(early,records),/Survivor resource disposed/);
  fixture.one.draws=fixture.one.draws.filter(r=>r.part!=='glasses');
  assert.throws(()=>check(fixture,records),assert.AssertionError);
});

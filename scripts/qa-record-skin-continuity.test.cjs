const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {productionRoot,projectOutput} = require('./project-output.cjs');
const {pairedRecords,checkWarm} = require('./qa-record-skin-continuity.cjs');

test('both surface and shade must change on both skin materials with identical pixels',()=>{
  const original={skin:{}}, warm={skin:{}};
  const ratios=[221,197,180].map(n=>((n/255+.055)/1.055)**2.4);
  for (const part of ['Face','Body']) {
    original.skin[part]={map:'pixels',shadeMap:'shade-pixels',color:[1,1,1],shade:[0.93,0.63,0.72]};
    warm.skin[part]={...original.skin[part],color:ratios,shade:original.skin[part].shade.map((n,i)=>n*ratios[i])};
  }
  checkWarm(original,warm);
  for (const part of ['Face','Body']) for (const field of ['color','shade','map','shadeMap']) {
    const broken=structuredClone(warm);
    broken.skin[part][field]=field.endsWith('ap')?'wrong-pixels':original.skin[part][field];
    assert.throws(()=>checkWarm(original,broken));
  }
});

test('the CLI resolves output before record input, and can retry from another checkout directory',async()=>{
  const root=await productionRoot();
  const scratch=await fs.mkdtemp(await projectOutput(path.join(root,'experiments','qa-skin-test-'),root));
  const fixture=path.join(scratch,'input'), link=path.join(scratch,'other-volume-root'), output=path.join(scratch,'diagnosis');
  const outside=path.join(path.dirname(root),'outside-skin-room-regression');
  await fs.mkdir(fixture);
  try {
    const init=spawnSync('git',['init','--quiet'],{cwd:fixture,encoding:'utf8',windowsHide:true});
    assert.equal(init.status,0,init.stderr);
    const args=['http://127.0.0.1','0123456789ab','records.json'];
    const cli=where=>spawnSync(process.execPath,[path.join(__dirname,'qa-record-skin-continuity.cjs'),...args,where],
      {cwd:fixture,encoding:'utf8',windowsHide:true,timeout:10000});
    await fs.symlink(path.dirname(root),link,process.platform==='win32'?'junction':'dir');
    for (const escaped of [outside,path.relative(fixture,outside),path.join(link,path.basename(outside))]) {
      const result=cli(escaped);
      assert.equal(result.status,1);
      assert.match(result.stderr,/inside the project/);
    }
    const first=cli(output);
    assert.equal(first.status,1);
    assert.match(first.stderr,/ENOENT.*records.json/);
    assert.match(JSON.parse(await fs.readFile(path.join(output,'report.json'),'utf8')).failure,/records.json/);
    const bob=JSON.parse(await fs.readFile(path.join(root,'evidence/m2-uniform-lite-head-intake-v1/bob-record.json'),'utf8'));
    const warm=structuredClone(bob);
    warm.identity.id='qa-skin-test';
    warm.appearanceRecipe.appearance.skinTone='warm';
    assert.equal(pairedRecords([warm,bob]).original,bob);
    warm.appearanceRecipe.appearance.eyeColor='original';
    await fs.writeFile(path.join(fixture,'records.json'),JSON.stringify([warm,bob]));
    const retry=cli(path.join(scratch,'retry'));
    assert.equal(retry.status,1);
    assert.match(retry.stderr,/brown/);
  } finally {
    await fs.unlink(link).catch(e=>{if(e.code!=='ENOENT')throw e;});
    assert.equal(await projectOutput(scratch,root),scratch);
    await fs.rm(scratch,{recursive:true});
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot,projectOutput} = require('../project-output.cjs');
const {assertOverlayDist, isShapeDataPath, verifiedShapeOverlay} = require('./shape-overlay.cjs');

test('frozen paths permit addition and byte-identical sharing, and preserve original bytes after a conflict', async t => {
  const project = await productionRoot();
  const parent = await projectOutput(path.join(project,'output','shape-overlay-tests'),project);
  await fs.mkdir(parent,{recursive:true});
  const work = await fs.mkdtemp(path.join(parent,'paths-'));
  t.after(()=>fs.rm(work,{recursive:true,force:true}));
  const dist = path.join(work,'dist');
  const role = 'rule-body-12345678901234567890';
  const relative = 'assets/'+role+'/equipment.json';
  const bodyDir = path.join(dist,'assets',role);
  await fs.mkdir(bodyDir,{recursive:true});
  const file = path.join(bodyDir,'equipment.json');
  const input = new Map([[relative,Buffer.from('original')]]);
  await assertOverlayDist(input,dist);
  await assert.rejects(fs.stat(file),{code:'ENOENT'});
  await fs.writeFile(file,'original');
  await assertOverlayDist(input,dist);
  await assert.rejects(assertOverlayDist(new Map([[relative,Buffer.from('modified')]]),dist),/conflict/);
  assert.equal(await fs.readFile(file,'utf8'),'original');
  await fs.rename(file,path.join(bodyDir,'EQUIPMENT.JSON'));
  await assert.rejects(assertOverlayDist(input,dist),/Case conflict/);
  const linked = path.join(work,'linked');
  await fs.mkdir(linked);
  await fs.symlink(path.join(dist,'assets'),path.join(linked,'assets'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(assertOverlayDist(input,linked),/Linked path/);
});

test('only the versioned data and three garment routes may overlay a build',async()=>{
  for (const route of ['assets/script.js','records/manifest.json','../records/rule-body-data.json',
    'character-data/RULE-BODY-12345678901234567890/index.json','assets/raw-male-equipment-v1/unknown.glb'])
    assert.equal(isShapeDataPath(route),false,route);
  assert.equal((await verifiedShapeOverlay([])).files.size,0);
  await assert.rejects(verifiedShapeOverlay(Array(5).fill('.')),/at most four/);
});

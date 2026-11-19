const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');
const {productionRoot, projectOutput} = require('./project-output.cjs');

const scripts = ['qa-character-production.cjs', 'qa-production-media.cjs',
  'qa-character-cross-body.cjs', 'qa-character-record-ui.cjs'];

test('character QA validates the output before writes or browser startup and can retry in the project', async t => {
  const root = await productionRoot();
  const fixture = await fs.mkdtemp(await projectOutput(path.join(root,'experiments','qa-character-output-'),root));
  const preload = path.join(fixture,'browser.cjs'), alias = path.join(fixture,'drive-root');
  const marker = path.join(fixture,'effects.txt');
  t.after(async () => {
    await fs.unlink(alias).catch(error=>{if(error.code!=='ENOENT')throw error;});
    assert.equal(await projectOutput(fixture,root),fixture);
    await fs.rm(fixture,{recursive:true});
  });
  const driveRoot = path.parse(root).root;
  await fs.symlink(driveRoot,alias,process.platform==='win32'?'junction':'dir');
  await fs.writeFile(preload, `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const mark = value => fs.appendFileSync(process.env.CHARACTER_OUT_MARKER,value+'\\n');
const phase = process.env.CHARACTER_OUT_PHASE;
if (phase==='reject') {
  for (const name of ['mkdir','mkdtemp','copyFile','writeFile']) fsp[name]=()=>{
    mark(name);
    throw Error('Unexpected filesystem effect: '+name);
  };
}
globalThis.fetch = async () => ({json:async()=>({shortId:'fixture'})});
const load = Module._load;
Module._load = function(name,...args) {
  if (name!=='../prototype/node_modules/playwright') return load.call(this,name,...args);
  mark('playwright');
  return {chromium:{async launch(options) {
    const scratch=os.tmpdir();
    assert.equal(path.dirname(scratch),process.env.CHARACTER_OUT_DEST);
    assert.equal(options.channel,'chrome');
    assert.equal(options.headless,true);
    assert.equal(options.downloadsPath,scratch);
    assert.equal(options.tracesDir,scratch);
    fs.writeFileSync(path.join(scratch,'browser.tmp'),'CPU fixture');
    mark('launch');
    if (phase==='launch') throw Error('simulated launch failure');
    const page={on(){},context:()=>context,async screenshot(){},async goto(){
      mark('navigation');
      throw Error('simulated navigation failure');
    }};
    const context={async newPage(){return page;},async close(){}};
    return {newPage:context.newPage,async newContext(){return context;},async close(){mark('close');}};
  }}};
};
`);
  async function invoke(script,destination,phase,expectedOut='') {
    await fs.writeFile(marker,'');
    const result=spawnSync(process.execPath,['--require',preload,path.join(__dirname,script),'http://127.0.0.1:1/',destination],{
      cwd:root,encoding:'utf8',windowsHide:true,timeout:15000,
      env:{...process.env,CHARACTER_OUT_MARKER:marker,CHARACTER_OUT_PHASE:phase,CHARACTER_OUT_DEST:expectedOut},
    });
    assert.equal(result.status,1,result.error?.message??result.stderr);
    return {result,effects:(await fs.readFile(marker,'utf8')).trim().split('\n').filter(Boolean)};
  }
  for (const script of scripts) {
    for (const destination of [driveRoot,path.relative(root,driveRoot),alias]) {
      const {result,effects}=await invoke(script,destination,'reject');
      assert.match(result.stderr,/Production output must be inside the project/,script);
      assert.deepEqual(effects,[],script);
    }
    for (const phase of ['launch','retry']) {
      const out=path.join(fixture,script.replace('.cjs','')+'-'+phase);
      const {effects}=await invoke(script,phase==='retry'?path.relative(root,out):out,phase,out);
      const expected=phase==='retry'?['playwright','launch','navigation','close']:['playwright','launch'];
      assert.deepEqual(effects,expected,script);
      const report=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));
      assert.match(report.failure,phase==='retry'?/simulated navigation failure/:/simulated launch failure/,script);
      assert.deepEqual((await fs.readdir(out)).sort(),['executed-script.cjs','report.json'],script);
    }
  }
});

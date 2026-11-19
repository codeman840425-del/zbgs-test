const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {spawnSync} = require('node:child_process');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {browserConfigArgs} = require('./qa-browser-config-args.cjs');

test('browser config consumes one path and preserves the other entry options', () => {
  const original = ['--published', 'digest', 'old.json'];
  assert.deepEqual(browserConfigArgs(original), {remaining: original, launchOptions: {channel: 'chrome'}});
  assert.deepEqual(browserConfigArgs(['--published', '--browser-config', 'profile with spaces.json', 'digest', 'old.json']),
    {remaining: original, launchOptions: {browserConfig: 'profile with spaces.json'}});
  for (const args of [['--browser-config'], ['--browser-config', '--published'],
    ['--browser-config', 'first.json', '--browser-config', 'second.json']]) {
    assert.throws(() => browserConfigArgs(args), /Expected one --browser-config PATH/);
  }
});

test('the real cold and guard entry points pass launch options and put raw video in browser scratch', async t => {
  const root = await productionRoot();
  const prefix = await projectOutput(path.join(root, 'experiments', 'browser-config-entry-'), root);
  const area = await fs.mkdtemp(prefix);
  t.after(async () => {
    assert.equal(await projectOutput(area, root), area);
    await fs.rm(area, {recursive: true});
  });
  const evidence = path.join(root, 'evidence/m2-first-rule-delivery-v1');
  const signed = path.join(evidence, 'game/signed.json');
  const inventory = path.join(evidence, 'build/inventory.json');
  const inventorySha = createHash('sha256').update(await fs.readFile(inventory)).digest('hex');
  const original = path.join(area, 'one-signed.json');
  await fs.writeFile(original, JSON.stringify(JSON.parse(await fs.readFile(signed))[0]));

  const preload = path.join(area, 'no-browser.cjs');
  await fs.writeFile(preload, `
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {projectOutput}=require(${JSON.stringify(path.join(root, 'scripts/project-output.cjs'))});
const root=${JSON.stringify(root)}, recordsPath=${JSON.stringify(signed)}, packagePath=${JSON.stringify(inventory)};
function mock(file, exports) { require.cache[require.resolve(path.join(root,'scripts',file))]={exports,loaded:true}; }
async function packageData() { return JSON.parse(await fs.readFile(packagePath)); }
global.fetch=async url=>{
  assert.equal(new URL(url).pathname,'/runtime-package.json');
  return new Response(await fs.readFile(packagePath));
};
const {measureAttempts}=require(path.join(root,'scripts','qa-cold-assets.cjs'));
let launches=0;
mock('qa-cold-assets.cjs',{measureAttempts,observeNetwork:async()=>({stage(){},diagnostics:()=>({}),async readAttempts(url) {
  const bytes=await fs.readFile(path.join(root,'prototype/public',new URL(url).pathname));
  const successful={status:200,bytes,transferBytes:bytes.length};
  if(process.env.QA_BROWSER_ENTRY_PHASE==='network-error' && launches===1 && url.includes('rule-body-0beabf44f27c0618b0ff/body.vrm'))
    return [{requestId:'fixture-aborted',error:'Network.loadingFailed: net::ERR_ABORTED',kind:'network-or-integrity-failed',
      lifecycle:[{event:'fail',canceled:true}]},successful];
  return [successful];
}})});
mock('qa-browser-workspace.cjs',{launchQABrowser:async(out, options)=>{
  assert.deepEqual(options, JSON.parse(process.env.QA_EXPECTED_BROWSER_OPTIONS));
  const phase=launches++;
  const scratch=await fs.mkdtemp(await projectOutput(path.join(out,'.browser-'),root));
  return {scratch,receipt:options.browserConfig?{selection:'fixture-executable'}:undefined,async close(){
    assert.equal(await projectOutput(scratch,root),scratch);
    await fs.rm(scratch,{recursive:true});
  }, browser:{version:()=> 'fixture-browser',async newContext(options) {
    const scenario=process.env.QA_BROWSER_ENTRY_PHASE;
    if (scenario==='launch') throw new Error('launch options reached the stub');
    if (phase===1) {
      assert.equal(options.recordVideo.dir,scratch);
      assert.notEqual(options.recordVideo.dir,out);
      if (scenario==='video') throw new Error('cold video reached browser scratch');
    }
    if (phase===0) assert.equal(options.recordVideo,undefined);
    const records=JSON.parse(await fs.readFile(recordsPath)), pack=await packageData();
    const actors=records.map(record=>{
      const {base,equipment}=record.appearanceRecipe;
      const selected=Object.values(equipment.resources).map(item=>({...item,
        url:new URL(item.url,new URL(equipment.manifestUrl,'http://127.0.0.1/')).pathname}));
      return {id:record.identity.id,recordSha256:record.integrity.recordSha256,attached:true,
        root:'root-'+phase+'-'+record.identity.id,skeletonHead:'head-'+phase+'-'+record.identity.id,
        bodyType:base.bodyType,bodySha256:scenario==='runtime-error'?'unexpected-body-hash':base.sha256,
        bodyUrl:record.provenance.sourceRefs[0].path,
        manifestUrl:equipment.manifestUrl,selected,visible:selected.map(item=>item.id).sort(),
        restored:record.appearanceRecipe};
    });
    const page={on(){},async goto(){},async waitForFunction(){},locator:()=>({async screenshot(){}}),video:()=>null,
      async evaluate(fn,id) {
        const code=fn.toString();
        if(fn.name==='actorState')return actors;
        if(fn.name==='wave')return {id,gesture:{sha256:'eec4ef8ab2fb073f7674cc6e839cbad7aea6931e4b19e8e70c0ee46c5fda2d06'},
          maximumWeight:1,drawFrames:10,peakWristDisplacementM:0.09};
        if(code.includes('.buildInfo.sourceDigest'))return pack.runtime.sourceDigest;
        if(code.includes('.records'))return records;
        if(code.includes('.snapshot()'))return records.map(record=>[record.identity.id,'completed']);
        if(code.includes('.errors'))return [];
        throw Error('Unexpected CPU fixture evaluate: '+code);
      }};
    return {newPage:async()=>page,async close(){}};
  }}};
}});
`);

  const base = 'http://127.0.0.1/';
  const config = 'config with spaces.json';
  const explicit = {browserConfig: config};
  const legacy = {channel: 'chrome'};
  const cold = path.join(evidence, 'game/check-cold.cjs');
  const guards = path.join(root, 'scripts/qa-production-outfit-selection-guards.cjs');
  const guardArgs = (out, ...options) => [guards, base, out, signed, '9ce414f65f55', ...options];
  const coldArgs = (out, ...options) => [cold, base, inventorySha, signed, out, ...options];
  for (const [name, options, phase, buildArgs] of [
    ['cold-legacy', legacy, 'launch', coldArgs],
    ['cold-published', explicit, 'launch', out => coldArgs(out, '--published', 'a'.repeat(64), '--browser-config', config, original)],
    ['cold-video', explicit, 'video', out => coldArgs(out, '--browser-config', config)],
    ['cold-network-failure', explicit, 'network-error', out => coldArgs(out, '--browser-config', config)],
    ['cold-wrong-actor', explicit, 'runtime-error', out => coldArgs(out, '--browser-config', config)],
    ['guard-legacy', legacy, 'launch', out => guardArgs(out, '--default-top', '--rule-body-data')],
    ['guard-custom', explicit, 'launch', out => guardArgs(out, '--default-top', '--browser-config', config, '--rule-body-data')],
  ]) {
    const out = path.join(area, name);
    const result = spawnSync(process.execPath, ['--require', preload, ...buildArgs(out)], {
      cwd: path.parse(root).root, encoding: 'utf8', windowsHide: true, timeout: 20000,
      env: {...process.env, QA_EXPECTED_BROWSER_OPTIONS: JSON.stringify(options), QA_BROWSER_ENTRY_PHASE: phase},
    });
    assert.equal(result.status, 1, result.error?.message ?? result.stderr);
    const report = JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8'));
    if (phase==='network-error') {
      assert.equal(report.coldOpenStatus,'passed');
      assert.equal(report.networkIntegrityStatus,'failed');
      assert.equal(report.status,'failed');
      assert.deepEqual(report.sessions.map(row=>row.coldOpenStatus),['passed','passed']);
      assert.equal(report.sessions[0].networkIntegrityFailures[0].requestId,'fixture-aborted');
    } else if (phase==='runtime-error') {
      assert.equal(report.coldOpenStatus,'incomplete');
      assert.equal(report.sessions.length,1);
      assert.match(report.failure,/unexpected-body-hash/);
    } else {
      assert.match(report.failure, phase === 'video' ? /cold video reached browser scratch/ : /launch options reached the stub/);
    }
    const receipt = report.sessions ? report.sessions.at(-1).browserLaunch : report.browserLaunch;
    assert.deepEqual(receipt, options.browserConfig ? {selection: 'fixture-executable'} : undefined);
    if (phase === 'video') assert.deepEqual(report.sessions.map(row => row.phase), ['first', 'cold']);
    assert(!(await fs.readdir(out)).some(name => name.startsWith('.browser-')));
  }
});

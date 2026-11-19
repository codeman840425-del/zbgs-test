const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {before, after, test} = require('node:test');
const {productionRoot, projectOutput} = require('./project-output.cjs');

const run = promisify(execFile);
const build = '0123abcdef45';
const entries = {
  'qa-current-workbench': 'current-workbench-' + build,
  'qa-current-workbench-488': 'current-workbench-48843b9c7cc4',
  'qa-current-workbench-f7dd': 'current-workbench-f7dd1fbb4d03',
  'qa-current-workbench-a7efd': 'current-workbench-a7efd61c61c8',
  'qa-current-workbench-ab074': 'current-workbench-ab0743684fe6',
  'qa-current-shadow-entry': 'current-workbench-34e7745e78ab',
  'qa-body-context-public': 'current-workbench-460b72813f68',
  'qa-aa6-network-source': 'background-aa6fc6159e2d-v1/network-source',
  'qa-background-aa6': 'background-aa6fc6159e2d-v1',
  'qa-workbench-session': 'workbench-session-a0dd-v1',
  'qa-workbench-summary-space': 'workbench-summary-space-' + build,
};
let root, temp, preload, junction;

before(async () => {
  root = await productionRoot();
  temp = await fs.mkdtemp(await projectOutput(path.join(root,'output','archived-workbench-'), root));
  junction = path.join(temp,'redirect');
  await fs.symlink(path.parse(root).root, junction, process.platform === 'win32' ? 'junction' : 'dir');
  preload = path.join(temp,'intercept.cjs');
  await fs.writeFile(preload, `
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os'), path = require('node:path');
const Module = require('node:module');
const {ARCHIVE_MODE:mode, ARCHIVE_OUT:out, ARCHIVE_ENTRY:entry} = process.env;
// Block writes even on a regression: default and invalid-path cases never
// create a file on the drive root or change existing historical evidence.
for (const [method,index] of [['mkdir',0],['mkdtemp',0],['copyFile',1],['writeFile',0]]) {
  const original = fs[method];
  fs[method] = async (...args) => {
    const file = path.resolve(args[index]);
    if (mode === 'default') {
      assert.equal(method,'mkdir'); assert.equal(file,out);
      throw Error('observed project-bound default');
    }
    assert.notEqual(mode,'invalid','attempted write before output rejection');
    const rel = path.relative(out,file);
    assert(!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..'+path.sep), 'test write escaped: '+file);
    const value = await original(...args);
    if (mode === 'child' && method === 'copyFile')
      await fs.symlink(process.env.ARCHIVE_LINK_TARGET, path.join(out,process.env.ARCHIVE_CHILD),
        process.platform === 'win32' ? 'junction' : 'dir');
    return value;
  };
}
const load = Module._load;
Module._load = function(name,...args) {
  if (name !== '../prototype/node_modules/playwright') return load.call(this,name,...args);
  const scratch = os.tmpdir();
  assert.equal(path.dirname(scratch),out);
  const launch = async (options,profile) => {
    assert(['launch','page'].includes(mode));
    assert.equal(options.channel,'chrome');
    assert.equal(options.env.TEMP,scratch);
    assert.equal(options.env.XDG_CACHE_HOME,scratch);
    assert.equal(options.downloadsPath,scratch);
    const headed = ['qa-background-aa6','qa-aa6-network-source'].includes(entry);
    assert.equal(options.headless,!headed);
    assert.equal(profile,headed ? path.join(out,'chrome-profile') : undefined);
    if (headed) assert.deepEqual(options.viewport,{width:1440,height:900});
    if (entry === 'qa-background-aa6') {
      assert.deepEqual(options.recordVideo,{dir:path.join(out,'video'),size:{width:1440,height:900}});
      assert.deepEqual(options.ignoreDefaultArgs,['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']);
    }
    await fs.writeFile(path.join(scratch,'stub.tmp'),'temporary');
    if (mode === 'launch') throw Error('simulated Chromium launch failure');
    const fail = () => { throw Error('simulated first page failure'); };
    return {newPage:fail,newContext:fail,pages:fail,close:async()=>console.log('closed stub session')};
  };
  return {chromium:{launch:opts=>launch(opts),launchPersistentContext:(profile,opts)=>launch(opts,profile)}};
};
`);
});
after(async () => {
  if (junction) await fs.unlink(junction).catch(e=>{if(e.code!=='ENOENT')throw e;});
  if (temp) await fs.rm(await projectOutput(temp,root), {recursive:true,force:true});
});

async function cli(name, mode, out, args, cwd = temp, extra = {}) {
  const env = {...process.env, TMP:temp, TEMP:temp, TMPDIR:temp, QA_BUILD:build,
    NODE_DISABLE_COMPILE_CACHE:'1', ARCHIVE_MODE:mode, ARCHIVE_ENTRY:name, ARCHIVE_OUT:out, ...extra};
  try {
    return {code:0,...await run(process.execPath,['-r',preload,path.join(__dirname,name+'.cjs'),...args],
      {cwd,env,windowsHide:true,timeout:45000})};
  } catch (error) { return {code:error.code,stdout:error.stdout,stderr:error.stderr}; }
}

test('each actual CLI anchors defaults to the production project and rejects escaped positional outputs before any write', async () => {
  const drive = path.parse(root).root;
  for (const [name,leaf] of Object.entries(entries)) {
    const out = path.join(root,'evidence',leaf);
    const invalid = [drive,path.join(junction,'nonexistent','nested'),path.relative(temp,path.dirname(root))];
    const [defaults,...rejected] = await Promise.all([
      cli(name,'default',out,[],drive), ...invalid.map(argument=>cli(name,'invalid',temp,[argument])),
    ]);
    assert.equal(defaults.code,1,name);
    if (defaults.stderr.includes('Refuse to overwrite completed workbench evidence: ')) {
      assert(defaults.stderr.includes('Refuse to overwrite completed workbench evidence: '+path.join(out,'report.json')),name);
    } else assert.match(defaults.stderr,/observed project-bound default/,name);
    for (const check of rejected) {
      assert.equal(check.code,1,name);assert.match(check.stderr,/Production output must be inside the project/,name);
    }
  }
});

test('all historical launch modes keep scratch in the selected folder and release it on either launch or first-page failure', async () => {
  for (const name of Object.keys(entries)) {
    await Promise.all(['launch','page'].map(async mode => {
      const leaf=name+'-'+mode,out=path.join(temp,leaf);
      const check=await cli(name,mode,out,[leaf]);
      assert.equal(check.code,1,name);
      assert.match(check.stdout+check.stderr,/simulated (Chromium launch|first page) failure/,name);
      if(mode==='page')assert.match(check.stdout,/closed stub session/,name);
      assert(!(await fs.readdir(out)).some(file=>file.startsWith('.browser-')),name);
    }));
  }
});

test('reusable evidence filenames, persistent profiles and video folders reject redirects', async () => {
  for (const [name,child,reuse] of [
    ['qa-current-workbench-488','female-workbench.png',true],
    ['qa-current-workbench-f7dd','male-workbench.png',true],
    ['qa-current-workbench','executed-script.cjs',true],
    ['qa-aa6-network-source','chrome-profile',false],
    ['qa-background-aa6','video',false],
  ]) {
    const out=path.join(temp,name+'-child'),link=path.join(out,child);
    try {
      if (reuse) {
        await fs.mkdir(out);
        await fs.symlink(temp,link,process.platform==='win32'?'junction':'dir');
      }
      const check=await cli(name,reuse?'invalid':'child',out,[out],temp,{ARCHIVE_CHILD:child,ARCHIVE_LINK_TARGET:temp});
      assert.equal(check.code,1,name);
      let result=check.stdout+check.stderr;
      if (!reuse) result+=await fs.readFile(path.join(out,'report.json'),'utf8');
      assert.match(result,/Production output must be inside the project/,name);
      assert(!(await fs.readdir(out)).some(file=>file.startsWith('.browser-')),name);
    } finally {await fs.unlink(link).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  }
});

test('both historical plan-only modes work without writing or launching', async () => {
  for(const name of ['qa-current-workbench-a7efd','qa-current-shadow-entry']) {
    const result=await cli(name,'invalid',temp,['--plan']);
    assert.equal(result.code,0);
    assert.equal(JSON.parse(result.stdout).browserStarted,false);
  }
});

test('replays keep prior completed reports when the output directory is reusable', async () => {
  for (const name of ['qa-current-workbench-488','qa-current-workbench-f7dd','qa-current-workbench']) {
    const out=path.join(temp,name+'-complete'),report=path.join(out,'report.json');
    await fs.mkdir(out);await fs.writeFile(report,'previous result');
    const result=await cli(name,'invalid',out,[out]);
    assert.equal(result.code,1);assert.match(result.stderr,/Refuse to overwrite completed workbench evidence/);
    assert.equal(await fs.readFile(report,'utf8'),'previous result');
    assert.deepEqual(await fs.readdir(out),['report.json']);
  }
});

test('a caller in an existing independent checkout can select a new production output by relative path', async t => {
  const {stdout} = await run('git',['worktree','list','--porcelain','-z'],{cwd:root,windowsHide:true});
  const base = path.join(root,'experiments','worktrees');
  const candidates = stdout.split('\0').filter(line=>line.startsWith('worktree ')).map(line=>path.resolve(line.slice(9)));
  let checkout;
  for (const candidate of candidates) {
    if (path.dirname(candidate) === base && (await fs.stat(candidate).catch(()=>null))?.isDirectory()) {
      checkout=candidate;break;
    }
  }
  if (!checkout) { t.skip('No independent checkout available');return; }
  const out=path.join(temp,'cross-checkout');
  const result=await cli('qa-background-aa6','page',out,[path.relative(checkout,out)],checkout);
  assert.equal(result.code,1);
  assert.match(result.stdout,/closed stub session/);
  const report=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));
  assert.match(report.failure,/simulated first page failure/);
  assert(!(await fs.readdir(out)).some(file=>file.startsWith('.browser-')));
});

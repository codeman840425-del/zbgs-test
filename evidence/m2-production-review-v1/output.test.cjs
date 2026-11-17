const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {outputPaths} = require('../../scripts/character-production-cli.cjs');
const run = promisify(execFile);

if (process.argv[2] === '--worker') {
  const [, , , mode, request, output, evidence] = process.argv;
  const worker = require.resolve('../../scripts/character-production-browser.cjs');
  const api = require.resolve('../../prototype/node_modules/playwright');
  const digest = 'a'.repeat(64);
  const stub = {
    on() {}, async goto() {}, async waitForFunction() {},
    async evaluate(fn, arg) {
      if (arg) return {ok:true,query:{schema:'fixture'},validation:'fixture'};
      return {sourceDigest:digest,shortId:digest.slice(0,12)};
    },
  };
  const browser = {
    async newPage(){return stub;},
    async close(){
      if (mode==='close') throw Error('simulated close failure');
      if (mode==='evidence') await fs.mkdir(path.join(evidence,'report.json'));
      if (mode==='output') await fs.writeFile(output,'other writer',{flag:'wx'});
    },
  };
  require.cache[api]={exports:{chromium:{launch:async()=>browser}}};
  process.argv=[process.execPath,worker,'http://local.invalid/',request,output,digest,evidence];
  require(worker);
} else {
  const test = require('node:test');
  test('destination paths account for uncreated children under existing junctions',async t=>{
    const temp=await fs.mkdtemp(path.join(os.tmpdir(),'gamemake-paths-'));
    t.after(()=>fs.rm(temp,{recursive:true,force:true}));
    const alias=path.join(temp,'alias'),actual=path.join(temp,'actual');
    await fs.mkdir(actual);
    await fs.symlink(actual,alias,process.platform==='win32'?'junction':'dir');
    const evidence=path.join(actual,'evidence');
    const candidate=path.join(alias,process.platform==='win32'?'EVIDENCE':'evidence','sub','report.json');
    await assert.rejects(outputPaths(candidate,evidence),{code:'output-evidence-conflict'});
    await assert.rejects(outputPaths(evidence,evidence),{code:'output-evidence-conflict'});
    if(process.platform==='win32')await assert.rejects(outputPaths(path.join(actual,'evidence.','out'),evidence),/Windows/);
    assert.equal((await outputPaths(path.join(alias,'record.json'),evidence)).out,path.join(await fs.realpath(actual),'record.json'));
  });
  for(const mode of ['success','close','evidence','output']){
    test('browser command publication and single receipt: '+mode,async t=>{
      const temp=await fs.mkdtemp(path.join(os.tmpdir(),'gamemake-command-'));
      t.after(()=>fs.rm(temp,{recursive:true,force:true}));
      const request=path.join(temp,'request.json'),output=path.join(temp,'out.json'),evidence=path.join(temp,'evidence');
      await fs.writeFile(request,'{"operation":"query"}');
      const args=[__filename,'--worker',mode,request,output,evidence];
      const result=await run(process.execPath,args).then(value=>({...value,code:0}),error=>error);
      const receipts=(result.stdout+result.stderr).trim().split(/\r?\n/).map(text=>JSON.parse(text));
      assert.equal(receipts.length,1);
      assert.equal(receipts[0].ok,mode==='success');
      assert.equal(result.code,mode==='success'?0:1);
      if(mode==='success'){
        assert.deepEqual(JSON.parse(await fs.readFile(output)),{schema:'fixture'});
        assert.equal(JSON.parse(await fs.readFile(path.join(evidence,'report.json'))).status,'validated-before-publication');
      }else if(mode==='output'){
        assert.equal(await fs.readFile(output,'utf8'),'other writer');
        assert.equal(receipts[0].code,'output-conflict');
      }else{
        await assert.rejects(fs.stat(output),{code:'ENOENT'});
      }
    });
  }
}

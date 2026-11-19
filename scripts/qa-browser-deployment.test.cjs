const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs/promises');
const path=require('node:path');
const {launchQABrowser,resolveBrowserConfig}=require('./qa-browser-workspace.cjs');
const {projectOutput,productionRoot}=require('./project-output.cjs');
const profile=require('./production/fusion-cft145.json');

test('invalid executable selection fails before a browser workspace is allocated',async t=>{
  const root=await productionRoot();
  const tmp=await fs.mkdtemp(await projectOutput(path.join(root,'experiments/browser-profile-test-'),root));
  t.after(async()=>{
    assert.equal(await projectOutput(tmp,root),tmp);
    await fs.rm(tmp,{recursive:true,force:true});
  });
  const file=path.join(tmp,'config.json');
  await assert.rejects(resolveBrowserConfig(file),{code:'ENOENT'});
  for(const override of [{executablePath:process.execPath},{executableSha256:'0'.repeat(64)},
      {browserVersion:'1.2.3'},{playwrightVersion:'1.0'},{executablePath:'./chrome.exe'},{channel:'chrome'}]){
    await fs.writeFile(file,JSON.stringify({...profile,...override}));
    await assert.rejects(launchQABrowser(tmp,{browserConfig:file}),/Unapproved browser deployment/);
  }
  await assert.rejects(launchQABrowser(tmp,{browserConfig:file,channel:'chrome'}),/Conflicting browser selection/);
  assert.deepEqual(await fs.readdir(tmp),['config.json']);
});

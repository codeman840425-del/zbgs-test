// run-fixed-check.cjs GAME this.cjs ORIGINAL_SIGNED_RECORDS EVIDENCE_JSON [DEPLOYMENT_JSON]
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {observeNetwork}=require('../../scripts/qa-cold-assets.cjs');
const {productionRoot,projectOutput}=require('../../scripts/project-output.cjs');
const {launchQABrowser}=require('../../scripts/qa-browser-workspace.cjs');
async function run(base,recordsFile,output,config){
  const out=await projectOutput(output,await productionRoot());
  const records=JSON.parse(await fs.readFile(recordsFile));
  const body=records[0].appearanceRecipe.base;
  const url=new URL('/assets/'+body.bodyType+'/body.vrm',base).href;
  const game=await (await fetch(new URL('runtime-package.json',base))).json();
  const expected=game.files.find(f=>f.sha256===body.sha256 && '/'+f.path===new URL(url).pathname);
  assert(expected);
  const session=await launchQABrowser(path.dirname(out),config?{browserConfig:config}:{channel:'chrome'});
  try{
    const context=await session.browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
    const network=await observeNetwork(context,page);
    await page.goto(new URL('build-info.json',base).href);
    const report={browser:session.browser.version(),pin:expected,build:game.runtime.sourceDigest,runs:[]};
    for(const mode of ['reader','arrayBuffer','reader']){
      const observed=await page.evaluate(async ({url,mode,pin})=>{
        const response=await fetch(url,{redirect:'error',credentials:'same-origin'});
        let data,offset=0;
        if(mode==='reader'){
          data=new Uint8Array(pin.bytes);
          const reader=response.body.getReader();
          try{
            for(;;){
              const {done,value}=await reader.read();
              if(done)break;
              data.set(value,offset);offset+=value.byteLength;
            }
          }finally{reader.releaseLock();}
        }else{
          data=new Uint8Array(await response.arrayBuffer());offset=data.byteLength;
        }
        const sha=await crypto.subtle.digest('SHA-256',data);
        return {http:response.status,bytes:offset,sha256:Array.from(new Uint8Array(sha),x=>x.toString(16).padStart(2,'0')).join('')};
      },{url,mode,pin:expected});
      assert.deepEqual(observed,{http:200,bytes:expected.bytes,sha256:expected.sha256});
      const attempts=await network.readAttempts(url);
      assert.equal(attempts.length,report.runs.length+1);
      const attempt=attempts.at(-1);
      report.runs.push({mode,observed,requestId:attempt.requestId,error:attempt.error??null,
        terminal:attempt.lifecycle.filter(e=>['finish','fail'].includes(e.event)),transferBytes:attempt.transferBytes??null});
    }
    await fs.writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  }finally{await session.close();}
}
run(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});

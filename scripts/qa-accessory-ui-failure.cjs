// Real buttons, exact fixed build. Baseline records the uncaught rejection;
// repaired mode requires visible failure, no mounted asset, then a real retry.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const bodies=[
 ['m1a-jaw-v1','m1a-jaw-v1','3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011'],
 ['m1a-waisthip-v1','m1a-waisthip-v1','10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5'],
 ['male','beta-base-male-m1b','62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'],
];
(async()=>{
 const build=process.env.QA_M1_BUILD,base=process.argv[2],before=process.argv.includes('--before');
 assert(/^[a-f0-9]{12}$/.test(build||''));assert(process.env.QA_M1_RUN_ROOT);
 const out=path.resolve(process.env.QA_M1_RUN_ROOT);await fs.mkdir(out,{recursive:true});
 try{await fs.access(path.join(out,'report.json'));throw Error('Refuse overwrite')}catch(e){if(e.code!=='ENOENT')throw e}
 const report={build,before,cases:[],scope:'Actual accessory buttons: unsupported fit and network failure/retry. No animation or performance claim.'};
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const [body,id,sha]of bodies){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'?body='+body);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const row={body,identity:await verifyCandidate(page,{build,assetId:id,sha256:sha}),errors};report.cases.push(row);
  if(body==='male')await page.route('**/assets/m1c/glasses-fit/male.json',route=>route.fulfill({status:503,body:'QA explicit unavailable profile'}));
  await page.getByRole('button',{name:'装备眼镜',exact:true}).click();
  await page.waitForFunction(()=>__debug.avatar().livePresentation.getState().accessories.glasses.status==='error');
  // Allow multiple refreshUI ticks: feedback must not be erased by scene labels.
  await page.waitForTimeout(350);
  row.failure=await page.evaluate(()=>({slot:__debug.avatar().livePresentation.getState().accessories.glasses,mounted:!!__debug.scene.getObjectByName('LiveAccessory:glasses'),notice:document.querySelector('[data-accessory-status="glasses"]')?.textContent??null,sceneLabel:document.querySelector('#scene-state').textContent}));
  assert(!row.failure.mounted&&!row.failure.slot.requested&&!row.failure.slot.loaded);
  await page.screenshot({path:path.join(out,body+'-failure.png')});
  if(before){assert(errors.length>0,'Baseline must reproduce unhandled rejection');assert.equal(row.failure.notice,null)}
  else{assert.equal(errors.length,0);assert(row.failure.notice?.includes(body==='male'?'503':'适配配置'))}
  if(body==='male'){
   await page.unroute('**/assets/m1c/glasses-fit/male.json');
   await page.getByRole('button',{name:'装备眼镜',exact:true}).click();
   await page.waitForFunction(()=>__debug.avatar().livePresentation.getState().accessories.glasses.loaded);
   await page.getByRole('button',{name:'卸下眼镜',exact:true}).waitFor();
   row.retry=await page.evaluate(()=>({slot:__debug.avatar().livePresentation.getState().accessories.glasses,notice:document.querySelector('[data-accessory-status="glasses"]')?.textContent??null}));
   if(!before)assert.equal(row.retry.notice,'');
   await page.getByRole('button',{name:'卸下眼镜',exact:true}).click();
   await page.waitForFunction(()=>!__debug.avatar().livePresentation.getState().accessories.glasses.loaded);
   if(!before){
    let pendingRequests=0;
    await page.route('**/assets/m1c/glasses-fit/male.json',async route=>{
     if(++pendingRequests===1)await new Promise(resolve=>setTimeout(resolve,500));
     await route.continue().catch(()=>{}); // First fetch is intentionally aborted by the second UI click.
    });
    await page.getByRole('button',{name:'装备眼镜',exact:true}).click();
    await page.waitForFunction(()=>__debug.avatar().livePresentation.getState().accessories.glasses.status==='loading');
    await page.getByRole('button',{name:'装备眼镜',exact:true}).click();
    await page.waitForFunction(()=>__debug.avatar().livePresentation.getState().accessories.glasses.status==='off');
    await page.getByRole('button',{name:'装备眼镜',exact:true}).click();
    await page.waitForFunction(()=>__debug.avatar().livePresentation.getState().accessories.glasses.loaded);
    await page.waitForTimeout(650);
    row.rapid=await page.evaluate(()=>({slot:__debug.avatar().livePresentation.getState().accessories.glasses,notice:document.querySelector('[data-accessory-status="glasses"]').textContent,mounted:__debug.scene.children.filter(o=>o.name==='LiveAccessory:glasses').length}));
    assert(row.rapid.slot.loaded&&row.rapid.slot.requested);assert.equal(row.rapid.notice,'');
    assert.equal(errors.length,0);await page.getByRole('button',{name:'卸下眼镜',exact:true}).click();
    await page.waitForFunction(()=>!__debug.avatar().livePresentation.getState().accessories.glasses.loaded);
   }
  }
  await page.close();
 }report.status=before?'baseline-failure-reproduced':'passed';}
 catch(e){report.status='failed';report.failure=String(e);throw e}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out)}
})().catch(e=>{console.error(e);process.exitCode=1});

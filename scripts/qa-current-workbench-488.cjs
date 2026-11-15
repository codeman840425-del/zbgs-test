const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const out=path.resolve('evidence/current-workbench-48843b9c7cc4');await fs.mkdir(out,{recursive:true});
 const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage({viewport:{width:1600,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 try{
 await p.goto('http://127.0.0.1:4196/?workbench=appearance');await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields').disabled);
 const build=await p.evaluate(async()=>await(await fetch('/build-info.json')).json());if(build.shortId!=='48843b9c7cc4')throw Error('Wrong served build');
 await p.evaluate(()=>window.__sameDocument='public-workbench-488');
 const initial=await p.locator('[data-appearance-group]').evaluateAll(ns=>ns.map(n=>({name:n.textContent,pressed:n.getAttribute('aria-pressed')})));
 await p.screenshot({path:path.join(out,'female-workbench.png')});
 await p.locator('[data-appearance-group=male]').click();await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields').disabled&&__debug.avatar().profile.bodyType==='male');
 if(await p.evaluate(()=>window.__sameDocument)!=='public-workbench-488')throw Error('Page reloaded');
 const hair=await p.locator('#appearance-hair-style option').allTextContents();if(!hair.some(x=>x.includes('偏侧')))throw Error('Male hair missing');
 await p.screenshot({path:path.join(out,'male-workbench.png')});
 const tabs=[];for(const tab of ['actions','inspection','appearance']){await p.locator('[data-workbench-tab='+tab+']').click();tabs.push({tab,visible:await p.locator('[data-workbench-tab='+tab+']').getAttribute('aria-selected')});}
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({build:build.shortId,url:p.url(),initial,hair,tabs,sameDocument:true,errors,scope:'Published entry identity, separate group buttons, male options, tabs and same-document switch; no full visual acceptance'},null,2));
 console.log(JSON.stringify({build:build.shortId,errors,passed:true}));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

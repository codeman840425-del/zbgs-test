// Bounded one-browser-at-a-time candidate checks. Never starts a web server.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {expectations}=require('./qa-m1-common.cjs');
if(process.argv.includes('--help')){console.log('QA_M1_BUILD=<ID> QA_M1_ASSET_SHA=<SHA> node scripts/qa-m1-sequential.cjs <fixedURL> [--plan] [--stages=inventory,foot-lock,walk,chain,seat,interactions,response,summary]\nDefault runs those stages sequentially. Stops on first failure; never labels visual acceptance passed. QA_M1_RUN_ROOT may name a NEW evidence directory.');process.exit(0);}
(async()=>{
 const identity=expectations(),url=process.argv[2];if(!/^https?:\/\//.test(url||''))throw Error('Require explicit HTTP fixed candidate URL');
 const root=path.resolve(__dirname,'..'),runRoot=path.resolve(process.env.QA_M1_RUN_ROOT||path.join(root,'output/playwright/m1',identity.build)),runStamp=new Date().toISOString().replace(/[:.]/g,'-'),runMeta=path.join(runRoot,'runs',runStamp);
 const definitions=[
  ['inventory','qa-m1-run.cjs',[url,'inventory'],90],
  ['foot-lock','qa-m1-foot-lock.cjs',[url,path.join(runRoot,'foot-lock'),identity.build],120],
  ['walk','qa-canvas-video.cjs',[url],180],
  ['chain','qa-m1-run.cjs',[url,'chain'],240],
  ['seat','qa-m1-seat.cjs',[url],120],
  ['interactions','qa-m1-interactions.cjs',[url],120],
  ['response','qa-m1-run.cjs',[url,'response'],90],
  ['summary','qa-m1-summarize.cjs',[identity.build],30]
 ];
 const chosen=process.argv.find(x=>x.startsWith('--stages='))?.slice(9).split(',');
 if(chosen?.some(x=>!definitions.some(d=>d[0]===x)))throw Error('Unknown stage');
 const stages=definitions.filter(d=>!chosen||chosen.includes(d[0]));
 if(!stages.length)throw Error('No stages selected');
 const plan={identity,url,runRoot,stages:stages.map(([name,script,args,timeoutSeconds])=>({name,script,args,timeoutSeconds})),mode:'sequential; fail fast; no server; numeric collection is not visual acceptance'};
 if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));return;}
 await fs.mkdir(runMeta,{recursive:true});const manifest={...plan,startedAt:new Date().toISOString(),status:'running',results:[]};const save=()=>fs.writeFile(path.join(runMeta,'runner.json'),JSON.stringify(manifest,null,2));await save();
 const env={...process.env,QA_M1_BUILD:identity.build,QA_M1_ASSET_SHA:identity.sha256,QA_M1_ASSET_ID:identity.assetId,QA_M1_RUN_ROOT:runRoot,QA_M1_CONFIG:process.env.QA_M1_CONFIG||path.join(__dirname,'qa-m1-config.json')};
 // An unrelated QA_OUTDIR from a prior session must not redirect the walk evidence.
 delete env.QA_OUTDIR;
 for(const [name,script,args,timeoutSeconds]of stages){
  const result={name,startedAt:new Date().toISOString(),status:'running'};manifest.results.push(result);await save();console.log(`[M1 ${identity.build}] ${name}`);
  const child=spawn(process.execPath,[path.join(__dirname,script),...args],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='',timedOut=false;
  child.stdout.on('data',b=>{log+=b;process.stdout.write(b);});child.stderr.on('data',b=>{log+=b;process.stderr.write(b);});
  const timer=setTimeout(()=>{timedOut=true;if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGTERM');},timeoutSeconds*1000);
  const exit=await new Promise(resolve=>{child.once('error',error=>resolve({code:null,error:String(error)}));child.once('exit',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);
  Object.assign(result,exit,{timedOut,finishedAt:new Date().toISOString(),status:!timedOut&&exit.code===0?'completed':'failed'});await fs.writeFile(path.join(runMeta,`${name}.log`),log);await save();
  if(result.status==='failed'){manifest.status='failed-or-incomplete';manifest.finishedAt=new Date().toISOString();await save();throw Error(`Stopped at ${name}; evidence retained in ${runRoot}`);}
 }
 manifest.status='collection-complete-visual-review-required';manifest.finishedAt=new Date().toISOString();await save();console.log(runRoot);
})().catch(e=>{console.error(e);process.exitCode=1});

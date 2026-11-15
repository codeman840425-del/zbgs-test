// Small fixed-build dispatcher. One child/browser at a time; no persistent server.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {expectations}=require('./qa-m1-common.cjs');
(async()=>{
 const id=expectations(),url=process.argv[2];if(id.assetId!=='beta-base-female-m1')throw Error('Runner primary expectation must be baseline female');if(!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url||''))throw Error('Require run-fixed-check loopback URL');
 const definitions=[['chain','qa-m1-user-chain.cjs',[url],480],['tasks','qa-room-behavior-tasks.cjs',[url,id.build,'female'],180],['tasks-mm','qa-room-behavior-tasks.cjs',[url,id.build,'male'],180],['peer','m1c/qa-peer-ready-fixed.cjs',[url],240],['restore','qa-avatar-record-v2.cjs',[url,id.build],180],['lifecycle','qa-m1-lifecycle-fixed.cjs',[url],150],['greeting','m1c/qa-greeting-fixed.cjs',[url],360]];
 const names=process.argv.find(x=>x.startsWith('--stages='))?.slice(9).split(',')||['chain','tasks','tasks-mm','peer','restore','lifecycle'];if(names.some(x=>!definitions.some(d=>d[0]===x)))throw Error('Unknown stage');
 const stages=names.map(n=>definitions.find(d=>d[0]===n)),runRoot=path.resolve(process.env.QA_M1_RUN_ROOT||'output/playwright/m1/'+id.build+'/final-user'),plan={id,url,runRoot,stages:stages.map(([name,script,args,seconds])=>({name,script,args,seconds})),restoreCatalog:process.env.QA_RECORD_CATALOG||'schemas/fixtures/avatar-record-catalog-v2.json',limits:['Strictly serial, stops at first failure; collection never grants visual acceptance','Restore fixture must be generated from the same immutable dist and matching source tree','Lifecycle uses real headed tab hiding; no synthetic fallback']};
 if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));return;}
 const dir=path.join(runRoot,'runs',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(dir,{recursive:true});const report={...plan,status:'running',results:[]};const save=()=>fs.writeFile(path.join(dir,'runner.json'),JSON.stringify(report,null,2));await save();
 for(const [name,script,args,seconds]of stages){const result={name,started:new Date().toISOString(),status:'running'};report.results.push(result);await save();
  const child=spawn(process.execPath,[path.join(__dirname,script),...args],{cwd:path.resolve(__dirname,'..'),env:{...process.env,QA_BUILD:id.build,QA_M1_RUN_ROOT:runRoot},windowsHide:true,stdio:['ignore','pipe','pipe']});let log='',timedOut=false;child.stdout.on('data',b=>{log+=b;process.stdout.write(b);});child.stderr.on('data',b=>{log+=b;process.stderr.write(b);});
  const timer=setTimeout(()=>{timedOut=true;if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGTERM');},seconds*1000);
  const exit=await new Promise(resolve=>{child.once('error',e=>resolve({code:null,error:String(e)}));child.once('exit',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);Object.assign(result,exit,{timedOut,ended:new Date().toISOString(),status:exit.code===0&&!timedOut?'collected':'failed'});await fs.writeFile(path.join(dir,name+'.log'),log);await save();
  if(result.status==='failed'){report.status='failed-or-incomplete';await save();throw Error('Stopped at '+name+'; retained '+dir);}
 }
 report.status='collection-complete-visual-and-coverage-review-required';await save();console.log(dir);
})().catch(e=>{console.error(e);process.exitCode=1;});

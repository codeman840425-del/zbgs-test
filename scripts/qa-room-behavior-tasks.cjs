// Actual room/controller integration. Development diagnostic unless wrapped by a
// later fixed-candidate gate; pure unit results alone do not pass these checks.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');const root=path.resolve(__dirname,'..');
const {prepareOutput,verifyCandidate}=require('./qa-m1-common.cjs');
async function hashes(){const p=path.join(root,'prototype/src');return Object.fromEntries(await Promise.all((await fs.readdir(p)).filter(n=>n.endsWith('.js')).sort().map(async n=>[n,crypto.createHash('sha256').update(await fs.readFile(path.join(p,n))).digest('hex')])));}
(async()=>{const base=process.argv[2],build=process.argv[3];if(!base||!/^[a-f0-9]{12}$/.test(build||''))throw Error('Require fixed URL and build12');const expected={build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'};const out=await prepareOutput(build,'room-tasks-'+Date.now());const start=await hashes(),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await page.goto(new URL('?body=male',base).href);await page.waitForFunction(()=>window.__debug?.ready,{timeout:60000});const initialGate=await verifyCandidate(page,expected);
 const report=await page.evaluate(async()=>{
  const d=__debug,c=d.game.scene.getScene('CharacterStudio'),checks=[],records=[],terminal=new Set(['completed','cancelled','failed']);
  const check=(name,ok,details=null)=>checks.push({name,passed:!!ok,details});
  d.reset();d.setPaused(true);d.setDynamics(false);d.setOutfit(0);let peer=await d.loadComparison('female');peer.avatar.setDynamics(false);peer.avatar.setOutfit(0);
  const tick=()=>c.simulate(1/120),until=(fn,max=3600)=>{let n=0;for(;n<max&&!fn();n++)tick();return {ticks:n,reached:fn()};};
  const lease=()=>d.seatLeases.forSeat('room-chair-1');
  const state=label=>({label,primary:{mode:c.mode,position:d.avatar().root.position.toArray(),sit:d.motion().getMetrics().sitProgress,active:d.tasks().active(),token:c.seatToken},peer:peer?{mode:peer.controller.mode,position:peer.avatar.root.position.toArray(),sit:peer.motion.getMetrics().sitProgress,active:peer.tasks.active(),token:peer.controller.seatToken}:null,lease:lease()});
  const done=(tasks,id)=>terminal.has(tasks.get(id)?.state);
  check('different-body config references independent',d.avatar().config!==peer.avatar.config);
  const submissions=[d.request({requestId:'chain-walk',kind:'walk',payload:{x:0,z:1.2}}),d.request({requestId:'chain-dance',kind:'dance',payload:{durationSeconds:.5},queue:true}),d.request({requestId:'chain-sit',kind:'sit',queue:true})];
  check('chain admits accepted then queued',submissions.map(x=>x.admission).join(',')==='accepted,queued,queued',submissions);
  const chainWait=until(()=>done(d.tasks(),'chain-sit'));records.push(state('chain-end'));
  check('walk dance sit complete via actual controller',chainWait.reached&&['chain-walk','chain-dance','chain-sit'].every(id=>d.tasks().get(id)?.state==='completed'),['chain-walk','chain-dance','chain-sit'].map(id=>d.tasks().get(id)));
  check('completed sitting retains occupied chair',lease()?.state==='occupied'&&lease()?.ownerId===c.actorId,lease());
  const competitor=peer.request({requestId:'competition',kind:'sit'});for(let i=0;i<20;i++)tick();
  check('same chair competition fails execution without stealing',peer.tasks.get('competition')?.state==='failed'&&peer.tasks.get('competition')?.reason==='seat-unavailable'&&lease()?.ownerId===c.actorId,{competitor,result:peer.tasks.get('competition'),lease:lease()});
  peer.request({requestId:'competition',kind:'sit'});check('repeated failed request produces one terminal',peer.tasks.history().filter(e=>e.task.requestId==='competition'&&terminal.has(e.type)).length===1);
  const stand=d.request({requestId:'chain-stand',kind:'stand'});tick();check('stand command does not release while pelvis seated',d.motion().getMetrics().sitProgress>0&&lease()?.state==='exiting',state('early-stand'));
  const standWait=until(()=>done(d.tasks(),'chain-stand')&&!lease());check('actual standing/exiting releases seat',standWait.reached&&d.tasks().get('chain-stand')?.state==='completed',{stand,wait:standWait,state:state('stand-done')});
  d.reset();d.setPaused(true);d.request({requestId:'cancel-approach',kind:'sit'});check('approach holds reservation',lease()?.state==='reserved',lease());d.tasks().cancel('cancel-approach','test-cancel');
  check('cancel approach releases reservation',!lease()&&d.tasks().get('cancel-approach')?.state==='cancelled',state('cancel-approach'));
  peer.request({requestId:'peer-sit',kind:'sit'});const peerWait=until(()=>done(peer.tasks,'peer-sit'));check('peer full controller can sit',peerWait.reached&&peer.tasks.get('peer-sit')?.state==='completed'&&lease()?.ownerId===peer.controller.actorId,state('peer-seated'));
  const removed=peer,removedRoot=peer.avatar.root;d.removeComparison();peer=null;check('destroying seated peer releases and detaches',!lease()&&!removedRoot.parent&&removed.tasks.diagnostics().disposed);
  d.reset();d.setPaused(true);d.request({requestId:'cancel-mid-sit',kind:'sit'});const halfway=until(()=>c.mode==='sit'&&d.motion().getMetrics().sitProgress>.25);
  check('reached actual seated transition for cancellation',halfway.reached,state('mid-sit'));d.tasks().cancel('cancel-mid-sit','test-mid-sit');tick();
  check('occupied cancellation keeps lease through rising',d.motion().getMetrics().sitProgress>0&&lease()?.state==='exiting',state('mid-sit-cancelled'));
  const exit=until(()=>c.mode==='idle'&&!lease());check('cancelled sit actually exits and releases',exit.reached,state('cancel-exited'));
  d.reset();d.setPaused(true);d.request({requestId:'timeout-sit',kind:'sit',timeoutSeconds:.2});const before=d.tasks().get('timeout-sit');
  // No simulation advance: repeated observations cannot consume timeout.
  for(let i=0;i<100;i++)d.tasks().get('timeout-sit');check('no wall-clock timeout in paused observation',d.tasks().get('timeout-sit').state===before.state);
  until(()=>done(d.tasks(),'timeout-sit'),120);check('simulation timeout terminates and releases approach',d.tasks().get('timeout-sit')?.reason==='timeout'&&!lease(),d.tasks().get('timeout-sit'));
  d.request({requestId:'bad-kind',kind:'not-a-behavior'});check('unsupported behavior fails once',d.tasks().get('bad-kind')?.state==='failed',d.tasks().get('bad-kind'));
  const history=d.tasks().history(),counts={};for(const e of history)if(terminal.has(e.type))counts[e.task.requestId]=(counts[e.task.requestId]??0)+1;
  check('all observed task terminal events exactly once',Object.values(counts).every(n=>n===1),counts);
  return {checks,records,history,leaseHistory:d.seatLeases.history(),primaryProfile:d.avatar().profile,buildInfo:d.buildInfo,limitations:['Actual fixed controller and primary asset checked before/after; default chair only','Deterministic120Hz simulation; not performance or full visual task-chain video','Only two actors; entity collisions and production server task orchestration not validated']};
 });
 const end=await hashes();Object.assign(report,{initialGate,finalGate:await verifyCandidate(page,expected),start,end,sourceUnchanged:JSON.stringify(start)===JSON.stringify(end),errors});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);console.log(JSON.stringify(report.checks.map(c=>({name:c.name,passed:c.passed}))));if(errors.length||report.checks.some(c=>!c.passed))throw Error('Room task integration check failed; inspect report');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

// Offline numeric gates for qa-turn-contact-chain.cjs output. No browser here.
// Original qa-turn-chain diagnostics and their historical evidence stay intact.
const fs=require('node:fs'),path=require('node:path');
const LIMITS={supportResidual:.03,contactTravel:.015,contactWorldDrift:.03,anchorWorldDrift:.03,continuousClampSeconds:.1,ankleStep120Hz:.06,targetStep120Hz:.06,soleFloor:-.006,resetTargetToAnkle:.03,resetSupportToAnchor:.03,resetAnkleFromRoot:1.2};
const dir=process.argv[2];if(!dir){console.log('Usage: node scripts/qa-turn-regression.cjs <turn-contact-chain-output>');process.exit(2);}
const parent=JSON.parse(fs.readFileSync(path.join(dir,'report.json'))),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
if(parent.spec?.captureSchema!=='actual-skin-toe-contact-v1')throw Error('Actual skin capture schema required; old ankle-only diagnostics cannot pass this gate');
const report={build:parent.build,spec:parent.spec,initialGate:parent.initialGate,finalGate:parent.finalGate,scope:'Actual fixed room numeric capture; offline contact gates, not normal-speed video or device performance',limits:LIMITS,scenarios:[],passed:false};
for(const batch of parent.results){const data=JSON.parse(fs.readFileSync(path.join(dir,batch.file)));if(data.captureSchema!==parent.spec.captureSchema)throw Error('Mixed capture schema');for(const scenario of data.results){
 const failures=[],max={supportResidual:0,contactTravel:0,contactWorldDrift:0,anchorWorldDrift:0,continuousClampSeconds:0,ankleStep120Hz:0,targetStep120Hz:0,residualAbove6mmSeconds:0},residualAge=[0,0],clampAge=[0,0],stances=[null,null];let previous=null,minSole=Infinity;
 function fail(kind,value,row,side){if(failures.filter(f=>f.kind===kind&&f.side===side).length<3)failures.push({kind,value,side,t:row?.t,phase:row?.phase,mode:row?.mode,stepId:row?.planner?.stepId,progress:row?.planner?.progress});}
 function resetCheck(receipt,label){if(!receipt?.after)throw Error('Missing actual reset spatial receipt');const s=receipt.after;if(s.planner.active)fail('reset-active-planner',true,null,label);for(const f of s.feet){const support=['toe','heel'].includes(f.contactPoint)?f.soles[f.contactPoint]:f.raw;for(const [kind,value]of Object.entries({resetTargetToAnkle:distance(f.target,f.raw),resetSupportToAnchor:distance(support,f.supportAnchor),resetAnkleFromRoot:distance(f.raw,s.position)}))if(!Number.isFinite(value)||value>LIMITS[kind])fail(kind,value,null,label+':'+f.side);}}
 resetCheck(scenario.resetReceipt,'setup-reset');if(scenario.postTurnReset)resetCheck(scenario.postTurnReset,'post-turn-reset');
 for(const row of scenario.rows){if(!(row.dt>0&&row.dt<=1/120+1e-9))throw Error('Expected actual <=120Hz substeps');for(let i=0;i<row.feet.length;i++){
  const f=row.feet[i],p=previous?.feet[i],skin=['toe','heel'].includes(f.contactPoint),support=skin?f.soles[f.contactPoint]:f.raw;
  if(![...f.raw,...f.target,...f.supportAnchor,...f.soles.toe,...f.soles.heel].every(Number.isFinite)){fail('nonfinite',null,row,f.side);continue;}
  const residual=f.contact?distance(support,f.supportAnchor):0;residualAge[i]=f.contact&&residual>.006?residualAge[i]+row.dt:0;clampAge[i]=f.reachClamp?clampAge[i]+row.dt:0;
  const contiguous=f.contact&&p?.contact&&p.contactPoint===f.contactPoint;
  if(!contiguous)stances[i]=f.contact?{anchor:f.supportAnchor.slice(),support:support.slice()}:null;
  // Never restart a stance just because its anchor moved: that would hide slip.
  const anchorDrift=f.contact&&stances[i]?horizontal(f.supportAnchor,stances[i].anchor):0,worldDrift=f.contact&&stances[i]?horizontal(support,stances[i].support):0;
  const values={supportResidual:residual,contactTravel:contiguous?distance(support,skin?p.soles[f.contactPoint]:p.raw):0,contactWorldDrift:worldDrift,anchorWorldDrift:anchorDrift,continuousClampSeconds:clampAge[i],ankleStep120Hz:p?distance(f.raw,p.raw):0,targetStep120Hz:p?distance(f.target,p.target):0};
  for(const [kind,value]of Object.entries(values)){max[kind]=Math.max(max[kind],value);if(value>LIMITS[kind])fail(kind,value,row,f.side);}max.residualAbove6mmSeconds=Math.max(max.residualAbove6mmSeconds,residualAge[i]);
  const floor=Math.min(f.soles.toe[1],f.soles.heel[1]);minSole=Math.min(minSole,floor);if(floor<LIMITS.soleFloor)fail('soleFloor',floor,row,f.side);
 }previous=row;}
 failures.push(...scenario.failures);report.scenarios.push({name:scenario.name,fps:batch.fps,samples:scenario.rows.length,max,minSole,failures,passed:failures.length===0});
}}
report.passed=parent.passed&&report.scenarios.length>0&&report.scenarios.every(x=>x.passed);
report.limitsExplanation=['30mm support/stance,15mm frame contact travel,60mm ankle/target step at120Hz,100ms continuous reach clamp and -6mm floor reuse the existing locomotion gate; no relaxation for turns','Support is the actual calibrated raw skin heel/toe point, never whole-shoe yaw lock','Residual above6mm duration is retained as diagnostic without an invented new pass threshold; any >30mm sample already fails','Reset checks compare actual post-reset ankle/target/support; 1.2m root bound is a loose stale-world-anchor detector for these measured under2m adult candidates, not universal anthropometry','Same contact-kind stance persists across planner step IDs and anchor motion; actual swing/contact-kind changes alone start a new stance'];
const out=path.join(dir,'contact-regression.json');fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out,passed:report.passed,scenarios:report.scenarios.map(({failures,...x})=>({...x,failureKinds:[...new Set(failures.map(f=>f.kind))]}))},null,2));if(!report.passed)process.exitCode=1;

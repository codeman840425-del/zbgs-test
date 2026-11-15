const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(process.argv[2]),read=m=>JSON.parse(fs.readFileSync(path.join(root,'joint-source-pose-'+m,'authored.json'))),a=read('legacy'),b=read('actual');
assert.equal(a.frames.length,270);assert.equal(b.frames.length,270);assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
assert.equal(a.identity.runtimeBuild.sourceDigest,b.identity.runtimeBuild.sourceDigest);assert.equal(a.identity.primary.actualSha256,b.identity.primary.actualSha256);
let maxFingerComponent=0,maxSourceWristDelta=0,maxTargetWristDifference=0,maxActualWristDifference=0,maxElbowDifference=0,maxCorrection=0;
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
for(let i=0;i<270;i++){
 const f=a.frames[i],g=b.frames[i];
 for(const n of Object.keys(f.fingerPose))for(const space of ['normalized','raw'])for(let k=0;k<4;k++)maxFingerComponent=Math.max(maxFingerComponent,Math.abs(f.fingerPose[n][space][k]-g.fingerPose[n][space][k]));
 for(let j=0;j<f.handContacts.length;j++){const x=f.handContacts[j],y=g.handContacts[j];maxSourceWristDelta=Math.max(maxSourceWristDelta,distance(x.authoredWrist,y.authoredWrist));maxTargetWristDifference=Math.max(maxTargetWristDifference,distance(x.target,y.target));maxActualWristDifference=Math.max(maxActualWristDifference,distance(x.finalWrist,y.finalWrist));maxElbowDifference=Math.max(maxElbowDifference,distance(x.finalElbow,y.finalElbow));maxCorrection=Math.max(maxCorrection,distance(y.finalWrist,y.authoredWrist));}
}
assert(maxFingerComponent<1e-12,'Source finger rotations changed');assert(maxSourceWristDelta<1e-12,'Source authored wrist changed');
const result={build:a.identity.runtimeBuild.shortId,passed:true,frames:270,maxFingerQuaternionComponentDifference:maxFingerComponent,maxAuthoredWristDeltaM:maxSourceWristDelta,maxTargetWristDifferenceM:maxTargetWristDifference,maxActualWristDifferenceM:maxActualWristDifference,maxElbowDifferenceM:maxElbowDifference,maxJointCorrectionFromAuthoredWristM:maxCorrection,scope:'Source pose channels preserved, actual corrections intentionally differ; no visual/performance pass implied'};
fs.writeFileSync(path.join(root,'joint-source-pose-report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));

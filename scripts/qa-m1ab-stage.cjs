// One browser at a time, served from a caller-supplied immutable dist.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const url=process.argv[2], build=process.env.QA_M1_BUILD;
if(!url||!build)throw Error('Require fixed URL and QA_M1_BUILD');
for(const body of ['female','male']) {
 const env={...process.env,QA_M1_ASSET_ID:body==='female'?'beta-base-female-m1':'beta-base-male-m1b',
  QA_M1_ASSET_SHA:body==='female'?'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95':'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',
  QA_M1_CONFIG:path.resolve(`scripts/qa-m1ab-room-${body}.json`),
  QA_M1_RUN_ROOT:path.resolve(`output/playwright/m1/${build}/${body}`)};
 for(const [script,args] of [['qa-m1-seat.cjs',[]],['qa-m1-run.cjs',['chain']]]) {
  console.log('Starting fixed',body,script);
  const result=spawnSync(process.execPath,[path.resolve('scripts',script),`${url}?body=${body}`,...args],{env,stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
 }
}

// Reuse the room-chain acceptance; each derived body has its own real identity.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const base=process.argv[2],build=process.env.QA_M1_BUILD;
if(!base||!build)throw Error('Require fixed URL and explicit build');
const specs=[['m1a-jaw-v1','3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011'],['m1a-waisthip-v1','10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5']];
for(const[id,sha]of specs){
 const out=path.resolve(`output/playwright/m1/${build}/variants/${id}`);fs.mkdirSync(out,{recursive:true});
 const config=JSON.parse(fs.readFileSync('scripts/qa-m1ab-room-female.json','utf8'));config.assetId=id;
 const file=path.join(out,'room-config.json');if(fs.existsSync(file))throw Error('Refuse existing output');fs.writeFileSync(file,JSON.stringify(config,null,2));
 const env={...process.env,QA_M1_ASSET_ID:id,QA_M1_ASSET_SHA:sha,QA_M1_RUN_ROOT:out,QA_M1_CONFIG:file};
 const url=new URL(base);url.searchParams.set('body',id);
 const r=spawnSync(process.execPath,['scripts/qa-m1-run.cjs',url.href,'chain'],{env,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);
}

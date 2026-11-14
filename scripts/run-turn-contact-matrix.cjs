// Serial fixed-candidate capture + actual contact gate; abort on first failure.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const [dist,build]=process.argv.slice(2);if(!dist||!/^[a-f0-9]{12}$/.test(build||''))throw Error('Require fixed dist and build');
const out=path.resolve('output/turn-contact-matrix-'+build+'-'+Date.now()+'.json');
const report={build,dist,scope:'Serial actual fixed-room numeric contact gates, not video/performance',batches:[],complete:false,passed:false};
const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');save();
for(const body of ['female','male'])for(const fps of [30,60,120]){
 const args=['scripts/run-fixed-check.cjs',dist,'scripts/qa-turn-contact-chain.cjs',build,'--body='+body,'--fps='+fps,'--angles=1,5,15,45,90,180','--modes=idle,walk,run'];
 console.log('Starting '+body+' '+fps+'Hz');
 const capture=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:10*1024*1024});
 process.stdout.write(capture.stdout||'');process.stderr.write(capture.stderr||'');
 const receipt=(capture.stdout||'').split(/\r?\n/).map(s=>{try{return JSON.parse(s);}catch{return null;}}).find(x=>x?.out);
 const batch={body,fps,args,captureExit:capture.status,out:receipt?.out??null,passed:false};report.batches.push(batch);
 if(capture.status!==0||!receipt){batch.failure='Capture failed';save();console.log(out);process.exit(1);}
 const gate=spawnSync(process.execPath,['scripts/qa-turn-regression.cjs',receipt.out],{encoding:'utf8',maxBuffer:10*1024*1024});
 if(gate.status!==0)process.stderr.write(gate.stderr||'');
 const result=JSON.parse(fs.readFileSync(path.join(receipt.out,'contact-regression.json')));
 batch.gateExit=gate.status;batch.passed=result.passed;batch.scenarios=result.scenarios.map(x=>({name:x.name,passed:x.passed,max:x.max,minSole:x.minSole,failureKinds:[...new Set(x.failures.map(f=>f.kind))]}));save();
 console.log(JSON.stringify({body,fps,passed:batch.passed,out:receipt.out,failures:batch.scenarios.filter(x=>!x.passed)}));
 if(!batch.passed){console.log(out);process.exit(1);}
}
report.complete=true;report.passed=true;save();console.log(out);

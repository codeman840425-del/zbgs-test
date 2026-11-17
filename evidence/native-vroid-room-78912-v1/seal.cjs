const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
  const base=__dirname;const run=JSON.parse(await fs.readFile(path.join(base,'run-1/report.json')));
  const close=JSON.parse(await fs.readFile(path.join(base,'close-1/report.json')));
  const film=JSON.parse(await fs.readFile(path.join(base,'filmstrip/manifest.json')));
  const closure={schema:'native-vroid-room-observation-closure-v1',status:'room-overlay-observed-full-admission-pending',build:run.build,sourceCommit:run.sourceCommit,model:run.request.model,nativeSource:run.request.nativeSource,
    gpuWindowReleased:true,browserClosed:true,runtimeOrPublicModified:false,commercialGameAssetLicenseReviewed:false,
    observations:{walkTask:run.walkTask.state,samples:run.samples.length,movingSamples:run.samples.filter(s=>s.motion.moving).length,maximumReportedPeakSlipM:Math.max(...run.samples.map(s=>s.motion.peakSlip??0)),reachClampCount:run.samples.flatMap(s=>s.motion.feet??[]).filter(f=>f.reachClamp).length,retargetRatio:run.candidate.retargetRatio,sourceFloorY:run.candidate.sourceFloorY,expressions:run.expressions},
    imagesActuallyViewed:[...run.images.map(x=>'run-1/'+x),...close.captures.map(x=>'close-1/'+x.id+'.png'),...film.sheets.map(x=>'filmstrip/'+x)],
    review:'REVIEW.md',limitations:['Overlay root trajectory is original actor navigation, candidate normalized skeleton and motion are real.','No candidate foundation/equipment/appearance/collision/recipe admission.','Back-facing first expression screenshots supplemented by actual front close captures.','Representative filmstrip inspection is not all-frame dynamic acceptance.','Default author-only noncommercial metadata retained.'],preCaptureFailure:{script:'capture-close-first-path-error.cjs',stage:'Node require resolution before browser creation',error:'MODULE_NOT_FOUND due one excess relative parent segment',correctedScript:'capture-close.cjs'}};
  await fs.writeFile(path.join(base,'closure.json'),JSON.stringify(closure,null,2)+'\n');
  const files=[];async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if(e.isDirectory())await walk(full);else if(e.name!=='package-files.json'){const b=await fs.readFile(full);files.push({path:path.relative(base,full).replaceAll(path.sep,'/'),bytes:b.length,sha256:hash(b)});}}}await walk(base);files.sort((a,b)=>a.path.localeCompare(b.path));
  await fs.writeFile(path.join(base,'package-files.json'),JSON.stringify({schema:'native-vroid-room-evidence-inventory-v1',files},null,2)+'\n');
  console.log(JSON.stringify({files:files.length,closureSha256:hash(await fs.readFile(path.join(base,'closure.json'))),reviewSha256:hash(await fs.readFile(path.join(base,'REVIEW.md'))),videoSha256:hash(await fs.readFile(path.join(base,'run-1/normal1x.webm')))}));
})();

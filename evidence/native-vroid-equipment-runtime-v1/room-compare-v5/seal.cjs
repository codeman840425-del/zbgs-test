const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const report=JSON.parse(await fs.readFile(path.join(__dirname,'run-1/report.json'))),spec=JSON.parse(await fs.readFile(path.join(__dirname,'request.json'))),review=JSON.parse(await fs.readFile(path.join(__dirname,'review-readback.json')));
 const closure={schema:'native-equipment-room-compare-closure-v1',status:'bounded-first-frame-and-same-source-equipment-checks-observed',commit:report.commit,build:report.build,spec:{path:'request.json',sha256:hash(await fs.readFile(path.join(__dirname,'request.json')))},sourceAssets:spec.inputs,runtimeSourcePins:spec.runtimeSourcePins,firstFrameGPUAlpha:review.firstFrameGPUAlpha,samePosePixelDifferences:review.samePosePixelDifferences,maximumWorldGeometryErrorM:review.maximumWorldGeometryErrorM,pureVideos:review.pureVideos,clockReadback:review.clips,imagesActuallyViewed:report.images,reviewedImageSheets:['walk-front-comparison.png','walk-side-comparison.png','embedded-filmstrip/000.jpg','independent-filmstrip/000.jpg'],fullFactoryAdmitted:false,runtimeAccepted:false,visualApproved:false,publicModified:false,navigationTested:false,licenseMetadataChanged:false,browserClosed:report.browserClosed,serverClosed:report.serverClosed,gpuWindowReleased:true};
 await fs.writeFile(path.join(__dirname,'closure.json'),JSON.stringify(closure,null,2)+'\n');
 for(const name of ['room-compare-v2','room-compare-v3','room-compare-v4','room-compare-v5']){
  const base=path.resolve(__dirname,'..',name),files=[];
  async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())await walk(f);else if(e.name!=='package-files.json'){const b=await fs.readFile(f);files.push({path:path.relative(base,f).replaceAll(path.sep,'/'),bytes:b.length,sha256:hash(b)});}}}
  await walk(base);files.sort((a,b)=>a.path.localeCompare(b.path));
  await fs.writeFile(path.join(base,'package-files.json'),JSON.stringify({schema:'native-equipment-room-evidence-inventory-v1',name,files},null,2)+'\n');
 }
 console.log(JSON.stringify({closureSha256:hash(await fs.readFile(path.join(__dirname,'closure.json'))),reviewSha256:hash(await fs.readFile(path.join(__dirname,'REVIEW.md'))),files:JSON.parse(await fs.readFile(path.join(__dirname,'package-files.json'))).files.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});

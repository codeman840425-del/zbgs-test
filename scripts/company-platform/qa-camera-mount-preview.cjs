const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const report={build,status:'running',candidates:[],checks:[],limits:['独立安装适配器不跨规格替换；仅证明生产资源导入、父级变换、保存恢复和失败保旧。','SwiftShader预览不代表普通电脑性能，不含真实角色C3。']};
let server,context,page;const errors=[];
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile-'+report.candidates.length),{headless:true,viewport:{width:1280,height:900},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);}
async function frame(file){await page.evaluate(async()=>{await new Promise(requestAnimationFrame);company.renderer.render(company.world,company.camera);const gl=company.renderer.getContext();if(gl.isContextLost())throw Error('WebGL context lost');});await page.locator('.viewport').screenshot({path:path.join(out,file)});}
(async()=>{
 await fs.mkdir(out,{recursive:true});server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
 const candidates=await page?.evaluate?.(()=>[])||['camera-mount-desk-clamp'];
 const ids=await (async()=>{const c=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const p=await c.newPage();await p.goto(server.url);await p.waitForFunction(()=>window.company?.ready);const ids=await p.evaluate(()=>company.appearanceCandidates('camera-mount').map(r=>r.id));await c.close();return ids;})();
 for(let i=0;i<ids.length;i++){
   await open();
   const result=await page.evaluate(async index=>{
     const sample=await company.showAppearanceSample('camera-mount',index);const before=structuredClone(company.session.document);const node=company.session.document.nodes.find(n=>n.id===sample.target),resource=company.catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);if(!node||!resource)throw Error('camera mount sample missing');
     const object=company.session.scene.root.getObjectByName(sample.target);object.updateMatrixWorld(true);const meshes=[];object.traverse(o=>{if(o.isMesh&&!o.name.startsWith('Simplified:'))meshes.push({name:o.name,box:o.geometry.boundingBox?.toArray?.()||null});});
     const geometryHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(meshes))))).map(x=>x.toString(16).padStart(2,'0')).join('');
     const moveId=node.parentId.endsWith('/desk')?node.parentId.slice(0,node.parentId.lastIndexOf('/')):node.parentId;const parentBefore=company.session.scene.root.getObjectByName(sample.target).matrixWorld.toArray();await company.apply([{type:'move',id:moveId,transform:{position:[.3,0,.2],yaw:0}}]);const moved=company.session.scene.root.getObjectByName(sample.target).matrixWorld.toArray();if(JSON.stringify(parentBefore)===JSON.stringify(moved))throw Error('child did not follow parent move');
     await company.save();const saved=await company.export();const savedDocument=JSON.stringify(company.session.document);await company.session.import(saved);if(JSON.stringify(company.session.document)!==savedDocument)throw Error('save restore mismatch');
     const keep=JSON.stringify(company.session.document);let code;try{await company.apply([{type:'move',id:sample.target,transform:{position:[9,9,9],yaw:0}}]);}catch(e){code=e.code;}if(!code||JSON.stringify(company.session.document)!==keep)throw Error('invalid change did not preserve old document');
     return {resource:{id:resource.id,version:resource.version,mount:resource.mount,parent:resource.parent},parentId:node.parentId,geometryHash,meshCount:meshes.length,failedCode:code};
   },i);
   await frame(`${result.resource.id}.png`);report.candidates.push(result);await context.close();context=null;
 }
 assert.equal(new Set(report.candidates.map(c=>c.geometryHash)).size,report.candidates.length,'Camera mount geometries must differ');
 report.checks.push({name:'four independent camera mount imports, parent follow, save/restore and invalid preserve',status:'passed'});assert.deepEqual(errors,[]);report.status='passed';
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,candidates:report.candidates.length,error:report.error,output:out}));});

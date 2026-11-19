const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {prepareQaOutput}=require('./qa-output.cjs');
const [dist,build,outArg]=process.argv.slice(2);
let out;
const report={build,status:'running',branches:[],checks:[],limits:['Production preview and preservation only; no real actor usage or ordinary-PC performance claim.']};
let server,context,page;const errors=[];
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1280,height:900},args:process.argv.includes('--software')?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);}
async function frame(){const result=await page.evaluate(async()=>{
 await new Promise(requestAnimationFrame);company.renderer.render(company.world,company.camera);
 const gl=company.renderer.getContext();if(gl.isContextLost())throw Error('WebGL context lost: image evidence invalid');
 const colors=new Set(),pixel=new Uint8Array(4);
 for(let x=1;x<10;x++)for(let y=1;y<10;y++){gl.readPixels(Math.floor(gl.drawingBufferWidth*x/10),Math.floor(gl.drawingBufferHeight*y/10),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);colors.add(Array.from(pixel).join(','));}
 if(colors.size<4)throw Error('Blank or uniform WebGL framebuffer: image evidence invalid');
 const debug=gl.getExtension('WEBGL_debug_renderer_info');return{sampledColors:colors.size,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unknown',contextLost:false};
 });report.renderEnvironment=result;}
(async()=>{
 if(!outArg)throw Error('Expected dist, build and output directory');out=await prepareQaOutput(outArg,'company-four-preview');server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
 report.harnessSha256=require('node:crypto').createHash('sha256').update(await fs.readFile(__filename)).digest('hex');
 const selected=process.argv.slice(5).find(value=>!value.startsWith('--'))?.split(',');
 const branches=(await page.evaluate(()=>company.appearanceBranches.filter(([b])=>company.appearanceCandidates(b).length>=4))).filter(([b])=>!selected||selected.includes(b));
 for(const [branch,label]of branches){
  const record={branch,label,candidates:[],closedReopened:false};report.branches.push(record);let expected;
  for(let i=0;i<4;i++){
   const actual=await page.evaluate(async({branch,i})=>{
    const sample=await company.showAppearanceSample(branch,i),before=company.snapshot();
    const states=company.session.document.nodes.filter(n=>n.resource).map(n=>({id:n.id,state:n.state,resource:company.catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version)})).filter(n=>Object.hasOwn(n.resource.stateDefaults||{},'on'));
    for(const item of states)await company.apply([{type:'set-state',id:item.id,state:{on:false}}]);
    await company.showAppearanceSample(branch,i); // replacing again must retain off state
    for(const item of states){const node=company.session.document.nodes.find(n=>n.id===item.id);if(node.state.on!==false)throw Error('Replacement reset state');}
    let displayTargets=0;for(const item of states){const node=company.session.document.nodes.find(n=>n.id===item.id),r=company.catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);for(const name of r.display?.screen?.nodes||[]){const mesh=company.session.scene.root.getObjectByName(node.id).getObjectByName(name);if(mesh.material.emissiveIntensity!==0)throw Error('Imported display failed OFF');displayTargets++;}}
    if(company.snapshot().lights.some(l=>l.intensity!==0))throw Error('Fill light failed OFF');
    for(const item of states)await company.apply([{type:'set-state',id:item.id,state:{on:true}}]);
    for(const item of states){const node=company.session.document.nodes.find(n=>n.id===item.id),r=company.catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);for(const name of r.display?.screen?.nodes||[]){const mesh=company.session.scene.root.getObjectByName(node.id).getObjectByName(name);if(mesh.material.emissiveIntensity!==r.display.screen.onIntensity)throw Error('Imported display failed ON');}}
    await company.save();const text=await company.export(),saved=company.session.document;
    await company.session.import(text);if(JSON.stringify(saved)!==JSON.stringify(company.session.document))throw Error('Restore mismatch');
    await company.showAppearanceSample(branch,i);
    const object=company.session.scene.root.getObjectByName(sample.target),meshes=[];
    object.updateMatrixWorld(true);object.traverse(o=>{if(o.isMesh&&!o.name.startsWith('Simplified:'))meshes.push({position:Array.from(o.geometry.attributes.position.array),matrix:o.matrixWorld.toArray()});});
    const bytes=new TextEncoder().encode(JSON.stringify(meshes)),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
    await company.save();return{resource:sample.resource,physical:{navigation:before.navigation,points:before.points},geometryHash:hash,meshCount:meshes.length,displayTargets,save:JSON.parse(await company.export()),document:company.session.document};
   },{branch,i});
   if(expected)assert.deepEqual(actual.physical,expected,`${branch} changed physical contract`);else expected=actual.physical;
   const filename=`${branch}-${i+1}.png`;await frame();await page.locator('.viewport').screenshot({path:path.join(out,filename)});
   await fs.writeFile(path.join(out,`${branch}-${i+1}.company.json`),JSON.stringify(actual.save,null,2)+'\n');
   record.candidates.push({resource:actual.resource,geometryHash:actual.geometryHash,meshCount:actual.meshCount,displayTargets:actual.displayTargets,screenshot:filename});
   record.lastDocument=actual.document;
  }
  assert.equal(new Set(record.candidates.map(c=>c.geometryHash)).size,4,`${branch} duplicate geometry`);
  await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),record.lastDocument);delete record.lastDocument;record.closedReopened=true;
  await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({branch,candidates:4,closedReopened:true}));
 }
 // Bad bytes must preserve both the displayed scene and durable previous save.
 const failed=await page.evaluate(async()=>{
  const sample=await company.showAppearanceSample('chair',0);await company.save();const before=JSON.stringify(company.session.document),saved=await company.export();
  const resource=structuredClone(company.appearanceCandidates('chair')[1]);resource.id='qa-bad-chair';resource.asset.sha256='0'.repeat(64);company.catalog.resources.push(resource);let code;
  try{await company.apply([{type:'replace-resource',id:sample.target,resource:{id:resource.id,version:resource.version}}]);}catch(e){code=e.code;}
  company.catalog.resources.pop();return{code,documentUnchanged:before===JSON.stringify(company.session.document),saveUnchanged:saved===await company.export()};
 });assert(failed.code&&failed.documentUnchanged&&failed.saveUnchanged);report.checks.push({name:'bad bytes preserve old scene and save',...failed});
 assert.deepEqual(errors,[]);report.status='passed';
 const rows=report.branches.map(b=>`<section><h2>${b.label} · 四款</h2><div class="row">${b.candidates.map(c=>`<figure><img src="${c.screenshot}" alt="${c.resource.id}"><figcaption>${c.resource.id}</figcaption></figure>`).join('')}</div><p>实际替换、功能不变、状态检查、保存及关闭重开：通过</p></section>`).join('');
 await fs.writeFile(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>设施四款外观实测</title><style>body{font:16px system-ui;background:#f4f6f1;color:#263f37;margin:30px}h1{font-size:26px}.row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}figure{margin:0;background:white;padding:8px}img{width:100%}figcaption{overflow-wrap:anywhere;font-size:12px}section{margin:35px 0}p{font-size:14px}@media(max-width:800px){.row{grid-template-columns:repeat(2,1fr)}}</style><h1>设施与建筑外观对照</h1><p>构建 ${build}。图片来自实际 Three.js 场景。不同造型沿同一功能规格替换；角色接触与实际使用尚待总工集成。</p>${rows}</html>`);
})().catch(e=>{report.status='failed';report.error=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();if(out)await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,branches:report.branches.length,error:report.error,output:out}));});

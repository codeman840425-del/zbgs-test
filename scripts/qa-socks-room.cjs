// Actual fixed-room integration of the independently generated sock layer.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const cases=[{body:'female',sha:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',sock:3,plain:0},
 {body:'male',sha:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',sock:6,plain:2}];
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={build,bodies:[],errors:[],status:'running',environment:{browser:browser.version(),viewport:[1440,900],deviceScope:'Development PC, not ordinary-PC qualification'},
  limits:['Original bodies only; no derived calf shapes','Existing Body painted dark stockings retained; new white crew layer does not erase them',
   'CPU source shoe triangle crossings are not visual pass/fail or penetration depth','No source skirt or frozen30s dance changes','Surface samples only verify finite deformation, not full collision detection']};
 let context,page;
 try{
  for(const c of cases){
   const dir=path.join(out,c.body);await fs.mkdir(dir);const row={body:c.body,stages:[]};report.bodies.push(row);
   context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});page=await context.newPage();
   page.on('pageerror',e=>report.errors.push(String(e)));
   const requests=[];page.on('request',r=>{if(r.url().includes('plain-crew-socks'))requests.push(r.url());});
   await page.goto(url+'?body='+c.body+'&workbench=appearance');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
   row.identity=await verifyCandidate(page,{build,sha256:c.sha,assetId:c.body==='male'?'beta-base-male-m1b':'beta-base-female-m1'});
   assert.equal(requests.length,0,'Unselected socks must not download');
   const mark=async name=>{await page.evaluate(name=>{let n=document.getElementById('sock-qa');if(!n){n=document.createElement('div');n.id='sock-qa';Object.assign(n.style,{position:'fixed',bottom:'0',left:'0',zIndex:'10000',background:'#173c40',color:'white',padding:'8px',pointerEvents:'none'});document.body.appendChild(n);}n.textContent=name;},name);row.stages.push({name,time:new Date().toISOString(),snapshot:await page.evaluate(()=>__debug.snapshot())});};
   const set=async n=>assert.equal((await page.evaluate(n=>__debug.setOutfit(n),n)).applied,true);
   const idle=()=>page.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.pending&&!s.target;},null,{timeout:45000});
   const layer=()=>page.evaluate(()=>{const a=__debug.avatar(),found=[];a.vrm.scene.traverse(n=>{if(n.userData.equipmentId?.includes('plain-crew-socks'))found.push({id:n.userData.equipmentId,visible:n.visible,meshes:n.children.filter(x=>x.isSkinnedMesh).map(x=>({uuid:x.uuid,geometry:x.geometry.uuid,bones:x.skeleton.bones.map(b=>b.uuid),vertices:x.geometry.attributes.position.count}))});});return found;});
   await set(c.plain);await page.evaluate(()=>{__debug.setPlaybackRate(1);__debug.camera('inspect-full-front');});
   const originalRecipe=await page.evaluate(()=>__debug.exportAppearanceRecipe());
   await mark(c.body+' | original outfit / no new sock layer');await page.screenshot({path:path.join(dir,'before.png')});
   await page.route('**/*plain-crew-socks-v1.glb',r=>r.fulfill({status:503,body:'Intentional sock failure'}));
   row.failure=await page.evaluate(n=>__debug.setOutfit(n),c.sock);assert.equal(row.failure.applied,false);
   assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),originalRecipe);await page.unroute('**/*plain-crew-socks-v1.glb');
   await set(c.sock);row.loaded=await layer();assert.equal(row.loaded.length,1);assert(row.loaded[0].visible);assert.equal(row.loaded[0].meshes.length,2);
   await mark(c.body+' | new independent sock layer');await page.screenshot({path:path.join(dir,'socks-front.png')});
   await page.evaluate(()=>__debug.camera('inspect-full-side'));await page.waitForTimeout(400);await page.screenshot({path:path.join(dir,'socks-side.png')});
   row.recipe=await page.evaluate(()=>__debug.exportAppearanceRecipe());await fs.writeFile(path.join(dir,'recipe.json'),row.recipe);
   await set(c.plain);assert.equal((await layer())[0].visible,false);await set(c.sock);assert.deepEqual(await layer(),row.loaded);
   await page.evaluate(()=>__debug.setBodyMode('base'));assert.equal((await layer())[0].visible,false);
   await page.evaluate(()=>__debug.setBodyMode('dressed'));assert.equal((await layer())[0].visible,true);
   row.rapid=await page.evaluate(async c=>Promise.all([__debug.setOutfit(c.plain),__debug.setOutfit(c.sock)]),c);
   assert.equal(row.rapid[1].applied,true);assert.equal(await page.evaluate(()=>__debug.snapshot().outfit),c.sock);
   await page.evaluate(()=>{window.__sockSamples=[];window.__sockSampling=true;let last=-Infinity;
    function sample(t){if(!__sockSampling)return;if(t-last>=100){last=t;const a=__debug.avatar(),points=[];a.vrm.scene.traverse(n=>{if(n.isSkinnedMesh&&n.parent?.userData.equipmentId?.includes('plain-crew-socks')&&n.parent.visible){for(let i=0;i<n.geometry.attributes.position.count;i+=37){const v=n.position.clone();n.getVertexPosition(i,v);n.localToWorld(v);points.push(v.toArray());}}});const s=__debug.snapshot();__sockSamples.push({t,mode:s.mode,phase:s.phase,position:s.position,points});}requestAnimationFrame(sample);}requestAnimationFrame(sample);
    __debug.camera('room');__debug.setSpeed(1.05);});
   await mark(c.body+' | walk 1x');await page.evaluate(()=>__debug.walkTo(1,1.8));await idle();
   await mark(c.body+' | run and change direction 1x');await page.evaluate(()=>{__debug.setSpeed(2.2);__debug.walkTo(-1,1.8);});await idle();
   await mark(c.body+' | approach / sit / hold 1x');await page.evaluate(()=>__debug.action('sit'));
   await page.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});await page.waitForTimeout(700);
   await page.evaluate(()=>__debug.camera('inspect-full-side'));await page.screenshot({path:path.join(dir,'seated-side.png')});
   await set(c.plain);assert.equal((await layer())[0].visible,false);await set(c.sock);await mark(c.body+' | seated remove / re-equip');
   await page.evaluate(()=>__debug.camera('room'));await page.evaluate(()=>__debug.action('stand'));await idle();
   await page.evaluate(()=>{__debug.setSpeed(1.05);__debug.walkTo(-1.2,1.9);});await idle();
   await mark(c.body+' | short technical dance 1x');
   row.dance=await page.evaluate(()=>__debug.request({requestId:'socks-dance',kind:'dance',payload:{danceId:'dance-technical-once-v1'}}));
   await page.waitForFunction(()=>['completed','failed','cancelled'].includes(__debug.tasks().get('socks-dance')?.state),null,{timeout:30000});
   row.danceResult=await page.evaluate(()=>__debug.tasks().get('socks-dance'));assert.equal(row.danceResult.state,'completed');await idle();
   if(c.body==='male'){await set(7);await mark('male | long pants with same socks');await page.evaluate(()=>__debug.camera('inspect-full-side'));await page.screenshot({path:path.join(dir,'long-pants.png')});await page.evaluate(()=>{__debug.camera('room');__debug.walkTo(-.5,1.8);});await idle();await set(c.sock);}
   await page.evaluate(()=>{__sockSampling=false;});row.samples=await page.evaluate(()=>__sockSamples);
   assert(row.samples.length>50);assert(row.samples.every(s=>s.points.length>0&&s.points.flat().every(Number.isFinite)));
   await fs.writeFile(path.join(dir,'surface-samples.json'),JSON.stringify(row.samples));delete row.samples;
   assert.equal((await page.evaluate(t=>__debug.importAppearanceRecipe(t),originalRecipe)).applied,true);assert.equal((await layer())[0].visible,false);
   assert.equal((await page.evaluate(t=>__debug.importAppearanceRecipe(t),row.recipe)).applied,true);assert.equal((await layer())[0].visible,true);
   if(c.body==='male'){const old=await fs.readFile('evidence/m2-lazy-outfit-room-801-v1/outfit-4/recipe.json','utf8');row.old801Recipe=await page.evaluate(t=>__debug.importAppearanceRecipe(t),old);assert.equal(row.old801Recipe.applied,true);assert.equal((await layer())[0].visible,false);await set(c.sock);}
   if(c.body==='male'){
    await page.evaluate(()=>__debug.loadComparison('female').then(()=>true));
    row.isolation=await page.evaluate(async()=>{
     const primary=__debug.avatar(),peer=__debug.comparison().avatar;
     const equipped=await __debug.comparison().command({type:'outfit',value:3});
     const find=a=>{let result;a.vrm.scene.traverse(n=>{if(n.userData.equipmentId?.includes('plain-crew-socks'))result=n;});return result;};
     const a=find(primary),b=find(peer);const geometrySeparate=a.children.every(x=>b.children.every(y=>x.geometry!==y.geometry));
     const materialSeparate=a.children.every(x=>b.children.every(y=>x.material!==y.material));
     await __debug.setOutfit(2);const peerUnchanged=b.visible;__debug.removeComparison();await __debug.setOutfit(6);
     return{equipped,geometrySeparate,materialSeparate,peerUnchanged,primaryVisible:a.visible,peerRemoved:!b.parent};
    });
    assert(row.isolation.equipped.applied&&row.isolation.geometrySeparate&&row.isolation.materialSeparate&&row.isolation.peerUnchanged&&row.isolation.primaryVisible&&row.isolation.peerRemoved);
   }
   await mark(c.body+' | complete / recipe restored');row.requests=requests;row.final=await layer();
   const v=page.video();await context.close();await v.saveAs(path.join(dir,'normal1x.webm'));context=null;
   context=await browser.newContext({viewport:{width:1440,height:900}});page=await context.newPage();
   await page.goto(url+'?body='+c.body+'&workbench=appearance');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
   row.reopened=await page.evaluate(t=>__debug.importAppearanceRecipe(t),row.recipe);assert.equal(row.reopened.applied,true);assert.equal((await layer())[0].visible,true);
   const restored=JSON.parse(await page.evaluate(()=>__debug.exportAppearanceRecipe()));assert.deepEqual(restored.equipment,JSON.parse(row.recipe).equipment);
   await context.close();context=null;
  }
  assert.deepEqual(report.errors,[]);report.status='technical-checks-passed-visual-pending';
 }catch(e){report.status='failed';report.failure=String(e);report.stack=e.stack;process.exitCode=1;report.failureState=await page?.evaluate(()=>__debug?.snapshot()).catch(()=>null);await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await context?.close();await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({status:report.status,failure:report.failure,out}));
})().catch(e=>{console.error(e);process.exitCode=1;});

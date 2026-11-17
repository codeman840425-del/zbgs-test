const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const report={build,status:'running',checks:[],limits:['SwiftShader browser validation, not ordinary-PC performance, character C3, fixed release or human final acceptance.']};
let server,context,page;const errors=[];
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});console.log(name);}
async function draw(){await page.waitForTimeout(40);await page.evaluate(()=>company.drawHostFrame());}
async function aim(){await page.evaluate(()=>{company.pausePreview();company.camera.position.set(-.98,1.145,-.35);company.camera.lookAt(-.98,1.145,-1.435);company.camera.updateMatrixWorld();company.session.scene.setWallView({mode:'full'});});await draw();}
async function pixels(){return page.evaluate(()=>company.session.scene.mirrorBindings().filter(b=>b.active).map(b=>{
  const t=b.reflector.getRenderTarget(),data=new Uint16Array(t.width*t.height*4);company.renderer.readRenderTargetPixels(t,0,0,t.width,t.height,data);
  let hash=0,nonzero=0,red=0;for(let i=0;i<data.length;i+=4){for(let j=0;j<3;j++){hash=(Math.imul(hash,31)+data[i+j])>>>0;if(data[i+j])nonzero++;}if(data[i]>data[i+1]&&data[i]>data[i+2])red++;}
  return{id:b.id,ownerId:b.ownerId,hash,nonzero,red,snapshot:b.snapshot()};
}));}
(async()=>{
  await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
  await check('Four actual looks reflect and recover exact nondefault lamp state after separate browser shutdowns',async()=>{
    const result=[];
    for(let index=0;index<4;index++){
      await page.evaluate(index=>company.showAppearanceSample('makeup-mirror',index),index);await aim();const before=await pixels();assert.equal(before.length,index===3?3:1);assert(before.every(p=>p.nonzero>1000));
      await page.screenshot({path:path.join(out,`mirror-${index+1}.png`)});
      await page.evaluate(()=>company.save());const doc=await page.evaluate(()=>company.session.document);
      await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),doc);await aim();const after=await pixels();assert.equal(after.length,before.length);assert(after.every(p=>p.nonzero>1000));
      result.push({index,resource:doc.nodes.find(n=>n.id==='vanity/primary/mirror').resource,state:doc.nodes.find(n=>n.id==='vanity/primary/mirror').state,before,after});
    }return result;
  });
  await check('Three folded planes render independent current pixels with moving real geometry behind the main camera',async()=>{
    await page.evaluate(()=>company.showAppearanceSample('makeup-mirror',3));await aim();const before=await pixels();
    const placement=await page.evaluate(()=>{
      let source;company.session.scene.root.traverse(n=>{if(!source&&n.isMesh&&n.geometry.type==='BoxGeometry')source=n;});
      const mesh=source.clone();mesh.geometry=source.geometry.clone();mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,c=box.getCenter(company.camera.position.clone()),s=box.getSize(company.camera.position.clone());mesh.geometry.translate(-c.x,-c.y,-c.z);mesh.scale.set(5.2/s.x,.65/s.y,.15/s.z);mesh.position.set(-.98,1.145,.6);mesh.material=source.material.clone();mesh.material.color.set('#ff0011');mesh.material.emissive.set('#330000');mesh.castShadow=false;mesh.receiveShadow=false;mesh.name='makeup-reflection-probe';company.world.add(mesh);window.makeupProbe=mesh;company.world.updateMatrixWorld(true);
      const p=mesh.position.clone().project(company.camera);return{position:mesh.position.toArray(),projected:p.toArray(),behindCamera:mesh.position.clone().applyMatrix4(company.camera.matrixWorldInverse).z>0};
    });assert(placement.behindCamera);await draw();const red=await pixels();assert.equal(red.length,3);
    assert(red.every((p,i)=>p.hash!==before[i].hash));assert.equal(new Set(red.map(p=>p.hash)).size,3);
    const visibleFacePixels=await page.evaluate(()=>{
      company.drawHostFrame();const src=company.renderer.domElement,canvas=document.createElement('canvas');canvas.width=src.width;canvas.height=src.height;const ctx=canvas.getContext('2d');ctx.drawImage(src,0,0);
      return company.session.scene.mirrorBindings().map(b=>{
        const x=b.panelId==='left'?-.07:b.panelId==='right'?.07:0,p=company.camera.position.clone().fromArray(b.planePosition);p.x+=Math.cos(b.planeYaw)*x;p.z-=Math.sin(b.planeYaw)*x;b.surface.parent.localToWorld(p);p.project(company.camera);
        const sx=Math.round((p.x+1)*canvas.width/2),sy=Math.round((1-p.y)*canvas.height/2),rgba=Array.from(ctx.getImageData(sx,sy,1,1).data);return{id:b.id,screen:[sx,sy],rgba};
      });
    });
    assert(visibleFacePixels.every(p=>p.rgba[0]>p.rgba[1]*2+20&&p.rgba[0]>p.rgba[2]*2+20),'The actual visible part of every panel must reflect the red object');
    await page.screenshot({path:path.join(out,'three-live-reflections.png')});
    await page.evaluate(()=>{makeupProbe.position.x+=.45;makeupProbe.material.color.set('#0044ff');makeupProbe.material.emissive.set('#000033');company.camera.position.x+=.08;company.camera.lookAt(-.98,1.145,-1.435);company.camera.updateMatrixWorld();});await draw();const moved=await pixels();assert(moved.every((p,i)=>p.hash!==red[i].hash));
    await page.evaluate(()=>{makeupProbe.removeFromParent();makeupProbe.geometry.dispose();makeupProbe.material.dispose();delete window.makeupProbe;});
    return {placement,before,red,visibleFacePixels,moved,stats:await page.evaluate(()=>company.mirrorController.snapshot())};
  });
  await check('Actual warm local light illuminates a nonemissive receiver, with measurable off/half/full output and lamp UI state',async()=>{
    await page.evaluate(()=>company.showAppearanceSample('makeup-mirror',1));await aim();
    await page.evaluate(()=>{
      let source;company.session.scene.root.traverse(n=>{if(!source&&n.isMesh&&n.geometry.type==='BoxGeometry')source=n;});
      const mesh=source.clone();mesh.geometry=source.geometry.clone();mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,c=box.getCenter(company.camera.position.clone()),s=box.getSize(company.camera.position.clone());mesh.geometry.translate(-c.x,-c.y,-c.z);mesh.scale.set(.24/s.x,.24/s.y,.04/s.z);mesh.position.set(-.98,1.21,-.715);mesh.material=source.material.clone();mesh.material.color.set('#bbbbbb');mesh.material.emissive.set('#000000');mesh.material.emissiveIntensity=0;mesh.material.roughness=1;mesh.castShadow=false;mesh.receiveShadow=false;mesh.name='makeup-light-receiver';company.world.add(mesh);window.makeupReceiver=mesh;
      company.camera.position.set(-.45,1.35,-1.13);company.camera.lookAt(mesh.position);company.camera.updateMatrixWorld();
    });
    const result=[];
    for(const intensity of [0,5,10]){
      await page.evaluate(intensity=>company.apply([{type:'set-state',id:'vanity/primary/mirror',state:{on:true,intensity}}]),intensity);await draw();
      const sample=await page.evaluate(()=>{
        company.drawHostFrame();const canvas=document.createElement('canvas'),src=company.renderer.domElement;canvas.width=src.width;canvas.height=src.height;const ctx=canvas.getContext('2d');ctx.drawImage(src,0,0);
        const q=makeupReceiver.getWorldPosition(company.camera.position.clone()).project(company.camera),x=Math.round((q.x+1)*canvas.width/2),y=Math.round((1-q.y)*canvas.height/2),d=ctx.getImageData(x-2,y-2,5,5).data,rgb=[0,0,0];for(let i=0;i<d.length;i+=4)for(let k=0;k<3;k++)rgb[k]+=d[i+k]/25;
        return{rgb,point:[x,y],lights:company.session.scene.snapshot().lights,state:company.session.document.nodes.find(n=>n.id==='vanity/primary/mirror').state};
      });result.push({intensity,...sample});await page.screenshot({path:path.join(out,`receiver-${intensity}.png`)});
    }
    assert(result[1].rgb.reduce((a,b)=>a+b,0)>result[0].rgb.reduce((a,b)=>a+b,0)+10);assert(result[2].rgb.reduce((a,b)=>a+b,0)>result[1].rgb.reduce((a,b)=>a+b,0)+5);
    await page.locator('#makeup-power').click();assert.equal(await page.evaluate(()=>company.session.document.nodes.find(n=>n.id==='vanity/primary/mirror').state.on),false);
    assert((await page.locator('#makeup-status').innerText()).includes('镜面仍可反射'));
    await page.evaluate(()=>{makeupReceiver.removeFromParent();makeupReceiver.geometry.dispose();makeupReceiver.material.dispose();delete window.makeupReceiver;});await aim();assert((await pixels()).length===1);
    return result;
  });
  await check('Repeated swaps and lightweight building view release all mirror targets, preserving saved lamp state',async()=>{
    const result=[];for(let i=0;i<8;i++){await page.evaluate(i=>company.showAppearanceSample('makeup-mirror',i%4),i);await aim();result.push(await page.evaluate(()=>({stats:company.mirrorController.snapshot(),memory:{...company.renderer.info.memory}})));}
    for(let i=0;i<4;i++)assert.deepEqual(result[i].memory,result[i+4].memory);assert(result.every(r=>r.stats.resources.live<=3&&r.stats.resources.peak<=6));
    const before=await page.evaluate(()=>company.session.document);await page.evaluate(()=>company.showSpace('building',company.session.document.nodes[0].id));await draw();assert.equal(await page.evaluate(()=>company.mirrorController.snapshot().resources.live),0);assert.deepEqual(await page.evaluate(()=>company.session.document),before);
    await page.evaluate(()=>company.showSpace('room',company.session.document.nodes[0].id,company.session.document.nodes[1].id));await aim();assert.equal((await pixels()).length,3);return result;
  });
  await check('Second room uses its real rotated parent plane and keeps independent state through close and restore',async()=>{
    await page.evaluate(()=>company.load(company.layouts.makeupMirrorAlternate));await draw();
    await page.evaluate(()=>company.apply([{type:'set-state',id:'vanity/primary/mirror',state:{on:false,intensity:8}}]));
    const before=await page.evaluate(()=>company.session.document);await page.evaluate(()=>company.save());await context.close();context=null;await open();
    assert.deepEqual(await page.evaluate(()=>company.session.document),before);
    const result=await page.evaluate(async()=>{
      const c=company,n=c.session.document.nodes.find(n=>n.id==='vanity/secondary/mirror'),table=c.session.document.nodes.find(n=>n.id==='vanity/secondary');
      await c.showSpace('room',c.session.document.nodes[0].id,table.parentId);c.pausePreview();
      const binding=c.session.scene.mirrorBindings().find(b=>b.ownerId===n.id),point=c.camera.position.clone().fromArray(binding.planePosition);binding.surface.parent.localToWorld(point);
      c.camera.position.copy(point).add(c.camera.position.clone().set(1.1,0,0));c.camera.lookAt(point);c.camera.updateMatrixWorld();c.session.scene.setWallView({mode:'full'});
      return{node:n,parent:table,point:point.toArray()};
    });await draw();const rendered=await pixels();assert(rendered.length===1&&rendered[0].ownerId==='vanity/secondary/mirror');assert(rendered[0].nonzero>1000);
    assert.deepEqual(result.node.state,{on:false,intensity:3});await page.screenshot({path:path.join(out,'second-rotated-room.png')});return{...result,rendered};
  });
  await check('A real shader failure on the second candidate panel rejects the entire group while keeping old geometry and saved bytes',async()=>{
    await page.evaluate(()=>company.showAppearanceSample('makeup-mirror',3));await aim();await page.evaluate(()=>company.save());
    const result=await page.evaluate(async()=>{
      const c=company,oldRoot=c.session.scene.root,doc=JSON.stringify(c.session.document),saved=JSON.stringify({...localStorage}),preflight=c.mirrorController.preflight;
      c.mirrorController.preflight=function(bindings,...args){const second=bindings.find(b=>b.panelId==='left');second.activate();second.reflector.material.vertexShader='INTENTIONALLY INVALID SECOND PANEL GLSL';second.reflector.material.needsUpdate=true;return preflight.call(this,bindings,...args);};
      let code;try{await c.apply([{type:'set-state',id:'vanity/primary/mirror',state:{intensity:4}}]);}catch(e){code=e.code;}finally{c.mirrorController.preflight=preflight;}
      return{code,rootPreserved:oldRoot===c.session.scene.root,documentPreserved:doc===JSON.stringify(c.session.document),savePreserved:saved===JSON.stringify({...localStorage}),stats:c.mirrorController.snapshot()};
    });assert.equal(result.code,'mirror-shader-failed');assert(result.rootPreserved&&result.documentPreserved&&result.savePreserved);assert.equal(result.stats.resources.live,3);await draw();const recovered=await pixels();assert.equal(recovered.length,3);assert(recovered.every(p=>p.nonzero>1000));return{result,recovered};
  });
  const costSamples=[];for(let i=0;i<5;i++){await page.waitForTimeout(40);costSamples.push(await page.evaluate(()=>{const start=performance.now();company.drawHostFrame();return{hostSubmissionMs:performance.now()-start,reflection:company.mirrorController.snapshot().lastReflection,main:{...company.renderer.info.render},stats:company.mirrorController.snapshot()};}));}
  report.cost={samples:costSamples,limits:['CPU submission time, not GPU completion/frame-rate benchmark','3 per-face passes reported; target object count is not measured driver VRAM','Software rendering of one representative room, ordinary PC remains untested']};
  assert.deepEqual(errors,[]);report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();report.pageErrors=errors;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});

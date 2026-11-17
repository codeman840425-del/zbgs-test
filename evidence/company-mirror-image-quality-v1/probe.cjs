const {chromium}=require('../../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const out=__dirname,url='http://127.0.0.1:63012/?sample=floor-mirror&look=1';
const cases=[['baseline',512,0,true],['resolution',1024,0,true],['antialias',512,4,true],['combined',1024,4,true],['without-shadow',1024,4,false]];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const results=[];
 try {for(const [name,size,samples,shadows]of cases){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),'7f650e194d2f');
  const config=await page.evaluate(({size,samples,shadows})=>{
   company.pausePreview();company.camera.position.set(1.5,1.05,1.1);company.camera.lookAt(1.5,.92,-1.474);company.camera.updateMatrixWorld();company.session.scene.setWallView({mode:'full'});
   const b=company.session.scene.mirrorBindings()[0],r=b.activate(),target=r.getRenderTarget(),gl=company.renderer.getContext();
   const supported=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES));
   if(samples&&!supported.includes(samples))throw Error('Requested HalfFloat multisampling unsupported: '+supported);
   target.samples=samples;target.setSize(size,size);target.dispose();
   if(!shadows){company.renderer.shadowMap.enabled=false;company.world.traverse(n=>{if(n.material)for(const m of [n.material].flat())m.needsUpdate=true;});}
   return{size,samples,shadows,supportedHalfFloatSamples:supported,minFilter:target.texture.minFilter,magFilter:target.texture.magFilter,camera:company.camera.position.toArray(),previous:company.mirrorController.snapshot().reflectionPasses};
  },{size,samples,shadows});
  await page.waitForTimeout(50);await page.evaluate(()=>company.drawHostFrame());await page.waitForFunction(previous=>company.mirrorController.snapshot().reflectionPasses>previous,config.previous);
  const actual=await page.evaluate(()=>{const t=company.session.scene.mirrorBindings()[0].reflector.getRenderTarget(),gl=company.renderer.getContext();return{width:t.width,height:t.height,samples:t.samples,glError:gl.getError(),contextLost:gl.isContextLost()};});
  assert.equal(actual.glError,0);assert.equal(actual.contextLost,false);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,name+'.png')});results.push({name,config,actual,pageErrors:errors});await context.close();
 }}finally{await browser.close();}
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({status:'passed',build:'7f650e194d2f',results,limits:['Temporary in-memory visual diagnostic only; source, resource contracts and saved layouts unchanged.','Target resize emits dispose events; lifecycle counters in these diagnostic pages are deliberately not acceptance evidence.','SwiftShader; no ordinary-PC or GPU-performance claim.']},null,2)+'\n');console.log(JSON.stringify({status:'passed',cases:results.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});

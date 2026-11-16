const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const report={build,status:'running',checks:[],limits:['Software-rendered functional checks, no ordinary-PC or real-character acceptance']};
let server,context,page;const errors=[];
async function open(){
  context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(name);}
async function shot(name){await page.evaluate(()=>{company.renderer.render(company.world,company.camera);if(company.renderer.getContext().isContextLost())throw Error('Context lost');});await page.screenshot({path:path.join(out,`${name}.png`)});}
async function reject(ops,expected){
  const result=await page.evaluate(async ops=>{
    const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage});let code;
    try{await company.apply(ops);}catch(e){code=e.code;}
    return{code,unchanged:before===JSON.stringify(company.session.document),saveUnchanged:saved===JSON.stringify({...localStorage})};
  },ops);assert.equal(result.code,expected);assert(result.unchanged&&result.saveUnchanged);return result;
}
(async()=>{
  await fs.mkdir(out);report.harnessSha256=createHash('sha256').update(await fs.readFile(__filename)).digest('hex');server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
  await check('Four actual shelf and four prop appearances replace and survive separate browser restarts',async()=>{
    const result=[];
    for(const branch of ['storage-shelf','tabletop-ornament'])for(let i=0;i<4;i++){
      await page.evaluate(({branch,i})=>company.showAppearanceSample(branch,i),{branch,i});
      const actual=await page.evaluate(({branch,i})=>{
        const r=company.appearanceCandidates(branch)[i],root=company.session.scene.root.getObjectByName('support/shelf');let meshes=0;root.traverse(n=>{if(n.isMesh)meshes++;});
        const children=company.session.document.nodes.filter(n=>n.attachment);
        if(children.length!==6||meshes<10)throw Error('Actual support scene is incomplete');
        return{id:r.id,sha256:r.asset.sha256,meshes,children:children.map(n=>({id:n.id,attachment:n.attachment,transform:n.transform}))};
      },{branch,i});await shot(`${branch}-${i+1}`);await page.evaluate(()=>company.save());
      const saved=await page.evaluate(()=>company.session.document);await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);
      result.push({branch,...actual});
    }
    for(const branch of ['storage-shelf','tabletop-ornament'])assert.equal(new Set(result.filter(r=>r.branch===branch).map(r=>r.sha256)).size,4);
    return result;
  });
  await page.evaluate(()=>company.load(company.layouts.supports));
  await check('Three actual board heights contact the supported bottom, parent yaw and clone preserve attachments',async()=>{
    const initial=await page.evaluate(()=>{
      const doc=company.session.document,parent=doc.nodes.find(n=>n.id==='support/shelf'),resource=company.catalog.resources.find(r=>r.id===parent.resource.id);
      return resource.supportSurfaces.map(s=>{
        const group=company.session.scene.root.getObjectByName(parent.id),board=group.getObjectByName(resource.supportNodes[s.id]);board.geometry.computeBoundingBox();
        const actual=board.geometry.boundingBox.clone().applyMatrix4(board.matrixWorld);
        const children=doc.nodes.filter(n=>n.attachment?.surfaceId===s.id);
        const bottoms=children.map(n=>{
          const g=company.session.scene.root.getObjectByName(n.id);let min=Infinity;
          g.traverse(m=>{if(m.isMesh){m.geometry.computeBoundingBox();min=Math.min(min,m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).min.y);}});return min;
        });return{id:s.id,topY:actual.max.y,bottoms};
      });
    });
    for(const s of initial)for(const bottom of s.bottoms)assert(Math.abs(bottom-s.topY)<.001);
    await page.evaluate(async()=>{
      await company.apply([{type:'move',id:'support/shelf',transform:{position:[1.25,0,-1.3],yaw:Math.PI/2}}]);
      await company.apply([{type:'copy-group',id:'support/display',newId:'support/clone',transform:{position:[0,0,2.6],yaw:0}}]);
    });
    const copied=await page.evaluate(()=>{
      const doc=company.session.document,children=doc.nodes.filter(n=>n.attachment);return{children,unique:new Set(doc.nodes.map(n=>n.id)).size,total:doc.nodes.length,
        world:company.session.scene.root.getObjectByName('support/prop-lower-left').getWorldPosition(company.camera.position.clone()).toArray()};
    });assert.equal(copied.children.length,12);assert.equal(copied.unique,copied.total);assert(Math.abs(copied.world[0]-1.25)<1e-6);assert(Math.abs(copied.world[2]+1.07)<1e-6);
    await page.evaluate(()=>company.view('room'));await shot('moved-and-copied');await page.evaluate(()=>company.save());
    const saved=await page.evaluate(()=>company.session.document);await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);return{initial,copied};
  });
  await check('Invalid support placement and changing support function preserve current scene and save',async()=>{
    const id='support/prop-lower-left',bad=[];
    bad.push(await reject([{type:'move',id,transform:{position:[.4,.45,0],yaw:0}}],'invalid-support-fit'));
    bad.push(await reject([{type:'move',id,transform:{position:[-.23,.5,0],yaw:0}}],'invalid-support-fit'));
    bad.push(await reject([{type:'move',id,transform:{position:[.23,.45,0],yaw:0}}],'overlapping-supported-props'));
    bad.push(await reject([{type:'attach-surface',id,parentId:'support/shelf',surfaceId:'unknown',transform:{position:[-.23,.45,0],yaw:0}}],'missing-support-surface'));
    const changed=await page.evaluate(async()=>{
      const current=company.session.document.nodes.find(n=>n.id==='support/shelf').resource,resource=company.catalog.resources.find(r=>r.mountRole==='storage-shelf'&&r.id!==current.id),old=resource.supportSurfaces[0].topY;
      const before=JSON.stringify(company.session.document);let code;
      resource.supportSurfaces[0].topY+=.01;
      try{await company.apply([{type:'replace-resource',id:'support/shelf',resource:{id:resource.id,version:resource.version}}]);}catch(e){code=e.code;}finally{resource.supportSurfaces[0].topY=old;}
      return{code,unchanged:before===JSON.stringify(company.session.document)};
    });assert.equal(changed.code,'incompatible-replacement');assert(changed.unchanged);return{bad,changed};
  });
  await check('Actual missing mesh binding and HTTP failure reject before committing replacement',async()=>{
    const result=await page.evaluate(async()=>{
      const current=company.session.document.nodes.find(n=>n.id==='support/shelf').resource,resource=company.catalog.resources.find(r=>r.mountRole==='storage-shelf'&&r.id!==current.id),old=resource.supportNodes.lower;
      const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage});let code;
      resource.supportNodes.lower='missing-actual-support-board';
      try{await company.apply([{type:'replace-resource',id:'support/shelf',resource:{id:resource.id,version:resource.version}}]);}catch(e){code=e.code;}finally{resource.supportNodes.lower=old;}
      return{code,unchanged:before===JSON.stringify(company.session.document),saveUnchanged:saved===JSON.stringify({...localStorage}),resource:{id:resource.id,version:resource.version},url:resource.asset.url};
    });assert(result.code&&result.code!=='incompatible-replacement');assert(result.unchanged&&result.saveUnchanged);
    await page.route(`**${result.url}`,route=>route.fulfill({status:503,body:'support-test-failure'}));
    await reject([{type:'replace-resource',id:'support/shelf',resource:result.resource}],'asset-fetch-failed');await page.unroute(`**${result.url}`);return result;
  });
  await check('Explicit attachment move, second input, full save pins and display resource cleanup',async()=>{
    await page.evaluate(async()=>{
      await company.load(company.layouts.supportAlternate);
      await company.apply([{type:'attach-surface',id:'support/prop-lower-left',parentId:'support/shelf',surfaceId:'middle',transform:{position:[0,1.05,0],yaw:Math.PI/2}}]);
      await company.save();
    });
    await shot('second-input');const saved=await page.evaluate(()=>company.session.document);
    const encoded=await page.evaluate(()=>company.export());await fs.writeFile(path.join(out,'supports.company.json'),encoded);
    const envelope=JSON.parse(encoded),keys=new Set(saved.nodes.filter(n=>n.resource).map(n=>`${n.resource.id}@${n.resource.version}`));assert.equal(envelope.dependencies.resources.length,keys.size);
    await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);
    const release=await page.evaluate(async()=>{
      const expected=new Set(company.session.document.nodes.filter(n=>n.resource&&company.catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version)?.asset).map(n=>`${n.resource.id}@${n.resource.version}`)).size;
      const actual=company.assetLibrary.snapshot();await company.load(company.layouts.smallHome);const after=company.assetLibrary.snapshot();return{expected,actual,after};
    });assert.equal(release.actual.cachedAssets,release.expected);assert(release.after.cachedAssets<release.actual.cachedAssets);return{resourcePins:keys.size,release};
  });
  assert.deepEqual(errors,[]);report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(server)await server.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));
});

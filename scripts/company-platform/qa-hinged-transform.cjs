const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
let server,context,page;const report={build,status:'running',checks:[]};
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);}
(async()=>{
  await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
  await page.evaluate(()=>company.load(company.layouts.hingedAlternate));
  const states=[];
  for(const fraction of [0,.5,1]) {
    const state=await page.evaluate(async fraction=>{
      await company.apply([{type:'set-state',id:'hinged/cabinet',state:{openFraction:fraction}}]);company.view('cabinet');
      const root=company.session.scene.root.getObjectByName('hinged/cabinet');root.updateWorldMatrix(true,true);
      const pivot=root.getObjectByName('cabinet-door-pivot'),inverse=root.matrixWorld.clone().invert(),fp=company.snapshot().navigation.find(n=>n.instanceId===root.name).footprint;
      const point=company.camera.position.clone();let vertices=0;
      pivot.traverse(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position;for(let i=0;i<positions.count;i++){
        point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);vertices++;
        if(Math.abs(point.x-fp.center[0])>fp.halfSize[0]+1e-5||Math.abs(point.z-fp.center[1])>fp.halfSize[1]+1e-5)throw Error('Rotated actual door exceeds unexpanded footprint');
      }});
      const prop=company.session.scene.root.getObjectByName('hinged/top-prop');prop.updateWorldMatrix(true,true);
      return{fraction,vertices,propWorld:prop.getWorldPosition(point).toArray(),pivot:pivot.rotation.y,footprint:fp};
    },fraction);states.push(state);
  }
  assert(states.every(s=>s.vertices>0&&Math.abs(s.pivot+Math.PI/2*s.fraction)<1e-8));
  for(const s of states)assert.deepEqual(s.propWorld,states[0].propWorld);
  assert(Math.abs(states[0].propWorld[0]-1.7)<1e-8&&Math.abs(states[0].propWorld[1]-1.2)<1e-8&&Math.abs(states[0].propWorld[2]+.6)<1e-8);
  await page.screenshot({path:path.join(out,'turned-open.png')});await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);
  await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);
  report.checks.push({name:'Rotated actual door stays in unexpanded footprint; prop world position survives all states and separate-process restore',passed:true,states});
  const bad=await page.evaluate(async()=>{
    const target=company.appearanceCandidates('hinged-cabinet')[1],old=target.partPanels.door;
    const before=JSON.stringify(company.session.document),stored=JSON.stringify({...localStorage});let code;
    target.partPanels.door='missing-panel';
    try{await company.apply([{type:'replace-resource',id:'hinged/cabinet',resource:{id:target.id,version:target.version}}]);}catch(e){code=e.code;}finally{target.partPanels.door=old;}
    return{code,unchanged:before===JSON.stringify(company.session.document),storageUnchanged:stored===JSON.stringify({...localStorage})};
  });assert.equal(bad.code,'missing-moving-part-panel');assert(bad.unchanged&&bad.storageUnchanged);report.checks.push({name:'Real missing panel preserves entire persisted storage',passed:true,result:bad});
  report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));});

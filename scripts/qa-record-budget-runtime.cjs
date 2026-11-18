// Bounded real-loader cost sampling, separate from recording and static RGBA estimates.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [base,recordFile,folder,inspectBuild]=process.argv.slice(2),out=path.resolve(folder);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const records=JSON.parse(await fs.readFile(recordFile,'utf8'));
 if(!Array.isArray(records)||records.length<2)throw Error('Budget input requires at least two records');
const browser=await chromium.launch({channel:'chrome',headless:true}),report={schema:'native-runtime-budget-trace-v1',status:'incomplete',browser:browser.version(),viewport:{width:1440,height:1000},device:'Development Windows host, Ryzen 9 9950X3D / RTX4090; not ordinary-PC measurement',input:{path:path.resolve(recordFile),records:records.map(record=>({id:record.identity?.id,gender:record.identity?.gender,sourceRefs:record.provenance?.sourceRefs||[],bodySha256:record.resourceIdentities?.find(item=>item.id==='appearance/base/sha256')?.sha256||null,recordSha256:record.integrity?.recordSha256||record.integrity?.sha256||null}))},cases:[],errors:[],limits:['Headless Chrome, no CPU/network throttling; 12-second bounded samples only.','Renderer memory reports object counts, not GPU bytes. Frame intervals include browser scheduling; CPU wrappers exclude GPU execution.','No recording in this measurement; original-speed movement films belong to production evidence. Idle/talking independent consumer only.']};
 const groups=[[records[0]],[records[1]],[records[0],records[1]]];
 try{
  for(const group of groups){
   const context=await browser.newContext({viewport:report.viewport}),page=await context.newPage();const network=[];
   page.on('pageerror',error=>report.errors.push(error.message));page.on('response',response=>network.push({url:response.url(),status:response.status(),bytes:Number(response.headers()['content-length']??0)}));
   const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
   await page.goto(base+'record-consumer.html?production=1');await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:60000});
   const row=await page.evaluate(async ({inputs,inspectBuild})=>{
    const d=__recordConsumer,renderer=d.renderer,gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    if(inspectBuild && d.buildInfo.shortId!==inspectBuild)throw Error('Unexpected fixed build: '+d.buildInfo.shortId);
    const stats=()=>({textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,programs:renderer.info.programs.length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
    const tick=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await tick();const baseline=stats(),started=performance.now(),result=await d.selectGroup(0,inputs);await tick();
    if(result.items.some(r=>r.status!=='completed'))throw Error(JSON.stringify(result));
    const loaded=stats(),loadMs=performance.now()-started,frames=[];
    let last=null,updateMs=0,renderMs=0;
    const restores=[];
    for(const instance of d.actors.values()){
     const original=instance.update;instance.update=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{updateMs+=performance.now()-t;}};
     restores.push(()=>instance.update=original);
    }
    const render=renderer.render;renderer.render=function(...args){const t=performance.now();try{return render.apply(this,args);}finally{renderMs+=performance.now()-t;}};
    restores.push(()=>renderer.render=render);
    try{await new Promise(resolve=>{const start=performance.now();function sample(t){if(last!==null)frames.push({frameMs:t-last,updateMs,renderMs});last=t;updateMs=0;renderMs=0;if(t-start<12000)requestAnimationFrame(sample);else resolve();}requestAnimationFrame(sample);});}
    finally{for(const restore of restores)restore();}
    const summarize=key=>{const values=frames.map(r=>r[key]).sort((a,b)=>a-b);return{count:values.length,min:values[0],p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],p99:values[Math.floor(values.length*.99)],max:values.at(-1),over33:values.filter(v=>v>33.34).length,over50:values.filter(v=>v>50).length};};
    const afterSample=stats();
    // Observe already-uploaded Three/WebGL2 resources after the timed sample, without
    // initializing textures, rendering extra passes or changing renderer ownership.
    const handles=new Map(),images=new Map(),bindings=[];
    function identity(map,object){if(!object)return null;if(!map.has(object))map.set(object,map.size+1);return map.get(object);}
    if(inspectBuild)for(const actor of d.actors.values()){
      const materials=new Set();
      actor.avatar.root.traverseVisible(o=>{if(o.isMesh)for(const material of [].concat(o.material))materials.add(material);});
      for(const m of materials){
        if(!/_(Face_\d+_SKIN|Body_\d+_SKIN|FaceEyeline_)/.test(m.name))continue;
        for(const slot of ['map','shadeMultiplyTexture','normalMap']){
          const t=m[slot];if(!t?.isTexture)continue;
          const h=renderer.properties.has(t)?renderer.properties.get(t).__webglTexture:null;
          bindings.push({actor:actor.identity.id,material:m.name,outline:Boolean(m.isOutline),slot,
            texture:t.uuid,source:t.source.uuid,image:identity(images,t.image),width:t.image.width,height:t.image.height,
            imageBitmap:t.image instanceof ImageBitmap,handle:identity(handles,h),live:h?gl.isTexture(h):false});
        }
      }
    }
    for(const actor of d.actors.values())actor.dispose();d.actors.clear();await tick();const released=stats();
    const handleProbe=inspectBuild?{webgl2:gl instanceof WebGL2RenderingContext,bindings,
      afterRelease:[...handles].map(([h,id])=>({id,live:gl.isTexture(h)}))}:undefined;
    return{build:d.buildInfo.shortId,ids:inputs.map(r=>r.identity.id),baseline,loaded,loadMs,afterSample,released,frames,handleProbe,summary:{frame:summarize('frameMs'),update:summarize('updateMs'),render:summarize('renderMs')},gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable'};
   },{inputs:group,inspectBuild});
   const inputIdentity=group.map(record=>report.input.records.find(item=>item.id===record.identity?.id));
   report.cases.push({...row,inputs:inputIdentity,network});assert.equal(row.released.textures,row.baseline.textures);assert.equal(row.released.geometries,row.baseline.geometries);
   await context.close();console.log(JSON.stringify({case:row.ids,loadMs:row.loadMs,frame:row.summary.frame,loaded:row.loaded,released:row.released}));
  }
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.status='measured-development-only';
 }catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,failure:report.failure}));}
})();

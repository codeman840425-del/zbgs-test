// Diagnostic only: actual program identity across one cold geometry edit.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.argv[2],out=path.resolve('evidence/workbench-program-identity-1188-v1');
(async()=>{
 try{await fs.access(path.join(out,'report.json'));throw Error('Refuse overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.mkdir(out,{recursive:true});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});let report={build:'1188b09aca6f',errors:[],scope:'New Chrome process, driver cache not reset. No recording. Identity wrappers are not performance benchmark.'};
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(base+'?workbench=appearance');await page.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields')?.disabled);
 assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),report.build);await page.waitForTimeout(200);
 await page.evaluate(()=>{
 const r=__debug.renderer,gl=r.getContext(),q=window.__programStudy={snapshots:[],links:[],queries:[],draws:[],renders:[],phase:'initial',frame:0,programIds:[],command:null};
 const ids=new WeakMap();let next=1;const id=p=>{if(!ids.has(p))ids.set(p,next++);return ids.get(p);};
 const props=m=>{const p=r.properties.get(m);return{materialId:m.id,uuid:m.uuid,name:m.name,type:m.type,outline:m.isOutline,transparent:m.transparent,side:m.side,defines:m.defines?{...m.defines}:null,current:p.currentProgram?.id,keys:p.programs?[...p.programs.keys()]:[]};};
 const snapshot=(kind,scene)=>q.snapshots.push({kind,t:performance.now(),programs:r.info.programs.map(p=>({id:p.id,glId:id(p.program),name:p.name,type:p.type,cacheKey:p.cacheKey,usedTimes:p.usedTimes})),materials:scene?(()=>{const a=[];scene.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))a.push({...props(m),geometry:o.geometry.uuid,object:o.name,skin:o.isSkinnedMesh,morphPosition:o.geometry.morphAttributes.position?.length,morphNormal:o.geometry.morphAttributes.normal?.length});});return a;})():null});
 snapshot('before-edit',__debug.avatar().vrm.scene);
 for(const name of ['linkProgram','getProgramInfoLog','getProgramParameter']){
 const old=gl[name];gl[name]=function(...args){const t=performance.now(),pid=id(args[0]);let result;
 if(name==='linkProgram')q.links.push({t,glId:pid,phase:q.phase,shaders:gl.getAttachedShaders(args[0]).map(s=>({type:gl.getShaderParameter(s,gl.SHADER_TYPE),source:gl.getShaderSource(s)}))});
 try{result=old.apply(this,args);return result;}finally{q.queries.push({name,glId:pid,t,end:performance.now(),phase:q.phase,pname:args[1],result});}};
 }
 const compile=r.compileAsync;r.compileAsync=function(scene,...args){snapshot('compile-before',scene);q.phase='compile';const p=compile.call(this,scene,...args);snapshot('compile-issued',scene);q.phase='await';return p.then(v=>{snapshot('compile-ready',scene);return v;});};
 const render=r.render;r.render=function(...args){const old=q.phase;q.phase='draw';q.frame++;const t=performance.now();try{return render.apply(this,args);}finally{q.renders.push({frame:q.frame,t,end:performance.now()});if(q.frame<=3||q.frame===10)snapshot('render-'+q.frame);q.phase=old;}};
 const draw=r.renderBufferDirect;r.renderBufferDirect=function(camera,scene,geometry,material,object,group){const before=props(material),t=performance.now();try{return draw.apply(this,arguments);}finally{if(q.frame<=4)q.draws.push({frame:q.frame,t,end:performance.now(),pass:scene===null?'shadow':'main',geometry:geometry.uuid,object:object.name,skin:object.isSkinnedMesh,morphPosition:geometry.morphAttributes.position?.length,morphNormal:geometry.morphAttributes.normal?.length,before,after:props(material)});}};
 });
 report.result=await page.evaluate(async()=>{const q=__programStudy;q.command={start:performance.now()};const result=await __debug.command({type:'faceGeometry',mouthWidth:-.04});q.command.end=performance.now();q.command.result=result;return result;});assert.equal(report.result.applied,true);
 await page.waitForTimeout(500);report.data=await page.evaluate(()=>__programStudy);
 }catch(e){report.error=String(e);throw e;}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report));console.log('Browser closed',out);}
})().catch(e=>{console.error(e);process.exitCode=1;});

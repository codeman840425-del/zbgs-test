const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('../../scripts/company-platform/serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path');
const out=__dirname,report={scope:'One exact bottle-to-tissue transition. Associate native allocation with Texture UUID, dispose history and render material uniforms. No extra swap loop.'};
let server,context;
(async()=>{
  server=await serve('prototype/dist-company','86a68778d4c6',{manifest:'company-build-info.json',entry:'company.html'});
  context=await chromium.launchPersistentContext(path.join(out,'attribution-bottle-profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  await context.addInitScript(()=>{
    window.__allocationPhase='init';window.__allocations=[];window.__textureIds=new WeakMap();let serial=0;
    for(const type of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext])if(type){
      const create=type.prototype.createTexture,remove=type.prototype.deleteTexture;
      type.prototype.createTexture=function(){const texture=create.call(this),id=++serial;window.__textureIds.set(texture,id);window.__allocations.push({action:'create',id,phase:window.__allocationPhase,texture:window.__lastTexture&&{...window.__lastTexture},stack:new Error().stack});return texture;};
      type.prototype.deleteTexture=function(texture){window.__allocations.push({action:'delete',id:window.__textureIds.get(texture),phase:window.__allocationPhase});return remove.call(this,texture);};
    }
    window.__shadowRecords=[];
  });
  const page=await context.newPage();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  await page.evaluate(async()=>{await company.load(company.layouts.sideTableLifeItemsAlternate);await company.showAppearanceSample('side-table-life-items',0);await company.showAppearanceSample('side-table-life-items',1);company.drawHostFrame();});
  await page.evaluate(()=>{
    window.__seenTextures=new Map();window.__textureDisposeEvents=[];window.__renderRecords=[];
    const properties=company.renderer.properties,get=properties.get;
    properties.get=function(object){
      if(object?.isTexture){
        if(!window.__seenTextures.has(object.uuid)){
          const record={texture:object,disposes:0};window.__seenTextures.set(object.uuid,record);
          object.addEventListener('dispose',()=>{record.disposes++;window.__textureDisposeEvents.push({uuid:object.uuid,phase:window.__allocationPhase,width:object.image?.width});});
        }
        const record=window.__seenTextures.get(object.uuid);
        window.__lastTexture={uuid:object.uuid,name:object.name,width:object.image?.width,disposes:record.disposes,source:object.source.uuid};
      }
      return get.call(this,object);
    };
    const render=company.renderer.renderBufferDirect;
    company.renderer.renderBufferDirect=function(...args){
      const result=render.apply(this,args),material=args[3],object=args[4],uniforms=get.call(properties,material).uniforms;
      const textures=Object.entries(uniforms||{}).filter(([,uniform])=>uniform?.value?.isTexture).map(([name,uniform])=>({name,uuid:uniform.value.uuid,map:uniform.value===material.map,width:uniform.value.image?.width,nativeId:window.__textureIds.get(get.call(properties,uniform.value).__webglTexture)}));
      if(window.__allocationPhase==='only-tissue-transition')window.__renderRecords.push({object:object.name,material:material.uuid,type:material.type,currentMap:material.map?.uuid,textures});
      return result;
    };
    company.drawHostFrame();
  });
  await page.evaluate(async()=>{window.__allocationPhase='only-tissue-transition';await company.showAppearanceSample('side-table-life-items',2);company.drawHostFrame();});
  await page.waitForTimeout(80);
  report.data=await page.evaluate(()=>({allocations:window.__allocations,renderRecords:window.__renderRecords,textureDisposeEvents:window.__textureDisposeEvents,seenTextures:[...window.__seenTextures].map(([uuid,r])=>({uuid,disposes:r.disposes,width:r.texture.image?.width,nativeId:window.__textureIds.get(company.renderer.properties.get(r.texture).__webglTexture)})),memory:{...company.renderer.info.memory}}));
  report.status='completed';
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(server)await server.close();report.temporaryServerClosed=true;
  await fs.writeFile(path.join(out,'allocation-bottle-attribution.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(report));
});

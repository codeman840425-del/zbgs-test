const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('../../scripts/company-platform/serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path');
const out=__dirname,report={scope:'One targeted cup-to-tissue transition, allocation call stacks and shadow uniforms. No extra swap loop.'};
let server,context;
(async()=>{
  server=await serve('prototype/dist-company','86a68778d4c6',{manifest:'company-build-info.json',entry:'company.html'});
  context=await chromium.launchPersistentContext(path.join(out,'attribution-profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  await context.addInitScript(()=>{
    window.__allocationPhase='init';window.__allocations=[];window.__textureIds=new WeakMap();let serial=0;
    for(const type of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext])if(type){
      const create=type.prototype.createTexture,remove=type.prototype.deleteTexture;
      type.prototype.createTexture=function(){const texture=create.call(this),id=++serial;window.__textureIds.set(texture,id);window.__allocations.push({action:'create',id,phase:window.__allocationPhase,stack:new Error().stack});return texture;};
      type.prototype.deleteTexture=function(texture){window.__allocations.push({action:'delete',id:window.__textureIds.get(texture),phase:window.__allocationPhase});return remove.call(this,texture);};
    }
    window.__shadowRecords=[];
  });
  const page=await context.newPage();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  await page.evaluate(async()=>{await company.load(company.layouts.sideTableLifeItemsAlternate);await company.showAppearanceSample('side-table-life-items',0);company.drawHostFrame();});
  await page.evaluate(()=>{
    company.world.traverse(object=>{if(!object.isMesh)return;const original=object.onAfterShadow;
      object.onAfterShadow=function(renderer,object,camera,shadowCamera,geometry,material,group){
        const uniforms=renderer.properties.get(material).uniforms;
        const textures=Object.entries(uniforms||{}).filter(([,uniform])=>uniform?.value?.isTexture).map(([name,uniform])=>({name,uuid:uniform.value.uuid,map:uniform.value===material.map,imageWidth:uniform.value.image?.width,nativeId:window.__textureIds.get(renderer.properties.get(uniform.value).__webglTexture)}));
        window.__shadowRecords.push({phase:window.__allocationPhase,object:this.name,depthMaterial:material.uuid,currentMap:material.map?.uuid,textures});
        return original.call(this,renderer,object,camera,shadowCamera,geometry,material,group);
      };
    });
  });
  await page.evaluate(async()=>{window.__allocationPhase='only-tissue-transition';await company.showAppearanceSample('side-table-life-items',2);company.drawHostFrame();});
  await page.waitForTimeout(80);
  report.data=await page.evaluate(()=>({allocations:window.__allocations,shadows:window.__shadowRecords,memory:{...company.renderer.info.memory}}));
  report.status='completed';
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(server)await server.close();report.temporaryServerClosed=true;
  await fs.writeFile(path.join(out,'allocation-attribution.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(report));
});

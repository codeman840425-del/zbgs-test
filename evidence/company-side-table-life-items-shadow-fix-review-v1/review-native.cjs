const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('../../scripts/company-platform/serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const out=__dirname,build='5d260122791d';
const report={build,status:'running',scope:'One original eight-swap sequence on fixed build 5d260122791d, recording native ImageBitmap/WebGL textures and company-owned depth/distance materials. SwiftShader, no runtime/QA source edits.',snapshots:[],errors:[]};
let server,context,page;
async function open() {
  context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  await context.addInitScript(()=>{
    window.__phase='page-initialization';window.__shadowMaterialRecords=new Map();window.__nativeTextureEvents=[];window.__nativeTextureIds=new WeakMap();window.__nativeTextures=new Map();
    let serial=0;window.__programIds=new WeakMap();window.__uniformLocations=new WeakMap();window.__glContexts=new WeakMap();let programSerial=0;
    const state=gl=>{let s=window.__glContexts.get(gl);if(!s){s={program:null,unit:0,uniforms:new WeakMap()};window.__glContexts.set(gl,s);}return s;};
    for(const type of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext]) {
      if(!type)continue;
      const create=type.prototype.createTexture,remove=type.prototype.deleteTexture,use=type.prototype.useProgram,location=type.prototype.getUniformLocation,setInt=type.prototype.uniform1i,active=type.prototype.activeTexture,bind=type.prototype.bindTexture;
      type.prototype.useProgram=function(program){state(this).program=program;if(program&&!window.__programIds.has(program))window.__programIds.set(program,++programSerial);return use.call(this,program);};
      type.prototype.getUniformLocation=function(program,name){const result=location.call(this,program,name);if(result)window.__uniformLocations.set(result,{program,name});return result;};
      type.prototype.uniform1i=function(location,value){const uniform=window.__uniformLocations.get(location),s=state(this);if(uniform){let values=s.uniforms.get(uniform.program);if(!values){values={};s.uniforms.set(uniform.program,values);}values[uniform.name]=value;}return setInt.call(this,location,value);};
      type.prototype.activeTexture=function(unit){state(this).unit=unit-this.TEXTURE0;return active.call(this,unit);};
      type.prototype.bindTexture=function(target,texture){const id=window.__nativeTextureIds.get(texture),record=window.__nativeTextures.get(id),s=state(this);if(record&&!record.firstBinding){record.firstBinding={program:window.__programIds.get(s.program),unit:s.unit,samplers:Object.entries(s.uniforms.get(s.program)||{}).filter(([,unit])=>unit===s.unit).map(([name])=>name),phase:window.__phase,target};}return bind.call(this,target,texture);};
      type.prototype.createTexture=function(...args) {
        const texture=create.apply(this,args),id=++serial;
        window.__nativeTextureIds.set(texture,id);window.__nativeTextures.set(id,{id,deleted:false});
        window.__nativeTextureEvents.push({action:'create',id,phase:window.__phase,time:performance.now(),stack:new Error().stack});return texture;
      };
      type.prototype.deleteTexture=function(texture) {
        const id=window.__nativeTextureIds.get(texture),record=window.__nativeTextures.get(id);
        if(record)record.deleted=true;
        window.__nativeTextureEvents.push({action:'delete',id,phase:window.__phase,time:performance.now()});return remove.call(this,texture);
      };
    }
    window.__bitmapRecords=[];
    const create=globalThis.createImageBitmap;
    globalThis.createImageBitmap=async(...args)=>{
      const image=await create(...args),record={id:window.__bitmapRecords.length+1,image,closes:0,createdPhase:window.__phase},close=image.close.bind(image);
      image.close=()=>{record.closes++;record.closedPhase=window.__phase;close();};window.__bitmapRecords.push(record);return image;
    };
  });
  page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
}
async function snapshot(label) {
  const data=await page.evaluate(label=>{
    const renderer=company.renderer,sceneTextures=[],shadows=[],customMaterials=[];
    const describe=(texture)=>{
      const properties=renderer.properties.get(texture),image=texture.image;
      return {uuid:texture.uuid,name:texture.name,source:texture.source.uuid,webglId:window.__nativeTextureIds.get(properties.__webglTexture)||null,
        initialized:properties.__webglInit||false,version:texture.version,sourceVersion:texture.source.version,imageBitmapId:window.__bitmapRecords.find(record=>record.image===image)?.id||null,
        imageSize:image&&{width:image.width,height:image.height},colorSpace:texture.colorSpace,flipY:texture.flipY,minFilter:texture.minFilter,magFilter:texture.magFilter};
    };
    company.world.traverse(object=>{
      for(const [kind,material]of [['depth',object.customDepthMaterial],['distance',object.customDistanceMaterial]])if(material){
        if(!window.__shadowMaterialRecords.has(material.uuid)){
          const record={uuid:material.uuid,kind,mesh:object.name,disposes:0,firstSeen:label};
          window.__shadowMaterialRecords.set(material.uuid,record);material.addEventListener('dispose',()=>{record.disposes++;record.disposedPhase=window.__phase;});
        }
        customMaterials.push({uuid:material.uuid,kind,mesh:object.name,map:material.map&&describe(material.map)});
      }
      if(object.isMesh)for(const material of object.material?[object.material].flat():[])for(const [slot,texture]of Object.entries(material))if(texture?.isTexture)
        sceneTextures.push({object:object.name,material:material.name,materialColor:material.color?.toArray(),slot,...describe(texture)});
      if(object.isLight&&object.shadow)shadows.push({light:object.name,type:object.type,castShadow:object.castShadow,map:object.shadow.map&&{
        uuid:object.shadow.map.uuid,width:object.shadow.map.width,height:object.shadow.map.height,
        texture:describe(object.shadow.map.texture),depth:object.shadow.map.depthTexture&&describe(object.shadow.map.depthTexture)},mapPass:object.shadow.mapPass&&describe(object.shadow.mapPass.texture)});
    });
    const node=company.session.document.nodes.find(node=>node.id==='life-items/primary');
    return {label,time:performance.now(),documentId:company.session.document.id,resource:node?.resource,revision:company.session.document.revision,
      host:company.renderStatus(),frame:renderer.info.render.frame,memory:{...renderer.info.memory},cache:company.assetLibrary.snapshot(),
      bitmapRecords:window.__bitmapRecords.map(record=>({id:record.id,width:record.image.width,height:record.image.height,closes:record.closes,createdPhase:record.createdPhase,closedPhase:record.closedPhase})),
      sceneTextures,shadows,customMaterials,shadowMaterialRecords:[...window.__shadowMaterialRecords.values()].map(record=>({...record})),nativeRecords:[...window.__nativeTextures.values()],nativeLive:[...window.__nativeTextures.values()].filter(record=>!record.deleted).map(record=>record.id),nativeEvents:window.__nativeTextureEvents.slice()};
  },label);
  report.snapshots.push(data);await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({label,resource:data.resource?.id,frame:data.frame,memory:data.memory,liveBitmaps:data.bitmapRecords.filter(record=>record.width>0).length,
    sceneTextureGlIds:data.sceneTextures.map(texture=>texture.webglId),shadowGlIds:data.shadows.map(shadow=>[shadow.map?.texture.webglId,shadow.map?.depth?.webglId]),nativeLive:data.nativeLive}));
}
(async()=>{
  const bytes=await fs.readFile('prototype/dist-company/company-build-info.json');report.buildManifestSha256=createHash('sha256').update(bytes).digest('hex');
  report.renderSourceSha256=createHash('sha256').update(await fs.readFile('prototype/src/company/render.js')).digest('hex');
  report.harnessSha256=createHash('sha256').update(await fs.readFile(__filename)).digest('hex');
  server=await serve('prototype/dist-company',build,{manifest:'company-build-info.json',entry:'company.html'});
  await open();
  await page.evaluate(async()=>{window.__phase='load-alternate';await company.load(company.layouts.sideTableLifeItemsAlternate);await company.view('top');await company.save();});
  await snapshot('alternate-before-restart');await context.close();context=null;
  await open();await snapshot('alternate-after-native-restart');
  for(let index=0;index<8;index++) {
    await page.evaluate(async index=>{window.__phase=`cycle-${index}-replace`;await company.showAppearanceSample('side-table-life-items',index%4);},index);
    await snapshot(`cycle-${index}-before-explicit-draw`);
    await page.evaluate(index=>{window.__phase=`cycle-${index}-draw-1`;company.setPreviewClock(33330);company.drawHostFrame();},index);
    await snapshot(`cycle-${index}-after-draw-1`);
    await page.evaluate(index=>{window.__phase=`cycle-${index}-draw-2`;company.drawHostFrame();},index);
    await snapshot(`cycle-${index}-after-draw-2`);
    await page.waitForTimeout(80);await snapshot(`cycle-${index}-after-80ms`);
  }
  await page.screenshot({path:path.join(out,'shadow-on.png')});
  await page.evaluate(()=>{company.world.traverse(object=>{if(object.isDirectionalLight)object.castShadow=false;});company.drawHostFrame();});
  await page.screenshot({path:path.join(out,'shadow-off.png')});
  await page.evaluate(()=>{company.world.traverse(object=>{if(object.isDirectionalLight)object.castShadow=true;});company.drawHostFrame();});
  await page.evaluate(()=>{window.__phase='final-dispose-scene-and-cache';company.pausePreview();company.session.dispose();company.assetLibrary.dispose();});
  await snapshot('after-scene-and-cache-disposal');
  await page.evaluate(()=>{window.__phase='final-dispose-renderer';company.renderer.dispose();});
  await snapshot('after-renderer-disposal');
  const settled=report.snapshots.filter(snapshot=>snapshot.label.endsWith('after-80ms'));
  for(let i=0;i<4;i++)assert.deepEqual(settled[i].memory,settled[i+4].memory);
  const disposed=report.snapshots.find(snapshot=>snapshot.label==='after-scene-and-cache-disposal');
  assert(disposed.bitmapRecords.every(record=>record.width===0&&record.closes===1));
  assert(disposed.shadowMaterialRecords.every(record=>record.disposes===1));
  assert.equal(disposed.memory.geometries,0);
  assert.equal(disposed.memory.textures,3);
  const last=report.snapshots.at(-1);assert.equal(last.memory.textures,0);
  report.status='passed';
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(server)await server.close();report.temporaryServerClosed=true;
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,error:report.error,temporaryServerClosed:report.temporaryServerClosed}));
});

// Actual module CPU review. Canvas, bitmap decode and published catalogs are
// explicit two-pixel fixtures. This never launches a browser or uses a GPU.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(path.join(root,'prototype/package.json'));
const esbuild=require('esbuild');
const out=path.resolve(process.argv[2]||path.join(root,'evidence/m2-surface-layer-cpu-review-v1'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const jsonBytes=value=>Buffer.from(JSON.stringify(value));
const bodySha='62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff';
const origin='https://cpu-fixture.invalid';
const base=new Uint8ClampedArray([20,40,60,128,80,100,120,0]);
const red=new Uint8ClampedArray([220,20,40,255,255,0,0,0]);
const blue=new Uint8ClampedArray([0,40,240,128,0,0,255,0]);
const resources=new Map();
function imageResource(name,pixels){
  const bytes=jsonBytes({width:2,height:1,pixels:[...pixels]});
  resources.set(origin+'/'+name,bytes);return{url:'/'+name,sha256:sha(bytes)};
}
const redFile=imageResource('red.png',red),blueFile=imageResource('blue.png',blue);
const mask=imageResource('mask.png',new Uint8ClampedArray([255,0,0,255,0,0,0,255]));
const neutral=imageResource('neutral.png',new Uint8ClampedArray([192,0,0,255,0,0,0,255]));
const surfaceManifest={schema:'character-surface-layer-v1',variants:[{avatarSha256:bodySha,imageYEqualsUVv:true,
  mapSize:[2,1],materialName:'FixtureLips',sourcePixelSha256:sha(base),layers:[
    {id:'red',order:2,allowedOpacity:[0,1],...redFile},
    {id:'blue',order:1,allowedOpacity:[0,1],...blueFile},
  ]}]};
const surfaceBytes=jsonBytes(surfaceManifest),surfaceIdentity={url:'/surface.json',sha256:sha(surfaceBytes)};
resources.set(origin+'/surface.json',surfaceBytes);
const descriptor=name=>({materialName:name,mapSize:[2,1],maskChannel:'r',imageYEqualsUVv:true,preserveAlpha:true,
  maskUrl:mask.url,maskSha256:mask.sha256});
const paletteManifest={schema:'character-facial-palette-v1',variants:[{avatarSha256:bodySha,parts:{
  iris:{...descriptor('FixtureIris'),colorOperation:'neutral-iris-multiply-v3',neutralChannel:'r',
    neutralMultiplierReference:192,neutralMapSize:[2,1],neutralMapUrl:neutral.url,neutralMapSha256:neutral.sha256},
  lips:descriptor('FixtureLips'),
}}]};
const paletteBytes=jsonBytes(paletteManifest),paletteSha=sha(paletteBytes);
resources.set(origin+'/palette.json',paletteBytes);
const sourceNames=['surface-layer-compositor.js','surface-layers.js','facial-palette.js',
  'appearance-recipe.js','character-appearance.js','surface-layer-catalog.js','facial-palette-contract.js'];
async function identities(){
  return Object.fromEntries(await Promise.all(sourceNames.map(async name=>[name,sha(await fs.readFile(path.join(root,'prototype/src',name)))])));
}
const sources=await identities(),checks=[],findings=[];
await fs.mkdir(out,{recursive:true});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'surface-cpu-review-'));
const report={status:'running',sources,checks,findings,scope:{actualModules:sourceNames,
  injectedFixtures:['Published surface catalog identity','Facial palette manifest URL/hash with original palette version constants',
    'fetch returning SHA-checked fixture JSON bytes','Canvas pixel transport','createImageBitmap JSON fixture decode',
    'Two-pixel texture images, scene traversal and empty outfit/facial geometry preparation domains'],
  realLibrary:'Installed prototype Three.js Texture/Source/material classes and esbuild',
  GPUUsed:false,browserStarted:false,sourceAssetAcceptance:false,runtimeAcceptance:false}};
try{
  const paletteContract=await fs.readFile(path.join(root,'prototype/src/facial-palette-contract.js'),'utf8');
  const patchedContract=paletteContract.replace(/export const FACIAL_PALETTE_MANIFEST_URL=.*?;/,
    "export const FACIAL_PALETTE_MANIFEST_URL='/palette.json';").replace(/export const FACIAL_PALETTE_MANIFEST_SHA256=.*?;/,
    `export const FACIAL_PALETTE_MANIFEST_SHA256='${paletteSha}';`);
  // Keep the production palette identity constants while injecting resource IO.
  const originalPaletteVersion=(await import(pathToFileURL(path.join(root,'prototype/src/facial-palette-contract.js')))).FACIAL_PALETTE_VERSION;
  const contract=patchedContract.replace(/export const FACIAL_PALETTE_VERSION=.*?;/,
    `export const FACIAL_PALETTE_VERSION=${JSON.stringify(originalPaletteVersion)};`);
  const bundle=path.join(temp,'actual-modules.mjs');
  await esbuild.build({stdin:{contents:[
    "export * from './src/surface-layer-compositor.js';",
    "export * from './src/surface-layers.js';",
    "export * from './src/facial-palette.js';",
    "export * from './src/appearance-recipe.js';",
    "export * from './src/character-appearance.js';",
    "export * as THREE from 'three';",
  ].join('\n'),resolveDir:path.join(root,'prototype'),sourcefile:'cpu-review-entry.mjs'},
    outfile:bundle,bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'explicit-cpu-catalog-fixtures',setup(build){
      build.onLoad({filter:/surface-layer-catalog\.js$/},()=>({contents:`export const SURFACE_LAYER_PACKAGE=${JSON.stringify(surfaceIdentity)};`,loader:'js'}));
      build.onLoad({filter:/facial-palette-contract\.js$/},()=>({contents:contract,loader:'js'}));
    }}]});
  report.bundleSha256=sha(await fs.readFile(bundle));
  const m=await import(pathToFileURL(bundle));
  const check=async(name,operation)=>{await operation();checks.push(name);};
  await check('compositor transparent texels and original alpha preserved',()=>{
    const original=new Uint8ClampedArray(base),overlay=new Uint8ClampedArray(red);
    const result=m.composeSurfacePixels(base,[{pixels:red,opacity:1}]);
    assert.deepEqual([...result],[220,20,40,128,80,100,120,0]);
    assert.deepEqual(base,original);assert.deepEqual(red,overlay);assert.notEqual(result,base);
  });
  await check('opacity zero/one endpoints and partial rounding',()=>{
    assert.deepEqual(m.composeSurfacePixels(base,[{pixels:red,opacity:0}]),base);
    assert.deepEqual([...m.composeSurfacePixels(base,[{pixels:red,opacity:.5}])],[120,30,50,128,80,100,120,0]);
  });
  await check('compositor supplied order changes overlapping RGB',()=>{
    const a=m.composeSurfacePixels(base,[{pixels:red,opacity:1},{pixels:blue,opacity:1}]);
    const b=m.composeSurfacePixels(base,[{pixels:blue,opacity:1},{pixels:red,opacity:1}]);
    assert.notDeepEqual(a,b);assert.deepEqual([...b.slice(0,4)],[220,20,40,128]);
  });
  await check('invalid pixels/opacity/selection and duplicate IDs rejected',()=>{
    for(const opacity of [-1,1.01,NaN,Infinity,'1'])assert.throws(()=>m.composeSurfacePixels(base,[{pixels:red,opacity}]));
    assert.throws(()=>m.composeSurfacePixels(new Uint8Array(4),[]));
    assert.throws(()=>m.composeSurfacePixels(base,[{pixels:new Uint8ClampedArray(4),opacity:1}]));
    for(const value of [null,{},[null],[{id:'Bad',opacity:1}],[{id:'red',opacity:-1}],
      [{id:'red',opacity:1,extra:0}],[{id:'red',opacity:1},{id:'red',opacity:.5}],Array(9).fill({id:'red',opacity:1})])
      assert.throws(()=>m.validateSurfaceSelection(value));
    const selection=[{id:'red',opacity:.5}];const validated=m.validateSurfaceSelection(selection);
    selection[0].opacity=1;assert.equal(validated[0].opacity,.5);
  });
  try{m.validateSurfaceSelection(new Array(1));findings.push({severity:'low',file:'prototype/src/surface-layer-compositor.js',
    issue:'Sparse one-element array accepted by selection validator. Array.map skips hole and Set counts one undefined.',
    reproduction:'validateSurfaceSelection(new Array(1))',scope:'Direct JavaScript API only; JSON transport converts holes to null and rejects.'});}catch{}

  class CanvasFixture{
    width=0;height=0;pixels=null;
    getContext(){return{
      drawImage:image=>{this.pixels=new Uint8ClampedArray(image.pixels);},
      getImageData:()=>({data:new Uint8ClampedArray(this.pixels||this.width*this.height*4)}),
      putImageData:data=>{this.pixels=new Uint8ClampedArray(data.data);},
      clearRect:()=>{this.pixels=new Uint8ClampedArray(this.width*this.height*4);},
    };}
  }
  globalThis.document={createElement:name=>{assert.equal(name,'canvas');return new CanvasFixture();}};
  globalThis.location={href:origin+'/',origin};
  let gate=null,fetchFailure=null,bitmapCloses=0;
  globalThis.fetch=async value=>{
    const url=new URL(value,origin).href;
    if(gate&&url===gate.url)await gate.promise;
    if(fetchFailure===url)return{ok:false,status:503};
    const bytes=resources.get(url);assert(bytes,'Unexpected fixture URL '+url);
    return{ok:true,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  };
  globalThis.createImageBitmap=async blob=>{
    const image=JSON.parse(await blob.text());return{...image,pixels:new Uint8ClampedArray(image.pixels),close(){bitmapCloses++;}};
  };
  const disposed=new Map(),originalDispose=m.THREE.Texture.prototype.dispose;
  m.THREE.Texture.prototype.dispose=function(){disposed.set(this,(disposed.get(this)||0)+1);return originalDispose.call(this);};
  function fixture(){
    const texture=new m.THREE.Texture({width:2,height:1,pixels:new Uint8ClampedArray(base)});texture.flipY=false;
    const iris=new m.THREE.MeshBasicMaterial({map:texture});iris.name='FixtureIris';
    const lips=new m.THREE.MeshBasicMaterial({map:texture});lips.name='FixtureLips';lips.shadeMultiplyTexture=texture;
    const vrm={scene:{traverse:visit=>visit({isMesh:true,material:[iris,lips],visible:true})}};
    return{texture,iris,lips,vrm};
  }
  await check('surface manager declared order, map/shade sharing, staged discard and replacement disposal',async()=>{
    const f=fixture(),owner=m.createSurfaceLayers({avatarSha256:bodySha,packageIdentity:surfaceIdentity});
    const assignments=[{record:{material:f.lips,map:f.texture,shadeMap:f.texture},map:f.texture,shadeMap:f.texture}];
    const selection=[{id:'red',opacity:.5},{id:'blue',opacity:1}];
    const prepared=await owner.prepare(assignments,selection,surfaceIdentity.sha256);
    const map=prepared.assignments[0].map;assert.equal(map,prepared.assignments[0].shadeMap);
    assert.deepEqual(map.image.pixels,m.composeSurfacePixels(base,[{pixels:blue,opacity:1},{pixels:red,opacity:.5}]));
    assert.equal(owner.getState().surfaceTextureCount,0);prepared.dispose();assert.equal(disposed.get(map),1);
    const active=await owner.prepare(assignments,selection);active.commit();const old=active.assignments[0].map;
    const repeated=await owner.prepare(assignments,[...selection].reverse());
    assert.deepEqual(repeated.assignments[0].map.image.pixels,old.image.pixels);
    repeated.commit();assert.equal(disposed.get(old),1);const live=repeated.assignments[0].map;
    await assert.rejects(owner.prepare(assignments,[{id:'unknown',opacity:1}]),/Unknown surface/);
    assert.equal(disposed.get(live),undefined);assert.equal(owner.getState().surfaceTextureCount,1);
    await assert.rejects(owner.prepare(assignments,selection,'0'.repeat(64)),/manifest mismatch/);
    owner.dispose();owner.dispose();assert.equal(disposed.get(live),1);assert.equal(disposed.get(f.texture),undefined);
  });
  await check('unpublished package and partially composed texture failure reject and release candidates',async()=>{
    const f=fixture(),assignment={record:{material:f.lips,map:f.texture,shadeMap:f.texture},map:f.texture,shadeMap:f.texture};
    const missing=m.createSurfaceLayers({avatarSha256:bodySha,packageIdentity:null});
    await assert.rejects(missing.prepare([assignment],[{id:'red',opacity:1}]),/No published surface package/);
    assert.equal(missing.getState().surfaceTextureCount,0);missing.dispose();
    const owner=m.createSurfaceLayers({avatarSha256:bodySha,packageIdentity:surfaceIdentity});
    const wrong=new m.THREE.Texture({width:1,height:1,pixels:new Uint8ClampedArray(4)});wrong.flipY=false;
    const before=new Set(disposed.keys());
    await assert.rejects(owner.prepare([{...assignment,shadeMap:wrong}],[{id:'red',opacity:1}]),/source dimensions mismatch/);
    const discarded=[...disposed.keys()].filter(texture=>!before.has(texture));
    assert.equal(discarded.length,1);assert.equal(disposed.get(discarded[0]),1);
    assert.equal(owner.getState().surfaceTextureCount,0);assert.equal(f.lips.map,f.texture);
    assert.equal(disposed.get(f.texture),undefined);assert.equal(disposed.get(wrong),undefined);owner.dispose();
  });
  await check('actual facial palette stale preparation cancellation and failed load preserve current materials',async()=>{
    const f=fixture(),palette=m.createFacialPalette({vrm:f.vrm,avatarSha256:bodySha});
    let release;gate={url:origin+'/palette.json',promise:new Promise(resolve=>{release=resolve;})};
    const slow=palette.set({surfaceLayers:[{id:'red',opacity:1}]});
    await Promise.resolve();assert.equal((await palette.set({reset:true})).applied,true);
    release();gate=null;assert.equal((await slow).cancelled,true);assert.equal(f.lips.map,f.texture);
    assert.equal((await palette.set({surfaceLayers:[{id:'red',opacity:1}]})).applied,true);
    const active=f.lips.map;assert.notEqual(active,f.texture);
    assert.equal((await palette.set({surfaceLayers:[{id:'unknown',opacity:1}]})).applied,false);
    assert.equal(f.lips.map,active);assert.equal(disposed.get(active),undefined);
    const staged=await palette.prepareUpdate({surfaceLayers:[{id:'blue',opacity:1}]});
    assert.equal(f.lips.map,active);staged.dispose();assert.equal(f.lips.map,active);
    assert.equal((await palette.set({reset:true})).applied,true);assert.equal(f.lips.map,f.texture);
    assert.equal(disposed.get(active),1);palette.dispose();assert.equal(disposed.get(f.texture),undefined);
    const broken=fixture(),failed=m.createFacialPalette({vrm:broken.vrm,avatarSha256:bodySha});
    fetchFailure=origin+'/palette.json';assert.equal((await failed.set({surfaceLayers:[{id:'red',opacity:1}]})).applied,false);
    fetchFailure=null;assert.equal(broken.lips.map,broken.texture);failed.dispose();
  });
  await check('dispose while palette loading cancels and retains original textures',async()=>{
    const f=fixture(),palette=m.createFacialPalette({vrm:f.vrm,avatarSha256:bodySha});
    let release;gate={url:origin+'/palette.json',promise:new Promise(resolve=>{release=resolve;})};
    const pending=palette.set({surfaceLayers:[{id:'red',opacity:1}]});palette.dispose();release();gate=null;
    assert.equal((await pending).cancelled,true);assert.equal(f.lips.map,f.texture);assert.equal(disposed.get(f.texture),undefined);
  });
  await check('actual recipe/character appearance v7 surface roundtrip, v1-v6 explicit clear and version refusal',async()=>{
    const f=fixture(),appearance=m.createCharacterAppearance({vrm:f.vrm,avatarSha256:bodySha});
    let revision=0;
    const geometry={getState:()=>({revision,mouthWidth:0,browSample:'none',noseSample:'none',eyeSample:'none'}),
      prepareUpdate:async()=>{revision++;return{isCurrent:()=>true,commit(){},dispose(){}};}};
    const actor={appearance,facialGeometry:geometry,profile:{bodyType:'male',sha256:bodySha},
      config:{outfits:[{index:0,role:'fixture'}],manifestUrl:'/fixture-equipment.json'},getEquipmentRecipe:()=>({})};
    const controller={actor,outfit:0,outfitRevision:0,prepareOutfit:async()=>({isCurrent:()=>true,commit(){},dispose(){}})};
    const v6=m.captureAppearanceRecipe(controller);assert.equal(v6.schema,'workbench-appearance-recipe-v6');
    assert.equal(Object.hasOwn(v6,'surface'),false);assert.equal(m.validateAppearanceRecipe(controller,v6),true);
    assert.equal((await appearance.set({surfaceLayers:[{id:'red',opacity:.5}]})).applied,true);
    const v7=m.captureAppearanceRecipe(controller);assert.equal(v7.schema,'workbench-appearance-recipe-v7');
    assert.deepEqual(v7.surface,{manifestSha256:surfaceIdentity.sha256,layers:[{id:'red',opacity:.5}]});
    assert.equal(m.validateAppearanceRecipe(controller,v7),true);
    const wrong=structuredClone(v6);wrong.surface=v7.surface;assert.throws(()=>m.validateAppearanceRecipe(controller,wrong));
    const empty=structuredClone(v7);empty.surface.layers=[];assert.throws(()=>m.validateAppearanceRecipe(controller,empty));
    const stale=structuredClone(v7);stale.surface.manifestSha256='0'.repeat(64);assert.throws(()=>m.validateAppearanceRecipe(controller,stale));
    for(let version=1;version<=6;version++){
      assert.equal((await m.applyAppearanceRecipe(controller,v7)).applied,true);
      const old=structuredClone(v6);old.schema=`workbench-appearance-recipe-v${version}`;old.rulesVersion=`workbench-appearance-rules-v${version}`;
      if(version<=5)delete old.hairFit;
      for(const [limit,domain] of [[1,'brow'],[2,'nose'],[3,'eye']])if(version<=limit){delete old.geometry[domain+'Sample'];delete old.geometry[domain+'RecipeSha256'];}
      assert.equal((await m.applyAppearanceRecipe(controller,old)).applied,true);
      assert.deepEqual(appearance.getState().surfaceLayers,[]);assert.equal(appearance.getState().surfaceManifestSha256,null);
      assert.equal(f.lips.map,f.texture);assert.equal(m.captureAppearanceRecipe(controller).schema,'workbench-appearance-recipe-v6');
      const illegal=structuredClone(old);illegal.surface=v7.surface;assert.throws(()=>m.validateAppearanceRecipe(controller,illegal));
    }
    appearance.dispose();assert.equal(disposed.get(f.texture),undefined);
  });
  report.bitmapCloseCount=bitmapCloses;
  report.sourceStableDuringRun=JSON.stringify(sources)===JSON.stringify(await identities());
  assert.equal(report.sourceStableDuringRun,true,'Root source changed during this CPU run; rerun against one source snapshot');
  report.status=findings.length?'passed-with-findings':'passed';
}catch(error){report.status='failed';report.error=error.stack;throw error;}
finally{
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  await fs.copyFile(new URL(import.meta.url),path.join(out,'executed-script.mjs'));
  assert.equal(path.dirname(temp),path.resolve(os.tmpdir()),'Temporary cleanup must stay in the OS temporary directory');
  await fs.rm(temp,{recursive:true,force:true});
}
console.log(JSON.stringify({out,status:report.status,checks:checks.length,findings}));

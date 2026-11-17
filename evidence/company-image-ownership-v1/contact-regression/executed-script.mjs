import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {createCompanyScene} from '../src/company/render.js';
import {createCompanyAuthoring} from '../src/company/authoring.js';
import {createCompanyAssetLibrary} from '../src/company/asset-library.js';
import catalog from '../src/company/library-catalog.json' with {type:'json'};
import templates from '../src/company/templates-extended.json' with {type:'json'};
import c1 from '../src/company/examples/c1-two-stations.json' with {type:'json'};
import home from '../src/company/examples/c2-rental-home.json' with {type:'json'};

const report={scope:'CPU Three contact-resource ownership and authoring lifecycle',cases:[],status:'failed'};
const pass=(name,details={})=>report.cases.push({name,passed:true,...details});
const floor=document=>document.nodes.find(node=>node.kind==='floor').id;
const storage={getItem(){return null;},setItem(){}};
const outputArg=process.argv[2];
if(!outputArg)throw new Error('Pass a NEW_OUTPUT_DIR');
const outputDir=path.resolve(outputArg);
const fetchImpl=async url=>{
  const file=path.join('..','public',url.replace(/^\//,''));
  const bytes=await fs.readFile(new URL(file,import.meta.url));
  return new Response(bytes,{status:200});
};
const resourcesFor=document=>document.nodes.filter(node=>node.kind==='facility').map(node=>catalog.resources.find(resource=>resource.id===node.resource.id&&resource.version===node.resource.version)).filter(resource=>resource?.asset);

try {
  {
    const world=new THREE.Scene(),scene=createCompanyScene(world,c1,{catalog,templates,visibleFloorId:floor(c1)});
    const handle=await scene.retainUsePointContact('station-1/chair#seat'),matrix=handle.seat.matrixWorld.clone();
    const second=await scene.retainUsePointContact('station-1/chair#seat');
    assert.equal(second.seat,handle.seat);
    scene.setView({mode:'building'}); assert.equal(scene.resolveUsePoint('station-1/chair#seat'),null); assert(handle.seat.matrixWorld.equals(matrix));
    scene.setView({mode:'floor',floorId:floor(c1)}); handle.release(); handle.release(); second.release(); second.release(); assert.equal(scene.contactResources().length,0);
    scene.dispose(); assert.equal(handle.released,true); pass('visible chair survives view disposal and repeated release');
  }
  const library=createCompanyAssetLibrary({fetchImpl}); await library.preload(resourcesFor(home));
  {
    const world=new THREE.Scene(),scene=createCompanyScene(world,home,{catalog,templates,visibleFloorId:floor(home),assetLibrary:library});
    scene.setView({mode:'building'});
    const left=await scene.retainUsePointContact('rest/sofa#left'),right=await scene.retainUsePointContact('public/sofa#right');
    assert.notEqual(left.seat.matrixWorld.elements.join(','),right.seat.matrixWorld.elements.join(','));
    const before=left.seat.matrixWorld.clone(); const same=await scene.retainUsePointContact('rest/sofa#left');
    assert.equal(same.seat,left.seat); scene.setView({mode:'floor',floorId:floor(home)}); assert(left.seat.matrixWorld.equals(before));
    left.release(); same.release(); right.release(); assert.equal(scene.contactResources().length,0); assert.equal(left.released,true); assert.throws(()=>left.seat,error=>error.code==='contact-handle-invalid'); scene.dispose(); pass('offscreen GLB sofa seats are independent and refcounted');
  }
  {
    const variant=structuredClone(home),publicSofa=variant.nodes.find(node=>node.id==='public/sofa'); publicSofa.resource={id:'timber-sofa',version:1};
    const base=createCompanyAssetLibrary({fetchImpl}); await base.preload(resourcesFor(home)); let releaseView; const viewGate=new Promise(resolve=>{releaseView=resolve;});
    const wrapped={...base,preload:async requested=>{if(requested.some(resource=>resource.id==='timber-sofa'&&resource.version===1))await viewGate; return base.preload(requested);}};
    const session=await createCompanyAuthoring(new THREE.Scene(),home,{catalog,templates,storage,assetLibrary:wrapped});
    const edit=session.apply([{type:'replace-resource',id:'public/sofa',resource:{id:'timber-sofa',version:1}}]); const contact=session.retainUsePointContact('rest/sofa#left');
    const handle=await contact; handle.release(); releaseView(); await edit; assert.equal(base.snapshot().loadedAssets,2); session.dispose(); base.dispose(); pass('contact completion preserves a different GLB needed by an in-flight view edit');
  }
  {
    let busy=true; const world=new THREE.Scene(),scene=createCompanyScene(world,c1,{catalog,templates,visibleFloorId:floor(c1)});
    const point='station-1/chair#seat'; const handle=await scene.retainUsePointContact(point); const text=scene.save();
    assert.throws(()=>scene.prepareChange([{type:'move',id:'station-1/chair',transform:{position:[0,0,.7],yaw:Math.PI}}],{isUsePointBusy:()=>busy}),error=>error.code==='facility-busy');
    assert.throws(()=>scene.restore(text,{isUsePointBusy:()=>busy}),error=>error.code==='facility-busy');
    busy=false; const before=handle.seat.matrixWorld.clone(); const candidate=scene.prepareChange([{type:'set-state',id:'station-1/monitor',state:{on:true}}]); scene.commit(candidate); assert(handle.seat.matrixWorld.equals(before));
    handle.release(); scene.dispose(); pass('busy layout and restore reject while unrelated state keeps contact identity');
  }
  {
    const base=createCompanyAssetLibrary({fetchImpl}); await base.preload(resourcesFor(home)); let delayed=false,release;
    const gate=new Promise(resolve=>{release=resolve;}); const wrapped={...base,preload:async resources=>{if(delayed)await gate; return base.preload(resources);}};
    const scene=createCompanyScene(new THREE.Scene(),home,{catalog,templates,visibleFloorId:floor(home),assetLibrary:wrapped}); scene.setView({mode:'building'}); delayed=true;
    const pending=scene.retainUsePointContact('rest/sofa#left'); const candidate=scene.prepareChange([{type:'move',id:'rest/sofa',transform:{position:[1.2,0,-1],yaw:0}}]); scene.commit(candidate); release(); await assert.rejects(pending,error=>error.code==='contact-resource-stale');
    scene.dispose(); base.dispose(); pass('late contact load is rejected after its facility identity changes');
  }
  {
    const base=createCompanyAssetLibrary({fetchImpl}); await base.preload(resourcesFor(home)); let delayed=false,release; const gate=new Promise(resolve=>{release=resolve;});
    const wrapped={...base,preload:async resources=>{if(delayed)await gate; return base.preload(resources);}}; const session=await createCompanyAuthoring(new THREE.Scene(),home,{catalog,templates,storage,assetLibrary:wrapped}); await session.setView({mode:'building'}); delayed=true;
    const pending=session.retainUsePointContact('rest/sofa#left'); const viewPromise=session.setView({mode:'floor'}); await Promise.resolve(); release(); await viewPromise; const handle=await pending; handle.release(); assert.equal(session.scene.contactResources().length,0); session.dispose(); base.dispose(); pass('authoring view and contact requests complete in either order');
  }
  {
    const base=createCompanyAssetLibrary({fetchImpl}); await base.preload(resourcesFor(home)); let releaseContact,gateEnabled=false; const contactGate=new Promise(resolve=>{releaseContact=resolve;});
    const wrapped={...base,preload:async requested=>{if(gateEnabled&&requested.length)await contactGate; return base.preload(requested);}};
    const session=await createCompanyAuthoring(new THREE.Scene(),home,{catalog,templates,storage,assetLibrary:wrapped}); await session.setView({mode:'building'}); gateEnabled=true;
    const pending=session.retainUsePointContact('rest/sofa#left'); await Promise.resolve(); const edit=session.apply([{type:'move',id:'rest/sofa',transform:{position:[1.2,0,-1],yaw:0}}]); releaseContact(); await edit; await assert.rejects(pending,error=>error.code==='contact-resource-stale'); assert.equal(base.snapshot().loadedAssets,0); session.dispose(); base.dispose(); pass('failed contact request prunes its now-idle GLB cache');
  }
  report.status='passed';
} catch(error) { report.error=String(error); process.exitCode=1; }
await fs.mkdir(outputDir,{recursive:false}); await fs.writeFile(path.join(outputDir,'report.json'),JSON.stringify(report,null,2)+'\n'); await fs.copyFile(new URL(import.meta.url),path.join(outputDir,'executed-script.mjs')); console.log(JSON.stringify({status:report.status,cases:report.cases.length,error:report.error||null,outputDir}));

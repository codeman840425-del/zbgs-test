import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Box3,Raycaster,Scene,Triangle,Vector3} from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import authored from './batch-inputs/equipment-cart-rooms.json' with {type:'json'};
import {runCompanyBatch} from './batch.mjs';
import {checkManagedOutput} from './package-company.mjs';
import {installNodeImageDecodeShim,preflightLibraryAssets} from './preflight-library-assets.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const [argument,...extra]=process.argv.slice(2);
assert(argument&&!extra.length,'Usage: node test-equipment-cart-rooms.mjs FRESH_OUTPUT_DIRECTORY');
const output=path.resolve(argument);
await checkManagedOutput(output,root,{allowDelivery:false});
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.mkdir(output);

const report={status:'running',scope:'Company production, loaded room GLB triangles, live CPU authoring and cold saved-document reopen.',
  rooms:[],operations:[],rejections:[]};
const batchDir=path.join(output,'batch');
const refs=['open','flightcase','tool','display'].map(name=>({id:`equipment-cart-${name}`,version:1}));
const refKey=value=>`${value.id}@${value.version}`;
const resources=new Map(catalog.resources.map(resource=>[refKey(resource),resource]));
const eps=.001;
const read=async file=>JSON.parse(await fs.readFile(file));
const write=(file,text)=>fs.writeFile(path.join(output,file),text,{flag:'wx'});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const vec=position=>new Vector3(...position);
const axis=new Vector3(0,1,0);
const node=(document,id)=>{
  const result=document.nodes.find(item=>item.id===id);
  assert(result,'Missing layout node '+id);
  return result;
};
const object=(author,id)=>{
  const result=author.scene.root.getObjectByName(id);
  assert(result,'Missing installed object '+id);
  return result;
};
const transform=(position,yaw=0)=>({position,yaw});
const move=(id,position,yaw=0)=>({type:'move',id,transform:transform(position,yaw)});
const mount=(id,parentId,surfaceId,position,yaw=0)=>({type:'attach-surface',id,parentId,surfaceId,transform:transform(position,yaw)});
const replace=(id,resource)=>({type:'replace-resource',id,resource});
const near=(actual,expected)=>assert(vec(actual).distanceTo(vec(expected))<1e-7,`${actual} differs from ${expected}`);
const cartRole='cart-and-equipment-storage';

function triangles(rootObject) {
  const result=[];
  rootObject.traverse(mesh=>{
    if(!mesh.isMesh) return;
    const geometry=mesh.geometry,index=geometry.index;
    const end=Math.min(index?.count??geometry.attributes.position.count,geometry.drawRange.start+geometry.drawRange.count);
    const vertex=i=>mesh.getVertexPosition(index?index.getX(i):i,new Vector3()).applyMatrix4(mesh.matrixWorld);
    for(let i=geometry.drawRange.start;i+2<end;i+=3) result.push(new Triangle(vertex(i),vertex(i+1),vertex(i+2)));
  });
  assert(result.length,rootObject.name+' must be real triangle geometry');
  return result;
}

function physicalContact(author,child,host,surface) {
  const device=object(author,child.id), holder=object(author,host.id);
  assert.equal(device.parent,holder,'The real render object must remain under its declared facility.');
  const deck=holder.getObjectByName(host.resource.supportNodes[surface.id]);
  assert(deck?.isMesh,'The selected layer must resolve to a real tray mesh.');
  const worldToHost=holder.matrixWorld.clone().invert(), fitted=new Box3(), points=triangles(device);
  for(const triangle of points) for(const point of [triangle.a,triangle.b,triangle.c])
    fitted.expandByPoint(point.clone().applyMatrix4(worldToHost));
  const [cx,cz]=surface.center,[hx,hz]=surface.halfSize;
  assert(fitted.min.x>=cx-hx-eps&&fitted.max.x<=cx+hx+eps&&fitted.min.z>=cz-hz-eps&&fitted.max.z<=cz+hz+eps&&
    fitted.max.y<=surface.topY+surface.clearanceHeight+eps,'Mounted device physically exceeds the selected tray clearance.');
  assert(Math.abs(fitted.min.y-surface.topY)<eps,'Actual GLB underside must meet the declared deck height.');
  const floor=holder.getWorldPosition(new Vector3()).y+surface.topY;
  let contactSamples=0,maxGap=0;
  for(const triangle of points) {
    if([triangle.a,triangle.b,triangle.c].some(point=>Math.abs(point.y-floor)>eps)||triangle.getArea()<1e-8)continue;
    if(triangle.getNormal(new Vector3()).y>-.98)continue;
    const point=triangle.getMidpoint(new Vector3());
    const ray=new Raycaster(point.clone().addScaledVector(axis,.02),axis.clone().negate(),0,.04);
    const [hit]=ray.intersectObject(deck,false);
    assert.equal(hit?.object,deck,'A device undersurface misses the actual selected tray.');
    const gap=point.distanceTo(hit.point);
    assert(gap<eps,'A device undersurface floats above its actual tray.');
    maxGap=Math.max(maxGap,gap);
    contactSamples++;
  }
  assert(contactSamples>0,child.id+' needs positive-area physical contact');
  return {id:child.id,parentId:host.id,resource:child.node.resource,surfaceId:surface.id,mesh:deck.name,
    local:child.node.transform,world:child.world,actualMin: fitted.min.toArray(),actualMax:fitted.max.toArray(),contactSamples,maxGap,state:child.state};
}

function observe(author) {
  const derived=deriveCompany(author.document,catalog,templates), carts=derived.facilities.filter(item=>item.resource.mountRole===cartRole);
  author.scene.root.updateMatrixWorld(true);
  const checked=carts.map(cart=>{
    const model=object(author,cart.id), room=object(author,cart.roomId);
    assert.equal(model.parent,room);
    near(model.getWorldPosition(new Vector3()).toArray(),cart.world.position);
    near(model.getWorldDirection(new Vector3()).toArray(),[Math.sin(cart.world.yaw),0,Math.cos(cart.world.yaw)]);
    const floorY=object(author,cart.floorId).getWorldPosition(new Vector3()).y;
    const bottomY=new Box3().setFromObject(model,true).min.y;
    assert(Math.abs(bottomY-floorY)<eps,'Cart GLB must touch its installed floor.');
    assert(derived.obstacles.some(item=>item.id===cart.id),'Cart must contribute its real registered blocking footprint.');
    assert(!derived.usePoints.some(item=>item.facilityId===cart.id),'Cart must not introduce character use points.');
    const contents=derived.facilities.filter(item=>item.node.parentId===cart.id).map(child=>{
      const surface=cart.resource.supportSurfaces.find(item=>item.id===child.node.attachment?.surfaceId);
      assert(surface);
      near(object(author,child.id).getWorldPosition(new Vector3()).toArray(),child.world.position);
      near(object(author,child.id).getWorldDirection(new Vector3()).toArray(),[Math.sin(child.world.yaw),0,Math.cos(child.world.yaw)]);
      return physicalContact(author,child,cart,surface);
    });
    return {id:cart.id,resource:cart.node.resource,world:cart.world,bottomY,contents};
  });
  return {carts:checked,portals:inspectCompanyPlacement(author.document,catalog,templates).checkedPortals};
}

async function withCompany(document,additional,work) {
  const derived=deriveCompany(document,catalog,templates);
  const wanted=[...derived.facilities,...derived.surfaceFinishes].map(item=>item.resource).concat(additional);
  const entries=new Map(),storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
  return preflightLibraryAssets({root,resources:[...new Set(wanted)],validate:async library=>{
    const author=await createCompanyAuthoring(new Scene(),document,{catalog,templates,storage,assetLibrary:library,mirrorPreflight:()=>{}});
    try { return await work(author); }
    finally { author.dispose(); }
  }});
}

async function reject(author,label,operation,code,details={}) {
  const before=await author.export(),scene=author.scene.root;
  await assert.rejects(()=>author.apply([operation]),error=>{
    assert.equal(error.code,code,label+' '+error.message);
    for(const [field,value] of Object.entries(details)) assert.equal(error.details?.[field],value);
    report.rejections.push({label,code:error.code,path:error.path,details:error.details});
    return true;
  });
  assert.equal(author.scene.root,scene,label+' changed the loaded scene');
  assert.equal(await author.export(),before,label+' changed the saved document');
}

async function rejectDetachedModel(initial) {
  const room=initial.id+'/ground/live',id=room+'/cart-flightcase/camera';
  const present=node(initial,id),original=resources.get(refKey(present.resource)),publicRoot=path.join(root,'prototype/public');
  const sourceFile=path.join(publicRoot,original.asset.url.slice(1)),originalBytes=await fs.readFile(sourceFile);
  assert.equal(hash(originalBytes),original.asset.sha256);
  const header=Buffer.from(originalBytes.subarray(0,20)),jsonEnd=20+header.readUInt32LE(12);
  assert.equal(header.readUInt32LE(0),0x46546c67);
  const model=JSON.parse(originalBytes.subarray(20,jsonEnd));
  const graph=model.scenes[model.scene??0];
  const floatingNode=model.nodes.length;
  model.nodes.push({name:'diagnostic-floating-device-root',translation:[0,.015,0],children:graph.nodes});
  graph.nodes=[floatingNode];
  const data=Buffer.from(JSON.stringify(model));
  const padded=Buffer.concat([data,Buffer.alloc((4-data.length%4)%4,0x20)]),binary=originalBytes.subarray(jsonEnd);
  header.writeUInt32LE(padded.length,12);
  header.writeUInt32LE(header.length+padded.length+binary.length,8);
  const malformed=Buffer.concat([header,padded,binary]);
  const overlay={...catalog,resources:catalog.resources.map(resource=>resource===original?{
    ...original,asset:{...original.asset,bytes:malformed.length,sha256:hash(malformed)},
  }:resource)};
  const withoutCamera=structuredClone(initial);
  withoutCamera.nodes=withoutCamera.nodes.filter(item=>item.id!==id);
  const reinstall={type:'add-facility',id,parentId:present.parentId,resource:present.resource,
    attachment:present.attachment,transform:present.transform,state:present.state};
  const admittedData=prepareCompanyChange(withoutCamera,[reinstall],{catalog:overlay,templates}).document;
  inspectCompanyPlacement(admittedData,overlay,templates);
  await installNodeImageDecodeShim();
  const library=createCompanyAssetLibrary({fetchImpl:async url=>new Response(url===original.asset.url?malformed:
    await fs.readFile(path.join(publicRoot,url.slice(1))))});
  const storage={getItem:()=>null,setItem:()=>{}};
  let author;
  try {
    author=await createCompanyAuthoring(new Scene(),withoutCamera,{catalog:overlay,templates,storage,assetLibrary:library,mirrorPreflight:()=>{}});
    await reject(author,'physical camera GLB rises 15 mm above its correct attachment',reinstall,'invalid-cart-device-contact');
    const result=report.rejections.at(-1);
    assert.equal(result.path,id);
    result.glb={file:'floating-camera.negative.glb',originalSha256:original.asset.sha256,modifiedSha256:hash(malformed),liftM:.015};
    await write(result.glb.file,malformed);
  } finally { author?.dispose();library.dispose(); }
  assert.equal(hash(await fs.readFile(sourceFile)),original.asset.sha256);
}
async function editStudio(author,initial) {
  const room=initial.id+'/ground/live';
  const open=room+'/cart-open',flight=room+'/cart-flightcase',desk=room+'/desk',camera=room+'/desk-camera';
  const lowerAudio=open+'/audio', copy=room+'/cart-copy';
  const oldCamera=structuredClone(node(initial,camera)), oldAudio=structuredClone(node(initial,lowerAudio));
  assert.equal(oldAudio.state.on,false);
  assert(!Object.hasOwn(oldCamera,'attachment'));
  await reject(author,'cart on real south door',move(flight,[0,0,2.60]),'blocked-portal',{obstacleId:flight,regionId:room});
  await reject(author,'camera overhangs actual tray',mount(camera,open,'upper',[.24,.82,0]),'invalid-support-fit');
  await reject(author,'camera cannot take existing camera space',mount(camera,open,'upper',[-.11,.82,.03]),'overlapping-supported-props');
  await reject(author,'rotated audio device exceeds lower tray depth',move(lowerAudio,[0,.30,0],Math.PI/2),'invalid-support-fit');
  await reject(author,'camera asks for unknown deck',mount(camera,open,'middle',[.11,.82,0]),'missing-support-surface');
  await reject(author,'ordinary desktop monitor cannot declare a cart layer',{
    type:'add-facility',id:room+'/rejected-monitor',parentId:open,resource:{id:'monitor-aurora',version:1},
    attachment:{surfaceId:'upper'},transform:transform([0,.82,0]),
  },'invalid-support-attachment');
  await reject(author,'desktop cannot be given a cart layer',mount(camera,desk,'upper',[0,.84,.1]),'invalid-support-attachment');
  await reject(author,'cart cannot be replaced by a desk',replace(flight,{id:'desk-frame',version:1}),'incompatible-replacement');
  async function transact(label,ops) {
    await author.apply(ops);
    const result=observe(author);
    report.operations.push({label,revision:author.document.revision,ops,carts:result.carts});
    return result;
  }
  await transact('desk camera transferred to upper tray',[mount(camera,open,'upper',[.13,.82,.03])]);
  assert.deepEqual(node(author.document,camera).resource,oldCamera.resource);
  await transact('audio temporarily moved to desktop and camera transferred down to lower tray',[
    mount(lowerAudio,desk,'desktop',[.38,.84,0]),mount(camera,open,'lower',[.12,.30,0]),
  ]);
  assert.equal(node(author.document,lowerAudio).state.on,false);
  assert(!Object.hasOwn(node(author.document,lowerAudio),'attachment'));
  await transact('camera moved to the other cart',[mount(camera,flight,'lower',[.13,.30,.02])]);
  await transact('camera returned to its original desktop and audio to the lower tray',[
    mount(camera,desk,'desktop',oldCamera.transform.position),mount(lowerAudio,open,'lower',oldAudio.transform.position),
  ]);
  assert.deepEqual(node(author.document,camera),oldCamera);
  assert.deepEqual(node(author.document,lowerAudio),oldAudio);
  const oldChildren=author.document.nodes.filter(item=>item.parentId===open);
  const before=observe(author).carts.find(cart=>cart.id===open);
  const turned=await transact('cart moves and turns with both children',[move(open,[-1.18,0,-1.62],Math.PI/2)]);
  const moved=turned.carts.find(cart=>cart.id===open);
  assert.notDeepEqual(moved.world,before.world);
  for(const item of moved.contents) assert.notDeepEqual(item.world,before.contents.find(child=>child.id===item.id).world);
  assert.deepEqual(author.document.nodes.filter(item=>item.parentId===open),oldChildren);
  await transact('loaded assembly copies with independent stable children',[
    {type:'copy-facility',id:open,newId:copy,transform:transform([1.42,0,.42],Math.PI/2)},
  ]);
  const copied=author.document.nodes.filter(item=>item.parentId===copy);
  assert.deepEqual(copied.map(({resource,attachment,transform,state})=>({resource,attachment,transform,state})),
    oldChildren.map(({resource,attachment,transform,state})=>({resource,attachment,transform,state})));
  assert(copied.every(child=>child.id.startsWith(copy+'/')&&!oldChildren.some(item=>item.id===child.id)));
  const unrelated=structuredClone(author.document.nodes.filter(item=>item.id!==copy));
  for(const look of refs.filter(ref=>ref.id!=='equipment-cart-open')) {
    await transact('appearance replacement '+look.id,[replace(copy,look)]);
    assert.deepEqual(author.document.nodes.filter(item=>item.id!==copy),unrelated);
  }
}

try {
  const carts=refs.map(ref=>resources.get(refKey(ref)));
  assert(carts.every(resource=>resource?.asset),'Register all four real cart GLBs before running the room test.');
  assert.equal(new Set(carts.map(resource=>resource.asset.sha256)).size,4);
  for(const cart of carts) {
    assert(compareFacilityFunction(carts[0],cart).compatible,cart.id+' needs the same complete functional contract.');
    assert.equal(cart.mountRole,cartRole);
    assert.deepEqual(cart.supportSurfaces.map(surface=>[surface.id,surface.topY]),[['lower',.30],['upper',.82]]);
    const file=path.join(root,'prototype/public',cart.asset.url.slice(1));
    assert.equal(hash(await fs.readFile(file)),cart.asset.sha256);
  }
  report.resources=carts.map(({id,version,asset})=>({id,version,sha256:asset.sha256}));
  const batch=await runCompanyBatch(authored,{outputDirectory:batchDir});
  report.batch=batch;
  assert(batch.ok,JSON.stringify(batch));
  for(const {key} of authored.items) {
    const input=path.join(batchDir,key), text=await fs.readFile(path.join(input,'save.json'),'utf8');
    const initial=await decodeCompanySave(text,catalog,templates);
    assert.deepEqual(initial,await read(path.join(input,'layout.json')));
    const isRental=key==='equipment-cart-rental';
    if(!isRental) await rejectDetachedModel(initial);
    const roomReport={key,initialSaveSha256:hash(text),floorYaw:node(initial,key+'/ground').transform.yaw};
    report.rooms.push(roomReport);
    const saveName=key+'.cold-save.json';
    let savedDocument;
    await withCompany(initial,carts,async author=>{
      roomReport.initial=observe(author);
      assert.equal(roomReport.initial.carts.length,2);
      assert.deepEqual(roomReport.initial.carts.map(cart=>cart.contents.map(child=>child.surfaceId).sort()),[['lower','upper'],['lower','upper']]);
      assert.equal(roomReport.floorYaw,isRental?Math.PI/2:0);
      const expectedPortal=key+'/ground/'+(isRental?'portal-stream-living':'entry');
      assert(roomReport.initial.portals.some(portal=>portal.connectionId===expectedPortal&&portal.connected));
      if(!isRental) await editStudio(author,initial);
      assert.deepEqual(author.document.nodes.filter(item=>!item.id.includes('/ground/live/cart')&&!item.id.endsWith('/desk-camera')),
        initial.nodes.filter(item=>!item.id.includes('/ground/live/cart')&&!item.id.endsWith('/desk-camera')));
      await author.save();
      const bytes=author.readSavedText(key);
      savedDocument=structuredClone(author.document);
      assert.deepEqual(await decodeCompanySave(bytes,catalog,templates),savedDocument);
      roomReport.final=observe(author);
      roomReport.finalSaveSha256=hash(bytes);
      await write(saveName,bytes);
    });
    await withCompany(initial,[],async fresh=>{
      const bytes=await fs.readFile(path.join(output,saveName),'utf8');
      await fresh.import(bytes);
      assert.equal(hash(bytes),roomReport.finalSaveSha256);
      assert.deepEqual(fresh.document,savedDocument);
      assert.deepEqual(observe(fresh),roomReport.final);
      assert.equal(await fresh.export(),bytes);
      roomReport.coldReopened=true;
    });
  }
  const repeat=await runCompanyBatch(authored,{outputDirectory:batchDir});
  assert.deepEqual(repeat.results.map(item=>item.status),['idempotent','idempotent']);
  report.retry=repeat;
  report.status='passed';
  console.log(JSON.stringify({status:report.status,report:path.join(output,'report.json'),rooms:report.rooms.map(room=>room.key)}));
} catch(error) {
  report.status='failed';
  report.error={message:error.message,stack:error.stack};
  console.error(error);
  process.exitCode=1;
} finally {
  await write('report.json',JSON.stringify(report,null,2)+'\n');
}

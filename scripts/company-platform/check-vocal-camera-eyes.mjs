import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {installedCameraPose,framingFov} from '../../prototype/src/company/camera-view.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {checkSingingRoom} from './check-singing-room.mjs';
import {checkManagedOutput} from './package-company.mjs';

const root=path.resolve(import.meta.dirname,'../..'),source='assets-source/company-vocal-height-check-v1/';
const args=parseArgs({options:{output:{type:'string'},rooms:{type:'string'},'preview-fit':{type:'boolean'}}}).values;
assert(args.output,'Use --output PROJECT_REPORT.json, optionally --preview-fit before adopting the measured camera position');
const output=path.resolve(root,args.output);
await checkManagedOutput(output,root,{allowDelivery:false});
assert(!args.output.split(/[\\/]/).includes('..') && /\.json$/i.test(output),'Expected a managed JSON report');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>fs.readFile(path.join(root,file));
const json=async file=>JSON.parse(await read(file));
const trajectory=await read(source+'camera-trajectories.json.gz'),hullBytes=await read(source+'camera-right-iris-hull.json');
assert.equal(sha(trajectory),'7569e4e1c448168d4d914c9576f53c4f6296f12a1dfa949a6ae150e72130a281');
assert.equal(sha(hullBytes),'25e269d1ed62b58abe87e32e0e8415b72ceee56e22a0ad52e8b43efced71444b');
const corpus=JSON.parse(gunzipSync(trajectory)),iris=JSON.parse(hullBytes);
const rentBytes=await read(source+'camera-rental-iris-hull.json');
assert.equal(sha(rentBytes),'fba9cbea7e11cee63203ab69386b5f7a345a294b0f32ec62c3a7af794430f9ed');
const rentIris=JSON.parse(rentBytes);
const legacy=await json('scripts/company-platform/batch-inputs/vocal-fit-rooms.json');
const candidate=await json('scripts/company-platform/batch-inputs/vocal-height-rooms.json');
const input=(item,profile,localX,deskX)=>{
  const ops=structuredClone(item.operations);
  if(localX!==undefined) ops.find(o=>o.id.endsWith('/camera')).transform.position[0]=localX;
  if(deskX!==undefined)ops.find(o=>o.id.endsWith('/camera-desk')).transform.position=deskX;
  const result=prepareCompanyChange(createCompanyScaleV2(item.input,catalog,templates),ops,{catalog,templates}).document;
  result.singingRooms=structuredClone(item.singingRooms);
  return profile==='low'?prepareCompanyChange(result,[{type:'set-vocal-height',id:result.singingRooms[0].roles.mic,profile}],{catalog,templates}).document:result;
};
const vec=a=>new T.Vector3(...a), up=new T.Vector3(0,1,0);
function project(p,lens) {
  const u=1/(p.z-lens.z);assert(u>0);
  return [p.x*u,(p.y-lens.y)*u,u];
}
function meshProjection(mesh,lens,worldToMic=new T.Matrix4()) {
  const positions=mesh.geometry.attributes.position,index=mesh.geometry.index,points=[],set=new Set(),edges=[];
  for(let i=0;i<positions.count;i++)points.push(project(mesh.localToWorld(new T.Vector3().fromBufferAttribute(positions,i)).applyMatrix4(worldToMic),lens));
  for(let i=0;i<(index?.count??positions.count);i+=3){
    const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
    for(let j=0;j<3;j++) {
      const a=ids[j],b=ids[(j+1)%3],key=Math.min(a,b)*points.length+Math.max(a,b);
      if(!set.has(key)){set.add(key);edges.push([a,b]);}
    }
  }
  return {points,edges};
}
// A ray from (lensX,lensY,lensZ) has common h=(y-lensY)/(z-lensZ). In each h section
// lensX=(xQ/zQ-xP/zP)/(1/zQ-1/zP), using depths relative to lensZ. On each pair of
// triangle edges that quotient is fractional-linear. Its extrema occur at section endpoints.
function shadow(target,blocker) {
  let left=Infinity,right=-Infinity;
  const supports={};
  function endpoint(x,note) {
    if(x<left){left=x;supports.left=note;}
    if(x>right){right=x;supports.right=note;}
  }
  function cut(points,other,order) {
    for(const [n,[x,h,u]] of points.entries())for(const [i,j] of other.edges) {
      const a=other.points[i],b=other.points[j];
      if(h<Math.min(a[1],b[1])||h>Math.max(a[1],b[1]))continue;
      const dy=b[1]-a[1];
      for(const t of dy===0?[0,1]:[(h-a[1])/dy]) {
        const d=u-(a[2]+t*(b[2]-a[2])); assert(Math.abs(d)>1e-8);
        const lensX=(x-(a[0]+t*(b[0]-a[0])))/d;
        if(lensX<left||lensX>right)endpoint(lensX,{vertexOn:order,point:n,edge:[i,j],weight:t});
      }
    }
  }
  cut(target.points,blocker,'target');
  if(target.edges.length)cut(blocker.points,target,'grille');
  return Number.isFinite(left)&&Number.isFinite(right)?{left,right,supports}:null;
}
function intervals(frames) {
  const groups=[];
  for(const i of frames) {
    const last=groups.at(-1);
    if(last && last[1]===i-1)last[1]=i;
    else groups.push([i,i]);
  }
  return groups;
}
async function measure(doc,trace,original,counterexample=false) {
  const [rule]=doc.singingRooms,derived=deriveCompany(doc,catalog,templates);
  const facility=derived.facilities.find(f=>f.id===rule.roles.camera), mic=derived.facilities.find(f=>f.id===rule.roles.mic);
  const resources=[...derived.facilities,...derived.surfaceFinishes].filter(f=>f.floorId===facility.floorId).map(f=>f.resource);
  const admission=original||counterexample?null:await checkSingingRoom(doc,rule,{root,catalog,templates});
  let result;
  await preflightLibraryAssets({root,resources,validate:library=>{
    const scene=createCompanyScene(new T.Scene(),doc,{catalog,templates,visibleFloorId:facility.floorId,assetLibrary:library,mirrorPreflight:()=>{}});
    try{
      scene.root.updateMatrixWorld(true);
      const host=scene.root.getObjectByName(rule.roles.camera),pose=installedCameraPose(host,{forward:'+Z',lensNode:'camera-lens'});
      assert(pose && host && Math.abs(pose.forward.dot(up))<1e-8);
      const lens=pose.position,preview=new T.PerspectiveCamera(framingFov(16/9),16/9,.01,100);
      preview.position.copy(lens);preview.lookAt(lens.clone().add(pose.forward));preview.updateMatrixWorld(true);
      assert(Math.abs(preview.fov-trace.lens.fovY)<1e-8 && pose.forward.distanceTo(vec(trace.lens.forward))<1e-7);
      if(original)assert(lens.distanceTo(vec(trace.lens.origin))<1e-7);
      const roomMeshes=[];
      scene.root.traverseVisible(o=>{
        if(!o.isMesh)return;
        for(let parent=o;parent;parent=parent.parent)if(parent===host)return;
        const materials=[o.material].flat();
        if(materials.every(m=>!m.visible||m.opacity===0))return;
        for(const m of materials)m.side=T.DoubleSide;
        roomMeshes.push(o);
      });
      const blocked=[[],[],[]],maxNDC=[0,0],critical=[],name=o=>o.userData.name||o.name;
      for(const [frame,row] of trace.frames.entries()) {
        let mask=0;
        const checks=[];
        for(let j=0;j<3;j++) {
          const target=vec(row.slice(1+3*j,4+3*j)),dir=target.clone().sub(lens);
          const distance=dir.length(),ndc=target.clone().project(preview);
          assert(Math.abs(ndc.x)<=1 && Math.abs(ndc.y)<=1 && Math.abs(ndc.z)<=1,'Outside installed camera FOV');
          maxNDC[0]=Math.max(maxNDC[0],Math.abs(ndc.x));maxNDC[1]=Math.max(maxNDC[1],Math.abs(ndc.y));
          const hit=new T.Raycaster(lens,dir.normalize(),.00001,distance+.0002).intersectObjects(roomMeshes,false)[0];
          if(hit){mask|=1<<j;blocked[j].push(frame);}
          checks.push(hit?{name:name(hit.object),face:hit.faceIndex,point:hit.point.toArray(),distance:hit.distance}:null);
        }
        if(!counterexample)assert.equal(mask,original?row[10]:0,'Unexpected lens occlusion '+trace.room+' '+trace.profile+' frame '+frame+': '+JSON.stringify(checks));
        if(trace.room==='singing-studio'&&trace.profile==='standard'&&(frame===0||frame>=555&&frame<=571))critical.push({frame,hits:checks});
      }
      result={room:trace.room,profile:trace.profile,actor:trace.actor,record:trace.record,frames:trace.frames.length,
        staticRoomMeshes:roomMeshes.length,rayCount:3*trace.frames.length,pose:{lens:lens.toArray(),forward:pose.forward.toArray(),aspect:preview.aspect,fovYDegrees:preview.fov},maxAbsoluteNDC:maxNDC,
        blockedCounts:blocked.map(s=>s.length),blockedIntervals:blocked.map(intervals),mic:{id:mic.resource.id,sha256:mic.resource.asset.sha256},critical,
        ...(admission?{admission:{portal:admission.portalId,access:admission.access.reachable??admission.access.portalId,
          approach:admission.approach.portalId,exit:admission.exit.portalId,cameraSupport:admission.supports.camera}}:{})};
      if(original&&trace.room==='singing-studio'&&trace.profile==='standard'){
        assert.equal(critical[0].hits[1].face,792);assert.equal(blocked[1].length,201);
        const grille=scene.root.getObjectByName(rule.roles.mic).getObjectByName('singing-mic-pickup');
        const projected=meshProjection(grille,lens);
        const centers={points:trace.frames.map(r=>project(vec(r.slice(4,7)),lens)),edges:[]};
        const centerShadow=shadow(centers,projected),irisShadow=shadow(iris,projected);
        // The room recipe authors camera placement in centimetres. Round away from the occlusion envelope.
        const parentX=host.parent.getWorldPosition(new T.Vector3()).x;
        const desiredLocalX=Math.ceil((irisShadow.right-parentX)*100)/100;
        result.fit={centerShadow,irisShadow,oldLocalX:host.position.x,parentX,desiredLocalX,
          newLensX:parentX+desiredLocalX,marginAtLensMetres:parentX+desiredLocalX-irisShadow.right,
          irisVerticesPerFrame:iris.verticesPerFrame,maxIrisDimensionsMetres:iris.maxAxisSizesMetres};
      }
    }finally{scene.dispose();}
  }});
  return result;
}
async function occlusionBands(doc,trace) {
  const [rule]=doc.singingRooms,derived=deriveCompany(doc,catalog,templates),camera=derived.facilities.find(f=>f.id===rule.roles.camera);
  const resources=[...derived.facilities,...derived.surfaceFinishes].filter(f=>f.floorId===camera.floorId).map(f=>f.resource);
  const bands=[];
  await preflightLibraryAssets({root,resources,validate:library=>{
    const scene=createCompanyScene(new T.Scene(),doc,{catalog,templates,visibleFloorId:camera.floorId,assetLibrary:library,mirrorPreflight:()=>{}});
    try{
      scene.root.updateMatrixWorld(true);
      const host=scene.root.getObjectByName(rule.roles.camera),worldToMic=scene.root.getObjectByName(rule.roles.mic).matrixWorld.clone().invert();
      const lens=vec(trace.lens.origin).applyMatrix4(worldToMic);
      const perf=rule.performer,warp=new T.Matrix4().makeRotationY(perf.yaw).setPosition(...perf.position);
      const targets=['left','right','lip'].map((name,j)=>({name,points:trace.frames.map(row=>project(vec(row.slice(1+3*j,4+3*j)).applyMatrix4(worldToMic),lens)),edges:[]}));
      for(const name of ['mouth','eye'])targets.push({name:'reference-'+name,points:[project(vec(perf[name]).applyMatrix4(warp),lens)],edges:[]});
      if(trace.room==='singing-studio'&&trace.profile==='standard')targets.push({name:'complete-right-iris',...iris});
      if(trace.room==='singing-rental'&&trace.profile==='low')targets.push({name:'complete-right-iris',...rentIris});
      const set=targets.map(t=>({...t,h0:Math.min(...t.points.map(p=>p[1])),h1:Math.max(...t.points.map(p=>p[1]))}));
      scene.root.traverseVisible(mesh=>{
        if(!mesh.isMesh)return;
        for(let o=mesh;o;o=o.parent)if(o===host)return;
        const bounds=new T.Box3().setFromObject(mesh,true).applyMatrix4(worldToMic);
        // Restrict perspective solving to foreground solids that fit between lens and face.
        // Walls/structural geometry crossing either plane remain in the final full-room raycast.
        if(bounds.min.z<=lens.z+.0001||bounds.max.z>=.60||bounds.max.y<lens.y||bounds.min.x>1.5||bounds.max.x< -1.5)return;
        const projected=meshProjection(mesh,lens,worldToMic),h0=Math.min(...projected.points.map(p=>p[1])),h1=Math.max(...projected.points.map(p=>p[1]));
        for(const target of set){
          if(target.h1<h0 || target.h0>h1)continue;
          const interval=shadow(target,projected);
          if(interval && interval.right>=-2 && interval.left<=2)bands.push({profile:trace.profile,target:target.name,mesh:mesh.userData.name||mesh.name,left:interval.left,right:interval.right});
        }
      });
    }finally{scene.dispose();}
  }});
  return bands;
}
function exclusions(bands) {
  const sorted=[...bands].sort((a,b)=>a.left-b.left),merged=[];
  for(const b of sorted){
    const last=merged.at(-1);
    if(last && last.right>=b.left){if(b.right>last.right){last.right=b.right;last.rightWitness=b;}}
    else merged.push({left:b.left,right:b.right,leftWitness:b,rightWitness:b});
  }
  return merged;
}

const baseline=[],final=[],counterexamples=[],saves={};
for(const trace of corpus.cases){
  baseline.push(await measure(input(legacy.items.find(i=>i.key===trace.room),'standard'),trace,true));
}
const fits={};
for(const item of candidate.items){
  const oldItem=legacy.items.find(i=>i.key===item.key),studio=item.key==='singing-studio';
  const oldDesk=oldItem.operations.find(o=>o.id.endsWith('/camera-desk')),oldCamera=oldItem.operations.find(o=>o.id.endsWith('/camera'));
  const [cx,,cz]=oldDesk.transform.position,angle=oldDesk.transform.yaw;
  const cos=Math.cos(angle),sin=Math.sin(angle),parentX=cx*cos-cz*sin;
  const center=parentX+oldCamera.transform.position[0],bands=[];
  for(const tr of corpus.cases.filter(t=>t.room===item.key)){
    bands.push(...await occlusionBands(input(item,tr.profile,oldCamera.transform.position[0],oldDesk.transform.position),tr));
  }
  const union=exclusions(bands),blocked=union.find(i=>i.left<=center&&i.right>=center);
  assert(blocked);
  const nearest=Math.abs(blocked.left-center)<Math.abs(blocked.right-center)?'left':'right';
  const boundary=blocked[nearest],round=nearest==='left'?Math.floor:Math.ceil;
  const lensX=round(boundary*100)/100;
  const desk=catalog.resources.find(r=>r.id===oldDesk.resource.id),camera=catalog.resources.find(r=>r.id===oldCamera.resource.id);
  const limit=desk.surface.halfSize[0]-camera.footprint.halfSize[0];
  const cameraX=Number(T.MathUtils.clamp(lensX-parentX,-limit,limit).toFixed(6));
  const delta=lensX-parentX-cameraX,deskPosition=[Number((cx+delta*cos).toFixed(6)),0,Number((cz-delta*sin).toFixed(6))];
  fits[item.key]={union,bands,nearest,boundary,deskPosition,cameraX,lensX,originalLensLocalX:center,marginAtLensMetres:Math.abs(lensX-boundary),
    ...(studio?{centerShadow:baseline.find(s=>s.fit).fit.centerShadow,irisShadow:baseline.find(s=>s.fit).fit.irisShadow}:{})};
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(fits).map(([key,s])=>[key,{desk:s.deskPosition,camera:s.cameraX,boundary:s.boundary,union:s.union}]))));
for(const trace of corpus.cases){
  const item=candidate.items.find(i=>i.key===trace.room),fit=fits[trace.room];
  if(!args['preview-fit']) {
    assert.equal(item.operations.find(o=>o.id.endsWith('/camera')).transform.position[0],fit.cameraX,'Recipe camera differs from measured position');
    assert.deepEqual(item.operations.find(o=>o.id.endsWith('/camera-desk')).transform.position,fit.deskPosition,'Camera desk position differs');
  }
  const intermediate=(cameraX,desk)=>input(item,trace.profile,cameraX,desk);
  if(trace.room==='singing-studio'){
    const before=intermediate(.28,[-.47,0,-2.34]);
    try {await checkSingingRoom(before,before.singingRooms[0],{root,catalog,templates});}
    catch(error){
      assert.equal(error.code,'singing-camera-occluded');
      counterexamples.push({room:trace.room,profile:trace.profile,cameraLocalX:.28,reason:error.code,details:error.details});
    }
  }else if(trace.profile==='low'){
    const failed=await measure(intermediate(0,[-1.67,0,.42]),trace,false,true);
    assert(failed.blockedCounts[1]>0);
    counterexamples.push({room:trace.room,profile:trace.profile,cameraLocalX:0,blockedCounts:failed.blockedCounts,blockedIntervals:failed.blockedIntervals});
  }
  let doc=input(item,trace.profile,args['preview-fit']?fit.cameraX:undefined,args['preview-fit']?fit.deskPosition:undefined);
  if(args.rooms){
    assert(!args['preview-fit'],'A received room is checked in its published pose');
    const folder=path.resolve(args.rooms,trace.room);
    let raw;
    for(const filename of ['save.json','company-save.json']){
      try{raw=await fs.readFile(path.join(folder,filename));break;}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    assert(raw,'Missing received room save for '+trace.room);
    saves[trace.room]=sha(raw);doc=await decodeCompanySave(raw.toString('utf8'),catalog,templates);
    const [rule]=doc.singingRooms,camera=doc.nodes.find(n=>n.id===rule.roles.camera),desk=doc.nodes.find(n=>n.id===camera.parentId);
    assert.equal(camera.transform.position[0],fit.cameraX);assert.deepEqual(desk.transform.position,fit.deskPosition);
    const mic=doc.nodes.find(n=>n.id===rule.roles.mic),want=rule.heightProfiles[trace.profile].resource;
    if(mic.resource.id!==want.id || mic.resource.version!==want.version)doc=prepareCompanyChange(doc,[{type:'set-vocal-height',id:mic.id,profile:trace.profile}],{catalog,templates}).document;
  }
  final.push(await measure(doc,trace,false));
}
assert(counterexamples.some(e=>e.reason==='singing-camera-occluded'));
const report={scope:'Captured skinned iris centers and 32-lip centroid for four real 901-frame sessions, raycast against visible static room solids. Character self/peer optics are outside this room-geometry replay.',
  inputs:{trajectories:sha(trajectory),studioIrisHull:sha(hullBytes),rentalIrisHull:sha(rentBytes),companyManifest:corpus.sourceCompanyManifest,fusionManifest:corpus.sourceFusionManifest,
    sources:corpus.cases.map(({source,sourceSha256})=>({source,sourceSha256}))},previewFit:Boolean(args['preview-fit']),fits,baseline,final,counterexamples,saves};
const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');
await fs.mkdir(path.dirname(output),{recursive:true});
try{await fs.writeFile(output,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;assert(bytes.equals(await fs.readFile(output)),'Refusing to overwrite another receipt');}
console.log(JSON.stringify({baseline:baseline.map(r=>r.blockedCounts),final:final.map(r=>r.blockedCounts)}));
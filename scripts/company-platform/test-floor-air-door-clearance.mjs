import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// Read-only. Redirect stdout to the desired JSON receipt.
const [defaultPackage,namedPackage,installedSource,originalBad,touchingFile]=process.argv.slice(2);
assert(touchingFile && process.argv.length===7,
  'Usage: node test-floor-air-door-clearance.mjs DEFAULT_PACKAGE NAMED_PACKAGE INSTALLED_SOURCE ORIGINAL_BAD_SAVE TOUCHING_SAVE');
const source=path.resolve(installedSource), sha=b=>createHash('sha256').update(b).digest('hex');
const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const mod=file=>import(pathToFileURL(path.join(source,file)).href);
const near=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<tol,a+' != '+b);
const xz=p=>[p[0],p[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],point=(a,v,t)=>[a[0]+v[0]*t,a[1]+v[1]*t];
const eps=1e-11;

function closest(a,b,p) {
  const ab=sub(b,a),length2=dot(ab,ab),t=length2?Math.max(0,Math.min(1,dot(sub(p,a),ab)/length2)):0;
  const q=point(a,ab,t);
  return {point:q,t,distance:Math.hypot(...sub(q,p))};
}
function segments(a,b,c,d) {
  const u=sub(b,a),v=sub(d,c),det=cross(u,v);
  if(Math.abs(det)>eps){
    const t=cross(sub(c,a),v)/det,s=cross(sub(c,a),u)/det;
    if(t>=0 && t<=1 && s>=0 && s<=1){const p=point(a,u,t);return {distance:0,line:p,mesh:p};}
  }
  return [...[c,d].map(p=>{const q=closest(a,b,p);return {distance:q.distance,line:q.point,mesh:p};}),
    ...[a,b].map(p=>{const q=closest(c,d,p);return {distance:q.distance,line:p,mesh:q.point};})].sort((l,r)=>l.distance-r.distance)[0];
}
function hull(points) {
  const p=[...new Map(points.map(a=>[a.map(x=>Math.round(x*1e7)).join(','),a])).values()]
    .sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  function chain(arr){const h=[];for(const q of arr){while(h.length>1 && cross(sub(h.at(-1),h.at(-2)),sub(q,h.at(-1)))<eps)h.pop();h.push(q);}return h.slice(0,-1);}
  return chain(p).concat(chain(p.slice().reverse()));
}
function triangleDistance(a,b,t) {
  const hits=t.map((v,i)=>segments(a,b,v,t[(i+1)%3]));
  if(Math.abs(cross(sub(t[1],t[0]),sub(t[2],t[0])))>eps)for(const p of [a,b]){
    const signs=t.map((v,i)=>cross(sub(t[(i+1)%3],v),sub(p,v)));
    if(signs.every(n=>n>=-eps)||signs.every(n=>n<=eps))return {distance:0,line:p,mesh:p};
  }
  return hits.sort((i,j)=>i.distance-j.distance)[0];
}
async function measure(pkg,savePath,defaultId) {
  const manifestBytes=await fs.readFile(path.join(pkg,'transfer-manifest.json')),manifest=JSON.parse(manifestBytes);
  const declarations=new Map(manifest.files.map(f=>[f.path,f]));
  async function pinned(rel){
    const f=declarations.get(rel);assert(f,'Unlisted '+rel);const bytes=await fs.readFile(path.join(pkg,rel));
    assert.equal(sha(bytes),f.sha256,rel);assert.equal(bytes.length,f.bytes,rel);return bytes;
  }
  // The sealed source remains unmodified. Use an installed copy only after comparing
  // its actual domain modules and dependency lock to this package's manifest.
  const domain=[...declarations.values()].filter(f=>/^source\/prototype\/src\/company\/.*\.(js|json)$/.test(f.path));
  assert(domain.some(f=>f.path.endsWith('/placement.js')) && domain.some(f=>f.path.endsWith('/space.js')));
  for(const f of domain){const rel=f.path.slice('source/'.length);
    assert.equal(sha(await fs.readFile(path.join(source,rel))),sha(await pinned(f.path)),rel);}
  const lock=await pinned('source/prototype/package-lock.json');
  assert.equal(sha(await fs.readFile(path.join(source,'prototype/package-lock.json'))),sha(lock));
  const threeVersion=(await readJson(path.join(source,'prototype/node_modules/three/package.json'))).version;
  assert.equal(threeVersion,JSON.parse(lock).packages['node_modules/three'].version);
  const [{deriveCompany,pointInTransform},{inspectCompanyConnections},{inspectCompanyPlacement},
    {GLTFLoader},T]=await Promise.all([mod('prototype/src/company/document.js'),mod('prototype/src/company/space.js'),
    mod('prototype/src/company/placement.js'),mod('prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js'),
    mod('prototype/node_modules/three/build/three.module.js')]);
  const catalog=JSON.parse(await pinned('source/prototype/src/company/library-catalog.json'));
  const templates=JSON.parse(await pinned('source/prototype/src/company/templates-extended.json'));
  const payload=await pinned(savePath),envelope=JSON.parse(payload),doc=envelope.document;
  assert.equal(doc.id,'air-rental');assert.equal(JSON.parse(await pinned('data/save.json')).document.id,defaultId);
  const air=doc.nodes.find(n=>n.id===doc.id+'/ground/live/air'), res=catalog.resources.find(r=>r.id===air.resource.id&&r.version===air.resource.version);
  const glbURL=res.asset.url,glb=await pinned('viewer'+glbURL);assert.equal(sha(glb),res.asset.sha256);
  const sidecar=JSON.parse(await pinned('viewer'+glbURL.replace(/model\.glb$/,'resource.json')));
  assert.deepEqual(sidecar.footprint,res.footprint);assert.equal(sidecar.asset.sha256,sha(glb));
  const model=(await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.length),'' )).scene;
  model.updateMatrixWorld(true);
  const shapes=[];let minY=Infinity,maxY=-Infinity;
  model.traverse(m=>{
    if(!m.isMesh)return;
    const g=m.geometry,n=g.index?.count??g.attributes.position.count;
    for(let i=0;i<n;i+=3){
      const vs=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(g.attributes.position,g.index?g.index.getX(i+k):i+k).applyMatrix4(m.matrixWorld).toArray());
      minY=Math.min(minY,...vs.map(v=>v[1]));maxY=Math.max(maxY,...vs.map(v=>v[1]));
      shapes.push({node:m.name,triangle:i/3,vs});
    }
  });
  near(minY,0,1e-6);
  const contact=shapes.filter(t=>t.vs.every(v=>Math.abs(v[1]-minY)<1e-6));
  const ring=hull(contact.flatMap(t=>t.vs.map(xz)));assert.equal(ring.length,32);
  const radii=ring.map(p=>Math.hypot(...p));const radius=Math.max(...radii);near(Math.min(...radii),radius);
  const area=Math.abs(ring.reduce((s,a,i)=>s+cross(a,ring[(i+1)%ring.length]),0))/2;
  near(area,16*radius**2*Math.sin(Math.PI/16));
  assert.deepEqual(res.footprint,{center:[0,0],halfSize:[.2,.2],blocking:true});
  const base=inspectCompanyPlacement(doc,catalog,templates);const crossingRadius=base.rules.portalCrossingEnvelopeRadius;
  const measureSave=(saved,bytes,label)=>{
    const d=saved.document,instance=d.nodes.find(n=>n.id===air.id),z=instance.transform.position[2];
    assert.equal(saved.schema,envelope.schema);
    const normal=structuredClone(saved);normal.document.nodes.find(n=>n.id===air.id).transform.position[2]=air.transform.position[2];
    assert.deepEqual(normal,envelope,'Only the facility Z may differ');
    const derived=deriveCompany(d,catalog,templates),w=derived.worlds.get(air.id),region=derived.worlds.get(air.parentId);
    const floorId=derived.floorIds.get(instance.id),floor=inspectCompanyConnections(d,catalog,templates).floors.find(f=>f.floorId===floorId);
    const connection=floor.connections.find(c=>c.id===doc.id+'/ground/portal-stream-living');
    const side=connection.from.regionId===air.parentId?connection.from:connection.to;
    const other=side===connection.from?connection.to:connection.from;
    const a=xz(side.world.interior),b=xz(side.world.center), as=xz(side.local.interior),bs=xz(side.local.center);
    const world=v=>pointInTransform(w,v),center=xz(world([0,0,0]));
    const toRoom=v=>new T.Vector3(...v).sub(new T.Vector3(...region.position))
      .applyAxisAngle(new T.Vector3(0,1,0),-region.yaw).toArray();
    const corners=derived.obstacles.find(o=>o.id===instance.id).corners.map(toRoom).map(xz);
    const axisSlack=[0,1].map(k=>Math.max(Math.min(...corners.map(p=>p[k]))-Math.max(as[k],bs[k]),
      Math.min(as[k],bs[k])-Math.max(...corners.map(p=>p[k]))));
    const squareSlack=Math.max(...axisSlack)-crossingRadius;
    const centreHit=closest(a,b,center),circle=centreHit.distance-radius;
    function nearest(tris,start=a,end=b){
      let best=null;
      for(const q of tris){
        const candidate=triangleDistance(start,end,q.vs.map(v=>xz(world(v))));
        if(!best||candidate.distance<best.distance)best={...candidate,node:q.node,triangle:q.triangle};
        if(best.distance===0)break;
      }
      return {...best,clearanceBeyondCrossingRadius:best.distance-crossingRadius};
    }
    let placement;
    try {
      const r=inspectCompanyPlacement(d,catalog,templates);
      const portals=r.checkedPortals.filter(p=>p.connectionId===connection.id);
      assert.equal(portals.length,2);assert(portals.every(p=>p.connected));
      placement={ok:true,checkedPortalSides:portals,grids:r.rooms.filter(room=>[side.regionId,other.regionId].includes(room.id)).map(({id,grid,entryWorld})=>({id,grid,entryWorld}))};
    } catch(e) {
      if(e.code!=='blocked-portal')throw e;
      assert.equal(e.path,connection.id);assert.equal(e.details.obstacleId,instance.id);placement={ok:false,code:e.code,path:e.path,details:e.details};
    }
    const patch=nearest(contact),whole=nearest(shapes);
    const peerInterior=xz(other.world.interior),fullCrossing=nearest(shapes,a,peerInterior);
    const peerSide=nearest(shapes,b,peerInterior);
    near(fullCrossing.distance,Math.min(whole.distance,peerSide.distance));
    assert.equal(placement.ok,label==='published');
    if(label==='published'){near(squareSlack,.0001);assert(patch.clearanceBeyondCrossingRadius>0 && whole.clearanceBeyondCrossingRadius>0);}
    if(label==='touching')near(squareSlack,0);
    return {case:label,saveSha256:sha(bytes),instanceId:air.id,z,deviceLocal:instance.transform,deviceWorld:w,roomWorld:region,
      peerWorld:derived.worlds.get(other.regionId),floorWorld:derived.worlds.get(floorId),portal:{id:connection.id,from:side,to:other},
      roomLocalFootprintCornersXZ:corners,expandedSquareSignedSlack:squareSlack,
      circumscribedDisk:{baseRadius:radius,minimumAxisToCenter:centreHit.distance,nearestAxisPointWorldXZ:centreHit.point,
        axisParameter:centreHit.t,signedAxisToDiskBoundary:circle,signedSlack:circle-crossingRadius},
      physicalFloorPatchWorldXZ:patch,wholeModelHorizontalProjectionWorldXZ:whole,
      peerSideProjectedMeshWorldXZ:peerSide,interiorToInteriorProjectedMeshWorldXZ:fullCrossing,placement};
  };
  const boundary=measureSave(envelope,payload,'published'),badBytes=await fs.readFile(originalBad),touchBytes=await fs.readFile(touchingFile);
  return {package:path.resolve(pkg),manifestSha256:sha(manifestBytes),build:manifest.buildId,sourceDigest:manifest.sourceDigest,savePath,
    defaultDocument:defaultId,installedSource:source,verifiedDomainFiles:domain.length,lockSha256:sha(lock),threeVersion,
    glbURL,glbSha256:sha(glb),footprint:res.footprint,triangles:shapes.length,modelVerticalMetres:[minY,maxY],
    floorContact:{meshNames:[...new Set(contact.map(t=>t.node))],triangles:contact.length,hullVertices:ring.length,ringLocalXZ:ring,areaSquareMetres:area},
    rules:base.rules,cases:[boundary,measureSave(JSON.parse(touchBytes),touchBytes,'touching'),measureSave(JSON.parse(badBytes),badBytes,'original-blocked')]};
}
const reports=[await measure(defaultPackage,'data/save.json','air-rental'),await measure(namedPackage,'data/rooms/air-rental/save.json','air-home')];
assert.deepEqual(reports[0].cases,reports[1].cases);assert.equal(reports[0].glbSha256,reports[1].glbSha256);
console.log(JSON.stringify({status:'passed',units:'metres unless noted',measurement:'Continuous finite door-interior to threshold-centre segment, each point in floor XZ. The whole-mesh measurement projects every loaded triangle; mesh witness XZ is a nearest projected point. Mesh distance to a filled projected face is zero for an intersection; this zero is not a penetration-depth estimate. The circular estimate circumscribes the measured 32-sided ground patch. The production slab check expands the room-local AABB by a square and treats contact as blocked. Connectivity refers to the static same-floor grid.',packages:reports},null,2));

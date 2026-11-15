import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from '../../../prototype/node_modules/three/build/three.module.js';
import {forearmContourRails,createForearmContourWorkspace} from './forearm-contour-rails.js';
import {forearmContourRails as legacyRails} from '../source/forearm-contour-rails.js';
import {projectedSegmentInterval} from './segment-triangle-projection.reference.js';
import {createSkinContactWorkspace,createProjectedContactWorkspace,createProjectedInterval,projectedSegmentIntervalInto} from './forearm-contact-workspace.js';
const V=THREE.Vector3,rows=JSON.parse(await fs.readFile(new URL('./offline-coverage-fixture.json',import.meta.url))).rows;
const profiles=JSON.parse(await fs.readFile(new URL('../female.json',import.meta.url))).profiles;
const grid=createProjectedContactWorkspace(),interval=createProjectedInterval(),workspaces=new Map(profiles.map(p=>[p.side,createForearmContourWorkspace(THREE,p)]));
let railPairs=0,intervals=0,candidateQueries=0,alphaDecisions=0;
function legacyGrid(triangles,u,v){const cells=new Map();for(const t of triangles){t.projectedOld=t.points.flatMap(p=>[p.dot(u),p.dot(v)]);const us=t.points.map(p=>p.dot(u)/.04),vs=t.points.map(p=>p.dot(v)/.04);for(let x=Math.floor(Math.min(...us));x<=Math.floor(Math.max(...us));x++)for(let y=Math.floor(Math.min(...vs));y<=Math.floor(Math.max(...vs));y++){const key=x+':'+y;let list=cells.get(key);if(!list){list=[];cells.set(key,list);}list.push(t);}}return cells;}
function oldCandidates(cells,su,sv,eu,ev){const set=new Set();for(let x=Math.floor(Math.min(su,eu)/.04);x<=Math.floor(Math.max(su,eu)/.04);x++)for(let y=Math.floor(Math.min(sv,ev)/.04);y<=Math.floor(Math.max(sv,ev)/.04);y++)for(const t of cells.get(x+':'+y)||[])set.add(t);return [...set];}
for(const row of rows){
 const triangles=row.fittedWaistTriangles.map((p,i)=>({ordinal:i,points:p.map(p=>new V(...p)),projected:new Array(6),candidateStamp:0}));
 for(const arm of row.arms){
  const b=Math.min(1,row.sitProgress/.35),blend=b*b*(3-2*b),out=new V((arm.side==='left'?1:-1)*(1-blend)*.8,blend*.5,1).normalize();
  const start=new V(...arm.elbow),end=new V(...arm.wrist),profile=profiles.find(p=>p.side===arm.side);
  const old=legacyRails(THREE,start,end,profile,out),next=forearmContourRails(THREE,start,end,profile,out,workspaces.get(arm.side));
  assert.deepEqual(next.map(r=>r.map(p=>p.toArray())),old.map(r=>r.map(p=>p.toArray())));railPairs+=old.length;
  const u=new V().crossVectors(out,new V(0,1,0)).normalize(),v=new V().crossVectors(out,u).normalize();
  const cells=legacyGrid(triangles,u,v);grid.build(triangles,u,v);
  for(const t of triangles)assert.deepEqual(t.projected,t.projectedOld);
  for(const [s,e]of next){const su=s.dot(u),sv=s.dot(v),eu=e.dot(u),ev=e.dot(v),a=oldCandidates(cells,su,sv,eu,ev),b=grid.query(su,sv,eu,ev);assert.deepEqual(b.map(t=>t.ordinal),a.map(t=>t.ordinal));candidateQueries++;
   for(const t of b){const oldI=projectedSegmentInterval(su,sv,eu,ev,t.projected),newI=projectedSegmentIntervalInto(su,sv,eu,ev,t.projected,interval);assert.deepEqual(newI,oldI);intervals++;
    if(oldI)for(let k=0;k<=4;k++){const at=oldI.lo+(oldI.hi-oldI.lo)*k/4,at2=newI.lo+(newI.hi-newI.lo)*k/4;assert.equal(at2,at);const p=new V(),q=new V();for(let j=0;j<3;j++){p.addScaledVector(t.points[j],oldI.start[j]+(oldI.end[j]-oldI.start[j])*at);q.addScaledVector(t.points[j],newI.start[j]+(newI.end[j]-newI.start[j])*at2);}assert.deepEqual(q.toArray(),p.toArray());alphaDecisions++;}
   }
  }
 }
}
// Exercise cache reuse/invalidation with REAL Three SkinnedMesh plus morph and bone animation.
const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));geo.setIndex([0,1,2]);
geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,0],4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));geo.morphAttributes.position=[new THREE.Float32BufferAttribute([0,0,.2,1,0,.1,0,1,.3],3)];
const mesh=new THREE.SkinnedMesh(geo,new THREE.MeshBasicMaterial()),bone=new THREE.Bone();mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));const skin=createSkinContactWorkspace(THREE);let retained;
for(let frame=0;frame<30;frame++){bone.rotation.z=frame*.03;mesh.position.set(frame*.01,0,0);mesh.morphTargetInfluences[0]=frame/30;mesh.updateMatrixWorld(true);const got=skin.refresh(mesh,{frame});if(frame===0)retained=got;else assert.equal(got,retained);for(let i=0;i<3;i++)assert.deepEqual(got[0].points[i].toArray(),mesh.getVertexPosition(i,new V()).applyMatrix4(mesh.matrixWorld).toArray());}
geo.index.setX(0,2);geo.index.setX(2,0);geo.index.needsUpdate=true;const changed=skin.refresh(mesh,null);assert.notEqual(changed,retained);assert.deepEqual(changed[0].ids,[2,1,0]);
geo.setAttribute('uv',new THREE.Float32BufferAttribute([1,1,0,1,1,0],2));const uvChanged=skin.refresh(mesh,null);assert.notEqual(uvChanged,changed);assert.equal(uvChanged[0].uv,geo.attributes.uv);
// Exact clipping degeneracy and crossing cases beyond the actual fixture.
let seed=7741;const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296)*4-2;
for(let i=0;i<10000;i++){const t=Array.from({length:6},rand),q=Array.from({length:4},rand);if(i%9===0)t[4]=t[2],t[5]=t[3];assert.deepEqual(projectedSegmentIntervalInto(...q,t,interval),projectedSegmentInterval(...q,t));}
const report={passed:true,actualCapturedPoses:rows.length,railPairs,candidateQueries,intervals,alphaSamplePositionsCompared:alphaDecisions,randomClippingCases:10000,skinnedCacheFrames:30,indexAndUVInvalidation:true,limits:'Frozen actual waist triangles/arm poses, not fresh runtime alpha textures or full solved actor. All interval/sample positions exact; unchanged alpha function itself not replaced. No visual/performance acceptance.'};await fs.writeFile(new URL('./node-equivalence.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));

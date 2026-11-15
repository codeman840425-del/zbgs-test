import fs from 'node:fs';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import path from 'node:path';
import * as THREE from '../../../prototype/node_modules/three/build/three.module.js';
import {projectedHull} from '../source/hand-contour-workspace.mjs';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),fixture=JSON.parse(fs.readFileSync(path.join(dir,'evidence/actual-pose-fixture.json'),'utf8')),rows=[];
for(const pose of fixture.poses)for(const side of ['left','right']){
 const t=Math.max(0,Math.min(1,pose.sitProgress/.35)),blend=t*t*(3-2*t),outward=new THREE.Vector3((side==='left'?1:-1)*(1-blend)*.8,blend*.5,1).normalize(),u=new THREE.Vector3().crossVectors(outward,new THREE.Vector3(0,1,0)).normalize(),v=new THREE.Vector3().crossVectors(outward,u).normalize();let vertices=0,rails=0;const groups=[];
 for(const [key,source]of Object.entries(pose.groups).filter(([key])=>key.startsWith(side+':'))){const points=source.map(p=>{const w=new THREE.Vector3(...p.world);return{index:p.index,u:w.dot(u),v:w.dot(v),depth:w.dot(outward)};}),hull=projectedHull(points),inward=points.reduce((a,b)=>a.depth<b.depth?a:b),edges=new Set();
  const add=(a,b)=>{if(a===b)return;edges.add([a.index,b.index].sort((a,b)=>a-b).join(':'));};
  for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length];add(a,b);add(inward,a);for(const p of points)assert((b.u-a.u)*(p.v-a.v)-(b.v-a.v)*(p.u-a.u)>=-1e-12);}
  vertices+=points.length;rails+=edges.size;groups.push({group:key,vertices:points.length,hullVertices:hull.length,rails:edges.size});
 }rows.push({frame:pose.frame,side,sitProgress:pose.sitProgress,vertices,rails,groups});
}
const report={passed:true,actualPoses:fixture.poses.length,arms:rows.length,sourceSHA256:fixture.report.sourceSHA256,railsPerArm:{min:Math.min(...rows.map(x=>x.rails)),max:Math.max(...rows.map(x=>x.rails)),mean:rows.reduce((s,x)=>s+x.rails,0)/rows.length},rows,scope:'Actual projected semantic subgroup convex outlines contain selected skin points. All rail endpoints are actual skin points, without minimum-depth flattening. Finite rails do NOT prove complete interior coverage or collision correction.'};
fs.writeFileSync(path.join(dir,'evidence/exact-contour-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,actualPoses:report.actualPoses,railsPerArm:report.railsPerArm}));

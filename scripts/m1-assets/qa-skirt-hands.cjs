const {chromium}=require('../../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});
try{await page.goto(process.argv[2]||'http://127.0.0.1:5173/');await page.waitForFunction(()=>__debug?.ready);
const result=await page.evaluate(async()=>{
const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();d.setPaused(true);d.reset();d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(true);d.setCorrections('full');
const seat=d.snapshot().chair;a.root.position.set(...seat.approach);c.yaw=seat.yaw;a.root.rotation.y=seat.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);a.resetSecondary?.();for(let i=0;i<240;i++)c.simulate(1/120);d.view('side');
const mesh=d.scene.getObjectByName('M1_UniformSkirt_Constrained'),indices=mesh.geometry.index;
const V=a.root.position.constructor;
const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material,texture=material.map,uv=mesh.geometry.attributes.uv,bary=new V();
const alphaCanvas=document.createElement('canvas');alphaCanvas.width=texture.image.width;alphaCanvas.height=texture.image.height;const alphaCtx=alphaCanvas.getContext('2d');alphaCtx.drawImage(texture.image,0,0);const pixels=alphaCtx.getImageData(0,0,alphaCanvas.width,alphaCanvas.height).data;
function visibleHit(t){const ia=indices.getX(t),ib=indices.getX(t+1),ic=indices.getX(t+2);const u=uv.getX(ia)*bary.x+uv.getX(ib)*bary.y+uv.getX(ic)*bary.z,v=uv.getY(ia)*bary.x+uv.getY(ib)*bary.y+uv.getY(ic)*bary.z;const x=Math.max(0,Math.min(alphaCanvas.width-1,Math.floor(u*alphaCanvas.width))),y=Math.max(0,Math.min(alphaCanvas.height-1,Math.floor((texture.flipY?1-v:v)*alphaCanvas.height)));return pixels[(y*alphaCanvas.width+x)*4+3]/255>=material.alphaTest;}
// Moller-Trumbore ray/triangle; uses the live avatar's Vector3 constructor.
// This test does not import dev-server-only node_modules URLs.
const edge1=new V(),edge2=new V(),cross=new V(),from=new V(),cross2=new V();
const ray={origin:new V(),direction:new V(),intersectTriangle(a,b,c,_cull,out){
 edge1.subVectors(b,a);edge2.subVectors(c,a);cross.crossVectors(this.direction,edge2);const determinant=edge1.dot(cross);if(Math.abs(determinant)<1e-10)return null;
 const inverse=1/determinant;from.subVectors(this.origin,a);const u=from.dot(cross)*inverse;if(u<0||u>1)return null;
 cross2.crossVectors(from,edge1);const v=this.direction.dot(cross2)*inverse;if(v<0||u+v>1)return null;
 const t=edge2.dot(cross2)*inverse;if(t<0)return null;bary.set(1-u-v,u,v);return out.copy(this.origin).addScaledVector(this.direction,t);
}};
const hit=new V(),direction=new V(),offset=new V(),up=new V(0,1,0),sideAxis=new V();
const stats=[],keys={};let maxHits=0,vertices;
for(let step=0;step<840;step++){
if(step===0)c.action('sit');if(step===480)c.action('stand');c.simulate(1/120);
vertices=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new V()).applyMatrix4(mesh.matrixWorld));
const hits=[],segments=[];
for(const side of ['left','right']){
const bone=n=>a.vrm.humanoid.getRawBoneNode(side+n)?.getWorldPosition(new V());
const elbow=bone('LowerArm'),wrist=bone('Hand'),finger=bone('MiddleDistal')||bone('MiddleProximal');
for(const [name,start,end,radius]of [['forearm',elbow,wrist,.012],['hand',wrist,finger,.016]]){
if(!start||!end)continue;segments.push({side,part:name,start:start.toArray(),end:end.toArray()});direction.subVectors(end,start);const length=direction.length();direction.divideScalar(length);sideAxis.crossVectors(direction,up).normalize();
const other=new V().crossVectors(direction,sideAxis).normalize();
for(const [rail,x,y]of [['center',0,0],['edge1',1,0],['edge2',-1,0],['edge3',0,1],['edge4',0,-1]]){
offset.copy(sideAxis).multiplyScalar(radius*x).addScaledVector(other,radius*y);ray.origin.copy(start).add(offset);ray.direction.copy(direction);
for(let t=0;t<indices.count;t+=3){if(ray.intersectTriangle(vertices[indices.getX(t)],vertices[indices.getX(t+1)],vertices[indices.getX(t+2)],false,hit)&&hit.distanceTo(ray.origin)<length-1e-6&&visibleHit(t)){hits.push({side,part:name,rail,triangle:t/3,point:hit.toArray()});break;}}
}
}}
const m=d.motion().getMetrics();stats.push({step,t:step/120,mode:c.mode,sitProgress:m.sitProgress,hits,segments,handContacts:m.handContacts});
if(hits.length>maxHits||[516,540,564,733,744,750].includes(step)){maxHits=Math.max(maxHits,hits.length);d.advance(0);keys[step]=d.renderer.domElement.toDataURL('image/png').split(',')[1];if(step===750){d.view('front');d.advance(0);keys['750-front']=d.renderer.domElement.toDataURL('image/png').split(',')[1];d.view('side');}}
}
return{build:d.buildInfo,method:'Actual displayed skirt triangles with material UV alphaMASK filtering versus raw forearm/palm segments plus four 12mm/16mm parallel rails; sampled each 1/120s over complete sit/hold/rise. Not full swept triangle/skin-volume CCD.',stats,maxHits,keys};
});
const out=path.join(root,'output/playwright/m1-skirt-hands',process.env.QA_LABEL||'current');await fs.mkdir(out,{recursive:true});for(const[k,v]of Object.entries(result.keys))await fs.writeFile(path.join(out,k+'.png'),Buffer.from(v,'base64'));delete result.keys;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({frames:result.stats.length,hitFrames:result.stats.filter(s=>s.hits.length).length,maxHits:result.maxHits,firstHit:result.stats.find(s=>s.hits.length)}));
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

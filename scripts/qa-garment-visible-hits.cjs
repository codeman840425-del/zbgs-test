// Locate visible garment artifacts without changing product geometry or materials.
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,output]=process.argv.slice(2),out=path.resolve(output);
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const core=await fs.readFile('prototype/node_modules/three/build/three.core.js','utf8');
  await page.route('**/__qa_three_core.mjs',route=>route.fulfill({contentType:'text/javascript',body:core}));
  await page.goto(base+'?body=female');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
  const identity=await verifyCandidate(page,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  const result=await page.evaluate(async()=>{
   const {Raycaster,Vector2}=await import('/__qa_three_core.mjs');
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar(),V=a.root.position.constructor;
   d.reset();d.setPaused(true);d.setBodyMode('dressed');d.setOutfit(1);d.setDynamics(true);d.setCorrections('full');
   a.root.position.set(-3.8,0,2.2);a.root.rotation.y=c.yaw=Math.PI/2;c.turnPolicy.reset(c.yaw);d.motion().reset();a.update(0);
   const textures=new Map();
   function alphaAt(m,uv){
    if(!m.map||!uv)return{alpha:m.opacity,cutoff:m.alphaTest,visible:m.opacity>=m.alphaTest};
    let tex=textures.get(m.map);if(!tex){const canvas=document.createElement('canvas');canvas.width=m.map.image.width;canvas.height=m.map.image.height;const ctx=canvas.getContext('2d');ctx.drawImage(m.map.image,0,0);tex={width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data};textures.set(m.map,tex);}
    const at=m.map.transformUv(uv.clone()),x=Math.max(0,Math.min(tex.width-1,Math.floor(at.x*tex.width))),y=Math.max(0,Math.min(tex.height-1,Math.floor(at.y*tex.height))),alpha=tex.data[(y*tex.width+x)*4+3]/255*m.opacity;
    return{alpha,cutoff:m.alphaTest,visible:alpha>=m.alphaTest,rgb:Array.from(tex.data.slice((y*tex.width+x)*4,(y*tex.width+x)*4+3)),uv:uv.toArray(),pixel:[x,y]};
   }
   function capture(label){
    a.root.updateMatrixWorld(true);a.root.traverse(m=>m.skeleton?.update());
    const target=a.vrm.humanoid.getRawBoneNode('hips').getWorldPosition(new V()).add(new V(0,-.05,0)),camera=d.cameraObject().clone();
    camera.position.copy(target).add(new V(Math.sin(c.yaw)*.9,.08,Math.cos(c.yaw)*.9));camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    d.renderer.render(d.scene,camera);
    const meshes=[];a.root.traverse(m=>{if(!m.isMesh)return;for(let n=m;n;n=n.parent)if(!n.visible)return;if(!m.layers.test(camera.layers))return;m.computeBoundingSphere?.();m.computeBoundingBox?.();meshes.push(m);});
    const samples=[['black-plate',520,174],['white-left',490,115],['white-right',535,110],['shirt-control',550,230],['hem-control',540,284]].map(([name,x,y])=>{
     const ray=new Raycaster();ray.layers.enableAll();ray.setFromCamera(new Vector2(x/d.renderer.domElement.width*2-1,1-y/d.renderer.domElement.height*2),camera);
     const hits=ray.intersectObjects(meshes,false).slice(0,15).map(hit=>{
      const m=hit.object,material=Array.isArray(m.material)?m.material[hit.face.materialIndex]:m.material,g=m.geometry,ids=[hit.face.a,hit.face.b,hit.face.c];
      return{mesh:m.name,role:m.userData.assetRole,material:material.name,type:material.type,face:hit.faceIndex,ids,distance:hit.distance,point:hit.point.toArray(),projected:hit.point.clone().project(camera).toArray(),layers:m.layers.mask,alpha:alphaAt(material,hit.uv),weights:m.isSkinnedMesh?ids.map(i=>[0,1,2,3].map(k=>({bone:m.skeleton.bones[g.attributes.skinIndex.getComponent(i,k)].name,weight:g.attributes.skinWeight.getComponent(i,k)}))):null};
     });return{name,pixel:[x,y],hits};
    });
    return{label,snapshot:d.snapshot(),camera:camera.position.toArray(),target:target.toArray(),canvas:[d.renderer.domElement.width,d.renderer.domElement.height],samples,png:d.renderer.domElement.toDataURL('image/png').split(',')[1]};
   }
   const rows=[capture('stand')];c.setSpeed(2.4);d.request({requestId:'visible-run',kind:'walk',payload:{x:3.8,z:2.2},timeoutSeconds:20});for(let i=0;i<85;i++)c.simulate(1/120);rows.push(capture('run-row14'));
   const displayed=d.scene.getObjectByName('M1_UniformSkirt_Constrained'),source=displayed.parent.children.find(m=>m.isSkinnedMesh&&m.geometry.attributes.position.count===displayed.geometry.attributes.position.count),hips=a.vrm.humanoid.getRawBoneNode('hips');
   if(!source)throw Error('No exact skirt source');source.skeleton.update();
   const inverse=source.skeleton.boneInverses[source.skeleton.bones.indexOf(hips)],attrs=source.geometry.attributes;
   rows[1].sourceWitness=[0,1,2].map(k=>{const id=source.geometry.index.getX(587*3+k),reference=new V().fromBufferAttribute(attrs.position,id).applyMatrix4(source.bindMatrix).applyMatrix4(inverse),raw=source.getVertexPosition(id,new V()).applyMatrix4(source.matrixWorld),final=new V().fromBufferAttribute(displayed.geometry.attributes.position,id).applyMatrix4(displayed.matrixWorld);return{id,reference:reference.toArray(),isFixed:reference.y>=.09,raw:raw.toArray(),final:final.toArray(),differenceM:raw.distanceTo(final),weights:[0,1,2,3].map(j=>({bone:source.skeleton.bones[attrs.skinIndex.getComponent(id,j)].name,weight:attrs.skinWeight.getComponent(id,j)}))};});
   return rows;
  });
  for(const r of result){await fs.writeFile(path.join(out,r.label+'.png'),Buffer.from(r.png,'base64'));delete r.png;}
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({build,identity,scope:'Five image locations, visible ancestor filtering and current texture alpha. Same85 simulation steps; not full pixel classification or complete collision check.',rows:result},null,2));
  console.log(JSON.stringify(result.map(r=>({label:r.label,t:r.snapshot.simulationTime,hits:r.samples.map(s=>{const h=s.hits.find(h=>h.alpha.visible);return{name:s.name,first:h?{mesh:h.mesh,face:h.face,alpha:h.alpha}:null}})})),null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

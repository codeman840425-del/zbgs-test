// Test-only VRM rendering in the fixed game's actual world/light/camera.
// Does not register the candidate as a production avatar or inherit its fits.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const esbuild=require('../prototype/node_modules/esbuild');
const [outPath,manifestPath]=process.argv.slice(2);if(!outPath)throw Error('new output path required');
const root=path.resolve(__dirname,'..');
const defaultInput=[
 ['source','prototype/public/assets/foundation/base-male-roundtrip.vrm'],
 ['rejected','prototype/public/assets/m2-axial-head-runtime-v1/avatar.vrm'],
 ['candidate','assets-source/m2-source-proportioned-face-v1/generated/male-source-proportioned-narrow-preview-v1/male-source-proportioned-narrow-preview-v1.vrm']
];
const loaderSource=`import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
export async function install(pose){
 const bytes=await(await fetch('/__face_review__/model.vrm')).arrayBuffer();
 const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));
 const gltf=await loader.parseAsync(bytes,'/');const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);
 const old=window.__debug.avatar();const group=new THREE.Group();group.position.copy(old.root.position);group.quaternion.copy(old.root.quaternion);group.scale.copy(old.root.scale);
 vrm.scene.position.copy(old.vrm.scene.position);vrm.scene.quaternion.copy(old.vrm.scene.quaternion);vrm.scene.scale.copy(old.vrm.scene.scale);
 group.add(vrm.scene);vrm.humanoid.setNormalizedPose(pose);vrm.expressionManager.resetValues();vrm.update(0);group.updateMatrixWorld(true);
 old.root.visible=false;window.__debug.scene.add(group);
 window.__faceReview={vrm,group,sha};return {sha,expressions:vrm.expressionManager.expressions.map(e=>e.expressionName)};
}`;
(async()=>{
 const out=await projectOutput(outPath,await productionRoot());
 const request=manifestPath?JSON.parse(await fs.readFile(path.resolve(manifestPath),'utf8')):{};
 const input=request.inputs??defaultInput;const body=request.body??'male';
 assert.ok(['female','male'].includes(body));assert.ok(input.length>=2);
 assert.equal(new Set(input.map(r=>r[0])).size,input.length);
 for(const [id,rel] of input){assert.match(id,/^[a-z0-9-]+$/);assert.ok(typeof rel==='string'&&rel.length);}
 await fs.mkdir(out,{recursive:false});
 if(manifestPath)await fs.copyFile(path.resolve(manifestPath),path.join(out,'request.json'));
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 await fs.writeFile(path.join(out,'loader-source.js'),loaderSource);
 const loader=await esbuild.build({stdin:{contents:loaderSource,resolveDir:path.join(root,'prototype'),sourcefile:'face-review-loader.js'},bundle:true,write:false,format:'esm',platform:'browser'});
 const loaderBytes=loader.outputFiles[0].contents;
 const report={build:request.build??'83decd027116',body,scope:'Raw VRM test overlay in fixed game world; same lights/camera/pose. Not avatar-factory admission, outfit fit, full motion or production acceptance.',loaderSha256:crypto.createHash('sha256').update(loaderBytes).digest('hex'),cases:[],errors:[]};
 const {browser:b,close}=await launchQABrowser(out,{channel:'chrome'});let pose;const referenceCameras={};let referenceTransform;
 async function capture(p,row,key){
  const result=await p.evaluate(({reference,transform})=>{
   const camera=__debug.cameraObject(), group=__faceReview.group;
   if(transform){group.position.fromArray(transform.position);group.quaternion.fromArray(transform.quaternion);group.scale.fromArray(transform.scale);group.updateMatrixWorld(true);}
   if(reference){camera.position.fromArray(reference.position);camera.quaternion.fromArray(reference.quaternion);camera.projectionMatrix.fromArray(reference.projection);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
   camera.updateMatrixWorld(true);
   __debug.renderer.render(__debug.scene,camera);
   return {png:__debug.renderer.domElement.toDataURL('image/png'),camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),projection:camera.projectionMatrix.toArray()},transform:{position:group.position.toArray(),quaternion:group.quaternion.toArray(),scale:group.scale.toArray()}};
  },{reference:referenceCameras[key],transform:referenceTransform});
  referenceCameras[key]??=result.camera;referenceTransform??=result.transform;
  assert.deepEqual(result.camera,referenceCameras[key]);assert.deepEqual(result.transform,referenceTransform);
  const name=row.id+'-'+key+'.png';await fs.writeFile(path.join(out,name),Buffer.from(result.png.split(',')[1],'base64'));row.images.push(name);row.cameras.push(result.camera);row.transforms??=[];row.transforms.push(result.transform);
 }
 try{
  for(const [id,rel] of input){
   const bytes=await fs.readFile(path.join(root,rel));const sha=crypto.createHash('sha256').update(bytes).digest('hex');
   if(request.expectedSha256)assert.equal(sha,request.expectedSha256[id]);
   const p=await b.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>report.errors.push(String(e)));
   await p.route('**/__face_review__/loader.mjs',r=>r.fulfill({contentType:'text/javascript',body:Buffer.from(loaderBytes)}));
   await p.route('**/__face_review__/model.vrm',r=>r.fulfill({contentType:'model/gltf-binary',body:bytes}));
   await p.goto('http://127.0.0.1:4196/?workbench=appearance&body='+body);
   await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled,null,{timeout:60000});
   assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),report.build);
   await p.evaluate(()=>__debug.setPaused(true));
   if(!pose)pose=await p.evaluate(()=>__debug.avatar().vrm.humanoid.getNormalizedPose());
   const actual=await p.evaluate(async pose=>(await import('/__face_review__/loader.mjs')).install(pose),pose);
   assert.equal(actual.sha,sha);const row={id,path:rel,sha,actual,images:[],cameras:[]};report.cases.push(row);
   await p.locator('[data-inspect-framing=face]').click();
   for(const direction of ['front','side','back']){
    await p.locator('[data-inspect-direction='+direction+']').click();
    await p.evaluate(()=>{__faceReview.vrm.expressionManager.resetValues();__faceReview.vrm.update(0);__debug.renderer.render(__debug.scene,__debug.cameraObject());});
    await p.waitForTimeout(150);await capture(p,row,direction);
   }
   await p.locator('[data-inspect-direction=front]').click();
   for(const expression of ['blink','happy','aa','oh']){
    await p.evaluate(expression=>{const v=__faceReview.vrm;v.expressionManager.resetValues();v.expressionManager.setValue(expression,1);v.update(0);__debug.renderer.render(__debug.scene,__debug.cameraObject());},expression);
    await p.waitForTimeout(150);await capture(p,row,expression);
   }
   await p.close();
  }
  assert.deepEqual(report.errors,[]);report.cameraCheck='exact-shared-camera-and-world-transform-synchronous-render-capture';report.status='captured-awaiting-visual-review';
 }catch(e){report.status='failed';report.error=String(e);process.exitCode=1;}
 finally{await close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify({...report,pose},null,2));console.log(JSON.stringify({status:report.status,error:report.error,cases:report.cases.map(r=>({id:r.id,sha:r.sha}))}));}
})();

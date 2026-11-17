// Native whole-model reference, not independent hair admission. Follows the
// fixed room actor's normalized pose and single simulation update clock.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const esbuild=require('../prototype/node_modules/esbuild');
const [directory,output]=process.argv.slice(2);
if(!directory||!output)throw Error('Pass fixed dist and new output directory');
const repo=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const subjects=[
 {id:'original',file:'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm',sha:'a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da'},
 {id:'hairset001',file:'assets-source/native-vroid-hairset-study-v1/generated/male-hairset001.vrm',sha:'dab423674f42d3e6e79eb1b8aa1375e5b664e11bf130d093c14f78c5d3967238'},
];
const source=`
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
export async function install(expected){
 const d=window.__debug,a=d.avatar();
 if(a.profile.sha256!=='7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81')throw Error('Wrong room actor');
 const bytes=await (await fetch('/__hair_reference__/model.vrm')).arrayBuffer();
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==expected)throw Error('VRM identity mismatch');
 const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
 const g=await loader.parseAsync(bytes,'/__hair_reference__/'),v=g.userData.vrm;
 if(!v?.humanoid||v.meta.metaVersion!=='1')throw Error('Expected native VRM1');
 const root=new THREE.Group();root.add(v.scene);d.scene.add(root);
 const previousUpdate=a.update,previousRender=d.renderer.render,visible=a.root.visible;
 let updates=0,deltaTotal=0,maxNormalizedError=0,lastSample=-Infinity,disposed=false;
 const samples=[],pairs=[];
 for(const [name,bone] of Object.entries(a.vrm.humanoid.normalizedHumanBones)){
  const target=v.humanoid.getNormalizedBoneNode(name);if(!target)throw Error('Missing bone '+name);
  pairs.push([bone.node,target]);
 }
 v.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
 const hairMaterials=new Set();v.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(/_HAIR/.test(m.name))hairMaterials.add(m.name);});
 function sync(dt){
  root.position.copy(a.root.position);root.quaternion.copy(a.root.quaternion);root.scale.copy(a.root.scale);
  v.scene.position.copy(a.vrm.scene.position);v.scene.quaternion.copy(a.vrm.scene.quaternion);v.scene.scale.copy(a.vrm.scene.scale);
  for(const [s,t] of pairs){t.position.copy(s.position);t.quaternion.copy(s.quaternion);t.scale.copy(s.scale);maxNormalizedError=Math.max(maxNormalizedError,...t.position.toArray().map((x,i)=>Math.abs(x-s.position.toArray()[i])),...t.quaternion.toArray().map((x,i)=>Math.abs(x-s.quaternion.toArray()[i])));}
  for(const e of a.vrm.expressionManager.expressions)if(v.expressionManager.getExpression(e.expressionName))v.expressionManager.setValue(e.expressionName,a.vrm.expressionManager.getValue(e.expressionName));
  root.updateMatrixWorld(true);v.update(dt);root.updateMatrixWorld(true);
  if(dt>0){updates++;deltaTotal+=dt;}
  const s=d.snapshot();
  if(s.simulationTime-lastSample>=.1){lastSample=s.simulationTime;samples.push({t:s.simulationTime,dt,mode:s.mode,speed:s.speed,distance:s.distance,root:root.position.toArray(),moving:s.motion.moving,frame:s.frameMs});}
 }
 a.update=function(dt,state){previousUpdate.call(a,dt,state);sync(dt);};
 d.renderer.render=function(scene,camera){if(!disposed)sync(0);return previousRender.call(this,scene,camera);};
 a.root.visible=false;sync(0);v.springBoneManager?.reset();
 const info={sha:hash,normalizedBonePairs:pairs.length,hairMaterials:[...hairMaterials],springJoints:v.springBoneManager?.joints?.size??null};
 window.__hairReference={info,samples,summary:()=>({updates,deltaTotal,maxNormalizedError}),dispose(){if(disposed)return;disposed=true;a.update=previousUpdate;d.renderer.render=previousRender;a.root.visible=visible;root.removeFromParent();VRMUtils.deepDispose(v.scene);delete window.__hairReference;}};
 return info;
}`;
(async()=>{
 const root=path.resolve(directory),out=path.resolve(output);await fs.mkdir(out,{recursive:false});
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const build=JSON.parse(await fs.readFile(path.join(root,'build-info.json'),'utf8'));
 const bundle=await esbuild.build({stdin:{contents:source,resolveDir:repo,sourcefile:'native-hair-reference.js'},nodePaths:[path.join(repo,'prototype/node_modules')],bundle:true,write:false,format:'esm',platform:'browser'});
 const compiled=Buffer.from(bundle.outputFiles[0].contents);await fs.writeFile(path.join(out,'loader.mjs'),compiled);
 const report={build:build.shortId,loaderSHA:sha(compiled),status:'incomplete',scope:'Whole native VRM reference follows fixed native male normalized pose; not independent hair/factory/appearance admission',runs:[],errors:[]};
 let server,browser,context,page;
 try{
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
  server=require('node:http').createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(root+path.sep))throw Error('path');res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'}).end(await fs.readFile(f));}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  for(const subject of subjects){
   const bytes=await fs.readFile(path.join(repo,subject.file));assert.equal(sha(bytes),subject.sha);
   const dest=path.join(out,subject.id);await fs.mkdir(dest);context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();
   page.on('pageerror',e=>report.errors.push(String(e)));
   await page.route('**/__hair_reference__/loader.mjs',r=>r.fulfill({contentType:'text/javascript',body:compiled}));
   await page.route('**/__hair_reference__/model.vrm',r=>r.fulfill({contentType:'model/gltf-binary',body:bytes}));
   await page.goto('http://127.0.0.1:'+server.address().port+'/?workbench=appearance&body=native-male-7586-v1');
   await page.waitForFunction(()=>__debug.ready,null,{timeout:60000});assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build.shortId);
   await page.evaluate(()=>{__debug.setPaused(true);__debug.setPlaybackRate(1);__debug.avatar().vrm.expressionManager.resetValues();});
   const run={subject,info:await page.evaluate(async hash=>(await import('/__hair_reference__/loader.mjs')).install(hash),subject.sha),images:[]};report.runs.push(run);
   await page.evaluate(id=>{const note=document.createElement('div');note.textContent='原生整模型参考 · '+id+' · 尚非独立换发';Object.assign(note.style,{position:'fixed',left:'30px',top:'150px',zIndex:9999,padding:'6px 12px',background:'#fff6dc',color:'#513a17'});document.body.appendChild(note);},subject.id);
   for(const camera of ['inspect-full-front','inspect-full-side','inspect-full-back','inspect-face-front']){
    await page.evaluate(camera=>__debug.camera(camera),camera);await page.waitForTimeout(150);await page.screenshot({path:path.join(dest,camera+'.png')});run.images.push(camera+'.png');
   }
   await page.evaluate(()=>{__debug.camera('room');__debug.setSpeed(1.05);__debug.route('horizontal');});
   await page.waitForTimeout(200);
   await page.evaluate(()=>{
    const chunks=[],stream=__debug.renderer.domElement.captureStream(30),rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'});
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.__referenceRecording={rec,stream,chunks};rec.start();__debug.setPaused(false);
   });
   await page.waitForTimeout(12000);
   const movie=await page.evaluate(async()=>{const r=__referenceRecording;await new Promise(resolve=>{r.rec.onstop=resolve;r.rec.stop();});r.stream.getTracks().forEach(t=>t.stop());const b=await new Blob(r.chunks).arrayBuffer();__debug.setPaused(true);return [...new Uint8Array(b)];});
   await fs.writeFile(path.join(dest,'normal1x.webm'),Buffer.from(movie));
   run.summary=await page.evaluate(()=>__hairReference.summary());run.samples=await page.evaluate(()=>__hairReference.samples);
   assert(run.samples.filter(x=>x.moving).length>20);assert(run.summary.deltaTotal>8);assert(run.summary.maxNormalizedError<1e-6);
   await page.evaluate(()=>__hairReference.dispose());await context.close();context=null;page=null;
  }
  assert.deepEqual(report.errors,[]);report.status='whole-model-reference-observed-independent-hair-pending';
 }catch(e){report.status='failed';report.error=String(e.stack||e);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await context?.close();await browser?.close();if(server)await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:report.build,error:report.error}));}
})();

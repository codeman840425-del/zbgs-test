// Same posed male shorts, same camera: source texture / plain / wire.
// Diagnostic only: never deletes body triangles or writes garment vertices.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('../../prototype/node_modules/playwright');
const {verifyCandidate}=require('../qa-m1-common.cjs');
const build=process.env.QA_M1_BUILD;
const expected={build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'};
(async()=>{
 if(!/^[a-f0-9]{12}$/.test(build||''))throw Error('Pin build');
 const clothTrial=process.env.QA_SHORTS_CLOTH==='1';
 const clothSource=clothTrial?await fs.readFile('assets-source/m1b/shorts/material-trial-v4/create-cloth-material.mjs','utf8'):null;
 const clothSha=clothSource?crypto.createHash('sha256').update(clothSource).digest('hex'):null;
 const out=path.resolve('output/shorts-diagnosis/'+build+(clothTrial?'-cloth-'+clothSha.slice(0,12)+'-'+Date.now():''));await fs.mkdir(out,{recursive:true});
 try{await fs.access(path.join(out,'report.json'));throw Error('Refuse overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),report={build,errors:[],poses:[],limits:['Paused same-pose materials isolate baked texture from silhouette and wire geometry','No acceptance of continuous motion or replacement clothing material','Body and garment geometry/binding remain unchanged']};
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 try{
  // Test-server icon is not a product asset; isolate its expected 404 from
  // actual material/compiler/resource failures. Never mask game asset requests.
  await page.route('**/favicon.ico',route=>route.fulfill({status:204}));report.faviconFixture='204; game assets unmodified';
  await page.goto(new URL('?body=male',process.argv[2]).href);await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});report.initialGate=await verifyCandidate(page,expected);
  if(clothTrial){await page.addScriptTag({content:clothSource.replace('export function createClothMaterial','window.createClothMaterial = function createClothMaterial')});report.materialSource='assets-source/m1b/shorts/material-trial-v4/create-cloth-material.mjs';report.materialSha256=clothSha;await fs.writeFile(path.join(out,'material-source.mjs'),clothSource);}
  await page.evaluate(()=>{
   const d=__debug,a=d.avatar();d.reset();d.setPaused(true);d.setOutfit(2);d.setBodyMode('dressed');d.setDynamics(false);
   const parts=[];a.root.traverse(m=>{if(m.isMesh&&m.userData.assetRole==='pants'&&m.visible){let visible=true;for(let p=m;p;p=p.parent)if(!p.visible)visible=false;if(visible){const original=m.material,materials=Array.isArray(original)?original:[original];parts.push({mesh:m,original,plain:materials.map(mat=>{const n=mat.clone();n.map=null;n.color.set('#8995a9');n.needsUpdate=true;return n;}),wire:materials.map(mat=>{const n=mat.clone();n.map=null;n.color.set('#253a55');n.wireframe=true;n.needsUpdate=true;return n;})});}}});
   if(parts.length!==2)throw Error('Expected shorts surface + inner cuff');
   const vector=a.root.position.constructor;
   window.__clothDiagnosis={parts,select(mode){for(const p of parts)p.mesh.material=mode==='original'?p.original:(Array.isArray(p.original)?p[mode]:p[mode][0]);},geometry(){return parts.map(p=>({name:p.mesh.name,vertices:p.mesh.geometry.attributes.position.count,indices:p.mesh.geometry.index.count,posed:Array.from({length:p.mesh.geometry.attributes.position.count},(_,i)=>p.mesh.getVertexPosition(i,new vector()).applyMatrix4(p.mesh.matrixWorld).toArray())}));}};
  });
  if(clothTrial)await page.evaluate(()=>{const d=window.__clothDiagnosis;for(const p of d.parts)p.cloth=(Array.isArray(p.original)?p.original:[p.original]).map(m=>window.createClothMaterial(m));const select=d.select;d.select=mode=>{if(mode!=='cloth')return select(mode);for(const p of d.parts)p.mesh.material=Array.isArray(p.original)?p.cloth:p.cloth[0];};});
  for(const pose of ['standing','seated','leg-lift']){
   await page.evaluate(pose=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio');if(pose==='seated'){c.action('sit');let n=0;for(;n<7200&&d.motion().getMetrics().sitProgress<.999;n++)c.simulate(1/120);if(n===7200)throw Error('Sit timeout');}if(pose==='leg-lift'){d.reset();d.setPaused(true);d.setOutfit(2);d.setDynamics(false);c.command({type:'danceSelect',id:'dance-technical-once-v1'});c.action('dance');for(let i=0;i<330;i++)c.simulate(1/120);}d.view('side');d.advance(0);},pose);
   const before=await page.evaluate(()=>__clothDiagnosis.geometry());
   for(const mode of (clothTrial?['original','cloth']:['original','plain','wire'])){await page.evaluate(mode=>__clothDiagnosis.select(mode),mode);await page.waitForTimeout(100);await page.screenshot({path:path.join(out,pose+'-'+mode+'.png')});}
   const after=await page.evaluate(()=>__clothDiagnosis.geometry());
   if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Geometry changed in material-only comparison');
   report.poses.push({pose,geometryUnchanged:true,geometry:before.map(({posed,...rest})=>rest),state:await page.evaluate(()=>__debug.snapshot())});
   await page.evaluate(()=>__clothDiagnosis.select('original'));
  }
  report.finalGate=await verifyCandidate(page,expected);if(report.errors.length)throw Error('Page errors');
 }catch(e){report.failure=String(e);process.exitCode=1;}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(out,report.failure||'Collected; inspect images before any cause conclusion');}
})().catch(e=>{console.error(e);process.exitCode=1;});

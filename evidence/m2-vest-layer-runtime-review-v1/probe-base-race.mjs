import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url),out=new URL('./',import.meta.url);
const read=async p=>fs.readFile(new URL(p,root));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const spec=JSON.parse(await read('assets-source/m2-vest-layer-fit-v1/spec.json'));
const batch=JSON.parse(await read('assets-source/m2-vest-layer-fit-v1/generated/manifest.json'));
const source=spec.cases.find(c=>c.id==='female'),row=batch.cases.find(c=>c.id==='female');
const entry=JSON.parse(await read(row.files['equipment-entry.json'].path));
const fit=await read(row.files['fit.json'].path),fitData=JSON.parse(fit);
const original=JSON.parse(await read(source.equipmentManifest.path));
entry.layerFitResource={schema:'vest-layer-fit-v1',url:'/assets/review-fit.json',sha256:sha(fit),bottom:{id:fitData.bottom.id,sha256:fitData.bottom.sha256,bytes:fitData.bottom.bytes}};
const extensionBytes=Buffer.from(JSON.stringify({schema:'zbgs-equipment-v1',items:[entry]}));
const extension={url:'/assets/review-extension.json',sha256:sha(extensionBytes)};
const oldTop=original.items.find(x=>x.slot==='top'),bottom=original.items.find(x=>x.id===fitData.bottom.id);
const parse=GLTFLoader.prototype.parseAsync,oldFetch=globalThis.fetch,oldWindow=globalThis.window;
GLTFLoader.prototype.parseAsync=function(...args){this.register(()=>({name:'CPUReviewTexture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));return parse.apply(this,args);};
globalThis.window={location:{href:'http://fixture.invalid/'}};
function barrier(){let entered,release;return{entered:new Promise(r=>entered=r),wait:new Promise(r=>release=r),enter:()=>entered(),release:()=>release()};}
const checks=[];
const require=createRequire(new URL('../../prototype/package.json',import.meta.url));
const baseSource=execFileSync('git',['show','6238df63:prototype/src/equipment.js'],{cwd:fileURLToPath(root)});
const bundle=await require('esbuild').build({stdin:{contents:baseSource.toString(),resolveDir:fileURLToPath(new URL('prototype/src/',root)),sourcefile:'base-equipment-6238df63.js'},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'actual-three-and-loader',setup(build){
 build.onResolve({filter:/^three$/},()=>({path:new URL('prototype/node_modules/three/build/three.module.js',root).href,external:true}));
 build.onResolve({filter:/^three\/addons\/loaders\/GLTFLoader\.js$/},()=>({path:new URL('prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js',root).href,external:true}));
}}]});
const {createEquipment}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

async function setup(){
 const body=await read(source.body.path),parsed=await new GLTFLoader().parseAsync(body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength),'');
 parsed.scene.updateMatrixWorld(true);
 const vrm={scene:parsed.scene,humanoid:{getRawBoneNode:()=>null}};
 const paths=new Map([[entry.url,row.files['top.glb'].path],[new URL(oldTop.url,'http://fixture.invalid/assets/review-equipment.json').pathname,source.top.path],[new URL(bottom.url,'http://fixture.invalid/assets/review-equipment.json').pathname,source.bottom.path]]);
 const control={gate:null,badFit:false};
 globalThis.fetch=async input=>{
  const url=new URL(input,window.location.href);
  if(url.pathname==='/assets/review-equipment.json')return new Response(JSON.stringify({schema:original.schema,items:[...original.items,entry]}));
  if(url.pathname===extension.url)return new Response(extensionBytes);
  if(url.pathname===entry.layerFitResource.url){if(control.gate){const gate=control.gate;control.gate=null;gate.enter();await gate.wait;}return new Response(control.badFit?'{}':fit);}
  const file=paths.get(url.pathname);assert(file,'unexpected resource '+url.pathname);return new Response(await read(file));
 };
 const adapter=await createEquipment({vrm,avatarSha256:source.body.sha256,manifestUrl:'/assets/review-equipment.json',additionalManifests:[extension]});
 return{adapter,parsed,control};
}
function visible(adapter){return[oldTop,bottom,entry].filter(e=>adapter.get(e.id)?.container.visible).map(e=>e.id).sort();}
try{
 const{adapter,parsed}=await setup();
 const onChild=event=>{if(event.child.name.startsWith('Equipment:'))adapter.dispose();};
 parsed.scene.addEventListener('childadded',onChild);
 let resolved=false,error=null;try{await adapter.load(entry.id);resolved=true;}catch(e){error=String(e);}
 const cached=adapter.get(entry.id),attached=parsed.scene.children.filter(c=>c.name.startsWith('Equipment:')).map(c=>c.name);
 parsed.scene.removeEventListener('childadded',onChild);
 checks.push({id:'synchronous-parent-childadded-dispose',passed:!cached&&!attached.length&&!resolved,resolved,cachedAfterDispose:!!cached,attached,error});
}finally{globalThis.fetch=oldFetch;globalThis.window=oldWindow;GLTFLoader.prototype.parseAsync=parse;}
const result={baseline:'6238df63',sourceModuleSha256:sha(baseSource),checks,scope:'Actual historical equipment module plus real Three/GLTFLoader/source assets. The fitted entry is supplied in the primary manifest because this baseline predates additive catalogs. No modified lifecycle code.'};
await fs.writeFile(new URL('base-race-probe.json',out),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

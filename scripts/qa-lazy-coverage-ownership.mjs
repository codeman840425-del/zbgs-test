// Real garment-coverage implementation and Three geometry, mocked asset I/O.
// Isolates ownership across two prepared outfits on the SAME actor/top mesh.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {foundationProfile} from '../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../prototype/src/outfit-selection.js';
const require=createRequire(new URL('../prototype/package.json',import.meta.url));
const built=await require('esbuild').build({entryPoints:['prototype/src/garment-coverage.js'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {createGarmentCoverage,completeGarmentGeometry}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const config=structuredClone(foundationProfile('male'));
const raw=new Uint32Array([0,1,2,0,2,3]);
const fit={schema:'zbgs-garment-coverage-mask-v1',id:'ownership-fixture',innerTopId:config.ids.top,innerTopSha256:'top-fixture',innerTopMaterial:'M00_001_01_Tops_01_CLOTH',outerId:config.ids.outer,outerAssetSha256:'outer-fixture',topFaceCount:2,topIndexComponentType:5125,topIndexAccessorSha256:sha(Buffer.from(raw.buffer)),selectedFaceIds:[0],selectedTriangles:[[0,1,2]],binding:{bodySha256:config.sha256}};
const bytes=Buffer.from(JSON.stringify(fit));config.garmentCoverage={url:'data:application/json,'+encodeURIComponent(bytes.toString()),sha256:sha(bytes)};
const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0],3));geometry.setIndex(new THREE.BufferAttribute(raw,1));
const top=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());top.material.name=fit.innerTopMaterial;
const loaded=new Map();let coverageOwners=0;
const adapter={
 async load(id){if(loaded.has(id))return loaded.get(id);const item={entry:{id,sha256:id===config.ids.top?fit.innerTopSha256:fit.outerAssetSha256},meshes:id===config.ids.top?[top]:[],container:{visible:false},stats:{}};loaded.set(id,item);return item;},
 get:id=>loaded.get(id),dispose(){loaded.clear();},
 prepareLoadedSet(ids){let live=true;return {isCurrent:()=>live,commit(){assert(live);live=false;for(const [id,item]of loaded)item.container.visible=ids.includes(id);},dispose(){live=false;}};},
};
const deps={
 './equipment.js':{createEquipment:async()=>adapter},'./foundation-profiles.js':{foundationProfile:()=>config},'./outfit-selection.js':{outfitSelection},
 './body-coverage.js':{createBodyCoverageSet:async()=>null},'./garment-coverage.js':{createGarmentCoverage:async args=>{coverageOwners++;return createGarmentCoverage(args);}},
 './m1-skirt.js':{createM1Skirt:()=>{throw Error('male fixture has no skirt');}},'./skirt-fit.js':{selectSkirtFit:()=>{throw Error('unexpected skirt fit');}},
};
const sourceCommit=process.argv.find(x=>x.startsWith('--source-commit='))?.split('=')[1];
const source=sourceCommit?execFileSync('git',['show',sourceCommit+':prototype/src/m1-equipment.js'],{encoding:'utf8'}):await fs.readFile('prototype/src/m1-equipment.js','utf8');
const context=vm.createContext({structuredClone,console});const module=new vm.SourceTextModule(source,{context});
await module.link(async name=>{const exports=deps[name];assert(exports);return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context});});await module.evaluate();
const body={isSkinnedMesh:true,material:{name:'M00_001_01_Body_00_SKIN'}},clothes={isSkinnedMesh:true,material:{name:'M00_001_01_Tops_01_CLOTH'},visible:true};
const vrm={scene:{traverse(fn){fn(body);fn(clothes);}}};
const gear=await module.namespace.createM1Equipment({vrm,avatarSha256:config.sha256,bodyType:'male'});
const old=await gear.prepareOutfit(3),latest=await gear.prepareOutfit(4);latest.commit();latest.dispose();
assert.equal(top.geometry.index.count,3);assert.equal(gear.getInfo().outfit,4);
old.dispose();
const result={sourceCommit:sourceCommit??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSha256:sha(source),coverageOwners,outfit:gear.getInfo().outfit,declared:gear.getInfo().garmentCoverage,actualIndexCount:top.geometry.index.count,fullIndexCount:completeGarmentGeometry(top).index.count,expectedMaskedIndexCount:3,scope:'Real garment-coverage and actual Three geometry; asset loader and unrelated body/skirt integrations are fixtures. No visual or GPU claim.'};
result.staleCleanupChangedNewGeometry=top.geometry.index.count!==3;
console.log(JSON.stringify(result,null,2));
if(process.argv.includes('--expect-old'))assert.equal(result.staleCleanupChangedNewGeometry,true);
else assert.equal(result.staleCleanupChangedNewGeometry,false,'Cancelled old preparation restored the new outfit top geometry');
gear.dispose();assert.equal(top.geometry,geometry);

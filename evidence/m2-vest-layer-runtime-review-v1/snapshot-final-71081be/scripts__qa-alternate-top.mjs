// Real coverage/geometry and outfit composition; asset I/O is a scoped fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {outfitSelection} from '../prototype/src/outfit-selection.js';
const require=createRequire(new URL('../prototype/package.json',import.meta.url));
const built=await require('esbuild').build({entryPoints:['prototype/src/body-coverage.js'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {createBodyCoverageSet,completeBodyGeometry}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const bodySha='a'.repeat(64),topSha='b'.repeat(64),fitSha='c'.repeat(64);
const raw=new Uint32Array([0,1,2,0,2,3,0,3,4]);
const cfg={sha256:bodySha,ids:{top:'original',fitTop:'fitted',pants:'pants',shoes:'shoes'},outfits:[{index:0,role:'pants'},{index:4,role:'pants-layer-fit',bottomRole:'pants',equipmentRoles:['fitTop','shoes','pants']}]};
const entries=Object.fromEntries(Object.values(cfg.ids).map(id=>[id,{id,slot:['original','fitted'].includes(id)?'top':id==='shoes'?'shoes':'bottom',sha256:id==='original'?topSha:fitSha,compatibleAvatarSha256:bodySha}]));
function mask(id,itemSha,face){const fit={schema:'zbgs-equipment-body-coverage.1',id:'mask-'+id,avatarSha256:bodySha,itemId:id,itemSha256:itemSha,bodyMaterial:'M00_001_01_Body_00_SKIN',bodyFaceCount:3,bodyIndexComponentType:5125,bodyIndexAccessorSha256:sha(Buffer.from(raw.buffer)),selectedFaceIds:[face],selectedTriangles:[Array.from(raw.slice(face*3,face*3+3))]};const data=JSON.stringify(fit);return {url:'data:application/json,'+encodeURIComponent(data),sha256:sha(data)};}
cfg.bodyCoverage=mask('original',topSha,0);cfg.additionalBodyCoverage=[{role:'fitTop',descriptor:mask('fitted',fitSha,1)}];
const adapters=[];
function createAdapter(){const loaded=new Map(),described=[];const adapter={loaded,described,async load(id){if(!loaded.has(id))loaded.set(id,{entry:structuredClone(entries[id]),meshes:[{name:id}],container:{visible:false},stats:{}});return loaded.get(id);},get:id=>loaded.get(id),describe(id){described.push(id);return structuredClone(entries[id]);},prepareLoadedSet(ids){let live=true;return{isCurrent:()=>live,commit(){assert(live);live=false;for(const [id,item]of loaded)item.container.visible=ids.includes(id);},dispose(){live=false;}};},dispose(){loaded.clear();}};adapters.push(adapter);return adapter;}
const deps={'./equipment.js':{createEquipment:async()=>createAdapter()},'./foundation-profiles.js':{foundationProfile:()=>cfg},'./outfit-selection.js':{outfitSelection},'./body-coverage.js':{createBodyCoverageSet},'./garment-coverage.js':{createGarmentCoverage:()=>{throw Error('unused');}},'./m1-skirt.js':{createM1Skirt:()=>{throw Error('unused');}},'./skirt-fit.js':{selectSkirtFit:()=>{throw Error('unused');}}};
const source=await fs.readFile('prototype/src/m1-equipment.js','utf8'),context=vm.createContext({structuredClone,console}),module=new vm.SourceTextModule(source,{context});
await module.link(async name=>{const exports=deps[name];return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});});await module.evaluate();
function fixture(){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0,-1,0,0],3));geometry.setIndex(new THREE.BufferAttribute(raw.slice(),1));const body=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());body.isSkinnedMesh=true;body.material.name='M00_001_01_Body_00_SKIN';const source={isSkinnedMesh:true,material:{name:'M00_001_01_Tops_01_CLOTH'},visible:true};return{body,geometry,vrm:{scene:{traverse(fn){fn(body);fn(source);}}}};}
const a=fixture(),b=fixture(),gear=await module.namespace.createM1Equipment({vrm:a.vrm,avatarSha256:bodySha}),adapter=adapters.at(-1),other=await module.namespace.createM1Equipment({vrm:b.vrm,avatarSha256:bodySha});
assert(!adapter.loaded.has('fitted'));assert.deepEqual(adapter.described,['fitted']);assert.equal(gear.getAssetProfile().top[0].name,'original');assert.deepEqual(Array.from(a.body.geometry.index.array),[0,2,3,0,3,4]);
const update=await gear.prepareOutfit(4);assert.equal(gear.getAssetProfile().top[0].name,'original');update.commit();update.dispose();assert.equal(gear.getAssetProfile().top[0].name,'fitted');assert.equal(gear.getInfo().bodyCoverage.activeItems[0],'fitted');assert.deepEqual(Array.from(a.body.geometry.index.array),[0,1,2,0,3,4]);assert.deepEqual(Array.from(b.body.geometry.index.array),[0,2,3,0,3,4]);
gear.setDebugBody(true);assert.equal(a.body.geometry,a.geometry);assert.equal(completeBodyGeometry(a.body),a.geometry);assert.equal(adapter.get('fitted').container.visible,false);gear.setDebugBody(false);assert.equal(adapter.get('fitted').container.visible,true);
gear.setOutfit(0);assert.equal(gear.getAssetProfile().top[0].name,'original');assert.deepEqual(Array.from(a.body.geometry.index.array),[0,2,3,0,3,4]);assert(!adapter.get('fitted').container.visible);
gear.dispose();other.dispose();assert.equal(a.body.geometry,a.geometry);assert.equal(b.body.geometry,b.geometry);
const result={passed:true,sourceSha256:sha(source),checks:['unselected top uses metadata without GLB load','asset profile changes only on outfit commit','exact selected top coverage replaces prior coverage','second actor retains original top mask','base mode restores complete geometry and dressed mode restores selected mask','original look restores original top and coverage','dispose restores original geometry'],scope:'Actual body coverage and Three geometry; loader fixture. No rendered or animation acceptance.'};
const out=process.argv[2]??'evidence/m2-alternate-top-contract-v1';await fs.mkdir(out,{recursive:true});await fs.writeFile(out+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

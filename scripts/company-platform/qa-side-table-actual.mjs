import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createSideTableSample} from '../../prototype/src/company/side-table-samples.js';
import {deriveCompany} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
const root=new URL('../../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root)));
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
const tables=catalog.resources.filter(r=>r.mountRole==='side-table');
const library=createCompanyAssetLibrary({fetchImpl:async url=>{const bytes=await fs.readFile(new URL('prototype/public'+url,root));return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}});
const report={status:'running',checks:[],limits:['Actual GLTFLoader and CPU scene, not browser pixels, character C3 or ordinary-PC performance']};let scene;
async function check(name,fn){report.checks.push({name,passed:true,result:await fn()});}
try {
  await check('Both real layout inputs accept four fixed-compatible external tables and existing ornament',async()=>{
    assert.equal(tables.length,4);assert.equal(new Set(tables.map(r=>r.asset.sha256)).size,4);const rows=[];
    for(const resource of tables)assert(compareFacilityFunction(tables[0],resource).compatible);
    for(let index=0;index<4;index++)for(const alternate of [false,true]){
      const sample=createSideTableSample(catalog,templates,{index,alternate}),derived=deriveCompany(sample.document,catalog,templates);
      inspectCompanyPlacement(sample.document,catalog,templates);await library.preload(derived.facilities.map(f=>f.resource));
      scene=createCompanyScene(new THREE.Scene(),sample.document,{catalog,templates,assetLibrary:library});scene.root.updateMatrixWorld(true);
      const table=scene.root.getObjectByName(sample.target),board=table.getObjectByName('side-table-top'),prop=scene.root.getObjectByName(sample.target+'/ornament');
      assert(board?.isMesh&&prop);board.geometry.computeBoundingBox();const top=board.geometry.boundingBox.clone().applyMatrix4(board.matrixWorld).max.y;
      let bottom=Infinity;prop.traverse(m=>{if(m.isMesh){m.geometry.computeBoundingBox();bottom=Math.min(bottom,m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).min.y);}});
      assert(Math.abs(top-.5)<1e-6&&Math.abs(bottom-top)<.001);
      const world=prop.getWorldPosition(new THREE.Vector3()).toArray();world.forEach((v,i)=>assert(Math.abs(v-(alternate?[1,.5,.3]:[0,.5,-.5])[i])<1e-6));
      const saved=scene.save();scene.restore(saved);assert.equal(scene.save(),saved);
      rows.push({resource:sample.resource,alternate,top,bottom,world});scene.dispose();scene=null;
    }return rows;
  });report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;}
finally{scene?.dispose();library.dispose();const out=new URL(process.argv[2]||'evidence/company-side-table-actual-v1/report.json',root);await fs.mkdir(new URL('./',out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,error:report.error}));}

import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import home from '../../prototype/src/company/examples/c2-rental-home.json' with {type:'json'};
const out=process.argv[2];if(!out)throw Error('Pass NEW_OUTPUT_DIR');await fs.mkdir(out,{recursive:false});
const checks=[];async function check(name,fn){try{await fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,error:String(error)});}}
const fetchImpl=async url=>new Response(await fs.readFile(new URL(`../../prototype/public${url}`,import.meta.url)),{status:200});
async function setup(){const library=createCompanyAssetLibrary({fetchImpl});let blocked=false,release;const gate=new Promise(resolve=>release=resolve);
 const wrapped={...library,async preload(resources){if(blocked&&resources.some(r=>r.asset))await gate;return library.preload(resources);}};
 const session=await createCompanyAuthoring(new THREE.Scene(),home,{catalog,templates,storage:{getItem:()=>null,setItem(){}},assetLibrary:wrapped});
 await session.setView({mode:'building'});return {session,library,block(){blocked=true;},release,close(){session.dispose();library.dispose();}};}
await check('Rejected restore drops its own prepared GLB resources',async()=>{const run=await setup();try{
 const handle=await run.session.retainUsePointContact('rest/sofa#left');assert.equal(run.library.snapshot().loadedAssets,0);
 await assert.rejects(run.session.load(home),e=>e.code==='facility-busy');
 assert.equal(run.library.snapshot().loadedAssets,0);handle.release();
}finally{run.close();}});
await check('Superseded view releases late GLB when its own preload ends',async()=>{const run=await setup();try{
 run.block();const old=run.session.setView({mode:'floor'});const checked=assert.rejects(old,e=>e.code==='revision-conflict');
 await run.session.setView({mode:'building'});run.release();await checked;
 assert.equal(run.library.snapshot().loadedAssets,0);
}finally{run.close();}});
await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,passed:checks.every(c=>c.passed)},null,2));console.log(JSON.stringify(checks));if(checks.some(c=>!c.passed))process.exitCode=1;

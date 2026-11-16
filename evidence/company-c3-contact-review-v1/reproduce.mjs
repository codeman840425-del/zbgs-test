import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import document from '../../prototype/src/company/examples/c1-two-stations.json' with {type:'json'};
const out=process.argv[2];if(!out)throw Error('Pass a NEW_OUTPUT_DIR');await fs.mkdir(out,{recursive:false});
const checks=[];
async function check(name,fn){try{await fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,error:String(error)});}}
await check('Viewing change does not cancel a concurrent contact request',async()=>{
  const session=await createCompanyAuthoring(new THREE.Scene(),document,{catalog,templates,storage:{getItem:()=>null,setItem(){}}});
  try {
    const contact=session.retainUsePointContact('station-1/chair#seat');
    const results=await Promise.allSettled([contact,session.setView({mode:'building'})]);
    for(const result of results)assert.equal(result.status,'fulfilled',result.reason?.message);
    results[0].value.release();
  } finally {session.dispose();}
});
await check('Retained contact prevents direct scene move even without a lease adapter',async()=>{
  const scene=createCompanyScene(new THREE.Scene(),document,{catalog,templates});
  try {
    const contact=await scene.retainUsePointContact('station-1/chair#seat');
    assert.throws(()=>scene.prepareChange([{type:'move',id:'station-1/chair',transform:{position:[0,0,.7],yaw:Math.PI}}]),error=>['facility-busy','contact-resource-busy'].includes(error.code));
    contact.release();
  } finally {scene.dispose();}
});
await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,passed:checks.every(check=>check.passed)},null,2));
console.log(JSON.stringify(checks));if(checks.some(check=>!check.passed))process.exitCode=1;

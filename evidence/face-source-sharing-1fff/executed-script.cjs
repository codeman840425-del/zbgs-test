const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [base,build,dir]=process.argv.slice(2),out=path.resolve(dir);
(async()=>{
 await fs.mkdir(out);await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const b=await chromium.launch({channel:'chrome',headless:true}),rows=[];
 try{for(const body of ['female','male','m2-male-jaw-v1']){
  const p=await b.newPage();await p.goto(base+'?workbench=appearance&body='+body);await p.waitForFunction(()=>window.__debug?.ready);
  assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),build);
  rows.push(await p.evaluate(()=>{const a=__debug.avatar(),meshes=[];a.vrm.scene.traverse(m=>{if(m.isMesh&&(Array.isArray(m.material)?m.material:[m.material]).some(x=>/Face|Eye|Brow|Mouth/.test(x.name))&&m.geometry.morphAttributes.position?.length)meshes.push(m);});const gs=[...new Set(meshes.map(m=>m.geometry))],ids=new WeakMap();let next=0;const id=x=>{if(!ids.has(x))ids.set(x,++next);return ids.get(x)};const records=gs.map(g=>({geometry:g.uuid,position:id(g.attributes.position),uv:id(g.attributes.uv),normal:id(g.attributes.normal),morphs:g.morphAttributes.position.map(id),index:id(g.index)}));return{body:a.profile.bodyType,records,geometries:gs.length,uniquePosition:new Set(records.map(r=>r.position)).size,uniqueMorphAttributes:new Set(records.flatMap(r=>r.morphs)).size,totalMorphReferences:records.reduce((s,r)=>s+r.morphs.length,0)};}));await p.close();
 }}finally{await b.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify({build,rows,scope:'Read-only identity counts in actual loaded VRM; no source/geometry mutation or timing acceptance.'},null,2));}
 console.log(JSON.stringify(rows.map(({records,...r})=>r)));
})().catch(e=>{console.error(e);process.exitCode=1});

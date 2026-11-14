// Scoped equipment contract test on the foundation page; no animation acceptance claim.
const {chromium}=require('../../prototype/node_modules/playwright');
const esbuild=require('../../prototype/node_modules/esbuild');
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const url=process.argv[2]||'http://127.0.0.1:5173/foundation.html?source=roundtrip';
 const bundle=await esbuild.build({entryPoints:[path.join(root,'prototype/src/m1-equipment.js')],bundle:true,write:false,format:'iife',globalName:'M1EquipmentContract',platform:'browser',logLevel:'silent'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();await page.goto(url);await page.waitForFunction(()=>window.__foundation?.ready);
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(async()=>{
   const f=__foundation;f.pause(true);f.body(false);f.play('rest');f.advance(0);
   const original=new Map();f.vrm.scene.traverse(m=>{if(m.isSkinnedMesh)original.set(m,{visible:m.visible,geometry:m.geometry,index:m.geometry.index,material:m.material});});
   const {createM1Equipment,M1_AVATAR_SHA256}=M1EquipmentContract;
   let wrongIdentity=false;try{await createM1Equipment({vrm:f.vrm,avatarSha256:'old-avatar-sha'})}catch(e){wrongIdentity=/identity/.test(e.message)}
   const equipment=await createM1Equipment({vrm:f.vrm,avatarSha256:M1_AVATAR_SHA256}),p=equipment.getAssetProfile(), states=[];
   for(let i=0;i<30;i++){
    equipment.setDebugBody(i%3===2);equipment.setOutfit(i%2);
    const info=equipment.getInfo();states.push({outfit:info.outfit,debugBody:info.debugBody,shoes:info.items.shoes.visible,pants:info.items.pants.visible,skirt:info.items.skirt.visible,
     bodyUnchanged:p.body.every(m=>m.visible===original.get(m).visible&&m.geometry===original.get(m).geometry&&m.geometry.index===original.get(m).index&&m.material===original.get(m).material)});
   }
   const rawBones=new Set();f.vrm.scene.traverse(o=>{if(o.isBone)rawBones.add(o)});
   const allMapped=['shoes','pants','sourceSkirt','top'].every(role=>p[role].every(m=>m.skeleton.bones.every(b=>rawBones.has(b))));
   const stats=equipment.getInfo();equipment.dispose();
   const restored=[...original].every(([m,v])=>m.visible===v.visible&&m.geometry===v.geometry&&m.material===v.material);
   const groups=f.vrm.scene.children.filter(o=>o.name.startsWith('Equipment:')).length;
   if(!wrongIdentity||!allMapped||!restored||groups||!states.every(s=>s.bodyUnchanged&&s.shoes&&(s.debugBody?!s.pants&&!s.skirt:s.outfit===0?s.pants&&!s.skirt:!s.pants&&s.skirt)))throw Error('M1 equipment contract failed');
   return {wrongIdentity,allMapped,restored,groups,states,stats,sourceSha256:M1_AVATAR_SHA256,build:f.build};
  });
  await fs.mkdir(path.join(root,'output/playwright/m1-equipment'),{recursive:true});
  await fs.writeFile(path.join(root,'output/playwright/m1-equipment/contract.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

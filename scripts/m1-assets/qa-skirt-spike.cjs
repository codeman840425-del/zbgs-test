const {chromium}=require('../../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const label=process.env.QA_LABEL||'before',url=process.argv[2]||'http://127.0.0.1:4191/';
 const out=path.join(root,'output/playwright/m1-skirt-spike',label);await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});
 try{
 await page.goto(url);await page.waitForFunction(()=>__debug?.ready);const reports=[];
 for(const corrections of ['raw','full']){
 const result=await page.evaluate(corrections=>{
  const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();d.setPaused(true);d.reset();d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(true);d.setCorrections(corrections);
  a.root.position.set(-2.5,0,2.2);c.yaw=Math.PI/2;a.root.rotation.y=c.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);a.resetSecondary?.();for(let i=0;i<240;i++)c.simulate(1/120);
  d.view('front');d.advance(0);
  const actual=d.scene.getObjectByName('M1_UniformSkirt_Constrained');let source;d.scene.getObjectByName('Equipment:m1-uniform-skirt').traverse(m=>{if(m.isSkinnedMesh)source=m;});
  const refs=source.geometry.attributes.position,ids=actual.geometry.index.array,edgeMap=new Map(),edges=[];
  for(let i=0;i<ids.length;i+=3)for(const [ia,ib]of [[ids[i],ids[i+1]],[ids[i+1],ids[i+2]],[ids[i+2],ids[i]]]){
   const key=[Math.min(ia,ib),Math.max(ia,ib)].join(':');if(edgeMap.has(key))continue;edgeMap.set(key,true);const length=Math.hypot(refs.getX(ia)-refs.getX(ib),refs.getY(ia)-refs.getY(ib),refs.getZ(ia)-refs.getZ(ib));if(length>.005)edges.push([ia,ib,length]);
  }
  c.go(1.5,2.2);const frames=[],worst={stretch:0};let previous;
  for(let f=0;f<480;f++){
    c.simulate(1/120);const p=actual.geometry.attributes.position;let stretch=0,longest=0;
    for(const [ia,ib,rest]of edges){const length=Math.hypot(p.getX(ia)-p.getX(ib),p.getY(ia)-p.getY(ib),p.getZ(ia)-p.getZ(ib));stretch=Math.max(stretch,length/rest);longest=Math.max(longest,length);}
    let jump=0;if(previous)for(let i=0;i<p.count;i++)jump=Math.max(jump,Math.hypot(p.getX(i)-previous[i*3],p.getY(i)-previous[i*3+1],p.getZ(i)-previous[i*3+2]));previous=Array.from(p.array);
    const m=d.motion().getMetrics();const frame={f,t:f/120,stretch,longest,jump,sourceTime:m.sourceTime,phase:m.phase,mode:c.mode,skirt:a.getOutfitInfo().equipment.skirtDynamics};frames.push(frame);
    if(stretch>worst.stretch){Object.assign(worst,frame);d.advance(0);worst.image=d.renderer.domElement.toDataURL('image/png').split(',')[1];}
  }
  return{corrections,build:d.buildInfo,frames,worst};
 },corrections);
 await fs.writeFile(path.join(out,corrections+'-worst.png'),Buffer.from(result.worst.image,'base64'));delete result.worst.image;reports.push(result);
 console.log(JSON.stringify({corrections,worst:result.worst,maxJump:Math.max(...result.frames.map(f=>f.jump))}));
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({url,reports},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

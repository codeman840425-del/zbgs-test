// run-fixed-check.cjs DIST_OR_PACKAGE scripts/qa-ear-style-game.cjs workbench|game BUILD OUT
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot,projectOutput} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');
const catalog = require('../prototype/src/ear-style-catalog.json');
const old = catalog.styles.find(s=>s.styleId==='compact-gold-stud-v1');
const added = catalog.styles.find(s=>s.styleId==='round-gold-stud-3mm-v1');

// Called within Chrome. Observe real draw submissions over a second of head movement.
async function capture(body) {
  const consumer=window.__recordConsumer;
  const actor=consumer?[...consumer.actors.values()].find(a=>a.avatar.profile.bodyType===body)?.avatar:window.__debug.avatar();
  if(!actor || actor.profile.bodyType!==body)throw Error('Requested body is missing');
  const head=actor.vrm.humanoid.getRawBoneNode('head'), objects=[];
  head.traverseVisible(mesh=>{
    if(mesh.isMesh && mesh.userData.rigidAccessoryId)objects.push(mesh);
  });
  const counts=objects.map(()=>0),hooks=objects.map(n=>n.onBeforeRender);
  const rest=objects.map(n=>n.matrix.elements.slice()),start=head.matrixWorld.elements.slice();
  let frames=0,headDelta=0;
  try {
    objects.forEach((n,i)=>{n.onBeforeRender=function(...args){counts[i]++;return hooks[i].apply(this,args);};});
    const startMs=performance.now();
    do {
      await new Promise(requestAnimationFrame);frames++;
      for(let i=0;i<16;i++)headDelta=Math.max(headDelta,Math.abs(head.matrixWorld.elements[i]-start[i]));
    } while(performance.now()-startMs<1050);
    return {body,bodySha:actor.profile.sha256,state:actor.rigidAccessories.getState(),frames,headDelta,
      objects:objects.map((n,i)=>({side:n.userData.side,style:n.userData.styleId,id:n.uuid,draws:counts[i],
        triangles:n.geometry.index.count/3,mountStable:n.matrix.elements.every((x,j)=>x===rest[i][j])}))};
  } finally {objects.forEach((n,i)=>n.onBeforeRender=hooks[i]);}
}
function verify(row,style,selection) {
  assert.equal(row.state.selection,selection);
  const sides=selection==='none'?[]:selection==='pair'?['left','right']:[selection];
  assert.deepEqual(row.objects.map(n=>n.side).sort(),sides);
  if(!sides.length)return;
  const fit=style.fits.find(rowFit=>rowFit.bodySha256===row.bodySha);
  assert(fit);assert.equal(row.state.fitId,fit.fitId);assert.equal(row.state.assetSha256,style.assetSha256);
  assert.equal(row.state.manifestSha256,style.manifestSha256);assert(row.headDelta>0);
  assert(row.objects.every(n=>n.style===style.styleId && n.draws>0 && n.mountStable && n.triangles===224));
}
async function run(base,mode,build,target) {
  assert(['game','workbench'].includes(mode));assert.match(build,/^[a-f0-9]{12}$/);
  const out=await projectOutput(target,await productionRoot());
  await fs.mkdir(out,{recursive:false});
  const report={mode,build,runs:[]};
  try{
    for(const phase of mode==='game'?['cold','reopened']:['preview']){
      const session=await launchQABrowser(out,{channel:'chrome'});
      try{
        const ctx=await session.browser.newContext({viewport:{width:1280,height:800},
          recordVideo:{dir:out,size:{width:1280,height:800}}});
        const p=await ctx.newPage(),video=p.video(),errors=[],http=[],requests=[];
        const row={phase,browser:session.browser.version(),cases:[],errors,http,requests};report.runs.push(row);
        p.on('pageerror',e=>errors.push(e.message));
        p.on('request',r=>{if(r.url().includes('ear-stud')||r.url().includes('paired-ear'))requests.push(new URL(r.url()).pathname);});
        p.on('response',r=>{if(r.status()>=400 && new URL(r.url()).pathname!=='/favicon.ico')http.push([new URL(r.url()).pathname,r.status()]);});
        try{
          if(mode==='workbench'){
            await p.goto(base+'?workbench=appearance&body=female&view=inspect-face-side');
            await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});
            assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),build);
            for(const body of ['female','male']){
              if(body==='male')await p.locator('[data-appearance-group="male"]').click();
              await p.waitForFunction(b=>__debug.avatar().profile.bodyType===b,body);
              const select=p.locator('#appearance-ears');
              const pair=added.styleId+'@'+added.version+'/pair';
              for(const [value,style,side] of [['pair',old,'pair'],[pair,added,'pair'],
                [added.styleId+'@1/left',added,'left'],['none',null,'none']]){
                await select.selectOption(value);
                await p.waitForFunction(({side,id})=>{const s=__debug.avatar().rigidAccessories.getState();
                  return document.querySelector('#appearance-form').getAttribute('aria-busy')!=='true' &&
                    s.selection===side && (side==='none'||s.styleId===id);},{side,id:style?.styleId});
                const sample=await p.evaluate(capture,body);row.cases.push(sample);verify(sample,style,side);
                assert.equal(await select.inputValue(),value);
                if(value===pair)await p.locator('.viewport').screenshot({path:path.join(out,body+'-side.png')});
              }
            }
          }else{
            const response=await p.request.get(new URL('runtime-package.json',base).href);
            assert(response.ok());const bytes=await response.body(),manifest=JSON.parse(bytes);
            row.packageSha256=createHash('sha256').update(bytes).digest('hex');
            assert.equal(manifest.records.length,2);
            await p.goto(new URL(manifest.runtime.entryUrl,base).href);
            await p.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:90000});
            assert.equal(await p.evaluate(()=>__recordConsumer.buildInfo.shortId),build);
            const seen=await p.evaluate(()=>[...__recordConsumer.actors.values()].map(a=>({id:a.identity.id,recordSha256:a.recordSha256})));
            for(const r of manifest.records)assert(seen.some(a=>a.id===r.id&&a.recordSha256===r.recordSha256));
            row.records=seen;
            for(const b of ['female','male']){
              const sample=await p.evaluate(capture,b);row.cases.push(sample);verify(sample,added,'pair');
            }
            assert(requests.includes(added.manifestUrl));assert(!requests.includes(old.manifestUrl));
            await p.screenshot({path:path.join(out,phase+'.png')});
          }
          assert.deepEqual(errors,[]);assert.deepEqual(http,[]);
        }finally{
          await ctx.close();await video.saveAs(path.join(out,phase+'-1x.webm'));await video.delete();
        }
      }finally{await session.close();}
    }
    report.status='technical-pass-visual-pending';
  }catch(e){report.failure=String(e.stack??e);throw e;}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
}
if(require.main===module)run(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});

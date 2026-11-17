// Same fixed room and actual appearance/live factories; no pose or clock stepping.
const fs = require('node:fs/promises'), path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('../prototype/node_modules/playwright');
const {verifyCandidate} = require('./qa-m1-common.cjs');
const [specPath, outputPath] = process.argv.slice(2);
if (!specPath || !outputPath) throw Error('Usage: node scripts/qa-m2-axial-head-room.cjs exact-spec.json new-output-directory');
const ready = p => p.waitForFunction(() => window.__debug?.ready && !document.querySelector('#appearance-fields').disabled, null, {timeout:60000});

(async () => {
  const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
  assert.equal(spec.schema, 'axial-head-fixed-room-check-v1');
  assert.match(spec.build, /^[a-f0-9]{12}$/);
  assert.equal(spec.cases.length, 2, 'Original and one exact derived candidate only');
  const out = path.resolve(outputPath); await fs.mkdir(out, {recursive:false});
  await fs.copyFile(__filename, path.join(out, 'executed-script.cjs'));
  await fs.copyFile(specPath, path.join(out, 'executed-spec.json'));
  const report = {build:spec.build, status:'running', cases:[], visualReview:'pending',
    scope:'Fixed room source/derived head comparison: real expression manager, existing blink correction, ordinary movement and seat tasks, recipe reload. No arbitrary shape, accessories or target-device performance claim.'};
  const save = () => fs.writeFile(path.join(out,'report.json'), JSON.stringify(report,null,2));
  const browser = await chromium.launch({channel:'chrome', headless:false});
  try {
    for (const cfg of spec.cases) {
      const dir = path.join(out,cfg.body); await fs.mkdir(dir);
      const context = await browser.newContext({viewport:{width:1600,height:1000}, recordVideo:{dir,size:{width:1600,height:1000}}});
      const p = await context.newPage(), video = p.video();
      const r = {body:cfg.body, errors:[], tasks:[], phaseEvents:[]}; report.cases.push(r);
      p.on('pageerror', e => r.errors.push(String(e)));
      const mark = async phase => {
        const event = await p.evaluate(phase => {window.__axialRoom.phase=phase;return {phase,wall:performance.now(),sim:__debug.snapshot().simulationTime};}, phase);
        r.phaseEvents.push(event);
      };
      const task = async (requestId,kind,payload) => {
        await p.evaluate(req => __debug.request(req), {requestId,kind,payload});
        await p.waitForFunction(id => ['completed','cancelled','failed'].includes(__debug.tasks().get(id)?.state),requestId,{timeout:45000});
        const value = await p.evaluate(id => __debug.tasks().get(id),requestId);r.tasks.push(value);assert.equal(value.state,'completed',requestId);
      };
      try {
        await p.goto(new URL('?workbench=appearance&body='+encodeURIComponent(cfg.body),spec.url).href);
        await ready(p);r.identity = await verifyCandidate(p,{build:spec.build,...cfg});
        await p.locator('[data-inspect-framing=face]').click();
        await p.locator('[data-inspect-direction=front]').click();
        await p.locator('[data-workbench-tab=actions]').click();
        await p.locator('[data-expression=neutral]').click();
        // Paused boundary samples are diagnostic only; normal-speed tracing
        // starts afterwards. Render immediately with the real manager/factory.
        await p.evaluate(()=>__debug.setPaused(true));
        const boundaries=[{id:'neutral',h:0,b:0},{id:'happy',h:.65,b:0},{id:'blink',h:0,b:1},
          {id:'happy-halfblink',h:.65,b:.5},{id:'happy-blink',h:.65,b:1},
          ...['aa','ih','ou','ee','oh'].map(v=>({id:'happy-blink-'+v,h:.65,b:1,v}))];
        r.boundaries=[];
        for(const def of boundaries){
          const states=[];
          for(const mode of def.h&&def.b?['legacy','fixed']:['fixed']){
            const value=await p.evaluate(({def,mode})=>{
              const d=__debug,a=d.avatar(),em=a.vrm.expressionManager;
              for(const e of em.expressions)em.setValue(e.expressionName,0);
              em.setValue('happy',def.h);em.setValue('blink',def.b);if(def.v)em.setValue(def.v,.66);
              a.livePresentation.setEyeBlinkCompatibility(mode);a.livePresentation.refreshEyeBlinkCompatibility();
              a.root.updateMatrixWorld(true);d.renderer.render(d.scene,d.cameraObject());
              const influences=[];a.vrm.scene.traverse(m=>{if(m.isMesh&&m.morphTargetInfluences){
                const material=(Array.isArray(m.material)?m.material[0]:m.material)?.name?.replace(/ \(Outline\)$/,'');
                influences.push({material,values:m.morphTargetInfluences.slice()});}});
              return {mode,compat:a.livePresentation.getState().eyeBlinkCompatibility,influences,
                png:d.renderer.domElement.toDataURL('image/png')};
            },{def,mode});
            await fs.writeFile(path.join(dir,'boundary-'+def.id+'-'+mode+'.png'),Buffer.from(value.png.split(',')[1],'base64'));
            delete value.png;assert(value.compat.available);assert.equal(value.compat.mode,mode);states.push(value);
          }
          const fixed=states.at(-1);assert.equal(fixed.compat.coefficient,def.h*def.b);
          if(states.length===2){const roles=new Set(fixed.compat.targetedMeshes.map(x=>x.materialRole)),index=fixed.compat.eyeTargetIndex;
            assert.equal(states[0].influences.length,fixed.influences.length);
            for(let i=0;i<fixed.influences.length;i++){
              const old=states[0].influences[i],now=fixed.influences[i];assert.equal(old.material,now.material);
              const target=roles.has(now.material.replace(/^M00_000_00_/,''));
              for(let j=0;j<now.values.length;j++)assert(Math.abs(now.values[j]-old.values[j]+(target&&j===index?def.h*def.b:0))<1e-10);
            }
          }
          r.boundaries.push({definition:def,states});
        }
        await p.evaluate(()=>{const a=__debug.avatar(),em=a.vrm.expressionManager;for(const e of em.expressions)em.setValue(e.expressionName,0);a.livePresentation.setEyeBlinkCompatibility('fixed');a.livePresentation.refreshEyeBlinkCompatibility();});
        await p.evaluate(() => {
          __debug.setPlaybackRate(1);__debug.setPaused(false);
          const q=window.__axialRoom={run:true,phase:'neutral',rows:[],last:null};
          function frame(t){if(!q.run)return;const d=__debug,a=d.avatar(),s=d.snapshot(),e=a.vrm.expressionManager;
            q.rows.push({t,dt:q.last===null?null:t-q.last,sim:s.simulationTime,phase:q.phase,mode:s.mode,root:s.position,paused:s.paused,
              expression:Object.fromEntries(['happy','blink','aa','ih','ou','ee','oh'].map(k=>[k,e.getValue(k)])),
              blinkFit:a.livePresentation.getState().eyeBlinkCompatibility.available,visible:document.visibilityState,focused:document.hasFocus()});
            q.last=t;requestAnimationFrame(frame);} requestAnimationFrame(frame);
        });
        await mark('neutral-front');await p.waitForTimeout(3700);await p.screenshot({path:path.join(dir,'neutral-front.png')});
        await mark('mouth-a');await p.locator('[data-expression=aa]').click();await p.waitForTimeout(1800);await p.screenshot({path:path.join(dir,'mouth-a.png')});
        await mark('happy-speaking');await p.locator('[data-expression=happy]').click();await p.locator('#speaking-button').click();
        await p.getByRole('button',{name:'看向镜头',exact:true}).click();await p.waitForTimeout(11200);await p.screenshot({path:path.join(dir,'happy-speaking.png')});
        await mark('speaking-side');await p.locator('[data-inspect-direction=side]').click();await p.waitForTimeout(2000);await p.screenshot({path:path.join(dir,'speaking-side.png')});
        await p.locator('#speaking-button').click();await p.locator('[data-expression=neutral]').click();
        await p.evaluate(()=>__debug.command({type:'gaze',target:null}));
        await p.locator('[data-camera=room]').click();await mark('room-chain');
        await p.evaluate(()=>__debug.command({type:'speed',value:.85}));
        await task('head-walk','walk',{x:-.5,z:1.8});
        await task('head-sit','sit');await p.waitForTimeout(1200);
        await p.screenshot({path:path.join(dir,'seated.png')});
        await task('head-stand','stand');await task('head-walk-after','walk',{x:.5,z:1.8});
        await p.waitForTimeout(600);
        const trace=await p.evaluate(()=>{__axialRoom.run=false;return __axialRoom;});
        await fs.writeFile(path.join(dir,'normal-speed-trace.json'),JSON.stringify(trace));
        assert(trace.rows.length>0 && trace.rows.every(x=>!x.paused && x.blinkFit && x.visible==='visible' && x.focused));
        assert(trace.rows.some(x=>x.expression.blink>.9));
        for(const vowel of ['aa','ih','ou','ee','oh'])assert(trace.rows.some(x=>x.phase==='happy-speaking'&&x.expression[vowel]>.4),vowel);
        r.clock={wallSeconds:(trace.rows.at(-1).t-trace.rows[0].t)/1000,simulationSeconds:trace.rows.at(-1).sim-trace.rows[0].sim};
        r.recipe=await p.evaluate(()=>JSON.parse(__debug.exportAppearanceRecipe()));
        await p.locator('[data-workbench-tab=appearance]').click();await p.locator('#appearance-save').click();
        await p.reload();await ready(p);assert.deepEqual(await p.evaluate(()=>JSON.parse(__debug.exportAppearanceRecipe())),r.recipe);
        r.finalIdentity=await verifyCandidate(p,{build:spec.build,...cfg});assert.equal(r.errors.length,0);r.technicalPassed=true;
      } catch(error) {
        r.failure=String(error);await p.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});throw error;
      } finally {
        await context.close();await video.saveAs(path.join(dir,'complete-1x.webm'));await save();
      }
    }
    report.status='recorded-technical-checks-passed-visual-review-pending';
  } catch(error) {report.status='failure-preserved';report.failure=String(error);process.exitCode=1;}
  finally {await browser.close();await save();console.log(JSON.stringify({output:out,status:report.status}));}
})();

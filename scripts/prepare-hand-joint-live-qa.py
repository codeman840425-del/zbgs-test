"""Preserve existing actual-skin triangle gate; add post-live seated stages."""
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parent.parent;src=R/'assets-source/hand-contact-v1/scripts/qa-hand-surface-gate.cjs';s=src.read_text(encoding='utf8');original=s
s=s.replace("const QA_ROOT=require('node:path').resolve(__dirname,'../../..');","const QA_ROOT=require('node:path').resolve(__dirname,'..');")
s=s.replace("'hand-surface-'+qaHandMode+'-'+Date.now()","'joint-live-surface-'+qaHandMode+'-'+Date.now()")
s=s.replace('const result=await page.evaluate(()=>{','const result=await page.evaluate(async()=>{')
old="}c.action('stand');for(tick=0;tick<1800;tick++)"
new="""}
 const liveEvents=[];
 const admission=c.requestBehavior({requestId:'joint-skin-seated-greeting',kind:'greeting'});liveEvents.push({kind:'greeting-admission',admission});
 for(let wait=0;a.livePresentation.getState().greeting.status==='loading'&&wait<1000;wait++)await new Promise(r=>setTimeout(r,10));
 if(!['playing','fading'].includes(a.livePresentation.getState().greeting.status))throw Error('Seated greeting did not load/start');
 for(let i=0;i<480;i++){c.simulate(1/120);if(i%4===0)capture('post-live-seated-greeting');if(a.livePresentation.getState().greeting.status==='completed')break;}
 if(a.livePresentation.getState().greeting.status!=='completed')throw Error('Seated greeting did not complete');
 const equipped=await d.command({type:'accessory',kind:'mic',value:true});if(!equipped.applied)throw Error('Seated mic equip refused');liveEvents.push({kind:'mic-equipped',result:equipped});
 for(let i=0;i<120;i++){c.simulate(1/120);if(i%4===0)capture('post-live-seated-mic-hold');}
 const released=await d.command({type:'accessory',kind:'mic',value:false});liveEvents.push({kind:'mic-released',result:released});if(!released.applied)throw Error('Seated mic release refused');
 for(let i=0;i<180;i++){c.simulate(1/120);if(i%4===0)capture('post-live-seated-mic-release');}
 c.action('stand');for(tick=0;tick<1800;tick++)"""
assert s.count(old)==1;s=s.replace(old,new)
s=s.replace("rows.push({t:c.simulationTime,stage,mode:c.mode", "rows.push({measurementStage:'after-controller-simulate-avatar-live-and-equipment-update',liveState:a.livePresentation.getState(),t:c.simulationTime,stage,mode:c.mode")
s=s.replace('return{handSurfaceObserved:', 'return{liveEvents,handSurfaceObserved:')
(R/'scripts/qa-hand-joint-live-stage.cjs').write_text(s,encoding='utf8',newline='\n')
(R/'analysis/hand-joint-live-gate-source.json').write_text(json.dumps({'source':str(src.relative_to(R)),'sourceNormalizedSHA256':hashlib.sha256(original.encode()).hexdigest(),'scope':'same actual triangle/alpha mathematics, extra seated greeting/mic hold/release stages after real simulate/live update; asynchronous assets naturally awaited'},indent=2)+'\n',encoding='utf8')

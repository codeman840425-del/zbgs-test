const fs=require('node:fs/promises'),path=require('node:path');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
(async()=>{
 const OUT=await projectOutput(process.argv[2],await productionRoot());
 await fs.mkdir(OUT,{recursive:false});await fs.copyFile(__filename,path.join(OUT,'executed-script.cjs'));const r={cases:[],errors:[]};
 const {browser:b,close}=await launchQABrowser(OUT,{channel:'chrome'});

try{const p=await b.newPage({viewport:{width:1600,height:1000}});p.on('pageerror',e=>r.errors.push(String(e)));await p.goto('http://127.0.0.1:4196/?workbench=appearance');await p.waitForFunction(()=>__debug?.ready);r.build=await p.evaluate(()=>fetch('build-info.json').then(r=>r.json()));
await p.evaluate(()=>{window.__inputEvents=[];for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>__inputEvents.push({type,t:performance.now(),x:e.clientX,y:e.clientY,target:e.target.tagName,id:e.target.id,parent:e.target.parentElement?.id}),true)});
const snap=()=>p.evaluate(()=>{const s=__debug.snapshot();return{body:__debug.avatar().profile.bodyType,position:s.position,mode:s.mode,paused:s.paused,backgroundSuspended:s.backgroundSuspended,speed:s.speed,maxSpeed:s.maxSpeed,sim:s.simulationTime,camera:s.camera,target:s.target,path:s.path,tasks:s.tasks,motion:{action:s.motion?.action,requested:s.motion?.requested,sitProgress:s.motion?.sitProgress,danceMix:s.motion?.danceMix}}});
async function one(name,fn,wait=1800){const c={name,before:await snap()};r.cases.push(c);await fn();c.immediate=await snap();await p.waitForTimeout(wait);c.after=await snap();c.distance=Math.hypot(...c.after.position.map((v,i)=>v-c.before.position[i]));await p.screenshot({path:path.join(OUT,name+'.png')});await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(r,null,2));console.log(name,JSON.stringify({distance:c.distance,mode:c.after.mode,paused:c.after.paused,background:c.after.backgroundSuspended,speed:c.after.speed,target:c.after.target}));}
await one('01-face-floor-click',async()=>{const box=await p.locator('#phaser-stage canvas').boundingBox();await p.mouse.click(box.x+box.width*.6,box.y+box.height*.85)});
await p.locator('[data-workbench-tab=actions]').click();
await one('02-face-horizontal-route',()=>p.locator('[data-route=horizontal]').click(),2500);
await p.locator('[data-action=idle]').click();await p.locator('[data-camera=room]').click();await p.waitForTimeout(600);
await one('03-room-floor-click',async()=>{const box=await p.locator('#phaser-stage canvas').boundingBox();await p.mouse.click(box.x+box.width*.52,box.y+box.height*.73)},2500);
await one('04-run-route',async()=>{await p.locator('[data-speed="2.6"]').click();await p.locator('[data-route=horizontal]').click()},2500);
await one('05-pause-route',async()=>{await p.locator('#pause').click();await p.locator('[data-route=room]').click()},1000);
await one('06-resume',()=>p.locator('#pause').click(),2000);
await p.locator('[data-action=idle]').click();await p.locator('[data-appearance-group=male]').click();await p.waitForFunction(()=>!__debug.snapshot().bodySelection.loading&&__debug.avatar().profile.bodyType==='male');
await one('07-male-route',()=>p.locator('[data-route=horizontal]').click(),2500);
for(const tab of ['appearance','inspection'])await one('08-'+tab+'-floor',async()=>{await p.locator(`[data-workbench-tab=${tab}]`).click();const box=await p.locator('#phaser-stage canvas').boundingBox();await p.mouse.click(box.x+box.width*.40,box.y+box.height*.75)},1500);
await p.locator('[data-workbench-tab=actions]').click();await p.locator('[data-action=idle]').click();
await one('09-sit-request',()=>p.locator('#sit-button').click(),8000);
await one('10-sit-route-interrupt',()=>p.locator('[data-route=horizontal]').click(),5000);
await p.locator('[data-action=idle]').click();
await one('11-dance-request',()=>p.locator('[data-action=dance]').click(),1200);
await one('12-dance-route-interrupt',()=>p.locator('[data-route=horizontal]').click(),3500);
r.events=await p.evaluate(()=>__inputEvents);r.dom=await p.evaluate(()=>[...document.querySelectorAll('canvas')].map(c=>({parent:c.parentElement?.id,rect:c.getBoundingClientRect().toJSON(),style:{pointerEvents:getComputedStyle(c).pointerEvents,zIndex:getComputedStyle(c).zIndex}})));r.status='completed';
}catch(e){r.failure=String(e);console.error(e)}finally{await close();await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(r,null,2));console.log('CLOSED')}})();

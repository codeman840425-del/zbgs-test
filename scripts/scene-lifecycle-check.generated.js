async(page)=>{
 await page.goto(page.url().startsWith('http') ? page.url() : 'http://127.0.0.1:5173/');await page.waitForFunction(()=>__debug?.ready);
 const restarts=[];
 for(let i=0;i<4;i++){
  restarts.push(await page.evaluate(()=>{const s=__debug.game.scene.getScene('CharacterStudio');return{command:__debug.game.events.listenerCount('command'),keyboard:s.input.keyboard.listenerCount('keydown-SPACE'),pointer:s.input.listenerCount('pointerup'),textures:__debug.renderer.info.memory.textures,geometries:__debug.renderer.info.memory.geometries}}));
  if(i<3){await page.evaluate(()=>__debug.game.scene.getScene('CharacterStudio').scene.restart());await page.waitForTimeout(200);}
 }
 await page.evaluate(()=>{__debug.reset();__debug.setBodyMode('base');__debug.action('dance');__debug.setPaused(false)});await page.waitForTimeout(200);
 const lifecycle=await page.evaluate(async()=>{
  const d=__debug;Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
  const before=d.snapshot();await new Promise(r=>setTimeout(r,300));const hidden=d.snapshot();
  delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setTimeout(r,100));d.setPaused(true);const after=d.snapshot();
  return {mechanism:'Synthetic visibilitychange handler regression; headless tab did not become hidden',before:before.simulationTime,hidden:hidden.simulationTime,after:after.simulationTime,hiddenFlag:hidden.backgroundSuspended,finalFlag:after.backgroundSuspended,maxFrameDt:after.motion.frameDt};
 });
 if(restarts.some(s=>s.command!==1||s.keyboard!==1||s.pointer!==1))throw Error('scene listeners accumulated');
 if(lifecycle.before!==lifecycle.hidden||!lifecycle.hiddenFlag||lifecycle.finalFlag)throw Error('visibility handler did not suspend');
 return{restarts,lifecycle};
}

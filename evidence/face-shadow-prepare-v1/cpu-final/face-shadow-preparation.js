import * as THREE from 'three';

// Three 0.187-only candidate: capture the actual depth pass, never recreate its
// material rules or draw an offscreen scene. Ownership belongs to warm entries.
export function waitFaceShadowJob(job, signal) {
  if(signal.aborted){Promise.resolve(job).catch(()=>{});return Promise.reject(Error('阴影预备已取消'));}
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(Error('阴影预备已取消'));
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(job).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}
const task=()=>new Promise(resolve=>setTimeout(resolve,0));
const shadowHooks=new WeakMap();
function subscribe(mesh,listener){
  let hook=shadowHooks.get(mesh);
  if(!hook){
    const previous=mesh.onBeforeShadow,listeners=new Set();
    const callback=function(...args){previous.apply(this,args);for(const fn of [...listeners])fn(...args);};
    hook={previous,listeners,callback};shadowHooks.set(mesh,hook);mesh.onBeforeShadow=callback;
  }
  hook.listeners.add(listener);
  return()=>{hook.listeners.delete(listener);if(!hook.listeners.size){if(mesh.onBeforeShadow===hook.callback)mesh.onBeforeShadow=hook.previous;shadowHooks.delete(mesh);}};
}
export async function prepareFaceShadowPrograms(renderer, scene, parts, signal, own) {
  const check=()=>{if(signal.aborted||renderer.getContext().isContextLost())throw Error('阴影预备上下文已失效');};
  check();
  if(!renderer.shadowMap.enabled||(!renderer.shadowMap.autoUpdate&&!renderer.shadowMap.needsUpdate))return;
  const eligible=parts.filter(({mesh})=>{for(let o=mesh;o;o=o.parent)if(!o.visible)return false;return mesh.castShadow;});
  if(!eligible.length)return;
  const captured=[],hooks=[],seen=new Map();
  // Capture one complete ordinary frame of the OLD geometry. All clones are
  // made inside the callback: Three mutates its shared depth material per mesh.
  await new Promise((resolve,reject)=>{
    let done=false,raf,lastVisible=null,visibleMs=0;
    const page=typeof document==='undefined'?null:document;
    const visibility=()=>{lastVisible=null;};
    const finish=error=>{if(done)return;done=true;cancelAnimationFrame(raf);page?.removeEventListener('visibilitychange',visibility);signal.removeEventListener('abort',abort);for(const unsubscribe of hooks)unsubscribe();error?reject(error):resolve();};
    const abort=()=>finish(Error('阴影预备已取消'));
    signal.addEventListener('abort',abort,{once:true});
    page?.addEventListener('visibilitychange',visibility);
    try{
      for(const part of eligible){
        const {mesh}=part;
        const callback=function(r,object,camera,shadowCamera,geometry,material,group){
          if(done)return;
          try{
            check();
            if(!material.isMeshDepthMaterial)throw Error('此阴影预备只支持已核 depth pass');
            const target=r.getRenderTarget();if(!target)throw Error('阴影预备缺实际目标');
            let keys=seen.get(part);if(!keys)seen.set(part,keys=new Set());
            const key=target.uuid+':'+(group?.materialIndex??0);if(keys.has(key))return;keys.add(key);
            const clone=material.clone();own(part,clone);
            captured.push({part,material:clone,camera:shadowCamera,mainCamera:camera,target,cube:r.getActiveCubeFace(),mip:r.getActiveMipmapLevel()});
          }catch(error){finish(error);}
        };
        hooks.push(subscribe(mesh,callback));
      }
      const frame=t=>{
        if(done)return;
        if(page?.hidden){lastVisible=null;raf=requestAnimationFrame(frame);return;}
        if(lastVisible!==null)visibleMs+=Math.max(0,t-lastVisible);
        lastVisible=t;
        // A frame following an actual capture is sufficient. Browser rAF may
        // run faster than the scene renderer, so two empty rAFs prove nothing.
        if(captured.length){finish();return;}
        if(visibleMs>=2000){finish(Error('可见帧预算内未捕获真实阴影绘制'));return;}
        raf=requestAnimationFrame(frame);
      };
      raf=requestAnimationFrame(frame);
    }catch(error){finish(error);}
  });
  check();
  if(!captured.length)throw Error('未捕获真实阴影绘制，未登记预备');
  for(const capture of captured){
    check();
    const staging=new THREE.Scene(),targetScene=new THREE.Scene();
    // renderBufferDirect(shadowCamera,null,...) uses an empty scene, but its
    // current light counts still come from the main scene. Copy only lights.
    scene.traverseVisible(light=>{if(light.isLight&&capture.mainCamera.layers.test(light.layers)){const copy=light.clone(false);copy.layers.mask=capture.camera.layers.mask;targetScene.add(copy);}});
    const proxy=capture.part.mesh.clone(false);proxy.geometry=capture.part.geometry;proxy.material=capture.material;staging.add(proxy);
    const target=renderer.getRenderTarget(),cube=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
    let job;
    try{renderer.setRenderTarget(capture.target,capture.cube,capture.mip);job=renderer.compileAsync(staging,capture.camera,targetScene);}
    finally{renderer.setRenderTarget(target,cube,mip);}
    // compileAsync's synchronous compile is over before any await; never hold
    // a shadow render target across an input/frame turn.
    await waitFaceShadowJob(job,signal);check();
  }
  const programs=new Set();
  for(const {material}of captured){const variants=renderer.properties.get(material).programs;if(!variants?.size)throw Error('阴影预备缺程序身份');for(const program of variants.values())programs.add(program);}
  for(const program of programs){
    check();if(!program.program)throw Error('阴影预备程序已释放');
    while(!program.isReady()){await waitFaceShadowJob(task(),signal);check();if(!program.program)throw Error('阴影预备程序已释放');}
    await waitFaceShadowJob(task(),signal);check();
    if(!program.program)throw Error('阴影预备程序已释放');
    // Only actual depth wrappers; main-color first-use is deliberately untouched.
    program.getUniforms();
    if(program.diagnostics?.runnable===false)throw Error('阴影程序编译失败');
  }
  check();
}

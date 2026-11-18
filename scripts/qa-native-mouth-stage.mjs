// Loaded by the browser check only. The room, actor, expressions, wardrobe and
// renderer belong to the fixed game. The diagnostic VRM is parsed under its own SHA.
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin, VRMUtils} from '@pixiv/three-vrm';

export async function prepare(file, expectedSha) {
  const d = window.__debug, actor = d.avatar();
  const response = await fetch(file);
  if (!response.ok) throw Error('Candidate unavailable');
  const bytes = await response.arrayBuffer();
  const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(b => b.toString(16).padStart(2,'0')).join('');
  if (sha !== expectedSha) throw Error('Candidate SHA mismatch');
  const loader = new GLTFLoader().register(p => new VRMLoaderPlugin(p));
  const gltf = await loader.parseAsync(bytes,'/');
  function mouths(root) {
    const list = [];
    root.traverse(o => {
      if (o.isSkinnedMesh && [o.material].flat().some(m => m.name.includes('FaceMouth_00_FACE'))) list.push(o);
    });
    return list;
  }
  const loaded = mouths(gltf.scene), live = mouths(actor.vrm.scene);
  const geometries = new Set(loaded.map(m => m.geometry));
  if (geometries.size !== 1 || !live.length) throw Error('Ambiguous mouth geometry');
  const [candidate] = geometries;
  const meshes = live.map(m => ({mesh:m, source:m.geometry, sourceSphere:m.boundingSphere, derivedSphere:null}));
  if (candidate.attributes.position.count !== 1053 || !meshes.every(({mesh,source}) =>
    source.attributes.position.count === 4709 && mesh.morphTargetInfluences?.length === 57 &&
    source.index.count === candidate.index.count && source.morphTargetsRelative === candidate.morphTargetsRelative))
    throw Error('Unexpected mouth layout');
  for (const r of meshes) {
    r.mesh.geometry = candidate;
    r.mesh.boundingSphere = null;
    r.mesh.computeBoundingSphere();
    r.derivedSphere = r.mesh.boundingSphere;
    r.mesh.geometry = r.source;
    r.mesh.boundingSphere = r.sourceSphere;
  }
  const {renderer,scene} = d, canvas = renderer.domElement, gl = renderer.getContext();
  const camera = d.cameraObject().clone();
  const first = meshes[0].mesh;
  actor.root.updateMatrixWorld(true);
  first.skeleton.update();
  const mouth = first.localToWorld(first.getVertexPosition(0, camera.position.clone()));
  const axis = camera.up.clone().set(0,1,0);
  const offset = camera.up.clone().set(0,0,.47).applyAxisAngle(axis,actor.root.rotation.y);
  const front = camera.clone();
  front.position.copy(mouth).add(offset);
  front.lookAt(mouth); front.updateMatrixWorld(true);
  function view(kind, mouthSpan) {
    if (kind === 'room') return d.cameraObject();
    const c = front.clone();
    if (mouthSpan) {
      const w=canvas.width,h=canvas.height;
      const center=(mouthSpan.minX+mouthSpan.maxX)/2;
      const target=kind==='left'?0:kind==='right'?w-1:-(mouthSpan.maxX-mouthSpan.minX+2);
      c.setViewOffset(w,h,center-target,0,w,h);
    }
    return c;
  }
  function variant(which) {
    for (const r of meshes) {
      r.mesh.geometry = which === 'derived' ? candidate : r.source;
      r.mesh.boundingSphere = which === 'derived' ? r.derivedSphere : r.sourceSphere;
    }
  }
  function draw(which,cam) {
    variant(which);
    const visible = meshes.map(({mesh}) => mesh.visible);
    try {
      if (which === 'hidden') for (const {mesh} of meshes) mesh.visible=false;
      renderer.render(scene,cam);
    } finally {meshes.forEach(({mesh},i) => {mesh.visible=visible[i];});}
  }
  function pixels() {
    const result = new Uint8Array(canvas.width*canvas.height*4);
    gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,result);
    return result;
  }
  function difference(a,b) {
    let count=0, peak=0, minX=canvas.width, maxX=-1;
    for (let i=0;i<a.length;i+=4) {
      const v=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]),Math.abs(a[i+3]-b[i+3]));
      if (v) {count++;peak=Math.max(peak,v);const x=(i/4)%canvas.width;minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
    }
    return {pixels:count,peak,minX:count?minX:null,maxX:count?maxX:null};
  }
  function frame(name,weights) {
    const mgr=actor.vrm.expressionManager;
    for (const key of ['aa','ih','ou','ee','oh','happy','blink']) mgr.setValue(key,weights[key]??0);
    actor.livePresentation.refreshEyeBlinkCompatibility();
    try {
      let span;
      if (['left','right','outside'].includes(name)) {
        draw('source',front);const all=pixels();draw('hidden',front);
        span=difference(all,pixels());
        if (!span.pixels) span={minX:canvas.width/2,maxX:canvas.width/2};
      }
      const cam=view(name,span);
      draw('source',cam);
      const source=pixels();
      draw('derived',cam);
      const changed=difference(source,pixels());
      const png = weights.aa === 1 && name === 'front' ? canvas.toDataURL() : null;
      draw('hidden',cam);
      const visible=difference(source,pixels());
      return {changed,visibleMouth:visible.pixels,visibleX:[visible.minX,visible.maxX],width:canvas.width,png};
    } finally {variant('source');}
  }
  async function clip() {
    const film=document.createElement('canvas');
    film.width=1280;film.height=480;
    const ctx=film.getContext('2d'), stream=film.captureStream(30);
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4500000});
    const chunks=[];
    const done=new Promise(resolve => {recorder.onstop=resolve;});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    const mgr=actor.vrm.expressionManager, cam=view('front');
    let frames=0,minAA=1,maxAA=0,beginSim=d.snapshot().simulationTime;
    d.command({type:'speaking',value:true});d.setPlaybackRate(1);d.setPaused(false);
    try {
      recorder.start();
      const started=performance.now();
      await new Promise((resolve,reject)=>{
        const next=()=>{
          try {
            for(const [i,which] of ['source','derived'].entries()){
              draw(which,cam);
              // Both halves read the same live simulation tick and full camera field.
              const scale=Math.min(640/canvas.width,450/canvas.height);
              const w=canvas.width*scale,h=canvas.height*scale;
              ctx.fillStyle='#eceee6';ctx.fillRect(i*640,0,640,450);
              ctx.drawImage(canvas,i*640+(640-w)/2,(450-h)/2,w,h);
              ctx.fillStyle='#f6f5ef';ctx.fillRect(i*640,450,640,30);
              ctx.fillStyle='#20302b';ctx.font='18px sans-serif';
              ctx.fillText(i?'候选嘴部网格':'原始嘴部网格',i*640+15,471);
            }
            variant('source');frames++;
            const aa=mgr.getValue('aa');minAA=Math.min(minAA,aa);maxAA=Math.max(maxAA,aa);
            if(performance.now()-started>=5000)resolve();else requestAnimationFrame(next);
          } catch(err){reject(err);}
        };requestAnimationFrame(next);
      });
      const duration=(performance.now()-started)/1000,simDelta=d.snapshot().simulationTime-beginSim;
      recorder.stop();await done;
      const data=await new Promise(resolve=>{const rd=new FileReader();rd.onload=()=>resolve(rd.result);rd.readAsDataURL(new Blob(chunks,{type:recorder.mimeType}));});
      return {duration,simDelta,frames,minAA,maxAA,data};
    } finally {
      if(recorder.state!=='inactive') recorder.stop();
      stream.getTracks().forEach(t=>t.stop());variant('source');d.setPaused(true);
    }
  }
  return {sha,frame,clip,frustumCulled:meshes.map(r=>r.mesh.frustumCulled),
    close(){variant('source');VRMUtils.deepDispose(gltf.scene);}};
}
